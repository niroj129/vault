"use client";

import { ArrowDownToLine, Gift, Receipt, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/play/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import type { AdminUser, StaffDeposit, StaffRedeem } from "@/lib/types";

interface Row { key: string; at: string; icon: LucideIcon; title: string; sub: string; tone: "ok" | "wait" | "bad"; status: string }

const tone = (s: string): Row["tone"] => (["approved", "paid", "loaded"].includes(s) ? "ok" : ["rejected", "failed", "expired"].includes(s) ? "bad" : "wait");

/** One timeline of a player's loads and cash outs. */
export function Activity({ player }: { player: AdminUser }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      apiFetch<{ results: StaffDeposit[] }>(`/admin/deposits/?user=${player.id}&limit=40`, { token }),
      apiFetch<StaffRedeem[]>(`/admin/redeems/?user=${player.id}`, { token }),
    ]).then(([d, r]) => {
      if (!live) return;
      const deps: Row[] = d.results.map((x) => ({
        key: `d${x.id}`, at: x.created_at, icon: x.free_play ? Gift : Wallet,
        title: x.free_play ? `Free play ${money(x.credit_amount)} on ${x.game?.name || "a game"}` : `${money(x.amount)} on ${x.game?.name || "a game"}${x.promo_code ? ` · promo ${x.promo_code}` : ""}`,
        sub: `${x.method_label}${x.status === "approved" ? ` · ${x.load_label.toLowerCase()}` : ""}`,
        tone: x.status === "approved" && x.load_status !== "loaded" ? "wait" : tone(x.status), status: x.status === "approved" ? x.load_label : x.status_label,
      }));
      const outs: Row[] = r.map((x) => ({
        key: `r${x.id}`, at: x.created_at, icon: Receipt, title: `Cash out ${money(x.amount)} from ${x.game?.name || "a game"}`,
        sub: `${x.payout_label}${x.payout_handle ? ` · ${x.payout_handle}` : ""}`, tone: tone(x.status), status: x.status_label,
      }));
      setPending(r.filter((x) => x.status === "pending").length);
      setRows([...deps, ...outs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));
    }).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [player.id, token]);

  if (!rows) return <div className="grid gap-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  return (
    <div className="grid gap-3">
      {pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
          <span><b>{pending}</b> cash out{pending === 1 ? "" : "s"} waiting for your review.</span>
          <Button asChild size="sm"><Link href="/agent/cashouts"><ArrowDownToLine aria-hidden />Review</Link></Button>
        </div>
      )}
      {!rows.length ? <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">No loads or cash outs yet.</p> : (
        <ol className="grid gap-2" aria-label="Activity, newest first">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted"><r.icon className="size-4" aria-hidden /></span>
              <span className="grid min-w-0 flex-1 leading-tight"><b className="truncate text-sm">{r.title}</b><span className="truncate text-xs text-muted-foreground">{r.sub} · {dateTime(r.at)}</span></span>
              <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
