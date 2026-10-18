from django.apps import AppConfig


class MailinConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mailin"
    verbose_name = "Forwarded emails"
