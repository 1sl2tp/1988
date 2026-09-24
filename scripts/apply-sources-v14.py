from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 sources v14: separate content type, publisher source and topic."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 sources v14: separate content type, publisher source and topic.

p = Path("src/pages/HomePage.vue")
s = p.read_text()

# Three explicit dimensions instead of mixing source/type/topic in one chip row.
old_shelf = """    <section class="filter-shelf">
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
    </section>"""

new_shelf = """    <section class="filter-shelf">
      <div class="filter-row">
        <span class="filter-label">Loại</span>
        <div class="filter-scroll">
          <button
            v-for="item in sources"
            :key="item.id"
            type="button"
            class="filter-chip"
            :class="{ active: source === item.id }"
            @click="setSource(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="filter-row publisher-row">
        <span class="filter-label">Nguồn</span>
        <div class="filter-scroll">
          <button
            v-for="item in publishers"
            :key="item.id"
            type="button"
            class="filter-chip publisher-chip"
            :class="{ active: publisher === item.id }"
            @click="setPublisher(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">Chủ đề</span>
        <div class="filter-scroll">
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
      </div>
    </section>"""

s = s.replace(old_shelf, new_shelf, 1)

# New publisher dimension.
s = s.replace(
    "type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';",
    """type SourceId = 'latest' | 'video' | 'channels' | 'playlists' | 'shorts' | 'live';
type PublisherId =
  | 'all' | 'vtv24' | 'vtv8' | 'vtc-now' | 'antv' | 'qpvn' | 'vnews'
  | 'nhan-dan' | 'htv' | 'thanh-nien' | 'tuoi-tre' | 'tien-phong'
  | 'vietnamnet' | 'dan-tri' | 'vnexpress' | 'lao-dong' | 'nld' | 'plo';""",
    1
)

s = s.replace(
    """type Row = VideoItemData & {
  channelKey?: string;
  publishedAt?: number;
  viewsText?: string;
  viewCount?: number;
  layout?: 'portrait' | 'square' | 'landscape';
};""",
    """type Row = VideoItemData & {
  channelKey?: string;
  publishedAt?: number;
  viewsText?: string;
  viewCount?: number;
  layout?: 'portrait' | 'square' | 'landscape';
  publisherId?: PublisherId | '';
};""",
    1
)

publisher_block = """
const publishers: Array<{
  id: PublisherId;
  label: string;
  search: string;
  aliases: string[];
}> = [
  { id: 'all', label: 'Tất cả nguồn', search: '', aliases: [] },
  { id: 'vtv24', label: 'VTV24', search: 'VTV24', aliases: ['vtv24'] },
  { id: 'vtv8', label: 'VTV8', search: 'VTV8', aliases: ['vtv8'] },
  { id: 'vtc-now', label: 'VTC NOW', search: 'VTC NOW', aliases: ['vtc now', 'vtcnow'] },
  { id: 'antv', label: 'ANTV', search: 'ANTV', aliases: ['antv', 'truyen hinh cong an nhan dan'] },
  { id: 'qpvn', label: 'QPVN', search: 'QPVN', aliases: ['qpvn', 'quoc phong viet nam'] },
  { id: 'vnews', label: 'VNEWS', search: 'VNEWS', aliases: ['vnews', 'truyen hinh thong tan'] },
  { id: 'nhan-dan', label: 'Nhân Dân TV', search: 'Nhân Dân TV', aliases: ['nhan dan tv', 'truyen hinh nhan dan'] },
  { id: 'htv', label: 'HTV Tin tức', search: 'HTV Tin tức', aliases: ['htv tin tuc', 'htv news'] },
  { id: 'thanh-nien', label: 'Thanh Niên', search: 'Báo Thanh Niên', aliases: ['bao thanh nien', 'thanh nien'] },
  { id: 'tuoi-tre', label: 'Tuổi Trẻ', search: 'Báo Tuổi Trẻ', aliases: ['bao tuoi tre', 'tuoi tre'] },
  { id: 'tien-phong', label: 'Tiền Phong', search: 'Tiền Phong TV', aliases: ['tien phong tv', 'bao tien phong', 'tien phong'] },
  { id: 'vietnamnet', label: 'VietNamNet', search: 'VietNamNet', aliases: ['vietnamnet'] },
  { id: 'dan-tri', label: 'Dân Trí', search: 'Báo Dân Trí', aliases: ['bao dan tri', 'dan tri'] },
  { id: 'vnexpress', label: 'VnExpress', search: 'VnExpress', aliases: ['vnexpress'] },
  { id: 'lao-dong', label: 'Lao Động', search: 'Báo Lao Động', aliases: ['bao lao dong', 'lao dong'] },
  { id: 'nld', label: 'Người Lao Động', search: 'Báo Người Lao Động', aliases: ['bao nguoi lao dong', 'nguoi lao dong'] },
  { id: 'plo', label: 'PLO', search: 'Báo Pháp Luật TP.HCM', aliases: ['plo', 'phap luat tp hcm', 'phap luat tphcm'] }
];
"""

