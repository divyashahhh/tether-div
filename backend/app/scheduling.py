"""Ranks call times that work for both partners across their timezones.

Each person's availability is three local-time windows ("HH:MM-HH:MM", may wrap
past midnight): sleep, busy and preferred. We score every 30-minute slot in the
next 24 hours: a slot where anyone is asleep is excluded; preferred time scores
highest, free time next, busy time lowest.
"""

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DEFAULT_AVAILABILITY = {"sleep": "23:30-07:30", "busy": "09:00-17:00", "preferred": "20:00-22:00"}

WINDOW_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$")

SLOT_MINUTES = 30
HORIZON_SLOTS = 48
POINTS = {"preferred": 50, "free": 30, "busy": 8}


def parse_window(value: str) -> tuple[int, int] | None:
    match = WINDOW_RE.match((value or "").strip())
    if not match:
        return None
    h1, m1, h2, m2 = (int(g) for g in match.groups())
    return h1 * 60 + m1, h2 * 60 + m2


def in_window(minute_of_day: int, window: tuple[int, int] | None) -> bool:
    if window is None:
        return False
    start, end = window
    if start == end:
        return False
    if start < end:
        return start <= minute_of_day < end
    return minute_of_day >= start or minute_of_day < end


def state_at(moment_utc: datetime, tz: str, availability: dict) -> str:
    local = moment_utc.astimezone(ZoneInfo(tz))
    minute = local.hour * 60 + local.minute
    for key in ("sleep", "busy", "preferred"):
        if in_window(minute, parse_window(availability.get(key, ""))):
            return key
    return "free"


def _slot_state(start: datetime, tz: str, availability: dict) -> str:
    # A slot is only as good as its worst moment (e.g. running into bedtime).
    states = [state_at(start + timedelta(minutes=offset), tz, availability) for offset in (0, 15, 29)]
    for worst in ("sleep", "busy", "free"):
        if worst in states:
            return worst
    return "preferred"


def rank_call_slots(people: list[dict], now: datetime, limit: int = 3) -> list[dict]:
    """people: [{"timezone": str, "availability": dict}, ...] (two entries)."""
    minutes_to_next = SLOT_MINUTES - (now.minute % SLOT_MINUTES)
    first = (now + timedelta(minutes=minutes_to_next)).replace(second=0, microsecond=0)

    candidates = []
    for i in range(HORIZON_SLOTS):
        start = first + timedelta(minutes=SLOT_MINUTES * i)
        states = [_slot_state(start, p["timezone"], p["availability"]) for p in people]
        if "sleep" in states:
            continue
        score = sum(POINTS[s] for s in states)
        candidates.append({"start": start, "states": states, "score": score})

    candidates.sort(key=lambda c: (-c["score"], c["start"]))
    picked: list[dict] = []
    for cand in candidates:
        if all(abs((cand["start"] - p["start"]).total_seconds()) >= 90 * 60 for p in picked):
            picked.append(cand)
        if len(picked) == limit:
            break

    return [
        {
            "starts_at": c["start"].isoformat(),
            "ends_at": (c["start"] + timedelta(minutes=SLOT_MINUTES)).isoformat(),
            "score": c["score"],
            "states": c["states"],
        }
        for c in picked
    ]
