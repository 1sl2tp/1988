'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('  function playNextFeedVideo(){');
const end=html.indexOf('  function captureChannelFeedSnapshot(){',start);
assert(start>0&&end>start,'MAIN autoplay owner must exist');
const body=html.slice(start,end);
assert(!body.includes('isTwoColumn()'),'one-column mobile must be eligible for next');
assert(body.includes('if(!autoplayNext)return false;'),'off-switch must be respected');
assert(html.includes('queueMicrotask(()=>playNextFeedVideo())'),'YouTube ENDED retains next owner');
assert(html.includes('@media(min-width:1000px){\n  .masthead{position:relative}'),'desktop centered search breakpoint');
assert(html.includes('left:50%;\n    transform:translateX(-50%);'),'search center follows viewport axis');
const state={id:'first',title:'First'};
let played=[];
const c=vm.createContext({
  autoplayNext:true,current:state,feedMetas:[state,{id:'second',title:'Next'}],
  feedMode:'package',
  openMedia:(meta)=>{played.push(meta.id);return true;},
  renderCurrentInfo:()=>{},mediaProviderFor:()=> 'youtube',
  selectedMetaNeedsLookup:()=>false,loadCurrentVideoMeta:()=>{},
  document:{getElementById:()=>null},syncFeedHeader:()=>{}
});
vm.runInContext(body,c);
assert.equal(vm.runInContext('playNextFeedVideo()',c),true,'mobile autoplay opens next on ENDED');
assert.deepEqual(played,['second']);
c.autoplayNext=false;
assert.equal(vm.runInContext('playNextFeedVideo()',c),false,'saved disabled setting respected');
assert.deepEqual(played,['second']);
assert(html.includes('function wakeDailyContentOnVisibleVisit(rows=[])'),'existing daily wake retained');
// One proportional queue rule: desktop player stays LEFT while every next
// video row consumes the FULL remaining grid width. One column is minimum;
// the column count may exceed three on wide desktop screens.
const layoutStart=html.indexOf('  function watchColumnGeometry(');
const layoutEnd=html.indexOf('  function syncBoundaries(){',layoutStart);
assert(layoutStart>0&&layoutEnd>layoutStart,'watch geometry owner must exist');
const geometryContext=vm.createContext({});
vm.runInContext(html.slice(layoutStart,layoutEnd),geometryContext);
const geometry=geometryContext.watchColumnGeometry;
const cardStart=html.indexOf('  function chooseCardColumns(');
const cardEnd=html.indexOf('  // Watch: VIDEO LEFT',cardStart);
assert(cardStart>0&&cardEnd>cardStart,'both browse and watch column owners exist');
vm.runInContext(html.slice(cardStart,cardEnd),geometryContext);
const cards=geometryContext.chooseCardColumns;
const count=geometryContext.chooseWatchQueueColumns;
for(const [queueWidth,expected] of [
  [320,1],[560,1],[600,1],[615,1],[616,2],[679,2],[680,2],
  [999,3],[1080,3],[1400,3],[1536,4],[2200,5],[3500,9]
]){
  const cols=count(queueWidth,16);
  assert.equal(cols,expected,'proportional columns for queue '+queueWidth);
  const actualCardWidth=(queueWidth-(cols-1)*16)/cols;
  assert(actualCardWidth>=300,'every selected card fits the 300px minimum');
  assert(actualCardWidth*cols+16*(cols-1)===queueWidth,'cards + gaps exactly fill the queue');
}
for(const kind of ['landscape','portrait']){
  const ratio=kind==='portrait'?9/16:16/9;
  for(const viewportW of [1000,1200,1440,1920,2560]){
    const fullH=620;
    const g=geometry(viewportW,fullH,ratio,kind);
    assert.equal(g.mediaPanelW+g.feedW+16,viewportW-48,'no centered/capped watch canvas');
    assert(g.feedW>=320,'desktop always preserves next-list minimum width');
    assert(g.playerW>0&&g.playerW<=g.mediaPanelW,'real aspect video fits left');
    assert(g.mediaPanelW-g.playerW<321,'portrait metadata rail remains compact');
    assert(g.playerW/ratio<=fullH-(kind==='portrait'?140:98)+1,'title/actions stay visible');
    const cols=count(g.feedW,16);
    assert(cols>=1,'minimum one next video column');
    assert((g.feedW-16*(cols-1))/cols>=300,'all next-video cards stay usable');
    assert.equal(((g.feedW-16*(cols-1))/cols)*cols+16*(cols-1),g.feedW,'100% of remaining feed width is filled');
  }
}
assert.equal(count(geometry(2560,620,16/9,'landscape').feedW,16),4);
assert.equal(count(geometry(1920,620,9/16,'portrait').feedW,16),4);
assert.equal(count(geometry(2560,620,9/16,'portrait').feedW,16),5);
assert.equal(cards(1700,16),4,'unselected browse still has four columns maximum');
assert(!html.includes('html.two-col:not(.media-empty) main{'),'no centered watch canvas');
assert(html.includes('margin-inline:0!important;'),'video remains flush left');
assert(html.includes('html.two-col .info{\n  width:min(100%,max(320px,var(--two-col-player-w)));\n  margin-inline:0;'),'portrait info follows left player');
assert(html.includes('grid-template-columns:repeat(var(--feed-cols),minmax(0,1fr))!important;'),'watch CSS honors dynamic tracks');
assert(html.includes('setFeedColumnCount(chooseWatchQueueColumns(geometry.feedW,cardGap))'),'watch only measures remaining feed width');
assert(html.includes('grid-template-columns:var(--two-col-media-w) minmax(0,1fr);'),'video left and list right');
assert(/html\.viewer-active\.two-col \.rows\{\s*width:100%;\s*max-width:none;\s*justify-self:stretch;\s*box-sizing:border-box;/.test(html),'list stretches full right track instead of max-width clipping');
assert(!html.includes('max-width:1712px;'),'old three-card row cap is removed');
assert(!html.includes('max-width:1136px;'),'old two-card row cap is removed');
assert(html.includes('const cols=Math.max(1,Math.round(Number(value)||1));'),'DOM feed columns must support N>4');
assert(html.includes('root.dataset.feedDensity=cols>=4?"compact":"regular";'),'5+ cards preserve four-column compact metadata');
assert(html.includes('html.viewer-active.one-col .rows{'),'mobile queue remains under player');


// Background listening: isolated Safari opt-in preserves the normal player,
// passes its timestamp and a finite, deduplicated preloaded feed to ONE iframe.
const bgHtml=fs.readFileSync('sources/background-listen.html','utf8');
assert.equal((bgHtml.match(/<iframe\\b/g)||[]).length,1,'one native background iframe only');
assert(bgHtml.includes("autoplay:'0',controls:'1',fs:'1',playsinline:'0'"),
  'background iframe must use tested Safari fullscreen mode without forced autoplay');
assert(bgHtml.includes("params.set('start',String(start))"),'selected video timestamp carried via embed start');
assert(bgHtml.includes("params.set('playlist',next.join(','))"),'YouTube owns background next-video transitions');
assert(bgHtml.includes("frame.src='https://www.youtube-nocookie.com/embed/'+id"),
  'only official YouTube iframe, never proxy or alternate media');
assert(!/fetch\\(|setInterval\\(|serviceWorker\\.register|\\/audio\\?id=/.test(bgHtml),
  'no backend, scheduled activity or scraped audio in background page');
const script=bgHtml.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];
assert(script,'background page has inline script');
assert.doesNotThrow(()=>new vm.Script(script),'background HTML JavaScript syntax valid');
assert(html.includes('id="backgroundModeButton"')&&html.includes('data-info-action="background-listen"'),
  'visible Safari watch action wired as normal video info action');
assert(html.includes('location.assign(destination)'),
  'native background uses SAME tab to release the original iframe');
assert(html.includes('playsinline:1,'),'default web remains in YouTube inline mode');
const bgStart=html.indexOf('  function isIOSSafariBackgroundTab(){');
const bgEnd=html.indexOf('  function renderCurrentInfo(){',bgStart);
assert(bgStart>0&&bgEnd>bgStart,'single source for Safari/queue/background handoff');
const A='Cfmkk9wAXUw',B='pXL2jZFF6_k',C='wqjoebF6VfI',D='abcdefghiJK',E='abcdefghijL';
const videoList=[{id:A,provider:'youtube'},{id:B,provider:'youtube'},
  {id:B,provider:'youtube'},{id:D,isLive:true},{id:E,provider:'retired'},
  {id:'bad_id',provider:'youtube'},{id:C,provider:'youtube'}];
const bgContext=vm.createContext({
  navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/605.1.15',standalone:false,maxTouchPoints:5},
  window:{matchMedia:()=>({matches:false})},feedMetas:videoList,relatedMetas:[],
  autoplayNext:true,current:{id:A,label:'Bolero'},
  currentMeta:{id:A,title:'Liên khúc Bolero'},activePackageScope:'latest',
  ytPlayer:{getVideoData:()=>({video_id:A}),getCurrentTime:()=>192.9},
  normalizedMediaProvider:value=>String(value||'youtube')==='youtube'?'youtube':'retired',
  location:{origin:'https://yt.taphoa.xyz'},
  canonicalVideoHash:id=>'#/watch/'+id,URL
});
vm.runInContext(html.slice(bgStart,bgEnd),bgContext);
assert.equal(bgContext.isIOSSafariBackgroundTab(),true,'Safari tab eligibility');
assert.deepEqual(Array.from(bgContext.backgroundQueueForVideo(A,videoList,true,12)),[B,C],
  'in-order next IDs; no duplicates, live, invalid, retired source');
assert.deepEqual(Array.from(bgContext.backgroundQueueForVideo(A,videoList,false,12)),[],
  'autoplay switch OFF must not send background queue');
assert.deepEqual(Array.from(bgContext.backgroundQueueForVideo(A,videoList,true,1)),[B],
  'finite queue limit respected');
assert.deepEqual(Array.from(bgContext.backgroundQueueForVideo(C,videoList,true,12)),[],
  'last-video position yields no successors');
const u=new URL(bgContext.backgroundListenUrl());
assert.equal(u.origin,'https://yt.taphoa.xyz');
assert.equal(u.pathname,'/sources/background-listen.html');
assert.equal(u.searchParams.get('v'),A);
assert.equal(u.searchParams.get('t'),'192','preserve original video playback seconds');
assert.equal(u.searchParams.get('next'),B+','+C);
assert.equal(u.searchParams.get('back'),'#/watch/'+A);
bgContext.ytPlayer={getVideoData:()=>({video_id:B}),getCurrentTime:()=>192.9};
assert.equal(new URL(bgContext.backgroundListenUrl()).searchParams.has('t'),false,
  'never transfer a stale time from a DIFFERENT playing video');
bgContext.autoplayNext=false;
assert.equal(new URL(bgContext.backgroundListenUrl()).searchParams.has('next'),false,
  'saved off switch must suppress the background playlist');
bgContext.navigator.standalone=true;
assert.equal(bgContext.isIOSSafariBackgroundTab(),false,'native Safari mode not promised for standalone PWA');
bgContext.navigator.standalone=false;
bgContext.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS Safari/604.1';
assert.equal(bgContext.isIOSSafariBackgroundTab(),false,'do not present Safari-only flow to Chrome iOS');

console.log('1988 desktop search and mobile next autoplay PASS');
