'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');

test('video card keeps its thumbnail while selected, even with legacy inline-playing class',()=>{
  assert.match(html,/const opened=selectedMeta\?openMedia\(selectedMeta\):false;/);
  assert.match(html,/returnPlayerToMainStage\(\);\s*layout\(\);/);
  assert.match(html,/\.row-thumb\.inline-playing:not\(\.pip-floating\) > img,[\s\S]{0,150}visibility:visible;/);
  assert.doesNotMatch(html,/\.row-thumb\.inline-playing:not\(\.pip-floating\) > img,[\s\S]{0,150}visibility:hidden;/);
  assert.match(html,/'<img src="'\+escapeHtml\(thumb\)/);
  assert.match(html,/rememberRenderedThumbs\(rows\);[\s\S]{0,230}rows\.innerHTML=feedHeaderMarkup/);
  assert.match(html,/restoreRenderedThumbs\(rows\);/);
});

test('reported English titles gain Vietnamese display names; original title is kept',()=>{
  const start=html.indexOf('  const sessionVietnameseTitleCache=new Map();');
  const end=html.indexOf('  function cardMarkup(',start);
  assert(start>=0&&end>start);
  const videoDisplayTitle=vm.runInNewContext(html.slice(start,end)+'\nvideoDisplayTitle;');
  assert.equal(videoDisplayTitle({title:'HIRED A TUTOR FOR 100K AN HOUR, BUT THE PARENT SLASHED THE PAY IN HALF | DRAMA'}),
    'Thuê gia sư 100 nghìn một giờ nhưng phụ huynh giảm một nửa tiền công | Phim ngắn');
  assert.equal(videoDisplayTitle({title:'October 20th - When Men Are the Weaker Sex | Two Brothers Part 1178 | Funny Situations by Gãy Media'}),
    'Ngày 20/10 – Khi đàn ông là phái yếu | Hai anh em tập 1178 | Gãy Media');
  assert.equal(videoDisplayTitle({title:'Original',titleVi:'Tiêu đề do tác giả bản địa hoá'}),'Tiêu đề do tác giả bản địa hoá');
  assert.equal(videoDisplayTitle({title:'Tên riêng chưa có bản dịch'}),'Tên riêng chưa có bản dịch');
  assert.match(html,/const originalTitle=meta\.title \|\| current\.label/);
  assert.match(html,/title="'\+escapeHtml\(originalTitle\)/);
});

test('verified LIVE edge snapshot replaces 5-day-stale package, rejects unverified/expired rows',async()=>{
  const start=html.indexOf('  const LIVE_SNAPSHOT_MAX_AGE_MS=');
  const end=html.indexOf('  async function fetchYoutubeLiveSnapshot(',start);
  assert(start>=0&&end>start);
  let snapshot={ok:true,checkedAt:Date.now()-5*60_000,
    items:[
      {videoId:'abcdefghijk',verifiedLive:true,verifiedOwner:true,sourceId:'UCgood'},
      {videoId:'lmnopqrstuv',verifiedLive:true,verifiedOwner:false,sourceId:'UCwrong'},
      {videoId:'zyxwvutsrqpo',verifiedLive:true,verifiedOwner:true,sourceId:'UCblocked'}
    ]};
  const context=vm.createContext({
    Date,Array,Number,String,console,
    packageManifest:{live:{updatedAt:new Date(Date.now()-5*86400000).toISOString()}},
    youtubeEdgeLiveReady:false,youtubeEdgeLiveMetas:[],
    liveDemandActive:()=>true,
    fetchYoutubeLiveSnapshot:async()=>snapshot,
    normalizeYoutubeEdgeLiveItem:item=>({id:item.videoId,sourceId:item.sourceId}),
    youtubeLiveSourceBlocked:id=>id==='UCblocked',
    paintUnifiedLiveFromEdge:()=>true
  });
  vm.runInContext(html.slice(start,end),context);
  assert.equal(vm.runInContext('currentYoutubeLiveMetas([{id:"stale"}]).length',context),0);
  assert.equal(await vm.runInContext('syncVerifiedLiveSnapshot({paint:false})',context),true);
  assert.deepEqual(Array.from(vm.runInContext('currentYoutubeLiveMetas([{id:"stale"}]).map(r=>r.id)',context)),['abcdefghijk']);
  assert.equal(vm.runInContext('youtubeEdgeLiveReady',context),true);
  snapshot={...snapshot,checkedAt:Date.now()-90*60_000};
  assert.equal(await vm.runInContext('syncVerifiedLiveSnapshot({paint:false})',context),false);
  assert.equal(vm.runInContext('currentYoutubeLiveMetas([{id:"stale"}]).length',context),0);
  context.packageManifest.live.updatedAt=new Date().toISOString();
  assert.deepEqual(Array.from(vm.runInContext('currentYoutubeLiveMetas([{id:"fresh-package"}]).map(r=>r.id)',context)),['fresh-package']);
});

test('LIVE refresh also probes verified snapshot and other sources remain package-owned',()=>{
  assert.match(html,/void syncVerifiedLiveSnapshot\(\{paint:true\}\)/);
  assert.match(html,/await syncVerifiedLiveSnapshot\(\{paint:false\}\)/);
  assert.match(html,/await syncVerifiedLiveSnapshot\(\{paint:true\}\)/);
  assert.match(html,/scope==="live"\?currentYoutubeLiveMetas\(base\):startupVisibleMetas\(scope,base\)/);
  assert.match(html,/item\?\.verifiedLive===true&&item\?\.verifiedOwner===true/);
  assert.match(html,/Date\.now\(\)-checked>LIVE_SNAPSHOT_MAX_AGE_MS/);
});
