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
assert(html.includes('if(backgroundNativeActive||floatingPipWindow||floatingPipPending)return null;'),
  'late YouTube iframe-api initialization cannot create a second player');
assert(html.includes('if(backgroundNativeActive||floatingPipWindow||floatingPipPending||event.target!==ytPlayer)return;'),
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

// macOS/Windows Chrome real browser Document PiP: one floating iframe, no fake CSS.
assert(html.includes('id="floatingModeButton"')&&html.includes('data-info-action="floating-pip"'),
  'real floating PiP is a distinct opt-in action from iPhone Chạy nền');
assert(html.includes('window.documentPictureInPicture.requestWindow('),
  'floating PiP must invoke the browser always-on-top window API');
assert(html.includes('if(floatingPipWindow||floatingPipPending)exitFloatingPipWindow({restore:false});'),
  'selecting another video closes the old floating iframe first');
assert(html.includes('if(backgroundNativeActive||floatingPipWindow||floatingPipPending)return null;'),
  'late YouTube iframe API cannot make a second player');
assert(!html.includes('window.open('),'never mimic topmost PiP using an ordinary web popup');
const floatingHostHtml=fs.readFileSync('sources/floating-youtube.html','utf8');
assert(floatingHostHtml.includes('<meta name="referrer" content="strict-origin-when-cross-origin">'),
  'HTTPS YouTube wrapper must send real origin Referer to avoid observed error 153');
assert(floatingHostHtml.includes("host:'https://www.youtube-nocookie.com'"),
  'only official YouTube IFrame API owns one media stream in HTTPS host');
assert(floatingHostHtml.includes("script.src='https://www.youtube.com/iframe_api'"),
  'official iframe API is needed for error 153 callback and recovery');
assert(floatingHostHtml.includes("onError:function(event){fail("),
  'wrapper detects YouTube error 153 and notifies parent');
assert(floatingHostHtml.includes("origin:location.origin"),
  'wrapper identifies HTTPS origin to YouTube API');
assert(!/<iframe\\b/i.test(floatingHostHtml),
  'wrapper creates the sole YouTube player through the API');
assert(html.includes('const url=new URL("/sources/floating-youtube.html",location.origin)'),
  'Document PiP must load HTTPS same-origin wrapper, not directly embed YouTube from about:blank');
assert(html.includes('event.origin!==location.origin'),
  'error message from wrapper must validate the HTTPS sender origin');
assert(html.includes('event.source!==iframe.contentWindow'),
  'ignore forged iframe error messages from other windows');
assert(!html.includes('.floating-toolbar')&&!html.includes('close.textContent="Trở lại xem"'),
  'browser titlebar already has return/close: no duplicate HTML toolbar');
assert(html.includes('floatingModeBar.hidden=!supportsFloatingPip()||!!floatingPipWindow'),
  'hide duplicate main Watch return button while native floating PiP is open');
assert(html.includes('floatingPipDimensions()'),
  'PiP initial width and height derive from the selected video aspect');
assert(floatingHostHtml.includes('id="tap-play"')&&floatingHostHtml.includes('aria-label="Phát video trong cửa sổ nổi"'),
  'one compact manual Play fallback inside the HTTPS player host');
assert(floatingHostHtml.includes("onAutoplayBlocked:function(){"),
  'show Play fallback only when browser blocks autoplay');
assert(floatingHostHtml.includes('<div id="media-viewport"><div id="player"></div></div>'),
  'host must crop source iframe through one black media viewport, not draw over the video');
assert(floatingHostHtml.includes('top:calc(0px - var(--rail-black))!important')&&
  floatingHostHtml.includes('height:calc(100% + var(--rail-black) + var(--rail-black))!important'),
  'floating YouTube source must use the same upper/lower Rail offset as MAIN');
assert(html.includes('--rail-black-landscape:65px')&&html.includes('--rail-black-portrait:59px'),
  'MAIN still owns the trusted Rail dimensions');
assert(floatingHostHtml.includes("qs.get('shape')==='portrait'?'59px':'65px'"),
  'floating Rail must use 59px portrait and 65px landscape, same as MAIN');
assert(!floatingHostHtml.includes('#player iframe{'),
  'YT.Player replaces the #player node with an iframe, so a child selector is ineffective');
assert(floatingHostHtml.includes('playButton.addEventListener(\'click\''),
  'only one direct click to retry YouTube play with user activation');
async function verifyDesktopFloating(){
  const node=(tag)=>({
    tagName:tag,id:'',src:'',children:[],attrs:{},listeners:{},contentWindow:{},
    setAttribute(key,val){this.attrs[key]=val},
    append(...children){this.children.push(...children)},
    appendChild(child){this.children.push(child)},
    replaceChildren(...children){this.children=children},
    addEventListener(event,callback){this.listeners[event]=callback}
  });
  const mainMount=node('div');mainMount.children=[{id:'original-api-iframe'}];
  let req=0,pauses=0,destroys=0,restores=0;
  const requestedSizes=[];
  const windows=[];
  const floatingAPI={async requestWindow(size){
    requestedSizes.push(size);
    req++;
    const w={document:{title:'',head:node('head'),body:node('body'),createElement:node},
      closed:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn},
      close(){if(this.closed)return;this.closed=true;this.listeners.pagehide?.()}};
    windows.push(w);return w;
  }};
  const browser={documentPictureInPicture:floatingAPI};
  browser.top=browser;
  const tags={
    floatingModeLabel:{textContent:''},
    floatingModeHint:{textContent:''},
    floatingModeButton:{disabled:false},
    backgroundModeLabel:{textContent:''},
    backgroundModeHint:{hidden:true}
  };
  const newPlayer=()=>({
    getVideoData:()=>({video_id:A}),getCurrentTime:()=>101.9,
    pauseVideo(){pauses++},destroy(){destroys++}
  });
  const ff=vm.createContext({
    navigator:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14) AppleWebKit/537.36 Chrome/130 Safari/537.36',maxTouchPoints:0},
    window:browser,
    document:{createElement:node,getElementById:id=>tags[id]||null},
    location:{origin:'https://yt.taphoa.xyz',hash:'#/watch/'+A},
    current:{id:A,label:'Bolero'},
    currentMeta:{id:A,title:'Liên khúc Bolero'},
    activePackageScope:'latest',feedMetas:videoList,relatedMetas:[],
    autoplayNext:true,ytPlayer:newPlayer(),ytPlayerReady:true,pendingVideoId:'',
    embedMediaCore:mainMount,backgroundModeBar:{hidden:true},
    floatingModeBar:{hidden:true},floatingModeHint:tags.floatingModeHint,
    normalizedMediaProvider:value=>String(value||'youtube')==='youtube'?'youtube':'retired',
    root:{classList:{add(){},remove(){}}},URLSearchParams,URL,
    ensureYoutubePlayer:()=>{restores++;return Promise.resolve(null)}
  });
  vm.runInContext(
    'let backgroundNativeActive=false,backgroundReturnPosition=null;'+
    'let floatingPipWindow=null,floatingPipPending=false,floatingPipSequence=0,floatingReturnPosition=null;\n'+
    html.slice(startMode,endMode),ff
  );
  assert.equal(ff.supportsFloatingPip(),true,'Chrome Mac has real OS-level document PiP');
  ff.syncFloatingPipButton();
  assert.equal(ff.floatingModeBar.hidden,false);
  assert.equal(tags.floatingModeLabel.textContent,'Xem nổi');
  const url=new URL(ff.floatingEmbedUrl(ff.backgroundWatchPayload()));
  assert.equal(url.origin,'https://yt.taphoa.xyz');
  assert.equal(url.pathname,'/sources/floating-youtube.html');
  assert.equal(url.searchParams.get('v'),A);
  assert.equal(url.searchParams.get('t'),'101');
  assert.equal(url.searchParams.get('next'),null,'PiP must never hand off the selected video to a queue');
  assert.equal(url.searchParams.get('shape'),'landscape','landscape floating rail uses 65px');
  assert.equal(url.searchParams.get('rail'),'20261015','host markup cache must refresh');
  const opening=ff.enterFloatingPipWindow();
  assert.equal(req,1,'requestWindow is synchronous with user click');
  assert.deepEqual({...requestedSizes[0]},{width:480,height:305},
    '16:9 initial PiP reserves Chrome titlebar and 6px black edge on all sides');
  assert.equal(pauses,0,'old iframe plays while waiting for browser permission');
  await opening;
  assert.equal(pauses,1);
  assert.equal(destroys,1);
  assert.equal(mainMount.children.length,0,'original API iframe unmounted');
  const w=windows[0];
  assert.equal(w.document.body.children.length,1);
  assert.equal(w.document.body.children[0].className,'floating-media',
    'only one full-size video mount, no duplicate title/return toolbar');
  const piPStyle=w.document.head.children[0].textContent;
  assert(piPStyle.includes('body{padding:6px}'),
    'exact 6px black inset keeps floating media off window edges');
  assert(piPStyle.includes('border-radius:10px;background:#000'),
    'round 10px stage corners against pure-black gutter');
  assert(piPStyle.includes('overflow:hidden;border-radius:10px'),
    'stage CLIPS the iframe at all four rounded corners');
  assert(piPStyle.includes('display:block;border:0;background:#000'),
    'no iframe default border or seam; no crop/zoom applied to video');
  assert(!piPStyle.includes('object-fit:cover')&&!piPStyle.includes('transform:scale'),
    'YouTube video keeps its native aspect rather than being cropped');
  assert.equal(w.document.body.children[0].children.length,1);
  const floatingFrame=w.document.body.children[0].children[0];
  assert.equal(floatingFrame.src,url.href,'only one YouTube embed is mounted inside PiP');
  assert.equal(ff.location.hash,'#/watch/'+A,'main Watch URL is unchanged');
  assert.equal(ff.floatingModeBar.hidden,true,
    'main page does not show a redundant return button while PiP exists');
  w.listeners.message({origin:'https://malicious.example',source:floatingFrame.contentWindow,
    data:{source:'yt1988-floating-youtube',state:'error',code:'153'}});
  assert.equal(w.closed,false,'reject forged third-party error even with matching iframe source');
  w.listeners.message({origin:'https://yt.taphoa.xyz',source:{},
    data:{source:'yt1988-floating-youtube',state:'error',code:'153'}});
  assert.equal(w.closed,false,'reject messages from unrelated same-origin windows');
  w.listeners.message({origin:'https://yt.taphoa.xyz',source:floatingFrame.contentWindow,
    data:{source:'yt1988-floating-youtube',state:'autoplay-blocked',code:''}});
  assert.equal(tags.floatingModeHint.textContent,'',
    'autoplay guidance belongs inside floating video rather than Watch');
  assert.equal(w.closed,false,'autoplay denial is not a fatal player error');
  assert.equal(await ff.enterFloatingPipWindow(),false,'no duplicate PiP windows');
  w.close(); // Browser X / return-to-tab button
  assert.equal(mainMount.children.length,1);
  assert.equal(mainMount.children[0].id,'videoFrame','Watch iframe mount is restored on PiP close');
  assert.equal(restores,1,'normal Watch rebuilt exactly once');
  assert.equal(vm.runInContext('floatingReturnPosition.seconds',ff),101);
  assert.equal(tags.floatingModeLabel.textContent,'Xem nổi');
  ff.ytPlayer=newPlayer();
  await ff.enterFloatingPipWindow();
  assert.equal(req,2);
  assert.equal(ff.exitFloatingPipWindow({restore:false}),true,'card selection can close PiP without old video');
  assert.equal(restores,1,'no double play when switching to a different card');
  assert.equal(vm.runInContext('floatingReturnPosition',ff),null);
  // YouTube player failure from the HTTPS host auto-closes floating window
  // and restores the original Watch instead of leaving a black rectangle.
  ff.ytPlayer=newPlayer();
  await ff.enterFloatingPipWindow();
  assert.equal(req,3);
  const broken=windows[2];
  const brokenFrame=broken.document.body.children[0].children[0];
  broken.listeners.message({origin:'https://yt.taphoa.xyz',source:brokenFrame.contentWindow,
    data:{source:'yt1988-floating-youtube',state:'error',code:'153'}});
  assert.equal(broken.closed,true,'error 153 closes failed Document PiP automatically');
  assert.equal(mainMount.children[0].id,'videoFrame','main player mount rebuilt after error 153');
  assert.equal(restores,2,'error restores normal Watch exactly once');
  assert.match(tags.floatingModeHint.textContent,/153/);
  // Native aspect contract: portrait starts tall; landscape starts at 16:9.
  ff.current.kind='portrait';
  ff.current.detectedRatio=9/16;
  assert.deepEqual({...ff.floatingPipDimensions()},{width:330,height:607});
  assert.equal(new URL(ff.floatingEmbedUrl(ff.backgroundWatchPayload())).searchParams.get('shape'),'portrait',
    'portrait requests compact 59px Rail mask without a second player');
  ff.current.kind='landscape';
  ff.current.detectedRatio=16/9;
  // API denial leaves the original playing and no fake floating window.
  ff.ytPlayer=newPlayer();
  browser.documentPictureInPicture={requestWindow(){req++;return Promise.reject(new Error('NotAllowedError'))}};
  const beforePause=pauses,beforeDestroy=destroys;
  assert.equal(await ff.enterFloatingPipWindow(),false);
  assert.equal(pauses,beforePause);assert.equal(destroys,beforeDestroy);
  assert.match(tags.floatingModeHint.textContent,/chưa cho phép/);

  const hostScript=floatingHostHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(hostScript,'HTTPS wrapper has deterministic inline setup');
  assert.doesNotThrow(()=>new vm.Script(hostScript),'wrapper JS must be syntactically valid');
  const messages=[];
  let playerSpec=null;
  let playerPlayCalls=0;
  const fallbackPlay={hidden:true,callbacks:{},
    addEventListener(name,fn){this.callbacks[name]=fn}};
  const hostScriptNode={src:'',referrerPolicy:'',async:false,onerror:null};
  const hostCtx=vm.createContext({
    URLSearchParams,
    location:{origin:'https://yt.taphoa.xyz',search:'?v='+A+'&t=101&next='+B+','+B+','+C},
    document:{
      head:{appendChild:x=>{assert.equal(x,hostScriptNode)}},
      createElement:tag=>{assert.equal(tag,'script');return hostScriptNode},
      getElementById:id=>id==='error'?{hidden:true}:
        id==='tap-play'?fallbackPlay:null
    },
    parent:{postMessage:(data,to)=>messages.push({data,to})},
    window:{},
    YT:{
      PlayerState:{PLAYING:1},
      Player:function(mount,opts){playerSpec=opts;assert.equal(mount,'player')}
    }
  });
  vm.runInContext(hostScript,hostCtx);
  assert.equal(hostScriptNode.src,'https://www.youtube.com/iframe_api');
  assert.equal(hostScriptNode.referrerPolicy,'strict-origin-when-cross-origin');
  hostCtx.window.onYouTubeIframeAPIReady();
  assert.equal(playerSpec.videoId,A);
  assert.equal(playerSpec.playerVars.start,101);
  assert.equal(playerSpec.playerVars.playlist,undefined,'floating host ignores stale queue parameters');
  assert.equal(playerSpec.playerVars.autoplay,1);
  assert.equal(playerSpec.playerVars.playsinline,1);
  const hostPlayer={
    getIframe(){return {setAttribute(){}}},
    getVideoData(){return {video_id:A}},
    playVideo(){playerPlayCalls++}
  };
  playerSpec.events.onReady({target:hostPlayer});
  assert.equal(playerPlayCalls,1,
    'host makes one best-effort playVideo call on YouTube API ready');
  playerSpec.events.onAutoplayBlocked();
  assert.equal(fallbackPlay.hidden,false,
    'Chrome blocked autoplay: show just a central Play button in PiP');
  assert.equal(messages.at(-1).data.state,'autoplay-blocked');
  fallbackPlay.callbacks.click();
  assert.equal(playerPlayCalls,2,
    'clicking PiP overlay uses user gesture to retry play without timers');
  playerSpec.events.onStateChange({data:1,target:hostPlayer});
  assert.equal(messages.at(-1).data.videoId,A,'host carries exact selected-video identity');
  assert.equal(fallbackPlay.hidden,true,'hide manual Play overlay once video plays');
  playerSpec.events.onError({data:153});
  assert.deepEqual({...messages.at(-1).data},
    {source:'yt1988-floating-youtube',videoId:A,state:'error',code:'153'});
  assert.equal(messages.at(-1).to,'https://yt.taphoa.xyz','messages restricted to same-origin PiP');
  // Browser capability gates, preserving Safari/iPhone background mode.
  delete browser.documentPictureInPicture;
  assert.equal(ff.supportsFloatingPip(),false);
  ff.syncFloatingPipButton();
  assert.equal(ff.floatingModeBar.hidden,true,'unsupported browser must not show fake button');
  browser.documentPictureInPicture=floatingAPI;
  ff.navigator.userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 18) Safari/605';
  assert.equal(ff.supportsFloatingPip(),false,'Chrome-style float not shown on iPhone');
}
verifyDesktopFloating().then(()=>console.log('1988 desktop native floating PiP contracts PASS')).catch(error=>{
  console.error(error);process.exitCode=1;
});

console.log('1988 desktop search and mobile next autoplay PASS');
