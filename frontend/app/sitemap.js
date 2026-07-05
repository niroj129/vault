import { getJSONSafe, SITE_URL } from "../lib/api";

export default async function sitemap() {
  const [games, categories] = await Promise.all([
    getJSONSafe("/games/", []),
    getJSONSafe("/categories/", []),
  ]);
  const staticPages = ["", "/games", "/promotions", "/winners", "/faq", "/business"].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: p === "" ? 1 : 0.8,
  }));
  const gamePages = games.map((g) => ({
    url: `${SITE_URL}/${g.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));
  const categoryPages = categories.map((c) => ({
    url: `${SITE_URL}/games?category=${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  return [...staticPages, ...gamePages, ...categoryPages];
}
