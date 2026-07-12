from rest_framework.permissions import BasePermission


class IsMerchantOrAdmin(BasePermission):
    """Authenticated users who are a merchant or an admin."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated
                    and (u.is_admin_role or u.role == "merchant"))


def merchant_of(user):
    """Return the Merchant profile for a user, or None."""
    return getattr(user, "merchant", None)
