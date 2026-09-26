const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const app=fs.readFileSync('src/app.js','utf8');
const server=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
function fn(name){let start=app.indexOf('function '+name+'(');assert.ok(start>=0,name);if(app.slice(start-6,start)==='async ')start-=6;return app.slice(start,app.indexOf('\n}',start)+2);}
function client(){const data=new Map();const c=vm.createContext({console,window:{},URL,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},TAB_SNAPSHOT_PREFIX:'test:',clean:v=>String(v||'').trim()});vm.runInContext(['normalizeSearchText','fastHash','extractVideoId','itemVideoId','parseDurationValue','durationSeconds','isTooShortVideo','snapshotKey','snapshotRowsHash','snapshotRowsHashV330','readAtomicSnapshot','commitAtomicSnapshot'].map(fn).join('\n'),c);return c;}
const s=vm.createContext({console,URL,Date,setTimeout,clearTimeout});
vm.runInContext(stripTypeScriptTypes(server.split('Deno.serve(')[0].replace(/^import .*;\n/,'')),s);
const fixtures=[
 [{duration:60},true],[{duration:61},false],[{duration:1},true],
 [{duration:'1:00'},true],[{durationText:'0:59'},true],[{lengthSeconds:'60'},true],
 [{contentDetails:{duration:'PT1M'}},true],[{duration:180,isShort:'true'},true],
 [{duration:180,rendererType:'ShortsLockupView'},true],
 [{duration:180,type:'video',rendererType:'ShortsLockupView'},true],
 [{duration:180,title:'Clip #shorts'},true],
 [{duration:180,url:'https://youtube.com/watch?v=abcdefghijk',videoUrl:'https://youtube.com/shorts/abcdefghijk'},true],
 [{isLive:true,duration:30},false],[{duration:0},false]
];
for(const [row,expected] of fixtures)test('filter '+JSON.stringify(row),()=>{assert.equal(client().isTooShortVideo(row),expected,'client');assert.equal(s.isTooShortVideo(row),expected,'server');});
test('server normalization preserves formatted duration for filtering',()=>{assert.equal(s.isTooShortVideo(s.normalizeRow({id:'abcdefghijk',duration:'1:00'})),true);});
test('empty server snapshot replaces old data and remains readable',()=>{const c=client();c.commitAtomicSnapshot('feed:latest',[{id:'abcdefghijk',title:'old'}]);const result=c.commitAtomicSnapshot('feed:latest',[],{inputHash:'empty'});assert.equal(result.changed,true);assert.equal(c.readAtomicSnapshot('feed:latest').items.length,0);assert.equal(c.commitAtomicSnapshot('feed:latest',[],{inputHash:'empty'}).changed,false);});
test('server package beyond 90 rows is preserved and hashed completely',()=>{const c=client();const rows=Array.from({length:120},(_,i)=>({id:String(i).padStart(11,'0'),title:'Video '+i}));c.commitAtomicSnapshot('feed:latest',rows);assert.equal(c.readAtomicSnapshot('feed:latest').items.length,120);const hash=c.snapshotRowsHash(rows);rows[119].title='changed';assert.notEqual(c.snapshotRowsHash(rows),hash);});
test('channel batch prioritizes oldest checks and retains every deferred channel',()=>{assert.equal(typeof s.channelRefreshBatch,'function');const times={old:1,english:100,newest:200};const b=s.channelRefreshBatch(['english','newest','old'],id=>times[id],2);assert.deepEqual(Array.from(b.fetch),['old','english']);assert.deepEqual(Array.from(b.deferred),['newest']);});
test('empty package reaches active feed without resurrecting cached rows',()=>{
 const c=client();Object.assign(c,{state:{searchResultsActive:false,activeFeed:'latest',activeParent:'',activeTrend:'',feedRows:[{id:'abcdefghijk'}],aiCategoryRows:new Map()},watchPlaybackVisible:()=>false,window:{scrollY:0},sourceFeedPendingRenderName:'',feedStatus:{textContent:''},prewarmRowSourceAvatars:async()=>{},mergeUniqueRows:(_,r)=>r,renderCards:r=>{c.rendered=r;},packageSnapshotName:scope=>'feed:'+scope,CONTENT_SOURCE_SCOPES:new Set(),packageSyncApplying:false});
 vm.runInContext(['applyServerPackage','sourceFeedRowsSignature','applyActiveFeedSnapshot'].map(fn).join('\n'),c);
 c.freshSnapshotRowsForFeed=()=>c.readAtomicSnapshot('feed:latest')?.items||[];
 assert.equal(c.applyServerPackage('latest',{items:[],hash:c.snapshotRowsHash([]),source_signature:''}),true);
 assert.equal(c.applyActiveFeedSnapshot('latest'),true);assert.equal(c.state.feedRows.length,0);assert.equal(c.rendered.length,0);
 assert.equal(c.applyServerPackage('latest',{hash:'bad'}),false);
});
test('all stale channels are visited once over successive bounded batches',()=>{
 let ids=Array.from({length:49},(_,i)=>String(i));let times=Object.fromEntries(ids.map(id=>[id,0]));let visited=[];
 for(let tick=1;ids.length;tick++){const b=s.channelRefreshBatch(ids,id=>times[id],12);visited.push(...b.fetch);b.fetch.forEach(id=>times[id]=tick);ids=Array.from(b.deferred);}
 assert.equal(visited.length,49);assert.equal(new Set(visited).size,49);
});

