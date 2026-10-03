'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const demo=fs.readFileSync('tiktok-live-cloud-demo.html','utf8');

for(const source of ['tikwm','snaptikvn','ssstikvn']){
  assert.match(demo,new RegExp('data-source="'+source+'"'));
}

assert.match(demo,/https:\/\/www\.tikwm\.com\/api\/\?url=/);
assert.match(demo,/https:\/\/snaptikvn\.app\/api\/token/);
assert.match(demo,/https:\/\/snaptikvn\.app\/api\/action\?url=/);
assert.match(demo,/https:\/\/ssstik\.vn\/api\/download/);

assert.doesNotMatch(demo,/\/tiktok\/video-link\?user=/);
assert.doesNotMatch(demo,/\/tiktok\/video-stream\?user=/);

assert.match(demo,/video\.src=direct/);
assert.match(demo,/GET LINK LỖI/);
assert.match(demo,/PHÁT ĐƯỢC/);
assert.match(demo,/autoplay=1&muted=0&loop=1&rel=0&description=0&music_info=0/);

console.log('tiktok demo direct-browser VOD sources contract ok');
