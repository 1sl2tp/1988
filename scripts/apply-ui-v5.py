from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 UI v5: instant shell, compact related strip, clean fullscreen and search."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 UI v5: instant shell, compact related strip, clean fullscreen and search.
import re

# ---------- Player controls ----------
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

# Remove playback-speed selector entirely.
s = re.sub(
    r'\n\s*<select\s+class="speed"[\s\S]*?</select>\n',
    '\n',
    s,
    count=1
)

# Remove the now-unused handler too, otherwise vue-tsc fails with noUnusedLocals.
s = re.sub(
    r'\nfunction setPlaybackRateFromSelect\(event: Event\) \{[\s\S]*?\n\}\n',
    '\n',
    s,
    count=1
)

# Tighten control grids after speed is removed.
s = s.replace(
    "grid-template-columns: auto minmax(66px, 1fr) auto auto auto auto;",
    "grid-template-columns: auto minmax(66px, 1fr) auto auto auto;",
    1
)
s = s.replace(
    "grid-template-columns: auto minmax(60px, 1fr) auto auto auto;",
    "grid-template-columns: auto minmax(60px, 1fr) auto auto;",
    1
)

# Track fullscreen so the same button clearly becomes "Thu nhỏ".
if "const fullscreen1988 = ref(false);" not in s:
    s = s.replace(
        "const playbackRates = ref<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);",
        '''const playbackRates = ref<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);
const fullscreen1988 = ref(false);''',
        1
    )

if "function syncFullscreen1988" not in s:
    s = s.replace(
        "async function toggleFullscreen() {",
        r'''function syncFullscreen1988() {
  const doc = document as any;
  fullscreen1988.value = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

async function toggleFullscreen() {''',
        1
    )

# Give the fullscreen button a real expand/collapse state.
s = s.replace(
    r'''      <button
        class="icon-btn"
        title="Toàn màn hình"
        aria-label="Toàn màn hình"
        @click="toggleFullscreen"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>
        </svg>
      </button>''',
    r'''      <button
        class="icon-btn"
        :title="fullscreen1988 ? 'Thu nhỏ' : 'Toàn màn hình'"
        :aria-label="fullscreen1988 ? 'Thu nhỏ' : 'Toàn màn hình'"
        @click="toggleFullscreen"
      >
        <svg v-if="!fullscreen1988" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/>
        </svg>
      </button>''',
    1
)

# Fullscreen state listeners.
s = s.replace(
    r'''onMounted(() => {
  void createPlayer();
});''',
    r'''onMounted(() => {
  void createPlayer();
  document.addEventListener('fullscreenchange', syncFullscreen1988);
  document.addEventListener('webkitfullscreenchange', syncFullscreen1988 as EventListener);
});''',
    1
)
s = s.replace(
    r'''onBeforeUnmount(() => {
  clearAutoplayFallback1988();
  stopPolling();''',
    r'''onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen1988);
  document.removeEventListener('webkitfullscreenchange', syncFullscreen1988 as EventListener);
  clearAutoplayFallback1988();
  stopPolling();''',
    1
)

# Strong fullscreen presentation and remove leftover speed styling visually.
if "1988-fullscreen-v5" not in s:
    s = s.replace(
        "</style>",
        r'''
/* 1988-fullscreen-v5 */
.speed { display: none !important; }

.video-player:fullscreen,
.video-player:-webkit-full-screen {
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #000 !important;
}

.video-player:fullscreen .video-surface,
.video-player:-webkit-full-screen .video-surface {
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  aspect-ratio: auto !important;
  border-radius: 0 !important;
}

.video-player:fullscreen .controls,
.video-player:-webkit-full-screen .controls {
  position: absolute !important;
  z-index: 50 !important;
  left: 50% !important;
  bottom: max(14px, env(safe-area-inset-bottom)) !important;
  transform: translateX(-50%) !important;
  width: min(760px, calc(100vw - 28px)) !important;
  margin: 0 !important;
  background: rgba(20,20,23,.78) !important;
  border-color: rgba(255,255,255,.12) !important;
  backdrop-filter: blur(18px) !important;
  -webkit-backdrop-filter: blur(18px) !important;
}
</style>''',
        1
    )
