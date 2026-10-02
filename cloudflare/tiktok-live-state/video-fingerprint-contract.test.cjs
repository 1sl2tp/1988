const assert=require('node:assert/strict');
const fs=require('node:fs');

const worker=fs.readFileSync('cloudflare/tiktok-live-state/worker.js','utf8');

assert.match(worker,/const VIDEO_SNAPSHOT_KEY = "tiktok:video:fingerprint";/);
assert.match(worker,/const VIDEO_BATCH_SIZE = 6;/);
assert.match(worker,/async function selectedChannels\(\)/);
assert.match(worker,/secUid: String\(row\?\.secUid \|\| ""\)\.trim\(\)/);
assert.match(worker,/latestVideoId: normalizeVideoId\(row\?\.latestVideoId \|\| ""\)/);
assert.match(worker,/async function checkTikTokVideoFingerprint\(channel\)/);
assert.match(worker,/api\/post\/item_list\//);
assert.match(worker,/endpoint\.searchParams\.set\("count", "1"\)/);
assert.match(worker,/async function wakeRenderVideoRefresh\(handle\)/);
assert.match(worker,/endpoint\.searchParams\.set\("full", "1"\)/);
assert.match(worker,/First observation is only a baseline/);
assert.match(worker,/Wake at most one channel per minute/);
assert.match(worker,/const video = await videoFingerprintSweep\(env, selectedRows\);/);
assert.doesNotMatch(worker,/selectedHandles\(\)/);
assert.match(worker,/data\?\.bestVideoUrl/);
assert.match(worker,/candidateRows[\s\S]{0,900}probe\?\.videoCodec[\s\S]{0,500}preferred\?\.urls/);
assert.match(worker,/function tiktokMediaResponseLooksUsable\(response\)/);
assert.match(worker,/response\.status===206&&contentRange/);
assert.match(worker,/for\(const target of candidates\)/);
assert.match(worker,/source\.name==="native"[\s\S]{0,220}fetchTikTokNativeMediaTarget/);

console.log('tiktok-edge-video-fingerprint-contract: assertions passed');
