"""Generate lobby-style key art for games (portrait tile, wide banner, square logo).

Each game gets art derived from its name + category: a lit radial backdrop,
light rays, a drawn motif for the category (fish, reels, chips, tickets, balls,
arcade), and a gold, outlined title. Nothing is branded, so the same art works
on every operator's site. Operators replace it by uploading real images.

Everything is drawn at 2x and downsampled for smooth edges. Fonts are bundled
(content/fonts, SIL Open Font License) so the output matches on any server.
"""

import colorsys
import io
import math
import zlib
import random
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(__file__).resolve().parent / "fonts"
SS = 2  # supersampling factor

WHITE = (255, 255, 255)
GOLD_HI = (255, 236, 160)
GOLD = (255, 196, 61)
GOLD_LO = (214, 128, 18)

# category -> (glow, mid, deep) colours and motif
THEMES = {
    "Fish Games": ((90, 220, 255), (10, 110, 190), (4, 22, 56), "fish"),
    "Slots": ((214, 140, 255), (110, 40, 200), (22, 6, 52), "slots"),
    "Arcade": ((255, 120, 200), (190, 30, 140), (40, 4, 40), "arcade"),
    "Sweepstakes": ((120, 255, 190), (12, 150, 100), (3, 36, 30), "tickets"),
    "Live Casino": ((255, 130, 110), (190, 30, 40), (44, 6, 10), "chips"),
    "Keno": ((255, 220, 110), (200, 130, 10), (48, 28, 2), "balls"),
}
FALLBACK = [
    ((120, 160, 255), (40, 70, 200), (8, 14, 50), "slots"),
    ((255, 170, 90), (200, 80, 20), (46, 16, 4), "chips"),
    ((140, 255, 220), (20, 150, 140), (4, 36, 36), "fish"),
    ((255, 120, 160), (190, 30, 90), (44, 4, 24), "balls"),
]


def _font(size, kind="display"):
    path = FONTS / ("Anton-Regular.ttf" if kind == "display" else "Outfit.ttf")
    try:
        f = ImageFont.truetype(str(path), size)
        if kind != "display":
            f.set_variation_by_name("Bold")
        return f
    except (OSError, ValueError):
        return ImageFont.load_default()


def _mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _backdrop(w, h, glow, mid, deep, cx=0.5, cy=0.38):
    """Radial gradient: bright glow → mid → deep edges (fast via resize)."""
    sw, sh = 160, max(1, int(160 * h / w))
    small = Image.new("RGB", (sw, sh))
    px = small.load()
    maxd = math.hypot(max(cx, 1 - cx), max(cy, 1 - cy))
    for y in range(sh):
        for x in range(sw):
            d = math.hypot(x / sw - cx, (y / sh - cy) * h / w) / maxd
            t = min(1.0, d * 1.25)
            px[x, y] = _mix(glow, mid, t / 0.45) if t < 0.45 else _mix(mid, deep, (t - 0.45) / 0.55)
    return small.resize((w, h), Image.BICUBIC)


