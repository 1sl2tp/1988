'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/TikTok LIVE Direct Demo/);
assert.match(demo,/Video mới nhất/);
assert.match(demo,/EDGE\+"\/lookup\?user="/);
assert.match(demo,/EDGE\+"\/tiktok\/channel-videos"/);
assert.match(demo,/async function loadLive\(h\)/);
assert.match(demo,/async function loadChannelVideos\(h\)/);
assert.match(demo,/endpoint\.searchParams\.set\("count","1"\)/);
assert.match(demo,/Promise\.allSettled\(\[liveTask,videoTask\]\)/);
assert.match(demo,/renderVideos\(data\.videos\)/);
assert.match(demo,/target="_blank"/);
assert.doesNotMatch(demo,/onrender\.com/);
assert.doesNotMatch(demo,/TikWM HD/);
assert.doesNotMatch(demo,/BHWA/);

console.log('tiktok demo: LIVE lookup + one latest video metadata only');
