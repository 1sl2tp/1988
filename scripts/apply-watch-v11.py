from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 watch v11: instant metadata, clean actions, proper arrows and minimize."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 watch v11: instant metadata, clean actions, proper arrows and minimize.

# ---- VideoPlayer: allow watch -> mini handoff to continue near the same second.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

s = s.replace(
    "const props = defineProps<{ videoId: string }>();",
    "const props = defineProps<{ videoId: string; startAt?: number }>();",
    1
)

s = s.replace(
    """      autoplay: 1,
      controls: 0,""",
    """      autoplay: 1,
      start: Math.max(0, Math.floor(Number(props.startAt || 0))),
      controls: 0,""",
    1
)

s = s.replace(
    "player.value.loadVideoById(id);",
    "player.value.loadVideoById({ videoId: id, startSeconds: Math.max(0, Math.floor(Number(props.startAt || 0))) });",
    1
)

p.write_text(s)


# ---- Parent mini receives the watch position.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace(
    ':video-id="miniVideo.videoId"\n          @state="onMiniState"',
    ':video-id="miniVideo.videoId"\n          :start-at="Number(miniVideo.startAt || 0)"\n          @state="onMiniState"',
    1
)
p.write_text(s)


# ---- Home queue stores enough metadata for the watch page to paint instantly.
p = Path("src/pages/HomePage.vue")
s = p.read_text()

s = s.replace(
    """      items: rows.map(row => ({
        id: row.videoId,
        shape: row.layout || (source.value === 'shorts' ? 'portrait' : 'landscape')
      }))""",
    """      items: rows.map(row => ({
        id: row.videoId,
        shape: row.layout || (source.value === 'shorts' ? 'portrait' : 'landscape'),
        title: String(row.titleText || row.title || ''),
        channel: String(row.metadata?.[0] || 'YouTube'),
        avatar: String(row.authorAvatar || ''),
        channelKey: String(row.channelKey || row.metadata?.[0] || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + row.videoId + '/hqdefault.jpg')),
        meta: [String(row.viewsText || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    1
)

# Home needs formatRelativeTime for the richer feed item.
s = s.replace(
    "import { formatCompactViews, numericViews, parsePublishedAt } from '@/utils/display1988';",
    "import { formatCompactViews, formatRelativeTime, numericViews, parsePublishedAt } from '@/utils/display1988';",
    1
)

p.write_text(s)


# ---- Search queue also carries instant title/channel/thumb metadata.
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

s = s.replace(
    """      channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',""",
    """      channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
      avatar: String(row?.uploaderAvatar || row?.avatar || ''),
      channelKey: channelKey(row),
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',""",
    1
)

