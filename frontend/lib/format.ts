import type { Money } from "./types";

/** $50, $27.50 — whole dollars without decimals. */
export function money(v: Money | null | undefined): string {
  const n = Number(v || 0);
  const frac = Math.abs(n % 1) > 0.0001;
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function ago(t: string | null | undefined): string {
  if (!t) return "never";
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const shortDate = (t: string) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const dateTime = (t: string) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Gateway amounts come in cents: 12345 → $123.45 */
export const cents = (c: Money | null | undefined) => `$${(Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
