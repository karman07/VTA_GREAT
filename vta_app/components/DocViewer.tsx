"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { FileText, MessageSquareQuote, X } from "lucide-react";
import { Button, Notice, Spinner } from "./ui";
import { DocText } from "./DocText";
import { cx } from "@/lib/cx";
import { api, fetchBlob, type DocChunk, type DocInfo, type Role } from "@/lib/api";
import { bytes } from "@/lib/format";

const isPdf = (d: DocInfo) => d.mime.includes("pdf") || d.name.toLowerCase().endsWith(".pdf");
const isPlain = (d: DocInfo) => d.mime.startsWith("text/") || /\.(txt|md)$/i.test(d.name);

/** Removes the indexing headers the RAG service adds to each stored passage. */
const clean = (t: string) => t.replace(/^\[(Source|Classification):[^\]]*\]\s*/gim, "").trim();

interface Section {
  page: number | null;
  text: string;
}

/**
 * Stored passages overlap their neighbours (so search doesn't cut ideas in half). For reading, stitch them
 * back into continuous text: drop the repeated overlap, and start a new section when the page changes.
 */
function toSections(chunks: DocChunk[]): Section[] {
  const out: Section[] = [];
  for (const c of chunks) {
    const text = clean(c.text);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.page === c.page) {
      let joined = false;
      for (let k = Math.min(last.text.length, text.length, 600); k >= 25; k--) {
        if (last.text.endsWith(text.slice(0, k))) {
          last.text += text.slice(k);
          joined = true;
          break;
        }
      }
      if (!joined) last.text += "\n\n" + text;
    } else {
      out.push({ page: c.page, text });
    }
  }
  return out;
}

const paths = (role: Role, id: string) =>
  role === "student"
    ? { content: `/students/files/${id}`, text: `/students/files/${id}/text` }
    : { content: `/knowledge-base/files/${id}/content`, text: `/knowledge-base/files/${id}/text` };

