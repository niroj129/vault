"use client";

import { Banknote, Gamepad2, Hourglass, Landmark, Scale, Server, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, depositTone } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money, shortDate } from "@/lib/format";
import type { DepositStatus, LoadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Money = number | string;
interface Overview {
  days: number;
  kpis: { sites: number; sites_active: number; sites_overdue: number; mrr: Money; players: number; new_players: number; active_players: number;
    deposits: Money; deposit_count: number; cashouts: Money; cashout_count: number; net: Money; to_check: number; to_load: number; cashouts_waiting: number };
  daily: { date: string; deposits: Money; cashouts: Money }[];
  sites: { id: number; name: string; slug: string; is_platform: boolean; is_active: boolean; plan: string; overdue: boolean; players: number; new_players: number;
    last_seen: string | null; deposits: Money; deposit_count: number; cashouts: Money; net: Money }[];
  games: { name: string; deposits: Money; deposit_count: number; players: number; sites: number; accounts: number }[];
  methods: { label: string; via: string; amount: Money; count: number }[];
  recent: { id: number; site: string; username: string; game: string; amount: Money; status: DepositStatus; status_label: string; load_status: LoadStatus; load_label: string; method: string; created_at: string }[];
}
interface SiteOpt { id: number; name: string }

const PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]] as const;
const chartConfig = { deposits: { label: "Money in", color: "var(--chart-1)" }, cashouts: { label: "Money out", color: "var(--chart-4)" } } satisfies ChartConfig;
const n = (v: Money) => Number(v || 0);

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { const m = matchMedia("(prefers-reduced-motion: reduce)"); setR(m.matches); const f = () => setR(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return r;
}

/** A row's share of the biggest value, as a labelled bar (value is also written next to it). */
const Share = ({ value, max, label }: { value: number; max: number; label: string }) => <Progress value={max ? (value / max) * 100 : 0} aria-label={label} className="h-1.5" />;

export default function OwnerOverview() {
  const { token } = useAuth();
  const [days, setDays] = useState("30");
  const [site, setSite] = useState("all");
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [d, setD] = useState<Overview | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => { apiFetch<SiteOpt[]>("/platform/tenants/", { token }).then(setSites).catch(() => {}); }, [token]);
  useEffect(() => {
    setD(null);
    const q = new URLSearchParams({ days, ...(site !== "all" ? { site } : {}) });
    apiFetch<Overview>(`/platform/analytics/?${q}`, { token }).then(setD).catch((e) => toast.error(errorText(e)));
  }, [token, days, site]);

  const chart = useMemo(() => (d?.daily || []).map((x) => ({ ...x, deposits: n(x.deposits), cashouts: n(x.cashouts) })), [d]);
  const k = d?.kpis;
  const siteName = site === "all" ? "all sites" : sites.find((s) => String(s.id) === site)?.name;
  const maxGame = Math.max(0, ...(d?.games || []).map((g) => n(g.deposits)));
  const maxMethod = Math.max(0, ...(d?.methods || []).map((m) => n(m.amount)));
  const totalMethods = (d?.methods || []).reduce((a, m) => a + n(m.amount), 0);
  const period = PERIODS.find(([v]) => v === days)?.[1].toLowerCase();

  return (
    <div className="grid gap-6">
      <PageHeader title="Overview" description={`Money, players and games across ${siteName}, ${period}.`}
        actions={<>
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-44" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
          <Select value={site} onValueChange={setSite}><SelectTrigger className="w-48" aria-label="Site"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
        </>} />

      {!d || !k ? (
        <div className="grid gap-4"><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>
      ) : <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={TrendingUp} label="Money in" value={money(k.deposits)} note={`${k.deposit_count} paid deposit${k.deposit_count === 1 ? "" : "s"}`} />
          <StatCard icon={Banknote} label="Money out" value={money(k.cashouts)} note={`${k.cashout_count} cash out${k.cashout_count === 1 ? "" : "s"} paid`} />
          <StatCard icon={Scale} label="Net" value={money(k.net)} note="In minus out" tone={n(k.net) < 0 ? "warn" : undefined} />
          <StatCard icon={Hourglass} label="Waiting on staff" value={String(k.to_check + k.to_load + k.cashouts_waiting)}
            note={`${k.to_check} to check · ${k.to_load} to load · ${k.cashouts_waiting} cash outs`} tone={k.to_check + k.to_load + k.cashouts_waiting ? "warn" : undefined} />
          <StatCard icon={Users} label="Players" value={k.players.toLocaleString()} note={`${k.new_players} new · ${k.active_players} signed in`} href="/platform/players" />
          <StatCard icon={Gamepad2} label="Top game" value={d.games[0]?.name || "—"} note={d.games[0] ? `${money(d.games[0].deposits)} from ${d.games[0].players} players` : "No deposits yet"} />
          <StatCard icon={Server} label="Client sites" value={`${k.sites_active}/${k.sites}`} note={k.sites_overdue ? `${k.sites_overdue} overdue on payment` : "Active / total"} href="/platform/sites" tone={k.sites_overdue ? "warn" : undefined} />
          <StatCard icon={Landmark} label="Monthly revenue" value={money(k.mrr)} note="From active client sites" href="/platform/sites" />
        </div>

        <Card className="glass">
          <CardHeader><CardTitle className="text-lg"><h2>Money in and out per day</h2></CardTitle>
            <CardDescription>Paid deposits and paid cash outs, {siteName}.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <ChartContainer config={chartConfig} className="h-72 w-full" role="img" aria-label={`Bar chart of money in and out per day. Total in ${money(k.deposits)}, total out ${money(k.cashouts)}.`}>
              <BarChart data={chart} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => shortDate(v)} />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v)} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} formatter={(v, name) => (
                  <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span><b className="tabular-nums">{money(Number(v))}</b></span>
                )} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="deposits" fill="var(--color-deposits)" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} />
                <Bar dataKey="cashouts" fill="var(--color-cashouts)" radius={[3, 3, 0, 0]} isAnimationActive={!reduced} />
              </BarChart>
            </ChartContainer>
            <Collapsible>
              <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-fit">Show the numbers</Button></CollapsibleTrigger>
              <CollapsibleContent>
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table><TableHeader><TableRow><TableHead>Day</TableHead><TableHead className="text-right">Money in</TableHead><TableHead className="text-right">Money out</TableHead></TableRow></TableHeader>
                    <TableBody>{[...chart].reverse().filter((x) => x.deposits || x.cashouts).map((x) => (
                      <TableRow key={x.date}><TableCell>{shortDate(x.date)}</TableCell><TableCell className="text-right tabular-nums">{money(x.deposits)}</TableCell><TableCell className="text-right tabular-nums">{money(x.cashouts)}</TableCell></TableRow>
                    ))}</TableBody></Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card className="glass gap-0 py-0">
          <CardHeader className="py-4"><CardTitle className="text-lg"><h2>By site</h2></CardTitle><CardDescription>Click a site to see only its numbers.</CardDescription></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Site</TableHead><TableHead className="text-right">Players</TableHead><TableHead className="text-right">Money in</TableHead>
              <TableHead className="text-right">Money out</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Last player sign-in</TableHead></TableRow></TableHeader>
            <TableBody>{d.sites.map((s) => (
              <TableRow key={s.id} className={cn(String(s.id) === site && "bg-primary/10")}>
                <TableCell>
                  <button type="button" onClick={() => setSite(String(s.id) === site ? "all" : String(s.id))} className="inline-flex min-h-11 items-center gap-2 text-left font-semibold hover:underline" aria-pressed={String(s.id) === site}>
                    {s.name}</button>
                  <span className="ml-2 inline-flex gap-1">{s.is_platform && <Badge variant="secondary">Yours</Badge>}{!s.is_active && <StatusBadge tone="wait">Suspended</StatusBadge>}{s.overdue && <StatusBadge tone="bad">Overdue</StatusBadge>}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.players}{s.new_players ? <span className="text-muted-foreground"> · +{s.new_players}</span> : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{money(s.deposits)}<div className="text-xs text-muted-foreground">{s.deposit_count} deposits</div></TableCell>
                <TableCell className="text-right tabular-nums">{money(s.cashouts)}</TableCell>
                <TableCell className={cn("text-right font-semibold tabular-nums", n(s.net) < 0 && "text-destructive-text")}>{money(s.net)}</TableCell>
                <TableCell className="text-muted-foreground">{s.last_seen ? ago(s.last_seen) : "never"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="glass gap-0 py-0">
            <CardHeader className="py-4"><CardTitle className="text-lg"><h2>By game</h2></CardTitle><CardDescription>Accounts are game logins players have. Money is paid deposits.</CardDescription></CardHeader>
            {d.games.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>Game</TableHead><TableHead className="text-right">Accounts</TableHead><TableHead className="text-right">Payers</TableHead><TableHead className="w-2/5 text-right">Money in</TableHead></TableRow></TableHeader>
                <TableBody>{d.games.map((g) => (
                  <TableRow key={g.name}>
                    <TableCell><b>{g.name}</b>{site === "all" && g.sites > 1 && <div className="text-xs text-muted-foreground">on {g.sites} sites</div>}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.accounts}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.players}</TableCell>
                    <TableCell><div className="grid gap-1"><span className="text-right font-semibold tabular-nums">{money(g.deposits)} <span className="font-normal text-muted-foreground">· {g.deposit_count}</span></span>
                      <Share value={n(g.deposits)} max={maxGame} label={`${g.name} share of money in`} /></div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            ) : <p className="px-6 pb-6 text-sm text-muted-foreground">No paid deposits in this period.</p>}
          </Card>

          <Card className="glass gap-0 py-0">
            <CardHeader className="py-4"><CardTitle className="text-lg"><h2>By payment method</h2></CardTitle><CardDescription>Your own QR codes, BytePayout, and payments staff recorded.</CardDescription></CardHeader>
            {d.methods.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Through</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="w-2/5 text-right">Money in</TableHead></TableRow></TableHeader>
                <TableBody>{d.methods.map((m) => (
                  <TableRow key={`${m.label}-${m.via}`}>
                    <TableCell><b>{m.label}</b></TableCell>
                    <TableCell><Badge variant={m.via === "Your QR" ? "default" : "outline"}>{m.via}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                    <TableCell><div className="grid gap-1"><span className="text-right font-semibold tabular-nums">{money(m.amount)} <span className="font-normal text-muted-foreground">· {totalMethods ? Math.round((n(m.amount) / totalMethods) * 100) : 0}%</span></span>
                      <Share value={n(m.amount)} max={maxMethod} label={`${m.label} share of money in`} /></div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            ) : <p className="px-6 pb-6 text-sm text-muted-foreground">No paid deposits in this period.</p>}
          </Card>
        </div>

        <Card className="glass gap-0 py-0">
          <CardHeader className="py-4"><CardTitle className="text-lg"><h2>Latest payments</h2></CardTitle><CardDescription>Newest first, every status.</CardDescription></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead>{site === "all" && <TableHead>Site</TableHead>}<TableHead>Player</TableHead><TableHead>Game</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{d.recent.map((r) => {
              const [tone, label] = depositTone(r);
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{ago(r.created_at)}</TableCell>
                  {site === "all" && <TableCell>{r.site}</TableCell>}
                  <TableCell><b>@{r.username}</b></TableCell>
                  <TableCell>{r.game || "—"}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(r.amount)}</TableCell>
                  <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                </TableRow>
              );
            })}
            {!d.recent.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No payments yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </Card>
      </>}
    </div>
  );
}
