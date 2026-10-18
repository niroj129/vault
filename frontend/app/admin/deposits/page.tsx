"use client";

import { Check, CheckCircle2, ImageIcon, Plus, Receipt, Search, Wallet, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCard } from "@/components/admin/deposits/check-card";
import { LoadedDialog } from "@/components/admin/deposits/loaded-dialog";
import { GatewaySettings } from "@/components/admin/deposits/gateway-settings";
import { PayMethods } from "@/components/admin/deposits/pay-methods";
import { RecordPayment } from "@/components/admin/deposits/record-payment";
import { ScreenshotDialog } from "@/components/admin/deposits/screenshot-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, depositTone } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";
import type { StaffDeposit } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  ["check", "To check", { status: "pending", gateway: "direct" }],
  ["toload", "To load", { status: "approved", load_status: "manual,failed" }],
  ["pending", "Waiting for payment", { status: "pending", gateway: "bytepayout" }],
  ["loaded", "Loaded", { status: "approved", load_status: "loaded" }],
  ["all", "All", {}],
] as const;
type FilterKey = (typeof FILTERS)[number][0];
interface Summary { paid_today: number; paid_count_today: number; pending: number; to_check: number; needs_staff: number; redeems_waiting: number }
type Confirm = { d: StaffDeposit; action: "mark-loaded" | "approve" } | null;

