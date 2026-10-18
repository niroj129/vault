import { SearchX, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { categoryIcon } from "@/components/common/icons";
import { PageHeader } from "@/components/common/page-header";
import { GameTile } from "@/components/lobby/game-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { getJSONSafe } from "@/lib/server-api";
import type { Announcement, Category, Game } from "@/lib/types";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q || "").trim();
  const [games, categories, announcements] = q
    ? await Promise.all([getJSONSafe<Game[]>(`/games/?q=${encodeURIComponent(q)}`, []), getJSONSafe<Category[]>("/categories/", []), getJSONSafe<Announcement[]>("/announcements/", [])])
    : [[], [], []] as [Game[], Category[], Announcement[]];
  const needle = q.toLowerCase();
  const cats = categories.filter((c) => c.name.toLowerCase().includes(needle));
  const anns = announcements.filter((a) => a.title.toLowerCase().includes(needle) || (a.body || "").toLowerCase().includes(needle));
  const nothing = q && !games.length && !cats.length && !anns.length;
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Search" title={q ? `Results for “${q}”` : "Find a game"} description={q ? `${games.length} game${games.length === 1 ? "" : "s"}` : undefined}
        actions={
          <form action="/search" role="search" className="flex w-full gap-2 md:w-80">
            <label htmlFor="search-q" className="sr-only">Search</label>
            <Input id="search-q" name="q" type="search" defaultValue={q} placeholder="Games, categories, news" />
            <Button type="submit" variant="secondary">Search</Button>
          </form>} />
      {cats.length > 0 && (
        <nav aria-label="Matching categories" className="flex flex-wrap gap-2">
          {cats.map((c) => { const Icon = categoryIcon(c.icon); return <Button key={c.id} asChild variant="outline"><Link href={`/games?category=${c.slug}`}><Icon aria-hidden />{c.name}</Link></Button>; })}
        </nav>
      )}
      {games.length > 0 && <ul className="grid grid-cols-2 gap-4 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{games.map((g) => <li key={g.id}><GameTile game={g} /></li>)}</ul>}
      {anns.length > 0 && (
        <section aria-labelledby="news" className="grid gap-4">
          <h2 id="news" className="flex items-center gap-2 text-xl"><Sparkles className="size-6 text-brand-text" aria-hidden />News</h2>
          <ul className="grid gap-4 md:grid-cols-3">{anns.map((a) => <li key={a.id}><Card className="glass h-full"><CardContent className="grid gap-2"><h3 className="text-lg">{a.title}</h3><p className="text-muted-foreground">{a.body}</p></CardContent></Card></li>)}</ul>
        </section>
      )}
      {nothing && (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><SearchX aria-hidden /></EmptyMedia><EmptyTitle>Nothing found for “{q}”</EmptyTitle>
          <EmptyDescription>Check the spelling or browse the full library.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button asChild variant="outline"><Link href="/games">Browse all games</Link></Button></EmptyContent></Empty>
      )}
    </div>
  );
}
