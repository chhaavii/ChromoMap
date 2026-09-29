"""Step 4 tests: decay tick, pin/mute/unmute, hard delete."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.db import Edge, Node, utcnow


def _dt(s):
    return datetime.fromisoformat(s) if isinstance(s, str) else s


def make_graph(session, edges):
    nodes = {}
    for s, rel, o, *_ in edges:
        for label in (s, o):
            if label not in nodes:
                n = Node(label=label, type="person", cluster="other")
                session.add(n)
                nodes[label] = n
    session.flush()
    for s, rel, o, vf, vt, status in edges:
        session.add(
            Edge(
                source_id=nodes[s].id,
                target_id=nodes[o].id,
                relation=rel,
                valid_from=_dt(vf),
                valid_to=_dt(vt) if vt else None,
                status=status,
                source_text="seed",
            )
        )
    session.flush()


def label_id(session, label):
    return session.execute(select(Node).where(Node.label == label)).scalar_one().id


def test_pin_toggle(client, reset_db, session):
    make_graph(session, [("A", "knows", "B", "2024-01-01", None, "current")])
    session.commit()
    nid = label_id(session, "A")

    r1 = client.post(f"/node/{nid}/pin").json()
    assert r1["pinned"] is True
    r2 = client.post(f"/node/{nid}/pin").json()
    assert r2["pinned"] is False


def test_mute_unmute(client, reset_db, session):
    make_graph(session, [("A", "knows", "B", "2024-01-01", None, "current")])
    session.commit()
    nid = label_id(session, "B")

    assert client.post(f"/node/{nid}/mute").json()["muted"] is True
    assert client.post(f"/node/{nid}/unmute").json()["muted"] is False


def test_mute_404_unknown(client, reset_db):
    assert client.post("/node/does-not-exist/mute").status_code == 404


def test_delete_node_removes_from_retrieval(client, reset_db, session):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Mohan", "2024-06-01", None, "current"),
            ("Aisha", "works_at", "Acme", "2024-06-01", None, "current"),
        ],
    )
    session.commit()
    mohan_id = label_id(session, "Mohan")
    dating_edge_id = session.execute(
        select(Edge).where(Edge.relation == "dating")
    ).scalar_one().id

    resp = client.delete(f"/node/{mohan_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == mohan_id
    assert body["edges_deleted"] == 1

    # gone from /graph
    graph = client.get("/graph").json()
    assert mohan_id not in [n["id"] for n in graph["nodes"]]

    # the deleted edge is really gone from the DB
    assert session.get(Edge, dating_edge_id) is None

    # gone from pagerank retrieval (only works_at edge remains)
    from app.retrieval import pagerank_retrieval

    top, _ranked, _inf, eligible = pagerank_retrieval(session, "Who is Aisha dating?")
    assert mohan_id not in top
    assert dating_edge_id not in eligible

    # and no strategy can return the deleted edge id
    from app.flatrag import flat_rag_retrieval

    _n, edge_ids, _s = flat_rag_retrieval(session, "dating Mohan")
    assert dating_edge_id not in edge_ids

    session.rollback()  # drop cached state before next fixture use


def test_delete_appends_hash_entry(client, reset_db, session):
    make_graph(session, [("A", "knows", "B", "2024-01-01", None, "current")])
    session.commit()
    b = label_id(session, "B")

    client.delete(f"/node/{b}")
    v = client.get("/hashlog/verify").json()
    assert v["valid"] is True
    assert v["length"] == 1  # the deletion tombstone


def test_decay_tick_endpoint(client, reset_db, session):
    make_graph(session, [("A", "knows", "B", "2024-01-01", None, "current")])
    edge = session.execute(select(Edge)).scalar_one()
    edge.weight = 2.0
    edge.last_used_at = utcnow() - timedelta(seconds=999)
    session.commit()

    r = client.post("/decay/tick").json()
    assert r["edges_decayed"] >= 1
    session.expire_all()
    edge = session.execute(select(Edge)).scalar_one()
    assert edge.weight == pytest.approx(1.9)  # 2.0 * (1 - 0.05)
