// TikTok media resolver/normalizer.
// Purpose: translate TikTok's current player payloads and observed network requests
// into a small stable shape that the yt.taphoa.xyz UI can consume.

const MEDIA_HOST_RE = /(?:tiktokcdn|tiktokv|byteoversea|ibyteimg|muscdn|byteicdn|akamaized|bytecdn)/i;
const VIDEO_HINT_RE = /(?:\/video\/tos\/|video_mp4|mime_type=video|\.mp4(?:$|\?)|playwm|play_addr|playaddr|video_id=)/i;
const AUDIO_HINT_RE = /(?:mime_type=audio|\.m4a(?:$|\?)|\.aac(?:$|\?)|audio)/i;

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniq(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const value = asString(raw);
    if (!value || !/^https?:\/\//i.test(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function urlList(value) {
  if (!value) return [];
  if (typeof value === 'string') return uniq([value]);
  if (Array.isArray(value)) return uniq(value.flatMap(urlList));
  if (typeof value !== 'object') return [];

  const out = [];
  for (const key of [
    'UrlList','urlList','url_list','urls','url',
    'MainUrl','BackupUrl','FallbackUrl',
    'mainUrl','backupUrl','fallbackUrl',
  ]) {
    const v = value[key];
    if (v) out.push(...urlList(v));
  }
  return uniq(out);
}

function videoObjectCandidates(video) {
  if (!video || typeof video !== 'object') return { videoUrls: [], audioUrls: [], downloadUrls: [] };
  const videoUrls = [];
  const audioUrls = [];
  const downloadUrls = [];

  // Direct/current formats seen across TikTok web payload versions.
  for (const key of [
    'playAddr','play_addr','playUrl','play_url',
    'PlayAddrStruct','playAddrStruct',
    'downloadAddr','download_addr','downloadUrl','download_url',
    'DownloadAddr','DownloadAddrStruct',
  ]) {
    const vals = urlList(video[key]);
    if (/download/i.test(key)) downloadUrls.push(...vals);
    else videoUrls.push(...vals);
  }

  for (const item of video.bitrateInfo || video.bitrate_info || []) {
    videoUrls.push(...urlList(item?.PlayAddr || item?.playAddr || item?.play_addr || item));
  }

  for (const item of video.bitrateAudioInfo || video.bitrate_audio_info || []) {
    audioUrls.push(...urlList(item?.UrlList || item?.urlList || item?.url_list || item));
  }

  return {
    videoUrls: uniq(videoUrls),
    audioUrls: uniq(audioUrls),
    downloadUrls: uniq(downloadUrls),
  };
}

export function extractTikTokMediaFromPayload(payload, maxDepth = 11) {
  const videoUrls = [];
  const audioUrls = [];
  const downloadUrls = [];
  const seen = new Set();

  function walk(value, depth = 0, parentKey = '') {
    if (value == null || depth > maxDepth) return;

    if (typeof value === 'string') {
      const s = value.trim();
      if (/^https?:\/\//i.test(s)) {
        if (/download/i.test(parentKey)) downloadUrls.push(s);
        else if (/audio/i.test(parentKey) || AUDIO_HINT_RE.test(s)) audioUrls.push(s);
        else if (/play|video|url/i.test(parentKey) || VIDEO_HINT_RE.test(s)) videoUrls.push(s);
      }
      return;
    }

    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    const normalized = videoObjectCandidates(value.video || value);
    videoUrls.push(...normalized.videoUrls);
    audioUrls.push(...normalized.audioUrls);
    downloadUrls.push(...normalized.downloadUrls);

    if (Array.isArray(value)) {
      for (const child of value) walk(child, depth + 1, parentKey);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      walk(child, depth + 1, key);
    }
  }

  walk(payload);
  return {
    videoUrls: uniq(videoUrls),
    audioUrls: uniq(audioUrls),
    downloadUrls: uniq(downloadUrls),
  };
}

export function classifyObservedUrl(rawUrl, resourceType = '') {
  const url = asString(rawUrl);
  if (!/^https?:\/\//i.test(url)) return null;
  const type = String(resourceType || '').toLowerCase();

  if (type === 'media' || VIDEO_HINT_RE.test(url)) {
    if (AUDIO_HINT_RE.test(url) && !VIDEO_HINT_RE.test(url)) return { kind: 'audio', url };
    return { kind: 'video', url };
  }
  if (AUDIO_HINT_RE.test(url)) return { kind: 'audio', url };
  return null;
}

function scoreVideo(url, source = '') {
  let score = 0;
  if (MEDIA_HOST_RE.test(url)) score += 15;
  if (/\/video\/tos\//i.test(url)) score += 25;
  if (/video_mp4|mime_type=video_mp4/i.test(url)) score += 20;
  if (/\.mp4(?:$|\?)/i.test(url)) score += 15;
  if (/playwm/i.test(url)) score -= 25; // watermark variant is last resort.
  if (/download/i.test(source)) score += 35;
  if (/payload/i.test(source)) score += 12;
  if (/network/i.test(source)) score += 8;
  if (/^https:\/\//i.test(url)) score += 2;
  return score;
}

export function chooseBestTikTokMedia({ downloadUrls = [], videoUrls = [], networkVideoUrls = [], audioUrls = [] } = {}) {
  const rows = [
    ...uniq(downloadUrls).map(url => ({ url, source: 'download' })),
    ...uniq(videoUrls).map(url => ({ url, source: 'payload' })),
    ...uniq(networkVideoUrls).map(url => ({ url, source: 'network' })),
  ];

  rows.sort((a, b) => scoreVideo(b.url, b.source) - scoreVideo(a.url, a.source));

  return {
    bestVideoUrl: rows[0]?.url || '',
    bestSource: rows[0]?.source || '',
    candidates: rows,
    audioUrls: uniq(audioUrls),
  };
}
