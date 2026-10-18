"""Regenerate the generated game art (tile, banner, logo) on every site.

Only images created by the seeder (named "<slug>-thumb/-banner/-logo") are
replaced; anything an operator uploaded is left alone. Use --all to replace
every game's images regardless.
"""

from django.core.management.base import BaseCommand

from catalog.models import Game
from content.imagegen import make_banner, make_logo, make_thumb

FIELDS = [("thumbnail", "thumb", make_thumb), ("banner", "banner", make_banner),
          ("logo", "logo", make_logo)]


class Command(BaseCommand):
    help = "Regenerate seeded game artwork for all tenants."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true",
                            help="Also replace images that were uploaded")

    def handle(self, *args, **opts):
        done = 0
        for i, g in enumerate(Game.all_tenants.select_related("category")
                              .order_by("tenant_id", "sort_order")):
            cat = g.category.name if g.category else ""
            changed = False
            for field, tag, maker in FIELDS:
                f = getattr(g, field)
                generated = not f or f"{g.slug}-{tag}" in f.name
                if not (generated or opts["all"]):
                    continue
                if f:
                    f.delete(save=False)
                f.save(f"{g.slug}-{tag}.jpg", maker(g.name, cat, g.sort_order), save=False)
                changed = True
            if changed:
                Game.all_tenants.filter(pk=g.pk).update(
                    thumbnail=g.thumbnail.name, banner=g.banner.name, logo=g.logo.name)
                done += 1
        self.stdout.write(self.style.SUCCESS(f"Regenerated art for {done} games."))
