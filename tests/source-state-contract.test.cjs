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
assert.doesNotMatch(state,/select=scope,channel_id,status,name,thumbnail_url/);
assert.match(state,/avatars:\s*\{\}/);
assert.match(state,/customSources:\s*\[\]/);

const refresh=fs.readFileSync(path.join(root,'supabase','functions','yt1988-refresh','index.ts'),'utf8');
assert.doesNotMatch(refresh,/source_name/);
assert.doesNotMatch(refresh,/previous\?\.thumbnail_url/);
assert.doesNotMatch(refresh,/yt1988_source_state[\s\S]{0,220}name,thumbnail_url/);
assert.match(refresh,/yt1988_channel_directory[\s\S]{0,260}select=channel_id,name,thumbnail_url/);
assert.match(refresh,/function stripChannelIdentityForCache\(/);
assert.match(refresh,/items:stripChannelIdentityRowsForCache\(entry\?\.items\)/);
assert.match(refresh,/_sourceName,/);
assert.match(refresh,/_sourceThumbnailUrl,/);
assert.match(refresh,/uploaderAvatar,/);
assert.match(refresh,/uploaderUrl,/);
assert.match(refresh,/uploaderVerified,/);
assert.match(refresh,/channelThumbnailUrl,/);

console.log('source-state contract ok');
