"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokenStore, type AuthResponse, type Role, type SessionUser } from "./api";

interface AuthState {
  user: SessionUser | null;
  role: Role | null;
  ready: boolean;
  login: (role: Role, email: string, password: string) => Promise<void>;
  signup: (role: Role, v: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const USER_KEY = "vta-user";

const roleOf = (u: SessionUser): Role => (u.role === "student" ? "student" : "teacher");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = tokenStore.get();
      if (!token) return setReady(true);
      try {
        const raw = localStorage.getItem(USER_KEY);
        const cachedUser: SessionUser | null = raw ? JSON.parse(raw) : null;
        if (cachedUser && !cancelled) setUser(cachedUser);
        // Students are validated by their first API call (a 401 signs them out);
        // teachers are verified here, which also refreshes the cached profile.
        if (cachedUser?.role === "student") return;
        const me = await api<SessionUser>("/auth/me");
        if (!cancelled && me) {
          const u = { id: me.id, email: me.email, name: me.name, role: me.role };
          setUser(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        }
      } catch {
        if (!cancelled && !localStorage.getItem(USER_KEY)) tokenStore.clear();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    const onUnauthorized = () => {
      localStorage.removeItem(USER_KEY);
      setUser(null);
    };
    window.addEventListener("vta-unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("vta-unauthorized", onUnauthorized);
    };
  }, []);

  const accept = useCallback((res: AuthResponse) => {
    tokenStore.set(res.accessToken);
    const u = { id: res.user.id, email: res.user.email, name: res.user.name, role: res.user.role };
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const login = useCallback(
    async (role: Role, email: string, password: string) => {
      const path = role === "student" ? "/students/login" : "/auth/login";
      accept(await api<AuthResponse>(path, { body: { email, password }, auth: false }));
    },
    [accept],
  );

  const signup = useCallback(
    async (role: Role, v: { name: string; email: string; password: string }) => {
      const path = role === "student" ? "/students/register" : "/auth/register";
      accept(await api<AuthResponse>(path, { body: { ...v, acceptTerms: true }, auth: false }));
    },
    [accept],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {}
    setUser(null);
    router.push("/");
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, role: user ? roleOf(user) : null, ready, login, signup, logout }),
    [user, ready, login, signup, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Client-side route guard: sends visitors to the right sign-in, and wrong-role users to their home. */
export function useRequireRole(role: Role) {
  const { user, role: actual, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/${role}/login`);
    else if (actual !== role) router.replace(`/${actual}`);
  }, [ready, user, actual, role, router]);
  return { user, ready: ready && !!user && actual === role };
}
