'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');

assert.match(worker,/const TIKTOK_VOD_SOURCE_VERSION = "avc4"/);
assert.match(worker,/const VOD_RESOLVE_TIMEOUT_MS = 2200/);
assert.match(worker,/const VOD_MEDIA_OPEN_TIMEOUT_MS = 1800/);
assert.match(worker,/const VOD_PROBE_TIMEOUT_MS = 1400/);
assert.match(worker,/async function vodFetch\(/);
assert.match(worker,/async function vodWithTimeout\(/);

// Warm winner must include native and a cache hit must not resolve every provider again.
assert.match(worker,/preferred==="native"\|\|VOD_RESOLVER_POOL\.includes\(preferred\)/);
assert.match(worker,/sources:\[\{name:existing\}\]/);
const warmStart=worker.indexOf('async function warmTikTokVod');
const warmEnd=worker.indexOf('async function fetchTikTokMediaTarget',warmStart);
assert.ok(warmStart>=0&&warmEnd>warmStart);
const warm=worker.slice(warmStart,warmEnd);
assert.match(warm,/vodWithTimeout\([\s\S]*resolveVodSourceByName/);

// Explicit click source is strict: browser controls failover one provider at a time.
// Only source=auto may use the worker-side provider chain for compatibility.
const relayStart=worker.indexOf('async function relayTikTokVideo');
const relayEnd=worker.indexOf('async function refreshOne',relayStart);
assert.ok(relayStart>=0&&relayEnd>relayStart);
const relay=worker.slice(relayStart,relayEnd);
assert.match(relay,/const requested = String\(url\.searchParams\.get\("source"\)/);
assert.match(relay,/requested&&requested!=="auto"/);
assert.match(relay,/order=\[requested\]/);
assert.match(relay,/preferred=await readVodWarmPreference\(handle,id\);[\s\S]{0,120}order=vodSourceOrder\(preferred,id\)/);
assert.match(relay,/vodWithTimeout\([\s\S]*sourceName\+"_resolve"/);
assert.match(relay,/continue;/);
assert.match(worker,/VOD_MEDIA_OPEN_TIMEOUT_MS,"media_open"/);
assert.match(worker,/VOD_RESOLVE_TIMEOUT_MS,"tdown_resolve"/);
assert.match(worker,/VOD_PROBE_TIMEOUT_MS,source\.name\+"_probe"/);
assert.match(worker,/const VOD_EXPLICIT_EXTRA_SOURCES=\["tiklydown","douyinwtf"\]/);
assert.match(worker,/VOD_EXPLICIT_EXTRA_SOURCES\.includes\(requested\)/);
const tikwmStart=worker.indexOf("async function resolveTikwmVideoSource");
const tikwmEnd=worker.indexOf("async function redirectTikTokVideoDirect",tikwmStart);
assert.ok(tikwmStart>=0&&tikwmEnd>tikwmStart);
const tikwm=worker.slice(tikwmStart,tikwmEnd);
assert.match(tikwm,/body\.hdplay \|\| body\.play \|\| ""/);
assert.doesNotMatch(tikwm,/wmplay/);

assert.match(worker,/function vodTTDownloaderNoWatermarkUrl\(html\)/);
assert.match(worker,/results-list/);
assert.match(worker,/children\.find\(x=>\/\\bno\\s\*watermark\\b\/i/);
assert.match(worker,/ttdownloader\\\.com\\\/dl\\\.php\\\\\?v=/);
assert.match(worker,/ttd-nowm-hd-v1/);
assert.match(worker,/const mediaUrl=vodTTDownloaderNoWatermarkUrl\(text\)/);
assert.match(worker,/ttdownloader_no_watermark_hd_url/);

console.log('tiktok VOD failover contract ok');
