#!/usr/bin/env bash
# ChronoMem dev stack: backend :8000 + frontend :5173 in this Terminal window.
set -u
cd "$(dirname "$0")"

cleanup() {
  [[ -n "${B:-}" ]] && kill "$B" 2>/dev/null
  [[ -n "${F:-}" ]] && kill "$F" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

source .venv/bin/activate
uvicorn app.main:app --port 8000 &
B=$!

cd frontend
npm run dev &
F=$!
cd ..

for i in $(seq 1 25); do
  be=$(curl -s -o /dev/null -w "%{http_code}" localhost:8000/graph)
  fe=$(curl -s -o /dev/null -w "%{http_code}" localhost:5173)
  [[ "$be" == "200" && "$fe" == "200" ]] && break
  sleep 1
done
echo ""
echo "=== ChronoMem is up ==="
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:8000/docs"
echo ""
curl -s -X POST localhost:8000/seed -o /dev/null && echo "seeded 28-node demo graph"
open http://localhost:5173

# wait on the two servers; Ctrl+C stops both
wait
