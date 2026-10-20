// Mirrors the backend's src/common/limits.ts. The backend is the source of truth and enforces
// these; the app also reads GET /config at runtime (see lib/config.tsx) and these are the
// fallback so legal pages always render.
export const DEFAULT_LIMITS = {
  teacherMaxSubjects: 3,
  teacherMaxDocsPerSubject: 3,
  studentMaxQuestionsPerSubject: 10,
  maxFileBytes: 25 * 1024 * 1024,
  maxQuestionChars: 1000,
  minPasswordLength: 8,
};
export type Limits = typeof DEFAULT_LIMITS;

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md"];

export const TERMS_EFFECTIVE = "October 19, 2026";
export const CONTACT_NAME = "Dr. Parteek Kumar Bhatia";
export const CONTACT_EMAIL = "parteek.bhatia@gmail.com";
export const PENDING_JOIN_KEY = "vta-pending-join";
