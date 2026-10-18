"use client";

import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Clock, Moon, Receipt, Sun, Wallet, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/play/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { payLabel } from "@/lib/pay-brands";
import { cn } from "@/lib/utils";

interface Txn { id: number; kind: "load" | "withdraw"; account_name: string; platform_user_id: string; amount: string; payment_method: string; operator: string; order_id: string; status: string; created_at: string }
interface Shift { loads: number; withdraws: number; net: number; count: number; by_method: Record<string, { load: number; withdraw: number }>; txns: Txn[] }
interface Report { date: string; total_loads: number; total_withdraws: number; net: number; count: number; shifts: Record<string, Shift> }
const shiftIcon = (label: string) => (label.startsWith("Morning") ? Sun : label.startsWith("Night") ? Moon : Clock);
const shiftDay = (d: string, by: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + by); return x.toISOString().slice(0, 10); };

export default function TransactionsPage() {
  const { token } = useAuth();
  const [date, setDate] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const load = useCallback((d?: string) => {
    apiFetch<Report>(`/reports/shift/${d ? `?date=${d}` : ""}`, { token }).then((r) => { setRep(r); setDate(r.date); }).catch((e) => toast.error(errorText(e)));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Transactions & shifts" description="Every load and redeem, grouped by shift. Times are Nepal time." actions={<ExportButton resource="gametxns" label="Export" />} />
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" size="icon" onClick={() => date && load(shiftDay(date, -1))} aria-label="Previous day"><ArrowLeft aria-hidden /></Button>
        <Field className="w-44"><FieldLabel htmlFor="tx-day" className="sr-only">Day</FieldLabel>
          <Input id="tx-day" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value) load(e.target.value); }} /></Field>
        <Button variant="outline" size="icon" onClick={() => date && load(shiftDay(date, 1))} aria-label="Next day"><ArrowRight aria-hidden /></Button>
        <Button variant="ghost" onClick={() => load()}>Today</Button>
      </div>
      {!rep ? <Skeleton className="h-80 rounded-xl" /> : (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {([["Loaded", money(rep.total_loads), Zap, ""], ["Redeemed", money(rep.total_withdraws), Wallet, ""],
              ["Net", money(rep.net), BarChart3, rep.net < 0 ? "text-destructive-text" : "text-success"], ["Transactions", rep.count, Receipt, ""]] as const).map(([k, v, Icon, cls]) => (
              <Card key={k} className="glass gap-1 py-4"><CardContent>
                <dt className="flex items-center justify-between text-sm text-muted-foreground">{k}<Icon className="size-5" aria-hidden /></dt>
                <dd className={cn("text-3xl font-bold tabular-nums", cls)}>{v}</dd></CardContent></Card>
            ))}
          </dl>
          {Object.entries(rep.shifts).map(([label, s]) => {
            const Icon = shiftIcon(label);
            return (
              <Card key={label} className="glass">
                <CardHeader className="flex flex-row flex-wrap items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-md bg-primary/20 text-brand-text"><Icon className="size-5" aria-hidden /></span>
                  <CardTitle className="flex-1 text-lg"><h2>{label}</h2></CardTitle>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Loads <b className="text-success tabular-nums">{money(s.loads)}</b></span><span>Redeems <b className="text-foreground tabular-nums">{money(s.withdraws)}</b></span>
                    <span>Net <b className={cn("tabular-nums", s.net < 0 ? "text-destructive-text" : "text-success")}>{money(s.net)}</b></span><span>{s.count} txns</span></p>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {Object.keys(s.by_method).length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="By payment method">
                      {Object.entries(s.by_method).map(([m, v]) => (
                        <li key={m} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"><b>{payLabel(m)}</b>
                          <span className="text-success tabular-nums">+{money(v.load)}</span><span className="tabular-nums">−{money(v.withdraw).replace("−", "")}</span></li>
                      ))}
                    </ul>
                  )}
                  {s.txns.length ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead><TableHead>By</TableHead><TableHead>Order</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                        <TableBody>{s.txns.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell><StatusBadge tone={t.kind === "load" ? "ok" : "neutral"} className="gap-1">
                              {t.kind === "load" ? <ArrowDownLeft className="size-3" aria-hidden /> : <ArrowUpRight className="size-3" aria-hidden />}{t.kind === "load" ? "Load" : "Redeem"}</StatusBadge>
                              {t.status === "failed" && <StatusBadge tone="bad" className="ml-1">Failed</StatusBadge>}</TableCell>
                            <TableCell className="font-semibold">{t.account_name || t.platform_user_id || "—"}</TableCell>
                            <TableCell className={cn("text-right font-semibold tabular-nums", t.kind === "load" && "text-success")}>{t.kind === "load" ? "+" : "−"}{money(t.amount)}</TableCell>
                            <TableCell>{payLabel(t.payment_method || "—")}</TableCell>
                            <TableCell className="text-muted-foreground">{t.operator || "—"}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{t.order_id || "—"}</TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">{(t.created_at || "").slice(11, 16)}</TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No transactions in this shift.</p>}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
