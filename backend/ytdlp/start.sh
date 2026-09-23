#!/usr/bin/env sh
set -eu

node /opt/bgutil/server/build/main.js --host 127.0.0.1 --port 4416 &
BGUTIL_PID=$!

cleanup() {
  kill "$BGUTIL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "yt-dlp version: $(yt-dlp --version)"
echo "bgutil POT provider: 2.0.0"
echo "1988 backend: node server.js"

exec node server.js
