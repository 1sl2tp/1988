#!/bin/sh
set -eu

/usr/local/bin/node /app/build/main.js --host 127.0.0.1 --port 4416 &
BGUTIL_PID=$!

cleanup() {
  kill "$BGUTIL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec /usr/local/bin/node /app/session-adapter.mjs
