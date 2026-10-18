"use client";

import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { GameRail } from "./game-rail";
import { GameTile } from "./game-tile";

interface Recent { slug: string; name: string; thumbnail: string | null }

/** Recently viewed games from this browser (written by RecordView). */
export function RecentGames() {
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("tf_recent") || "[]") as Recent[]); } catch { /* ignore */ }
  }, []);
  if (!items.length) return null;
  return <GameRail title="Continue where you left off" icon={<History />} items={items.slice(0, 12).map((g) => <GameTile key={g.slug} game={g} />)} />;
}

export function RecordView({ slug, name, thumbnail }: Recent) {
  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem("tf_recent") || "[]") as Recent[];
      localStorage.setItem("tf_recent", JSON.stringify([{ slug, name, thumbnail }, ...list.filter((g) => g.slug !== slug)].slice(0, 8)));
    } catch { /* ignore */ }
  }, [slug, name, thumbnail]);
  return null;
}