p.write_text(s)


# ---------- Watch / swipe page ----------
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

# Always render the information area so the shell appears immediately.
s = s.replace(
    '<section v-if="details" class="reel-meta">',
    '<section class="reel-meta">',
    1
)
s = s.replace(
    r'''            <router-link
              v-if="details.channelKey"''',
    r'''            <router-link
              v-if="details?.channelKey"''',
    1
)
s = s.replace(
    ':to="\'/channel/\' + encodeURIComponent(details.channelKey)"',
    ':to="\'/channel/\' + encodeURIComponent(details?.channelKey || \'\')"',
    1
)
s = s.replace(
    '<img v-if="details.avatar" :src="details.avatar" :alt="details.channel">',
    '<img v-if="details?.avatar" :src="details.avatar" :alt="details.channel">',
    1
)
s = s.replace(
    '<strong>{{ details.channel }}</strong>',
    '<strong>{{ details?.channel || \'Đang tải…\' }}</strong>',
    1
)
s = s.replace(
    '<small v-if="details.meta">{{ details.meta }}</small>',
    '<small v-if="details?.meta">{{ details.meta }}</small>',
    1
)
s = s.replace(
    '<h1>{{ details.title }}</h1>',
    '<h1 :class="{ placeholder: !details?.title }">{{ details?.title || \'Đang tải nội dung…\' }}</h1>',
    1
)

# Compact next-items strip beneath landscape/square videos.
if 'class="related-strip"' not in s:
    s = s.replace(
        '''          </section>
        </div>

        <aside class="action-rail"''',
        '''          </section>

          <nav v-if="shape !== 'portrait'" class="related-strip" aria-label="Gợi ý tiếp theo">
            <button
              v-for="item in previewItems"
              :key="item.id"
              class="related-mini"
              type="button"
              @click="jumpToPreview(item)"
            >
              <img :src="item.thumbnail" :alt="item.title || 'Video tiếp theo'" loading="eager" decoding="async">
              <span v-if="item.title">{{ item.title }}</span>
            </button>

            <div v-if="!previewItems.length" class="related-loading" aria-hidden="true">
              <span v-for="n in 5" :key="n"></span>
            </div>
          </nav>
        </div>

        <aside class="action-rail"''',
        1
    )

# Preview queue uses source group first; relatedStreams only as fallback.
if "const previewItems = computed" not in s:
    s = s.replace(
        "const playerClass = computed(() => `reel-${shape.value}`);",
        r'''const playerClass = computed(() => `reel-${shape.value}`);
const previewItems = computed(() => {
  if (feedItems.value.length && feedIndex.value >= 0) {
    return feedItems.value
      .slice(feedIndex.value + 1, feedIndex.value + 8)
      .map((item: any, offset: number) => {
        const rel = related.value.find((row: any) => row?.id === item.id);
        return {
          ...item,
          feedIndex: feedIndex.value + 1 + offset,
          title: rel?.title || '',
          thumbnail: rel?.thumbnail || ('https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg')
        };
      });
  }

  return related.value.slice(0, 7).map((item: any) => ({
    ...item,
    feedIndex: -1,
    thumbnail: item.thumbnail || ('https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg')
  }));
});''',
        1
    )

if "function jumpToPreview" not in s:
    s = s.replace(
        "function onTouchStart(event: TouchEvent) {",
        r'''function jumpToPreview(item: any) {
  if (!item?.id) return;
  if (item.feedIndex >= 0) {
    feedIndex.value = item.feedIndex;
    void navigateTo(item, 'next', item.feedIndex);
    return;
  }
  void navigateTo({ id: item.id, shape: item.shape || 'landscape' }, 'next');
}

function onTouchStart(event: TouchEvent) {''',
        1
    )

