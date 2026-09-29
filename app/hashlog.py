"""Append-only SHA-256 chained audit log."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select

from app.db import HashLog, utcnow


def _compute_entry_hash(payload_json: str, prev_hash: str, created_at_iso: str) -> str:
    material = f"{prev_hash}|{created_at_iso}|{payload_json}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def append_entry(session, event_type: str, payload: dict) -> HashLog:
    """Append one hash-chained entry recording a memory mutation."""
    prev = session.execute(
        select(HashLog).order_by(HashLog.seq.desc()).limit(1)
    ).scalar_one_or_none()
    prev_hash = prev.entry_hash if prev else "0" * 64

    payload_json = json.dumps(
        {"event": event_type, **payload}, sort_keys=True, default=str
    )
    created_at = utcnow()
    entry = HashLog(
        prev_hash=prev_hash,
        entry_hash="pending",
        payload_json=payload_json,
        created_at=created_at,
    )
    session.add(entry)
    session.flush()
    # include rowid/id so entries are unique even within the same microsecond
    entry.entry_hash = _compute_entry_hash(
        payload_json, prev_hash, f"{created_at.isoformat()}Z|{entry.id}"
    )
    session.flush()
    return entry


def verify_chain(session) -> dict:
    """Recompute the whole chain; report the first tampered position if any."""
    entries = session.execute(
        select(HashLog).order_by(HashLog.seq.asc())
    ).scalars().all()

    prev_hash = "0" * 64
    for i, entry in enumerate(entries):
        expected = _compute_entry_hash(
            entry.payload_json, prev_hash, f"{entry.created_at.isoformat()}Z|{entry.id}"
        )
        if entry.prev_hash != prev_hash or entry.entry_hash != expected:
            return {
                "valid": False,
                "length": len(entries),
                "root_hash": entries[-1].entry_hash if entries else prev_hash,
                "broken_at_index": i,
                "broken_entry_id": entry.id,
            }
        prev_hash = entry.entry_hash

    return {
        "valid": True,
        "length": len(entries),
        "root_hash": prev_hash,
    }
