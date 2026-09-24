from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 YouTube pages v7: fresh home/search children."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 YouTube pages v7: fresh home/search children.

p = Path("src/pages/HomePage.vue")
p.write_text(r'''<template>
  <div class="home-page">
    <section class="filter-shelf">
      <div class="filter-scroll">
        <button
          v-for="item in sources"
          :key="item.id"
          type="button"
          class="filter-chip source-chip"
          :class="{ active: source === item.id }"
          @click="setSource(item.id)"
        >
          {{ item.label }}
        </button>

        <span class="filter-divider"></span>

        <button
          v-for="item in topics"
          :key="item.id"
          type="button"
          class="filter-chip"
          :class="{ active: topic === item.id }"
          @click="setTopic(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <section class="feed-area">
      <div v-if="source === 'channels' && channels.length" class="channel-grid">
        <router-link
          v-for="row in channels"
          :key="row.key"
          class="channel-card"
          :to="'/channel/' + encodeURIComponent(row.key)"
        >
          <img v-if="row.avatar" :src="row.avatar" :alt="row.name">
          <span v-else class="channel-placeholder"><UserRound/></span>
          <strong>{{ row.name }}</strong>
          <small v-if="row.meta">{{ row.meta }}</small>
        </router-link>
      </div>

      <div v-else-if="source === 'playlists' && playlists.length" class="playlist-grid">
        <button
          v-for="row in playlists"
          :key="row.key"
          class="playlist-card"
          type="button"
          @click="openPlaylist(row)"
        >
          <img v-if="row.thumbnail" :src="row.thumbnail" :alt="row.title">
          <span v-else class="playlist-fallback"><Library/></span>
          <strong>{{ row.title }}</strong>
          <small>{{ row.channel }}</small>
        </button>
      </div>

      <div v-else-if="videos.length" class="video-grid">
        <GridVideoItem
          v-for="(video, index) in videos"
          :key="video.videoId"
          :data="video"
          :feed-key="feedKey"
          :feed-index="index"
        />
      </div>

      <div v-else class="skeleton-grid" aria-hidden="true">
        <article v-for="n in 12" :key="n" class="skeleton-card">
          <span class="sk-thumb"></span>
          <span class="sk-avatar"></span>
          <span class="sk-copy"><i></i><i></i><i></i></span>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Library, UserRound } from '@lucide/vue';
import GridVideoItem from '@/components/GridVideoItem.vue';
import type { VideoItemData } from '@/utils/helpers';
import { formatCompactViews, numericViews, parsePublishedAt } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const CACHE_PREFIX = '1988:home:v7:';
const route = useRoute();
const router = useRouter();

type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';
type TopicId =
  | 'all' | 'thoi-su' | 'an-ninh' | 'tin-tuc' | 'cong-nghe' | 'giai-tri'
  | 'phim-ngan' | 'the-thao' | 'nhac-vang' | 'bolero' | 'tru-tinh'
  | 'dan-ca' | 'nhac-tre' | 'remix' | 'que-huong' | 'podcast'
  | 'khong-loi' | 'phim';

type Row = VideoItemData & {
  channelKey?: string;
  publishedAt?: number;
  viewsText?: string;
  viewCount?: number;
  layout?: 'portrait' | 'square' | 'landscape';
};

const sources: Array<{ id: SourceId; label: string }> = [
  { id: 'latest', label: 'Tất cả' },
  { id: 'video', label: 'Video' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'live', label: 'Trực tiếp' },
  { id: 'channels', label: 'Kênh' },
  { id: 'playlists', label: 'Playlist' }
];

const topics: Array<{ id: TopicId; label: string; query: string }> = [
  { id: 'all', label: 'Mới nhất', query: 'Việt Nam' },
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
];

const source = ref<SourceId>('latest');
const topic = ref<TopicId>('all');
const videos = ref<Row[]>([]);
const channels = ref<any[]>([]);
const playlists = ref<any[]>([]);
const refreshing = ref(false);
let serial = 0;
let refreshTimer: number | undefined;

const feedKey = computed(() => 'home:' + source.value + ':' + topic.value);

function syncFromRoute() {
  const wantedSource = String(route.query.source || 'latest') as SourceId;
  const wantedTopic = String(route.query.topic || 'all') as TopicId;
  source.value = sources.some(x => x.id === wantedSource) ? wantedSource : 'latest';
  topic.value = topics.some(x => x.id === wantedTopic) ? wantedTopic : 'all';
}

function setSource(value: SourceId) {
  if (value === source.value) return;
  void router.replace({
    path: '/',
    query: {
      ...(value !== 'latest' ? { source: value } : {}),
      ...(topic.value !== 'all' ? { topic: topic.value } : {})
    }
  });
}

function setTopic(value: TopicId) {
  if (value === topic.value) return;
  void router.replace({
    path: '/',
    query: {
      ...(source.value !== 'latest' ? { source: source.value } : {}),
      ...(value !== 'all' ? { topic: value } : {})
    }
  });
}

function cacheKey() {
  return CACHE_PREFIX + source.value + ':' + topic.value;
}

function hydrateCache() {
  videos.value = [];
  channels.value = [];
  playlists.value = [];
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    videos.value = Array.isArray(data?.videos) ? data.videos : [];
    channels.value = Array.isArray(data?.channels) ? data.channels : [];
    playlists.value = Array.isArray(data?.playlists) ? data.playlists : [];
  } catch {}
}

function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      at: Date.now(),
      videos: videos.value.slice(0, 60),
      channels: channels.value.slice(0, 30),
      playlists: playlists.value.slice(0, 30)
    }));
  } catch {}
}

function persistSwipeFeed(rows: Row[]) {
  try {
    const label = [
      sources.find(x => x.id === source.value)?.label,
      topics.find(x => x.id === topic.value)?.label
    ].filter(Boolean).join(' · ');
    sessionStorage.setItem('1988:feed:' + feedKey.value, JSON.stringify({
      label,
      source: source.value,
      topic: topic.value,
      savedAt: Date.now(),
      items: rows.map(row => ({
        id: row.videoId,
        shape: row.layout || (source.value === 'shorts' ? 'portrait' : 'landscape')
      }))
    }));
  } catch {}
}

function currentTopic() {
  return topics.find(x => x.id === topic.value) || topics[0];
}

function videoId(row: any): string {
  const raw = String(row?.videoId || row?.url || row?.id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})|\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m?.[1] || m?.[2] || m?.[3] || '';
}

function channelKey(row: any): string {
  const raw = String(row?.uploaderUrl || row?.channelUrl || row?.url || row?.id || '');
  return raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1]
    || raw.match(/\/(@[^/?#]+)/)?.[1]
    || String(row?.uploaderName || row?.uploader || row?.channelName || row?.name || 'YouTube');
}

function durationText(value: any) {
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

function publishedRaw(row: any) {
  return row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
    row?.publishedAt ?? row?.published ?? row?.publishedText ?? '';
}

function toVideo(row: any): Row | null {
  const id = videoId(row);
  if (!id) return null;
  const channel = String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube');
  const title = String(row?.title || 'Video');
  const rawUrl = String(row?.url || row?.id || '');
  const layout = source.value === 'shorts' || /\/shorts\//i.test(rawUrl) || /#shorts?\b/i.test(title)
    ? 'portrait'
    : 'landscape';

  return {
    videoId: id,
    title,
    titleText: title,
    thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
    authorAvatar: String(row?.uploaderAvatar || row?.avatar || ''),
    channelKey: channelKey(row),
    metadata: [channel],
    duration: durationText(row?.duration),
    publishedAt: parsePublishedAt(publishedRaw(row)),
    viewsText: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
    viewCount: numericViews(row?.views ?? row?.viewCount ?? row?.viewText),
    layout
  };
}

async function searchRows(q: string, filter = 'videos') {
  const url = new URL(API);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', q);
  url.searchParams.set('filter', filter);
  const response = await fetch(url.toString(), { cache: 'default' });
  const payload = await response.json();
  return response.ok && payload?.ok !== false && Array.isArray(payload?.data?.items)
    ? payload.data.items
    : [];
}

function videoQueries() {
  const q = currentTopic().query;
  if (source.value === 'shorts') return [q + ' shorts mới nhất', q + ' short video'];
  if (source.value === 'live') return [q + ' trực tiếp live', q + ' livestream'];
  if (topic.value !== 'all') return [q, q + ' mới đăng'];
  return [
    'Việt Nam mới nhất',
    'tin mới Việt Nam',
    'thời sự Việt Nam mới nhất',
    'an ninh Việt Nam mới nhất',
    'công nghệ Việt Nam mới nhất',
    'giải trí Việt Nam mới nhất',
    'thể thao Việt Nam mới nhất',
    'phim Việt mới',
    'nhạc Việt mới'
  ];
}

async function loadVideos(current: number) {
  const settled = await Promise.allSettled(videoQueries().map(q => searchRows(q, 'videos')));
  if (current !== serial) return;

  const seen = new Set<string>();
  const merged: Row[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const raw of result.value) {
      const row = toVideo(raw);
      if (!row || seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      merged.push(row);
    }
  }

  merged.sort((a,b) => {
    if (source.value === 'live') {
      const al = /live|trực tiếp/i.test(String(a.title)) ? 1 : 0;
      const bl = /live|trực tiếp/i.test(String(b.title)) ? 1 : 0;
      if (al !== bl) return bl - al;
    }
    const at = a.publishedAt || 0;
    const bt = b.publishedAt || 0;
    if (at !== bt) return bt - at;
    return (b.viewCount || 0) - (a.viewCount || 0);
  });

  videos.value = merged.slice(0, 60);
  persistSwipeFeed(merged.slice(0, 120));
}

async function loadChannels(current: number) {
  const rows = await searchRows(currentTopic().query, 'channels');
  if (current !== serial) return;
  const seen = new Set<string>();
  channels.value = rows.map((row: any) => {
    const key = channelKey(row);
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const subscribers = row?.subscribers ?? row?.subscriberCount ?? '';
    return {
      key,
      name: String(row?.name || row?.title || row?.uploaderName || row?.uploader || 'YouTube'),
      avatar: String(row?.thumbnail || row?.thumbnailUrl || row?.avatar || ''),
      meta: subscribers ? formatCompactViews(subscribers).replace('lượt xem', 'người đăng ký') : ''
    };
  }).filter(Boolean).slice(0, 30);
}

async function loadPlaylists(current: number) {
  const rows = await searchRows(currentTopic().query, 'playlists');
  if (current !== serial) return;
  const seen = new Set<string>();
  playlists.value = rows.map((row: any) => {
    const raw = String(row?.url || row?.id || '');
    const key = raw.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1]
      || raw.match(/\/playlist\/([A-Za-z0-9_-]+)/)?.[1]
      || raw;
    if (!key || seen.has(key)) return null;
    seen.add(key);
    return {
      key,
      title: String(row?.name || row?.title || 'Playlist'),
      channel: String(row?.uploaderName || row?.uploader || row?.channelName || ''),
      thumbnail: String(row?.thumbnail || row?.thumbnailUrl || '')
    };
  }).filter(Boolean).slice(0, 30);
}

async function refresh() {
  const current = ++serial;
  refreshing.value = true;
  try {
    if (source.value === 'channels') await loadChannels(current);
    else if (source.value === 'playlists') await loadPlaylists(current);
    else await loadVideos(current);
    if (current === serial) saveCache();
  } finally {
    if (current === serial) refreshing.value = false;
  }
}

function openPlaylist(row: any) {
  void router.push({ path: '/search', query: { q: row.title, source: 'video' } });
}

function applyRouteAndRefresh() {
  syncFromRoute();
  hydrateCache();
  void refresh();
}

onMounted(() => {
  applyRouteAndRefresh();
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !refreshing.value) void refresh();
  }, 300000);
});
onBeforeUnmount(() => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
});
watch(() => [route.query.source, route.query.topic], applyRouteAndRefresh);
</script>

<style scoped>
.home-page { min-height:calc(100vh - var(--yt-header-h)); background:var(--yt-bg); }
.filter-shelf {
  position:sticky; z-index:70; top:var(--yt-header-h); height:56px;
  display:flex; align-items:center; background:rgba(15,15,15,.98);
}
.filter-scroll {
  width:100%; display:flex; align-items:center; gap:8px; overflow-x:auto;
  padding:0 24px; scrollbar-width:none; overscroll-behavior-inline:contain;
}
.filter-scroll::-webkit-scrollbar { display:none; }
.filter-chip {
  flex:0 0 auto; height:32px; padding:0 12px; border:0; border-radius:8px;
  background:#272727; color:#f1f1f1; font-size:13px; font-weight:600; white-space:nowrap;
}
.filter-chip:hover { background:#3f3f3f; }
.filter-chip.active { background:#f1f1f1; color:#0f0f0f; }
.filter-divider { flex:0 0 1px; width:1px; height:22px; margin:0 3px; background:#3a3a3a; }

.feed-area { padding:18px 24px 42px; }
.video-grid,.playlist-grid,.skeleton-grid {
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:36px 16px;
}
.channel-grid {
  display:grid; grid-template-columns:repeat(5,minmax(140px,1fr)); gap:28px 18px;
}
.channel-card {
  min-width:0; display:grid; justify-items:center; gap:8px; padding:14px 8px;
  border-radius:12px; text-decoration:none; text-align:center;
}
.channel-card:hover { background:#181818; }
.channel-card img,.channel-placeholder {
  width:min(140px,70%); aspect-ratio:1; border-radius:50%; object-fit:cover; background:#272727;
}
.channel-placeholder { display:grid; place-items:center; color:#aaa; }
.channel-placeholder :deep(svg) { width:32px; height:32px; }
.channel-card strong { max-width:100%; overflow:hidden; font-size:14px; white-space:nowrap; text-overflow:ellipsis; }
.channel-card small { color:#aaa; font-size:12px; }

.playlist-card {
  min-width:0; padding:0; border:0; background:transparent; color:#fff; text-align:left;
}
.playlist-card img,.playlist-fallback {
  width:100%; aspect-ratio:16/9; display:grid; place-items:center;
  border-radius:12px; object-fit:cover; background:#272727;
}
.playlist-card strong,.playlist-card small { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.playlist-card strong { margin-top:8px; font-size:14px; }
.playlist-card small { margin-top:3px; color:#aaa; font-size:12px; }

.skeleton-card {
  position:relative; min-width:0; display:grid; grid-template-columns:36px minmax(0,1fr);
  column-gap:10px; row-gap:10px;
}
.sk-thumb { grid-column:1/-1; aspect-ratio:16/9; border-radius:12px; background:#222; }
.sk-avatar { width:36px; height:36px; border-radius:50%; background:#222; }
.sk-copy { display:grid; gap:7px; }
.sk-copy i { display:block; height:9px; border-radius:5px; background:#222; }
.sk-copy i:nth-child(2) { width:72%; }
.sk-copy i:nth-child(3) { width:48%; }

@media (max-width:1300px) {
  .video-grid,.playlist-grid,.skeleton-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .channel-grid { grid-template-columns:repeat(4,minmax(120px,1fr)); }
}
@media (max-width:980px) {
  .video-grid,.playlist-grid,.skeleton-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .channel-grid { grid-template-columns:repeat(3,minmax(110px,1fr)); }
}
@media (max-width:760px) {
  .filter-shelf { top:var(--yt-header-h); height:48px; }
  .filter-scroll { padding:0 10px; gap:7px; }
  .filter-chip { height:30px; padding:0 11px; font-size:12px; }
  .feed-area { padding:12px 12px 28px; }
  .video-grid,.playlist-grid,.skeleton-grid { grid-template-columns:1fr; gap:28px; }
  .channel-grid { grid-template-columns:repeat(2,minmax(110px,1fr)); }
  .skeleton-card { margin-inline:-12px; }
  .sk-thumb { border-radius:0; }
}
</style>
''')


