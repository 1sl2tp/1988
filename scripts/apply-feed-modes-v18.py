from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 feed modes v18: compact UI + dynamic trusted-source trend ranking."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 feed modes v18: compact UI + dynamic trusted-source trend ranking.

p = Path("src/pages/HomePage.vue")
s = p.read_text()

# --- Compact shelf: users choose ranking intent, while trusted publishers stay
# dynamic and hidden behind one provenance button instead of dozens of chips.
compact_shelf = r"""    <section class="filter-shelf compact">
      <div class="mode-scroll">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          class="filter-chip mode-chip"
          :class="{ active: mode === item.id }"
          @click="setMode(item.id)"
        >
          {{ item.label }}
        </button>

        <button
          type="button"
          class="trusted-source-button"
          :class="{ open: sourceOpen }"
          @click="sourceOpen = !sourceOpen"
        >
          Nguồn uy tín · {{ publisherSources.length }}
        </button>
      </div>

      <div v-if="sourceOpen" class="trusted-source-popover">
        <strong>Nguồn đang dùng</strong>
        <p>Tự lấy từ kết quả kênh YouTube Việt Nam; ưu tiên kênh xác minh, kênh truyền thông chính thống và kênh có lượng theo dõi lớn.</p>
        <div class="trusted-source-list">
          <span v-for="item in publisherSources.slice(0, 14)" :key="item.id">
            <b>{{ item.label }}</b>
            <small v-if="item.subscribers">{{ formatPublisherFollowers1988(item.subscribers) }}</small>
          </span>
        </div>
      </div>
    </section>"""

s, count = re.subn(
    r"""    <section class="filter-shelf">[\s\S]*?</section>\n\n    <section class="feed-area">""",
    compact_shelf + '\n\n    <section class="feed-area">',
    s,
    count=1
)
if count != 1:
    raise SystemExit("home filter shelf not found")

# --- Feed mode state.
s = s.replace(
    "type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';",
    """type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';
type FeedMode = 'latest' | 'top' | 'trending' | 'interest' | 'views';""",
    1
)

mode_block = r"""
const modes: Array<{ id: FeedMode; label: string }> = [
  { id: 'latest', label: 'Mới nhất' },
  { id: 'top', label: 'Top' },
  { id: 'trending', label: 'Xu hướng' },
  { id: 'interest', label: 'Quan tâm' },
  { id: 'views', label: 'Xem nhiều' }
];
"""

anchor = "const sources: Array<{ id: SourceId; label: string }> = ["
if mode_block.strip() not in s:
    s = s.replace(anchor, mode_block + "\n" + anchor, 1)

s = s.replace(
    """const source = ref<SourceId>('latest');
const publisher = ref<PublisherId>('all');
const topic = ref<TopicId>('all');""",
    """const source = ref<SourceId>('latest');
const mode = ref<FeedMode>('latest');
const publisher = ref<PublisherId>('all');
const topic = ref<TopicId>('all');
const sourceOpen = ref(false);""",
    1
)

s = s.replace(
    "const feedKey = computed(() => 'home:' + source.value + ':' + publisher.value + ':' + topic.value);",
    "const feedKey = computed(() => 'home:' + source.value + ':' + mode.value);",
    1
)

# Dynamic source provenance helper.
if "const publisherSources = computed" not in s:
    s = s.replace(
        "const feedKey = computed(() => 'home:' + source.value + ':' + mode.value);",
        """const feedKey = computed(() => 'home:' + source.value + ':' + mode.value);
const publisherSources = computed(() => publishers.value.filter(item => item.id !== 'all'));

function formatPublisherFollowers1988(value: number) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tr';
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('vi-VN') + ' N';
  return n.toLocaleString('vi-VN');
}""",
        1
    )

