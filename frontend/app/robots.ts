import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server-api";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE_URL = await siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/profile", "/messages", "/login", "/search", "/platform", "/agent", "/load"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
