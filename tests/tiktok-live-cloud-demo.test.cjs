'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_get']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}
assert.doesNotMatch(demo,/data-source="bhwa_play"/);
assert.doesNotMatch(demo,/data-source="voidfetch"/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/body\.play\|\|body\.hdplay/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/collectBhwaVideoCandidates/);
assert.match(demo,/BHWA DIRECT/);

assert.doesNotMatch(demo,/downloader-api\.bhwa233\.com\/api\/play\?url=/);
assert.doesNotMatch(demo,/void-fetch\.vercel\.app\/vi\/play\?play=/);

assert.match(demo,/localStorage\.setItem\(vodLinkCacheKey/);
assert.match(demo,/removeVodLinkCache/);
assert.match(demo,/tự get lại 1 lần/);
assert.match(demo,/video\.src=direct/);

console.log('tiktok demo direct-only TikWM + Bhwa parse contract ok');