s = s.replace(
    """      items: videos.value.map((row:any) => ({ id: row.id, shape: row.shape }))""",
    """      items: videos.value.map((row:any) => ({
        id: row.id,
        shape: row.shape,
        title: String(row.title || ''),
        channel: String(row.channel || 'YouTube'),
        avatar: String(row.avatar || ''),
        channelKey: String(row.channelKey || row.channel || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + row.id + '/hqdefault.jpg')),
        meta: [String(row.views || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    1
)

p.write_text(s)


# ---- Channel queue: same instant metadata, especially important when opening
# a music channel where detail endpoints can take longer than the player.
p = Path("src/pages/ChannelPage.vue")
s = p.read_text()

s = s.replace(
    """      items: videos.value.map((video: any) => ({
        id: video.id,
        shape: video.shape || 'landscape'
      }))""",
    """      items: videos.value.map((video: any) => ({
        id: video.id,
        shape: video.shape || 'landscape',
        title: String(video.title || ''),
        channel: String(channel.value?.name || 'YouTube'),
        avatar: String(channel.value?.avatar || ''),
        channelKey: String(route.params.id || channel.value?.name || ''),
        thumbnail: String(video.thumbnail || ('https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg')),
        meta: [String(video.views || ''), video.publishedAt ? age(video.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    1
)

p.write_text(s)


# ---- Watch page: new clean composition.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

# The feed item is now a real metadata object, not only id/shape.
s = s.replace(
    "type TrailItem = { id: string; shape: Shape };",
    """type TrailItem = {
  id: string;
  shape: Shape;
  title?: string;
  channel?: string;
  avatar?: string;
  channelKey?: string;
  thumbnail?: string;
  meta?: string;
};""",
    1
)

# Vue + icon imports.
s = s.replace(
    "import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';",
    "import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';",
    1
)
s = s.replace("  ChevronDown,\n  ChevronUp,", "  ArrowDown,\n  ArrowUp,", 1)
s = s.replace("  MoreHorizontal,\n  Share2,", "  Minimize2,\n  MoreHorizontal,\n  Share2,", 1)
s = s.replace("<ChevronUp/>", "<ArrowUp/>")
s = s.replace("<ChevronDown/>", "<ArrowDown/>")

# Player reports current second for minimize continuity.
s = s.replace(
    '<VideoPlayer :video-id="videoId" :class="playerClass" @unavailable="onVideoUnavailable"/>',
    """<VideoPlayer
              :video-id="videoId"
              :class="playerClass"
              @state="onWatchPlayerState"
              @unavailable="onVideoUnavailable"
            />""",
    1
)

# Remove the vertical share/avatar rail completely. Actions move under metadata.
s = re.sub(
    r'\n\s*<aside class="action-rail" aria-label="Thao tác video">[\s\S]*?</aside>\n',
    '\n',
    s,
    count=1
)

# Add compact actions below title.
meta_anchor = """            <h1 :class="{ placeholder: !details?.title }">{{ details?.title || 'Đang tải nội dung…' }}</h1>
          </section>"""
meta_replacement = """            <h1 :class="{ placeholder: !details?.title }">{{ details?.title || 'Đang tải nội dung…' }}</h1>

            <div class="meta-actions">
              <button type="button" @click="minimizeVideo"><Minimize2/><span>Thu nhỏ</span></button>
              <button type="button" @click="shareVideo"><Share2/><span>Chia sẻ</span></button>
              <button type="button" @click="menuOpen = !menuOpen"><MoreHorizontal/><span>Thêm</span></button>
            </div>
          </section>"""
s = s.replace(meta_anchor, meta_replacement, 1)

# Runtime refs for immediate details + minimize.
if "const openMini1988" not in s:
    s = s.replace(
        "const router = useRouter();",
        """const router = useRouter();
const openMini1988 = inject<((data: any) => void) | null>('1988OpenMini', null);""",
        1
    )

if "const watchPlayerState" not in s:
    s = s.replace(
        "const direction = ref<'next' | 'previous'>('next');",
        """const direction = ref<'next' | 'previous'>('next');
const watchPlayerState = ref({ playing: false, currentTime: 0, duration: 0 });""",
        1
    )

# Hydrate richer feed rows and paint title/channel/avatar before any network wait.
s = s.replace(
    """      .map((row: any) => ({
        id: String(row?.id || ''),
        shape: normalizeShape(row?.shape) || 'landscape'
      }))""",
    """      .map((row: any) => ({
        id: String(row?.id || ''),
        shape: normalizeShape(row?.shape) || 'landscape',
        title: String(row?.title || ''),
        channel: String(row?.channel || ''),
        avatar: String(row?.avatar || ''),
        channelKey: String(row?.channelKey || ''),
        thumbnail: String(row?.thumbnail || ''),
        meta: String(row?.meta || '')
      }))""",
    1
)

hydrate_tail = """    } else {
      feedIndex.value = feedItems.value.findIndex((row) => row.id === videoId.value);
    }
  } catch {}
}"""
hydrate_new = """    } else {
      feedIndex.value = feedItems.value.findIndex((row) => row.id === videoId.value);
    }

    const instant = feedItems.value[feedIndex.value];
    if (instant) {
      details.value = {
        title: instant.title || '',
        channel: instant.channel || 'YouTube',
        avatar: instant.avatar || '',
        channelKey: instant.channelKey || instant.channel || '',
        meta: instant.meta || '',
        thumbnail: instant.thumbnail || ('https://i.ytimg.com/vi/' + instant.id + '/hqdefault.jpg')
      };
      if (instant.title) document.title = instant.title;
    }
  } catch {}
}"""
s = s.replace(hydrate_tail, hydrate_new, 1)

# Preview cards use feed metadata instantly instead of waiting for relatedStreams.
s = s.replace(
    """          title: rel?.title || '',
          thumbnail: rel?.thumbnail || ('https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg')""",
    """          title: item.title || rel?.title || '',
          channel: item.channel || rel?.channel || '',
          thumbnail: item.thumbnail || rel?.thumbnail || ('https://i.ytimg.com/vi/' + item.id + '/hqdefault.jpg')""",
    1
)
s = s.replace(
    ".slice(feedIndex.value + 1, feedIndex.value + 8)",
    ".slice(feedIndex.value + 1, feedIndex.value + 6)",
    1
)
s = s.replace(
    "return related.value.slice(0, 7).map",
    "return related.value.slice(0, 5).map",
    1
)

# Do not deliberately blank title/channel while detail request is running.
s = s.replace(
    """  details.value = null;
  related.value = [];""",
    """  related.value = [];""",
    1
)

# Detail endpoint can enrich silently; do not defeat browser/edge caches every swipe.
s = s.replace("  url.searchParams.set('_fresh', String(Date.now()));\n", "", 1)
s = s.replace(
    "const response = await fetch(url.toString(), { cache: 'no-store' });",
    "const response = await fetch(url.toString(), { cache: 'default' });",
    1
)

# Save enriched detail back to the source-group queue for subsequent swipes.
if "function rememberCurrentDetails1988" not in s:
    s = s.replace(
        "function prefetchNext() {",
        """function rememberCurrentDetails1988(value: any) {
  if (!value || feedIndex.value < 0 || feedIndex.value >= feedItems.value.length) return;
  const item: any = feedItems.value[feedIndex.value];
  Object.assign(item, {
    title: String(value.title || item.title || ''),
    channel: String(value.channel || item.channel || ''),
    avatar: String(value.avatar || item.avatar || ''),
    channelKey: String(value.channelKey || item.channelKey || ''),
    thumbnail: String(value.thumbnail || item.thumbnail || ''),
    meta: String(value.meta || item.meta || '')
  });

  if (!feedKey.value) return;
  try {
    const key = '1988:feed:' + feedKey.value;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items) && parsed.items[feedIndex.value]) {
      parsed.items[feedIndex.value] = { ...parsed.items[feedIndex.value], ...item };
      sessionStorage.setItem(key, JSON.stringify(parsed));
    }
  } catch {}
}

function prefetchNext() {""",
        1
    )

details_assign = """    details.value = {
      title,
      channel: String(data?.uploader || data?.uploaderName || data?.author || 'YouTube'),
      avatar: String(data?.uploaderAvatar || data?.avatar || ''),
      channelKey: channelKey(data),
      meta: [viewText, uploaded ? age(uploaded) : ''].filter(Boolean).join(' · '),
      thumbnail: String(data?.thumbnailUrl || '')
    };"""
details_assign_new = details_assign + "
    rememberCurrentDetails1988(details.value);"
s = s.replace(details_assign, details_assign_new, 1)

# Minimize and player-state handlers.
if "function onWatchPlayerState" not in s:
    s = s.replace(
        "function onVideoUnavailable(payload: { id: string }) {",
        """function onWatchPlayerState(payload: { playing: boolean; currentTime: number; duration: number }) {
  watchPlayerState.value = {
    playing: !!payload?.playing,
    currentTime: Math.max(0, Number(payload?.currentTime) || 0),
    duration: Math.max(0, Number(payload?.duration) || 0)
  };
}

function minimizeVideo() {
  if (!openMini1988 || !videoId.value) return;

  openMini1988({
    videoId: videoId.value,
    title: details.value?.title || document.title || 'Video',
    titleText: details.value?.title || document.title || 'Video',
    thumbnail: details.value?.thumbnail || ('https://i.ytimg.com/vi/' + videoId.value + '/hqdefault.jpg'),
    authorAvatar: details.value?.avatar || '',
    metadata: [details.value?.channel || 'YouTube'],
    channelKey: details.value?.channelKey || '',
    layout: shape.value,
    startAt: watchPlayerState.value.currentTime
  });

  if (window.history.length > 1) router.back();
  else void router.push('/');
}

function onVideoUnavailable(payload: { id: string }) {""",
        1
    )

# No page/body scrollbar on watch; clean it up when leaving.
s = s.replace(
    """onMounted(() => {
  setShapeHint();""",
    """onMounted(() => {
  document.documentElement.classList.add('watch-open');
  document.body.classList.add('watch-open');
  setShapeHint();""",
    1
)
s = s.replace(
    """onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);""",
    """onBeforeUnmount(() => {
  document.documentElement.classList.remove('watch-open');
  document.body.classList.remove('watch-open');
  if (timer !== undefined) clearInterval(timer);""",
    1
)

# Final CSS overrides: consistent metadata, no vertical share rail, true arrows,
# fixed desktop recommendation row, no visible scrollbar.
if "1988-watch-v11" not in s:
    s = s.replace(
        "</style>",
        r"""
/* 1988-watch-v11 */
:global(html.watch-open),
:global(body.watch-open) {
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

.reel-page,
.reel-stage {
  overflow: hidden !important;
}

.action-rail {
  display: none !important;
}

.reel-meta {
  position: relative;
  width: min(1060px, calc(100% - 24px)) !important;
  margin: 10px auto 0 !important;
  padding: 0 !important;
  box-sizing: border-box;
}

.reel-meta .creator {
  min-height: 38px;
}

.reel-meta h1 {
  margin-top: 8px !important;
  margin-bottom: 0 !important;
  padding-right: 300px;
  line-height: 1.28 !important;
}

.meta-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.meta-actions button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 18px;
  background: #27272a;
  color: #f1f1f1;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
}

.meta-actions button:hover {
  background: #3a3a3e;
}

.meta-actions :deep(svg) {
  width: 17px;
  height: 17px;
}

.desktop-arrows {
  top: 50% !important;
  right: 18px !important;
  display: grid !important;
  gap: 10px !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  transform: translateY(-50%) !important;
}

.desktop-arrows button {
  width: 46px !important;
  height: 46px !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  border-radius: 50% !important;
  background: rgba(28,28,31,.92) !important;
  color: #fff !important;
  box-shadow: 0 6px 20px rgba(0,0,0,.24);
}

.desktop-arrows button:hover:not(:disabled) {
  background: #3a3a3e !important;
}

.desktop-arrows button:disabled {
  opacity: .18 !important;
}

.desktop-arrows :deep(svg) {
  width: 22px !important;
  height: 22px !important;
  stroke-width: 2.2;
}

@media (min-width: 900px) {
  .related-strip {
    width: min(1060px, calc(100% - 24px)) !important;
    max-width: none !important;
    margin: 13px auto 0 !important;
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    grid-auto-flow: row !important;
    grid-auto-columns: unset !important;
    gap: 9px !important;
    overflow: hidden !important;
    padding: 0 !important;
  }

  .related-mini {
    grid-template-rows: auto auto !important;
    gap: 6px !important;
  }

  .related-mini img {
    height: auto !important;
    aspect-ratio: 16 / 9;
    border-radius: 9px !important;
  }

  .related-mini span {
    min-height: 28px;
    -webkit-line-clamp: 2 !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
  }
}

@media (max-width: 899px) {
  .reel-meta {
    width: calc(100% - 24px) !important;
    margin-top: 10px !important;
  }

  .reel-meta h1 {
    padding-right: 0;
    margin-bottom: 44px !important;
  }

  .meta-actions {
    left: 0;
    right: auto;
    bottom: 0;
  }

  .meta-actions button {
    height: 34px;
    padding: 0 10px;
  }

  .desktop-arrows {
    display: none !important;
  }
}
</style>""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
