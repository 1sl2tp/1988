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

test('YT-09: channel logos are restored from one versioned library independently of feed packages',()=>{
 assert.match(ui,/const CHANNEL_LOGO_LIBRARY_CACHE_KEY="yt1988-channel-logo-library-v1"/);
 assert.match(ui,/restoreSharedChannelLogoLibrary\(\);\s*loadExistingSourceNames\(\)/);
 assert.match(ui,/SOURCE_STATE_URL\+"\?view=library"/);
 assert.match(ui,/cachedChannelLogoManifest\(\)\?\.libraryHash/);
 assert.match(ui,/channelLogoLibraryPending/);
 assert.match(ui,/channelLogoLibraryHash===nextHash/);
 assert.match(ui,/saveSharedChannelLogoLibrary\(payload\)/);
 assert.match(ui,/function primeUnifiedChannelLibrary\(remote=\{\}\)\{\s*\/\/ Merge/);
 assert.match(ui,/queueYoutubeChannelDirectory\(meta,source\)/);
 assert.match(ui,/function watchMissingChannelLogos\(rows\)/);
 assert.match(ui,/failedChannelLogoUrls\.add/);
 assert.match(ui,/queueDiscoveredYoutubeHydration\(\[meta\],"visible-feed-avatar"\)/);
 assert.doesNotMatch(ui,/channelLibraryByKey\.clear\(\)/);
});

test('YT-09: shared logo directory restores from cache, uses manifest hash, and single-flights library fetch',async()=>{
 const begin=ui.indexOf('  const CHANNEL_LOGO_LIBRARY_CACHE_KEY=');
 const end=ui.indexOf('  function channelDirectorySignature(',begin);
 assert(begin>=0&&end>begin);
 const key='yt1988-channel-logo-library-v1';
 const cache=new Map([
   ['yt1988-source-state-manifest-v1',JSON.stringify({libraryHash:'h1'})],
   [key,JSON.stringify({hash:'h1',channels:[{
     id:'UC1234567890123456789AA',name:'Cú Đêm Review',
     avatar:'https://yt3.googleusercontent.com/logo1',checkedAt:''
   }]})]
 ]);
 const channelById=new Map();
 let fetches=0;
 const ctx={
   JSON,Map,Set,Number,String,Date,Promise,
   SOURCE_STATE_MANIFEST_CACHE_KEY:'yt1988-source-state-manifest-v1',
   SOURCE_STATE_URL:'https://example.invalid/state',
   localStorage:{
     getItem:k=>cache.get(k)||null,
     setItem:(k,v)=>cache.set(k,v)
   },
   primeUnifiedChannelLibrary:payload=>{
     for(const channel of payload.channelLibrary||[]){
       if(channel.platform==='youtube')channelById.set(channel.id,channel);
     }
   },
   fetch:async url=>{
     fetches++;
     assert.equal(url,'https://example.invalid/state?view=library');
     return {ok:true,json:async()=>({
       ok:true,view:'library',libraryHash:'h2',channelLibrary:[
         {platform:'youtube',id:'UC1234567890123456789AA',
          name:'Cú Đêm Review',avatar:{url:'https://yt3.googleusercontent.com/logo2'}},
         {platform:'tiktok',id:'not-channel',avatar:{url:'https://example.invalid/a'}}
       ]
     })};
   }
 };
 vm.createContext(ctx);
 vm.runInContext(ui.slice(begin,end),ctx);
 assert.equal(vm.runInContext('restoreSharedChannelLogoLibrary()',ctx),true);
 assert.equal(channelById.get('UC1234567890123456789AA').avatar.url,'https://yt3.googleusercontent.com/logo1');
 assert.equal(await vm.runInContext('refreshSharedChannelLogoLibrary()',ctx),true);
 assert.equal(fetches,0,'matching manifest hash does not download full library');
 cache.set('yt1988-source-state-manifest-v1',JSON.stringify({libraryHash:'h2'}));
 await Promise.all([
   vm.runInContext('refreshSharedChannelLogoLibrary()',ctx),
   vm.runInContext('refreshSharedChannelLogoLibrary()',ctx)
 ]);
 assert.equal(fetches,1,'one shared library request for the changed revision');
 assert.equal(channelById.get('UC1234567890123456789AA').avatar.url,'https://yt3.googleusercontent.com/logo2');
 assert.equal(JSON.parse(cache.get(key)).hash,'h2');
 assert.equal(JSON.parse(cache.get(key)).channels.length,1,'only YouTube channels stored');
 assert.equal(await vm.runInContext('refreshSharedChannelLogoLibrary()',ctx),true);
 assert.equal(fetches,1,'no refetch of unchanged revision');
});
