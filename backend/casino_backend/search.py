"""Forgiving search for list endpoints: every word must match somewhere, partial words are fine
("s" finds everything with an s; "maya lo" finds Maya Lopez; "maya_l" finds maya_lopez)."""

import re

from django.db.models import Q


def tokens(query):
    return [t for t in re.split(r"[\s_.\-@]+", (query or "").strip()) if t]


def token_filter(qs, query, fields):
    """Narrow `qs` to rows where each word in `query` is a case-insensitive part of one of `fields`."""
    for t in tokens(query):
        cond = Q()
        for f in fields:
            cond |= Q(**{f"{f}__icontains": t})
        qs = qs.filter(cond)
    return qs
