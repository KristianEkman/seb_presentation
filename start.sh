#!/usr/bin/env bash
# Serve the presentation locally and open it in the browser.
# Uses $PORT (default 8000); if that port is busy, tries the next ones.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  echo "Port $PORT is in use, trying $((PORT + 1))..."
  PORT=$((PORT + 1))
done
URL="http://localhost:$PORT/"
echo "Serving presentation at $URL (Ctrl+C to stop). Press S in the deck for presenter view."
( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || true ) &
exec python3 -m http.server "$PORT"
