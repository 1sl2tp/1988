'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src','app.js'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase','functions','yt1988','index.ts'),'utf8');

assert.match(app,/Chưa có trong thư viện · Enter để tìm YouTube/);
assert.doesNotMatch(app,/sourceSearchTimer=setTimeout\(\(\)=>void searchSourceChannels\(q\),120\)/);
assert.doesNotMatch(app,/sourcePreviewSearchTimer=setTimeout\(\(\)=>void searchPreviewVideos\(q\),120\)/);
assert.match(app,/filter:"all"[\s\S]{0,250}One bounded fallback|filter:"all"/);
assert.match(app,/L0 only while typing/);
assert.match(app,/L2 after commit/);

assert.match(edge,/async function pipedSearch\(/);
assert.match(edge,/candidates\.length>=4/);
assert.doesNotMatch(edge,/pipedSearch[\s\S]{0,1200}raceApis\(/);
assert.match(edge,/getStaleUpstreamCache\(path,30 \* 60 \* 1000\)/);
assert.match(edge,/maxAge = 300;/);
assert.match(edge,/yt1988_search_upstream_unavailable/);

console.log('search resource contract ok');
