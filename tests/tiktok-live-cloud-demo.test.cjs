'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/data-source="tikwm"/);
assert.match(demo,/data-source="snaptikvn"/);
assert.match(demo,/data-source="ssstikvn"/);

assert.doesNotMatch(demo,/data-source="tdown"/);
assert.doesNotMatch(demo,/data-source="tiklydown"/);
assert.doesNotMatch(demo,/data-source="musicaldown"/);
assert.doesNotMatch(demo,/data-source="tikdown"/);
assert.doesNotMatch(demo,/data-source="ttdownloader"/);

assert.match(demo,/\/tiktok\/video-link\?user=/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/performance\.now\(\)/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/GET LINK LỖI/);

assert.match(demo,/autoplay=1&muted=0&loop=1&rel=0&description=0&music_info=0/);
assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);

console.log('tiktok demo TikWM + Vietnamese getlink sources contract ok');
