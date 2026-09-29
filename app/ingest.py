"""Ingest pipeline: LLM fact extraction, node upsert, supersession, hash logging."""
from __future__ import annotations

import json
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import CLUSTERS, EXCLUSIVE_RELATIONS, NODE_TYPES
from app.db import Edge, HashLog, Node, new_id, utcnow
from app.hashlog import append_entry
from app.llm import call_llm
from app.prompts import INGEST_SYSTEM_PROMPT
from app.timeutil import parse_date_or_none


def _strip_fences(text: str) -> str:
    """Remove ```json fences the model may add despite instructions."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.DOTALL)
    if m:
        return m.group(1).strip()
    return t


def extract_facts(text: str) -> tuple[list[dict], int, int]:
    """Call the LLM to extract facts. Returns (facts, tokens_in, tokens_out)."""
    result = call_llm(
        system=INGEST_SYSTEM_PROMPT,
        user=f"Extract temporal facts from this text:\n\n{text}",
        max_tokens=2000,
    )
    for attempt in range(2):  # parse, then one retry with the raw text re-sent
        try:
            parsed = json.loads(_strip_fences(result.text))
            facts = parsed.get("facts", [])
            if not isinstance(facts, list):
                raise ValueError("facts is not a list")
            return facts, result.tokens_in, result.tokens_out
        except (json.JSONDecodeError, ValueError):
            if attempt == 0:
                result = call_llm(
                    system=INGEST_SYSTEM_PROMPT,
                    user=(
                        "Your previous reply was not valid JSON. Extract temporal facts "
                        f"from this text and return ONLY JSON:\n\n{text}"
                    ),
                    max_tokens=2000,
                )
            else:
                raise ValueError(
                    "LLM returned unparseable JSON after retry. "
                    f"Raw output: {result.text[:500]}"
                )
    return [], 0, 0  # unreachable


def _norm(label: str) -> str:
    return label.strip().lower()


def _valid_node_type(t: str | None) -> str:
    return t if t in NODE_TYPES else "topic"


def _valid_cluster(c: str | None) -> str:
    return c if c in CLUSTERS else "other"


def upsert_node(session: Session, label: str, ntype: str, cluster: str) -> tuple[Node, bool]:
    """Case-insensitive label match; returns (node, created)."""
    norm = _norm(label)
    existing = session.execute(
        select(Node).where(Node.label.ilike(norm))
    ).scalar_one_or_none()
    if existing:
        # refine type/cluster if the LLM gave a concrete one and node is default
        if existing.type == "topic" and ntype != "topic":
            existing.type = ntype
        if existing.cluster == "other" and cluster != "other":
            existing.cluster = cluster
        return existing, False
    node = Node(label=label.strip(), type=_valid_node_type(ntype), cluster=_valid_cluster(cluster))
    session.add(node)
    session.flush()
    return node, True


def find_superseded_candidates(
    session: Session, subject_id: str, relation: str, exclude_edge_id: str | None = None
) -> list[Edge]:
    """Current edges with same subject+relation that conflict with a new fact."""
    q = session.execute(
        select(Edge).where(
            Edge.source_id == subject_id,
            Edge.relation == relation,
            Edge.status == "current",
        )
    ).scalars().all()
    if exclude_edge_id:
        q = [e for e in q if e.id != exclude_edge_id]
    return q


def supersede(session: Session, old: Edge, new_edge_id: str, valid_from: datetime) -> None:
    """Close out an old edge; never delete."""
    old.valid_to = valid_from
    old.status = "superseded"
    old.superseded_by = new_edge_id


def ingest_text(session: Session, text: str) -> dict:
    """Full ingest pipeline. Returns summary dict."""
    facts, tokens_in, tokens_out = extract_facts(text)

    nodes_created = 0
    edges_created = 0
    edges_superseded = 0

    # collect node ids touched by this text for token_cost attribution
    touched_nodes: list[str] = []

    for fact in facts:
        subject = str(fact.get("subject", "")).strip()
        relation = str(fact.get("relation", "")).strip().lower()
        obj = str(fact.get("object", "")).strip()
        if not subject or not relation or not obj:
            continue

        nt = fact.get("node_types") or {}
        cl = fact.get("clusters") or {}
        subj_node, created_s = upsert_node(session, subject, nt.get("subject"), cl.get("subject"))
        obj_node, created_o = upsert_node(session, obj, nt.get("object"), cl.get("object"))
        nodes_created += int(created_s) + int(created_o)
        touched_nodes += [subj_node.id, obj_node.id]

        valid_from = parse_date_or_none(fact.get("valid_from")) or utcnow()
        valid_to = parse_date_or_none(fact.get("valid_to"))

        # duplicate guard: identical subject+relation+object with no new info
        dup = session.execute(
            select(Edge).where(
                Edge.source_id == subj_node.id,
                Edge.relation == relation,
                Edge.target_id == obj_node.id,
                Edge.status == "current",
            )
        ).scalar_one_or_none()
        if dup is not None:
            # extend validity if the new fact closes later than the dup
            if valid_to and (dup.valid_to is None or valid_to > dup.valid_to):
                dup.valid_to = valid_to
            continue

        edge = Edge(
            source_id=subj_node.id,
            target_id=obj_node.id,
            relation=relation,
            valid_from=valid_from,
            valid_to=valid_to,
            source_text=text,
        )
        session.add(edge)
        session.flush()  # assign edge.id
        edges_created += 1

        # Contradiction handling: exclusive relation, same subject, different object
        if relation in EXCLUSIVE_RELATIONS:
            for old in find_superseded_candidates(session, subj_node.id, relation, exclude_edge_id=edge.id):
                supersede(session, old, edge.id, valid_from)
                edges_superseded += 1

    # Token attribution: split ingest tokens evenly across touched nodes
    unique_nodes = list(dict.fromkeys(touched_nodes))
    if unique_nodes:
        per_node = (tokens_in + tokens_out) // len(unique_nodes)
        for nid in unique_nodes:
            node = session.get(Node, nid)
            node.token_cost += per_node

    append_entry(
        session,
        "ingest",
        {
            "text_preview": text[:200],
            "nodes_created": nodes_created,
            "edges_created": edges_created,
            "edges_superseded": edges_superseded,
            "tokens": tokens_in + tokens_out,
        },
    )

    return {
        "nodes_created": nodes_created,
        "edges_created": edges_created,
        "edges_superseded": edges_superseded,
        "tokens_used": tokens_in + tokens_out,
    }
