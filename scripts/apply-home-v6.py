from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 home v6: compact pinned chrome, silent cache refresh and quick-view mini player."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 home v6: compact pinned chrome, silent cache refresh and quick-view mini player.

# ---------- Grid card: optional quick-view action ----------
p = Path("src/components/GridVideoItem.vue")
s = p.read_text()

s = s.replace(
    "const props = defineProps<{ data: VideoItemData; feedKey?: string; feedIndex?: number }>();",
    "const props = defineProps<{ data: VideoItemData; feedKey?: string; feedIndex?: number; quickView?: boolean }>();\nconst emit = defineEmits<{ (event: 'quick-view', data: VideoItemData): void }>();",
    1
)

if "import { Play } from '@lucide/vue';" not in s:
    s = s.replace(
        "import { computed } from 'vue';",
        "import { computed } from 'vue';\nimport { Play } from '@lucide/vue';",
        1
    )

if 'class="quick-view"' not in s:
    s = s.replace(
        '<div v-if="data.duration" class="duration">{{ data.duration }}</div>',
        '''<button
        v-if="quickView"
        class="quick-view"
        type="button"
        aria-label="Xem nhanh"
        @click.prevent.stop="emit('quick-view', data)"
      >
        <Play/>
        <span>Xem nhanh</span>
      </button>
      <div v-if="data.duration" class="duration">{{ data.duration }}</div>''',
        1
    )

if ".quick-view {" not in s:
    s = s.replace(
        ".duration {",
        r'''.quick-view {
  position: absolute;
  left: 7px;
  bottom: 7px;
  z-index: 4;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px;
  background: rgba(20,20,22,.78);
  color: #fff;
  font-size: 10.5px;
  font-weight: 650;
  opacity: 0;
  transform: translateY(3px);
  transition: opacity .16s ease, transform .16s ease, background .16s ease;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.quick-view :deep(svg) {
  width: 13px;
  height: 13px;
  fill: currentColor;
}

.grid-video-item:hover .quick-view,
.quick-view:focus-visible {
  opacity: 1;
  transform: translateY(0);
}

.quick-view:hover {
  background: rgba(35,35,38,.96);
}

@media (hover: none), (max-width: 680px) {
  .quick-view {
    opacity: 1;
    transform: none;
    height: 28px;
    padding-inline: 8px;
  }
}

.duration {''',
        1
    )

p.write_text(s)


# ---------- Home page ----------
p = Path("src/pages/HomePage.vue")
s = p.read_text()

# Make source labels compact and semantically clear.
s = s.replace("{ id: 'latest', label: 'YouTube mới nhất' }", "{ id: 'latest', label: 'Mới nhất' }", 1)

# Grid cards can open quick view.
s = s.replace(
    '<GridVideoItem v-for="(video, index) in videos" :key="video.videoId" :data="video" :feed-key="feedKey" :feed-index="index"/>',
    '<GridVideoItem v-for="(video, index) in videos" :key="video.videoId" :data="video" :feed-key="feedKey" :feed-index="index" :quick-view="true" @quick-view="openQuickView"/>',
    1
)

# Mini player lives at bottom-right on desktop and as a bottom floating card on mobile.
if 'class="home-mini"' not in s:
    s = s.replace(
        '''    <div v-else class="state">Chưa có nội dung phù hợp.</div>
  </main>''',
        '''    <div v-else-if="!loading" class="state">Chưa có nội dung phù hợp.</div>

    <aside v-if="quickVideo" class="home-mini" :class="{ collapsed: miniCollapsed }">
      <header class="mini-head">
        <button
          class="mini-title"
          type="button"
          :title="quickVideo.titleText || quickVideo.title"
          @click="miniCollapsed = false"
        >
          {{ quickVideo.titleText || quickVideo.title }}
        </button>
        <span class="mini-actions">
          <button
            type="button"
            :aria-label="miniCollapsed ? 'Mở mini' : 'Thu nhỏ mini'"
            :title="miniCollapsed ? 'Mở mini' : 'Thu nhỏ mini'"
            @click="miniCollapsed = !miniCollapsed"
          >
            <Maximize2 v-if="miniCollapsed"/>
            <Minimize2 v-else/>
          </button>
          <button type="button" aria-label="Mở trang xem" title="Mở trang xem" @click="openQuickFull">
            <ExternalLink/>
          </button>
          <button type="button" aria-label="Đóng xem nhanh" title="Đóng" @click="closeQuickView">
            <X/>
          </button>
        </span>
      </header>
      <div v-if="!miniCollapsed" class="mini-video">
        <VideoPlayer :video-id="quickVideo.videoId"/>
      </div>
    </aside>
  </main>''',
        1
    )

