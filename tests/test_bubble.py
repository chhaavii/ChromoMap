"""Step 5 tests: /bubble entropy metric."""
from __future__ import annotations

import json
import math

import pytest

from app.db import Node, QueryLog, utcnow


def _add_query(session, node_ids):
    session.add(
        QueryLog(
            question="q",
            strategy="pagerank",
            tokens_in=1,
            tokens_out=1,
            latency_ms=1.0,
            node_ids_used=json.dumps(node_ids),
            answer="a",
            created_at=utcnow(),
        )
    )


def test_bubble_empty(client, reset_db):
    b = client.get("/bubble").json()
    assert b == {
        "entropy": 0.0,
        "max_entropy": 0.0,
        "bubble_score": 0.0,
        "top_dominant_nodes": [],
        "window": 0,
    }


def test_bubble_uniform(client, reset_db, session):
    n1 = Node(label="One", type="person")
    n2 = Node(label="Two", type="person")
    n3 = Node(label="Three", type="person")
    session.add_all([n1, n2, n3])
    session.commit()

    # perfectly uniform usage -> entropy == max entropy -> bubble 0
    _add_query(session, [n1.id, n2.id])
    _add_query(session, [n3.id])
    session.commit()
    b = client.get("/bubble").json()
    assert b["window"] == 2
    assert b["bubble_score"] == pytest.approx(0.0, abs=1e-6)


def test_bubble_dominant(client, reset_db, session):
    n1 = Node(label="One", type="person")
    n2 = Node(label="Two", type="person")
    n3 = Node(label="Three", type="person")
    session.add_all([n1, n2, n3])
    session.commit()

    # heavy skew toward n1: A=6, B=1, C=1 -> bubble ~0.33
    _add_query(session, [n1.id])
    _add_query(session, [n1.id])
    _add_query(session, [n1.id, n1.id])
    _add_query(session, [n1.id, n1.id])
    _add_query(session, [n2.id])
    _add_query(session, [n3.id])
    session.commit()
    b = client.get("/bubble").json()
    assert b["bubble_score"] > 0.25
    assert b["top_dominant_nodes"][0]["label"] == "One"
    shares = [d["share"] for d in b["top_dominant_nodes"]]
    assert shares[0] == max(shares)
    assert sum(shares) <= 1.0 + 1e-6


def test_bubble_entropy_math(client, reset_db, session):
    n1 = Node(label="A", type="person")
    n2 = Node(label="B", type="person")
    session.add_all([n1, n2])
    session.commit()

    # frequencies: A=3, B=1 -> p=(0.75, 0.25)
    _add_query(session, [n1.id, n1.id])
    _add_query(session, [n1.id])
    _add_query(session, [n2.id])
    session.commit()

    b = client.get("/bubble").json()
    expected_entropy = -(0.75 * math.log2(0.75) + 0.25 * math.log2(0.25))
    expected_max = math.log2(2)
    assert b["entropy"] == pytest.approx(expected_entropy, abs=1e-3)
    assert b["max_entropy"] == pytest.approx(expected_max, abs=1e-3)
    assert b["bubble_score"] == pytest.approx(1 - expected_entropy / expected_max, abs=1e-3)


def test_bubble_window_is_20(client, reset_db, session):
    n1 = Node(label="A", type="person")
    session.add(n1)
    session.commit()
    for _ in range(25):
        _add_query(session, [n1.id])
    session.commit()
    b = client.get("/bubble").json()
    assert b["window"] == 20
