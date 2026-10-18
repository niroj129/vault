import { CheckCircle2, ChevronRight, Download, Flame, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/common/json-ld";
import { Stars } from "@/components/common/stars";
import { GameSetupCard, PlayButtons } from "@/components/game/play-buttons";
import { GameSocial } from "@/components/game/game-social";
import { GameRail } from "@/components/lobby/game-rail";
import { GameTile } from "@/components/lobby/game-tile";
import { RecordView } from "@/components/lobby/recent-games";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mediaUrl } from "@/lib/api";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Game, GameDetail } from "@/lib/types";

export const revalidate = 60;
type Params = Promise<{ slug: string }>;

const getGame = (slug: string) => getJSONSafe<GameDetail | null>(`/games/${slug}/`, null, { revalidate: 60 });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game not found" };
  const title = game.meta_title || `${game.name} — Download, Login & Play`;
  const description = game.meta_description || game.short_description || `Play ${game.name} online. Get the user link, agent info and FAQs.`;
  const image = mediaUrl(game.banner || game.thumbnail || game.logo);
  const SITE_URL = await siteUrl();
  return {
    title, description, keywords: game.meta_keywords, alternates: { canonical: `${SITE_URL}/${game.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/${game.slug}`, type: "article", images: image ? [{ url: image }] : [] },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function GamePage({ params }: { params: Params }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();
  const [related, SITE_URL] = await Promise.all([getJSONSafe<Game[]>(`/games/?category=${game.category_slug}`, []), siteUrl()]);
  const relatedGames = related.filter((g) => g.slug !== game.slug).slice(0, 12);
  const url = `${SITE_URL}/${game.slug}`;
  const cover = mediaUrl(game.thumbnail || game.logo);
  const backdrop = mediaUrl(game.banner || game.thumbnail);
  const shots = game.screenshots.filter((s) => s.image);

  return (
    <div className="grid gap-8">
      <RecordView slug={game.slug} name={game.name} thumbnail={game.thumbnail} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Games", item: `${SITE_URL}/games` },
        { "@type": "ListItem", position: 3, name: game.name, item: url }] }} />
      {game.faqs.length > 0 && <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: game.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }} />}
      <JsonLd data={{ "@context": "https://schema.org", "@type": "VideoGame", name: game.name, description: game.meta_description || game.short_description,
        url, image: mediaUrl(game.banner || game.thumbnail || game.logo), genre: game.category_name || "Casino", applicationCategory: "Game",
        operatingSystem: "Android, iOS, Web",
        ...(game.rating_count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: game.rating_avg, reviewCount: game.rating_count, bestRating: 5 } } : {}) }} />

      <section className="dark relative isolate overflow-hidden rounded-2xl bg-background text-foreground shadow-xl ring-1 ring-border">
        {backdrop && <Image src={backdrop} alt="" fill priority sizes="100vw" className="-z-10 scale-110 object-cover opacity-30 blur-2xl" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/85 to-background/40" aria-hidden />
        <div className="grid gap-6 p-6 sm:grid-cols-[12rem_1fr] sm:p-8 md:grid-cols-[14rem_1fr] md:p-10">
          <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-xl shadow-xl ring-1 ring-border sm:w-full">
            {cover ? <Image src={cover} alt={`${game.name} cover art`} fill priority sizes="(max-width: 640px) 160px, 224px" className="object-cover" />
              : <span className="grid h-full place-items-center bg-muted p-3 text-center font-semibold">{game.name}</span>}
          </div>
          <div className="grid content-center gap-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Lobby</Link></BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator><ChevronRight aria-hidden /></BreadcrumbSeparator>
                <BreadcrumbItem><BreadcrumbLink asChild><Link href={game.category_slug ? `/games?category=${game.category_slug}` : "/games"}>{game.category_name || "Games"}</Link></BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator><ChevronRight aria-hidden /></BreadcrumbSeparator>
                <BreadcrumbItem><BreadcrumbPage>{game.name}</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className="text-4xl sm:text-5xl">{game.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <span className={game.status === "active" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground"} aria-hidden />
                {game.status === "active" ? "Online" : "Offline"}
              </Badge>
              {game.is_new && <Badge className="bg-success text-background"><Sparkles aria-hidden />New</Badge>}
              {game.featured && <Badge variant="destructive" className="bg-destructive text-destructive-foreground"><Flame aria-hidden />Hot</Badge>}
              {game.rating_count > 0 && (
                <span className="inline-flex items-center gap-2 text-sm"><Stars value={game.rating_avg} />
                  <b className="tabular-nums">{Number(game.rating_avg).toFixed(1)}</b><span className="text-muted-foreground">({game.rating_count})</span></span>
              )}
            </div>
            <p className="max-w-prose text-lg text-muted-foreground">{game.short_description || game.description}</p>
            <PlayButtons game={game} />
            <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-2">
              {([["Plays", Number(game.clicks || 0).toLocaleString()], ["Views", Number(game.views || 0).toLocaleString()], ["Platforms", "Android · iOS · Web"]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-6">
          <Card className="glass">
            <CardHeader><CardTitle className="text-xl"><h2>About {game.name}</h2></CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <p className="max-w-prose whitespace-pre-line text-muted-foreground">{game.description || game.short_description}</p>
              {game.features_list.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {game.features_list.map((f, i) => <li key={i} className="flex gap-2 rounded-md bg-muted p-3"><CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />{f}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader><CardTitle className="text-xl"><h2>How to start playing</h2></CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <ol className="grid gap-3 sm:grid-cols-3">
                {([["Create your account", "Tap Create account — it takes under a minute."],
                  [`Load ${game.name}`, "Pick an amount and pay with Chime, Cash App and more — we load it and message you."],
                  [`Open ${game.name}`, "Use the game link, sign in with your details and play."]] as const).map(([t, d], i) => (
                  <li key={t} className="grid content-start gap-1 rounded-lg border p-4">
                    <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{i + 1}</span>
                    <b className="mt-1">{t}</b><span className="text-sm text-muted-foreground">{d}</span>
                  </li>
                ))}
              </ol>
              {game.download_info && <p className="flex gap-2 rounded-md bg-muted p-3 text-sm"><Download className="size-4 shrink-0" aria-hidden />{game.download_info}</p>}
            </CardContent>
          </Card>

          {shots.length > 0 && (
            <Card className="glass">
              <CardHeader><CardTitle className="text-xl"><h2>Screenshots</h2></CardTitle></CardHeader>
              <CardContent>
                <ul className="scrollbar-none flex snap-x gap-3 overflow-x-auto">
                  {shots.map((s) => (
                    <li key={s.id} className="relative aspect-[9/16] w-40 shrink-0 snap-start overflow-hidden rounded-lg ring-1 ring-border">
                      <Image src={mediaUrl(s.image)} alt={s.alt || `${game.name} screenshot`} fill sizes="160px" className="object-cover" loading="lazy" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {game.faqs.length > 0 && (
            <Card className="glass">
              <CardHeader><CardTitle className="text-xl"><h2>FAQ</h2></CardTitle></CardHeader>
              <CardContent>
                <Accordion type="single" collapsible>
                  {game.faqs.map((f) => (
                    <AccordionItem key={f.id} value={String(f.id)}>
                      <AccordionTrigger className="text-base">{f.question}</AccordionTrigger>
                      <AccordionContent className="max-w-prose text-muted-foreground">{f.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}
          <GameSocial game={game} />
        </div>
        <aside className="lg:sticky lg:top-20"><GameSetupCard game={game} /></aside>
      </div>

      <GameRail title={`More ${game.category_name || "games"}`} icon={<Sparkles />} href={game.category_slug ? `/games?category=${game.category_slug}` : "/games"}
        items={relatedGames.map((g) => <GameTile key={g.id} game={g} />)} />
    </div>
  );
}
