// Integration test against a REAL PostgreSQL database (all migrations applied).
// Skipped unless STUDY_TEST_DATABASE_URL is set, e.g.:
//   STUDY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/studytest npx jest src/study/study.integration
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { StudyService } from './study.service';

const url = process.env.STUDY_TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('StudyService (PostgreSQL integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
  const svc = new StudyService(prisma as any);
  const tag = randomUUID().slice(0, 8);

  let owner: any, reviewer: any, outsider: any, subject: any;
  let stuA: any, stuB: any, stuC: any;
  const sessions: Record<string, any> = {};
  const answers: Record<string, any> = {};

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const asUser = (u: any) => ({ id: u.id, role: u.role });

  async function addExchange(student: any, label: string, withSources = true) {
    const session = sessions[student.id] ?? (sessions[student.id] = await prisma.chatSession.create({ data: { studentId: student.id, subjectId: subject.id } }));
    await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'user', content: `question from ${label}` } });
    await sleep(5);
    answers[label] = await prisma.chatMessage.create({
      data: {
        sessionId: session.id, role: 'assistant', content: `answer for ${label}`,
        sources: withSources ? [{ file_name: 'slides.pdf', page: 3, snippet: 'evidence', content_type: 'pdf_text' }] : undefined,
      },
    });
    await sleep(5);
  }

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `owner-${tag}@t.io`, role: 'teacher' } });
    reviewer = await prisma.user.create({ data: { email: `reviewer-${tag}@t.io`, role: 'teacher' } });
    outsider = await prisma.user.create({ data: { email: `outsider-${tag}@t.io`, role: 'teacher' } });
    subject = await prisma.subject.create({ data: { name: `Study ${tag}`, teacherId: owner.id } });
    for (const k of ['A', 'B', 'C']) {
      const st = await prisma.student.create({ data: { email: `stu${k}-${tag}@t.io`, name: `Student ${k}` } });
      await prisma.enrollment.create({ data: { studentId: st.id, subjectId: subject.id } });
      if (k === 'A') stuA = st; if (k === 'B') stuB = st; if (k === 'C') stuC = st;
    }
  });

  afterAll(async () => {
    await prisma.subject.deleteMany({ where: { id: subject.id } });
    await prisma.student.deleteMany({ where: { id: { in: [stuA.id, stuB.id, stuC.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, reviewer.id, outsider.id] } } });
    await prisma.$disconnect();
  });

  it('is disabled until the owner enables it, and only the owner can enable it', async () => {
    expect(await svc.getStudentStatus(stuA.id, subject.id)).toEqual({ enabled: false });
    await expect(svc.updateConfig(asUser(outsider), subject.id, { enabled: true })).rejects.toBeInstanceOf(ForbiddenException);
    const cfg = await svc.updateConfig(asUser(owner), subject.id, { enabled: true });
    expect(cfg.enabled).toBe(true);
    expect(cfg.consentVersion).toBe(1);
  });

  it('collects consent, ratings and surveys only from agreeing students', async () => {
    expect((await svc.getStudentStatus(stuA.id, subject.id) as any).consent).toBe('pending');
    await svc.recordConsent(stuA.id, { subjectId: subject.id, agreed: true });
    await svc.recordConsent(stuB.id, { subjectId: subject.id, agreed: false });
    await sleep(20);
    await addExchange(stuA, 'A1');
    await addExchange(stuA, 'A2', false);
    await addExchange(stuB, 'B1');
    await addExchange(stuC, 'C1');

    await svc.rateAnswer(stuA.id, { messageId: answers.A1.id, helpful: 5, citationSupport: 'yes', comment: 'clear' });
    await svc.rateAnswer(stuA.id, { messageId: answers.A1.id, helpful: 4 }); // re-rating updates, does not duplicate
    expect(await prisma.answerRating.count({ where: { messageId: answers.A1.id } })).toBe(1);
    await expect(svc.rateAnswer(stuA.id, { messageId: answers.B1.id, helpful: 3 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.rateAnswer(stuB.id, { messageId: answers.B1.id, helpful: 3 })).rejects.toBeInstanceOf(ForbiddenException); // declined
    await expect(svc.rateAnswer(stuC.id, { messageId: answers.C1.id, helpful: 3 })).rejects.toBeInstanceOf(ForbiddenException); // never answered

    const sus = await svc.submitSurvey(stuA.id, { subjectId: subject.id, instrument: 'sus', answers: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1] });
    expect(sus.score).toBe(100);
    await expect(svc.submitSurvey(stuA.id, { subjectId: subject.id, instrument: 'sus', answers: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] })).rejects.toBeInstanceOf(ConflictException);
    await svc.submitSurvey(stuA.id, { subjectId: subject.id, instrument: 'usefulness', answers: [4, 4, 4, 4, 4, 4, 4, 4] });
    await expect(svc.submitSurvey(stuB.id, { subjectId: subject.id, instrument: 'sus', answers: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] })).rejects.toBeInstanceOf(ForbiddenException);

    const status: any = await svc.getStudentStatus(stuA.id, subject.id);
    expect(status.consent).toBe('agreed');
    expect(status.surveysDone).toEqual({ sus: true, usefulness: true });
    expect(status.answersReceived).toBe(2);
  });

  it('gives reviewers a blinded queue containing only consenting students’ answers', async () => {
    await expect(svc.getReviewQueue(asUser(outsider), subject.id)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.addReviewer(asUser(owner), subject.id, `reviewer-${tag}@t.io`);
    const q = await svc.getReviewQueue(asUser(reviewer), subject.id, 10);
    expect(q.progress.eligible).toBe(2);
    const ids = q.items.map((i) => i.messageId);
    expect(ids).toContain(answers.A1.id);
    expect(ids).toContain(answers.A2.id);
    expect(ids).not.toContain(answers.B1.id);
    expect(ids).not.toContain(answers.C1.id);
    const item = q.items.find((i) => i.messageId === answers.A1.id)!;
    expect(item.question).toBe('question from A1');
    expect(item.hasCitations).toBe(true);
    expect(JSON.stringify(q)).not.toContain('Student A');
    expect(JSON.stringify(q)).not.toContain(stuA.id);
  });

  it('records expert reviews from two reviewers and refuses non-consented or unauthorised reviews', async () => {
    const r = (v: number, extra = {}) => ({ relevance: v, factualAccuracy: v, groundingQuality: v, educationalValue: v, citationQuality: v, ...extra });
    await svc.submitReview(asUser(owner), { messageId: answers.A1.id, ...r(4) });
    await svc.submitReview(asUser(reviewer), { messageId: answers.A1.id, ...r(5), revealedSolution: false });
    await svc.submitReview(asUser(reviewer), { messageId: answers.A2.id, ...r(3), citationQuality: null });
    await expect(svc.submitReview(asUser(reviewer), { messageId: answers.B1.id, ...r(4) })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.submitReview(asUser(outsider), { messageId: answers.A1.id, ...r(4) })).rejects.toBeInstanceOf(ForbiddenException);
    const q = await svc.getReviewQueue(asUser(reviewer), subject.id, 10);
    expect(q.items).toHaveLength(0); // reviewer has rated everything eligible
    expect(q.progress.reviewedByMe).toBe(2);

    const summary = await svc.getSummary(asUser(owner), subject.id);
    expect(summary.participants).toEqual({ agreed: 1, declined: 1 });
    expect(summary.expertReviews.reviewers).toBe(2);
    expect(summary.expertReviews.itemsWithTwoOrMoreReviewers).toBe(1);
    expect(summary.surveys.sus.mean).toBe(100);
  });

  it('exports anonymised data of consenting participants only', async () => {
    const out: any = await svc.exportData(asUser(owner), subject.id, true);
    expect(out.meta.participantsAgreed).toBe(1);
    expect(out.answerRatings).toHaveLength(1);
    expect(out.surveys).toHaveLength(2);
    expect(out.expertReviews).toHaveLength(3);
    expect(out.items).toHaveLength(2);
    const text = JSON.stringify(out);
    for (const secret of [stuA.id, stuB.id, stuC.id, owner.id, reviewer.id, `stuA-${tag}`, `reviewer-${tag}`, 'Student A', answers.A1.id]) {
      expect(text).not.toContain(secret);
    }
    await expect(svc.exportData(asUser(outsider), subject.id)).rejects.toBeInstanceOf(ForbiddenException);
    const plain: any = await svc.exportData(asUser(owner), subject.id, false);
    expect(plain.items).toBeUndefined();
  });

  it('starts a new consent version when the consent text changes, so earlier agreements stop applying', async () => {
    // A custom text replaces the default one the student agreed to, so consent must be asked again.
    const cfg = await svc.updateConfig(asUser(owner), subject.id, { consentText: 'Updated consent wording for the study.' });
    expect(cfg.consentVersion).toBe(2);
    expect(((await svc.getStudentStatus(stuA.id, subject.id)) as any).consent).toBe('pending');
    // Saving the identical text again does not start a new version.
    expect((await svc.updateConfig(asUser(owner), subject.id, { consentText: 'Updated consent wording for the study.' })).consentVersion).toBe(2);
    const cfg2 = await svc.updateConfig(asUser(owner), subject.id, { consentText: 'A materially different consent text.' });
    expect(cfg2.consentVersion).toBe(3);
    expect(((await svc.getStudentStatus(stuA.id, subject.id)) as any).consent).toBe('pending');
    await expect(svc.rateAnswer(stuA.id, { messageId: answers.A2.id, helpful: 4 })).rejects.toBeInstanceOf(ForbiddenException);
    const out: any = await svc.exportData(asUser(owner), subject.id);
    expect(out.meta.participantsAgreed).toBe(0);
    expect(out.answerRatings).toHaveLength(0);
  });
});
