'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/7691953502813293832/);
assert.match(demo,/7687601468794277128/);

assert.match(demo,/data-mode="auto"/);
assert.match(demo,/data-mode="media"/);
assert.match(demo,/data-mode="iframe"/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/https:\/\/tdownv4\.sl-bjs\.workers\.dev\/\?down=/);
assert.match(demo,/resolveVodDirect\(item,source\)/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/VOD_LINK_CACHE_MS=5\*60_000/);

assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);
assert.doesNotMatch(demo,/one988-tiktok-session\.onrender\.com/);

assert.match(demo,/\/refresh\?user=/);
assert.match(demo,/LIVE_CACHE_MS=60_000/);

console.log('tiktok demo direct TikWM/TDown links + direct LIVE contract ok');
