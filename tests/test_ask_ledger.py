"""Step 2 tests: pagerank retrieval, time-awareness, mute/pinned, hebbian, ledger."""
from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import select

from app.db import Edge, Node
from app.hebbian import reinforce_on_use


def _dt(s):
    return datetime.fromisoformat(s) if isinstance(s, str) else s


# ---------- helpers ----------

def make_graph(session, edges):
    """edges: list of (s_label, relation, o_label, valid_from, valid_to, status)."""
    nodes = {}
    for s, rel, o, *_ in edges:
        for label in (s, o):
            if label not in nodes:
                n = Node(label=label, type="person", cluster="other")
                session.add(n)
                nodes[label] = n
    session.flush()
    made = []
    for s, rel, o, vf, vt, status in edges:
        e = Edge(
            source_id=nodes[s].id,
            target_id=nodes[o].id,
            relation=rel,
            valid_from=_dt(vf),
            valid_to=_dt(vt) if vt else None,
            status=status,
            source_text="seed",
        )
        session.add(e)
        made.append(e)
    session.flush()
    return nodes, made


def node_by_label(session, label):
    from sqlalchemy import select

    return session.execute(select(Node).where(Node.label == label)).scalar_one()


# ---------- retrieval ----------

def test_pagerank_includes_superseded_for_past_questions(session, reset_db):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Rahul", "2023-01-01 00:00:00", "2024-06-01 00:00:00", "superseded"),
            ("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current"),
        ],
    )
    session.commit()
    from app.retrieval import pagerank_retrieval

    past_nodes, _, _, past_edges = pagerank_retrieval(session, "Who did Aisha used to date?")
    assert node_by_label(session, "Rahul").id in past_nodes

    now_nodes, _, _, now_edges = pagerank_retrieval(session, "Who is Aisha dating?")
    assert node_by_label(session, "Mohan").id in now_nodes
    # current question should not route through superseded edges
    assert len(now_edges) < len(past_edges)


def test_pagerank_excludes_muted_nodes(session, reset_db):
    nodes, _ = make_graph(
        session,
        [("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current")],
    )
    node = node_by_label(session, "Mohan")
    node.muted = True
    session.commit()

    from app.retrieval import pagerank_retrieval

    top, _, _, _ = pagerank_retrieval(session, "Who is Aisha dating?")
    assert node.id not in top


def test_pinned_node_gets_score_floor(session, reset_db):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current"),
            ("Aisha", "works_at", "Acme", "2024-06-01 00:00:00", None, "current"),
        ],
    )
    pinned = node_by_label(session, "Acme")
    pinned.pinned = True
    session.commit()

    from app.retrieval import pagerank_retrieval

    top, _ranked, influence, _ = pagerank_retrieval(session, "Who is Aisha dating?", top_n=2)
    inf = {i["node_id"]: i["score"] for i in influence}
    assert inf[pinned.id] >= 0.1


def test_full_dump_includes_everything(session, reset_db):
    make_graph(
        session,
        [
            ("Aisha", "dating", "Rahul", "2023-01-01 00:00:00", "2024-06-01 00:00:00", "superseded"),
            ("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current"),
        ],
    )
    session.commit()
    from app.retrieval import build_full_dump_context

    context, nodes_used, edges_used = build_full_dump_context(session)
    assert "Rahul" in context and "Mohan" in context
    assert "superseded" in context
    assert len(edges_used) == 2


# ---------- hebbian ----------

def test_hebbian_reinforce_cap(session, reset_db):
    e = Edge(
        source_id="a", target_id="b", relation="x",
        valid_from="2024-01-01", status="current", source_text="t",
    )
    e.weight = 4.95
    reinforce_on_use(e)
    assert e.weight == 5.0  # capped
    assert e.use_count == 1
    reinforce_on_use(e)
    assert e.weight == 5.0  # stays capped
    assert e.use_count == 2
    assert e.last_used_at is not None


def test_hebbian_decay_floor_and_window(session, reset_db):
    from app.hebbian import decay_tick
    from app.db import utcnow

    make_graph(
        session,
        [("A", "knows", "B", "2024-01-01 00:00:00", None, "current")],
    )
    edge = session.execute(select(Edge)).scalar_one()

    # recently used -> untouched
    edge.weight = 2.0
    edge.last_used_at = utcnow()
    session.commit()
    decay_tick(session, tick_window_seconds=60)
    session.refresh(edge)
    assert edge.weight == 2.0

    # not used recently -> decays toward the floor
    edge.weight = 0.103
    edge.last_used_at = None
    session.commit()
    decay_tick(session, tick_window_seconds=60)
    session.commit()
    session.refresh(edge)
    assert edge.weight == pytest.approx(0.1)  # 0.103*0.95 < floor -> clamped

    # proportional decay from a high weight
    edge.weight = 5.0
    session.commit()
    decay_tick(session, tick_window_seconds=60)
    session.commit()
    session.refresh(edge)
    assert edge.weight == pytest.approx(4.75)


# ---------- ask endpoint (LLM mocked) ----------

@pytest.fixture()
def mock_answer_llm(monkeypatch):
    from app import ask as ask_mod
    from app.llm import LLMResult

    def fake_call(system, user, max_tokens=800):
        return LLMResult(text="Mohan (mocked)", tokens_in=50, tokens_out=8)

    monkeypatch.setattr(ask_mod, "call_llm", fake_call)


def test_ask_pagerank_endpoint(client, reset_db, session, mock_answer_llm):
    make_graph(
        session,
        [("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current")],
    )
    session.commit()

    resp = client.post("/ask", json={"question": "Who is Aisha dating?", "strategy": "pagerank"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"] == "Mohan (mocked)"
    assert body["strategy"] == "pagerank"
    assert set(body.keys()) >= {
        "answer", "strategy", "tokens_in", "tokens_out", "latency_ms",
        "nodes_used", "edges_used", "path", "influence",
    }
    assert len(body["nodes_used"]) >= 1
    # Hebbian applied
    edge = session.execute(select(Edge)).scalar_one()
    session.refresh(edge)
    assert edge.use_count == 1
    assert edge.weight == pytest.approx(1.2)


def test_ask_logs_query_for_ledger(client, reset_db, session, mock_answer_llm):
    make_graph(
        session,
        [("Aisha", "dating", "Mohan", "2024-06-01 00:00:00", None, "current")],
    )
    session.commit()

    client.post("/ask", json={"question": "Who is Aisha dating?", "strategy": "pagerank"})
    led = client.get("/ledger").json()
    assert led["total_queries"] == 1
    assert led["total_tokens_in"] == 50
    assert led["total_tokens_out"] == 8
    assert led["by_strategy"][0]["strategy"] == "pagerank"
    assert led["by_node"]  # per-node costs listed


def test_ledger_empty(client, reset_db):
    led = client.get("/ledger").json()
    assert led["total_queries"] == 0
    assert led["estimated_cost_usd"] == 0.0
    assert led["savings_vs_full_dump_pct"] == 0.0
