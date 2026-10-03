'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_play','voidfetch']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/body\.play\|\|body\.hdplay/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/play\?url=/);
assert.match(demo,/&type=video/);

assert.match(demo,/https:\/\/void-fetch\.vercel\.app\/vi\/play\?play=/);
assert.match(demo,/playVodVoidFetch/);

assert.doesNotMatch(demo,/clipx\.zamdev/);
assert.doesNotMatch(demo,/data-source="clipx"/);
assert.doesNotMatch(demo,/ssstik\.vn/);
assert.doesNotMatch(demo,/vn\.snaptik\.com/);

assert.match(demo,/video\.src=direct/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/GET LINK LỖI/);

console.log('tiktok demo TikWM no-watermark + Bhwa Play + VoidFetch Player contract ok');
