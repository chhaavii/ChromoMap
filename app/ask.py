"""Ask orchestration: run retrieval, call LLM, log the query, apply Hebbian."""
from __future__ import annotations

import json
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Edge, Node, QueryLog
from app.hebbian import reinforce_on_use
from app.llm import call_llm
from app.prompts import build_answer_system_prompt
from app.retrieval import build_full_dump_context, pagerank_retrieval


def run_ask(
    session: Session,
    question: str,
    strategy: str = "pagerank",
    bubble: float = 0.15,
    log_query: bool = True,
) -> dict:
    """Shared by /ask and /ask/compare. Returns the full result dict."""
    t0 = time.perf_counter()

    if strategy == "full_dump":
        context, nodes_used, edges_used = build_full_dump_context(session)
        influence: list[dict] = []
        path = nodes_used
    elif strategy == "pagerank":
        nodes_used, _all_ranked, influence, eligible = pagerank_retrieval(
            session, question, bubble
        )
        eligible_set = set(eligible)
        edges_used = [e for e in _edges_between(session, nodes_used) if e in eligible_set]
        path = list(nodes_used)  # already ordered by pagerank score
        context = _context_from_nodes(session, nodes_used, edges_used)
    elif strategy == "flat_rag":
        from app.flatrag import flat_rag_retrieval

        nodes_used, edges_used, snippets = flat_rag_retrieval(session, question)
        influence = []
        path = list(nodes_used)
        context = (
            "Relevant memory snippets:\n" + "\n".join(f"- {s}" for s in snippets)
            if snippets
            else "No relevant memories."
        )
    else:
        raise ValueError(f"Unknown strategy: {strategy}")

    context = context + "\n\nQuestion: " + question
    llm = call_llm(
        system=build_answer_system_prompt(context, strategy),
        user=question,
        max_tokens=800,
    )

    latency_ms = (time.perf_counter() - t0) * 1000

    if log_query:
        session.add(
            QueryLog(
                question=question,
                strategy=strategy,
                tokens_in=llm.tokens_in,
                tokens_out=llm.tokens_out,
                latency_ms=latency_ms,
                node_ids_used=json.dumps(nodes_used),
                answer=llm.text,
            )
        )

    # Hebbian reinforcement only for the graph-aware strategy
    if strategy == "pagerank":
        for eid in edges_used:
            edge = session.get(Edge, eid)
            if edge:
                reinforce_on_use(edge)

    return {
        "answer": llm.text,
        "strategy": strategy,
        "tokens_in": llm.tokens_in,
        "tokens_out": llm.tokens_out,
        "latency_ms": round(latency_ms, 2),
        "nodes_used": nodes_used,
        "edges_used": edges_used,
        "path": path,
        "influence": influence,
    }


def _edges_between(session: Session, node_ids: list[str]) -> list[str]:
    ids = set(node_ids)
    if not ids:
        return []
    edges = session.execute(
        select(Edge).where(Edge.source_id.in_(ids), Edge.target_id.in_(ids))
    ).scalars().all()
    return [e.id for e in edges]


def _context_from_nodes(session: Session, node_ids: list[str], edge_ids: list[str]) -> str:
    labels = {
        n.id: n.label
        for n in session.execute(select(Node).where(Node.id.in_(node_ids))).scalars().all()
    }
    lines = []
    for eid in edge_ids:
        e = session.get(Edge, eid)
        if e is None:
            continue
        s = labels.get(e.source_id, e.source_id)
        o = labels.get(e.target_id, e.target_id)
        vo = e.valid_from.strftime("%Y-%m-%d") if e.valid_from else "?"
        vt = e.valid_to.strftime("%Y-%m-%d") if e.valid_to else "now"
        marker = "" if e.status == "current" else " [superseded]"
        lines.append(f"- {s} --[{e.relation}]--> {o}: {vo} .. {vt}{marker}")
    return "Relevant memories:\n" + "\n".join(lines) if lines else "No relevant memories."
