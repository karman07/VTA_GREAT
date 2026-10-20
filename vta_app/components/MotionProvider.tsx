"use client";

import { MotionConfig } from "motion/react";

/** Makes every JS animation honour the user's "reduce motion" setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
