from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 TikTok v15: first-class TikTok swipe feed using official embed player."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r"""
# 1988 TikTok v15: first-class TikTok swipe feed using official embed player.

# ---------- TikTok official embed player ----------
p = Path("src/components/TikTokPlayer.vue")
p.write_text(r'''<template>
  <div class="tt-player">
    <iframe
      ref="frame"
      :src="src"
      title="TikTok video"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowfullscreen
      @load="onLoad"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ postId: string }>();
const emit = defineEmits<{
  (event: 'state', payload: { playing: boolean; currentTime: number; duration: number }): void;
  (event: 'unavailable', payload: { id: string; code: number | string }): void;
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const ready = ref(false);
const src = computed(() => {
  const id = encodeURIComponent(String(props.postId || ''));
  return 'https://www.tiktok.com/player/v1/' + id +
    '?autoplay=1&controls=1&progress_bar=1&play_button=1' +
    '&volume_control=1&fullscreen_button=1&timestamp=1' +
    '&loop=0&music_info=0&description=0&rel=0' +
    '&native_context_menu=0&closed_caption=0&muted=0';
});

function send(type: string, value?: unknown) {
  frame.value?.contentWindow?.postMessage({
    type,
    value,
    'x-tiktok-player': true
  }, '*');
}

function onLoad() {
  window.setTimeout(() => {
    send('play');
    send('unMute');
  }, 80);
}

function onMessage(event: MessageEvent) {
  const data: any = event.data;
  if (!data || data['x-tiktok-player'] !== true) return;
  if (event.source !== frame.value?.contentWindow) return;

  if (data.type === 'onPlayerReady') {
    ready.value = true;
    send('play');
    send('unMute');
    return;
  }

  if (data.type === 'onStateChange') {
    emit('state', {
      playing: Number(data.value) === 1,
      currentTime: 0,
      duration: 0
    });
    return;
  }

  if (data.type === 'onCurrentTime') {
    const value = data.value || {};
    emit('state', {
      playing: true,
      currentTime: Number(value.currentTime || 0),
      duration: Number(value.duration || 0)
    });
    return;
  }

  if (data.type === 'onPlayerError') {
    emit('unavailable', {
      id: props.postId,
      code: data?.value?.errorCode ?? data?.value?.errorType ?? 'player_error'
    });
  }
}

function play() { send('play'); }
function pause() { send('pause'); }
function mute() { send('mute'); }
function unMute() { send('unMute'); }

defineExpose({ play, pause, mute, unMute });

onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
</script>

<style scoped>
.tt-player {
  width: 100%;
  height: 100%;
  background: #000;
}
.tt-player iframe {
  width: 100%;
  height: 100%;
  display: block;
  border: 0;
  background: #000;
}
</style>
''')


