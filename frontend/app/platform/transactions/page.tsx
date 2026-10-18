"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type Tone } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { payLabel } from "@/lib/pay-brands";

type Money = number | string;
interface Row { key: string; kind: "deposit" | "cashout"; at: string; site: string; username: string; game: string; amount: Money; loaded_amount: Money | null;
  status: string; status_label: string; load_status: string; load_label: string; method: string; via: string }

const KINDS = [["all", "Deposits and cash outs"], ["deposit", "Deposits only"], ["cashout", "Cash outs only"]] as const;
const DAYS = [["", "All time"], ["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]] as const;
const tone = (r: Row): Tone => (r.kind === "deposit" ? (r.load_status === "loaded" ? "ok" : r.status === "approved" || r.status === "pending" ? "wait" : "bad")
  : r.status === "paid" ? "ok" : r.status === "rejected" || r.status === "failed" ? "bad" : "wait");

export default function OwnerTransactions() {
  const { token } = useAuth();
  const [kind, setKind] = useState("all");
  const [site, setSite] = useState("all");
  const [days, setDays] = useState("30");
  const [q, setQ] = useState("");
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<{ results: Row[]; totals: { paid_in: Money; paid_out: Money; shown: number } } | null>(null);

  useEffect(() => { apiFetch<{ id: number; name: string }[]>("/platform/tenants/", { token }).then(setSites).catch(() => {}); }, [token]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ kind, ...(days ? { days } : {}), ...(q.trim() ? { q: q.trim() } : {}), ...(site !== "all" ? { site } : {}) });
      apiFetch<NonNullable<typeof data>>(`/platform/transactions/?${p}`, { token }).then(setData).catch((e) => toast.error(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [token, kind, site, days, q]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Transactions" description="Every deposit and cash out on every client site, newest first." />
      <div className="flex flex-wrap items-center gap-3">
        <Select value={site} onValueChange={setSite}><SelectTrigger className="w-44" aria-label="Site"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-52" aria-label="Type"><SelectValue /></SelectTrigger>
          <SelectContent>{KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        <Select value={days || "all"} onValueChange={(v) => setDays(v === "all" ? "" : v)}><SelectTrigger className="w-40" aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>{DAYS.map(([v, l]) => <SelectItem key={v || "all"} value={v || "all"}>{l}</SelectItem>)}</SelectContent></Select>
        <InputGroup className="w-full sm:w-64"><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="@player or game" aria-label="Search transactions" /></InputGroup>
      </div>
      {data && <p className="text-sm text-muted-foreground" aria-live="polite">{data.totals.shown} shown · paid in <b className="text-foreground tabular-nums">{money(data.totals.paid_in)}</b> · paid out <b className="text-foreground tabular-nums">{money(data.totals.paid_out)}</b></p>}
      {!data ? <Skeleton className="h-96" /> : (
        <Card className="glass py-0">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Site</TableHead><TableHead>Type</TableHead><TableHead>Player</TableHead><TableHead>Game</TableHead><TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.results.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-muted-foreground">{dateTime(r.at)}</TableCell>
                  <TableCell>{r.site}</TableCell>
                  <TableCell><Badge variant={r.kind === "deposit" ? "outline" : "secondary"}>{r.kind === "deposit" ? "Deposit" : "Cash out"}</Badge></TableCell>
                  <TableCell><b>@{r.username}</b></TableCell>
                  <TableCell>{r.game || "—"}</TableCell>
                  <TableCell>{r.kind === "cashout" ? payLabel(r.method) : r.method}<div className="text-xs text-muted-foreground">{r.via}</div></TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{r.kind === "cashout" ? "−" : "+"}{money(r.amount)}
                    {r.loaded_amount != null && <div className="text-xs font-normal text-muted-foreground">{money(r.loaded_amount)} loaded</div>}</TableCell>
                  <TableCell><StatusBadge tone={tone(r)}>{r.kind === "deposit" && r.load_status === "loaded" ? "Loaded" : r.kind === "deposit" && r.status === "approved" ? r.load_label : r.status_label}</StatusBadge></TableCell>
                </TableRow>
              ))}
              {!data.results.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{q ? `Nothing matches “${q}”.` : "No transactions in this period."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
