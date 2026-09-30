const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('tiktok-clean-demo.html','utf8');
const server=fs.readFileSync('backend/social-collector/server.mjs','utf8');

assert.ok(!html.includes('hls.js@'), 'TikTok production path must stay FLV-only for LIVE');
assert.match(html,/src\/styles\/tokens\.css/);
assert.match(html,/src\/styles\/base\.css/);
assert.match(html,/src\/styles\/components\.css/);
assert.match(html,/src\/styles\/pages\/tiktok\.css/);
assert.match(html,/const PACKAGE_POLL_MS=60_000;/);
assert.match(html,/const LIVE_POLL_MS=30_000;/);
assert.equal((html.match(/<video\b/g)||[]).length,1,'TikTok must use one canonical video surface');
assert.ok(!html.includes('id="videoFrame"'),'TikTok core playback must not depend on iframe');

const proxyStart=server.indexOf("async function proxyTikTokLive(");
const proxyEnd=server.indexOf("function findTikTokUserObject(",proxyStart);
assert.ok(proxyStart>=0&&proxyEnd>proxyStart,'proxyTikTokLive block missing');
const liveProxy=server.slice(proxyStart,proxyEnd);
assert.ok(!liveProxy.includes('probeTikTokFlvBytes('),'LIVE click path must not probe FLV');
assert.ok(!liveProxy.includes('findPreferredTikTokFlv('),'LIVE click path must not discover candidates');
assert.ok(!liveProxy.includes('fastTikTokLiveWithYtdlp('),'LIVE click path must not run yt-dlp');
assert.match(liveProxy,/pipeTikTokTarget\(/);

const videoStart=server.indexOf("if(url.pathname==='/tiktok/video-stream'");
const videoEnd=server.indexOf("if(url.pathname==='/tiktok/video-source'",videoStart);
assert.ok(videoStart>=0&&videoEnd>videoStart,'video-stream route missing');
const videoRoute=server.slice(videoStart,videoEnd);
assert.match(videoRoute,/lookupTikTokVideoSourceFast\(/);
assert.ok(!videoRoute.includes('resolveTikTokVideoSource('),'MP4 click path must not resolve with yt-dlp');
assert.ok(!videoRoute.includes('downloadTikTokVideoFile('),'MP4 click path must not download file fallback');
assert.match(videoRoute,/queueTikTokVideoPriorityWarm\(/);

const warmStart=server.indexOf("async function warmTikTokLibraryHandle(");
const warmEnd=server.indexOf("async function resolveTikTokLiveSourceBatch(",warmStart);
const warm=server.slice(warmStart,warmEnd);
assert.match(warm,/confirmTikTokLibrarySource\(/,'LIVE background warm must verify FLV');
assert.match(warm,/attempt<4/,'LIVE warm must try fallback FLV candidates');

console.log('tiktok-playback-contract: assertions passed');
