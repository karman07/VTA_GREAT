"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, GraduationCap, KeyRound, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, Meter, Notice, SkeletonCards } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useLimits } from "@/lib/config";
import { api, ApiError, type Enrollment } from "@/lib/api";
import { PENDING_JOIN_KEY } from "@/lib/constants";

export default function StudentDashboard() {
  const { user } = useAuth();
  const limits = useLimits();
  const [classes, setClasses] = useState<Enrollment[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const handledPending = useRef(false);

  const load = useCallback(async () => {
    try {
      setClasses(await api<Enrollment[]>("/students/classes"));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);

  const join = useCallback(
    async (c: string) => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const r = await api<{ message: string; subject: { name: string } }>("/students/join", { body: { code: c.trim().toUpperCase() } });
        setInfo(`${r.message} ${r.subject?.name ? `(${r.subject.name})` : ""}`.trim());
        setCode("");
        await load();
      } catch (e) {
        setError((e as ApiError).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
      // Finish a join that started from an invite link before the student had an account.
      if (handledPending.current) return;
      handledPending.current = true;
      let pending: string | null = null;
      try { pending = localStorage.getItem(PENDING_JOIN_KEY); localStorage.removeItem(PENDING_JOIN_KEY); } catch {}
      if (pending) await join(pending);
    })();
  }, [user, load, join]);

  const max = limits.studentMaxQuestionsPerSubject;

  return (
    <AppShell role="student">
      <div className="rise">
        <p className="text-sm font-medium text-forest-600">Student dashboard</p>
        <h1 className="font-display mt-1 text-4xl text-forest-900">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>

        <Card className="mt-8 p-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex min-w-60 flex-1 items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest-800 text-cream-50"><KeyRound className="size-5" aria-hidden /></div>
              <div>
                <h2 className="font-display text-xl text-forest-900">Join a class</h2>
                <p className="text-sm text-ink-muted">Enter the code your teacher gave you.</p>
              </div>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); if (code.trim()) join(code); }}
              className="flex w-full gap-2 sm:w-auto"
            >
              <input
                aria-label="Class code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={10}
                placeholder="ABC123"
                className="h-11 w-full rounded-xl border border-cream-400 bg-white px-4 text-center font-mono text-lg font-semibold uppercase tracking-[0.25em] placeholder:font-normal placeholder:tracking-widest placeholder:text-ink-muted/50 hover:border-forest-300 focus:border-forest-500 sm:w-44"
              />
              <Button type="submit" loading={busy} disabled={!code.trim()}>Join</Button>
            </form>
          </div>
          {error && <Notice tone="error" className="mt-4">{error}</Notice>}
          {info && <Notice tone="success" className="mt-4">{info}</Notice>}
        </Card>

        <h2 className="font-display mt-10 text-2xl text-forest-900">Your classes</h2>
        {!classes && !error ? (
          <SkeletonCards className="mt-4" count={2} />
        ) : classes && classes.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<GraduationCap className="size-6" aria-hidden />} title="You haven't joined a class yet">
              Ask your teacher for a class code and enter it above. Each class gives you {max} questions.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {classes?.map((c, i) => {
              const left = Math.max(0, max - c.questionsUsed);
              return (
                <Card key={c.id} className="stagger group flex flex-col p-6 hover:-translate-y-1 hover:border-forest-300 hover:shadow-lift" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-2xl leading-tight text-forest-900">{c.subject.name}</h3>
                    {left === 0 ? <Badge tone="red">Limit reached</Badge> : <Badge>{left} left</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{c.subject.teacher.name || c.subject.teacher.email}</p>
                  <div className="mt-5">
                    <Meter compact label="Questions used" used={c.questionsUsed} max={max} />
                  </div>
                  <p className="mt-3 text-sm text-ink-muted">{c.subject._count.files} document{c.subject._count.files === 1 ? "" : "s"} available</p>
                  <Link
                    href={`/student/subjects/${c.subjectId}`}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:text-forest-900"
                  >
                    <MessageSquare className="size-4" aria-hidden /> {left === 0 ? "View chat history" : "Open class"}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
