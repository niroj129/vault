"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMessengerEvents } from "@/lib/messenger";
import type { AgentSummary } from "@/lib/types";

interface Ctx { summary: AgentSummary | null; reload: () => void }
const AgentCtx = createContext<Ctx>({ summary: null, reload: () => {} });
export const useAgentSummary = () => useContext(AgentCtx);

/** The agent's counters, kept fresh while the console is open (and right after anything that changes them). */
export function AgentSummaryProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const reload = useCallback(() => { if (token) apiFetch<AgentSummary>("/agent/summary/", { token }).then(setSummary).catch(() => {}); }, [token]);
  useEffect(() => { reload(); const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);
  useMessengerEvents((ev) => { if (ev.type === "toast" || ev.type === "message") reload(); });
  const value = useMemo(() => ({ summary, reload }), [summary, reload]);
  return <AgentCtx.Provider value={value}>{children}</AgentCtx.Provider>;
}
