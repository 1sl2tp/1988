// verification-trigger: unified-live-link-contract
// LIVE discovery contract: search yields candidates; verified live links are published.
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');

const discoveryStart=source.indexOf('async function discoverGlobalLiveCandidates(');
const discoveryEnd=source.indexOf('function ',discoveryStart+20);
assert.ok(discoveryStart>=0,'discoverGlobalLiveCandidates missing');

assert.match(source,/verifiedExternalRows=await verifyCurrentLiveFingerprintRows\(discoveredExternal,24\)/,
  'external YouTube search candidates must be verified before publish');
assert.match(source,/verifiedSelectedFromSearch=await verifyCurrentLiveFingerprintRows\(/,
  'selected-channel YouTube search candidates must also be verified before publish');

const mergeStart=source.indexOf('// STEP 3 — merge only after Source 1 and Source 2');
const mergeEnd=source.indexOf('const nonLiveScopes=',mergeStart);
assert.ok(mergeStart>=0&&mergeEnd>mergeStart,'LIVE merge block missing');
const merge=source.slice(mergeStart,mergeEnd);
assert.match(merge,/\.\.\.verifiedSelectedFromSearch/,
  'verified search LIVE rows must participate in the final LIVE list');
assert.doesNotMatch(merge,/\.\.\.selectedFromSearch/,
  'raw search candidates must never be published directly');

console.log('youtube-live-state-contract: assertions passed');
