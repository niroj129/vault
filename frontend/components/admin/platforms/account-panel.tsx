"use client";

import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { Platform, PlatformLogin } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The platform's accounts you know, with search that matches partial names, and a way to look up any login on the platform itself. */
export function AccountPanel({ platform, selected, reloadKey, onSelect, onNew }: { platform: Platform; selected: string | null; reloadKey: number; onSelect: (username: string) => void; onNew: () => void }) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PlatformLogin[] | null>(null);
  useEffect(() => { setQ(""); }, [platform.id]);
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<PlatformLogin[]>(`/admin/platforms/${platform.id}/accounts/${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { token }).then(setRows).catch(() => setRows([]));
    }, 160);
    return () => clearTimeout(t);
  }, [platform.id, q, token, reloadKey]);
  const term = q.trim();
  const exact = rows?.some((r) => r.username.toLowerCase() === term.toLowerCase());

  return (
    <aside aria-label={`${platform.name} accounts`} className="glass grid content-start gap-3 rounded-2xl border p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:grid-rows-[auto_auto_1fr]">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-base font-semibold">Accounts</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{platform.accounts}</span>
        <Button size="sm" className="ml-auto" onClick={onNew}><Plus aria-hidden />New</Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (term) onSelect(term); }} noValidate>
        <InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or look up a login" aria-label={`Search ${platform.name} accounts`} autoComplete="off" autoCapitalize="none" spellCheck={false} /></InputGroup>
      </form>
      <div className="-mx-1 min-h-0 overflow-y-auto px-1">
        {term && !exact && (
          <button type="button" onClick={() => onSelect(term)} className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-primary/60 bg-primary/10 px-3 text-left transition-colors duration-150 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring">
            <Search className="size-4 shrink-0 text-brand-text" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">Look up <b className="break-all">“{term}”</b> on {platform.name}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>
        )}
        {!rows ? <div className="grid gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          : !rows.length ? (
            <div className="grid justify-items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground"><Users className="size-8" aria-hidden />
              {term ? <p>No saved account looks like that. Use the line above to ask {platform.name} directly.</p> : <p>No accounts tied to players yet. Look one up by its login, or create a new one.</p>}</div>
          ) : (
            <ul className="grid gap-1.5">
              {rows.map((r) => {
                const on = selected?.toLowerCase() === r.username.toLowerCase();
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => onSelect(r.username)} aria-current={on ? "true" : undefined}
                      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                        on ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-transparent bg-muted/30")}>
                      <UserAvatar name={r.username} size={36} />
                      <span className="grid min-w-0 flex-1 leading-tight"><b className="truncate text-sm">{r.username}</b><span className="truncate text-xs text-muted-foreground">{r.player.full_name || r.player.username}</span></span>
                      <span className="grid text-right leading-tight"><b className="text-sm tabular-nums">{r.last_balance != null && r.last_balance !== "" ? money(r.last_balance) : "—"}</b>
                        <span className="text-[0.7rem] text-muted-foreground">{r.last_balance_at ? ago(r.last_balance_at) : ""}</span></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </aside>
  );
}
