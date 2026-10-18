"use client";

import { Headset, Lock, MessageCircle, Play, ShieldCheck, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/common/copy-button";
import { CreateAccountButton } from "@/components/common/create-account-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { GameDetail, GameLogin, PlayOptions } from "@/lib/types";

/** The signed-in player's own login for this game (undefined while loading). */
function useMyLogin(gameId: number) {
  const { user, token } = useAuth();
  const [login, setLogin] = useState<GameLogin | null | undefined>(undefined);
  useEffect(() => {
    if (!user || user.role !== "user") { setLogin(null); return; }
    apiFetch<PlayOptions>("/play/options/", { token })
      .then((o) => setLogin(o.games.find((g) => g.id === gameId)?.login || null)).catch(() => setLogin(null));
  }, [user, token, gameId]);
  return { player: user?.role === "user", login };
}

async function openGame(game: GameDetail) {
  let url = game.user_link || game.play_url;
  try { url = (await apiFetch<{ url: string }>(`/games/${game.slug}/click/`, { method: "POST" })).url || url; } catch { /* use the stored link */ }
  window.open(url, "_blank", "noopener");
}

/** Hero buttons: players get Load first; visitors get Play / Create account. One primary CTA per screen. */
export function PlayButtons({ game }: { game: GameDetail }) {
  const { player } = useMyLogin(game.id);
  const link = game.user_link || game.play_url;
  if (player) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg"><Link href={`/load?game=${game.id}`}><Zap aria-hidden />Load {game.name}</Link></Button>
        {link && <Button size="lg" variant="outline" onClick={() => openGame(game)}><Play aria-hidden />Play now<span className="sr-only"> (opens in a new tab)</span></Button>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {link ? (
        <>
          <Button size="lg" onClick={() => openGame(game)}><Play aria-hidden />Play now<span className="sr-only"> (opens in a new tab)</span></Button>
          <CreateAccountButton size="lg" variant="outline" />
        </>
      ) : (
        <>
          <CreateAccountButton size="lg" />
          <Button asChild size="lg" variant="outline"><Link href="/messages?c=support"><MessageCircle aria-hidden />Talk to an agent</Link></Button>
        </>
      )}
    </div>
  );
}

/** Side card: sign-up pitch for visitors; the player's login + Load for players. */
export function GameSetupCard({ game }: { game: GameDetail }) {
  const { player, login } = useMyLogin(game.id);
  if (player) {
    return (
      <Card className="glass">
        <CardHeader>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><span className="size-2 rounded-full bg-success" aria-hidden />Your account</p>
          <CardTitle className="text-lg"><h2>{login ? `Your ${game.name} login` : `Get on ${game.name}`}</h2></CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {login === undefined ? <Skeleton className="h-12" /> : login ? (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <span className="text-sm text-muted-foreground">Username</span>
              <code className="flex-1 truncate font-mono font-semibold">{login.username}</code>
              <CopyButton value={login.username} label="username" />
            </div>
          ) : <p className="text-muted-foreground">Load it once — tell us your {game.name} username, or we&apos;ll make one and send it in chat.</p>}
          <Button asChild className="w-full"><Link href={`/load?game=${game.id}`}><Zap aria-hidden />Load {game.name}</Link></Button>
          {login && <Button asChild variant="outline" className="w-full"><Link href={`/load?tab=redeem&game=${game.id}`}><Wallet aria-hidden />Cash out</Link></Button>}
          <Button asChild variant="ghost" className="w-full"><Link href="/messages?c=support"><Headset aria-hidden />Message support</Link></Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="glass">
      <CardHeader>
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><span className="size-2 rounded-full bg-success" aria-hidden />Agents online</p>
        <CardTitle className="text-lg"><h2>Get set up for {game.name}</h2></CardTitle>
        <CardDescription>Create your account, pay with Chime, Cash App and more — we load {game.name} for you in minutes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <CreateAccountButton className="w-full" />
        <Button asChild variant="outline" className="w-full"><Link href="/messages?c=support"><MessageCircle aria-hidden />Chat with an agent</Link></Button>
        <ul className="grid gap-2 border-t pt-3 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" aria-hidden />Verified agents only</li>
          <li className="flex items-center gap-2"><Zap className="size-4 text-success" aria-hidden />Fast loads</li>
          <li className="flex items-center gap-2"><Lock className="size-4 text-success" aria-hidden />Private &amp; secure</li>
        </ul>
      </CardContent>
    </Card>
  );
}
