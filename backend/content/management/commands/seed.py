"""Seed the database with branding, categories, the supported games (with
generated logo/thumbnail/banner images), winners, profit, and announcements.

Run:  python manage.py seed
Idempotent: safe to run multiple times.
"""

import io
import math
import random
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from PIL import Image, ImageDraw, ImageFont

from accounts.models import User
from catalog.models import Category, FAQ, Favorite, Game, Review, Screenshot
from content.models import (Announcement, BusinessInfo, Cashout, DailyProfit,
                            PaymentMethod, Promo, SiteFAQ, SiteSettings,
                            Transaction, Wallet, Winner)

BRAND_DARK = (11, 15, 26)
BRAND_PURPLE = (124, 58, 237)
BRAND_GOLD = (245, 197, 66)

CATEGORIES = [
    ("Fish Games", "fish"), ("Slots", "slot"), ("Arcade", "arcade"),
    ("Sweepstakes", "ticket"), ("Live Casino", "video"), ("Keno", "grid"),
]

# (name, category, short, description, features, faqs)
GAMES = [
    ("Juwa", "Fish Games",
     "Popular fish-shooting arcade & slots app.",
     "Juwa is a leading social-casino and fish-shooting arcade app packed with "
     "slots, fish tables, and keno. Get the Juwa download link, learn how to "
     "play, and contact a verified agent to load your account.",
     ["100+ slot and fish games", "Daily bonuses and jackpots",
      "Android & iOS", "24/7 agent support"],
     [("How do I download Juwa?", "Use the official user link on this page to "
       "download Juwa for Android or iOS, then contact an agent."),
      ("How do I add credits to Juwa?", "Message an agent using the Contact "
       "button and they will load your balance instantly.")]),
    ("Game Vault", "Slots",
     "Slots, fish and arcade sweepstakes platform.",
     "Game Vault (Game Vault 999) is a leading online sweepstakes platform with "
     "slots, fish games and arcade titles. Find the login link and connect with "
     "an agent.",
     ["Huge slots library", "Fish & arcade games", "Instant browser play",
      "Frequent promotions"],
     [("What is Game Vault?", "A social sweepstakes app offering slots and fish "
       "games for entertainment."),
      ("How do I recharge Game Vault?", "Tap Contact Agent to reach an "
       "authorized agent for a top-up.")]),
    ("Orion Stars", "Fish Games",
     "Arcade fish shooting and reel slots.",
     "Orion Stars brings arcade fish shooting and reel slots to your phone. "
     "Download Orion Stars and find a trusted agent here.",
     ["Fish shooting arcade", "Classic & video slots", "Multiplayer tables"],
     [("Is Orion Stars free to download?", "Yes — the app is free; contact an "
       "agent to start playing.")]),
    ("Milky Way", "Slots",
     "Space-themed slots, keno and fish games.",
     "Milky Way is a sweepstakes gaming app featuring slots, keno and fish games "
     "with a sleek space theme.",
     ["Space-themed slots", "Keno & fish games", "Daily rewards"],
     [("How do I play Milky Way?", "Download via the user link, then contact an "
       "agent to fund your account.")]),
    ("Panda Master", "Slots",
     "Vibrant slots and fish tables.",
     "Panda Master is a fun sweepstakes casino app with vibrant slots and fish "
     "tables. Get the login and agent details.",
     ["Colorful slot machines", "Fish tables", "Mobile friendly"],
     [("How do I get Panda Master credits?", "Use the Contact Agent button to "
       "reach a verified agent.")]),
    ("Cash Machine", "Slots",
     "Classic Vegas-style 777 slots.",
     "Cash Machine 777 delivers classic Vegas-style slot action in a social "
     "sweepstakes format.",
     ["Classic 777 slots", "Big jackpots", "Simple gameplay"],
     [("What is Cash Machine 777?", "A social casino slots app for "
       "entertainment.")]),
    ("Fire Kirin", "Fish Games",
     "Top fish-shooting arcade & slots.",
     "Fire Kirin is one of the most popular fish-shooting arcade and slots apps. "
     "Find the download and agent links.",
     ["Fish shooting games", "Slots & arcade", "Online play"],
     [("How do I download Fire Kirin?", "Use the official user link above, then "
       "contact an agent.")]),
    ("Ultra Panda", "Slots",
     "Rich mix of slots and fish games.",
     "Ultra Panda (Ultra Panda 777) offers a rich mix of slots and fish games in "
     "a social sweepstakes app.",
     ["Slots & fish games", "Frequent bonuses", "Cross-platform"],
     [("How do I recharge Ultra Panda?", "Contact an authorized agent using the "
       "button on this page.")]),
    ("Vegas Sweeps", "Sweepstakes",
     "Las Vegas casino floor, online.",
     "Vegas Sweeps brings the Las Vegas casino floor online with premium slots "
     "and sweepstakes games.",
     ["Premium Vegas slots", "Sweepstakes format", "Browser play"],
     [("What is Vegas Sweeps?", "An online sweepstakes casino with Vegas-style "
       "games.")]),
    ("VPower", "Fish Games",
     "Feature-rich fish games and slots.",
     "VPower (VPower 777) is a feature-rich fish game and slots platform popular "
     "with social casino players.",
     ["Fish games", "Slots collection", "Agent supported"],
     [("How do I join VPower?", "Download via the user link and contact an agent "
       "to begin.")]),
    ("River Sweeps", "Sweepstakes",
     "Slots, fish and arcade sweepstakes.",
     "River Sweeps (River Monster) is a well-known sweepstakes gaming platform "
     "featuring slots, fish and arcade games.",
     ["Slots, fish & arcade", "Sweepstakes gameplay", "Mobile & desktop"],
     [("How do I play River Sweeps?", "Use the user link to access the platform, "
       "then contact an agent.")]),
]


