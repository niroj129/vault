"use client";

import { Ban, ChevronLeft, Flag, Headset, Info, MessageCircle, MessageSquare, MessageSquarePlus, MoreVertical, Phone, Search, UserRound, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { lastSeenLabel, UserAvatar } from "@/components/common/user-avatar";
import { useSite } from "@/components/site-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, apiFetch, errorText } from "@/lib/api";
import { isStaff as isStaffUser, useAuth } from "@/lib/auth";
import { useMessenger, useMessengerEvents } from "@/lib/messenger";
import type { ChatMessage, Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { GroupInfoDialog } from "./group-info-dialog";
import { MessageItem, timeLabel } from "./message-item";
import { NewChatDialog } from "./new-chat-dialog";
import { ProfileDialog, ReportDialog, type ReportTarget } from "./people-dialogs";
import { PlayerPanel } from "./staff-tools";

const EDIT_MS = 15 * 60 * 1000;
type Member = Conversation["members"][number] & { last_read_id?: number };
type Dialog = null | { type: "new" } | { type: "info" } | { type: "profile"; userId: number } | { type: "report"; person: ReportTarget; message?: ChatMessage };

const sortConvs = (cs: Conversation[]) => [...cs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
function merge(a: ChatMessage[], b: ChatMessage[]) {
  const map = new Map<number, ChatMessage>();
  [...a, ...b].forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((x, y) => x.id - y.id);
}
/** One-line preview: "You: …" / "Ann: …" in groups, line breaks flattened. */
function preview(m: ChatMessage | null, me: number, group = false) {
  if (!m) return "No messages yet";
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  if (m.kind === "system") return flat(m.body);
  if (m.deleted) return "Message deleted";
  const who = m.sender === me ? "You: " : group && m.sender_name ? `${m.sender_name.split(" ")[0]}: ` : "";
  return who + (flat(m.body || "") || (m.image ? "Photo" : ""));
}
const otherOf = (c: Conversation | null, me: number) => (c?.kind === "direct" ? c.members.find((p) => p.id !== me) || null : null);

function ConvAvatar({ conv, me, size = 44 }: { conv: Conversation; me: number; size?: number }) {
  if (conv.kind === "support") {
    return conv.subject && conv.subject.id !== me
      ? <UserAvatar name={conv.title} src={conv.subject.avatar} size={size} online={conv.subject.online} />
      : <UserAvatar icon={Headset} size={size} />;
  }
  if (conv.kind === "group") return <UserAvatar icon={Users} size={size} />;
  if (conv.kind === "sms") return <UserAvatar icon={(CHANNEL[conv.channel] || CHANNEL.sms).icon} size={size} />;
  const o = otherOf(conv, me);
  return <UserAvatar name={conv.title} src={o?.avatar} size={size} online={o?.online} />;
}

/** Which line a phone chat uses. Icon + word, never colour alone. */
const CHANNEL: Record<string, { label: string; icon: typeof Phone; cls: string }> = {
  sms: { label: "SMS", icon: Phone, cls: "bg-muted text-muted-foreground ring-1 ring-border" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, cls: "bg-success/15 text-success" },
  sendblue: { label: "iMessage", icon: MessageSquare, cls: "bg-info/15 text-info" },
};
function ChannelTag({ channel }: { channel: "sms" | "whatsapp" | "sendblue" }) {
  const c = CHANNEL[channel] || CHANNEL.sms;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", c.cls)}>
      <c.icon className="size-3" aria-hidden />{c.label}
    </span>
  );
}

/** Full messenger. Players see their pinned Support chat first; staff also get filters, saved replies and the player panel. */
export function Messenger({ basePath = "/messages" }: { basePath?: string }) {
  const { user, token } = useAuth();
  const site = useSite();
  const { connected, send: wsSend } = useMessenger();
  const params = useSearchParams();
  const rawC = params.get("c");
  const staff = isStaffUser(user);
  const smsOn = site.features?.sms !== false && staff;
  const me = user?.id ?? 0;

  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"all" | "support" | "people">("all");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState<Record<number, { name: string; until: number } | undefined>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [panel, setPanel] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const boxRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);

  const pinned = convs?.find((c) => c.pinned);
  useEffect(() => { setActiveId(rawC === "support" ? pinned?.id ?? null : Number(rawC) || null); }, [rawC, pinned?.id]);
  const active = useMemo(() => convs?.find((c) => c.id === activeId) || null, [convs, activeId]);
  const other = otherOf(active, me);

  const open = useCallback((id: number | null) => {
    window.history.pushState(null, "", id ? `${basePath}?c=${id}` : basePath);
    setActiveId(id); setEditing(null);
  }, [basePath]);
  useEffect(() => {
    const onPop = () => { const c = new URLSearchParams(window.location.search).get("c"); setActiveId(Number(c) || null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const loadConvs = useCallback(async () => {
    try { setConvs(await apiFetch<Conversation[]>("/messenger/conversations/", { token })); }
    catch (e) { setError(errorText(e)); setConvs((c) => c || []); }
  }, [token]);
  useEffect(() => { void loadConvs(); }, [loadConvs]);
  useEffect(() => { if (rawC === "support" && pinned) window.history.replaceState(null, "", `${basePath}?c=${pinned.id}`); }, [rawC, pinned, basePath]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setLoadingThread(true); setText(""); setFile(null); setError(""); setEditing(null);
    apiFetch<{ messages: ChatMessage[]; has_more: boolean }>(`/messenger/conversations/${activeId}/messages/`, { token })
      .then((d) => {
        if (cancelled) return;
        stick.current = true; setMessages(d.messages); setHasMore(d.has_more);
        setConvs((cs) => cs?.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)) ?? cs);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError && e.status === 404 ? "This conversation isn't available any more." : errorText(e)))
      .finally(() => !cancelled && setLoadingThread(false));
    return () => { cancelled = true; };
  }, [activeId, token]);

  // fallback while the socket is down: poll the open thread + list
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => {
      void loadConvs();
      if (!activeId) return;
      setMessages((ms) => {
        const after = ms.length ? ms[ms.length - 1].id : 0;
        apiFetch<{ messages: ChatMessage[] }>(`/messenger/conversations/${activeId}/messages/?after=${after}`, { token })
          .then((d) => { if (d.messages.length) setMessages((cur) => merge(cur, d.messages)); }).catch(() => {});
        return ms;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [connected, activeId, token, loadConvs]);

  const scrollDown = useCallback(() => { const el = boxRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, []);
  useEffect(scrollDown, [messages, activeId, scrollDown]);

  useMessengerEvents((ev) => {
    if (ev.type === "message" && ev.message) {
      const m = ev.message;
      const mine = m.sender === me;
      setConvs((cs) => {
        if (!cs) return cs;
        if (!cs.some((c) => c.id === m.conversation)) { void loadConvs(); return cs; }
        return sortConvs(cs.map((c) => (c.id !== m.conversation ? c : {
          ...c, last_message: m, updated_at: m.created_at,
          unread: c.id === activeId || mine ? 0 : c.unread + (m.kind === "system" ? 0 : 1) })));
      });
      if (m.conversation === activeId) {
        const el = boxRef.current;
        stick.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        setMessages((cur) => merge(cur, [m]));
        setTyping((t) => ({ ...t, [m.sender ?? 0]: undefined }));
        if (!mine) apiFetch(`/messenger/conversations/${activeId}/messages/?after=${m.id - 1}`, { token }).catch(() => {});
      }
    } else if (ev.type === "message_update" && ev.message) {
      const m = ev.message;
      setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
      setConvs((cs) => cs?.map((c) => (c.last_message?.id === m.id ? { ...c, last_message: m } : c)) ?? cs);
    } else if (ev.type === "conversation") {
      void loadConvs();
    } else if (ev.type === "read") {
      setConvs((cs) => cs?.map((c) => (c.id !== ev.conversation ? c : {
        ...c, members: c.members.map((p) => (p.id === ev.user ? { ...p, last_read_id: ev.last_read_id as number } : p)) })) ?? cs);
    } else if (ev.type === "typing" && ev.conversation === activeId) {
      const u = ev.user as { id: number; name: string };
      setTyping((t) => ({ ...t, [u.id]: { name: u.name, until: Date.now() + 4000 } }));
    } else if (ev.type === "presence") {
      const patch = <T extends { id: number; online: boolean | null; last_seen: string | null } | null>(p: T): T =>
        (p && p.id === ev.user ? { ...p, online: ev.online as boolean, last_seen: (ev.last_seen as string) || p.last_seen } : p);
      setConvs((cs) => cs?.map((c) => ({ ...c, members: c.members.map(patch), subject: patch(c.subject) })) ?? cs);
    }
  });

  useEffect(() => {
    const t = setInterval(() => setTyping((cur) => {
      const now = Date.now();
      const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => v && v.until > now));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadOlder() {
    if (!messages.length || !activeId) return;
    const el = boxRef.current; const prev = el?.scrollHeight || 0;
    const d = await apiFetch<{ messages: ChatMessage[]; has_more: boolean }>(`/messenger/conversations/${activeId}/messages/?before=${messages[0].id}`, { token });
    stick.current = false; setMessages((cur) => merge(d.messages, cur)); setHasMore(d.has_more);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prev; });
  }

  function onText(v: string) {
    setText(v);
    const now = Date.now();
    if (v && !editing && now - lastTyping.current > 2500 && active?.kind !== "sms") { lastTyping.current = now; wsSend({ type: "typing", conversation: activeId }); }
  }

  async function submit() {
    const body = text.trim();
    if (sending || !activeId) return;
    if (editing) {
      if (!body) return;
      setSending(true); setError("");
      try {
        const m = await apiFetch<ChatMessage>(`/messenger/messages/${editing.id}/`, { method: "PATCH", token, body: { body } });
        setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x))); setEditing(null); setText("");
      } catch (e) { setError(errorText(e)); } finally { setSending(false); }
      return;
    }
    if (!body && !file) return;
    setSending(true); setError("");
    try {
      let payload: FormData | { body: string } = { body };
      if (file) { const fd = new FormData(); fd.append("body", body); fd.append("image", file); payload = fd; }
      const msg = await apiFetch<ChatMessage>(`/messenger/conversations/${activeId}/messages/`, { method: "POST", token, body: payload });
      stick.current = true; setMessages((cur) => merge(cur, [msg])); setText(""); setFile(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? "You're sending messages too fast. Wait a moment and try again." : errorText(e));
      if (e instanceof ApiError && e.status === 403) void loadConvs();
    } finally { setSending(false); }
  }

  async function removeMessage(m: ChatMessage) {
    try { const d = await apiFetch<ChatMessage>(`/messenger/messages/${m.id}/`, { method: "DELETE", token }); setMessages((cur) => cur.map((x) => (x.id === d.id ? d : x))); }
    catch (e) { toast.error(errorText(e)); }
  }
  async function messagePerson(p: { id: number }) {
    setDialog(null);
    try { const c = await apiFetch<Conversation>("/messenger/conversations/", { method: "POST", token, body: { kind: "direct", user: p.id } });
      setConvs((cs) => [c, ...(cs || []).filter((x) => x.id !== c.id)]); open(c.id); }
    catch (e) { toast.error(errorText(e)); }
  }
  async function setBlocked(p: { id: number }, block: boolean) {
    try {
      if (block) await apiFetch("/messenger/blocks/", { method: "POST", token, body: { user: p.id } });
      else await apiFetch(`/messenger/blocks/${p.id}/`, { method: "DELETE", token });
      void loadConvs(); toast.success(block ? "Blocked" : "Unblocked");
    } catch (e) { toast.error(errorText(e)); }
  }

  const q = filter.trim().toLowerCase().replace(/^@/, "");
  const shown = (convs || []).filter((c) => {
    if (tab === "support" && c.kind !== "support") return false;
    if (tab === "people" && c.kind === "support") return false;
    return !q || c.title.toLowerCase().includes(q) || c.members.some((p) => p.username.toLowerCase().includes(q));
  });
  const typers = Object.values(typing).filter(Boolean).map((t) => t!.name);
  const unansweredSupport = (convs || []).filter((c) => c.kind === "support" && c.unread > 0).length;
  const seen = useMemo(() => {
    if (!active) return null;
    const last = messages[messages.length - 1];
    if (!last || last.sender !== me) return null;
    const readers = (active.members as Member[]).filter((p) => p.id !== me && (p.last_read_id ?? 0) >= last.id);
    if (!readers.length) return null;
    return { id: last.id, label: active.kind === "group" ? `Seen by ${readers.length}` : "Seen" };
  }, [active, messages, me]);
  const panelUserId = staff && active ? (active.kind === "support" ? active.subject?.id ?? null : other?.role === "user" ? other.id : null) : null;

  let subtitle = "";
  if (typers.length) subtitle = `${typers.join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`;
  else if (active?.kind === "group") subtitle = `${active.members.length} members`;
  else if (active?.kind === "sms") subtitle = `${(CHANNEL[active.channel] || CHANNEL.sms).label} · ${active.phone}`;
  else if (active?.kind === "support") subtitle = active.subject?.id === me ? "Our team usually replies in a few minutes"
    : `Support · @${active.subject?.username} · ${lastSeenLabel(active.subject?.online, active.subject?.last_seen) || "Offline"}`;
  else if (other) subtitle = `@${other.username} · ${lastSeenLabel(other.online, other.last_seen) || "Offline"}`;
  if (!user) return null;

  return (
    <div className={"glass flex h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden rounded-xl border md:h-[calc(100dvh-12rem)]"}>
      {/* list */}
      <aside aria-label="Conversations" className={cn("flex w-full min-w-0 flex-col overflow-hidden border-r md:w-80 md:shrink-0", activeId && "max-md:hidden")}>
        <div className="flex items-center justify-between gap-2 p-4 pb-3">
          <h1 className="text-2xl">Messages</h1>
          <Button size="sm" onClick={() => setDialog({ type: "new" })}><MessageSquarePlus aria-hidden />New</Button>
        </div>
        <div className="grid gap-2 px-4 pb-3">
          <InputGroup>
            <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
            <InputGroupInput type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats or @username" aria-label="Search chats" />
          </InputGroup>
          {staff && (
            <ToggleGroup type="single" variant="outline" size="sm" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} aria-label="Show" className="w-full">
              <ToggleGroupItem value="all" className="flex-1 data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-foreground">All</ToggleGroupItem>
              <ToggleGroupItem value="support" className="flex-1 data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-foreground">Support{unansweredSupport ? ` · ${unansweredSupport}` : ""}</ToggleGroupItem>
              <ToggleGroupItem value="people" className="flex-1 data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-foreground">People</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
        <nav aria-label="Chats" className="flex-1 overflow-y-auto px-2 pb-2">
          {convs === null ? (
            <ul className="grid gap-1" aria-busy>{[0, 1, 2, 3].map((i) => <li key={i} className="flex gap-3 p-2"><Skeleton className="size-11 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-5/6" /></div></li>)}</ul>
          ) : !shown.length ? (
            <Empty className="p-4"><EmptyHeader><EmptyTitle className="text-base">{q ? `No chats match “${filter}”` : "No conversations yet"}</EmptyTitle>
              <EmptyDescription>Find anyone on {site.site_name || "the site"} by their @username.</EmptyDescription></EmptyHeader>
              <EmptyContent><Button variant="outline" size="sm" onClick={() => setDialog({ type: "new" })}>Find people</Button></EmptyContent></Empty>
          ) : (
            <ul className="grid gap-0.5">
              {shown.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => open(c.id)} aria-current={c.id === activeId ? "true" : undefined}
                    className={cn("flex min-h-16 w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-accent", c.id === activeId && "bg-primary/15")}>
                    <ConvAvatar conv={c} me={me} />
                    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                      <span className="flex min-w-0 items-baseline justify-between gap-2">
                        <b className="truncate">{c.title}{c.pinned && <span className="sr-only"> (pinned)</span>}</b>
                        <time className="shrink-0 text-xs text-muted-foreground">{timeLabel(c.last_message?.created_at)}</time>
                      </span>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className={cn("flex min-w-0 items-center gap-1 text-sm", c.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {staff && c.kind === "support" && <Headset className="size-3.5 shrink-0" aria-label="Support chat" />}
                          {c.kind === "sms" && <ChannelTag channel={c.channel} />}
                          <span className="truncate">{c.pinned && !c.last_message ? "Questions? We're here to help." : preview(c.last_message, me, c.kind === "group")}</span>
                        </span>
                        {c.unread > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs leading-5 font-bold text-primary-foreground">{c.unread}<span className="sr-only"> unread</span></span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <p className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground" role="status">
          <span className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-warning")} aria-hidden />{connected ? "Live" : "Reconnecting…"}
        </p>
      </aside>

      {/* thread */}
      <section aria-label="Conversation" className={cn("flex min-w-0 flex-1 flex-col", !activeId && "max-md:hidden")}>
        {!activeId ? (
          <Empty className="flex-1">
            <EmptyHeader><EmptyMedia variant="icon"><MessageSquarePlus aria-hidden /></EmptyMedia><EmptyTitle>Your messages</EmptyTitle>
              <EmptyDescription>Message anyone on {site.site_name || "the site"} by @username, start a group, or ask support.</EmptyDescription></EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button onClick={() => setDialog({ type: "new" })}>New message</Button>
              {pinned && <Button variant="outline" onClick={() => open(pinned.id)}><Headset aria-hidden />Support</Button>}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <header className="flex min-h-16 items-center gap-2 border-b px-2 py-2 md:px-4">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => open(null)} aria-label="Back to conversations"><ChevronLeft aria-hidden /></Button>
              {active && (
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left hover:bg-accent"
                  onClick={() => {
                    if (other) setDialog({ type: "profile", userId: other.id });
                    else if (active.kind === "support" && active.subject && active.subject.id !== me) setDialog({ type: "profile", userId: active.subject.id });
                    else if (active.kind !== "support") setDialog({ type: "info" });
                  }}>
                  <ConvAvatar conv={active} me={me} size={40} />
                  <span className="grid min-w-0"><h2 className="flex min-w-0 items-center gap-2 text-base"><span className="truncate">{active.title}</span>{active.kind === "sms" && <ChannelTag channel={active.channel} />}</h2>
                    <span className={cn("truncate text-sm", typers.length ? "text-brand-text" : "text-muted-foreground")} aria-live="polite">{subtitle}</span></span>
                </button>
              )}
              {panelUserId && (
                <Button variant={panel ? "secondary" : "ghost"} size="icon" className="max-lg:hidden" onClick={() => setPanel((p) => !p)} aria-pressed={panel} aria-label="Player details"><UserRound aria-hidden /></Button>
              )}
              {active && active.kind !== "support" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More options"><MoreVertical aria-hidden /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {other ? (
                      <>
                        <DropdownMenuItem onSelect={() => setDialog({ type: "profile", userId: other.id })}><UserRound aria-hidden />View profile</DropdownMenuItem>
                        {other.role === "user" && user.role === "user" && (
                          <DropdownMenuItem onSelect={() => void setBlocked(other, !active.blocked)}><Ban aria-hidden />{active.blocked ? "Unblock" : "Block"}</DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ type: "report", person: other })}><Flag aria-hidden />Report</DropdownMenuItem>
                      </>
                    ) : <DropdownMenuItem onSelect={() => setDialog({ type: "info" })}><Info aria-hidden />{active.kind === "group" ? "Group info" : "Details"}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </header>

            <ol ref={boxRef} role="log" aria-live="polite" aria-label={`Messages${active ? ` with ${active.title}` : ""}`} className="flex flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6">
              {hasMore && <li className="self-center"><Button variant="outline" size="sm" onClick={loadOlder}>Load earlier messages</Button></li>}
              {loadingThread && !messages.length && <li className="flex items-center justify-center gap-2 p-6 text-muted-foreground"><Spinner aria-hidden />Loading…</li>}
              {!loadingThread && !messages.length && !error && (
                <li className="m-auto grid max-w-sm justify-items-center gap-2 text-center text-muted-foreground">
                  {active?.kind === "support" && active.subject?.id === me ? (
                    <><UserAvatar icon={Headset} size={56} /><b className="text-foreground">Hi {user.full_name || user.username}, how can we help?</b>Ask about loading, cash outs, game logins or anything else.</>
                  ) : active?.kind === "sms" ? `Send ${active.channel === "whatsapp" ? "a WhatsApp message" : active.channel === "sendblue" ? "an iMessage" : "a text"}. Replies from this number show up here.` : "Say hello — the first message starts the chat."}
                </li>
              )}
              {messages.map((m, i) => {
                const mine = m.sender === me;
                const prev = messages[i - 1];
                const grouped = !!prev && prev.sender === m.sender && prev.kind !== "system" && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
                const cashier = !m.sender && m.kind === "text";
                const named = !mine && !grouped && (active?.kind === "group" || active?.kind === "support");
                const sender = active?.members.find((p) => p.id === m.sender);
                return (
                  <MessageItem key={m.id} m={m} channel={active?.channel} mine={mine} grouped={grouped} cashier={cashier} seen={seen?.id === m.id ? seen.label : null}
                    showName={named ? (cashier ? "Cashier · automatic" : m.kind === "sms_in" ? active?.phone || "" : m.sender_name) : null}
                    canEdit={mine && !m.deleted && m.kind === "text" && Date.now() - new Date(m.created_at).getTime() < EDIT_MS && !!m.body}
                    canDelete={!m.deleted && m.kind === "text" && (mine || (staff && active?.kind === "support"))}
                    canReport={!mine && !m.deleted && !!m.sender && active?.kind !== "sms" && !(sender && sender.role !== "user" && user.role !== "user")}
                    onEdit={() => { setEditing(m); setText(m.body); setFile(null); requestAnimationFrame(() => inputRef.current?.focus()); }}
                    onDelete={() => void removeMessage(m)}
                    onReport={() => setDialog({ type: "report", person: sender || { id: m.sender!, username: m.sender_name, role: "user" }, message: m })}
                    onImageLoad={scrollDown} />
                );
              })}
              {typers.length > 0 && (
                <li aria-hidden className="mt-3 flex w-fit gap-1 rounded-2xl border bg-card px-4 py-3">
                  {[0, 1, 2].map((k) => <span key={k} className="size-2 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${k * 150}ms` }} />)}
                </li>
              )}
            </ol>

            {error && (
              <p role="alert" className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-text">
                {error}<Button variant="ghost" size="icon-xs" onClick={() => setError("")} aria-label="Dismiss error">×</Button>
              </p>
            )}
            {active && !active.can_send ? (
              <p className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground">
                <Ban className="size-4" aria-hidden />{active.send_block_reason || "You can't send messages here."}
                {active.blocked && other && <Button variant="outline" size="sm" className="ml-auto" onClick={() => void setBlocked(other, false)}>Unblock</Button>}
              </p>
            ) : active && (
              <Composer ref={inputRef} text={text} onText={onText} file={file} onFile={setFile} editing={!!editing}
                onCancelEdit={() => { setEditing(null); setText(""); }} sms={active.kind === "sms"} channel={active.channel} staff={staff} sending={sending} onSubmit={submit} onError={setError} />
            )}
          </>
        )}
      </section>

      {panelUserId && panel && <div className="hidden border-l lg:block"><PlayerPanel userId={panelUserId} onClose={() => setPanel(false)} /></div>}

      <NewChatDialog open={dialog?.type === "new"} onOpenChange={(o) => !o && setDialog(null)} smsOn={smsOn}
        onCreated={(c) => { setDialog(null); setConvs((cs) => [c, ...(cs || []).filter((x) => x.id !== c.id)]); void loadConvs(); open(c.id); }} />
      {active && <GroupInfoDialog conv={active} open={dialog?.type === "info"} onOpenChange={(o) => !o && setDialog(null)}
        onChanged={loadConvs} onLeft={() => { setDialog(null); void loadConvs(); open(null); }} />}
      {dialog?.type === "profile" && (
        <ProfileDialog userId={dialog.userId} onClose={() => setDialog(null)} onMessage={other?.id === dialog.userId ? null : messagePerson}
          onReport={(p) => setDialog({ type: "report", person: p })} onBlockChange={loadConvs} />
      )}
      {dialog?.type === "report" && <ReportDialog person={dialog.person} message={dialog.message} onClose={() => setDialog(null)} onDone={(b) => b && void loadConvs()} />}
    </div>
  );
}
