"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/lib/cx";

export function CopyButton({ value, label, tone = "light", className }: { value: string; label: string; tone?: "light" | "dark"; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {}
  }
  return (
    <button
      onClick={copy}
      type="button"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        tone === "dark" ? "border-forest-600 bg-forest-800 text-cream-50 hover:bg-forest-700" : "border-cream-400 bg-cream-50 text-forest-800 hover:bg-cream-200",
        className,
      )}
    >
      {done ? <Check className="size-3.5 text-forest-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}
