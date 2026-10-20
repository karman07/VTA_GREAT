"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMountedFlag } from "./motion";
import { Loader2, X, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cx, btnClass } from "@/lib/cx";


/* ── Button ─────────────────────────────────────────────────────────────── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "light";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || loading} className={btnClass(variant, size, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ── Surfaces ───────────────────────────────────────────────────────────── */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-2xl border border-cream-300 bg-cream-50 shadow-card transition-[transform,box-shadow,border-color] duration-300", className)}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "green",
  children,
  className,
}: {
  tone?: "green" | "gold" | "red" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    green: "text-forest-700",
    gold: "text-gold-600",
    red: "text-danger-600",
    neutral: "text-ink-muted",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ── Forms ──────────────────────────────────────────────────────────────── */
type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };

export function Field({ label, hint, error, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input
        id={fid}
        {...rest}
        aria-invalid={!!error}
        aria-describedby={hint || error ? `${fid}-d` : undefined}
        className={cx(
          "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 transition-colors",
          error ? "border-danger-600" : "border-cream-400 hover:border-forest-300 focus:border-forest-500",
        )}
      />
      {(hint || error) && (
        <p id={`${fid}-d`} className={cx("mt-1.5 text-xs", error ? "text-danger-600" : "text-ink-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* ── Feedback ───────────────────────────────────────────────────────────── */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: React.ReactNode;
  className?: string;
}) {
  const map = {
    info: { cls: "bg-forest-50 border-forest-200 text-forest-800", Icon: Info },
    success: { cls: "bg-forest-50 border-forest-300 text-forest-800", Icon: CheckCircle2 },
    warn: { cls: "bg-gold-100 border-[#e5d3a0] text-[#6e4f10]", Icon: AlertTriangle },
    error: { cls: "bg-danger-100 border-[#e8bfb7] text-danger-600", Icon: AlertTriangle },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", tone === "error" ? "shake" : "pop", map.cls, className)}>
      <map.Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="rise flex flex-col items-center rounded-2xl border border-dashed border-cream-400 bg-cream-50/60 px-6 py-12 text-center">
      <div className="pop mb-4 grid size-12 place-items-center rounded-full bg-forest-100 text-forest-700 [animation-delay:150ms]">{icon}</div>
      <h3 className="font-display text-xl text-forest-900">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{children}</div>}
    </div>
  );
}

/* ── Skeletons ──────────────────────────────────────────────────────────── */
export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cx("grid gap-5 md:grid-cols-2 lg:grid-cols-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stagger rounded-2xl border border-cream-300 bg-cream-50 p-6 shadow-card" style={{ "--i": i } as React.CSSProperties}>
          <div className="skeleton h-7 w-2/3" />
          <div className="skeleton mt-5 h-9 w-1/2" />
          <div className="skeleton mt-6 h-2 w-full" />
          <div className="skeleton mt-4 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stagger flex items-center gap-4 rounded-2xl border border-cream-300 bg-cream-50 p-4" style={{ "--i": i } as React.CSSProperties}>
          <div className="skeleton size-11 shrink-0" />
          <div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/2" /><div className="skeleton h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

/* ── Usage meter ────────────────────────────────────────────────────────── */
export function Meter({ used, max, label, compact }: { used: number; max: number; label?: string; compact?: boolean }) {
  const mounted = useMountedFlag();
  const pct = mounted ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const full = used >= max;
  const near = !full && used / max >= 0.8;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="text-ink-soft">{label}</span>
          <span className={cx("tabular-nums font-medium", full ? "text-danger-600" : "text-forest-800")}>
            {used} / {max}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        aria-label={label}
        className={cx("overflow-hidden rounded-full bg-cream-300", compact ? "h-1.5" : "h-2")}
      >
        <div
          className={cx("h-full rounded-full transition-[width,background-color] duration-[900ms] ease-[cubic-bezier(0.22,0.8,0.2,1)]", full ? "bg-danger-600" : near ? "bg-gold-600" : "bg-forest-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Focus the first field if there is one, otherwise the dialog itself — only once, on open.
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([aria-label='Close'])");
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            className="absolute inset-0 bg-forest-900/45 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-md rounded-2xl border border-cream-300 bg-cream-50 p-6 shadow-lift outline-none"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted hover:bg-cream-200">
              <X className="size-4" />
            </button>
            <h2 className="font-display pr-8 text-2xl text-forest-900">{title}</h2>
            <div className="mt-3">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
