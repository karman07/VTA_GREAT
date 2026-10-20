// study.service.ts — opt-in human-evaluation study mode (consent, ratings, surveys, expert review, export).
// Privacy rules enforced here: nothing is rated, queued for review or exported unless the student agreed to the
// CURRENT consent version; exports never contain names or emails; reviewers never see who asked a question.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CITATION_SUPPORT_VALUES,
  DEFAULT_CONSENT_TEXT,
  MIN_ANSWERS_BEFORE_SURVEY,
  RUBRIC_DIMENSIONS,
  SUS_ITEMS,
  USEFULNESS_ITEMS,
  isLikert,
  mean,
  meanScore,
  susScore,
  validateLikertAnswers,
} from './study.instruments';

const SALT = process.env.STUDY_EXPORT_SALT || 'teachai-study';
const anon = (value: string, scope: string) =>
  createHash('sha256').update(`${SALT}:${scope}:${value}`).digest('hex').slice(0, 10);

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Shared ────────────────────────────────────────────────────────────────

  getInstruments() {
    return {
      sus: { items: SUS_ITEMS, scale: '1 = Strongly disagree, 5 = Strongly agree' },
      usefulness: { items: USEFULNESS_ITEMS, scale: '1 = Strongly disagree, 5 = Strongly agree' },
      rubric: RUBRIC_DIMENSIONS,
      minAnswersBeforeSurvey: MIN_ANSWERS_BEFORE_SURVEY,
    };
  }

  private async getEnabledConfig(subjectId: string) {
    const config = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    if (!config || !config.enabled) throw new NotFoundException('Study mode is not enabled for this subject');
    return config;
  }

  /** The student's agreement to the CURRENT consent version, or null if they have not answered. */
  private async currentConsent(studentId: string, subjectId: string, version: number) {
    return this.prisma.studyConsent.findUnique({
      where: { studentId_subjectId_consentVersion: { studentId, subjectId, consentVersion: version } },
    });
  }

  // ─── Student ───────────────────────────────────────────────────────────────

  private async assertEnrolled(studentId: string, subjectId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_subjectId: { studentId, subjectId } },
    });
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this subject');
  }

  async getStudentStatus(studentId: string, subjectId: string) {
    await this.assertEnrolled(studentId, subjectId);
    const config = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    if (!config || !config.enabled) return { enabled: false };

    const consent = await this.currentConsent(studentId, subjectId, config.consentVersion);
    const surveys = await this.prisma.surveyResponse.findMany({
      where: { studentId, subjectId },
      select: { instrument: true },
    });
    const answersReceived = consent?.agreed
      ? await this.prisma.chatMessage.count({
          where: {
            role: 'assistant',
            createdAt: { gte: consent.createdAt },
            session: { studentId, subjectId },
          },
        })
      : 0;
    return {
      enabled: true,
      consentText: config.consentText || DEFAULT_CONSENT_TEXT,
      consentVersion: config.consentVersion,
      consent: consent ? (consent.agreed ? 'agreed' : 'declined') : 'pending',
      surveysDone: { sus: surveys.some((s) => s.instrument === 'sus'), usefulness: surveys.some((s) => s.instrument === 'usefulness') },
      answersReceived,
      minAnswersBeforeSurvey: MIN_ANSWERS_BEFORE_SURVEY,
    };
  }

  async recordConsent(studentId: string, dto: { subjectId: string; agreed: boolean }) {
    if (typeof dto?.subjectId !== 'string' || typeof dto?.agreed !== 'boolean') {
      throw new BadRequestException('subjectId and agreed are required');
    }
    await this.assertEnrolled(studentId, dto.subjectId);
    const config = await this.getEnabledConfig(dto.subjectId);
    await this.prisma.studyConsent.upsert({
      where: { studentId_subjectId_consentVersion: { studentId, subjectId: dto.subjectId, consentVersion: config.consentVersion } },
      create: { studentId, subjectId: dto.subjectId, consentVersion: config.consentVersion, agreed: dto.agreed },
      update: { agreed: dto.agreed, createdAt: new Date() },
    });
    return { consent: dto.agreed ? 'agreed' : 'declined' };
  }

  async rateAnswer(
    studentId: string,
    dto: { messageId: string; helpful: number; citationSupport?: string; comment?: string },
  ) {
    if (typeof dto?.messageId !== 'string') throw new BadRequestException('messageId is required');
    if (!isLikert(dto.helpful)) throw new BadRequestException('helpful must be an integer from 1 to 5');
    if (dto.citationSupport !== undefined && !(CITATION_SUPPORT_VALUES as readonly string[]).includes(dto.citationSupport)) {
      throw new BadRequestException(`citationSupport must be one of ${CITATION_SUPPORT_VALUES.join(', ')}`);
    }
    const comment = typeof dto.comment === 'string' ? dto.comment.trim().slice(0, 1000) : undefined;

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: dto.messageId },
      include: { session: true },
    });
    if (!message || message.role !== 'assistant' || message.session.studentId !== studentId) {
      throw new ForbiddenException('You can only rate your own assistant answers');
    }
    const config = await this.getEnabledConfig(message.session.subjectId);
    const consent = await this.currentConsent(studentId, message.session.subjectId, config.consentVersion);
    if (!consent?.agreed) throw new ForbiddenException('Consent is required before ratings are recorded');

    await this.prisma.answerRating.upsert({
      where: { messageId_studentId: { messageId: dto.messageId, studentId } },
      create: {
        messageId: dto.messageId, studentId, subjectId: message.session.subjectId,
        helpful: dto.helpful, citationSupport: dto.citationSupport, comment: comment || undefined,
      },
      update: { helpful: dto.helpful, citationSupport: dto.citationSupport ?? null, comment: comment || null },
    });
    return { ok: true };
  }

  async listMyRatedMessageIds(studentId: string, subjectId: string) {
    const rows = await this.prisma.answerRating.findMany({ where: { studentId, subjectId }, select: { messageId: true } });
    return rows.map((r) => r.messageId);
  }

  async submitSurvey(studentId: string, dto: { subjectId: string; instrument: string; answers: unknown }) {
    if (typeof dto?.subjectId !== 'string') throw new BadRequestException('subjectId is required');
    if (dto.instrument !== 'sus' && dto.instrument !== 'usefulness') {
      throw new BadRequestException('instrument must be "sus" or "usefulness"');
    }
    await this.assertEnrolled(studentId, dto.subjectId);
    const config = await this.getEnabledConfig(dto.subjectId);
    const consent = await this.currentConsent(studentId, dto.subjectId, config.consentVersion);
    if (!consent?.agreed) throw new ForbiddenException('Consent is required before surveys are recorded');

    let answers: number[];
    try {
      answers = validateLikertAnswers(dto.answers, dto.instrument === 'sus' ? 10 : 8);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    const score = dto.instrument === 'sus' ? susScore(answers) : meanScore(answers);
    try {
      await this.prisma.surveyResponse.create({
        data: { studentId, subjectId: dto.subjectId, instrument: dto.instrument, answers, score },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This survey has already been submitted');
      throw e;
    }
    return { ok: true, score };
  }

  // ─── Teacher / expert reviewer ─────────────────────────────────────────────

  private async assertOwner(user: { id: string; role: string }, subjectId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');
    if (subject.teacherId !== user.id && user.role !== 'admin') throw new ForbiddenException('Only the subject owner can do this');
    return subject;
  }

  private async assertReviewerOrOwner(user: { id: string; role: string }, subjectId: string) {
    if (user.role === 'student') throw new ForbiddenException('Students cannot review answers');
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');
    if (subject.teacherId === user.id || user.role === 'admin') return subject;
    const reviewer = await this.prisma.studyReviewer.findUnique({ where: { subjectId_userId: { subjectId, userId: user.id } } });
    if (!reviewer) throw new ForbiddenException('You are not a reviewer for this subject');
    return subject;
  }

  async getConfig(user: { id: string; role: string }, subjectId: string) {
    await this.assertOwner(user, subjectId);
    const config = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    const reviewers = await this.prisma.studyReviewer.findMany({
      where: { subjectId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return {
      enabled: config?.enabled ?? false,
      consentText: config?.consentText || DEFAULT_CONSENT_TEXT,
      consentVersion: config?.consentVersion ?? 1,
      reviewers: reviewers.map((r) => ({ userId: r.userId, email: r.user.email, name: r.user.name })),
    };
  }

  /** Changing the consent text starts a new consent version, so earlier agreements no longer cover the new text. */
  async updateConfig(user: { id: string; role: string }, subjectId: string, dto: { enabled?: boolean; consentText?: string }) {
    await this.assertOwner(user, subjectId);
    const existing = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    const nextText = typeof dto.consentText === 'string' && dto.consentText.trim() ? dto.consentText.trim() : existing?.consentText ?? null;
    const effective = (t: string | null | undefined) => (t && t.trim()) || DEFAULT_CONSENT_TEXT;
    const textChanged = !!existing && effective(existing.consentText) !== effective(nextText);
    const data = {
      enabled: typeof dto.enabled === 'boolean' ? dto.enabled : existing?.enabled ?? false,
      consentText: nextText,
      consentVersion: (existing?.consentVersion ?? 1) + (textChanged ? 1 : 0),
    };
    await this.prisma.studyConfig.upsert({ where: { subjectId }, create: { subjectId, ...data }, update: data });
    return this.getConfig(user, subjectId);
  }

  async addReviewer(user: { id: string; role: string }, subjectId: string, email: string) {
    await this.assertOwner(user, subjectId);
    if (typeof email !== 'string' || !email.includes('@')) throw new BadRequestException('A valid email is required');
    const reviewer = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!reviewer || (reviewer.role !== 'teacher' && reviewer.role !== 'admin')) {
      throw new NotFoundException('No teacher account found with that email');
    }
    await this.prisma.studyReviewer.upsert({
      where: { subjectId_userId: { subjectId, userId: reviewer.id } },
      create: { subjectId, userId: reviewer.id },
      update: {},
    });
    return this.getConfig(user, subjectId);
  }

  async removeReviewer(user: { id: string; role: string }, subjectId: string, reviewerId: string) {
    await this.assertOwner(user, subjectId);
    await this.prisma.studyReviewer.deleteMany({ where: { subjectId, userId: reviewerId } });
    return this.getConfig(user, subjectId);
  }

  async listReviewSubjects(user: { id: string; role: string }) {
    if (user.role === 'student') throw new ForbiddenException();
    const subjects = await this.prisma.subject.findMany({
      where: {
        studyConfig: { is: { enabled: true } },
        OR: [{ teacherId: user.id }, { studyReviewers: { some: { userId: user.id } } }],
      },
      select: { id: true, name: true, teacherId: true },
    });
    return subjects.map((s) => ({ id: s.id, name: s.name, isOwner: s.teacherId === user.id || user.role === 'admin' }));
  }

  /** Assistant messages of consenting students, created after their consent. */
  private eligibleMessagesWhere(subjectId: string, consents: { studentId: string; createdAt: Date }[]) {
    return {
      role: 'assistant',
      session: { subjectId },
      OR: consents.map((c) => ({ session: { studentId: c.studentId }, createdAt: { gte: c.createdAt } })),
    };
  }

  private async agreedConsents(subjectId: string, version: number) {
    return this.prisma.studyConsent.findMany({
      where: { subjectId, consentVersion: version, agreed: true },
      select: { studentId: true, createdAt: true },
    });
  }

  async getReviewQueue(user: { id: string; role: string }, subjectId: string, limit = 10) {
    await this.assertReviewerOrOwner(user, subjectId);
    const config = await this.getEnabledConfig(subjectId);
    const consents = await this.agreedConsents(subjectId, config.consentVersion);
    if (!consents.length) return { items: [], progress: { reviewedByMe: 0, eligible: 0 } };

    const where = this.eligibleMessagesWhere(subjectId, consents);
    const [eligible, reviewedByMe] = await Promise.all([
      this.prisma.chatMessage.count({ where }),
      this.prisma.expertReview.count({ where: { subjectId, reviewerId: user.id } }),
    ]);
    // Same order for every reviewer (oldest first) so that reviewers naturally overlap on the earliest items.
    const messages = await this.prisma.chatMessage.findMany({
      where: { ...where, reviews: { none: { reviewerId: user.id } } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 25),
    });
    const items: any[] = [];
    for (const m of messages) {
      const question = await this.prisma.chatMessage.findFirst({
        where: { sessionId: m.sessionId, role: 'user', createdAt: { lte: m.createdAt } },
        orderBy: { createdAt: 'desc' },
      });
      const sources = Array.isArray(m.sources) ? (m.sources as any[]) : [];
      items.push({
        messageId: m.id,
        question: question?.content ?? '',
        answer: m.content,
        sources: sources.slice(0, 6).map((s) => ({
          fileName: s?.file_name ?? null, page: s?.page ?? null, snippet: s?.highlight_text || s?.snippet || null,
          contentType: s?.content_type ?? null, timestamp: s?.timestamp ?? null,
        })),
        hasCitations: sources.length > 0,
      });
    }
    return { items, progress: { reviewedByMe, eligible } };
  }

  async submitReview(
    user: { id: string; role: string },
    dto: {
      messageId: string; relevance: number; factualAccuracy: number; groundingQuality: number;
      educationalValue: number; citationQuality?: number | null; revealedSolution?: boolean | null; notes?: string;
    },
  ) {
    if (typeof dto?.messageId !== 'string') throw new BadRequestException('messageId is required');
    for (const key of ['relevance', 'factualAccuracy', 'groundingQuality', 'educationalValue'] as const) {
      if (!isLikert(dto[key])) throw new BadRequestException(`${key} must be an integer from 1 to 5`);
    }
    if (dto.citationQuality != null && !isLikert(dto.citationQuality)) throw new BadRequestException('citationQuality must be an integer from 1 to 5');

    const message = await this.prisma.chatMessage.findUnique({ where: { id: dto.messageId }, include: { session: true } });
    if (!message || message.role !== 'assistant') throw new NotFoundException('Answer not found');
    const subjectId = message.session.subjectId;
    await this.assertReviewerOrOwner(user, subjectId);
    const config = await this.getEnabledConfig(subjectId);
    const consent = await this.currentConsent(message.session.studentId, subjectId, config.consentVersion);
    if (!consent?.agreed || message.createdAt < consent.createdAt) {
      throw new ForbiddenException('This answer is not covered by participant consent');
    }
    const notes = typeof dto.notes === 'string' ? dto.notes.trim().slice(0, 2000) : undefined;
    const data = {
      relevance: dto.relevance, factualAccuracy: dto.factualAccuracy, groundingQuality: dto.groundingQuality,
      educationalValue: dto.educationalValue, citationQuality: dto.citationQuality ?? null,
      revealedSolution: dto.revealedSolution ?? null, notes: notes || null,
    };
    await this.prisma.expertReview.upsert({
      where: { messageId_reviewerId: { messageId: dto.messageId, reviewerId: user.id } },
      create: { messageId: dto.messageId, reviewerId: user.id, subjectId, ...data },
      update: data,
    });
    return { ok: true };
  }

  async getSummary(user: { id: string; role: string }, subjectId: string) {
    await this.assertOwner(user, subjectId);
    const config = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    const version = config?.consentVersion ?? 1;
    const [agreed, declined, ratings, surveys, reviews] = await Promise.all([
      this.prisma.studyConsent.count({ where: { subjectId, consentVersion: version, agreed: true } }),
      this.prisma.studyConsent.count({ where: { subjectId, consentVersion: version, agreed: false } }),
      this.prisma.answerRating.findMany({ where: { subjectId } }),
      this.prisma.surveyResponse.findMany({ where: { subjectId } }),
      this.prisma.expertReview.findMany({ where: { subjectId } }),
    ]);
    const byMessage = new Map<string, Set<string>>();
    for (const r of reviews) {
      if (!byMessage.has(r.messageId)) byMessage.set(r.messageId, new Set());
      byMessage.get(r.messageId)!.add(r.reviewerId);
    }
    const dims = ['relevance', 'factualAccuracy', 'groundingQuality', 'educationalValue'] as const;
    return {
      participants: { agreed, declined },
      studentRatings: { n: ratings.length, meanHelpful: mean(ratings.map((r) => r.helpful)) },
      surveys: {
        sus: { n: surveys.filter((s) => s.instrument === 'sus').length, mean: mean(surveys.filter((s) => s.instrument === 'sus' && s.score != null).map((s) => s.score as number)) },
        usefulness: { n: surveys.filter((s) => s.instrument === 'usefulness').length, mean: mean(surveys.filter((s) => s.instrument === 'usefulness' && s.score != null).map((s) => s.score as number)) },
      },
      expertReviews: {
        n: reviews.length,
        reviewers: new Set(reviews.map((r) => r.reviewerId)).size,
        itemsWithTwoOrMoreReviewers: [...byMessage.values()].filter((s) => s.size >= 2).length,
        means: Object.fromEntries(dims.map((d) => [d, mean(reviews.map((r) => r[d]))])),
      },
    };
  }

  /** Anonymised research export (consenting students only). `includeText` adds question/answer text for the reviewed items. */
  async exportData(user: { id: string; role: string }, subjectId: string, includeText = false) {
    await this.assertOwner(user, subjectId);
    const config = await this.prisma.studyConfig.findUnique({ where: { subjectId } });
    const version = config?.consentVersion ?? 1;
    const consents = await this.prisma.studyConsent.findMany({ where: { subjectId, consentVersion: version } });
    const agreedIds = new Set(consents.filter((c) => c.agreed).map((c) => c.studentId));
    const P = (studentId: string) => anon(studentId, subjectId);

    const ratings = await this.prisma.answerRating.findMany({ where: { subjectId, studentId: { in: [...agreedIds] } } });
    const surveys = await this.prisma.surveyResponse.findMany({ where: { subjectId, studentId: { in: [...agreedIds] } } });
    const reviewsRaw = await this.prisma.expertReview.findMany({ where: { subjectId }, orderBy: { createdAt: 'asc' } });
    const messageIds = [...new Set([...ratings.map((r) => r.messageId), ...reviewsRaw.map((r) => r.messageId)])];
    const messages = await this.prisma.chatMessage.findMany({ where: { id: { in: messageIds } }, include: { session: true } });
    const msgMap = new Map(messages.map((m) => [m.id, m]));
    // Drop reviews of messages whose author did not consent (defence in depth).
    const reviews = reviewsRaw.filter((r) => {
      const m = msgMap.get(r.messageId);
      return m && agreedIds.has(m.session.studentId);
    });
    const reviewerLabel = new Map<string, string>();
    for (const r of reviews) if (!reviewerLabel.has(r.reviewerId)) reviewerLabel.set(r.reviewerId, `R${reviewerLabel.size + 1}`);
    const M = (id: string) => anon(id, 'message');

    const out: any = {
      meta: {
        subjectRef: anon(subjectId, 'subject'),
        consentVersion: version,
        exportedAt: new Date().toISOString(),
        participantsAgreed: agreedIds.size,
        participantsDeclined: consents.filter((c) => !c.agreed).length,
        note: 'Anonymised export of consenting participants only. Contains no names or emails.',
      },
      answerRatings: ratings.map((r) => ({
        participant: P(r.studentId), message: M(r.messageId), helpful: r.helpful, citationSupport: r.citationSupport, comment: r.comment ?? null,
      })),
      surveys: surveys.map((s) => ({ participant: P(s.studentId), instrument: s.instrument, answers: s.answers, score: s.score })),
      expertReviews: reviews.map((r) => ({
        reviewer: reviewerLabel.get(r.reviewerId), message: M(r.messageId),
        relevance: r.relevance, factualAccuracy: r.factualAccuracy, groundingQuality: r.groundingQuality,
        educationalValue: r.educationalValue, citationQuality: r.citationQuality, revealedSolution: r.revealedSolution, notes: r.notes ?? null,
      })),
    };
    if (includeText) {
      out.items = [];
      for (const id of messageIds) {
        const m = msgMap.get(id);
        if (!m || !agreedIds.has(m.session.studentId)) continue;
        const q = await this.prisma.chatMessage.findFirst({
          where: { sessionId: m.sessionId, role: 'user', createdAt: { lte: m.createdAt } }, orderBy: { createdAt: 'desc' },
        });
        out.items.push({ message: M(id), question: q?.content ?? '', answer: m.content });
      }
    }
    return out;
  }
}
