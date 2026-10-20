export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

const TOKEN_KEY = "vta-token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string) {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | undefined;
  try {
    const body = await res.json();
    const m = body?.message;
    message = Array.isArray(m) ? m.join(". ") : (m ?? message);
    code = body?.code;
  } catch {}
  return new ApiError(message, res.status, code);
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = opts.auth === false ? null : tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError("Cannot reach the VTA server. Check your connection and try again.", 0);
  }
  if (res.status === 401 && token) {
    tokenStore.clear();
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.dispatchEvent(new Event("vta-unauthorized"));
    }
  }
  if (!res.ok) throw await toError(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── Types ───────────────────────────────────────────────────────────────────
export type Role = "teacher" | "student";
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}
export interface AuthResponse {
  accessToken: string;
  user: SessionUser;
}

export interface Subject {
  id: string;
  name: string;
  classCode: string;
  createdAt: string;
  _count: { files: number; enrollments: number };
}
export interface KFile {
  id: string;
  originalName: string;
  mimeType: string;
  displayName: string | null;
  sizeBytes: number;
  status: "uploading" | "processing" | "ready" | "error";
  chunkCount: number;
  createdAt: string;
}
export interface TeacherStudent {
  studentId: string;
  name: string | null;
  email: string;
  joinedAt: string;
  questionsUsed: number;
  conversations: number;
  lastActiveAt: string | null;
}
export interface StudentDetail {
  subject: { id: string; name: string };
  student: { id: string; name: string | null; email: string; createdAt: string };
  joinedAt: string;
  questionsUsed: number;
  questionsAsked: number;
  lastActiveAt: string | null;
  sessions: { id: string; title: string | null; createdAt: string; updatedAt: string; messages: Msg[] }[];
}
export interface RecentQuery {
  id: string;
  question: string;
  askedBy: string;
  createdAt: string;
  student: { name: string | null } | null;
}

export interface Enrollment {
  id: string;
  subjectId: string;
  questionsUsed: number;
  createdAt: string;
  subject: {
    id: string;
    name: string;
    classCode: string | null;
    teacher: { name: string | null; email: string };
    _count: { files: number };
  };
}
export interface ClassDetails {
  id: string;
  name: string;
  teacher: { name: string | null; email: string };
  files: { id: string; originalName: string; displayName: string | null; mimeType: string; sizeBytes: number }[];
}
export interface ChatSessionRow {
  id: string;
  title: string | null;
  updatedAt: string;
  _count: { messages: number };
}
export interface Source {
  file_id: string;
  file_name: string;
  page?: number | null;
  snippet?: string | null;
  relevance?: number;
  chunk_idx?: number | null;
  /** The exact passage the answer relied on, when the model quoted one. */
  highlight_text?: string | null;
}
export interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[] | null;
  createdAt?: string;
  /** Client-only stable React key, so a streamed message keeps its identity when it is saved. */
  _k?: string;
}
export interface ClassPreview {
  name: string;
  classCode: string;
  teacher: { name: string | null };
  _count: { files: number; enrollments: number };
}

export type AskEvent =
  | { type: "start"; sessionId: string; questionsUsed?: number; questionsRemaining?: number }
  | { type: "token"; text: string }
  | { type: "done"; message: Msg; userMessageId: string; questionsUsed?: number; questionsRemaining?: number }
  | { type: "error"; message: string; questionsUsed?: number; questionsRemaining?: number };

/** A document a user can view and ask about (same shape for teachers and students). */
export interface DocInfo {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
}
export interface DocChunk {
  idx: number;
  page: number | null;
  kind: string;
  text: string;
}

/** Streams NDJSON events from the quota-enforced ask endpoint. */
export async function* askStream(
  path: string,
  question: string,
  sessionId: string | null,
  fileId: string | null,
  signal?: AbortSignal,
): AsyncGenerator<AskEvent> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question, ...(sessionId ? { sessionId } : {}), ...(fileId ? { fileId } : {}) }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    throw new ApiError("Cannot reach the VTA server. Check your connection and try again.", 0);
  }
  if (!res.ok || !res.body) throw await toError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as AskEvent;
    }
  }
}

/** Fetches an authenticated file as a Blob (for the in-app viewer). */
export async function fetchBlob(path: string): Promise<Blob> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError("Cannot reach the VTA server. Check your connection and try again.", 0);
  }
  if (!res.ok) throw await toError(res);
  return res.blob();
}
