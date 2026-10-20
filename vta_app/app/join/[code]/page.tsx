"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GraduationCap, Users, FileText } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { Button, Card, Notice, Spinner } from "@/components/ui";
import { btnClass } from "@/lib/cx";
import { useAuth } from "@/lib/auth";
import { useAuthDialog } from "@/components/AuthDialog";
import { api, ApiError, type ClassPreview } from "@/lib/api";
import { PENDING_JOIN_KEY } from "@/lib/constants";


export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, role, ready } = useAuth();
  const { open: openAuth } = useAuthDialog();
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = (code ?? "").toUpperCase();

  useEffect(() => {
    api<ClassPreview>(`/students/class-preview/${encodeURIComponent(clean)}`, { auth: false })
      .then(setPreview)
      .catch((e: ApiError) => setError(e.status === 404 ? "This class code isn't valid. Check it with your teacher." : e.message));
  }, [clean]);

  function remember() {
    try { localStorage.setItem(PENDING_JOIN_KEY, clean); } catch {}
  }

  async function join() {
    setBusy(true);
    try {
      await api("/students/join", { body: { code: clean } });
      router.replace("/student");
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <section className="grain mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-16">
        <Card className="rise w-full p-8 text-center">
          {!preview && !error && <Spinner label="Looking up class" />}
          {error && <Notice tone="error" className="text-left">{error}</Notice>}
          {preview && (
            <>
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-forest-800 text-cream-50"><GraduationCap className="size-7" aria-hidden /></div>
              <p className="mt-5 text-sm font-medium text-forest-600">You&rsquo;ve been invited to join</p>
              <h1 className="font-display mt-1 text-4xl text-forest-900">{preview.name}</h1>
              <p className="mt-2 text-ink-muted">Taught by {preview.teacher?.name || "your teacher"}</p>
              <div className="mt-5 flex justify-center gap-6 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><FileText className="size-4" aria-hidden /> {preview._count.files} document{preview._count.files === 1 ? "" : "s"}</span>
                <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden /> {preview._count.enrollments} student{preview._count.enrollments === 1 ? "" : "s"}</span>
              </div>

              <div className="mt-8">
                {!ready ? null : user && role === "student" ? (
                  <Button size="lg" className="w-full" loading={busy} onClick={join}>Join this class</Button>
                ) : user ? (
                  <Notice tone="warn" className="text-left">You&rsquo;re signed in as a teacher. Sign out and use a student account to join a class.</Notice>
                ) : (
                  <div className="space-y-3">
                    <button type="button" onClick={() => { remember(); openAuth({ role: "student", mode: "signup", lockRole: true }); }} className={btnClass("primary", "lg", "w-full")}>Create a student account</button>
                    <button type="button" onClick={() => { remember(); openAuth({ role: "student", mode: "login", lockRole: true }); }} className={btnClass("secondary", "lg", "w-full")}>I already have an account</button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </section>
    </PublicShell>
  );
}