s = s.replace(
    "const topics: Array<{ id: TopicId; label: string; query: string }> = [",
    publisher_block + "\\nconst topics: Array<{ id: TopicId; label: string; query: string }> = [",
    1
)

s = s.replace(
    """const source = ref<SourceId>('latest');
const topic = ref<TopicId>('all');""",
    """const source = ref<SourceId>('latest');
const publisher = ref<PublisherId>('all');
const topic = ref<TopicId>('all');""",
    1
)

s = s.replace(
    "const feedKey = computed(() => 'home:' + source.value + ':' + topic.value);",
    "const feedKey = computed(() => 'home:' + source.value + ':' + publisher.value + ':' + topic.value);",
    1
)

# Route sync + setter.
s = s.replace(
    """  const wantedSource = String(route.query.source || 'latest') as SourceId;
  const wantedTopic = String(route.query.topic || 'all') as TopicId;
  source.value = sources.some(x => x.id === wantedSource) ? wantedSource : 'latest';
  topic.value = topics.some(x => x.id === wantedTopic) ? wantedTopic : 'all';""",
    """  const wantedSource = String(route.query.source || 'latest') as SourceId;
  const wantedPublisher = String(route.query.publisher || 'all') as PublisherId;
  const wantedTopic = String(route.query.topic || 'all') as TopicId;
  source.value = sources.some(x => x.id === wantedSource) ? wantedSource : 'latest';
  publisher.value = publishers.some(x => x.id === wantedPublisher) ? wantedPublisher : 'all';
  topic.value = topics.some(x => x.id === wantedTopic) ? wantedTopic : 'all';""",
    1
)

s = s.replace(
    """      ...(value !== 'latest' ? { source: value } : {}),
      ...(topic.value !== 'all' ? { topic: topic.value } : {})""",
    """      ...(value !== 'latest' ? { source: value } : {}),
      ...(publisher.value !== 'all' ? { publisher: publisher.value } : {}),
      ...(topic.value !== 'all' ? { topic: topic.value } : {})""",
    1
)

if "function setPublisher" not in s:
    s = s.replace(
        """function setTopic(value: TopicId) {""",
        """function setPublisher(value: PublisherId) {
  if (value === publisher.value) return;
  void router.replace({
    path: '/',
    query: {
      ...(source.value !== 'latest' ? { source: source.value } : {}),
      ...(value !== 'all' ? { publisher: value } : {}),
      ...(topic.value !== 'all' ? { topic: topic.value } : {})
    }
  });
}

function setTopic(value: TopicId) {""",
        1
    )

s = s.replace(
    """      ...(source.value !== 'latest' ? { source: source.value } : {}),
      ...(value !== 'all' ? { topic: value } : {})""",
    """      ...(source.value !== 'latest' ? { source: source.value } : {}),
      ...(publisher.value !== 'all' ? { publisher: publisher.value } : {}),
      ...(value !== 'all' ? { topic: value } : {})""",
    1
)

# Cache is source+publisher+topic specific.
s = s.replace(
    "return CACHE_PREFIX + source.value + ':' + topic.value;",
    "return CACHE_PREFIX + source.value + ':' + publisher.value + ':' + topic.value;",
    1
)
s = s.replace(
    "const CACHE_PREFIX = '1988:home:v13:';",
    "const CACHE_PREFIX = '1988:home:v14:';",
    1
)

