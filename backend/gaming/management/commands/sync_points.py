"""Keep each game's points in step with its platform:

    python manage.py sync_points

Games on an API-connected platform get that platform's live agent points (the
worker runs this every few minutes).
"""

from django.core.management.base import BaseCommand

from gaming import service
from tenants.context import use_tenant
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Pull agent points from every connected game platform."

    def handle(self, *args, **opts):
        for tenant in Tenant.objects.filter(is_active=True):
            with use_tenant(tenant):
                n = service.sync_points()
                if n:
                    self.stdout.write(f"{tenant.slug}: {n} platform(s) updated")
