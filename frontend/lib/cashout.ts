import { money } from "./format";
import type { CashoutBasis, CashoutRule, Money } from "./types";

const x = (v: Money) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}×`;
export const basisLabel = (b: CashoutBasis) => (b === "deposit" ? "paid" : "loaded");
/** "3×–10× what you loaded" */
export const ruleSummary = (r: { min_x: Money; max_x: Money; basis: CashoutBasis }) => `${x(r.min_x)}–${x(r.max_x)} what you ${basisLabel(r.basis)}`;
/** Amount shortcuts inside the allowed range: min, a round middle, max. */
export function quickAmounts(rule: CashoutRule | null | undefined, siteMin: number): number[] {
  if (!rule?.enabled) return [...new Set([siteMin, 50, 100, 200])].filter((v) => v >= siteMin);
  if (!rule.ok || rule.max == null) return [];
  const lo = Number(rule.min), hi = Number(rule.max);
  const mid = Math.round((lo + hi) / 2 / 10) * 10;
  return [...new Set([lo, mid > lo && mid < hi ? mid : null, hi].filter((v): v is number => v != null))];
}
export const rangeText = (r: CashoutRule) => (r.max == null ? `min ${money(r.min)}` : `${money(r.min)} – ${money(r.max)}`);
