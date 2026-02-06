"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { AuthSession } from "@/lib/auth-store";
import { clearSession, loadSession, saveSession } from "@/lib/auth-store";
import { apiGet, apiPost, DEFAULT_TENANT } from "@/lib/api";

type AuthContextValue = {
  session: AuthSession | null;
  token: string | null;
  tenantSlug: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  ensureMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth() должен использоваться внутри <AuthProvider/>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Сразу читаем localStorage, чтобы защищённые страницы не редиректили на /admin/login
  // до того, как React успеет выполнить useEffect.
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const tenantSlug = DEFAULT_TENANT;

  const token = session?.accessToken ?? null;

  async function login(email: string, password: string) {
    const resp = await apiPost<AuthSession>("/auth/login", { email, password }, { tenantSlug });
    saveSession(resp);
    setSession(resp);
  }

  async function logout() {
    try {
      const s = loadSession();
      if (s?.refreshToken) {
        await apiPost("/auth/logout", { refreshToken: s.refreshToken }, { tenantSlug });
      }
    } catch {
      // ignore
    } finally {
      clearSession();
      setSession(null);
    }
  }

  async function refresh() {
    const s = loadSession();
    if (!s?.refreshToken) throw new Error("Нет refreshToken");
    const resp = await apiPost<AuthSession>("/auth/refresh", { refreshToken: s.refreshToken }, { tenantSlug });
    saveSession(resp);
    setSession(resp);
  }

  async function ensureMe() {
    const s = loadSession();
    if (!s?.accessToken) throw new Error("Нет accessToken");
    try {
      await apiGet("/me", { token: s.accessToken, tenantSlug });
    } catch {
      await refresh();
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ session, token, tenantSlug, login, logout, refresh, ensureMe }),
    [session, token, tenantSlug]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
