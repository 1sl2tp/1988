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
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        duration: fallbackDuration(row?.duration),
        views: String(row?.viewText || (row?.views ? `${row.views} views` : '')) || null
      };
    })
    .filter((row: any): row is NonNullable<typeof row> => !!row);

  const ranked = rankSearchRows(rows, query);
  searchCache.set(key, { at: Date.now(), rows: ranked });
  if (searchCache.size > 60) {
    const oldestKey = searchCache.keys().next().value as string | undefined;
    if (oldestKey) searchCache.delete(oldestKey);
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

# Search dropdown is above-the-fold UI: load its compact thumbnails immediately.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace(
    'loading="lazy"\n              @error="handleImageError($event.target as any)"',
    'loading="eager"\n              decoding="async"\n              :fetchpriority="index < 3 ? \'high\' : \'auto\'"\n              @error="handleImageError($event.target as any)"',
    1
)
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
.video-player {
  width: 100%;
}

.video-surface {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  background: #000;
}

/* The YouTube frame is display-only: no mouse/touch events ever enter it. */
.player-host {
  position: absolute;
  inset: 0;
  background: #000;
  pointer-events: none;
}

.player-host :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  display: block;
  border: 0;
  pointer-events: none !important;
}

.controls {
  min-height: 46px;
  margin-top: 7px;
  display: grid;
  grid-template-columns: auto minmax(90px, 1fr) auto auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 7px 9px;
  box-sizing: border-box;
  border-radius: 10px;
  background: #191919;
  border: 1px solid #303030;
  color: #eee;
}

.icon-btn {
  width: 34px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #eee;
  cursor: pointer;
}

.icon-btn:hover {
  background: #2b2b2b;
}

.icon-btn:disabled {
  opacity: .45;
  cursor: default;
}

.icon-btn svg {
  width: 20px;
  height: 20px;
  display: block;
}

.seek {
  width: 100%;
  min-width: 80px;
  accent-color: #fff;
  cursor: pointer;
}

.time {
  min-width: 88px;
  color: #aaa;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: center;
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.volume {
  width: 62px;
  accent-color: #fff;
  cursor: pointer;
}

.speed {
  height: 30px;
  min-width: 54px;
  padding: 0 5px;
  border: 0;
  border-radius: 7px;
  background: #252525;
  color: #ddd;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

@media (max-width: 640px) {
  .video-surface {
    border-radius: 10px;
  }

  .controls {
    grid-template-columns: auto minmax(70px, 1fr) auto auto auto;
    gap: 5px;
    min-height: 42px;
    margin-top: 5px;
    padding: 5px 6px;
    border-radius: 8px;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
  }

  .time {
    min-width: 70px;
    font-size: 11px;
  }

  .volume {
    display: none;
  }

  .speed {
    min-width: 48px;
    font-size: 11px;
  }
}

@media (max-width: 390px) {
  .controls {
    grid-template-columns: auto minmax(62px, 1fr) auto auto;
  }

  .time {
    display: none;
  }

  .speed {
    min-width: 44px;
  }
}
</style>

<template>
  <div ref="wrapperRef" class="video-player">
    <div class="video-surface">
      <div ref="playerHostRef" class="player-host"></div>
    </div>

    <div class="controls">
      <button
        class="icon-btn"
        :title="playing ? 'Tạm dừng' : 'Phát'"
        :aria-label="playing ? 'Tạm dừng' : 'Phát'"
        :disabled="!ready"
        @click="togglePlay"
      >
        <svg v-if="!playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 5h4v14H6zm8 0h4v14h-4z"/>
        </svg>
      </button>

      <input
        class="seek"
        type="range"
        min="0"
        :max="Math.max(duration, 0)"
        step="0.1"
        :value="seekValue"
        :disabled="!ready || !duration"
        aria-label="Tua video"
        @input="previewSeek"
        @change="commitSeek"
      >

      <span class="time">{{ formatTime(seekValue) }} / {{ formatTime(duration) }}</span>

      <div class="volume-wrap">
        <button
          class="icon-btn"
          :title="muted || volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'"
          :aria-label="muted || volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'"
          :disabled="!ready"
          @click="toggleMute"
        >
          <svg v-if="muted || volume === 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4z"/>
            <path d="m19 9-6 6m0-6 6 6"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M11 5 6 9H2v6h4l5 4z"/>
            <path d="M15 9.5a4 4 0 0 1 0 5"/>
            <path d="M17.5 7a7 7 0 0 1 0 10"/>
          </svg>
        </button>
        <input
          class="volume"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="volume"
          :disabled="!ready"
          aria-label="Âm lượng"
          @input="setVolumeFromInput"
        >
      </div>

      <select
        class="speed"
        :value="playbackRate"
        :disabled="!ready"
        aria-label="Tốc độ phát"
        @change="setPlaybackRateFromSelect"
      >
        <option v-for="rate in playbackRates" :key="rate" :value="rate">{{ rate }}×</option>
      </select>

      <button
        class="icon-btn"
        title="Toàn màn hình"
        aria-label="Toàn màn hình"
        @click="toggleFullscreen"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const props = defineProps<{ videoId: string }>();

const wrapperRef = ref<HTMLElement | null>(null);
const playerHostRef = ref<HTMLElement | null>(null);
const player = shallowRef<any>(null);

const ready = ref(false);
const playing = ref(false);
const muted = ref(false);
const volume = ref(100);
const currentTime = ref(0);
const duration = ref(0);
const playbackRate = ref(1);
const playbackRates = ref<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);

const seeking = ref(false);
const pendingSeek = ref(0);
const seekValue = computed(() => seeking.value ? pendingSeek.value : currentTime.value);

let pollTimer: number | undefined;

function ensureIframeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-yt-iframe-api="1988"]') as HTMLScriptElement | null;

    const finish = () => {
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('youtube_iframe_api_unavailable'));
    };

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } catch {}
      finish();
    };

    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(timer);
          resolve(window.YT);
        } else if (Date.now() - started > 10000) {
          clearInterval(timer);
          reject(new Error('youtube_iframe_api_timeout'));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.ytIframeApi = '1988';
    script.onerror = () => reject(new Error('youtube_iframe_api_load_failed'));
    document.head.appendChild(script);
  });
}

function syncPlayerState() {
  const p = player.value;
  if (!p || !ready.value) return;

  try {
    const d = Number(p.getDuration?.() || 0);
    const t = Number(p.getCurrentTime?.() || 0);
    const v = Number(p.getVolume?.() ?? volume.value);

    if (Number.isFinite(d) && d > 0) duration.value = d;
    if (!seeking.value && Number.isFinite(t) && t >= 0) currentTime.value = t;
    if (Number.isFinite(v)) volume.value = Math.max(0, Math.min(100, v));
    muted.value = !!p.isMuted?.();
  } catch {}
}

function startPolling() {
  stopPolling();
  syncPlayerState();
  pollTimer = window.setInterval(syncPlayerState, 250);
}

function stopPolling() {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function forceCaptionsOff() {
  const p = player.value;
  if (!p) return;
  try { p.setOption?.('captions', 'track', {}); } catch {}
  try { p.setOption?.('cc', 'track', {}); } catch {}
  try { p.unloadModule?.('captions'); } catch {}
}

async function createPlayer() {
  if (!playerHostRef.value) return;

  const YT = await ensureIframeApi();
  if (!playerHostRef.value) return;

  player.value?.destroy?.();
  ready.value = false;

  player.value = new YT.Player(playerHostRef.value, {
    host: 'https://www.youtube-nocookie.com',
    width: '100%',
    height: '100%',
    videoId: props.videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      playsinline: 1,
      modestbranding: 1,
      iv_load_policy: 3,
      cc_load_policy: 0,
      enablejsapi: 1,
      origin: window.location.origin
    },
    events: {
      onReady: (event: any) => {
        player.value = event.target;
        ready.value = true;

        try {
          const iframe = event.target.getIframe?.();
          if (iframe) iframe.style.pointerEvents = 'none';
        } catch {}

        forceCaptionsOff();
        window.setTimeout(forceCaptionsOff, 700);
        window.setTimeout(forceCaptionsOff, 1800);

        try {
          const rates = event.target.getAvailablePlaybackRates?.();
          if (Array.isArray(rates) && rates.length) playbackRates.value = rates;
        } catch {}

        try {
          volume.value = Number(event.target.getVolume?.() ?? 100);
          muted.value = !!event.target.isMuted?.();
        } catch {}

        startPolling();

        try {
          const promise = event.target.playVideo?.();
          void promise;
        } catch {}
      },
      onStateChange: (event: any) => {
        playing.value = event.data === YT.PlayerState.PLAYING;
        syncPlayerState();
        forceCaptionsOff();
      },
      onPlaybackRateChange: (event: any) => {
        playbackRate.value = Number(event.data || 1);
      },
      onError: () => {
        playing.value = false;
      }
    }
  });
}

function togglePlay() {
  const p = player.value;
  if (!p || !ready.value) return;

  try {
    if (playing.value) p.pauseVideo();
    else p.playVideo();
  } catch {}
}

function previewSeek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  seeking.value = true;
  pendingSeek.value = value;
}

function commitSeek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;

  try { player.value?.seekTo?.(value, true); } catch {}
  currentTime.value = value;
  pendingSeek.value = value;
  seeking.value = false;
}

function toggleMute() {
  const p = player.value;
  if (!p || !ready.value) return;

  try {
    if (muted.value || volume.value === 0) {
      p.unMute();
      if (volume.value === 0) p.setVolume(70);
    } else {
      p.mute();
    }
    syncPlayerState();
  } catch {}
}

function setVolumeFromInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;

  volume.value = Math.max(0, Math.min(100, value));
  try {
    player.value?.setVolume?.(volume.value);
    if (volume.value > 0) player.value?.unMute?.();
    else player.value?.mute?.();
  } catch {}
  syncPlayerState();
}

function setPlaybackRateFromSelect(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value);
  if (!Number.isFinite(value)) return;

  try {
    player.value?.setPlaybackRate?.(value);
    playbackRate.value = value;
  } catch {}
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

async function toggleFullscreen() {
  const el = wrapperRef.value;
  if (!el) return;

  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch {}
}

watch(() => props.videoId, (id) => {
  if (!id || !ready.value || !player.value) return;

  currentTime.value = 0;
  duration.value = 0;
  seeking.value = false;
  try {
    player.value.loadVideoById(id);
    forceCaptionsOff();
  } catch {}
});

onMounted(() => {
  void createPlayer();
});

