import type { MetadataRoute } from "next";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Category, Game } from "@/lib/types";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = await siteUrl();
  const [games, categories] = await Promise.all([getJSONSafe<Game[]>("/games/", []), getJSONSafe<Category[]>("/categories/", [])]);
  const now = new Date();
  return [
    ...["", "/games", "/promotions", "/winners", "/faq", "/business"].map((p) => ({
      url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.8,
    })),
    ...games.map((g) => ({ url: `${SITE_URL}/${g.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...categories.map((c) => ({ url: `${SITE_URL}/games?category=${c.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
