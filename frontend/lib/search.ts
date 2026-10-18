/** Forgiving search: type part of anything and everything similar shows up.
 *  - any case, accents ignored
 *  - spaces, dots, dashes and underscores don't matter ("mayal" finds "maya_lopez")
 *  - several words must all be there, in any order ("lopez maya")
 *  - a lone "s" finds everything containing an "s" */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function matches(haystack: string, query: string): boolean {
  const words = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[\s_.\-@]+/).map(normalize).filter(Boolean);
  if (!words.length) return true;
  const text = normalize(haystack);
  // every word is somewhere in the text, or the whole query runs together ("maya_l" → "mayal")
  return words.every((w) => text.includes(w)) || text.includes(words.join(""));
}

/** Best matches first: starts-with beats contains. Stable for equal scores. */
export function rank<T>(items: T[], query: string, text: (t: T) => string): T[] {
  const q = normalize(query);
  if (!q) return items;
  const score = (t: T) => { const s = normalize(text(t)); return s.startsWith(q) ? 0 : s.includes(q) ? 1 : 2; };
  return items.map((t, i) => [t, score(t), i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([t]) => t);
}
