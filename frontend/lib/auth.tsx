"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "./api";
import type { User } from "./types";

interface AuthValue {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  startSession: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = "tf_token";
const USER_KEY = "tf_user";

function store(token: string | null, user: User | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  } catch { /* private mode: session lasts for this tab only */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem(TOKEN_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t) setToken(t);
      if (u) setUser(JSON.parse(u) as User);
    } catch { /* ignore */ }
    setReady(true);
    // refresh the cached profile (role/permissions may have changed)
    if (t) {
      apiFetch<User>("/auth/me/", { token: t }).then((me) => { store(t, me); setUser(me); }).catch((e) => {
        if (e instanceof ApiError && e.status === 401) { // token revoked or from another site
          store(null, null); setToken(null); setUser(null);
        }
      });
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/auth/login/", { method: "POST", body: { username, password } });
    store(data.token, data.user); setToken(data.token); setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout/", { method: "POST", token }); } catch { /* already gone */ }
    store(null, null); setToken(null); setUser(null);
  }, [token]);

  /** Start a session from a token the API already issued (sign-up). */
  const startSession = useCallback((newToken: string, newUser: User) => {
    store(newToken, newUser); setToken(newToken); setUser(newUser);
  }, []);

  /** Re-read /auth/me/ after the profile changes (photo, name…). */
  const refreshUser = useCallback(async () => {
    if (!token) return null;
    const me = await apiFetch<User>("/auth/me/", { token });
    store(token, me); setUser(me);
    return me;
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout, refreshUser, startSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const isStaff = (u: User | null | undefined) => !!u && (u.role === "admin" || u.role === "agent" || !!u.is_platform_owner);
