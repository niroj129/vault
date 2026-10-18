from django.contrib import admin

from .models import Domain, Tenant


class DomainInline(admin.TabularInline):
    model = Domain
    extra = 1


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "plan", "is_active", "paid_until"]
    inlines = [DomainInline]
