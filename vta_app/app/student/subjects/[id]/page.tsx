"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { Notice, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api, type ApiError, type ClassDetails, type DocInfo, type Enrollment } from "@/lib/api";

export default function StudentClassPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [details, setDetails] = useState<ClassDetails | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [d, enr] = await Promise.all([api<ClassDetails>(`/students/classes/${id}`), api<Enrollment[]>("/students/classes")]);
        setDetails(d);
        setUsed(enr.find((e) => e.subjectId === id)?.questionsUsed ?? 0);
      } catch (e) {
        const err = e as ApiError;
        setFatal(err.status === 401 || err.status === 403 ? "You aren't enrolled in this class." : err.message);
      }
    })();
  }, [user, id]);

  const files: DocInfo[] = (details?.files ?? []).map((f) => ({ id: f.id, name: f.displayName || f.originalName, mime: f.mimeType, sizeBytes: f.sizeBytes }));

  return (
    <AppShell role="student" wide>
      {fatal ? (
        <div className="mx-auto max-w-lg py-16 text-center">
          <Notice tone="error" className="text-left">{fatal}</Notice>
          <Link href="/student" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700"><ArrowLeft className="size-4" /> Back to my classes</Link>
        </div>
      ) : !details || used === null ? (
        <Spinner label="Opening class" />
      ) : (
        <ChatWorkspace
          mode="student"
          subjectId={id}
          title={details.name}
          subtitle={`Taught by ${details.teacher.name || details.teacher.email}`}
          files={files}
          initialUsed={used}
          backHref="/student"
        />
      )}
    </AppShell>
  );
}
