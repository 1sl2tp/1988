from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 YouTube shell v7: independent parent-child shell."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 YouTube shell v7: independent parent-child shell.

p = Path("src/1988.css")
p.write_text(r''':root {
  color-scheme: dark;
  --yt-bg: #0f0f0f;
  --yt-panel: #212121;
  --yt-panel-2: #272727;
  --yt-hover: #3f3f3f;
  --yt-line: rgba(255,255,255,.10);
  --yt-text: #f1f1f1;
  --yt-muted: #aaa;
  --yt-header-h: 56px;
  --yt-side-w: 72px;
  --yt-side-wide: 224px;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html {
  min-width: 280px;
  min-height: 100%;
  background: var(--yt-bg);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body, #app {
  margin: 0;
  min-width: 280px;
  min-height: 100vh;
  background: var(--yt-bg);
  color: var(--yt-text);
  font-family: Roboto, Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
body {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
}
button, input { font: inherit; }
button, a { touch-action: manipulation; }
button { cursor: pointer; }
a { color: inherit; }
input, textarea { font-size: 16px; }
img { -webkit-user-drag: none; user-select: none; }
::selection { background: rgba(62,166,255,.35); }
@media (max-width: 760px) {
  :root { --yt-header-h: 52px; --yt-side-w: 0px; }
  body { padding-bottom: calc(52px + env(safe-area-inset-bottom)); }
}
''')


