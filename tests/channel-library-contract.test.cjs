const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const state=fs.readFileSync('supabase/functions/yt1988-state/index.ts','utf8');
const refresh=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003092500_unified_channel_library.sql','utf8');

// One normalized contract is returned for both platforms.
assert.match(state,/channelLibraryVersion\s*=\s*1/);
assert.match(state,/platform:\s*"youtube"/);
assert.match(state,/platform:\s*"tiktok"/);
assert.match(state,/key:\s*"youtube:"\s*\+\s*id/);
assert.match(state,/key:\s*"tiktok:"\s*\+\s*handle\.toLowerCase\(\)/);
assert.match(state,/badges:\s*verified\s*\?\s*\["verified"\]/);
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

// Browser primes and prefers the unified library for both platforms.
assert.match(html,/const channelLibraryByKey=new Map\(\)/);
assert.match(html,/function primeUnifiedChannelLibrary\(/);
assert.match(html,/primeUnifiedChannelLibrary\(remote\)/);
assert.match(html,/channelLibraryEntry\("youtube",sourceId\)/);
assert.match(html,/channelLibraryEntry\("tiktok",handle\)/);

// Schema source must mirror the live database fields.
for(const field of [
  'handle text',
  'description text',
  'verified boolean',
  'subscriber_count bigint',
  'view_count bigint',
  'video_count bigint',
  'profile_url text',
  'profile_checked_at timestamptz'
]){
  assert.ok(migration.includes(field), 'missing migration field: '+field);
}

console.log('channel-library-contract: assertions passed');