# Helpers for source recognition and publisher-aware discovery.
if "function currentPublisher()" not in s:
    s = s.replace(
        """function currentTopic() {
  return topics.find(x => x.id === topic.value) || topics[0];
}
""",
        """function currentTopic() {
  return topics.find(x => x.id === topic.value) || topics[0];
}

function currentPublisher() {
  return publishers.find(x => x.id === publisher.value) || publishers[0];
}

function normalizePublisherText1988(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function inferPublisher1988(channel: unknown): PublisherId | '' {
  const normalized = normalizePublisherText1988(channel);
  if (!normalized) return '';
  for (const item of publishers) {
    if (item.id === 'all') continue;
    if (item.aliases.some(alias => normalized.includes(normalizePublisherText1988(alias)))) {
      return item.id;
    }
  }
  return '';
}

function publisherMatches1988(channel: unknown, id: PublisherId) {
  if (id === 'all') return true;
  return inferPublisher1988(channel) === id;
}
""",
        1
    )

# Slightly wider live window but still recent; fast-news categories stay 72h.
s = s.replace(
    """  if (source.value === 'live') return 24 * 60 * 60 * 1000;
  if (topic.value === 'am-nhac' || topic.value === 'phim-ngan' || topic.value === 'giai-tri') {
    return 30 * 24 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;""",
    """  if (source.value === 'live') return 48 * 60 * 60 * 1000;
  if (topic.value === 'am-nhac' || topic.value === 'phim-ngan' || topic.value === 'giai-tri') {
    return 30 * 24 * 60 * 60 * 1000;
  }
  if (['all','thoi-su','an-ninh','tin-tuc','quoc-te','kinh-te','phap-luat'].includes(topic.value)) {
    return 72 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;""",
    1
)

# Tag mapped rows with their real publisher source.
s = s.replace(
    """    layout
  };""",
    """    layout,
    publisherId: inferPublisher1988(channel)
  };""",
    1
)

# Publisher-aware multi-source query fanout.
start = s.find("function videoQueries() {")
end = s.find("\n}\n\nasync function loadVideos", start)
if start >= 0 and end >= 0:
    old = s[start:end+2]
    new = r"""function videoQueries(): Array<{ q: string; publisherId?: PublisherId }> {
  const topicQuery = currentTopic().query;
  const suffix = source.value === 'shorts'
    ? ' shorts'
    : source.value === 'live'
      ? ' trực tiếp live'
      : '';

  const selected = currentPublisher();
  if (selected.id !== 'all') {
    return [
      { q: (selected.search + ' ' + topicQuery + suffix).trim(), publisherId: selected.id },
      { q: (selected.search + ' mới nhất hôm nay' + suffix).trim(), publisherId: selected.id }
    ];
  }

  // "Tất cả nguồn" actively fans out across real publishers instead of relying
  // on one generic YouTube search ranking.
  const perPublisher = publishers
    .filter(item => item.id !== 'all')
    .map(item => ({
      q: (item.search + ' ' + topicQuery + suffix).trim(),
      publisherId: item.id
    }));

  // One generic fallback catches current sources not yet in the curated row.
  perPublisher.push({ q: (topicQuery + suffix).trim() });
  return perPublisher;
}"""
    s = s[:start] + new + s[end+2:]

# Load queries with publisher validation, then diversify cards by channel/source.
old_load_start = """  const settled = await Promise.allSettled(videoQueries().map(q => searchRows(q, 'videos')));
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
  }"""

new_load_start = """  const queries = videoQueries();
  const settled = await Promise.allSettled(queries.map(item => searchRows(item.q, 'videos')));
  if (current !== serial) return;

  const seen = new Set<string>();
  const merged: Row[] = [];
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const expectedPublisher = queries[index]?.publisherId;
    for (const raw of result.value) {
      const row = toVideo(raw);
      if (!row || seen.has(row.videoId)) continue;

      const channel = String(row.metadata?.[0] || '');
      if (expectedPublisher && !publisherMatches1988(channel, expectedPublisher)) continue;
      if (publisher.value !== 'all' && !publisherMatches1988(channel, publisher.value)) continue;

      seen.add(row.videoId);
      merged.push(row);
    }
  });"""

s = s.replace(old_load_start, new_load_start, 1)

old_final = """  videos.value = fresh.slice(0, 60);
  persistSwipeFeed(fresh.slice(0, 120));"""

