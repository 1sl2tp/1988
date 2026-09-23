const assert=require('node:assert/strict');
const fs=require('node:fs');

const server=fs.readFileSync('backend/ytdlp/server.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');

assert.match(server,/spawn\(['"]yt-dlp['"]/);
assert.match(server,/best\[ext=mp4\]\[vcodec!=none\]\[acodec!=none\]/);
assert.match(server,/bestaudio\[ext=m4a\]\/bestaudio/);
assert.match(server,/stdout\.pipe\(res\)/);
assert.match(server,/app\.get\(['"]\/stream['"]/);
assert.match(server,/app\.get\(['"]\/audio['"]/);
assert.doesNotMatch(app,/one988-audio\.onrender\.com/);
assert.doesNotMatch(app,/one988-1od3\.onrender\.com/);
assert.doesNotMatch(app,/AUDIO_PROXY/);
assert.match(app,/audio_resolve/);
assert.match(app,/new YT\.Player/);

console.log('node-stream-v4: 11 assertions passed');
