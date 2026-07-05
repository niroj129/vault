from rest_framework import serializers


class RelativeImageField(serializers.ImageField):
    """Serialize image URLs as root-relative paths (e.g. /media/x.png) instead of
    absolute URLs built from the request host.

    This lets the frontend prepend the correct PUBLIC base, so server-side
    rendering (which fetches the API over an internal address) still emits
    browser-loadable public image URLs. Writes (uploads) behave normally.
    """

    def to_representation(self, value):
        if not value:
            return None
        try:
            return value.url
        except Exception:
            return None
