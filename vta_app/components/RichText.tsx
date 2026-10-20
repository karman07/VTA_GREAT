import { Fragment } from "react";

const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** Turns simple inline LaTeX like CO_2 or x^2 into readable plain text. */
function plainMath(s: string): string {
  return s
    .replace(/\\(cdot|times)/g, "×")
    .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, "$1")
    .replace(/_\{?(\d+)\}?/g, (_, d: string) => [...d].map((c) => SUB[c]).join(""))
    .replace(/\^\{?(\d+)\}?/g, (_, d: string) => [...d].map((c) => SUP[c]).join(""))
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "");
}

/** Minimal, safe renderer for model answers: paragraphs, lists, **bold**, *italic*, `code`, $math$. No HTML is ever injected. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold text-ink">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-cream-200 px-1.5 py-0.5 font-mono text-[0.88em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("$")) out.push(<span key={k} className="rounded bg-forest-50 px-1.5 py-0.5 font-mono text-[0.9em] text-forest-800">{plainMath(t.slice(1, -1))}</span>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const L = list;
      const Tag = L.ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={`l${blocks.length}`} className={L.ordered ? "list-decimal space-y-1.5 pl-5" : "list-disc space-y-1.5 pl-5"}>
          {L.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>)}
        </Tag>,
      );
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push(<h4 key={`h${blocks.length}`} className="font-display pt-1 text-lg text-forest-900">{inline(heading[1], `h${blocks.length}`)}</h4>);
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-3">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
