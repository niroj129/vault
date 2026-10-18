"""Create the platform tenant (the owner's own site) and move every existing
row into it, so the pre-tenancy data keeps working unchanged."""

from django.db import migrations

SCOPED = [
    ("accounts", "User"), ("accounts", "LoginLog"),
    ("catalog", "Category"), ("catalog", "Game"), ("catalog", "Screenshot"),
    ("catalog", "FAQ"), ("catalog", "Review"), ("catalog", "Favorite"),
    ("content", "Winner"), ("content", "DailyProfit"), ("content", "Announcement"),
    ("content", "SiteSettings"), ("content", "BusinessInfo"),
    ("content", "ContactMessage"), ("content", "PaymentMethod"),
    ("content", "Cashout"), ("content", "Wallet"), ("content", "Transaction"),
    ("content", "Notification"), ("content", "Promo"), ("content", "SiteFAQ"),
    ("content", "GameTxn"), ("content", "SEOPage"),
    ("chat", "Message"), ("chat", "Conversation"), ("chat", "Participant"),
    ("chat", "ChatMessage"),
    ("payments", "Merchant"), ("payments", "PayOrder"),
    ("payments", "TransferOrder"),
]


def forwards(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Domain = apps.get_model("tenants", "Domain")
    platform, _ = Tenant.objects.get_or_create(
        slug="platform",
        defaults={"name": "Platform", "is_platform": True, "plan": "enterprise",
                  "feature_sms": True, "feature_payments": True})
    for host in ("localhost", "127.0.0.1"):
        Domain.objects.get_or_create(host=host, defaults={
            "tenant": platform, "is_primary": host == "localhost"})
    for app, model in SCOPED:
        M = apps.get_model(app, model)
        M._base_manager.filter(tenant__isnull=True).update(tenant=platform)


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0001_initial"),
        ("accounts", "0005_alter_user_options_alter_loginlog_managers_and_more"),
        ("catalog", "0004_alter_category_managers_alter_faq_managers_and_more"),
        ("content", "0009_alter_wallet_options_alter_announcement_managers_and_more"),
        ("chat", "0002_conversation_alter_message_managers_message_tenant_and_more"),
        ("payments", "0002_alter_merchant_managers_alter_payorder_managers_and_more"),
    ]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
