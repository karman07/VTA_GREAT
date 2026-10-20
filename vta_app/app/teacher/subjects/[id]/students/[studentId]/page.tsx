"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, Clock, FileText, Mail, MessageCircle, MessagesSquare, Sparkles, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RichText } from "@/components/RichText";
import { Card, EmptyState, Meter, Notice, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useAuth } from "@/lib/auth";
import { useLimits } from "@/lib/config";
import { api, type ApiError, type Source, type StudentDetail } from "@/lib/api";
import { initials, when } from "@/lib/format";

const full = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const stripHeaders = (t: string) => t.replace(/^\[(Source|Classification):[^\]]*\]\s*/gim, "");

function Facts({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-forest-100 text-forest-700"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</dt>
        <dd className="mt-0.5 break-words text-[15px] text-ink">{value}</dd>
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const uniq = sources.filter((s, i) => sources.findIndex((x) => x.file_id === s.file_id && x.page === s.page) === i);
  if (!uniq.length) return null;
  return (
    <div className="mt-3 border-t border-cream-300 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-forest-700"><BookOpen className="size-3.5" aria-hidden /> Sources cited</p>
      <ul className="space-y-2">
        {uniq.map((s, i) => (
          <li key={i} className="rounded-xl bg-forest-50 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-forest-900">
              <FileText className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{s.file_name}</span>
              {s.page && s.page > 0 ? <span className="shrink-0 font-normal text-ink-muted">· page {s.page}</span> : null}
            </p>
            {s.snippet && <p className="mt-1.5 leading-relaxed text-ink-soft">{stripHeaders(s.snippet)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StudentDetailPage() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const { user } = useAuth();
  const limits = useLimits();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const d = await api<StudentDetail>(`/subjects/${id}/students/${studentId}`);
        setData(d);
        // First conversation starts open.
        if (d.sessions[0]) setOpen({ [d.sessions[0].id]: true });
      } catch (e) {
        setError((e as ApiError).status === 404 ? "This student isn't enrolled in this subject." : (e as ApiError).message);
      }
    })();
  }, [user, id, studentId]);

  const answered = data?.sessions.reduce((n, s) => n + s.messages.filter((m) => m.role === "assistant").length, 0) ?? 0;

  return (
    <AppShell role="teacher">
      <Link href={`/teacher/subjects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-forest-700">
        <ArrowLeft className="size-4" aria-hidden /> Back to {data?.subject.name ?? "subject"}
      </Link>

      {error && <Notice tone="error" className="mt-6">{error}</Notice>}
      {!data && !error && <Spinner label="Loading student" />}

      {data && (
        <div className="rise">
          {/* Profile */}
          <Card className="mt-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-start gap-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-forest-800 font-display text-2xl text-cream-50">{initials(data.student.name, data.student.email)}</span>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-3xl text-forest-900">{data.student.name || "Student"}</h1>
                <p className="mt-1 text-sm text-ink-muted">Student in <span className="font-medium text-forest-800">{data.subject.name}</span></p>
              </div>
            </div>

            <dl className="mt-7 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <Facts icon={UserRound} label="Full name" value={data.student.name || "—"} />
              <Facts icon={Mail} label="Email" value={<a className="text-forest-700 underline underline-offset-2" href={`mailto:${data.student.email}`}>{data.student.email}</a>} />
              <Facts icon={CalendarDays} label="Joined this class" value={<>{day(data.joinedAt)}<span className="block text-xs text-ink-muted">{when(data.joinedAt)}</span></>} />
              <Facts icon={Clock} label="Last active" value={data.lastActiveAt ? <>{full(data.lastActiveAt)}<span className="block text-xs text-ink-muted">{when(data.lastActiveAt)}</span></> : "Hasn't asked anything yet"} />
              <Facts icon={CalendarDays} label="VTA account created" value={day(data.student.createdAt)} />
            </dl>
          </Card>

          {/* Usage */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <Meter label="Questions used" used={data.questionsUsed} max={limits.studentMaxQuestionsPerSubject} />
              <p className="mt-2 text-xs text-ink-muted">{Math.max(0, limits.studentMaxQuestionsPerSubject - data.questionsUsed)} left in this class</p>
            </Card>
            <Card className="flex items-center gap-4 p-5">
              <div className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-700"><MessagesSquare className="size-5" aria-hidden /></div>
              <div><p className="text-sm text-ink-muted">Conversations</p><p className="font-display text-3xl leading-none text-forest-900">{data.sessions.length}</p></div>
            </Card>
            <Card className="flex items-center gap-4 p-5">
              <div className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-700"><MessageCircle className="size-5" aria-hidden /></div>
              <div><p className="text-sm text-ink-muted">Questions · answers</p><p className="font-display text-3xl leading-none text-forest-900">{data.questionsAsked} · {answered}</p></div>
            </Card>
          </div>

          {/* Conversations */}
          <h2 className="font-display mt-10 text-2xl text-forest-900">Conversations</h2>
          <p className="mt-1 text-sm text-ink-muted">Every question this student asked in {data.subject.name}, with the answers VTA gave and the sources it cited.</p>

          {data.sessions.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title="No conversations yet">
                {data.student.name || "This student"} has joined the class but hasn&rsquo;t asked a question yet.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.sessions.map((s) => {
                const isOpen = !!open[s.id];
                const qs = s.messages.filter((m) => m.role === "user").length;
                return (
                  <li key={s.id} className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-card">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-forest-50/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{s.title || "Untitled conversation"}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{full(s.createdAt)} · {qs} question{qs === 1 ? "" : "s"}</p>
                      </div>
                      <ChevronDown className={cx("size-5 shrink-0 text-ink-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                    </button>
                    {isOpen && (
                      <div className="space-y-5 border-t border-cream-300 bg-cream-100/50 px-4 py-6 sm:px-6">
                        {s.messages.map((m) =>
                          m.role === "user" ? (
                            <div key={m.id} className="flex justify-end">
                              <div className="max-w-[85%]">
                                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest-800 px-4 py-3 text-[15px] leading-relaxed text-cream-50">{m.content}</div>
                                {m.createdAt && <p className="mt-1 text-right text-xs text-ink-muted">{full(m.createdAt)}</p>}
                              </div>
                            </div>
                          ) : (
                            <div key={m.id} className="flex gap-3">
                              <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-forest-100 text-forest-700"><Sparkles className="size-4" aria-hidden /></div>
                              <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md border border-cream-300 bg-white px-5 py-4 text-[15px] leading-relaxed text-ink-soft shadow-card">
                                <RichText text={m.content} />
                                {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  );
}
