"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUp, BookOpen, ChevronDown, Eye, FileText, History, Lock, MessageSquarePlus, MessageSquareQuote, PanelLeft, Sparkles, X,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { DocViewer } from "./DocViewer";
import { RichText } from "./RichText";
import { SelectionAsk, type AskSelection } from "./SelectionAsk";
import { Badge, Meter, Notice, Spinner } from "./ui";
import { cx } from "@/lib/cx";
import { useLimits } from "@/lib/config";
import { api, askStream, type ApiError, type ChatSessionRow, type DocInfo, type Msg, type Role, type Source } from "@/lib/api";
import { when } from "@/lib/format";

const SUGGESTIONS = [
  "Summarize the main ideas in these materials.",
  "What are the key terms I should know?",
  "Explain the most important concept in simple words.",
];

type Opener = (source: Source) => void;

function SourceList({ sources, onOpen }: { sources: Source[]; onOpen: Opener }) {
  const [open, setOpen] = useState(false);
  const uniq = sources.filter((s, i) => sources.findIndex((x) => x.file_id === s.file_id && x.page === s.page) === i);
  if (!uniq.length) return null;
  return (
    <div className="mt-3 border-t border-cream-300 pt-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-xs font-semibold text-forest-700 hover:text-forest-900">
        <BookOpen className="size-3.5" aria-hidden /> {uniq.length} source{uniq.length === 1 ? "" : "s"}
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cx("expand", open && "open")}>
        <div>
        <ul className="mt-2.5 space-y-2 pb-0.5">
          {uniq.map((s, i) => {
            const page = s.page && s.page > 0 ? s.page : null;
            return (
              <li key={i} className="rounded-xl bg-forest-50 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-forest-900">
                    <FileText className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{s.file_name}</span>
                    {page ? <span className="shrink-0 font-normal text-ink-muted">· page {page}</span> : null}
                  </p>
                  <button onClick={() => onOpen(s)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-forest-700 hover:text-forest-900">
                    <Eye className="size-3.5" aria-hidden /> View{page ? " page" : ""}
                  </button>
                </div>
                {s.snippet && <p className="mt-1.5 line-clamp-4 leading-relaxed text-ink-soft">{s.snippet.replace(/^\[(Source|Classification):[^\]]*\]\s*/gim, "")}</p>}
              </li>
            );
          })}
        </ul>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, streaming, onOpen }: { m: Msg; streaming?: boolean; onOpen: Opener }) {
  if (m.role === "user") {
    return (
      <div className="msg-user flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest-800 px-4 py-3 text-[15px] leading-relaxed text-cream-50">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="msg-bot flex gap-3">
      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-700"><Sparkles className={cx("size-4", streaming && "animate-pulse")} aria-hidden /></div>
      <div className={cx("min-w-0 max-w-[92%] rounded-2xl rounded-tl-md border border-cream-300 bg-white px-5 py-4 text-[15px] leading-relaxed text-ink-soft shadow-card", streaming && "streaming-caret")}>
        {m.content ? <RichText text={m.content} /> : (
          <span className="inline-flex gap-1 py-1" aria-label="VTA is thinking">
            <span className="dot size-2 rounded-full bg-forest-500" /><span className="dot size-2 rounded-full bg-forest-500" /><span className="dot size-2 rounded-full bg-forest-500" />
          </span>
        )}
        {!streaming && m.sources && m.sources.length > 0 && <SourceList sources={m.sources} onOpen={onOpen} />}
      </div>
    </div>
  );
}

export interface ChatWorkspaceProps {
  mode: Role;
  subjectId: string;
  title: string;
  subtitle: string;
  files: DocInfo[];
  /** Student only: questions already used in this class. */
  initialUsed?: number;
  /** Where the back arrow goes (student page). */
  backHref?: string;
  heightClass?: string;
  /** Ask the workspace to scope the next question to a document (e.g. from a viewer outside it). */
  scopeRequest?: { file: DocInfo; n: number; quote?: string } | null;
}

export function ChatWorkspace({ mode, subjectId, title, subtitle, files, initialUsed, backHref, heightClass = "h-[calc(100vh-9.5rem)] min-h-[520px]", scopeRequest }: ChatWorkspaceProps) {
  const limits = useLimits();
  const max = limits.studentMaxQuestionsPerSubject;
  const student = mode === "student";
  const P = student
    ? {
        sessions: `/students/classes/${subjectId}/chat-sessions`,
        messages: (id: string) => `/students/chat-sessions/${id}/messages`,
        ask: `/students/classes/${subjectId}/ask`,
      }
    : {
        sessions: `/teacher-chat/subjects/${subjectId}/sessions`,
        messages: (id: string) => `/teacher-chat/sessions/${id}/messages`,
        ask: `/teacher-chat/subjects/${subjectId}/ask`,
      };

  const [used, setUsed] = useState<number>(initialUsed ?? 0);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [scope, setScope] = useState<DocInfo | null>(null);
  const [viewer, setViewer] = useState<{ doc: DocInfo; page?: number | null; highlight?: string | null } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadSessions = useCallback(async () => {
    setSessions(await api<ChatSessionRow[]>(P.sessions));
  }, [P.sessions]);

  useEffect(() => {
    (async () => {
      try { await loadSessions(); } catch { /* history is non-critical for first paint */ }
    })();
    return () => abortRef.current?.abort();
  }, [loadSessions]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  useEffect(() => {
    const t = taRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = Math.min(t.scrollHeight, 180) + "px";
  }, [input]);

  // A document viewer outside this component can hand us a document to focus the next question on.
  const lastScope = useRef(0);
  useEffect(() => {
    if (scopeRequest && scopeRequest.n !== lastScope.current) {
      lastScope.current = scopeRequest.n;
      setScope(scopeRequest.file);
      if (scopeRequest.quote) askAboutSelection({ text: scopeRequest.quote, docId: null });
      else setTimeout(() => taRef.current?.focus(), 50);
    }
    // Runs once per request (keyed on scopeRequest.n); askAboutSelection is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeRequest]);

  // Text selected in an answer or in the document reader becomes the context of the next question.
  function askAboutSelection({ text, docId }: AskSelection) {
    if (exhausted || noDocs) return;
    const doc = docId ? files.find((f) => f.id === docId) : null;
    if (doc) { setScope(doc); setViewer(null); }
    const room = Math.max(100, limits.maxQuestionChars - 120);
    const quote = text.length > room ? text.slice(0, room).trimEnd() + "…" : text;
    setInput(`About this passage: “${quote}”\n\nMy question: `);
    setError(null);
    setTimeout(() => {
      const t = taRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }, 80);
  }

  const fileById = (id: string) => files.find((f) => f.id === id);
  const openSource: Opener = (s) => {
    const doc = fileById(s.file_id);
    if (!doc) return;
    const page = s.page && s.page > 0 ? s.page : null;
    setViewer({ doc, page, highlight: s.highlight_text || s.snippet || null });
  };

  async function openSession(sid: string) {
    if (sending) return;
    setActive(sid);
    setDrawer(false);
    setError(null);
    setLoadingMsgs(true);
    try { setMessages(await api<Msg[]>(P.messages(sid))); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoadingMsgs(false); }
  }

  function newChat() {
    if (sending) return;
    setActive(null);
    setMessages([]);
    setError(null);
    setDrawer(false);
    taRef.current?.focus();
  }

  const left = student ? Math.max(0, max - used) : null;
  const exhausted = student && left === 0;
  const noDocs = files.length === 0;

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || sending || exhausted) return;
    if (question.length < 3) return setError("Please write a little more so I can help.");
    if (question.length > limits.maxQuestionChars) return setError(`Questions can be at most ${limits.maxQuestionChars} characters.`);
    setError(null);
    setSending(true);
    setInput("");
    setMessages((m) => [...m, { id: "tmp-u", _k: "tmp-u", role: "user", content: question }, { id: "tmp-a", _k: "tmp-a", role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const ev of askStream(P.ask, question, active, scope?.id ?? null, ctrl.signal)) {
        if (ev.type === "start") {
          setActive(ev.sessionId);
          if (student && ev.questionsUsed !== undefined) setUsed(ev.questionsUsed);
        } else if (ev.type === "token") {
          setMessages((m) => m.map((x) => (x.id === "tmp-a" ? { ...x, content: x.content + ev.text } : x)));
        } else if (ev.type === "done") {
          if (student && ev.questionsUsed !== undefined) setUsed(ev.questionsUsed);
          setMessages((m) => m.map((x) => (x.id === "tmp-a" ? { ...ev.message, _k: "tmp-a" } : x.id === "tmp-u" ? { ...x, id: ev.userMessageId } : x)));
          loadSessions().catch(() => undefined);
        } else if (ev.type === "error") {
          if (student && ev.questionsUsed !== undefined) setUsed(ev.questionsUsed);
          setMessages((m) => m.filter((x) => x.id !== "tmp-u" && x.id !== "tmp-a"));
          setInput(question);
          setError(ev.message);
        }
      }
    } catch (e) {
      const err = e as ApiError;
      setMessages((m) => m.filter((x) => x.id !== "tmp-u" && x.id !== "tmp-a"));
      setInput(question);
      if (err.code === "QUESTION_LIMIT_REACHED") { setUsed(max); setInput(""); }
      setError(err.message);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <button onClick={newChat} disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700 disabled:opacity-50">
          <MessageSquarePlus className="size-4" aria-hidden /> New chat
        </button>
      </div>
      <p className="flex items-center gap-2 px-5 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted"><History className="size-3.5" aria-hidden /> History</p>
      <nav aria-label="Chat history" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {sessions.length === 0 && <p className="px-3 py-4 text-sm text-ink-muted">Your conversations will be saved here.</p>}
        {sessions.map((s, i) => (
          <button key={s.id} onClick={() => openSession(s.id)} aria-current={active === s.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
            className={cx("stagger block w-full rounded-xl px-3 py-2.5 text-left transition-[background-color,transform] hover:translate-x-0.5", active === s.id ? "bg-forest-100 text-forest-900" : "text-ink-soft hover:bg-cream-200")}>
            <span className="line-clamp-2 text-sm font-medium leading-snug">{s.title || "Untitled chat"}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{when(s.updatedAt)} · {Math.ceil(s._count.messages / 2)} question{Math.ceil(s._count.messages / 2) === 1 ? "" : "s"}</span>
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <div className={cx("grid gap-5 lg:grid-cols-[260px_1fr_290px]", heightClass)}>
        <aside className="hidden overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-card lg:block">{sidebar}</aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-forest-900/45" onClick={() => setDrawer(false)} aria-hidden />
            <div className="rise absolute inset-y-0 left-0 w-80 max-w-[88%] bg-cream-50 shadow-lift">
              <button onClick={() => setDrawer(false)} aria-label="Close history" className="absolute right-3 top-3 rounded-lg p-1.5 hover:bg-cream-200"><X className="size-4" /></button>
              {sidebar}
            </div>
          </div>
        )}

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-cream-300 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setDrawer(true)} className="rounded-lg p-2 hover:bg-cream-200 lg:hidden" aria-label="Open chat history"><PanelLeft className="size-5" /></button>
              {backHref && <Link href={backHref} aria-label="Back to my classes" className="hidden rounded-lg p-2 text-ink-muted hover:bg-cream-200 sm:block"><ArrowLeft className="size-4" /></Link>}
              <div className="min-w-0">
                <h1 className="font-display truncate text-xl leading-tight text-forest-900">{title}</h1>
                <p className="truncate text-xs text-ink-muted">{subtitle}</p>
              </div>
            </div>
            {student ? (
              <Badge tone={exhausted ? "red" : left! <= 3 ? "gold" : "green"} className="shrink-0">{exhausted ? "No questions left" : `${left} of ${max} left`}</Badge>
            ) : (
              <Badge tone="neutral" className="shrink-0">Preview as a student</Badge>
            )}
          </div>

          <div data-ask-zone className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
            {loadingMsgs ? (
              <Spinner label="Loading conversation" />
            ) : messages.length === 0 ? (
              <div className="mx-auto flex max-w-md flex-col items-center py-8 text-center">
                <div className="pop float-a grid size-14 place-items-center rounded-2xl bg-forest-800 text-cream-50"><Sparkles className="size-7" aria-hidden /></div>
                <h2 className="font-display mt-5 text-3xl text-forest-900">{exhausted ? "Your questions are used up" : `Ask about ${title}`}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {exhausted
                    ? `You've used all ${max} questions in this class. Pick a conversation from your history to read it again.`
                    : student
                      ? `I answer only from your teacher's materials and show where each answer comes from. You have ${left} of ${max} questions left in this class.`
                      : "Try the assistant on your own materials exactly as your students will see it. Your test questions are not counted anywhere and are never shown to students."}
                </p>
                {noDocs ? (
                  <Notice tone="warn" className="mt-6 text-left">{student ? "Your teacher hasn't added any ready materials yet. Check back soon." : "Upload at least one document and wait until it shows as Ready."}</Notice>
                ) : !exhausted && (
                  <div className="mt-6 flex w-full flex-col gap-2">
                    {SUGGESTIONS.map((s, i) => (
                      <button key={s} onClick={() => { setInput(s); taRef.current?.focus(); }} style={{ "--i": i + 2 } as React.CSSProperties} className="stagger rounded-xl border border-cream-300 bg-white px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:-translate-y-px hover:border-forest-300 hover:bg-forest-50">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((m) => <Bubble key={m._k ?? m.id} m={m} onOpen={openSource} streaming={sending && m.id === "tmp-a"} />)
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-cream-300 bg-cream-100/60 p-3 sm:p-4">
            {error && <Notice tone="error" className="mb-3">{error}</Notice>}
            {exhausted ? (
              <div className="flex items-center gap-3 rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-ink-soft">
                <Lock className="size-4 shrink-0 text-ink-muted" aria-hidden />
                You&rsquo;ve used all {max} questions for this class. Your conversations stay saved and readable in the history.
              </div>
            ) : (
              <>
                {scope && (
                  <div key={scope.id} className="pop mb-2 flex items-center gap-2 text-xs">
                    <span className="inline-flex max-w-full items-center gap-1.5 font-semibold text-forest-700">
                      <MessageSquareQuote className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">Only answering from: {scope.name}</span>
                    </span>
                    <button onClick={() => setScope(null)} aria-label="Ask about all documents instead" className="rounded p-0.5 text-ink-muted hover:bg-cream-200 hover:text-ink"><X className="size-3.5" /></button>
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="relative">
                  <textarea
                    ref={taRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    rows={1}
                    maxLength={limits.maxQuestionChars + 200}
                    disabled={sending || noDocs}
                    placeholder={noDocs ? "Waiting for study materials…" : scope ? `Ask about ${scope.name}…` : "Ask about the course materials…"}
                    aria-label="Your question"
                    className="block max-h-44 w-full resize-none rounded-2xl border border-cream-400 bg-white py-3.5 pl-4 pr-14 text-[15px] leading-relaxed placeholder:text-ink-muted/70 hover:border-forest-300 focus:border-forest-500 disabled:bg-cream-200/60"
                  />
                  <button type="submit" disabled={sending || !input.trim() || noDocs} aria-label="Send question"
                    className="absolute bottom-2.5 right-2.5 grid size-9 place-items-center rounded-xl bg-forest-800 text-cream-50 transition-colors hover:bg-forest-700 disabled:bg-cream-400">
                    <ArrowUp className="size-5" />
                  </button>
                </form>
                <p className="mt-2 flex justify-between px-1 text-xs text-ink-muted">
                  <span>Enter to send · Shift+Enter for a new line{student ? ` · each answered question uses 1 of your ${max}` : ""}</span>
                  {input.length > limits.maxQuestionChars - 150 && <span className={input.length > limits.maxQuestionChars ? "text-danger-600" : ""}>{input.length}/{limits.maxQuestionChars}</span>}
                </p>
              </>
            )}
          </div>
        </section>

        <aside className="hidden space-y-4 overflow-y-auto lg:block">
          {student && (
            <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-card">
              <Meter label="Questions used" used={used} max={max} />
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">Your allowance for this class. It doesn&rsquo;t reset, and unanswered questions aren&rsquo;t counted.</p>
            </div>
          )}
          <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-card">
            <h2 className="font-display text-lg text-forest-900">Course materials</h2>
            <p className="mt-1 text-xs text-ink-muted">Read a document here, or focus your next question on it.</p>
            {files.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nothing uploaded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={f.id} style={{ "--i": i } as React.CSSProperties} className={cx("stagger rounded-xl border bg-white transition-[border-color,box-shadow] hover:shadow-card", scope?.id === f.id ? "border-forest-500 shadow-card" : "border-cream-300")}>
                    <button onClick={() => setViewer({ doc: f })} className="flex w-full items-center gap-2.5 rounded-t-xl px-3 py-2.5 text-left text-sm text-ink-soft hover:bg-forest-50">
                      <FileText className="size-4 shrink-0 text-forest-600" aria-hidden />
                      <span className="truncate">{f.name}</span>
                    </button>
                    <div className="flex border-t border-cream-300 text-xs font-semibold">
                      <button onClick={() => setViewer({ doc: f })} className="flex flex-1 items-center justify-center gap-1.5 py-2 text-forest-700 hover:bg-forest-50"><Eye className="size-3.5" aria-hidden /> View</button>
                      <button onClick={() => { setScope(scope?.id === f.id ? null : f); taRef.current?.focus(); }} disabled={exhausted}
                        className="flex flex-1 items-center justify-center gap-1.5 border-l border-cream-300 py-2 text-forest-700 hover:bg-forest-50 disabled:opacity-40">
                        <MessageSquareQuote className="size-3.5" aria-hidden /> {scope?.id === f.id ? "Unfocus" : "Ask"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <SelectionAsk onAsk={askAboutSelection} />
      <AnimatePresence>
        {viewer && (
        <DocViewer key={viewer.doc.id}
          doc={viewer.doc}
          page={viewer.page}
          highlight={viewer.highlight}
          role={mode}
          onClose={() => setViewer(null)}
          onAsk={exhausted ? undefined : (d) => { setScope(d); setTimeout(() => taRef.current?.focus(), 50); }}
        />
      )}
      </AnimatePresence>
    </>
  );
}
