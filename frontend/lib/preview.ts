import { payLabel } from "@/lib/pay-brands";
import type { PaymentMethodInfo, SiteSettings } from "@/lib/types";

/* What the link-preview card (app/og) and its og:description say, from site settings. */

/** Game names from the admin's "Games on the link preview" box. One per line or comma-separated;
    a pasted rate list ("Juwa :- 105") keeps only the name. */
export function previewGames(s: SiteSettings): string[] {
  const seen = new Set<string>();
  return (s.preview_games || "")
    .split(/[\n,]+/)
    .map((l) => l.replace(/\s*[:=-]+\s*[\d.$%]+.*$/, "").replace(/\s+/g, " ").trim())
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

export const previewHighlights = (s: SiteSettings) =>
  (s.preview_highlights || "").split(",").map((h) => h.trim()).filter(Boolean).slice(0, 4);

/** Payment apps the site takes: its own payment methods plus the BytePayout apps, labelled and de-duplicated. */
export function previewPayments(s: SiteSettings, methods: PaymentMethodInfo[]): string[] {
  const names = [
    ...methods.filter((m) => m.active !== false).map((m) => payLabel(m.name)),
    ...(s.bp_methods || "").split(",").map((m) => m.trim()).filter(Boolean).map(payLabel),
  ];
  return [...new Set(names)];
}

export const previewHeadline = (s: SiteSettings) => (s.preview_headline || "").trim() || s.tagline || "Play premium sweepstakes games.";

/** og:description: the selling points, then as many game names as read well in a link card. */
export function previewDescription(s: SiteSettings, methods: PaymentMethodInfo[]): string {
  const games = previewGames(s);
  const points = previewHighlights(s);
  const pays = previewPayments(s, methods);
  const parts = [
    points.length ? `${points.join(" · ")}.` : "Real agents 24/7 — fast loads, fast cash outs.",
    games.length ? `${games.slice(0, 12).join(", ")}${games.length > 12 ? ` + ${games.length - 12} more` : ""}.` : "Juwa, Game Vault, Orion Stars & more.",
    pays.length ? `Pay with ${pays.join(", ")}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
