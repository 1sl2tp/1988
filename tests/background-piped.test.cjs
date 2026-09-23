const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('src/app.js','utf8');
const bg=fs.readFileSync('src/html5-background.js','utf8');

assert.match(app,/api\("audio_resolve",\{id\},40000\)/);
assert.match(app,/mimeType:String\(row\.mimeType\|\|"audio\/mpeg"\)/);
assert.match(app,/priority:1000/);
assert.match(app,/engine:String\(row\.engine\|\|"loader-to"\)/);
assert.doesNotMatch(app,/PIPED_AUDIO_APIS/);
assert.doesNotMatch(app,/AUDIO_PROXY/);
assert.match(app,/backgroundPlayer\.arm\(id/);
assert.match(app,/time:getVideoTime\(\)/);
assert.match(app,/restoreVideoAfterAudioFailure/);
assert.match(app,/pauseVideoEngine\(\);\n\s+statusText\.textContent=state\.mode===/);
assert.match(bg,/audio\/mpeg/);
assert.match(bg,/audio_start_timeout"\),15000/);
assert.match(bg,/preparePromises=new Map/);
assert.match(bg,/forget\(id\)/);
assert.match(bg,/this\.sourceCache\.delete\(id\);\n\s+throw lastError/);

console.log('background-resolver: 15 assertions passed');
