from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 card navigation v17: normalize search/channel rows before watch or quick view."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 card navigation v17: normalize search/channel rows before watch or quick view.

# GridVideoItem is the shared card for home/search/channel. Normalize both the
# legacy {id,channel,avatar,shape,views} rows and the new home-card shape here so
# every list can always open WatchPage and Xem nhanh.
p = Path("src/components/GridVideoItem.vue")
s = p.read_text()

s = s.replace(
    """const props = defineProps<{
  data: VideoItemData & {
    channelKey?: string;
    publishedAt?: number;
    viewsText?: string;
    layout?: 'portrait' | 'square' | 'landscape';
  };
  feedKey?: string;
  feedIndex?: number;
}>();""",
    """const props = defineProps<{
  data: any;
  feedKey?: string;
  feedIndex?: number;
}>();""",
    1
)

# Replace direct data reads in the template with one normalized card object.
s = s.replace(':src="data.thumbnail"', ':src="card.thumbnail"')
s = s.replace(':alt="data.titleText || data.title"', ':alt="card.titleText"')
s = s.replace('@click="openMini(data)"', '@click="openMini(card)"')
s = s.replace('v-if="data.duration"', 'v-if="card.duration"')
s = s.replace('{{ data.duration }}', '{{ card.duration }}')
s = s.replace('v-if="data.authorAvatar && !avatarFailed"', 'v-if="card.authorAvatar && !avatarFailed"')
s = s.replace(':src="data.authorAvatar"', ':src="card.authorAvatar"')
s = s.replace('<h3 v-html="data.title"/>', '<h3 v-html="card.title"/>')

# Computed normalizer + all card-dependent computed values.
new_computed = r"""function extractVideoId1988(value: any) {
  const raw = String(value?.videoId || value?.id || value?.url || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const match = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\\.be\\/([A-Za-z0-9_-]{11})|\\/(?:shorts|embed|live)\\/([A-Za-z0-9_-]{11})/);
  return match?.[1] || match?.[2] || match?.[3] || '';
}

const card = computed(() => {
  const raw = props.data || {};
  const videoId = extractVideoId1988(raw);
  const title = String(raw.titleText || raw.title || 'Video');
  const channel = String(raw.metadata?.[0] || raw.channel || raw.uploaderName || raw.uploader || 'YouTube');
  const layout = String(raw.layout || raw.shape || 'landscape') as 'portrait' | 'square' | 'landscape';

  return {
    ...raw,
    videoId,
    title,
    titleText: title,
    thumbnail: String(raw.thumbnail || (videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '')),
    authorAvatar: String(raw.authorAvatar || raw.avatar || ''),
    channelKey: String(raw.channelKey || channel),
    metadata: [channel],
    duration: raw.duration,
    viewsText: String(raw.viewsText || raw.views || ''),
    publishedAt: Number(raw.publishedAt || 0),
    layout
  };
});

const channel = computed(() => String(card.value.metadata?.[0] || 'YouTube'));
const channelTarget = computed(() => '/channel/' + encodeURIComponent(card.value.channelKey || channel.value));
const views = computed(() => String(card.value.viewsText || ''));
const age = computed(() => {
  void tick.value;
  return card.value.publishedAt ? formatRelativeTime(card.value.publishedAt) : '';
});
const watchTarget = computed(() => {
  const query: Record<string,string> = {};
  if (card.value.layout) query.shape = card.value.layout;
  if (props.feedKey) query.feed = props.feedKey;
  if (Number.isFinite(props.feedIndex)) query.index = String(props.feedIndex);
  return { path: '/watch/' + card.value.videoId, query };
});"""

s, replaced = re.subn(
    r"""const channel = computed\(\(\) => String\(props\.data\.metadata\?\.\[0\] \|\| 'YouTube'\)\);[\s\S]*?const watchTarget = computed\(\(\) => \{[\s\S]*?\n\}\);""",
    new_computed,
    s,
    count=1
)
if replaced != 1:
    raise SystemExit("GridVideoItem computed block not found")

s = s.replace("import type { VideoItemData } from '@/utils/helpers';\n", "")

p.write_text(s)


# Search page: keys and swipe queue must support its legacy row shape too.
p = Path("src/pages/SearchPage.vue")
s = p.read_text()

s = s.replace(
    ':key="video.videoId"',
    ':key="video.videoId || video.id"',
    1
)

s = s.replace(
    """        id: row.videoId,
        shape: row.layout || 'landscape',
        title: String(row.titleText || row.title || ''),
        channel: String(row.metadata?.[0] || 'YouTube'),
        avatar: String(row.authorAvatar || ''),
        channelKey: String(row.channelKey || row.metadata?.[0] || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + row.videoId + '/hqdefault.jpg')),
        meta: [String(row.viewsText || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')""",
    """        id: String(row.videoId || row.id || ''),
        shape: row.layout || row.shape || 'landscape',
        title: String(row.titleText || row.title || ''),
        channel: String(row.metadata?.[0] || row.channel || 'YouTube'),
        avatar: String(row.authorAvatar || row.avatar || ''),
        channelKey: String(row.channelKey || row.metadata?.[0] || row.channel || ''),
        thumbnail: String(row.thumbnail || ('https://i.ytimg.com/vi/' + String(row.videoId || row.id || '') + '/hqdefault.jpg')),
        meta: [String(row.viewsText || row.views || ''), row.publishedAt ? formatRelativeTime(row.publishedAt) : ''].filter(Boolean).join(' · ')""",
    1
)

# v9 removal should remove either row shape.
s = s.replace(
    "videos.value = videos.value.filter((row: any) => row.videoId !== id);",
    "videos.value = videos.value.filter((row: any) => String(row.videoId || row.id || '') !== id);",
    1
)

p.write_text(s)


# Channel page: same fixes for key + swipe queue.
p = Path("src/pages/ChannelPage.vue")
s = p.read_text()

s = s.replace(
    ':key="video.videoId"',
    ':key="video.videoId || video.id"',
    1
)

s = s.replace(
    """        id: video.videoId,
        shape: video.layout || 'landscape',
        title: String(video.titleText || video.title || ''),
        channel: String(video.metadata?.[0] || channel.value?.name || 'YouTube'),
        avatar: String(video.authorAvatar || channel.value?.avatar || ''),
        channelKey: String(video.channelKey || route.params.id || channel.value?.name || ''),
        thumbnail: String(video.thumbnail || ('https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg')),
        meta: [String(video.viewsText || ''), video.publishedAt ? age(video.publishedAt) : ''].filter(Boolean).join(' · ')""",
    """        id: String(video.videoId || video.id || ''),
        shape: video.layout || video.shape || 'landscape',
        title: String(video.titleText || video.title || ''),
        channel: String(video.metadata?.[0] || video.channel || channel.value?.name || 'YouTube'),
        avatar: String(video.authorAvatar || video.avatar || channel.value?.avatar || ''),
        channelKey: String(video.channelKey || route.params.id || video.channel || channel.value?.name || ''),
        thumbnail: String(video.thumbnail || ('https://i.ytimg.com/vi/' + String(video.videoId || video.id || '') + '/hqdefault.jpg')),
        meta: [String(video.viewsText || video.views || ''), video.publishedAt ? age(video.publishedAt) : ''].filter(Boolean).join(' · ')""",
    1
)

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
