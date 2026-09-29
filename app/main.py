"""ChronoMem FastAPI application."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete as sa_delete
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import CORS_ORIGINS, DECAY_TICK_SECONDS
from app.db import Edge, Node, SessionLocal, get_session, init_db
from app.graph import get_graph
from app.hashlog import verify_chain
from app.ingest import ingest_text
from app.ledger import get_ledger
from app.schemas import AskRequest, CompareRequest, IngestRequest, IngestResponse
from app.ask import run_ask
from app.compare import run_compare


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    task = asyncio.create_task(_decay_loop())
    yield
    task.cancel()


async def _decay_loop():
    """Apply Hebbian decay every DECAY_TICK_SECONDS (spec: 60s)."""
    while True:
        await asyncio.sleep(DECAY_TICK_SECONDS)
        try:
            await asyncio.to_thread(_run_decay_tick)
        except Exception:
            pass  # keep the loop alive; manual /decay/tick surfaces errors


def _run_decay_tick() -> dict:
    from app.hebbian import decay_tick

    s = SessionLocal()
    try:
        summary = decay_tick(s, tick_window_seconds=DECAY_TICK_SECONDS)
        s.commit()
        return summary
    finally:
        s.close()


app = FastAPI(
    title="ChronoMem",
    description="Temporal AI memory graph — facts are superseded, never overwritten.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/memory/ingest", response_model=IngestResponse)
def ingest(body: IngestRequest, session: Session = Depends(get_session)):
    """Extract temporal facts from text and merge them into the graph."""
    try:
        summary = ingest_text(session, body.text)
    except RuntimeError as exc:  # LLM unavailable / failed after retries
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:  # unparseable LLM output
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return summary


@app.get("/graph")
def graph(
    as_of: str | None = Query(default=None, description="ISO date to view the graph at"),
    session: Session = Depends(get_session),
):
    """Full graph with strength/recency per node and as_of activity flags."""
    try:
        return get_graph(session, as_of)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid as_of ISO date")


@app.post("/ask")
def ask(body: AskRequest, session: Session = Depends(get_session)):
    """Answer a question using the chosen retrieval strategy."""
    try:
        return run_ask(session, body.question, body.strategy, body.bubble)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/ledger")
def ledger(session: Session = Depends(get_session)):
    """Token usage, cost estimate, per-strategy stats and savings."""
    return get_ledger(session)


@app.post("/ask/compare")
def ask_compare(body: CompareRequest, session: Session = Depends(get_session)):
    """Run all three strategies on the same question, with correctness flags."""
    return run_compare(session, body.question, body.expected_answer)


@app.get("/hashlog/verify")
def hashlog_verify(session: Session = Depends(get_session)):
    """Recompute the hash chain and report validity."""
    return verify_chain(session)


@app.get("/bubble")
def bubble(session: Session = Depends(get_session)):
    """Echo-chamber metric: entropy of nodes_used across the last 20 queries."""
    from app.bubble import get_bubble

    return get_bubble(session)


@app.post("/decay/tick")
def decay_tick_endpoint(session: Session = Depends(get_session)):
    """Manually apply one decay step (also runs automatically every 60s)."""
    from app.hebbian import decay_tick

    return decay_tick(session, tick_window_seconds=DECAY_TICK_SECONDS)


def _get_node_or_404(session: Session, node_id: str) -> Node:
    node = session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


@app.post("/node/{node_id}/pin")
def pin_node(node_id: str, session: Session = Depends(get_session)):
    """Toggle the pinned flag."""
    node = _get_node_or_404(session, node_id)
    node.pinned = not node.pinned
    return {"id": node.id, "pinned": node.pinned}


@app.post("/node/{node_id}/mute")
def mute_node(node_id: str, session: Session = Depends(get_session)):
    """Mute: node is excluded from pagerank retrieval (still in /graph)."""
    node = _get_node_or_404(session, node_id)
    node.muted = True
    return {"id": node.id, "muted": node.muted}


@app.post("/node/{node_id}/unmute")
def unmute_node(node_id: str, session: Session = Depends(get_session)):
    node = _get_node_or_404(session, node_id)
    node.muted = False
    return {"id": node.id, "muted": node.muted}


@app.delete("/node/{node_id}")
def delete_node(node_id: str, session: Session = Depends(get_session)):
    """Hard delete the node + incident edges, with a hash-log tombstone."""
    from app.hashlog import append_entry

    node = _get_node_or_404(session, node_id)
    label = node.label

    incident = session.execute(
        select(Edge).where(
            (Edge.source_id == node_id) | (Edge.target_id == node_id)
        )
    ).scalars().all()
    deleted_edges = len(incident)
    for e in incident:
        session.delete(e)
    session.delete(node)
    session.flush()

    append_entry(
        session,
        "delete_node",
        {"node_id": node_id, "label": label, "edges_deleted": deleted_edges},
    )
    return {"deleted": node_id, "label": label, "edges_deleted": deleted_edges}


@app.post("/seed")
def seed(session: Session = Depends(get_session)):
    """Load deterministic demo persona + 15 benchmark questions (no LLM calls)."""
    from app.seed import seed_db

    return seed_db(session)


@app.get("/benchmark/run")
def benchmark_run(session: Session = Depends(get_session)):
    """Run /ask/compare on all seeded questions; per-strategy accuracy/tokens/latency."""
    from app.benchmark import run_benchmark

    return run_benchmark(session)


@app.post("/reset")
def reset(session: Session = Depends(get_session)):
    """Clear all tables (demo/testing helper)."""
    from app.db import Base, engine

    session.execute(text("PRAGMA foreign_keys=OFF"))
    session.commit()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session.execute(text("PRAGMA foreign_keys=ON"))
    return {"status": "reset"}
