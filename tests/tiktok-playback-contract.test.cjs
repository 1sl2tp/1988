const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('tiktok-clean-demo.html','utf8');
const server=fs.readFileSync('backend/social-collector/server.mjs','utf8');

assert.ok(!html.includes('hls.js@'), 'TikTok production path must stay FLV-only for LIVE');
assert.match(html,/src\/styles\/tokens\.css/);
assert.match(html,/src\/styles\/base\.css/);
assert.match(html,/src\/styles\/components\.css/);
assert.match(html,/src\/styles\/pages\/tiktok\.css/);
assert.doesNotMatch(html,/PACKAGE_POLL_MS/);
assert.match(html,/const LIVE_POLL_MS=30_000;/);
assert.match(html,/const PACKAGE_CHECK_MIN_GAP_MS=15_000;/);
assert.match(html,/async function checkLibraryOnDemand/);
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
assert.match(videoRoute,/downloadTikTokVideoFile\(/,'MP4 route must have reliable local-file fallback when TikTok CDN rejects direct proxy');
assert.match(videoRoute,/queueTikTokVideoPriorityWarm\(/);

const warmStart=server.indexOf("async function warmTikTokLibraryHandle(");
const warmEnd=server.indexOf("async function resolveTikTokLiveSourceBatch(",warmStart);
const warm=server.slice(warmStart,warmEnd);
assert.match(warm,/confirmTikTokLibrarySource\(/,'LIVE background warm must verify FLV');
assert.match(warm,/attempt<4/,'LIVE warm must try fallback FLV candidates');

assert.match(videoRoute,/serveTikTokVideoFile\(/,'MP4 route must serve warmed local file with Range support');

assert.match(html,/function stepVideo\(direction\)/,'TikTok video swipe navigator missing');
assert.match(html,/touchstart/,'TikTok mobile swipe start handler missing');
assert.match(html,/touchmove/,'TikTok mobile swipe move handler missing');
assert.match(html,/touchend/,'TikTok mobile swipe end handler missing');
assert.match(html,/warmNextVideo\(\)/,'TikTok next-video rolling warm missing');

const warmRouteStart=server.indexOf("if(url.pathname==='/tiktok/video-warm'");
const warmRouteEnd=server.indexOf("if(url.pathname==='/tiktok/video-stream'",warmRouteStart);
assert.ok(warmRouteStart>=0&&warmRouteEnd>warmRouteStart,'video-warm route missing');
const warmRoute=server.slice(warmRouteStart,warmRouteEnd);
assert.ok(!warmRoute.includes('downloadTikTokVideoFile('),'video-warm must not pre-download full MP4 media onto Render');
assert.match(warmRoute,/queueTikTokVideoPriorityWarm\(/,'video-warm must only prepare direct source metadata');
assert.match(warmRoute,/direct-source-only/,'video-warm must declare metadata-only direct warm mode');
assert.match(warmRoute,/json\(res,202/,'video-warm must return immediately while warming');

assert.match(server,/const RENDER_MEDIA_PROXY_ENABLED=String\(process\.env\.RENDER_MEDIA_PROXY_ENABLED\|\|'0'\)==='1';/,'Render media proxy must stay opt-in and off by default');
assert.match(server,/media_proxy_disabled/,'Render media proxy gate must hard-disable byte proxying by default');
assert.match(server,/proxyUrl:''/,'packages must not expose Render media proxy URLs');
assert.doesNotMatch(html,/fallbackSrc/,'MP4 UI must not fall back to Render media proxy');
assert.match(html,/Direct TikTok CDN only/,'MP4 UI must stay direct-CDN only');


assert.match(html,/id="mediaSeek"/,'TikTok fixed seek bar missing');
assert.match(html,/function syncMediaControls\(\)/,'TikTok media controls sync missing');
assert.match(html,/installMediaControls\(\)/,'TikTok custom controls installation missing');
assert.ok(!html.includes('controls=true'),'TikTok must not re-enable jumping native controls');

console.log('tiktok-playback-contract: assertions passed');
assert.match(server,/const TIKTOK_LIVE_PRIORITY_BATCH=18;/);
assert.match(server,/tiktokLivePriorityCursor/);
assert.match(server,/refreshTikTokLiveLibrary\(liveHandles,\{warm:true,force:true\}\)/);

assert.match(server,/const TIKTOK_LIVE_PUBLIC_CONFIRM_TTL_MS=3\*60_000;/);
assert.match(server,/function isTikTokConfirmedLiveStatus\([\s\S]{0,360}scan\?\.known===true[\s\S]{0,220}scan\?\.live===true[\s\S]{0,220}scan\?\.retained!==true/);
assert.match(server,/function tiktokPublishedLiveNow\(/);

assert.match(server,/const TIKTOK_LIVE_RECENT_TTL_MS=24\*60\*60_000;/);
assert.match(server,/const TIKTOK_LIVE_RECENT_BATCH=8;/);
assert.match(server,/const TIKTOK_LIVE_COLD_BATCH=6;/);
assert.match(server,/const TIKTOK_LIVE_COLD_DEEP_BATCH=2;/);
assert.match(server,/lastKnownAt:checkedAt/);
assert.match(server,/tierRecent=/);
assert.match(server,/coldDeep=/);