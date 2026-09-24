from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 feed v4: preserve sound and swipe inside the originating source group."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 feed v4: preserve sound and swipe inside the originating source group.
import re

p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

autoplay_pattern = re.compile(
    r"let autoplayFallbackTimer: number \\| undefined;[\\s\\S]*?function requestAutoplay1988\\(target: any\\) \\{[\\s\\S]*?\\n\\}\\n\\nasync function createPlayer\\(\\) \\{",
    re.M
)
autoplay_replacement = r'''let autoplayFallbackTimer: number | undefined;
const AUDIO_PREF_KEY_1988 = '1988:audio-enabled';
const VOLUME_PREF_KEY_1988 = '1988:volume';

function wantsAudio1988() {
  try { return sessionStorage.getItem(AUDIO_PREF_KEY_1988) !== '0'; }
  catch { return true; }
}

function savedVolume1988() {
  try {
    const value = Number(sessionStorage.getItem(VOLUME_PREF_KEY_1988) || 100);
    return Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : 100;
  } catch {
    return 100;
  }
}

function rememberAudio1988(enabled: boolean, nextVolume = volume.value) {
  try {
    sessionStorage.setItem(AUDIO_PREF_KEY_1988, enabled ? '1' : '0');
    if (nextVolume > 0) sessionStorage.setItem(VOLUME_PREF_KEY_1988, String(Math.round(nextVolume)));
  } catch {}
}

function applyAudioPreference1988(target: any) {
  if (!target) return;
  const nextVolume = savedVolume1988();
  try { target.setVolume?.(nextVolume); } catch {}
  try {
    if (wantsAudio1988()) target.unMute?.();
    else target.mute?.();
  } catch {}
}

function clearAutoplayFallback1988() {
  if (autoplayFallbackTimer !== undefined) {
    clearTimeout(autoplayFallbackTimer);
    autoplayFallbackTimer = undefined;
  }
}

function requestAutoplay1988(target: any) {
  if (!target) return;

  clearAutoplayFallback1988();
  applyAudioPreference1988(target);
  try { target.playVideo?.(); } catch {}

  autoplayFallbackTimer = window.setTimeout(() => {
    let state = -1;
    try { state = Number(target.getPlayerState?.()); } catch {}

    if (state === 1 || playing.value) {
      if (wantsAudio1988()) {
        try {
          target.setVolume?.(savedVolume1988());
          target.unMute?.();
        } catch {}
      }
      return;
    }

    try {
      target.mute?.();
      target.playVideo?.();
    } catch {}
  }, 1100);
}

async function createPlayer() {'''
s, _ = autoplay_pattern.subn(autoplay_replacement, s, count=1)

toggle_pattern = re.compile(r"function toggleMute\\(\\) \\{[\\s\\S]*?\\n\\}\\n\\nfunction setVolumeFromInput", re.M)
toggle_replacement = r'''function toggleMute() {
  const p = player.value;
  if (!p || !ready.value) return;

  try {
    if (muted.value || volume.value === 0) {
      const nextVolume = volume.value === 0 ? savedVolume1988() : volume.value;
      p.setVolume?.(nextVolume);
      p.unMute?.();
      volume.value = nextVolume;
      muted.value = false;
      rememberAudio1988(true, nextVolume);
    } else {
      p.mute?.();
      muted.value = true;
      rememberAudio1988(false, volume.value);
    }
    syncPlayerState();
  } catch {}
}

function setVolumeFromInput'''
s, _ = toggle_pattern.subn(toggle_replacement, s, count=1)

s = s.replace(
    r'''  try {
    player.value?.setVolume?.(volume.value);
    if (volume.value > 0) player.value?.unMute?.();
    else player.value?.mute?.();
  } catch {}
  syncPlayerState();''',
    r'''  try {
    player.value?.setVolume?.(volume.value);
    if (volume.value > 0) {
      player.value?.unMute?.();
      muted.value = false;
      rememberAudio1988(true, volume.value);
    } else {
      player.value?.mute?.();
      muted.value = true;
      rememberAudio1988(false, savedVolume1988());
    }
  } catch {}
  syncPlayerState();''',
    1
)

