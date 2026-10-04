'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');
const search=fs.readFileSync(path.join(root,'supabase','functions','yt1988-search','index.ts'),'utf8');

assert.match(app,/const SEARCH_BASE=.*yt1988-search/);
assert.match(app,/async function sourceExternalSearch\(/);
assert.match(app,/cache:"default"/);
assert.match(app,/SOURCE_EXTERNAL_SEARCH_TTL=5\*60\*1000/);
assert.doesNotMatch(app,/sourceSearchTimer=setTimeout\(\(\)=>void searchSourceChannels\(q\),120\)/);
assert.doesNotMatch(app,/sourcePreviewSearchTimer=setTimeout\(\(\)=>void searchPreviewVideos\(q\),120\)/);
assert.doesNotMatch(app,/sourceSearchAlternates\(q\)/);
assert.doesNotMatch(app,/source_video_timeout/);
assert.doesNotMatch(app,/preview_video_timeout/);

assert.match(search,/candidates\.length>=4/);
assert.match(search,/CACHE_TTL=5\*60\*1000/);
assert.match(search,/STALE_TTL=30\*60\*1000/);
assert.match(search,/lastErrorLogAt/);
assert.doesNotMatch(search,/Promise\.any/);

console.log('search resource contract ok');
