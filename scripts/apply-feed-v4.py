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
    if (volume.value >