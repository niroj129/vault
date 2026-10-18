"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type Tone } from "@/components/play/status-badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";

type Money = number | string;
interface Row { id: number; name: string; site: string; site_id: number; status: string; category: string; platform: string; accounts: number; clicks: number; views: number;
  deposits: Money; deposit_count: number; payers: number; cashouts: Money; net: Money }
const PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]] as const;
const statusTone = (s: string): Tone => (s === "active" ? "ok" : s === "maintenance" ? "wait" : "neutral");
const statusLabel = (s: string) => (s === "active" ? "Live" : s === "maintenance" ? "Maintenance" : "Hidden");

export default function OwnerGames() {
  const { token } = useAuth();
  const [days, setDays] = useState("30");
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => { apiFetch<{ id: number; name: string }[]>("/platform/tenants/", { token }).then(setSites).catch(() => {}); }, [token]);
  useEffect(() => {
    setRows(null);
    const p = new URLSearchParams({ days, ...(site !== "all" ? { site } : {}) });
    apiFetch<{ results: Row[] }>(`/platform/games/?${p}`, { token }).then((r) => setRows(r.results)).catch((e) => toast.error(errorText(e)));
  }, [token, days, site]);
  const max = Math.max(0, ...(rows || []).map((r) => Number(r.deposits)));

  return (
    <div className="grid gap-6">
      <PageHeader title="Games" description="How each site's games are doing: player accounts, plays and money."
        actions={<>
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-44" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
          <Select value={site} onValueChange={setSite}><SelectTrigger className="w-44" aria-label="Site"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
        </>} />
      {!rows ? <Skeleton className="h-96" /> : (
        <Card className="glass py-0">
          <Table>
            <caption className="sr-only">Games per site. Money columns cover the chosen period; accounts and plays are all-time.</caption>
            <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>Site</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Accounts</TableHead><TableHead className="text-right">Plays</TableHead>
              <TableHead className="w-1/4 text-right">Money in</TableHead><TableHead className="text-right">Cash outs</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.site_id}-${r.id}`}>
                  <TableCell><b>{r.name}</b><div className="text-xs text-muted-foreground">{[r.category, r.platform && `API: ${r.platform}`].filter(Boolean).join(" · ") || "No API (staff load)"}</div></TableCell>
                  <TableCell>{r.site}</TableCell>
                  <TableCell><StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.accounts}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.clicks.toLocaleString()}<div className="text-xs text-muted-foreground">{r.views.toLocaleString()} views</div></TableCell>
                  <TableCell><div className="grid gap-1"><span className="text-right font-semibold tabular-nums">{money(r.deposits)} <span className="font-normal text-muted-foreground">· {r.payers} payer{r.payers === 1 ? "" : "s"}</span></span>
                    <Progress value={max ? (Number(r.deposits) / max) * 100 : 0} aria-label={`${r.name} on ${r.site}: share of money in`} className="h-1.5" /></div></TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cashouts)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(r.net)}</TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No games yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
