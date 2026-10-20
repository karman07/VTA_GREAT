import Link from "next/link";
import { cx } from "@/lib/cx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#133d2b" />
      <path d="M8 22V12.5L16 8l8 4.5V22" fill="none" stroke="#faf6ec" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M12 22v-5.5c0-1 .8-1.8 1.8-1.8h4.4c1 0 1.8.8 1.8 1.8V22" fill="#faf6ec" opacity=".92" />
      <circle cx="16" cy="12.6" r="1.4" fill="#d9a843" />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="logo-hover inline-flex items-center gap-2.5" aria-label="VTA home">
      <LogoMark />
      <span className="leading-none">
        <span className={cx("font-display block text-xl font-semibold", tone === "dark" ? "text-forest-900" : "text-cream-50")}>VTA</span>
        <span className={cx("hidden text-[10px] font-medium uppercase tracking-[0.14em] min-[480px]:block", tone === "dark" ? "text-ink-muted" : "text-forest-200")}>
          Virtual Teaching Assistant
        </span>
      </span>
    </Link>
  );
}
