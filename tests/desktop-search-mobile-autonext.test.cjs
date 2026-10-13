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
console.log('1988 desktop search and mobile next autoplay PASS');
