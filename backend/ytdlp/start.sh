#!/usr/bin/env sh
set -eu

node /opt/bgutil/server/build/main.js --host 127.0.0.1 --port 4416 &
BGUTIL_PID=$!

cleanup() {
  kill "$BGUTIL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4416/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "yt-dlp version: $(python -m yt_dlp --version)"
echo "bgutil POT provider: 2.0.0"

exec gunicorn server:app \\
  --bind "0.0.0.0:${PORT:-10000}" \\
  --workers 1 \\
  --threads 8 \\
  --timeout 120