def _font(size):
    for path in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                 "/System/Library/Fonts/Helvetica.ttc",
                 "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_image(w, h, top, bottom, text, sub=""):
    img = Image.new("RGB", (w, h), BRAND_DARK)
    px = img.load()
    for y in range(h):
        row = _lerp(top, bottom, y / max(1, h - 1))
        for x in range(w):
            px[x, y] = row
    draw = ImageDraw.Draw(img)
    # subtle diagonal glow
    for i in range(0, w + h, 26):
        draw.line([(i, 0), (i - h, h)], fill=_lerp(row, BRAND_GOLD, 0.06), width=1)
    size = int(h * 0.30)
    font = _font(size)
    tb = draw.textbbox((0, 0), text, font=font)
    draw.text(((w - (tb[2] - tb[0])) / 2, (h - (tb[3] - tb[1])) / 2 - tb[1]),
              text, font=font, fill=BRAND_GOLD)
    if sub:
        sf = _font(int(h * 0.09))
        sb = draw.textbbox((0, 0), sub, font=sf)
        draw.text(((w - (sb[2] - sb[0])) / 2, h * 0.80), sub, font=sf,
                  fill=(235, 235, 245))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return ContentFile(buf.getvalue())


def hue_pair(i):
    hues = [BRAND_PURPLE, (37, 99, 235), (16, 185, 129), (219, 39, 119),
            (234, 88, 12), (2, 132, 199), (147, 51, 234), (5, 150, 105),
            (190, 24, 93), (202, 138, 4), (79, 70, 229)]
    top = hues[i % len(hues)]
    return top, _lerp(top, BRAND_DARK, 0.72)


