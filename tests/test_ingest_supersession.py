"""Tests for ingest + supersession + graph (Step 1 scope)."""
from __future__ import annotations

import pytest

from app.db import Edge, Node
from app.hashlog import verify_chain


def _llm_payload(text: str):
    """Route fake LLM output based on the ingest text."""

    def _handler(**kwargs):
        from app.llm import LLMResult

        if "used to date" in text or "dating" in text:
            return LLMResult(
                text=(
                    '{"facts": ['
                    '{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
                    '"valid_from": "2023-01-10", "valid_to": null, '
                    '"node_types": {"subject": "person", "object": "person"}, '
                    '"clusters": {"subject": "relationships", "object": "relationships"}},'
                    '{"subject": "Aisha", "relation": "dating", "object": "Mohan", '
                    '"valid_from": "2024-06-01", "valid_to": null, '
                    '"node_types": {"subject": "person", "object": "person"}, '
                    '"clusters": {"subject": "relationships", "object": "relationships"}}'
                    "]}"
                ),
                tokens_in=100,
                tokens_out=50,
            )
        return LLMResult(
            text='{"facts": []}',
            tokens_in=10,
            tokens_out=5,
        )

    return _handler


@pytest.fixture()
def mock_llm(monkeypatch):
    """Replace call_llm with a deterministic fake."""
    from app import ingest as ingest_mod

    calls = []

    def fake_call(system, user, max_tokens=1500, temperature=0.0):
        calls.append(user)
        # user contains the source text; find which fixture text it matches
        for marker, handler in FAKE_LLM_TEXTS.items():
            if marker in user:
                return handler()
        from app.llm import LLMResult

        return LLMResult(text='{"facts": []}', tokens_in=10, tokens_out=5)

    monkeypatch.setattr(ingest_mod, "call_llm", fake_call)
    return calls


FAKE_LLM_TEXTS: dict = {}