# Route sync: old source/topic query params no longer control the main home feed.
s = s.replace(
    """  const wantedSource = String(route.query.source || 'latest') as SourceId;
  const wantedPublisher = String(route.query.publisher || 'all') as PublisherId;
  const wantedTopic = String(route.query.topic || 'all') as TopicId;
  source.value = sources.some(x => x.id === wantedSource) ? wantedSource : 'latest';
  publisher.value = publishers.value.some(x => x.id === wantedPublisher) ? wantedPublisher : 'all';
  topic.value = topics.some(x => x.id === wantedTopic) ? wantedTopic : 'all';""",
    """  const wantedSource = String(route.query.source || 'latest') as SourceId;
  const wantedMode = String(route.query.mode || 'latest') as FeedMode;
  source.value = sources.some(x => x.id === wantedSource) ? wantedSource : 'latest';
  mode.value = modes.some(x => x.id === wantedMode) ? wantedMode : 'latest';

  // Publisher/topic are discovery internals now. The visible feed automatically
  // mixes trusted YouTube sources instead of asking users to manage a long list.
  publisher.value = 'all';
  topic.value = 'all';""",
    1
)

# Compact mode routing.
if "function setMode(value: FeedMode)" not in s:
    s = s.replace(
        "function setSource(value: SourceId) {",
        """function setMode(value: FeedMode) {
  if (value === mode.value) return;
  sourceOpen.value = false;
  void router.replace({
    path: '/',
    query: {
      ...(source.value !== 'latest' ? { source: source.value } : {}),
      ...(value !== 'latest' ? { mode: value } : {})
    }
  });
}

function setSource(value: SourceId) {""",
        1
    )


# remove legacy hidden setters
s = re.sub(
    r"""\nfunction setSource\(value: SourceId\) \{[\s\S]*?\n\}\n\nfunction setPublisher\(value: PublisherId\) \{[\s\S]*?\n\}\n\nfunction setTopic\(value: TopicId\) \{[\s\S]*?\n\}\n""",
    "\n",
    s,
    count=1
)

# Cache follows only content type + ranking mode.
s = s.replace(
    "return CACHE_PREFIX + source.value + ':' + publisher.value + ':' + topic.value;",
    "return CACHE_PREFIX + source.value + ':' + mode.value;",
    1
)
s = s.replace(
    "const CACHE_PREFIX = '1988:home:v14:';",
    "const CACHE_PREFIX = '1988:home:v18:';",
    1
)

# Dynamic source discovery: no fixed publisher brand list. Discover from YouTube
# channel results and rank by verification + audience + generic media cues.
s = s.replace(
    """  const text = normalizePublisherText1988(raw).replace(/,/g, '.');
  const match = text.match(/([\d.]+)\s*([kmb]?)/i);
  if (!match) return 0;

  const value = Number(match[1]) || 0;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
  return Math.round(value * multiplier);""",
    """  const original = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/,/g, '.');

  const match = original.match(/([\d.]+)\s*(trieu|tr|m|nghin|ngan|n|k|b)?/i);
  if (!match) return 0;

  const value = Number(match[1]) || 0;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier =
    suffix === 'b' ? 1e9 :
    ['trieu','tr','m'].includes(suffix) ? 1e6 :
    ['nghin','ngan','n','k'].includes(suffix) ? 1e3 :
    1;

  return Math.round(value * multiplier);""",
    1
)

s = s.replace(
    """  // Institution classes, not a fixed channel allow-list.
  if (/\b(vtv|vtc|antv|vnews|vov|htv|qpvn)\b/.test(text)) score += 12;
  if (/(truyen hinh|thong tan|nhan dan|quoc phong|cong an)/.test(text)) score += 9;
  if (/(bao |bao$|tin tuc|news|thoi su|phap luat|lao dong|dan tri|vnexpress)/.test(text)) score += 5;""",
    """  // Generic institutional cues only; the actual channels come from YouTube.
  if (/(truyen hinh|thong tan|phat thanh|nhan dan|quoc phong|cong an)/.test(text)) score += 9;
  if (/(bao |bao$|tin tuc|news|thoi su|phap luat|media|official)/.test(text)) score += 5;""",
    1
)

