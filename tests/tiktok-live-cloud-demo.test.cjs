'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

assert.match(demo,/data-source="tikwm"/);
assert.match(demo,/data-source="ssstikvn"/);
assert.match(demo,/data-source="vnsnaptik"/);

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/https:\/\/ssstik\.vn\//);
assert.match(demo,/https:\/\/ssstik\.vn\/api\/download/);
assert.match(demo,/https:\/\/vn\.snaptik\.com\//);
assert.match(demo,/https:\/\/vn\.snaptik\.com\/abc2\.php/);

assert.match(demo,/credentials:"include"/);
assert.match(demo,/DOMParser/);
assert.match(demo,/FormData/);
assert.match(demo,/video\.src=direct/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/GET LINK LỖI/);

assert.doesNotMatch(demo,/\/tiktok\/video-link\?user=/);
assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);
assert.doesNotMatch(demo,/tdownv4\.sl-bjs\.workers\.dev/);
assert.doesNotMatch(demo,/api\.tiklydown/);
assert.doesNotMatch(demo,/musicaldown\.com/);
assert.doesNotMatch(demo,/tikdown\.org/);
assert.doesNotMatch(demo,/ttdownloader\.com/);

console.log('tiktok demo browser-direct VN sources contract ok');
