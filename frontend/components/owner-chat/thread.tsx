"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";
import { cn } from "@/lib/utils";

export interface OwnerMsg { id: number; from_owner: boolean; body: string; created_at: string; read: boolean; sender: string }

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/** One private chat. `path` is the API path (site side or per-site on the owner side); `mine` = which side I'm on. */
export function OwnerThread({ path, mine, label, empty, onRead, siteId }: {
  path: string; mine: "owner" | "site"; label: string; empty: string; onRead?: () => void; siteId?: number;
}) {
  const { token } = useAuth();
  const [msgs, setMsgs] = useState<OwnerMsg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLOListElement>(null);
  const last = useRef(0);
  const stick = useRef(true);

  const merge = useCallback((incoming: OwnerMsg[]) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const have = new Set((cur || []).map((m) => m.id));
      const add = incoming.filter((m) => !have.has(m.id));
      return add.length || !cur ? [...(cur || []), ...add].sort((a, b) => a.id - b.id) : cur;
    });
    last.current = Math.max(last.current, ...incoming.map((m) => m.id));
  }, []);

  const markRead = useCallback(() => { apiFetch(`${path}read/`, { method: "POST", token }).then(() => { onRead?.(); window.dispatchEvent(new Event("owner-chat-read")); }).catch(() => {}); }, [path, token, onRead]);

  const load = useCallback(async (after?: number) => {
    try {
      const r = await apiFetch<{ results: OwnerMsg[] }>(`${path}${after ? `?after=${after}` : ""}`, { token });
      if (!after) { setMsgs(r.results); last.current = r.results.at(-1)?.id ?? 0; } else merge(r.results);
      setError("");
      if (r.results.some((m) => m.from_owner !== (mine === "owner") && !m.read)) markRead();
    } catch (e) { setError(errorText(e)); if (!after) setMsgs([]); }
  }, [path, token, merge, markRead, mine]);

  useEffect(() => { setMsgs(null); last.current = 0; void load(); }, [load]);
  // live events, with a slow poll as a fallback when the websocket is off
  useMessengerEvents((ev) => {
    if (ev.type !== "owner_chat") return;
    if (siteId !== undefined && ev.thread !== siteId) return;
    const m = ev.message as OwnerMsg | undefined;
    if (m) { merge([m]); if (m.from_owner !== (mine === "owner")) markRead(); }
  });
  useEffect(() => { const t = setInterval(() => void load(last.current || undefined), 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try { const m = await apiFetch<OwnerMsg>(path, { method: "POST", token, body: { body } }); stick.current = true; merge([m]); setText(""); }
    catch (er) { toast.error(errorText(er)); } finally { setBusy(false); }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol ref={box} role="log" aria-live="polite" aria-label={label} tabIndex={0}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-6">
        {msgs === null && <li className="m-auto flex items-center gap-2 text-muted-foreground"><Spinner aria-hidden />Loading…</li>}
        {msgs && !msgs.length && !error && <li className="m-auto max-w-sm text-center text-muted-foreground">{empty}</li>}
        {error && <li role="alert" className="m-auto rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-text">{error}</li>}
        {msgs?.map((m, i) => {
          const mineMsg = m.from_owner === (mine === "owner");
          const prev = msgs[i - 1];
          return (
            <li key={m.id} className="grid gap-1">
              {(!prev || !sameDay(prev.created_at, m.created_at)) && <span className="my-2 justify-self-center text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>}
              <div className={cn("flex flex-col", mineMsg ? "items-end" : "items-start")}>
                {(!prev || prev.from_owner !== m.from_owner || prev.sender !== m.sender) && <span className="px-1 text-xs text-muted-foreground">{mineMsg ? "You" : m.sender}</span>}
                <p className={cn("max-w-[min(34rem,85%)] rounded-2xl px-4 py-2 break-words whitespace-pre-wrap", mineMsg ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-secondary text-secondary-foreground")}>{m.body}</p>
                <time dateTime={m.created_at} className="px-1 text-xs text-muted-foreground tabular-nums">{dateTime(m.created_at)}{mineMsg && m.read ? " · Seen" : ""}</time>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
        <label htmlFor="oc-text" className="sr-only">Message</label>
        <Textarea id="oc-text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={1} maxLength={4000} placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          className="max-h-40 min-h-11 resize-none" />
        <Button type="submit" size="icon" disabled={!text.trim() || busy} aria-label="Send message">{busy ? <Spinner /> : <Send aria-hidden />}</Button>
      </form>
    </div>
  );
}