test('concurrent package checks share one request and tolerate a slow connection',async()=>{
 const c=client();let calls=0,release;Object.assign(c,{SOURCE_MANAGER_GROUPS:[],SERVER_PACKAGE_MANIFEST_TTL:15000,packageManifestLastAt:0,packageHydrationPromise:null,packageSyncFetch:(_method,_scope,_body,timeout)=>{calls++;assert.ok(timeout>=12000,'allow responses slower than 10 seconds');return new Promise(resolve=>release=resolve);}});
 vm.runInContext(fn('hydrateServerPackages'),c);
 const first=c.hydrateServerPackages({force:true});const second=c.hydrateServerPackages({force:true});
 assert.equal(calls,1);release({ok:true,manifest:{}});assert.equal(await first,true);assert.equal(await second,true);
});

test('music tab blocks beat, kara and karaoke only in music scope',()=>{
 assert.equal(s.isBlockedMusicTabVideo({kind:'content',label:'Nhạc'},{title:'Tình yêu Karaoke'}),true);
 assert.equal(s.isBlockedMusicTabVideo({kind:'content',label:'Nhạc'},{title:'Tình yêu beat'}),true);
 assert.equal(s.isBlockedMusicTabVideo({kind:'content',label:'Nhạc'},{title:'Tình yêu KARA'}),true);
 assert.equal(s.isBlockedMusicTabVideo({kind:'content',label:'Nhạc'},{title:'Tình yêu Official MV'}),false);
 assert.equal(s.isBlockedMusicTabVideo({kind:'content',label:'Phim'},{title:'Karaoke đêm'}),false);
});


test('package hashes change when verified duration changes',()=>{
 const c=client();
 const a={id:'abcdefghijk',title:'Song',publishedText:'now',duration:61};
 const b={...a,duration:180};
 assert.notEqual(c.snapshotRowsHash([a]),c.snapshotRowsHash([b]),'client duration hash');
 assert.notEqual(s.snapshotRowsHash([a]),s.snapshotRowsHash([b]),'server duration hash');
});

test('youtube player metadata exposes exact duration and live state',()=>{
 const normal=s.youtubePlayerMetaFromResponse({videoDetails:{lengthSeconds:'61',isLive:false}});
 assert.equal(normal.duration,61);
 assert.equal(normal.isLive,false);
 const live=s.youtubePlayerMetaFromResponse({videoDetails:{lengthSeconds:'30',isLiveContent:true}});
 assert.equal(live.duration,-1);
 assert.equal(live.isLive,true);
 const tracked=s.youtubePlayerMetaFromResponse({
  videoDetails:{lengthSeconds:'180'},
  responseContext:{serviceTrackingParams:[{params:[{key:'is_viewed_live',value:'true'}]}]}
 });
 assert.equal(tracked.duration,-1);
 assert.equal(tracked.isLive,true);
});


test('shorts page signal identifies canonical Shorts and rejects normal fallback',()=>{
 assert.equal(
  s.youtubeShortsPageSignal('<link rel="canonical" href="https://www.youtube.com/shorts/kUF9P2m9mrg">','kUF9P2m9mrg'),
  true
 );
 assert.equal(
  s.youtubeShortsPageSignal('<link rel="canonical" href="undefined"><a href="https://m.youtube.com/watch?v=YN7yfAnAxfs">','YN7yfAnAxfs'),
  false
 );
 assert.equal(
  s.youtubeShortsPageSignal('{"webPageType":"WEB_PAGE_TYPE_SHORTS","videoId":"abcdefghijk"}','abcdefghijk'),
  true
 );
});


