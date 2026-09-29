"""flat_rag: TF-IDF cosine retrieval over edge source_texts.

Ignores graph structure and time on purpose (that's the benchmark contrast).
"""
from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Edge


def flat_rag_retrieval(
    session: Session, question: str, top_k: int = 8
) -> tuple[list[str], list[str], list[str]]:
    """Return (node_ids, edge_ids, context_snippets) for the top-k edges."""
    edges = session.execute(select(Edge)).scalars().all()
    if not edges:
        return [], [], []

    # Deduplicate identical source_texts (one ingest can spawn many edges)
    unique_texts: dict[str, list[str]] = {}
    for e in edges:
        text = e.source_text or e.relation
        unique_texts.setdefault(text, []).append(e.id)

    texts = list(unique_texts.keys())
    try:
        vec = TfidfVectorizer(stop_words="english")
        matrix = vec.fit_transform(texts + [question])
        sims = cosine_similarity(matrix[-1], matrix[:-1]).flatten()
    except ValueError:
        # empty vocabulary (e.g. all stop words) -> no signal
        sims = [0.0] * len(texts)

    order = sorted(range(len(texts)), key=lambda i: sims[i], reverse=True)[:top_k]

    node_ids: list[str] = []
    edge_ids: list[str] = []
    snippets: list[str] = []
    for i in order:
        eids = unique_texts[texts[i]]
        edge_ids.extend(eids)
        snippets.append(texts[i])
        for eid in eids:
            e = session.get(Edge, eid)
            if e:
                node_ids.extend({e.source_id, e.target_id})
    return list(dict.fromkeys(node_ids)), list(dict.fromkeys(edge_ids)), snippets