# Imports.
s = s.replace(
    "import { ChevronRight, Search, UserRound } from '@lucide/vue';",
    "import { ChevronRight, ExternalLink, Maximize2, Minimize2, Search, UserRound, X } from '@lucide/vue';",
    1
)
if "import VideoPlayer from '@/components/VideoPlayer.vue';" not in s:
    s = s.replace(
        "import GridVideoItem from '@/components/GridVideoItem.vue';",
        "import GridVideoItem from '@/components/GridVideoItem.vue';\nimport VideoPlayer from '@/components/VideoPlayer.vue';",
        1
    )

# State + silent cache helpers.
if "const quickVideo = ref<Row | null>(null);" not in s:
    s = s.replace(
        "const playlists = ref<any[]>([]);",
        r'''const playlists = ref<any[]>([]);
const quickVideo = ref<Row | null>(null);
const miniCollapsed = ref(false);
const HOME_CACHE_PREFIX = '1988:home:v6:';''',
        1
    )

if "function homeCacheKey()" not in s:
    s = s.replace(
        "const heading = computed(() => {",
        r'''function homeCacheKey() {
  return HOME_CACHE_PREFIX + source.value + ':' + topic.value;
}

function readHomeCache() {
  try {
    const raw = localStorage.getItem(homeCacheKey());
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > 6 * 60 * 60 * 1000) return false;

    videos.value = Array.isArray(parsed.videos) ? parsed.videos : [];
    channels.value = Array.isArray(parsed.channels) ? parsed.channels : [];
    playlists.value = Array.isArray(parsed.playlists) ? parsed.playlists : [];
    return !!(videos.value.length || channels.value.length || playlists.value.length);
  } catch {
    return false;
  }
}

function writeHomeCache() {
  try {
    localStorage.setItem(homeCacheKey(), JSON.stringify({
      savedAt: Date.now(),
      videos: videos.value.slice(0, 60),
      channels: channels.value.slice(0, 24),
      playlists: playlists.value.slice(0, 24)
    }));
  } catch {}
}

function openQuickView(data: VideoItemData) {
  const row = videos.value.find((item) => item.videoId === data.videoId) || (data as Row);
  quickVideo.value = row;
  miniCollapsed.value = false;
}

function closeQuickView() {
  quickVideo.value = null;
  miniCollapsed.value = false;
}

function openQuickFull() {
  const row = quickVideo.value;
  if (!row?.videoId) return;

  const index = videos.value.findIndex((item) => item.videoId === row.videoId);
  const query: Record<string, string> = {
    feed: feedKey.value,
    shape: row.layout || (source.value === 'shorts' ? 'portrait' : 'landscape')
  };
  if (index >= 0) query.index = String(index);

  void router.push({ path: '/watch/' + row.videoId, query });
}

const heading = computed(() => {''',
        1
    )

# Browser/API requests should not be forced fresh every time. The UI cache renders
# immediately; this request refreshes in the background.
s = s.replace("  url.searchParams.set('_fresh', String(Date.now()));\n", "", 1)
s = s.replace("  const response = await fetch(url.toString(), { cache: 'no-store' });", "  const response = await fetch(url.toString(), { cache: 'default' });", 1)

# Persist successful results.
s = s.replace(
    "  videos.value = merged.slice(0, 48);",
    "  videos.value = merged.slice(0, 48);\n  writeHomeCache();",
    1
)
s = s.replace(
    "  }).filter(Boolean).slice(0, 24);",
    "  }).filter(Boolean).slice(0, 24);\n  writeHomeCache();",
    1
)
# second occurrence is playlists
idx = s.find("  }).filter(Boolean).slice(0, 24);", s.find("async function loadPlaylists"))
if idx >= 0:
    end = idx + len("  }).filter(Boolean).slice(0, 24);")
    s = s[:end] + "\n  writeHomeCache();" + s[end:]

