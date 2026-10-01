// Live list contract: status only; media is user-demand.
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');

const selectedStart=source.indexOf('async function selectedSourceLiveNow(');
const selectedEnd=source.indexOf('async function discoverGlobalLiveCandidates(',selectedStart);
assert.ok(selectedStart>=0&&selectedEnd>selectedStart,'selectedSourceLiveNow missing');
const selected=source.slice(selectedStart,selectedEnd);

assert.match(selected,/const currentId=await youtubeChannelLiveVideoId\(id,3200\)/,
  'selected YouTube channel must use the canonical /channel/<id>/live fingerprint');
assert.doesNotMatch(selected,/fresh_.*candidate/,
  'search candidates must not become LIVE when the canonical /live fingerprint is empty');
assert.match(selected,/if\(!currentId\)return null;/,
  'no current /live video id must mean not LIVE');

const mergeStart=source.indexOf('// STEP 3 — merge only after Source 1 and Source 2');
const mergeEnd=source.indexOf('const nonLiveScopes=',mergeStart);
assert.ok(mergeStart>=0&&mergeEnd>mergeStart,'LIVE merge block missing');
const merge=source.slice(mergeStart,mergeEnd);
assert.doesNotMatch(merge,/\.\.\.selectedFromSearch/,
  'raw search discovery must never be published directly as selected LIVE');
assert.match(merge,/\.\.\.selectedCheckedRows/,
  'selected LIVE rows must come from canonical per-channel checks');

console.log('youtube-live-state-contract: assertions passed');
