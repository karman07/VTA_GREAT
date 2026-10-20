"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { DEFAULT_LIMITS, type Limits } from "./constants";

let cached: Limits | null = null;

/** Limits as enforced by the server (falls back to the built-in defaults if it is unreachable). */
export function useLimits(): Limits {
  const [limits, setLimits] = useState<Limits>(cached ?? DEFAULT_LIMITS);
  useEffect(() => {
    if (cached) return;
    api<{ limits: Limits }>("/config", { auth: false })
      .then((c) => {
        cached = c.limits;
        setLimits(c.limits);
      })
      .catch(() => undefined);
  }, []);
  return limits;
}
