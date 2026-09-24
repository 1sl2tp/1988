from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 mini v10: compact transport, time and progress while playback stays alive."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 mini v10: compact transport, time and progress while playback stays alive.

# Expose player transport + emit lightweight state for the collapsed mini controls.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

s = s.replace(
    """const emit = defineEmits<{
  (event: 'unavailable', payload: { id: string; code: number }): void;
}>();""",
    """const emit = defineEmits<{
  (event: 'unavailable', payload: { id: string; code: number }): void;
  (event: 'state', payload: { playing: boolean; currentTime: number; duration: number }): void;
}>();""",
    1
)

if "emit('state'" not in s:
    s = s.replace(
        """    muted.value = !!p.isMuted?.();
  } catch {}
}""",
        """    muted.value = !!p.isMuted?.();
    emit('state', {
      playing: playing.value,
      currentTime: currentTime.value,
      duration: duration.value
    });
  } catch {}
}""",
        1
    )

if "defineExpose({ togglePlay" not in s:
    s = s.replace(
        """function previewSeek(event: Event) {""",
        """defineExpose({
  togglePlay,
  play: () => {
    try { player.value?.playVideo?.(); } catch {}
  },
  pause: () => {
    try { player.value?.pauseVideo?.(); } catch {}
  }
});

function previewSeek(event: Event) {""",
        1
    )

p.write_text(s)


# App-level mini player: collapsed state becomes a real transport bar while the
# same hidden player keeps running in the background.
p = Path("src/App.vue")
s = p.read_text()

s = s.replace(
    """    <aside v-if="miniVideo && !isWatch" class="global-mini" :class="{ collapsed: miniCollapsed }">
      <header>
        <button class="mini-name" type="button" @click="miniCollapsed = false">{{ miniTitle }}</button>
        <div>
          <button type="button" :title="miniCollapsed ? 'Mở mini' : 'Thu nhỏ'" @click="miniCollapsed = !miniCollapsed">
            <Maximize2 v-if="miniCollapsed"/><Minimize2 v-else/>
          </button>
          <button type="button" title="Mở trang xem" @click="openMiniWatch"><ExternalLink/></button>
          <button type="button" title="Đóng" @click="closeMini"><X/></button>
        </div>
      </header>
      <div class="mini-player" :class="{ 'mini-hidden': miniCollapsed }"><VideoPlayer :video-id="miniVideo.videoId" @unavailable="handleMiniUnavailable"/></div>
    </aside>""",
    """    <aside v-if="miniVideo && !isWatch" class="global-mini" :class="{ collapsed: miniCollapsed }">
      <template v-if="miniCollapsed">
        <div class="mini-compact">
          <button class="mini-thumb" type="button" aria-label="Mở mini" @click="miniCollapsed = false">
            <img :src="miniThumbnail" :alt="miniTitle">
          </button>

          <button class="mini-compact-copy" type="button" @click="miniCollapsed = false">
            <strong>{{ miniTitle }}</strong>
            <small>{{ miniTimeText }}</small>
          </button>

          <button class="mini-transport" type="button" :aria-label="miniState.playing ? 'Tạm dừng' : 'Phát'" @click="toggleMiniPlayback">
            <Pause v-if="miniState.playing"/>
            <Play v-else/>
          </button>

          <button class="mini-icon" type="button" aria-label="Mở mini" title="Mở mini" @click="miniCollapsed = false">
            <Maximize2/>
          </button>

          <button class="mini-icon" type="button" aria-label="Đóng" title="Đóng" @click="closeMini">
            <X/>
          </button>

          <span class="mini-progress" aria-hidden="true">
            <i :style="{ width: miniProgress + '%' }"></i>
          </span>
        </div>
      </template>

      <template v-else>
        <header>
          <button class="mini-name" type="button">{{ miniTitle }}</button>
          <div>
            <button type="button" title="Thu nhỏ" aria-label="Thu nhỏ" @click="miniCollapsed = true"><Minimize2/></button>
            <button type="button" title="Mở trang xem" aria-label="Mở trang xem" @click="openMiniWatch"><ExternalLink/></button>
            <button type="button" title="Đóng" aria-label="Đóng" @click="closeMini"><X/></button>
          </div>
        </header>
      </template>

      <div class="mini-player" :class="{ 'mini-hidden': miniCollapsed }">
        <VideoPlayer
          ref="miniPlayerRef"
          :video-id="miniVideo.videoId"
          @state="onMiniState"
          @unavailable="handleMiniUnavailable"
        />
      </div>
    </aside>""",
    1
)

s = s.replace(
    """  Clapperboard, ExternalLink, Home, Library, Maximize2, Menu, Minimize2,
  Play, Radio, Search, Tv, UserRound, X""",
    """  Clapperboard, ExternalLink, Home, Library, Maximize2, Menu, Minimize2,
  Pause, Play, Radio, Search, Tv, UserRound, X""",
    1
)

if "const miniPlayerRef = ref<any>(null);" not in s:
    s = s.replace(
        """const miniVideo = ref<any>(null);
const miniCollapsed = ref(false);""",
        """const miniVideo = ref<any>(null);
const miniCollapsed = ref(false);
const miniPlayerRef = ref<any>(null);
const miniState = ref({ playing: false, currentTime: 0, duration: 0 });""",
        1
    )

