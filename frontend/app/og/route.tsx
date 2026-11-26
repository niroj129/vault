import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { contrast, effectiveAccent } from "@/lib/brand";
import { previewGames, previewHeadline, previewHighlights, previewPayments } from "@/lib/preview";
import { getJSONSafe, siteUrl } from "@/lib/server-api";
import type { Game, PaymentMethodInfo, SiteSettings } from "@/lib/types";

/* Link-preview card (Open Graph / X / WhatsApp / iMessage), 1200×630 JPEG.
   Built per site from its own name, tagline, colours, logo and featured game
   art. An uploaded `social_preview` in site settings replaces it (see layout). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;
/* ?size= — "wide" is the link preview; the others are for uploading as ad / post images,
   which show much bigger in a phone feed than a 1.91:1 link card. k scales the type. */
const SIZES = {
  wide: { w: W, h: H, k: 1 },
  square: { w: 1080, h: 1080, k: 1.3 },
  portrait: { w: 1080, h: 1350, k: 1.45 },
  story: { w: 1080, h: 1920, k: 1.65 },
} as const;
type Size = keyof typeof SIZES;
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

export async function GET(req: Request) {
  const base = await siteUrl();
  // ?v= changes with the site's name/tagline/logo/colours (see layout), so a new version renders fresh
  const q = new URL(req.url).searchParams;
  const size: Size = (q.get("size") || "") in SIZES ? (q.get("size") as Size) : "wide";
  const key = `${new URL(base).host}|${q.get("v") || ""}|${size}`;
  const hit = cards.get(key);
  if (hit && Date.now() - hit.at < TTL) return send(hit);
  let job = rendering.get(key);
  if (!job) {
    job = render(base, size)
      .then((c) => { cards.set(key, c); return c; })
      .finally(() => rendering.delete(key));
    rendering.set(key, job);
  }
  // a stale card is still a fine preview: serve it while the new one renders
  if (hit) return send(hit);
  return send(await job);
}

