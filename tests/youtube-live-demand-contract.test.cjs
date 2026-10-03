const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

test('opening YouTube LIVE reads the prepared package and wakes a rebuild',()=>{
  const start=html.indexOf('async function showPackageScope(');
  const end=html.indexOf('\n  let packageSyncRunning=',start);
  assert.ok(start>=0&&end>start,'showPackageScope missing');
  const block=html.slice(start,end);
  assert.match(block,/scope==="live"/);
  assert.match(block,/ensurePreparedPackageReady\(scope\)/);
  assert.match(block,/feedMetas=Array\.isArray\(baseMetas\)/);
  assert.match(block,/refreshUnifiedLiveInBackground\(\{/);
  assert.match(block,/reason:"tab-open"/);
  assert.doesNotMatch(block,/fetchYoutubeLiveSnapshot\(/);
});

test('landing feed restores LIVE package then rebuilds it in background',()=>{
  const start=html.indexOf('async function preloadStartupLiveLists(');
  const end=html.indexOf('\n  async function hydrateUnifiedLiveSnapshots',start);
  assert.ok(start>=0&&end>start,'preloadStartupLiveLists missing');
  const block=html.slice(start,end);
  assert.match(block,/ensurePreparedPackageReady\("live"\)/);
  assert.match(block,/syncPreparedScopeAfterWake\("live"\)/);
  assert.match(block,/scheduleLiveBackgroundRefresh\(\)/);
  assert.doesNotMatch(block,/runYoutubeLiveCycle\(/);
});

test('prepared package checks include LIVE',()=>{
  const start=html.indexOf('async function checkPackagesOnDemand(');
  const end=html.indexOf('\n  document.addEventListener("visibilitychange"',start);
  assert.ok(start>=0&&end>start,'checkPackagesOnDemand missing');
  const block=html.slice(start,end);
  assert.doesNotMatch(block,/value!=="live"/);
  assert.match(block,/requestPreparedRefresh\(wanted\)/);
});

console.log('youtube-live-demand-contract: assertions passed');
