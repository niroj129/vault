import { money } from "./format";
import type { CashoutBasis, CashoutRule, Money } from "./types";

const x = (v: Money) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}×`;
export const basisLabel = (b: CashoutBasis) => (b === "deposit" ? "paid" : "loaded");
type RuleBits = { min_x: Money; max_x: Money; min_basis: CashoutBasis; max_basis: CashoutBasis; min_base: Money | null; max_base: Money | null; free_play?: boolean };
/** "3×–10× what you loaded", or "at least 2× what you paid and at most 3× what you loaded" */
export function ruleSummary(r: RuleBits) {
  if (r.free_play) return `${x(r.min_x)}–${x(r.max_x)} your free play credits`;
  if (r.min_basis === r.max_basis) return `${x(r.min_x)}–${x(r.max_x)} what you ${basisLabel(r.min_basis)}`;
  return `at least ${x(r.min_x)} what you ${basisLabel(r.min_basis)} and at most ${x(r.max_x)} what you ${basisLabel(r.max_basis)}`;
}
/** "$25 loaded", "$10 of free play", "$50 loaded / $20 paid" */
export function loadLine(r: RuleBits) {
  if (r.free_play) return `${money(r.min_base)} of free play`;
  if (r.min_basis === r.max_basis) return `${money(r.min_base)} ${basisLabel(r.min_basis)}`;
  return `${money(r.min_base)} ${basisLabel(r.min_basis)} / ${money(r.max_base)} ${basisLabel(r.max_basis)}`;
}
/** Amount shortcuts inside the allowed range: min, a round middle, max. */
export function quickAmounts(rule: CashoutRule | null | undefined, siteMin: number): number[] {
  if (!rule?.enabled) return [...new Set([siteMin, 50, 100, 200])].filter((v) => v >= siteMin);
  if (!rule.ok || rule.max == null) return [];
  const lo = Number(rule.min), hi = Number(rule.max);
  const mid = Math.round((lo + hi) / 2 / 10) * 10;
  return [...new Set([lo, mid > lo && mid < hi ? mid : null, hi].filter((v): v is number => v != null))];
}
export const rangeText = (r: CashoutRule) => (r.max == null ? `min ${money(r.min)}` : `${money(r.min)} – ${money(r.max)}`);
