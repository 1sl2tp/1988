from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 polish v3: gestures, pinned regions, channel videos, search suggestions."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 polish v3: gestures, pinned regions, channel videos, search suggestions.
import re

# Global interaction polish: app chrome is non-selectable, inputs remain selectable.
p = Path("src/style.css")
s = p.read_text()
if "1988-noselect-v3" not in s:
    s += r'''

/* 1988-noselect-v3 */
html, body, #app,
button, a, img, svg, nav, .controls, .reel-page {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}
'''
p.write_text(s)


# Home: clearly separate pinned navigation from scrolling feed.
p = Path("src/pages/HomePage.vue")
s = p.read_text()
if 'class="home-pinned"' not in s:
    s = s.replace(
        '<main class="home">\n    <button class="search"',
        '<main class="home">\n    <section class="home-pinned">\n    <button class="search"',
        1
    )
    s = s.replace(
        '    </nav>\n\n    <div class="heading">',
        '    </nav>\n    </section>\n\n    <div class="heading">',
        1
    )
if ".home-pinned {" not in s:
    s = s.replace(
        ".search {",
        r'''.home-pinned {
  position: sticky;
  top: 0;
  z-index: 30;
  margin: 0 -2px;
  padding: max(7px, env(safe-area-inset-top)) 2px 0;
  background: rgba(33,33,33,.96);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.search {''',
        1
    )
p.write_text(s)


# Reel/watch: make previous/next state reactive and make the swipe follow the finger.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

if "const trailIndex = ref(-1);" not in s:
    s = s.replace("let trailIndex = -1;", "const trailIndex = ref(-1);", 1)
    s = s.replace("const trailIndex = ref(-1);", "__TRAIL_INDEX_DECL__", 1)
    s = re.sub(r"\btrailIndex\b", "trailIndex.value", s)
    s = s.replace("__TRAIL_INDEX_DECL__", "const trailIndex = ref(-1);", 1)

s = s.replace(
    '@touchstart.passive="onTouchStart"\n    @touchend.passive="onTouchEnd"',
    '@touchstart="onTouchStart"\n    @touchmove.prevent="onTouchMove"\n    @touchend="onTouchEnd"',
    1
)
s = s.replace(
    '<section :key="videoId" class="reel-stage">',
    '<section :key="videoId" class="reel-stage" :style="dragStyle">',
    1
)

if "const dragY = ref(0);" not in s:
    s = s.replace(
        "const transitionName = computed(() => direction.value === 'next' ? 'reel-next' : 'reel-prev');",
        '''const transitionName = computed(() => direction.value === 'next' ? 'reel-next' : 'reel-prev');
const dragY = ref(0);
const dragging = ref(false);
const dragStyle = computed(() => ({
  transform: `translate3d(0, ${dragY.value}px, 0)`,
  transition: dragging.value ? 'none' : 'transform .2s cubic-bezier(.2,.72,.2,1)'
}));''',
        1
    )

gesture_pattern = re.compile(r"function onTouchStart\(event: TouchEvent\) \{[\s\S]*?\n\}\n\nfunction onWheel", re.M)
gesture_replacement = r'''function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches?.[0];
  const target = event.target as HTMLElement | null;
  touchEnabled = !!touch && !target?.closest?.('.controls, .action-rail, .desktop-arrows, .reel-menu, .back-btn');
  if (!touch || !touchEnabled) return;
  touchStartY = touch.clientY;
  touchStartX = touch.clientX;
  dragY.value = 0;
  dragging.value = true;
}

function onTouchMove(event: TouchEvent) {
  if (!touchEnabled) return;
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  if (!touch) return;

  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    dragY.value = 0;
    return;
  }

  const resistance = (dy > 0 && !canPrevious.value) || (dy < 0 && !canNext.value) ? .22 : .72;
  dragY.value = Math.max(-150, Math.min(150, dy * resistance));
}

function onTouchEnd(event: TouchEvent) {
  if (!touchEnabled) return;
  touchEnabled = false;
  dragging.value = false;

  const touch = event.changedTouches?.[0];
  if (!touch) {
    dragY.value = 0;
    return;
  }

  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  dragY.value = 0;

  if (Math.abs(dy) < 46 || Math.abs(dy) < Math.abs(dx) * 1.08) return;

  if (dy < 0) swipeNext();
  else swipePrevious();
}

function onWheel'''
s, count = gesture_pattern.subn(gesture_replacement, s, count=1)