# ---------- TikTok swipe page ----------
p = Path("src/pages/TikTokPage.vue")
p.write_text(r'''<template>
  <div class="tt-page">
    <section class="tt-filters">
      <div class="tt-filter-row">
        <span>Nguồn</span>
        <div>
          <button
            v-for="item in publishers"
            :key="item.id"
            type="button"
            :class="{ active: publisher === item.id }"
            @click="setPublisher(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="tt-filter-row">
        <span>Chủ đề</span>
        <div>
          <button
            v-for="item in topics"
            :key="item.id"
            type="button"
            :class="{ active: topic === item.id }"
            @click="setTopic(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </section>

    <section
      ref="feedEl"
      class="tt-feed"
      @scroll.passive="onScroll"
    >
      <article
        v-for="(item,index) in items"
        :key="item.id"
        class="tt-slide"
      >
        <div class="tt-stage">
          <TikTokPlayer
            v-if="index === activeIndex"
            :post-id="item.id"
            @unavailable="dropUnavailable"
          />
          <img
            v-else-if="item.thumbnail"
            class="tt-poster"
            :src="item.thumbnail"
            :alt="item.title || item.uploader"
            loading="eager"
          >
          <div v-else class="tt-placeholder">TikTok</div>

          <div class="tt-caption">
            <strong>@{{ item.handle || item.uploader }}</strong>
            <p v-if="item.title">{{ item.title }}</p>
            <small>{{ age(item.timestamp) }}</small>
          </div>
        </div>
      </article>

      <div v-if="loading && !items.length" class="tt-loading">
        <span></span><span></span><span></span>
      </div>

      <div v-if="!loading && !items.length" class="tt-empty">
        Chưa lấy được video TikTok phù hợp từ nhóm nguồn này.
      </div>
    </section>

    <nav v-if="items.length" class="tt-arrows" aria-label="Chuyển video">
      <button type="button" :disabled="activeIndex <= 0" @click="move(-1)"><ArrowUp/></button>
      <button type="button" :disabled="activeIndex >= items.length - 1" @click="move(1)"><ArrowDown/></button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import TikTokPlayer from '@/components/TikTokPlayer.vue';
import { formatRelativeTime } from '@/utils/display1988';

const BACKEND = 'https://one988-audio.onrender.com';
const route = useRoute();
const router = useRouter();
const feedEl = ref<HTMLElement | null>(null);
const loading = ref(false);
const items = ref<any[]>([]);
const activeIndex = ref(0);
const tick = ref(Date.now());
let loadSerial = 0;

type PublisherId =
  | 'all' | 'vtv24' | 'vtc-now' | 'antv' | 'qpvn' | 'vnews' | 'htv'
  | 'thanh-nien' | 'tuoi-tre' | 'tien-phong' | 'vietnamnet' | 'dan-tri'
  | 'vnexpress' | 'lao-dong' | 'nld' | 'plo' | 'tiin' | 'vtvcab'
  | 'afamily' | 'vov';

type TopicId =
  | 'all' | 'thoi-su' | 'an-ninh' | 'tin-tuc' | 'quoc-te' | 'kinh-te'
  | 'phap-luat' | 'cong-nghe' | 'doi-song' | 'suc-khoe' | 'giao-duc'
  | 'the-thao' | 'giai-tri';

const publishers: Array<{ id: PublisherId; label: string; handle: string }> = [
  { id: 'all', label: 'Tất cả nguồn', handle: '' },
  { id: 'vtv24', label: 'VTV24', handle: 'vtv24news' },
  { id: 'vtc-now', label: 'VTC NOW', handle: 'vtcnow' },
  { id: 'antv', label: 'ANTV', handle: 'antv_official' },
  { id: 'qpvn', label: 'QPVN', handle: 'truyenhinhquandoi' },
  { id: 'vnews', label: 'VNEWS', handle: 'vnews360' },
  { id: 'htv', label: 'HTV Tin tức', handle: 'htvtintuc' },
  { id: 'thanh-nien', label: 'Thanh Niên', handle: 'baothanhnien.official' },
  { id: 'tuoi-tre', label: 'Tuổi Trẻ', handle: 'baotuoitre' },
  { id: 'tien-phong', label: 'Tiền Phong', handle: 'baotienphong.official' },
  { id: 'vietnamnet', label: 'VietNamNet', handle: 'vietnamnet.vn' },
  { id: 'dan-tri', label: 'Dân Trí', handle: 'dantri.com.vn' },
  { id: 'vnexpress', label: 'VnExpress', handle: 'vnexpress.official' },
  { id: 'lao-dong', label: 'Lao Động', handle: 'laodong.vn' },
  { id: 'nld', label: 'Người Lao Động', handle: 'baonguoilaodong' },
  { id: 'plo', label: 'PLO', handle: 'plo.vn' },
  { id: 'tiin', label: 'Tiin.vn', handle: 'tiin.vn' },
  { id: 'vtvcab', label: 'VTVcab Tin tức', handle: 'vtvcab.tintuc' },
  { id: 'afamily', label: 'aFamily', handle: 'afamilynews' },
  { id: 'vov', label: 'VOV', handle: 'truyenhinhvov' }
];

const topics: Array<{ id: TopicId; label: string; terms: string[] }> = [
  { id: 'all', label: 'Mới nhất', terms: [] },
  { id: 'thoi-su', label: 'Thời sự', terms: ['thời sự','chính phủ','quốc hội','chính trị','thủ tướng','chủ tịch'] },
  { id: 'an-ninh', label: 'An ninh', terms: ['công an','an ninh','vụ án','bắt giữ','khởi tố','truy nã','tai nạn','cháy'] },
  { id: 'tin-tuc', label: 'Tin tức', terms: ['tin tức','tin nóng','mới nhất','hôm nay'] },
  { id: 'quoc-te', label: 'Quốc tế', terms: ['quốc tế','thế giới','mỹ','trung quốc','nga','ukraine','iran','israel'] },
  { id: 'kinh-te', label: 'Kinh tế', terms: ['kinh tế','giá vàng','chứng khoán','doanh nghiệp','ngân hàng','thị trường'] },
  { id: 'phap-luat', label: 'Pháp luật', terms: ['pháp luật','tòa án','xét xử','khởi tố','bị can','bị cáo'] },
  { id: 'cong-nghe', label: 'Công nghệ', terms: ['công nghệ','ai','trí tuệ nhân tạo','điện thoại','máy tính','robot'] },
  { id: 'doi-song', label: 'Đời sống', terms: ['đời sống','xã hội','dân sinh','giao thông','du lịch','ẩm thực'] },
  { id: 'suc-khoe', label: 'Sức khỏe', terms: ['sức khỏe','bệnh','bác sĩ','bệnh viện','y tế','thuốc'] },
  { id: 'giao-duc', label: 'Giáo dục', terms: ['giáo dục','học sinh','sinh viên','trường học','thi','tuyển sinh'] },
  { id: 'the-thao', label: 'Thể thao', terms: ['thể thao','bóng đá','đội tuyển','fifa','v-league','sea games'] },
  { id: 'giai-tri', label: 'Giải trí', terms: ['giải trí','ca sĩ','diễn viên','showbiz','âm nhạc','phim'] }
];

const publisher = ref<PublisherId>('all');
const topic = ref<TopicId>('all');

const selectedPublisher = computed(() => publishers.find(x => x.id === publisher.value) || publishers[0]);
const selectedTopic = computed(() => topics.find(x => x.id === topic.value) || topics[0]);

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D')
    .toLowerCase();
}

function topicMatch(item: any) {
  if (topic.value === 'all') return true;
  const text = normalize(item?.title || item?.description || '');
  const terms = selectedTopic.value.terms.map(normalize);
  return terms.some(term => text.includes(term));
}

function freshEnough(item: any) {
  const ts = Number(item?.timestamp || 0) * 1000;
  if (!ts) return false;
  const maxAge = topic.value === 'giai-tri' ? 30 : 7;
  return Date.now() - ts <= maxAge * 24 * 60 * 60 * 1000;
}

function syncRoute() {
  const p = String(route.query.publisher || 'all') as PublisherId;
  const t = String(route.query.topic || 'all') as TopicId;
  publisher.value = publishers.some(x => x.id === p) ? p : 'all';
  topic.value = topics.some(x => x.id === t) ? t : 'all';
}

function setPublisher(value: PublisherId) {
  void router.replace({
    path: '/tiktok',
    query: {
      ...(value !== 'all' ? { publisher: value } : {}),
      ...(topic.value !== 'all' ? { topic: topic.value } : {})
    }
  });
}

function setTopic(value: TopicId) {
  void router.replace({
    path: '/tiktok',
    query: {
      ...(publisher.value !== 'all' ? { publisher: publisher.value } : {}),
      ...(value !== 'all' ? { topic: value } : {})
    }
  });
}

async function load() {
  const current = ++loadSerial;
  loading.value = true;
  activeIndex.value = 0;

  try {
    const url = new URL(
      selectedPublisher.value.id === 'all'
        ? BACKEND + '/tiktok/feed'
        : BACKEND + '/tiktok/profile'
    );

    if (selectedPublisher.value.id === 'all') {
      url.searchParams.set(
        'handles',
        publishers.filter(x => x.id !== 'all').map(x => x.handle).join(',')
      );
      url.searchParams.set('limit', '7');
    } else {
      url.searchParams.set('handle', selectedPublisher.value.handle);
      url.searchParams.set('limit', '24');
    }

    const response = await fetch(url.toString(), { cache: 'default' });
    const payload = await response.json();
    if (current !== loadSerial) return;

    const raw = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    const seen = new Set<string>();
    const filtered = raw
      .filter((item: any) => {
        const id = String(item?.id || '');
        if (!id || seen.has(id) || !freshEnough(item) || !topicMatch(item)) return false;
        seen.add(id);
        return true;
      })
      .sort((a: any,b: any) =>
        Number(b.timestamp || 0) - Number(a.timestamp || 0)
        || Number(b.viewCount || 0) - Number(a.viewCount || 0)
      )
      .slice(0, 80);

    items.value = filtered;
    await nextTick();
    feedEl.value?.scrollTo({ top: 0, behavior: 'auto' });
  } catch {
    if (current === loadSerial) items.value = [];
  } finally {
    if (current === loadSerial) loading.value = false;
  }
}

function age(ts: number) {
  void tick.value;
  return ts ? formatRelativeTime(Number(ts) * 1000) : '';
}

function onScroll() {
  const el = feedEl.value;
  if (!el || !el.clientHeight) return;
  const index = Math.round(el.scrollTop / el.clientHeight);
  activeIndex.value = Math.max(0, Math.min(items.value.length - 1, index));
}

function move(delta: number) {
  const el = feedEl.value;
  if (!el) return;
  const next = Math.max(0, Math.min(items.value.length - 1, activeIndex.value + delta));
  activeIndex.value = next;
  el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' });
}

function dropUnavailable(payload: { id: string }) {
  const id = String(payload?.id || '');
  const index = items.value.findIndex((item: any) => String(item.id) === id);
  if (index < 0) return;
  items.value.splice(index, 1);
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, items.value.length - 1));
}

onMounted(() => {
  syncRoute();
  void load();
  window.setInterval(() => { tick.value = Date.now(); }, 30000);
});

watch(() => [route.query.publisher, route.query.topic], () => {
  syncRoute();
  void load();
});
</script>

<style scoped>
.tt-page {
  height: calc(100dvh - var(--yt-header-h));
  min-height: 520px;
  display: grid;
  grid-template-rows: auto minmax(0,1fr);
  overflow: hidden;
  background: #000;
}

.tt-filters {
  z-index: 20;
  display: grid;
  gap: 2px;
  padding: 5px 0 6px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(15,15,15,.985);
}

.tt-filter-row {
  min-width: 0;
  min-height: 34px;
  display: grid;
  grid-template-columns: 58px minmax(0,1fr);
  align-items: center;
}

.tt-filter-row > span {
  padding-left: 14px;
  color: #777;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.tt-filter-row > div {
  min-width: 0;
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-right: 16px;
  scrollbar-width: none;
}
.tt-filter-row > div::-webkit-scrollbar { display: none; }

.tt-filter-row button {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 11px;
  border: 0;
  border-radius: 8px;
  background: #272727;
  color: #f1f1f1;
  font-size: 12px;
  font-weight: 600;
}
.tt-filter-row button.active {
  background: #f1f1f1;
  color: #0f0f0f;
}

.tt-feed {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
  background: #000;
}
.tt-feed::-webkit-scrollbar { display: none; }

.tt-slide {
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: grid;
  place-items: center;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  background: #000;
}

.tt-stage {
  position: relative;
  width: min(520px, 100%);
  height: 100%;
  overflow: hidden;
  background: #000;
}

.tt-poster {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.tt-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: #080808;
  color: #777;
  font-size: 36px;
  font-weight: 800;
}

.tt-caption {
  position: absolute;
  z-index: 5;
  left: 14px;
  right: 64px;
  bottom: 18px;
  pointer-events: none;
  text-shadow: 0 2px 10px rgba(0,0,0,.8);
}

.tt-caption strong {
  font-size: 13px;
}
.tt-caption p {
  max-width: 100%;
  margin: 7px 0 4px;
  overflow: hidden;
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.tt-caption small {
  color: #d0d0d0;
  font-size: 10px;
}

.tt-arrows {
  position: fixed;
  z-index: 40;
  right: 18px;
  top: 50%;
  display: grid;
  gap: 10px;
  transform: translateY(-50%);
}
.tt-arrows button {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 50%;
  background: rgba(28,28,31,.92);
  color: #fff;
}
.tt-arrows button:disabled { opacity: .18; }
.tt-arrows :deep(svg) { width: 22px; height: 22px; }

.tt-loading,
.tt-empty {
  min-height: 100%;
  display: grid;
  place-items: center;
  color: #888;
  text-align: center;
}
.tt-loading {
  grid-auto-flow: column;
  gap: 8px;
}
.tt-loading span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
}

@media (max-width: 760px) {
  .tt-page {
    height: calc(100dvh - var(--yt-header-h) - 52px - env(safe-area-inset-bottom));
  }
  .tt-filter-row {
    grid-template-columns: 48px minmax(0,1fr);
    min-height: 32px;
  }
  .tt-filter-row > span {
    padding-left: 9px;
    font-size: 9px;
  }
  .tt-filter-row > div {
    gap: 6px;
    padding-right: 10px;
  }
  .tt-filter-row button {
    height: 29px;
    padding: 0 10px;
    font-size: 11.5px;
  }
  .tt-stage {
    width: 100%;
  }
  .tt-arrows {
    display: none;
  }
}
</style>
''')


