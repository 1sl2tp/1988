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


// IN-PLACE Safari 'Chạy nền': never route away to a demo-like webpage.
assert(html.includes('id="backgroundModeButton"')&&html.includes('data-info-action="background-listen"'),
  'Safari-only native background button in video metadata');
assert(html.includes('id="backgroundModeLabel"')&&html.includes('id="backgroundModeHint"'),
  'the mode has an in-place return action and PiP user instructions');
assert(!html.includes('location.assign(destination)'),'Chạy nền must not navigate to another page');
assert(!html.includes('"/sources/background-listen.html"'),
  'the production watch mode must not target the prior separate demo page');
assert(html.includes('playsinline:1,'),'normal YouTube player stays inline');
assert(html.includes('if(backgroundNativeActive)return null;'),
  'late YouTube iframe-api initialization cannot create a second player');
assert(html.includes('if(backgroundNativeActive||event.target!==ytPlayer)return;'),
  'late onReady/state change from old player cannot control native media');
assert(html.includes('if(backgroundNativeActive)exitBackgroundNativeMode({restore:false});'),
  'selecting a new video must remove native player before normal playback');
assert(html.includes('html.background-native .embed-media-core > #backgroundNativeFrame'),
  'native Safari mode removes iframe rail cropping');
const startMode=html.indexOf('  function isIOSSafariBackgroundTab(){');
const endMode=html.indexOf('  function renderCurrentInfo(){',startMode);
assert(startMode>0&&endMode>startMode,'one Safari background mode owner');
const A='Cfmkk9wAXUw',B='pXL2jZFF6_k',C='wqjoebF6VfI',D='abcdefghiJK',E='abcdefghijL';
const videoList=[
  {id:A,provider:'youtube'},{id:B,provider:'youtube'},
  {id:B,provider:'youtube'},{id:D,isLive:true},{id:E,provider:'retired'},
  {id:'bad_id',provider:'youtube'},{id:C,provider:'youtube'}
];
let pauseCount=0,destroyCount=0,rebuildCount=0;
const mediaMount={
  children:[{id:'originalYTFrame'}],
  replaceChildren(...items){this.children=items.slice()},
  appendChild(node){this.children.push(node)}
};
const rootClasses=new Set(),labels={
  backgroundModeLabel:{textContent:''},
  backgroundModeHint:{hidden:true}
};
const mockYT=()=>({
  getVideoData:()=>({video_id:A}),getCurrentTime:()=>192.9,
  pauseVideo:()=>{pauseCount++},destroy:()=>{destroyCount++}
});
const context=vm.createContext({
  navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/605.1.15',standalone:false,maxTouchPoints:5},
  window:{matchMedia:()=>({matches:false})},feedMetas:videoList,relatedMetas:[],
  autoplayNext:true,current:{id:A,label:'Bolero'},
  currentMeta:{id:A,title:'Bolero'},activePackageScope:'latest',
  ytPlayer:mockYT(),ytPlayerReady:true,pendingVideoId:'',
  embedMediaCore:mediaMount,backgroundModeBar:{hidden:true},
  root:{classList:{add:name=>rootClasses.add(name),remove:name=>rootClasses.delete(name)}},
  document:{
    getElementById:id=>labels[id]||null,
    createElement:tag=>({
      tagName:tag,id:'',src:'',attrs:{},setAttribute(k,v){this.attrs[k]=v}
    })
  },
  normalizedMediaProvider:value=>String(value||'youtube')==='youtube'?'youtube':'retired',
  location:{origin:'https://yt.taphoa.xyz',hash:'#/watch/'+A},
  URLSearchParams,ensureYoutubePlayer:()=>{rebuildCount++;return Promise.resolve(null)}
});
vm.runInContext('let backgroundNativeActive=false; let backgroundReturnPosition=null;\n'+html.slice(startMode,endMode),context);
assert.equal(context.isIOSSafariBackgroundTab(),true,'Safari tab supports opt-in');
assert.deepEqual(Array.from(context.backgroundQueueForVideo(A,videoList,true,12)),[B,C],
  'ordered, de-duplicated, no LIVE/non-YouTube/bad IDs');
