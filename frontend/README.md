# ChronoMem frontend

Cinematic dark SPA for the ChronoMem temporal memory graph: a live 3D brain
driven by the real API, with console panels, a time-travel timeline and an
honest benchmark view.

## Run

```bash
# from the repo root (backend on :8000)
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Env vars (frontend/.env.local)

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL |
| `VITE_USE_MOCK` | unset | `true` forces bundled demo data (28 nodes, 32 edges, 3 supersession chains) |

If the backend is unreachable the app automatically falls back to mock data
and shows a **Demo data (backend offline)** chip — the UI is fully explorable
either way.

## Structure

```
src/
  api.ts              typed backend adapter (all field mapping in ONE file)
  apiWithFallback.ts  real API + automatic mock fallback
  mockData.ts         bundled demo graph + fake responses
  store.ts            zustand: graph, selection, asOf, chat, ledger, bubble,
                      animation event counters (pulse/hebbian/supersede/…)
  brainLayout.ts      deterministic brain-shaped layout (cluster -> region,
                      stable hash placement, overlap relaxation)
  scene/              BrainScene (canvas, nodes, edges, camera rig, spikes),
                      Effects (pulse path, supersession flash, delete
                      dissolve, bubble halos), Dust
  panels/             MemoryChat (ingest/ask/compare), LedgerPanel (bars +
                      bubble gauge + decay tick), NodeInspector (pin/mute/
                      delete), Timeline (as_of scrubbing)
  sections/           Hero, HowItWorks, Console, Benchmark
  hooks/              useBackendActions (ingest/ask/compare/seed/reset/…)
```

## Behaviors worth trying

1. **Seed demo data** (Console footer) → watch nodes spawn and supersession
   chains flash red then turn grey-blue.
2. **Ask** with "Graph walk" → the answer path pulses node-to-node in amber,
   used nodes flare by influence score; edge weights tween up (Hebbian).
3. **Timeline scrub** → edges fade in/out as of the chosen date; **Now** resets.
4. **Click a node** → inspector card with connections, Pin / Mute / Delete
   (delete dissolves the node into particles).
5. **Compare all 3** → three tinted animations: full dump lights everything,
   flat search lights isolated nodes, graph walk lights one connected path.
6. **Break-the-bubble slider** → raise it, ask again, watch the lit nodes
   spread across more brain regions.
7. **Benchmark** → real numbers only, from `GET /benchmark/run`.

## Notes

- Bloom and particles can be cut with the **Low effects** toggle (footer).
- `prefers-reduced-motion` disables auto-rotate and pulses.
- Pointer events hit the 3D canvas only while the Console is in view; the
  rest of the page is scroll-driven.
