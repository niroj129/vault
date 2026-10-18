"""Safety net for missed webhooks — run every minute or two (cron):

    python manage.py sync_deposits

* asks BytePayout about pending deposits from the last 3 hours
* expires pending deposits older than that
* re-runs loads still queued after 5 minutes; loads interrupted mid-call
  go to staff (the platform may already have credited them)
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from content.models import SiteSettings
from gaming import bytepayout, service
from gaming.models import Deposit
from tenants.context import use_tenant
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Check pending BytePayout deposits and finish stuck game loads."

    def handle(self, *args, **opts):
        now = timezone.now()
        for tenant in Tenant.objects.filter(is_active=True):
            with use_tenant(tenant):
                if not bytepayout.configured():
                    continue
                pending = Deposit.objects.filter(status=Deposit.Status.PENDING,
                                                 gateway="bytepayout")
                for dep in pending.filter(created_at__gte=now - timedelta(hours=3)):
                    try:
                        dep = service.sync(dep)
                        self.stdout.write(f"{tenant.slug} {dep.reference}: {dep.status}")
                    except bytepayout.PayError as e:
                        self.stderr.write(f"{tenant.slug} {dep.reference}: {e}")
                pending.filter(created_at__lt=now - timedelta(hours=3)).update(
                    status=Deposit.Status.EXPIRED, load_status=Deposit.Load.SKIPPED)
                old = Deposit.objects.filter(status=Deposit.Status.APPROVED,
                                             updated_at__lt=now - timedelta(minutes=5))
                old.filter(load_status=Deposit.Load.LOADING).update(
                    load_status=Deposit.Load.FAILED,
                    load_error="Interrupted — check the player's game balance before retrying.")
                for dep in old.filter(load_status=Deposit.Load.QUEUED):
                    dep = service.run_load(dep.pk)
                    self.stdout.write(f"{tenant.slug} {dep.reference}: load {dep.load_status}")
