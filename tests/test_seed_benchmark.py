"""Step 6 tests: /seed data integrity + /benchmark/run aggregation."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db import BenchmarkQuestion, Edge, Node


def test_seed_loads_graph(client, reset_db, session):
    resp = client.post("/seed")
    assert resp.status_code == 200
    body = resp.json()
    assert body["nodes"] >= 15
    assert body["edges"] >= 28
    assert body["superseded"] == 3
    assert body["questions"] == 15

    graph = client.get("/graph").json()
    labels = {n["label"] for n in graph["nodes"]}
    assert {"Aisha", "Rahul", "Mohan", "Dubai", "Taipei", "Acme", "Nimbus Labs"} <= labels

    # supersession chains: exactly 3 superseded edges, each pointing at its successor
    sup = [e for e in graph["edges"] if e["status"] == "superseded"]
    assert len(sup) == 3
    by_id = {e["id"]: e for e in graph["edges"]}
    for old in sup:
        assert old["superseded_by"] in by_id
        assert old["valid_to"] is not None

    # nothing deleted: Rahul AND Mohan dating edges both exist
    dating = [e for e in graph["edges"] if e["relation"] == "dating"]
    assert len(dating) == 2

    questions = session.execute(select(BenchmarkQuestion)).scalars().all()
    assert len(questions) == 15


def test_seed_twice_is_idempotent_shape(client, reset_db):
    client.post("/seed")
    r2 = client.post("/seed").json()
    assert r2["edges"] >= 28 and r2["superseded"] == 3


@pytest.fixture()
def mock_answer_llm(monkeypatch):
    from app import ask as ask_mod
    from app.llm import LLMResult

    def fake_call(system, user, max_tokens=800):
        # extract the context block and echo the last "Relevant memories" line's
        # object label so correctness checks can pass realistically
        return LLMResult(text="Taipei (mock)", tokens_in=42, tokens_out=5)

    monkeypatch.setattr(ask_mod, "call_llm", fake_call)


def test_benchmark_runs_and_aggregates(client, reset_db, mock_answer_llm):
    client.post("/seed")
    resp = client.get("/benchmark/run")
    assert resp.status_code == 200
    body = resp.json()
    assert body["questions_run"] == 15
    strats = {s["strategy"]: s for s in body["strategies"]}
    assert set(strats.keys()) == {"full_dump", "flat_rag", "pagerank"}
    for s in strats.values():
        assert s["avg_tokens_in"] == 42.0
        assert s["accuracy"] is not None
    assert body["retrieval_diversity"]["distinct_nodes"] > 0
    assert len(body["results"]) == 15


def test_benchmark_empty(client, reset_db):
    body = client.get("/benchmark/run").json()
    assert body["error"] == "No benchmark questions. POST /seed first."
