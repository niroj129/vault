import { Flame, Play, Sparkles, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { mediaUrl } from "@/lib/api";
import type { Game } from "@/lib/types";
import { cn } from "@/lib/utils";

type TileGame = Pick<Game, "slug" | "name"> & Partial<Pick<Game, "thumbnail" | "logo" | "featured" | "is_new" | "category_name" | "rating_avg" | "rating_count">>;

/** Portrait lobby tile: key art (3:4, reserved so nothing shifts), name + category below. */
export function GameTile({ game, priority = false, className }: { game: TileGame; priority?: boolean; className?: string }) {
  const img = mediaUrl(game.thumbnail || game.logo);
  const badge = game.featured ? { label: "Hot", icon: Flame, cls: "bg-destructive text-destructive-foreground" }
    : game.is_new ? { label: "New", icon: Sparkles, cls: "bg-success text-background" } : null;
  return (
    <Link href={`/${game.slug}`} className={cn("group grid gap-2 rounded-lg outline-offset-4", className)}
      aria-label={`${game.name}${game.category_name ? `, ${game.category_name}` : ""}${badge ? `, ${badge.label}` : ""}`}>
      <span className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted shadow-md ring-1 ring-border">
        {img ? (
          <Image src={img} alt="" fill priority={priority} sizes="(max-width: 640px) 40vw, (max-width: 1024px) 22vw, 184px"
            className="object-cover transition-[filter] duration-200 ease-out group-hover:brightness-110" />
        ) : (
          <span className="grid h-full place-items-center p-3 text-center font-semibold text-muted-foreground">{game.name}</span>
        )}
        {badge && (
          <span className={cn("absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase", badge.cls)}>
            <badge.icon className="size-3" aria-hidden />{badge.label}
          </span>
        )}
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-background/40 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow"><Play className="size-5" /></span>
        </span>
      </span>
      <span className="grid min-w-0 gap-0.5 px-0.5">
        <span className="truncate font-semibold" title={game.name}>{game.name}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{game.category_name || "Casino"}</span>
          {!!game.rating_count && (
            <span className="inline-flex items-center gap-0.5 tabular-nums"><Star className="size-3.5 fill-warning text-warning" aria-hidden />
              <span className="sr-only">Rated </span>{Number(game.rating_avg).toFixed(1)}</span>
          )}
        </span>
      </span>
    </Link>
  );
}
