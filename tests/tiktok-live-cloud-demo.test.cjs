'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/TikTok LIVE Direct Demo/);
assert.match(demo,/placeholder="Dán link TikTok LIVE\.\.\."/);
assert.match(demo,/EDGE\+"\/lookup\?user="/);
assert.match(demo,/async function checkLive\(raw\)/);
assert.match(demo,/await playLive\(state\)/);
assert.match(demo,/streamUrlEl\.value=stream/);
assert.match(demo,/navigator\.clipboard\.writeText\(url\)/);
assert.match(demo,/mpegts\.createPlayer/);

assert.doesNotMatch(demo,/5 video gần nhất/);
assert.doesNotMatch(demo,/CHANNEL_VIDEOS_API/);
assert.doesNotMatch(demo,/TikWM HD/);
assert.doesNotMatch(demo,/BHWA/);
assert.doesNotMatch(demo,/onrender\.com/);
assert.doesNotMatch(demo,/sessionStorage/);
assert.doesNotMatch(demo,/localStorage/);
assert.doesNotMatch(demo,/data-mode=/);
assert.doesNotMatch(demo,/data-source=/);

console.log('tiktok live demo is live-only: pasted live link -> lookup -> stream URL -> play');
