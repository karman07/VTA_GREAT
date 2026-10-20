"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Check, Eye, EyeOff, GraduationCap, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { LogoMark } from "./Logo";
import { Button, Field, Notice } from "./ui";
import { cx, btnClass } from "@/lib/cx";
import { useAuth } from "@/lib/auth";
import { useLimits } from "@/lib/config";
import type { ApiError, Role } from "@/lib/api";

type Mode = "login" | "signup";
interface OpenOpts {
  role?: Role;
  mode?: Mode;
  /** Hide the Teacher/Student switch (e.g. when joining a class via invite link). */
  lockRole?: boolean;
}

const Ctx = createContext<{ open: (o?: OpenOpts) => void; close: () => void } | null>(null);
export const useAuthDialog = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuthDialog outside AuthDialogProvider");
  return v;
};

const AUTH_ROUTE = /^\/((teacher|student)\/)?(login|signup)$/;

const COPY = {
  teacher: {
    Icon: BookOpenCheck,
    quote: "Upload your notes once. Let VTA answer the same questions for every student, with citations.",
    points: (l: ReturnType<typeof useLimits>) => [
      `Create up to ${l.teacherMaxSubjects} subjects`,
      `Add up to ${l.teacherMaxDocsPerSubject} documents to each subject`,
      "Share a class code — students join in seconds",
      "See which questions your class is asking",
    ],
  },
  student: {
    Icon: GraduationCap,
    quote: "Ask your course materials anything. Every answer points back to where it came from.",
    points: (l: ReturnType<typeof useLimits>) => [
      "Join a class with your teacher's code",
      `${l.studentMaxQuestionsPerSubject} questions in each class you join`,
      "Answers grounded in your teacher's materials",
      "Your full chat history is always kept",
    ],
  },
} as const;

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ open: boolean; role: Role; mode: Mode; lockRole: boolean }>({
    open: false,
    role: "student",
    mode: "login",
    lockRole: false,
  });

  const open = useCallback((o: OpenOpts = {}) => {
    setState((s) => ({ open: true, role: o.role ?? s.role, mode: o.mode ?? "login", lockRole: !!o.lockRole }));
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    // Closing a dialog that was opened by a /login-style URL returns to the home page.
    if (AUTH_ROUTE.test(window.location.pathname)) router.replace("/");
  }, [router]);

  // Close after a successful sign-in: the caller navigates to the dashboard, so no "return home".
  const done = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {state.open && <AuthDialog key="auth-dialog" role={state.role} mode={state.mode} lockRole={state.lockRole} onClose={close} onDone={done} />}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** Opens the dialog from a button styled like any other button. */
export function AuthButton({
  role,
  mode = "login",
  lockRole,
  variant = "primary",
  size = "md",
  className,
  children,
}: OpenOpts & {
  variant?: "primary" | "secondary" | "ghost" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useAuthDialog();
  return (
    <button type="button" onClick={() => open({ role, mode, lockRole })} className={btnClass(variant, size, className)}>
      {children}
    </button>
  );
}

/** Same trigger, styled as an inline text link. */
export function AuthTextButton({ role, mode = "login", children, className }: OpenOpts & { children: React.ReactNode; className?: string }) {
  const { open } = useAuthDialog();
  return (
    <button type="button" onClick={() => open({ role, mode })} className={className}>
      {children}
    </button>
  );
}

/** Rendered by /login, /signup, /teacher/login … : opens the dialog (or skips ahead if already signed in). */
export function OpenAuthOnMount({ role, mode }: { role?: Role; mode: Mode }) {
  const { open } = useAuthDialog();
  const { user, role: current, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (user) router.replace(`/${current}`);
    else open({ role, mode });
  }, [ready, user, current, role, mode, open, router]);
  return null;
}