def _rays(img, cx, cy, color, count=18, alpha=26):
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = math.hypot(w, h)
    for i in range(count):
        a0 = (2 * math.pi / count) * i
        a1 = a0 + math.pi / count * 0.55
        d.polygon([(cx, cy), (cx + r * math.cos(a0), cy + r * math.sin(a0)),
                   (cx + r * math.cos(a1), cy + r * math.sin(a1))], fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(w // 120))
    img.alpha_composite(layer)


def _bokeh(img, rnd, color, n=14):
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        r = rnd.uniform(0.01, 0.045) * w
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        d.ellipse([x - r, y - r, x + r, y + r], fill=color + (rnd.randint(30, 90),))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(w // 260)))


# ----------------------------------------------------------------- motifs

def _fish(d, cx, cy, s, body, fin, flip=False):
    k = -1 if flip else 1
    d.ellipse([cx - s, cy - s * 0.55, cx + s, cy + s * 0.55], fill=body)
    d.polygon([(cx - k * s * 0.85, cy), (cx - k * s * 1.55, cy - s * 0.55),
               (cx - k * s * 1.55, cy + s * 0.55)], fill=fin)
    d.polygon([(cx - k * s * 0.1, cy - s * 0.5), (cx + k * s * 0.35, cy - s * 0.95),
               (cx + k * s * 0.45, cy - s * 0.45)], fill=fin)
    d.ellipse([cx + k * s * 0.5 - s * 0.13, cy - s * 0.2 - s * 0.13,
               cx + k * s * 0.5 + s * 0.13, cy - s * 0.2 + s * 0.13], fill=WHITE)
    d.ellipse([cx + k * s * 0.53 - s * 0.06, cy - s * 0.2 - s * 0.06,
               cx + k * s * 0.53 + s * 0.06, cy - s * 0.2 + s * 0.06], fill=(10, 20, 40))


def _motif(img, kind, box, glow, mid, rnd):
    """Draw the category motif inside box=(x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx, cy = x0 + w / 2, y0 + h / 2
    u = min(w, h)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    light = _mix(glow, WHITE, 0.35)

    if kind == "fish":
        _fish(d, cx + u * 0.05, cy, u * 0.26, GOLD + (255,), GOLD_LO + (255,))
        _fish(d, cx - u * 0.3, cy - u * 0.28, u * 0.12, light + (230,), mid + (255,), flip=True)
        _fish(d, cx + u * 0.34, cy + u * 0.3, u * 0.1, light + (220,), mid + (255,))
        for _ in range(9):
            r = rnd.uniform(0.012, 0.035) * u
            bx, by = cx + rnd.uniform(-0.45, 0.45) * u, cy + rnd.uniform(-0.45, 0.2) * u
            d.ellipse([bx - r, by - r, bx + r, by + r], outline=WHITE + (170,), width=max(2, int(u / 140)))
    elif kind == "slots":
        rw, rh, gap = u * 0.24, u * 0.36, u * 0.04
        left = cx - (rw * 3 + gap * 2) / 2
        d.rounded_rectangle([left - gap, cy - rh / 2 - gap, left + rw * 3 + gap * 3, cy + rh / 2 + gap],
                            radius=u * 0.05, fill=GOLD_LO + (255,), outline=GOLD_HI + (255,), width=int(u / 90))
        f = _font(int(rh * 0.78))
        for i in range(3):
            rx = left + i * (rw + gap)
            d.rounded_rectangle([rx, cy - rh / 2, rx + rw, cy + rh / 2], radius=u * 0.03, fill=(255, 250, 240, 255))
            d.text((rx + rw / 2, cy), "7", font=f, anchor="mm", fill=(220, 30, 60, 255),
                   stroke_width=int(u / 120), stroke_fill=(120, 10, 30, 255))
        for i in range(5):  # coins
            r = u * rnd.uniform(0.045, 0.07)
            bx, by = cx + rnd.uniform(-0.48, 0.48) * u, cy + rnd.choice([-1, 1]) * rnd.uniform(0.3, 0.46) * u
            d.ellipse([bx - r, by - r, bx + r, by + r], fill=GOLD + (255,), outline=GOLD_HI + (255,), width=int(u / 110))
    elif kind == "chips":
        for i, (dx, dy, col) in enumerate([(-0.22, 0.05, (220, 40, 50)), (0.2, -0.08, (30, 30, 36)),
                                           (0.0, 0.2, (30, 120, 220))]):
            r = u * 0.2
            px, py = cx + dx * u, cy + dy * u
            d.ellipse([px - r, py - r, px + r, py + r], fill=col + (255,))
            for k in range(8):
                a = k * math.pi / 4
                d.pieslice([px - r, py - r, px + r, py + r], math.degrees(a) - 8, math.degrees(a) + 8, fill=WHITE + (255,))
            d.ellipse([px - r * 0.72, py - r * 0.72, px + r * 0.72, py + r * 0.72], fill=col + (255,),
                      outline=WHITE + (255,), width=int(u / 110))
        cwd, cht = u * 0.22, u * 0.31  # playing card
        d.rounded_rectangle([cx + u * 0.12, cy - u * 0.42, cx + u * 0.12 + cwd, cy - u * 0.42 + cht],
                            radius=u * 0.025, fill=(255, 255, 255, 255))
        d.text((cx + u * 0.12 + cwd / 2, cy - u * 0.42 + cht / 2), "A", font=_font(int(cht * 0.55)),
               anchor="mm", fill=(200, 20, 40, 255))
    elif kind == "tickets":
        for i, (dx, dy, rot) in enumerate([(-0.12, -0.08, -14), (0.1, 0.1, 10)]):
            tw, th = u * 0.62, u * 0.3
            t = Image.new("RGBA", (int(tw), int(th)), (0, 0, 0, 0))
            td = ImageDraw.Draw(t)
            td.rounded_rectangle([0, 0, tw - 1, th - 1], radius=th * 0.12, fill=(GOLD if i else light) + (255,))
            for side in (0, tw):
                td.ellipse([side - th * 0.13, th / 2 - th * 0.13, side + th * 0.13, th / 2 + th * 0.13], fill=(0, 0, 0, 0))
            td.line([(tw * 0.7, th * 0.12), (tw * 0.7, th * 0.88)], fill=mid + (255,), width=max(2, int(u / 120)))
            td.text((tw * 0.35, th / 2), "WIN", font=_font(int(th * 0.5)), anchor="mm", fill=mid + (255,))
            t = t.rotate(rot, expand=True, resample=Image.BICUBIC)
            layer.alpha_composite(t, (int(cx + dx * u - t.width / 2), int(cy + dy * u - t.height / 2)))
        for _ in range(16):  # confetti
            bx, by = cx + rnd.uniform(-0.5, 0.5) * u, cy + rnd.uniform(-0.5, 0.5) * u
            s = u * rnd.uniform(0.012, 0.025)
            d.rectangle([bx - s, by - s / 2, bx + s, by + s / 2],
                        fill=rnd.choice([GOLD, WHITE, light, (255, 90, 120)]) + (230,))
    elif kind == "balls":
        nums = rnd.sample(range(1, 81), 5)
        spots = [(-0.26, -0.1, 0.17), (0.08, -0.2, 0.15), (0.3, 0.06, 0.16), (-0.06, 0.18, 0.18), (-0.36, 0.26, 0.11)]
        cols = [(230, 40, 60), (40, 120, 230), (250, 180, 20), (30, 170, 90), (150, 60, 220)]
        for (dx, dy, rr), n, col in zip(spots, nums, cols):
            r = u * rr
            px, py = cx + dx * u, cy + dy * u
            d.ellipse([px - r, py - r, px + r, py + r], fill=col + (255,))
            d.ellipse([px - r * 0.58, py - r * 0.58, px + r * 0.58, py + r * 0.58], fill=WHITE + (255,))
            d.text((px, py), str(n), font=_font(int(r * 0.75)), anchor="mm", fill=(20, 20, 30, 255))
            d.ellipse([px - r * 0.75, py - r * 0.85, px - r * 0.25, py - r * 0.5], fill=WHITE + (90,))
    else:  # arcade: joystick + pixel invader
        d.rounded_rectangle([cx - u * 0.3, cy + u * 0.08, cx + u * 0.3, cy + u * 0.3], radius=u * 0.05, fill=(30, 30, 40, 255))
        d.rectangle([cx - u * 0.025, cy - u * 0.2, cx + u * 0.025, cy + u * 0.1], fill=(200, 200, 210, 255))
        d.ellipse([cx - u * 0.1, cy - u * 0.34, cx + u * 0.1, cy - u * 0.14], fill=(240, 40, 80, 255))
        for i, col in enumerate([(250, 200, 30), (40, 200, 240)]):
            bx = cx + u * (0.13 + i * 0.1)
            d.ellipse([bx - u * 0.035, cy + u * 0.15, bx + u * 0.035, cy + u * 0.22], fill=col + (255,))
        grid = ["0010000100", "0001001000", "0011111100", "0110110110", "1111111111", "1011111101", "1010000101", "0001101100"]
        p = u * 0.028
        gx, gy = cx - u * 0.42, cy - u * 0.46
        for r, row in enumerate(grid):
            for c, ch in enumerate(row):
                if ch == "1":
                    d.rectangle([gx + c * p, gy + r * p, gx + (c + 1) * p - 1, gy + (r + 1) * p - 1], fill=light + (255,))

    shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(u / 40))
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sh.putalpha(shadow.point(lambda a: int(a * 0.6)))
    img.alpha_composite(sh, (int(u / 60), int(u / 30)))
    img.alpha_composite(layer)


# ------------------------------------------------------------------ title

def _fit(text, max_w, max_h, draw):
    size = int(max_h)
    while size > 12:
        f = _font(size)
        bb = draw.textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= max_w:
            return f
        size -= 4
    return _font(12)


def _title(img, lines, center, max_w, line_h, align="mm"):
    """Gold-gradient title with dark outline and drop shadow."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    stroke = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stroke)
    cx, cy = center
    fonts = [_fit(t, max_w, line_h, md) for t in lines]
    size = min(f.size for f in fonts)
    font = _font(size)
    total = size * 1.02 * len(lines)
    top = cy - total / 2
    for i, t in enumerate(lines):
        y = top + size * 1.02 * (i + 0.5)
        sw = max(3, size // 14)
        sd.text((cx, y + size * 0.06), t, font=font, anchor=align, fill=(0, 0, 0, 150), stroke_width=sw, stroke_fill=(0, 0, 0, 150))
        sd.text((cx, y), t, font=font, anchor=align, fill=(40, 16, 2, 255), stroke_width=sw, stroke_fill=(40, 16, 2, 255))
        md.text((cx, y), t, font=font, anchor=align, fill=255)
    img.alpha_composite(stroke.filter(ImageFilter.GaussianBlur(1)))
    grad = Image.new("RGBA", (w, h))
    gd = ImageDraw.Draw(grad)
    for y in range(h):
        t = (y - top) / max(1, total)
        col = _mix(GOLD_HI, GOLD, t / 0.5) if t < 0.5 else _mix(GOLD, GOLD_LO, min(1, (t - 0.5) / 0.5))
        gd.line([(0, y), (w, y)], fill=col + (255,))
    img.paste(grad, (0, 0), mask)
    return top + total


def _split(name):
    words = name.split()
    if len(words) == 1 or len(name) <= 9:
        return [name.upper()]
    best = min(range(1, len(words)), key=lambda i: abs(len(" ".join(words[:i])) - len(" ".join(words[i:]))))
    return [" ".join(words[:best]).upper(), " ".join(words[best:]).upper()]


def _pill(img, text, xy, glow, anchor="mm"):
    d = ImageDraw.Draw(img)
    f = _font(int(img.width * 0.045) if img.width < img.height * 1.4 else int(img.height * 0.055), "body")
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    px, py = th * 0.9, th * 0.6
    x, y = xy
    x0 = x - tw / 2 - px if anchor == "mm" else x
    d.rounded_rectangle([x0, y - th / 2 - py, x0 + tw + 2 * px, y + th / 2 + py], radius=th,
                        fill=(0, 0, 0, 120), outline=_mix(glow, WHITE, 0.4) + (200,), width=max(2, img.width // 300))
    d.text((x0 + px + tw / 2, y), text, font=f, anchor="mm", fill=WHITE)


# ------------------------------------------------------------------- art

def _shift(rgb, deg):
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    r, g, b = colorsys.hls_to_rgb((h + deg / 360) % 1, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def theme_for(category, index, name=""):
    glow, mid, deep, kind = THEMES.get(category) or FALLBACK[index % len(FALLBACK)]
    # nudge the hue per game so titles in one category don't look identical
    deg = (zlib.crc32(name.encode()) % 9 - 4) * 9
    return _shift(glow, deg), _shift(mid, deg), _shift(deep, deg), kind


def _art(w, h, name, category, index, layout):
    W, H = w * SS, h * SS
    glow, mid, deep, kind = theme_for(category, index, name)
    rnd = random.Random(f"{name}-{category}")
    if layout == "banner":
        img = _backdrop(W, H, glow, mid, deep, cx=0.72, cy=0.45).convert("RGBA")
        _rays(img, W * 0.72, H * 0.45, _mix(glow, WHITE, 0.4))
        _bokeh(img, rnd, _mix(glow, WHITE, 0.5))
        _motif(img, kind, (W * 0.5, H * 0.04, W * 0.96, H * 0.96), glow, mid, rnd)
        shade = Image.new("RGBA", (W, H))
        sd = ImageDraw.Draw(shade)
        for x in range(W):  # darken the left half so the title reads
            sd.line([(x, 0), (x, H)], fill=deep + (int(230 * max(0, 1 - x / (W * 0.62))),))
        img.alpha_composite(shade)
        lines = _split(name)
        _title(img, lines, (W * 0.06, H * 0.56), W * 0.42, H * (0.34 if len(lines) == 1 else 0.24), align="lm")
        if category:
            _pill(img, category.upper(), (W * 0.06, H * 0.17), glow, anchor="lm")
    else:
        cy = 0.36 if layout == "tile" else 0.4
        img = _backdrop(W, H, glow, mid, deep, cy=cy).convert("RGBA")
        _rays(img, W / 2, H * cy, _mix(glow, WHITE, 0.4))
        _bokeh(img, rnd, _mix(glow, WHITE, 0.5))
        motif_h = H * (0.62 if layout == "tile" else 0.62)
        _motif(img, kind, (W * 0.02, H * cy - motif_h / 2, W * 0.98, H * cy + motif_h / 2), glow, mid, rnd)
        fade = Image.new("RGBA", (W, H))
        fd = ImageDraw.Draw(fade)
        start = H * 0.55
        for y in range(int(start), H):
            fd.line([(0, y), (W, y)], fill=deep + (int(235 * max(0.0, (y - start) / (H - start)) ** 1.2),))
        img.alpha_composite(fade)
        lines = _split(name)
        ty = H * (0.8 if layout == "tile" else 0.82)
        _title(img, lines, (W / 2, ty), W * 0.86, H * (0.15 if len(lines) == 1 else 0.11))
    # subtle vignette
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).rounded_rectangle([W * 0.02, H * 0.02, W * 0.98, H * 0.98], radius=W * 0.08, fill=255)
    v = v.filter(ImageFilter.GaussianBlur(W // 18))
    dark = Image.new("RGBA", (W, H), deep + (255,))
    dark.putalpha(v.point(lambda a: int((255 - a) * 0.55)))
    img.alpha_composite(dark)
    return img.convert("RGB").resize((w, h), Image.LANCZOS)


def _save(img):
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True, progressive=True)
    return ContentFile(buf.getvalue())


def make_thumb(name, category, index):
    """Portrait lobby tile, 3:4."""
    return _save(_art(600, 800, name, category, index, "tile"))


def make_banner(name, category, index):
    """Wide hero banner, 5:2."""
    return _save(_art(1600, 640, name, category, index, "banner"))


def make_logo(name, category, index):
    """Square icon."""
    return _save(_art(512, 512, name, category, index, "logo"))
