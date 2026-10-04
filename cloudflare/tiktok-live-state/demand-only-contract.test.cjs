'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const wrangler = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
const workflow = fs.readFileSync(
  path.join(root, '..', '..', '.github', 'workflows', 'deploy-tiktok-live-state-edge.yml'),
  'utf8'
);

// TikTok LIVE is demand-only. A visible browser may call /sweep or /refresh;
// Cloudflare itself must never start discovery on a schedule.
assert.match(wrangler, /\[triggers\]\s*\ncrons\s*=\s*\[\s*\]/);
assert.doesNotMatch(wrangler, /crons\s*=\s*\[\s*["']/);
assert.doesNotMatch(worker, /\basync\s+scheduled\s*\(/);
assert.match(worker, /url\.pathname === "\/sweep"/);
assert.match(worker, /url\.pathname === "\/refresh"/);

// A future deploy must actively clear any dashboard/runtime schedule and fail
// verification if Cloudflare still reports one.
assert.match(workflow, /Enforce zero LIVE schedules/);
assert.match(workflow, /1988-tiktok-live-state\/schedules/);
assert.match(workflow, /--data '\[\]'/);
assert.match(workflow, /\.result\.schedules \| length\) == 0/);

const liveNowStart=worker.indexOf("async function liveNow(env)");
const liveNowEnd=worker.indexOf("function normalizeVideoId",liveNowStart);
const liveNowBlock=worker.slice(liveNowStart,liveNowEnd);
assert.doesNotMatch(liveNowBlock,/resolveTikTokLiveEdge/);
assert.doesNotMatch(liveNowBlock,/RENDER_API \+ "\/tiktok\/live-now/);
assert.match(liveNowBlock,/snapshotHasPlayableLive\(row\)/);
assert.match(liveNowBlock,/streamUrl:String\(row\?\.streamUrl\|\|""\)/);
const checkStart=worker.indexOf("async function checkTikTok(handle)");
const checkEnd=worker.indexOf("async function mapLimit",checkStart);
const checkBlock=worker.slice(checkStart,checkEnd);
assert.match(checkBlock,/api-live\/user\/room/);
assert.match(checkBlock,/collectLiveMedia\(room\)/);
assert.match(checkBlock,/streamUrl/);
assert.match(checkBlock,/hlsUrl/);
assert.doesNotMatch(checkBlock,/RENDER_API/);
assert.doesNotMatch(checkBlock,/probeDirectLiveUrl/);
assert.doesNotMatch(checkBlock,/resolveTikTokLiveEdge/);
console.log('tiktok demand-only contract ok');

assert.match(worker,/function snapshotHasPlayableLive\(row\)/);
assert.match(worker,/function snapshotLiveRow\(state,prev=\{\},now=Date\.now\(\)\)/);
assert.match(worker,/A later offline answer is not strong enough to erase a known-good LIVE URL/);
assert.match(worker,/Unknown\/API failure also keeps the last known-good LIVE row untouched/);
assert.match(worker,/const retainedLive = selected\.filter\(\(h\) => snapshotHasPlayableLive/);
assert.match(worker,/return json\(\{[\s\S]*retained[\s\S]*\}\);/);
