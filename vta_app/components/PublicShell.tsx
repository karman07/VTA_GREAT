"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { btnClass } from "@/lib/cx";
import { AuthButton, AuthTextButton } from "./AuthDialog";
import { useAuth } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/constants";

export function PublicNav() {
  const { user, role, ready } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-cream-300/70 bg-cream-100/85 backdrop-blur-md [animation:rise_0.6s_var(--ease-out)_backwards]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex" aria-label="Main">
          <Link href="/#how" className="hover:text-forest-700">How it works</Link>
          <Link href="/#limits" className="hover:text-forest-700">Usage limits</Link>
          <Link href="/terms" className="hover:text-forest-700">Terms</Link>
          <Link href="/privacy" className="hover:text-forest-700">Privacy</Link>
        </nav>
        <div className="flex items-center gap-2">
          {ready && user ? (
            <Link href={`/${role}`} className={btnClass("primary", "sm")}>Open dashboard</Link>
          ) : (
            <>
              <AuthButton mode="login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</AuthButton>
              <AuthButton mode="signup" size="sm">Get started</AuthButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-cream-300 bg-cream-200/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            VTA is an independently hosted beta platform and is not connected to any learning management system.
          </p>
        </div>
        <div className="flex gap-12 text-sm">
          <div className="flex flex-col gap-2.5">
            <span className="font-medium text-forest-900">Account</span>
            <AuthTextButton role="teacher" mode="login" className="text-left text-ink-muted hover:text-forest-700">Teacher sign in</AuthTextButton>
            <AuthTextButton role="student" mode="login" className="text-left text-ink-muted hover:text-forest-700">Student sign in</AuthTextButton>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-medium text-forest-900">Legal</span>
            <Link href="/terms" className="text-ink-muted hover:text-forest-700">Terms of Service</Link>
            <Link href="/privacy" className="text-ink-muted hover:text-forest-700">Privacy Policy</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink-muted hover:text-forest-700">Contact</a>
          </div>
        </div>
      </div>
      <div className="border-t border-cream-300 py-4 text-center text-xs text-ink-muted">
        © {new Date().getFullYear()} VTA — Virtual Teaching Assistant. Beta.
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
