const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const app=fs.readFileSync('src/app.js','utf8');
const server=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
function fn(name){let start=app.indexOf('function '+name+'(');assert.ok(start>=0,name);if(app.slice(start-6,start)==='async ')start-=6;return app.slice(start,app.indexOf('\n}',start)+2);}
function client(){const data=new Map();const c=vm.createContext({console,window:{},URL,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},TAB_SNAPSHOT_PREFIX:'test:',clean:v=>String(v||'').trim()});vm.runInContext(['normalizeSearchText','fastHash','extractVideoId','itemVideoId','parseDurationValue','durationSeconds','isTooShortVideo','snapshotKey','snapshotRowsHash','readAtomicSnapshot','commitAtomicSnapshot'].map(fn).join('\n'),c);return c;}
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
