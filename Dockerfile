FROM ghcr.io/imputnet/yt-session-generator:webserver

USER root

# Cobalt 11.x + build/runtime dependencies. The session generator image already
# contains Chromium, Xvfb and Python; keeping both engines in this one container
# makes the generated YouTube session use the same public egress IP as Cobalt.
RUN apk add --no-cache \
      nodejs \
      npm \
      git \
      build-base \
      curl \
    && npm install -g pnpm@9.6.0

# Pin the currently verified Cobalt 11 source instead of tracking an unbounded
# moving main branch.
RUN git clone https://github.com/imputnet/cobalt.git /tmp/cobalt \
    && cd /tmp/cobalt \
    && git checkout a636575b09de1fc55d9b8cd98cac88f5f2f16b42 \
    && pnpm install --prod --frozen-lockfile \
    && pnpm deploy --filter=@imput/cobalt-api --prod /opt/cobalt \
    && rm -rf /tmp/cobalt

# Cobalt 11.x requests POST /get_pot. Upstream yt-session-generator exposes
# /token; point both paths at the exact same JSON token handler.
RUN python - <<'PY'
from pathlib import Path
p = Path('/app/potoken_generator/server.py')
s = p.read_text()
needle = "            '/token': self.get_potoken,"
if needle not in s:
    raise SystemExit('token route not found')
if "'/get_pot': self.get_potoken," not in s:
    s = s.replace(needle, needle + "\n            '/get_pot': self.get_potoken,")
p.write_text(s)
PY

RUN cat > /usr/local/bin/start-1988-media <<'SH'
#!/bin/sh
set -u

export API_PORT="${PORT:-10000}"
export API_URL="${API_URL:-https://one988-extractor.onrender.com/}"
export CORS_WILDCARD="${CORS_WILDCARD:-1}"
export YOUTUBE_SESSION_SERVER="${YOUTUBE_SESSION_SERVER:-http://127.0.0.1:8080/}"
export YOUTUBE_SESSION_INNERTUBE_CLIENT="${YOUTUBE_SESSION_INNERTUBE_CLIENT:-WEB_EMBEDDED}"
export YOUTUBE_ALLOW_BETTER_AUDIO="${YOUTUBE_ALLOW_BETTER_AUDIO:-1}"

# This is a private app backend, not a public shared Cobalt instance. Keep
# Cobalt's built-in guards very high so normal playback is not quota-bound.
export RATELIMIT_WINDOW="${RATELIMIT_WINDOW:-60}"
export RATELIMIT_MAX="${RATELIMIT_MAX:-10000}"
export TUNNEL_RATELIMIT_WINDOW="${TUNNEL_RATELIMIT_WINDOW:-60}"
export TUNNEL_RATELIMIT_MAX="${TUNNEL_RATELIMIT_MAX:-20000}"
export SESSION_RATELIMIT_WINDOW="${SESSION_RATELIMIT_WINDOW:-60}"
export SESSION_RATELIMIT_MAX="${SESSION_RATELIMIT_MAX:-1000}"

echo "[1988] starting yt-session-generator on 127.0.0.1:8080"
cd /app
python potoken-generator.py > /tmp/yt-session.log 2>&1 &
SESSION_PID=$!

# Forward its logs without blocking Cobalt startup.
tail -n +1 -F /tmp/yt-session.log &
TAIL_PID=$!

echo "[1988] waiting briefly for session-generator HTTP server"
i=0
while [ "$i" -lt 45 ]; do
  if curl -fsS http://127.0.0.1:8080/token >/tmp/token.json 2>/dev/null; then
    echo "[1988] initial YouTube session ready"
    break
  fi
  i=$((i+1))
  sleep 1
done

if [ "$i" -ge 45 ]; then
  echo "[1988] session not ready yet; Cobalt will keep retrying it"
fi

echo "[1988] starting Cobalt on 0.0.0.0:${API_PORT}"
cd /opt/cobalt
node src/cobalt &
COBALT_PID=$!

term() {
  kill "$COBALT_PID" "$SESSION_PID" "$TAIL_PID" 2>/dev/null || true
}
trap term INT TERM EXIT

wait "$COBALT_PID"
SH

RUN chmod +x /usr/local/bin/start-1988-media

EXPOSE 10000
CMD ["/usr/local/bin/start-1988-media"]
