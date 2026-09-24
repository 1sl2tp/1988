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
        r''