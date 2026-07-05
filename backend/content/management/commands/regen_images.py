"""Regenerate premium name-branded images for every game.

Usage: python manage.py regen_images
"""

from django.core.management.base import BaseCommand

from catalog.models import Game
from content.imagegen import make_banner, make_logo, make_thumb


class Command(BaseCommand):
    help = "Regenerate logo/thumbnail/banner images for all games."

    def handle(self, *args, **opts):
        for i, g in enumerate(Game.objects.all().order_by("id")):
            cat = g.category.name if g.category else ""
            g.logo.save(f"{g.slug}-logo.png", make_logo(g.name, cat, i), save=False)
            g.thumbnail.save(f"{g.slug}-thumb.png", make_thumb(g.name, cat, i), save=False)
            g.banner.save(f"{g.slug}-banner.png", make_banner(g.name, cat, i), save=False)
            g.save()
            self.stdout.write(f"  ✓ {g.name}")
        self.stdout.write(self.style.SUCCESS(
            f"Regenerated images for {Game.objects.count()} games."))