s = s.replace("touch-action: pan-y;", "touch-action: none;", 1)
if ".reel-stage {" in s and "will-change: transform;" not in s:
    s = s.replace(
        ".reel-stage {",
        '''.reel-stage {
  will-change: transform;''',
        1
    )
p.write_text(s)


# Channel page: resolve raw UC ids, keep header pinned and always provide videos.
p = Path("src/pages/ChannelPage.vue")
s = p.read_text()

s = s.replace(
    '''    const raw = String(row?.url || row?.id || '');
    const id = raw.match(/\\/channel\\/(UC[A-Za-z0-9_-]+)/)?.[1];
    if (id) return id;''',
    '''    const raw = String(row?.channelId || row?.id || row?.url || '');
    if (/^UC[A-Za-z0-9_-]+$/.test(raw)) return raw;
    const id = raw.match(/\\/channel\\/(UC[A-Za-z0-9_-]+)/)?.[1];
    if (id) return id;''',
    1
)

if "async function fallbackChannelVideos" not in s:
    s = s.replace(
        "async function load() {",
        r'''async function fallbackChannelVideos(name: string) {
  const q = String(name || '').trim();
  if (!q) return [];

  const url = new URL(API);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', q);
  url.searchParams.set('filter', 'videos');

  try {
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const needle = q.toLocaleLowerCase('vi');
    const strict = rows.filter((row: any) => {
      const channelName = String(row?.uploaderName || row?.uploader || row?.channelName || '').toLocaleLowerCase('vi');
      return channelName === needle || channelName.includes(needle) || needle.includes(channelName);
    });
    return strict.length ? strict : rows;
  } catch {
    return [];
  }
}

async function load() {''',
        1
    )

s = s.replace(
    '''  const seen = new Set<string>();
  const rows = Array.isArray(data?.relatedStreams) ? data.relatedStreams : (Array.isArray(data?.items) ? data.items : []);

  videos.value = rows''',
    '''  const seen = new Set<string>();
  let rows = Array.isArray(data?.relatedStreams) ? data.relatedStreams
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.videos) ? data.videos
    : [];

  if (!rows.length) {
    rows = await fallbackChannelVideos(channel.value.name || key);
  }

  videos.value = rows''',
    1
)

if ".channel-head {" in s:
    s = s.replace(
        ".channel-head {",
        '''.channel-head {
  position: sticky;
  top: max(0px, env(safe-area-inset-top));
  z-index: 24;''',
        1
    )
p.write_text(s)


# Search: live suggestions + typo/retry suggestion, pinned search chrome, scrollable results.
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

s = s.replace(
    '          placeholder="Tìm video, bài hát, kênh..."\n        >',
    '          placeholder="Tìm video, bài hát, kênh..."\n          @focus="suggestionsOpen = !!suggestions.length"\n          @input="scheduleSuggestions"\n        >',
    1
)

if 'class="suggestions"' not in s:
    s = s.replace(
        '      </div>\n\n      <nav class="sources"',
        r'''      </div>

      <div v-if="suggestionsOpen && suggestions.length" class="suggestions">
        <button
          v-for="item in suggestions"
          :key="item"
          type="button"
          @mousedown.prevent
          @click="pickSuggestion(item)"
        >
          <Search/>
          <span>{{ item }}</span>
        </button>
      </div>

      <nav class="sources"''',
        1
    )

if 'class="retry-hint"' not in s:
    s = s.replace(
        '''      <div v-if="!channels.length && !playlists.length && !videos.length" class="state">
        Không tìm thấy kết quả.
      </div>''',
        '''      <div v-if="!channels.length && !playlists.length && !videos.length" class="state empty-state">
        <span>Không tìm thấy kết quả.</span>
        <button
          v-if="suggestions.length && suggestions[0].toLocaleLowerCase('vi') !== term.trim().toLocaleLowerCase('vi')"
          type="button"
          class="retry-hint"
          @click="pickSuggestion(suggestions[0])"
        >
          Thử tìm “{{ suggestions[0] }}”
        </button>
      </div>''',
        1
    )

