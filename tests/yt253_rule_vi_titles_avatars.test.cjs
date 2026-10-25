'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const server=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
const ui=fs.readFileSync('index.html','utf8');

test('server excludes untranslated English titles from every default package',()=>{
 const begin=server.indexOf('const VI_TITLE_WORDS=new Set(');
 const end=server.indexOf('function titleLooksBroken(',begin);
 assert(begin>=0&&end>begin);
 const normalizeText=value=>String(value||'').normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase()
   .replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
 const clean=(x,max=1000)=>String(x??'').replace(/\s+/g,' ').trim().slice(0,max);
 const classify=vm.runInNewContext((server.slice(begin,end)+'\ntitleLooksEnglishOnly;').replace(/:any\b/g,''),{
   Set,normalizeText,clean
 });
 for(const title of [
   'Pop Hits Radio | Live Pop Radio | Top Hits 2026 | New Songs 2026',
   'Heavy Rain on a Tin Roof for Sleeping 24/7',
   'CRUSHING ON TAKEN FLOWER | The Cunning Village Boy - Part 2'
 ])assert.equal(classify({title}),true,'English title should be excluded: '+title);
 for(const title of [
   'TRỰC TIẾP: Tin tức thời sự Việt Nam hôm nay',
   'BÀ NỘI NGHÈO KHÔNG CÓ TIỀN CHO CHÁU',
   'Trại Làng Lắm Chiêu | Phần 2',
   'Tiếng Việt không thể nhầm với the'
 ])assert.equal(classify({title}),false,'Vietnamese title must remain: '+title);
 assert.match(server,/if\(titleLooksEnglishOnly\(r\)&&!localizedVi\)return false;/);
 assert.match(server,/LIVE_PIPELINE_VERSION="[^"]*vi-only"/);
 assert.match(server,/NON_LIVE_PIPELINE_VERSION="[^"]*vi-only"/);
});

test('missing channel avatars repair only at backend metadata/DB owner',()=>{
 assert.match(server,/LIVE_MISSING_AVATAR_LOOKUPS_PER_RUN=4/);
 assert.match(server,/channel_id,name,thumbnail_url,profile_checked_at/);
 assert.match(server,/\.slice\(0,LIVE_MISSING_AVATAR_LOOKUPS_PER_RUN\)/);
 assert.match(server,/mapLimit\(missing,2/);
 assert.match(server,/\/functions\/v1\/yt1988\?action=channel&id=/);
 assert.match(server,/rpc\/yt1988_upsert_channel_directory/);
 assert.match(server,/thumbnail_url:avatar/);
 assert.match(ui,/function avatarMarkup\(meta,eager=false\)/);
 assert.match(ui,/sourceAvatar:String\(meta\?\.sourceAvatar\|\|""\)/);
 assert.match(ui,/class="row-avatar placeholder"/);
 assert.doesNotMatch(ui,/fetch\([^\n]*yt1988_upsert_channel_directory/);
});

test('stale package English titles are labeled as awaiting real Vietnamese localization',()=>{
 const start=ui.indexOf('  function untranslatedEnglishFeedTitle(');
 const end=ui.indexOf('  function cardMarkup(',start);
 assert(start>=0&&end>start);
 const ctx={Set,feedMode:'package'};
 vm.createContext(ctx);
 vm.runInContext(ui.slice(start,end),ctx);
 const english=[
   'HIRED A TUTOR FOR 100K AN HOUR, BUT THE PARENT SLASHED THE PAY IN HALF | DRAMA',
   'October 20th - When Men Are the Weaker Sex | Two Brothers Part 1178 | Funny Situations by Gãy Media',
   'CRUSHING ON TAKEN FLOWER | The Cunning Village Boy - Part 2 | Funny Gãy TV'
 ];
 for(const title of english){
   assert.equal(ctx.videoDisplayTitle({title}),'Đang cập nhật tiêu đề tiếng Việt');
   assert.equal(ctx.videoDisplayTitle({title,titleVi:'Tiêu đề tiếng Việt đã xác minh'}),'Tiêu đề tiếng Việt đã xác minh');
 }
 assert.equal(ctx.videoDisplayTitle({title:'BÀ NỘI NGHÈO KHÔNG CÓ TIỀN CHO CHÁU'}),'BÀ NỘI NGHÈO KHÔNG CÓ TIỀN CHO CHÁU');
 assert.equal(ctx.videoDisplayTitle({title:'Tin tuc Viet Nam hom nay'}),'Tin tuc Viet Nam hom nay');
 ctx.feedMode='search';
 assert.equal(ctx.videoDisplayTitle({title:english[0]}),english[0],'user-initiated search retains original title');
});

test('missing prepared avatar uses only same-channel ID and bounded visible profile fallback',()=>{
 assert.match(ui,/const exact=authoritative&&\/\^UC\[A-Za-z0-9_-\]\+\$\/\.test\(sourceId\)/);
 assert.match(ui,/sourceAvatar:String\(meta\?\.sourceAvatar\|\|exact\?\.sourceAvatar\|\|""\)/);
 assert.match(ui,/const FEED_AVATAR_REPAIRS_PER_OPEN=2/);
 assert.match(ui,/feedAvatarRepairAttempted\.has\(sourceId\)/);
 assert.match(ui,/hydrateYoutubeDiscoveredChannelProfile\(meta,"visible-feed-avatar"\)/);
 assert.doesNotMatch(ui,/fetch\([^\n]*yt1988_upsert_channel_directory/);
});
