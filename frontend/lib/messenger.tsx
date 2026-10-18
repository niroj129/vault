"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast as sonner } from "sonner";
import { useSite } from "@/components/site-context";
import { apiFetch, wsUrl } from "./api";
import { useAuth } from "./auth";
import { registerServiceWorker } from "./push";
import type { ChatMessage } from "./types";

export interface Toast { title: string; text?: string; link?: string; tone?: "ok" | "bad" | "info"; sound?: boolean }
type Listener = (event: SocketEvent) => void;
export type SocketEvent = { type: string; message?: ChatMessage; [k: string]: unknown };

interface MessengerValue {
  enabled: boolean;
  connected: boolean;
  unread: number;
  refreshUnread: () => void;
  send: (data: unknown) => void;
  subscribe: (fn: Listener) => () => void;
  toast: (t: Toast) => void;
}

const MessengerContext = createContext<MessengerValue | null>(null);

/** A soft two-note chime for money events. Browsers only allow sound after the
 * person has interacted with the page; before that it silently does nothing. */
let audioCtx: AudioContext | null = null;
function ding(notes: number[]) {
  try {
    if (localStorage.getItem("sound") === "off") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    notes.forEach((f, i) => {
      const ctx = audioCtx!;
      const t = ctx.currentTime + i * 0.14;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch { /* no audio */ }
}

/**
 * One websocket per tab to /ws/messenger/. Components subscribe to its events
 * with useMessengerEvents(); the provider also keeps the total unread count for
 * the nav badge, and turns money/chat events into toasts. Reconnects with
 * backoff, and pings so proxies don't close an idle connection.
 */
export function MessengerProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const site = useSite();
  const router = useRouter();
  const enabled = Boolean(token && user && site.features?.messenger !== false);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());
  const unreadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((t: Toast) => {
    if (t.sound) ding(t.tone === "bad" ? [440, 330] : [660, 880]);
    const fn = t.tone === "ok" ? sonner.success : t.tone === "bad" ? sonner.error : sonner.info;
    fn(t.title, {
      description: t.text,
      duration: 9000,
      action: t.link ? { label: "Open", onClick: () => router.push(t.link!) } : undefined,
    });
  }, [router]);

  const refreshUnread = useCallback(() => {
    if (!enabled) return;
    clearTimeout(unreadTimer.current);
    unreadTimer.current = setTimeout(() => {
      apiFetch<{ unread: number }>("/messenger/unread/", { token }).then((d) => setUnread(d.unread || 0)).catch(() => {});
    }, 300);
  }, [enabled, token]);

  // keeps push notifications working for browsers that turned them on
  useEffect(() => { if (enabled) void registerServiceWorker(); }, [enabled]);

  useEffect(() => {
    if (!enabled || !token) { setUnread(0); return; }
    let closed = false;
    let retry = 0;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const ws = new WebSocket(wsUrl(`/ws/messenger/?token=${encodeURIComponent(token!)}`));
      socketRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        refreshUnread();
        pingTimer = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 25000);
      };
      ws.onmessage = (e) => {
        let data: SocketEvent;
        try { data = JSON.parse(e.data as string) as SocketEvent; } catch { return; }
        if (data.type === "pong") return;
        if (data.type === "message" || data.type === "read" || data.type === "conversation") refreshUnread();
        if (data.type === "toast") {
          toast({ title: String(data.title || ""), text: data.text as string | undefined, link: data.link as string | undefined,
            tone: data.tone as Toast["tone"], sound: Boolean(data.staff) || data.tone === "ok" });
        }
        const m = data.message;
        const phoneIn = m?.kind === "sms_in"; // a text or WhatsApp from outside the site
        if (data.type === "message" && (m?.sender || phoneIn) && m.sender !== user?.id && m.kind !== "system"
            && !window.location.pathname.includes("/messages")) {
          const base = window.location.pathname.startsWith("/admin") ? "/admin/messages" : "/messages";
          const via = phoneIn ? ` · ${{ whatsapp: "WhatsApp", sendblue: "iMessage" }[m.channel as string] || "SMS"}` : "";
          toast({ title: `${m.sender_name || "New message"}${via}`, text: m.body || "Photo", link: `${base}?c=${m.conversation}`, sound: phoneIn });
        }
        listeners.current.forEach((fn) => fn(data));
      };
      ws.onclose = (e) => {
        clearInterval(pingTimer);
        setConnected(false);
        if (closed || e.code === 4401) return; // logged out / bad token
        retry = Math.min(retry + 1, 6);
        retryTimer = setTimeout(connect, 500 * 2 ** retry);
      };
    }

    connect();
    refreshUnread();
    return () => {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, token, refreshUnread, toast, user?.id]);

  const send = useCallback((data: unknown) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  return (
    <MessengerContext.Provider value={{ enabled, connected, unread, refreshUnread, send, subscribe, toast }}>
      {children}
    </MessengerContext.Provider>
  );
}

const FALLBACK: MessengerValue = {
  enabled: false, connected: false, unread: 0,
  refreshUnread() {}, send() {}, subscribe: () => () => {}, toast() {},
};

export function useMessenger(): MessengerValue {
  return useContext(MessengerContext) || FALLBACK;
}

/** Run `handler` for every websocket event (latest handler always used). */
export function useMessengerEvents(handler: Listener) {
  const { subscribe } = useMessenger();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((d) => ref.current(d)), [subscribe]);
}
