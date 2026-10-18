import { ArrowRight, Flame, Gift, Headset, Home as HomeIcon, MessageCircle, ShieldCheck, Sparkles, Trophy, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CreateAccountButton } from "@/components/common/create-account-button";
import { categoryIcon } from "@/components/common/icons";
import { JsonLd } from "@/components/common/json-ld";
import { GameRail } from "@/components/lobby/game-rail";
import { GameTile } from "@/components/lobby/game-tile";
import { HeroCarousel, type Slide } from "@/components/lobby/hero-carousel";
import { PlayerHome } from "@/components/lobby/player-home";
import { RecentGames } from "@/components/lobby/recent-games";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mediaUrl } from "@/lib/api";
import { money } from "@/lib/format";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Announcement, Category, Game, Promo, SiteFAQ, SiteSettings, Winner } from "@/lib/types";

export const dynamic = "force-dynamic";

function daysAgo(d: string) {
  const diff = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff} days ago`;
}

export default async function Home() {
  const [featured, popular, all, categories, announcements, stats, winners, promos, faqs, settings, SITE_URL] = await Promise.all([
    getJSONSafe<Game[]>("/games/?featured=1", []),
    getJSONSafe<Game[]>("/games/?ordering=popular", []),
    getJSONSafe<Game[]>("/games/", []),
    getJSONSafe<Category[]>("/categories/", []),
    getJSONSafe<Announcement[]>("/announcements/", []),
    getJSONSafe<{ active_games: number }>("/stats/public/", { active_games: 0 }),
    getJSONSafe<Winner[]>("/winners/", []),
    getJSONSafe<Promo[]>("/promos/", []),
    getJSONSafe<SiteFAQ[]>("/faqs/", []),
    getJSONSafe<SiteSettings>("/settings/", {}),
    siteUrl(),
  ]);
  const site = settings.site_name || "our casino";
  const fresh = all.filter((g) => g.is_new);
  const picks = [...featured, ...popular.filter((g) => !featured.some((f) => f.id === g.id))].slice(0, Math.max(featured.length, 10));
  const liveCats = categories.filter((c) => c.game_count > 0);
  const tiles = (list: Game[], from = 0) => {
    const src = (list.length ? list : all).map((g) => g.thumbnail).filter((x): x is string => !!x);
    return [0, 1, 2].map((k) => src[(from + k) % Math.max(src.length, 1)]).filter(Boolean);
  };
  const slides: Slide[] = [
    { kicker: `Welcome to ${site}`, icon: <Sparkles />, title: `${stats.active_games || all.length}+ sweepstakes games. One account.`,
      text: "Fish tables, slots and keno from Juwa, Game Vault, Orion Stars and more — loaded for you in minutes.",
      cta: { signup: true, label: "Create account" }, cta2: { href: "/games", label: "Browse games" }, images: tiles(featured) },
    ...promos.filter((p) => p.active !== false).slice(0, 2).map((p, k): Slide => ({
      kicker: p.code ? `Code ${p.code}` : "Promotion", icon: <Gift />, title: p.title, text: p.description,
      cta: { href: "/promotions", label: "Claim offer" }, images: tiles(popular, 3 + k * 3) })),
    { kicker: "Agents online 24/7", icon: <Headset />, title: "Real people. Fast loads. Fast cash outs.",
      text: "Message a verified agent any time — they set up your game account, load your balance and handle cash outs.",
      cta: { href: "/messages?c=support", label: "Talk to an agent" }, cta2: { href: "/faq", label: "How it works" }, images: tiles(all, 6) },
  ];
  const topWin = winners[0];
  const byCategory = categories.map((c) => ({ ...c, games: all.filter((g) => g.category_slug === c.slug) })).filter((c) => c.games.length >= 3);
  const news = announcements.filter((a) => a.active !== false).slice(0, 3);
  const tilesOf = (list: Game[], eager = 0) => list.map((g, k) => <GameTile key={g.id} game={g} priority={k < eager} />);

  return (
    <div className="grid gap-12">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: site, url: SITE_URL, slogan: settings.tagline }} />
      <h1 className="sr-only">{site} — sweepstakes and social casino games</h1>
      <PlayerHome />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <HeroCarousel slides={slides} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {topWin && (
            <Link href="/winners" className="group">
              <Card className="glass h-full justify-between transition-shadow duration-200 hover:shadow-lg">
                <CardContent className="grid gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><Trophy className="size-4 text-warning" aria-hidden />Top win today</p>
                  <p className="text-4xl font-bold text-warning tabular-nums">{money(topWin.amount)}</p>
                  <p><b>{topWin.name}</b>{topWin.game ? <span className="text-muted-foreground"> on {topWin.game}</span> : null}</p>
                  <p className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-brand-text">See all winners<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></p>
                </CardContent>
              </Card>
            </Link>
          )}
          <Link href="/messages?c=support" className="group">
            <Card className="glass h-full justify-between transition-shadow duration-200 hover:shadow-lg">
              <CardContent className="grid gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><span className="size-2 rounded-full bg-success" aria-hidden />Agents online</p>
                <p className="text-lg font-semibold">Need a game account or a load?</p>
                <p className="text-sm text-muted-foreground">A real person replies in minutes, any time.</p>
                <p className="inline-flex items-center gap-1 pt-2 text-sm font-semibold text-brand-text">Chat now<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <nav aria-label="Game categories" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Button asChild variant="secondary" className="shrink-0"><Link href="/" aria-current="page"><HomeIcon aria-hidden />Lobby</Link></Button>
        {liveCats.map((c) => {
          const Icon = categoryIcon(c.icon);
          return (
            <Button key={c.id} asChild variant="outline" className="shrink-0">
              <Link href={`/games?category=${c.slug}`}><Icon aria-hidden />{c.name}<Badge variant="secondary" className="tabular-nums">{c.game_count}</Badge></Link>
            </Button>
          );
        })}
      </nav>

      <GameRail title="Featured" icon={<Sparkles />} href="/games" items={tilesOf(picks, 6)} />
      <GameRail title="Trending now" icon={<Flame />} href="/games" items={tilesOf(popular.slice(0, 16))} />

      {winners.length > 0 && (
        <section aria-labelledby="wins" className="grid gap-4">
          <div className="flex items-center gap-2">
            <h2 id="wins" className="flex items-center gap-2 text-xl"><Trophy className="size-6 text-warning" aria-hidden />Latest wins</h2>
            <Button asChild variant="outline" size="sm" className="ml-auto"><Link href="/winners">View all<span className="sr-only"> winners</span></Link></Button>
          </div>
          <ul className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
            {winners.slice(0, 14).map((w) => (
              <li key={w.id} className="glass flex min-w-64 snap-start items-center gap-3 rounded-lg border p-3">
                <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-warning/20 font-bold text-warning">
                  {w.photo ? <Image src={mediaUrl(w.photo)} alt="" fill sizes="44px" className="object-cover" /> : w.name[0]}
                </span>
                <span className="grid min-w-0 flex-1"><b className="truncate">{w.name}</b><span className="truncate text-sm text-muted-foreground">{w.game || "Jackpot"} · {daysAgo(w.win_date)}</span></span>
                <span className="font-bold text-warning tabular-nums">{money(w.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fresh.length > 0 && <GameRail title="New releases" icon={<Zap />} href="/games" items={tilesOf(fresh)} />}
      {byCategory.map((c) => <GameRail key={c.id} title={c.name} icon={(() => { const I = categoryIcon(c.icon); return <I />; })()} href={`/games?category=${c.slug}`} items={tilesOf(c.games)} />)}
      <RecentGames />

      <section aria-labelledby="why" className="grid gap-4">
        <h2 id="why" className="sr-only">Why play with us</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([[Zap, "Loads in minutes", "Pay with your favourite app and your game is loaded while you wait."],
            [Headset, "Agents 24/7", "Real people on chat day and night — no bots, no tickets."],
            [ShieldCheck, "Verified & secure", "Encrypted accounts and verified agents on every game."],
            [Gift, "Daily bonuses", "Reload bonuses, referral rewards and weekly promo codes."]] as const).map(([Icon, title, text]) => (
            <li key={title}>
              <Card className="glass h-full"><CardContent className="grid gap-2">
                <span className="grid size-11 place-items-center rounded-md bg-primary/20 text-brand-text"><Icon className="size-5" aria-hidden /></span>
                <h3 className="text-lg">{title}</h3><p className="text-muted-foreground">{text}</p>
              </CardContent></Card>
            </li>
          ))}
        </ul>
      </section>

      {news.length > 0 && (
        <section aria-labelledby="news" className="grid gap-4">
          <h2 id="news" className="flex items-center gap-2 text-xl"><Sparkles className="size-6 text-brand-text" aria-hidden />What&apos;s new</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {news.map((a) => (
              <li key={a.id}><Card className="glass h-full"><CardContent className="grid gap-2">
                {a.pinned && <Badge className="w-fit">Pinned</Badge>}
                <h3 className="text-lg">{a.title}</h3><p className="text-muted-foreground">{a.body}</p>
              </CardContent></Card></li>
            ))}
          </ul>
        </section>
      )}

      {faqs.length > 0 && (
        <section aria-labelledby="faq" className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
          <div className="grid content-start justify-items-start gap-3">
            <h2 id="faq" className="text-2xl">Questions, answered</h2>
            <p className="max-w-prose text-muted-foreground">How accounts, loads and cash outs work at {site}. Still stuck? An agent is a message away.</p>
            <Button asChild variant="outline"><Link href="/faq">All FAQs</Link></Button>
          </div>
          <Accordion type="single" collapsible className="glass rounded-lg border px-4">
            {faqs.slice(0, 5).map((f) => (
              <AccordionItem key={f.id} value={String(f.id)}>
                <AccordionTrigger className="text-base">{f.question}</AccordionTrigger>
                <AccordionContent className="max-w-prose text-muted-foreground">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      <section aria-labelledby="join" className="dark flex flex-col gap-6 rounded-2xl bg-[radial-gradient(80%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_50%,transparent),transparent_60%),linear-gradient(160deg,var(--secondary),var(--background))] p-8 text-foreground ring-1 ring-border md:flex-row md:items-center md:p-12">
        <div className="grid gap-2">
          <h2 id="join" className="text-2xl sm:text-3xl">Ready when you are.</h2>
          <p className="text-muted-foreground">Create your account, get your game links and start playing tonight.</p>
        </div>
        <div className="flex flex-wrap gap-3 md:ml-auto">
          <CreateAccountButton size="lg" />
          <Button asChild size="lg" variant="outline" className="bg-secondary/60"><Link href="/messages?c=support"><MessageCircle aria-hidden />Talk to an agent</Link></Button>
        </div>
      </section>
    </div>
  );
}
