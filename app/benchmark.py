"""Benchmark: run /ask/compare across seeded questions, aggregate per strategy."""
from __future__ import annotations

import json
import math
from collections import Counter
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.compare import run_compare
from app.db import BenchmarkQuestion


def _entropy(counter: Counter) -> float:
    total = sum(counter.values())
    if total == 0:
        return 0.0
    return -sum(
        (c / total) * math.log2(c / total) for c in counter.values() if c > 0
    )


def run_benchmark(session: Session, max_questions: int | None = None) -> dict:
    questions = session.execute(select(BenchmarkQuestion)).scalars().all()
    if max_questions:
        questions = questions[:max_questions]
    if not questions:
        return {"error": "No benchmark questions. POST /seed first.", "results": []}

    per_strategy: dict[str, dict] = {}
    node_freq: Counter[str] = Counter()
    rows = []

    for q in questions:
        cmp = run_compare(session, q.question, q.expected_answer)
        for r in cmp["results"]:
            agg = per_strategy.setdefault(
                r["strategy"],
                {"correct": 0, "scored": 0, "tokens_in": [], "latency": []},
            )
            if r["correct"] is not None:
                agg["scored"] += 1
                agg["correct"] += int(r["correct"])
            agg["tokens_in"].append(r["tokens_in"])
            agg["latency"].append(r["latency_ms"])
            node_freq.update(r.get("nodes_used") or [])
        rows.append(
            {
                "question": q.question,
                "expected": q.expected_answer,
                "answers": {
                    r["strategy"]: {"answer": r["answer"], "correct": r["correct"]}
                    for r in cmp["results"]
                },
            }
        )

    n_q = len(questions)
    strategies = []
    for strat, agg in sorted(per_strategy.items()):
        strategies.append(
            {
                "strategy": strat,
                "accuracy": round(agg["correct"] / agg["scored"], 3) if agg["scored"] else None,
                "avg_tokens_in": round(mean(agg["tokens_in"]), 1) if agg["tokens_in"] else 0.0,
                "avg_latency_ms": round(mean(agg["latency"]), 1) if agg["latency"] else 0.0,
            }
        )

    entropy = _entropy(node_freq)
    max_entropy = math.log2(len(node_freq)) if len(node_freq) > 1 else 0.0
    return {
        "questions_run": n_q,
        "strategies": strategies,
        "retrieval_diversity": {
            "entropy": round(entropy, 4),
            "max_entropy": round(max_entropy, 4),
            "distinct_nodes": len(node_freq),
        },
        "results": rows,
    }
