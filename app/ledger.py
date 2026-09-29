"""Token ledger: totals, cost estimate, per-strategy stats, savings vs full_dump."""
from __future__ import annotations

from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PRICE_PER_1M_INPUT_TOKENS, PRICE_PER_1M_OUTPUT_TOKENS
from app.db import Node, QueryLog


def get_ledger(session: Session) -> dict:
    logs = session.execute(select(QueryLog)).scalars().all()

    total_in = sum(l.tokens_in or 0 for l in logs)
    total_out = sum(l.tokens_out or 0 for l in logs)
    cost = (total_in / 1e6) * PRICE_PER_1M_INPUT_TOKENS + (
        total_out / 1e6
    ) * PRICE_PER_1M_OUTPUT_TOKENS

    # per-strategy aggregates
    by_strategy: dict[str, list[QueryLog]] = {}
    for l in logs:
        by_strategy.setdefault(l.strategy, []).append(l)

    strategy_stats = []
    fd = by_strategy.get("full_dump", [])
    fd_avg_in = mean([l.tokens_in for l in fd]) if fd else 0.0
    for strat, rows in by_strategy.items():
        acc_rows = [r.correct for r in rows if r.correct is not None]
        strategy_stats.append(
            {
                "strategy": strat,
                "avg_tokens_in": round(mean([r.tokens_in or 0 for r in rows]), 1),
                "avg_tokens_out": round(mean([r.tokens_out or 0 for r in rows]), 1),
                "avg_latency_ms": round(mean([r.latency_ms or 0 for r in rows]), 1),
                "queries": len(rows),
                "accuracy": round(sum(acc_rows) / len(acc_rows), 3) if acc_rows else None,
            }
        )
    strategy_stats.sort(key=lambda s: s["strategy"])

    # savings: pagerank avg tokens_in relative to full_dump avg tokens_in
    savings = 0.0
    pr = by_strategy.get("pagerank", [])
    if fd_avg_in > 0 and pr:
        savings = (1 - (mean([r.tokens_in for r in pr]) / fd_avg_in)) * 100

    by_node = [
        {"node_id": n.id, "label": n.label, "token_cost": n.token_cost or 0}
        for n in session.execute(select(Node)).scalars().all()
    ]
    by_node.sort(key=lambda x: x["token_cost"], reverse=True)

    return {
        "total_tokens_in": total_in,
        "total_tokens_out": total_out,
        "estimated_cost_usd": round(cost, 6),
        "by_strategy": strategy_stats,
        "by_node": by_node,
        "savings_vs_full_dump_pct": round(savings, 1),
        "total_queries": len(logs),
    }
