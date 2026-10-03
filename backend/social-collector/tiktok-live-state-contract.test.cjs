const assert=require('node:assert/strict');
const fs=require('node:fs');

const server=fs.readFileSync('backend/social-collector/server.mjs','utf8');

assert.match(server,/function isTikTokConfirmedLiveStatus\(/,
  'one canonical confirmed-LIVE predicate is required');
assert.match(server,/function tiktokPublishedLiveNow\(/,
  'one canonical publishable-LIVE predicate is required');

assert.doesNotMatch(
  server,
  /HARD LOCK[\s\S]{0,500}tiktokRealtimeLiveHandles\.has\(key\).*allowLiveRemoval/,
  'stored/library LIVE must not be sticky via the old HARD LOCK'
);

assert.match(
  server,
  /const liveEvidence=evidence\.find\(x=>x\.known&&x\.live\)\|\|null;[\s\S]{0,200}const liveRoomId=String\(liveEvidence\?\.roomId\|\|''\);/,
  'LIVE sweep must derive roomId from the positive evidence before storing it'
);

assert.match(
  server,
  /retained-after-unknown[\s\S]{0,240}live:false[\s\S]{0,160}status:'unknown'[\s\S]{0,160}probeState:'unknown'/,
  'UNKNOWN may keep media warm internally but must not keep the library marked LIVE'
);

const storedStart=server.indexOf('function buildTikTokStoredRows()');
const storedEnd=server.indexOf('async function persistTikTokLiveStore',storedStart);
assert.ok(storedStart>=0&&storedEnd>storedStart,'stored LIVE builder missing');
const stored=server.slice(storedStart,storedEnd);
assert.match(stored,/const detectedLive=tiktokConfirmedLiveNow\(handle/,'persistence may retain API detection separately');
assert.match(stored,/const live=tiktokPublishedLiveNow\(handle/,'persistence LIVE must mean verified live link');
assert.match(stored,/const playable=live/,'verified LIVE and playable must share one final truth');
assert.doesNotMatch(stored,/\|\|Boolean\(item\.live\)/,'persistence must never OR in stale library LIVE');

for(const route of ['/tiktok/live-now','/tiktok/live-library']){
  const start=server.indexOf("if(url.pathname==='"+route+"'");
  assert.ok(start>=0,route+' route missing');
  const end=server.indexOf("\n  if(url.pathname==='",start+10);
  const block=server.slice(start,end>start?end:start+5000);
  assert.match(block,/tiktokPublishedLiveNow\(handle,now\)/,
    route+' must return only LIVE rows with a currently verified live link');
}


const membershipStart=server.indexOf('async function setTikTokManagedMembership');
const membershipEnd=server.indexOf('async function loadTikTokLiveStore',membershipStart);
const membership=server.slice(membershipStart,membershipEnd);
assert.doesNotMatch(
  membership,
  /yt1988_tiktok_live_selected/,
  'selected membership must have one canonical table, not a compatibility mirror'
);

const livePersistStart=server.indexOf('async function persistTikTokLiveStore');
const livePersistEnd=server.indexOf('function ensureTikTokLivePackageScan',livePersistStart);
const livePersist=server.slice(livePersistStart,livePersistEnd);
assert.doesNotMatch(
  livePersist,
  /items:rows\.map/,
  'LIVE singleton package must not duplicate every channel row'
);

const videoPersistStart=server.indexOf('async function persistTikTokVideoStore');
const videoPersistEnd=server.indexOf('async function refreshAllTikTokChannelProfiles',videoPersistStart);
const videoPersist=server.slice(videoPersistStart,videoPersistEnd);
assert.doesNotMatch(
  videoPersist,
  /channels:rows\.map/,
  'video singleton package must stay summary-only'
);

const canonicalVideoStart=server.indexOf('function canonicalPackageVideo');
const canonicalVideoEnd=server.indexOf('function buildTikTokCanonicalPackage',canonicalVideoStart);
const canonicalVideo=server.slice(canonicalVideoStart,canonicalVideoEnd);
assert.doesNotMatch(
  canonicalVideo,
  /playback\s*:/,
  'browser library package must not contain rotating signed MP4 URLs'
);

const mp4PersistStart=server.indexOf('async function persistTikTokCanonicalMp4Source');
const mp4PersistEnd=server.indexOf('function collectTikTokOriginPlayUrls',mp4PersistStart);
const mp4Persist=server.slice(mp4PersistStart,mp4PersistEnd);
assert.doesNotMatch(
  mp4Persist,
  /upsertTikTokCanonicalRows|mp4_url\s*=/,
  'signed MP4 URLs must stay RAM-only and never be written to canonical Supabase rows'
);
assert.match(server,/videos:'latest-10-per-channel'/,
  'TikTok canonical package must declare bounded 10-video retention');
assert.match(server,/async function pruneTikTokCanonicalVideos\(handles\)/,
  'TikTok canonical writes must have one bounded retention owner');
assert.match(server,/await pruneTikTokCanonicalVideos\(target\)/,
  'targeted channel sync must prune canonical history back to the latest 10');

console.log('tiktok-live-state-contract: assertions passed');


const auditStart=server.indexOf('async function runTikTokLiveAuditSweep()');
const auditEnd=server.indexOf("\nfunction ",auditStart+20);
const audit=server.slice(auditStart,auditEnd>auditStart?auditEnd:auditStart+7000);
assert.match(audit,/runTikTokLiveMinuteSweep\(\{targetHandles:selected,exhaustive:true\}\)/,
  'full LIVE audit must use the same canonical sweep in exhaustive mode');
assert.doesNotMatch(audit,/runTikTokBrowserDiscoveryBatch\(/,
  'full LIVE audit must not maintain a second independent LIVE definition');

assert.match(server,/function runTikTokLiveMinuteSweep\(\{targetHandles=null,exhaustive=false\}=\{\}\)/,
  'canonical sweep must support an explicit exhaustive mode');
assert.match(server,/const deepPick=exhaustive[\s\S]{0,180}\? coldTargets\.slice\(\)[\s\S]{0,180}: coldTargets\.length/,
  'exhaustive mode must deep-check every cold selected channel');


const quickStart=server.indexOf('async function quickTikTokLiveStateOnly(');
const quickEnd=server.indexOf('async function browserTikTokLiveStates(',quickStart);
const quick=server.slice(quickStart,quickEnd);
assert.match(quick,/if\(!liveRoom&&!?roomId\)[\s\S]{0,220}known:true[\s\S]{0,120}live:false[\s\S]{0,120}status:4/,
  'HTTP-success with no LIVE room must have one canonical OFFLINE meaning');

const detailStart=server.indexOf('async function quickTikTokLiveDetailStatus(');
const detailEnd=server.indexOf('async function quickTikTokRoomInfoStatus(',detailStart);
const detail=server.slice(detailStart,detailEnd);
assert.match(detail,/\.\.\.\(tiktokApiCookieHeader\?\{'cookie':tiktokApiCookieHeader\}:\{\}\)/,
  'LIVE detail request must send the refreshed TikTok cookie');

const sweepStart=server.indexOf('function runTikTokLiveMinuteSweep(');
const sweepEnd=server.indexOf('async function runTikTokLiveAuditSweep(',sweepStart);
const sweep=server.slice(sweepStart,sweepEnd);
assert.match(sweep,/if\(first\[i\]\?\.state\?\.known\)continue;/,
  'known LIVE or OFFLINE fingerprint must stop before deep checks');
assert.match(sweep,/evidence\.some\(x=>x\.known&&!x\.live&&Number\(x\.status\)===4\)/,
  'canonical status=4 must be sufficient OFFLINE evidence');


const mediaRefreshStart=server.indexOf('async function refreshTikTokLiveLibrary(');
const mediaRefreshEnd=server.indexOf('async function checkTikTokLiveWithYtDlp(',mediaRefreshStart);
const mediaRefresh=server.slice(mediaRefreshStart,mediaRefreshEnd);
assert.doesNotMatch(mediaRefresh,/tiktokRealtimeLiveHandles\.add\(/,
  'FLV refresh must never create LIVE state');
assert.doesNotMatch(mediaRefresh,/live:true[\s\S]{0,120}probeState:'live'/,
  'FLV refresh must never publish its own LIVE state');
assert.match(mediaRefresh,/filter\(handle=>tiktokConfirmedLiveNow\(handle/,
  'FLV refresh must only run for channels already confirmed LIVE by the canonical checker');

const packageScanStart=server.indexOf('function ensureTikTokLivePackageScan(');
const packageScanEnd=server.indexOf('let tiktokLiveMinuteSweepPromise=',packageScanStart);
const packageScan=server.slice(packageScanStart,packageScanEnd);
assert.match(packageScan,/runTikTokLiveMinuteSweep\(\{targetHandles:\[handle\],exhaustive:true\}\)/,
  'targeted add-channel LIVE check must enter the canonical checker first');



const sweepLinkStart=server.indexOf('function runTikTokLiveMinuteSweep(');
const sweepLinkEnd=server.indexOf('async function runTikTokLiveAuditSweep(',sweepLinkStart);
const sweepLink=server.slice(sweepLinkStart,sweepLinkEnd);
assert.match(sweepLink,/refreshTikTokLiveLibrary\(/,
  'LIVE discovery must resolve candidate live links on the server');
assert.match(sweepLink,/persistTikTokLiveStore\(/,
  'LIVE discovery must persist the verified result for UI consumption');

const refreshStart=server.indexOf('async function refreshTikTokLiveLibrary(');
const refreshEnd=server.indexOf('async function checkTikTokLiveWithYtDlp(',refreshStart);
const refresh=server.slice(refreshStart,refreshEnd);
assert.match(refresh,/confirmTikTokLibrarySource\(/,
  'TikTok candidate link must be probed before it can become LIVE');


assert.match(
  server,
  /const LEGACY_TIKTOK_FEED_COLLECT=String\(process\.env\.LEGACY_TIKTOK_FEED_COLLECT\|\|'0'\)==='1';/,
  'legacy TikTok feed polling must stay opt-in and off by default'
);
assert.match(
  server,
  /const RENDER_LIVE_BACKGROUND_SWEEP=String\(process\.env\.RENDER_LIVE_BACKGROUND_SWEEP\|\|'0'\)==='1';/,
  'Render recurring LIVE sweep must stay opt-in and off by default'
);
assert.doesNotMatch(
  server,
  /setInterval\(\(\)=>\{void ensureTikTokVideoPackageScan/,
  'TikTok video discovery must not poll in the Render background'
);
assert.doesNotMatch(
  server,
  /setInterval\(\(\)=>\{void refreshTikTokCanonicalProfile/,
  'TikTok profile metadata must refresh only for targeted demand'
);
assert.doesNotMatch(
  server,
  /setInterval\(\(\)=>\{void enrichNextTikTokCanonicalVideo/,
  'TikTok video enrichment must not run as a background timer'
);
assert.match(
  server,
  /async function schedulerTick\(\)\{[\s\S]{0,120}if\(!AUTO_COLLECT\|\|!LEGACY_TIKTOK_FEED_COLLECT\)return;/,
  'legacy browser feed collector must not run unless explicitly enabled'
);
assert.match(
  server,
  /if\(AUTO_COLLECT&&LEGACY_TIKTOK_FEED_COLLECT\)\{[\s\S]{0,260}schedulerTick/,
  'browser prewarm/scheduler must be gated behind the legacy collector flag'
);

const statusesRouteStart=server.indexOf("if(url.pathname==='/tiktok/live-statuses'");
const statusesRouteEnd=server.indexOf("\n  if(url.pathname==='/tiktok/live-now'",statusesRouteStart);
assert.ok(statusesRouteStart>=0&&statusesRouteEnd>statusesRouteStart,'live-statuses route missing');
const statusesRoute=server.slice(statusesRouteStart,statusesRouteEnd);
assert.match(
  statusesRoute,
  /!RENDER_LIVE_BACKGROUND_SWEEP\?false:/,
  'Cloudflare must own recurring LIVE status while Render stays read-only by default'
);

const originStreamStart=server.indexOf("if(url.pathname==='/tiktok/video-session-stream'");
const originStreamEnd=server.indexOf("\n  if(url.pathname==='/tiktok/video-session-link'",originStreamStart);
assert.ok(originStreamStart>=0&&originStreamEnd>originStreamStart,'video-session-stream route missing');
const originStreamRoute=server.slice(originStreamStart,originStreamEnd);
assert.match(
  originStreamRoute,
  /acquireRenderMediaProxy\(res\)/,
  'legacy origin media stream must use the same opt-in Render media-proxy gate'
);
assert.doesNotMatch(
  originStreamRoute,
  /acquireTikTokOriginMediaProxy\(res\)/,
  'origin media stream must not bypass the Render media-proxy gate'
);


const liveStatusesStart=server.indexOf("if(url.pathname==='/tiktok/live-statuses'");
const liveStatusesEnd=server.indexOf("\n  if(url.pathname==='/tiktok/live-now'",liveStatusesStart);
assert.ok(liveStatusesStart>=0&&liveStatusesEnd>liveStatusesStart,'live-statuses route missing');
const liveStatuses=server.slice(liveStatusesStart,liveStatusesEnd);
assert.match(liveStatuses,/secUid:String\(videoRow\.secUid\|\|canonical\.sec_uid\|\|''\)/,
  'LIVE status metadata must expose saved secUid to the edge checker');
assert.match(liveStatuses,/latestVideoId:String\(videoRow\.latestVideoId\|\|videoRow\.videos\?\.\[0\]\?\.id\|\|''\)/,
  'LIVE status metadata must expose only the saved latest video ID, without scanning');


const videoStoreLoadStart=server.indexOf('async function loadTikTokVideoStore()');
const videoStoreLoadEnd=server.indexOf('function buildTikTokVideoStoredRows()',videoStoreLoadStart);
const videoStoreLoad=server.slice(videoStoreLoadStart,videoStoreLoadEnd);
assert.doesNotMatch(videoStoreLoad,/yt1988_tiktok_video_channels\?select=[^\n]*videos/,'video channel state must not store detailed video arrays');
assert.match(videoStoreLoad,/yt1988_tiktok_videos\?select=video_id,handle/,'video store must rebuild from canonical video rows');

const videoRowsStart=server.indexOf('function buildTikTokVideoStoredRows()');
const videoRowsEnd=server.indexOf('async function persistTikTokVideoStore',videoRowsStart);
const videoRowsBlock=server.slice(videoRowsStart,videoRowsEnd);
assert.doesNotMatch(videoRowsBlock,/sec_uid:/,'secUid belongs to canonical TikTok channel identity');
assert.doesNotMatch(videoRowsBlock,/^\s*videos\s*[:,]/m,'video channel state must not duplicate canonical videos');

const canonicalSyncStart=server.indexOf('async function syncTikTokCanonicalLibrary');
const canonicalSyncEnd=server.indexOf('function queueTikTokCanonicalSync',canonicalSyncStart);
const canonicalSyncBlock=server.slice(canonicalSyncStart,canonicalSyncEnd);
assert.doesNotMatch(canonicalSyncBlock,/next\.live(?:_|=)/,'canonical TikTok profile row must not duplicate transient LIVE state');

const liveStoredRowsStart=server.indexOf('function buildTikTokStoredRows()');
const liveStoredRowsEnd=server.indexOf('async function persistTikTokLiveStore',liveStoredRowsStart);
const liveStoredRowsBlock=server.slice(liveStoredRowsStart,liveStoredRowsEnd);
assert.doesNotMatch(liveStoredRowsBlock,/selected:true/,'LIVE row must not duplicate canonical selected membership');
