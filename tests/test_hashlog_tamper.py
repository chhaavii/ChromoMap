"""Step 7 tests: hash chain tamper detection."""
from __future__ import annotations

from sqlalchemy import select, text

from app.db import HashLog
from app.hashlog import append_entry, verify_chain


def test_empty_chain_valid(client, reset_db, session):
    v = verify_chain(session)
    assert v == {"valid": True, "length": 0, "root_hash": "0" * 64}


def test_seeded_chain_valid(client, reset_db, session):
    client.post("/seed")
    v = client.get("/hashlog/verify").json()
    assert v["valid"] is True
    assert v["length"] == 1
    assert len(v["root_hash"]) == 64


def test_tamper_payload_detected(client, reset_db, session):
    client.post("/seed")
    for i in range(3):
        append_entry(session, "ingest", {"n": i})
    session.commit()
    assert verify_chain(session)["valid"] is True

    # tamper with a middle entry's payload
    entries = session.execute(select(HashLog).order_by(HashLog.seq.asc())).scalars().all()
    victim = entries[1]
    session.execute(
        HashLog.__table__.update()
        .where(HashLog.seq == victim.seq)
        .values(payload_json='{"event": "ingest", "n": 999}')
    )
    session.commit()
    session.expire_all()

    v = verify_chain(session)
    assert v["valid"] is False
    assert v["broken_at_index"] == 1
    assert v["broken_entry_id"] == victim.id


def test_tamper_any_position_detected(client, reset_db, session):
    for i in range(4):
        append_entry(session, "ingest", {"n": i})
    session.commit()

    # tamper with the LAST entry
    entries = session.execute(select(HashLog).order_by(HashLog.seq.asc())).scalars().all()
    last = entries[-1]
    session.execute(
        HashLog.__table__.update().where(HashLog.seq == last.seq).values(prev_hash="f" * 64)
    )
    session.commit()
    session.expire_all()

    v = verify_chain(session)
    assert v["valid"] is False


def test_deletion_leaves_valid_chain(client, reset_db, session):
    client.post("/seed")
    graph = client.get("/graph").json()
    victim = next(n for n in graph["nodes"] if n["label"] == "Ben")
    client.delete(f"/node/{victim['id']}")
    v = client.get("/hashlog/verify").json()
    assert v["valid"] is True
    assert v["length"] == 2  # seed + tombstone
