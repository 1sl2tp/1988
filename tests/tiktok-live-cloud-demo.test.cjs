'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_get','native','direct','tdown','musicaldown','tikdown','ttdownloader','tiklydown','douyinwtf']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.doesNotMatch(demo,/data-source="tiktok_play"/);
assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/body\.hdplay\|\|body\.play/);
assert.doesNotMatch(demo,/wmplay/);
assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);

assert.match(demo,/const DIRECT_LINK_VOD_SOURCES=new Set\(\["tdown","ttdownloader"\]\)/);
assert.match(demo,/EDGE\+"\/tiktok\/video-resolve"/);
assert.match(demo,/const resolved=await json\(endpoint\.toString\(\),12000\)/);
assert.match(demo,/url=String\(resolved\?\.url\|\|""\)\.trim\(\)/);
assert.match(demo,/const EDGE_VOD_SOURCES=new Set\(\["native","direct","musicaldown","tikdown","tiklydown","douyinwtf"\]\)/);
assert.match(demo,/EDGE\+"\/tiktok\/video-stream"/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/NotAllowedError/);
assert.match(demo,/PLAY LỖI/);

console.log('tiktok demo direct-url TDown + TTDownloader contract ok');
