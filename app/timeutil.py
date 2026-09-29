"""Small ISO date/datetime parsing helpers (lenient, always naive UTC)."""
from __future__ import annotations

from datetime import datetime, timezone


def parse_iso(value: str) -> datetime:
    """Parse 'YYYY-MM-DD' or full ISO 8601 (with Z or offset) into naive UTC."""
    v = value.strip()
    if v.endswith("Z"):
        v = v[:-1] + "+00:00"
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def parse_date_or_none(value: str | None) -> datetime | None:
    """Parse an LLM-provided date string; return None if empty/unparseable."""
    if not value:
        return None
    v = value.strip()
    if not v or v.lower() in {"null", "none", "unknown"}:
        return None
    try:
        return parse_iso(v)
    except ValueError:
        return None