# ---------- Router ----------
p = Path("src/router.ts")
s = p.read_text()
if "TikTokPage" not in s:
    s = s.replace(
        "import ChannelPage from './pages/ChannelPage.vue';",
        "import ChannelPage from './pages/ChannelPage.vue';\nimport TikTokPage from './pages/TikTokPage.vue';",
        1
    )
    s = s.replace(
        '''    {
      path: '/channel/:id',
      component: ChannelPage
    }''',
        '''    {
      path: '/channel/:id',
      component: ChannelPage
    },
    {
      path: '/tiktok',
      component: TikTokPage
    }''',
        1
    )
p.write_text(s)


# ---------- App navigation ----------
p = Path("src/App.vue")
s = p.read_text()

s = s.replace(
    '''  Pause, Play, Radio, Search, Tv, UserRound, X''',
    '''  Pause, Play, Radio, Search, Smartphone, Tv, UserRound, X''',
    1
)

s = s.replace(
    '''  { id: 'live', label: 'Trực tiếp', icon: Radio },
  { id: 'channels', label: 'Kênh', icon: UserRound },''',
    '''  { id: 'live', label: 'Trực tiếp', icon: Radio },
  { id: 'tiktok', label: 'TikTok', icon: Smartphone },
  { id: 'channels', label: 'Kênh', icon: UserRound },''',
    1
)

