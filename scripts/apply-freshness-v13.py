from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 freshness v13: news-first topics and strict YouTube upload recency."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 freshness v13: news-first topics and strict YouTube upload recency.

p = Path("src/pages/HomePage.vue")
s = p.read_text()

# Drop the old cache namespace so multi-year cached cards disappear immediately.
s = s.replace(
    "const CACHE_PREFIX = '1988:home:v7:';",
    "const CACHE_PREFIX = '1988:home:v13:';",
    1
)

# News-first topic model. Music is one terminal category instead of many near-duplicates.
s = s.replace(
    """type TopicId =
  | 'all' | 'thoi-su' | 'an-ninh' | 'tin-tuc' | 'cong-nghe' | 'giai-tri'
  | 'phim-ngan' | 'the-thao' | 'nhac-vang' | 'bolero' | 'tru-tinh'
  | 'dan-ca' | 'nhac-tre' | 'remix' | 'que-huong' | 'podcast'
  | 'khong-loi' | 'phim';""",
    """type TopicId =
  | 'all' | 'thoi-su' | 'an-ninh' | 'tin-tuc' | 'quoc-te' | 'kinh-te'
  | 'phap-luat' | 'cong-nghe' | 'doi-song' | 'suc-khoe' | 'giao-duc'
  | 'the-thao' | 'giai-tri' | 'xe' | 'phim-ngan' | 'am-nhac';""",
    1
)

old_topics = """const topics: Array<{ id: TopicId; label: string; query: string }> = [
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
];"""

new_topics = """const topics: Array<{ id: TopicId; label: string; query: string }> = [
  { id: 'all', label: 'Mới nhất', query: 'Việt Nam mới nhất hôm nay' },
  { id: 'thoi-su', label: 'Thời sự', query: 'thời sự Việt Nam hôm nay mới nhất' },
  { id: 'an-ninh', label: 'An ninh', query: 'an ninh trật tự Việt Nam hôm nay mới nhất' },
  { id: 'tin-tuc', label: 'Tin tức', query: 'tin tức Việt Nam hôm nay mới nhất' },
  { id: 'quoc-te', label: 'Quốc tế', query: 'tin quốc tế hôm nay mới nhất' },
  { id: 'kinh-te', label: 'Kinh tế', query: 'kinh tế Việt Nam hôm nay mới nhất' },
  { id: 'phap-luat', label: 'Pháp luật', query: 'pháp luật Việt Nam hôm nay mới nhất' },
  { id: 'cong-nghe', label: 'Công nghệ', query: 'công nghệ Việt Nam hôm nay mới nhất' },
  { id: 'doi-song', label: 'Đời sống', query: 'đời sống xã hội Việt Nam hôm nay mới nhất' },
  { id: 'suc-khoe', label: 'Sức khỏe', query: 'sức khỏe Việt Nam hôm nay mới nhất' },
  { id: 'giao-duc', label: 'Giáo dục', query: 'giáo dục Việt Nam hôm nay mới nhất' },
  { id: 'the-thao', label: 'Thể thao', query: 'thể thao Việt Nam hôm nay mới nhất' },
  { id: 'giai-tri', label: 'Giải trí', query: 'giải trí Việt Nam hôm nay mới nhất' },
  { id: 'xe', label: 'Xe', query: 'ô tô xe máy Việt Nam mới nhất' },
  { id: 'phim-ngan', label: 'Phim ngắn', query: 'phim ngắn Việt Nam mới đăng' },
  { id: 'am-nhac', label: 'Âm nhạc', query: 'nhạc Việt Nam mới phát hành' }
];"""

s = s.replace(old_topics, new_topics, 1)

# Home page must be based on actual upload age, never on search ranking alone.
if "function maxHomeAgeMs1988" not in s:
    s = s.replace(
        """function currentTopic() {
  return topics.find(x => x.id === topic.value) || topics[0];
}
""",
        """function currentTopic() {
  return topics.find(x => x.id === topic.value) || topics[0];
}

function maxHomeAgeMs1988() {
  // News/current-affairs must be truly current. Entertainment/music/short film
  // gets a wider window, but still never drifts into old multi-year results.
  if (source.value === 'live') return 24 * 60 * 60 * 1000;
  if (topic.value === 'am-nhac' || topic.value === 'phim-ngan' || topic.value === 'giai-tri') {
    return 30 * 24 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;
}

function isFreshHomeVideo1988(row: Row) {
  const ts = Number(row.publishedAt || 0);
  if (!ts) return false;
  const age = Date.now() - ts;
  return age >= -6 * 60 * 60 * 1000 && age <= maxHomeAgeMs1988();
}
""",
        1
    )

# Never hydrate stale cards from cache.
s = s.replace(
    "videos.value = (Array.isArray(data?.videos) ? data.videos : []).filter((row: any) => !unavailableIds1988().has(String(row?.videoId || '')));",
    "videos.value = (Array.isArray(data?.videos) ? data.videos : []).filter((row: any) => !unavailableIds1988().has(String(row?.videoId || '')) && isFreshHomeVideo1988(row));",
    1
)

# News-first discovery queries; remove old music-heavy default mix.
old_queries = """  return [
    'Việt Nam mới nhất',
    'tin mới Việt Nam',
    'thời sự Việt Nam mới nhất',
    'an ninh Việt Nam mới nhất',
    'công nghệ Việt Nam mới nhất',
    'giải trí Việt Nam mới nhất',
    'thể thao Việt Nam mới nhất',
    'phim Việt mới',
    'nhạc Việt mới'
  ];"""

new_queries = """  return [
    'tin tức Việt Nam hôm nay mới nhất',
    'thời sự Việt Nam hôm nay mới nhất',
    'an ninh Việt Nam hôm nay mới nhất',
    'tin quốc tế hôm nay mới nhất',
    'kinh tế Việt Nam hôm nay mới nhất',
    'pháp luật Việt Nam hôm nay mới nhất',
    'công nghệ Việt Nam hôm nay mới nhất',
    'đời sống xã hội Việt Nam hôm nay mới nhất',
    'thể thao Việt Nam hôm nay mới nhất',
    'giải trí Việt Nam hôm nay mới nhất'
  ];"""

s = s.replace(old_queries, new_queries, 1)

# After merging all providers/queries, only keep videos with a verifiable recent
# YouTube upload timestamp, then sort strictly newest -> oldest.
s = s.replace(
    """  merged.sort((a,b) => {
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
  persistSwipeFeed(merged.slice(0, 120));""",
    """  const fresh = merged
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
    });

  videos.value = fresh.slice(0, 60);
  persistSwipeFeed(fresh.slice(0, 120));""",
    1
)

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
