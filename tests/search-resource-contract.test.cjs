'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');

assert.match(app,/async function sourceExternalSearch\(/);
assert.match(app,/api\("search",\{q,filter\},timeoutMs\)/);
assert.match(app,/SOURCE_EXTERNAL_SEARCH_TTL=5\*60\*1000/);
assert.match(app,/SOURCE_EXTERNAL_EMPTY_TTL=60\*1000/);

// Typing is L0/local only. External YouTube search happens only on committed Enter.
assert.doesNotMatch(app,/sourceSearchTimer=setTimeout\(\(\)=>void searchSourceChannels\(q\),120\)/);
assert.doesNotMatch(app,/sourcePreviewSearchTimer=setTimeout\(\(\)=>void searchPreviewVideos\(q\),120\)/);
assert.match(app,/Chưa có trong thư viện · Enter để tìm YouTube/);

// Source-manager search no longer fans out through suggestion expansion or
// browser-side youtubei search when the Edge path misses.
assert.doesNotMatch(app,/sourceSearchAlternates\(q\)/);
assert.doesNotMatch(app,/source_video_timeout/);
assert.doesNotMatch(app,/preview_video_timeout/);

// Edge provider fallback is bounded and sequential. One committed action may
// try one preferred Piped provider plus at most two fallbacks.
const edge=fs.readFileSync(path.join(root,'supabase','functions','yt1988','index.ts'),'utf8');
assert.match(edge,/const MAX_PIPED_ATTEMPTS = 3/);
assert.match(edge,/async function sequentialPiped\(/);
assert.match(edge,/if \(attempts >= MAX_PIPED_ATTEMPTS\) break/);
assert.match(edge,/orderedPipedCandidates\(\)/);
assert.match(edge,/API_FAILURE_TTL_MS = 60 \* 1000/);
assert.doesNotMatch(edge,/async function raceApis\(/);
assert.doesNotMatch(edge,/const winner = await Promise\.any\(\s*candidates\.map/);

console.log('search resource contract ok');