new_final = """  const perChannelLimit = source.value === 'live' ? 2 : 4;
  const channelCounts = new Map<string, number>();
  const diversified: Row[] = [];

  for (const row of fresh) {
    const channel = normalizePublisherText1988(row.metadata?.[0] || row.publisherId || 'other');
    const count = channelCounts.get(channel) || 0;
    if (publisher.value === 'all' && count >= perChannelLimit) continue;
    channelCounts.set(channel, count + 1);
    diversified.push(row);
    if (diversified.length >= 60) break;
  }

  videos.value = diversified;
  persistSwipeFeed(diversified.slice(0, 120));"""

s = s.replace(old_final, new_final, 1)

# Channel/playlist source queries should also respect a selected publisher.
s = s.replace(
    "const rows = await searchRows(currentTopic().query, 'channels');",
    "const rows = await searchRows((currentPublisher().search + ' ' + currentTopic().query).trim(), 'channels');",
    1
)
s = s.replace(
    "const rows = await searchRows(currentTopic().query, 'playlists');",
    "const rows = await searchRows((currentPublisher().search + ' ' + currentTopic().query).trim(), 'playlists');",
    1
)

# Watch the publisher route too.
s = s.replace(
    "watch(() => [route.query.source, route.query.topic], applyRouteAndRefresh);",
    "watch(() => [route.query.source, route.query.publisher, route.query.topic], applyRouteAndRefresh);",
    1
)

# Feed label/state includes publisher.
s = s.replace(
    """      sources.find(x => x.id === source.value)?.label,
      topics.find(x => x.id === topic.value)?.label""",
    """      sources.find(x => x.id === source.value)?.label,
      publishers.find(x => x.id === publisher.value)?.label,
      topics.find(x => x.id === topic.value)?.label""",
    1
)
s = s.replace(
    """      source: source.value,
      topic: topic.value,""",
    """      source: source.value,
      publisher: publisher.value,
      topic: topic.value,""",
    1
)

# Clear visual hierarchy: three rows, each horizontally scrollable independently.
s = s.replace(
    """.filter-shelf {
  position:sticky; z-index:70; top:var(--yt-header-h); height:56px;
  display:flex; align-items:center; background:rgba(15,15,15,.98);
}
.filter-scroll {
  width:100%; display:flex; align-items:center; gap:8px; overflow-x:auto;
  padding:0 24px; scrollbar-width:none; overscroll-behavior-inline:contain;
}""",
    """.filter-shelf {
  position:sticky;
  z-index:70;
  top:var(--yt-header-h);
  display:grid;
  gap:2px;
  padding:5px 0 6px;
  border-bottom:1px solid rgba(255,255,255,.055);
  background:rgba(15,15,15,.985);
}
.filter-row {
  min-width:0;
  min-height:34px;
  display:grid;
  grid-template-columns:58px minmax(0,1fr);
  align-items:center;
}
.filter-label {
  padding-left:14px;
  color:#777;
  font-size:10px;
  font-weight:700;
  letter-spacing:.02em;
  text-transform:uppercase;
  user-select:none;
}
.filter-scroll {
  width:100%;
  display:flex;
  align-items:center;
  gap:7px;
  overflow-x:auto;
  padding:0 18px 0 0;
  scrollbar-width:none;
  overscroll-behavior-inline:contain;
}""",
    1
)

s = s.replace(
    ".filter-divider { flex:0 0 1px; width:1px; height:22px; margin:0 3px; background:#3a3a3a; }",
    """.publisher-row {
  border-top:1px solid rgba(255,255,255,.025);
  border-bottom:1px solid rgba(255,255,255,.025);
}
.publisher-chip {
  background:#1f1f1f;
}""",
    1
)

s = s.replace(
    """.filter-shelf { top:var(--yt-header-h); height:48px; }
  .filter-scroll { padding:0 10px; gap:7px; }
  .filter-chip { height:30px; padding:0 11px; font-size:12px; }""",
    """.filter-shelf { top:var(--yt-header-h); padding-block:4px; }
  .filter-row { grid-template-columns:48px minmax(0,1fr); min-height:32px; }
  .filter-label { padding-left:9px; font-size:9px; }
  .filter-scroll { padding-right:10px; gap:6px; }
  .filter-chip { height:29px; padding:0 10px; font-size:11.5px; }""",
    1
)

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
