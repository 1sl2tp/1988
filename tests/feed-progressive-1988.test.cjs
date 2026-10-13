'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('  const FEED_VISIBLE_CHUNK=18;');
const end=html.indexOf('  function normalizedSearchQuery(value){',begin);
assert(begin>0&&end>begin,'one progressive feed owner');
const source=html.slice(begin,end);
assert(source.includes('feedVisibleLimit+FEED_VISIBLE_CHUNK'));
assert(source.includes('rows.insertAdjacentHTML("beforeend"'));
assert(source.includes('feedMode==="package"&&activePackageScope==="live"'));
assert(!/const renderLimit=[\s\S]{0,95}:18;/.test(source));
assert(!source.includes('fetch('),'scrolling must not fetch network/package');
class RowMock{
 constructor(){this.dataset={};this.count=0;this.writes=0;this.appends=0;this.marker=null;this.isConnected=true;}
 get innerHTML(){return this.html||'';}
 set innerHTML(value){this.html=value;this.writes++;this.count=(value.match(/data-card-id=/g)||[]).length;this.marker=null;}
 querySelector(selector){
  if(selector==='.row')return this.count?{}:null;
  if(selector==='[data-feed-load-more]')return this.marker;
  return null;
 }
 querySelectorAll(){return [];}
 appendChild(marker){this.marker=marker;marker.remove=()=>{if(this.marker===marker)this.marker=null;};}
 insertAdjacentHTML(_position,value){this.appends++;this.count+=(value.match(/data-card-id=/g)||[]).length;}
}
const rows=new RowMock(),observers=[];
class FakeIO{
 constructor(callback){this.callback=callback;observers.push(this);}
 observe(target){this.target=target;}
 disconnect(){this.target=null;}
 fire(){this.callback([{isIntersecting:true}]);}
}
const ctx={
 document:{hidden:false,getElementById:()=>rows,createElement:()=>({dataset:{},style:{},setAttribute(){}})},
 window:{IntersectionObserver:FakeIO},IntersectionObserver:FakeIO,
 normalizedMediaProvider:()=> 'youtube',
 feedMode:'package',activePackageScope:'latest',channelFeedSourceId:'',
 searchInput:{value:''},current:{id:'first'},
 feedMetas:Array.from({length:37},(_,i)=>({id:'video'+i,provider:'youtube'})),
 feedVisualSignature:cards=>cards.map(x=>x.id).join('|'),
 feedHeaderMarkup:()=>'<header></header>',
 cardMarkup:card=>'<article class="row" data-card-id="'+card.id+'"></article>',
 syncFeedHeader(){},rememberRenderedThumbs(){},rememberRenderedAvatars(){},
 restoreRenderedThumbs(){},restoreRenderedAvatars(){},observeRowThumbQuality(){},
 applyRenderedCardTints(){},primeVisibleLivePreviews(){},observeFeedMasonryRows(){},
 console
};
vm.createContext(ctx);vm.runInContext(source,ctx);
vm.runInContext('renderSampleContent()',ctx);
assert.equal(rows.count,18);
assert.equal(rows.writes,1);
assert(rows.marker,'more marker should exist');
observers[0].fire();
assert.equal(rows.count,36,'first scroll appends next 18 locally');
assert.equal(rows.writes,1,'scroll must preserve existing DOM/player anchors');
assert.equal(rows.appends,1);
observers[0].fire();
assert.equal(rows.count,37);
assert.equal(rows.writes,1);
assert.equal(rows.marker,null,'exhausted list has no marker');
ctx.activePackageScope='week';
vm.runInContext('renderSampleContent()',ctx);
assert.equal(rows.count,18,'new scope starts from first chunk');
ctx.activePackageScope='live';
vm.runInContext('renderSampleContent()',ctx);
assert.equal(rows.count,37,'LIVE never paginated');
assert.equal(rows.marker,null);
console.log('1988 progressive feed: 18+18+1, cache-only, scope reset, LIVE unbounded PASS');
