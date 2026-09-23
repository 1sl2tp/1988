FROM ghcr.io/imputnet/yt-session-generator:webserver

# Cobalt 11.x requests /get_pot while yt-session-generator currently exposes /token.
# Keep both routes so the session service works with both clients.
RUN python - <<'PY'
from pathlib import Path
p = Path('/app/potoken_generator/server.py')
s = p.read_text()
needle = "            '/token': self.get_potoken,"
if needle not in s:
    raise SystemExit('token route not found')
s = s.replace(needle, needle + "\n            '/get_pot': self.get_potoken,")
p.write_text(s)
PY
