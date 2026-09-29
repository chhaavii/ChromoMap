"""Hebbian reinforcement and decay rules. All constants in app.config."""
from __future__ import annotations

from datetime import datetime

from app.config import DECAY_LAMBDA, HEBBIAN_ETA, WEIGHT_CAP, WEIGHT_FLOOR
from app.db import Edge, utcnow


def reinforce_on_use(edge: Edge, now: datetime | None = None) -> None:
    """On use: w += ETA, use_count += 1, last_used_at = now. Capped at WEIGHT_CAP."""
    edge.weight = min(WEIGHT_CAP, (edge.weight or 1.0) + HEBBIAN_ETA * 1.0)
    edge.use_count = (edge.use_count or 0) + 1
    edge.last_used_at = now or utcnow()


def decay_tick(
    session,
    tick_window_seconds: float = 60.0,
    now: datetime | None = None,
) -> dict:
    """w = max(W_FLOOR, w - LAMBDA*w) for edges NOT used within the window.

    Returns a small summary for the API response.
    """
    from sqlalchemy import select

    now = now or utcnow()
    edges = session.execute(select(Edge)).scalars().all()
    decayed = 0
    for edge in edges:
        used_recently = (
            edge.last_used_at is not None
            and (now - edge.last_used_at).total_seconds() <= tick_window_seconds
        )
        if used_recently:
            continue
        new_w = max(WEIGHT_FLOOR, (edge.weight or 1.0) - DECAY_LAMBDA * (edge.weight or 1.0))
        if new_w != edge.weight:
            edge.weight = new_w
            decayed += 1
    return {"edges_decayed": decayed, "total_edges": len(edges)}
