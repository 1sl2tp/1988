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
// Watch video stays flush LEFT and the rest flows to 1/2/3 recommendation
// columns. Verify geometry as well as CSS specificity (one-column lock
// previously overrode the dynamic --feed-cols grid).
const layoutStart=html.indexOf('  function watchColumnGeometry(');
const layoutEnd=html.indexOf('  function syncBoundaries(){',layoutStart);
assert(layoutStart>0&&layoutEnd>layoutStart,'watch geometry owner must exist');
const geometryContext=vm.createContext({});
vm.runInContext(html.slice(layoutStart,layoutEnd),geometryContext);
const geometry=geometryContext.watchColumnGeometry;
const cardStart=html.indexOf('  function chooseCardColumns(');
const cardEnd=html.indexOf('  // Watch: VIDEO LEFT',cardStart);
assert(cardStart>0&&cardEnd>cardStart,'existing feed card column calculation must exist');
vm.runInContext(html.slice(cardStart,cardEnd),geometryContext);
const cards=geometryContext.chooseCardColumns;
const columnCount=g=>Math.min(3,cards(g.feedW,16));
for(const kind of ['landscape','portrait']){
  const ratio=kind==='portrait'?9/16:16/9;
  for(const viewportW of [1000,1200,1440,1920,2560]){
    const fullH=620;
    const g=geometry(viewportW,fullH,ratio,kind);
    assert.equal(g.mediaPanelW+g.feedW+16,viewportW-48,'no centered/capped canvas or unused outer gutters');
    assert(g.feedW>=320,'right queue remains usable at desktop breakpoint');
    assert(g.playerW>0&&g.playerW<=g.mediaPanelW,'real video fits its left panel');
    assert(g.mediaPanelW-g.playerW<321,'portrait has only bounded metadata width, not a centered wide panel');
    assert(g.playerW/ratio<=fullH-(kind==='portrait'?140:98)+1,'video height keeps title/action reserve');
    assert(columnCount(g)>=1&&columnCount(g)<=3,'queue columns are 1-3');
  }
}
assert.equal(columnCount(geometry(1000,620,16/9,'landscape')),1,'narrow desktop queue gets one card');
assert.equal(columnCount(geometry(1920,620,16/9,'landscape')),2,'wide landscape queue gets two cards');
assert.equal(columnCount(geometry(2560,620,16/9,'landscape')),3,'ultrawide landscape queue gets three cards');
assert.equal(columnCount(geometry(1000,620,9/16,'portrait')),2,'portrait frees enough space for two cards');
assert.equal(columnCount(geometry(1440,620,9/16,'portrait')),3,'portrait wide queue can use three cards');
assert(!html.includes('html.two-col:not(.media-empty) main{'),'no centered/max-width watch canvas');
assert(html.includes('margin-inline:0!important;'),'desktop video anchors to left, not center');
assert(html.includes('html.two-col .info{\n  width:min(100%,max(320px,var(--two-col-player-w)));\n  margin-inline:0;'),'metadata follows left video');
assert(html.includes('grid-template-columns:repeat(var(--feed-cols),minmax(0,1fr))!important;'),'viewer active CSS must allow multiple queue columns');
assert(html.includes('setFeedColumnCount(Math.min(3,chooseCardColumns(geometry.feedW,cardGap)))'),'desktop watch queue uses existing dynamic card sizing');
assert(html.includes('grid-template-columns:var(--two-col-media-w) minmax(0,1fr);'),'left media plus remaining feed track');
console.log('1988 desktop search and mobile next autoplay PASS');
