from pathlib import Path
import re

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 dynamic sources v16: discover Vietnamese publishers, fix card navigation and stray newline."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 dynamic sources v16: discover Vietnamese publishers, fix card navigation and stray newline.

# ---------- Homepage: dynamic Vietnam publisher discovery ----------
p = Path("src/pages/HomePage.vue")
s = p.read_text()

s = re.sub(
    r"type PublisherId =[\s\S]*?;",
    "type PublisherId = string;",
    s,
    count=1
)

s = re.sub(
    r"""const publishers: Array<\{
  id: PublisherId;
  label: string;
  search: string;
  aliases: string\[\];
\}> = \[[\s\S]*?\n\];""",
    r"""type PublisherOption = {
  id: PublisherId;
  label: string;
  search: string;
  aliases: string[];
  subscribers?: number;
  verified?: boolean;
  score?: number;
};

const PUBLISHER_CACHE_KEY = '1988:publishers:v16';
const publishers = ref<PublisherOption[]>([
  { id: 'all', label: 'Tất cả nguồn', search: '', aliases: [] }
]);""",
    s,
    count=1
)

# Ref access in script (templates auto-unwrap refs).
s = s.replace(
    "publisher.value = publishers.some(x => x.id === wantedPublisher) ? wantedPublisher : 'all';",
    "publisher.value = publishers.value.some(x => x.id === wantedPublisher) ? wantedPublisher : 'all';",
    1
)
s = s.replace(
    "return publishers.find(x => x.id === publisher.value) || publishers[0];",
    "return publishers.value.find(x => x.id === publisher.value) || publishers.value[0];",
    1
)
s = s.replace(
    "for (const item of publishers) {",
    "for (const item of publishers.value) {",
    1
)
s = s.replace(
    "const perPublisher: Array<{ q: string; publisherId?: PublisherId }> = publishers",
    "const perPublisher: Array<{ q: string; publisherId?: PublisherId }> = publishers.value",
    1
)
s = s.replace(
    "publishers.find(x => x.id === publisher.value)?.label,",
    "publishers.value.find(x => x.id === publisher.value)?.label,",
    1
)

# Stable, cached source discovery. It searches broad Vietnam news/media terms,
# then ranks channels by institutional cues, verified flag and subscriber count.
anchor = """function normalizePublisherText1988(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
"""

if anchor not in s:
    raise SystemExit("normalizePublisherText1988 anchor missing")

discovery = r"""
function publisherSubscriberCount1988(row: any) {
  const raw = row?.subscribers ?? row?.subscriberCount ?? row?.subscribersText ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw);

  const text = normalizePublisherText1988(raw).replace(/,/g, '.');
  const match = text.match(/([\d.]+)\s*([kmb]?)/i);
  if (!match) return 0;

  const value = Number(match[1]) || 0;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
  return Math.round(value * multiplier);
}

function publisherInstitutionScore1988(name: string, description: string) {
  const text = normalizePublisherText1988(name + ' ' + description);
  let score = 0;

  // Institution classes, not a fixed channel allow-list.
  if (/\b(vtv|vtc|antv|vnews|vov|htv|qpvn)\b/.test(text)) score += 12;
  if (/(truyen hinh|thong tan|nhan dan|quoc phong|cong an)/.test(text)) score += 9;
  if (/(bao |bao$|tin tuc|news|thoi su|phap luat|lao dong|dan tri|vnexpress)/.test(text)) score += 5;

  return score;
}

function publisherLooksRelevant1988(name: string, description: string) {
  const text = normalizePublisherText1988(name + ' ' + description);
  return /(vtv|vtc|antv|vnews|vov|htv|qpvn|truyen hinh|thong tan|nhan dan|quoc phong|cong an|bao|tin tuc|news|thoi su|phap luat|lao dong|dan tri|vnexpress)/.test(text);
}

function loadPublisherCache1988() {
  try {
    const raw = localStorage.getItem(PUBLISHER_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!rows.length) return false;

    publishers.value = [
      { id: 'all', label: 'Tất cả nguồn', search: '', aliases: [] },
      ...rows
    ];

    return Date.now() - Number(parsed?.at || 0) < 12 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function savePublisherCache1988() {
  try {
    localStorage.setItem(PUBLISHER_CACHE_KEY, JSON.stringify({
      at: Date.now(),
      items: publishers.value.filter(item => item.id !== 'all').slice(0, 28)
    }));
  } catch {}
}

let publisherDiscoveryPromise1988: Promise<void> | null = null;

async function discoverPublishers1988(force = false) {
  if (!force && loadPublisherCache1988()) return;
  if (publisherDiscoveryPromise1988) return publisherDiscoveryPromise1988;

  publisherDiscoveryPromise1988 = (async () => {
    const queries = [
      'tin tức Việt Nam',
      'thời sự Việt Nam',
      'truyền hình Việt Nam',
      'báo Việt Nam',
      'news Việt Nam',
      'VTV VTC ANTV VNEWS'
    ];

    const settled = await Promise.allSettled(
      queries.map(query => searchRows(query, 'channels'))
    );

    const byId = new Map<string, PublisherOption>();

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;

      for (const row of result.value) {
        const name = String(row?.name || row?.title || row?.uploaderName || row?.uploader || '').trim();
        const description = String(row?.description || '').trim();
        if (!name || !publisherLooksRelevant1988(name, description)) continue;

        const subscribers = publisherSubscriberCount1988(row);
        const verified = Boolean(row?.verified ?? row?.isVerified ?? row?.verifiedBadge);
        const institutionScore = publisherInstitutionScore1988(name, description);

        // Keep national/public institutions even when a provider omits subscriber
        // data. Other media channels need verification or a meaningful audience.
        if (!institutionScore && !verified && subscribers < 100000) continue;
        if (institutionScore < 5 && !verified && subscribers < 100000) continue;

        const rawId = channelKey(row);
        const id = String(rawId || name).trim();
        if (!id) continue;

        const score =
          institutionScore * 100000000 +
          (verified ? 50000000 : 0) +
          Math.min(subscribers, 40000000);

        const option: PublisherOption = {
          id,
          label: name,
          search: name,
          aliases: [name, id],
          subscribers,
          verified,
          score
        };

        const previous = byId.get(id);
        if (!previous || Number(option.score || 0) > Number(previous.score || 0)) {
          byId.set(id, option);
        }
      }
    }

    const ranked = [...byId.values()]
      .sort((a, b) =>
        Number(b.score || 0) - Number(a.score || 0)
        || Number(b.subscribers || 0) - Number(a.subscribers || 0)
        || a.label.localeCompare(b.label, 'vi')
      )
      .slice(0, 28);

    if (ranked.length) {
      publishers.value = [
        { id: 'all', label: 'Tất cả nguồn', search: '', aliases: [] },
        ...ranked
      ];
      savePublisherCache1988();
    }

    // If a route points to a source no longer in discovery, fail safely to all.
    if (!publishers.value.some(item => item.id === publisher.value)) {
      publisher.value = 'all';
    }
  })().finally(() => {
    publisherDiscoveryPromise1988 = null;
  });

  return publisherDiscoveryPromise1988;
}
"""

