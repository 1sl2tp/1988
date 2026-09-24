const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('src/app.js','utf8');
const bg=fs.readFileSync('src/html5-background.js','utf8');

// Current background-audio contract: the page delegates resolving/caching/
// activation to Html5BackgroundPlayer instead of calling the old audio_resolve
// endpoint directly from app.js.
assert.match(app,/backgroundPlayer\.select\(id/);
assert.match(app,/backgroundPlayer\.arm\(id/);
assert.match(app,/backgroundPlayer\.prepare\(id\)/);
assert.match(app,/backgroundPlayer\.activate\(id/);
assert.match(app,/backgroundPlayer\.hasPrepared\(id\)/);
assert.match(app,/backgroundPlayer\.forget\(id\)/);
assert.match(app,/time:getVideoTime\(\)/);
assert.match(app,/restoreVideoAfterAudioFailure/);
assert.doesNotMatch(app,/PIPED_AUDIO_APIS/);
assert.doesNotMatch(app,/AUDIO_PROXY/);

assert.match(bg,/audio\/mpeg/);
assert.match(bg,/audio_start_timeout"\),15000/);
assert.match(bg,/preparePromises=new Map/);
assert.match(bg,/forget\(id\)/);
assert.match(bg,/this\.sourceCache\.delete\(id\);\n\s+throw lastError/);

console.log('background-resolver: 15 assertions passed');
