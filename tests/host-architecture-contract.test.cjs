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

console.log('host architecture contract ok');
