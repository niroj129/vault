"""Sites that already set up the single game API under Settings get it as
their first game platform connection."""

from django.db import migrations


def forwards(apps, schema_editor):
    SiteSettings = apps.get_model("content", "SiteSettings")
    GameProvider = apps.get_model("gaming", "GameProvider")
    for s in SiteSettings.objects.all():
        if s.game_api_url and s.game_api_agent_id and s.game_api_secret:
            GameProvider.objects.get_or_create(
                tenant_id=s.tenant_id, name="Game platform",
                defaults={"kind": "external", "base_url": s.game_api_url,
                          "agent_name": s.game_api_agent_id,
                          "secret_key": s.game_api_secret,
                          "use_doh": s.game_api_use_doh,
                          "force_ip": s.game_api_force_ip})


class Migration(migrations.Migration):
    dependencies = [("gaming", "0001_initial"),
                    ("content", "0012_gametxn_game_gametxn_user_sitesettings_allow_signup_and_more")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
