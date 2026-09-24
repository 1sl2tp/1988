from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 TikTok v19: compact ranking modes, dynamic sources and LIVE feed."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 TikTok v19: compact ranking modes, dynamic sources and LIVE feed.

p = Path("src/components/TikTokLivePlayer.vue")
p.write_text(r"""<template>
  <div class="tt-live-player">
    <video
      v-if="streamUrl && !failed"
      ref="videoEl"
      :src="streamUrl"
      autoplay
      playsinline
      controls
      @loadedmetadata="tryPlay"
      @error="failed = true"
    ></video>

    <iframe
      v-else
      :src="liveUrl"
      title="TikTok LIVE"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  handle: string;
  streamUrl?: string;
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
const failed = ref(false);
const liveUrl = computed(() =>
  'https://www.tiktok.com/@' + encodeURIComponent(String(props.handle || '').replace(/^@/, '')) + '/live'
);

async function tryPlay() {
  try {
    await videoEl.value?.play();
  } catch {}
}

watch(() => props.streamUrl, async () => {
  failed.value = false;
  await nextTick();
  void tryPlay();
});
</script>

<style scoped>
.tt-live-player,
.tt-live-player video,
.tt-live-player iframe {
  width: 100%;
  height: 100%;
}
.tt-live-player {
  background: #000;
}
.tt-live-player video,
.tt-live-player iframe {
  display: block;
  border: 0;
  object-fit: contain;
  background: #000;
}
</style>
""")

