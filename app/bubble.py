"""Bubble metric: entropy of node usage across recent queries (echo-chamber guard)."""
from __future__ import annotations

import json
import math
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Node, QueryLog

WINDOW = 20


def get_bubble(session: Session) -> dict:
    logs = session.execute(
        select(QueryLog).order_by(QueryLog.created_at.desc(), QueryLog.id.desc()).limit(WINDOW)
    ).scalars().all()

    freq: Counter[str] = Counter()
    for log in logs:
        try:
            ids = json.loads(log.node_ids_used or "[]")
        except json.JSONDecodeError:
            ids = []
        freq.update(i for i in ids if i)

    total = sum(freq.values())
    if total == 0:
        return {
            "entropy": 0.0,
            "max_entropy": 0.0,
            "bubble_score": 0.0,
            "top_dominant_nodes": [],
            "window": 0,
        }

    # Shannon entropy over the node frequency distribution
    probs = [c / total for c in freq.values()]
    entropy = -sum(p * math.log2(p) for p in probs if p > 0)
    max_entropy = math.log2(len(freq)) if len(freq) > 1 else 0.0
    bubble_score = 1.0 - (entropy / max_entropy) if max_entropy > 0 else 0.0

    labels = {
        n.id: n.label
        for n in session.execute(select(Node)).scalars().all()
    }
    top = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "entropy": round(entropy, 4),
        "max_entropy": round(max_entropy, 4),
        "bubble_score": round(bubble_score, 4),
        "top_dominant_nodes": [
            {"node_id": nid, "label": labels.get(nid, nid), "share": round(count / total, 4)}
            for nid, count in top
        ],
        "window": len(logs),
    }
