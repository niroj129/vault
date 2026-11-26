import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { contrast, effectiveAccent } from "@/lib/brand";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Game, SiteSettings } from "@/lib/types";

/* Link-preview card (Open Graph / X / WhatsApp / iMessage), 1200×630 JPEG.
   Built per site from its own name, tagline, colours, logo and featured game
   art. An uploaded `social_preview` in site settings replaces it (see layout). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;
const NIGHT = "#0F172A";
const hexRe = /^#[0-9a-f]{6}$/i;

const fonts = Promise.all(
  [700, 900].map(async (weight) => ({
    name: "Inter", weight: weight as 700 | 900, style: "normal" as const,
    data: await readFile(join(process.cwd(), `assets/fonts/Inter-${weight}.ttf`)),
  })),
);

type Sharp = typeof import("sharp");
let sharpMod: Promise<Sharp | null> | undefined;
/** sharp ships with Next for image optimisation; null if it can't load on this host. */
const loadSharp = () => (sharpMod ??= import("sharp").then((m) => m.default as unknown as Sharp).catch(() => null));

/** Fetch an image as a data URI, shrunk to the size it is drawn at (decoding full-size
    uploads is what makes a render slow). Satori can't read WebP/SVG reliably. Never throws. */
async function dataUri(src: string | null | undefined, base: string, w: number, h: number): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetch(new URL(src, base), { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharp = await loadSharp();
    if (sharp) {
      const small = await sharp(buf).resize(w * 2, h * 2, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
      return `data:image/jpeg;base64,${small.toString("base64")}`;
    }
    // uploads are often mislabelled (a JPEG saved as .png), so trust the bytes, not the extension
    const type = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg"
      : buf.subarray(0, 4).toString("hex") === "89504e47" ? "image/png"
      : buf.subarray(0, 3).toString("ascii") === "GIF" ? "image/gif" : null;
    return type ? `data:${type};base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}

const luminous = (hex: string) => contrast(hex, "#000000");

/* Rendering is CPU-heavy and blocks the Node event loop, and link crawlers (Facebook
   sends dozens of requests at once) would otherwise take the whole site down. So each
   site's card is rendered once, shared by every request that arrives meanwhile, and
   kept for an hour. */
const TTL = 60 * 60 * 1000;
type Card = { body: Uint8Array; type: string; at: number };
const cards = new Map<string, Card>();
const rendering = new Map<string, Promise<Card>>();
const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const send = (c: Card) => new Response(c.body.slice(), { headers: { "Content-Type": c.type, "Cache-Control": CACHE } });

export async function GET() {
  const base = await siteUrl();
  const key = new URL(base).host;
  const hit = cards.get(key);
  if (hit && Date.now() - hit.at < TTL) return send(hit);
  let job = rendering.get(key);
  if (!job) {
    job = render(base)
      .then((c) => { cards.set(key, c); return c; })
      .finally(() => rendering.delete(key));
    rendering.set(key, job);
  }
  // a stale card is still a fine preview: serve it while the new one renders
  if (hit) return send(hit);
  return send(await job);
}

async function render(base: string): Promise<Card> {
  const [settings, featured, all] = await Promise.all([
    getJSONSafe<SiteSettings>("/settings/", {}),
    getJSONSafe<Game[]>("/games/?featured=1", []),
    getJSONSafe<Game[]>("/games/", []),
  ]);
  const name = settings.site_name || "Casino";
  const tagline = settings.tagline || "Play premium sweepstakes games.";
  const host = new URL(base).host;

  // Background: the site's own primary when it is dark enough for white text, else night.
  const primary = hexRe.test(settings.color_primary || "") ? settings.color_primary! : NIGHT;
  const bg = contrast("#FFFFFF", primary) >= 7 ? primary : NIGHT;
  // Highlight: the brightest brand colour that still reads on the background.
  const brand = [settings.color_secondary, settings.color_accent, effectiveAccent(settings.color_accent)]
    .filter((c): c is string => !!c && hexRe.test(c))
    .sort((a, b) => luminous(b) - luminous(a));
  const glow = brand[0] || "#7C3AED";
  const pop = brand.find((c) => contrast(c, bg) >= 4.5) || "#FACC15";
  const onPop = contrast("#FFFFFF", pop) >= contrast(NIGHT, pop) ? "#FFFFFF" : NIGHT;

  const pool = [...featured, ...all.filter((g) => !featured.some((f) => f.id === g.id))];
  const picks = pool.filter((g) => g.thumbnail).slice(0, 4);
  const [tw, th] = picks.length === 1 ? [300, 400] : [198, 264];
  const [logo, ...thumbs] = await Promise.all([
    dataUri(settings.logo, base, 92, 92),
    ...picks.map((g) => dataUri(g.thumbnail, base, tw, th)),
  ]);
  const art = thumbs.filter((t): t is string => !!t);
  const gameNames = (picks.length ? picks : pool).slice(0, 3).map((g) => g.name);
  const sub = gameNames.length
    ? `${gameNames.join(", ")} & more. Real agents 24/7 — fast loads, fast cash outs.`
    : "Fish tables, slots & keno. Real agents 24/7 — fast loads, fast cash outs.";

  const headSize = tagline.length > 34 ? 60 : tagline.length > 22 ? 70 : 80;
  const tilt = [-7, 5, -4, 8];

  const png = new ImageResponse(
    (
      <div style={{
        width: W, height: H, display: "flex", position: "relative", overflow: "hidden",
        backgroundColor: bg, fontFamily: "Inter", color: "#FFFFFF",
      }}>
        {/* brand glows */}
        <div style={{ position: "absolute", top: -260, right: -160, width: 820, height: 820, borderRadius: 9999,
          backgroundImage: `radial-gradient(circle, ${glow}88 0%, ${glow}00 68%)`, display: "flex" }} />
        <div style={{ position: "absolute", bottom: -320, left: -220, width: 760, height: 760, borderRadius: 9999,
          backgroundImage: `radial-gradient(circle, ${pop}40 0%, ${pop}00 70%)`, display: "flex" }} />

        {/* left: brand + message */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between",
          width: art.length ? 660 : W, padding: "64px 0 60px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {logo ? (
              <div style={{ display: "flex", width: 92, height: 92, borderRadius: 24, overflow: "hidden",
                backgroundColor: "#FFFFFF", border: `3px solid ${pop}` }}>
                <img src={logo} alt="" width={92} height={92} style={{ objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{ width: 92, height: 92, borderRadius: 24, backgroundColor: pop, color: onPop,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, fontWeight: 900 }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 500 }}>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5 }}>{name}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pop, textTransform: "uppercase", letterSpacing: 3, marginTop: 6 }}>
                Sweepstakes & Social Casino
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: headSize, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2 }}>{tagline}</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.35, color: "#FFFFFFB8", maxWidth: 560 }}>{sub}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", backgroundColor: pop, color: onPop,
              fontSize: 26, fontWeight: 900, padding: "16px 34px", borderRadius: 9999, flexShrink: 0 }}>
              Play now&nbsp;→
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#FFFFFFA6" }}>{host}</div>
          </div>
        </div>

        {/* right: fanned game art */}
        {art.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center",
            gap: 22, width: W - 660, padding: "0 48px 0 8px" }}>
            {art.map((src, i) => {
              const [w, h] = [tw, th];
              return (
                <div key={i} style={{ display: "flex", width: w, height: h, borderRadius: 26, overflow: "hidden",
                  transform: `rotate(${tilt[i]}deg)`, border: "4px solid #FFFFFF33", boxShadow: "0 24px 48px #00000080" }}>
                  <img src={src} alt="" width={w} height={h} style={{ objectFit: "cover" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts: await fonts },
  );
  const raw = new Uint8Array(await png.arrayBuffer());
  // ~600 KB as PNG; WhatsApp drops previews much over 300 KB, so send JPEG when sharp is here
  const sharp = await loadSharp();
  if (!sharp) return { body: raw, type: "image/png", at: Date.now() };
  const jpg = await sharp(raw).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return { body: new Uint8Array(jpg), type: "image/jpeg", at: Date.now() };
}
