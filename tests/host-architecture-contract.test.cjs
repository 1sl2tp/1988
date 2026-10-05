'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sourcesIndex=fs.readFileSync(path.join(root,'sources','index.html'),'utf8');
const sources=fs.readFileSync(path.join(root,'sources','sources.js'),'utf8');
const yt1988=fs.readFileSync(path.join(root,'supabase','functions','yt1988','index.ts'),'utf8');
const worker=fs.readFileSync(path.join(root,'cloudflare','youtube-live-state','worker.js'),'utf8');
const state=fs.readFileSync(path.join(root,'supabase','functions','yt1988-state','index.ts'),'utf8');
const legacy=fs.readFileSync(path.join(root,'src','channel-library.js'),'utf8');
const serviceWorker=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const pagesWorkflow=fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');

// GitHub is code, not canonical production data.
assert.doesNotMatch(index,/channel-library\.js/);
assert.doesNotMatch(sourcesIndex,/channel-library\.js/);
assert.match(legacy,/^\/\/ LEGACY GENERATED SEED — NOT PRODUCTION SOURCE OF TRUTH\./);

// MAIN reads hash first and only then lite state.
assert.match(index,/SOURCE_STATE_URL\+"\?view=manifest"/);
assert.match(index,/SOURCE_STATE_URL\+"\?view=lite"/);
assert.match(index,/function packageClientWakeGap\(/);
assert.match(index,/scope==="latest"\)return 5\*60_000/);
assert.match(index,/scope==="week"\)return 30\*60_000/);
assert.match(index,/return 15\*60_000/);

// Source manager alone owns the full canonical library download/cache.
assert.match(sources,/indexedDB\.open\(SOURCE_CACHE_DB,1\)/);
assert.match(sources,/view:"library"/);

// Cloudflare realtime never downloads full yt1988-state.
assert.match(worker,/STATE_URL\+"\?view=lite"/);
assert.doesNotMatch(worker,/fetchJson\(STATE_URL,8000\)/);

// Direct search/channel results may reuse cached aspect metadata, but must not
// fan out hidden background resolvers over every returned card.
assert.doesNotMatch(yt1988,/void warmVideoMeta\(missing\)/);

// TikTok runtime is retired. The production service worker must not retain a
// same-origin media proxy, retired Workers.dev dependency, or TikTok image cache.
assert.doesNotMatch(serviceWorker,/__tiktok-media/);
assert.doesNotMatch(serviceWorker,/1988-tiktok-live-state/);
assert.doesNotMatch(serviceWorker,/tiktok-originals/);
assert.doesNotMatch(serviceWorker,/TIKTOK_IMAGE_CACHE/);

// RT-05: production HTML is YouTube-only at the integration surface. Retired
// TikTok helpers may still exist temporarily, but no DOM/API/router owner may.
assert.doesNotMatch(index,/id="tiktokAccountRail"/);
assert.doesNotMatch(index,/id="tiktokWatchActions"/);
assert.doesNotMatch(index,/id="tiktokLiveVideo"/);
assert.doesNotMatch(index,/id="tiktokMediaVideo"/);
assert.doesNotMatch(index,/const TIKTOK_LIVE_API=/);
assert.doesNotMatch(index,/const TIKTOK_LIBRARY_API=/);
assert.match(index,/function normalizedMediaProvider\(\)\{\s*return "youtube";\s*\}/);
assert.match(index,/function mediaTypeFor\(\)\{\s*return "embed";\s*\}/);

// RT-06a: retired TikTok presentation CSS is no longer shipped.
assert.doesNotMatch(index,/\/\* ===== TikTok dedicated workspace =====/);
assert.doesNotMatch(index,/\.platform-tiktok \.tt-cyan/);
assert.doesNotMatch(index,/\.tiktok-live-badge\{/);

// Pages publishes only runtime assets actually referenced by production HTML/SW.
// Source-only modules remain test/development inputs and are not shipped blindly.
assert.doesNotMatch(pagesWorkflow,/cp -R icons src sources _site\//);
assert.match(pagesWorkflow,/cp -R icons sources _site\//);
assert.match(pagesWorkflow,/cp src\/api\.js src\/media-meta\.js src\/yt-local\.js _site\/src\//);

console.log('host architecture contract ok');
