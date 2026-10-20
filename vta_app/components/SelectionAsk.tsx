"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareQuote } from "lucide-react";

export interface AskSelection {
  text: string;
  /** Set when the text was selected inside a document viewer. */
  docId: string | null;
}

interface Pop extends AskSelection {
  x: number;
  y: number;
}

const zoneOf = (n: Node | null): HTMLElement | null => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>("[data-ask-zone]") ?? null;

/**
 * Shows a floating "Ask AI" button over text the user selects inside any element marked `data-ask-zone`
 * (chat answers, the document reader). `data-ask-doc="<id>"` on the zone tells us which document it came from.
 */
export function SelectionAsk({ onAsk }: { onAsk: (s: AskSelection) => void }) {
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || text.length < 3) return setPop(null);
      const zone = zoneOf(sel.anchorNode);
      if (!zone || zone !== zoneOf(sel.focusNode)) return setPop(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setPop(null);
      const x = Math.min(Math.max(r.left + r.width / 2, 80), window.innerWidth - 80);
      const below = r.top < 56;
      setPop({ text, docId: zone.dataset.askDoc ?? null, x, y: below ? r.bottom + 8 : r.top - 8 });
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    };
    const hide = () => setPop(null);
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  if (!pop || typeof document === "undefined") return null;
  const above = pop.y > 56;
  return createPortal(
    <button
      type="button"
      // Keep the selection alive while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onAsk({ text: pop.text, docId: pop.docId });
        window.getSelection()?.removeAllRanges();
        setPop(null);
      }}
      style={{ left: pop.x, top: pop.y, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}
      className="pop fixed z-[80] inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-3.5 py-2 text-xs font-semibold text-cream-50 shadow-lift hover:bg-forest-700"
    >
      <MessageSquareQuote className="size-3.5" aria-hidden /> Ask AI about this
    </button>,
    document.body,
  );
}
