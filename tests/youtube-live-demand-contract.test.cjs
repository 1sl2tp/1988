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

test('landing feed keeps LIVE fully dormant until user opens it',()=>{
  assert.doesNotMatch(html,/function preloadStartupLiveLists\(/);
  assert.doesNotMatch(html,/function scheduleStartupLivePreload\(/);

  const start=html.indexOf('const firstPackagePromise=(async()=>{');
  const end=html.indexOf('\n    const statePromise=',start);
  assert.ok(start>=0&&end>start,'startup firstPackagePromise missing');
  const block=html.slice(start,end);
  assert.match(block,/const scope=STARTUP_SCOPE/);
  assert.match(block,/showPackageScope\(scope,\{hydrateLive:false\}\)/);
  assert.doesNotMatch(block,/ensurePreparedPackageReady\("live"\)/);
  assert.doesNotMatch(block,/refreshUnifiedLiveInBackground\(/);
  assert.doesNotMatch(block,/runYoutubeLiveCycle\(/);
});

test('prepared package checks include LIVE',()=>{
  const start=html.indexOf('async function checkPackagesOnDemand(');
  const end=html.indexOf('\n  document.addEventListener("visibilitychange"',start);
  assert.ok(start>=0&&end>start,'checkPackagesOnDemand missing');
  const block=html.slice(start,end);
  assert.doesNotMatch(block,/value!=="live"/);
  assert.match(block,/requestPreparedRefresh\(due\)/);
});

console.log('youtube-live-demand-contract: assertions passed');