function AuthDialog({ role: initialRole, mode: initialMode, lockRole, onClose, onDone }: { role: Role; mode: Mode; lockRole: boolean; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const limits = useLimits();
  const [role, setRole] = useState<Role>(initialRole);
  const [mode, setMode] = useState<Mode>(initialMode);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<{ name?: string; email?: string; password?: string }>({});

  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Focus first field, Escape closes, Tab stays inside the dialog, page scroll locked.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = panel.current;
    el?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled])")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  function reset(next: { role?: Role; mode?: Mode }) {
    if (next.role) setRole(next.role);
    if (next.mode) setMode(next.mode);
    setError(null);
    setFe({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: typeof fe = {};
    if (mode === "signup" && name.trim().length < 2) errs.name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (mode === "signup" && password.length < limits.minPasswordLength) errs.password = `Use at least ${limits.minPasswordLength} characters.`;
    if (mode === "login" && !password) errs.password = "Enter your password.";
    setFe(errs);
    if (Object.keys(errs).length) return;
    if (mode === "signup" && !agree) {
      setError("Please confirm you are at least 13 and accept the Terms of Service and Privacy Policy.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(role, email.trim(), password);
      else await signup(role, { name: name.trim(), email: email.trim(), password });
      router.replace(`/${role}`);
      onDone();
    } catch (err) {
      const ex = err as ApiError;
      setError(
        ex.status === 401
          ? `Incorrect email or password for a ${role} account. ${role === "teacher" ? "Student? Switch to the Student tab." : "Teacher? Switch to the Teacher tab."}`
          : ex.status === 409
            ? "An account with this email already exists. Try signing in instead."
            : ex.message,
      );
      setBusy(false);
    }
  }

  const c = COPY[role];
  const titleId = "auth-dialog-title";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <motion.div
        className="absolute inset-0 bg-forest-900/55 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 36, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.9 }}
        className="relative grid max-h-[100dvh] w-full max-w-[900px] overflow-hidden rounded-t-3xl border border-cream-300 bg-cream-50 shadow-[0_30px_80px_-20px_rgba(13,42,30,0.6)] sm:max-h-[92vh] sm:rounded-3xl md:grid-cols-[0.85fr_1fr]"
      >
        {/* Brand panel */}
        <aside className="relative hidden overflow-hidden bg-forest-900 p-9 text-cream-50 md:flex md:flex-col md:justify-between">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#faf6ec 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="float-a pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-forest-700/40 blur-3xl" />
          <div className="float-b pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-forest-600/25 blur-3xl" />
          <div className="relative flex items-center gap-2.5">
            <LogoMark className="size-9" />
            <span className="font-display text-xl font-semibold">VTA</span>
          </div>
          <div key={role} className="relative">
            <p className="rise font-display text-[1.65rem] leading-snug">{c.quote}</p>
            <ul className="mt-7 space-y-3">
              {c.points(limits).map((p, i) => (
                <li key={p} className="stagger flex items-start gap-3 text-sm text-forest-100" style={{ "--i": i + 2 } as React.CSSProperties}>
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest-600/70"><Check className="size-3" aria-hidden /></span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-forest-300">Independently hosted beta · not connected to any learning management system</p>
        </aside>

        {/* Form */}
        <div className="relative min-h-0 overflow-y-auto p-6 sm:p-9">
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-2 text-ink-muted transition-colors hover:bg-cream-200 hover:text-ink">
            <X className="size-5" />
          </button>

          {/* Role switch */}
          {!lockRole ? (
            <LayoutGroup id="role-switch">
              <div role="tablist" aria-label="Account type" className="mr-10 grid grid-cols-2 gap-1 rounded-xl bg-cream-200 p-1">
                {(["student", "teacher"] as const).map((r) => {
                  const Icon = COPY[r].Icon;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={role === r}
                      onClick={() => reset({ role: r })}
                      className={cx("relative flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors", role === r ? "text-cream-50" : "text-ink-soft hover:text-forest-800")}
                    >
                      {role === r && (
                        <motion.span layoutId="role-pill" className="absolute inset-0 rounded-lg bg-forest-800 shadow-sm" transition={{ type: "spring", stiffness: 460, damping: 36 }} />
                      )}
                      <span className="relative flex items-center gap-2"><Icon className="size-4" aria-hidden /> {r}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          ) : (
            <div className="mr-10 inline-flex items-center gap-2 text-sm font-semibold text-forest-700">
              <GraduationCap className="size-3.5" aria-hidden /> Student account
            </div>
          )}

          <h2 id={titleId} key={`${role}-${mode}`} className="rise font-display mt-6 text-3xl text-forest-900">
            {mode === "login" ? "Welcome back" : `Create your ${role} account`}
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            {mode === "login"
              ? `Sign in to your ${role} account.`
              : role === "teacher"
                ? "Build a classroom assistant from your own materials."
                : "Join your classes and start asking questions."}
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            {error && <Notice key={error} tone="error">{error}</Notice>}
            {mode === "signup" && (
              <Field label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} placeholder="Your name" />
            )}
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fe.email} placeholder="you@school.edu" />
            <div className="relative">
              <Field
                label="Password"
                type={show ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fe.password}
                hint={mode === "signup" ? `At least ${limits.minPasswordLength} characters.` : undefined}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2.5 top-[34px] rounded-md p-1.5 text-ink-muted hover:text-forest-700">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300 bg-white/70 p-3.5 text-[13px] leading-relaxed text-ink-soft">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#133d2b]" />
                <span>
                  I am at least 13 years old and I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-forest-700 underline underline-offset-2">Terms of Service</Link> and{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-forest-700 underline underline-offset-2">Privacy Policy</Link>.
                </span>
              </label>
            )}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-muted">
            {mode === "login" ? (
              <>New to VTA? <button type="button" onClick={() => reset({ mode: "signup" })} className="font-medium text-forest-700 hover:underline">Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => reset({ mode: "login" })} className="font-medium text-forest-700 hover:underline">Sign in</button></>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