s = s.replace(anchor, anchor + discovery, 1)

# Dynamic matching: compare to the discovered source rather than a fixed list.
start = s.find("function inferPublisher1988(")
end = s.find("\n}\n\nfunction publisherMatches1988", start)
if start >= 0 and end >= 0:
    s = s[:start] + r"""function inferPublisher1988(channel: unknown): PublisherId | '' {
  const normalized = normalizePublisherText1988(channel);
  if (!normalized) return '';

  for (const item of publishers.value) {
    if (item.id === 'all') continue;
    if (item.aliases.some(alias => {
      const wanted = normalizePublisherText1988(alias);
      return !!wanted && (normalized.includes(wanted) || wanted.includes(normalized));
    })) {
      return item.id;
    }
  }

  return '';
}""" + s[end+2:]

start = s.find("function publisherMatches1988(")
end = s.find("\n}\n\nfunction maxHomeAgeMs1988", start)
if start >= 0 and end >= 0:
    s = s[:start] + r"""function publisherMatches1988(channel: unknown, id: PublisherId) {
  if (id === 'all') return true;
  const option = publishers.value.find(item => item.id === id);
  if (!option) return false;

  const normalized = normalizePublisherText1988(channel);
  return option.aliases.some(alias => {
    const wanted = normalizePublisherText1988(alias);
    return !!wanted && (normalized.includes(wanted) || wanted.includes(normalized));
  });
}""" + s[end+2:]

# All-source fanout should use the best current dynamic publishers, not a fixed list.
s = s.replace(
    """  const perPublisher: Array<{ q: string; publisherId?: PublisherId }> = publishers.value
    .filter(item => item.id !== 'all')
    .map(item => ({""",
    """  const perPublisher: Array<{ q: string; publisherId?: PublisherId }> = publishers.value
    .filter(item => item.id !== 'all')
    .slice(0, 16)
    .map(item => ({""",
    1
)

# Discover/cached source list before feed refresh.
s = s.replace(
    """async function refresh() {
  const current = ++serial;
  refreshing.value = true;
  try {
    if (source.value === 'channels') await loadChannels(current);""",
    """async function refresh() {
  const current = ++serial;
  refreshing.value = true;
  try {
    await discoverPublishers1988();
    if (current !== serial) return;

    if (source.value === 'channels') await loadChannels(current);""",
    1
)

s = s.replace(
    """onMounted(() => {
  applyRouteAndRefresh();""",
    """onMounted(() => {
  loadPublisherCache1988();
  syncFromRoute();
  applyRouteAndRefresh();""",
    1
)

p.write_text(s)


# ---------- Cards: thumbnail/title always open watch; Xem nhanh is the explicit mini action ----------
p = Path("src/components/GridVideoItem.vue")
s = p.read_text()

s = s.replace(
    '<router-link class="thumb-link" :to="watchTarget" @click.capture="handlePrimaryClick">',
    '<router-link class="thumb-link" :to="watchTarget">',
    1
)
s = s.replace(
    '<router-link class="title-link" :to="watchTarget" @click.capture="handlePrimaryClick"><h3 v-html="data.title"/></router-link>',
    '<router-link class="title-link" :to="watchTarget"><h3 v-html="data.title"/></router-link>',
    1
)

s = s.replace(
    """const openMini = inject<((data: any) => void) | null>('1988OpenMini', null);
const playInExistingMini = inject<((data: any) => boolean) | null>('1988PlayInExistingMini', null);""",
    """const openMini = inject<((data: any) => void) | null>('1988OpenMini', null);""",
    1
)

s = re.sub(
    r"""\nfunction handlePrimaryClick\(event: MouseEvent\) \{
  if \(!playInExistingMini\?\.\(props\.data\)\) return;
  event\.preventDefault\(\);
  event\.stopImmediatePropagation\(\);
\}
""",
    "\n",
    s,
    count=1
)

p.write_text(s)


# ---------- Remove the literal "\n" text accidentally inserted into <head> ----------
p = Path("index.html")
s = p.read_text()
s = s.replace(
    r'<head>\n    <meta name="1988-ui-build"',
    '<head>\n    <meta name="1988-ui-build"'
)
p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