s = s.replace(
    """  return /(vtv|vtc|antv|vnews|vov|htv|qpvn|truyen hinh|thong tan|nhan dan|quoc phong|cong an|bao|tin tuc|news|thoi su|phap luat|lao dong|dan tri|vnexpress)/.test(text);""",
    """  return /(truyen hinh|thong tan|phat thanh|nhan dan|quoc phong|cong an|bao|tin tuc|news|thoi su|phap luat|media|official)/.test(text);""",
    1
)

s = s.replace(
    """    const queries = [
      'tin tức Việt Nam',
      'thời sự Việt Nam',
      'truyền hình Việt Nam',
      'báo Việt Nam',
      'news Việt Nam',
      'VTV VTC ANTV VNEWS'
    ];""",
    """    const queries = [
      'tin tức Việt Nam kênh chính thức',
      'thời sự Việt Nam kênh chính thức',
      'truyền hình Việt Nam official',
      'báo chí Việt Nam YouTube',
      'news Việt Nam verified',
      'tin nóng Việt Nam hôm nay'
    ];""",
    1
)

s = s.replace(
    "if (!name || !publisherLooksRelevant1988(name, description)) continue;",
    """if (!name) continue;
        const relevantMedia = publisherLooksRelevant1988(name, description);""",
    1
)

s = s.replace(
    """        if (!institutionScore && !verified && subscribers < 100000) continue;
        if (institutionScore < 5 && !verified && subscribers < 100000) continue;""",
    """        if (!relevantMedia && !verified && subscribers < 100000) continue;
        if (!institutionScore && !verified && subscribers < 100000) continue;""",
    1
)

# Refresh source discovery more often so the pool can evolve.
s = s.replace(
    "return Date.now() - Number(parsed?.at || 0) < 12 * 60 * 60 * 1000;",
    "return Date.now() - Number(parsed?.at || 0) < 6 * 60 * 60 * 1000;",
    1
)
s = s.replace(
    "const PUBLISHER_CACHE_KEY = '1988:publishers:v16';",
    "const PUBLISHER_CACHE_KEY = '1988:publishers:v18';",
    1
)

