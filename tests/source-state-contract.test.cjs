'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sources=fs.readFileSync(path.join(root,'sources','sources.js'),'utf8');
const state=fs.readFileSync(path.join(root,'supabase','functions','yt1988-state','index.ts'),'utf8');
const worker=fs.readFileSync(path.join(root,'cloudflare','youtube-live-state','worker.js'),'utf8');

assert.match(index,/function effectiveSourceStatus\(/);
assert.match(index,/Đã chọn trong .*\(kế thừa\)/);
assert.match(index,/Đã chặn trong .*\(kế thừa\)/);
assert.match(index,/activePackageScope!=="live"/);
assert.match(sources,/function liveEffectiveBlockedSet\(/);
assert.match(sources,/Đã chọn từ nguồn khác/);
assert.match(sources,/Đã chặn từ nguồn khác/);
assert.match(state,/youtube\/live-source-sync\?channelId=/);
assert.match(state,/triggerLiveSourceSync\(channelId\)/);
assert.match(state,/view === "manifest"/);
assert.match(state,/view === "lite"/);
assert.match(state,/view === "library"/);
assert.match(index,/SOURCE_STATE_URL\+"\?view=manifest"/);
assert.match(index,/SOURCE_STATE_URL\+"\?view=lite"/);
assert.match(sources,/indexedDB\.open\(SOURCE_CACHE_DB,1\)/);
assert.match(sources,/view:"manifest"/);
assert.match(sources,/view:"lite"/);
assert.match(sources,/view:"library"/);
assert.match(worker,/STATE_URL\+"\?view=lite"/);
assert.doesNotMatch(worker,/fetchJson\(STATE_URL,8000\)/);

console.log('source-state contract ok');
