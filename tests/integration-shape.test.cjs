const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=process.argv[2]||'.';
const html=fs.readFileSync(root+'/index.html','utf8');
const app=fs.readFileSync(root+'/src/app.js','utf8');

assert.match(html,/id="yt-player"/);
assert.match(html,/id="nativePlayer"/);
assert.match(html,/id="topicChips"/);
assert.match(html,/youtube\.com\/iframe_api/);
assert.match(html,/id="pipBtn"/);
assert.match(html,/id="lockBtn"/);
assert.match(app,/new YT\.Player/);
assert.match(app,/youtube-nocookie\.com/);
assert.doesNotMatch(app,/videoMediaUrl\(id\)/);
assert.doesNotMatch(app,/mainVideo/);
assert.match(app,/local\.media\(id,"audio"\)/);
assert.match(app,/function setupMediaSession\(/);

console.log('integration-shape: 12 assertions passed');
