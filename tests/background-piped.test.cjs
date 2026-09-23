const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('src/app.js','utf8');
const bg=fs.readFileSync('src/html5-background.js','utf8');

assert.match(app,/https:\/\/pipedapi\.ducks\.party/);
assert.match(app,/https:\/\/api\.piped\.private\.coffee/);
assert.match(app,/\.videoOnly===true/);
assert.match(app,/LBRY/);
assert.match(app,/player\.odycdn\.com/);
assert.match(app,/mimeType:mime\.includes\("mp4"\)\?"audio\/mp4"/);
assert.match(app,/AUDIO_PROXY\+"\/audio"/);
assert.doesNotMatch(app,/AUDIO_PROXY\+"\/stream"/);
assert.match(app,/pauseVideoEngine\(\);\n\s+statusText\.textContent=state\.mode===/);
assert.match(app,/backgroundPlayer\.arm\(id/);
assert.match(app,/time:getVideoTime\(\)/);
assert.match(app,/restoreVideoAfterAudioFailure/);
assert.match(bg,/preparePromises=new Map/);
assert.match(bg,/forget\(id\)/);
assert.match(bg,/x\.priority\*1e12/);
assert.match(bg,/this\.sourceCache\.delete\(id\);\n\s+throw lastError/);

console.log('background-piped: 16 assertions passed');
