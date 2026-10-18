from django.core.management.base import BaseCommand

from chat.push import generate_keys


class Command(BaseCommand):
    help = "Print a new VAPID key pair for Web Push (put them in .env)."

    def handle(self, *args, **opts):
        k = generate_keys()
        self.stdout.write(f"VAPID_PUBLIC_KEY={k['public']}\n"
                          f"VAPID_PRIVATE_KEY={k['private']}")
