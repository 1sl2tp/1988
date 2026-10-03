'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','bhwa_get']) assert.match(demo,new RegExp('data-source="'+source+'"'));
for(const source of ['tikwm_std','tdown','ttdownloader','musicaldown','tikdown','tiklydown','douyinwtf','native','direct']) {
  assert.doesNotMatch(demo,new RegExp('data-source="'+source+'"'));
}

assert.doesNotMatch(demo,/onrender\.com/);
assert.doesNotMatch(demo,/TIKWM_POSTS_API/);
assert.match(demo,/const CHANNEL_VIDEOS_API=EDGE\+"\/tiktok\/channel-videos"/);
assert.match(demo,/endpoint\.searchParams\.set\("user",h\)/);
assert.match(demo,/endpoint\.searchParams\.set\("count","5"\)/);
assert.match(demo,/data\?\.ok!==true/);
assert.match(demo,/Array\.isArray\(data\?\.videos\)/);
assert.match(demo,/\.slice\(0,5\)/);

assert.match(demo,/EDGE\+"\/refresh\?user="/);
assert.match(demo,/async function loadLiveNow\(h,\{force=false\}=\{\}\)/);
assert.match(demo,/const videoTask=loadLatestFive\(h\)/);
assert.match(demo,/const liveTask=loadLiveNow\(h,\{force\}\)/);
assert.match(demo,/Promise\.allSettled\(\[videoTask,liveTask\]\)/);

assert.match(demo,/async function resolveHandleFromInput\(raw\)/);
assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);

assert.match(demo,/source:"tikwm_hd",autoFallback:true/);
assert.match(demo,/source:"bhwa_get",force:true/);
assert.match(demo,/if\(force\)removeLiveCache\(h\)/);
assert.match(demo,/if\(force&&playable\)playLive\(liveItem\)/);

console.log('tiktok demo: no Render, latest-five via edge TikWM metadata, live via refresh, VOD TikWM/BHWA');