export function DocViewer({
  doc,
  role,
  page,
  highlight,
  onClose,
  onAsk,
}: {
  doc: DocInfo;
  role: Role;
  /** Open a PDF at this page (e.g. when following a citation). */
  page?: number | null;
  /** Passage to highlight (the text a cited answer relied on). Opens the text view and scrolls to it. */
  highlight?: string | null;
  onClose: () => void;
  onAsk?: (doc: DocInfo) => void;
}) {
  const pdf = isPdf(doc);
  const plain = isPlain(doc);
  const target = highlight ? clean(highlight) : null;
  const [mark, setMark] = useState<string | null>(target);
  const [view, setView] = useState<"original" | "text">(target || !(pdf || plain) ? "text" : "original");
  const [found, setFound] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocChunk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Load the original file (PDF / plain text) once.
  useEffect(() => {
    if (!pdf && !plain) return;
    let url: string | null = null;
    let cancelled = false;
    fetchBlob(paths(role, doc.id).content)
      .then(async (b) => {
        if (cancelled) return;
        if (pdf) {
          url = URL.createObjectURL(new Blob([b], { type: "application/pdf" }));
          setBlobUrl(url);
        } else {
          setPlainText(await b.text());
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, role, pdf, plain]);

  // Load extracted text when that view is needed.
  useEffect(() => {
    if (view !== "text" || chunks) return;
    let cancelled = false;
    api<{ chunks: DocChunk[] }>(paths(role, doc.id).text)
      .then((r) => !cancelled && setChunks(r.chunks))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [view, chunks, doc.id, role]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const sections = useMemo(() => (chunks ? toSections(chunks) : []), [chunks]);
  // Bring the highlighted passage into view once the text has rendered.
  useEffect(() => {
    if (view !== "text" || !mark || !chunks) return;
    const el = scroller.current?.querySelector("mark[data-hl]");
    setFound(!!el);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [view, mark, chunks, sections]);

  const showTabs = pdf || plain;
  const src = blobUrl ? `${blobUrl}${page && page > 0 ? `#page=${page}` : ""}` : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-0 sm:p-5">
      <motion.div
        className="absolute inset-0 bg-forest-900/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
      />
      <motion.div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Viewing ${doc.name}`}
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-cream-50 shadow-lift outline-none sm:h-[92vh] sm:rounded-2xl sm:border sm:border-cream-300"
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-cream-300 px-4 py-3 sm:px-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-forest-800 text-cream-50"><FileText className="size-4" aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-lg leading-tight text-forest-900">{doc.name}</h2>
            <p className="text-xs text-ink-muted">
              {bytes(doc.sizeBytes)}
              {pdf && page && page > 0 ? ` · opened at page ${page}` : ""}
            </p>
          </div>

          {showTabs && (
            <div role="tablist" aria-label="View mode" className="flex gap-1 rounded-lg bg-cream-200 p-1 text-sm">
              {([["original", "Original"], ["text", "Text"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={view === k}
                  onClick={() => setView(k)}
                  className={cx("relative rounded-md px-3 py-1 font-medium transition-colors", view === k ? "text-cream-50" : "text-ink-soft hover:text-forest-800")}
                >
                  {view === k && <motion.span layoutId="viewer-pill" className="absolute inset-0 rounded-md bg-forest-800" transition={{ type: "spring", stiffness: 460, damping: 36 }} />}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
          )}

          {onAsk && (
            <Button size="sm" onClick={() => { onAsk(doc); onClose(); }}>
              <MessageSquareQuote className="size-4" aria-hidden /> Ask about this document
            </Button>
          )}
          <button onClick={onClose} aria-label="Close viewer" className="rounded-lg p-2 text-ink-muted hover:bg-cream-200 hover:text-ink">
            <X className="size-5" />
          </button>
        </header>

        <div ref={scroller} data-ask-zone data-ask-doc={doc.id} className="min-h-0 flex-1 overflow-y-auto bg-cream-100">
          {error ? (
            <div className="mx-auto max-w-lg p-8"><Notice tone="error">{error}</Notice></div>
          ) : view === "original" && pdf ? (
            src ? (
              <iframe key={src} src={src} title={doc.name} className="size-full border-0 bg-white" />
            ) : (
              <Spinner label="Opening document" />
            )
          ) : view === "original" && plain ? (
            plainText === null ? (
              <Spinner label="Opening document" />
            ) : (
              <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
                <article className="whitespace-pre-wrap rounded-2xl border border-cream-300 bg-white px-6 py-8 font-mono text-[14px] leading-7 text-ink-soft shadow-card sm:px-10 sm:py-10">{plainText}</article>
              </div>
            )
          ) : chunks === null ? (
            <Spinner label="Loading text" />
          ) : sections.length === 0 ? (
            <div className="mx-auto max-w-lg p-8"><Notice tone="warn">No text has been extracted from this document yet.</Notice></div>
          ) : (
            <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
              {mark && found && (
                <div className="sticky top-0 z-10 -mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gold-600/30 bg-gold-100 px-4 py-2.5 text-sm text-[#6e4f10] shadow-card">
                  <span className="font-medium">Highlighted: the passage the answer relied on</span>
                  <span className="ml-auto flex items-center gap-4">
                    {pdf && (
                      <button onClick={() => setView("original")} className="font-semibold underline underline-offset-2 hover:text-ink">
                        Open original{page && page > 0 ? ` at page ${page}` : ""}
                      </button>
                    )}
                    <button onClick={() => { setMark(null); setFound(false); }} className="font-semibold underline underline-offset-2 hover:text-ink">Clear highlight</button>
                  </span>
                </div>
              )}
              {!showTabs && (
                <Notice tone="info" className="mb-5">
                  This file type can&rsquo;t be shown in its original layout here. You&rsquo;re reading the text VTA extracted from it — the same text it uses to answer questions. Headings are detected automatically.
                </Notice>
              )}
              <article className="rounded-2xl border border-cream-300 bg-white px-6 py-8 text-[16px] leading-[1.8] shadow-card sm:px-12 sm:py-12">
                <DocText sections={sections} mark={mark} />
              </article>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