p = Path("src/App.vue")
p.write_text(r'''<template>
  <div class="yt-app" :class="{ 'nav-wide': navWide, 'route-watch': isWatch }">
    <header v-if="!isWatch" class="yt-header">
      <div class="head-left">
        <button class="round menu-btn" type="button" aria-label="Menu" @click="toggleNav"><Menu/></button>
        <router-link class="brand" to="/" aria-label="1988">
          <span class="brand-play"><Play/></span><strong>1988</strong>
        </router-link>
      </div>

      <div class="head-center">
        <form class="global-search" @submit.prevent="submitSearch" @focusin="searchFocused = true">
          <div class="search-box">
            <Search class="inside-search"/>
            <input
              ref="searchInput"
              v-model="searchText"
              type="text"
              inputmode="search"
              enterkeyhint="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Tìm kiếm"
              @input="scheduleSuggestions"
              @keydown.esc.prevent="closeSuggestions"
            >
            <button v-if="searchText" class="clear-search" type="button" aria-label="Xóa tìm kiếm" @click="clearSearch"><X/></button>
          </div>
          <button class="search-submit" type="submit" aria-label="Tìm kiếm"><Search/></button>

          <div v-if="showSuggestions" class="search-suggestions">
            <button v-for="item in suggestions" :key="item" type="button" @mousedown.prevent @click="pickSuggestion(item)">
              <Search/><span>{{ item }}</span>
            </button>
          </div>
        </form>
      </div>

      <div class="head-right">
        <button class="round mobile-search" type="button" aria-label="Tìm kiếm" @click="focusSearch"><Search/></button>
        <button class="round" type="button" aria-label="Trực tiếp" @click="goSource('live')"><Radio/></button>
        <button class="avatar-btn" type="button" aria-label="Tài khoản">88</button>
      </div>
    </header>

    <aside v-if="!isWatch" class="yt-sidebar" :class="{ wide: navWide }">
      <nav>
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="nav-item"
          :class="{ active: navActive(item.id) }"
          @click="openNav(item)"
        >
          <component :is="item.icon"/>
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <div v-if="drawerOpen && !isWatch" class="drawer-mask" @click.self="drawerOpen = false">
      <aside class="mobile-drawer">
        <div class="drawer-brand">
          <button class="round" type="button" @click="drawerOpen = false"><X/></button>
          <router-link class="brand" to="/" @click="drawerOpen = false">
            <span class="brand-play"><Play/></span><strong>1988</strong>
          </router-link>
        </div>
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="drawer-item"
          :class="{ active: navActive(item.id) }"
          @click="openNav(item); drawerOpen = false"
        >
          <component :is="item.icon"/><span>{{ item.label }}</span>
        </button>
      </aside>
    </div>

    <main class="yt-route" :class="{ immersive: isWatch }">
      <router-view/>
    </main>

    <nav v-if="!isWatch" class="bottom-nav" aria-label="Điều hướng">
      <button type="button" :class="{active: navActive('home')}" @click="goHome"><Home/><span>Trang chủ</span></button>
      <button type="button" :class="{active: navActive('shorts')}" @click="goSource('shorts')"><Clapperboard/><span>Shorts</span></button>
      <button type="button" @click="focusSearch"><Search/><span>Tìm kiếm</span></button>
      <button type="button" :class="{active: navActive('live')}" @click="goSource('live')"><Radio/><span>Live</span></button>
    </nav>

    <aside v-if="miniVideo && !isWatch" class="global-mini" :class="{ collapsed: miniCollapsed }">
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
      <div v-if="!miniCollapsed" class="mini-player"><VideoPlayer :video-id="miniVideo.videoId"/></div>
    </aside>

    <ToastNotification/>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Clapperboard, ExternalLink, Home, Library, Maximize2, Menu, Minimize2,
  Play, Radio, Search, Tv, UserRound, X
} from '@lucide/vue';
import ToastNotification from '@/components/ToastNotification.vue';
import VideoPlayer from '@/components/VideoPlayer.vue';

const API = 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988';
const route = useRoute();
const router = useRouter();
const searchInput = ref<HTMLInputElement | null>(null);
const searchText = ref('');
const suggestions = ref<string[]>([]);
const searchFocused = ref(false);
const navWide = ref(false);
const drawerOpen = ref(false);
const miniVideo = ref<any>(null);
const miniCollapsed = ref(false);
let suggestTimer: number | undefined;
let suggestSerial = 0;
let outsideHandler: ((event: MouseEvent) => void) | null = null;

const navItems = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  { id: 'shorts', label: 'Shorts', icon: Clapperboard },
  { id: 'live', label: 'Trực tiếp', icon: Radio },
  { id: 'channels', label: 'Kênh', icon: UserRound },
  { id: 'playlists', label: 'Playlist', icon: Library },
  { id: 'video', label: 'Video', icon: Tv }
];

const isWatch = computed(() => route.path.startsWith('/watch/'));
const showSuggestions = computed(() => searchFocused.value && suggestions.value.length > 0);
const miniTitle = computed(() => String(miniVideo.value?.titleText || miniVideo.value?.title || 'Video'));

function toggleNav() {
  if (window.innerWidth <= 760) drawerOpen.value = true;
  else navWide.value = !navWide.value;
}
function openNav(item: any) {
  if (item.id === 'home') goHome();
  else goSource(item.id);
}
function goHome() { void router.push('/'); }
function goSource(source: string) { void router.push({ path: '/', query: { source } }); }
function navActive(id: string) {
  if (route.path !== '/') return false;
  const source = String(route.query.source || 'latest');
  return id === 'home' ? source === 'latest' : source === id;
}
function focusSearch() {
  if (window.innerWidth <= 760 && route.path !== '/search') {
    void router.push('/search').then(() => nextTick(() => searchInput.value?.focus()));
    return;
  }
  searchInput.value?.focus();
}
function submitSearch() {
  const q = searchText.value.trim();
  if (!q) return;
  searchFocused.value = false;
  suggestions.value = [];
  void router.push({ path: '/search', query: { q, source: 'latest' } });
}
function clearSearch() {
  searchText.value = '';
  suggestions.value = [];
  suggestSerial += 1;
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
  if (route.path === '/search') void router.replace('/search');
  nextTick(() => searchInput.value?.focus());
}
function closeSuggestions() {
  searchFocused.value = false;
  suggestions.value = [];
}
function pickSuggestion(value: string) {
  searchText.value = value;
  submitSearch();
}
function scheduleSuggestions() {
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
  const q = searchText.value.trim();
  if (q.length < 2) {
    suggestions.value = [];
    return;
  }
  const current = ++suggestSerial;
  suggestTimer = window.setTimeout(async () => {
    try {
      const url = new URL(API);
      url.searchParams.set('action', 'suggestions');
      url.searchParams.set('q', q);
      const res = await fetch(url.toString(), { cache: 'force-cache' });
      const payload = await res.json();
      if (current !== suggestSerial) return;
      const seen = new Set<string>();
      suggestions.value = (Array.isArray(payload?.data) ? payload.data : [])
        .map((x: any) => String(x || '').trim())
        .filter((x: string) => {
          const key = x.toLocaleLowerCase('vi');
          if (!x || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8);
    } catch {}
  }, 140);
}
function openMini(data: any) {
  if (!data?.videoId) return;
  miniVideo.value = data;
  miniCollapsed.value = false;
}
function closeMini() {
  miniVideo.value = null;
  miniCollapsed.value = false;
}
function openMiniWatch() {
  if (!miniVideo.value?.videoId) return;
  const shape = String(miniVideo.value?.layout || 'landscape');
  void router.push({ path: '/watch/' + miniVideo.value.videoId, query: { shape } });
}
provide('1988OpenMini', openMini);

watch(() => route.query.q, (value) => {
  if (route.path === '/search') searchText.value = String(value || '');
});
watch(() => route.path, (path) => {
  if (path.startsWith('/watch/')) closeMini();
  searchFocused.value = false;
});

onMounted(() => {
  if (route.path === '/search') searchText.value = String(route.query.q || '');
  outsideHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.global-search')) searchFocused.value = false;
  };
  document.addEventListener('mousedown', outsideHandler);
});
onBeforeUnmount(() => {
  if (suggestTimer !== undefined) clearTimeout(suggestTimer);
  if (outsideHandler) document.removeEventListener('mousedown', outsideHandler);
});
</script>

<style scoped>
.yt-app { min-height: 100vh; background: var(--yt-bg); }
.yt-header {
  position: fixed; z-index: 100; top: 0; left: 0; right: 0;
  height: var(--yt-header-h);
  display: grid;
  grid-template-columns: minmax(180px,1fr) minmax(320px,640px) minmax(180px,1fr);
  align-items: center; gap: 16px; padding: 0 16px;
  background: rgba(15,15,15,.98);
}
.head-left,.head-right { min-width:0; display:flex; align-items:center; }
.head-left { gap:12px; }
.head-right { justify-content:flex-end; gap:6px; }
.round,.avatar-btn {
  flex:0 0 auto; width:40px; height:40px; display:grid; place-items:center;
  padding:0; border:0; border-radius:50%; background:transparent; color:#fff;
}
.round:hover { background:#272727; }
.round :deep(svg) { width:22px; height:22px; }
.avatar-btn { width:32px; height:32px; margin-left:4px; background:#3f51b5; font-size:11px; font-weight:700; }
.brand { display:inline-flex; align-items:center; gap:5px; text-decoration:none; color:#fff; font-size:19px; letter-spacing:-.6px; }
.brand-play { width:29px; height:20px; display:grid; place-items:center; border-radius:6px; background:#f03; }
.brand-play :deep(svg) { width:13px; height:13px; fill:#fff; }
.head-center { min-width:0; }
.global-search { position:relative; display:grid; grid-template-columns:minmax(0,1fr) 64px; }
.search-box {
  position:relative; height:40px; display:flex; align-items:center;
  border:1px solid #303030; border-radius:20px 0 0 20px; background:#121212;
}
.search-box:focus-within { border-color:#1c62b9; }
.inside-search { width:19px; height:19px; margin-left:14px; color:#aaa; }
.search-box input {
  min-width:0; flex:1; height:100%; padding:0 8px 0 10px;
  border:0; outline:0; background:transparent; color:#fff; font-size:16px;
}
.clear-search {
  width:38px; height:38px; display:grid; place-items:center; padding:0;
  border:0; border-radius:50%; background:transparent; color:#ddd;
}
.clear-search:hover { background:#272727; }
.clear-search :deep(svg) { width:21px; height:21px; }
.search-submit {
  height:40px; display:grid; place-items:center; border:1px solid #303030;
  border-left:0; border-radius:0 20px 20px 0; background:#222; color:#fff;
}
.search-submit:hover { background:#303030; }
.search-submit :deep(svg) { width:20px; height:20px; }
.search-suggestions {
  position:absolute; z-index:120; top:44px; left:0; right:64px;
  overflow:hidden; padding:8px 0; border-radius:12px;
  background:#fff; color:#0f0f0f; box-shadow:0 4px 32px rgba(0,0,0,.35);
}
.search-suggestions button {
  width:100%; min-height:38px; display:grid; grid-template-columns:28px minmax(0,1fr);
  align-items:center; gap:8px; padding:0 14px; border:0;
  background:transparent; color:#0f0f0f; text-align:left;
}
.search-suggestions button:hover { background:#eee; }
.search-suggestions :deep(svg) { width:18px; height:18px; }
.search-suggestions span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.mobile-search { display:none; }

.yt-sidebar {
  position:fixed; z-index:90; top:var(--yt-header-h); bottom:0; left:0;
  width:var(--yt-side-w); padding:4px 4px 12px; overflow-y:auto;
  background:var(--yt-bg); transition:width .18s ease;
}
.yt-sidebar.wide { width:var(--yt-side-wide); padding-inline:12px; }
.yt-sidebar nav { display:grid; gap:2px; }
.nav-item {
  width:100%; min-height:64px; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:5px; padding:7px 4px;
  border:0; border-radius:10px; background:transparent; color:#fff;
}
.nav-item:hover,.nav-item.active { background:#272727; }
.nav-item :deep(svg) { width:22px; height:22px; }
.nav-item span { max-width:64px; overflow:hidden; font-size:10px; white-space:nowrap; text-overflow:ellipsis; }
.yt-sidebar.wide .nav-item {
  min-height:44px; flex-direction:row; justify-content:flex-start; gap:22px; padding:0 14px;
}
.yt-sidebar.wide .nav-item span { max-width:none; font-size:14px; }

.yt-route {
  min-height:100vh; padding-top:var(--yt-header-h); padding-left:var(--yt-side-w);
  background:var(--yt-bg); transition:padding-left .18s ease;
}
.nav-wide .yt-route { padding-left:var(--yt-side-wide); }
.yt-route.immersive { padding:0; }
.bottom-nav { display:none; }

.drawer-mask { position:fixed; z-index:180; inset:0; background:rgba(0,0,0,.55); }
.mobile-drawer {
  width:min(82vw,280px); height:100%; padding:max(8px,env(safe-area-inset-top)) 10px;
  background:#0f0f0f; box-shadow:12px 0 36px rgba(0,0,0,.35);
}
.drawer-brand { height:48px; display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.drawer-item {
  width:100%; height:48px; display:flex; align-items:center; gap:22px;
  padding:0 16px; border:0; border-radius:10px; background:transparent; color:#fff; text-align:left;
}
.drawer-item:hover,.drawer-item.active { background:#272727; }
.drawer-item :deep(svg) { width:22px; height:22px; }

.global-mini {
  position:fixed; z-index:140; right:18px; bottom:18px;
  width:min(400px,calc(100vw - 30px)); overflow:hidden;
  border:1px solid #303030; border-radius:10px; background:#181818;
  box-shadow:0 16px 48px rgba(0,0,0,.55);
}
.global-mini header { height:38px; display:flex; align-items:center; border-bottom:1px solid #2e2e2e; }
.mini-name {
  min-width:0; flex:1; overflow:hidden; padding:0 10px; border:0;
  background:transparent; color:#eee; font-size:11px; font-weight:600;
  white-space:nowrap; text-align:left; text-overflow:ellipsis;
}
.global-mini header > div { display:flex; padding-right:4px; }
.global-mini header > div button {
  width:32px; height:32px; display:grid; place-items:center; padding:0;
  border:0; border-radius:50%; background:transparent; color:#ccc;
}
.global-mini header > div button:hover { background:#303030; color:#fff; }
.global-mini header :deep(svg) { width:16px; height:16px; }
.mini-player { aspect-ratio:16/9; background:#000; }
.mini-player :deep(.video-player) { width:100%; height:100%; }
.global-mini.collapsed { width:300px; }
.global-mini.collapsed header { border-bottom:0; }

@media (max-width:760px) {
  .yt-header { grid-template-columns:auto minmax(0,1fr) auto; gap:8px; padding:0 8px; }
  .menu-btn { display:none; }
  .head-left { gap:0; }
  .brand { font-size:17px; }
  .brand-play { width:27px; height:19px; }
  .head-center { display:none; }
  .mobile-search { display:grid; }
  .head-right { gap:2px; }
  .yt-sidebar { display:none; }
  .yt-route,.nav-wide .yt-route { padding-left:0; }
  .bottom-nav {
    position:fixed; z-index:95; left:0; right:0; bottom:0;
    height:calc(52px + env(safe-area-inset-bottom)); display:grid;
    grid-template-columns:repeat(4,1fr); padding-bottom:env(safe-area-inset-bottom);
    border-top:1px solid #252525; background:rgba(15,15,15,.98);
  }
  .bottom-nav button {
    display:grid; place-items:center; align-content:center; gap:2px;
    padding:0; border:0; background:transparent; color:#aaa;
  }
  .bottom-nav button.active { color:#fff; }
  .bottom-nav :deep(svg) { width:20px; height:20px; }
  .bottom-nav span { font-size:9px; }
  .global-mini {
    left:8px; right:8px; bottom:calc(60px + env(safe-area-inset-bottom)); width:auto;
  }
  .global-mini.collapsed { left:auto; width:min(290px,calc(100vw - 16px)); }
}
</style>
''')


