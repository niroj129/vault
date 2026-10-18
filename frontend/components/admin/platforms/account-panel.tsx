"use client";

import { ChevronRight, Info, Plus, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { Platform, PlatformLogin, RemoteSearch } from "@/lib/types";
import { cn } from "@/lib/utils";

function Row({ name, sub, balance, note, on, onClick, badge }: { name: string; sub: string; balance: string | number | null | undefined; note?: string; on: boolean; onClick: () => void; badge?: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-current={on ? "true" : undefined}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
          on ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-transparent bg-muted/30")}>
        <UserAvatar name={name} size={36} />
        <span className="grid min-w-0 flex-1 leading-tight"><span className="flex items-center gap-1.5"><b className="truncate text-sm">{name}</b>{badge}</span><span className="truncate text-xs text-muted-foreground">{sub}</span></span>
        <span className="grid text-right leading-tight"><b className="text-sm tabular-nums">{balance != null && balance !== "" ? money(balance) : "—"}</b><span className="text-[0.7rem] text-muted-foreground">{note}</span></span>
      </button>
    </li>
  );
}

/** Players are searched on the game platform itself where it can list them (Cash Machine, Mafia, Game Room; Juwa and Game Vault list low-balance players).
 *  Where it can't, type the exact login and we ask the game; accounts already tied to your players are listed too. */
export function AccountPanel({ platform, selected, reloadKey, onSelect, onNew }: { platform: Platform; selected: string | null; reloadKey: number; onSelect: (username: string) => void; onNew: () => void }) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<RemoteSearch | null>(null);
  const [saved, setSaved] = useState<PlatformLogin[] | null>(null);
  useEffect(() => { setQ(""); setRemote(null); setSaved(null); }, [platform.id]);

  // the game's own player list (partial names work where the platform allows)
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      apiFetch<RemoteSearch>(`/admin/platforms/${platform.id}/search/?q=${encodeURIComponent(q.trim())}`, { token })
        .then((r) => live && setRemote(r)).catch(() => live && setRemote({ supported: true, results: [], message: "The platform didn't answer. Try again in a moment." }));
    }, q.trim() ? 380 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [platform.id, q, token, reloadKey]);

  // accounts we already tie to players (shown when the game can't list its own)
  useEffect(() => {
    if (remote && remote.supported) return;
    const t = setTimeout(() => {
      apiFetch<PlatformLogin[]>(`/admin/platforms/${platform.id}/accounts/${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { token }).then(setSaved).catch(() => setSaved([]));
    }, 160);
    return () => clearTimeout(t);
  }, [platform.id, q, token, reloadKey, remote]);

  const term = q.trim();
  const listed = remote?.supported ? remote.results.map((r) => r.username.toLowerCase()) : (saved || []).map((r) => r.username.toLowerCase());
  const exact = listed.includes(term.toLowerCase());
  const sel = selected?.toLowerCase();

  return (
    <aside aria-label={`${platform.name} players`} className="glass grid content-start gap-3 rounded-2xl border p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:grid-rows-[auto_auto_1fr]">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-base font-semibold">Players</h2>
        <Badge variant="secondary">{remote?.supported ? `on ${platform.name}` : `${platform.accounts} saved`}</Badge>
        <Button size="sm" className="ml-auto" onClick={onNew}><Plus aria-hidden />New</Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (term) onSelect(term); }} noValidate>
        <InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${platform.name} players`} aria-label={`Search ${platform.name} players`} autoComplete="off" autoCapitalize="none" spellCheck={false} /></InputGroup>
      </form>
      <div className="-mx-1 min-h-0 overflow-y-auto px-1">
        {term && !exact && (
          <button type="button" onClick={() => onSelect(term)} className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-primary/60 bg-primary/10 px-3 text-left transition-colors duration-150 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring">
            <Search className="size-4 shrink-0 text-brand-text" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">Look up <b className="break-all">“{term}”</b> exactly on {platform.name}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>
        )}

        {!remote ? <div className="grid gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          : remote.supported ? (
            <>
              {remote.message && <p className="mb-2 flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{remote.message}</p>}
              {!remote.results.length ? (
                <div className="grid justify-items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground"><Users className="size-8" aria-hidden />
                  <p>{term ? `${platform.name} lists nobody like “${term}”.` : `${platform.name} has no players to show yet.`}</p></div>
              ) : (
                <ul className="grid gap-1.5" aria-label={`Players on ${platform.name}`}>
                  {remote.results.map((r) => (
                    <Row key={r.platform_id || r.username} name={r.username} on={sel === r.username.toLowerCase()} onClick={() => onSelect(r.username)}
                      sub={r.linked ? `${r.linked.full_name || r.linked.username} (@${r.linked.username})` : "Not linked to a player"} balance={r.balance}
                      note={r.last_seen ? `seen ${ago(r.last_seen.replace(" ", "T"))}` : r.created ? `joined ${r.created.slice(0, 10)}` : ""}
                      badge={r.banned ? <Badge variant="destructive">Banned</Badge> : undefined} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="mb-2 flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{platform.name} can’t list its players. Type a player’s exact login and press Enter to ask the game for it. Below are accounts you’ve already tied to your players.</p>
              {!saved ? <div className="grid gap-2" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                : !saved.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{term ? "No saved account looks like that." : "Nothing saved yet."}</p> : (
                  <ul className="grid gap-1.5" aria-label="Saved accounts">
                    {saved.map((r) => <Row key={r.id} name={r.username} on={sel === r.username.toLowerCase()} onClick={() => onSelect(r.username)} sub={r.player.full_name || r.player.username} balance={r.last_balance} note={r.last_balance_at ? ago(r.last_balance_at) : ""} />)}
                  </ul>
                )}
            </>
          )}
      </div>
    </aside>
  );
}
