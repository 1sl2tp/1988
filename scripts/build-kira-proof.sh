#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PIN="7a41cdc541cc80235a88314383b29a4a4ea712d1"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Fetching Kira @ $PIN"
git clone --quiet https://github.com/LuanRT/kira.git "$WORK/kira"
git -C "$WORK/kira" checkout --quiet "$PIN"

cd "$WORK/kira"

python3 - <<'PY'
from pathlib import Path
import re

PROXY = "https://kira-proxy-1988-us.onrender.com"

# Vite base path.
p = Path("vite.config.ts")
s = p.read_text()
s = s.replace("export default defineConfig({", "export default defineConfig({\n  base: '/kira-proof/',", 1)
p.write_text(s)

# Hash history keeps the exact Kira UI while making GitHub Pages deep links reliable.
p = Path("src/router.ts")
s = p.read_text()
s = s.replace("createRouter, createWebHistory", "createRouter, createWebHashHistory")
s = s.replace("history: createWebHistory(),", "history: createWebHashHistory('/kira-proof/'),")
p.write_text(s)

# Keep Kira UI/player intact, but create the same local anonymous
# InnerTube session shape that already proved search works on this project:
# visitorData + a cold PoToken from Kira's own BotGuard service.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace(
    "import { Innertube, Platform, UniversalCache, YTNodes, Types } from 'youtubei.js/web';",
    "import { Innertube, Platform, ProtoUtils, UniversalCache, Utils, YTNodes, Types } from 'youtubei.js/web';"
)
old = """    const instance = await Innertube.create({
      cache: new UniversalCache(true),
      fetch: fetchFunction
    });"""
new = """    const visitorData = ProtoUtils.encodeVisitorData(
      Utils.generateRandomString(11),
      Math.floor(Date.now() / 1000)
    );
    const coldStartToken = botguardService.mintColdStartToken(visitorData);

    const instance = await Innertube.create({
      cache: new UniversalCache(true),
      fetch: fetchFunction,
      generate_session_locally: true,
      enable_session_cache: false,
      visitor_data: visitorData,
      po_token: coldStartToken,
      lang: 'vi',
      location: 'VN',
      timezone: 'Asia/Ho_Chi_Minh'
    });"""
