import { LayoutGrid, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { categoryIcon } from "@/components/common/icons";
import { GameTile } from "@/components/lobby/game-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { getJSONSafe } from "@/lib/server-api";
import type { Category, Game } from "@/lib/types";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "All Games",
  description: "Browse every sweepstakes and social casino game — Juwa, Game Vault, Orion Stars, Fire Kirin and more.",
};

type SP = Promise<{ q?: string; category?: string; sort?: string }>;

export default async function GamesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q || "";
  const category = sp.category || "";
  const sort = sp.sort === "popular" ? "popular" : "";
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  if (sort) query.set("ordering", "popular");
  const [games, categories] = await Promise.all([getJSONSafe<Game[]>(`/games/?${query}`, []), getJSONSafe<Category[]>("/categories/", [])]);
  const current = categories.find((c) => c.slug === category);
  const link = (over: Partial<{ q: string; category: string; sort: string }>) => {
    const p = new URLSearchParams();
    Object.entries({ q, category, sort, ...over }).forEach(([k, v]) => v && p.set(k, v));
    return p.toString() ? `/games?${p}` : "/games";
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">{current ? "Category" : "Library"}</p>
          <h1 className="text-3xl sm:text-4xl">{current ? current.name : "All games"}</h1>
          <p className="text-muted-foreground" aria-live="polite">{games.length} game{games.length === 1 ? "" : "s"}{q ? ` matching “${q}”` : ""}</p>
        </div>
        <form action="/games" role="search" className="flex w-full gap-2 md:w-80">
          {category && <input type="hidden" name="category" value={category} />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          <label htmlFor="games-q" className="sr-only">Search games</label>
          <Input id="games-q" name="q" type="search" defaultValue={q} placeholder="Search by name" />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <nav aria-label="Categories" className="scrollbar-none -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          <Button asChild variant={!category ? "secondary" : "outline"} className="shrink-0">
            <Link href={link({ category: "" })} aria-current={!category ? "page" : undefined}><LayoutGrid aria-hidden />All</Link>
          </Button>
          {categories.filter((c) => c.game_count > 0 || category === c.slug).map((c) => {
            const Icon = categoryIcon(c.icon);
            const on = category === c.slug;
            return (
              <Button key={c.id} asChild variant={on ? "secondary" : "outline"} className="shrink-0">
                <Link href={link({ category: c.slug })} aria-current={on ? "page" : undefined}><Icon aria-hidden />{c.name}<Badge variant="secondary" className="tabular-nums">{c.game_count}</Badge></Link>
              </Button>
            );
          })}
        </nav>
        <div role="group" aria-label="Sort" className="flex shrink-0 gap-1 rounded-lg border p-1">
          <Button asChild size="sm" variant={!sort ? "secondary" : "ghost"}><Link href={link({ sort: "" })} aria-current={!sort ? "true" : undefined}>Featured</Link></Button>
          <Button asChild size="sm" variant={sort ? "secondary" : "ghost"}><Link href={link({ sort: "popular" })} aria-current={sort ? "true" : undefined}>Popular</Link></Button>
        </div>
      </div>

      {games.length ? (
        <ul className="grid grid-cols-2 gap-4 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {games.map((g, k) => <li key={g.id}><GameTile game={g} priority={k < 6} /></li>)}
        </ul>
      ) : (
        <Empty className="border">
          <EmptyHeader><EmptyMedia variant="icon"><SearchX aria-hidden /></EmptyMedia><EmptyTitle>No games found</EmptyTitle>
            <EmptyDescription>Try another name or browse all categories.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button asChild variant="outline"><Link href="/games">Clear filters</Link></Button></EmptyContent>
        </Empty>
      )}
    </div>
  );
}
