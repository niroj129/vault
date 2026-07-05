"""Nepal (Asia/Kathmandu, UTC+5:45) three-shift day for transaction tracking.

Shifts (8h each, 3 staff):
  Morning  05:00 – 13:00   "Morning (5-1)"
  Evening  13:00 – 21:00   "Evening (1-9)"
  Night    21:00 – 05:00   "Night (9-5)"
"""

from datetime import timedelta

from django.utils import timezone

NEPAL_OFFSET = timedelta(hours=5, minutes=45)

SHIFTS = [
    ("Morning (5-1)", 5 * 60, 13 * 60),
    ("Evening (1-9)", 13 * 60, 21 * 60),
    ("Night (9-5)", 21 * 60, 5 * 60),  # wraps midnight
]


def nepal_now(dt=None):
    dt = dt or timezone.now()
    return dt + NEPAL_OFFSET


def shift_for(dt=None):
    """Return (shift_label, nepal_date) for a UTC datetime."""
    n = nepal_now(dt)
    minutes = n.hour * 60 + n.minute
    if 5 * 60 <= minutes < 13 * 60:
        return "Morning (5-1)", n.date()
    if 13 * 60 <= minutes < 21 * 60:
        return "Evening (1-9)", n.date()
    # night: 21:00-05:00. Before 05:00 belongs to the previous Nepal day.
    label = "Night (9-5)"
    date = n.date() if minutes >= 21 * 60 else (n - timedelta(days=1)).date()
    return label, date


def current_shift(dt=None):
    return shift_for(dt)[0]
