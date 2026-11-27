#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting FastAPI backend on http://127.0.0.1:8785 ..."
"$ROOT_DIR/backend/.venv/bin/uvicorn" app.main:app --app-dir "$ROOT_DIR/backend" --host 0.0.0.0 --port 8785 &
BACK_PID=$!

echo "Starting Vite frontend on http://127.0.0.1:3785 ..."
cd "$ROOT_DIR/frontend" && npm run dev &
FRONT_PID=$!

trap "kill $BACK_PID $FRONT_PID 2>/dev/null || true" EXIT
wait
