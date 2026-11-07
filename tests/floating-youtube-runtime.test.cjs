'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('sources/floating-youtube.html','utf8');
const code=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert(code,'execute the real floating YouTube host inline script');

function boot(query){
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id))nodes.set(id,{hidden:id==='tap-play'||id==='error',events:{},
   addEventListener(name,fn){this.events[name]=fn;}});
  return nodes.get(id);
 }
 const messages=[],scripts=[],styles=[];
 const location={search:query,origin:'https://yt.taphoa.xyz'};
 const document={
  documentElement:{style:{setProperty(...args){styles.push(args)}}},
  getElementById:node,
  createElement(tag){return {tag};},
  head:{appendChild(script){scripts.push(script)}}
 };
 const ctx={URLSearchParams,location,document,
  parent:{postMessage(message,origin){messages.push({message,origin})}},
  window:{},YT:{PlayerState:{PLAYING:1}}};
 vm.runInNewContext(code,ctx,{timeout:1000});
 return {ctx,nodes,messages,scripts,styles,node};
}

test('invalid ID never loads the YouTube API or starts media',()=>{
 const app=boot('?v=not-a-video-id');
 assert.equal(app.scripts.length,0);
 assert.equal(app.node('error').hidden,false);
 assert.equal(app.messages[0].message.code,'invalid-video-id');
 assert.equal(app.messages[0].origin,'https://yt.taphoa.xyz');
});

test('portrait crop, bounded playback position and one selected video',()=>{
 const app=boot('?v=jfKfPfyJRdk&t=999999&shape=portrait');
 assert.deepEqual(Array.from(app.styles[0]),['--rail-black','59px']);
 assert.equal(app.scripts.length,1);
 assert.equal(app.scripts[0].src,'https://www.youtube.com/iframe_api');
 let config,playCount=0,paused=0;
 const player={
  playVideo(){playCount++},
  pauseVideo(){paused++},
  getVideoData(){return {video_id:'jfKfPfyJRdk'}},
  getIframe(){return {setAttribute(){}}}
 };
 app.ctx.YT.Player=function(id,opts){assert.equal(id,'player');config=opts;return player};
 app.ctx.window.onYouTubeIframeAPIReady();
 assert.equal(config.videoId,'jfKfPfyJRdk');
 assert.equal(config.playerVars.start,86400);
 assert.equal(config.playerVars.loop,0);
 assert.equal(config.playerVars.playlist,undefined);
 config.events.onReady({target:player});
 assert.equal(playCount,1,'one best-effort autoplay');
 config.events.onAutoplayBlocked();
 assert.equal(app.node('tap-play').hidden,false,'blocked autoplay exposes manual action');
 app.node('tap-play').events.click();
 assert.equal(playCount,2,'manual action directly invokes the existing player');
 config.events.onStateChange({data:1,target:player});
 assert.equal(app.node('tap-play').hidden,true);
 assert.equal(paused,0);
 assert.equal(app.messages.at(-1).message.state,'playing');
});

test('confirmed video mismatch stops playback and reports error',()=>{
 const app=boot('?v=jfKfPfyJRdk');
 let config,paused=0;
 app.ctx.YT.Player=function(id,opts){config=opts;return {}};
 app.ctx.window.onYouTubeIframeAPIReady();
 config.events.onStateChange({data:1,target:{
  getVideoData(){return {video_id:'AAAAAAAAAAA'}},
  pauseVideo(){paused++}
 }});
 assert.equal(paused,1);
 assert.equal(app.node('error').hidden,false);
 assert.equal(app.messages.at(-1).message.code,'video-id-mismatch');
});

test('empty early metadata does not reject valid playback',()=>{
 const app=boot('?v=jfKfPfyJRdk');
 let config;
 app.ctx.YT.Player=function(id,opts){config=opts;return {}};
 app.ctx.window.onYouTubeIframeAPIReady();
 config.events.onStateChange({data:1,target:{getVideoData(){return {video_id:''}}}});
 assert.equal(app.node('error').hidden,true);
 assert.equal(app.messages.at(-1).message.state,'playing');
});

test('YouTube API loading failure is visible and bounded',()=>{
 const app=boot('?v=jfKfPfyJRdk&t=-4');
 assert.equal(app.scripts.length,1);
 app.scripts[0].onerror();
 assert.equal(app.node('error').hidden,false);
 assert.equal(app.messages.at(-1).message.code,'api-load');
});

test('player construction failure reports a bounded error without starting playback',()=>{
 const app=boot('?v=jfKfPfyJRdk');
 app.ctx.YT.Player=function(){throw new Error('simulated constructor failure')};
 app.ctx.window.onYouTubeIframeAPIReady();
 assert.equal(app.node('error').hidden,false);
 assert.equal(app.node('tap-play').hidden,true);
 assert.equal(app.messages.at(-1).message.code,'player-create');
 assert.equal(app.messages.at(-1).message.state,'error');
});

test('YouTube playback error hides the manual overlay and reports the error',()=>{
 const app=boot('?v=jfKfPfyJRdk');
 let config;
 app.ctx.YT.Player=function(id,opts){config=opts;return {}};
 app.ctx.window.onYouTubeIframeAPIReady();
 config.events.onAutoplayBlocked();
 assert.equal(app.node('tap-play').hidden,false);
 config.events.onError({data:153});
 assert.equal(app.node('error').hidden,false);
 assert.equal(app.node('tap-play').hidden,true);
 assert.equal(app.messages.at(-1).message.code,'153');
 assert.equal(app.messages.at(-1).message.state,'error');
});