# --- Ranking logic. All modes use the same recent uploads from dynamically
# discovered trusted channels; only ranking changes.
rank_helpers = r"""
function hoursOld1988(row: Row) {
  const ts = Number(row.publishedAt || 0);
  if (!ts) return 9999;
  return Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
}

function velocity1988(row: Row) {
  const hours = Math.max(1, hoursOld1988(row));
  return Math.max(0, Number(row.viewCount || 0)) / hours;
}

const HEADLINE_STOP_1988 = new Set([
  'viet','nam','moi','nhat','hom','nay','tin','tuc','thoi','su','video','clip',
  'truc','tiep','chinh','thuc','cap','nhat','ve','va','cua','cho','voi','tai',
  'trong','sau','truoc','nhung','mot','cac','khi','tu','den','tren','duoi'
]);

function headlineTokens1988(row: Row) {
  return normalizePublisherText1988(row.titleText || row.title || '')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !HEADLINE_STOP_1988.has(token))
    .slice(0, 14);
}

function coverageMap1988(rows: Row[]) {
  const tokenSets = rows.map(row => new Set(headlineTokens1988(row)));
  const channels = rows.map(row => normalizePublisherText1988(row.metadata?.[0] || ''));
  const result = new Map<string, number>();

  rows.forEach((row, index) => {
    const mine = tokenSets[index];
    if (mine.size < 2) {
      result.set(row.videoId, 0);
      return;
    }

    const relatedChannels = new Set<string>();
    rows.forEach((_other, j) => {
      if (j === index || channels[j] === channels[index]) return;
      const theirs = tokenSets[j];
      let common = 0;
      for (const token of mine) {
        if (theirs.has(token)) common += 1;
      }
      const threshold = Math.max(2, Math.ceil(Math.min(mine.size, theirs.size) * 0.34));
      if (common >= threshold && channels[j]) relatedChannels.add(channels[j]);
    });

    result.set(row.videoId, relatedChannels.size);
  });

  return result;
}

function rankFeed1988(rows: Row[]) {
  const coverage = coverageMap1988(rows);

  return [...rows].sort((a, b) => {
    const av = Math.max(0, Number(a.viewCount || 0));
    const bv = Math.max(0, Number(b.viewCount || 0));
    const ah = hoursOld1988(a);
    const bh = hoursOld1988(b);
    const ac = coverage.get(a.videoId) || 0;
    const bc = coverage.get(b.videoId) || 0;
    const aVelocity = velocity1988(a);
    const bVelocity = velocity1988(b);

    if (mode.value === 'views') {
      return bv - av || Number(b.publishedAt || 0) - Number(a.publishedAt || 0);
    }

    if (mode.value === 'trending') {
      const as = Math.log10(aVelocity + 1) * 24 + ac * 8 - ah / 24;
      const bs = Math.log10(bVelocity + 1) * 24 + bc * 8 - bh / 24;
      return bs - as || Number(b.publishedAt || 0) - Number(a.publishedAt || 0);
    }

    if (mode.value === 'interest') {
      const as = ac * 100 + Math.log10(av + 10) * 7 - ah / 36;
      const bs = bc * 100 + Math.log10(bv + 10) * 7 - bh / 36;
      return bs - as || Number(b.publishedAt || 0) - Number(a.publishedAt || 0);
    }

    if (mode.value === 'top') {
      const as =
        Math.log10(av + 10) * 11 +
        Math.log10(aVelocity + 1) * 15 +
        ac * 14 -
        ah / 30;
      const bs =
        Math.log10(bv + 10) * 11 +
        Math.log10(bVelocity + 1) * 15 +
        bc * 14 -
        bh / 30;
      return bs - as || Number(b.publishedAt || 0) - Number(a.publishedAt || 0);
    }

    return Number(b.publishedAt || 0) - Number(a.publishedAt || 0)
      || bv - av;
  });
}
"""

if "function rankFeed1988" not in s:
    helper_anchor = "function maxHomeAgeMs1988() {"
    s = s.replace(helper_anchor, rank_helpers + "\n" + helper_anchor, 1)

# Recency is strict for every public feed; no multi-year videos can become top.
old_age = r"""function maxHomeAgeMs1988() {
  // News/current-affairs must be truly current. Entertainment/music/short film
  // gets a wider window, but still never drifts into old multi-year results.
  if (source.value === 'live') return 48 * 60 * 60 * 1000;
  if (topic.value === 'am-nhac' || topic.value === 'phim-ngan' || topic.value === 'giai-tri') {
    return 30 * 24 * 60 * 60 * 1000;
  }
  if (['all','thoi-su','an-ninh','tin-tuc','quoc-te','kinh-te','phap-luat'].includes(topic.value)) {
    return 72 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;
}"""
new_age = r"""function maxHomeAgeMs1988() {
  if (source.value === 'live') return 48 * 60 * 60 * 1000;
  if (mode.value === 'latest') return 72 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}"""
s = s.replace(old_age, new_age, 1)

# Broad discovery query, not a hand-authored topic list. Each trusted publisher
# contributes recent uploads; ranking modes decide what surfaces.
s = s.replace(
    "const topicQuery = currentTopic().query;",
    "const topicQuery = 'tin mới hôm nay Việt Nam thế giới';",
    1
)