s = s.replace(
    '''function openNav(item: any) {
  if (item.id === 'home') goHome();
  else goSource(item.id);
}''',
    '''function openNav(item: any) {
  if (item.id === 'home') goHome();
  else if (item.id === 'tiktok') void router.push('/tiktok');
  else goSource(item.id);
}''',
    1
)

s = s.replace(
    '''function navActive(id: string) {
  if (route.path !== '/') return false;
  const source = String(route.query.source || 'latest');
  return id === 'home' ? source === 'latest' : source === id;
}''',
    '''function navActive(id: string) {
  if (id === 'tiktok') return route.path === '/tiktok';
  if (route.path !== '/') return false;
  const source = String(route.query.source || 'latest');
  return id === 'home' ? source === 'latest' : source === id;
}''',
    1
)

s = s.replace(
    '''      <button type="button" :class="{active: navActive('shorts')}" @click="goSource('shorts')"><Clapperboard/><span>Shorts</span></button>
      <button type="button" @click="focusSearch"><Search/><span>Tìm kiếm</span></button>
      <button type="button" :class="{active: navActive('live')}" @click="goSource('live')"><Radio/><span>Live</span></button>''',
    '''      <button type="button" :class="{active: navActive('shorts')}" @click="goSource('shorts')"><Clapperboard/><span>Shorts</span></button>
      <button type="button" :class="{active: navActive('tiktok')}" @click="router.push('/tiktok')"><Smartphone/><span>TikTok</span></button>
      <button type="button" @click="focusSearch"><Search/><span>Tìm kiếm</span></button>
      <button type="button" :class="{active: navActive('live')}" @click="goSource('live')"><Radio/><span>Live</span></button>''',
    1
)

s = s.replace(
    "grid-template-columns:repeat(4,1fr);",
    "grid-template-columns:repeat(5,1fr);",
    1
)

p.write_text(s)
"""

target.write_text(text.replace(marker, block + "\n" + marker, 1))
