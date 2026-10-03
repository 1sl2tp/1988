'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','bhwa_get']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}
for(const source of ['tikwm_std','native','direct','tdown','musicaldown','tikdown','ttdownloader','tiklydown','douyinwtf']){
  assert.doesNotMatch(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);

assert.match(demo,/href="https:\/\/www\.tikwm\.com\/"/);
assert.match(demo,/href="https:\/\/downloader-api\.bhwa233\.com\/"/);

assert.doesNotMatch(demo,/tdownv4\.sl-bjs\.workers\.dev/);
assert.doesNotMatch(demo,/\/tiktok\/video-resolve/);
assert.match(demo,/video\.src=direct/);

console.log('tiktok demo keeps only original TikWM HD + BHWA VOD sources');
