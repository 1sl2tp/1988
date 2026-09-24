from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 cards v12: every video list uses the same home card + quick view."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 cards v12: every video list uses the same home card + quick view.

# ---------- Search: use the exact same GridVideoItem as homepage ----------
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

old_search_videos = r"""      <div v-if="videos.length" class="video-results">
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
      </div>"""

new_search_videos = r"""      <div v-if="videos.length" class="video-grid">
        <GridVideoItem
          v-for="(video,index) in videos"
          :key="video.videoId"
          :data="video"
          :feed-key="feedKey"
          :feed-index="index"
        />
      </div>"""

s = s.replace(old_search_videos, new_search_videos, 1)

if "import GridVideoItem from '@/components/GridVideoItem.vue';" not in s:
    s = s.replace(
        "import { UserRound } from '@lucide/vue';",
        "import { UserRound } from '@lucide/vue';\nimport GridVideoItem from '@/components/GridVideoItem.vue';",
        1
    )

# Search mapping becomes the same object shape consumed by homepage cards.
s = re.sub(
    r"""return {
      id,
      title,
      channel: String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube'),
      avatar: String(row?.uploaderAvatar || row?.avatar || ''),
      channelKey: channelKey(row),
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      duration: duration(row?.duration),
      views: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
      publishedAt: parsePublishedAt(published),
      shape
    };""",
    r"""return {
      videoId: id,
      title,
      titleText: title,
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      authorAvatar: String(row?.uploaderAvatar || row?.avatar || ''),
      channelKey: channelKey(row),
      metadata: [String(row?.uploaderName || row?.uploader || row?.channelName || 'YouTube')],
      duration: duration(row?.duration),
      viewsText: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
      publishedAt: parsePublishedAt(published),
      layout: shape
    };""",
    s,
    count=1
)

# v9 unavailable filter used row.id; update it to videoId.
s = s.replace(
    "videos.value = videos.value.filter((row: any) => row.id !== id);",
    "videos.value = videos.value.filter((row: any) => row.videoId !== id);",
    1
)

# v9 filter inside mapVideos may run before mapping.
s = s.replace(
    "if (!id || seen.has(id) || unavailableIds1988().has(id)) return null;",
    "if (!id || seen.has(id) || unavailableIds1988().has(id)) return null;",
    1
)

# The horizontal result template used age(); the unified card computes age itself.
s = re.sub(
    r"\\nfunction age\\(ts: number\\) \\{[\\s\\S]*?\\n\\}\\n",
    "\\n",
    s,
    count=1
)

