"""Token auth that refuses a token used on another tenant's site."""

from knox.auth import TokenAuthentication
from rest_framework import exceptions

from .context import get_current_tenant


class TenantTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        tenant = get_current_tenant()
        if tenant and user.tenant_id != tenant.id:
            raise exceptions.AuthenticationFailed("Invalid token.")
        return user, token
