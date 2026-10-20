import { ForbiddenException } from '@nestjs/common';
import { StudyService } from './study.service';

// Minimal in-memory fake of the Prisma calls the service uses. These tests check the PRIVACY INVARIANTS only.
function makePrisma(state: any) {
  return {
    studyConfig: { findUnique: jest.fn(async () => state.config) },
    studyConsent: {
      findUnique: jest.fn(async ({ where }: any) => state.consents.find((c: any) => c.studentId === where.studentId_subjectId_consentVersion.studentId) ?? null),
      findMany: jest.fn(async ({ where }: any) => state.consents.filter((c: any) => (where.agreed === undefined || c.agreed === where.agreed))),
    },
    chatMessage: {
      findUnique: jest.fn(async ({ where }: any) => state.messages.find((m: any) => m.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) => state.messages.filter((m: any) => where.id?.in?.includes(m.id))),
      findFirst: jest.fn(async () => ({ content: 'a question' })),
    },
    answerRating: {
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async ({ where }: any) => state.ratings.filter((r: any) => where.studentId.in.includes(r.studentId))),
    },
    surveyResponse: { findMany: jest.fn(async ({ where }: any) => state.surveys.filter((s: any) => where.studentId.in.includes(s.studentId))) },
    expertReview: {
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async () => state.reviews),
    },
    subject: { findUnique: jest.fn(async () => ({ id: 's1', teacherId: 'teacher1' })) },
    studyReviewer: { findUnique: jest.fn(async () => null) },
    enrollment: { findUnique: jest.fn(async () => ({})) },
  } as any;
}

const config = { enabled: true, consentVersion: 1, consentText: null };
const msg = (id: string, studentId: string, createdAt = new Date('2026-01-02')) => ({
  id, role: 'assistant', createdAt, sessionId: 'x', session: { studentId, subjectId: 's1' },
});

describe('StudyService privacy invariants', () => {
  it('refuses a rating from a student who has not agreed', async () => {
    const prisma = makePrisma({ config, consents: [{ studentId: 'stuA', agreed: false, createdAt: new Date('2026-01-01') }], messages: [msg('m1', 'stuA')] });
    const svc = new StudyService(prisma);
    await expect(svc.rateAnswer('stuA', { messageId: 'm1', helpful: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.answerRating.upsert).not.toHaveBeenCalled();
  });

  it('refuses a rating for someone else’s message', async () => {
    const prisma = makePrisma({ config, consents: [{ studentId: 'stuA', agreed: true, createdAt: new Date('2026-01-01') }], messages: [msg('m1', 'stuB')] });
    await expect(new StudyService(prisma).rateAnswer('stuA', { messageId: 'm1', helpful: 4 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records a rating from a consenting student', async () => {
    const prisma = makePrisma({ config, consents: [{ studentId: 'stuA', agreed: true, createdAt: new Date('2026-01-01') }], messages: [msg('m1', 'stuA')] });
    await new StudyService(prisma).rateAnswer('stuA', { messageId: 'm1', helpful: 4, citationSupport: 'yes' });
    expect(prisma.answerRating.upsert).toHaveBeenCalledTimes(1);
  });

  it('refuses an expert review of a message created before consent', async () => {
    const prisma = makePrisma({ config, consents: [{ studentId: 'stuA', agreed: true, createdAt: new Date('2026-03-01') }], messages: [msg('m1', 'stuA', new Date('2026-01-02'))] });
    await expect(
      new StudyService(prisma).submitReview({ id: 'teacher1', role: 'teacher' }, {
        messageId: 'm1', relevance: 4, factualAccuracy: 4, groundingQuality: 4, educationalValue: 4,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expertReview.upsert).not.toHaveBeenCalled();
  });

  it('rejects out-of-range rubric values', async () => {
    const prisma = makePrisma({ config, consents: [], messages: [] });
    await expect(
      new StudyService(prisma).submitReview({ id: 'teacher1', role: 'teacher' }, {
        messageId: 'm1', relevance: 6, factualAccuracy: 4, groundingQuality: 4, educationalValue: 4,
      }),
    ).rejects.toThrow();
  });

  it('exports only consenting participants and never names or emails', async () => {
    const state = {
      config,
      consents: [
        { studentId: 'stuA', agreed: true, createdAt: new Date('2026-01-01') },
        { studentId: 'stuB', agreed: false, createdAt: new Date('2026-01-01') },
      ],
      messages: [msg('m1', 'stuA'), msg('m2', 'stuB')],
      ratings: [
        { studentId: 'stuA', messageId: 'm1', helpful: 5, citationSupport: 'yes', comment: null },
        { studentId: 'stuB', messageId: 'm2', helpful: 1, citationSupport: 'no', comment: 'should not leak' },
      ],
      surveys: [{ studentId: 'stuB', instrument: 'sus', answers: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], score: 50 }],
      reviews: [
        { reviewerId: 't1', messageId: 'm1', relevance: 4, factualAccuracy: 4, groundingQuality: 4, educationalValue: 4, citationQuality: 4, revealedSolution: null, notes: null },
        { reviewerId: 't1', messageId: 'm2', relevance: 1, factualAccuracy: 1, groundingQuality: 1, educationalValue: 1, citationQuality: 1, revealedSolution: null, notes: null },
      ],
    };
    const out = await new StudyService(makePrisma(state)).exportData({ id: 'teacher1', role: 'teacher' }, 's1', true);
    expect(out.answerRatings).toHaveLength(1);
    expect(out.surveys).toHaveLength(0);
    expect(out.expertReviews).toHaveLength(1);
    expect(out.items).toHaveLength(1);
    const text = JSON.stringify(out);
    expect(text).not.toContain('stuA');
    expect(text).not.toContain('stuB');
    expect(text).not.toContain('should not leak');
  });
});
