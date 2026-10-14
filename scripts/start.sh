#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Use virtual environment python if present
if [ -f "$PROJECT_ROOT/.venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python3"
elif [ -f "$PROJECT_ROOT/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_ROOT/venv/bin/python3"
else
    PYTHON_BIN="python3"
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo "Starting Antigravity WebUI on http://${HOST}:${PORT} ..."
exec "$PYTHON_BIN" -m uvicorn app.main:app --host "$HOST" --port "$PORT" "$@"
