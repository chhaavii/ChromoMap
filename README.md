# ChronoMem

Temporal AI memory graph. Facts are **never overwritten — only superseded**.
Every edge has a validity time range, edges strengthen with use (Hebbian
reinforcement) and decay when idle, and retrieval walks the graph with
Personalized PageRank instead of dumping full history into the prompt.
Every LLM call and node has a token cost tracked in a ledger.

## Stack

- Python 3.11+, FastAPI, Pydantic v2
- SQLAlchemy + SQLite
- NumPy, NetworkX, scikit-learn (TF-IDF flat_rag)
- Anthropic Python SDK (model from `LLM_MODEL`, key from `ANTHROPIC_API_KEY`)

## Run

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then set ANTHROPIC_API_KEY (and LLM_MODEL if desired)
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs
CORS is enabled for http://localhost:5173 (`CORS_ORIGINS` env var).

## Quick tour

```bash
# deterministic demo persona: 28 nodes, 32 edges, 3 supersession chains, 15 benchmark questions
curl -X POST localhost:8000/seed

curl localhost:8000/graph                       # full graph w/ strength + recency
curl "localhost:8000/graph?as_of=2024-01-15"    # time-travel view

# needs ANTHROPIC_API_KEY
curl -X POST localhost:8000/ask -H 'content-type: application/json' \
  -d '{"question": "Who did Aisha use to date?", "strategy": "pagerank"}'
curl -X POST localhost:8000/ask -H 'content-type: application/json' \
  -d '{"question": "Where does Aisha live?", "strategy": "flat_rag", "bubble": 0.4}'
curl -X POST localhost:8000/ask/compare -H 'content-type: application/json' \
  -d '{"question": "Where does Aisha work?", "expected_answer": "Nimbus Labs"}'

curl localhost:8000/ledger          # tokens, cost, per-strategy stats, savings vs full_dump
curl localhost:8000/bubble          # echo-chamber entropy over last 20 queries
curl localhost:8000/hashlog/verify  # tamper-evident audit chain

# run the whole benchmark (15 temporal questions x 3 strategies; needs API key)
curl localhost:8000/benchmark/run
```

## API surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/memory/ingest` | LLM fact extraction → upsert + supersession + hash log |
| GET | `/graph?as_of=` | Nodes (strength, recency, cluster, flags) + edges (active flag) |
| POST | `/ask` | `full_dump` \| `flat_rag` \| `pagerank` retrieval + LLM answer |
| POST | `/ask/compare` | All three strategies + correctness flags |
| GET | `/ledger` | Token totals, cost, per-strategy/node stats, savings % |
| GET | `/bubble` | Shannon entropy of `nodes_used` over last 20 queries |
| POST | `/node/{id}/pin` `/mute` `/unmute` | Flags (pinned = retrieval floor; muted = excluded from pagerank) |
| DELETE | `/node/{id}` | Hard delete + hash-log tombstone |
| POST | `/decay/tick` | Manual Hebbian decay (also runs every 60s in background) |
| GET | `/hashlog/verify` | Recompute chain → `{valid, length, root_hash}` |
| POST | `/seed` | Deterministic demo data (no LLM calls) |
| GET | `/benchmark/run` | 15 seeded temporal questions × 3 strategies |
| POST | `/reset` | Wipe everything |

## Hebbian rules (`app/hebbian.py`)

- On use (pagerank only): `w += ETA` (0.2), `use_count += 1`, `last_used_at = now`, capped at 5.0
- On tick: idle edges `w = max(W_FLOOR, w − LAMBDA·w)` (λ=0.05, floor=0.1)
- All constants via env: `HEBBIAN_ETA`, `DECAY_LAMBDA`, `WEIGHT_FLOOR`, `WEIGHT_CAP`

## Supersession, never deletion

Exclusive relations (`dating`, `lives_in`, `works_at`, `studies_at`,
`married_to`) close the old edge when a contradicting fact arrives:
`valid_to` = new fact's start, `status = superseded`, `superseded_by` set.
The seed contains three chains: dating Rahul→Mohan, Dubai→Taipei,
Acme→Nimbus Labs. Only explicit `DELETE /node/{id}` removes data (with an
audit tombstone).

## Tests

```bash
python -m pytest tests/ -v   # 40 tests: supersession, time-aware retrieval,
                             # hebbian floor/cap, hash tamper detection,
                             # deletion, bubble math, benchmark
```

## Status

- [x] Step 1 — DB models, `/memory/ingest` (supersession), `/graph`, `/hashlog/verify`, `/reset`
- [x] Step 2 — `/ask` (pagerank + full_dump) + token accounting + `/ledger`
- [x] Step 3 — `flat_rag` (TF-IDF) + `/ask/compare`
- [x] Step 4 — Hebbian update, decay tick (+ 60s background loop), pin/mute/delete
- [x] Step 5 — `/bubble` + influence scores
- [x] Step 6 — `/seed` + `/benchmark/run`
- [x] Step 7 — Hash chain + tamper detection tests
