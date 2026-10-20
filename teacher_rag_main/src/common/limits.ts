/**
 * Single source of truth for usage limits. Enforced server-side; exposed to
 * clients via GET /api/config so the UI and legal pages never drift from the rules.
 */
export const LIMITS = {
  teacherMaxSubjects: 3,
  teacherMaxDocsPerSubject: 3,
  studentMaxQuestionsPerSubject: 10,
  maxFileBytes: 25 * 1024 * 1024,
  maxQuestionChars: 1000,
  minPasswordLength: 8,
} as const;

/** Version of the Terms of Service / Privacy Policy users must accept at sign-up. */
export const TERMS_VERSION = '2026-10-19';

/** Document types accepted by the VTA app (the RAG service can parse all of these). */
export const APP_ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt', '.md'];
