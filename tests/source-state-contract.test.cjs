'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sources=fs.readFileSync(path.join(root,'sources','sources.js'),'utf8');
const state=fs.readFileSync(path.join(root,'supabase','functions','yt1988-state','index.ts'),'utf8');

assert.match(index,/function effectiveSourceStatus\(/);
assert.match(index,/Đã chọn trong .*\(kế thừa\)/);
assert.match(index,/Đã chặn trong .*\(kế thừa\)/);
assert.match(index,/activePackageScope!=="live"/);
assert.match(sources,/function liveEffectiveBlockedSet\(/);
assert.match(sources,/Đã chọn từ nguồn khác/);
assert.match(sources,/Đã chặn từ nguồn khác/);
assert.match(state,/youtube\/live-source-sync\?channelId=/);
assert.match(state,/triggerLiveSourceSync\(channelId\)/);

console.log('source-state contract ok');
