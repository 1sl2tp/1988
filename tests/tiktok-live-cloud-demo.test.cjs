'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tdown','bhwa_get']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}
for(const source of ['tikwm_std','native','direct','musicaldown','tikdown','ttdownloader','tiklydown','douyinwtf']){
  assert.doesNotMatch(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/const VOD_AUTO_SOURCES=\["tikwm_hd","tdown","bhwa_get"\]/);
assert.match(demo,/const EDGE_VOD_SOURCES=new Set\(\["tdown"\]\)/);
assert.match(demo,/const \[first,\.\.\.rest\]=VOD_AUTO_SOURCES/);
assert.match(demo,/playVodMedia\(item,\{iframeFallback:true,source:first,fallbackSources:rest\}\)/);
assert.match(demo,/if\(fallbackSources\.length\)/);

assert.doesNotMatch(demo,/data-source="tiktok_play"/);
assert.doesNotMatch(demo,/TikTok PlayAddr/);
assert.doesNotMatch(demo,/node\/share\/video/);
assert.doesNotMatch(demo,/fetchTikTokPlayAddr/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.doesNotMatch(demo,/body\.play\|\|body\.hdplay/);
assert.doesNotMatch(demo,/wmplay/);

assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);
assert.match(demo,/originDownloadVideoUrl/);
assert.match(demo,/downloadVideoUrl/);
assert.match(demo,/add\("originDownloadVideoUrl",d\.originDownloadVideoUrl,500\)/);
assert.match(demo,/add\("downloadVideoUrl",d\.downloadVideoUrl,350\)/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/EDGE\+"\/tiktok\/video-stream"/);
assert.match(demo,/endpoint\.searchParams\.set\("source",source\)/);

console.log('tiktok demo HQ TikWM -> TDown -> BHWA sequential fallback contract ok');