if "const suggestions = ref<string[]>([]);" not in s:
    s = s.replace(
        "const videos = ref<any[]>([]);",
        '''const videos = ref<any[]>([]);
const suggestions = ref<string[]>([]);
const suggestionsOpen = ref(false);
const suggestCache = new Map<string, string[]>();''',
        1
    )
    s = s.replace(
        "let runSerial = 0;",
        '''let runSerial = 0;
let suggestSerial = 0;
let suggestTimer: number | undefined;''',
        1
    )

if "async function fetchSuggestions" not in s:
    s = s.replace(
        "function age(ts: number) {",
        r'''async function fetchSuggestions(q: string) {
  q = q.trim();
  if (q.length < 2) {
    suggestions.value = [];
    suggestionsOpen.value = false;
    return;
  }

  const key = q.toLocaleLowerCase('vi');
  const cached = suggestCache.get(key);
  if (cached) {
    suggestions.value = cached;
    suggestionsOpen.value = !!cached.length;
    return;
  }

  const current = ++suggestSerial;
  const url = new URL(API);
  url.searchParams.set('action', 'suggestions');
  url.searchParams.set('q', q);

  try {
    const res = await fetch(url.toString(), { cache: 'force-cache' });
    const payload = await res.json();
    if (current !== suggestSerial) return;

    const seen = new Set<string>();
    const rows = (Array.isArray(payload?.data) ? payload.data : [])
      .map((item: any) => String(item || '').trim())
      .filter((item: string) => {
        const normalized = item.toLocaleLowerCase('vi');
        if (!item || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 8);

    suggestCache.set(key, rows);
    suggestions.value = rows;
    suggestionsOpen.value = !!rows.length;
  } catch {}
}

function scheduleSuggestions() {
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
  const q = term.value.trim();
  if (q.length < 2) {
    suggestions.value = [];
    suggestionsOpen.value = false;
    return;
  }
  suggestTimer = window.setTimeout(() => void fetchSuggestions(q), 160);
}

function pickSuggestion(value: string) {
  term.value = value;
  suggestionsOpen.value = false;
  submit();
}

function age(ts: number) {''',
        1
    )

s = s.replace(
    '''function submit() {
  const q = term.value.trim();
  if (!q) return;''',
    '''function submit() {
  const q = term.value.trim();
  if (!q) return;
  suggestionsOpen.value = false;''',
    1
)

s = s.replace(
    '''function clear() {
  term.value = '';
  searched.value = false;''',
    '''function clear() {
  term.value = '';
  searched.value = false;
  suggestions.value = [];
  suggestionsOpen.value = false;''',
    1
)

s = s.replace(
    '''onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});''',
    '''onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
});''',
    1
)

if ".suggestions {" not in s:
    s = s.replace(
        ".sources {",
        r'''.suggestions {
  position: absolute;
  z-index: 32;
  top: 52px;
  left: 0;
  right: 0;
  display: grid;
  padding: 6px;
  border: 1px solid #3a3a3e;
  border-radius: 12px;
  background: rgba(40,40,43,.98);
  box-shadow: 0 16px 42px rgba(0,0,0,.28);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.suggestions button {
  min-height: 42px;
  display: grid;
  grid-template-columns: 22px minmax(0,1fr);
  gap: 8px;
  align-items: center;
  padding: 0 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #ededf0;
  text-align: left;
}

.suggestions button:hover {
  background: #36363a;
}

.suggestions :deep(svg) {
  width: 17px;
  height: 17px;
  color: #8f8f96;
}

.suggestions span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sources {''',
        1
    )

if ".retry-hint {" not in s:
    s = s.replace(
        ".state {",
        r'''.empty-state {
  align-content: center;
  gap: 10px;
}

.retry-hint {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid #414146;
  border-radius: 999px;
  background: #2e2e32;
  color: #f1f1f2;
}

.state {''',
        1
    )

# The search form is the pinned region; results remain naturally scrollable below.
s = s.replace("  background: #212121;\n}", "  background: rgba(33,33,33,.96);\n  backdrop-filter: blur(18px);\n  -webkit-backdrop-filter: blur(18px);\n}", 1)
p.write_text(s)\n"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