onBeforeUnmount(() => {
  stopPolling();
  try { player.value?.destroy?.(); } catch {}
  player.value = null;
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


# 1988 compact display helpers.
p = Path("src/utils/display1988.ts")
p.write_text(r'''export function numericViews(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value || '').trim().toUpperCase().replace(/,/g, '');
  if (!raw) return 0;
  const compact = raw.match(/([\d.]+)\s*([KMB])(?:\s*VIEWS?)?/i);
  if (compact) {
    const base = Number(compact[1]) || 0;
    const factor = compact[2] === 'B' ? 1e9 : compact[2] === 'M' ? 1e6 : 1e3;
    return Math.round(base * factor);
  }
  const plain = raw.match(/[\d.]+/);
  return plain ? Math.max(0, Number(plain[0]) || 0) : 0;
}

export function formatCompactViews(value: unknown): string {
  const n = numericViews(value);
  if (!n) {
    const raw = String(value || '').trim();
    return raw && /view/i.test(raw) ? raw.replace(/\s*views?/i, ' views') : '';
  }
  const unit = n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : n >= 1e3 ? 1e3 : 1;
  const suffix = unit === 1e9 ? 'B' : unit === 1e6 ? 'M' : unit === 1e3 ? 'K' : '';
  if (unit === 1) return Math.round(n) + ' views';
  const scaled = n / unit;
  const digits = scaled < 10 ? 1 : 0;
  return scaled.toFixed(digits).replace(/\.0$/, '') + suffix + ' views';
}

const UNIT_MS: Record<string, number> = {
  second: 1000, seconds: 1000, giay: 1000,
  minute: 60000, minutes: 60000, phut: 60000,
  hour: 3600000, hours: 3600000, gio: 3600000,
  day: 86400000, days: 86400000, ngay: 86400000,
  week: 604800000, weeks: 604800000, tuan: 604800000,
  month: 2592000000, months: 2592000000, thang: 2592000000,
  year: 31536000000, years: 31536000000, nam: 31536000000
};

function deaccent(value: string) {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function parsePublishedAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
  }
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    return raw.length >= 13 ? n : n * 1000;
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return date;
  const plain = deaccent(raw);
  const match = plain.match(/(\d+)\s*(second|seconds|giay|minute|minutes|phut|hour|hours|gio|day|days|ngay|week|weeks|tuan|month|months|thang|year|years|nam)/);
  if (match) {
    const qty = Number(match[1]) || 0;
    const unit = UNIT_MS[match[2]] || 0;
    if (qty && unit) return Date.now() - qty * unit;
  }
  return 0;
}

export function formatRelativeTime(value: unknown): string {
  const raw = String(value || '').trim();
  const ts = parsePublishedAt(value);
  if (ts > 0) {
    const diff = Math.max(0, Date.now() - ts);
    if (diff < 60000) return 'vừa xong';
    if (diff < 3600000) return Math.max(1, Math.floor(diff / 60000)) + ' phút trước';
    if (diff < 86400000) return Math.max(1, Math.floor(diff / 3600000)) + ' giờ trước';
    if (diff < 604800000) return Math.max(1, Math.floor(diff / 86400000)) + ' ngày trước';
    if (diff < 2592000000) return Math.max(1, Math.floor(diff / 604800000)) + ' tuần trước';
    if (diff < 31536000000) return Math.max(1, Math.floor(diff / 2592000000)) + ' tháng trước';
    return Math.max(1, Math.floor(diff / 31536000000)) + ' năm trước';
  }
  if (!raw) return '';
  return normalizeMetadataText(raw);
}

export function normalizeMetadataText(value: unknown): string {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/([\d.,]+)\s*([KMB])?\s*views?/gi, function(_, num, suffix) {
    return formatCompactViews(String(num) + String(suffix || ''));
  });
  const replacements: Array<[RegExp, string]> = [
    [/(\d+)\s*seconds?\s*ago/gi, '$1 giây trước'],
    [/(\d+)\s*minutes?\s*ago/gi, '$1 phút trước'],
    [/(\d+)\s*hours?\s*ago/gi, '$1 giờ trước'],
    [/(\d+)\s*days?\s*ago/gi, '$1 ngày trước'],
    [/(\d+)\s*weeks?\s*ago/gi, '$1 tuần trước'],
    [/(\d+)\s*months?\s*ago/gi, '$1 tháng trước'],
    [/(\d+)\s*years?\s*ago/gi, '$1 năm trước']
  ];
  for (const [re, replacement] of replacements) text = text.replace(re, replacement);
  return text.replace(/\s*[•·]\s*/g, ' · ').replace(/\s+/g, ' ').trim();
}

export function compactMetadata(items: unknown[]): string {
  return items.map(normalizeMetadataText).filter(Boolean).join(' · ')
    .replace(/(?:\s*·\s*)+/g, ' · ');
}
''')


# 1988 newest-first recommendation page.
p = Path("src/pages/HomePage.vue")
p.write_text(r'''<style scoped>
.home {
  color: #f5f5f5;
  display: flex;
  padding: 16px 16px 28px;
  flex-direction: column;
  align-items: center;
  max-width: 1240px;
  margin: 0 auto;
}
.recommendations-section { width: 100%; margin-top: 8px; }
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #333;
}
.section-header h2 {
  font-size: 21px;
  font-weight: 600;
  color: #eee;
  margin: 0;
  text-align: left;
}
.header-actions { display: flex; align-items: center; gap: 8px; }
.sort-select,
.toggle-recommendations {
  height: 32px;
  background: #262626;
  border: 1px solid #444;
  color: #ddd;
  padding: 0 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
}
.sort-select:focus,
.toggle-recommendations:focus { outline: none; border-color: #666; }
.toggle-recommendations:hover,
.sort-select:hover { background: #303030; color: #fff; }
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
  gap: 18px 16px;
}
.recommendations-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  text-align: center;
  color: #888;
  font-size: 15px;
}
@media (max-width: 768px) {
  .home { padding: 10px 8px 22px; }
  .section-header { margin-bottom: 12px; }
  .section-header h2 { font-size: 19px; }
  .video-grid { grid-template-columns: 1fr; gap: 14px; }
  .sort-select,
  .toggle-recommendations { height: 30px; padding: 0 8px; font-size: 12px; }
}
</style>

<template>
  <div class="home">
    <div class="recommendations-section">
      <div class="section-header">
        <h2>Video đề xuất</h2>
        <div class="header-actions">
          <select v-model="sortMode" class="sort-select" aria-label="Sắp xếp video">
            <option value="newest">Mới nhất</option>
            <option value="views">Nhiều view</option>
            <option value="lowViews">Ít view</option>
            <option value="oldest">Cũ nhất</option>
          </select>
          <button @click="toggleRecommendations" class="toggle-recommendations">
            {{ showRecommendations ? 'Ẩn' : 'Hiện' }}
          </button>
        </div>
      </div>

      <template v-if="showRecommendations">
        <div v-if="loading" class="recommendations-state"><p>Đang tải…</p></div>
        <div v-else-if="!sortedRecommendations.length" class="recommendations-state"><p>Chưa có video phù hợp.</p></div>
        <div class="video-grid" v-else>
          <GridVideoItem
            v-for="video in sortedRecommendations"
            :key="video.videoId"
            :data="video"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import GridVideoItem from '@/components/GridVideoItem.vue';
import { useToastStore } from '@/stores/toastStore';
import type { VideoItemData } from '@/utils/helpers';
import { formatCompactViews, formatRelativeTime, numericViews, parsePublishedAt } from '@/utils/display1988';

const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

type SortMode = 'newest' | 'views' | 'lowViews' | 'oldest';
type HomeVideo = VideoItemData & { viewCount?: number; publishedAt?: number };

const { addToast } = useToastStore();
const loading = ref(true);
const showRecommendations = ref(true);
const sortMode = ref<SortMode>('newest');
const homeRecommendations = ref<HomeVideo[]>([]);

watch(showRecommendations, (val) => localStorage.setItem('showRecommendations', val.toString()));
watch(sortMode, (val) => localStorage.setItem('videoSortMode', val));

function toggleRecommendations() {
  showRecommendations.value = !showRecommendations.value;
}

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
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
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
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url.toString(), { cache: 'default' });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'fallback_home_' + action + '_' + response.status);
  }
  return fallbackRows(payload);
}

function publishedRaw(row: any) {
  return row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
    row?.publishedAt ?? row?.published ?? row?.publishedText ?? '';
}

function toRecommendation(row: any): HomeVideo | null {
  const videoId = fallbackVideoId(row);
  if (!videoId) return null;

  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube');
  const viewsRaw = row?.views ?? row?.viewCount ?? row?.viewText ?? '';
  const viewCount = numericViews(viewsRaw);
  const published = publishedRaw(row);
  const publishedAt = parsePublishedAt(published);
  const meta = [formatCompactViews(viewsRaw), formatRelativeTime(published)].filter(Boolean).join(' · ');

  return {
    videoId,
    title: String(row?.title || 'Video'),
    titleText: String(row?.title || 'Video'),
    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
    metadata: [channel, meta].filter(Boolean),
    duration: durationText(row?.duration),
    viewCount,
    publishedAt
  };
}

async function loadFallbackRecommendations() {
  const topicQueries = [
    'tin mới Việt Nam',
    'nhạc Việt mới',
    'giải trí Việt Nam mới',
    'thể thao mới',
    'công nghệ mới',
    'ẩm thực mới'
  ];

  const [trendingResult, ...topicResults] = await Promise.allSettled([
    fetchFallbackRows('trending', { region: 'VN' }),
    ...topicQueries.map(q => fetchFallbackRows('search', { q, filter: 'videos' }))
  ]);

  const rows: HomeVideo[] = [];
  const seen = new Set<string>();

  const addRows = (rawRows: any[], limit: number) => {
    for (const raw of rawRows.slice(0, limit)) {
      const row = toRecommendation(raw);
      if (!row || seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      rows.push(row);
    }
  };

  if (trendingResult.status === 'fulfilled') addRows(trendingResult.value, 12);
  for (const result of topicResults) {
    if (result.status === 'fulfilled') addRows(result.value, 8);
  }

  homeRecommendations.value = rows.slice(0, 36);
}

const sortedRecommendations = computed(() => {
  const rows = homeRecommendations.value.slice();

  if (sortMode.value === 'views') {
    return rows.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  }
  if (sortMode.value === 'lowViews') {
    return rows.sort((a, b) => {
      const av = a.viewCount || 0;
      const bv = b.viewCount || 0;
      if (!av && bv) return 1;
      if (!bv && av) return -1;
      return av - bv;
    });
  }
  if (sortMode.value === 'oldest') {
    return rows.sort((a, b) => {
      const at = a.publishedAt || 0;
      const bt = b.publishedAt || 0;
      if (!at && bt) return 1;
      if (!bt && at) return -1;
      return at - bt;
    });
  }

  return rows.sort((a, b) => {
    const at = a.publishedAt || 0;
    const bt = b.publishedAt || 0;
    if (at !== bt) {
      if (!at) return 1;
      if (!bt) return -1;
      return bt - at;
    }
    return (b.viewCount || 0) - (a.viewCount || 0);
  });
});

onMounted(async () => {
  loading.value = true;

  const savedVisibility = localStorage.getItem('showRecommendations');
  if (savedVisibility !== null) showRecommendations.value = savedVisibility === 'true';

  const savedSort = localStorage.getItem('videoSortMode') as SortMode | null;
  if (savedSort && ['newest', 'views', 'lowViews', 'oldest'].includes(savedSort)) {
    sortMode.value = savedSort;
  } else {
    sortMode.value = 'newest';
  }

  try {
    await loadFallbackRecommendations();
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    addToast('Không tải được video đề xuất.', 'error');
  } finally {
    loading.value = false;
  }
});
</script>
''')


# Compact home card: no avatar, one metadata line.
p = Path("src/components/GridVideoItem.vue")
p.write_text(r'''<style scoped>
.grid-video-item {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  overflow: hidden;
}
.thumbnail-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 9px;
  overflow: hidden;
  background: #303030;
  margin-bottom: 7px;
}
.thumbnail { width: 100%; height: 100%; object-fit: cover; display: block; }
.duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.video-details { text-align: left; min-width: 0; padding: 0 2px; }
.title {
  font-size: 14px;
  font-weight: 600;
  color: #f4f4f4;
  margin: 0 0 4px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.channel {
  color: #aaa;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  color: #858585;
  font-size: 12px;
  line-height: 1.35;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 768px) {
  .grid-video-item {
    display: grid;
    grid-template-columns: 46% 1fr;
    gap: 10px;
    align-items: start;
  }
  .thumbnail-container { margin-bottom: 0; }
  .video-details { padding-top: 2px; }
}
</style>

<template>
  <router-link class="grid-video-item" :to="'/watch/' + data.videoId">
    <div class="thumbnail-container">
      <img
        :src="data.thumbnail"
        alt="Video thumbnail"
        loading="lazy"
        decoding="async"
        class="thumbnail"
        @error="handleImageError($event.target as any)"
      >
      <div v-if="data.duration" class="duration">{{ data.duration }}</div>
    </div>
    <div class="video-details">
      <h4 class="title" v-html="data.title" :title="data.titleText"/>
      <div v-if="channel" class="channel">{{ channel }}</div>
      <div v-if="meta" class="meta">{{ meta }}</div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { handleImageError, VideoItemData } from '@/utils/helpers';
import { compactMetadata, normalizeMetadataText } from '@/utils/display1988';

const props = defineProps<{ data: VideoItemData }>();
const channel = computed(() => normalizeMetadataText(props.data.metadata?.[0] || ''));
const meta = computed(() => compactMetadata((props.data.metadata || []).slice(1)));
</script>
''')

# Related videos use the same compact channel + views/time line.
p = Path("src/components/RelatedVideoItem.vue")
p.write_text(r'''<style scoped>
.related-video-item {
  display: flex;
  gap: 10px;
  margin-bottom: 11px;
  cursor: pointer;
  text-decoration: none;
}
.thumbnail-container {
  position: relative;
  flex: 0 0 180px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 8px;
  background: #303030;
}
.thumbnail { width: 100%; height: 100%; object-fit: cover; display: block; }
.duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0,0,0,.78);
  color: white;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}
.video-details {
  display: flex;
  flex-direction: column;
  text-align: left;
  min-width: 0;
  padding-top: 1px;
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: #f3f3f3;
  margin: 0 0 4px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.channel,
.metadata {
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.channel { color: #aaa; }
.metadata { color: #858585; margin-top: 2px; }
@media (max-width: 560px) {
  .thumbnail-container { flex-basis: 42%; }
}
</style>

<template>
  <router-link class="related-video-item" :to="'/watch/' + data.videoId">
    <div class="thumbnail-container">
      <img
        :src="data.thumbnail"
        alt="Video thumbnail"
        loading="lazy"
        decoding="async"
        class="thumbnail"
        @error="handleImageError($event.target as any)"
      >
      <span v-if="data.duration" class="duration">{{ data.duration }}</span>
    </div>
    <div class="video-details">
      <h4 class="title" v-html="data.title" :title="data.titleText"/>
      <div v-if="channel" class="channel">{{ channel }}</div>
      <div v-if="meta" class="metadata">{{ meta }}</div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { handleImageError, VideoItemData } from '@/utils/helpers';
import { compactMetadata, normalizeMetadataText } from '@/utils/display1988';

const props = defineProps<{ data: VideoItemData }>();
const channel = computed(() => normalizeMetadataText(props.data.metadata?.[0] || ''));
const meta = computed(() => compactMetadata((props.data.metadata || []).slice(1)));
</script>
''')


# Compact search metadata and trim watch-page chrome around the iframe.
p = Path("src/App.vue")
s = p.read_text()
if "from '@/utils/display1988'" not in s:
    s = s.replace(
        "import { useDebounce } from '@/composables/useDebounce';",
        "import { useDebounce } from '@/composables/useDebounce';\nimport { formatCompactViews, formatRelativeTime } from '@/utils/display1988';",
        1
    )
s = s.replace(
    "  views?: string | null;\n}[]>([]);",
    "  views?: string | null;\n  published?: string | null;\n}[]>([]);",
    1
)
old_views = "views: String(row?.viewText || (row?.views ? " + chr(96) + "$" + "{row.views} views" + chr(96) + " : '')) || null"
new_views = "views: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText) || null,\n        published: formatRelativeTime(row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ?? row?.publishedAt ?? row?.published ?? row?.publishedText) || null"
if old_views in s:
    s = s.replace(old_views, new_views, 1)
s = s.replace(
    '<div v-if="result.views" class="meta">{{ result.views }}</div>',
    '<div v-if="result.views || result.published" class="meta">{{ [result.views, result.published].filter(Boolean).join(" · ") }}</div>',
    1
)
s = s.replace("width: 180px;\n  height: 100px;", "width: 156px;\n  height: 88px;", 1)
s = s.replace("padding: 12px;\n  cursor: pointer;", "padding: 10px;\n  cursor: pointer;", 1)
s = s.replace("font-size: 16px;\n  margin-bottom: 6px;", "font-size: 15px;\n  margin-bottom: 4px;", 1)
p.write_text(s)

p = Path("src/pages/WatchPage.vue")
s = p.read_text()
if "from '@/utils/display1988'" not in s:
    s = s.replace(
        "import { VideoDetails, VideoItemData } from '@/utils/helpers';",
        "import { VideoDetails, VideoItemData } from '@/utils/helpers';\nimport { formatCompactViews, formatRelativeTime } from '@/utils/display1988';",
        1
    )
old_meta = """        metadata: [
          String(row?.uploaderName || row?.uploader || row?.channelName || ''),
          String(row?.viewText || (row?.views ? String(row.views) + ' views' : ''))
        ].filter(Boolean),"""
new_meta = """        metadata: [
          String(row?.uploaderName || row?.uploader || row?.channelName || ''),
          [
            formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
            formatRelativeTime(row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ?? row?.publishedAt ?? row?.published ?? row?.publishedText)
          ].filter(Boolean).join(' · ')
        ].filter(Boolean),"""
if old_meta in s:
    s = s.replace(old_meta, new_meta, 1)

s += r'''
<style scoped>
.video-info { margin-top: 8px; }
.video-title { font-size: 18px; line-height: 1.32; margin-bottom: 9px; }
.metadata-row { padding: 3px 0 10px; }
.channel-avatar { width: 36px; height: 36px; }
.subscriber-count { display: none; }
.description { display: none; }
.secondary { margin-top: 12px; }

@media (max-width: 768px) {
  .watch-page { gap: 10px; }
  .primary { margin-top: 6px; }
  .video-title { font-size: 17px; margin-bottom: 7px; }
  .metadata-row { padding-bottom: 8px; }
  .download-btn-container,
  .separator { display: none; }
  .secondary { margin-top: 2px; }
}
</style>
'''
p.write_text(s)


# Dedicated Enter-only search page and real channel page.
p = Path("src/pages/SearchPage.vue")
p.write_text(r'''<style scoped>
.search-page {
  width: min(1080px, calc(100% - 28px));
  margin: 0 auto;
  padding: 18px 0 32px;
  color: #f4f4f4;
}

.search-heading {
  margin: 0 0 14px;
  font-size: 20px;
  font-weight: 650;
  text-align: left;
}

.section-title {
  margin: 22px 0 12px;
  font-size: 15px;
  font-weight: 650;
  color: #d8d8d8;
  text-align: left;
}

.channel-list {
  display: grid;
  gap: 8px;
}

.channel-card {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 11px 12px;
  border-radius: 12px;
  background: #252525;
  color: inherit;
  text-decoration: none;
  transition: background .15s ease;
}

.channel-card:hover { background: #2c2c2c; }

.channel-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  background: #333;
}

.channel-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #ddd;
}

.channel-name {
  font-size: 15px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-meta,
.channel-desc {
  margin-top: 3px;
  color: #969696;
  font-size: 12px;
  line-height: 1.35;
}

.channel-desc {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.channel-arrow {
  color: #888;
  font-size: 18px;
}

.video-list {
  display: grid;
  gap: 11px;
}

.video-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 12px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 9px;
  background: #303030;
}

.thumb {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,.8);
  color: #fff;
  font-size: 11px;
  font-weight: 650;
}

.video-copy {
  min-width: 0;
  text-align: left;
  padding-top: 2px;
}

.video-title {
  margin: 0 0 6px;
  color: #f2f2f2;
  font-size: 15px;
  line-height: 1.34;
  font-weight: 650;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-channel {
  color: #aaa;
  font-size: 12px;
  margin-bottom: 3px;
}

.video-meta {
  color: #858585;
  font-size: 12px;
}

.state {
  padding: 48px 12px;
  color: #929292;
  text-align: center;
}

@media (max-width: 680px) {
  .search-page {
    width: calc(100% - 18px);
    padding-top: 10px;
  }

  .search-heading {
    font-size: 18px;
    margin-bottom: 10px;
  }

  .channel-card {
    grid-template-columns: 52px minmax(0, 1fr) auto;
    padding: 9px 10px;
  }

  .channel-avatar {
    width: 46px;
    height: 46px;
  }

  .video-row {
    grid-template-columns: 42% minmax(0, 1fr);
    gap: 9px;
  }

  .video-title {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .video-channel,
  .video-meta {
    font-size: 11px;
  }
}
</style>

<template>
  <main class="search-page">
    <h1 class="search-heading">Kết quả cho “{{ query }}”</h1>

    <div v-if="loading" class="state">Đang tìm…</div>

    <template v-else>
      <template v-if="channels.length">
        <h2 class="section-title">Kênh</h2>
        <div class="channel-list">
          <router-link
            v-for="channel in channels"
            :key="channel.key"
            class="channel-card"
            :to="'/channel/' + encodeURIComponent(channel.key)"
          >
            <img
              v-if="channel.avatar"
              class="channel-avatar"
              :src="channel.avatar"
              :alt="channel.name"
              loading="lazy"
            >
            <div v-else class="channel-avatar placeholder">{{ channel.name.slice(0, 1).toUpperCase() }}</div>

            <div>
              <div class="channel-name">{{ channel.name }}</div>
              <div v-if="channel.meta" class="channel-meta">{{ channel.meta }}</div>
              <div v-if="channel.description" class="channel-desc">{{ channel.description }}</div>
            </div>
            <div class="channel-arrow">›</div>
          </router-link>
        </div>
      </template>

      <template v-if="videos.length">
        <h2 class="section-title">Video</h2>
        <div class="video-list">
          <router-link
            v-for="video in videos"
            :key="video.id"
            class="video-row"
            :to="'/watch/' + video.id"
          >
            <div class="thumb-wrap">
              <img class="thumb" :src="video.thumbnail" :alt="video.title" loading="lazy" decoding="async">
              <span v-if="video.duration" class="duration">{{ video.duration }}</span>
            </div>
            <div class="video-copy">
              <h3 class="video-title">{{ video.title }}</h3>
              <div class="video-channel">{{ video.channel }}</div>
              <div v-if="video.meta" class="video-meta">{{ video.meta }}</div>
            </div>
          </router-link>
        </div>
      </template>

      <div v-if="!channels.length && !videos.length" class="state">Không tìm thấy kết quả phù hợp.</div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { formatCompactViews, formatRelativeTime } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();

type ChannelRow = {
  key: string;
  name: string;
  avatar: string;
  meta: string;
  description: string;
};

type VideoRow = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
  meta: string;
};

const query = ref('');
const loading = ref(false);
const channels = ref<ChannelRow[]>([]);
const videos = ref<VideoRow[]>([]);

function videoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const re of [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
    /([A-Za-z0-9_-]{11})$/
  ]) {
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function durationText(value: any): string {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
    : m + ':' + String(s).padStart(2, '0');
}

function channelKey(row: any): string {
  const raw = String(row?.url || row?.channelUrl || row?.uploaderUrl || row?.id || '').trim();
  const id = raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1];
  if (id) return id;
  const user = raw.match(/\/(?:user|c)\/([^/?#]+)/)?.[1];
  if (user) return decodeURIComponent(user);
  const handle = raw.match(/\/(@[^/?#]+)/)?.[1];
  if (handle) return decodeURIComponent(handle);
  return String(row?.name || row?.title || row?.uploaderName || row?.uploader || '').trim();
}

function isChannel(row: any) {
  const type = String(row?.type || row?.itemType || '').toLowerCase();
  const raw = String(row?.url || row?.id || '');
  return type.includes('channel') || /\/channel\/|\/user\/|\/@/.test(raw);
}

function toChannel(row: any): ChannelRow | null {
  const key = channelKey(row);
  const name = String(row?.name || row?.title || row?.uploaderName || row?.uploader || '').trim();
  if (!key || !name) return null;

  const subscribers = row?.subscribers ?? row?.subscriberCount ?? '';
  const videosCount = row?.videos ?? row?.videoCount ?? '';
  const meta = [
    subscribers ? formatCompactViews(subscribers).replace(' views', ' người đăng ký') : '',
    videosCount ? Number(videosCount).toLocaleString('vi-VN') + ' video' : ''
  ].filter(Boolean).join(' · ');

  return {
    key,
    name,
    avatar: String(row?.thumbnail || row?.avatar || row?.thumbnailUrl || '').trim(),
    meta,
    description: String(row?.description || '').trim()
  };
}

function toVideo(row: any): VideoRow | null {
  const id = videoId(row);
  if (!id) return null;
  const title = String(row?.title || 'Video').trim();
  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube').trim();
  const meta = [
    formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
    formatRelativeTime(row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ?? row?.publishedAt ?? row?.published ?? row?.publishedText)
  ].filter(Boolean).join(' · ');

  return {
    id,
    title,
    channel,
    thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    duration: durationText(row?.duration),
    meta
  };
}

async function search() {
  const q = String(route.query.q || '').trim();
  query.value = q;
  channels.value = [];
  videos.value = [];
  if (!q) return;

  loading.value = true;
  try {
    const makeUrl = (filter: string) => {
      const url = new URL(API);
      url.searchParams.set('action', 'search');
      url.searchParams.set('q', q);
      url.searchParams.set('filter', filter);
      return url.toString();
    };

    const [allRes, videoRes] = await Promise.allSettled([
      fetch(makeUrl('all'), { cache: 'default' }).then(r => r.json()),
      fetch(makeUrl('videos'), { cache: 'default' }).then(r => r.json())
    ]);

    const allRows = allRes.status === 'fulfilled'
      ? (Array.isArray(allRes.value?.data?.items) ? allRes.value.data.items : [])
      : [];
    const videoRows = videoRes.status === 'fulfilled'
      ? (Array.isArray(videoRes.value?.data?.items) ? videoRes.value.data.items : [])
      : [];

    const channelSeen = new Set<string>();
    channels.value = allRows
      .filter(isChannel)
      .map(toChannel)
      .filter((row: ChannelRow | null): row is ChannelRow => {
        if (!row || channelSeen.has(row.key)) return false;
        channelSeen.add(row.key);
        return true;
      })
      .slice(0, 4);

    const seen = new Set<string>();
    videos.value = [...videoRows, ...allRows]
      .map(toVideo)
      .filter((row: VideoRow | null): row is VideoRow => {
        if (!row || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .slice(0, 30);
  } finally {
    loading.value = false;
  }
}

onMounted(search);
watch(() => route.query.q, search);
</script>
''')

p = Path("src/pages/ChannelPage.vue")
p.write_text(r'''<style scoped>
.channel-page {
  width: min(1080px, calc(100% - 28px));
  margin: 0 auto;
  padding: 16px 0 32px;
  color: #f3f3f3;
}

.channel-head {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 15px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  background: #252525;
  margin-bottom: 18px;
}

.avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  object-fit: cover;
  background: #333;
}

.avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
}

.name {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.meta {
  margin-top: 5px;
  color: #999;
  font-size: 13px;
}

.description {
  margin-top: 6px;
  color: #aaa;
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 14px;
}

.video-card {
  color: inherit;
  text-decoration: none;
}

.thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 9px;
  overflow: hidden;
  background: #303030;
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,.8);
  font-size: 11px;
  font-weight: 650;
}

.title {
  margin: 7px 1px 0;
  font-size: 14px;
  line-height: 1.35;
  font-weight: 650;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-meta {
  margin: 3px 1px 0;
  color: #888;
  font-size: 12px;
}

.state {
  padding: 52px 12px;
  text-align: center;
  color: #929292;
}

@media (max-width: 680px) {
  .channel-page { width: calc(100% - 18px); padding-top: 10px; }
  .channel-head { grid-template-columns: 62px 1fr; padding: 10px; }
  .avatar { width: 58px; height: 58px; }
  .name { font-size: 19px; }
  .video-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 8px; }
  .title { font-size: 13px; }
  .video-meta { font-size: 11px; }
}
</style>

<template>
  <main class="channel-page">
    <div v-if="loading" class="state">Đang tải kênh…</div>
    <template v-else-if="channel">
      <section class="channel-head">
        <img v-if="channel.avatar" class="avatar" :src="channel.avatar" :alt="channel.name">
        <div v-else class="avatar placeholder">{{ channel.name.slice(0, 1).toUpperCase() }}</div>
        <div>
          <h1 class="name">{{ channel.name }}</h1>
          <div v-if="channel.meta" class="meta">{{ channel.meta }}</div>
          <div v-if="channel.description" class="description">{{ channel.description }}</div>
        </div>
      </section>

      <div class="video-grid">
        <router-link
          v-for="video in videos"
          :key="video.id"
          class="video-card"
          :to="'/watch/' + video.id"
        >
          <div class="thumb-wrap">
            <img class="thumb" :src="video.thumbnail" :alt="video.title" loading="lazy">
            <span v-if="video.duration" class="duration">{{ video.duration }}</span>
          </div>
          <h3 class="title">{{ video.title }}</h3>
          <div v-if="video.meta" class="video-meta">{{ video.meta }}</div>
        </router-link>
      </div>
    </template>
    <div v-else class="state">Không tải được kênh này.</div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { formatCompactViews, formatRelativeTime } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();

const loading = ref(false);
const channel = ref<any>(null);
const videos = ref<any[]>([]);

function videoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  for (const re of [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/,
    /([A-Za-z0-9_-]{11})$/
  ]) {
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function durationText(value: any): string {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
    : m + ':' + String(s).padStart(2, '0');
}

function resolveChannelId(row: any): string {
  const raw = String(row?.url || row?.id || '').trim();
  return raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1] || '';
}

async function fetchJson(url: URL) {
  const res = await fetch(url.toString(), { cache: 'default' });
  const payload = await res.json();
  if (!res.ok || payload?.ok === false) throw new Error(payload?.error || 'request_failed');
  return payload;
}

async function resolveKey(key: string): Promise<string> {
  if (/^UC[A-Za-z0-9_-]+$/.test(key)) return key;

  const search = new URL(API);
  search.searchParams.set('action', 'search');
  search.searchParams.set('q', key.replace(/^@/, ''));
  search.searchParams.set('filter', 'channels');
  const payload = await fetchJson(search);
  const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  for (const row of rows) {
    const id = resolveChannelId(row);
    if (id) return id;
  }
  return '';
}

async function load() {
  const key = decodeURIComponent(String(route.params.id || '')).trim();
  if (!key) return;

  loading.value = true;
  channel.value = null;
  videos.value = [];

  try {
    const id = await resolveKey(key);
    if (!id) throw new Error('channel_not_found');

    const url = new URL(API);
    url.searchParams.set('action', 'channel');
    url.searchParams.set('id', id);
    const payload = await fetchJson(url);
    const data = payload?.data || {};

    const name = String(data?.name || data?.channelName || data?.title || key).trim();
    const subscribers = data?.subscriberCount ?? data?.subscribers ?? '';
    const description = String(data?.description || '').trim();

    channel.value = {
      name,
      avatar: String(data?.avatarUrl || data?.thumbnail || data?.avatar || '').trim(),
      meta: subscribers ? formatCompactViews(subscribers).replace(' views', ' người đăng ký') : '',
      description
    };

    const rows = Array.isArray(data?.relatedStreams)
      ? data.relatedStreams
      : (Array.isArray(data?.items) ? data.items : []);

    const seen = new Set<string>();
    videos.value = rows.map((row: any) => {
      const vid = videoId(row);
      if (!vid || seen.has(vid)) return null;
      seen.add(vid);
      return {
        id: vid,
        title: String(row?.title || 'Video'),
        thumbnail: 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg',
        duration: durationText(row?.duration),
        meta: [
          formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
          formatRelativeTime(row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ?? row?.publishedAt ?? row?.published ?? row?.publishedText)
        ].filter(Boolean).join(' · ')
      };
    }).filter(Boolean).slice(0, 40);
  } catch (error) {
    console.error('channel page', error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>
''')

# Add routes.
p = Path("src/router.ts")
s = p.read_text()
if "SearchPage" not in s:
    s = s.replace(
        "import WatchPage from './pages/WatchPage.vue';",
        "import WatchPage from './pages/WatchPage.vue';\nimport SearchPage from './pages/SearchPage.vue';\nimport ChannelPage from './pages/ChannelPage.vue';"
    )
    s = s.replace(
        """    {
      path: '/watch/:id',
      component: WatchPage
    }""",
        """    {
      path: '/watch/:id',
      component: WatchPage
    },
    {
      path: '/search',
      component: SearchPage
    },
    {
      path: '/channel/:id',
      component: ChannelPage
    }"""
    )
p.write_text(s)

# Search box: no live suggestions, Enter navigates to results page.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace('          @input="handleSearch"\n', '')
s = s.replace('          @keydown.down.prevent="navigateResults(\'down\')"\n', '')
s = s.replace('          @keydown.up.prevent="navigateResults(\'up\')"\n', '')
s = s.replace('          @keydown.enter="selectHighlightedVideo"\n', '          @keydown.enter.prevent="submitSearch"\n')
s = s.replace('<div v-if="searchQuery && !isLoading" class="clear-search" @click="clearSearch">×</div>', '<div v-if="searchQuery" class="clear-search" @click="clearSearch">×</div>')
s = re.sub(r'\n      <div v-if="searchResults\.length" class="search-results">[\s\S]*?\n      <div v-else-if="searchQuery && !isLoading" class="empty-results">[\s\S]*?</div>\n', '\n', s, count=1)

if "function submitSearch()" not in s:
    s = s.replace(
        "function clearSearch() {\n",
        """function submitSearch() {
  const query = searchQuery.value.trim();
  if (!query) return;
  router.push({ path: '/search', query: { q: query } });
}

function clearSearch() {
"""
    )

# No live-search debounce work at all.
s = s.replace("const handleSearch = useDebounce(performSearch, 90);", "const handleSearch = () => {};")
p.write_text(s)

# Watch page: real channel link from native browse id or fallback uploaderUrl/name.
p = Path("src/pages/WatchPage.vue")
s = p.read_text()

s = s.replace(
    "import { onMounted, onUnmounted, ref, watch } from 'vue';",
    "import { computed, onMounted, onUnmounted, ref, watch } from 'vue';"
)

if "const channelKey = ref('');" not in s:
    s = s.replace(
        "const videoDetails = ref<VideoDetails | undefined>();",
        """const videoDetails = ref<VideoDetails | undefined>();
const channelKey = ref('');
const channelTarget = computed(() => channelKey.value ? '/channel/' + encodeURIComponent(channelKey.value) : '');
"""
    )

# Native channel id if available.
native_anchor = """    videoDetails.value = {
      title: videoPrimaryInfo?.title.toString() || '',"""
if native_anchor in s and "nativeAuthor" not in s:
    s = s.replace(
        native_anchor,
        """    const nativeAuthor: any = videoSecondaryInfo?.owner?.author;
    channelKey.value = String(
      nativeAuthor?.id ||
      nativeAuthor?.channel_id ||
      nativeAuthor?.endpoint?.payload?.browseId ||
      nativeAuthor?.endpoint?.payload?.browse_id ||
      ''
    );

    videoDetails.value = {
      title: videoPrimaryInfo?.title.toString() || '',"""
    )

# Fallback channel link resolver.
fallback_anchor = """  const subscriberCount = Number(data?.subscriberCount || data?.subscribers || 0);
  const viewCount = Number(data?.views || 0);

  videoDetails.value = {"""
if fallback_anchor in s:
    s = s.replace(
        fallback_anchor,
        """  const subscriberCount = Number(data?.subscriberCount || data?.subscribers || 0);
  const viewCount = Number(data?.views || 0);

  const uploaderUrl = String(data?.uploaderUrl || '');
  const channelMatch = uploaderUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
  const handleMatch = uploaderUrl.match(/\/(@[^/?#]+)/);
  channelKey.value = channelMatch?.[1] || (handleMatch?.[1] ? decodeURIComponent(handleMatch[1]) : String(data?.uploader || data?.uploaderName || ''));

  videoDetails.value = {"""
    )

# Clear channel when switching videos.
s = s.replace(
    "  videoDetails.value = undefined;\n  document.title = 'Loading... - Kira';",
    "  videoDetails.value = undefined;\n  channelKey.value = '';\n  document.title = 'Loading... - Kira';"
)

# Clickable channel row.
old = """          <div class="channel-info">
            <img
              v-if="videoDetails.channelAvatar"
              :src="videoDetails.channelAvatar"
              class="channel-avatar"
              alt="Channel avatar"
              @error="videoDetails.channelAvatar = ''"
            >
            <div v-else class="channel-avatar channel-avatar-placeholder" aria-hidden="true">
              {{ (videoDetails.channelName || 'Y').slice(0, 1).toUpperCase() }}
            </div>
            <div class="channel-details">
              <h3 class="channel-name">{{ videoDetails.channelName }}</h3>
              <span class="subscriber-count">{{ videoDetails.subscribers }}</span>
            </div>
          </div>"""
new = """          <router-link v-if="channelTarget" class="channel-info channel-link" :to="channelTarget">
            <img
              v-if="videoDetails.channelAvatar"
              :src="videoDetails.channelAvatar"
              class="channel-avatar"
              alt="Channel avatar"
              @error="videoDetails.channelAvatar = ''"
            >
            <div v-else class="channel-avatar channel-avatar-placeholder" aria-hidden="true">
              {{ (videoDetails.channelName || 'Y').slice(0, 1).toUpperCase() }}
            </div>
            <div class="channel-details">
              <h3 class="channel-name">{{ videoDetails.channelName }}</h3>
              <span class="subscriber-count">{{ videoDetails.subscribers }}</span>
            </div>
          </router-link>
          <div v-else class="channel-info">
            <div class="channel-avatar channel-avatar-placeholder" aria-hidden="true">
              {{ (videoDetails.channelName || 'Y').slice(0, 1).toUpperCase() }}
            </div>
            <div class="channel-details">
              <h3 class="channel-name">{{ videoDetails.channelName }}</h3>
            </div>
          </div>"""
if old in s:
    s = s.replace(old, new, 1)

s += r'''
<style scoped>
.channel-link {
  color: inherit;
  text-decoration: none;
  border-radius: 10px;
  padding: 3px 5px 3px 3px;
  margin-left: -3px;
}
.channel-link:hover { background: #2a2a2a; }

@media (max-width: 768px) {
  .watch-page { padding: 0 8px; box-sizing: border-box; }
  .video-info { margin-top: 9px; }
  .video-title { font-size: 17px; line-height: 1.28; }
  .channel-info { gap: 9px; }
  .channel-avatar { width: 34px; height: 34px; }
  .channel-avatar-placeholder { flex-basis: 34px; }
  .channel-name { font-size: 15px; }
}
</style>
'''
p.write_text(s)


# Remove the obsolete live-search machinery now that search is Enter-only.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace("import SadFaceIcon from '@/components/icons/SadFaceIcon.vue';\n", "")
s = s.replace("import { useDebounce } from '@/composables/useDebounce';\n", "")
s = s.replace("  handleImageError,\n", "")

state_start = s.find("const searchResults = ref<")
state_end = s.find("const showSettingsDialog = ref(false);", state_start)
if state_start >= 0 and state_end >= 0:
    state_end += len("const showSettingsDialog = ref(false);")
    s = s[:state_start] + "const showSettingsDialog = ref(false);" + s[state_end:]

logic_start = s.find("const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';")
logic_end = s.find("const saveSettings =", logic_start)
if logic_start >= 0 and logic_end >= 0:
    minimal = r"""function submitSearch() {
  const query = searchQuery.value.trim();
  if (!query) return;
  router.push({ path: '/search', query: { q: query } });
}

function clearSearch() {
  searchQuery.value = '';
}

"""
    s = s[:logic_start] + minimal + s[logic_end:]

p.write_text(s)


# Final Enter-only App cleanup: no live loader/imports.
p = Path("src/App.vue")
s = p.read_text()
s = s.replace('<div v-if="isLoading" class="loader"></div>\n', '')
s = s.replace("import { formatCompactViews, formatRelativeTime } from '@/utils/display1988';\n", "")
p.write_text(s)


# 1988 modern design system: Inter + Lucide icon set + compact sticky shell.
p = Path("package.json")
pkg = p.read_text()
if '"lucide-vue-next"' not in pkg:
    pkg = pkg.replace(
        '"googlevideo": "^4.0.4",',
        '"googlevideo": "^4.0.4",\n    "@lucide/vue": "latest",'
    )
p.write_text(pkg)

p = Path("index.html")
s = p.read_text()
if "fonts.googleapis.com/css2?family=Inter" not in s:
    s = s.replace(
        "</head>",
        """    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap" rel="stylesheet">
</head>""",
        1
    )
p.write_text(s)

p = Path("src/App.vue")
s = p.read_text()

new_style = r'''<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(html) {
  color-scheme: dark;
  background: #09090b;
}

:global(body) {
  margin: 0;
  min-width: 280px;
  min-height: 100vh;
  background: #09090b;
  color: #f4f4f5;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

:global(button),
:global(input),
:global(select) {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 50% -180px, rgba(99,102,241,.10), transparent 420px),
    #09090b;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid rgba(63,63,70,.58);
  background: rgba(9,9,11,.86);
  backdrop-filter: blur(18px) saturate(130%);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
}

.header-inner {
  width: min(1280px, calc(100% - 24px));
  min-height: 64px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto minmax(180px, 620px) auto;
  align-items: center;
  gap: 14px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #fafafa;
  text-decoration: none;
  min-width: 0;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #6366f1, #8b5cf6);
  box-shadow: 0 7px 20px rgba(99,102,241,.24);
}

.brand-mark :deep(svg) {
  width: 18px;
  height: 18px;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.02em;
}

.brand-subtitle {
  margin-top: 4px;
  color: #71717a;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.global-search {
  position: relative;
  width: 100%;
}

.search-leading {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  width: 17px;
  height: 17px;
  color: #71717a;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 42px 0 39px;
  border-radius: 20px;
  border: 1px solid #27272a;
  background: rgba(24,24,27,.92);
  color: #f4f4f5;
  outline: none;
  font-size: 13px;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}

.search-input::placeholder {
  color: #71717a;
}

.search-input:focus {
  border-color: rgba(99,102,241,.72);
  background: #18181b;
  box-shadow: 0 0 0 3px rgba(99,102,241,.11);
}

.clear-search {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #71717a;
  cursor: pointer;
}

.clear-search:hover {
  color: #e4e4e7;
  background: #27272a;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.icon-button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #a1a1aa;
  text-decoration: none;
  cursor: pointer;
  transition: color .15s ease, background .15s ease, transform .15s ease;
}

.icon-button:hover {
  color: #fafafa;
  background: #18181b;
}

.icon-button:active {
  transform: scale(.96);
}

.icon-button :deep(svg) {
  width: 19px;
  height: 19px;
  stroke-width: 2;
}

.main-content {
  width: 100%;
}

@media (max-width: 640px) {
  .header-inner {
    width: calc(100% - 16px);
    min-height: 60px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .brand-copy {
    display: none;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }

  .search-input {
    height: 38px;
    font-size: 13px;
  }

  .header-actions {
    gap: 2px;
  }

  .home-link {
    display: none;
  }

  .icon-button {
    width: 36px;
    height: 36px;
  }
}
</style>'''

new_template = r'''<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <router-link to="/" class="brand" aria-label="Kira - Trang chủ">
          <span class="brand-mark"><Play :fill="'currentColor'"/></span>
          <span class="brand-copy">
            <span class="brand-name">Kira</span>
            <span class="brand-subtitle">Media</span>
          </span>
        </router-link>

        <form class="global-search" role="search" @submit.prevent="submitSearch">
          <Search class="search-leading" aria-hidden="true"/>
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            inputmode="search"
            autocomplete="off"
            enterkeyhint="search"
            placeholder="Tìm video, bài hát, kênh..."
            aria-label="Tìm kiếm"
          >
          <button
            v-if="searchQuery"
            type="button"
            class="clear-search"
            aria-label="Xóa tìm kiếm"
            @click="clearSearch"
          >
            <X :size="16"/>
          </button>
        </form>

        <nav class="header-actions" aria-label="Điều hướng">
          <router-link to="/" class="icon-button home-link" aria-label="Trang chủ" title="Trang chủ">
            <Home/>
          </router-link>
          <button
            class="icon-button"
            type="button"
            aria-label="Cài đặt"
            title="Cài đặt"
            @click="showSettingsDialog = true"
          >
            <Settings2/>
          </button>
        </nav>
      </div>
    </header>

    <main class="main-content">
      <router-view/>
    </main>

    <ToastNotification/>
    <SettingsDialog
      v-if="showSettingsDialog"
      @close="showSettingsDialog = false"
      @save="saveSettings"
    />
  </div>
</template>'''

s = re.sub(r'<style scoped>[\s\S]*?</style>', new_style, s, count=1)
s = re.sub(r'<template>[\s\S]*?</template>', new_template, s, count=1)

if "from '@lucide/vue'" not in s:
    s = s.replace(
        "import { useRouter } from 'vue-router';",
        "import { useRouter } from 'vue-router';\nimport { Home, Play, Search, Settings2, X } from '@lucide/vue';",
        1
    )

p.write_text(s)


# Remove superseded Kira icon imports after switching the shell to Lucide.
p = Path("src/App.vue")
s = p.read_text()
for line in [
    "import HomeIcon from '@/components/icons/HomeIcon.vue';\n",
    "import SearchIcon from '@/components/icons/SearchIcon.vue';\n",
    "import SettingsIcon from '@/components/icons/SettingsIcon.vue';\n"
]:
    s = s.replace(line, "")
p.write_text(s)


# Modern Home toolbar and video cards with the shared Lucide icon system.
p = Path("src/pages/HomePage.vue")
s = p.read_text()

new_style = r'''<style scoped>
.home {
  width: min(1180px, calc(100% - 28px));
  margin: 0 auto;
  padding: 22px 0 34px;
  color: #f4f4f5;
}

.recommendations-section {
  width: 100%;
}

.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.heading-block {
  min-width: 0;
  text-align: left;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  color: #818cf8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.eyebrow :deep(svg) {
  width: 14px;
  height: 14px;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 9px;
}

.section-header h1 {
  margin: 0;
  color: #fafafa;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -.025em;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #27272a;
  background: #18181b;
  color: #71717a;
  font-size: 11px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.sort-control {
  position: relative;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 10px;
  border: 1px solid #27272a;
  border-radius: 10px;
  background: #18181b;
  color: #a1a1aa;
}

.sort-control > :deep(svg:first-child) {
  width: 15px;
  height: 15px;
}

.sort-select {
  height: 34px;
  min-width: 108px;
  padding: 0 28px 0 0;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  color: #e4e4e7;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sort-chevron {
  position: absolute;
  right: 8px;
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.icon-action {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid #27272a;
  border-radius: 10px;
  background: #18181b;
  color: #a1a1aa;
  cursor: pointer;
  transition: color .15s ease, background .15s ease, border-color .15s ease;
}

.icon-action:hover {
  color: #fafafa;
  background: #202023;
  border-color: #3f3f46;
}

.icon-action :deep(svg) {
  width: 17px;
  height: 17px;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
  gap: 22px 16px;
}

.recommendations-state {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #71717a;
  font-size: 13px;
}

@media (max-width: 680px) {
  .home {
    width: calc(100% - 18px);
    padding-top: 14px;
  }

  .section-header {
    align-items: center;
    margin-bottom: 14px;
  }

  .eyebrow {
    display: none;
  }

  .section-header h1 {
    font-size: 19px;
  }

  .count-badge {
    height: 20px;
    padding: 0 7px;
  }

  .sort-control {
    height: 34px;
    padding-left: 8px;
  }

  .sort-control > :deep(svg:first-child) {
    display: none;
  }

  .sort-select {
    min-width: 94px;
    height: 32px;
    font-size: 11px;
  }

  .icon-action {
    width: 34px;
    height: 34px;
  }

  .video-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
</style>'''

new_template = r'''<template>
  <div class="home">
    <section class="recommendations-section">
      <header class="section-header">
        <div class="heading-block">
          <div class="eyebrow"><Sparkles/> Khám phá</div>
          <div class="title-line">
            <h1>Video đề xuất</h1>
            <span class="count-badge">{{ sortedRecommendations.length }}</span>
          </div>
        </div>

        <div class="header-actions">
          <label class="sort-control" title="Sắp xếp">
            <SlidersHorizontal aria-hidden="true"/>
            <select v-model="sortMode" class="sort-select" aria-label="Sắp xếp video">
              <option value="newest">Mới nhất</option>
              <option value="views">Nhiều view</option>
              <option value="lowViews">Ít view</option>
              <option value="oldest">Cũ nhất</option>
            </select>
            <ChevronDown class="sort-chevron" aria-hidden="true"/>
          </label>

          <button
            class="icon-action"
            type="button"
            :title="showRecommendations ? 'Ẩn video đề xuất' : 'Hiện video đề xuất'"
            :aria-label="showRecommendations ? 'Ẩn video đề xuất' : 'Hiện video đề xuất'"
            @click="toggleRecommendations"
          >
            <EyeOff v-if="showRecommendations"/>
            <Eye v-else/>
          </button>
        </div>
      </header>

      <template v-if="showRecommendations">
        <div v-if="loading" class="recommendations-state">Đang tải video…</div>
        <div v-else-if="!sortedRecommendations.length" class="recommendations-state">
          Chưa có video phù hợp.
        </div>
        <div v-else class="video-grid">
          <GridVideoItem
            v-for="video in sortedRecommendations"
            :key="video.videoId"
            :data="video"
          />
        </div>
      </template>
    </section>
  </div>
</template>'''

s = re.sub(r'<style scoped>[\s\S]*?</style>', new_style, s, count=1)
s = re.sub(r'<template>[\s\S]*?</template>', new_template, s, count=1)

if "from '@lucide/vue'" not in s:
    s = s.replace(
        "import { computed, onMounted, ref, watch } from 'vue';",
        "import { computed, onMounted, ref, watch } from 'vue';\nimport { ChevronDown, Eye, EyeOff, SlidersHorizontal, Sparkles } from '@lucide/vue';",
        1
    )

# Ignore the old saved sorting preference once so the refreshed UI starts newest-first.
s = s.replace("'videoSortMode'", "'videoSortModeV2'")
p.write_text(s)

p = Path("src/components/GridVideoItem.vue")
p.write_text(r'''<style scoped>
.grid-video-item {
  display: block;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.thumbnail-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  background: #18181b;
  border: 1px solid rgba(63,63,70,.54);
}

.thumbnail {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform .25s ease, filter .25s ease;
}

.grid-video-item:hover .thumbnail {
  transform: scale(1.015);
  filter: brightness(.96);
}

.duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  height: 21px;
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(9,9,11,.86);
  color: #fafafa;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(6px);
}

.video-details {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 9px;
  padding: 9px 2px 0;
  text-align: left;
}

.channel-badge {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, #27272a, #18181b);
  border: 1px solid #3f3f46;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.copy {
  min-width: 0;
}

.title {
  margin: 0;
  color: #f4f4f5;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.38;
  letter-spacing: -.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.grid-video-item:hover .title {
  color: #c7d2fe;
}

.channel {
  margin-top: 5px;
  color: #a1a1aa;
  font-size: 11.5px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  margin-top: 2px;
  color: #71717a;
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 680px) {
  .thumbnail-container {
    border-radius: 11px;
  }

  .video-details {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 8px;
    padding-top: 8px;
  }

  .channel-badge {
    width: 32px;
    height: 32px;
  }

  .title {
    font-size: 14px;
  }
}
</style>

<template>
  <router-link class="grid-video-item" :to="'/watch/' + data.videoId">
    <div class="thumbnail-container">
      <img
        :src="data.thumbnail"
        :alt="data.titleText || data.title"
        class="thumbnail"
        loading="lazy"
        decoding="async"
        @error="handleImageError($event.target as any)"
      >
      <span v-if="data.duration" class="duration">{{ data.duration }}</span>
    </div>

    <div class="video-details">
      <div class="channel-badge" aria-hidden="true">{{ channelInitial }}</div>
      <div class="copy">
        <h3 class="title" v-html="data.title" :title="data.titleText"/>
        <div v-if="channel" class="channel">{{ channel }}</div>
        <div v-if="meta" class="meta">{{ meta }}</div>
      </div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { handleImageError, VideoItemData } from '@/utils/helpers';
import { compactMetadata, normalizeMetadataText } from '@/utils/display1988';

const props = defineProps<{ data: VideoItemData }>();
const channel = computed(() => normalizeMetadataText(props.data.metadata?.[0] || ''));
const meta = computed(() => compactMetadata((props.data.metadata || []).slice(1)));
const channelInitial = computed(() => (channel.value || 'Y').slice(0, 1).toUpperCase());
</script>
''')

p = Path("src/components/RelatedVideoItem.vue")
p.write_text(r'''<style scoped>
.related-video-item {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 12px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.thumbnail-container {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 9px;
  background: #18181b;
  border: 1px solid rgba(63,63,70,.48);
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(9,9,11,.84);
  color: #fafafa;
  font-size: 10px;
  font-weight: 700;
}

.video-details {
  min-width: 0;
  text-align: left;
  padding-top: 1px;
}

.title {
  margin: 0;
  color: #f4f4f5;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.36;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.related-video-item:hover .title {
  color: #c7d2fe;
}

.channel,
.metadata {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel {
  margin-top: 5px;
  color: #a1a1aa;
  font-size: 11.5px;
}

.metadata {
  margin-top: 2px;
  color: #71717a;
  font-size: 11px;
}

@media (max-width: 560px) {
  .related-video-item {
    grid-template-columns: 42% minmax(0, 1fr);
    gap: 9px;
  }

  .title {
    font-size: 13px;
  }
}
</style>

<template>
  <router-link class="related-video-item" :to="'/watch/' + data.videoId">
    <div class="thumbnail-container">
      <img
        :src="data.thumbnail"
        :alt="data.titleText || data.title"
        class="thumbnail"
        loading="lazy"
        decoding="async"
        @error="handleImageError($event.target as any)"
      >
      <span v-if="data.duration" class="duration">{{ data.duration }}</span>
    </div>

    <div class="video-details">
      <h3 class="title" v-html="data.title" :title="data.titleText"/>
      <div v-if="channel" class="channel">{{ channel }}</div>
      <div v-if="meta" class="metadata">{{ meta }}</div>
    </div>
  </router-link>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { handleImageError, VideoItemData } from '@/utils/helpers';
import { compactMetadata, normalizeMetadataText } from '@/utils/display1988';

const props = defineProps<{ data: VideoItemData }>();
const channel = computed(() => normalizeMetadataText(props.data.metadata?.[0] || ''));
const meta = computed(() => compactMetadata((props.data.metadata || []).slice(1)));
</script>
''')


# Rewrite HomePage atomically so nested Vue <template> blocks cannot be corrupted.
p = Path("src/pages/HomePage.vue")
p.write_text(r'''<style scoped>
.home {
  width: min(1180px, calc(100% - 28px));
  margin: 0 auto;
  padding: 22px 0 34px;
  color: #f4f4f5;
}

.recommendations-section { width: 100%; }

.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.heading-block {
  min-width: 0;
  text-align: left;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  color: #818cf8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.eyebrow :deep(svg) {
  width: 14px;
  height: 14px;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 9px;
}

.section-header h1 {
  margin: 0;
  color: #fafafa;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -.025em;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid #27272a;
  background: #18181b;
  color: #71717a;
  font-size: 11px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.sort-control {
  position: relative;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 10px;
  border: 1px solid #27272a;
  border-radius: 10px;
  background: #18181b;
  color: #a1a1aa;
}

.sort-control > :deep(svg:first-child) {
  width: 15px;
  height: 15px;
}

.sort-select {
  height: 34px;
  min-width: 108px;
  padding: 0 28px 0 0;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  color: #e4e4e7;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sort-chevron {
  position: absolute;
  right: 8px;
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.icon-action {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid #27272a;
  border-radius: 10px;
  background: #18181b;
  color: #a1a1aa;
  cursor: pointer;
  transition: color .15s ease, background .15s ease, border-color .15s ease;
}

.icon-action:hover {
  color: #fafafa;
  background: #202023;
  border-color: #3f3f46;
}

.icon-action :deep(svg) {
  width: 17px;
  height: 17px;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
  gap: 22px 16px;
}

.recommendations-state {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: #71717a;
  font-size: 13px;
}

@media (max-width: 680px) {
  .home {
    width: calc(100% - 18px);
    padding-top: 14px;
  }

  .section-header {
    align-items: center;
    margin-bottom: 14px;
  }

  .eyebrow { display: none; }

  .section-header h1 { font-size: 19px; }

  .count-badge {
    height: 20px;
    padding: 0 7px;
  }

  .sort-control {
    height: 34px;
    padding-left: 8px;
  }

  .sort-control > :deep(svg:first-child) { display: none; }

  .sort-select {
    min-width: 94px;
    height: 32px;
    font-size: 11px;
  }

  .icon-action {
    width: 34px;
    height: 34px;
  }

  .video-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
</style>

<template>
  <div class="home">
    <section class="recommendations-section">
      <header class="section-header">
        <div class="heading-block">
          <div class="eyebrow"><Sparkles/> Khám phá</div>
          <div class="title-line">
            <h1>Video đề xuất</h1>
            <span class="count-badge">{{ sortedRecommendations.length }}</span>
          </div>
        </div>

        <div class="header-actions">
          <label class="sort-control" title="Sắp xếp">
            <SlidersHorizontal aria-hidden="true"/>
            <select v-model="sortMode" class="sort-select" aria-label="Sắp xếp video">
              <option value="newest">Mới nhất</option>
              <option value="views">Nhiều view</option>
              <option value="lowViews">Ít view</option>
              <option value="oldest">Cũ nhất</option>
            </select>
            <ChevronDown class="sort-chevron" aria-hidden="true"/>
          </label>

          <button
            class="icon-action"
            type="button"
            :title="showRecommendations ? 'Ẩn video đề xuất' : 'Hiện video đề xuất'"
            :aria-label="showRecommendations ? 'Ẩn video đề xuất' : 'Hiện video đề xuất'"
            @click="toggleRecommendations"
          >
            <EyeOff v-if="showRecommendations"/>
            <Eye v-else/>
          </button>
        </div>
      </header>

      <div v-if="showRecommendations && loading" class="recommendations-state">
        Đang tải video…
      </div>

      <div
        v-else-if="showRecommendations && !sortedRecommendations.length"
        class="recommendations-state"
      >
        Chưa có video phù hợp.
      </div>

      <div v-else-if="showRecommendations" class="video-grid">
        <GridVideoItem
          v-for="video in sortedRecommendations"
          :key="video.videoId"
          :data="video"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronDown, Eye, EyeOff, SlidersHorizontal, Sparkles } from '@lucide/vue';
import GridVideoItem from '@/components/GridVideoItem.vue';
import { useToastStore } from '@/stores/toastStore';
import type { VideoItemData } from '@/utils/helpers';
import {
  formatCompactViews,
  formatRelativeTime,
  numericViews,
  parsePublishedAt
} from '@/utils/display1988';

const FALLBACK_DISCOVERY_API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';

type SortMode = 'newest' | 'views' | 'lowViews' | 'oldest';
type HomeVideo = VideoItemData & {
  viewCount?: number;
  publishedAt?: number;
};

const { addToast } = useToastStore();
const loading = ref(true);
const showRecommendations = ref(true);
const sortMode = ref<SortMode>('newest');
const homeRecommendations = ref<HomeVideo[]>([]);

watch(showRecommendations, (value) => {
  localStorage.setItem('showRecommendations', value.toString());
});

watch(sortMode, (value) => {
  localStorage.setItem('videoSortModeV2', value);
});

function toggleRecommendations() {
  showRecommendations.value = !showRecommendations.value;
}

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
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
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

  const response = await fetch(url.toString(), { cache: 'default' });
  const payload = await response.json();

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'fallback_home_' + action + '_' + response.status);
  }
  return fallbackRows(payload);
}

function publishedRaw(row: any) {
  return row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
    row?.publishedAt ?? row?.published ?? row?.publishedText ?? '';
}

function toRecommendation(row: any): HomeVideo | null {
  const videoId = fallbackVideoId(row);
  if (!videoId) return null;

  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube');
  const viewsRaw = row?.views ?? row?.viewCount ?? row?.viewText ?? '';
  const viewCount = numericViews(viewsRaw);
  const published = publishedRaw(row);
  const publishedAt = parsePublishedAt(published);

  const meta = [
    formatCompactViews(viewsRaw),
    formatRelativeTime(published)
  ].filter(Boolean).join(' · ');

  return {
    videoId,
    title: String(row?.title || 'Video'),
    titleText: String(row?.title || 'Video'),
    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
    metadata: [channel, meta].filter(Boolean),
    duration: durationText(row?.duration),
    viewCount,
    publishedAt
  };
}

async function loadFallbackRecommendations() {
  const topicQueries = [
    'tin mới Việt Nam',
    'nhạc Việt mới',
    'giải trí Việt Nam mới',
    'thể thao mới',
    'công nghệ mới',
    'ẩm thực mới'
  ];

  const [trendingResult, ...topicResults] = await Promise.allSettled([
    fetchFallbackRows('trending', { region: 'VN' }),
    ...topicQueries.map((q) => fetchFallbackRows('search', { q, filter: 'videos' }))
  ]);

  const rows: HomeVideo[] = [];
  const seen = new Set<string>();

  const addRows = (rawRows: any[], limit: number) => {
    for (const raw of rawRows.slice(0, limit)) {
      const row = toRecommendation(raw);
      if (!row || seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      rows.push(row);
    }
  };

  if (trendingResult.status === 'fulfilled') {
    addRows(trendingResult.value, 12);
  }

  for (const result of topicResults) {
    if (result.status === 'fulfilled') {
      addRows(result.value, 8);
    }
  }

  homeRecommendations.value = rows.slice(0, 36);
}

const sortedRecommendations = computed(() => {
  const rows = homeRecommendations.value.slice();

  if (sortMode.value === 'views') {
    return rows.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  }

  if (sortMode.value === 'lowViews') {
    return rows.sort((a, b) => {
      const av = a.viewCount || 0;
      const bv = b.viewCount || 0;
      if (!av && bv) return 1;
      if (!bv && av) return -1;
      return av - bv;
    });
  }

  if (sortMode.value === 'oldest') {
    return rows.sort((a, b) => {
      const at = a.publishedAt || 0;
      const bt = b.publishedAt || 0;
      if (!at && bt) return 1;
      if (!bt && at) return -1;
      return at - bt;
    });
  }

  return rows.sort((a, b) => {
    const at = a.publishedAt || 0;
    const bt = b.publishedAt || 0;

    if (at !== bt) {
      if (!at) return 1;
      if (!bt) return -1;
      return bt - at;
    }

    return (b.viewCount || 0) - (a.viewCount || 0);
  });
});

onMounted(async () => {
  loading.value = true;

  const savedVisibility = localStorage.getItem('showRecommendations');
  if (savedVisibility !== null) {
    showRecommendations.value = savedVisibility === 'true';
  }

  const savedSort = localStorage.getItem('videoSortModeV2') as SortMode | null;
  if (savedSort && ['newest', 'views', 'lowViews', 'oldest'].includes(savedSort)) {
    sortMode.value = savedSort;
  } else {
    sortMode.value = 'newest';
  }

  try {
    await loadFallbackRecommendations();
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    addToast('Không tải được video đề xuất.', 'error');
  } finally {
    loading.value = false;
  }
});
</script>
''')


# Modern Enter-only search results and channel pages.
p = Path("src/pages/SearchPage.vue")
p.write_text(r'''<style scoped>
.search-page {
  width: min(1040px, calc(100% - 28px));
  margin: 0 auto;
  padding: 22px 0 40px;
  color: #f4f4f5;
}

.page-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  text-align: left;
}

.heading-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: #18181b;
  border: 1px solid #27272a;
  color: #818cf8;
  flex-shrink: 0;
}

.heading-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.page-heading h1 {
  margin: 0;
  color: #fafafa;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -.02em;
}

.page-heading p {
  margin: 3px 0 0;
  color: #71717a;
  font-size: 12px;
}

.section-title {
  margin: 24px 0 10px;
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  text-align: left;
}

.channel-list {
  display: grid;
  gap: 8px;
}

.channel-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #27272a;
  border-radius: 13px;
  background: #18181b;
  color: inherit;
  text-decoration: none;
  transition: background .15s ease, border-color .15s ease, transform .15s ease;
}

.channel-card:hover {
  background: #202023;
  border-color: #3f3f46;
  transform: translateY(-1px);
}

.channel-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  background: #27272a;
  border: 1px solid #3f3f46;
}

.channel-avatar.placeholder {
  display: grid;
  place-items: center;
  color: #a1a1aa;
}

.channel-avatar.placeholder :deep(svg) {
  width: 23px;
  height: 23px;
}

.channel-copy {
  min-width: 0;
  text-align: left;
}

.channel-name {
  color: #f4f4f5;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-meta,
.channel-desc {
  color: #71717a;
  font-size: 11.5px;
  line-height: 1.4;
}

.channel-meta { margin-top: 3px; }

.channel-desc {
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-arrow {
  width: 18px;
  height: 18px;
  color: #52525b;
}

.video-list {
  display: grid;
  gap: 11px;
}

.video-row {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid rgba(63,63,70,.5);
  border-radius: 10px;
  background: #18181b;
}

.thumb {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform .2s ease;
}

.video-row:hover .thumb {
  transform: scale(1.015);
}

.duration {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(9,9,11,.86);
  color: #fafafa;
  font-size: 10px;
  font-weight: 700;
}

.video-copy {
  min-width: 0;
  padding-top: 2px;
  text-align: left;
}

.video-title {
  margin: 0;
  color: #f4f4f5;
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.38;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-row:hover .video-title {
  color: #c7d2fe;
}

.video-channel {
  margin-top: 6px;
  color: #a1a1aa;
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-meta {
  margin-top: 2px;
  color: #71717a;
  font-size: 11px;
}

.state {
  min-height: 260px;
  display: grid;
  place-items: center;
  color: #71717a;
  font-size: 13px;
}

@media (max-width: 680px) {
  .search-page {
    width: calc(100% - 18px);
    padding-top: 14px;
  }

  .page-heading {
    margin-bottom: 16px;
  }

  .heading-icon {
    width: 34px;
    height: 34px;
  }

  .page-heading h1 {
    font-size: 18px;
  }

  .channel-card {
    grid-template-columns: 50px minmax(0, 1fr) auto;
    gap: 9px;
    padding: 9px;
  }

  .channel-avatar {
    width: 46px;
    height: 46px;
  }

  .video-row {
    grid-template-columns: 42% minmax(0, 1fr);
    gap: 9px;
  }

  .video-title {
    font-size: 13.5px;
  }

  .video-channel,
  .video-meta {
    font-size: 10.8px;
  }
}
</style>

<template>
  <main class="search-page">
    <header class="page-heading">
      <div class="heading-icon"><Search/></div>
      <div>
        <h1>Kết quả tìm kiếm</h1>
        <p>“{{ query }}”</p>
      </div>
    </header>

    <div v-if="loading" class="state">Đang tìm…</div>

    <template v-else>
      <section v-if="channels.length">
        <h2 class="section-title">Kênh</h2>
        <div class="channel-list">
          <router-link
            v-for="channel in channels"
            :key="channel.key"
            class="channel-card"
            :to="'/channel/' + encodeURIComponent(channel.key)"
          >
            <img
              v-if="channel.avatar"
              class="channel-avatar"
              :src="channel.avatar"
              :alt="channel.name"
              loading="lazy"
            >
            <div v-else class="channel-avatar placeholder" aria-hidden="true">
              <UserRound/>
            </div>

            <div class="channel-copy">
              <div class="channel-name">{{ channel.name }}</div>
              <div v-if="channel.meta" class="channel-meta">{{ channel.meta }}</div>
              <div v-if="channel.description" class="channel-desc">{{ channel.description }}</div>
            </div>

            <ChevronRight class="channel-arrow" aria-hidden="true"/>
          </router-link>
        </div>
      </section>

      <section v-if="videos.length">
        <h2 class="section-title">Video</h2>
        <div class="video-list">
          <router-link
            v-for="video in videos"
            :key="video.id"
            class="video-row"
            :to="'/watch/' + video.id"
          >
            <div class="thumb-wrap">
              <img
                class="thumb"
                :src="video.thumbnail"
                :alt="video.title"
                loading="lazy"
                decoding="async"
              >
              <span v-if="video.duration" class="duration">{{ video.duration }}</span>
            </div>

            <div class="video-copy">
              <h3 class="video-title">{{ video.title }}</h3>
              <div class="video-channel">{{ video.channel }}</div>
              <div v-if="video.meta" class="video-meta">{{ video.meta }}</div>
            </div>
          </router-link>
        </div>
      </section>

      <div v-if="!channels.length && !videos.length" class="state">
        Không tìm thấy kết quả phù hợp.
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight, Search, UserRound } from '@lucide/vue';
import { formatCompactViews, formatRelativeTime } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();

type ChannelRow = {
  key: string;
  name: string;
  avatar: string;
  meta: string;
  description: string;
};

type VideoRow = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
  meta: string;
};

const query = ref('');
const loading = ref(false);
const channels = ref<ChannelRow[]>([]);
const videos = ref<VideoRow[]>([]);

function videoId(row: any): string {
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

function durationText(value: any): string {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);

  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

function channelKey(row: any): string {
  const raw = String(row?.url || row?.channelUrl || row?.uploaderUrl || row?.id || '').trim();
  const id = raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1];
  if (id) return id;

  const user = raw.match(/\/(?:user|c)\/([^/?#]+)/)?.[1];
  if (user) return decodeURIComponent(user);

  const handle = raw.match(/\/(@[^/?#]+)/)?.[1];
  if (handle) return decodeURIComponent(handle);

  return String(row?.name || row?.title || row?.uploaderName || row?.uploader || '').trim();
}

function isChannel(row: any) {
  const type = String(row?.type || row?.itemType || '').toLowerCase();
  const raw = String(row?.url || row?.id || '');
  return type.includes('channel') || /\/channel\/|\/user\/|\/@/.test(raw);
}

function toChannel(row: any): ChannelRow | null {
  const key = channelKey(row);
  const name = String(row?.name || row?.title || row?.uploaderName || row?.uploader || '').trim();
  if (!key || !name) return null;

  const subscribers = row?.subscribers ?? row?.subscriberCount ?? '';
  const videosCount = row?.videos ?? row?.videoCount ?? '';

  const meta = [
    subscribers ? formatCompactViews(subscribers).replace(' views', ' người đăng ký') : '',
    videosCount ? Number(videosCount).toLocaleString('vi-VN') + ' video' : ''
  ].filter(Boolean).join(' · ');

  return {
    key,
    name,
    avatar: String(row?.thumbnail || row?.avatar || row?.thumbnailUrl || '').trim(),
    meta,
    description: String(row?.description || '').trim()
  };
}

function toVideo(row: any): VideoRow | null {
  const id = videoId(row);
  if (!id) return null;

  const title = String(row?.title || 'Video').trim();
  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube').trim();

  const meta = [
    formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
    formatRelativeTime(
      row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
      row?.publishedAt ?? row?.published ?? row?.publishedText
    )
  ].filter(Boolean).join(' · ');

  return {
    id,
    title,
    channel,
    thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    duration: durationText(row?.duration),
    meta
  };
}

async function search() {
  const q = String(route.query.q || '').trim();
  query.value = q;
  channels.value = [];
  videos.value = [];

  if (!q) return;

  loading.value = true;
  try {
    const makeUrl = (filter: string) => {
      const url = new URL(API);
      url.searchParams.set('action', 'search');
      url.searchParams.set('q', q);
      url.searchParams.set('filter', filter);
      return url.toString();
    };

    const [allRes, videoRes] = await Promise.allSettled([
      fetch(makeUrl('all'), { cache: 'default' }).then((r) => r.json()),
      fetch(makeUrl('videos'), { cache: 'default' }).then((r) => r.json())
    ]);

    const allRows = allRes.status === 'fulfilled'
      ? (Array.isArray(allRes.value?.data?.items) ? allRes.value.data.items : [])
      : [];

    const videoRows = videoRes.status === 'fulfilled'
      ? (Array.isArray(videoRes.value?.data?.items) ? videoRes.value.data.items : [])
      : [];

    const channelSeen = new Set<string>();
    channels.value = allRows
      .filter(isChannel)
      .map(toChannel)
      .filter((row: ChannelRow | null): row is ChannelRow => {
        if (!row || channelSeen.has(row.key)) return false;
        channelSeen.add(row.key);
        return true;
      })
      .slice(0, 4);

    const seen = new Set<string>();
    videos.value = [...videoRows, ...allRows]
      .map(toVideo)
      .filter((row: VideoRow | null): row is VideoRow => {
        if (!row || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .slice(0, 30);
  } finally {
    loading.value = false;
  }
}

onMounted(search);
watch(() => route.query.q, search);
</script>
''')

p = Path("src/pages/ChannelPage.vue")
p.write_text(r'''<style scoped>
.channel-page {
  width: min(1080px, calc(100% - 28px));
  margin: 0 auto;
  padding: 22px 0 40px;
  color: #f4f4f5;
}

.channel-head {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 16px;
  margin-bottom: 24px;
  border: 1px solid #27272a;
  border-radius: 15px;
  background: #18181b;
}

.avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  object-fit: cover;
  background: #27272a;
  border: 1px solid #3f3f46;
}

.avatar.placeholder {
  display: grid;
  place-items: center;
  color: #a1a1aa;
}

.avatar.placeholder :deep(svg) {
  width: 30px;
  height: 30px;
}

.channel-copy {
  min-width: 0;
  text-align: left;
}

.name {
  margin: 0;
  color: #fafafa;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -.025em;
}

.meta {
  margin-top: 5px;
  color: #a1a1aa;
  font-size: 12px;
}

.description {
  max-width: 720px;
  margin-top: 7px;
  color: #71717a;
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 12px;
  color: #d4d4d8;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
}

.section-heading :deep(svg) {
  width: 16px;
  height: 16px;
  color: #818cf8;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px 14px;
}

.video-card {
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid rgba(63,63,70,.52);
  border-radius: 11px;
  background: #18181b;
}

.thumb {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform .2s ease;
}

.video-card:hover .thumb {
  transform: scale(1.015);
}

.duration {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(9,9,11,.86);
  color: #fafafa;
  font-size: 10px;
  font-weight: 700;
}

.title {
  margin: 8px 2px 0;
  color: #f4f4f5;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.38;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.video-card:hover .title {
  color: #c7d2fe;
}

.video-meta {
  margin: 4px 2px 0;
  color: #71717a;
  font-size: 11px;
}

.state {
  min-height: 280px;
  display: grid;
  place-items: center;
  color: #71717a;
  font-size: 13px;
}

@media (max-width: 680px) {
  .channel-page {
    width: calc(100% - 18px);
    padding-top: 14px;
  }

  .channel-head {
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 11px;
    padding: 11px;
    margin-bottom: 18px;
  }

  .avatar {
    width: 58px;
    height: 58px;
  }

  .avatar.placeholder :deep(svg) {
    width: 24px;
    height: 24px;
  }

  .name {
    font-size: 18px;
  }

  .description {
    -webkit-line-clamp: 1;
  }

  .video-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 8px;
  }

  .title {
    font-size: 12.5px;
  }

  .video-meta {
    font-size: 10.5px;
  }
}
</style>

<template>
  <main class="channel-page">
    <div v-if="loading" class="state">Đang tải kênh…</div>

    <template v-else-if="channel">
      <section class="channel-head">
        <img
          v-if="channel.avatar"
          class="avatar"
          :src="channel.avatar"
          :alt="channel.name"
        >
        <div v-else class="avatar placeholder" aria-hidden="true">
          <UserRound/>
        </div>

        <div class="channel-copy">
          <h1 class="name">{{ channel.name }}</h1>
          <div v-if="channel.meta" class="meta">{{ channel.meta }}</div>
          <div v-if="channel.description" class="description">{{ channel.description }}</div>
        </div>
      </section>

      <h2 class="section-heading"><Video/> Video của kênh</h2>

      <div class="video-grid">
        <router-link
          v-for="video in videos"
          :key="video.id"
          class="video-card"
          :to="'/watch/' + video.id"
        >
          <div class="thumb-wrap">
            <img class="thumb" :src="video.thumbnail" :alt="video.title" loading="lazy">
            <span v-if="video.duration" class="duration">{{ video.duration }}</span>
          </div>
          <h3 class="title">{{ video.title }}</h3>
          <div v-if="video.meta" class="video-meta">{{ video.meta }}</div>
        </router-link>
      </div>
    </template>

    <div v-else class="state">Không tải được kênh này.</div>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { UserRound, Video } from '@lucide/vue';
import { formatCompactViews, formatRelativeTime } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();

const loading = ref(false);
const channel = ref<any>(null);
const videos = ref<any[]>([]);

function videoId(row: any): string {
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

function durationText(value: any): string {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);

  return h
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    : m + ':' + String(sec).padStart(2, '0');
}

function resolveChannelId(row: any): string {
  const raw = String(row?.url || row?.id || '').trim();
  return raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1] || '';
}

async function fetchJson(url: URL) {
  const response = await fetch(url.toString(), { cache: 'default' });
  const payload = await response.json();

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'request_failed');
  }
  return payload;
}

async function resolveKey(key: string): Promise<string> {
  if (/^UC[A-Za-z0-9_-]+$/.test(key)) return key;

  const search = new URL(API);
  search.searchParams.set('action', 'search');
  search.searchParams.set('q', key.replace(/^@/, ''));
  search.searchParams.set('filter', 'channels');

  const payload = await fetchJson(search);
  const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];

  for (const row of rows) {
    const id = resolveChannelId(row);
    if (id) return id;
  }
  return '';
}

async function load() {
  const key = decodeURIComponent(String(route.params.id || '')).trim();
  if (!key) return;

  loading.value = true;
  channel.value = null;
  videos.value = [];

  try {
    const id = await resolveKey(key);
    if (!id) throw new Error('channel_not_found');

    const url = new URL(API);
    url.searchParams.set('action', 'channel');
    url.searchParams.set('id', id);

    const payload = await fetchJson(url);
    const data = payload?.data || {};

    const name = String(data?.name || data?.channelName || data?.title || key).trim();
    const subscribers = data?.subscriberCount ?? data?.subscribers ?? '';

    channel.value = {
      name,
      avatar: String(data?.avatarUrl || data?.thumbnail || data?.avatar || '').trim(),
      meta: subscribers
        ? formatCompactViews(subscribers).replace(' views', ' người đăng ký')
        : '',
      description: String(data?.description || '').trim()
    };

    const rows = Array.isArray(data?.relatedStreams)
      ? data.relatedStreams
      : (Array.isArray(data?.items) ? data.items : []);

    const seen = new Set<string>();

    videos.value = rows
      .map((row: any) => {
        const id = videoId(row);
        if (!id || seen.has(id)) return null;
        seen.add(id);

        return {
          id,
          title: String(row?.title || 'Video'),
          thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
          duration: durationText(row?.duration),
          meta: [
            formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
            formatRelativeTime(
              row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
              row?.publishedAt ?? row?.published ?? row?.publishedText
            )
          ].filter(Boolean).join(' · ')
        };
      })
      .filter(Boolean)
      .slice(0, 40);
  } catch (error) {
    console.error('channel page', error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>
''')


# Modern external player controls with Lucide, plus final Watch page polish.
p = Path("src/components/VideoPlayer.vue")
s = p.read_text()

new_style = r'''<style scoped>
.video-player {
  width: 100%;
}

.video-surface {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid rgba(63,63,70,.55);
  border-radius: 14px;
  background: #000;
  box-shadow: 0 12px 34px rgba(0,0,0,.18);
}

.player-host {
  position: absolute;
  inset: 0;
  background: #000;
  pointer-events: none;
}

.player-host :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  display: block;
  border: 0;
  pointer-events: none !important;
}

.controls {
  min-height: 46px;
  margin-top: 7px;
  display: grid;
  grid-template-columns: auto minmax(100px, 1fr) auto auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid #27272a;
  border-radius: 12px;
  background: rgba(24,24,27,.96);
  color: #e4e4e7;
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #d4d4d8;
  cursor: pointer;
  transition: color .15s ease, background .15s ease, transform .15s ease;
}

.icon-btn:hover {
  color: #fff;
  background: #27272a;
}

.icon-btn:active {
  transform: scale(.95);
}

.icon-btn:disabled {
  opacity: .4;
  cursor: default;
}

.icon-btn :deep(svg) {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.play-btn {
  color: #fff;
  background: #4f46e5;
}

.play-btn:hover {
  background: #6366f1;
}

.seek {
  width: 100%;
  min-width: 90px;
  height: 4px;
  accent-color: #818cf8;
  cursor: pointer;
}

.seek:disabled {
  opacity: .45;
}

.time {
  min-width: 88px;
  color: #71717a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: center;
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 3px;
}

.volume {
  width: 62px;
  accent-color: #818cf8;
  cursor: pointer;
}

.speed-wrap {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid #27272a;
  border-radius: 9px;
  background: #202023;
  color: #a1a1aa;
}

.speed-wrap :deep(svg) {
  width: 14px;
  height: 14px;
}

.speed {
  height: 30px;
  min-width: 42px;
  padding: 0;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  color: #e4e4e7;
  font-size: 11px;
  font-weight: 650;
  text-align: center;
  cursor: pointer;
}

@media (max-width: 640px) {
  .video-surface {
    border-radius: 11px;
  }

  .controls {
    min-height: 42px;
    grid-template-columns: auto minmax(70px, 1fr) auto auto auto;
    gap: 4px;
    margin-top: 5px;
    padding: 4px 5px;
    border-radius: 10px;
  }

  .icon-btn {
    width: 31px;
    height: 31px;
    border-radius: 8px;
  }

  .time {
    min-width: 70px;
    font-size: 10px;
  }

  .volume {
    display: none;
  }

  .speed-wrap {
    height: 30px;
    padding: 0 6px;
  }

  .speed-wrap :deep(svg) {
    display: none;
  }
}

@media (max-width: 390px) {
  .controls {
    grid-template-columns: auto minmax(65px, 1fr) auto auto;
  }

  .time {
    display: none;
  }
}
</style>'''

new_template = r'''<template>
  <div ref="wrapperRef" class="video-player">
    <div class="video-surface">
      <div ref="playerHostRef" class="player-host"></div>
    </div>

    <div class="controls">
      <button
        class="icon-btn play-btn"
        type="button"
        :title="playing ? 'Tạm dừng' : 'Phát'"
        :aria-label="playing ? 'Tạm dừng' : 'Phát'"
        :disabled="!ready"
        @click="togglePlay"
      >
        <Pause v-if="playing"/>
        <Play v-else :fill="'currentColor'"/>
      </button>

      <input
        class="seek"
        type="range"
        min="0"
        :max="Math.max(duration, 0)"
        step="0.1"
        :value="seekValue"
        :disabled="!ready || !duration"
        aria-label="Tua video"
        @input="previewSeek"
        @change="commitSeek"
      >

      <span class="time">{{ formatTime(seekValue) }} / {{ formatTime(duration) }}</span>

      <div class="volume-wrap">
        <button
          class="icon-btn"
          type="button"
          :title="muted || volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'"
          :aria-label="muted || volume === 0 ? 'Bật tiếng' : 'Tắt tiếng'"
          :disabled="!ready"
          @click="toggleMute"
        >
          <VolumeX v-if="muted || volume === 0"/>
          <Volume2 v-else/>
        </button>

        <input
          class="volume"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="volume"
          :disabled="!ready"
          aria-label="Âm lượng"
          @input="setVolumeFromInput"
        >
      </div>

      <label class="speed-wrap" title="Tốc độ phát">
        <Gauge aria-hidden="true"/>
        <select
          class="speed"
          :value="playbackRate"
          :disabled="!ready"
          aria-label="Tốc độ phát"
          @change="setPlaybackRateFromSelect"
        >
          <option v-for="rate in playbackRates" :key="rate" :value="rate">{{ rate }}×</option>
        </select>
      </label>

      <button
        class="icon-btn"
        type="button"
        title="Toàn màn hình"
        aria-label="Toàn màn hình"
        @click="toggleFullscreen"
      >
        <Maximize2/>
      </button>
    </div>
  </div>
</template>'''

s = re.sub(r'<style scoped>[\s\S]*?</style>', new_style, s, count=1)
s = re.sub(r'<template>[\s\S]*?</template>', new_template, s, count=1)

if "from '@lucide/vue'" not in s:
    s = s.replace(
        "import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';",
        "import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';\nimport { Gauge, Maximize2, Pause, Play, Volume2, VolumeX } from '@lucide/vue';",
        1
    )

p.write_text(s)

p = Path("src/pages/WatchPage.vue")
s = p.read_text()

# When Piped/oEmbed metadata lacks an avatar, resolve the matching channel once.
avatar_anchor = """  const seen = new Set<string>();
  relatedVideos.value ="""
if avatar_anchor in s and "channelAvatarSearch" not in s:
    avatar_code = r"""  if (!videoDetails.value.channelAvatar && videoDetails.value.channelName) {
    try {
      const channelAvatarSearch = new URL(FALLBACK_DISCOVERY_API);
      channelAvatarSearch.searchParams.set('action', 'search');
      channelAvatarSearch.searchParams.set('q', videoDetails.value.channelName);
      channelAvatarSearch.searchParams.set('filter', 'channels');

      const avatarResponse = await fetch(channelAvatarSearch.toString(), { cache: 'default' });
      const avatarPayload = await avatarResponse.json();
      const avatarRows = Array.isArray(avatarPayload?.data?.items) ? avatarPayload.data.items : [];
      const firstChannel = avatarRows[0];

      if (firstChannel) {
        const avatarUrl = firstChannel?.thumbnail || firstChannel?.thumbnailUrl || firstChannel?.avatar || '';
        if (avatarUrl) videoDetails.value.channelAvatar = normalizeMediaUrl(avatarUrl);

        const rawChannelUrl = String(firstChannel?.url || firstChannel?.id || '');
        const idMatch = rawChannelUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
        const handleMatch = rawChannelUrl.match(/\/(@[^/?#]+)/);
        if (!channelKey.value) {
          channelKey.value = idMatch?.[1] || (handleMatch?.[1] ? decodeURIComponent(handleMatch[1]) : videoDetails.value.channelName);
        }
      }
    } catch {}
  }

"""
    s = s.replace(avatar_anchor, avatar_code + avatar_anchor, 1)

s += r'''
<style scoped>
.watch-page {
  width: min(1180px, calc(100% - 28px));
  margin: 0 auto;
  padding: 18px 0 38px;
  gap: 22px;
}

.primary {
  min-width: 0;
}

.video-info {
  margin-top: 12px;
}

.video-title {
  margin-bottom: 10px;
  color: #fafafa;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.34;
  letter-spacing: -.015em;
}

.metadata-row {
  min-height: 48px;
  align-items: center;
  padding: 7px 0 12px;
  border-bottom: 1px solid #27272a;
}

.channel-info {
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.channel-link {
  border-radius: 11px;
  padding: 4px 7px 4px 4px;
  margin-left: -4px;
  transition: background .15s ease;
}

.channel-link:hover {
  background: #18181b;
}

.channel-avatar {
  width: 38px;
  height: 38px;
  border: 1px solid #3f3f46;
  object-fit: cover;
}

.channel-avatar-placeholder {
  flex-basis: 38px;
  background: #27272a;
  color: #a1a1aa;
}

.channel-name {
  color: #e4e4e7;
  font-size: 14px;
  font-weight: 650;
}

.secondary {
  margin-top: 0;
}

@media (min-width: 1000px) {
  .watch-page {
    grid-template-columns: minmax(0, 1fr) 350px;
    align-items: start;
  }

  .secondary {
    position: sticky;
    top: 82px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    padding-right: 3px;
  }
}

@media (max-width: 768px) {
  .watch-page {
    width: calc(100% - 16px);
    padding-top: 10px;
    gap: 12px;
  }

  .video-info {
    margin-top: 10px;
  }

  .video-title {
    margin-bottom: 7px;
    font-size: 16.5px;
  }

  .metadata-row {
    padding-bottom: 9px;
  }

  .channel-avatar {
    width: 35px;
    height: 35px;
  }

  .channel-avatar-placeholder {
    flex-basis: 35px;
  }

  .channel-name {
    font-size: 13.5px;
  }
}
</style>
'''

p.write_text(s)


# Simple 1988 branding inspired by SkipCut: dark UI + one red accent.
# Keep this final and global so legacy scoped Kira styles cannot break the header.
p = Path("src/App.vue")
s = p.read_text()

old_brand = '''<router-link to="/" class="brand" aria-label="Kira - Trang chủ">
          <span class="brand-mark"><Play :fill="'currentColor'"/></span>
          <span class="brand-copy">
            <span class="brand-name">Kira</span>
            <span class="brand-subtitle">Media</span>
          </span>
        </router-link>'''
new_brand = '''<router-link to="/" class="brand brand-1988" aria-label="1988 - Trang chủ">
          <span class="logo-1988">1988</span>
        </router-link>'''
s = s.replace(old_brand, new_brand)

# Logo already acts as Home; keep only Settings on the right.
s = s.replace(
    '''          <router-link to="/" class="icon-button home-link" aria-label="Trang chủ" title="Trang chủ">
            <Home/>
          </router-link>
''',
    ''
)

s = s.replace(
    "import { Home, Play, Search, Settings2, X } from '@lucide/vue';",
    "import { Search, Settings2, X } from '@lucide/vue';"
)
p.write_text(s)

p = Path("src/1988.css")
p.write_text(r'''/* Simple global shell: 1988 */
:root {
  --c-bg: #0f0f10;
  --c-panel: #18181a;
  --c-panel-2: #202023;
  --c-border: #2b2b2f;
  --c-text: #f5f5f5;
  --c-muted: #8b8b93;
  --c-red: #ff2d42;
}

html,
body,
#app {
  margin: 0 !important;
  min-width: 280px !important;
  min-height: 100% !important;
  background: var(--c-bg) !important;
  color: var(--c-text) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important;
}

a {
  color: inherit;
}

.app-shell {
  min-height: 100vh !important;
  background: var(--c-bg) !important;
}

.app-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 100 !important;
  background: rgba(15,15,16,.96) !important;
  border-bottom: 1px solid var(--c-border) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}

.header-inner {
  width: min(1180px, calc(100% - 20px)) !important;
  min-height: 58px !important;
  margin: 0 auto !important;
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: 10px !important;
}

.brand-1988 {
  display: inline-flex !important;
  align-items: center !important;
  text-decoration: none !important;
}

.logo-1988 {
  height: 34px !important;
  min-width: 58px !important;
  padding: 0 10px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 10px !important;
  background: var(--c-red) !important;
  color: #fff !important;
  font-size: 17px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
  letter-spacing: -.04em !important;
  box-shadow: none !important;
}

.global-search {
  position: relative !important;
  width: 100% !important;
  max-width: 620px !important;
  justify-self: center !important;
}

.search-leading {
  position: absolute !important;
  left: 12px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 17px !important;
  height: 17px !important;
  color: #77777f !important;
  pointer-events: none !important;
}

.search-input {
  width: 100% !important;
  height: 38px !important;
  padding: 0 40px 0 38px !important;
  border: 1px solid var(--c-border) !important;
  border-radius: 10px !important;
  outline: 0 !important;
  background: var(--c-panel) !important;
  color: var(--c-text) !important;
  font: inherit !important;
  font-size: 13px !important;
  box-shadow: none !important;
}

.search-input::placeholder {
  color: #77777f !important;
}

.search-input:focus {
  border-color: #55555c !important;
  box-shadow: none !important;
}

.clear-search,
.icon-button {
  border: 0 !important;
  background: transparent !important;
  color: #a1a1aa !important;
}

.icon-button {
  width: 36px !important;
  height: 36px !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 9px !important;
}

.icon-button:hover,
.clear-search:hover {
  background: var(--c-panel-2) !important;
  color: #fff !important;
}

.header-actions {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
}

.main-content {
  width: 100% !important;
}

/* One accent only. */
.play-btn,
.brand-mark {
  background: var(--c-red) !important;
}

.seek,
.volume {
  accent-color: var(--c-red) !important;
}

.eyebrow,
.heading-icon,
.section-heading svg {
  color: var(--c-red) !important;
}

@media (max-width: 640px) {
  .header-inner {
    width: calc(100% - 14px) !important;
    min-height: 56px !important;
    gap: 7px !important;
  }

  .logo-1988 {
    min-width: 52px !important;
    height: 32px !important;
    padding: 0 8px !important;
    border-radius: 9px !important;
    font-size: 16px !important;
  }

  .search-input {
    height: 36px !important;
    font-size: 12px !important;
  }

  .icon-button {
    width: 34px !important;
    height: 34px !important;
  }
}
''')

p = Path("src/main.ts")
s = p.read_text()
if "import './1988.css';" not in s:
    s = s.replace(
        "import 'shaka-player/dist/controls.css';",
        "import 'shaka-player/dist/controls.css';\nimport './1988.css';"
    )
p.write_text(s)

# Browser title is 1988, not Kira.
p = Path("index.html")
s = p.read_text()
s = re.sub(r'<title>.*?</title>', '<title>1988</title>', s, count=1)
p.write_text(s)

# Keep attribution and a machine-readable build marker without changing the UI.
p = Path("index.html")
s = p.read_text()
s = s.replace("<head>", "<head>\n    <meta name=\"1988-proof-build\" content=\"ytjs-proof-20260923-54-simple-1988-red\">\n    <link rel=\"preconnect\" href=\"https://i.ytimg.com\" crossorigin>\n    <link rel=\"preconnect\" href=\"https://www.youtube-nocookie.com\" crossorigin>\n    <link rel=\"dns-prefetch\" href=\"//i.ytimg.com\">", 1)
p.write_text(s)
PY

echo "==> Installing Kira dependencies"
npm install --no-audit --no-fund

echo "==> Building Kira proof"
npm run build

rm -rf "$ROOT/kira-proof"
mkdir -p "$ROOT/kira-proof"
cp -a dist/. "$ROOT/kira-proof/"
cp LICENSE "$ROOT/kira-proof/KIRA_LICENSE.txt"

echo "==> Kira proof built"
find "$ROOT/kira-proof" -maxdepth 2 -type f -printf '%P %k KB\n' | sort | head -80
