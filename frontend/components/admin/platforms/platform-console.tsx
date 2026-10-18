"use client";

import { CircleAlert, CircleCheck, Layers, MousePointerClick, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AccountPanel } from "./account-panel";
import { AccountWorkspace } from "./account-workspace";
import { CreateAccount } from "./create-account";

/** Every connected game platform: pick one, then work on any of its accounts by game login name. */
export function PlatformConsole() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // prefilled login name while the dialog is open
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    apiFetch<Platform[]>("/admin/platforms/", { token }).then(setPlatforms).catch((e) => { toast.error(errorText(e)); setPlatforms([]); });
  }, [token]);
  useEffect(() => { if (token) load(); }, [token, load]);

  const wanted = Number(params.get("p")) || null;
  const current = platforms?.find((p) => p.id === wanted) || platforms?.[0] || null;
  const pick = (id: number) => { router.replace(`/admin/gameplatform?p=${id}`, { scroll: false }); setAccount(null); };
  const changed = useCallback(() => { load(); setReloadKey((k) => k + 1); }, [load]);

  async function refreshPoints() {
    if (!current) return;
    setRefreshing(true);
    try { await apiFetch(`/game-providers/${current.id}/test/`, { method: "POST", token }); toast.success(`${current.name} agent points updated`); }
    catch (e) { toast.error(errorText(e)); } finally { setRefreshing(false); load(); }
  }

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Games" title="Game platforms" description="Pick a platform, then find any account by its game login to check the balance, load, redeem, reset or kick out — with its full history."
        actions={<Button asChild variant="outline"><Link href="/admin/game-apis"><Layers aria-hidden />Connections</Link></Button>} />

      {!platforms ? <Skeleton className="h-14 rounded-xl" aria-busy="true" />
        : !platforms.length ? (
          <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Layers aria-hidden /></EmptyMedia><EmptyTitle>No game platforms connected</EmptyTitle>
            <EmptyDescription>Add a connection (Juwa, Game Vault, Orion Stars and others) and it appears here.</EmptyDescription></EmptyHeader>
            <EmptyContent><Button asChild><Link href="/admin/game-apis"><Plus aria-hidden />Add a connection</Link></Button></EmptyContent></Empty>
        ) : current && (
          <>
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto p-1" role="group" aria-label="Game platforms">
              {platforms.map((p) => {
                const on = current.id === p.id; const bad = !!p.last_error || !p.is_active;
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => pick(p.id)}
                    className={cn("flex min-h-12 shrink-0 items-center gap-2.5 rounded-full border py-2 pr-4 pl-3 text-sm font-semibold transition-[border-color,background-color,box-shadow] duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                      on ? "border-primary bg-primary text-primary-foreground shadow-md hover:bg-primary" : "glass")}>
                    {bad ? <CircleAlert className={cn("size-4", on ? "" : "text-warning")} aria-label={p.is_active ? "Needs attention" : "Switched off"} /> : <CircleCheck className={cn("size-4", on ? "" : "text-success")} aria-label="Connected" />}
                    {p.name}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", on ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{p.agent_balance != null && p.agent_balance !== "" ? money(p.agent_balance) : "—"}</span>
                  </button>
                );
              })}
            </div>

            {(current.last_error || !current.is_active) && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/60 bg-warning/10 p-3 text-sm">
                <span>{current.is_active ? <>Last check failed: <span className="font-medium">{current.last_error.slice(0, 160)}</span></> : <>This connection is switched off.</>}</span>
                <Button asChild size="sm" variant="outline"><Link href="/admin/game-apis">Fix in Connections</Link></Button>
              </div>
            )}

            <dl className="glass flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border p-4">
              <div className="grid"><dt className="text-xs text-muted-foreground">Agent points</dt>
                <dd className="flex items-center gap-1"><b className="text-2xl tabular-nums">{current.agent_balance != null && current.agent_balance !== "" ? money(current.agent_balance) : "—"}</b>
                  <Button variant="ghost" size="icon-sm" onClick={refreshPoints} disabled={refreshing} aria-label={`Refresh ${current.name} points`}>{refreshing ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}</Button></dd>
                <span className="text-xs text-muted-foreground">{current.last_checked ? `checked ${ago(current.last_checked)}` : "not checked yet"}</span></div>
              <div className="grid"><dt className="text-xs text-muted-foreground">Games</dt><dd className="font-semibold">{current.games.map((g) => g.name).join(", ") || "None linked"}</dd></div>
              <div className="grid"><dt className="text-xs text-muted-foreground">Connection</dt><dd className="font-semibold">{current.kind_label.split(" — ")[0]}</dd></div>
              <div className="grid"><dt className="text-xs text-muted-foreground">Player accounts</dt><dd className="font-semibold tabular-nums">{current.accounts}</dd></div>
            </dl>

            <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <AccountPanel platform={current} selected={account} reloadKey={reloadKey} onSelect={setAccount} onNew={() => setCreating("")} />
              {account ? <AccountWorkspace key={`${current.id}:${account.toLowerCase()}`} platform={current} username={account} onChanged={changed} onCreate={(u) => setCreating(u)} /> : (
                <div className="glass grid min-h-72 place-content-center justify-items-center gap-3 rounded-2xl border p-8 text-center">
                  <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-brand-text"><MousePointerClick className="size-7" aria-hidden /></span>
                  <h2 className="text-xl font-semibold">Pick an account</h2>
                  <p className="max-w-sm text-muted-foreground">Choose one from the list, or type a game login on the left and press Enter to look it up on {current.name}. You&apos;ll see its balance and can load, redeem, reset or kick it out.</p>
                </div>
              )}
            </div>

            <Dialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)}>
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader><DialogTitle>New {current.name} account</DialogTitle><DialogDescription>Creates the account on {current.name} right now.</DialogDescription></DialogHeader>
                {creating !== null && <CreateAccount bare key={`${current.id}:${creating}`} platform={current} prefill={creating} onCreated={changed} onOpen={(u) => { setCreating(null); setAccount(u); }} />}
              </DialogContent>
            </Dialog>
          </>
        )}
    </div>
  );
}