if old not in s:
    raise SystemExit("Kira Innertube init block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# Search stays native-first, but falls back to the already deployed 1988
# discovery API when Kira/YouTube parser changes return an empty result.
p = Path("src/App.vue")
s = p.read_text()
old = r"""const performSearch = async () => {
  if (!searchQuery.value.length) {
    searchResults.value = [];
    return;
  }

  isLoading.value = true;

  try {
    const innertube = await getInnertube();
    if (!innertube) return;

    const search = await innertube.actions.execute('/search', { query: searchQuery.value, parse: true });

    if (!search.contents_memo) {
      searchResults.value = [];
      return;
    }

    const results = search.contents_memo?.getType(YTNodes.Video, YTNodes.CompactVideo);

    if (results) {
      searchResults.value = results.map((result) => ({
        id: result.video_id,
        title: result.title.toString(),
        channel: result.author?.name || 'Unknown',
        thumbnail: result.thumbnails[0].url,
        duration: result.duration?.text || null,
        views: result.view_count?.text || null
      }));
      highlightedIndex.value = searchResults.value.length > 0 ? 0 : -1;
    } else {
      searchResults.value = [];
    }
  } catch (error) {
    console.error('[App]', 'Search failed', error);
    searchResults.value = [];
  } finally {
    isLoading.value = false;
  }
};"""
new = r"""const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

function fallbackVideoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const re of [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
    /([A-Za-z0-9_-]{11})$/
  ]) {
    const match = raw.match(re);
    if (match?.[1]) return match[1];
  }
  return '';
}

function fallbackDuration(value: any): string | null {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return null;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

const SEARCH_CACHE_MS = 2 * 60 * 1000;
const searchCache = new Map<string, { at: number; rows: any[] }>();
let activeSearchController: AbortController | null = null;
let activeSearchSerial = 0;

function normalizeSearchText(value: any): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function rankSearchRows(rows: any[], query: string) {
  const q = normalizeSearchText(query);
  const tokens = q.split(' ').filter(Boolean);
  if (!q || !tokens.length) return rows.slice(0, 24);

  const scored = rows.map((row, index) => {
    const title = normalizeSearchText(row?.title);
    const channel = normalizeSearchText(row?.channel);
    const combined = (title + ' ' + channel).trim();
    const allTokens = tokens.every(token => combined.includes(token));

    let score = 0;
    if (title === q) score += 12000;
    if (channel === q) score += 11500;
    if (title.startsWith(q)) score += 10000;
    if (channel.startsWith(q)) score += 9500;
    if (title.includes(q)) score += 8500;
    if (channel.includes(q)) score += 8000;
    if (allTokens) score += 6000;

    for (const token of tokens) {
      if (title.startsWith(token)) score += 500;
      else if (title.includes(token)) score += 260;
      if (channel.startsWith(token)) score += 420;
      else if (channel.includes(token)) score += 220;
    }

    // A multi-word query should not be dominated by rows matching only one word.
    if (tokens.length > 1 && !allTokens) score -= 5000;

    return { row, score, allTokens, index };
  });

  const strict = scored.filter(item => item.allTokens);
  const pool = tokens.length > 1 && strict.length >= 2 ? strict : scored;

  return pool
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.row)
    .slice(0, 24);
}

function mergeSearchRows(a: any[], b: any[], query: string) {
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const row of [...a, ...b]) {
    const key = String(row?.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return rankSearchRows(merged, query);
}

async function searchSuggestionVariant(query: string, signal?: AbortSignal): Promise<string> {
  const url = new URL(FALLBACK_DISCOVERY_API);
  url.searchParams.set('action', 'suggestions');
  url.searchParams.set('q', query);

  try {
    const response = await fetch(url.toString(), { signal, cache: 'default' });
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const q = normalizeSearchText(query);
    const tokens = q.split(' ').filter(Boolean);

    for (const raw of rows) {
      const suggestion = String(raw || '').trim();
      const normalized = normalizeSearchText(suggestion);
      if (!suggestion || !normalized) continue;

      // Prefer the accent-corrected form of exactly what the user typed.
      if (normalized === q && suggestion.toLowerCase() !== query.toLowerCase()) {
        return suggestion;
      }

      // For multi-word names, a short completion is usually a better search
      // than the raw unaccented input (e.g. "tuan hung" -> "tuấn hưng").
      const suggestionTokens = normalized.split(' ').filter(Boolean);
      if (
        tokens.length >= 2 &&
        normalized.startsWith(q) &&
        suggestionTokens.length <= tokens.length + 2
      ) {
        return suggestion;
      }
    }
  } catch (error) {
    if ((error as any)?.name !== 'AbortError') {
      console.debug('[App]', 'Suggestion refinement unavailable', error);
    }
  }
  return '';
}

async function fallbackSearch(query: string, signal?: AbortSignal) {
  const key = normalizeSearchText(query);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) {
    return cached.rows;
  }

  const url = new URL(FALLBACK_DISCOVERY_API);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', query);
  url.searchParams.set('filter', 'videos');

  const response = await fetch(url.toString(), { signal, cache: 'default' });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `fallback_search_${response.status}`);
  }

  const rows = (Array.isArray(payload?.data?.items) ? payload.data.items : [])
    .map((row: any) => {
      const id = fallbackVideoId(row);
      if (!id) return null;
      return {
        id,
        title: String(row?.title || 'Video'),
        channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: fallbackDuration(row?.duration),
        views: String(row?.viewText || (row?.views ? `${row.views} views` : '')) || null
      };
    })
    .filter((row: any): row is NonNullable<typeof row> => !!row);

  const ranked = rankSearchRows(rows, query);
  searchCache.set(key, { at: Date.now(), rows: ranked });
  if (searchCache.size > 60) {
    searchCache.delete(searchCache.keys().next().value);
  }
  return ranked;
}

const performSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query.length) {
    searchResults.value = [];
    return;
  }

  isLoading.value = true;

  try {
    let mapped: typeof searchResults.value = [];

    try {
      const innertube = await getInnertube();
      if (innertube) {
        const search = await innertube.actions.execute('/search', { query, parse: true });
        const results = search.contents_memo?.getType(YTNodes.Video, YTNodes.CompactVideo) || [];
        mapped = results.map((result) => ({
          id: result.video_id,
          title: result.title.toString(),
          channel: String(result.author?.name || 'Unknown'),
          thumbnail: result.thumbnails[0]?.url || `https://i.ytimg.com/vi/${result.video_id}/hqdefault.jpg`,
          duration: result.duration?.text || null,
          views: result.view_count?.text || null
        }));
      }
    } catch (error) {
      console.warn('[App]', 'Native Kira search failed; using 1988 fallback', error);
    }

    if (!mapped.length) {
      mapped = await fallbackSearch(query);
    }

    searchResults.value = mapped;
    highlightedIndex.value = mapped.length > 0 ? 0 : -1;
  } catch (error) {
    console.error('[App]', 'Search failed', error);
    searchResults.value = [];
    highlightedIndex.value = -1;
  } finally {
    isLoading.value = false;
  }
};"""
if old not in s:
    raise SystemExit("Kira search block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# Home recommendations use Kira first, then the same 1988 discovery API if
# YouTube returns a renderer shape this pinned Kira version does not understand.
p = Path("src/pages/HomePage.vue")
s = p.read_text()
anchor = """const homeRecommendations = ref<VideoItemData[]>([]);

watch(showRecommendations, (val) => {"""
insert = r"""const homeRecommendations = ref<VideoItemData[]>([]);
const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

function fallbackVideoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const re of [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
    /([A-Za-z0-9_-]{11})$/
  ]) {
    const match = raw.match(re);
    if (match?.[1]) return match[1];
  }
  return '';
}

function durationText(value: any): string | undefined {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function fallbackRows(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchFallbackRows(action: string, params: Record<string, string> = {}) {
  const url = new URL(FALLBACK_DISCOVERY_API);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `fallback_home_${action}_${response.status}`);
  }
  return fallbackRows(payload);
}

function toRecommendation(row: any): VideoItemData | null {
  const videoId = fallbackVideoId(row);
  if (!videoId) return null;
  return {
    videoId,
    title: String(row?.title || 'Video'),
    titleText: String(row?.title || 'Video'),
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    metadata: [
      String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
      String(row?.viewText || (row?.views ? `${row.views} views` : ''))
    ].filter(Boolean),
    duration: durationText(row?.duration)
  };
}

async function loadFallbackRecommendations() {
  const topicQueries = [
    'nhạc Việt',
    'giải trí Việt Nam',
    'thể thao',
    'công nghệ',
    'ẩm thực',
    'du lịch'
  ];

  const [trendingResult, ...topicResults] = await Promise.allSettled([
    fetchFallbackRows('trending', { region: 'VN' }),
    ...topicQueries.map(q => fetchFallbackRows('search', { q, filter: 'videos' }))
  ]);

  const buckets: VideoItemData[][] = [];

  if (trendingResult.status === 'fulfilled') {
    buckets.push(
      trendingResult.value
        .map(toRecommendation)
        .filter((row): row is VideoItemData => !!row)
        .slice(0, 8)
    );
  }

  for (const result of topicResults) {
    if (result.status !== 'fulfilled') continue;
    buckets.push(
      result.value
        .map(toRecommendation)
        .filter((row): row is VideoItemData => !!row)
        .slice(0, 6)
    );
  }

  const seen = new Set<string>();
  const mixed: VideoItemData[] = [];
  const depth = Math.max(0, ...buckets.map(rows => rows.length));

  for (let i = 0; i < depth && mixed.length < 24; i++) {
    for (const bucket of buckets) {
      const row = bucket[i];
      if (!row || seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      mixed.push(row);
      if (mixed.length >= 24) break;
    }
  }

  if (!mixed.length) {
    const emergency = await fetchFallbackRows('home', { seed: 'khám phá' });
    for (const raw of emergency) {
      const row = toRecommendation(raw);
      if (!row || seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      mixed.push(row);
      if (mixed.length >= 24) break;
    }
  }

  homeRecommendations.value = mixed;
}

watch(showRecommendations, (val) => {"""
if anchor not in s:
    raise SystemExit("Kira home anchor not found")
s = s.replace(anchor, insert, 1)

old = """  } catch (error) {
    console.error('Error fetching recommendations:', error);
    addToast('Failed to load recommendations.', 'error');
  } finally {
    loading.value = false;
  }
});"""
new = """    if (!homeRecommendations.value.length) {
      await loadFallbackRecommendations();
    }
  } catch (error) {
    console.warn('Native recommendations failed; using 1988 fallback', error);
    try {
      await loadFallbackRecommendations();
    } catch (fallbackError) {
      console.error('Error fetching recommendations:', fallbackError);
      addToast('Failed to load recommendations.', 'error');
    }
  } finally {
    loading.value = false;
  }
});"""
if old not in s:
    raise SystemExit("Kira home completion block not found")
s = s.replace(old, new, 1)
p.write_text(s)



# Discovery performance: use the 1988 backend immediately instead of waiting
# for the slower native Kira discovery request to fail first.
p = Path("src/App.vue")
s = p.read_text()
start = s.index("const performSearch = async () => {")
end = s.index("\n\nconst handleSearch", start)
fast_search = r"""const performSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query.length) {
    activeSearchController?.abort();
    searchResults.value = [];
    highlightedIndex.value = -1;
    isLoading.value = false;
    return;
  }

  const serial = ++activeSearchSerial;
  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;

  // Never leave results from an older, shorter query on screen. Re-rank/filter
  // the current rows instantly while the newest network request is running.
  const immediate = rankSearchRows(searchResults.value, query);
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const strictImmediate = immediate.filter((row: any) => {
      const combined = normalizeSearchText((row?.title || '') + ' ' + (row?.channel || ''));
      return tokens.every(token => combined.includes(token));
    });
    searchResults.value = strictImmediate;
  } else {
    searchResults.value = immediate;
  }
  highlightedIndex.value = searchResults.value.length > 0 ? 0 : -1;
  isLoading.value = true;

  // Start accent/name refinement in parallel, but do not make the user wait
  // for it before showing the primary results.
  const refinement = searchSuggestionVariant(query, controller.signal)
    .then(async (variant) => {
      if (!variant || controller.signal.aborted) return [] as any[];
      const variantKey = variant.trim().toLowerCase();
      if (variantKey === query.toLowerCase()) return [] as any[];
      return fallbackSearch(variant, controller.signal);
    })
    .catch(() => [] as any[]);

  try {
    const primary = await fallbackSearch(query, controller.signal);
    if (serial !== activeSearchSerial || controller.signal.aborted) return;

    searchResults.value = primary;
    highlightedIndex.value = primary.length > 0 ? 0 : -1;
    isLoading.value = false;

    // If Google suggests an accent-corrected Vietnamese name, merge it in as a
    // background refinement. This fixes searches such as "tuan hung".
    void refinement.then((extra) => {
      if (!extra.length || serial !== activeSearchSerial || controller.signal.aborted) return;
      const merged = mergeSearchRows(primary, extra, query);
      searchResults.value = merged;
      highlightedIndex.value = merged.length > 0 ? 0 : -1;
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return;
    if (serial !== activeSearchSerial) return;
    console.error('[App]', 'Search failed', error);
    searchResults.value = [];
    highlightedIndex.value = -1;
    isLoading.value = false;
  }
};"""
s = s[:start] + fast_search + s[end:]
s = s.replace("const handleSearch = useDebounce(performSearch, 300);", "const handleSearch = useDebounce(performSearch, 90);")
p.write_text(s)

p = Path("src/pages/HomePage.vue")
s = p.read_text()
start = s.index("onMounted(async () => {")
end = s.rindex("\n});") + len("\n});")
fast_home = r"""onMounted(async () => {
  loading.value = true;

  const saved = localStorage.getItem('showRecommendations');
  if (saved !== null) {
    showRecommendations.value = JSON.parse(saved);
  }

  try {
    await loadFallbackRecommendations();
    if (!homeRecommendations.value.length) {
      throw new Error('empty_fallback_home');
    }
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    addToast('Failed to load recommendations.', 'error');
  } finally {
    loading.value = false;
  }
});"""
s = s[:start] + fast_home + s[end:]
p.write_text(s)



# Remove imports left unused after switching discovery to backend-first.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace(
  "import { Innertube, Platform, ProtoUtils, UniversalCache, Utils, YTNodes, Types } from 'youtubei.js/web';",
  "import { Innertube, Platform, ProtoUtils, UniversalCache, Utils, Types } from 'youtubei.js/web';"
)
p.write_text(s)

p = Path("src/pages/HomePage.vue")
s = p.read_text()
s = s.replace("import { useInnertube } from '@/composables/useInnertube';\n", "")
s = s.replace("import { YTNodes } from 'youtubei.js/web';\n", "")
s = s.replace("const getInnertube = useInnertube();\n", "")
p.write_text(s)


# Watch page: keep Kira's native /next path first, but fall back to the stable
# 1988 metadata endpoint when YouTube renderer/session changes break details.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

anchor = """const relatedVideos = ref<VideoItemData[]>([]);
const videoDetails = ref<VideoDetails | undefined>();

async function fetchVideoInfo() {"""
insert = r"""const relatedVideos = ref<VideoItemData[]>([]);
const videoDetails = ref<VideoDetails | undefined>();
const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

function fallbackRelatedVideoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const re of [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
    /([A-Za-z0-9_-]{11})$/
  ]) {
    const match = raw.match(re);
    if (match?.[1]) return match[1];
  }
  return '';
}

function fallbackDurationText(value: any): string | undefined {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

async function fetchFallbackVideoInfo() {
  const url = new URL(FALLBACK_DISCOVERY_API);
  url.searchParams.set('action', 'video');
  url.searchParams.set('id', videoId.value);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || ('fallback_video_' + response.status));
  }

  const data = payload?.data || {};
  const title = String(data?.title || '').trim();
  if (!title) throw new Error('fallback_video_empty');

  document.title = title;

  const subscriberCount = Number(data?.subscriberCount || data?.subscribers || 0);
  const viewCount = Number(data?.views || 0);

  videoDetails.value = {
    title,
    channelName: String(data?.uploader || data?.uploaderName || data?.author || ''),
    channelAvatar: String(data?.uploaderAvatar || data?.avatar || ''),
    subscribers: subscriberCount ? subscriberCount.toLocaleString() + ' subscribers' : '',
    views: viewCount ? viewCount.toLocaleString() + ' views' : undefined,
    publishDate: String(data?.uploadDate || data?.uploadedDate || data?.publishedText || '') || undefined,
    description: undefined
  };

  const seen = new Set<string>();
  relatedVideos.value = (Array.isArray(data?.relatedStreams) ? data.relatedStreams : [])
    .map((row: any) => {
      const id = fallbackRelatedVideoId(row);
      if (!id || id === videoId.value || seen.has(id)) return null;
      seen.add(id);
      return {
        videoId: id,
        title: String(row?.title || 'Video'),
        titleText: String(row?.title || 'Video'),
        thumbnail: String(row?.thumbnail || row?.thumbnailUrl || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg')),
        authorAvatar: String(row?.uploaderAvatar || ''),
        metadata: [
          String(row?.uploaderName || row?.uploader || row?.channelName || ''),
          String(row?.viewText || (row?.views ? String(row.views) + ' views' : ''))
        ].filter(Boolean),
        duration: fallbackDurationText(row?.duration)
      } satisfies VideoItemData;
    })
    .filter((row: VideoItemData | null): row is VideoItemData => !!row)
    .slice(0, 18);
}

async function fetchVideoInfo() {"""
if anchor not in s:
    raise SystemExit("Kira WatchPage state anchor not found")
s = s.replace(anchor, insert, 1)

old = """  } catch (error) {
    console.error('Error fetching video details:', error);
    addToast('Failed to load video details.', 'error');
  }
}"""
new = """    if (!videoDetails.value?.title) {
      throw new Error('empty_native_video_details');
    }
  } catch (error) {
    console.warn('Native video details failed; using 1988 fallback', error);
    try {
      await fetchFallbackVideoInfo();
    } catch (fallbackError) {
      console.error('Error fetching video details:', fallbackError);
      addToast('Failed to load video details.', 'error');
    }
  }
}"""
if old not in s:
    raise SystemExit("Kira WatchPage catch block not found")
s = s.replace(old, new, 1)
p.write_text(s)


# Watch metadata polish: normalize relative Piped image URLs and never show a
# broken avatar glyph when a channel image is missing or blocked.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

old = """  const data = payload?.data || {};
  const title = String(data?.title || '').trim();"""
new = """  const data = payload?.data || {};
  const sourceBase = String(payload?.source || '');
  const normalizeMediaUrl = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, sourceBase || location.origin).toString();
    } catch {
      return raw;
    }
  };
  const title = String(data?.title || '').trim();"""
if old not in s:
    raise SystemExit("Watch fallback data anchor not found")
s = s.replace(old, new, 1)

s = s.replace(
  "channelAvatar: String(data?.uploaderAvatar || data?.avatar || ''),",
  "channelAvatar: normalizeMediaUrl(data?.uploaderAvatar || data?.avatar || ''),",
  1
)
s = s.replace(
  "thumbnail: String(row?.thumbnail || row?.thumbnailUrl || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg')),",
  "thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',",
  1
)

old = '<img :src="videoDetails.channelAvatar" class="channel-avatar" alt="Channel avatar">'
new = """<img
              v-if="videoDetails.channelAvatar"
              :src="videoDetails.channelAvatar"
              class="channel-avatar"
              alt="Channel avatar"
              @error="videoDetails.channelAvatar = ''"
            >
            <div v-else class="channel-avatar channel-avatar-placeholder" aria-hidden="true">
              {{ (videoDetails.channelName || 'Y').slice(0, 1).toUpperCase() }}
            </div>"""
if old not in s:
    raise SystemExit("Watch avatar template anchor not found")
s = s.replace(old, new, 1)

old = """.channel-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}"""
new = """.channel-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.channel-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 40px;
  background: #333;
  color: #ddd;
  font-size: 16px;
  font-weight: 600;
}"""
if old not in s:
    raise SystemExit("Watch avatar CSS anchor not found")
s = s.replace(old, new, 1)

p.write_text(s)


# Player: preserve Kira SABR as primary. If its player request or manifest path
# fails, use the 1988 range-capable media endpoint directly in the same video.
p = Path("src/composables/useYoutubePlayer.ts")
s = p.read_text()

s = s.replace(
  "const ENABLE_PLAYBACK_TRACKING = true;",
  "const ENABLE_PLAYBACK_TRACKING = true;\nconst FALLBACK_MEDIA_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';",
  1
)

anchor = """  //#endregion

  async function loadVideo(videoId: string, targetContainer: HTMLElement) {"""
insert = r"""  //#endregion

  async function loadDirectMediaFallback(videoId: string): Promise<boolean> {
    const { player, videoElement } = playerComponents.value;
    if (!videoElement) return false;

    try {
      try {
        if (player) await player.unload();
      } catch {}

      const mediaUrl = new URL(FALLBACK_MEDIA_API);
      mediaUrl.searchParams.set('action', 'media');
      mediaUrl.searchParams.set('id', videoId);
      mediaUrl.searchParams.set('kind', 'video');

      const savedPosition = getPlaybackPosition(videoId);
      videoElement.removeAttribute('src');
      videoElement.src = mediaUrl.toString();
      videoElement.preload = 'auto';
      videoElement.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          videoElement.removeEventListener('loadedmetadata', onReady);
          videoElement.removeEventListener('canplay', onReady);
          videoElement.removeEventListener('error', onError);
          fn();
        };
        const onReady = () => finish(resolve);
        const onError = () => finish(() => reject(new Error('direct_media_error_' + (videoElement.error?.code || 0))));
        const timer = window.setTimeout(
          () => finish(() => reject(new Error('direct_media_timeout'))),
          100
        );

        videoElement.addEventListener('loadedmetadata', onReady, { once: true });
        videoElement.addEventListener('canplay', onReady, { once: true });
        videoElement.addEventListener('error', onError, { once: true });
        videoElement.load();
      });

      if (savedPosition > 0 && Number.isFinite(videoElement.duration)) {
        try {
          videoElement.currentTime = Math.min(savedPosition, Math.max(0, videoElement.duration - 0.25));
        } catch {}
      }

      try {
        await videoElement.play();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
          throw error;
        }
        addToast('Tap Play to start video.', 'info');
      }

      startSavingPosition();
      playerState.value = 'ready';
      console.info('[Player]', 'Using 1988 direct media fallback');
      return true;
    } catch (error) {
      console.error('[Player]', '1988 direct media fallback failed', error);
      try {
        videoElement.removeAttribute('src');
        videoElement.load();
      } catch {}
      return false;
    }
  }

  async function loadVideo(videoId: string, targetContainer: HTMLElement) {"""
if anchor not in s:
    raise SystemExit("Kira player loadVideo anchor not found")
s = s.replace(anchor, insert, 1)

start = s.index("      const videoInfo = await fetchVideoInfo(videoId);")
end = s.index("\n  }\n\n  onUnmounted", start)
if start < 0 or end < 0:
    raise SystemExit("Kira player primary playback bounds not found")
new = """      const videoInfo = await fetchVideoInfo(videoId);
      if (videoInfo.data.playabilityStatus?.status !== 'OK') {
        console.warn('[Player]', 'Primary playback unavailable:', videoInfo.data.playabilityStatus?.reason || 'Unknown reason');
        if (await loadDirectMediaFallback(videoId)) return;
        addToast('Unplayable video.', 'error');
        playerState.value = 'error';
        return;
      }

      try {
        await loadManifest(videoInfo);
      } catch (manifestError) {
        console.warn('[Player]', 'Primary manifest failed; using direct media fallback', manifestError);
        if (await loadDirectMediaFallback(videoId)) return;
        throw manifestError;
      }

      startSavingPosition();
      playerState.value = 'ready';
    } catch (error) {
      console.warn('[Player]', 'Primary playback failed; using direct media fallback', error);
      if (await loadDirectMediaFallback(videoId)) return;
      console.error(error);
      playerState.value = 'error';
      addToast('Error loading video: ' + (error as any).message, 'error');
    }"""
s = s[:start] + new + s[end:]
p.write_text(s)



# Cobalt VOD playback: resolve a short-lived tunnel URL client-side, bypassing
# Render/Supabase YouTube egress blocks. This is the primary path for normal VODs.
p = Path("src/composables/useYoutubePlayer.ts")
src = p.read_text()

anchor = """  async function loadDirectMediaFallback(videoId: string): Promise<boolean> {"""
insert = r"""  async function loadCobaltMedia(videoId: string): Promise<boolean> {
    const { player, videoElement } = playerComponents.value;
    if (!videoElement) return false;

    const apis = [
      'https://kira-proxy-1988-us.onrender.com/api/cobalt',
      'https://kira-proxy-1988.onrender.com/api/cobalt'
    ];

    for (const api of apis) {
      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId),
            videoQuality: '360',
            youtubeVideoCodec: 'h264',
            youtubeVideoContainer: 'mp4',
            downloadMode: 'auto',
            alwaysProxy: true
          })
        });

        const payload = await response.json().catch(() => null);
        const mediaUrl = String(payload?.url || '');
        if (!response.ok || !mediaUrl || !['tunnel', 'redirect'].includes(String(payload?.status || ''))) {
          console.warn('[Player]', '1988 Cobalt proxy failed', api, payload?.error?.code || response.status);
          continue;
        }

        const savedPosition = getPlaybackPosition(videoId);

        try {
          if (!player) throw new Error('shaka_player_missing');
          await player.unload();
          videoElement.removeAttribute('src');
          videoElement.preload = 'auto';
          videoElement.playsInline = true;

          // Keep Cobalt progressive MP4 inside Shaka so Kira's own controls,
          // duration, seek bar and current-time display stay synchronized.
          await player.load(mediaUrl, savedPosition > 0 ? savedPosition : undefined, 'video/mp4');
        } catch (shakaError) {
          console.warn('[Player]', 'Shaka progressive MP4 load failed; using native media element', shakaError);

          try {
            if (player) await player.unload();
          } catch {}

          videoElement.removeAttribute('src');
          videoElement.src = mediaUrl;
          videoElement.preload = 'auto';
          videoElement.playsInline = true;

          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (fn: () => void) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              videoElement.removeEventListener('loadedmetadata', onReady);
              videoElement.removeEventListener('canplay', onReady);
              videoElement.removeEventListener('error', onError);
              fn();
            };
            const onReady = () => finish(resolve);
            const onError = () => finish(() => reject(new Error('cobalt_media_error_' + (videoElement.error?.code || 0))));
            const timer = window.setTimeout(
              () => finish(() => reject(new Error('cobalt_media_timeout'))),
              18000
            );

            videoElement.addEventListener('loadedmetadata', onReady, { once: true });
            videoElement.addEventListener('canplay', onReady, { once: true });
            videoElement.addEventListener('error', onError, { once: true });
            videoElement.load();
          });

          if (savedPosition > 0 && Number.isFinite(videoElement.duration)) {
            try {
              videoElement.currentTime = Math.min(savedPosition, Math.max(0, videoElement.duration - 0.25));
            } catch {}
          }
        }

        try {
          await videoElement.play();
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
          addToast('Tap Play to start video.', 'info');
        }

        startSavingPosition();
        playerState.value = 'ready';
        console.info('[Player]', 'Using 1988 Cobalt media tunnel', api);
        return true;
      } catch (error) {
        console.warn('[Player]', '1988 Cobalt playback failed', api, error);
      }
    }

    return false;
  }

  async function loadDirectMediaFallback(videoId: string): Promise<boolean> {"""
if anchor not in src:
    raise SystemExit("Cobalt insert anchor not found")
src = src.replace(anchor, insert, 1)

# Try Cobalt before any path that depends on YouTube calls from our datacenter egress.
# Locate the Innertube initialization *inside loadVideo* instead of relying on
# the exact surrounding text, which has changed across the previous patches.
load_video_pos = src.index("  async function loadVideo(videoId: string, targetContainer: HTMLElement) {")
innertube_pos = src.index("      const innertube = await getInnertube();", load_video_pos)
if load_video_pos < 0 or innertube_pos < 0:
    raise SystemExit("Cobalt loadVideo/Innertube insertion point not found")
src = src[:innertube_pos] + "      if (await loadCobaltMedia(videoId)) return;\n      playerState.value = 'error';\n      addToast('Video source is temporarily unavailable.', 'error');\n      return;\n\n" + src[innertube_pos:]

p.write_text(src)



# Fast seekable playback: Cloudflare Worker uses NewPipe-compatible iOS
# InnerTube requests to build a DASH manifest. Each media byte-range request
# refreshes the signed googlevideo URL and fetches it inside the same Worker
# invocation, avoiding datacenter IP-binding failures while preserving 206 Range.
p = Path("src/composables/useYoutubePlayer.ts")
src = p.read_text()

anchor = """  async function loadCobaltMedia(videoId: string): Promise<boolean> {"""
insert = r"""  async function loadCloudflareDashMedia(videoId: string): Promise<boolean> {
    const { player, videoElement } = playerComponents.value;
    if (!player || !videoElement) return false;

    const savedPosition = getPlaybackPosition(videoId);
    const targetHeight = window.innerWidth <= 700 ? 480 : 720;
    const manifestUrl =
      'https://youtube-wasm-relay-1988.taphoa-4ab8161d.workers.dev/direct/manifest'
      + '?id=' + encodeURIComponent(videoId)
      + '&h=' + targetHeight;

    try {
      videoElement.poster = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
      videoElement.preload = 'auto';
      videoElement.playsInline = true;

      try {
        await player.unload();
      } catch {}

      const loadPromise = player.load(
        manifestUrl,
        savedPosition > 0 ? savedPosition : undefined
      );
      await Promise.race([
        loadPromise,
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error('cloudflare_dash_timeout')), 9000)
        )
      ]);

      try {
        await videoElement.play();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
        addToast('Tap Play to start video.', 'info');
      }

      startSavingPosition();
      playerState.value = 'ready';
      console.info('[Player]', 'Using Cloudflare iOS DASH stream', {
        duration: videoElement.duration,
        height: targetHeight
      });
      return true;
    } catch (error) {
      console.warn('[Player]', 'Cloudflare DASH playback failed', error);
      try {
        await player.unload();
      } catch {}
      return false;
    }
  }

  async function loadCobaltMedia(videoId: string): Promise<boolean> {"""

if anchor not in src:
    raise SystemExit("Cloudflare DASH insertion anchor not found")
src = src.replace(anchor, insert, 1)

needle = """      if (await loadCobaltMedia(videoId)) return;
      playerState.value = 'error';
      addToast('Video source is temporarily unavailable.', 'error');
      return;
"""
if needle not in src:
    raise SystemExit("Cobalt loadVideo priority call site not found")
src = src.replace(
    needle,
    """      if (await loadCloudflareDashMedia(videoId)) return;
      if (await loadCobaltMedia(videoId)) return;
      playerState.value = 'error';
      addToast('Video source is temporarily unavailable.', 'error');
      return;
""",
    1
)

p.write_text(src)


# Temporary production player: use the proven YouTube iframe path for immediate
# playback while keeping the native DASH/Cobalt implementation in the codebase
# for later work. The iframe is isolated inside Kira's existing player frame.
p = Path("src/components/VideoPlayer.vue")
p.write_text(r'''<style scoped>
.video-player-container {
  overflow: hidden;
  border-radius: 12px;
  position: relative;
  aspect-ratio: 16 / 9;
  width: 100%;
  background: #000;
}

.iframe-shell {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
}

.youtube-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  border: 0;
  background: #000;
}

/*
 * YouTube's embedded UI is kept inside the video frame only. Deprecated
 * showinfo=0 is still sent as a best-effort hint alongside modestbranding.
 * No YouTube title/channel block is rendered by our app around the iframe;
 * Kira's own metadata below remains the only surrounding information.
 */
</style>

<template>
  <div class="video-player-container">
    <div class="iframe-shell">
      <iframe
        class="youtube-frame"
        :src="embedUrl"
        :title="'YouTube video ' + videoId"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ videoId: string }>();

const embedUrl = computed(() => {
  const id = encodeURIComponent(props.videoId || '');
  const origin = encodeURIComponent(window.location.origin);
  return 'https://www.youtube-nocookie.com/embed/' + id
    + '?autoplay=1'
    + '&playsinline=1'
    + '&controls=1'
    + '&rel=0'
    + '&modestbranding=1'
    + '&showinfo=0'
    + '&iv_load_policy=3'
    + '&fs=1'
    + '&enablejsapi=1'
    + '&origin=' + origin;
});
</script>
''')

# Mark proxy configured by default so Kira does not open its settings dialog.
p = Path("src/composables/useProxySettings.ts")
s = p.read_text()
s = s.replace("protocol: 'http',\n  host: '',\n  port: ''", "protocol: 'https',\n  host: 'kira-proxy-1988-us.onrender.com',\n  port: ''")
s = s.replace("      Object.assign(settingsState, parsed);", "      void parsed; /* fixed 1988 proxy: ignore saved proxy settings */")
p.write_text(s)

# Use the existing 1988 Supabase proxy shape (__host + __path + serialized headers).
p = Path("src/utils/helpers.ts")
s = p.read_text()

start = s.index("export function configImageHttpProxy()")
end = s.index("export function getInjectedProxyFunction()", start)
s = s[:start] + """export function configImageHttpProxy() {
  // Images can load cross-origin directly; do not rewrite them through the API proxy.
}

""" + s[end:]

start = s.index("export async function fetchFunction(")
new_fetch = r"""export async function fetchFunction(input: string | Request | URL, init?: RequestInit): Promise<Response> {
  const original = input instanceof URL ? new URL(input.toString()) : new URL(typeof input === 'string' ? input : input.url);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

  if (original.pathname.includes('v1/player')) {
    original.searchParams.set('$fields', 'playerConfig,storyboards,captions,playabilityStatus,streamingData,responseContext.mainAppWebResponseContext.datasyncId,videoDetails.isLive,videoDetails.isLiveContent,videoDetails.title,videoDetails.author,videoDetails.thumbnail');
  }

  const proxy = new URL('""" + PROXY + r"""');
  proxy.pathname = original.pathname;

  const isInnertube = original.pathname.startsWith('/youtubei/');
  const upstreamHost = isInnertube ? 'youtubei.googleapis.com' : original.host;
  proxy.searchParams.set('__host', upstreamHost);

  for (const [key, value] of original.searchParams) {
    proxy.searchParams.append(key, value);
  }

  if (isInnertube && !proxy.searchParams.has('key')) {
    proxy.searchParams.set('key', 'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8');
  }

  proxy.searchParams.set('__headers', JSON.stringify([ ...headers ]));

  headers.delete('user-agent');

  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  let body = init?.body;
  if (body === undefined && input instanceof Request && method !== 'GET' && method !== 'HEAD') {
    body = await input.clone().arrayBuffer();
  }

  return fetch(proxy.toString(), {
    ...init,
    method,
    headers,
    body,
    credentials: 'omit',
    redirect: 'follow'
  });
}

"""
s = s[:start] + new_fetch
p.write_text(s)

# Rewrite Shaka's googlevideo/license requests into the same proxy URL while
# preserving the original query params (including rn used by SABR metadata).
p = Path("src/composables/useYoutubePlayer.ts")
s = p.read_text()
s = s.replace("import { useProxySettings } from '@/composables/useProxySettings';\n", "")
s = s.replace("  const { settings } = useProxySettings();\n", "")
old = """      if ((url.host.endsWith('.googlevideo.com') || url.href.includes('drm')) && !checkExtension()) {
        const newUrl = new URL(url.toString());
        newUrl.searchParams.set('__host', url.host);
        newUrl.host = settings.host;
        newUrl.port = settings.port;
        newUrl.protocol = settings.protocol;
        url = newUrl;
      }"""
new = """      if ((url.host.endsWith('.googlevideo.com') || url.href.includes('drm')) && !checkExtension()) {
        const originalUrl = new URL(url.toString());
        const newUrl = new URL('""" + PROXY + """');
        newUrl.pathname = originalUrl.pathname;
        const isInnertube = originalUrl.pathname.startsWith('/youtubei/');
        newUrl.searchParams.set('__host', isInnertube ? 'youtubei.googleapis.com' : originalUrl.host);
        for (const [key, value] of originalUrl.searchParams) {
          newUrl.searchParams.append(key, value);
        }
        if (isInnertube && !newUrl.searchParams.has('key')) {
          newUrl.searchParams.set('key', 'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8');
        }
        url = newUrl;
      }"""
if old not in s:
    raise SystemExit("Kira proxy filter block not found")
s = s.replace(old, new, 1)
p.write_text(s)

# Keep attribution and a machine-readable build marker without changing the UI.
p = Path("index.html")
s = p.read_text()
s = s.replace("<head>", "<head>\n    <meta name=\"1988-proof-build\" content=\"ytjs-proof-20260923-43-fast-ranked-search\">", 1)
p.write_text(s)
PY

echo "==> Installing Kira dependencies"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "==> Building Kira proof"
npm run build

rm -rf "$ROOT/kira-proof"
mkdir -p "$ROOT/kira-proof"
cp -a dist/. "$ROOT/kira-proof/"
cp LICENSE "$ROOT/kira-proof/KIRA_LICENSE.txt"

echo "==> Kira proof built"
find "$ROOT/kira-proof" -maxdepth 2 -type f -printf '%P %k KB\n' | sort | head -80
