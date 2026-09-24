from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 unavailable v9: hide known-bad videos and auto-skip playback errors."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 unavailable v9: hide known-bad videos and auto-skip playback errors.

# Player reports definitive YouTube unavailable/embed errors and remembers the ID.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

if "const emit = defineEmits" not in s:
    s = s.replace(
        "const props = defineProps<{ videoId: string }>();",
        """const props = defineProps<{ videoId: string }>();
const emit = defineEmits<{
  (event: 'unavailable', payload: { id: string; code: number }): void;
}>();""",
        1
    )

if "function markUnavailable1988" not in s:
    s = s.replace(
        "function syncPlayerState() {",
        """function markUnavailable1988(code: number) {
  // 2 = invalid id/parameter, 100 = removed/private,
  // 101/150 = owner disallows embedded playback.
  if (![2, 100, 101, 150].includes(code)) return;

  const id = String(props.videoId || '');
  if (!id) return;

  try {
    const raw = localStorage.getItem('1988:unavailable:v1');
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[id] = { at: Date.now(), code };
    localStorage.setItem('1988:unavailable:v1', JSON.stringify(parsed));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('1988:video-unavailable', {
      detail: { id, code }
    }));
  } catch {}

  emit('unavailable', { id, code });
}

function syncPlayerState() {""",
        1
    )

s = s.replace(
    """      onError: () => {
        playing.value = false;
      }""",
    """      onError: (event: any) => {
        playing.value = false;
        markUnavailable1988(Number(event?.data || 0));
      }""",
    1
)

p.write_text(s)


# Mini-player: if the replacement video is unavailable, remove it immediately.
p = Path("src/App.vue")
s = p.read_text()

s = s.replace(
    '<VideoPlayer :video-id="miniVideo.videoId"/>',
    '<VideoPlayer :video-id="miniVideo.videoId" @unavailable="handleMiniUnavailable"/>',
    1
)

if "function handleMiniUnavailable" not in s:
    s = s.replace(
        "function closeMini() {",
        """function handleMiniUnavailable(payload: { id: string }) {
  if (miniVideo.value?.videoId === payload?.id) closeMini();
}

function closeMini() {""",
        1
    )

p.write_text(s)


# Home feed: never render IDs already known unavailable, and remove them live.
p = Path("src/pages/HomePage.vue")
s = p.read_text()

if "function unavailableIds1988" not in s:
    s = s.replace(
        "function cacheKey() {",
        """function unavailableIds1988() {
  try {
    const raw = localStorage.getItem('1988:unavailable:v1');
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    return new Set(
      Object.entries(parsed)
        .filter(([, value]: any) => now - Number(value?.at || 0) < 30 * 24 * 60 * 60 * 1000)
        .map(([id]) => id)
    );
  } catch {
    return new Set<string>();
  }
}

function dropUnavailable1988(id: string) {
  if (!id) return;
  videos.value = videos.value.filter((row) => row.videoId !== id);
  saveCache();
  persistSwipeFeed(videos.value);
}

function cacheKey() {""",
        1
    )

s = s.replace(
    "videos.value = Array.isArray(data?.videos) ? data.videos : [];",
    "videos.value = (Array.isArray(data?.videos) ? data.videos : []).filter((row: any) => !unavailableIds1988().has(String(row?.videoId || '')));",
    1
)

s = s.replace(
    """function toVideo(row: any): Row | null {
  const id = videoId(row);
  if (!id) return null;""",
    """function toVideo(row: any): Row | null {
  const id = videoId(row);
  if (!id || unavailableIds1988().has(id)) return null;""",
    1
)

if "let unavailableHandler1988" not in s:
    s = s.replace(
        "let refreshTimer: number | undefined;",
        "let refreshTimer: number | undefined;\nlet unavailableHandler1988: ((event: Event) => void) | null = null;",
        1
    )

s = s.replace(
    """onMounted(() => {
  applyRouteAndRefresh();
  refreshTimer = window.setInterval(() => {""",
    """onMounted(() => {
  unavailableHandler1988 = (event: Event) => {
    const id = String((event as CustomEvent)?.detail?.id || '');
    dropUnavailable1988(id);
  };
  window.addEventListener('1988:video-unavailable', unavailableHandler1988);
  applyRouteAndRefresh();
  refreshTimer = window.setInterval(() => {""",
    1
)

s = s.replace(
    """onBeforeUnmount(() => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
});""",
    """onBeforeUnmount(() => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
  if (unavailableHandler1988) {
    window.removeEventListener('1988:video-unavailable', unavailableHandler1988);
  }
});""",
    1
)

p.write_text(s)


# Search results: same blacklist/removal behavior.
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

if "function unavailableIds1988" not in s:
    s = s.replace(
        "function setSource(value: SourceId) {",
        """function unavailableIds1988() {
  try {
    const raw = localStorage.getItem('1988:unavailable:v1');
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    return new Set(
      Object.entries(parsed)
        .filter(([, value]: any) => now - Number(value?.at || 0) < 30 * 24 * 60 * 60 * 1000)
        .map(([id]) => id)
    );
  } catch {
    return new Set<string>();
  }
}

function dropUnavailable1988(id: string) {
  if (!id) return;
  videos.value = videos.value.filter((row: any) => row.id !== id);
  persistFeed();
}

function setSource(value: SourceId) {""",
        1
    )

s = s.replace(
    """    const id = idFrom(row);
    if (!id || seen.has(id)) return null;""",
    """    const id = idFrom(row);
    if (!id || seen.has(id) || unavailableIds1988().has(id)) return null;""",
    1
)

if "let unavailableHandler1988" not in s:
    s = s.replace(
        "let timer: number | undefined;",
        "let timer: number | undefined;\nlet unavailableHandler1988: ((event: Event) => void) | null = null;",
        1
    )

s = s.replace(
    """onMounted(() => {
  syncSource();
  void run();""",
    """onMounted(() => {
  unavailableHandler1988 = (event: Event) => {
    const id = String((event as CustomEvent)?.detail?.id || '');
    dropUnavailable1988(id);
  };
  window.addEventListener('1988:video-unavailable', unavailableHandler1988);
  syncSource();
  void run();""",
    1
)

s = s.replace(
    """onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});""",
    """onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
  if (unavailableHandler1988) {
    window.removeEventListener('1988:video-unavailable', unavailableHandler1988);
  }
});""",
    1
)

p.write_text(s)


# Watch page: bad video is not shown as a dead screen; skip to the next item.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

s = s.replace(
    '<VideoPlayer :video-id="videoId" :class="playerClass"/>',
    '<VideoPlayer :video-id="videoId" :class="playerClass" @unavailable="onVideoUnavailable"/>',
    1
)

if "function onVideoUnavailable" not in s:
    s = s.replace(
        "function onTouchStart(event: TouchEvent) {",
        """function onVideoUnavailable(payload: { id: string }) {
  if (payload?.id !== videoId.value) return;
  window.setTimeout(() => {
    if (canNext.value) swipeNext();
    else if (canPrevious.value) swipePrevious();
    else goBack();
  }, 80);
}

function onTouchStart(event: TouchEvent) {""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
