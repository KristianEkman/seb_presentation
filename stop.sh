#!/usr/bin/env bash
# Stop any presentation servers started from this folder (python3 -m http.server).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
found=0
for pid in $(pgrep -f "http.server" || true); do
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
  if [ "$cwd" = "$DIR" ]; then
    port="$(lsof -a -p "$pid" -iTCP -sTCP:LISTEN -nP -Fn 2>/dev/null | sed -n 's/^n.*://p' | head -1 || true)"
    kill "$pid" && echo "Stopped server on port ${port:-?} (PID $pid)."
    found=1
  fi
done
[ "$found" = 1 ] || echo "No presentation server running."
