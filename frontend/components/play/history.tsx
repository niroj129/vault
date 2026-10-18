"use client";

import { ArrowDownLeft, ArrowUpRight, ImageIcon, Receipt } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiFetch, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import type { Deposit, Redeem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge, depositTone, redeemTone } from "./status-badge";

type Row = (Deposit & { kind: "deposit" }) | (Redeem & { kind: "redeem" });

/** Loads and cash outs together, newest first, with this month's totals. */
export function History() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [show, setShow] = useState<"all" | "deposit" | "redeem">("all");
  useEffect(() => {
    void Promise.all([
      apiFetch<Deposit[]>("/play/deposits/", { token }).catch(() => [] as Deposit[]),
      apiFetch<Redeem[]>("/play/redeems/", { token }).catch(() => [] as Redeem[]),
    ]).then(([d, r]) => setRows([...d.map((x) => ({ ...x, kind: "deposit" as const })), ...r.map((x) => ({ ...x, kind: "redeem" as const }))]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())));
  }, [token]);

  if (rows === null) return <div className="grid gap-4"><div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;
  if (!rows.length) {
    return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Receipt aria-hidden /></EmptyMedia><EmptyTitle>No payments yet</EmptyTitle>
      <EmptyDescription>Your loads and cash outs will show up here.</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild><Link href="/load">Load a game</Link></Button></EmptyContent></Empty>;
  }
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const inMonth = rows.filter((x) => new Date(x.created_at) >= month);
  const loaded = inMonth.filter((x) => x.kind === "deposit" && x.load_status === "loaded").reduce((t, x) => t + Number(x.amount), 0);
  const out = inMonth.filter((x) => x.kind === "redeem" && x.status === "paid").reduce((t, x) => t + Number(x.amount), 0);
  const open = rows.filter((x) => x.kind === "deposit" ? x.status === "pending" || (x.status === "approved" && x.load_status !== "loaded") : x.status === "pending" || x.status === "approved").length;
  const list = rows.filter((x) => show === "all" || x.kind === show);

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {([["Loaded this month", money(loaded), ""], ["Cashed out this month", money(out), ""], ["In progress", String(open), open ? "text-warning" : ""]] as const).map(([k, v, cls], i) => (
          <Card key={k} className={cn("glass gap-1 py-4", i === 2 && "col-span-2 sm:col-span-1")}>
            <CardContent><dt className="text-sm text-muted-foreground">{k}</dt><dd className={cn("text-2xl font-bold tabular-nums", cls)}>{v}</dd></CardContent>
          </Card>
        ))}
      </dl>
      <Card className="glass">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg"><h2>Activity</h2></CardTitle>
          <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as typeof show)} aria-label="Show">
            <ToggleGroupItem value="all">All</ToggleGroupItem><ToggleGroupItem value="deposit">Loads</ToggleGroupItem><ToggleGroupItem value="redeem">Cash outs</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? <p className="text-muted-foreground">Nothing here yet.</p> : (
            <ul className="divide-y">
              {list.map((d) => {
                const [tone, label] = d.kind === "deposit" ? depositTone(d) : redeemTone(d);
                const live = d.kind === "deposit" && d.status === "pending";
                const shown = d.kind === "deposit" && d.load_status === "loaded" ? d.credit_amount || d.amount : d.amount;
                return (
                  <li key={`${d.kind}${d.id}`} className="flex items-center gap-3 py-3">
                    <span className="relative grid size-11 shrink-0 place-items-center rounded-md bg-muted">
                      {d.game?.thumbnail && <Image src={mediaUrl(d.game.logo || d.game.thumbnail)} alt="" fill sizes="44px" className="rounded-md object-cover" />}
                      <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full ring-2 ring-card", d.kind === "redeem" ? "bg-primary text-primary-foreground" : "bg-success text-background")}>
                        {d.kind === "redeem" ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownLeft className="size-3" aria-hidden />}
                      </span>
                    </span>
                    <div className="grid min-w-0 flex-1">
                      <b className="truncate">{d.kind === "redeem" ? `Cash out from ${d.game?.name || "a game"}` : `Load ${d.game?.name || ""}`}</b>
                      <span className="truncate text-sm text-muted-foreground">
                        {d.kind === "redeem" ? `to ${d.payout_label || d.payout_method} ${d.payout_handle}` : `${d.method_label}${d.direct ? ` · code ${d.code}` : ""}`} · {dateTime(d.created_at)}
                      </span>
                    </div>
                    <div className="grid justify-items-end gap-1">
                      <b className={cn("tabular-nums", d.kind === "deposit" && "text-success")}>{d.kind === "redeem" ? "−" : "+"}{money(shown)}</b>
                      {live ? <Link href={`/load?ref=${d.reference}`} className="rounded-full focus-visible:outline-2"><StatusBadge tone={tone}>{label} ›</StatusBadge></Link>
                        : <StatusBadge tone={tone}>{label}</StatusBadge>}
                      {d.kind === "redeem" && d.proof && (
                        <a href={mediaUrl(d.proof)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-text hover:underline">
                          <ImageIcon className="size-3.5" aria-hidden />Receipt</a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
