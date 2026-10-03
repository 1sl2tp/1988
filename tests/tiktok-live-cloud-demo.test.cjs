'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','bhwa_get']) assert.match(demo,new RegExp('data-source="'+source+'"'));
for(const source of ['tikwm_std','tdown','ttdownloader','musicaldown','tikdown','tiklydown','douyinwtf','native','direct']) {
  assert.doesNotMatch(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/const PROFILE_API="https:\/\/one988-tiktok-session\.onrender\.com\/tiktok\/profile"/);
assert.match(demo,/endpoint\.searchParams\.set\("limit","5"\)/);
assert.match(demo,/normalizeProfileVideos\(data\?\.videos,h\)/);
assert.match(demo,/videos=.*slice\(0,5\)/s);
assert.match(demo,/function parseHandle\(raw\)/);
assert.match(demo,/decodeURIComponent\(m\[1\]\)/);
assert.match(demo,/async function resolveHandleFromInput\(raw\)/);
assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/data\?\.data\?\.author\|\|data\?\.data\?\.user/);
assert.match(demo,/const h=await resolveHandleFromInput\(raw\)/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);

assert.match(demo,/if\(playerMode==="auto"\)/);
assert.match(demo,/source:"tikwm_hd",autoFallback:true/);
assert.match(demo,/source==="tikwm_hd"/);
assert.match(demo,/source:"bhwa_get",force:true/);
assert.match(demo,/TikWM có link nhưng phát lỗi · chuyển BHWA/);
assert.match(demo,/TikWM mở media lỗi · chuyển BHWA/);

assert.match(demo,/const liveType=String\(data\?\.live\?\.streamType\|\|""\)\.toLowerCase\(\)/);
assert.match(demo,/streamUrl:liveType==="hls"\?"":liveUrl/);
assert.match(demo,/renderLive\(liveItem\?\{status:2\}:\{status:4\}\)/);
assert.match(demo,/playLive\(liveItem\)/);

console.log('tiktok demo arbitrary @ link -> live + latest 5 + TikWM/BHWA auto contract ok');
