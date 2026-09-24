from pathlib import Path

path = Path("scripts/build-kira-proof.sh")
text = path.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 immersive reel v2: full-viewport swipe feed."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 immersive reel v2: full-viewport swipe feed.

# Player presentation variants used by the reel page. Portrait occupies a tall
# 9:16 stage; non-portrait keeps the title below the video.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()
if ".video-player.reel-portrait" not in s:
    s = s.replace(
        "</style>",
        r'''

.video-player.reel-portrait,
.video-player.reel-landscape,
.video-player.reel-square {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.video-player.reel-portrait .video-surface {
  width: min(100%, calc(100dvh * 9 / 16));
  max-width: 100%;
  height: min(100%, 100dvh);
  max-height: 100%;
  aspect-ratio: 9 / 16;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.video-player.reel-portrait .controls {
  position: absolute;
  z-index: 8;
  left: 50%;
  bottom: max(10px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100% - 18px), 620px);
  margin: 0;
  background: rgba(18,18,20,.78);
  border-color: rgba(255,255,255,.12);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.video-player.reel-landscape .video-surface {
  width: 100%;
  max-height: min(68dvh, 760px);
  aspect-ratio: 16 / 9;
}

.video-player.reel-square .video-surface {
  width: min(100%, 72dvh);
  max-height: 72dvh;
  aspect-ratio: 1 / 1;
}

@media (max-width: 680px) {
  .video-player.reel-landscape .video-surface {
    width: 100%;
    max-height: 55dvh;
    border-radius: 0;
  }

  .video-player.reel-square .video-surface {
    width: min(100%, 64dvh);
    max-height: 64dvh;
    border-radius: 0;
  }

  .video-player.reel-portrait .controls {
    width: calc(100% - 12px);
    bottom: max(7px, env(safe-area-inset-bottom));
  }
}
</style>''',
        1
    )
p.write_text(s)


# Carry a portrait hint from Shorts cards into the watch route.
p = Path("src/components/GridVideoItem.vue")
s = p.read_text()
s = s.replace(
    '<router-link class="grid-video-item" :to="`/watch/${data.videoId}`">',
    '<router-link class="grid-video-item" :to="watchTarget">',
    1
)
if "const watchTarget = computed" not in s:
    s = s.replace(
        "import { handleImageError, VideoItemData } from '@/utils/helpers';\n\ndefineProps<{ data: VideoItemData }>();",
        r'''import { computed } from 'vue';
import { handleImageError, VideoItemData } from '@/utils/helpers';

const props = defineProps<{ data: VideoItemData }>();
const watchTarget = computed(() => {
  const shape = String((props.data as any)?.layout || '');
  return {
    path: `/watch/${props.data.videoId}`,
    query: shape ? { shape } : {}
  };
});''',
        1
    )
p.write_text(s)


# Home rows: Shorts and obvious short-form URLs open as portrait reels.
p = Path("src/pages/HomePage.vue")
s = p.read_text()
if "const layout = source.value === 'shorts'" not in s:
    s = s.replace(
        r'''  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube');
  const viewsRaw = row?.views ?? row?.viewCount ?? row?.viewText ?? '';

  return {''',
        r'''  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube');
  const viewsRaw = row?.views ?? row?.viewCount ?? row?.viewText ?? '';
  const rawUrl = String(row?.url || row?.id || '');
  const rawTitle = String(row?.title || 'Video');
  const layout = source.value === 'shorts' || /\/shorts\//i.test(rawUrl) || /#shorts?\b/i.test(rawTitle)
    ? 'portrait'
    : 'landscape';

  return {''',
        1
    )
    s = s.replace(
        r'''    viewCount: numericViews(viewsRaw)
  };''',
        r'''    viewCount: numericViews(viewsRaw),
    layout
  };''',
        1
    )
p.write_text(s)


