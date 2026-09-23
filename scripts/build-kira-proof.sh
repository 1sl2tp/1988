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
import re

PROXY = "https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt-browser-proxy"

# Vite base path.
p = Path("vite.config.ts")
s = p.read_text()
s = s.replace("export default defineConfig({", "export default defineConfig({\n  base: '/kira-proof/',", 1)
p.write_text(s)

# Hash history keeps the exact Kira UI while making GitHub Pages deep links reliable.
p = Path("src/router.ts")
s = p.read_text()
s = s.replace("createRouter, createWebHistory", "createRouter, createWebHashHistory")
s = s.replace("history: createWebHistory(),", "history: createWebHashHistory('/kira-proof/'),")
p.write_text(s)

# Keep Kira UI/player intact, but create the same local anonymous
# InnerTube session shape that already proved search works on this project:
# visitorData + a cold PoToken from Kira's own BotGuard service.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace(
    "import { Innertube, Platform, UniversalCache, YTNodes, Types } from 'youtubei.js/web';",
    "import { Innertube, Platform, ProtoUtils, UniversalCache, Utils, YTNodes, Types } from 'youtubei.js/web';"
)
old = """    const instance = await Innertube.create({
      cache: new UniversalCache(true),
      fetch: fetchFunction
    });"""
new = """    const visitorData = ProtoUtils.encodeVisitorData(
      Utils.generateRandomString(11),
      Math.floor(Date.now() / 1000)
    );
    const coldStartToken = botguardService.mintColdStartToken(visitorData);

    const instance = await Innertube.create({
      cache: new UniversalCache(true),
      fetch: fetchFunction,
      generate_session_locally: true,
      enable_session_cache: false,
      visitor_data: visitorData,
      po_token: coldStartToken,
      lang: 'vi',
      location: 'VN',
      timezone: 'Asia/Ho_Chi_Minh'
    });"""
if old not in s:
    raise SystemExit("Kira Innertube init block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# Mark proxy configured by default so Kira does not open its settings dialog.
p = Path("src/composables/useProxySettings.ts")
s = p.read_text()
s = s.replace("protocol: 'http',\n  host: '',\n  port: ''", "protocol: 'https',\n  host: 'gcnoahqsrquxkwkjbuxy.supabase.co',\n  port: ''")
s = s.replace("      Object.assign(settingsState, parsed);", "      if (parsed?.host) Object.assign(settingsState, parsed);")
p.write_text(s)

# Use the existing 1988 Supabase proxy shape (__host + __path + serialized headers).
p = Path("src/utils/helpers.ts")
s = p.read_text()

start = s.index("export function configImageHttpProxy()")
end = s.index("export function getInjectedProxyFunction()", start)
s = s[:start] + """export function configImageHttpProxy() {
  // Images can load cross-origin directly; do not rewrite them through the API proxy.
}

""" + s[end:]

start = s.index("export async function fetchFunction(")
new_fetch = r"""export async function fetchFunction(input: string | Request | URL, init?: RequestInit): Promise<Response> {
  const original = input instanceof URL ? new URL(input.toString()) : new URL(typeof input === 'string' ? input : input.url);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

  if (original.pathname.includes('v1/player')) {
    original.searchParams.set('$fields', 'playerConfig,storyboards,captions,playabilityStatus,streamingData,responseContext.mainAppWebResponseContext.datasyncId,videoDetails.isLive,videoDetails.isLiveContent,videoDetails.title,videoDetails.author,videoDetails.thumbnail');
  }

  const proxy = new URL('""" + PROXY + r"""');
  proxy.searchParams.set('__host', original.host);
  proxy.searchParams.set('__path', original.pathname);
  for (const [key, value] of original.searchParams) {
    proxy.searchParams.append(key, value);
  }
  proxy.searchParams.set('__headers', JSON.stringify([ ...headers ]));

  headers.delete('user-agent');

  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  let body = init?.body;
  if (body === undefined && input instanceof Request && method !== 'GET' && method !== 'HEAD') {
    body = await input.clone().arrayBuffer();
  }

  return fetch(proxy.toString(), {
    ...init,
    method,
    headers,
    body,
    credentials: 'omit',
    redirect: 'follow'
  });
}

"""
s = s[:start] + new_fetch
p.write_text(s)

# Rewrite Shaka's googlevideo/license requests into the same proxy URL while
# preserving the original query params (including rn used by SABR metadata).
p = Path("src/composables/useYoutubePlayer.ts")
s = p.read_text()
s = s.replace("import { useProxySettings } from '@/composables/useProxySettings';\n", "")
s = s.replace("  const { settings } = useProxySettings();\n", "")
old = """      if ((url.host.endsWith('.googlevideo.com') || url.href.includes('drm')) && !checkExtension()) {
        const newUrl = new URL(url.toString());
        newUrl.searchParams.set('__host', url.host);
        newUrl.host = settings.host;
        newUrl.port = settings.port;
        newUrl.protocol = settings.protocol;
        url = newUrl;
      }"""
new = """      if ((url.host.endsWith('.googlevideo.com') || url.href.includes('drm')) && !checkExtension()) {
        const originalUrl = new URL(url.toString());
        const newUrl = new URL('""" + PROXY + """');
        newUrl.searchParams.set('__host', originalUrl.host);
        newUrl.searchParams.set('__path', originalUrl.pathname);
        for (const [key, value] of originalUrl.searchParams) {
          newUrl.searchParams.append(key, value);
        }
        url = newUrl;
      }"""
if old not in s:
    raise SystemExit("Kira proxy filter block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# Keep attribution and a machine-readable build marker without changing the UI.
p = Path("index.html")
s = p.read_text()
s = s.replace("<head>", "<head>\n    <meta name=\"1988-proof-build\" content=\"ytjs-proof-20260923-20-kira-pot-search\">", 1)
p.write_text(s)
PY

echo "==> Installing Kira dependencies"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "==> Building Kira proof"
npm run build

rm -rf "$ROOT/kira-proof"
mkdir -p "$ROOT/kira-proof"
cp -a dist/. "$ROOT/kira-proof/"
cp LICENSE "$ROOT/kira-proof/KIRA_LICENSE.txt"

echo "==> Kira proof built"
find "$ROOT/kira-proof" -maxdepth 2 -type f -printf '%P %k KB\n' | sort | head -80
