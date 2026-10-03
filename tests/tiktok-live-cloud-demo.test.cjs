'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/data-mode="auto"/);
assert.match(demo,/data-mode="media"/);
assert.match(demo,/data-mode="iframe"/);

for(const source of ['tikwm','tdown','tiklydown','musicaldown','tikdown','ttdownloader']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/\/tiktok\/video-link\?user=/);
assert.match(demo,/&source="\+encodeURIComponent\(source\)/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/performance\.now\(\)/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/GET LINK LỖI/);
assert.match(demo,/video\.addEventListener\("playing"/);

assert.match(demo,/autoplay=1&muted=0&loop=1&rel=0&description=0&music_info=0/);

assert.doesNotMatch(demo,/www\.tikwm\.com\/api\/\?url=/);
assert.doesNotMatch(demo,/tdownv4\.sl-bjs\.workers\.dev\/\?down=/);
assert.doesNotMatch(demo,/api\.tiklydown/);
assert.doesNotMatch(demo,/api\.douyin\.wtf/);
assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);
assert.doesNotMatch(demo,/one988-tiktok-session\.onrender\.com/);

console.log('tiktok demo manual JSON getlink sources + timing + clean iframe contract ok');
