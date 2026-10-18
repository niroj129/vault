import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Announcement, SiteSettings } from "@/lib/types";

export const revalidate = 300;

const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const SITE_URL = await siteUrl();
  const [settings, anns] = await Promise.all([
    getJSONSafe<SiteSettings>("/settings/", {}),
    getJSONSafe<(Announcement & { created_at?: string })[]>("/announcements/", []),
  ]);
  const name = esc(settings.site_name || "Casino");
  const items = anns.map((a) => `
    <item>
      <title>${esc(a.title)}</title>
      <description>${esc(a.body || "")}</description>
      <link>${SITE_URL}/</link>
      <guid isPermaLink="false">ann-${a.id}</guid>
      <pubDate>${new Date(a.created_at || Date.now()).toUTCString()}</pubDate>
    </item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${name} — Announcements</title>
    <link>${SITE_URL}/</link>
    <description>Latest promotions and news from ${name}.</description>
    ${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
