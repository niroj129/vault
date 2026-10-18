/* Operator brand colour → CSS variables that always meet WCAG AA.
   Used by the root layout (server) to theme each white-label site. */

type RGB = [number, number, number];

const hexRe = /^#?([0-9a-f]{6})$/i;
const toRgb = (hex: string): RGB => { const n = parseInt(hex.replace("#", ""), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function luminance([r, g, b]: RGB) {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string) {
  const A = luminance(toRgb(a)); const B = luminance(toRgb(b));
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Shift `hex` toward white/black until it reaches `min` contrast on `bg`. */
function readableOn(hex: string, bg: string, min = 4.5) {
  const target: RGB = luminance(toRgb(bg)) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  for (let t = 0; t <= 1; t += 0.05) {
    const c = toHex(mix(toRgb(hex), target, t));
    if (contrast(c, bg) >= min) return c;
  }
  return toHex(target);
}

/** White or near-black, whichever is readable on `hex` (what the site uses for text on the main colour). */
export const onColor = (hex: string) => (contrast("#FFFFFF", hex) >= 4.5 || contrast("#FFFFFF", hex) >= contrast("#0F172A", hex) ? "#FFFFFF" : "#0F172A");

/** The main colour the site really shows: the old default violets fall back to the palette default. */
export const effectiveAccent = (hex?: string | null) => (!hex || ["#7C3AED", "#7B61FF"].includes(hex.toUpperCase()) ? "#7C3AED" : hex.toUpperCase());

export const DEFAULT_PRIMARY = "#7C3AED";
const NIGHT_BG = "#0F172A";
const DAY_BG = "#F5F3FF";

/** CSS that overrides --primary for this site, or "" for the default palette. */
export function brandCss(accent?: string | null): string {
  const m = hexRe.exec(accent || "");
  if (!m) return "";
  const hex = `#${m[1].toUpperCase()}`;
  // the old default violets mean "not customised"
  if ([DEFAULT_PRIMARY, "#7B61FF"].includes(hex)) return "";
  const onPrimary = onColor(hex);
  const vars = (bg: string) => `--primary:${hex};--primary-foreground:${onPrimary};--sidebar-primary:${hex};--sidebar-primary-foreground:${onPrimary};--brand-text:${readableOn(hex, bg)};`;
  return `:root{${vars(DAY_BG)}}.dark{${vars(NIGHT_BG)}}`;
}
