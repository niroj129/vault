import { getJSONSafe, SITE_URL } from "../../lib/api";

export const revalidate = 300;

function esc(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const anns = await getJSONSafe("/announcements/", []);
  const items = anns.map((a) => `
    <item>
      <title>${esc(a.title)}</title>
      <description>${esc(a.body || "")}</description>
      <link>${SITE_URL}/</link>
      <guid isPermaLink="false">tiffany-ann-${a.id}</guid>
      <pubDate>${new Date(a.created_at || Date.now()).toUTCString()}</pubDate>
    </item>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tiffany Gaming — Announcements</title>
    <link>${SITE_URL}/</link>
    <description>Latest promotions and news from Tiffany Gaming.</description>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
