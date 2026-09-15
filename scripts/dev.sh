#!/usr/bin/env bash
# Starts the Tether backend + frontend and prints the URL to open on each device.
# Usage: ./scripts/dev.sh        (Ctrl+C stops both)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]; then
  echo "→ Setting up Python environment…"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
if [ ! -d "$ROOT/frontend/node_modules/tailwindcss" ]; then
  echo "→ Installing frontend packages…"
  (cd "$ROOT/frontend" && npm install --silent)
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) &
(cd "$ROOT/frontend" && npx vite --port 5173 --strictPort) &

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
sleep 3
echo ""
echo "  Tether is running"
echo "  This computer:          http://localhost:5173"
[ -n "$LAN_IP" ] && echo "  Phones on the same Wi-Fi: http://$LAN_IP:5173"
echo ""
wait
