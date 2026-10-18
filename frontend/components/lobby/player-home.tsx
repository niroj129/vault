"use client";

import { ArrowRight, Headset, KeyRound, MessageCircle, Wallet, Zap, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { VipProgress } from "@/components/common/vip-progress";
import { GameLoginsVault } from "@/components/play/game-logins-vault";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMessenger } from "@/lib/messenger";
import { money } from "@/lib/format";
import type { Deposit } from "@/lib/types";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The latest payment, so "where's my load?" is answered on Home. */
function LatestPayment({ d }: { d?: Deposit }) {
  if (!d) {
    return (
      <Link href="/load" className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3 transition-colors duration-200 hover:bg-accent">
        <span className="grid size-10 place-items-center rounded-md bg-primary/20 text-brand-text"><Zap className="size-5" aria-hidden /></span>
        <span className="grid flex-1"><b>Load your first game</b><span className="text-sm text-muted-foreground">Pay with Chime, Cash App and more — we load it for you.</span></span>
        <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
      </Link>
    );
  }
  const open = d.status === "pending" || (d.status === "approved" && d.load_status !== "loaded");
  const text = d.status === "pending" ? (d.direct ? "We're checking your payment" : "Waiting for your payment")
    : d.status === "approved" && d.load_status !== "loaded" ? "Paid — loading your game now"
    : d.load_status === "loaded" ? `${money(d.credit_amount || d.amount)} loaded` : d.status_label;
  return (
    <Link href={open ? `/load?ref=${d.reference}` : `/load?game=${d.game?.id ?? ""}`}
      className={cn("flex items-center gap-3 rounded-lg border p-3 transition-colors duration-200 hover:bg-accent", open ? "border-warning/50 bg-warning/10" : "bg-muted/50")}>
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-primary/20">
        {d.game?.thumbnail ? <Image src={mediaUrl(d.game.logo || d.game.thumbnail)} alt="" fill sizes="40px" className="object-cover" /> : <Zap className="size-5" aria-hidden />}
      </span>
      <span className="grid min-w-0 flex-1">
        <b className="flex items-center gap-2">{open && <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />}{text}</b>
        <span className="truncate text-sm text-muted-foreground">{money(d.amount)} · {d.game?.name || "game"} · {d.method_label}</span>
      </span>
      <span className="hidden items-center gap-1 text-sm font-semibold text-brand-text xs:inline-flex">{open ? "Track" : "Load again"}<ArrowRight className="size-4" aria-hidden /></span>
    </Link>
  );
}

/** Signed-in player's Home: loads this month, latest payment, VIP progress, shortcuts, their games. */
export function PlayerHome() {
  const { user, token, ready } = useAuth();
  const { unread, enabled } = useMessenger();
  const [deps, setDeps] = useState<Deposit[] | null>(null);

  useEffect(() => {
    if (user?.role !== "user") return;
    const get = () => apiFetch<Deposit[]>("/play/deposits/", { token }).then(setDeps).catch(() => setDeps([]));
    void get();
    const t = setInterval(get, 20000);
    return () => clearInterval(t);
  }, [user, token]);

  if (!ready || !user || user.role !== "user") return null;
  const name = user.full_name?.split(" ")[0] || user.username;
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const loaded = (deps || []).filter((d) => d.load_status === "loaded" && new Date(d.created_at) >= month).reduce((t, d) => t + Number(d.amount), 0);
  const shortcuts: [string, LucideIcon, string, number?][] = [
    ["/load", Zap, "Load"],
    ...(enabled ? [["/messages", MessageCircle, "Messages", unread] as [string, LucideIcon, string, number]] : []),
    ["/profile#logins", KeyRound, "Game logins"],
    ["/load?tab=redeem", Wallet, "Cash out"],
  ];

  return (
    <section aria-label="Your account" className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card className="glass gap-4 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_55%)]">
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.full_name || user.username} src={user.avatar} size={48} />
            <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">{greeting()}</p><h1 className="truncate text-2xl">{name}</h1></div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Loaded this month</p>
              <div className="text-2xl font-bold tabular-nums">{deps === null ? <Skeleton className="ml-auto h-8 w-20" /> : money(loaded)}</div>
            </div>
          </div>
          {deps === null ? <Skeleton className="h-16" /> : <LatestPayment d={deps[0]} />}
          <VipProgress user={user} />
          <nav aria-label="Shortcuts" className="grid grid-cols-4 gap-2">
            {shortcuts.map(([href, Icon, label, badge]) => (
              <Link key={href} href={href} className="grid justify-items-center gap-1.5 rounded-lg border bg-muted/40 px-1 py-3 text-center text-sm font-medium transition-colors duration-200 hover:bg-accent">
                <span className="relative grid size-11 place-items-center rounded-md bg-primary/20 text-brand-text">
                  <Icon className="size-5" aria-hidden />
                  {!!badge && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-xs leading-5 font-bold text-destructive-foreground">{badge > 9 ? "9+" : badge}<span className="sr-only"> unread</span></span>}
                </span>
                {label}
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg"><KeyRound className="size-5 text-brand-text" aria-hidden />Your games</h2>
            <Link href="/profile#logins" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-text hover:underline">All logins</Link>
          </div>
          <GameLoginsVault compact />
          <Link href="/messages?c=support" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <Headset className="size-4" aria-hidden />Need an account on another game? Ask support
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
