import { useMemo } from "react";

/**
 * Extracted document text has no formatting, so structure is inferred from the text itself:
 * an ALL-CAPS first line is the title, ALL-CAPS (optionally numbered) lines are section headings,
 * short Title-Case lines are sub-headings, and "1.1 …" / "(a) …" lines are hanging clauses.
 */
type Block =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "h1"; num: string | null; text: string }
  | { kind: "h2"; text: string }
  | { kind: "clause"; num: string; depth: number; text: string }
  | { kind: "item"; label: string; text: string }
  | { kind: "p"; text: string };

const SMALL = new Set(["of", "and", "the", "for", "to", "in", "on", "a", "an", "or", "with", "by"]);
const isCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();

function classify(raw: string, first: boolean, seenH1: boolean): Block {
  const text = raw.replace(/\t+/g, " ").replace(/[ ]{2,}/g, " ").trim();
  const oneLine = !raw.includes("\n");

  // Numbered clause: 1.1, 3.2.1 …
  const clause = /^(\d+(?:\.\d+)+)\.?\s+([\s\S]+)$/.exec(text);
  if (clause) return { kind: "clause", num: clause[1], depth: clause[1].split(".").length - 1, text: clause[2] };

  // Lettered / roman item: (a) …  (iv) …
  const item = /^(\([a-z]{1,4}\)|\([ivxIVX]+\))\s+([\s\S]+)$/.exec(text);
  if (item) return { kind: "item", label: item[1], text: item[2] };

  if (oneLine && text.length <= 100 && !/[.;,]$/.test(text)) {
    const numbered = /^(\d+[.)])\s+(.+)$/.exec(text);
    const body = numbered ? numbered[2] : text;
    if (isCaps(body)) {
      if (first && !numbered) return { kind: "title", text };
      return { kind: "h1", num: numbered ? numbered[1] : null, text: body };
    }
    const words = body.split(/\s+/);
    const titleCase = words.every((w) => SMALL.has(w.toLowerCase()) || /^[A-Z0-9(]/.test(w));
    // One or two Title-Case words ("Parties", "Annexure A") are headings, even before the first numbered section.
    if (words.length <= 2 && titleCase && body.length <= 32) return { kind: "h2", text };
    if (!seenH1 && !first) return { kind: "subtitle", text };
    if (words.length <= 6 && body.length <= 48 && words.every((w) => SMALL.has(w.toLowerCase()) || /^[A-Z0-9(]/.test(w))) {
      return { kind: "h2", text: numbered ? text : body };
    }
  }
  return { kind: "p", text };
}

/** Collapse whitespace and lowercase, remembering where each normalized char came from. */
function norm(text: string) {
  const chars: string[] = [];
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!prevSpace) { chars.push(" "); map.push(i); prevSpace = true; }
    } else {
      chars.push(c.toLowerCase());
      map.push(i);
      prevSpace = false;
    }
  }
  return { s: chars.join("").trimEnd(), map };
}

/** Character ranges of `text` that belong to the cited passage `target` (may span several paragraphs). */
function markRange(text: string, target: string): [number, number] | null {
  const t = norm(target).s;
  const b = norm(text);
  if (t.length < 8 || b.s.length < 8) return null;
  const end = (i: number) => (b.map[i] ?? text.length - 1) + 1;
  // 1. the whole passage sits inside this block
  let i = b.s.indexOf(t);
  if (i >= 0) return [b.map[i], end(i + t.length - 1)];
  // 2. the whole block sits inside the passage (passage spans several blocks)
  if (b.s.length >= 12 && t.includes(b.s)) return [0, text.length];
  // 3. passage starts inside this block and continues after it
  const head = t.slice(0, Math.min(40, t.length));
  i = b.s.indexOf(head);
  if (i >= 0) return [b.map[i], text.length];
  // 4. passage ends inside this block
  const tail = t.slice(-Math.min(40, t.length));
  i = b.s.indexOf(tail);
  if (i >= 0) return [0, end(i + tail.length - 1)];
  return null;
}

function Marked({ text, mark }: { text: string; mark?: string | null }) {
  const r = mark ? markRange(text, mark) : null;
  if (!r) return <>{text}</>;
  return (
    <>
      {text.slice(0, r[0])}
      <mark data-hl className="rounded-[3px] bg-gold-100 px-0.5 text-ink shadow-[0_0_0_2px_var(--color-gold-100)] [box-decoration-break:clone]">
        {text.slice(r[0], r[1])}
      </mark>
      {text.slice(r[1])}
    </>
  );
}

interface Group {
  page: number | null;
  blocks: Block[];
}

function buildGroups(sections: { page: number | null; text: string }[]): Group[] {
  let first = true;
  let seenH1 = false;
  return sections.map((s) => ({
    page: s.page,
    blocks: s.text
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map((para) => {
        const b = classify(para, first, seenH1);
        first = false;
        if (b.kind === "h1") seenH1 = true;
        return b;
      }),
  }));
}

function BlockView({ b, mark }: { b: Block; mark?: string | null }) {
  switch (b.kind) {
    case "title":
      return (
        <h1 className="font-display border-b-2 border-forest-800 pb-3 text-[2rem] font-bold leading-tight tracking-tight text-forest-900">
          <Marked text={b.text} mark={mark} />
        </h1>
      );
    case "subtitle":
      return <p className="text-lg font-semibold leading-snug text-forest-700"><Marked text={b.text} mark={mark} /></p>;
    case "h1":
      return (
        <h2 className="font-display mt-10 flex items-baseline gap-3 border-b border-cream-300 pb-2 text-[1.35rem] font-bold leading-snug text-forest-900">
          {b.num && <span className="shrink-0 text-forest-500">{b.num}</span>}
          <span><Marked text={b.text} mark={mark} /></span>
        </h2>
      );
    case "h2":
      return <h3 className="font-display mt-8 text-[1.2rem] font-bold text-forest-900"><Marked text={b.text} mark={mark} /></h3>;
    case "clause":
      return (
        <div className="grid grid-cols-[3.25rem_1fr] gap-x-2" style={{ paddingLeft: `${b.depth * 1.5}rem` }}>
          <span className="pt-px font-semibold tabular-nums text-forest-700">{b.num}</span>
          <p className="whitespace-pre-wrap text-ink-soft"><Marked text={b.text} mark={mark} /></p>
        </div>
      );
    case "item":
      return (
        <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 pl-[3.5rem]">
          <span className="font-semibold text-forest-700">{b.label}</span>
          <p className="whitespace-pre-wrap text-ink-soft"><Marked text={b.text} mark={mark} /></p>
        </div>
      );
    default:
      return <p className="whitespace-pre-wrap text-ink-soft"><Marked text={b.text} mark={mark} /></p>;
  }
}

export function DocText({ sections, mark }: { sections: { page: number | null; text: string }[]; mark?: string | null }) {
  const groups = useMemo(() => buildGroups(sections), [sections]);
  return (
    <div className="space-y-8">
      {groups.map((g, gi) => (
        <section key={gi}>
          {g.page && (
            <div className="mb-5 flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">Page {g.page}</span>
              <span className="h-px flex-1 bg-cream-300" />
            </div>
          )}
          <div className="space-y-4">
            {g.blocks.map((b, i) => (
              <BlockView key={i} b={b} mark={mark} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
