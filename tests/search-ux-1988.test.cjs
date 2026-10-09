const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'sources','sources.js'),'utf8');
const html=fs.readFileSync(path.join(root,'sources','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'sources','sources.css'),'utf8');

// One existing MAIN speech owner, never a second search/crawler engine.
assert.equal((main.match(/function startVoiceSearch\(/g)||[]).length,1);
assert.match(main,/searchInput\.addEventListener\("focus",selectExistingSearchQuery\)/);
assert.match(main,/searchInput\.addEventListener\("click",selectExistingSearchQuery\)/);
assert.match(main,/recognition\.interimResults=false/);
assert.match(main,/if\(submitted\|\|voiceRecognition!==recognition\)return/);
assert.match(main,/if\(finalText\.trim\(\)&&!submitted\)/);

// Channel/video form & source-name search must retain separate existing owners.
assert.match(html,/id="voiceSearch"[^>]*type="button"/);
assert.match(html,/id="sourceManagerVoice"[^>]*type="button"/);
assert.match(html,/id="searchInput"[^>]*type="search"/);
assert.match(html,/id="sourceManagerSearch"[^>]*type="search"/);
assert.match(source,/function startSourceVoice\(input,button,commit\)/);
assert.match(source,/recognition\.lang="vi-VN"/);
assert.match(source,/recognition\.interimResults=false/);
assert.match(source,/if\(sourceVoiceSession!==session\|\|session\.committed\)return/);
assert.match(source,/session\.committed=true/);
assert.match(source,/el\.searchForm\.requestSubmit\(\)/);
assert.match(source,/new Event\("submit",\{bubbles:true,cancelable:true\}\)/);
assert.match(source,/new Event\("input",\{bubbles:true\}\)/);
assert.match(source,/el\.searchInput,el\.sourceManagerSearch/);
assert.match(source,/cancelSourceVoice\(\);[\s\S]*state\.searchMode=/);
assert.match(source,/if\(document\.hidden\)cancelSourceVoice\(\)/);
assert.doesNotMatch(source,/MediaRecorder\(|getUserMedia\(/);
assert.equal((source.match(/function startSourceVoice\(/g)||[]).length,1);
new Function(source);

// Leave access controls, offline package/YouTube LIVE data owners intact.
assert.match(html,/id="authPin" type="password"/);
assert.match(css,/grid-template-columns:minmax\(0,1fr\) 38px 43px/);
assert.match(css,/\.source-manager-search-wrap\{/);
assert.match(css,/@media\(hover:none\) and \(pointer:coarse\)/);
let braces=0;
for(const ch of css){if(ch==='{')braces++;if(ch==='}')braces--;}
assert.equal(braces,0);
console.log('1988 search UX contract PASS — main + source manager, no extra provider owner');