s = s.replace(
    r'''      onStateChange: (event: any) => {
        playing.value = event.data === YT.PlayerState.PLAYING;
        syncPlayerState();
        forceCaptionsOff();
      },''',
    r'''      onStateChange: (event: any) => {
        playing.value = event.data === YT.PlayerState.PLAYING;
        if (playing.value && wantsAudio1988()) {
          try {
            event.target.setVolume?.(savedVolume1988());
            event.target.unMute?.();
          } catch {}
        }
        syncPlayerState();
        forceCaptionsOff();
      },''',
    1
)
p.write_text(s)

p = Path("src/components/GridVideoItem.vue")
s = p.read_text()
s = s.replace(
    "const props = defineProps<{ data: VideoItemData }>();",
    "const props = defineProps<{ data: VideoItemData; feedKey?: string; feedIndex?: number }>();",
    1
)
s = s.replace(
    r'''  return {
    path: `/watch/${props.data.videoId}`,
    query: shape ? { shape } : {}
  };''',
    r'''  const query: Record<string, string> = {};
  if (shape) query.shape = shape;
  if (props.feedKey) query.feed = props.feedKey;
  if (Number.isFinite(props.feedIndex)) query.index = String(props.feedIndex);
  return {
    path: `/watch/${props.data.videoId}`,
    query
  };''',
    1
)
p.write_text(s)

p = Path("src/pages/HomePage.vue")
s = p.read_text()
s = s.replace(
    '<GridVideoItem v-for="video in videos" :key="video.videoId" :data="video"/>',
    '<GridVideoItem v-for="(video, index) in videos" :key="video.videoId" :data="video" :feed-key="feedKey" :feed-index="index"/>',
    1
)
if "const feedKey = computed" not in s:
    s = s.replace(
        "const heading = computed(() => {",
        r'''const feedKey = computed(() => `home:${source.value}:${topic.value}`);
const feedLabel = computed(() => {
  const sourceLabel = sources.find((item) => item.id === source.value)?.label || 'Video';
  const topicLabel = topics.find((item) => item.id === topic.value)?.label || '';
  return topic.value === 'all' ? sourceLabel : `${sourceLabel} · ${topicLabel}`;
});

function persistHomeFeed(rows: Row[]) {
  const items = rows
    .map((row: any) => ({
      id: String(row?.videoId || ''),
      shape: String(row?.layout || (source.value === 'shorts' ? 'portrait' : 'landscape'))
    }))
    .filter((row: any) => /^[A-Za-z0-9_-]{11}$/.test(row.id));

  try {
    sessionStorage.setItem('1988:feed:' + feedKey.value, JSON.stringify({
      label: feedLabel.value,
      source: source.value,
      topic: topic.value,
      savedAt: Date.now(),
      items
    }));
  } catch {}
}

const heading = computed(() => {''',
        1
    )
s = s.replace(
    "  videos.value = merged.slice(0, 48);",
    "  persistHomeFeed(merged.slice(0, 120));\n  videos.value = merged.slice(0, 48);",
    1
)
p.write_text(s)

p = Path("src/pages/SearchPage.vue")
s = p.read_text()
s = s.replace(
    "import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';",
    "import { computed, nextNick, onBeforeUnmount, onMounted, ref, watch } from 'vue';",
    1
)
s = s.replace(
    'v-for="video in videos" :key="video.id" class="result" :to="\'/watch/\' + video.id"',
    'v-for="(video, index) in videos" :key="video.id" class="result" :to="{ path: \'/watch/\' + video.id, query: { feed: feedKey, index: String(index), shape: video.shape } }"',
    1
)
if "const feedKey = computed" not in s:
    s = s.replace(
        "let suggestTimer: number | undefined;",
        r'''let suggestTimer: number | undefi