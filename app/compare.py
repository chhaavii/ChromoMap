"""/ask/compare: run all three strategies on the same question."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.ask import run_ask


def correct_flag(answer: str, expected: str | None) -> bool | None:
    """Case-insensitive substring match; None when no expected answer given."""
    if expected is None or expected == "":
        return None
    return expected.strip().lower() in (answer or "").lower()


def run_compare(
    session: Session, question: str, expected_answer: str | None = None
) -> dict:
    results = []
    for strategy in ("full_dump", "flat_rag", "pagerank"):
        try:
            r = run_ask(session, question, strategy=strategy)
            r["correct"] = correct_flag(r["answer"], expected_answer)
            results.append(r)
        except Exception as exc:  # keep comparing even if one strategy fails
            results.append(
                {
                    "answer": "",
                    "strategy": strategy,
                    "tokens_in": 0,
                    "tokens_out": 0,
                    "latency_ms": 0.0,
                    "nodes_used": [],
                    "edges_used": [],
                    "path": [],
                    "influence": [],
                    "correct": None,
                    "error": str(exc),
                }
            )
    return {"question": question, "results": results}