class Command(BaseCommand):
    help = "Seed branding, categories, games (with images), winners, profit."

    def handle(self, *args, **opts):
        random.seed(42)

        # --- users ---
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser(
                username="admin", password="admin123", role="admin",
                full_name="Site Administrator")
            self.stdout.write("Created admin / admin123")
        if not User.objects.filter(username="user").exists():
            u = User(username="user", role="user", full_name="Demo Player")
            u.set_password("user123")
            u.save()
            self.stdout.write("Created user / user123")

        # --- branding ---
        s = SiteSettings.load()
        s.site_name = "Tiffany Gaming"
        s.tagline = ("Keep playing, keep winning — your journey to success "
                     "starts with each bet.")
        s.color_primary = "#0B0F1A"
        s.color_secondary = "#7C3AED"
        s.color_accent = "#F5C542"
        if not s.logo:
            s.logo.save("logo.png", make_image(400, 400, BRAND_PURPLE,
                        BRAND_DARK, "TF"), save=False)
        s.save()

        b = BusinessInfo.load()
        b.business_name = "Tiffany Gaming"
        b.facebook = b.facebook or "https://facebook.com/tiffanygaming"
        b.save()

        # --- categories ---
        cats = {}
        for i, (name, icon) in enumerate(CATEGORIES):
            c, _ = Category.objects.get_or_create(
                name=name, defaults={"icon": icon, "sort_order": i})
            cats[name] = c

        # --- games ---
        for i, (name, cat, short, desc, feats, faqs) in enumerate(GAMES):
            from django.utils.text import slugify
            slug = slugify(name)
            if Game.objects.filter(slug=slug).exists():
                continue
            top, bottom = hue_pair(i)
            initials = "".join(w[0] for w in name.split()[:2]).upper()
            g = Game(
                name=name, slug=slug, category=cats.get(cat),
                short_description=short, description=desc,
                features="\n".join(feats), status="active",
                featured=(i < 4), is_new=(i >= 7), sort_order=i,
                user_link=f"https://play.tiffany.gg/{slug}",
                agent_link=f"https://agent.tiffany.gg/{slug}",
                meta_title=f"{name} Download & Login — Play {name} Online",
                meta_description=short,
                meta_keywords=(f"{name}, {name} download, {name} login, "
                               f"{name} agent, sweepstakes, fish games, slots"),
                clicks=random.randint(20, 400), views=random.randint(80, 900),
                sub_points=random.choice([0, 50, 120, 300, 40, 500]),
                vendor_points=random.choice([0, 30, 80, 200, 60, 400]))
            from content.imagegen import make_banner, make_logo, make_thumb
            g.logo.save(f"{slug}-logo.png", make_logo(name, cat, i), save=False)
            g.thumbnail.save(f"{slug}-thumb.png", make_thumb(name, cat, i), save=False)
            g.banner.save(f"{slug}-banner.png", make_banner(name, cat, i), save=False)
            g.save()
            for j, (q, a) in enumerate(faqs):
                FAQ.objects.create(game=g, question=q, answer=a, sort_order=j)
            for j in range(3):
                g.screenshots.create(
                    image=make_shot(top, bottom, f"{name} #{j+1}", slug, j),
                    alt=f"{name} screenshot {j+1}", sort_order=j)
        self.stdout.write(f"Games: {Game.objects.count()}")

        # --- winners ---
        if not Winner.objects.exists():
            names = ["Marcus L.", "Aisha K.", "Diego R.", "Priya S.", "Sam O."]
            for k, nm in enumerate(names):
                Winner.objects.create(
                    name=nm, amount=random.choice([500, 1200, 2500, 5000, 888]),
                    game=random.choice([g[0] for g in GAMES]),
                    win_date=date.today() - timedelta(days=k))

        # --- announcements ---
        if not Announcement.objects.exists():
            Announcement.objects.create(
                title="Weekend Bonus is Live!", pinned=True, active=True,
                body="Contact your agent for a special weekend reload on all "
                     "fish games and slots.")
            Announcement.objects.create(
                title="New Games Added", active=True,
                body="Vegas Sweeps, VPower and River Sweeps just landed.")

        # --- payment methods ---
        if not PaymentMethod.objects.exists():
            for i, (nm, det, ic) in enumerate([
                ("CashApp", "$TiffanyGaming", "cash"),
                ("Bitcoin", "Ask agent for wallet", "coin"),
                ("Venmo", "@TiffanyGaming", "card"),
                ("PayPal", "pay@tiffany.gg", "card"),
            ]):
                PaymentMethod.objects.create(name=nm, details=det, icon=ic,
                                             sort_order=i)

        # --- cashouts ---
        if not Cashout.objects.exists():
            methods = ["CashApp", "Bitcoin", "Venmo", "PayPal"]
            for k in range(8):
                Cashout.objects.create(
                    player=random.choice(["Marcus L.", "Aisha K.", "Diego R.",
                                          "Priya S.", "Sam O.", "Demo Player"]),
                    amount=random.choice([100, 250, 500, 80, 1200, 300]),
                    method=random.choice(methods),
                    game=random.choice([g[0] for g in GAMES]),
                    date=date.today() - timedelta(days=random.randint(0, 3)))

        # --- promotions ---
        if not Promo.objects.exists():
            Promo.objects.create(title="200% First Load Bonus", code="TIFFANY200",
                                 description="Double your first load on any game. Ask your agent.", sort_order=0)
            Promo.objects.create(title="Refer & Earn", code="REFER",
                                 description="Invite friends with your referral code and earn credits.", sort_order=1)
            Promo.objects.create(title="Weekend Cashback", code="WEEKEND",
                                 description="10% cashback on weekend losses across all fish games.", sort_order=2)

        # --- site FAQs ---
        if not SiteFAQ.objects.exists():
            for i, (q, a) in enumerate([
                ("How do I create an account?", "Accounts are created by our agents. Contact support in live chat to get started."),
                ("How do I load my balance?", "Open live chat with an agent, choose a payment method, and they'll load your account."),
                ("How do I cash out?", "Message an agent in chat with your cashout amount and preferred method."),
                ("Which games can I play?", "Juwa, Game Vault, Orion Stars, Fire Kirin and many more — see the Games page."),
                ("Is there a welcome bonus?", "Yes! See the Promotions page for current offers."),
            ]):
                SiteFAQ.objects.create(question=q, answer=a, sort_order=i)

        # --- backfill referral codes + wallets + demo reviews ---
        for u in User.objects.all():
            if not u.referral_code:
                u.save()
        player = User.objects.filter(username="user").first()
        if player:
            w, _ = Wallet.objects.get_or_create(user=player)
            if w.balance == 0 and not player.transactions.exists():
                w.balance = 250; w.save()
                Transaction.objects.create(user=player, amount=250, kind="load",
                                           note="Welcome load")
                Transaction.objects.create(user=player, amount=50, kind="bonus",
                                           note="Signup bonus")
            if not Review.objects.filter(user=player).exists():
                for g in Game.objects.all()[:4]:
                    Review.objects.create(game=g, user=player,
                                          rating=random.choice([4, 5, 5]),
                                          comment="Great game, fast payouts!")
                for g in Game.objects.all()[:2]:
                    Favorite.objects.get_or_create(game=g, user=player)

        self.stdout.write(self.style.SUCCESS("Seed complete."))


def make_shot(top, bottom, text, slug, j):
    return make_image(800, 500, bottom, top, text)
