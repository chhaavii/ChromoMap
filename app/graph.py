"""Graph serialization: strength, recency, optional as_of view."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Edge, Node, utcnow
from app.timeutil import parse_iso


def edge_active_as_of(edge, as_of):
    # Is this edge active at the given instant? as_of None means now-view.
    ref = as_of or utcnow()
    starts_ok = edge.valid_from is None or edge.valid_from <= ref
    ends_ok = edge.valid_to is None or edge.valid_to > ref
    return bool(starts_ok and ends_ok)


def get_graph(session: Session, as_of):
    # Serialize nodes/edges with strength, recency and as_of activity flags.
    as_of_dt = parse_iso(as_of) if as_of else None

    nodes = session.execute(select(Node)).scalars().all()
    edges = session.execute(select(Edge)).scalars().all()

    now = utcnow()
    created = [n.created_at for n in nodes]
    t_min = min(created) if created else now
    t_max = max(created) if created else now
    span = max((t_max - t_min).total_seconds(), 1e-6)

    strength = {}
    for e in edges:
        w = e.weight or 0.0
        strength[e.source_id] = strength.get(e.source_id, 0.0) + w
        strength[e.target_id] = strength.get(e.target_id, 0.0) + w

    node_dicts = []
    single = len(nodes) <= 1 or span <= 1e-6
    for n in nodes:
        # 0..1 relative age: oldest node = 0, newest node = 1
        recency = 1.0 if single else (n.created_at - t_min).total_seconds() / span
        node_dicts.append(n.to_dict(strength=strength.get(n.id, 0.0), recency=recency))

    edge_dicts = [e.to_dict(active=edge_active_as_of(e, as_of_dt)) for e in edges]
    return {"nodes": node_dicts, "edges": edge_dicts}
