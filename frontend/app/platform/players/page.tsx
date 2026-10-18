"use client";

import { ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge, type Tone } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money, shortDate } from "@/lib/format";
import { payLabel } from "@/lib/pay-brands";

type Money = number | string;
interface GameAcc { game: string; username: string }
interface Row { id: number; username: string; full_name: string; site: string; site_id: number; is_active: boolean; date_joined: string; last_login: string | null;
  deposits: Money; deposit_count: number; cashouts: Money; last_deposit: string | null; games: GameAcc[] }
interface Detail { id: number; username: string; full_name: string; email: string; phone: string; site: string; is_active: boolean; date_joined: string; last_login: string | null;
  agent: string; games: GameAcc[];
  deposits: { id: number; amount: Money; game: string; method: string; status: string; status_label: string; load_status: string; loaded_amount: Money | null; created_at: string }[];
  cashouts: { id: number; amount: Money; game: string; method: string; status: string; status_label: string; created_at: string }[] }

const SORTS = [["deposits", "Most deposits"], ["new", "Newest"], ["seen", "Recently seen"], ["name", "Name A–Z"]] as const;
const depTone = (s: string, l: string): Tone => (l === "loaded" ? "ok" : s === "approved" || s === "pending" ? "wait" : "bad");
const outTone = (s: string): Tone => (s === "paid" ? "ok" : s === "rejected" || s === "failed" ? "bad" : "wait");

function PlayerSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { token } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => { setD(null); if (id) apiFetch<Detail>(`/platform/players/${id}/`, { token }).then(setD).catch((e) => toast.error(errorText(e))); }, [id, token]);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d ? d.full_name || `@${d.username}` : "Player"}</SheetTitle>
          <SheetDescription>{d ? `${d.full_name ? `@${d.username} · ` : ""}Plays on ${d.site}` : "Loading…"}</SheetDescription>
        </SheetHeader>
        {!d ? <div className="grid gap-3 px-4"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : (
          <div className="grid gap-6 px-4 pb-6">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([["Joined", shortDate(d.date_joined)], ["Last sign-in", d.last_login ? ago(d.last_login) : "never"], ["Agent", d.agent || "—"],
                ["Status", d.is_active ? "Active" : "Disabled"], ["Email", d.email || "—"], ["Phone", d.phone || "—"]] as const).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
              ))}
            </dl>
            <section className="grid gap-2" aria-labelledby="pl-games">
              <h3 id="pl-games" className="text-sm font-semibold">Game accounts</h3>
              {d.games.length ? <ul className="grid gap-1.5">{d.games.map((g) => (
                <li key={`${g.game}-${g.username}`} className="flex justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"><b>{g.game}</b><code className="truncate font-mono">{g.username}</code></li>
              ))}</ul> : <p className="text-sm text-muted-foreground">No game accounts yet.</p>}
            </section>
            <section className="grid gap-2" aria-labelledby="pl-dep">
              <h3 id="pl-dep" className="text-sm font-semibold">Deposits</h3>
              {d.deposits.length ? <ul className="divide-y rounded-md border">{d.deposits.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="grid min-w-0 flex-1"><b className="tabular-nums">{money(x.amount)} · {x.game || "—"}</b>
                    <span className="truncate text-muted-foreground">{x.method} · {shortDate(x.created_at)}{x.loaded_amount != null ? ` · ${money(x.loaded_amount)} loaded` : ""}</span></span>
                  <StatusBadge tone={depTone(x.status, x.load_status)}>{x.load_status === "loaded" ? "Loaded" : x.status_label}</StatusBadge>
                </li>
              ))}</ul> : <p className="text-sm text-muted-foreground">No deposits yet.</p>}
            </section>
            <section className="grid gap-2" aria-labelledby="pl-out">
              <h3 id="pl-out" className="text-sm font-semibold">Cash outs</h3>
              {d.cashouts.length ? <ul className="divide-y rounded-md border">{d.cashouts.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="grid min-w-0 flex-1"><b className="tabular-nums">{money(x.amount)} · {x.game || "—"}</b>
                    <span className="truncate text-muted-foreground">{payLabel(x.method)} · {shortDate(x.created_at)}</span></span>
                  <StatusBadge tone={outTone(x.status)}>{x.status_label}</StatusBadge>
                </li>
              ))}</ul> : <p className="text-sm text-muted-foreground">No cash outs yet.</p>}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function OwnerPlayers() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [site, setSite] = useState("all");
  const [sort, setSort] = useState("deposits");
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<{ count: number; results: Row[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { apiFetch<{ id: number; name: string }[]>("/platform/tenants/", { token }).then(setSites).catch(() => {}); }, [token]);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ sort, ...(q.trim() ? { q: q.trim() } : {}), ...(site !== "all" ? { site } : {}) });
      apiFetch<{ count: number; results: Row[] }>(`/platform/players/?${p}`, { token }).then(setData).catch((e) => toast.error(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [token, q, site, sort]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Players" description="Every player on every site: which games they have, what they paid and what they cashed out." />
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:w-80"><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, @username, game login, phone" aria-label="Search players" /></InputGroup>
        <Select value={site} onValueChange={setSite}><SelectTrigger className="w-44" aria-label="Site"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sites</SelectItem>{sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={setSort}><SelectTrigger className="w-44" aria-label="Sort by"><SelectValue /></SelectTrigger>
          <SelectContent>{SORTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        {data && <p className="text-sm text-muted-foreground" aria-live="polite">{data.count.toLocaleString()} player{data.count === 1 ? "" : "s"}{data.count > data.results.length ? `, showing ${data.results.length}` : ""}</p>}
      </div>
      {!data ? <Skeleton className="h-96" /> : (
        <Card className="glass py-0">
          <Table>
            <TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Site</TableHead><TableHead>Games</TableHead>
              <TableHead className="text-right">Paid in</TableHead><TableHead className="text-right">Cashed out</TableHead><TableHead>Last seen</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {data.results.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                  <TableCell>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }} className="flex min-h-11 items-center gap-3 text-left">
                      <UserAvatar name={r.full_name || r.username} size={36} />
                      <span className="grid"><b>@{r.username}</b><span className="text-xs text-muted-foreground">{r.full_name || `joined ${shortDate(r.date_joined)}`}</span></span>
                    </button>
                  </TableCell>
                  <TableCell>{r.site}{!r.is_active && <StatusBadge tone="bad" className="ml-2">Disabled</StatusBadge>}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal"><div className="flex flex-wrap gap-1">
                    {r.games.length ? r.games.map((g) => <Badge key={`${g.game}-${g.username}`} variant="outline" title={`Username ${g.username}`}>{g.game}</Badge>) : <span className="text-muted-foreground">—</span>}</div></TableCell>
                  <TableCell className="text-right tabular-nums"><b>{money(r.deposits)}</b><div className="text-xs text-muted-foreground">{r.deposit_count} deposit{r.deposit_count === 1 ? "" : "s"}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cashouts)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.last_login ? ago(r.last_login) : "never"}</TableCell>
                  <TableCell><ChevronRight className="size-4 text-muted-foreground" aria-hidden /></TableCell>
                </TableRow>
              ))}
              {!data.results.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{q ? `No players match “${q}”.` : "No players yet."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      )}
      <PlayerSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
