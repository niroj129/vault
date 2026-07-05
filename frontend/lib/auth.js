"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("tf_token");
    const u = localStorage.getItem("tf_user");
    if (t) setToken(t);
    if (u) setUser(JSON.parse(u));
    setReady(true);
  }, []);

  async function login(username, password) {
    const data = await apiFetch("/auth/login/", {
      method: "POST",
      body: { username, password },
    });
    localStorage.setItem("tf_token", data.token);
    localStorage.setItem("tf_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout/", { method: "POST", token });
    } catch {}
    localStorage.removeItem("tf_token");
    localStorage.removeItem("tf_user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