async function render(base: string, size: Size): Promise<Card> {
  const { w: cw, h: ch, k } = SIZES[size];
  const [settings, featured, all, methods] = await Promise.all([
    getJSONSafe<SiteSettings>("/settings/", {}),
    getJSONSafe<Game[]>("/games/?featured=1", []),
    getJSONSafe<Game[]>("/games/", []),
    getJSONSafe<PaymentMethodInfo[]>("/payment-methods/", []),
  ]);
  const name = settings.site_name || "Casino";
  const tagline = previewHeadline(settings);
  const typed = previewGames(settings);
  const points = previewHighlights(settings);
  // non-breaking spaces keep "Google Pay" on one line when the list wraps
  const pays = previewPayments(settings, methods).map((p) => p.replace(/ /g, "\u00a0"));
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
  // ad sizes always list game names (the catalog's when none are typed)
  const listed = typed.length || size === "wide" ? typed : pool.map((g) => g.name);
  // a typed game list replaces the game art
  const picks = listed.length ? [] : pool.filter((g) => g.thumbnail).slice(0, 4);
  const [tw, th] = picks.length === 1 ? [300, 400] : [198, 264];
  const [logo, ...thumbs] = await Promise.all([
    dataUri(settings.logo, base, 92, 92),
    ...picks.map((g) => dataUri(g.thumbnail, base, tw, th)),
  ]);
  const art = thumbs.filter((t): t is string => !!t);
  const gameNames = (picks.length ? picks : pool).slice(0, 3).map((g) => g.name);
  const sub = points.length ? points.join(" · ")
    : gameNames.length ? `${gameNames.join(", ")} & more. Real agents 24/7 — fast loads, fast cash outs.`
    : "Fish tables, slots & keno. Real agents 24/7 — fast loads, fast cash outs.";

  const headSize = tagline.length > 34 ? 60 : tagline.length > 22 ? 70 : 80;
  const tilt = [-7, 5, -4, 8];

  const logoTile = (size: number) => logo ? (
    <div style={{ display: "flex", width: size, height: size, borderRadius: size / 4, overflow: "hidden", flexShrink: 0,
      backgroundColor: "#FFFFFF", border: `3px solid ${pop}` }}>
      <img src={logo} alt="" width={size} height={size} style={{ objectFit: "cover" }} />
    </div>
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: pop, color: onPop, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.56, fontWeight: 900 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
  const glows = (
    <>
      <div style={{ position: "absolute", top: -260, right: -160, width: 820, height: 820, borderRadius: 9999,
        backgroundImage: `radial-gradient(circle, ${glow}88 0%, ${glow}00 68%)`, display: "flex" }} />
      <div style={{ position: "absolute", bottom: -320, left: -220, width: 760, height: 760, borderRadius: 9999,
        backgroundImage: `radial-gradient(circle, ${pop}40 0%, ${pop}00 70%)`, display: "flex" }} />
    </>
  );

  const png = new ImageResponse(
    listed.length || size !== "wide" ? listCard() : (
      <div style={{
        width: W, height: H, display: "flex", position: "relative", overflow: "hidden",
        backgroundColor: bg, fontFamily: "Inter", color: "#FFFFFF",
      }}>
        {glows}

        {/* left: brand + message */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between",
          width: art.length ? 660 : W, padding: "64px 0 60px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {logoTile(92)}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 500 }}>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5 }}>{name}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pop, textTransform: "uppercase", letterSpacing: 3, marginTop: 6 }}>
                Sweepstakes Gaming
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
    { width: cw, height: ch, fonts: await fonts },
  );

  /** Card for a typed game list: headline, selling points, every game name, payment apps. */
  function listCard() {
    const MAX = 36;
    const shown = listed.length > MAX ? listed.slice(0, MAX - 1) : listed;
    const more = listed.length - shown.length;
    const r = (n: number) => Math.round(n * k);
    const wide = size === "wide";
    // fewer games → bigger pills
    const [f0, py, px, g0] = listed.length > 28 ? [19, 7, 14, 9] : listed.length > 16 ? [22, 9, 18, 11] : [26, 11, 22, 14];
    const [fs, pad, gap] = [r(f0), `${r(py)}px ${r(px)}px`, r(g0)];
    const pct = tagline.match(/^(\S*\d\S*%?)\s+(.*)$/);  // "100% Bonus…" → highlight the number
    const pill = { display: "flex", fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 9999,
      backgroundColor: "#FFFFFF14", border: "1.5px solid #FFFFFF2E", color: "#FFFFFFEB" } as const;
    return (
      <div style={{ width: cw, height: ch, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
        backgroundColor: bg, fontFamily: "Inter", color: "#FFFFFF",
        // story: keep clear of the profile bar on top and the reply box at the bottom
        padding: size === "story" ? "200px 64px 260px" : wide ? "44px 60px 40px" : "60px 60px 56px" }}>
        {glows}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {logoTile(r(64))}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: r(30), fontWeight: 900, letterSpacing: -0.5 }}>{name}</div>
              <div style={{ fontSize: r(16), fontWeight: 700, color: pop, textTransform: "uppercase", letterSpacing: 3, marginTop: 2 }}>
                Sweepstakes Gaming
              </div>
            </div>
          </div>
          {wide && <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "#FFFFFFB3" }}>{host}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", marginTop: r(22), fontSize: r(66), fontWeight: 900,
          lineHeight: 1.04, letterSpacing: -2 }}>
          {/* one item per word so a long headline wraps instead of running off the card */}
          {tagline.split(/\s+/).map((w, i) => (
            <span key={i} style={{ marginRight: r(18), color: pct && i === 0 ? pop : "#FFFFFF" }}>{w}</span>
          ))}
        </div>

        {points.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: r(12), marginTop: r(16) }}>
            {points.map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: r(10), fontSize: r(22), fontWeight: 900,
                padding: `${r(9)}px ${r(20)}px`, borderRadius: 9999, backgroundColor: pop, color: onPop }}>
                <div style={{ display: "flex", width: r(9), height: r(9), borderRadius: 9999, backgroundColor: onPop }} />
                {p}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignContent: wide ? "flex-start" : "center", gap, marginTop: r(22),
          marginBottom: wide ? 0 : r(22), flexGrow: 1 }}>
          {shown.map((g) => <div key={g} style={pill}>{g}</div>)}
          {more > 0 && <div style={{ ...pill, color: pop, borderColor: pop }}>+{more} more</div>}
        </div>

        {wide ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "#FFFFFFB3" }}>
              {pays.length ? `Pay with ${pays.join(" · ")}` : "Real agents online 24/7"}
            </div>
            <div style={{ display: "flex", flexShrink: 0, backgroundColor: pop, color: onPop, fontSize: 23, fontWeight: 900,
              padding: "13px 30px", borderRadius: 9999 }}>
              Play now&nbsp;→
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: r(14) }}>
            {pays.length > 0 && (
              <div style={{ display: "flex", fontSize: r(20), fontWeight: 700, color: "#FFFFFFB3" }}>{`Pay with ${pays.join(" · ")}`}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
              <div style={{ display: "flex", fontSize: r(22), fontWeight: 900, color: "#FFFFFF" }}>{host}</div>
              <div style={{ display: "flex", flexShrink: 0, backgroundColor: pop, color: onPop, fontSize: r(23), fontWeight: 900,
                padding: `${r(13)}px ${r(30)}px`, borderRadius: 9999 }}>
                Play now&nbsp;→
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  const raw = new Uint8Array(await png.arrayBuffer());
  // ~600 KB as PNG; WhatsApp drops previews much over 300 KB, so send JPEG when sharp is here
  const sharp = await loadSharp();
  if (!sharp) return { body: raw, type: "image/png", at: Date.now() };
  const jpg = await sharp(raw).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return { body: new Uint8Array(jpg), type: "image/jpeg", at: Date.now() };
}