# Search Shorts also preserve the portrait hint.
p = Path("src/pages/SearchPage.vue")
s = p.read_text()
s = s.replace(
    ":to=\"'/watch/' + video.id\"",
    ":to=\"{ path: '/watch/' + video.id, query: video.shape ? { shape: video.shape } : {} }\"",
    1
)
if "shape: source.value === 'shorts'" not in s:
    s = s.replace(
        r'''      publishedAt: parsePublishedAt(published)
    };''',
        r'''      publishedAt: parsePublishedAt(published),
      shape: source.value === 'shorts' || /\/shorts\//i.test(String(row?.url || '')) || /#shorts?\b/i.test(String(row?.title || ''))
        ? 'portrait'
        : 'landscape'
    };''',
        1
    )
p.write_text(s)


# Full-viewport watch page: one video per screen, TikTok/Reels-style vertical
# navigation. Touch swipes on mobile; desktop supports wheel, keyboard and arrows.
p = Path("src/pages/WatchPage.vue")
p.write_text(r'''<template>
  <main
    class="reel-page"
    :class="'shape-' + shape"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
    @wheel.passive="onWheel"
  >
    <Transition :name="transitionName" mode="out-in">
      <section :key="videoId" class="reel-stage">
        <button class="back-btn" type="button" aria-label="Quay lại" @click="goBack">
          <ArrowLeft/>
        </button>

        <div class="reel-content">
          <div class="reel-media">
            <VideoPlayer :video-id="videoId" :class="playerClass"/>
          </div>

          <section v-if="details" class="reel-meta">
            <router-link
              v-if="details.channelKey"
              class="creator"
              :to="'/channel/' + encodeURIComponent(details.channelKey)"
            >
              <img v-if="details.avatar" :src="details.avatar" :alt="details.channel">
              <span v-else class="avatar"><UserRound/></span>
              <span class="creator-copy">
                <strong>{{ details.channel }}</strong>
                <small v-if="details.meta">{{ details.meta }}</small>
              </span>
            </router-link>
            <h1>{{ details.title }}</h1>
          </section>
        </div>

        <aside class="action-rail" aria-label="Thao tác video">
          <router-link
            v-if="details?.channelKey"
            class="rail-avatar"
            :to="'/channel/' + encodeURIComponent(details.channelKey)"
            aria-label="Mở kênh"
          >
            <img v-if="details.avatar" :src="details.avatar" :alt="details.channel">
            <UserRound v-else/>
          </router-link>

          <button type="button" @click="shareVideo">
            <Share2/>
            <span>Chia sẻ</span>
          </button>

          <button type="button" @click="menuOpen = !menuOpen">
            <MoreHorizontal/>
            <span>Thêm</span>
          </button>
        </aside>

        <nav class="desktop-arrows" aria-label="Chuyển video">
          <button type="button" :disabled="!canPrevious" aria-label="Video trước" @click="swipePrevious">
            <ChevronUp/>
          </button>
          <button type="button" :disabled="!canNext" aria-label="Video tiếp theo" @click="swipeNext">
            <ChevronDown/>
          </button>
        </nav>

        <div v-if="menuOpen" class="menu-backdrop" @click.self="menuOpen = false">
          <div class="reel-menu" role="dialog" aria-modal="true" aria-label="Tùy chọn video">
            <button type="button" @click="copyLink"><Link2/><span>Sao chép liên kết</span></button>
            <router-link v-if="details?.channelKey" :to="'/channel/' + encodeURIComponent(details.channelKey)" @click="menuOpen = false">
              <UserRound/><span>Mở kênh</span>
            </router-link>
            <button type="button" @click="goHome"><House/><span>Trang chủ</span></button>
          </div>
        </div>

        <div v-if="toast" class="toast">{{ toast }}</div>
      </section>
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  House,
  Link2,
  MoreHorizontal,
  Share2,
  UserRound
} from '@lucide/vue';
import VideoPlayer from '@/components/VideoPlayer.vue';
import { formatCompactViews, formatRelativeTime, parsePublishedAt } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();
const router = useRouter();
const videoId = computed(() => String(route.params.id || ''));

type Shape = 'portrait' | 'square' | 'landscape';
type TrailItem = { id: string; shape: Shape };

const details = ref<any>(null);
const related = ref<any[]>([]);
const shape = ref<Shape>('landscape');
const menuOpen = ref(false);
const tick = ref(Date.now());
const toast = ref('');
const direction = ref<'next' | 'previous'>('next');
const transitionName = computed(() => direction.value === 'next' ? 'reel-next' : 'reel-prev');
const playerClass = computed(() => `reel-${shape.value}`);

let timer: number | undefined;
let toastTimer: number | undefined;
let loadSerial = 0;
let touchStartY = 0;
let touchStartX = 0;
let touchEnabled = false;
let wheelLockedUntil = 0;
const trail = ref<TrailItem[]>([]);
let trailIndex = -1;

const canPrevious = computed(() => trailIndex > 0);
const canNext = computed(() => related.value.some((row: any) => row?.id && row.id !== videoId.value));

function normalizeShape(value: unknown): Shape | '' {
  const raw = String(value || '').toLowerCase();
  return raw === 'portrait' || raw === 'square' || raw === 'landscape' ? raw : '';
}

function guessedShape(row: any): Shape {
  const raw = String(row?.url || row?.id || '');
  const title = String(row?.title || '');
  const total = Math.max(0, Number(row?.duration) || 0);
  if (/\/shorts\//i.test(raw) || /#shorts?\b/i.test(title)) return 'portrait';
  if (total && total <= 70 && /short|dọc|vertical/i.test(title)) return 'portrait';
  return 'landscape';
}

function relatedId(row: any) {
  const raw = String(row?.videoId || row?.url || row?.id || '');
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})|\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m?.[1] || m?.[2] || m?.[3] || '';
}

function channelKey(data: any) {
  const raw = String(data?.uploaderUrl || data?.channelUrl || '');
  return raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1]
    || raw.match(/\/(@[^/?#]+)/)?.[1]
    || String(data?.uploader || data?.uploaderName || data?.author || '');
}

function duration(value: any) {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

function age(ts: number) {
  void tick.value;
  return ts ? formatRelativeTime(ts) : '';
}

function setShapeHint(value?: unknown) {
  const hint = normalizeShape(value ?? route.query.shape);
  if (hint) shape.value = hint;
}

function detectThumbnailShape(url: string, serial: number) {
  if (!url || normalizeShape(route.query.shape)) return;
  const img = new Image();
  img.onload = () => {
    if (serial !== loadSerial || !img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    if (ratio < .82) shape.value = 'portrait';
    else if (ratio < 1.18) shape.value = 'square';
    else shape.value = 'landscape';
  };
  img.src = url;
}

function seedTrail() {
  const id = videoId.value;
  if (!id) return;
  const currentShape = normalizeShape(route.query.shape) || shape.value || 'landscape';

  if (trailIndex >= 0 && trail.value[trailIndex]?.id === id) {
    trail.value[trailIndex].shape = currentShape;
    return;
  }

  const existing = trail.value.findIndex((row) => row.id === id);
  if (existing >= 0) {
    trailIndex = existing;
    return;
  }

  trail.value = trail.value.slice(0, trailIndex + 1);
  trail.value.push({ id, shape: currentShape });
  trailIndex = trail.value.length - 1;
}

async function navigateTo(item: TrailItem, nextDirection: 'next' | 'previous') {
  if (!item?.id || item.id === videoId.value) return;
  direction.value = nextDirection;
  menuOpen.value = false;
  await router.replace({ path: '/watch/' + item.id, query: { shape: item.shape } });
}

function swipeNext() {
  const next = related.value.find((row: any) => row?.id && row.id !== videoId.value);
  if (!next?.id) return;
  const item: TrailItem = { id: next.id, shape: next.shape || 'landscape' };
  trail.value = trail.value.slice(0, trailIndex + 1);
  trail.value.push(item);
  trailIndex = trail.value.length - 1;
  void navigateTo(item, 'next');
}

function swipePrevious() {
  if (trailIndex <= 0) return;
  trailIndex -= 1;
  const previous = trail.value[trailIndex];
  if (previous) void navigateTo(previous, 'previous');
}

function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches?.[0];
  const target = event.target as HTMLElement | null;
  touchEnabled = !!touch && !target?.closest?.('.controls, .action-rail, .desktop-arrows, .reel-menu, .back-btn');
  if (!touch || !touchEnabled) return;
  touchStartY = touch.clientY;
  touchStartX = touch.clientX;
}

function onTouchEnd(event: TouchEvent) {
  if (!touchEnabled) return;
  touchEnabled = false;
  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.15) return;

  if (dy < 0) swipeNext();
  else swipePrevious();
}

function onWheel(event: WheelEvent) {
  if (window.innerWidth < 900) return;
  if (Math.abs(event.deltaY) < 35 || Date.now() < wheelLockedUntil) return;
  wheelLockedUntil = Date.now() + 620;
  if (event.deltaY > 0) swipeNext();
  else swipePrevious();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'PageDown') {
    event.preventDefault();
    swipeNext();
  } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
    event.preventDefault();
    swipePrevious();
  } else if (event.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false;
  }
}

function showToast(message: string) {
  toast.value = message;
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ''; }, 1600);
}

async function shareVideo() {
  const url = window.location.href;
  const title = details.value?.title || '1988';
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showToast('Đã sao chép liên kết');
  } catch {}
}

async function copyLink() {
  menuOpen.value = false;
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Đã sao chép liên kết');
  } catch {}
}

function goHome() {
  menuOpen.value = false;
  void router.push('/');
}

function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push('/');
}

function prefetchNext() {
  const next = related.value.find((row: any) => row?.id && row.id !== videoId.value);
  if (!next?.id) return;
  try {
    const thumb = new Image();
    thumb.src = next.thumbnail;
    const url = new URL(API);
    url.searchParams.set('action', 'video');
    url.searchParams.set('id', next.id);
    void fetch(url.toString(), { cache: 'force-cache' }).catch(() => {});
  } catch {}
}

async function load() {
  const serial = ++loadSerial;
  details.value = null;
  related.value = [];
  menuOpen.value = false;
  shape.value = normalizeShape(route.query.shape) || 'landscape';

  const url = new URL(API);
  url.searchParams.set('action', 'video');
  url.searchParams.set('id', videoId.value);
  url.searchParams.set('_fresh', String(Date.now()));

  try {
    const response = await fetch(url.toString(), { cache: 'no-store' });
    const payload = await response.json();
    if (serial !== loadSerial || !response.ok || payload?.ok === false) return;

    const data = payload?.data || {};
    const title = String(data?.title || '');
    const uploaded = parsePublishedAt(data?.uploadDate ?? data?.uploaded ?? data?.published ?? '');
    const viewText = formatCompactViews(data?.views ?? data?.viewCount ?? '');
    document.title = title || '1988';

    details.value = {
      title,
      channel: String(data?.uploader || data?.uploaderName || data?.author || 'YouTube'),
      avatar: String(data?.uploaderAvatar || data?.avatar || ''),
      channelKey: channelKey(data),
      meta: [viewText, uploaded ? age(uploaded) : ''].filter(Boolean).join(' · '),
      thumbnail: String(data?.thumbnailUrl || '')
    };

    if (!normalizeShape(route.query.shape)) {
      const inferred = guessedShape({ url: data?.url || '', title, duration: data?.duration || 0 });
      if (inferred === 'portrait') shape.value = inferred;
      detectThumbnailShape(String(data?.thumbnailUrl || ''), serial);
    }

    const seen = new Set<string>();
    related.value = (Array.isArray(data?.relatedStreams) ? data.relatedStreams : [])
      .map((row: any) => {
        const id = relatedId(row);
        if (!id || id === videoId.value || seen.has(id)) return null;
        seen.add(id);
        const published = row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
          row?.publishedAt ?? row?.published ?? row?.publishedText ?? '';
        return {
          id,
          title: String(row?.title || 'Video'),
          channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
          thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
          duration: duration(row?.duration),
          views: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
          publishedAt: parsePublishedAt(published),
          shape: guessedShape(row)
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, 32);

    seedTrail();
    await nextTick();
    prefetchNext();
  } catch {}
}

onMounted(() => {
  setShapeHint();
  seedTrail();
  void load();
  timer = window.setInterval(() => { tick.value = Date.now(); }, 1000);
  window.addEventListener('keydown', onKeydown, { passive: false });
});

onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  window.removeEventListener('keydown', onKeydown);
});

watch(videoId, () => {
  setShapeHint();
  seedTrail();
  void load();
});

watch(() => route.query.shape, (value) => setShapeHint(value));
</script>

<style scoped>
.reel-page {
  position: fixed;
  inset: 0;
  z-index: 80;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  overscroll-behavior: none;
  background: #050505;
  color: #f5f5f5;
  touch-action: pan-y;
}

.reel-stage {
  position: relative;
  width: 100%;
  height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 45%, rgba(255,255,255,.035), transparent 38%), #050505;
}

.reel-content {
  width: min(1120px, calc(100vw - 170px));
  height: min(100dvh, 920px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.reel-media {
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reel-media :deep(.video-player) {
  width: 100%;
  min-height: 0;
}

.shape-portrait .reel-content {
  width: min(100vw, 620px);
  height: 100dvh;
}

.shape-portrait .reel-media {
  height: 100%;
}

.reel-meta {
  width: 100%;
  max-width: 980px;
  padding: 13px 6px 0;
  box-sizing: border-box;
}

.reel-meta h1 {
  margin: 9px 0 0;
  color: #f4f4f5;
  font-size: clamp(16px, 1.7vw, 22px);
  line-height: 1.3;
  font-weight: 680;
  letter-spacing: -.01em;
}

.creator {
  width: fit-content;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #ededf0;
  text-decoration: none;
}

.creator img,
.avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  object-fit: cover;
  background: #27272a;
}

.avatar {
  display: grid;
  place-items: center;
}

.creator-copy {
  min-width: 0;
}

.creator-copy strong,
.creator-copy small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.creator-copy strong {
  font-size: 13px;
  font-weight: 700;
}

.creator-copy small {
  margin-top: 2px;
  color: #8f8f96;
  font-size: 11px;
}

.shape-portrait .reel-meta {
  position: absolute;
  z-index: 6;
  left: 16px;
  right: 86px;
  bottom: max(78px, calc(env(safe-area-inset-bottom) + 68px));
  width: auto;
  max-width: none;
  padding: 0;
  pointer-events: none;
  text-shadow: 0 1px 14px rgba(0,0,0,.72);
}

.shape-portrait .reel-meta .creator,
.shape-portrait .reel-meta h1 {
  pointer-events: auto;
}

.shape-portrait .reel-meta h1 {
  max-width: 560px;
  font-size: 15px;
  line-height: 1.34;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.action-rail {
  position: absolute;
  z-index: 12;
  right: max(18px, calc((100vw - 1320px) / 2));
  bottom: 92px;
  display: grid;
  gap: 15px;
  justify-items: center;
}

.action-rail button,
.rail-avatar {
  width: 50px;
  min-height: 50px;
  display: grid;
  place-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(31,31,34,.82);
  color: #f5f5f5;
  text-decoration: none;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
}

.action-rail button {
  border-radius: 14px;
}

.action-rail :deep(svg) {
  width: 21px;
  height: 21px;
}

.action-rail span {
  font-size: 9px;
  line-height: 1;
}

.rail-avatar {
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.16);
}

.rail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.desktop-arrows {
  position: absolute;
  z-index: 13;
  top: 50%;
  right: 20px;
  display: grid;
  gap: 12px;
  transform: translateY(-50%);
}

.desktop-arrows button,
.back-btn {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%;
  background: rgba(27,27,30,.84);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.desktop-arrows button:disabled {
  opacity: .28;
  cursor: default;
}

.desktop-arrows :deep(svg),
.back-btn :deep(svg) {
  width: 23px;
  height: 23px;
}

.back-btn {
  position: absolute;
  z-index: 14;
  top: max(14px, env(safe-area-inset-top));
  left: 18px;
}

.menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(0,0,0,.35);
}

.reel-menu {
  position: absolute;
  right: max(18px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  width: min(300px, calc(100vw - 28px));
  display: grid;
  gap: 4px;
  padding: 7px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 16px;
  background: rgba(30,30,33,.96);
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.reel-menu button,
.reel-menu a {
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 12px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #f2f2f3;
  text-decoration: