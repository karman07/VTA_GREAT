"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useMountedFlag } from "./motion";
import { FileText } from "lucide-react";

const QUESTION = "What does Newton’s second law say?";
const ANSWER =
  "Force equals mass times acceleration (F = ma). A larger force on the same mass produces a larger acceleration.";
const SOURCES = ["lecture-notes.pdf · p. 4", "mechanics.docx"];

type Phase = "ask" | "think" | "answer" | "sources" | "hold";

/** A looping, scripted preview of the product: question types in, VTA thinks, answers, cites. */
export function HeroDemo() {
  const reduce = useReducedMotion();
  // Only switch to the static view after hydration, so server and client first render identically.
  const mounted = useMountedFlag();
  const [phase, setPhase] = useState<Phase>("ask");
  const [q, setQ] = useState(0);
  const [a, setA] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    let i = 0;
    const step = () => {
      if (phase === "ask") {
        if (i < QUESTION.length) { i++; setQ(i); t = setTimeout(step, 38 + Math.random() * 30); }
        else t = setTimeout(() => setPhase("think"), 450);
      } else if (phase === "think") {
        t = setTimeout(() => setPhase("answer"), 1100);
      } else if (phase === "answer") {
        if (i < ANSWER.length) { i = Math.min(ANSWER.length, i + 2); setA(i); t = setTimeout(step, 24); }
        else t = setTimeout(() => setPhase("sources"), 250);
      } else if (phase === "sources") {
        t = setTimeout(() => setPhase("hold"), 700);
      } else {
        t = setTimeout(() => { setQ(0); setA(0); setRun((r) => r + 1); setPhase("ask"); }, 4200);
      }
    };
    t = setTimeout(step, phase === "ask" && run === 0 ? 900 : 120);
    return () => clearTimeout(t);
  }, [phase, reduce, run]);

  const full = mounted && !!reduce;
  const qText = full ? QUESTION : QUESTION.slice(0, q);
  const aText = full ? ANSWER : ANSWER.slice(0, a);
  const showQ = full || q > 0;
  const showThinking = !full && phase === "think";
  const showA = full || phase === "answer" || phase === "sources" || phase === "hold";
  const showSources = full || phase === "sources" || phase === "hold";
  const left = showSources ? 6 : 7;

  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-lift">
      <div className="mb-4 flex items-center justify-between border-b border-cream-300 pb-3">
        <div>
          <div className="font-display text-lg text-forest-900">Physics 101</div>
          <div className="text-xs text-ink-muted">Example class · 3 documents</div>
        </div>
        <span key={left} className="pop text-xs font-semibold text-forest-700">Example · {left} of 10 left</span>
      </div>

      <div className="min-h-[15.5rem] space-y-3 text-sm">
        {showQ && (
          <div key={`q${run}`} className="msg-user ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest-800 px-4 py-2.5 text-cream-50">
            {qText}
            {!full && phase === "ask" && <span className="caret !bg-cream-50" aria-hidden />}
          </div>
        )}
        {showThinking && (
          <div className="msg-bot flex w-fit gap-1 rounded-2xl rounded-bl-md border border-cream-300 bg-white px-4 py-3.5" aria-label="VTA is thinking">
            <span className="dot size-2 rounded-full bg-forest-500" /><span className="dot size-2 rounded-full bg-forest-500" /><span className="dot size-2 rounded-full bg-forest-500" />
          </div>
        )}
        {showA && (
          <div key={`a${run}`} className="msg-bot max-w-[92%] rounded-2xl rounded-bl-md border border-cream-300 bg-white px-4 py-3 leading-relaxed text-ink">
            <span className={!full && phase === "answer" ? "caret" : undefined}>{aText}</span>
            {showSources && (
              <div className="mt-3 flex flex-wrap gap-2">
                {SOURCES.map((s, i) => (
                  <span key={s} className="pop inline-flex items-center gap-1.5 rounded-lg bg-forest-50 px-2.5 py-1 text-xs text-forest-800" style={{ animationDelay: `${i * 140}ms` }}>
                    <FileText className="size-3" /> {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
