'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');

assert.match(worker,/const TIKTOK_VOD_SOURCE_VERSION = "avc4"/);
assert.match(worker,/const VOD_RESOLVE_TIMEOUT_MS = 2200/);
assert.match(worker,/async function vodFetch\(/);
assert.match(worker,/async function vodWithTimeout\(/);

const tikwmStart=worker.indexOf("async function resolveTikwmVideoSource");
const tikwmEnd=worker.indexOf("async function redirectTikTokVideoDirect",tikwmStart);
assert.ok(tikwmStart>=0&&tikwmEnd>tikwmStart);
const tikwm=worker.slice(tikwmStart,tikwmEnd);
assert.match(tikwm,/body\.hdplay \|\| body\.play \|\| ""/);
assert.doesNotMatch(tikwm,/wmplay/);

// TTDownloader must select the explicit No watermark (HD) row, not score arbitrary URLs.
assert.match(worker,/function vodTTDownloaderNoWatermarkUrl\(html\)/);
assert.match(worker,/children\.find\(x=>\/\\bno\\s\*watermark\\b\/i/);
assert.ok(worker.includes('ttd-nowm-hd-v1'));
assert.ok(worker.includes('ttdownloader_no_watermark_hd_url'));
assert.ok(worker.includes('resolveVodSourceByName(sourceName,handle,id,{refresh:true})'));

// TDown and TTDownloader resolve to real provider URLs before the browser plays them.
// This endpoint returns JSON only; media bytes still go directly from provider to browser.
assert.match(worker,/const VOD_DIRECT_URL_SOURCES=new Set\(\["tdown","ttdownloader"\]\)/);
assert.match(worker,/async function resolveTikTokVideoUrl\(request\)/);
assert.ok(worker.includes('url.pathname === "/tiktok/video-resolve"'));
assert.match(worker,/return json\(\{[\s\S]*ok:true,[\s\S]*source:sourceName,[\s\S]*url:directUrl[\s\S]*\}\);/);

// Explicit stream source remains strict for the other demo providers.
const relayStart=worker.indexOf('async function relayTikTokVideo');
const relayEnd=worker.indexOf('async function refreshOne',relayStart);
assert.ok(relayStart>=0&&relayEnd>relayStart);
const relay=worker.slice(relayStart,relayEnd);
assert.match(relay,/requested&&requested!=="auto"/);
assert.match(relay,/order=\[requested\]/);

assert.match(worker,/url\.pathname === "\/tiktok\/channel-videos"/);

assert.match(worker,/async function lookupLive\(rawHandle\)/);
assert.match(worker,/url\.pathname === "\/lookup"/);
assert.match(worker,/const state=await checkTikTok\(handle\)/);

assert.match(worker,/async function resolveTikTokSecUid\(rawHandle\)/);
assert.match(worker,/https:\/\/www\.tiktok\.com\/api\/user\/detail\//);
assert.match(worker,/https:\/\/www\.tiktok\.com\/api\/post\/item_list\//);
assert.match(worker,/async function fetchTikTokLatestFive\(rawHandle,count=5\)/);
assert.match(worker,/source:"tiktok-post-item-list"/);

assert.match(worker,/async function fetchTikTokProfileVideoLinks\\(rawHandle,count=5\\)/);
assert.match(worker,/source:"tiktok-profile-html"/);
console.log('tiktok VOD direct-url + failover contract ok');