# Feed persistence uses the home-style card keys.
s = s.replace(
    """      items: videos.value.map((row:any) => ({
        id: row.id,
        shape: row.shape,
        title: String(row.title || ''),
        channel: String(row.channel || 'YouTube'),
        avatar: String(row.avatar || ''),
        channelKey: String(row.channelKey || row.channel || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + row.id + '/hqdefault.jpg')),
        meta: [String(row.views || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    """      items: videos.value.map((row:any) => ({
        id: row.videoId,
        shape: row.layout || 'landscape',
        title: String(row.titleText || row.title || ''),
        channel: String(row.metadata?.[0] || 'YouTube'),
        avatar: String(row.authorAvatar || ''),
        channelKey: String(row.channelKey || row.metadata?.[0] || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + row.videoId + '/hqdefault.jpg')),
        meta: [String(row.viewsText || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    1
)

# Replace horizontal-result CSS with the same responsive grid rules as homepage.
s = re.sub(
    r""".video-results { display:grid; gap:14px; }
.video-result {[sS]*?.result-channel { margin-top:18px !important; }
""",
    r""".video-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:36px 16px;
}
""",
    s,
    count=1
)

s = s.replace(
    """  .video-result { grid-template-columns:1fr; gap:8px; }
  .result-thumb { margin-inline:-12px; border-radius:0; }
  .result-copy h2 { font-size:15px; }""",
    """  .video-grid { grid-template-columns:1fr; gap:28px; }""",
    1
)

if "@media (max-width:1100px)" not in s:
    s = s.replace(
        "@media (max-width:760px) {",
        """@media (max-width:1100px) {
  .video-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
}

@media (max-width:760px) {""",
        1
    )

p.write_text(s)


# ---------- Channel: same homepage card component + quick view ----------
p = Path("src/pages/ChannelPage.vue")
s = p.read_text()

old_channel_grid = r"""    <div class="grid">
      <router-link v-for="(video, index) in videos" :key="video.id" class="card" :to="{ path: '/watch/' + video.id, query: { feed: feedKey, index: String(index), shape: video.shape } }">
        <div class="thumb">
          <img :src="video.thumbnail" :alt="video.title">
          <span v-if="video.duration">{{ video.duration }}</span>
        </div>
        <strong>{{ video.title }}</strong>
        <small>{{ video.views }}<template v-if="video.views && video.publishedAt"> · </template>{{ age(video.publishedAt) }}</small>
      </router-link>
    </div>"""

if old_channel_grid not in s:
    old_channel_grid = r"""    <div class="grid">
      <router-link v-for="video in videos" :key="video.id" class="card" :to="'/watch/' + video.id">
        <div class="thumb">
          <img :src="video.thumbnail" :alt="video.title">
          <span v-if="video.duration">{{ video.duration }}</span>
        </div>
        <strong>{{ video.title }}</strong>
        <small>{{ video.views }}<template v-if="video.views && video.publishedAt"> · </template>{{ age(video.publishedAt) }}</small>
      </router-link>
    </div>"""

new_channel_grid = r"""    <div class="video-grid">
      <GridVideoItem
        v-for="(video,index) in videos"
        :key="video.videoId"
        :data="video"
        :feed-key="feedKey"
        :feed-index="index"
      />
    </div>"""

s = s.replace(old_channel_grid, new_channel_grid, 1)

if "import GridVideoItem from '@/components/GridVideoItem.vue';" not in s:
    s = s.replace(
        "import { UserRound } from '@lucide/vue';",
        "import { UserRound } from '@lucide/vue';\nimport GridVideoItem from '@/components/GridVideoItem.vue';",
        1
    )

# Channel mapped videos -> home card data.
s = s.replace(
    """      return {
        id,
        title: String(row?.title || 'Video'),
        thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        duration: typeof row?.duration === 'string' && row.duration.includes(':')
          ? row.duration
          : total ? Math.floor(total / 60) + ':' + String(Math.floor(total % 60)).padStart(2, '0') : '',
        views: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
        publishedAt: parsePublishedAt(published),
        shape: /\/shorts\//i.test(String(row?.url || '')) || /#shorts?\b/i.test(String(row?.title || ''))
          ? 'portrait'
          : 'landscape'
      };""",
    """      const title = String(row?.title || 'Video');
      return {
        videoId: id,
        title,
        titleText: title,
        thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        authorAvatar: String(channel.value?.avatar || ''),
        channelKey: String(route.params.id || channel.value?.name || ''),
        metadata: [String(channel.value?.name || 'YouTube')],
        duration: typeof row?.duration === 'string' && row.duration.includes(':')
          ? row.duration
          : total ? Math.floor(total / 60) + ':' + String(Math.floor(total % 60)).padStart(2, '0') : '',
        viewsText: formatCompactViews(row?.views ?? row?.viewCount ?? row?.viewText),
        publishedAt: parsePublishedAt(published),
        layout: /\/shorts\//i.test(String(row?.url || '')) || /#shorts?\b/i.test(title)
          ? 'portrait'
          : 'landscape'
      };""",
    1
)

# Channel sort and persist-feed fields use new names.
s = s.replace(
    ".sort((a: any, b: any) => (b.publishedAt || 0) - (a.publishedAt || 0))",
    ".sort((a: any, b: any) => (b.publishedAt || 0) - (a.publishedAt || 0))",
    1
)

s = s.replace(
    """      items: videos.value.map((video: any) => ({
        id: video.id,
        shape: video.shape || 'landscape',
        title: String(video.title || ''),
        channel: String(channel.value?.name || 'YouTube'),
        avatar: String(channel.value?.avatar || ''),
        channelKey: String(route.params.id || channel.value?.name || ''),
        thumbnail: String(video.thumbnail || ('https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg')),
        meta: [String(video.views || ''), video.publishedAt ? age(video.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    """      items: videos.value.map((video: any) => ({
        id: video.videoId,
        shape: video.layout || 'landscape',
        title: String(video.titleText || video.title || ''),
        channel: String(video.metadata?.[0] || channel.value?.name || 'YouTube'),
        avatar: String(video.authorAvatar || channel.value?.avatar || ''),
        channelKey: String(video.channelKey || route.params.id || channel.value?.name || ''),
        thumbnail: String(video.thumbnail || ('https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg')),
        meta: [String(video.viewsText || ''), video.publishedAt ? age(video.publishedAt) : ''].filter(Boolean).join(' · ')
      }))""",
    1
)

# Replace old channel card CSS with homepage-equivalent video grid.
s = re.sub(
    r""".grid {[sS]*?.card small {[sS]*?}
""",
    r""".video-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:36px 16px;
}
""",
    s,
    count=1
)

s = s.replace(
    """@media (max-width: 680px) {
  .grid {
    grid-template-columns: 1fr;
  }
}""",
    """@media (max-width: 980px) {
  .video-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
}

@media (max-width: 680px) {
  .channel-page {
    width: 100%;
    padding-inline: 12px;
  }

  .video-grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}""",
    1
)

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