assert.deepEqual(Array.from(context.backgroundQueueForVideo(A,videoList,false,12)),[],
  'auto-next OFF: no playlist');
assert.deepEqual(Array.from(context.backgroundQueueForVideo(A,videoList,true,1)),[B],
  'queue cap');
assert.deepEqual(Array.from(context.backgroundQueueForVideo(C,videoList,true,12)),[],
  'no next from last video');
const payload=context.backgroundWatchPayload();
assert.equal(payload.id,A);
assert.equal(payload.seconds,192);
assert.deepEqual(Array.from(payload.next),[B,C]);
const u=new URL(context.nativeBackgroundEmbedUrl(payload));
assert.equal(u.origin,'https://www.youtube-nocookie.com');
assert.equal(u.pathname,'/embed/'+A);
assert.equal(u.searchParams.get('start'),'192');
assert.equal(u.searchParams.get('playlist'),B+','+C);
assert.equal(u.searchParams.get('playsinline'),'0');
assert.equal(u.searchParams.get('autoplay'),'0');
assert.equal(context.enterBackgroundNativeMode(),true,'Safari mode enters in-place');
assert.equal(pauseCount,1);
assert.equal(destroyCount,1);
assert.equal(mediaMount.children.length,1,'one active native iframe, normal player removed');
assert.equal(mediaMount.children[0].id,'backgroundNativeFrame');
assert.equal(mediaMount.children[0].src,u.href);
assert.equal(context.ytPlayer,null);
assert(rootClasses.has('background-native'));
assert.equal(labels.backgroundModeLabel.textContent,'Trở lại xem');
assert.equal(labels.backgroundModeHint.hidden,false);
assert.equal(context.location.hash,'#/watch/'+A,'watch route remains unchanged');
assert.equal(context.enterBackgroundNativeMode(),true,'second click while active must not load another iframe');
assert.equal(destroyCount,1,'no redundant media destruction');
assert.equal(context.exitBackgroundNativeMode({restore:true}),true);
assert.equal(mediaMount.children.length,1);
assert.equal(mediaMount.children[0].id,'videoFrame','restore original normal player mount');
assert(!rootClasses.has('background-native'));
assert.equal(labels.backgroundModeLabel.textContent,'Chạy nền');
assert.equal(rebuildCount,1,'return creates only one API player');
assert.equal(vm.runInContext('backgroundReturnPosition.id',context),A);
assert.equal(vm.runInContext('backgroundReturnPosition.seconds',context),192);
assert.equal(context.enterBackgroundNativeMode(),true);
assert.equal(context.exitBackgroundNativeMode({restore:false}),true,
  'switching to another video exits native mode with no auto-reload');
assert.equal(rebuildCount,1,'new selected video owner will recreate regular player');
assert.equal(vm.runInContext('backgroundReturnPosition',context),null);
context.ytPlayer={getVideoData:()=>({video_id:B}),getCurrentTime:()=>300};
assert.equal(context.backgroundWatchPayload().seconds,0,'never reuse time of another video');
context.autoplayNext=false;
assert.deepEqual(Array.from(context.backgroundWatchPayload().next),[],
  'off toggle respected in native playlist');
context.navigator.standalone=true;
assert.equal(context.isIOSSafariBackgroundTab(),false,'PWA does not promise system PiP');
context.navigator.standalone=false;
context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS Safari/604.1';
assert.equal(context.isIOSSafariBackgroundTab(),false,'Chrome iOS does not get Safari-specific mode');
context.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/605.1.15';
context.currentMeta={id:A,title:'Live stream',isLive:true};
assert.equal(context.backgroundWatchPayload(),null,'LIVE is excluded');

console.log('1988 desktop search and mobile next autoplay PASS');
