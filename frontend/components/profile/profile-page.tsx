"use client";

import { ArrowDownLeft, Heart, KeyRound, LogOut, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VipProgress } from "@/components/common/vip-progress";
import { GameTile } from "@/components/lobby/game-tile";
import { GameLoginsVault } from "@/components/play/game-logins-vault";
import { StatusBadge, depositTone } from "@/components/play/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import type { Deposit, Game } from "@/lib/types";
import { PrivacyAndAlerts } from "./privacy-and-alerts";
import { ProfileHeader } from "./profile-header";
import { PasswordCard, RewardsCard } from "./rewards-and-password";

function Head({ icon: Icon, title, href, linkLabel }: { icon: typeof Wallet; title: string; href?: string; linkLabel?: string }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-2">
      <CardTitle className="flex items-center gap-2 text-lg"><Icon className="size-5 text-brand-text" aria-hidden /><h2>{title}</h2></CardTitle>
      {href && <Link href={href} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-text hover:underline">{linkLabel}</Link>}
    </CardHeader>
  );
}

export function ProfilePage() {
  const { user, token, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [deps, setDeps] = useState<Deposit[] | null>(null);
  const [favs, setFavs] = useState<{ id: number; game_detail: Game }[]>([]);
  const isPlayer = user?.role === "user";

  useEffect(() => {
    void refreshUser().catch(() => {});
    if (isPlayer) apiFetch<Deposit[]>("/play/deposits/", { token }).then(setDeps).catch(() => setDeps([]));
    apiFetch<{ id: number; game_detail: Game }[]>("/favorites/", { token }).then(setFavs).catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps -- load once per session
  if (!user) return null;
  const loaded = (deps || []).filter((d) => d.load_status === "loaded").reduce((t, d) => t + Number(d.amount), 0);

  return (
    <div className="grid gap-6">
      <ProfileHeader />
      {isPlayer && (
        <dl className="grid grid-cols-3 gap-4 lg:grid-cols-[1fr_1fr_1fr_2fr]">
          {([["Loaded", deps === null ? null : money(loaded)], ["Points", (user.loyalty_points ?? 0).toLocaleString()], ["Referrals", String(user.referral_count ?? 0)]] as const).map(([k, v]) => (
            <Card key={k} className="glass gap-1 py-4"><CardContent><dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-2xl font-bold tabular-nums">{v === null ? <Skeleton className="h-8 w-16" /> : v}</dd></CardContent></Card>
          ))}
          <Card className="glass col-span-3 py-4 lg:col-span-1"><CardContent><dt className="sr-only">VIP tier</dt><dd><VipProgress user={user} /></dd></CardContent></Card>
        </dl>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
          {isPlayer && (
            <Card className="glass scroll-mt-24" id="logins">
              <Head icon={KeyRound} title="Game logins" href="/load" linkLabel="Load a game" />
              <CardContent><GameLoginsVault /></CardContent>
            </Card>
          )}
          {isPlayer && (
            <Card className="glass" id="wallet">
              <Head icon={Wallet} title="Recent payments" href="/load?tab=history" linkLabel="All activity" />
              <CardContent>
                {deps === null ? <Skeleton className="h-28" /> : deps.length === 0 ? (
                  <p className="text-muted-foreground">No payments yet. <Link className="font-semibold text-brand-text underline underline-offset-2" href="/load">Load a game</Link></p>
                ) : (
                  <ul className="divide-y">
                    {deps.slice(0, 5).map((d) => {
                      const [tone, label] = depositTone(d);
                      return (
                        <li key={d.id} className="flex items-center gap-3 py-3">
                          <span className="relative grid size-11 shrink-0 place-items-center rounded-md bg-muted">
                            {d.game?.thumbnail ? <Image src={mediaUrl(d.game.logo || d.game.thumbnail)} alt="" fill sizes="44px" className="rounded-md object-cover" /> : <ArrowDownLeft className="size-5" aria-hidden />}
                          </span>
                          <span className="grid min-w-0 flex-1"><b className="truncate">Load {d.game?.name}</b><span className="text-sm text-muted-foreground">{d.method_label} · {shortDate(d.created_at)}</span></span>
                          <span className="grid justify-items-end gap-1"><b className="text-success tabular-nums">+{money(d.load_status === "loaded" ? d.credit_amount || d.amount : d.amount)}</b>
                            <StatusBadge tone={tone}>{label}</StatusBadge></span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {favs.length > 0 && (
            <Card className="glass">
              <Head icon={Heart} title="Favourites" />
              <CardContent><ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{favs.map((f) => <li key={f.id}><GameTile game={f.game_detail} /></li>)}</ul></CardContent>
            </Card>
          )}
        </div>
        <div className="grid gap-6">
          <PrivacyAndAlerts />
          {isPlayer && <RewardsCard />}
          <PasswordCard />
          <Button variant="outline" className="w-full" onClick={async () => { await logout(); router.push("/"); }}><LogOut aria-hidden />Log out</Button>
        </div>
      </div>
    </div>
  );
}
