const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

test('opening YouTube LIVE starts a demand-only fresh scan after cached paint',()=>{
  const start=html.indexOf('async function showPackageScope(');
  const end=html.indexOf('\n  let packageSyncRunning=',start);
  assert.ok(start>=0&&end>start,'showPackageScope missing');
  const block=html.slice(start,end);
  assert.match(block,/hydrateUnifiedLiveSnapshots\(\{paint:true,provider\}\)\.finally/);
  assert.match(block,/if\(provider==="youtube"\)/);
  assert.match(block,/reason:"tab-open"/);
  assert.match(block,/refreshUnifiedLiveInBackground\(\{/);
  assert.match(block,/Date\.now\(\)-liveDiscoveryLastAt>=LIVE_DISCOVERY_MIN_GAP_MS/);
});

test('legacy Supabase LIVE package refresh remains disabled in the client',()=>{
  const start=html.indexOf('async function checkPackagesOnDemand(');
  const end=html.indexOf('\n  document.addEventListener("visibilitychange"',start);
  assert.ok(start>=0&&end>start,'checkPackagesOnDemand missing');
  const block=html.slice(start,end);
  assert.match(block,/value!=="live"/);
});

console.log('youtube-live-demand-contract: assertions passed');
