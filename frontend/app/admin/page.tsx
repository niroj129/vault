"use client";

import { ArrowRight, Check, Gamepad2, Landmark, MessageCircle, Receipt, Search, Trophy, Users, Wallet, X, Zap, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatCard } from "@/components/admin/stat-card";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge, depositTone } from "@/components/play/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";
import type { Conversation, StaffDeposit } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Stats {
  players: number; active_users: number; online_now: number; messages_today: number; unanswered_chats: number; deposits_today: number;
  today_loads: number; today_withdraws: number; deposits_to_check: number; deposits_needing_staff: number; redeems_waiting: number; open_reports: number;
  active_games: number; total_games: number; low_points: number; today_cashout: number; current_shift: string;
  latest_winner: { name: string; amount: string; game: string } | null;
}
interface Setup { done: number; total: number; steps: { key: string; title: string; hint: string; done: boolean; href: string }[] }
interface TopGame { slug: string; name: string; thumbnail: string | null; category: string; clicks: number; views: number }

const num = (v: number | undefined) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const shortAgo = (iso?: string) => { if (!iso) return ""; const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [hideSetup, setHideSetup] = useState(false);
  const [top, setTop] = useState<TopGame[]>([]);
  const [inbox, setInbox] = useState<Conversation[] | null>(null);
  const [pays, setPays] = useState<StaffDeposit[] | null>(null);
  const [bp, setBp] = useState<{ ok: boolean; held?: boolean; data?: { balance: string }; detail?: string } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch<Stats>("/stats/admin/", { token }).then(setS).catch(() => {});
    apiFetch<{ results: StaffDeposit[] }>("/admin/deposits/?limit=7", { token }).then((d) => setPays(d.results.slice(0, 7))).catch(() => setPays([]));
    apiFetch<Conversation[]>("/messenger/conversations/", { token }).then((cs) => setInbox(cs.filter((c) => c.kind === "support" || c.kind === "direct").slice(0, 6))).catch(() => setInbox([]));
  }, [token]);
  useEffect(() => {
    if (!token) return;
    load();
    apiFetch<Setup>("/admin/setup/", { token }).then(setSetup).catch(() => {});
    apiFetch<TopGame[]>("/stats/top-games/", { token }).then(setTop).catch(() => {});
    apiFetch<{ ok: boolean; held?: boolean; data?: { balance: string }; detail?: string }>("/admin/gateway-balance/", { token }).then(setBp).catch(() => {});
    try { setHideSetup(localStorage.getItem("admin_setup_hidden") === "1"); } catch { /* ignore */ }
  }, [token, load]);
  useMessengerEvents((ev) => { if (["message", "report", "toast"].includes(ev.type)) load(); });

  if (!s) return <div className="grid gap-4"><Skeleton className="h-16" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div><Skeleton className="h-72" /></div>;
  const maxClicks = Math.max(1, ...top.map((g) => g.clicks));
  const shift = (s.current_shift || "").split(" ")[0];
  const toLoad = s.deposits_needing_staff - (s.deposits_to_check || 0);
  const alerts: [boolean, LucideIcon, string, string, string, string][] = [
    [s.deposits_to_check > 0, Search, `${s.deposits_to_check} QR payment${s.deposits_to_check > 1 ? "s" : ""} to check`, "Players say they've paid.", "/admin/deposits?tab=check", "Check now"],
    [toLoad > 0, Wallet, `${toLoad} paid deposit${toLoad > 1 ? "s" : ""} waiting to be loaded`, "Load them in the game panel, then mark them Loaded.", "/admin/deposits?tab=toload", "Load them"],
    [s.redeems_waiting > 0, Receipt, `${s.redeems_waiting} cash out${s.redeems_waiting > 1 ? "s" : ""} waiting for approval`, "Redeem, approve, then pay the player.", "/admin/redeems", "Review"],
  ];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1"><h1 className="text-3xl">{greeting()}, {user?.full_name?.split(" ")[0] || user?.username}</h1>
          <p className="text-muted-foreground">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · here&apos;s your casino today.</p></div>
        {shift && <StatusBadge tone="ok">{shift} shift</StatusBadge>}
      </header>

      {setup && setup.done < setup.total && !hideSetup && (
        <Card className="glass relative">
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Hide checklist"
            onClick={() => { setHideSetup(true); try { localStorage.setItem("admin_setup_hidden", "1"); } catch { /* ignore */ } }}><X aria-hidden /></Button>
          <CardContent className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <div className="grid content-start gap-2">
              <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">Getting started</p>
              <h2 className="text-xl">Finish setting up your casino</h2>
              <p className="text-sm text-muted-foreground">A few steps and your site is ready for players.</p>
              <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{setup.done}/{setup.total}</span><Progress value={(setup.done / setup.total) * 100} aria-label="Setup progress" /></div>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {setup.steps.map((st) => (
                <li key={st.key}>
                  <Link href={st.href} className={cn("flex h-full gap-3 rounded-lg border p-3 transition-colors duration-200 hover:bg-accent", st.done && "opacity-70")}>
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", st.done && "border-success bg-success text-background")}>{st.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}</span>
                    <span className="grid gap-0.5"><b className="text-sm">{st.title}<span className="sr-only">{st.done ? " — done" : " — to do"}</span></b><span className="text-sm text-muted-foreground">{st.hint}</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Players" value={num(s.players)} note={`${num(s.active_users)} active accounts`} href="/admin/players" />
        <StatCard icon={Zap} label="Online now" value={num(s.online_now)} note={`${num(s.messages_today)} message${s.messages_today === 1 ? "" : "s"} today`} />
        <StatCard icon={MessageCircle} label="Unanswered chats" value={num(s.unanswered_chats)} note="Players waiting on a reply" href="/admin/messages" tone={s.unanswered_chats ? "warn" : undefined} />
        <StatCard icon={Wallet} label="Deposits today" value={money(s.deposits_today)} note={`${money(s.today_loads)} loaded · ${money(s.today_withdraws)} redeemed`} href="/admin/deposits" />
      </div>

      {alerts.filter(([on]) => on).map(([, Icon, title, text, href, cta]) => (
        <Alert key={href} className="border-warning/60 bg-warning/10">
          <Icon className="text-warning" aria-hidden />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">{text}
            <Button asChild size="sm"><Link href={href}>{cta}<ArrowRight aria-hidden /></Link></Button></AlertDescription>
        </Alert>
      ))}

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg"><h2>Recent payments</h2></CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/admin/deposits?tab=all">All deposits</Link></Button></CardHeader>
          <CardContent>
            {pays === null ? <Skeleton className="h-48" /> : pays.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet. Every payment shows up here live.</p> : (
              <ul className="divide-y">{pays.map((d) => {
                const [tone, label] = depositTone(d);
                const tab = d.status === "pending" && d.direct ? "check" : d.status === "approved" && d.load_status !== "loaded" ? "toload" : "all";
                return (
                  <li key={d.id}><Link href={`/admin/deposits?tab=${tab}`} className="flex items-center gap-3 rounded-md py-2.5 transition-colors duration-150 hover:bg-accent">
                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                      {d.game?.thumbnail ? <Image src={mediaUrl(d.game.logo || d.game.thumbnail)} alt="" fill sizes="40px" className="object-cover" /> : <Wallet className="size-4" aria-hidden />}</span>
                    <span className="grid min-w-0 flex-1"><b>@{d.user.username}</b><span className="truncate text-sm text-muted-foreground">{d.game?.name || "—"} · {d.method_label}</span></span>
                    <span className="grid justify-items-end gap-1"><b className="tabular-nums">{money(d.amount)}</b><StatusBadge tone={tone}>{label}</StatusBadge></span>
                  </Link></li>
                );
              })}</ul>
            )}
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg"><h2>Inbox</h2></CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/admin/messages">Open inbox</Link></Button></CardHeader>
          <CardContent>
            {inbox === null ? <Skeleton className="h-48" /> : inbox.length === 0 ? <p className="text-sm text-muted-foreground">No conversations yet. When players message support, they show up here.</p> : (
              <ul className="divide-y">{inbox.map((c) => {
                const who = c.kind === "support" ? c.subject : c.members.find((p) => p.id !== user?.id);
                const m = c.last_message;
                return (
                  <li key={c.id}><Link href={`/admin/messages?c=${c.id}`} className="flex items-center gap-3 rounded-md py-2.5 transition-colors duration-150 hover:bg-accent">
                    <UserAvatar name={c.title} src={who?.avatar} size={40} online={who?.online} />
                    <span className="grid min-w-0 flex-1"><b className="truncate">{c.title}</b>
                      <span className={cn("truncate text-sm", c.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>{m ? (m.deleted ? "Message deleted" : (m.sender === user?.id ? "You: " : "") + (m.body || "Photo")) : "No messages yet"}</span></span>
                    <span className="grid justify-items-end gap-1"><span className="text-xs text-muted-foreground">{shortAgo(m?.created_at)}</span>
                      {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs leading-5 font-bold text-primary-foreground">{c.unread}<span className="sr-only"> unread</span></span>}</span>
                  </Link></li>
                );
              })}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg"><h2>Game activity</h2></CardTitle>
          <Button asChild variant="ghost" size="sm"><Link href="/admin/games">All games</Link></Button></CardHeader>
        <CardContent>
          {top.length ? (
            <ul className="grid gap-3" aria-label="Plays per game">
              {top.slice(0, 7).map((g) => (
                <li key={g.slug} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">{g.thumbnail && <Image src={mediaUrl(g.thumbnail)} alt="" fill sizes="36px" className="object-cover" />}</span>
                    <span className="grid min-w-0"><b className="truncate text-sm">{g.name}</b><span className="truncate text-xs text-muted-foreground">{g.category || "—"}</span></span>
                  </span>
                  <Progress value={(g.clicks / maxClicks) * 100} aria-label={`${g.name}: ${num(g.clicks)} plays`} />
                  <span className="w-24 text-right text-sm tabular-nums"><b>{num(g.clicks)}</b> <span className="text-muted-foreground">plays</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No plays yet. Plays are counted when players open a game&apos;s link.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {([[Landmark, bp ? (bp.ok ? money(bp.data?.balance) : "Not connected") : "…", bp?.held ? "BytePayout held for you" : "BytePayout balance", "/admin/bytepayout", !!bp && !bp.ok],
          [Gamepad2, `${s.active_games}/${s.total_games}`, "Games live", "/admin/games", false], [Zap, num(s.low_points), "Games low on points", "/admin/points", s.low_points > 0],
          [Wallet, money(s.today_cashout), "Cash outs today", "/admin/redeems", false],
          [Trophy, s.latest_winner ? `${s.latest_winner.name} · ${money(s.latest_winner.amount)}` : "Add a winner", s.latest_winner ? `Latest winner · ${s.latest_winner.game}` : "Shown on the lobby", "/admin/winners", false]] as const).map(([Icon, v, l, href, warn]) => (
          <Link key={l} href={href} className={cn("flex items-center gap-3 rounded-xl border p-4 transition-colors duration-200 hover:bg-accent", warn ? "border-warning/60 bg-warning/10" : "glass")}>
            <Icon className={cn("size-5 shrink-0", warn ? "text-warning" : "text-brand-text")} aria-hidden /><span className="grid min-w-0"><b className="truncate tabular-nums">{v}</b><span className="truncate text-sm text-muted-foreground">{l}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
