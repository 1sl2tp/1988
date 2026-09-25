const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=process.argv[2]||'.';
const html=fs.readFileSync(root+'/index.html','utf8');
const app=fs.readFileSync(root+'/src/app.js','utf8');

assert.match(html,/id="yt-player"/);
assert.match(html,/id="nativePlayer"/);
assert.match(html,/id="topicChips"/);
assert.match(html,/youtube\.com\/iframe_api/);
assert.doesNotMatch(html,/id="pipBtn"/);
assert.match(html,/id="lockBtn"/);
assert.match(app,/new YT\.Player/);
assert.match(app,/youtube-nocookie\.com/);
assert.doesNotMatch(app,/videoMediaUrl\(id\)/);
assert.doesNotMatch(app,/mainVideo/);
assert.match(app,/local\.media\(id,"audio"\)/);
assert.match(app,/function setupMediaSession\(/);
assert.match(app,/const LIVE_SOURCE_SCOPE="live"/);
assert.match(app,/const LATEST_SOURCE_SCOPE="latest"/);
assert.match(app,/const WEEK_SOURCE_SCOPE="week"/);
assert.match(app,/\{key:LATEST_SOURCE_SCOPE,label:"Mới nhất"\}/);
assert.match(app,/\{key:WEEK_SOURCE_SCOPE,label:"Tuần này"\}/);
assert.match(app,/selectedSourceFeed\([\s\S]*LATEST_SOURCE_SCOPE/);
assert.match(app,/selectedSourceFeed\([\s\S]*WEEK_SOURCE_SCOPE/);
assert.match(app,/state\.activeFeed===LIVE_SOURCE_SCOPE\)return LIVE_SOURCE_SCOPE/);
assert.doesNotMatch(app,/\{key:"general",label:"Mới nhất\/Tuần này"\}/);

console.log('integration-shape: 21 assertions passed');
