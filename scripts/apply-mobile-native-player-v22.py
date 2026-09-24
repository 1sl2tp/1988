from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 mobile native player v22: no iframe, iOS/PWA first."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 mobile native player v22: no iframe, iOS/PWA first.
# Final override: production must not fall back to the temporary YouTube iframe.
p = Path("src/components/VideoPlayer.vue")
p.write_text(r"""<style scoped>
.video-player {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  background: #000;
}

.native-video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #000;
}

.sound-gate {
  position: absolute;
  left: 12px;
  bottom: 54px;
  z-index: 3;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255,255,255,.26);
  border-radius: 18px;
  background: rgba(15,15,15,.88);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
}

.error-card {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 20px;
  background: #000;
  color: #ddd;
  text-align: center;
}

.error-card button {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid #555;
  border-radius: 19px;
  background: #222;
  color: #fff;
  font: inherit;
}

@media (max-width: 640px) {
  .video-player { border-radius: 0; }
  .sound-gate { left: 9px; bottom: 48px; }
}
</style>

<template>
  <div class="video-player">
    <video
      ref="videoRef"
      class="native-video"
      controls
      autoplay
      playsinline
      webkit-playsinline
      preload="auto"
      controlslist="nodownload noremoteplayback"
      disablepictureinpicture="false"
      :poster="poster"
      @loadedmetadata="onLoadedMetadata"
      @canplay="onCanPlay"
      @playing="onPlaying"
      @pause="onPause"
      @timeupdate="emitState"
      @durationchange="emitState"
      @error="onMediaError"
    />

    <button
      v-if="mutedAutoplay && playing"
      class="sound-gate"
      type="button"
      @click="enableSound"
    >
      Bật tiếng
    </button>

    <div v-if="failed" class="error-card">
      <span>Không mở được video từ nguồn hiện tại.</span>
      <button type="button" @click="reload">Thử lại</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const MEDIA_BASE = 'https://one988-media.onrender.com';
const EDGE_MEDIA = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

const props = defineProps<{ videoId: string; startAt?: number }>();
const emit = defineEmits<{
  (event: 'state', payload: { playing: boolean; currentTime: number; duration: number }): void;
  (event: 'unavailable', payload: { id: string }): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const sourceIndex = ref(0);
const playing = ref(false);
const mutedAutoplay = ref(false);
const failed = ref(false);
let loadSerial = 0;
let startAppliedFor = '';

const poster = computed(() =>
  props.videoId ? 'https://i.ytimg.com/vi/' + props.videoId + '/hqdefault.jpg' : ''
);

function sourceUrls(id: string) {
  const render = new URL('/video', MEDIA_BASE);
  render.searchParams.set('id', id);

  const edge = new URL(EDGE_MEDIA);
  edge.searchParams.set('action', 'media');
  edge.searchParams.set('id', id);
  edge.searchParams.set('kind', 'video');

  return [render.toString(), edge.toString()];
}

function emitState() {
  const video = videoRef.value;
  emit('state', {
    playing: !!video && !video.paused && !video.ended,
    currentTime: Math.max(0, Number(video?.currentTime) || 0),
    duration: Math.max(0, Number(video?.duration) || 0)
  });
}

async function requestPlay(serial: number) {
  const video = videoRef.value;
  if (!video || serial !== loadSerial || failed.value) return;

  try {
    video.muted = false;
    mutedAutoplay.value = false;
    await video.play();
  } catch (error) {
    if (serial !== loadSerial) return;
    const name = String((error as any)?.name || '');

    // iOS/PWA may reject unmuted autoplay after a route transition.
    // Keep the video moving immediately and let one tap restore sound.
    if (name === 'NotAllowedError') {
      try {
        video.muted = true;
        mutedAutoplay.value = true;
        await video.play();
      } catch {}
    }
  }
}

function attachCurrentSource(serial: number) {
  const video = videoRef.value;
  if (!video || serial !== loadSerial || !props.videoId) return;

  const sources = sourceUrls(props.videoId);
  const src = sources[sourceIndex.value];
  if (!src) {
    failed.value = true;
    playing.value = false;
    emit('unavailable', { id: props.videoId });
    emitState();
    return;
  }

  failed.value = false;
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.src = src;
  video.load();

  // Invoke play in the same task as source attachment. On mobile this gives
  // Safari the earliest possible playback request instead of waiting for
  // metadata/API calls first.
  void requestPlay(serial);
}

async function load(id: string) {
  const serial = ++loadSerial;
  sourceIndex.value = 0;
  failed.value = false;
  playing.value = false;
  mutedAutoplay.value = false;
  startAppliedFor = '';

  await nextTick();
  if (serial !== loadSerial || id !== props.videoId) return;
  attachCurrentSource(serial);
}

function onLoadedMetadata() {
  const video = videoRef.value;
  if (!video || !props.videoId) return;

  if (startAppliedFor !== props.videoId) {
    const start = Math.max(0, Number(props.startAt || 0));
    if (start > 0 && Number.isFinite(video.duration) && start < video.duration) {
      try { video.currentTime = start; } catch {}
    }
    startAppliedFor = props.videoId;
  }

  emitState();
}

function onCanPlay() {
  void requestPlay(loadSerial);
}

function onPlaying() {
  playing.value = true;
  failed.value = false;
  emitState();
}

function onPause() {
  playing.value = false;
  emitState();
}

function onMediaError() {
  const video = videoRef.value;
  if (!video || !props.videoId) return;

  const sources = sourceUrls(props.videoId);
  if (sourceIndex.value + 1 < sources.length) {
    sourceIndex.value += 1;
    attachCurrentSource(loadSerial);
    return;
  }

  failed.value = true;
  playing.value = false;
  emit('unavailable', { id: props.videoId });
  emitState();
}

function enableSound() {
  const video = videoRef.value;
  if (!video) return;

  video.muted = false;
  if (video.volume === 0) video.volume = 1;
  mutedAutoplay.value = false;
  void video.play().catch(() => {});
}

function reload() {
  if (!props.videoId) return;
  void load(props.videoId);
}

watch(() => props.videoId, (id) => {
  if (id) void load(id);
});

onMounted(() => {
  if (props.videoId) void load(props.videoId);
});

onBeforeUnmount(() => {
  loadSerial += 1;
  const video = videoRef.value;
  if (!video) return;
  try { video.pause(); } catch {}
  video.removeAttribute('src');
  try { video.load(); } catch {}
});
</script>
""")
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
