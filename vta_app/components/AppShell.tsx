"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, FileText, Shield } from "lucide-react";
import { Logo } from "./Logo";
import { Badge, Spinner } from "./ui";
import { useAuth, useRequireRole } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/api";

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2.5 hover:bg-cream-200"
      >
        <span className="grid size-8 place-items-center rounded-full bg-forest-800 text-xs font-semibold text-cream-50">{initials(user.name, user.email)}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-ink sm:block">{user.name || user.email}</span>
        <ChevronDown className="size-4 text-ink-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="rise absolute right-0 z-50 mt-2 w-64 rounded-xl border border-cream-300 bg-cream-50 p-1.5 shadow-lift">
          <div className="border-b border-cream-300 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <Link role="menuitem" href="/terms" target="_blank" className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-cream-200">
            <FileText className="size-4" aria-hidden /> Terms of Service
          </Link>
          <Link role="menuitem" href="/privacy" target="_blank" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-cream-200">
            <Shield className="size-4" aria-hidden /> Privacy Policy
          </Link>
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger-600 hover:bg-danger-100">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ role, children, wide }: { role: Role; children: React.ReactNode; wide?: boolean }) {
  const { ready } = useRequireRole(role);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-cream-300 bg-cream-50/90 backdrop-blur-md">
        <div className={`mx-auto flex h-16 items-center justify-between px-5 ${wide ? "max-w-[96rem]" : "max-w-6xl"}`}>
          <div className="flex items-center gap-4">
            <Logo href={`/${role}`} />
            <Badge tone={role === "teacher" ? "green" : "gold"} className="hidden border-l border-cream-400 pl-4 capitalize sm:inline-flex">{role}</Badge>
          </div>
          <UserMenu />
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-5 py-8 ${wide ? "max-w-[96rem]" : "max-w-6xl"}`}>
        {ready ? children : <Spinner label="Loading your workspace" />}
      </main>
    </div>
  );
}
