"""Generate premium, name-branded game tiles (logo / thumbnail / banner).

Each game gets a distinct themed design derived from its name + category, so
the catalog looks professional before any real logos are uploaded.
"""

import io

from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

DARK = (10, 14, 26)
GOLD = (255, 210, 76)
WHITE = (245, 248, 252)

# category -> (top, bottom) gradient colours
CATEGORY_THEME = {
    "Fish Games": ((14, 165, 233), (8, 47, 73)),
    "Slots": ((139, 92, 246), (46, 16, 101)),
    "Arcade": ((219, 39, 119), (74, 4, 78)),
    "Sweepstakes": ((16, 185, 129), (6, 55, 42)),
    "Live Casino": ((239, 68, 68), (60, 10, 12)),
    "Keno": ((234, 179, 8), (66, 42, 4)),
}
PALETTE = [((139, 92, 246), (46, 16, 101)), ((14, 165, 233), (8, 47, 73)),
           ((16, 185, 129), (6, 55, 42)), ((219, 39, 119), (74, 4, 78)),
           ((234, 88, 12), (66, 30, 4)), ((2, 132, 199), (7, 40, 66)),
           ((147, 51, 234), (44, 12, 74)), ((5, 150, 105), (5, 50, 38)),
           ((190, 24, 93), (60, 8, 34)), ((202, 138, 4), (58, 40, 4)),
           ((79, 70, 229), (30, 24, 90))]


def _font(size, bold=True):
    names = (["Arial Bold.ttf", "Helvetica.ttc", "Arial.ttf"] if bold
             else ["Arial.ttf", "Helvetica.ttc"])
    for base in ("/System/Library/Fonts/Supplemental/", "/System/Library/Fonts/",
                 "/Library/Fonts/"):
        for n in names:
            try:
                return ImageFont.truetype(base + n, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _gradient(w, h, top, bottom):
    base = Image.new("RGB", (w, h), top)
    px = base.load()
    for y in range(h):
        row = _lerp(top, bottom, (y / max(1, h - 1)) ** 1.1)
        for x in range(w):
            px[x, y] = row
    return base


def _text(draw, xy, text, font, fill, anchor="mm", shadow=True):
    x, y = xy
    if shadow:
        draw.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0), anchor=anchor)
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor)


def _wrap(text, font, draw, max_w):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        test = (cur + " " + wd).strip()
        if draw.textlength(test, font=font) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def _decorate(img, top):
    """Add soft bokeh circles + a diagonal shine for depth."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    glow = _lerp(top, WHITE, 0.5)
    spots = [(0.16, 0.22, 0.18), (0.85, 0.30, 0.12), (0.72, 0.82, 0.16),
             (0.30, 0.80, 0.10)]
    for cx, cy, r in spots:
        rr = int(min(w, h) * r)
        x, y = int(w * cx), int(h * cy)
        od.ellipse([x - rr, y - rr, x + rr, y + rr], fill=glow + (26,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(min(w, h) // 14))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(-h, w, 42):  # diagonal shine
        d.line([(i, 0), (i + h, h)], fill=(255, 255, 255, 8), width=2)
    return img


def _tile(w, h, name, category, theme):
    top, bottom = theme
    img = _decorate(_gradient(w, h, top, bottom), top)
    d = ImageDraw.Draw(img, "RGBA")
    pad = int(min(w, h) * 0.06)
    # inset gold frame
    d.rounded_rectangle([pad, pad, w - pad, h - pad], radius=int(min(w, h) * 0.05),
                        outline=GOLD + (150,), width=max(2, w // 320))
    # category pill (top-left)
    if category:
        f = _font(max(12, h // 22), bold=True)
        tw = d.textlength(category.upper(), font=f)
        px, py = pad + int(w * 0.03), pad + int(h * 0.05)
        d.rounded_rectangle([px, py, px + tw + 24, py + f.size + 12],
                            radius=(f.size + 12) // 2, fill=(0, 0, 0, 90),
                            outline=GOLD + (120,), width=1)
        _text(d, (px + 12 + tw / 2, py + (f.size + 12) / 2), category.upper(),
              f, GOLD, shadow=False)
    # game name (centre, wrapped)
    fsize = int(h * 0.20)
    while fsize > 14:
        nf = _font(fsize, bold=True)
        lines = _wrap(name, nf, d, w - 2 * pad - int(w * 0.08))
        if len(lines) <= 2 and all(d.textlength(l, font=nf) <= w - 2 * pad for l in lines):
            break
        fsize -= 4
    lh = nf.size * 1.12
    y0 = h / 2 - (len(lines) - 1) * lh / 2
    for i, line in enumerate(lines):
        _text(d, (w / 2, y0 + i * lh), line, nf, WHITE)
    # gold underline accent
    uw = int(w * 0.14)
    d.rounded_rectangle([w / 2 - uw / 2, y0 + len(lines) * lh - lh * 0.15,
                         w / 2 + uw / 2, y0 + len(lines) * lh - lh * 0.15 + max(3, h // 90)],
                        radius=3, fill=GOLD)
    # brand watermark (bottom)
    bf = _font(max(11, h // 26), bold=True)
    _text(d, (w / 2, h - pad - bf.size), "T I F F A N Y   G A M I N G", bf,
          _lerp(WHITE, top, 0.3), shadow=False)
    return img


def _save(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return ContentFile(buf.getvalue())


def theme_for(category, index):
    return CATEGORY_THEME.get(category, PALETTE[index % len(PALETTE)])


def make_logo(name, category, index):
    return _save(_tile(400, 400, name, category, theme_for(category, index)))


def make_thumb(name, category, index):
    return _save(_tile(640, 400, name, category, theme_for(category, index)))


def make_banner(name, category, index):
    return _save(_tile(1200, 420, name, category, theme_for(category, index)))
