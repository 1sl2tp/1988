from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 TikTok v21: native TikTok tabs from browser-rendered TikTok feeds."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 TikTok v21: native TikTok tabs from browser-rendered TikTok feeds.

p = Path("src/pages/TikTokPage.vue")
p.write_text(r"""<template>
  <div class="tt-page">
    <section class="tt-shelf">
      <div class="tt-tabs">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          :class="{ active: mode === item.id, live: item.id === 'live' }"
          @click="setMode(item.id)"
        >
          {{ item.label }}
        </button>
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
              <template v-if="item.live && item.viewCount">
                {{ formatViews(item.viewCount) }} đang xem
              </template>
              <template v-else-if="item.timestamp">
                {{ age(item.timestamp) }}
              </template>
            </small>
          </div>

          <button
            v-if="item.handle && !item.live"
            class="tt-follow"
            type="button"
            :class="{ followed: isFollowing(item.handle) }"
            @click.stop="toggleFollow(item.handle)"
          >
            {{ isFollowing(item.handle) ? '✓' : '+' }}
          </button>
        </div>
      </article>

      <div v-if="loading && !items.length" class="tt-loading">
        <span></span><span></span><span></span>
      </div>

      <div v-else-if="!items.length" class="tt-empty">
        <template v-if="mode === 'following' && !followedHandles.length">
          <strong>Chưa theo dõi tài khoản TikTok nào trong 1988.</strong>
          <small>Mở Đề xuất hoặc Khám phá rồi bấm dấu + cạnh video để thêm vào Đã follow.</small>
        </template>
        <template v-else>
          <strong>{{ emptyTitle }}</strong>
          <small>{{ errorText || 'Kéo lại hoặc chuyển tab để thử nguồn TikTok khác.' }}</small>
          <button type="button" @click="load">Thử lại</button>
        </template>
      </div>
    </section>

    <nav v-if="items.length" class="tt-arrows" aria-label="Chuyển video">
      <button type="button" :disabled="activeIndex <= 0" @click="move(-1)"><ArrowUp/></button>
      <button type="button" :disabled="activeIndex >= items.length - 1" @click="move(1)"><ArrowDown/></button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import TikTokPlayer from '@/components/TikTokPlayer.vue';
import TikTokLivePlayer from '@/components/TikTokLivePlayer.vue';
import { formatRelativeTime } from '@/utils/display1988';

const BACKEND = 'https://one988-tiktok-browser.onrender.com';
const FOLLOW_KEY = '1988:tiktok-following:v1';

const route = useRoute();
const router = useRouter();
const feedEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const items = ref<any[]>([]);
const activeIndex = ref(0);
const tick = ref(Date.now());
const errorText = ref('');
const followedHandles = ref<string[]>(readFollowing());

let loadSerial = 0;
let tickTimer: number | undefined;

type Mode = 'recommend' | 'explore' | 'following' | 'live';

const modes: Array<{ id: Mode; label: string }> = [
  { id: 'recommend', label: 'Đề xuất' },
  { id: 'explore', label: 'Khám phá' },
  { id: 'following', label: 'Đã follow' },
  { id: 'live', label: 'LIVE' }
];

const mode = ref<Mode>('recommend');

const emptyTitle = computed(() => {
  if (mode.value === 'live') return 'Chưa thấy LIVE phù hợp.';
  if (mode.value === 'following') return 'Chưa có video mới từ các tài khoản đã follow.';
  return 'TikTok chưa trả video.';
});

function readFollowing() {
  try {
    const value = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');
    return Array.isArray(value)
      ? value.map((item: any) => String(item || '').replace(/^@/, '')).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveFollowing() {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(followedHandles.value));
  } catch {}
}

function isFollowing(handle: string) {
  const key = String(handle || '').replace(/^@/, '').toLowerCase();
  return followedHandles.value.some(item => item.toLowerCase() === key);
}

function toggleFollow(handle: string) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) return;

  if (isFollowing(clean)) {
    followedHandles.value = followedHandles.value.filter(
      item => item.toLowerCase() !== clean.toLowerCase()
    );
  } else {
    followedHandles.value = [clean, ...followedHandles.value].slice(0, 60);
  }

  saveFollowing();

  if (mode.value === 'following') {
    void load();
  }
}

function syncRoute() {
  const wanted = String(route.query.mode || 'recommend') as Mode;
  mode.value = modes.some(item => item.id === wanted) ? wanted : 'recommend';
}

function setMode(value: Mode) {
  if (mode.value === value) return;
  void router.replace({
    path: '/tiktok',
    query: value === 'recommend' ? {} : { mode: value }
  });
}

function formatViews(value: unknown) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) {
    return (n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tr';
  }
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
  errorText.value = '';
  activeIndex.value = 0;

  if (mode.value === 'following' && !followedHandles.value.length) {
    items.value = [];
    loading.value = false;
    return;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 55000);

  try {
    const url = new URL(BACKEND + '/feed');
    url.searchParams.set('mode', mode.value);
    url.searchParams.set('limit', mode.value === 'following' ? '50' : '70');

    if (mode.value === 'following') {
      url.searchParams.set('handles', followedHandles.value.join(','));
    }

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: controller.signal
    });

    const payload = await response.json();
    if (current !== loadSerial) return;

    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || 'TikTok feed failed'));
    }

    const raw = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const seen = new Set<string>();

    items.value = raw.filter((item: any) => {
      const id = String(item?.id || '');
      const handle = String(item?.handle || '');
      const key = item?.live ? 'live:' + handle : id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    requestAnimationFrame(() => {
      feedEl.value?.scrollTo({ top: 0, behavior: 'auto' });
    });
  } catch (error: any) {
    if (current === loadSerial) {
      items.value = [];
      errorText.value = error?.name === 'AbortError'
        ? 'TikTok tải quá lâu.'
        : String(error?.message || 'Không lấy được TikTok.');
    }
  } finally {
    window.clearTimeout(timeout);
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

  const next = Math.max(
    0,
    Math.min(items.value.length - 1, activeIndex.value + delta)
  );

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
  tickTimer = window.setInterval(() => {
    tick.value = Date.now();
  }, 30000);
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
  z-index: 30;
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 7px 14px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(15,15,15,.985);
}

.tt-tabs {
  display: flex;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tt-tabs::-webkit-scrollbar { display: none; }

.tt-tabs button {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #272727;
  color: #ddd;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.tt-tabs button.active {
  background: #f1f1f1;
  color: #0f0f0f;
}

.tt-tabs button.live {
  color: #ff6676;
}
.tt-tabs button.live.active {
  background: #ff2d45;
  color: #fff;
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
  color: #777;
  font-size: 24px;
  font-weight: 800;
}

.tt-caption {
  position: absolute;
  z-index: 6;
  left: 14px;
  right: 72px;
  bottom: 18px;
  pointer-events: none;
  text-shadow: 0 2px 10px rgba(0,0,0,.9);
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

.tt-follow {
  position: absolute;
  z-index: 8;
  right: 16px;
  bottom: 84px;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,.25);
  border-radius: 50%;
  background: rgba(24,24,24,.82);
  color: #fff;
  font-size: 23px;
  font-weight: 700;
  backdrop-filter: blur(10px);
}
.tt-follow.followed {
  background: #fff;
  color: #111;
  font-size: 15px;
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
.tt-arrows button:disabled {
  opacity: .18;
}

.tt-loading,
.tt-empty {
  min-height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  padding: 24px;
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
  color: #bdbdbd;
  font-size: 13px;
}
.tt-empty small {
  max-width: 410px;
  color: #777;
  font-size: 10.5px;
  line-height: 1.45;
}
.tt-empty button {
  height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 8px;
  background: #272727;
  color: #fff;
  font-size: 11.5px;
  font-weight: 650;
}

@media (max-width: 760px) {
  .tt-page {
    height: calc(100dvh - var(--yt-header-h) - 52px - env(safe-area-inset-bottom));
  }

  .tt-shelf {
    min-height: 44px;
    padding: 6px 8px;
  }

  .tt-tabs {
    width: 100%;
    justify-content: center;
    gap: 5px;
  }

  .tt-tabs button {
    height: 30px;
    padding-inline: 10px;
    font-size: 11.5px;
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
