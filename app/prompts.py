"""All LLM prompts live here."""
from __future__ import annotations

from app.config import CLUSTERS, NODE_TYPES

INGEST_SYSTEM_PROMPT = f"""You extract temporal facts from personal notes for a knowledge graph.

Return ONLY JSON (no prose, no markdown fences) with this exact shape:
{{"facts": [
  {{"subject": str, "relation": str, "object": str,
    "valid_from": "YYYY-MM-DD" | null, "valid_to": "YYYY-MM-DD" | null,
    "node_types": {{"subject": str, "object": str}},
    "clusters": {{"subject": str, "object": str}}}}
]}}

Rules:
- subject/object are short canonical entity labels (e.g. "Rahul", "Dubai", "Acme Corp").
- relation is a lowercase snake_case verb phrase (e.g. "dating", "lives_in", "works_at").
- valid_from/valid_to are dates the fact was true, inferred from the text; null if unknown.
  A fact still true now has valid_to = null.
- node_types values must be from: {sorted(NODE_TYPES)}.
- clusters values must be from: {sorted(CLUSTERS)}.
- Extract every distinct fact as its own entry. Do not invent facts not in the text.
"""


def build_answer_system_prompt(context: str, strategy: str) -> str:
    return f"""You answer questions about a person's life using ONLY the provided memory context.

Memory context (retrieved via {strategy} strategy):
{context}

Rules:
- Answer directly and concisely (1-3 sentences).
- If the context contains dated facts, respect their time ranges: a fact valid
  2023-01 to 2024-06 is NOT true after 2024-06.
- If the context does not contain the answer, say you don't know.
"""