if "const miniThumbnail = computed" not in s:
    s = s.replace(
        """const miniTitle = computed(() => String(miniVideo.value?.titleText || miniVideo.value?.title || 'Video'));""",
        """const miniTitle = computed(() => String(miniVideo.value?.titleText || miniVideo.value?.title || 'Video'));
const miniThumbnail = computed(() => {
  const direct = String(miniVideo.value?.thumbnail || '');
  if (direct) return direct;
  const id = String(miniVideo.value?.videoId || '');
  return id ? 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg' : '';
});
const miniProgress = computed(() => {
  const total = Math.max(0, Number(miniState.value.duration) || 0);
  const current = Math.max(0, Number(miniState.value.currentTime) || 0);
  return total > 0 ? Math.min(100, (current / total) * 100) : 0;
});
const miniTimeText = computed(() => {
  const current = formatMiniTime(miniState.value.currentTime);
  const total = formatMiniTime(miniState.value.duration);
  return miniState.value.duration > 0 ? current + ' / ' + total : current;
});""",
        1
    )

if "function formatMiniTime" not in s:
    s = s.replace(
        """function openMini(data: any) {""",
        """function formatMiniTime(value: number) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

function onMiniState(payload: { playing: boolean; currentTime: number; duration: number }) {
  miniState.value = {
    playing: !!payload?.playing,
    currentTime: Math.max(0, Number(payload?.currentTime) || 0),
    duration: Math.max(0, Number(payload?.duration) || 0)
  };
}

function toggleMiniPlayback() {
  miniPlayerRef.value?.togglePlay?.();
}

function openMini(data: any) {""",
        1
    )

s = s.replace(
    """function openMini(data: any) {
  if (!data?.videoId) return;
  miniVideo.value = data;
  miniCollapsed.value = false;
}""",
    """function openMini(data: any) {
  if (!data?.videoId) return;
  miniVideo.value = data;
  miniState.value = { playing: false, currentTime: 0, duration: 0 };
  miniCollapsed.value = false;
}""",
    1
)

s = s.replace(
    """function closeMini() {
  miniVideo.value = null;
  miniCollapsed.value = false;
}""",
    """function closeMini() {
  miniVideo.value = null;
  miniState.value = { playing: false, currentTime: 0, duration: 0 };
  miniCollapsed.value = false;
}""",
    1
)

s = s.replace(
    """function playInExistingMini(data: any) {
  if (!miniVideo.value || !data?.videoId) return false;
  const keepCollapsed = miniCollapsed.value;
  miniVideo.value = data;
  miniCollapsed.value = keepCollapsed;
  return true;
}""",
    """function playInExistingMini(data: any) {
  if (!miniVideo.value || !data?.videoId) return false;
  const keepCollapsed = miniCollapsed.value;
  miniVideo.value = data;
  miniState.value = { playing: false, currentTime: 0, duration: 0 };
  miniCollapsed.value = keepCollapsed;
  return true;
}""",
    1
)

if ".mini-compact {" not in s:
    s = s.replace(
        """.global-mini.collapsed { width:300px; }
.global-mini.collapsed header { border-bottom:0; }""",
        """.global-mini.collapsed {
  width: min(430px, calc(100vw - 30px));
  overflow: visible;
}

.mini-compact {
  position: relative;
  min-height: 58px;
  display: grid;
  grid-template-columns: 72px minmax(0,1fr) 38px 38px 38px;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  padding: 5px 5px 7px;
  border-radius: 10px;
  background: #181818;
}

.mini-thumb {
  width: 72px;
  height: 42px;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: #000;
}
.mini-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.mini-compact-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 0 5px;
  border: 0;
  background: transparent;
  color: #fff;
  text-align: left;
}
.mini-compact-copy strong {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mini-compact-copy small {
  color: #aaa;
  font-size: 10.5px;
  line-height: 1;
  white-space: nowrap;
}

.mini-transport,
.mini-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #fff;
}
.mini-transport:hover,
.mini-icon:hover {
  background: #303030;
}
.mini-transport :deep(svg),
.mini-icon :deep(svg) {
  width: 18px;
  height: 18px;
}
.mini-transport :deep(svg) {
  fill: currentColor;
}

.mini-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  overflow: hidden;
  background: rgba(255,255,255,.14);
}
.mini-progress i {
  display: block;
  width: 0;
  height: 100%;
  background: #f03;
  transition: width .18s linear;
}""",
        1
    )

# The hidden player must remain measurable enough for the YouTube iframe to keep
# advancing, but it stays visually invisible and non-interactive.
s = s.replace(
    """.mini-player.mini-hidden {
  position:absolute;
  left:0;
  bottom:0;
  width:1px;
  height:1px;
  min-width:1px;
  min-height:1px;
  aspect-ratio:auto;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
.mini-player.mini-hidden :deep(.video-player) {
  width:1px !important;
  height:1px !important;
  min-width:1px !important;
  min-height:1px !important;
}""",
    """.mini-player.mini-hidden {
  position: absolute;
  left: -10000px;
  bottom: 0;
  width: 320px;
  height: 180px;
  min-width: 320px;
  min-height: 180px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.mini-player.mini-hidden :deep(.video-player) {
  width: 320px !important;
  height: 180px !important;
  min-width: 320px !important;
  min-height: 180px !important;
}""",
    1
)

# Mobile: keep title and transport, hide only the time text if space is tight.
if "@media (max-width:520px)" not in s:
    s = s.replace(
        """  .global-mini.collapsed { left:auto; width:min(290px,calc(100vw - 16px)); }
}""",
        """  .global-mini.collapsed {
    left: 8px;
    right: 8px;
    width: auto;
  }
}

@media (max-width:520px) {
  .mini-compact {
    grid-template-columns: 58px minmax(0,1fr) 36px 36px 36px;
  }
  .mini-thumb {
    width: 58px;
    height: 34px;
  }
  .mini-compact-copy small {
    display: none;
  }
}""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