def test_ingest_creates_nodes_and_edges(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    FAKE_LLM_TEXTS["Rahul"] = lambda: LLMResult(
        text=(
            '{"facts": [{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
            '"valid_from": "2023-01-10", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "person"}, '
            '"clusters": {"subject": "relationships", "object": "relationships"}}]}'
        ),
        tokens_in=100,
        tokens_out=50,
    )

    resp = client.post("/memory/ingest", json={"text": "Aisha started dating Rahul on 2023-01-10."})
    assert resp.status_code == 200
    body = resp.json()
    assert body["nodes_created"] == 2
    assert body["edges_created"] == 1
    assert body["edges_superseded"] == 0
    assert body["tokens_used"] == 150


def test_supersession_closes_old_edge(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    def two_facts():
        return LLMResult(
            text=(
                '{"facts": ['
                '{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
                '"valid_from": "2023-01-10", "valid_to": null, '
                '"node_types": {"subject": "person", "object": "person"}, '
                '"clusters": {"subject": "relationships", "object": "relationships"}},'
                '{"subject": "Aisha", "relation": "dating", "object": "Mohan", '
                '"valid_from": "2024-06-01", "valid_to": null, '
                '"node_types": {"unit": "person", "object": "person"}, '
                '"clusters": {"subject": "relationships", "object": "relationships"}}'
                "]}"
            ),
            tokens_in=120,
            tokens_out=60,
        )

    FAKE_LLM_TEXTS["Mohan"] = two_facts

    resp = client.post(
        "/memory/ingest",
        json={"text": "Aisha dated Rahul from 2023; she has been dating Mohan since 2024-06."},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["edges_created"] == 2
    assert body["edges_superseded"] == 1
    assert body["nodes_created"] == 3  # Aisha, Rahul, Mohan

    # Nothing deleted: both edges still exist
    edges = client.get("/graph").json()["edges"]
    dating = [e for e in edges if e["relation"] == "dating"]
    assert len(dating) == 2
    statuses = sorted(e["status"] for e in dating)
    assert statuses == ["current", "superseded"]
    old = next(e for e in dating if e["status"] == "superseded")
    new = next(e for e in dating if e["status"] == "current")
    assert old["object_label"] if False else old["superseded_by"] == new["id"]
    assert old["valid_to"] is not None


def test_duplicate_fact_not_recreated(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    FAKE_LLM_TEXTS["Rahul"] = lambda: LLMResult(
        text=(
            '{"facts": [{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
            '"valid_from": "2023-01-10", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "person"}, '
            '"clusters": {"subject": "relationships", "object": "relationships"}}]}'
        ),
        tokens_in=100,
        tokens_out=50,
    )

    client.post("/memory/ingest", json={"text": "Aisha started dating Rahul in January 2023."})
    resp = client.post("/memory/ingest", json={"text": "Reminder: Aisha dating Rahul since 2023-01-10."})
    assert resp.status_code == 200
    assert resp.json()["edges_created"] == 0


def test_graph_shape_and_strength(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    FAKE_LLM_TEXTS["Acme"] = lambda: LLMResult(
        text=(
            '{"facts": ['
            '{"subject": "Aisha", "relation": "works_at", "object": "Acme", '
            '"valid_from": "2023-03-01", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "place"}, '
            '"clusters": {"subject": "work", "object": "work"}},'
            '{"subject": "Aisha", "relation": "lives_in", "object": "Dubai", '
            '"valid_from": "2023-03-01", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "place"}, '
            '"clusters": {"subject": "places", "object": "places"}}'
            "]}"
        ),
        tokens_in=120,
        tokens_out=60,
    )

    client.post("/memory/ingest", json={"text": "Aisha works at Acme and lives in Dubai."})
    graph = client.get("/graph").json()
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 2

    aisha = next(n for n in graph["nodes"] if n["label"] == "Aisha")
    assert aisha["strength"] == 2.0
    # recency in 0..1; Aisha created first so she is the oldest -> 0.0
    assert 0.0 <= aisha["recency"] <= 1.0
    labels = [n["label"] for n in graph["nodes"]]
    recencies = {n["label"]: n["recency"] for n in graph["nodes"]}
    assert recencies["Dubai"] == max(recencies.values())  # newest
    assert set(graph["nodes"][0].keys()) >= {
        "id", "label", "type", "cluster", "created_at", "pinned", "muted",
        "token_cost", "strength", "recency",
    }


def test_graph_as_of_marks_edges_inactive(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    FAKE_LLM_TEXTS["Mohan"] = lambda: LLMResult(
        text=(
            '{"facts": ['
            '{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
            '"valid_from": "2023-01-10", "valid_to": "2024-05-31", '
            '"node_types": {"subject": "person", "object": "person"}, '
            '"clusters": {"subject": "relationships", "object": "relationships"}},'
            '{"subject": "Aisha", "relation": "dating", "object": "Mohan", '
            '"valid_from": "2024-06-01", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "person"}, '
            '"clusters": {"subject": "relationships", "object": "relationships"}}'
            "]}"
        ),
        tokens_in=120,
        tokens_out=60,
    )

    client.post("/memory/ingest", json={"text": "Aisha dated Rahul until 2024-05-31, then Mohan."})
    edges = client.get("/graph").json()["edges"]
    assert len(edges) == 2

    past = client.get("/graph", params={"as_of": "2023-06-01"}).json()["edges"]
    rahul = next(e for e in past if e["relation"] == "dating" and e["valid_to"])
    mohan = next(e for e in past if e["relation"] == "dating" and not e["valid_to"])
    assert rahul["active"] is True
    assert mohan["active"] is False


def test_hashlog_appends_and_verifies(client, reset_db, mock_llm):
    FAKE_LLM_TEXTS.clear()
    from app.llm import LLMResult

    FAKE_LLM_TEXTS["Rahul"] = lambda: LLMResult(
        text=(
            '{"facts": [{"subject": "Aisha", "relation": "dating", "object": "Rahul", '
            '"valid_from": "2023-01-10", "valid_to": null, '
            '"node_types": {"subject": "person", "object": "person"}, '
            '"clusters": {"subject": "relationships", "object": "relationships"}}]}'
        ),
        tokens_in=100,
        tokens_out=50,
    )

    client.post("/memory/ingest", json={"text": "Aisha started dating Rahul on 2023-01-10."})
    v = client.get("/hashlog/verify").json()
    assert v["valid"] is True
    assert v["length"] == 1


def test_invalid_ingest_body(client, reset_db):
    resp = client.post("/memory/ingest", json={"text": ""})
    assert resp.status_code == 422
