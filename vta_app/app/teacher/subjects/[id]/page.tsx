"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, FileText, Link2, Loader2, MessageCircle, Sparkles, Trash2, TriangleAlert, Upload, Users } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AppShell } from "@/components/AppShell";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { DocViewer } from "@/components/DocViewer";
import { SelectionAsk } from "@/components/SelectionAsk";
import { CopyButton } from "@/components/CopyButton";
import { Badge, Button, Card, EmptyState, Meter, Modal, Notice, SkeletonRows, Spinner } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useAuth } from "@/lib/auth";
import { useLimits } from "@/lib/config";
import { ALLOWED_EXTENSIONS } from "@/lib/constants";
import { api, ApiError, type DocInfo, type KFile, type RecentQuery, type Subject, type TeacherStudent } from "@/lib/api";
import { bytes, initials, when } from "@/lib/format";

type Tab = "documents" | "assistant" | "students" | "questions";

const toDoc = (f: KFile): DocInfo => ({ id: f.id, name: f.displayName || f.originalName, mime: f.mimeType, sizeBytes: f.sizeBytes });

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const limits = useLimits();
  const fileInput = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [files, setFiles] = useState<KFile[] | null>(null);
  const [students, setStudents] = useState<TeacherStudent[] | null>(null);
  const [queries, setQueries] = useState<RecentQuery[] | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [error, setError] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [delFile, setDelFile] = useState<KFile | null>(null);
  const [delSubject, setDelSubject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocInfo | null>(null);
  const [askAbout, setAskAbout] = useState<{ file: DocInfo; n: number; quote?: string } | null>(null);

  const loadFiles = useCallback(async () => {
    const f = await api<KFile[]>(`/knowledge-base/files?subjectId=${id}`);
    setFiles(f);
    return f;
  }, [id]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const s = await api<Subject>(`/subjects/${id}`);
        setSubject(s);
        await loadFiles();
        const [st, q] = await Promise.all([
          api<TeacherStudent[]>(`/subjects/${id}/students`),
          api<RecentQuery[]>(`/analytics/recent-queries?subjectId=${id}&limit=30`),
        ]);
        setStudents(st);
        setQueries(q.filter((x) => x.askedBy === "student"));
      } catch (e) {
        setError((e as ApiError).status === 404 ? "This subject was not found." : (e as ApiError).message);
      }
    })();
  }, [user, id, loadFiles]);

  // Poll while any document is still being processed.
  const pending = files?.some((f) => f.status === "uploading" || f.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => loadFiles().catch(() => undefined), 3000);
    return () => clearInterval(t);
  }, [pending, loadFiles]);

  const used = files?.filter((f) => f.status !== "error").length ?? 0;
  const full = used >= limits.teacherMaxDocsPerSubject;

  async function upload(list: FileList | File[]) {
    setUploadErr(null);
    const file = Array.from(list)[0];
    if (!file) return;
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return setUploadErr(`Unsupported file type. Use ${ALLOWED_EXTENSIONS.join(", ")}.`);
    if (file.size > limits.maxFileBytes) return setUploadErr(`That file is ${bytes(file.size)}. The maximum is ${bytes(limits.maxFileBytes)}.`);
    if (full) return setUploadErr(`This subject already has ${limits.teacherMaxDocsPerSubject} documents. Delete one to add another.`);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("subjectId", id);
      form.append("file", file);
      await api("/knowledge-base/upload", { form });
      await loadFiles();
    } catch (e) {
      setUploadErr((e as ApiError).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeFile() {
    if (!delFile) return;
    setBusy(true);
    try {
      await api(`/knowledge-base/files/${delFile.id}`, { method: "DELETE" });
      setDelFile(null);
      await loadFiles();
    } catch (e) {
      setUploadErr((e as ApiError).message);
      setDelFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function removeSubject() {
    setBusy(true);
    try {
      await api(`/subjects/${id}`, { method: "DELETE" });
      router.replace("/teacher");
    } catch (e) {
      setError((e as ApiError).message);
      setDelSubject(false);
      setBusy(false);
    }
  }

  const inviteLink = typeof window !== "undefined" && subject ? `${window.location.origin}/join/${subject.classCode}` : "";

  return (
    <AppShell role="teacher">
      <Link href="/teacher" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-forest-700">
        <ArrowLeft className="size-4" aria-hidden /> All subjects
      </Link>

      {error && <Notice tone="error" className="mt-6">{error}</Notice>}
      {!subject && !error && <Spinner label="Loading subject" />}

      {subject && (
        <div className="rise">
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <h1 className="font-display text-4xl text-forest-900">{subject.name}</h1>
            <Button variant="secondary" size="sm" onClick={() => setDelSubject(true)} className="text-danger-600">
              <Trash2 className="size-4" aria-hidden /> Delete subject
            </Button>
          </div>

          {/* Invite card */}
          <Card className="rise mt-6 flex flex-wrap items-center justify-between gap-5 bg-forest-900 p-6 text-cream-50 [animation-delay:80ms]">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-forest-300">Class code</p>
              <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.25em]">{subject.classCode}</p>
              <p className="mt-1 text-sm text-forest-200">Students enter this code after signing up, or open the invite link.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={subject.classCode} label="Copy code" tone="dark" />
              <CopyButton value={inviteLink} label="Copy invite link" tone="dark" />
            </div>
          </Card>

          {/* Tabs */}
          <LayoutGroup id="subject-tabs">
            <div role="tablist" aria-label="Subject sections" className="mt-8 flex gap-1 overflow-x-auto border-b border-cream-300">
              {([
                ["documents", "Documents", FileText, `${used}/${limits.teacherMaxDocsPerSubject}`],
                ["assistant", "Ask the assistant", Sparkles, ""],
                ["students", "Students", Users, String(students?.length ?? 0)],
                ["questions", "Student questions", MessageCircle, String(queries?.length ?? 0)],
              ] as const).map(([key, label, Icon, count]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cx(
                    "relative -mb-px flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    tab === key ? "text-forest-900" : "text-ink-muted hover:text-forest-700",
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                  {count && <span className="text-xs tabular-nums text-ink-muted">{count}</span>}
                  {tab === key && (
                    <motion.span layoutId="subject-tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-forest-700" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                  )}
                </button>
              ))}
            </div>
          </LayoutGroup>

          {/* Documents */}
          {tab === "documents" && (
            <section key="documents" className="rise mt-6 grid gap-6 lg:grid-cols-[1fr_320px]" role="tabpanel">
              <div className="space-y-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); if (!full) upload(e.dataTransfer.files); }}
                  className={cx(
                    "rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                    drag ? "border-forest-500 bg-forest-50" : "border-cream-400 bg-cream-50",
                    full && "opacity-60",
                  )}
                >
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-forest-100 text-forest-700">
                    {uploading ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Upload className="size-6" aria-hidden />}
                  </div>
                  <p className="font-display mt-4 text-xl text-forest-900">{full ? "Document limit reached" : "Drop a document here"}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {full
                      ? `Delete a document to add another (${limits.teacherMaxDocsPerSubject} per subject).`
                      : `${ALLOWED_EXTENSIONS.join(", ")} · up to ${bytes(limits.maxFileBytes)}`}
                  </p>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    accept={ALLOWED_EXTENSIONS.join(",")}
                    onChange={(e) => e.target.files && upload(e.target.files)}
                  />
                  <Button className="mt-5" variant="secondary" disabled={full || uploading} onClick={() => fileInput.current?.click()}>
                    {uploading ? "Uploading…" : "Choose file"}
                  </Button>
                </div>

                {uploadErr && <Notice tone="error">{uploadErr}</Notice>}

                {files === null ? (
                  <SkeletonRows count={2} />
                ) : files.length === 0 ? (
                  <EmptyState icon={<FileText className="size-6" aria-hidden />} title="No documents yet">
                    Upload your first document. Students can ask questions once it shows as ready.
                  </EmptyState>
                ) : (
                  <ul className="space-y-3">
                    {files.map((f, i) => (
                      <li key={f.id} className="stagger flex items-center gap-4 rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lift" style={{ "--i": i } as React.CSSProperties}>
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest-100 text-forest-700"><FileText className="size-5" aria-hidden /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{f.displayName || f.originalName}</p>
                          <p className="text-xs text-ink-muted">{bytes(f.sizeBytes)} · added {when(f.createdAt)}{f.status === "ready" ? ` · ${f.chunkCount} passage${f.chunkCount === 1 ? "" : "s"} indexed` : ""}</p>
                        </div>
                        {f.status === "ready" ? (
                          <Badge><CheckCircle2 className="size-3" aria-hidden /> Ready</Badge>
                        ) : f.status === "error" ? (
                          <Badge tone="red"><TriangleAlert className="size-3" aria-hidden /> Failed</Badge>
                        ) : (
                          <Badge tone="gold" className="ring rounded-full"><Loader2 className="size-3 animate-spin" aria-hidden /> Processing</Badge>
                        )}
                        {f.status === "ready" && (
                          <button
                            onClick={() => setViewDoc(toDoc(f))}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-forest-700 hover:bg-forest-50"
                          >
                            <Eye className="size-4" aria-hidden /> View
                          </button>
                        )}
                        <button
                          onClick={() => setDelFile(f)}
                          aria-label={`Delete ${f.originalName}`}
                          className="rounded-lg p-2 text-ink-muted hover:bg-danger-100 hover:text-danger-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {files?.some((f) => f.status === "error") && (
                  <Notice tone="warn">
                    A document failed to process (scanned or image-only files can&rsquo;t be read). Failed documents don&rsquo;t use up a place — delete it and try another file.
                  </Notice>
                )}
              </div>

              <aside className="space-y-4">
                <Card className="p-5"><Meter label="Documents in this subject" used={used} max={limits.teacherMaxDocsPerSubject} /></Card>
                <Card className="p-5 text-sm leading-relaxed text-ink-muted">
                  <p className="flex items-center gap-2 font-medium text-forest-900"><Link2 className="size-4" aria-hidden /> What students see</p>
                  <p className="mt-2">Enrolled students can ask questions about these documents and open them. Answers cite the document and page they came from.</p>
                </Card>
              </aside>
            </section>
          )}

          {/* Assistant */}
          {tab === "assistant" && files && (
            <section key="assistant" className="rise mt-6" role="tabpanel">
              <ChatWorkspace
                mode="teacher"
                subjectId={id}
                title={subject.name}
                subtitle="Test the assistant on your materials"
                files={files.filter((f) => f.status === "ready").map(toDoc)}
                heightClass="h-[700px]"
                scopeRequest={askAbout}
              />
            </section>
          )}

          {/* Students */}
          {tab === "students" && (
            <section key="students" className="rise mt-6" role="tabpanel">
              {students === null ? (
                <Spinner label="Loading students" />
              ) : students.length === 0 ? (
                <EmptyState icon={<Users className="size-6" aria-hidden />} title="No students yet">
                  Share the class code <strong className="font-mono">{subject.classCode}</strong> and students will appear here once they join.
                </EmptyState>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-cream-200/70 text-xs uppercase tracking-wider text-ink-muted">
                        <tr>
                          <th className="px-5 py-3 font-medium">Student</th>
                          <th className="px-5 py-3 font-medium">Joined</th>
                          <th className="px-5 py-3 font-medium">Last active</th>
                          <th className="px-5 py-3 font-medium">Chats</th>
                          <th className="px-5 py-3 font-medium">Questions used</th>
                          <th className="px-5 py-3"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-300">
                        {students.map((s, i) => (
                          <tr key={s.studentId} className="stagger group transition-colors hover:bg-forest-50/60" style={{ "--i": i } as React.CSSProperties}>
                            <td className="px-5 py-3.5">
                              <Link href={`/teacher/subjects/${id}/students/${s.studentId}`} className="flex items-center gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-forest-800 text-xs font-semibold text-cream-50">{initials(s.name, s.email)}</span>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-ink group-hover:text-forest-800">{s.name || "Student"}</span>
                                  <span className="block truncate text-xs text-ink-muted">{s.email}</span>
                                </span>
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3.5 text-ink-muted">{when(s.joinedAt)}</td>
                            <td className="whitespace-nowrap px-5 py-3.5 text-ink-muted">{s.lastActiveAt ? when(s.lastActiveAt) : "Not yet"}</td>
                            <td className="px-5 py-3.5 tabular-nums text-ink-soft">{s.conversations}</td>
                            <td className="w-48 px-5 py-3.5">
                              <Meter compact label="" used={s.questionsUsed} max={limits.studentMaxQuestionsPerSubject} />
                              <span className="mt-1 block text-xs tabular-nums text-ink-muted">{s.questionsUsed} of {limits.studentMaxQuestionsPerSubject}</span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Link href={`/teacher/subjects/${id}/students/${s.studentId}`} className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:text-forest-900">
                                View details <ChevronRight className="size-4" aria-hidden />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </section>
          )}

          {/* Questions */}
          {tab === "questions" && (
            <section key="questions" className="rise mt-6" role="tabpanel">
              {queries === null ? (
                <Spinner label="Loading questions" />
              ) : queries.length === 0 ? (
                <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title="No questions yet">
                  Questions your students ask in this subject will be listed here, newest first.
                </EmptyState>
              ) : (
                <ul className="space-y-3">
                  {queries.map((q, i) => (
                    <li key={q.id} className="stagger rounded-2xl border border-cream-300 bg-cream-50 p-4 shadow-card" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                      <p className="leading-relaxed text-ink">{q.question}</p>
                      <p className="mt-2 text-xs text-ink-muted">{q.student?.name || "A student"} · {when(q.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {viewDoc && tab !== "assistant" && (
        <SelectionAsk onAsk={({ text }) => { setAskAbout({ file: viewDoc, n: Date.now(), quote: text }); setTab("assistant"); setViewDoc(null); }} />
      )}
      <AnimatePresence>
      {viewDoc && (
        <DocViewer
          key={viewDoc.id}
          doc={viewDoc}
          role="teacher"
          onClose={() => setViewDoc(null)}
          onAsk={(d) => { setAskAbout({ file: d, n: Date.now() }); setTab("assistant"); }}
        />
      )}
      </AnimatePresence>

      <Modal open={!!delFile} onClose={() => setDelFile(null)} title="Delete this document?">
        <p className="text-sm leading-relaxed text-ink-soft">
          <strong>{delFile?.displayName || delFile?.originalName}</strong> will be removed along with its indexed text. Students will no longer get answers from it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDelFile(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={removeFile}>Delete document</Button>
        </div>
      </Modal>

      <Modal open={delSubject} onClose={() => setDelSubject(false)} title="Delete this subject?">
        <p className="text-sm leading-relaxed text-ink-soft">
          <strong>{subject?.name}</strong> will be deleted with all its documents, student enrolments and chat history. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDelSubject(false)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={removeSubject}>Delete subject</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
