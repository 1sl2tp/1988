'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');

test('video card keeps its thumbnail while selected, even with legacy inline-playing class',()=>{
  assert.match(html,/const opened=selectedMeta\?openMedia\(selectedMeta\):false;/);
  assert.match(html,/returnPlayerToMainStage\(\);\s*layout\(\);/);
  assert.match(html,/\.row-thumb\.inline-playing:not\(\.pip-floating\) > img,[\s\S]{0,150}visibility:visible;/);
  assert.doesNotMatch(html,/\.row-thumb\.inline-playing:not\(\.pip-floating\) > img,[\s\S]{0,150}visibility:hidden;/);
  assert.match(html,/'<img src="'\+escapeHtml\(thumb\)/);
  assert.match(html,/rememberRenderedThumbs\(rows\);[\s\S]{0,230}rows\.innerHTML=feedHeaderMarkup/);
  assert.match(html,/restoreRenderedThumbs\(rows\);/);
});

test('package-localized Vietnamese titles display; no client-invented translations',()=>{
 const start=html.indexOf('  function videoDisplayTitle(');
 const end=html.indexOf('  function cardMarkup(',start);
 assert(start>=0&&end>start);
 const videoDisplayTitle=vm.runInNewContext(html.slice(start,end)+'\nvideoDisplayTitle;');
 assert.equal(videoDisplayTitle({title:'Original',titleVi:'Tiêu đề tiếng Việt chính thức'}),
   'Tiêu đề tiếng Việt chính thức');
 assert.equal(videoDisplayTitle({title:'Original',localizedTitleVi:'Bản địa hoá hợp lệ'}),'Bản địa hoá hợp lệ');
 assert.equal(videoDisplayTitle({title:'Untranslated English title'}),'Untranslated English title');
 assert.doesNotMatch(html,/const knownVietnameseTitles=/);
 assert.doesNotMatch(html,/function localizeVisibleEnglishTitles\(/);
 assert.match(html,/const originalTitle=meta\.title \|\| current\.label/);
 assert.match(html,/title="'\+escapeHtml\(originalTitle\)/);
});

test('LIVE feed owner is canonical package, not browser Cloudflare snapshot',()=>{
 assert.match(html,/feedMetas=Array\.isArray\(baseMetas\)\?baseMetas:\[\]/);
 assert.match(html,/feedMetas=startupVisibleMetas\(scope,base\)/);
 assert.match(html,/paintSyncedPackage\("live",packageCache\.get\("live"\)\|\|\[\]\)/);
 assert.match(html,/return Array\.isArray\(fallback\)\?fallback:\[\];/);
 assert.doesNotMatch(html,/function syncVerifiedLiveSnapshot\(/);
});

test('LIVE discovery is demand-only; server wakes canonical package build',()=>{
 assert.match(html,/runYoutubeLiveCycle\(\{force,paint:false\}\)/);
 assert.match(html,/syncPreparedPackages\(\["live"\]\)/);
 assert.match(html,/refreshUnifiedLiveInBackground\(\{/);
 assert.doesNotMatch(html,/syncVerifiedLiveSnapshot\(/);
});
