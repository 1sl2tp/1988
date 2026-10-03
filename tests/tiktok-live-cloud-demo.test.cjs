'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/id="input"/);
assert.match(demo,/7691953502813293832/);
assert.match(demo,/7687601468794277128/);

assert.match(demo,/data-mode="auto"/);
assert.match(demo,/data-mode="media"/);
assert.match(demo,/data-mode="iframe"/);
assert.match(demo,/tiktok\.com\/player\/v1\//);
assert.match(demo,/\/tiktok\/video-stream\?user=/);
assert.match(demo,/iframeFallback:playerMode==="auto"/);

assert.match(demo,/\/refresh\?user=/);
assert.match(demo,/sessionStorage/);
assert.match(demo,/LIVE_CACHE_MS=60_000/);
assert.match(demo,/dùng link đã có sẵn, không gọi API/);

assert.doesNotMatch(demo,/one988-tiktok-session\.onrender\.com/);
assert.doesNotMatch(demo,/\/tiktok\/profile\?user=/);
assert.doesNotMatch(demo,/\/tiktok\/live-now/);
assert.doesNotMatch(demo,/\/sweep/);

console.log('tiktok demo direct live cache + media iframe modes contract ok');
