# ChronoMem

Temporal AI memory graph. Facts are **never overwritten — only superseded**.
Every edge has a validity time range, edges strengthen with use (Hebbian
reinforcement) and decay when idle, and retrieval walks the graph with
Personalized PageRank instead of dumping full history into the prompt.
Every LLM call and node has a token cost tracked in a ledger.

## Stack

**Backend:**
- Python 3.11+, FastAPI, Pydantic v2
- SQLAlchemy + SQLite
- NumPy, NetworkX, scikit-learn (TF-IDF flat_rag)
- Anthropic Python SDK (model from `LLM_MODEL`, key from `ANTHROPIC_API_KEY`)

**Frontend:**
- React 19, TypeScript, Vite
- Three.js, React Three Fiber
- Tailwind CSS v4
- Zustand (state management)

## Run

### Quick Start (Full Stack)

```bash
# Start both backend and frontend with one command
bash start.sh
```

This will:
- Start the FastAPI backend on http://localhost:8000
- Start the Vite frontend on http://localhost:5173
- Seed the demo graph with 28 nodes
- Open the frontend in your browser

### Manual Setup

**Backend:**
```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional: set ANTHROPIC_API_KEY for live LLM queries
uvicorn app.main:app --reload --port 8000
```

**Note**: The app works in demo mode without an API key, showing mock data for UI exploration. To enable live LLM queries, set `ANTHROPIC_API_KEY` in `.env`.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Interactive API docs: http://localhost:8000/docs
Frontend: http://localhost:5173
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

## About ChronoMem

ChronoMem is a **temporal AI memory system** that solves three fundamental problems with current AI memory:

1. **Overwriting** - Old facts are replaced instead of preserved
2. **Black box** - You can't see what the AI knows or why
3. **Bubble** - Retrieval narrows around frequently discussed topics

The solution is a **temporal knowledge graph** where facts are never overwritten—only superseded—so the AI can answer current, past, and change-over-time questions.

### Core Innovation

Instead of storing memory as a flat list that gets overwritten, ChronoMem stores memory as a **graph with time ranges**:

- **Nodes** = people, places, topics, decisions
- **Edges** = relationships with validity time ranges
- **Supersession** = new facts close old connections instead of deleting them
- **Hebbian learning** = frequently used connections strengthen, unused ones decay
- **Personalized PageRank** = walks only relevant connections to save tokens

### Key Features

**Temporal Supersession**: When you say "I moved from Dubai to Taipei," the system creates a new edge for Taipei and closes the Dubai edge (superseded, not deleted). Can still answer: "Where did I live before?" → Dubai.

**Hebbian Reinforcement & Decay**: Connections strengthen with use (capped at 5.0) and decay when idle (floor at 0.1). A background loop runs decay every 60 seconds. Configurable via environment variables.

**Personalized PageRank Retrieval**: Instead of dumping full history into the prompt, the system walks only relevant connections. Top N nodes retrieved based on question, dramatically reducing token usage vs full dump.

**Token Ledger**: Tracks tokens for every LLM call, shows cost per memory and per answer, compares strategies (full_dump vs flat_rag vs pagerank), and displays percentage savings.

**Bubble Meter**: Measures Shannon entropy of retrieved nodes, detects when retrieval narrows around one topic, warns when AI is trapping you in a bubble. Analyzes last 20 queries.

**User Control**: Pin (force memory into retrieval), Mute (exclude from PageRank), Delete (hard remove with audit tombstone).

**Hash-Chained Audit Log**: Every operation logged in a tamper-evident chain. `/hashlog/verify` recomputes to detect tampering. Root hash proves integrity.

**Interactive 3D Visualization**: React + Three.js brain-style graph. Rotate, zoom, click nodes. Timeline panel shows temporal events. Real-time updates.

### How It Works - Example Flow

1. **Ingest**: User says "I'm dating Rahul" → LLM extracts fact → creates node + edge → hash logged in audit chain
2. **Update**: User says "We broke up, I'm with Mohan now" → Rahul edge closed (superseded) → Mohan edge created (current) → history preserved
3. **Query**: "Who am I dating?" → PageRank walks graph → finds Mohan → returns answer with token cost
4. **Temporal Query**: "Who did I date before?" → time-aware retrieval → finds Rahul → shows superseded connection
5. **Hebbian Update**: As you ask about Mohan more → Mohan connection strengthens → Rahul connection slowly decays (but never below floor)
6. **Bubble Detection**: If you only ask about one topic → entropy drops → bubble warning → break the bubble slider resurfaces neglected memories

### Use Cases

| Use Case | Example |
|---|---|
| **Students/researchers** | Track how thesis topic evolved over time |
| **Mental health apps** | Journaling with changing feelings over time |
| **Customer support** | Agent recalls customer's plan changes and why |
| **Healthcare** | Patient medication/symptom history stays traceable |
| **Enterprise AI budgets** | Teams see which memories burn most tokens |
| **AI transparency** | Users audit and delete what AI knows about them |

### What Makes It Stand Out

The individual pieces (graph databases, PageRank, TF-IDF) exist elsewhere. The innovation is the **combination** built around one question:

**"The same math that makes AI memory fast also makes it narrow—how do you get speed and openness at once?"**

ChronoMem answers this with:
- **Speed**: PageRank walks only relevant connections
- **Openness**: History preserved via supersession, not deletion
- **Transparency**: Token ledger + bubble meter + 3D visualization
- **Control**: Pin, mute, delete user controls

## Tests

```bash
python -m pytest tests/ -v   # 40 tests: supersession, time-aware retrieval,
                             # hebbian floor/cap, hash tamper detection,
                             # deletion, bubble math, benchmark
```


