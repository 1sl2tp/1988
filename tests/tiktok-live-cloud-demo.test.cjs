'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','tiktok_play','bhwa_get']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/body\.play\|\|body\.hdplay/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/www\.tiktok\.com\/node\/share\/video\//);
assert.match(demo,/videoNode\.playAddr/);
assert.match(demo,/bitrateInfo/);
assert.match(demo,/TikTok PlayAddr bị chặn\/CORS/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/CÓ THỂ WATERMARK/);
assert.match(demo,/có thể watermark/);

assert.doesNotMatch(demo,/downloader-api\.bhwa233\.com\/api\/play\?url=/);
assert.doesNotMatch(demo,/void-fetch\.vercel\.app\/vi\/play\?play=/);
assert.match(demo,/video\.src=direct/);

console.log('tiktok demo TikWM + browser-direct TikTok playAddr + Bhwa watermark fallback contract ok');