# Cleaner desktop arrow rail and compact related tiles.
if "1988-watch-v5" not in s:
    s = s.replace(
        "</style>",
        r'''
/* 1988-watch-v5 */
.reel-meta h1.placeholder {
  color: #6f6f76;
  font-weight: 560;
}

.related-strip {
  width: 100%;
  max-width: 980px;
  margin-top: 12px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(128px, 1fr);
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: none;
  padding: 0 6px 3px;
  box-sizing: border-box;
}
.related-strip::-webkit-scrollbar { display: none; }

.related-mini {
  min-width: 0;
  display: grid;
  grid-template-rows: 72px auto;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #d9d9dc;
  text-align: left;
  cursor: pointer;
}
.related-mini img {
  width: 100%;
  height: 72px;
  display: block;
  object-fit: cover;
  border-radius: 8px;
  background: #171719;
}
.related-mini span {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  font-size: 10.5px;
  line-height: 1.25;
}

.related-loading {
  display: contents;
}
.related-loading span {
  width: 140px;
  height: 72px;
  border-radius: 8px;
  background: #171719;
}

.desktop-arrows {
  right: 12px !important;
  gap: 2px !important;
  padding: 4px !important;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 999px;
  background: rgba(25,25,28,.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.desktop-arrows button {
  width: 36px !important;
  height: 36px !important;
  border : 0 !important;
  background: transparent !important;
}
.desktop-arrows button:hover:not(:disabled) {
  background: rgba(255,255,255,.08) !important;
}
.desktop-arrows button:disabled {
  opacity: .24 !important;
}

@media (max-width: 899px) {
  .related-strip {
    grid-auto-columns: 118px;
    gap: 7px;
    margin-top: 9px;
    padding-inline: 10px;
  }
  .related-mini {
    grid-template-rows: 66px auto;
  }
  .related-mini img,
  .related-loading span {
    height: 66px;
  }
}

@media (max-height: 760px) and (min-width: 900px) {
  .related-strip { display: none; }
}
</style>''',
        1
    )
p.write_text(s)

# ---------- Home: render shell/content immediately; refresh silently ----------
p = Path("src/pages/HomePage.vue")
s = p.read_text()

# Keep current cards on screen while topic/source refresh happens in background.
s = re.sub(
    r'<div v-if="loading" class="state">[^<]*</div>\s*<div v-else(?:-if="[^"]*")? class="(?:grid|video-grid)">',
    '<div class="grid">',
    s,
    count=1
)
s = re.sub(
    r'<div v-if="loading" class="state">[^<]*</div>\s*<div v-else class="grid">',
    '<div class="grid">',
    s,
    count=1
)

# Do not blank the list when a new source/topic begins loading.
s = s.replace(
    "  loading.value = true;\n  videos.value = [];",
    "  loading.value = true;",
    1
)
p.write_text(s)


# ---------- Search: one decisive X only ----------
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

if "1988-search-clear-v5" not in s:
    s = s.replace(
        ".search-input {",
        r'''.search-input::-webkit-search-cancel-button,
.search-input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.search-input::-ms-clear,
.search-input::-ms-reveal {
  display: none;
  width: 0;
  height: 0;
}

/* 1988-search-clear-v5 */
.search-input {''',
        1
    )

# Clear once: close suggestions, cancel stale runs, clear results/query and blur.
clear_pattern = re.compile(r"function clear\(\) \{[\s\S]*?\n\}", re.M)
clear_replacement = r'''function clear() {
  term.value = '';
  searched.value = false;
  loading.value = false;
  channels.value = [];
  videos.value = [];
  suggestions.value = [];
  suggestionsOpen.value = false;
  suggestSerial += 1;
  runSerial += 1;
  if (suggestTimer !== undefined) {
    clearTimeout(suggestTimer);
    suggestTimer = undefined;
  }
  void router.replace('/search');
  inputRef.value?.blur();
}'''
s, _ = clear_pattern.subn(clear_replacement, s, count=1)

p.write_text(s)
"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
