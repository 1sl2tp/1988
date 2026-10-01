const assert=require('node:assert/strict');
const fs=require('node:fs');

const server=fs.readFileSync('backend/social-collector/server.mjs','utf8');

assert.match(server,/function isTikTokConfirmedLiveStatus\(/,
  'one canonical confirmed-LIVE predicate is required');
assert.match(server,/function tiktokPublishedLiveNow\(/,
  'one canonical publishable-LIVE predicate is required');

assert.doesNotMatch(
  server,
  /HARD LOCK[\s\S]{0,500}tiktokRealtimeLiveHandles\.has\(key\).*allowLiveRemoval/,
  'stored/library LIVE must not be sticky via the old HARD LOCK'
);

assert.match(
  server,
  /const liveEvidence=evidence\.find\(x=>x\.known&&x\.live\)\|\|null;[\s\S]{0,200}const liveRoomId=String\(liveEvidence\?\.roomId\|\|''\);/,
  'LIVE sweep must derive roomId from the positive evidence before storing it'
);

assert.match(
  server,
  /retained-after-unknown[\s\S]{0,240}live:false[\s\S]{0,160}status:'unknown'[\s\S]{0,160}probeState:'unknown'/,
  'UNKNOWN may keep media warm internally but must not keep the library marked LIVE'
);

const storedStart=server.indexOf('function buildTikTokStoredRows()');
const storedEnd=server.indexOf('async function persistTikTokLiveStore',storedStart);
assert.ok(storedStart>=0&&storedEnd>storedStart,'stored LIVE builder missing');
const stored=server.slice(storedStart,storedEnd);
assert.match(stored,/const live=tiktokPublishedLiveNow\(handle/,'persistence must use the canonical published-LIVE predicate');
assert.doesNotMatch(stored,/\|\|Boolean\(item\.live\)/,'persistence must never OR in stale library LIVE');

for(const route of ['/tiktok/live-now','/tiktok/live-library']){
  const start=server.indexOf("if(url.pathname==='"+route+"'");
  assert.ok(start>=0,route+' route missing');
  const end=server.indexOf("\n  if(url.pathname==='",start+10);
  const block=server.slice(start,end>start?end:start+5000);
  assert.match(block,/tiktokPublishedLiveNow\(handle,now\)/,
    route+' must publish only fresh confirmed LIVE with a usable FLV');
}

console.log('tiktok-live-state-contract: assertions passed');


const auditStart=server.indexOf('async function runTikTokLiveAuditSweep()');
const auditEnd=server.indexOf("\nfunction ",auditStart+20);
const audit=server.slice(auditStart,auditEnd>auditStart?auditEnd:auditStart+7000);
assert.match(audit,/runTikTokLiveMinuteSweep\(\{targetHandles:selected,exhaustive:true\}\)/,
  'full LIVE audit must use the same canonical sweep in exhaustive mode');
assert.doesNotMatch(audit,/runTikTokBrowserDiscoveryBatch\(/,
  'full LIVE audit must not maintain a second independent LIVE definition');

assert.match(server,/function runTikTokLiveMinuteSweep\(\{targetHandles=null,exhaustive=false\}=\{\}\)/,
  'canonical sweep must support an explicit exhaustive mode');
assert.match(server,/const deepPick=exhaustive[\s\S]{0,180}\? coldTargets\.slice\(\)[\s\S]{0,180}: coldTargets\.length/,
  'exhaustive mode must deep-check every cold selected channel');
