from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()

sentinel = "# 1988 UX patch: compact controls + reliable autoplay + vertical swipe + priority topics."
marker = "# Keep attribution and a machine-readable build marker without changing the UI."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

injection = r"""
# 1988 UX patch: compact controls + reliable autoplay + vertical swipe + priority topics.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

# Keep all six controls on one row on normal phones. When time is hidden on
# very narrow phones, keep the remaining five controls on one row as well.
s = s.replace(
    "grid-template-columns: auto minmax(70px, 1fr) auto auto auto;",
    "grid-template-columns: auto minmax(66px, 1fr) auto auto auto auto;",
    1
)
s = s.replace(
    "grid-template-columns: auto minmax(65px, 1fr) auto auto;",
    "grid-template-columns: auto minmax(60px, 1fr) auto auto auto;",
    1
)

# iOS/Safari often rejects delayed unmuted autoplay after route navigation.
# Try normal autoplay first, then fall back to muted autoplay so a newly opened
# or vertically-swiped video actually starts instead of staying at 0:00.
if "function requestAutoplay1988" not in s:
    s = s.replace(
        "async function createPlayer() {",
        r'''let autoplayFallbackTimer: number | undefined;

function clearAutoplayFallback1988() {
  if (autoplayFallbackTimer !== undefined) {
    clearTimeout(autoplayFallbackTimer);
    autoplayFallbackTimer = undefined;
  }
}

function requestAutoplay1988(target: any) {
  if (!target) return;

  clearAutoplayFallback1988();
  try { target.playVideo?.(); } catch {}

  autoplayFallbackTimer = window.setTimeout(() => {
    if (playing.value) return;
    try {
      target.mute?.();
      muted.value = true;
      target.playVideo?.();
    } catch {}
  }, 420);
}

async function createPlayer() {''',
        1
    )

s = s.replace(
    r'''        startPolling();

        try {
          const promise = event.target.playVideo?.();
          void promise;
        } catch {}''',
    r'''        startPolling();
        requestAutoplay1988(event.target);''',
    1
)

s = s.replace(
    r'''    player.value.loadVideoById(id);
    forceCaptionsOff();''',
    r'''    player.value.loadVideoById(id);
    forceCaptionsOff();
    requestAutoplay1988(player.value);''',
    1
)

s = s.replace(
    r'''onBeforeUnmount(() => {
  stopPolling();''',
    r'''onBeforeUnmount(() => {
  clearAutoplayFallback1988();
  stopPolling();''',
    1
)

# Fullscreen API fallback for WebKit variants.
s = s.replace(
    r'''async function toggleFullscreen() {
  const el = wrapperRef.value;
  if (!el) return;

  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch {}
}''',
    r'''async function toggleFullscreen() {
  const el = wrapperRef.value as any;
  if (!el) return;

  try {
    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }

    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {}
}''',
    1
)

p.write_text(s)


p = Path("src/pages/WatchPage.vue")
s = p.read_text()

s = s.replace(
    '<main class="watch">',
    '<main class="watch" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">',
    1
)
s = s.replace(
    "import { useRoute } from 'vue-router';",
    "import { useRoute, useRouter } from 'vue-router';",
    1
)
s = s.replace(
    "const route = useRoute();\nconst videoId = computed(() => String(route.params.id || ''));",
    "const route = useRoute();\nconst router = useRouter();\nconst videoId = computed(() => String(route.params.id || ''));",
    1
)

if "function onTouchStart" not in s:
    s = s.replace(
        "async function load() {",
        r'''const swipeTrail = ref<string[]>([]);
let swipeIndex = -1;
let touchStartY = 0;
let touchStartX = 0;
let touchSwipeEnabled = false;

function seedSwipeTrail() {
  const id = videoId.value;
  if (!id) return;

  if (swipeIndex >= 0 && swipeTrail.value[swipeIndex] === id) return;

  const existing = swipeTrail.value.lastIndexOf(id);
  if (existing >= 0) {
    swipeIndex = existing;
    return;
  }

  swipeTrail.value = swipeTrail.value.slice(0, swipeIndex + 1);
  swipeTrail.value.push(id);
  swipeIndex = swipeTrail.value.length - 1;
}

function swipeNext() {
  const next = related.value.find((row: any) => row?.id && row.id !== videoId.value);
  if (!next?.id) return;

  swipeTrail.value = swipeTrail.value.slice(0, swipeIndex + 1);
  swipeTrail.value.push(next.id);
  swipeIndex = swipeTrail.value.length - 1;
  void router.replace('/watch/' + next.id);
}

function swipePrevious() {
  if (swipeIndex <= 0) return;
  swipeIndex -= 1;
  const previous = swipeTrail.value[swipeIndex];
  if (previous) void router.replace('/watch/' + previous);
}

function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches?.[0];
  const target = event.target as HTMLElement | null;

  touchSwipeEnabled = !!touch
    && !!target?.closest?.('.video-player')
    && !target?.closest?.('.controls');

  if (!touch || !touchSwipeEnabled) return;
  touchStartY = touch.clientY;
  touchStartX = touch.clientX;
}

function onTouchEnd(event: TouchEvent) {
  if (!touchSwipeEnabled) return;
  touchSwipeEnabled = false;

  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const dy = touch.clientY - touchStartY;
  const dx = touch.clientX - touchStartX;
  if (Math.abs(dy) < 56 || Math.abs(dy) < Math.abs(dx) * 1.2) return;

  if (dy < 0) swipeNext();
  else swipePrevious();
}

async function load() {''',
        1
    )

s = s.replace(
    r'''onMounted(() => {
  void load();''',
    r'''onMounted(() => {
  seedSwipeTrail();
  void load();''',
    1
)
s = s.replace(
    "watch(videoId, () => void load());",
    r'''watch(videoId, () => {
  seedSwipeTrail();
  void load();
});''',
    1
)

# Give the video area a full-height, swipe-friendly feel on mobile without
# turning the related list into a second competing scroll container.
s = s.replace(
    r'''@media (min-width: 900px) {''',
    r'''@media (max-width: 899px) {
  .watch {
    min-height: 100dvh;
  }

  .watch :deep(.video-player) {
    touch-action: pan-y;
  }
}

@media (min-width: 900px) {''',
    1
)

p.write_text(s)


p = Path("src/pages/HomePage.vue")
s = p.read_text()

topic_type = r'''type TopicId =
  | 'all' | 'thoi-su' | 'an-ninh' | 'tin-tuc' | 'cong-nghe' | 'giai-tri'
  | 'phim-ngan' | 'the-thao' | 'nhac-vang' | 'bolero' | 'tru-tinh'
  | 'dan-ca' | 'nhac-tre' | 'remix' | 'que-huong' | 'podcast'
  | 'khong-loi' | 'phim';'''

s = re.sub(
    r"type TopicId =[\s\S]*?;\n\ntype Row =",
    lambda _: topic_type + "\n\ntype Row =",
    s,
    count=1
)

topics_block = r'''const topics: Array<{ id: TopicId; label: string; query: string }> = [
  { id: 'all', label: 'Tất cả', query: 'Việt Nam' },
  { id: 'thoi-su', label: 'Thời sự', query: 'thời sự Việt Nam mới nhất VTV VTC' },
  { id: 'an-ninh', label: 'An ninh', query: 'an ninh trật tự Việt Nam ANTV mới nhất' },
  { id: 'tin-tuc', label: 'Tin tức', query: 'tin tức Việt Nam mới nhất' },
  { id: 'cong-nghe', label: 'Công nghệ', query: 'công nghệ Việt Nam mới nhất' },
  { id: 'giai-tri', label: 'Giải trí', query: 'giải trí Việt Nam mới nhất' },
  { id: 'phim-ngan', label: 'Phim ngắn', query: 'phim ngắn Việt Nam mới nhất' },
  { id: 'the-thao', label: 'Thể thao', query: 'thể thao Việt Nam mới nhất' },
  { id: 'nhac-vang', label: 'Nhạc vàng', query: 'nhạc vàng Việt Nam' },
  { id: 'bolero', label: 'Bolero', query: 'bolero Việt Nam' },
  { id: 'tru-tinh', label: 'Trữ tình', query: 'nhạc trữ tình Việt Nam' },
  { id: 'dan-ca', label: 'Dân ca', query: 'dân ca Việt Nam' },
  { id: 'nhac-tre', label: 'Nhạc trẻ', query: 'nhạc trẻ Việt Nam' },
  { id: 'remix', label: 'Remix', query: 'remix Việt Nam' },
  { id: 'que-huong', label: 'Quê hương', query: 'nhạc quê hương Việt Nam' },
  { id: 'podcast', label: 'Podcast', query: 'podcast Việt Nam' },
  { id: 'khong-loi', label: 'Không lời', query: 'nhạc không lời Việt Nam' },
  { id: 'phim', label: 'Phim', query: 'phim Việt Nam mới nhất' }
];'''

s = re.sub(
    r"const topics: Array<\{ id: TopicId; label: string; query: string \}> = \[[\s\S]*?\n\];",
    lambda _: topics_block,
    s,
    count=1
)

s = s.replace(
    r'''    'tin mới Việt Nam',
    'nhạc Việt mới',''',
    r'''    'tin mới Việt Nam',
    'thời sự Việt Nam mới nhất',
    'an ninh Việt Nam ANTV mới nhất',
    'công nghệ Việt Nam mới nhất',
    'giải trí Việt Nam mới nhất',
    'phim ngắn Việt Nam mới nhất',
    'nhạc Việt mới',''',
    1
)

p.write_text(s)
"""

target.write_text(text.replace(marker, injection + "\n" + marker, 1))
