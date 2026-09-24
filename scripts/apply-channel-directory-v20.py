from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 channels v20: categorized dynamic channel directory with table/list views."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 channels v20: categorized dynamic channel directory with table/list views.

p = Path("src/pages/HomePage.vue")
s = p.read_text()

# Channel directory replaces the old generic channel result cards. It reuses the
# dynamic trusted-source discovery pool, so there is no fixed source list here.
old_channels = r"""      <div v-if="source === 'channels' && channels.length" class="channel-grid">
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
      </div>"""

new_channels = r"""      <section v-if="source === 'channels'" class="channel-directory">
        <header class="channel-directory-head">
          <div class="channel-category-scroll">
            <button
              v-for="item in channelCategories"
              :key="item.id"
              type="button"
              :class="{ active: channelCategory === item.id }"
              @click="channelCategory = item.id"
            >
              {{ item.label }}
              <small>{{ channelCategoryCount(item.id) }}</small>
            </button>
          </div>

          <div class="channel-view-switch">
            <button type="button" :class="{ active: channelView === 'table' }" @click="setChannelView('table')">Bảng</button>
            <button type="button" :class="{ active: channelView === 'list' }" @click="setChannelView('list')">Danh sách</button>
          </div>
        </header>

        <div v-if="channelView === 'table'" class="channel-table-wrap">
          <table class="channel-table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th>Phân loại</th>
                <th>Người đăng ký</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredChannelSources"
                :key="row.id"
                tabindex="0"
                @click="openChannelSource(row)"
                @keydown.enter.prevent="openChannelSource(row)"
              >
                <td>
                  <span class="channel-table-name">
                    <img v-if="row.avatar" :src="row.avatar" :alt="row.label">
                    <span v-else class="channel-table-avatar"><UserRound/></span>
                    <b>{{ row.label }}</b>
                  </span>
                </td>
                <td>{{ channelKindLabel(row) }}</td>
                <td>{{ row.subscribers ? formatPublisherFollowers1988(row.subscribers) : '—' }}</td>
                <td>
                  <span v-if="row.verified" class="verified-chip">Đã xác minh</span>
                  <span v-else-if="Number(row.subscribers || 0) >= 100000" class="audience-chip">100K+</span>
                  <span v-else class="neutral-chip">Nguồn phát hiện</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="channel-list-view">
          <button
            v-for="row in filteredChannelSources"
            :key="row.id"
            type="button"
            class="channel-list-row"
            @click="openChannelSource(row)"
          >
            <img v-if="row.avatar" :src="row.avatar" :alt="row.label">
            <span v-else class="channel-list-avatar"><UserRound/></span>
            <span class="channel-list-copy">
              <strong>{{ row.label }}</strong>
              <small>{{ channelKindLabel(row) }}<template v-if="row.subscribers"> · {{ formatPublisherFollowers1988(row.subscribers) }} người đăng ký</template></small>
            </span>
            <span v-if="row.verified" class="verified-dot" title="Đã xác minh">✓</span>
          </button>
        </div>

        <div v-if="!filteredChannelSources.length" class="channel-empty">
          Chưa có kênh phù hợp trong nhóm này.
        </div>
      </section>"""

if old_channels not in s:
    raise SystemExit("channel grid block not found")
s = s.replace(old_channels, new_channels, 1)

# In channel mode, the top bar is dedicated to the directory instead of feed ranking.
s = s.replace(
    '<section class="filter-shelf compact">',
    "<section v-if=\"source !== 'channels'\" class=\"filter-shelf compact\">",
    1
)

# Publisher option stores enough data for the directory.
s = s.replace(
    """  subscribers?: number;
  verified?: boolean;
  score?: number;""",
    """  subscribers?: number;
  verified?: boolean;
  score?: number;
  avatar?: string;
  description?: string;""",
    1
)

s = s.replace(
    """          subscribers,
          verified,
          score""",
    """          subscribers,
          verified,
          score,
          avatar: String(row?.thumbnail || row?.thumbnailUrl || row?.avatar || ''),
          description""",
    1
)

# Broader discovery automatically catches international Vietnamese-language news too.
s = s.replace(
    """      'news Việt Nam verified',
      'tin nóng Việt Nam hôm nay'""",
    """      'news Việt Nam verified',
      'tin nóng Việt Nam hôm nay',
      'tin quốc tế tiếng Việt kênh chính thức',
      'international news Vietnamese official channel',
      'tin thế giới tiếng Việt YouTube'""",
    1
)

s = s.replace(".slice(0, 28);", ".slice(0, 40);", 1)
s = s.replace("slice(0, 28)", "slice(0, 40)", 1)

# Channel directory state + classification.
state_anchor = "const sourceOpen = ref(false);"
if state_anchor not in s:
    raise SystemExit("sourceOpen state anchor missing")

