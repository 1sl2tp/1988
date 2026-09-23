#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PIN="7a41cdc541cc80235a88314383b29a4a4ea712d1"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Fetching Kira @ $PIN"
git clone --quiet https://github.com/LuanRT/kira.git "$WORK/kira"
git -C "$WORK/kira" checkout --quiet "$PIN"

cd "$WORK/kira"

python3 - <<'PY'
from pathlib import Path

PROXY_HOST = "kira-proxy-1988.onrender.com"

# 1) Deploy Kira under /kira-proof/.
p = Path("vite.config.ts")
s = p.read_text()
s = s.replace("export default defineConfig({", "export default defineConfig({\n  base: '/kira-proof/',", 1)
p.write_text(s)

# 2) Hash history so the upstream Kira routes work on GitHub Pages/custom domain.
p = Path("src/router.ts")
s = p.read_text()
s = s.replace("createRouter, createWebHistory", "createRouter, createWebHashHistory")
s = s.replace("history: createWebHistory(),", "history: createWebHashHistory('/kira-proof/'),")
p.write_text(s)

# Force the web deployment to use the configured Render proxy only.
# This avoids stale injected proxy functions/extensions from older experiments.
p = Path("src/utils/helpers.ts")
s = p.read_text()
s = s.replace(
"""export function getInjectedProxyFunction() {
  return (window as any).proxyFetch;
}""",
"""export function getInjectedProxyFunction() {
  return (window as any).__1988DisabledProxyFetch;
}"""
)
p.write_text(s)

# Reset only the broken session cache left by earlier proof builds, once.
p = Path("src/App.vue")
s = p.read_text()
old = """innertubePromise = initInnertube();
clientConfigPromise = fetchOnesieHotConfig();"""
new = """const migrationKey = '1988_kira_render_proxy_v21';
if (!localStorage.getItem(migrationKey)) {
  localStorage.setItem(migrationKey, '1');
  try { indexedDB.deleteDatabase('youtubei.js'); } catch {}
}

innertubePromise = initInnertube();
clientConfigPromise = fetchOnesieHotConfig();"""
if old not in s:
    raise SystemExit("Kira startup marker not found")
s = s.replace(old, new, 1)
p.write_text(s)

# 3) Keep Kira's own proxy implementation untouched. Only provide a working
# default root-host proxy. Migrate the legacy Supabase host saved by old proofs.
p = Path("src/composables/useProxySettings.ts")
s = p.read_text()
s = s.replace(
"""const settingsState = reactive<ProxySettings>({
  protocol: 'http',
  host: '',
  port: ''
});""",
"""const settingsState = reactive<ProxySettings>({
  protocol: 'https',
  host: '""" + PROXY_HOST + """',
  port: ''
});"""
)
s = s.replace(
"""    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      Object.assign(settingsState, parsed);
    }""",
"""    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      if (parsed?.host && !String(parsed.host).includes('supabase.co')) {
        Object.assign(settingsState, parsed);
      } else {
        localStorage.removeItem(PROXY_SETTINGS_KEY);
      }
    }"""
)
p.write_text(s)

# Build marker only; no visible UI changes.
p = Path("index.html")
s = p.read_text()
s = s.replace(
  "<head>",
  "<head>\n    <meta name=\"1988-proof-build\" content=\"ytjs-proof-20260923-22-kira-render-streamfix\">",
  1
)
p.write_text(s)
PY

echo "==> Installing exact Kira dependencies"
npm ci --no-audit --no-fund

echo "==> Building exact Kira"
npm run build

rm -rf "$ROOT/kira-proof"
mkdir -p "$ROOT/kira-proof"
cp -a dist/. "$ROOT/kira-proof/"
cp LICENSE "$ROOT/kira-proof/KIRA_LICENSE.txt"

echo "==> Kira proof built"
