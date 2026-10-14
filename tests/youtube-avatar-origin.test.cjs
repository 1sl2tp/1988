'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const html=fs.readFileSync('index.html','utf8');
const producer=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
const meta=fs.readFileSync('src/media-meta.js','utf8');
const extract=(s,start,next)=>{
  const i=s.indexOf(start);assert(i>=0,start);
  const j=s.indexOf(next,i+start.length);assert(j>i,next);
  return s.slice(i,j);
};
const proxy='https://piped-proxy.ducks.party/AVATAR=s88-c-k-c0x00ffffff-no-rw?host=yt3.googleusercontent.com';
const direct='https://yt3.googleusercontent.com/AVATAR=s88-c-k-c0x00ffffff-no-rw';
const upgraded='https://yt3.googleusercontent.com/AVATAR=s160-c-k-c0x00ffffff-no-rw';
const nonGoogle='https://cdn.example.org/avatar.jpg';
test('browser renders authoritative package avatar at its actual YouTube origin',()=>{
  const part=extract(html,'  function displayYoutubeAvatarUrl(raw=""){','  function avatarMarkup(meta,eager=false){');
  const c=vm.createContext({URL});
  vm.runInContext(part,c);
  assert.equal(vm.runInContext('displayYoutubeAvatarUrl('+JSON.stringify(proxy)+')',c),direct);
  assert.equal(vm.runInContext('displayYoutubeAvatarUrl('+JSON.stringify(direct)+')',c),direct);
  assert.equal(vm.runInContext('displayYoutubeAvatarUrl('+JSON.stringify(nonGoogle)+')',c),nonGoogle);
  assert.match(html,/const authoritative=packageYoutubeIdentityAuthoritative\(meta\);/);
  assert.match(html,/const avatar=displayYoutubeAvatarUrl\(identity\?\.sourceAvatar\|\|""\);/);
  assert.match(html,/data-avatar-letter/);
  assert.match(html,/img\.matches\("\.row-avatar,\.info-avatar"\)/);
  assert.match(html,/img\.replaceWith\(fallback\);/);
});
test('new packages store the YouTube URL rather than the intermediary proxy',()=>{
  const part=extract(producer,'function normalizeAvatarUrl(value:any){','function normalizeText(value:any){');
  const c=vm.createContext({URL,clean:(x,n=1000)=>String(x||'').trim().slice(0,n)});
  vm.runInContext(stripTypeScriptTypes(part),c);
  const f=c.normalizeAvatarUrl;
  assert.equal(f(proxy),upgraded);
  assert.equal(f(nonGoogle),nonGoogle);
  const piped='https://proxy.piped.private.coffee/AVATAR=s160?host=yt3.ggpht.com';
  assert.equal(f(piped),'https://yt3.ggpht.com/AVATAR=s160');
});
test('video/channel discovery normalizes the same avatar without a new API request',()=>{
  const part=extract(meta,"  function normalizeAvatarUrl(value=''){","  function ");
  const c=vm.createContext({URL,clean:x=>String(x||'').trim(),normalizeImageUrl:x=>String(x||'')});
  vm.runInContext(part,c);
  assert.equal(c.normalizeAvatarUrl(proxy),upgraded);
  assert.equal(c.normalizeAvatarUrl(nonGoogle),nonGoogle);
});