p = Path("src/components/GridVideoItem.vue")
p.write_text(r'''<template>
  <article class="yt-card">
    <div class="thumb-wrap">
      <router-link class="thumb-link" :to="watchTarget">
        <img :src="data.thumbnail" :alt="data.titleText || data.title" loading="lazy" decoding="async">
      </router-link>
      <button v-if="openMini" class="quick" type="button" @click="openMini(data)">
        <Play/><span>Xem nhanh</span>
      </button>
      <span v-if="data.duration" class="duration">{{ data.duration }}</span>
    </div>

    <div class="card-info">
      <router-link class="avatar" :to="channelTarget" aria-label="Mở kênh">
        <img v-if="data.authorAvatar && !avatarFailed" :src="data.authorAvatar" :alt="channel" @error="avatarFailed = true">
        <UserRound v-else/>
      </router-link>
      <div class="copy">
        <router-link class="title-link" :to="watchTarget"><h3 v-html="data.title"/></router-link>
        <router-link class="channel" :to="channelTarget">{{ channel }}</router-link>
        <div class="meta">
          <span v-if="views">{{ views }}</span><span v-if="views && age"> · </span><span v-if="age">{{ age }}</span>
        </div>
      </div>
      <button class="more" type="button" aria-label="Thêm"><MoreVertical/></button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { MoreVertical, Play, UserRound } from '@lucide/vue';
import type { VideoItemData } from '@/utils/helpers';
import { formatRelativeTime } from '@/utils/display1988';

const props = defineProps<{
  data: VideoItemData & {
    channelKey?: string;
    publishedAt?: number;
    viewsText?: string;
    layout?: 'portrait' | 'square' | 'landscape';
  };
  feedKey?: string;
  feedIndex?: number;
}>();

const openMini = inject<((data: any) => void) | null>('1988OpenMini', null);
const avatarFailed = ref(false);
const tick = ref(Date.now());
let timer: number | undefined;

const channel = computed(() => String(props.data.metadata?.[0] || 'YouTube'));
const channelTarget = computed(() => '/channel/' + encodeURIComponent(props.data.channelKey || channel.value));
const views = computed(() => String(props.data.viewsText || ''));
const age = computed(() => {
  void tick.value;
  return props.data.publishedAt ? formatRelativeTime(props.data.publishedAt) : '';
});
const watchTarget = computed(() => {
  const query: Record<string,string> = {};
  if (props.data.layout) query.shape = props.data.layout;
  if (props.feedKey) query.feed = props.feedKey;
  if (Number.isFinite(props.feedIndex)) query.index = String(props.feedIndex);
  return { path: '/watch/' + props.data.videoId, query };
});

onMounted(() => { timer = window.setInterval(() => { tick.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { if (timer !== undefined) clearInterval(timer); });
</script>

<style scoped>
.yt-card { min-width:0; }
.thumb-wrap {
  position:relative; aspect-ratio:16/9; overflow:hidden;
  border-radius:12px; background:#222;
}
.thumb-link,.thumb-link img { width:100%; height:100%; display:block; }
.thumb-link img { object-fit:cover; transition:transform .18s ease; }
.yt-card:hover .thumb-link img { transform:scale(1.012); }
.duration {
  position:absolute; right:5px; bottom:5px; padding:3px 5px;
  border-radius:4px; background:rgba(0,0,0,.82); color:#fff;
  font-size:11px; font-weight:700;
}
.quick {
  position:absolute; z-index:3; left:7px; bottom:7px; height:29px;
  display:inline-flex; align-items:center; gap:5px; padding:0 9px;
  border:0; border-radius:6px; background:rgba(15,15,15,.86);
  color:#fff; font-size:10.5px; font-weight:600; opacity:0;
  transition:opacity .15s ease;
}
.quick :deep(svg) { width:13px; height:13px; fill:#fff; }
.yt-card:hover .quick,.quick:focus-visible { opacity:1; }

.card-info {
  display:grid; grid-template-columns:36px minmax(0,1fr) 32px;
  gap:10px; align-items:start; padding:10px 0 0;
}
.avatar {
  width:36px; height:36px; overflow:hidden; display:grid; place-items:center;
  border-radius:50%; background:#272727; color:#aaa;
}
.avatar img { width:100%; height:100%; object-fit:cover; }
.avatar :deep(svg) { width:17px; height:17px; }
.copy { min-width:0; }
.title-link,.channel { color:inherit; text-decoration:none; }
.title-link h3 {
  margin:0; overflow:hidden; display:-webkit-box; color:#f1f1f1;
  font-size:14px; line-height:1.35; font-weight:600;
  -webkit-box-orient:vertical; -webkit-line-clamp:2;
}
.channel {
  display:block; margin-top:5px; overflow:hidden; color:#aaa;
  font-size:12px; white-space:nowrap; text-overflow:ellipsis;
}
.channel:hover { color:#ddd; }
.meta { margin-top:2px; color:#aaa; font-size:12px; line-height:1.3; }
.more {
  width:32px; height:32px; display:grid; place-items:center; padding:0;
  border:0; border-radius:50%; background:transparent; color:#ddd; opacity:0;
}
.more:hover { background:#272727; }
.more :deep(svg) { width:19px; height:19px; }
.yt-card:hover .more { opacity:1; }

@media (hover:none) {
  .quick,.more { opacity:1; }
}
@media (max-width:760px) {
  .thumb-wrap { border-radius:0; }
  .card-info { padding:9px 12px 0; }
  .yt-card { margin-inline:-12px; }
}
</style>
''')


p = Path("index.html")
s = p.read_text()
if 'name="1988-ui-build"' not in s:
    s = s.replace("<head>", '<head>\\n    <meta name="1988-ui-build" content="youtube-shell-v7">', 1)
p.write_text(s)
"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