p = Path("src/pages/SearchPage.vue")
p.write_text(r'''<template>
  <div class="search-page">
    <section class="search-filter">
      <div>
        <button
          v-for="item in sources"
          :key="item.id"
          type="button"
          :class="{ active: source === item.id }"
          @click="setSource(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <main class="search-results">
      <div v-if="channels.length" class="channel-results">
        <router-link
          v-for="channel in channels"
          :key="channel.key"
          class="channel-result"
          :to="'/channel/' + encodeURIComponent(channel.key)"
        >
          <img v-if="channel.avatar" :src="channel.avatar" :alt="channel.name">
          <span v-else class="avatar"><UserRound/></span>
          <div><strong>{{ channel.name }}</strong><small>{{ channel.meta }}</small></div>
        </router-link>
      </div>

      <div v-if="playlists.length" class="playlist-results">
        <button v-for="row in playlists" :key="row.key" type="button" @click="openPlaylist(row.title)">
          <img v-if="row.thumbnail" :src="row.thumbnail" :alt="row.title">
          <span><strong>{{ row.title }}</strong><small>{{ row.channel }}</small></span>
        </button>
      </div>

      <div v-if="videos.length" class="video-results">
        <router-link
          v-for="(video,index) in videos"
          :key="video.id"
          class="video-result"
          :to="{ path: '/watch/' + video.id, query: { feed: feedKey, index: String(index), shape: video.shape } }"
        >
          <div class="result-thumb">
            <img :src="video.thumbnail" :alt="video.title">
            <span v-if="video.duration">{{ video.duration }}</span>
          </div>
          <div class="result-copy">
            <h2>{{ video.title }}</h2>
            <p>{{ video.views }}<template v-if="video.views && video.publishedAt"> · </template>{{ age(video.publishedAt) }}</p>
            <p class="result-channel">{{ video.channel }}</p>
          </div>
        </router-link>
      </div>

      <div v-if="searched && !loading && !channels.length && !playlists.length && !videos.length" class="empty">
        Không tìm thấy kết quả phù hợp.
      </div>

      <div v-if="loading && !channels.length && !playlists.length && !videos.length" class="search-skeleton">
        <span v-for="n in 7" :key="n"></span>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { UserRound } from '@lucide/vue';
import { formatCompactViews, formatRelativeTime, parsePublishedAt } from '@/utils/display1988';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();
const router = useRouter();
type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';

const sources: Array<{id: SourceId; label: string}> = [
  { id: 'latest', label: 'Tất cả' },
  { id: 'video', label: 'Video' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'live', label: 'Trực tiếp' },
  { id: 'channels', label: 'Kênh' },
  { id: 'playlists', label: 'Playlist' }
];

const source = ref<SourceId>('latest');
const channels = ref<any[]>([]);
const playlists = ref<any[]>([]);
const videos = ref<any[]>([]);
const searched = ref(false);
const loading = ref(false);
const tick = ref(Date.now());
let serial = 0;
let timer: number | undefined;

const query = computed(() => String(route.query.q || '').trim());
const feedKey = computed(() => 'search:' + source.value + ':' + query.value.toLocaleLowerCase('vi'));

function setSource(value: SourceId) {
  if (value === source.value) return;
  void router.replace({ path: '/search', query: { ...(query.value ? {q: query.value} : {}), source: value } });
}

function age(ts: number) {
  void tick.value;
  return ts ? formatRelativeTime(ts) : '';
}

function idFrom(row: any) {
  const raw = String(row?.videoId || row?.url || row?.id || '');
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})|\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
  return m?.[1] || m?.[2] || m?.[3] || '';
}

function channelKey(row: any) {
  const raw = String(row?.url || row?.channelUrl || row?.uploaderUrl || row?.id || '');
  return raw.match(/\/channel\/(UC[A-Za-z0-9_-]+)/)?.[1]
    || raw.match(/\/(@[^/?#]+)/)?.[1]
    || String(row?.name || row?.title || row?.uploaderName || row?.uploader || '');
}

function duration(value: any) {
  if (typeof value === 'string' && value.includes(':')) return value;
  const total = Math.max(0, Number(value) || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.floor(total % 60);
  return h
    ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0')
    : m + ':' + String(sec).padStart(2,'0');
}

async function apiSearch(filter: string, q: string) {
  const url = new URL(API);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', q);
  url.searchParams.set('filter', filter);
  const res = await fetch(url.toString(), { cache: 'default' });
  const payload = await res.json();
  return res.ok && payload?.ok !== false && Array.isArray(payload?.data?.items)
    ? payload.data.items
    : [];
}

function mapChannels(rows: any[]) {
  const seen = new Set<string>();
  return rows.map((row: any) => {
    const key = channelKey(row);
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const subscribers = row?.subscribers ?? row?.subscriberCount ?? '';
    return {
      key,
      name: String(row?.name || row?.title || row?.uploaderName || row?.uploader || 'YouTube'),
      avatar: String(row?.thumbnail || row?.avatar || row?.thumbnailUrl || ''),
      meta: subscribers ? formatCompactViews(subscribers).replace('lượt xem','người đăng ký') : ''
    };
  }).filter(Boolean).slice(0, 12);
}

function mapPlaylists(rows: any[]) {
  const seen = new Set<string>();
  return rows.map((row: any) => {
    const raw = String(row?.url || row?.id || '');
    const key = raw.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1] || raw;
    if (!key || seen.has(key)) return null;
    seen.add(key);
    return {
      key,
      title: String(row?.name || row?.title || 'Playlist'),
      channel: String(row?.uploaderName || row?.uploader || row?.channelName || ''),
      thumbnail: String(row?.thumbnail || row?.thumbnailUrl || '')
    };
  }).filter(Boolean).slice(0,20);
}

function mapVideos(rows: any[]) {
  const seen = new Set<string>();
  return rows.map((row:any) => {
    const id = idFrom(row);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const published = row?.uploaded ?? row?.uploadedDate ?? row?.uploadDate ??
      row?.publishedAt ?? row?.published ?? row?.publishedText ?? '';
    const title = String(row?.title || 'Video');
    const shape = source.value === 'shorts' || /\/shorts\//i.test(String(row?.url || '')) || /#shorts?\b/i.test(title)
      ? 'portrait'
      : 'landscape';
    return {
      id,
      title,
      channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      duration: duration(row?.duration),
      views: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
      publishedAt: parsePublishedAt(published),
      shape
    };
  }).filter(Boolean).slice(0,50);
}

function persistFeed() {
  if (!videos.value.length) return;
  try {
    sessionStorage.setItem('1988:feed:' + feedKey.value, JSON.stringify({
      label: 'Tìm kiếm · ' + query.value,
      savedAt: Date.now(),
      items: videos.value.map((row:any) => ({ id: row.id, shape: row.shape }))
    }));
  } catch {}
}

async function run() {
  const q = query.value;
  if (!q) {
    searched.value = false;
    channels.value = [];
    playlists.value = [];
    videos.value = [];
    return;
  }

  const current = ++serial;
  searched.value = true;
  loading.value = true;
  try {
    if (source.value === 'channels') {
      channels.value = mapChannels(await apiSearch('channels', q));
      videos.value = []; playlists.value = [];
    } else if (source.value === 'playlists') {
      playlists.value = mapPlaylists(await apiSearch('playlists', q));
      videos.value = []; channels.value = [];
    } else if (source.value === 'shorts') {
      videos.value = mapVideos(await apiSearch('videos', q + ' shorts'));
      channels.value = []; playlists.value = [];
    } else if (source.value === 'live') {
      videos.value = mapVideos(await apiSearch('videos', q + ' trực tiếp live'));
      channels.value = []; playlists.value = [];
    } else if (source.value === 'video') {
      videos.value = mapVideos(await apiSearch('videos', q));
      channels.value = []; playlists.value = [];
    } else {
      const [channelRows, videoRows] = await Promise.all([
        apiSearch('channels', q),
        apiSearch('videos', q)
      ]);
      if (current !== serial) return;
      channels.value = mapChannels(channelRows).slice(0,2);
      videos.value = mapVideos(videoRows);
      playlists.value = [];
    }
    if (current === serial) persistFeed();
  } finally {
    if (current === serial) loading.value = false;
  }
}

function openPlaylist(title: string) {
  void router.replace({ path: '/search', query: { q: title, source: 'video' } });
}

function syncSource() {
  const wanted = String(route.query.source || 'latest') as SourceId;
  source.value = sources.some(x => x.id === wanted) ? wanted : 'latest';
}

onMounted(() => {
  syncSource();
  void run();
  timer = window.setInterval(() => { tick.value = Date.now(); }, 30000);
});
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});
watch(() => [route.query.q, route.query.source], () => {
  syncSource();
  void run();
});
</script>

<style scoped>
.search-page { min-height:calc(100vh - var(--yt-header-h)); background:#0f0f0f; }
.search-filter {
  position:sticky; z-index:70; top:var(--yt-header-h); height:52px;
  display:flex; align-items:center; background:rgba(15,15,15,.98);
}
.search-filter > div {
  display:flex; gap:8px; overflow-x:auto; padding:0 24px; scrollbar-width:none;
}
.search-filter > div::-webkit-scrollbar { display:none; }
.search-filter button {
  flex:0 0 auto; height:32px; padding:0 12px; border:0; border-radius:8px;
  background:#272727; color:#f1f1f1; font-size:13px; font-weight:600;
}
.search-filter button.active { background:#f1f1f1; color:#0f0f0f; }

.search-results {
  width:min(1120px,calc(100% - 48px)); margin:0 auto; padding:18px 0 40px;
}
.channel-results { display:grid; gap:8px; margin-bottom:20px; }
.channel-result {
  display:grid; grid-template-columns:112px minmax(0,1fr); gap:18px;
  align-items:center; padding:10px 0; text-decoration:none;
}
.channel-result img,.channel-result .avatar {
  width:112px; height:112px; display:grid; place-items:center;
  border-radius:50%; object-fit:cover; background:#272727;
}
.channel-result strong { display:block; font-size:17px; }
.channel-result small { display:block; margin-top:6px; color:#aaa; font-size:12px; }

.playlist-results { display:grid; gap:12px; margin-bottom:20px; }
.playlist-results button {
  display:grid; grid-template-columns:240px minmax(0,1fr); gap:14px;
  padding:0; border:0; background:transparent; color:#fff; text-align:left;
}
.playlist-results img { width:240px; aspect-ratio:16/9; border-radius:10px; object-fit:cover; }
.playlist-results strong,.playlist-results small { display:block; }
.playlist-results small { margin-top:5px; color:#aaa; }

.video-results { display:grid; gap:14px; }
.video-result {
  display:grid; grid-template-columns:minmax(280px,360px) minmax(0,1fr);
  gap:16px; color:inherit; text-decoration:none;
}
.result-thumb {
  position:relative; aspect-ratio:16/9; overflow:hidden; border-radius:10px; background:#222;
}
.result-thumb img { width:100%; height:100%; object-fit:cover; }
.result-thumb span {
  position:absolute; right:5px; bottom:5px; padding:3px 5px;
  border-radius:4px; background:rgba(0,0,0,.82); font-size:11px; font-weight:700;
}
.result-copy h2 {
  margin:2px 0 7px; color:#f1f1f1; font-size:18px; line-height:1.3; font-weight:500;
}
.result-copy p { margin:0 0 12px; color:#aaa; font-size:12px; }
.result-channel { margin-top:18px !important; }
.empty { min-height:280px; display:grid; place-items:center; color:#aaa; }
.search-skeleton { display:grid; gap:14px; }
.search-skeleton span { height:190px; border-radius:10px; background:#202020; }

@media (max-width:760px) {
  .search-filter { top:var(--yt-header-h); height:48px; }
  .search-filter > div { padding:0 10px; gap:7px; }
  .search-filter button { height:30px; font-size:12px; }
  .search-results { width:100%; padding:10px 12px 30px; }
  .video-result { grid-template-columns:1fr; gap:8px; }
  .result-thumb { margin-inline:-12px; border-radius:0; }
  .result-copy h2 { font-size:15px; }
  .channel-result { grid-template-columns:72px minmax(0,1fr); }
  .channel-result img,.channel-result .avatar { width:72px; height:72px; }
}
</style>
''')
"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