test('v330 reserve remains readable after v331 hash expansion',()=>{
 const c=client();
 const rows=[{id:'abcdefghijk',title:'Old reserve',duration:120,_sourceId:'UC123456789'}];
 const legacyHash=c.snapshotRowsHashV330(rows,'sig');
 c.localStorage.setItem('test:feed:latest:a',JSON.stringify({slot:'a',hash:legacyHash,sourceSignature:'sig',items:rows}));
 c.localStorage.setItem('test:feed:latest:ptr',JSON.stringify({slot:'a',hash:legacyHash}));
 const read=c.readAtomicSnapshot('feed:latest');
 assert.equal(read.items.length,1);
 assert.equal(read.legacyHash,legacyHash);
 assert.equal(read.hash,c.snapshotRowsHash(rows,'sig'));
});

test('package hash changes when visible metadata changes',()=>{
 const c=client();
 const base={id:'abcdefghijk',title:'Tin mới',duration:120,_sourceId:'UC123456789',_sourceName:'Kênh A',thumbnailUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',views:10};
 assert.notEqual(c.snapshotRowsHash([base]),c.snapshotRowsHash([{...base,_sourceName:'Kênh B'}]));
 assert.notEqual(c.snapshotRowsHash([base]),c.snapshotRowsHash([{...base,views:11}]));
 assert.notEqual(c.snapshotRowsHash([base]),c.snapshotRowsHash([{...base,thumbnailUrl:'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg'}]));
});

test('server normalization never exposes a channel id as channel name',()=>{
 const row=s.normalizeRow(
  {id:'abcdefghijk',title:'Tin mới',uploader:'UCaaaaaaaaaaaaaaaaaaaaaa',duration:120},
  {id:'UCaaaaaaaaaaaaaaaaaaaaaa',name:'Kênh Chuẩn',thumbnailUrl:'https://yt3.example/avatar.jpg'}
 );
 assert.equal(row.uploader,'Kênh Chuẩn');
 assert.equal(row.uploaderName,'Kênh Chuẩn');
 assert.equal(row._sourceName,'Kênh Chuẩn');
 assert.equal(row._sourceThumbnailUrl,'https://yt3.example/avatar.jpg');
 assert.match(row.thumbnailUrl,/i\.ytimg\.com\/vi\/abcdefghijk\/hqdefault\.jpg/);
});


test('exact search metadata supplies duration and canonical source identity',()=>{
 const meta=s.exactSearchVideoMeta({
  items:[{
   url:'/watch?v=k-72jTSvdwE',
   duration:88,
   uploaderName:'Báo Người Lao Động',
   uploaderAvatar:'https://yt3.example/avatar.jpg',
   thumbnail:'https://i.ytimg.com/vi/k-72jTSvdwE/hqdefault.jpg',
   views:87
  }]
 },'k-72jTSvdwE');
 assert.equal(meta.duration,88);
 assert.equal(meta.sourceName,'Báo Người Lao Động');
 assert.equal(meta.sourceThumbnailUrl,'https://yt3.example/avatar.jpg');
 assert.equal(meta.views,87);
 assert.equal(s.exactSearchVideoMeta({items:[]},'k-72jTSvdwE'),null);
});


test('legacy server package is accepted once and remembered by remote hash',()=>{
 const c=client();
 Object.assign(c,{
  packageSnapshotName:scope=>'feed:'+scope,
  CONTENT_SOURCE_SCOPES:new Set(),
  state:{aiCategoryRows:new Map()},
  packageSyncApplying:false
 });
 vm.runInContext(fn('applyServerPackage'),c);
 const rows=[{
  id:'abcdefghijk',
  title:'Legacy server row',
  publishedText:'1 giờ trước',
  duration:120,
  _sourceId:'UC123456789',
  _sourceName:'Kênh A'
 }];
 const serverHash=c.snapshotRowsHashV330(rows,'sig');
 assert.equal(c.applyServerPackage('latest',{
  items:rows,
  hash:serverHash,
  source_signature:'sig',
  input_hash:'legacy-input'
 }),true);
 const local=c.readAtomicSnapshot('feed:latest');
 assert.equal(local.items.length,1);
 assert.equal(local.hash,c.snapshotRowsHash(rows,'sig'));
 assert.equal(local.serverHash,serverHash);
});

test('current server hash is stored with atomic reserve',()=>{
 const c=client();
 Object.assign(c,{
  packageSnapshotName:scope=>'feed:'+scope,
  CONTENT_SOURCE_SCOPES:new Set(),
  state:{aiCategoryRows:new Map()},
  packageSyncApplying:false
 });
 vm.runInContext(fn('applyServerPackage'),c);
 const rows=[{id:'abcdefghijk',title:'Current row',duration:180,_sourceId:'UC123456789'}];
 const hash=c.snapshotRowsHash(rows,'sig');
 assert.equal(c.applyServerPackage('latest',{items:rows,hash,source_signature:'sig'}),true);
 assert.equal(c.readAtomicSnapshot('feed:latest').serverHash,hash);
});
