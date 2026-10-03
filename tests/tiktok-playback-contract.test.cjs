const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const server=fs.readFileSync('backend/social-collector/server.mjs','utf8');
const worker=fs.readFileSync('cloudflare/tiktok-live-state/worker.js','utf8');

// Production UI owns two TikTok native surfaces: LIVE and VOD.
assert.match(html,/id="tiktokLiveVideo"/,'TikTok LIVE native video surface missing');
assert.match(html,/id="tiktokMediaVideo"/,'TikTok VOD native video surface missing');
assert.doesNotMatch(html,/https:\/\/www\.tiktok\.com\/player\/v1\//,'production TikTok VOD must not use the official iframe player');

// Production VOD goes through the edge resolver, not a demo page or Render byte proxy.
assert.match(html,/TIKTOK_LIVE_API\+"\/tiktok\/video-stream"/,'TikTok production VOD edge route missing');
assert.match(html,/const TIKTOK_VOD_CLICK_SOURCES=\["tikwm","tdown","musicaldown","tikdown","ttdownloader"\]/,'TikTok VOD click source rotation missing');
assert.match(html,/function tiktokVodSourcesForClick\(\)/,'TikTok VOD click source selector missing');
assert.match(html,/endpoint\.searchParams\.set\("source",source\)/,'production VOD must attach one explicit source per attempt');
assert.doesNotMatch(html,/endpoint\.searchParams\.set\("source","auto"\)/,'production VOD click must not hide a provider chain behind source=auto');
assert.doesNotMatch(html,/function warmTikTokVod\(/,'TikTok VOD must not pre-resolve providers before click');
assert.doesNotMatch(html,/observeTikTokVodWarmRows/,'TikTok VOD must not background-warm visible rows');
assert.doesNotMatch(html,/TIKTOK_VOD_FAILOVER_TIMEOUT_MS/,'TikTok VOD frontend must not add a second startup timer');
assert.doesNotMatch(html,/video-session-stream/,'production TikTok VOD must not relay media bytes through Render');

// Resolver pool: one provider call, then move forward only on failure.
assert.match(worker,/const VOD_RESOLVER_POOL=\["tikwm","tdown","musicaldown","tikdown","ttdownloader"\]/);
assert.match(worker,/vodSourceOrder\(preferred,id\)/);
assert.doesNotMatch(worker,/for \(let attempt = 0; attempt < 2; attempt\+\+\)/);
assert.match(worker,/Never call the same provider twice in the/);

// Render stays metadata/session-oriented and media-byte proxy remains opt-in/off.
assert.match(server,/const RENDER_MEDIA_PROXY_ENABLED=String\(process\.env\.RENDER_MEDIA_PROXY_ENABLED\|\|'0'\)==='1';/);
assert.match(server,/media_proxy_disabled/);
assert.match(server,/proxyUrl:''/);

// LIVE click path must not rediscover/probe the FLV synchronously.
const proxyStart=server.indexOf("async function proxyTikTokLive(");
const proxyEnd=server.indexOf("function findTikTokUserObject(",proxyStart);
assert.ok(proxyStart>=0&&proxyEnd>proxyStart,'proxyTikTokLive block missing');
const liveProxy=server.slice(proxyStart,proxyEnd);
assert.ok(!liveProxy.includes('probeTikTokFlvBytes('),'LIVE click path must not probe FLV');
assert.ok(!liveProxy.includes('findPreferredTikTokFlv('),'LIVE click path must not discover candidates');
assert.ok(!liveProxy.includes('fastTikTokLiveWithYtdlp('),'LIVE click path must not run yt-dlp');
assert.match(liveProxy,/pipeTikTokTarget\(/);

// Render VOD route must not run an expensive yt-dlp resolve on every click.
const videoStart=server.indexOf("if(url.pathname==='/tiktok/video-stream'");
const videoEnd=server.indexOf("if(url.pathname==='/tiktok/video-source'",videoStart);
assert.ok(videoStart>=0&&videoEnd>videoStart,'video-stream route missing');
const videoRoute=server.slice(videoStart,videoEnd);
assert.match(videoRoute,/lookupTikTokVideoSourceFast\(/);
assert.ok(!videoRoute.includes('resolveTikTokVideoSource('),'MP4 click path must not resolve with yt-dlp');
assert.match(videoRoute,/queueTikTokVideoPriorityWarm\(/);

console.log('tiktok-playback-contract: production assertions passed');
