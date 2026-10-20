"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { cx } from "@/lib/cx";

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Delay in ms, for staggering siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} className={cx("reveal", inView && "in", className)} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </Component>
  );
}

/** Counts up to `value` when it first appears. Renders the final value immediately for reduced motion. */
export function CountUp({ value, duration = 1.1, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    // Reduced motion: jump straight to the final value (zero-length animation).
    const controls = animate(0, value, {
      duration: reduce ? 0 : duration,
      ease: [0.22, 0.8, 0.2, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);
  return (
    <span ref={ref} className={cx("tabular-nums", className)}>
      {shown}
    </span>
  );
}

/** True one frame after mount, so CSS transitions (e.g. a meter filling up) have a start state to animate from. */
export function useMountedFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}
