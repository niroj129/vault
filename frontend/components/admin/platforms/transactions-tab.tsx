"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/play/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import type { AccountHistory, Platform, RemoteHistory } from "@/lib/types";
import { cn } from "@/lib/utils";

const when = (t: string) => { const d = new Date(t.replace(/\//g, "-").replace(" ", "T")); return Number.isNaN(d.getTime()) ? t : dateTime(d.toISOString()); };

/** The game's own record of this account when it offers one; otherwise what we sent to the game. */
export function TransactionsTab({ platform, username, linked, hist }: { platform: Platform; username: string; linked: boolean; hist: AccountHistory | null }) {
  const { token } = useAuth();
  const [remote, setRemote] = useState<RemoteHistory | null>(null);
  const [source, setSource] = useState<"game" | "site">("game");
  useEffect(() => {
    let live = true;
    apiFetch<RemoteHistory>(`/admin/platforms/${platform.id}/remote-history/?username=${encodeURIComponent(username)}`, { token })
      .then((r) => { if (live) { setRemote(r); if (!r.supported) setSource("site"); } })
      .catch((e) => live && setRemote({ supported: true, rows: [], message: e instanceof Error ? e.message : "The platform didn't answer." }));
    return () => { live = false; };
  }, [platform.id, username, token]);

  const showGame = source === "game" && remote?.supported;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {remote?.supported && (
          <div role="group" aria-label="Where to read the records from" className="flex gap-1 rounded-full bg-muted p-1">
            {([["game", `From ${platform.name}`], ["site", "Recorded here"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={source === k} onClick={() => setSource(k)}
                className={cn("min-h-9 rounded-full px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring", source === k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{l}</button>
            ))}
          </div>
        )}
        {remote && !remote.supported && <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{platform.name} doesn’t give out its own history, so this is what we sent to it.</p>}
      </div>

      {showGame ? (
        remote.message ? <p role="alert" className="glass rounded-xl border p-6 text-center text-sm text-destructive-text">{remote.message}</p>
          : !remote.rows.length ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">{platform.name} has no records for this account in the last 30 days.</p> : (
            <div className="glass overflow-x-auto rounded-xl border">
              <Table>
                <caption className="sr-only">Records {platform.name} holds for {username}, newest first</caption>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance before</TableHead><TableHead className="text-right">Balance after</TableHead></TableRow></TableHeader>
                <TableBody>
                  {remote.rows.map((r, i) => (
                    <TableRow key={`${r.time}-${i}`}>
                      <TableCell className="whitespace-nowrap">{when(r.time)}</TableCell>
                      <TableCell>{r.amount >= 0 ? "Load" : "Redeem"}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", r.amount >= 0 && "text-success")}>{r.amount >= 0 ? "+" : "−"}{money(Math.abs(r.amount))}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.balance_before != null && r.balance_before !== "" ? money(r.balance_before) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.balance_after != null && r.balance_after !== "" ? money(r.balance_after) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
      ) : !remote ? <Skeleton className="h-40 rounded-xl" />
        : !linked ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">We only record loads and redeems for accounts tied to a player. Link this account to start.</p>
        : !hist ? <Skeleton className="h-40 rounded-xl" />
        : !hist.transactions.length ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">No loads or redeems sent to {platform.name} from here yet.</p> : (
          <div className="glass overflow-x-auto rounded-xl border">
            <Table>
              <caption className="sr-only">Loads and redeems sent to {platform.name} for {username}, newest first</caption>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance after</TableHead><TableHead>Method</TableHead><TableHead>By</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {hist.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{dateTime(t.created_at)}</TableCell><TableCell>{t.kind === "load" ? "Load" : "Redeem"}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", t.kind === "load" && "text-success")}>{t.kind === "load" ? "+" : "−"}{money(t.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.balance_after != null && t.balance_after !== "" ? money(t.balance_after) : "—"}</TableCell>
                    <TableCell>{t.method || "—"}</TableCell><TableCell>{t.operator || "—"}</TableCell>
                    <TableCell><StatusBadge tone={t.status === "success" ? "ok" : t.status === "failed" ? "bad" : "wait"}>{t.status}</StatusBadge>{t.status !== "success" && t.note ? <span className="mt-1 block max-w-48 text-xs text-muted-foreground">{t.note}</span> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
}
