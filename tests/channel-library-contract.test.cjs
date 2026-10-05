const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const sourceManager=fs.readFileSync('sources/sources.js','utf8');
const state=fs.readFileSync('supabase/functions/yt1988-state/index.ts','utf8');
const refresh=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
const ytApi=fs.readFileSync('supabase/functions/yt1988/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003092500_unified_channel_library.sql','utf8');

// One normalized contract is returned for both platforms.
assert.match(state,/channelLibraryVersion\s*=\s*1/);
assert.match(state,/platform:\s*"youtube"/);
assert.match(state,/platform:\s*"tiktok"/);
assert.match(state,/key:\s*"youtube:"\s*\+\s*id/);
assert.match(state,/key:\s*"tiktok:"\s*\+\s*handle\.toLowerCase\(\)/);
assert.match(state,/verification:\s*\{/);
assert.match(state,/known:\s*verificationKnown/);
assert.match(state,/badges:\s*verified\s*===\s*true\s*\?\s*\["verified"\]/);
assert.match(state,/selectedScopes/);
assert.match(state,/blockedScopes/);
assert.match(state,/suggestedScopes/);
assert.match(state,/stats:\s*\{/);
assert.match(state,/followers:/);
assert.match(state,/subscribers:/);
assert.match(state,/views:/);
assert.match(state,/videos:/);

// Canonical platform tables remain the source of truth; no third channel table.
assert.match(state,/yt1988_channel_directory/);
assert.match(state,/yt1988_tiktok_channels/);
assert.doesNotMatch(state,/yt1988_channel_library/);

// YouTube profile enrichment reuses the bounded channel refresh request.
assert.match(refresh,/const CHANNEL_PROFILE_TTL_MS=7\*DAY_MS/);
assert.match(refresh,/const channelDirectoryWrites:any\[\]=\[\]/);
assert.match(refresh,/profileStale/);
assert.match(refresh,/yt1988_upsert_channel_directory/);
assert.match(refresh,/source:"server-channel-refresh"/);
assert.match(refresh,/profileStale\?"&profile=1":""/);
assert.match(state,/action=channel&id=.*profile=1/);

// Rich YouTube profile metadata is fetched only on explicit profile requests.
assert.match(ytApi,/function youtubeWebChannelProfile\(/);
assert.match(ytApi,/aboutChannelViewModel/);
assert.match(ytApi,/BADGE_STYLE_TYPE_VERIFIED/);
assert.match(ytApi,/CHECK_CIRCLE_FILLED/);
assert.match(ytApi,/url\.searchParams\.get\("profile"\) === "1"/);
assert.match(ytApi,/wantsProfile\s*\?\s*youtubeWebChannelProfile/);

// MAIN keeps library helpers for explicit/local enrichment, but startup must
// not download or prime the full library. Package/search metadata own cards.
assert.match(html,/const channelLibraryByKey=new Map\(\)/);
assert.match(html,/function primeUnifiedChannelLibrary\(/);
assert.doesNotMatch(html,/primeUnifiedChannelLibrary\(remote\)/);
assert.match(html,/SOURCE_STATE_URL\+"\?view=manifest"/);
assert.match(html,/SOURCE_STATE_URL\+"\?view=lite"/);
assert.match(html,/channelLibraryEntry\("youtube",sourceId\)/);
// MAIN is YouTube-only after RT-06b. Retired TikTok identity rows must not be
// consumed by the production player, even if legacy backend schema is cleaned later.
assert.doesNotMatch(html,/channelLibraryEntry\("tiktok"/);

// Source manager alone consumes/caches the canonical identity library.
assert.match(sourceManager,/state\.remote\?\.channelLibrary/);
assert.match(sourceManager,/indexedDB\.open\(SOURCE_CACHE_DB,1\)/);
assert.match(sourceManager,/view:"library"/);
assert.match(sourceManager,/function channelLibraryYoutubeRow\(/);
const sourceMetaStart=sourceManager.indexOf('function metaMap');
const sourceMetaEnd=sourceManager.indexOf('function directScopeSet',sourceMetaStart);
assert.ok(sourceMetaStart>=0&&sourceMetaEnd>sourceMetaStart,'source manager metaMap missing');
const sourceMetaBlock=sourceManager.slice(sourceMetaStart,sourceMetaEnd);
assert.ok(
  sourceMetaBlock.indexOf('channelLibrary')>=0&&
  sourceMetaBlock.indexOf('channelLibrary')<sourceMetaBlock.indexOf('customSources'),
  'source manager must prefer channelLibrary before customSources'
);

// Schema source must mirror the live database fields.
for(const field of [
  'handle text',
  'description text',
  'verified boolean',
  'verified_known boolean',
  'subscriber_count bigint',
  'view_count bigint',
  'video_count bigint',
  'profile_url text',
  'profile_checked_at timestamptz'
]){
  assert.ok(migration.includes(field), 'missing migration field: '+field);
}

console.log('channel-library-contract: assertions passed');