# Replace old freshness sorting with mode-aware rank.
old_fresh = r"""  const fresh = merged
    .filter(isFreshHomeVideo1988)
    .sort((a,b) => {
      if (source.value === 'live') {
        const al = /live|trực tiếp/i.test(String(a.title)) ? 1 : 0;
        const bl = /live|trực tiếp/i.test(String(b.title)) ? 1 : 0;
        if (al !== bl) return bl - al;
      }
      const at = a.publishedAt || 0;
      const bt = b.publishedAt || 0;
      if (at !== bt) return bt - at;
      return (b.viewCount || 0) - (a.viewCount || 0);
    });"""

new_fresh = r"""  const fresh = rankFeed1988(
    merged.filter(isFreshHomeVideo1988)
  );"""

if old_fresh not in s:
    raise SystemExit("fresh ranking block not found")
s = s.replace(old_fresh, new_fresh, 1)

# Swipe feed label/state follows ranking mode rather than hidden source/topic.
s = s.replace(
    """      sources.find(x => x.id === source.value)?.label,
      publishers.value.find(x => x.id === publisher.value)?.label,
      topics.find(x => x.id === topic.value)?.label""",
    """      sources.find(x => x.id === source.value)?.label,
      modes.find(x => x.id === mode.value)?.label""",
    1
)
s = s.replace(
    """      source: source.value,
      publisher: publisher.value,
      topic: topic.value,""",
    """      source: source.value,
      mode: mode.value,""",
    1
)

# Route watcher only needs visible feed dimensions.
s = s.replace(
    "watch(() => [route.query.source, route.query.publisher, route.query.topic], applyRouteAndRefresh);",
    "watch(() => [route.query.source, route.query.mode], applyRouteAndRefresh);",
    1
)

# CSS overrides for the compact single-line shelf.
if "1988-feed-modes-v18" not in s:
    s = s.replace(
        "</style>",
        r"""
/* 1988-feed-modes-v18 */
.filter-shelf.compact {
  position: sticky;
  z-index: 72;
  top: var(--yt-header-h);
  min-height: 50px;
  display: block;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  background: rgba(15,15,15,.985);
}

.mode-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mode-scroll::-webkit-scrollbar { display: none; }

.mode-chip {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 14px;
}

.trusted-source-button {
  flex: 0 0 auto;
  height: 32px;
  margin-left: auto;
  padding: 0 12px;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 8px;
  background: #181818;
  color: #aaa;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.trusted-source-button:hover,
.trusted-source-button.open {
  background: #272727;
  color: #fff;
}

.trusted-source-popover {
  position: absolute;
  z-index: 90;
  top: 48px;
  right: 16px;
  width: min(420px, calc(100vw - 32px));
  max-height: min(460px, 70vh);
  overflow-y: auto;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 12px;
  background: #202020;
  box-shadow: 0 16px 46px rgba(0,0,0,.48);
}
.trusted-source-popover > strong {
  display: block;
  font-size: 13px;
}
.trusted-source-popover > p {
  margin: 5px 0 12px;
  color: #999;
  font-size: 11px;
  line-height: 1.45;
}
.trusted-source-list {
  display: grid;
  gap: 2px;
}
.trusted-source-list > span {
  min-height: 35px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 9px;
  border-radius: 7px;
}
.trusted-source-list > span:hover {
  background: #2b2b2b;
}
.trusted-source-list b {
  min-width: 0;
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.trusted-source-list small {
  flex: 0 0 auto;
  color: #888;
  font-size: 10px;
}

@media (max-width: 760px) {
  .filter-shelf.compact {
    min-height: 46px;
    padding: 7px 9px;
  }
  .mode-scroll {
    gap: 6px;
  }
  .mode-chip,
  .trusted-source-button {
    height: 30px;
    padding-inline: 11px;
    font-size: 11.5px;
  }
  .trusted-source-button {
    margin-left: 0;
  }
  .trusted-source-popover {
    top: 44px;
    right: 8px;
    width: calc(100vw - 16px);
  }
}
</style>""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
