"""Retrieval strategies: full_dump and pagerank (flat_rag lands in step 3)."""
from __future__ import annotations

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PAGERANK_TOP_N, PAST_HINTS, PINNED_SCORE_FLOOR
from app.db import Edge, Node


def implies_past(question: str) -> bool:
    """Cheap keyword check: does the question refer to past states?"""
    q = question.lower()
    return any(hint in q for hint in PAST_HINTS)


def _edge_label(session: Session, node_id: str) -> str:
    node = session.get(Node, node_id)
    return node.label if node else node_id


def build_full_dump_context(session: Session) -> tuple[str, list[str], list[str]]:
    """Serialize EVERY edge (current and superseded) with dates."""
    edges = session.execute(select(Edge)).scalars().all()
    lines = []
    node_ids: list[str] = []
    edge_ids: list[str] = []
    for e in edges:
        s = _edge_label(session, e.source_id)
        o = _edge_label(session, e.target_id)
        vo = e.valid_from.strftime("%Y-%m-%d") if e.valid_from else "?"
        vt = e.valid_to.strftime("%Y-%m-%d") if e.valid_to else "now"
        lines.append(f"- {s} --[{e.relation}]--> {o}  ({vo} .. {vt}, {e.status})")
        node_ids.extend({e.source_id, e.target_id})
        edge_ids.append(e.id)
    context = "Complete fact history:\n" + "\n".join(lines) if lines else "No facts recorded yet."
    return context, list(dict.fromkeys(node_ids)), edge_ids


def extract_question_entities(question: str) -> list[str]:
    """Capitalized-word entity guess (simple string match per spec).

    Multi-word capitalized names ("Acme Corp") are greedily joined.
    """
    import re

    tokens = re.findall(r"[A-Z][a-zA-Z0-9']*(?:\s+[A-Z][a-zA-Z0-9']*)*", question)
    return [t.strip() for t in tokens if t.strip()]


def pagerank_retrieval(
    session: Session,
    question: str,
    bubble: float = 0.15,
    top_n: int | None = None,
) -> tuple[list[str], list[str], list[dict], list[str]]:
    """Personalized PageRank over the memory graph.

    - Time-aware: past questions include superseded edges; current view otherwise.
    - Muted nodes excluded; pinned nodes get a score floor.
    Returns (top_node_ids, allRankedNodeIds, influence, eligible_edge_ids).
    """
    top_n = top_n or PAGERANK_TOP_N
    include_superseded = implies_past(question)

    edges = session.execute(select(Edge)).scalars().all()
    nodes = session.execute(select(Node)).scalars().all()

    muted = {n.id for n in nodes if n.muted}
    label_to_id = {n.label.lower(): n.id for n in nodes}
    id_to_label = {n.id: n.label for n in nodes}

    # Personalization: seed with question entities matched to node labels
    personalization: dict[str, float] = {}
    matched = []
    for ent in extract_question_entities(question):
        nid = label_to_id.get(ent.lower())
        if nid and nid not in muted:
            personalization[nid] = 1.0
            matched.append(nid)
    if not personalization:
        # no entity match -> uniform personalization over unmuted nodes
        personalization = {n.id: 1.0 for n in nodes if n.id not in muted}
    if not personalization:
        return [], [], [], []  # everything muted
    total_p = sum(personalization.values())
    personalization = {k: v / total_p for k, v in personalization.items()}

    # Build directed graph; superseded edges only when the question is about the past
    G = nx.DiGraph()
    for n in nodes:
        if n.id not in muted:
            G.add_node(n.id)
    used_edges: list[Edge] = []
    for e in edges:
        if e.source_id in muted or e.target_id in muted:
            continue
        if e.status == "superseded" and not include_superseded:
            continue
        if e.valid_to is not None and not include_superseded:
            # closed edges are historical; keep only for past questions
            continue
        if G.has_node(e.source_id) and G.has_node(e.target_id):
            # bidirectional traversal: memory spreads both ways
            G.add_edge(e.source_id, e.target_id, weight=e.weight or 1.0)
            G.add_edge(e.target_id, e.source_id, weight=e.weight or 1.0)
            used_edges.append(e)

    if len(G) == 0:
        return [], [], [], []

    alpha = 0.15 + bubble * 0.5
    scores = nx.pagerank(G, alpha=alpha, personalization=personalization, weight="weight")

    # Pinned nodes always get a score floor
    for n in nodes:
        if n.pinned and n.id in scores:
            scores[n.id] = max(scores[n.id], PINNED_SCORE_FLOOR)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_nodes = [nid for nid, _ in ranked[:top_n]]

    # Collect edges between the top nodes (same time rules as the graph)
    top_set = set(top_nodes)
    edges_used: list[str] = []
    for e in used_edges:
        if e.source_id in top_set and e.target_id in top_set:
            edges_used.append(e.id)

    influence = [{"node_id": nid, "score": round(score, 6)} for nid, score in ranked]
    eligible_edge_ids = [e.id for e in used_edges]
    return top_nodes, list(scores.keys()), influence, eligible_edge_ids
