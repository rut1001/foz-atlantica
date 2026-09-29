#!/bin/bash
# Double-click this file to open the site.
# It starts a small local web server in this folder and opens your browser.
# Keep this Terminal window open while you're viewing the site; close it to stop.

cd "$(dirname "$0")" || exit 1

PORT=8123
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo ""
echo "  Foz Atlântica"
echo "  serving  $(pwd)"
echo "  open     http://localhost:$PORT"
echo ""
echo "  Leave this window open. Press Ctrl+C (or close it) to stop the server."
echo ""

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

sleep 1
open "http://localhost:$PORT"

wait $SERVER_PID