channel_state = r"""
type ChannelCategory = 'all' | 'official' | 'press' | 'international' | 'other';
type ChannelView = 'table' | 'list';

const channelCategory = ref<ChannelCategory>('all');
const channelView = ref<ChannelView>(
  (localStorage.getItem('1988:channel-view') === 'list' ? 'list' : 'table') as ChannelView
);

const channelCategories: Array<{ id: ChannelCategory; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'official', label: 'Chính thống' },
  { id: 'press', label: 'Báo chí' },
  { id: 'international', label: 'Quốc tế' },
  { id: 'other', label: 'Khác' }
];

function channelKind1988(row: PublisherOption): ChannelCategory {
  const text = normalizePublisherText1988((row.label || '') + ' ' + (row.description || ''));

  if (/(international|world|quoc te|tieng viet|vietnamese)/.test(text)) {
    return 'international';
  }

  if (/(truyen hinh|thong tan|phat thanh|nhan dan|quoc phong|cong an|chinh phu|quoc hoi)/.test(text)) {
    return 'official';
  }

  if (/(bao |bao$|tin tuc|news|thoi su|phap luat|media|newspaper|journal)/.test(text)) {
    return 'press';
  }

  if (row.verified || Number(row.subscribers || 0) >= 100000) return 'other';
  return 'other';
}

function channelKindLabel(row: PublisherOption) {
  const kind = channelKind1988(row);
  return kind === 'official'
    ? 'Chính thống'
    : kind === 'press'
      ? 'Báo chí'
      : kind === 'international'
        ? 'Quốc tế'
        : 'Khác';
}

const filteredChannelSources = computed(() => {
  const rows = publisherSources.value;
  if (channelCategory.value === 'all') return rows;
  return rows.filter(row => channelKind1988(row) === channelCategory.value);
});

function channelCategoryCount(kind: ChannelCategory) {
  if (kind === 'all') return publisherSources.value.length;
  return publisherSources.value.filter(row => channelKind1988(row) === kind).length;
}

function setChannelView(value: ChannelView) {
  channelView.value = value;
  try { localStorage.setItem('1988:channel-view', value); } catch {}
}

function openChannelSource(row: PublisherOption) {
  if (!row?.id) return;
  void router.push('/channel/' + encodeURIComponent(row.id));
}
"""

s = s.replace(state_anchor, state_anchor + "\n" + channel_state, 1)

# remove obsolete loadChannels
s = re.sub(
    r"""\nasync function loadChannels\(current: number\) \{[\s\S]*?\n\}\n\n(?=async function loadPlaylists)""",
    "\n",
    s,
    count=1
)

# Channel mode no longer needs a separate channel search after dynamic source discovery.
s = s.replace(
    """    if (source.value === 'channels') await loadChannels(current);
    else if (source.value === 'playlists') await loadPlaylists(current);""",
    """    if (source.value === 'channels') {
      channels.value = [];
    } else if (source.value === 'playlists') await loadPlaylists(current);""",
    1
)

# Add directory CSS without disturbing video cards.
if "1988-channel-directory-v20" not in s:
    s = s.replace(
        "</style>",
        r"""
/* 1988-channel-directory-v20 */
.channel-directory {
  padding: 18px 24px 46px;
}

.channel-directory-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.channel-category-scroll {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}
.channel-category-scroll::-webkit-scrollbar { display: none; }

.channel-category-scroll button,
.channel-view-switch button {
  height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 8px;
  background: #272727;
  color: #ddd;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}
.channel-category-scroll button.active,
.channel-view-switch button.active {
  background: #f1f1f1;
  color: #111;
}
.channel-category-scroll small {
  margin-left: 4px;
  opacity: .62;
  font-size: 9px;
}

.channel-view-switch {
  flex: 0 0 auto;
  display: flex;
  gap: 5px;
}

.channel-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
}

.channel-table {
  width: 100%;
  border-collapse: collapse;
  background: #141414;
}
.channel-table th,
.channel-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,.065);
  text-align: left;
  font-size: 11.5px;
}
.channel-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #1d1d1d;
  color: #8e8e8e;
  font-size: 10px;
  font-weight: 700;
}
.channel-table tbody tr {
  cursor: pointer;
}
.channel-table tbody tr:hover,
.channel-table tbody tr:focus {
  outline: 0;
  background: #202020;
}
.channel-table tbody tr:last-child td {
  border-bottom: 0;
}

.channel-table-name {
  display: flex;
  align-items: center;
  gap: 9px;
}
.channel-table-name img,
.channel-table-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  object-fit: cover;
  background: #2c2c2c;
  color: #aaa;
}
.channel-table-name b {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.verified-chip,
.audience-chip,
.neutral-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 6px;
  font-size: 9.5px;
  white-space: nowrap;
}
.verified-chip { background: rgba(62,166,255,.16); color: #8dc8ff; }
.audience-chip { background: rgba(255,255,255,.08); color: #ddd; }
.neutral-chip { background: rgba(255,255,255,.045); color: #888; }

.channel-list-view {
  display: grid;
  gap: 3px;
}
.channel-list-row {
  width: 100%;
  min-height: 58px;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr) 28px;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #fff;
  text-align: left;
}
.channel-list-row:hover { background: #202020; }
.channel-list-row img,
.channel-list-avatar {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  object-fit: cover;
  background: #2b2b2b;
  color: #aaa;
}
.channel-list-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.channel-list-copy strong {
  overflow: hidden;
  font-size: 12.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.channel-list-copy small {
  overflow: hidden;
  color: #8d8d8d;
  font-size: 10.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.verified-dot {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(62,166,255,.16);
  color: #8dc8ff;
  font-size: 11px;
  font-weight: 800;
}

.channel-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  color: #777;
  font-size: 12px;
}

@media (max-width: 760px) {
  .channel-directory {
    padding: 12px 9px 30px;
  }
  .channel-directory-head {
    align-items: flex-start;
    gap: 8px;
  }
  .channel-category-scroll button,
  .channel-view-switch button {
    height: 30px;
    padding-inline: 9px;
    font-size: 11px;
  }
  .channel-table th:nth-child(2),
  .channel-table td:nth-child(2) {
    display: none;
  }
  .channel-table th,
  .channel-table td {
    padding: 9px 8px;
  }
  .channel-table-name img,
  .channel-table-avatar {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
  }
}
</style>""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
