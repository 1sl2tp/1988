'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_get','native','direct','tdown','musicaldown','tikdown','ttdownloader','tiklydown','douyinwtf']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.doesNotMatch(demo,/data-source="tiktok_play"/);
assert.doesNotMatch(demo,/TikTok PlayAddr/);
assert.doesNotMatch(demo,/node\/share\/video/);
assert.doesNotMatch(demo,/fetchTikTokPlayAddr/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/body\.play\|\|body\.hdplay/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/CÓ THỂ WATERMARK/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/const EDGE_VOD_SOURCES=new Set\(\["native","direct","tdown","musicaldown","tikdown","ttdownloader","tiklydown","douyinwtf"\]\)/);
assert.match(demo,/EDGE\+"\/tiktok\/video-stream"/);
assert.match(demo,/endpoint\.searchParams\.set\("source",source\)/);

console.log('tiktok demo two samples + TikWM/Bhwa sources without PlayAddr contract ok');
