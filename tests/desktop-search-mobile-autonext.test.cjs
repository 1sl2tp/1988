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
// Desktop watch geometry: a bounded queue alongside a separate true-ratio
// player, not a portrait-width column with an oversized recommendations list.
const layoutStart=html.indexOf('  function watchColumnGeometry(');
const layoutEnd=html.indexOf('  function syncBoundaries(){',layoutStart);
assert(layoutStart>0&&layoutEnd>layoutStart,'watch geometry owner must exist');
const geometrySource=html.slice(layoutStart,layoutEnd);
const geometryContext=vm.createContext({});
vm.runInContext(geometrySource,geometryContext);
const geometry=geometryContext.watchColumnGeometry;
for(const kind of ['landscape','portrait']){
  const ratio=kind==='portrait'?9/16:16/9;
  for(const viewportW of [1000,1200,1440,1920,2560]){
    const fullH=620;
    const measured=geometry(viewportW,fullH,ratio,kind);
    const canvasW=Math.min(viewportW,kind==='portrait'?1260:1680);
    assert.equal(measured.mediaPanelW+measured.feedW+16,canvasW-48,'panel + queue + gutters fit centered canvas');
    assert(measured.feedW>=340&&measured.feedW<=520,'queue has minimum and maximum width');
    assert(measured.playerW>0&&measured.playerW<=measured.mediaPanelW,'real player fits in media panel');
    assert(measured.playerW/ratio<=fullH-(kind==='portrait'?140:98)+1,'video leaves room for title and actions');
    if(viewportW>=1920)assert(measured.feedW<measured.mediaPanelW,'wide screen must prioritize playback');
  }
}
assert(html.includes('html.two-col:not(.media-empty).portrait main{'),'portrait canvas must be bounded');
assert(html.includes('width:min(100%,var(--two-col-player-w))!important;'),'player must not fill entire portrait media panel');
assert(html.includes('width:min(100%,max(420px,var(--two-col-player-w)));'),'video metadata has a readable centered width');
assert(html.includes('grid-template-columns:var(--two-col-media-w) minmax(0,1fr);'),'watch queue uses the separate panel width');
console.log('1988 desktop search and mobile next autoplay PASS');