p = Path("src/pages/TikTokPage.vue")
p.write_text(r"""<template>
  <div class="tt-page">
    <section class="tt-shelf">
      <div class="tt-mode-scroll">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          class="tt-chip"
          :class="{ active: mode === item.id, live: item.id === 'live' }"
          @click="setMode(item.id)"
        >
          {{ item.label }}
        </button>

        <button
          type="button"
          class="tt-source-button"
          :class="{ open: sourceOpen }"
          @click="sourceOpen = !sourceOpen"
        >
          Nguồn · {{ sources.length }}
        </button>
      </div>

      <div v-if="sourceOpen" class="tt-source-popover">
        <strong>Nguồn TikTok đang dùng</strong>
        <p>Tự phát hiện từ TikTok/web theo các video và LIVE Việt Nam đang xuất hiện; không cố định danh sách kênh trong giao diện.</p>
        <div>
          <span v-for="source in sources.slice(0, 24)" :key="source">@{{ source }}</span>
        </div>
      </div>
    </section>

    <section ref="feedEl" class="tt-feed" @scroll.passive="onScroll">
      <article
        v-for="(item,index) in items"
        :key="item.id + ':' + (item.handle || '')"
        class="tt-slide"
      >
        <div class="tt-stage">
          <TikTokLivePlayer
            v-if="item.live && index === activeIndex"
            :handle="item.handle"
            :stream-url="item.streamUrl"
          />

          <TikTokPlayer
            v-else-if="!item.live && index === activeIndex"
            :post-id="item.id"
            @unavailable="dropUnavailable"
          />

          <img
            v-else-if="item.thumbnail"
            class="tt-poster"
            :src="item.thumbnail"
            :alt="item.title || item.uploader || item.handle"
            loading="eager"
          >

          <div v-else class="tt-placeholder">
            <span v-if="item.live">LIVE</span>
            <span v-else>TikTok</span>
          </div>

          <div class="tt-caption">
            <div class="tt-author">
              <span v-if="item.live" class="tt-live-badge">LIVE</span>
              <strong>@{{ item.handle || item.uploader || 'tiktok' }}</strong>
            </div>
            <p v-if="item.title">{{ item.title }}</p>
            <small>
              <template v-if="item.live && item.viewCount">{{ formatViews(item.viewCount) }} đang xem</template>
              <template v-else>{{ age(item.timestamp) }}</template>
            </small>
          </div>
        </div>
      </article>

      <div v-if="loading && !items.length" class="tt-loading">
        <span></span><span></span><span></span>
      </div>

      <div v-if="!loading && !items.length" class="tt-empty">
        <strong>{{ mode === 'live' ? 'Chưa phát hiện LIVE phù hợp.' : 'Chưa lấy được video TikTok mới.' }}</strong>
        <small v-if="mode === 'live'">TikTok LIVE thay đổi liên tục; hệ thống sẽ kiểm tra lại khi bạn mở mục này.</small>
      </div>
    </section>

    <nav v-if="items.length" class="tt-arrows" aria-label="Chuyển video">
      <button type="button" :disabled="activeIndex <= 0" @click="move(-1)"><ArrowUp/></button>
      <button type="button" :disabled="activeIndex >= items.length - 1" @click="move(1)"><ArrowDown/></button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import TikTokPlayer from '@/components/TikTokPlayer.vue';
import TikTokLivePlayer from '@/components/TikTokLivePlayer.vue';
import { formatRelativeTime } from '@/utils/display1988';

const BACKEND = 'https://one988-media.onrender.com';
const route = useRoute();
const router = useRouter();
const feedEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const items = ref<any[]>([]);
const sources = ref<string[]>([]);
const activeIndex = ref(0);
const sourceOpen = ref(false);
const tick = ref(Date.now());
let loadSerial = 0;
let tickTimer: number | undefined;

type Mode = 'latest' | 'top' | 'trending' | 'interest' | 'views' | 'live';

const modes: Array<{ id: Mode; label: string }> = [
  { id: 'latest', label: 'Mới nhất' },
  { id: 'top', label: 'Top' },
  { id: 'trending', label: 'Xu hướng' },
  { id: 'interest', label: 'Quan tâm' },
  { id: 'views', label: 'Xem nhiều' },
  { id: 'live', label: 'Đang LIVE' }
];

const mode = ref<Mode>('latest');

function syncRoute() {
  const wanted = String(route.query.mode || 'latest') as Mode;
  mode.value = modes.some(item => item.id === wanted) ? wanted : 'latest';
}

function setMode(value: Mode) {
  if (mode.value === value) return;
  sourceOpen.value = false;
  void router.replace({
    path: '/tiktok',
    query: value === 'latest' ? {} : { mode: value }
  });
}

function formatViews(value: unknown) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tr';
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('vi-VN') + ' N';
  return n.toLocaleString('vi-VN');
}

function age(ts: number) {
  void tick.value;
  return ts ? formatRelativeTime(Number(ts) * 1000) : '';
}

async function load() {
  const current = ++loadSerial;
  loading.value = true;
  activeIndex.value = 0;

  try {
    const url = new URL(
      mode.value === 'live'
        ? BACKEND + '/tiktok/live'
        : BACKEND + '/tiktok/discover'
    );

    if (mode.value === 'live') {
      url.searchParams.set('limit', '30');
    } else {
      url.searchParams.set('mode', mode.value);
      url.searchParams.set('limit', '70');
    }

    const response = await fetch(url.toString(), { cache: 'no-store' });
    const payload = await response.json();
    if (current !== loadSerial) return;

    const raw = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const seen = new Set<string>();

    items.value = raw.filter((item: any) => {
      const key = String(item?.id || '') + ':' + String(item?.handle || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sourceRows = Array.isArray(payload?.data?.sources)
      ? payload.data.sources
      : items.value.map((item: any) => item?.handle).filter(Boolean);

    sources.value = Array.from(new Set<string>(
      sourceRows
        .map((value: any) => String(value || '').trim().replace(/^@/, ''))
        .filter((value: string) => Boolean(value))
    ));

    await new Promise(resolve => requestAnimationFrame(resolve));
    feedEl.value?.scrollTo({ top: 0, behavior: 'auto' });
  } catch {
    if (current === loadSerial) {
      items.value = [];
      sources.value = [];
    }
  } finally {
    if (current === loadSerial) loading.value = false;
  }
}

function onScroll() {
  const el = feedEl.value;
  if (!el || !el.clientHeight) return;
  const index = Math.round(el.scrollTop / el.clientHeight);
  activeIndex.value = Math.max(0, Math.min(items.value.length - 1, index));
}

function move(delta: number) {
  const el = feedEl.value;
  if (!el) return;
  const next = Math.max(0, Math.min(items.value.length - 1, activeIndex.value + delta));
  activeIndex.value = next;
  el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' });
}

function dropUnavailable(payload: { id: string }) {
  const id = String(payload?.id || '');
  const index = items.value.findIndex((item: any) => String(item.id) === id);
  if (index < 0) return;
  items.value.splice(index, 1);
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, items.value.length - 1));
}

onMounted(() => {
  syncRoute();
  void load();
  tickTimer = window.setInterval(() => { tick.value = Date.now(); }, 30000);
});

onBeforeUnmount(() => {
  if (tickTimer !== undefined) clearInterval(tickTimer);
});

watch(() => route.query.mode, () => {
  syncRoute();
  void load();
});
</script>

<style scoped>
.tt-page {
  height: calc(100dvh - var(--yt-header-h));
  min-height: 520px;
  display: grid;
  grid-template-rows: auto minmax(0,1fr);
  overflow: hidden;
  background: #000;
}

.tt-shelf {
  position: relative;
  z-index: 30;
  min-height: 50px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(15,15,15,.985);
}

.tt-mode-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tt-mode-scroll::-webkit-scrollbar { display: none; }

.tt-chip,
.tt-source-button {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #272727;
  color: #f1f1f1;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.tt-chip.active {
  background: #f1f1f1;
  color: #0f0f0f;
}
.tt-chip.live {
  color: #ff6a76;
}
.tt-chip.live.active {
  background: #ff2d45;
  color: #fff;
}
.tt-source-button {
  margin-left: auto;
  border: 1px solid rgba(255,255,255,.1);
  background: #181818;
  color: #aaa;
}
.tt-source-button.open,
.tt-source-button:hover {
  background: #303030;
  color: #fff;
}

.tt-source-popover {
  position: absolute;
  z-index: 60;
  top: 48px;
  right: 16px;
  width: min(420px, calc(100vw - 32px));
  max-height: min(450px, 70vh);
  overflow-y: auto;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  background: #202020;
  box-shadow: 0 16px 46px rgba(0,0,0,.48);
}
.tt-source-popover strong {
  display: block;
  font-size: 13px;
}
.tt-source-popover p {
  margin: 5px 0 12px;
  color: #999;
  font-size: 11px;
  line-height: 1.45;
}
.tt-source-popover > div {
  display: grid;
  gap: 2px;
}
.tt-source-popover span {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 7px;
  color: #ddd;
  font-size: 11.5px;
}
.tt-source-popover span:hover {
  background: #2b2b2b;
}

.tt-feed {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
  background: #000;
}
.tt-feed::-webkit-scrollbar { display: none; }

.tt-slide {
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: grid;
  place-items: center;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  background: #000;
}

.tt-stage {
  position: relative;
  width: min(520px, 100%);
  height: 100%;
  overflow: hidden;
  background: #000;
}

.tt-poster {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #000;
}

.tt-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: #080808;
  color: #888;
  font-size: 26px;
  font-weight: 800;
}

.tt-caption {
  position: absolute;
  z-index: 6;
  left: 14px;
  right: 64px;
  bottom: 18px;
  pointer-events: none;
  text-shadow: 0 2px 10px rgba(0,0,0,.8);
}
.tt-author {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tt-author strong {
  font-size: 13px;
}
.tt-live-badge {
  padding: 3px 6px;
  border-radius: 5px;
  background: #ff2d45;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
}
.tt-caption p {
  max-width: 100%;
  margin: 7px 0 4px;
  overflow: hidden;
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.tt-caption small {
  color: #d0d0d0;
  font-size: 10px;
}

.tt-arrows {
  position: fixed;
  z-index: 40;
  right: 18px;
  top: 50%;
  display: grid;
  gap: 10px;
  transform: translateY(-50%);
}
.tt-arrows button {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 50%;
  background: rgba(28,28,31,.92);
  color: #fff;
}
.tt-arrows button:disabled { opacity: .18; }

.tt-loading,
.tt-empty {
  min-height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: #888;
  text-align: center;
}
.tt-loading {
  grid-auto-flow: column;
}
.tt-loading span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
}
.tt-empty strong {
  color: #aaa;
  font-size: 13px;
}
.tt-empty small {
  max-width: 360px;
  font-size: 10px;
  line-height: 1.4;
}

@media (max-width: 760px) {
  .tt-page {
    height: calc(100dvh - var(--yt-header-h) - 52px - env(safe-area-inset-bottom));
  }
  .tt-shelf {
    min-height: 46px;
    padding: 7px 9px;
  }
  .tt-mode-scroll {
    gap: 6px;
  }
  .tt-chip,
  .tt-source-button {
    height: 30px;
    padding-inline: 11px;
    font-size: 11.5px;
  }
  .tt-source-button {
    margin-left: 0;
  }
  .tt-source-popover {
    top: 44px;
    right: 8px;
    width: calc(100vw - 16px);
  }
  .tt-stage {
    width: 100%;
  }
  .tt-arrows {
    display: none;
  }
}
</style>
""")
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
