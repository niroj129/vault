from django.contrib.auth.backends import ModelBackend


class TenantModelBackend(ModelBackend):
    """Username/password login against the current tenant's users only.

    User.objects is tenant-filtered, so ModelBackend's lookup already scopes
    to the site being logged into; this class exists so Django accepts a
    username that is unique per tenant rather than globally.
    """
