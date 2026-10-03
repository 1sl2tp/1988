'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm_hd','tikwm_std','bhwa_get','native','direct','tdown','musicaldown','tikdown','ttdownloader','tiklydown','douyinwtf']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/https:\/\/downloader-api\.bhwa233\.com\/api\/parse\?url=/);

// TDown known-good contract: browser calls TDown directly and reads its JSON MP4 URL.
// It must NOT be routed through the 1988 Worker resolve/stream path.
assert.match(demo,/source==="tdown"/);
assert.match(demo,/https:\/\/tdownv4\.sl-bjs\.workers\.dev\/\?down=/);
assert.match(demo,/data\?\.download_url/);
assert.match(demo,/data\?\.downloadUrl/);
assert.match(demo,/data\?\.video\?\.download_url/);
assert.match(demo,/data\?\.data\?\.download_url/);
assert.match(demo,/const DIRECT_LINK_VOD_SOURCES=new Set\(\["ttdownloader"\]\)/);
assert.doesNotMatch(demo,/DIRECT_LINK_VOD_SOURCES=new Set\(\["tdown"/);

// TTDownloader remains an independent resolver experiment.
assert.match(demo,/EDGE\+"\/tiktok\/video-resolve"/);
assert.match(demo,/const EDGE_VOD_SOURCES=new Set\(\["native","direct","musicaldown","tikdown","tiklydown","douyinwtf"\]\)/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/NotAllowedError/);
assert.match(demo,/PLAY LỖI/);

console.log('tiktok demo restores direct-browser TDown contract from 9cbd4771');
