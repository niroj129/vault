/** A readable password: letters and digits, no look-alikes (0/O, 1/l/I). */
export function genPassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  // guarantee at least one letter and one digit (platforms insist on both)
  const out = Array.from(bytes, (b) => chars[b % chars.length]);
  if (!out.some((c) => /\d/.test(c))) out[0] = "7";
  if (!out.some((c) => /[a-z]/i.test(c))) out[1] = "k";
  return out.join("");
}

/** username ideas from a name: "Maya Lopez" → "maya_lopez", with a short number when it's taken */
export function suggestUsername(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 14);
  return base || `player${Math.floor(1000 + Math.random() * 9000)}`;
}
