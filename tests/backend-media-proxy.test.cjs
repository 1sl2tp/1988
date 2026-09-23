const assert=require('node:assert/strict');
const fs=require('node:fs');
const server=fs.readFileSync('backend/ytdlp/server.py','utf8');
const app=fs.readFileSync('src/app.js','utf8');

assert.match(server,/@app\.route\("\/video"/);
assert.match(server,/@app\.route\("\/media"/);
assert.match(server,/@app\.route\("\/stream"/);
assert.match(server,/YTDLP_PROXY/);
assert.match(server,/YTDLP_COOKIES_B64/);
assert.match(server,/Range/);
assert.match(server,/Content-Range/);
assert.match(server,/return media_response\(video_id, "video"\)/);
assert.ok(!app.includes('AUDIO_PROXY'));
assert.match(app,/MediaCore\.buildNativeMediaUrl\(BASE,id,"audio"\)/);

console.log('backend-media-proxy: 10 assertions passed');
