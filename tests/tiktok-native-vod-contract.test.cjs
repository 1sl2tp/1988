const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

test('TikTok VOD uses native video through Cloudflare only',()=>{
  assert.match(html,/id="tiktokMediaVideo"/);
  assert.match(html,/TIKTOK_LIVE_API+"\/tiktok\/video-stream"/);
  assert.match(html,/video\.controls=true/);
  assert.match(html,/video\.src=endpoint\.toString\(\)/);
  assert.doesNotMatch(html,/id="tiktokMediaFrame"/);
  assert.doesNotMatch(html,/www\.tiktok\.com\/player\/v1\//);
  assert.doesNotMatch(html,/installTikTokEmbedBridge/);
  assert.doesNotMatch(html,/tiktokEmbedCommand/);
  assert.doesNotMatch(html,/tiktok-embed-fallback/);
});

test('TikTok VOD warm-up stays on Cloudflare edge',()=>{
  assert.match(html,/TIKTOK_LIVE_API+"\/tiktok\/video-warm-edge"/);
  assert.doesNotMatch(html,/video-session-stream/);
});

console.log('tiktok-native-vod-contract: assertions passed');
