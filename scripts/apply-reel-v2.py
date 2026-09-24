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
  if (!id