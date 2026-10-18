"use client";

import { ChevronLeft, MessageCircle, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { OwnerThread } from "@/components/owner-chat/thread";
import { StatusBadge } from "@/components/play/status-badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";
import { cn } from "@/lib/utils";

interface Row { id: number; name: string; slug: string; is_active: boolean; unread: number; last: { body: string; from_owner: boolean; sender: string } | null; last_at: string | null }

export default function OwnerMessages() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const load = useCallback(() => {
    apiFetch<{ results: Row[] }>(`/platform/chats/${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { token }).then((r) => setRows(r.results)).catch((e) => toast.error(errorText(e)));
  }, [token, q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get("site")); if (id) setActive(id); }, []);
  useMessengerEvents((ev) => { if (ev.type === "owner_chat") load(); });
  const site = rows?.find((r) => r.id === active);

  return (
    <div className="grid gap-4">
      <PageHeader title="Messages" description="Private chats with each client site's admins." />
      <div className="glass flex h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden rounded-xl border">
        <aside aria-label="Client sites" className={cn("flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0", active && "max-md:hidden")}>
          <div className="p-3"><InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
            <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a site" aria-label="Find a site" /></InputGroup></div>
          <nav aria-label="Chats" className="flex-1 overflow-y-auto px-2 pb-2">
            {!rows ? <div className="grid gap-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div> : !rows.length ? (
              <p className="p-4 text-sm text-muted-foreground">{q ? `No site matches “${q}”.` : "No client sites yet."}</p>
            ) : (
              <ul className="grid gap-0.5">{rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setActive(r.id)} aria-current={r.id === active ? "true" : undefined}
                    className={cn("flex min-h-16 w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-accent", r.id === active && "bg-primary/15")}>
                    <UserAvatar name={r.name} size={44} />
                    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                      <span className="flex min-w-0 items-baseline justify-between gap-2"><b className="truncate">{r.name}</b>{r.last_at && <time className="shrink-0 text-xs text-muted-foreground">{ago(r.last_at)}</time>}</span>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", r.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>{r.last ? `${r.last.from_owner ? "You: " : ""}${r.last.body.replace(/\s+/g, " ")}` : "No messages yet"}</span>
                        {r.unread > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs leading-5 font-bold text-primary-foreground">{r.unread}<span className="sr-only"> unread</span></span>}
                      </span>
                    </span>
                  </button>
                </li>))}</ul>
            )}
          </nav>
        </aside>
        <section aria-label="Conversation" className={cn("flex min-w-0 flex-1 flex-col", !active && "max-md:hidden")}>
          {!active ? (
            <Empty className="m-auto border-0"><EmptyHeader><EmptyMedia variant="icon"><MessageCircle aria-hidden /></EmptyMedia><EmptyTitle>Pick a site</EmptyTitle>
              <EmptyDescription>Chat privately with the people who run each client casino.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b px-3 py-3 md:px-4">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActive(null)} aria-label="Back to sites"><ChevronLeft aria-hidden /></Button>
                <UserAvatar name={site?.name || "Site"} size={40} />
                <div className="grid min-w-0"><h2 className="truncate text-base">{site?.name || "Site"}</h2><span className="text-sm text-muted-foreground">Site admins</span></div>
                {site && !site.is_active && <StatusBadge tone="wait" className="ml-auto">Suspended</StatusBadge>}
              </header>
              <OwnerThread key={active} path={`/platform/chats/${active}/`} mine="owner" siteId={active} label={`Chat with ${site?.name || "the site"}`}
                empty="No messages yet. Write the first one." onRead={load} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