# Load is silent: hydrate matching source/topic cache first, never blank the page.
s = s.replace(
    r'''async function load() {
  const current = ++serial;
  loading.value = true;
  videos.value = [];
  channels.value = [];
  playlists.value = [];''',
    r'''async function load() {
  const current = ++serial;
  loading.value = true;
  const restored = readHomeCache();

  if (!restored) {
    if (source.value === 'channels') {
      videos.value = [];
      playlists.value = [];
      channels.value = [];
    } else if (source.value === 'playlists') {
      videos.value = [];
      channels.value = [];
      playlists.value = [];
    } else {
      channels.value = [];
      playlists.value = [];
      videos.value = [];
    }
  }''',
    1
)

# Initial shell/cache immediately, then refresh. Automatic refresh is gentle and
# only when the page is visible.
s = re.sub(
    r'''onMounted(() => {
  void load();
  refreshTimer = window.setInterval(() => {
    if (source.value === 'latest') void load();
  }, 30000);
});''',
    r'''onMounted(() => {
  readHomeCache();
  void load();
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && source.value === 'latest') void load();
  }, 120000);
});''',
    s,
    count=1
)

# Source/topic changes: matching cache appears first, network refresh stays silent.
s = s.replace(
    "watch([source, topic], () => void load());",
    "watch([source, topic], () => { readHomeCache(); void load(); });",
    1
)

# Pinned area: visually one compact navigation surface, clearly separate from feed.
if "1988-home-v6" not in s:
    s = s.replace(
        "</style>",
        r'''
/* 1988-home-v6 */
.home-pinned {
  top: 0;
  margin: 0 -7px 0;
  padding: max(8px, env(safe-area-inset-top)) 7px 7px;
  border-bottom: 1px solid rgba(255,255,255,.055);
  background: rgba(31,31,32,.965);
  box-shadow: 0 10px 26px rgba(0,0,0,.10);
}

.home-pinned .search {
  height: 42px;
  border-radius: 12px;
}

.home-pinned .sources {
  padding: 9px 0 6px;
}

.home-pinned .topics {
  padding: 0;
}

.home-pinned .source {
  height: 29px;
  padding-inline: 11px;
}

.home-pinned .topic {
  height: 28px;
  padding-inline: 11px;
  background: #2b2b2e;
}

.heading {
  margin-top: 13px;
}

.home-mini {
  position: fixed;
  z-index: 75;
  right: 18px;
  bottom: max(18px, env(safe-area-inset-bottom));
  width: min(390px, calc(100vw - 28px));
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px;
  background: #171719;
  box-shadow: 0 20px 60px rgba(0,0,0,.48);
}

.mini-head {
  height: 39px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 7px 0 11px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(31,31,34,.98);
}

.mini-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: #e9e9eb;
  font: inherit;
  font-size: 11.5px;
  font-weight: 650;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mini-actions {
  display: flex;
  flex: 0 0 auto;
}

.mini-actions button {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #bdbdc2;
}

.mini-actions button:hover {
  background: #353539;
  color: #fff;
}

.mini-actions :deep(svg) {
  width: 16px;
  height: 16px;
}

.mini-video {
  aspect-ratio: 16 / 9;
  background: #000;
}

.mini-video :deep(.video-player) {
  width: 100%;
  height: 100%;
}

.home-mini.collapsed {
  width: min(310px, calc(100vw - 28px));
}

.home-mini.collapsed .mini-head {
  border-bottom: 0;
}

@media (max-width: 680px) {
  .home-pinned {
    margin-inline: -5px;
    padding-inline: 5px;
  }

  .home-pinned .search {
    height: 40px;
  }

  .home-mini {
    left: 8px;
    right: 8px;
    bottom: max(8px, env(safe-area-inset-bottom));
    width: auto;
    border-radius: 12px;
  }

  .home-mini.collapsed {
    left: auto;
    width: min(290px, calc(100vw - 16px));
  }
}
</style>''',
        1
    )

p.write_text(s)
"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
