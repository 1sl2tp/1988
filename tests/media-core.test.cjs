const assert = require('node:assert/strict');
const {
  buildNativeMediaUrl,
  modeUsesAudio,
  modeUsesVideo,
  activeTimeForMode,
  pipMethod,
} = require('../src/media-core.js');

const BASE='https://example.supabase.co/functions/v1/yt1988';

assert.equal(
  buildNativeMediaUrl(BASE,'jfKfPfyJRdk','video'),
  BASE+'?action=media&id=jfKfPfyJRdk&kind=video'
);
assert.equal(
  buildNativeMediaUrl(BASE,'jfKfPfyJRdk','audio'),
  BASE+'?action=media&id=jfKfPfyJRdk&kind=audio'
);
assert.throws(()=>buildNativeMediaUrl(BASE,'bad','video'),/invalid_video_id/);
assert.throws(()=>buildNativeMediaUrl(BASE,'jfKfPfyJRdk','other'),/invalid_media_kind/);

assert.equal(modeUsesAudio('audio'),true);
assert.equal(modeUsesAudio('lock'),true);
assert.equal(modeUsesAudio('video'),false);
assert.equal(modeUsesAudio('pip'),false);
assert.equal(modeUsesVideo('video'),true);
assert.equal(modeUsesVideo('pip'),true);
assert.equal(modeUsesVideo('audio'),false);
assert.equal(modeUsesVideo('lock'),false);

assert.equal(activeTimeForMode('audio',12.5,44.25),44.25);
assert.equal(activeTimeForMode('lock',12.5,44.25),44.25);
assert.equal(activeTimeForMode('video',12.5,44.25),12.5);
assert.equal(activeTimeForMode('pip',12.5,44.25),12.5);

assert.equal(pipMethod({requestPictureInPicture(){}},{pictureInPictureEnabled:true}),'standard');
assert.equal(pipMethod({
  webkitSupportsPresentationMode(mode){return mode==='picture-in-picture';},
  webkitSetPresentationMode(){}
},{}),'webkit');
assert.equal(pipMethod({},{}),'none');

console.log('media-core: 18 assertions passed');
