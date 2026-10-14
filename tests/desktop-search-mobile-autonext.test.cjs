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
const count=geometryContext.chooseWatchQueueColumns;
for(const [queueWidth,expected] of [[320,1],[560,1],[679,1],[680,2],[1079,2],[1080,3],[1712,3],[3000,3]]){
  assert.equal(count(queueWidth,16),expected,'queue column threshold '+queueWidth);
}
for(const kind of ['landscape','portrait']){
  const ratio=kind==='portrait'?9/16:16/9;
  for(const viewportW of [1000,1200,1440,1920,2560]){
    const fullH=620;
    const g=geometry(viewportW,fullH,ratio,kind);
    assert.equal(g.mediaPanelW+g.feedW+16,viewportW-48,'no centered/capped canvas');
    assert(g.feedW>=320,'desktop always preserves a usable next-queue');
    assert(g.playerW>0&&g.playerW<=g.mediaPanelW,'real-ratio video fits left media panel');
    assert(g.mediaPanelW-g.playerW<321,'portrait metadata panel remains compact');
    assert(g.playerW/ratio<=fullH-(kind==='portrait'?140:98)+1,'title/actions remain visible');
    const cols=count(g.feedW,16);
    assert(cols>=1&&cols<=3,'watch only 1-3 columns');
    assert((g.feedW-16*(cols-1))/cols>=300,'minimum thumbnail card 300px before cap');
  }
}
assert.equal(count(geometry(1000,620,16/9,'landscape').feedW,16),1);
assert.equal(count(geometry(1920,620,16/9,'landscape').feedW,16),2);
assert.equal(count(geometry(2560,620,16/9,'landscape').feedW,16),3);
assert.equal(count(geometry(1000,620,9/16,'portrait').feedW,16),1);
assert.equal(count(geometry(1200,620,9/16,'portrait').feedW,16),2);
assert.equal(count(geometry(1440,620,9/16,'portrait').feedW,16),2);
assert.equal(count(geometry(1920,620,9/16,'portrait').feedW,16),3);
assert.equal(cards(1700,16),4,'ordinary browse still permits four columns');
assert(!html.includes('html.two-col:not(.media-empty) main{'),'no centered/max-width watch canvas');
assert(html.includes('margin-inline:0!important;'),'desktop video anchors to left, not center');
assert(html.includes('html.two-col .info{\n  width:min(100%,max(320px,var(--two-col-player-w)));\n  margin-inline:0;'),'metadata follows left video');
assert(html.includes('grid-template-columns:repeat(var(--feed-cols),minmax(0,1fr))!important;'),'viewer active CSS must allow multiple queue columns');
assert(html.includes('setFeedColumnCount(chooseWatchQueueColumns(geometry.feedW,cardGap))'),'watch queue uses remaining-width-only thresholds');
assert(html.includes('grid-template-columns:var(--two-col-media-w) minmax(0,1fr);'),'left media plus remaining feed track');
assert(html.includes('html.viewer-active.two-col[data-feed-cols="1"] .rows{max-width:560px}'),'single next card is capped to 560px');
assert(html.includes('html.viewer-active.two-col[data-feed-cols="2"] .rows{max-width:1136px}'),'two next cards are capped to 560px each');
assert(html.includes('max-width:1712px;'),'three next cards are capped to 560px each');
assert(html.includes('html.viewer-active.one-col .rows{'),'mobile Watch still renders a single queue below the player');

console.log('1988 desktop search and mobile next autoplay PASS');