export default function DepositsPage() {
  const { token, user } = useAuth();
  const [view, setView] = useState<"payments" | "methods" | "settings">("payments");
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ summary: Summary; results: StaffDeposit[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [record, setRecord] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // ?tab= from a notification; otherwise open whatever needs staff first
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "methods" || t === "settings") { setView(t); setFilter("toload"); return; }
    if (FILTERS.some(([k]) => k === t)) { setFilter(t as FilterKey); return; }
    apiFetch<{ summary: Summary }>("/admin/deposits/?status=pending&gateway=direct&limit=1", { token })
      .then((r) => setFilter(r.summary.to_check ? "check" : "toload")).catch(() => setFilter("toload"));
  }, [token]);

  const load = useCallback(() => {
    if (!filter) return;
    const f = FILTERS.find(([k]) => k === filter)![2];
    const qs = new URLSearchParams({ ...f, ...(q ? { q } : {}) } as Record<string, string>).toString();
    apiFetch<{ summary: Summary; results: StaffDeposit[] }>(`/admin/deposits/?${qs}`, { token }).then(setData).catch((e) => toast.error(errorText(e)));
  }, [filter, q, token]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useMessengerEvents((ev) => { if (ev.type === "toast") load(); });

  async function act(d: StaffDeposit, action: string) {
    setBusy(`${d.id}${action}`);
    try {
      await apiFetch(`/admin/deposits/${d.id}/${action}/`, { method: "POST", token });
      toast.success(action === "mark-loaded" ? `Marked ${money(d.credit_amount || d.amount)} loaded — @${d.user.username} was told` : action === "sync" ? "Checked with BytePayout" : "Done");
      load();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(null); }
  }
  const pick = (k: FilterKey) => { setData(null); setFilter(k); };
  const s = data?.summary;
  const kpis = [
    { key: "check" as const, label: "To check", value: s?.to_check, note: "players say they paid your QR", icon: Search, hot: !!s?.to_check },
    { key: "toload" as const, label: "To load", value: s?.needs_staff, note: "paid — waiting for staff", icon: Zap, hot: !!s?.needs_staff && !s?.to_check },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Deposits" description="Check QR payments under To check, then load the username in the game panel and mark it Loaded. The player gets a message at each step."
        actions={<Button onClick={() => setRecord(true)}><Plus aria-hidden />Record payment</Button>} />
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="payments" className="px-4">Payments</TabsTrigger>
          {user?.role === "admin" && <TabsTrigger value="methods" className="px-4">QR methods</TabsTrigger>}
          {user?.role === "admin" && <TabsTrigger value="settings" className="px-4">Settings</TabsTrigger>}
        </TabsList>
      </Tabs>

      {view === "methods" ? <PayMethods /> : view === "settings" ? <GatewaySettings /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((k) => (
              <button key={k.key} type="button" onClick={() => pick(k.key)} aria-pressed={filter === k.key}
                className={cn("grid gap-2 rounded-xl border p-4 text-left transition-[background-color,border-color] duration-200", k.hot ? "border-warning/60 bg-warning/10" : "glass hover:bg-accent")}>
                <span className="flex items-center justify-between text-sm text-muted-foreground">{k.label}<k.icon className={cn("size-5", k.hot && "text-warning")} aria-hidden /></span>
                <span className="text-3xl font-bold tabular-nums">{k.value ?? "—"}</span><span className="text-sm text-muted-foreground">{k.note}</span>
              </button>
            ))}
            <Card className="glass gap-2 p-4"><span className="flex items-center justify-between text-sm text-muted-foreground">Paid today<Wallet className="size-5" aria-hidden /></span>
              <span className="text-3xl font-bold tabular-nums">{s ? money(s.paid_today) : "—"}</span><span className="text-sm text-muted-foreground">{s?.paid_count_today ?? 0} payments · {s?.pending ?? 0} checkouts open</span></Card>
            <Link href="/admin/redeems" className="glass grid gap-2 rounded-xl border p-4 transition-colors duration-200 hover:bg-accent">
              <span className="flex items-center justify-between text-sm text-muted-foreground">Cash outs waiting<Receipt className="size-5" aria-hidden /></span>
              <span className="text-3xl font-bold tabular-nums">{s?.redeems_waiting ?? "—"}</span><span className="text-sm text-muted-foreground">review requests</span></Link>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={filter || ""} onValueChange={(v) => pick(v as FilterKey)} className="min-w-0">
              <TabsList className="scrollbar-none max-w-full justify-start overflow-x-auto">
                {FILTERS.map(([k, l]) => (
                  <TabsTrigger key={k} value={k} className="shrink-0 px-3">{l}{k === "check" && !!s?.to_check && <Badge className="ml-1 bg-warning text-background">{s.to_check}</Badge>}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <InputGroup className="lg:w-72"><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
              <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Player, game or code" aria-label="Search deposits" /></InputGroup>
          </div>

          {!data ? <Skeleton className="h-64 rounded-xl" /> : filter === "check" ? (
            data.results.length === 0 ? (
              <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><CheckCircle2 aria-hidden /></EmptyMedia><EmptyTitle>All checked</EmptyTitle>
                <EmptyDescription>When a player pays your QR and taps “I&apos;ve paid”, it shows up here with their screenshot.</EmptyDescription></EmptyHeader></Empty>
            ) : <ul className="grid gap-4 xl:grid-cols-2">{data.results.map((d) => <li key={d.id}><CheckCard d={d} onDone={load} onZoom={setZoom} /></li>)}</ul>
          ) : data.results.length === 0 ? (
            <Empty className="border"><EmptyHeader><EmptyTitle>Nothing here</EmptyTitle><EmptyDescription>{filter === "toload" ? "Every paid deposit is loaded." : "No deposits match."}</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Card className="glass overflow-x-auto py-0">
              <Table>
                <caption className="sr-only">Deposits</caption>
                <TableHeader><TableRow><TableHead className="pl-4">Player</TableHead><TableHead>Game · username</TableHead><TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody>{data.results.map((d) => {
                  const [tone, label] = depositTone(d);
                  const toLoad = d.status === "approved" && (d.load_status === "manual" || d.load_status === "failed");
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="pl-4"><b>@{d.user.username}</b><div className="text-sm text-muted-foreground">{d.direct ? <>code <code className="font-mono">{d.code}</code></> : `ref ${d.reference.slice(-8)}`}</div></TableCell>
                      <TableCell>{d.game?.name || "—"}
                        {d.login ? <div className="mt-1 flex w-fit items-center rounded-md bg-muted pl-2"><code className="font-mono text-sm">{d.login}</code><CopyButton value={d.login} label="game username" size="icon-xs" /></div>
                          : d.status === "approved" && <p className="mt-1 text-sm text-destructive-text">No username — create one and message the player</p>}</TableCell>
                      <TableCell className="text-right"><b className="tabular-nums">{money(d.amount)}</b>
                        {Number(d.credit_amount) > 0 && Number(d.credit_amount) !== Number(d.amount) && <div className="text-sm text-muted-foreground tabular-nums">loads {money(d.credit_amount)}</div>}
                        {d.promo_code && <Badge variant="secondary" className="mt-1 font-mono">{d.promo_code} +{money(d.bonus_amount)}</Badge>}</TableCell>
                      <TableCell><div className="flex items-center gap-2">
                        {d.proof && <button type="button" onClick={() => setZoom(d.proof)} aria-label={`View @${d.user.username}'s screenshot`} className="relative h-11 w-8 shrink-0 overflow-hidden rounded border pointer-coarse:w-11">
                          <Image src={mediaUrl(d.proof)} alt="" fill sizes="32px" className="object-cover" /></button>}
                        <span>{d.method_label}{d.direct && <Badge variant="secondary" className="ml-1">QR</Badge>}
                          {d.gateway === "manual" && <span className="block text-sm text-muted-foreground">by {d.created_by}</span>}
                          {d.checked_by && <span className="block text-sm text-muted-foreground">checked by {d.checked_by}</span>}</span></div></TableCell>
                      <TableCell><StatusBadge tone={tone}>{label}</StatusBadge>{d.load_error && <p className="mt-1 max-w-56 text-sm text-destructive-text">{d.load_error}</p>}
                        {d.direct && d.status === "rejected" && d.note && <p className="mt-1 max-w-56 text-sm text-muted-foreground">{d.note}</p>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={new Date(d.created_at).toLocaleString()}>{ago(d.created_at)}</TableCell>
                      <TableCell className="pr-4"><div className="flex justify-end gap-1">
                        {d.status === "pending" && d.gateway === "bytepayout" && <Button variant="outline" size="sm" disabled={busy === `${d.id}sync`} onClick={() => act(d, "sync")}>Check</Button>}
                        {d.status === "pending" && d.gateway === "bytepayout" && user?.role === "admin" && <Button variant="ghost" size="sm" onClick={() => setConfirm({ d, action: "approve" })}>Mark paid</Button>}
                        {d.status === "pending" && d.direct && <Button variant="outline" size="sm" onClick={() => pick("check")}>Review</Button>}
                        {toLoad && <Button size="sm" disabled={busy === `${d.id}mark-loaded`} onClick={() => setConfirm({ d, action: "mark-loaded" })}><Check aria-hidden />Mark loaded</Button>}
                        {toLoad && d.game?.automated && <Button variant="ghost" size="sm" disabled={busy === `${d.id}retry`} onClick={() => act(d, "retry")}>Load by API</Button>}
                      </div></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
      {record && <RecordPayment onClose={() => setRecord(false)} onDone={() => { setRecord(false); load(); }} />}
      <ScreenshotDialog src={zoom} title="Payment screenshot" onClose={() => setZoom(null)} />
      <LoadedDialog deposit={confirm?.action === "mark-loaded" ? confirm.d : null} username={confirm?.d.user.username} onClose={() => setConfirm(null)}
        onSubmit={async (v) => {
          const d = confirm!.d;
          await apiFetch(`/admin/deposits/${d.id}/mark-loaded/`, { method: "POST", token, body: { loaded_amount: v } });
          toast.success(`Marked ${money(v)} loaded — @${d.user.username} was told`); load();
        }} />
      <AlertDialog open={confirm?.action === "approve"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === "approve" ? `Mark ${money(confirm.d.amount)} from @${confirm.d.user.username} as paid?` : `Loaded ${confirm ? money(confirm.d.credit_amount || confirm.d.amount) : ""} on ${confirm?.d.game?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.action === "approve" ? "Only do this if the money arrived. It moves to To load." : "Only confirm after you've added the credits in the game panel. The player gets a message."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void act(confirm.d, confirm.action)}>{confirm?.action === "approve" ? "Yes, it's paid" : "Yes, it's loaded"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
