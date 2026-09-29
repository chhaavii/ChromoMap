"""Step 3 tests: flat_rag + /ask/compare."""
from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import select

from app.db import Edge, Node


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
    for s, rel, o, vf, vt, status, text in edges:
        session.add(
            Edge(
                source_id=nodes[s].id,
                target_id=nodes[o].id,
                relation=rel,
                valid_from=_dt(vf),
                valid_to=_dt(vt) if vt else None,
                status=status,
                source_text=text,
            )
        )
    session.flush()


def test_flat_rag_ranks_by_text_similarity(session, reset_db):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Mohan", "2024-06-01", None, "current",
             "Aisha started dating Mohan in June 2024 after moving cities."),
            ("Aisha", "works_at", "Acme", "2023-03-01", None, "current",
             "Aisha began working at Acme Corp in March 2023."),
            ("Ben", "likes", "Tennis", "2023-01-01", None, "current",
             "Ben plays tennis every weekend at the club."),
        ],
    )
    session.commit()

    from app.flatrag import flat_rag_retrieval

    node_ids, edge_ids, snippets = flat_rag_retrieval(
        session, "Where does Aisha work?", top_k=2
    )
    assert snippets, "should return at least one snippet"
    assert "Acme" in snippets[0]  # best match first
    # nodes come from the matched edges
    labels = {
        session.get(Node, nid).label for nid in node_ids
    }
    assert "Aisha" in labels and "Acme" in labels


def test_flat_rag_empty_graph(session, reset_db):
    from app.flatrag import flat_rag_retrieval

    assert flat_rag_retrieval(session, "anything") == ([], [], [])


@pytest.fixture()
def mock_answer_llm(monkeypatch):
    from app import ask as ask_mod
    from app.llm import LLMResult

    def fake_call(system, user, max_tokens=800):
        # answer with the strategy name so tests can assert correctness matching
        strategy_line = next(
            (ln for ln in system.splitlines() if "strategy" in ln), "pagerank"
        )
        return LLMResult(text=f"mock answer for {strategy_line}", tokens_in=40, tokens_out=6)

    monkeypatch.setattr(ask_mod, "call_llm", fake_call)


def test_compare_runs_all_three(client, reset_db, session, mock_answer_llm):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Mohan", "2024-06-01", None, "current",
             "Aisha started dating Mohan in June 2024."),
        ],
    )
    session.commit()

    resp = client.post(
        "/ask/compare",
        json={"question": "Who is Aisha dating?", "expected_answer": "Mohan"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["question"] == "Who is Aisha dating?"
    strategies = [r["strategy"] for r in body["results"]]
    assert strategies == ["full_dump", "flat_rag", "pagerank"]
    for r in body["results"]:
        assert "correct" in r
        assert r["tokens_in"] == 40


def test_compare_correct_flag_substring(client, reset_db, session, mock_answer_llm):
    make_graph(session, [])
    session.commit()

    from app.compare import correct_flag

    assert correct_flag("Aisha is dating Mohan right now", "mohan") is True
    assert correct_flag("someone else", "Mohan") is False
    assert correct_flag("anything", None) is None
    assert correct_flag("anything", "") is None
