'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/data-source="tikwm"/);
assert.match(demo,/data-source="clipx"/);
assert.match(demo,/data-source="bhwa"/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/https:\/\/clipx\.zamdev\.workers\.dev\/\?url=/);
assert.match(demo,/hd_mp4/);
assert.match(demo,/standard_mp4/);
assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/originDownloadVideoUrl/);

assert.match(demo,/pickJsonVideoUrl/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/GET LINK LỖI/);

assert.doesNotMatch(demo,/ssstik\.vn/);
assert.doesNotMatch(demo,/vn\.snaptik\.com/);
assert.doesNotMatch(demo,/\/tiktok\/video-link\?user=/);
assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);

console.log('tiktok demo browser-direct TikWM ClipX Bhwa contract ok');
