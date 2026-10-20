"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BookOpen, FileText, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { Button, Card, EmptyState, Field, Meter, Modal, Notice, SkeletonCards } from "@/components/ui";
import { CountUp } from "@/components/motion";
import { useAuth } from "@/lib/auth";
import { useLimits } from "@/lib/config";
import { api, ApiError, type KFile, type Subject } from "@/lib/api";

type FileRow = KFile & { subjectId: string | null };

export default function TeacherDashboard() {
  const { user } = useAuth();
  const limits = useLimits();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api<Subject[]>("/subjects"), api<FileRow[]>("/knowledge-base/files")]);
      setSubjects(s);
      setFiles(f);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    (async () => { await load(); })();
  }, [user, load]);

  const docsFor = (id: string) => files.filter((f) => f.subjectId === id && f.status !== "error").length;
  const atLimit = (subjects?.length ?? 0) >= limits.teacherMaxSubjects;
  const totalDocs = subjects?.reduce((n, s) => n + docsFor(s.id), 0) ?? 0;
  const totalStudents = subjects?.reduce((n, s) => n + s._count.enrollments, 0) ?? 0;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setFormErr("Give the subject a name.");
    setBusy(true);
    setFormErr(null);
    try {
      await api<Subject>("/subjects", { body: { name: name.trim() } });
      setOpen(false);
      setName("");
      await load();
    } catch (err) {
      setFormErr((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell role="teacher">
      <div className="rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-forest-600">Teacher dashboard</p>
            <h1 className="font-display mt-1 text-4xl text-forest-900">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          </div>
          <Button onClick={() => setOpen(true)} disabled={atLimit || !subjects}>
            <Plus className="size-4" aria-hidden /> New subject
          </Button>
        </div>

        {error && <Notice tone="error" className="mt-6">{error}</Notice>}

        {!subjects && !error ? (
          <SkeletonCards className="mt-8" />
        ) : subjects && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card className="stagger p-5" style={{ "--i": 0 } as React.CSSProperties}>
                <Meter label="Subjects" used={subjects.length} max={limits.teacherMaxSubjects} />
              </Card>
              <Card className="stagger p-5" style={{ "--i": 1 } as React.CSSProperties}>
                <Meter label="Documents (all subjects)" used={totalDocs} max={limits.teacherMaxSubjects * limits.teacherMaxDocsPerSubject} />
              </Card>
              <Card className="stagger flex items-center gap-4 p-5" style={{ "--i": 2 } as React.CSSProperties}>
                <div className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-700"><Users className="size-5" aria-hidden /></div>
                <div>
                  <p className="text-sm text-ink-muted">Enrolled students</p>
                  <p className="font-display text-3xl leading-none text-forest-900"><CountUp value={totalStudents} /></p>
                </div>
              </Card>
            </div>

            {atLimit && (
              <Notice tone="info" className="mt-5">
                You have used all {limits.teacherMaxSubjects} subjects. Delete a subject to create a new one.
              </Notice>
            )}

            <h2 className="font-display mt-10 text-2xl text-forest-900">Your subjects</h2>
            {subjects.length === 0 ? (
              <div className="mt-4">
                <EmptyState icon={<BookOpen className="size-6" aria-hidden />} title="Create your first subject">
                  A subject is one class or course. Add up to {limits.teacherMaxDocsPerSubject} documents to it, then share its class code with your students.
                  <div className="mt-5"><Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> New subject</Button></div>
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {subjects.map((s, i) => (
                  <Card key={s.id} className="stagger group flex flex-col p-6 hover:-translate-y-1 hover:border-forest-300 hover:shadow-lift" style={{ "--i": i + 3 } as React.CSSProperties}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-2xl leading-tight text-forest-900">{s.name}</h3>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="rounded-lg border border-dashed border-forest-300 bg-forest-50 px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.18em] text-forest-800">
                        {s.classCode}
                      </span>
                      <CopyButton value={s.classCode} label="Copy code" />
                    </div>
                    <div className="mt-5 space-y-3">
                      <Meter compact label="Documents" used={docsFor(s.id)} max={limits.teacherMaxDocsPerSubject} />
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Users className="size-4" aria-hidden /> {s._count.enrollments} student{s._count.enrollments === 1 ? "" : "s"} enrolled
                      </div>
                    </div>
                    <Link
                      href={`/teacher/subjects/${s.id}`}
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:text-forest-900"
                    >
                      <FileText className="size-4" aria-hidden /> Manage subject
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New subject">
        <form onSubmit={create} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Name it after the class or course. You can add up to {limits.teacherMaxDocsPerSubject} documents to it.
          </p>
          {formErr && <Notice tone="error">{formErr}</Notice>}
          <Field label="Subject name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Physics 101" autoFocus />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create subject</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
