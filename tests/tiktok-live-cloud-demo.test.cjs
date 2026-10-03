'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_get','bhwa_play','voidfetch']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/collectBhwaVideoCandidates/);
assert.match(demo,/Bhwa trả/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/play\?url=/);
assert.match(demo,/https:\/\/void-fetch\.vercel\.app\/vi\/play\?play=/);

assert.match(demo,/localStorage\.setItem\(vodLinkCacheKey/);
assert.match(demo,/localStorage\.getItem\(vodLinkCacheKey/);
assert.match(demo,/removeVodLinkCache/);
assert.doesNotMatch(demo,/VOD_LINK_CACHE_MS/);
assert.match(demo,/tự get lại 1 lần/);

assert.match(demo,/video\.src=direct/);
assert.doesNotMatch(demo,/clipx\.zamdev/);

console.log('tiktok demo persistent Bhwa getlink candidates + refresh-on-death contract ok');
