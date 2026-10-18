"use client";

import { ChevronRight, Plus, Receipt, Search, UserPlus, Users, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { AdminUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAgentSummary } from "./agent-context";
import { NewPlayerDialog } from "./new-player-dialog";
import { PlayerSheet } from "./player-sheet";

type Filter = "all" | "active" | "never" | "off";
type Sort = "recent" | "name" | "loaded";
const FILTERS: [Filter, string][] = [["all", "All"], ["active", "Active"], ["never", "Never loaded"], ["off", "Disabled"]];

function Kpi({ label, value, note, icon: Icon, href, hot }: { label: string; value: string; note: string; icon: typeof Users; href?: string; hot?: boolean }) {
  const body = (
    <>
      <span className="flex items-center justify-between text-sm text-muted-foreground">{label}<Icon className={cn("size-5", hot && "text-warning")} aria-hidden /></span>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </>
  );
  const cls = cn("grid gap-1.5 rounded-xl border p-4 transition-[background-color,border-color] duration-200", hot ? "border-warning/60 bg-warning/10" : "glass", href && "hover:bg-accent");
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** The agent's desk: every player one tap from their accounts, load and cash-out tools. */
export function PlayersWorkspace() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { summary, reload: reloadSummary } = useAgentSummary();
  const [players, setPlayers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [creating, setCreating] = useState(false);
  const openId = Number(params.get("p")) || null;

  const load = useCallback(() => {
    apiFetch<AdminUser[] | { results: AdminUser[] }>("/users/?role=user", { token })
      .then((r) => setPlayers(Array.isArray(r) ? r : r.results)).catch((e) => { toast.error(errorText(e)); setPlayers([]); });
  }, [token]);
  useEffect(() => { if (token) load(); }, [token, load]);

  const open = useCallback((id: number | null) => router.replace(id ? `/agent?p=${id}` : "/agent", { scroll: false }), [router]);
  const changed = useCallback(() => { load(); reloadSummary(); }, [load, reloadSummary]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = (players || []).filter((p) => {
      if (filter === "active" && !p.is_active) return false;
      if (filter === "off" && p.is_active) return false;
      if (filter === "never" && (p.deposit_count || 0) > 0) return false;
      return !term || `${p.username} ${p.full_name} ${p.phone || ""} ${p.email || ""}`.toLowerCase().includes(term);
    });
    const byName = (a: AdminUser, b: AdminUser) => (a.full_name || a.username).localeCompare(b.full_name || b.username);
    return rows.sort(sort === "name" ? byName
      : sort === "loaded" ? (a, b) => Number(b.total_loaded || 0) - Number(a.total_loaded || 0) || byName(a, b)
      : (a, b) => (b.last_deposit ? Date.parse(b.last_deposit) : 0) - (a.last_deposit ? Date.parse(a.last_deposit) : 0) || byName(a, b));
  }, [players, q, filter, sort]);
  const current = players?.find((p) => p.id === openId) || null;
  const s = summary;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Agent" title="My players" description="Create accounts, check balances, load and cash out — everything for a player is in one place."
        actions={<Button onClick={() => setCreating(true)}><UserPlus aria-hidden />New player</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Players" value={s ? String(s.players) : "—"} note={s ? `${s.active_players} active` : " "} icon={Users} />
        <Kpi label="To load" value={s ? String(s.to_load + s.to_check) : "—"} note="paid, waiting on you" icon={Zap} href="/agent/loads" hot={!!s && s.to_load + s.to_check > 0} />
        <Kpi label="Cash outs" value={s ? String(s.cashouts_waiting) : "—"} note="requests to review" icon={Receipt} href="/agent/cashouts" hot={!!s && s.cashouts_waiting > 0} />
        <Kpi label="Loaded today" value={s ? money(s.loaded_today) : "—"} note="paid loads today" icon={Wallet} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-sm"><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username or phone" aria-label="Search players" /></InputGroup>
        <div className="scrollbar-none flex gap-2 overflow-x-auto" role="group" aria-label="Filter players">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring",
                filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-accent")}>{l}</button>
          ))}
        </div>
        <div className="lg:ml-auto">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-full lg:w-48" aria-label="Sort players"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="recent">Recently loaded</SelectItem><SelectItem value="name">Name A–Z</SelectItem><SelectItem value="loaded">Most loaded</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      {!players ? (
        <div className="grid gap-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-xl" />)}</div>
      ) : !players.length ? (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Users aria-hidden /></EmptyMedia><EmptyTitle>No players yet</EmptyTitle>
          <EmptyDescription>Create your first player. We can set up their game accounts at the same time and give you the logins to send them.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={() => setCreating(true)}><Plus aria-hidden />Create a player</Button></EmptyContent></Empty>
      ) : !shown.length ? (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden /></EmptyMedia><EmptyTitle>No match</EmptyTitle>
          <EmptyDescription>Nobody fits that search and filter.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={() => { setQ(""); setFilter("all"); }}>Clear search</Button></EmptyContent></Empty>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">{shown.length} player{shown.length === 1 ? "" : "s"}</p>
          <ul className="grid gap-2" aria-label="Players">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p.id)} aria-label={`Open ${p.full_name || p.username}`}
                  className="glass grid min-h-[4.5rem] w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl border p-3 text-left transition-[background-color,border-color,transform] duration-150 hover:border-ring/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] md:px-4">
                  <span className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={p.full_name || p.username} src={p.avatar} size={42} />
                    <span className="grid min-w-0 leading-tight">
                      <b className="truncate">{p.full_name || p.username}</b>
                      <span className="truncate text-sm text-muted-foreground">@{p.username}{p.phone ? ` · ${p.phone}` : ""}</span>
                    </span>
                  </span>
                  <span className="hidden text-sm md:grid"><span className="text-xs text-muted-foreground">Last load</span>{p.last_deposit ? ago(p.last_deposit) : "Never"}</span>
                  <span className="hidden text-sm md:grid"><span className="text-xs text-muted-foreground">Total loaded</span><b className="tabular-nums">{money(p.total_loaded)}</b></span>
                  <span className="hidden items-center gap-2 md:flex">
                    {!p.is_active && <Badge variant="destructive">Disabled</Badge>}
                    <Badge variant="secondary">{p.login_count || 0} game{(p.login_count || 0) === 1 ? "" : "s"}</Badge>
                  </span>
                  <span className="flex items-center gap-2 justify-self-end">
                    <span className="text-right text-sm md:hidden"><b className="tabular-nums">{money(p.total_loaded)}</b><span className="block text-xs text-muted-foreground">{p.last_deposit ? ago(p.last_deposit) : "Never loaded"}</span></span>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <PlayerSheet player={current} onClose={() => open(null)} onChanged={changed} />
      <NewPlayerDialog open={creating} onOpenChange={setCreating} onDone={(id) => { changed(); if (id) open(id); }} />
    </div>
  );
}

