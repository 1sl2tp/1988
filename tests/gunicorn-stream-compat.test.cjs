const assert=require('node:assert/strict');
const fs=require('node:fs');
const server=fs.readFileSync('backend/ytdlp/server.py','utf8');

assert.match(server,/subprocess\.Popen/);
assert.match(server,/@app\.route\("\/stream"/);
assert.match(server,/request\.args\.get\("v"\)/);
assert.match(server,/best\[ext=mp4\]\[vcodec!=none\]\[acodec!=none\]/);
assert.match(server,/bestaudio\[ext=m4a\]\/bestaudio/);
assert.match(server,/X-1988-Stream/);
assert.match(server,/"videoMode": "muxed-av"/);

console.log('gunicorn-stream-compat: 7 assertions passed');
