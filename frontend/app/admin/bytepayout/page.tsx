"use client";

import { CircleAlert, Info, Landmark, Percent, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, depositTone } from "@/components/play/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, dateTime, money } from "@/lib/format";
import type { DepositStatus, LoadStatus } from "@/lib/types";

type Money = number | string;
interface Data {
  account: "owner" | "own" | "none"; live: { balance: Money; currency: string } | null; error: string;
  held: { paid_in: Money; fees: Money; net: Money; paid_out: Money; balance: Money; payments: number } | null;
  month: { paid: Money; count: number; fees: Money; waiting: number };
  payouts: { id: number; amount: Money; note: string; created_at: string }[];
  recent: { id: number; at: string; username: string; game: string; method: string; amount: Money; fee: Money; status: DepositStatus; status_label: string; load_status: LoadStatus; load_label: string }[];
}

export default function SiteBytePayout() {
  const { token } = useAuth();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { apiFetch<Data>("/bytepayout/", { token }).then(setD).catch((e) => toast.error(errorText(e))); }, [token]);

  return (
    <div className="grid gap-6">
      <PageHeader title="BytePayout" description="Card and app payments from your players, and the balance you have with BytePayout." />
      {!d ? <div className="grid gap-4"><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div> : <>
        {d.account === "none" && (
          <Alert className="border-warning/60 bg-warning/10"><CircleAlert className="text-warning" aria-hidden />
            <AlertTitle>BytePayout isn&apos;t connected</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">Players can only pay your own QR methods until it is. Ask the platform owner to connect your site, or add your own keys.
              <Button asChild size="sm"><Link href="/admin/deposits?tab=settings">Add your own keys</Link></Button></AlertDescription></Alert>
        )}
        {d.account === "owner" && (
          <Alert><Info aria-hidden /><AlertTitle>Your BytePayout account is held by the platform</AlertTitle>
            <AlertDescription>Card and app payments go into the platform owner&apos;s BytePayout account. Your balance below is what is held for you after BytePayout&apos;s fee. The owner pays it out to you and records each payout here.</AlertDescription></Alert>
        )}
        {d.error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive-text"><CircleAlert className="size-4" aria-hidden />{d.error}</p>}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {d.account === "owner" && d.held ? <>
            <StatCard icon={Landmark} label="Held for you" value={money(d.held.balance)} note="Paid in, minus fees and payouts" />
            <StatCard icon={TrendingUp} label="Paid in, all time" value={money(d.held.paid_in)} note={`${d.held.payments} payment${d.held.payments === 1 ? "" : "s"}`} />
            <StatCard icon={Percent} label="BytePayout fees" value={money(d.held.fees)} note="Taken from each payment" />
            <StatCard icon={Wallet} label="Paid out to you" value={money(d.held.paid_out)} note={`${d.payouts.length} payout${d.payouts.length === 1 ? "" : "s"}`} />
          </> : <>
            <StatCard icon={Landmark} label="BytePayout balance" value={d.live ? money(d.live.balance) : d.account === "own" ? "Can't read" : "Not connected"} note={d.live ? `${d.live.currency} · live from BytePayout` : d.error || "Add your keys in Deposits → Settings"} tone={!d.live ? "warn" : undefined} />
            <StatCard icon={TrendingUp} label="Paid in, 30 days" value={money(d.month.paid)} note={`${d.month.count} payment${d.month.count === 1 ? "" : "s"}`} />
            <StatCard icon={Percent} label="Fees, 30 days" value={money(d.month.fees)} note="Taken from each payment" />
            <StatCard icon={Wallet} label="Waiting for payment" value={String(d.month.waiting)} note="Started but not paid" />
          </>}
        </div>

        {d.account === "owner" && (
          <Card className="glass gap-0 py-0">
            <CardHeader className="py-4"><CardTitle className="text-lg"><h2>Payouts you received</h2></CardTitle></CardHeader>
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{d.payouts.map((p) => <TableRow key={p.id}><TableCell>{dateTime(p.created_at)}</TableCell><TableCell className="text-muted-foreground">{p.note || "—"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(p.amount)}</TableCell></TableRow>)}
                {!d.payouts.length && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No payouts yet. Ask the platform owner in Platform support.</TableCell></TableRow>}</TableBody></Table>
          </Card>
        )}

        <Card className="glass gap-0 py-0">
          <CardHeader className="py-4"><CardTitle className="text-lg"><h2>Latest BytePayout payments</h2></CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Player</TableHead><TableHead>Game</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{d.recent.map((r) => { const [tone, label] = depositTone(r); return (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{ago(r.at)}</TableCell><TableCell><b>@{r.username}</b></TableCell><TableCell>{r.game || "—"}</TableCell><TableCell>{r.method}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(r.amount)}<div className="text-xs font-normal text-muted-foreground">fee {money(r.fee)}</div></TableCell>
                <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
              </TableRow>); })}
              {!d.recent.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No BytePayout payments yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </Card>
      </>}
    </div>
  );
}
