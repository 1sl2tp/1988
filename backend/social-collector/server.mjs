import http from 'node:http';
import { URL } from 'node:url';
import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,writeFile,unlink,stat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {createTikTokLoginRuntime} from './tiktok-login-runtime.mjs';

const PORT=Math.max(1,Number(process.env.PORT)||10000);
const ORIGIN=String(process.env.ALLOW_ORIGIN||'https://yt.taphoa.xyz');
const RENDER_MEDIA_PROXY_ENABLED=String(process.env.RENDER_MEDIA_PROXY_ENABLED||'0')==='1';
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const COLLECTOR_TOKEN=String(process.env.COLLECTOR_TOKEN||'');
const LOGIN_TOKEN=String(process.env.LOGIN_TOKEN||'');
const TIKTOK_CLIENT_KEY=String(process.env.TIKTOK_CLIENT_KEY||'');
const TIKTOK_CLIENT_SECRET=String(process.env.TIKTOK_CLIENT_SECRET||'');
const TIKTOK_PREVIEW_WARM_HANDLES=String(process.env.TIKTOK_PREVIEW_WARM_HANDLES||'')
  .split(',').map(x=>x.trim()).filter(Boolean);
const TIKTOK_PREVIEW_VIDEO=String(process.env.TIKTOK_PREVIEW_VIDEO||'').trim();
const TIKTOK_PREVIEW_DISCOVER_LIVE=String(process.env.TIKTOK_PREVIEW_DISCOVER_LIVE||'0')==='1';
const AUTO_COLLECT=String(process.env.AUTO_COLLECT||'1')!=='0';
const LEGACY_TIKTOK_FEED_COLLECT=String(process.env.LEGACY_TIKTOK_FEED_COLLECT||'0')==='1';
const RENDER_LIVE_BACKGROUND_SWEEP=String(process.env.RENDER_LIVE_BACKGROUND_SWEEP||'0')==='1';
// Emergency pause is opt-in only. Normal startup must keep TikTok open.
const TIKTOK_UPDATES_PAUSED=String(process.env.TIKTOK_UPDATES_PAUSED||'0')==='1';
const TZ='Asia/Ho_Chi_Minh';

const PLATFORMS=new Set(['tiktok']);
const BROWSER_PLATFORMS=new Set(['tiktok']);
const intervals={tiktok:2*60*1000};

chromium.setGraphicsMode=false;

let browserPromise=null;
let serial=Promise.resolve();
let queueDepth=0;
const memorySnapshots=new Map();
const lastRuns=new Map();
const tiktokLiveCheckCache=new Map();
const tiktokLiveSessions=new Map();
const tiktokLiveSessionInflight=new Map();
const tiktokLiveFastSources=new Map();
const tiktokLiveBadSources=new Map();
const tiktokLivePreferBrowser=new Map();
const tiktokLiveLibrary=new Map();
const tiktokLiveLibraryRefreshAt=new Map();
const tiktokLiveSelectedHandles=new Set();
const tiktokVideoLibrary=new Map();
const tiktokVideoSourceCache=new Map();
const tiktokVideoSourceInflight=new Map();
const tiktokVideoPriorityWarmAt=new Map();
const tiktokVideoFileCache=new Map();
const tiktokVideoFileInflight=new Map();
const TIKTOK_VIDEO_FILE_CACHE_DIR=join(tmpdir(),'yt1988-tiktok-mp4');
const TIKTOK_VIDEO_FILE_TTL_MS=30*60*1000;
const TIKTOK_VIDEO_FILE_PRUNE_MS=5*60*1000;
let tiktokVideoFileLastPruneAt=0;
let tiktokVideoFilePrunePromise=null;
const TIKTOK_VIDEO_SOURCE_TTL_MS=12*60*1000;
const TIKTOK_VIDEO_SOURCE_WARM_BATCH=1;
let tiktokVideoSourceWarmCursor=0;
let tiktokVideoSourceWarmSerial=Promise.resolve();
const TIKTOK_LIBRARY_RECENT_VIDEOS=10;
const TIKTOK_ORIGINAL_BUCKET='tiktok-originals';
const tiktokCanonicalChannels=new Map();
const tiktokCanonicalVideos=new Map();
let tiktokCanonicalLoaded=false;
let tiktokCanonicalLoadPromise=null;
let tiktokCanonicalWritePromise=null;
let tiktokCanonicalPackageVersion=0;
let tiktokCanonicalPackageUpdatedAt=0;
let tiktokCanonicalPersistedVersion=-1;
let tiktokCanonicalLoadFailedAt=0;
const TIKTOK_CANONICAL_LOAD_RETRY_MS=60_000;
let tiktokCanonicalMaterialHash='';
let tiktokCanonicalProfileCursor=0;
let tiktokCanonicalImageSerial=Promise.resolve();
let tiktokCanonicalMetaSerial=Promise.resolve();
let tiktokCanonicalMetaLastAt=0;
let tiktokCanonicalMetaBusy=false;
const tiktokCanonicalPendingHandles=new Set();
const tiktokCanonicalVideoEnrichRetryAt=new Map();
let tiktokCanonicalVideoEnrichBusy=false;
let tiktokCanonicalSyncPromise=null;
let tiktokCanonicalMp4RefreshSerial=Promise.resolve();
let tiktokCanonicalMp4Cursor=0;
let tiktokFullResyncPromise=null;
let tiktokFullResyncState={
  running:false,startedAt:0,finishedAt:0,
  phase:'idle',channelsTotal:0,channelsDone:0,
  videosTotal:0,videosReady:0,errors:0
};

const tiktokVideoRefreshAt=new Map();
let tiktokVideoPackageVersion=0;
let tiktokVideoPackageUpdatedAt=0;
let tiktokVideoPackageScanPromise=null;
let tiktokVideoFullRefreshPromise=null;
const tiktokVideoEdgeRefreshPending=new Set();
const tiktokVideoEdgeForceDeepPending=new Set();
let tiktokVideoEdgeRefreshPromise=null;
let tiktokVideoBackgroundCursor=0;
let tiktokVideoStoreWritePromise=null;
const tiktokVideoDeepCheckAt=new Map();
const TIKTOK_VIDEO_DEEP_FALLBACK_MS=6*60*60*1000;
let tiktokVideoPersistedVersion=-1;
const TIKTOK_VIDEO_LIBRARY_REFRESH_MS=60_000;
const TIKTOK_VIDEO_PER_CHANNEL=10;
let tiktokLivePackageScanPromise=null;
const tiktokLivePriorityScanPromises=new Map();
let tiktokLiveStoreWritePromise=null;
let tiktokApiCookieHeader='';
let tiktokApiCookieRefreshAt=0;
let tiktokApiCookieRefreshPromise=null;
let tiktokClientAccessToken='';
let tiktokClientAccessTokenExpiresAt=0;
let tiktokOfficialIdentityDisabledUntil=0;
const tiktokProfileIdentityCache=new Map();
const tiktokProfileIdentityInflight=new Map();
const TIKTOK_PROFILE_IDENTITY_TTL_MS=6*60*60*1000;
let tiktokLivePersistedVersion=-1;
const TIKTOK_LIVE_LIBRARY_REFRESH_MS=60_000;
const TIKTOK_LIVE_STATUS_SWEEP_MS=Math.max(30_000,Number(process.env.TIKTOK_LIVE_STATUS_SWEEP_MS)||30_000);
const TIKTOK_LIVE_IDLE_SWEEP_MS=Math.max(
  TIKTOK_LIVE_STATUS_SWEEP_MS,
  Number(process.env.TIKTOK_LIVE_IDLE_SWEEP_MS)||3*60_000
);
const TIKTOK_LIVE_VIEWER_ACTIVE_MS=2*60_000;
const TIKTOK_LIVE_DISCOVERY_BATCH=10;
const TIKTOK_LIVE_PRIORITY_BATCH=18;
const TIKTOK_LIVE_PUBLIC_CONFIRM_TTL_MS=3*60_000;
const TIKTOK_LIVE_RECENT_TTL_MS=24*60*60_000;
const TIKTOK_LIVE_RECENT_BATCH=8;
const TIKTOK_LIVE_COLD_BATCH=6;
const TIKTOK_LIVE_COLD_DEEP_BATCH=2;
let tiktokLiveLastViewerAt=0;
let tiktokLiveSweepTimer=null;
let activeRenderMediaProxies=0;
const MAX_RENDER_MEDIA_PROXIES=Math.max(1,Math.min(8,Number(process.env.MAX_RENDER_MEDIA_PROXIES)||4));
let tiktokLiveLibraryVersion=0;
let tiktokLiveLibraryUpdatedAt=0;
const tiktokLiveLibraryWarmInflight=new Map();
const tiktokLiveLibraryWarmBatchPending=new Set();
let tiktokLiveLibraryWarmBatchTimer=null;
let tiktokLiveLibraryWarmBatchPromise=null;
const tiktokLiveLibraryWarmRetryAt=new Map();
const tiktokLiveStatusFallbackInflight=new Set();
const tiktokLiveStatusFallbackPending=new Set();
let tiktokLiveStatusFallbackPromise=null;
const TIKTOK_LIVE_LIBRARY_WARM_CONCURRENCY=4;
const TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS=30_000;
let tiktokLiveLibraryRefreshCursor=0;
let ytdlpSerial=Promise.resolve();
let tikwmApiSerial=Promise.resolve();
let tikwmApiLastAt=0;
let tiktokProfileBackfillBusy=false;
let tiktokProfileBackfillCursor=0;

// TikTok status endpoints rate-limit bursty scans very aggressively. All
// server-side LIVE status requests share one small global gate so an exhaustive
// scan can cover every selected channel without turning most answers into 403.
let tiktokStatusRequestGate=Promise.resolve();
let tiktokStatusRequestLastAt=0;
const TIKTOK_STATUS_MIN_GAP_MS=320;
async function paceTikTokStatusRequest(){
  const task=tiktokStatusRequestGate.then(async()=>{
    const wait=Math.max(0,TIKTOK_STATUS_MIN_GAP_MS-(Date.now()-tiktokStatusRequestLastAt));
    if(wait)await sleep(wait);
    tiktokStatusRequestLastAt=Date.now();
  });
  tiktokStatusRequestGate=task.catch(()=>{});
  return task;
}

let tiktokFrozenLibraryPackage=null;
let tiktokFrozenLibraryLoadedAt=0;

async function loadTikTokFrozenLibraryPackage({force=false}={}){
  if(tiktokFrozenLibraryPackage&&!force)return tiktokFrozenLibraryPackage;
  const r=await fetch(
    SUPABASE_URL+'/rest/v1/yt1988_tiktok_library_package?package_key=eq.library&select=version,payload,updated_at&limit=1',
    {
      headers:storeHeaders(),
      signal:AbortSignal.timeout(12000)
    }
  );
  if(!r.ok)throw new Error('tiktok_frozen_package_read_'+r.status+':'+compactText(await r.text(),140));
  const rows=await r.json();
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row||!row.payload)throw new Error('tiktok_frozen_package_missing');
  const payload=row.payload&&typeof row.payload==='object'?row.payload:{};
  tiktokFrozenLibraryPackage={
    ...payload,
    version:Number(row.version??payload.version??0),
    generatedAt:String(payload.generatedAt||row.updated_at||nowIso())
  };
  tiktokFrozenLibraryLoadedAt=Date.now();
  return tiktokFrozenLibraryPackage;
}

function enqueueTikwmApi(task){
  const run=tikwmApiSerial.then(async()=>{
    const wait=Math.max(0,1150-(Date.now()-tikwmApiLastAt));
    if(wait)await sleep(wait);
    tikwmApiLastAt=Date.now();
    return task();
  },async()=>{
    const wait=Math.max(0,1150-(Date.now()-tikwmApiLastAt));
    if(wait)await sleep(wait);
    tikwmApiLastAt=Date.now();
    return task();
  });
  tikwmApiSerial=run.catch(()=>{});
  return run;
}

async function execTikTokYtdlp(args,options={}){
  let cookieFile='';
  try{
    let finalArgs=[...(args||[])];
    if(tiktokApiCookieHeader){
      const rows=String(tiktokApiCookieHeader)
        .split(';')
        .map(part=>part.trim())
        .filter(Boolean)
        .map(part=>{
          const i=part.indexOf('=');
          if(i<=0)return '';
          const name=part.slice(0,i).trim();
          const value=part.slice(i+1).trim();
          if(!name)return '';
          return ['.tiktok.com','TRUE','/','TRUE','2147483647',name,value].join('\t');
        })
        .filter(Boolean);
      if(rows.length){
        cookieFile=join(tmpdir(),'tiktok-ytdlp-'+randomUUID()+'.txt');
        await writeFile(
          cookieFile,
          '# Netscape HTTP Cookie File\n'+rows.join('\n')+'\n',
          {encoding:'utf8',mode:0o600}
        );
        const target=finalArgs.pop();
        finalArgs.push('--cookies',cookieFile,target);
      }
    }
    return await execFileText('yt-dlp',finalArgs,options);
  }finally{
    if(cookieFile)await unlink(cookieFile).catch(()=>{});
  }
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function nowIso(){return new Date().toISOString();}
function currentTikTokLiveSweepDelay(){
  return Date.now()-tiktokLiveLastViewerAt<=TIKTOK_LIVE_VIEWER_ACTIVE_MS
    ? TIKTOK_LIVE_STATUS_SWEEP_MS
    : TIKTOK_LIVE_IDLE_SWEEP_MS;
}
function startTikTokLiveSweepScheduler(){
  if(tiktokLiveSweepTimer)return;
  const tick=async()=>{
    tiktokLiveSweepTimer=null;
    try{await runTikTokLiveMinuteSweep();}catch(error){
      console.warn('[tiktok-live] sweep failed',compactText(error?.message||error,140));
    }finally{
      tiktokLiveSweepTimer=setTimeout(tick,currentTikTokLiveSweepDelay());
      tiktokLiveSweepTimer.unref?.();
    }
  };
  tiktokLiveSweepTimer=setTimeout(tick,currentTikTokLiveSweepDelay());
  tiktokLiveSweepTimer.unref?.();
}
function compactText(value,max=500){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
}
function acquireRenderMediaProxy(res){
  if(!RENDER_MEDIA_PROXY_ENABLED){
    json(res,410,{ok:false,error:'media_proxy_disabled',mode:'direct-cdn-only'});
    return false;
  }
  if(activeRenderMediaProxies>=MAX_RENDER_MEDIA_PROXIES){
    res.setHeader('retry-after','3');
    json(res,429,{ok:false,error:'media_proxy_busy',retryAfter:3});
    return false;
  }
  activeRenderMediaProxies+=1;
  let released=false;
  const release=()=>{
    if(released)return;
    released=true;
    activeRenderMediaProxies=Math.max(0,activeRenderMediaProxies-1);
  };
  res.once('finish',release);
  res.once('close',release);
  return true;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,Number(value)||0));
}
function uniq(items,keyFn,max=80){
  const seen=new Set();
  const out=[];
  for(const item of Array.isArray(items)?items:[]){
    if(!item)continue;
    const key=String(keyFn(item)||'');
    if(!key||seen.has(key))continue;
    seen.add(key);
    out.push(item);
    if(out.length>=max)break;
  }
  return out;
}
function json(res,status,data){
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    // Public media/package APIs do not use browser credentials. Keep CORS
    // permissive here; state-changing TikTok routes still validate Origin.
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type,x-collector-token,range',
    'access-control-expose-headers':'content-length,content-range,accept-ranges,content-type',
    'cache-control':'no-store',
  });
  res.end(JSON.stringify(data));
}
function authorized(req){
  return Boolean(COLLECTOR_TOKEN)&&String(req.headers['x-collector-token']||'')===COLLECTOR_TOKEN;
}
function trustedTikTokUiMutation(req){
  const origin=String(req.headers.origin||'').replace(/\/$/,'').toLowerCase();
  const configured=String(ORIGIN||'').replace(/\/$/,'').toLowerCase();
  const allowed=new Set([
    configured,
    'https://yt.taphoa.xyz',
    'https://www.yt.taphoa.xyz'
  ].filter(Boolean));
  return authorized(req)||Boolean(origin&&allowed.has(origin));
}
async function readJson(req,maxBytes=1024*1024){
  let size=0;
  const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>maxBytes)throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if(!chunks.length)return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function enqueueYtdlp(task){
  const run=ytdlpSerial.then(task,task);
  ytdlpSerial=run.catch(()=>{});
  return run;
}
function execFileText(file,args,{timeout=25000,maxBuffer=4*1024*1024,env=null}={}){
  return new Promise((resolve,reject)=>{
    execFile(file,args,{
      timeout,maxBuffer,encoding:'utf8',
      ...(env?{env}:null)
    },(error,stdout,stderr)=>{
      if(error){
        error.stdout=stdout;
        error.stderr=stderr;
        reject(error);
        return;
      }
      resolve(String(stdout||''));
    });
  });
}
function normalizeTikTokHandle(value){
  const handle=String(value||'').trim().replace(/^@/,'');
  return /^[A-Za-z0-9._]{2,32}$/.test(handle)?handle:'';
}

function tiktokLibrarySourceSig(row){
  if(!row?.url)return '';
  const raw=tiktokLiveSourceFingerprint(row.url,row.type||'');
  return createHash('sha1').update(raw).digest('hex').slice(0,12);
}
function tiktokLibraryMaterial(row){
  return JSON.stringify([
    Boolean(row?.live),
    Boolean(row?.ready),
    String(row?.type||''),
    String(row?.mode||''),
    String(row?.source||''),
    String(row?.status||''),
    String(row?.probeState||'unknown'),
    Boolean(row?.playable),
    String(row?.sourceSig||''),
    String(row?.title||''),
    String(row?.thumbnail||''),
    String(row?.videoCodec||''),
    String(row?.audioCodec||''),
    Number(row?.width||0),
    Number(row?.height||0),
    String(row?.quality||''),
    Number(row?.bitrate||0),
    String(row?.flvPath||''),
    Number(row?.expiresAt||0)
  ]);
}
function publicTikTokLibraryItem(row){
  if(!row)return null;
  const handle=String(row.handle||'');
  const detectedLive=tiktokConfirmedLiveNow(handle);
  const probeState=detectedLive?'live':String(row.probeState||'unknown');
  const hotSource=currentTikTokLibrarySource(handle);
  const type=String(hotSource?.type||row.type||'').toLowerCase();
  const sourceSig=String(row.sourceSig||'');
  const playableLive=tiktokPublishedLiveNow(handle,Date.now(),row);
  const directStreamUrl=playableLive?String(hotSource?.url||''):'';
  return {
    handle:String(row.handle||''),
    // Public LIVE means a current TikTok candidate produced a link that the
    // server verified as alive. Detection alone stays internal.
    live:playableLive,
    detectedLive,
    ready:playableLive,
    type:playableLive?'flv':'',
    mode:playableLive?String(row.mode||''):'',
    source:playableLive?String(row.source||''):'',
    status:playableLive
      ? 'ready'
      : (probeState==='live'?'pending_link':(probeState==='unknown'?'unknown':'offline')),
    probeState,
    playable:playableLive,
    sourceSig:playableLive?sourceSig:'',
    // Direct CDN only. Render media proxy is disabled.
    streamUrl:playableLive?directStreamUrl:'',
    proxyUrl:'',
    title:String(row.title||''),
    thumbnail:String(row.thumbnail||''),
    videoCodec:playableLive?String(row.videoCodec||''):'',
    audioCodec:playableLive?String(row.audioCodec||''):'',
    width:playableLive?Number(row.width||0):0,
    height:playableLive?Number(row.height||0):0,
    quality:playableLive?String(row.quality||''):'',
    bitrate:playableLive?Number(row.bitrate||0):0,
    flvPath:playableLive?String(row.flvPath||''):'',
    lastProbeAt:Number(row.lastProbeAt||0),
    changedAt:Number(row.changedAt||0),
    confirmedAt:Number(row.confirmedAt||0),
    lastSeenAt:Number(row.lastSeenAt||0),
    expiresAt:playableLive?Number(row.expiresAt||0):0
  };
}

function updateTikTokLiveLibrary(rawHandle,patch={},options={}){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  const now=Date.now();
  const prev=tiktokLiveLibrary.get(key)||{
    handle,live:false,ready:false,playable:false,type:'',mode:'',source:'',
    status:'unknown',probeState:'unknown',sourceSig:'',title:'',thumbnail:'',videoCodec:'',audioCodec:'',width:0,height:0,quality:'',bitrate:0,flvPath:'',lastProbeAt:0,changedAt:now,stateChangedAt:0,lastKnownAt:0,confirmedAt:0,lastSeenAt:0,expiresAt:0
  };
  const next={...prev,...patch,handle};

  if(patch.lastSeenAt!==undefined)next.lastSeenAt=Number(patch.lastSeenAt||0);
  const changed=tiktokLibraryMaterial(prev)!==tiktokLibraryMaterial(next);
  if(changed){
    next.changedAt=now;
    tiktokLiveLibraryVersion+=1;
    tiktokLiveLibraryUpdatedAt=now;
  }
  tiktokLiveLibrary.set(key,next);
  return changed;
}
function currentTikTokLibrarySource(handle){
  const key=String(handle||'').toLowerCase();
  const browser=tiktokLiveSessions.get(key);
  if(browser&&browser.page&&!browser.page.isClosed()&&tiktokLiveCacheReusable(browser))return browser;
  const fast=tiktokLiveFastSources.get(key);
  if(fast&&tiktokLiveSourceUsable(fast))return fast;
  return null;
}
function isTikTokConfirmedLiveStatus(scan,now=Date.now()){
  return Boolean(
    scan?.known===true&&
    scan?.live===true&&
    scan?.retained!==true&&
    now-Number(scan?.checkedAt||0)<=TIKTOK_LIVE_PUBLIC_CONFIRM_TTL_MS
  );
}
function tiktokConfirmedLiveNow(handle,now=Date.now()){
  const key=String(handle||'').toLowerCase();
  return isTikTokConfirmedLiveStatus(tiktokRealtimeStatusByHandle.get(key),now);
}
function tiktokPublishedLiveNow(handle,now=Date.now(),row=null){
  const key=String(handle||'').toLowerCase();
  const item=row||tiktokLiveLibrary.get(key)||{};
  if(!tiktokConfirmedLiveNow(handle,now))return false;
  const source=currentTikTokLibrarySource(handle);
  const type=String(source?.type||item?.type||'').toLowerCase();
  const sourceSig=String(item?.sourceSig||'');
  return Boolean(
    item?.playable&&
    source?.url&&
    type==='flv'&&
    sourceSig&&
    tiktokLiveSourceUsable(source)
  );
}
function noteTikTokLibrarySource(handle,row,{mode='',source='',ready=null,status=''}={}){
  if(!row?.url)return false;
  const key=String(handle||'').toLowerCase();
  const current=tiktokLiveLibrary.get(key)||{};
  const live=tiktokConfirmedLiveNow(handle);
  const confirmed=live&&(ready==null?Boolean(row.confirmed):Boolean(ready));
  const expiresAt=tiktokStreamExpiresAt(row.url);
  return updateTikTokLiveLibrary(handle,{
    ready:confirmed,
    playable:confirmed,
    type:confirmed?String(row.type||''):'',
    mode:confirmed?String(mode||row.mode||''):'',
    source:confirmed?String(source||row.source||''):'',
    status:live?String(status||(confirmed?'ready':'live')):'offline',
    sourceSig:confirmed?tiktokLibrarySourceSig(row):'',
    confirmedAt:confirmed?Date.now():Number(current?.confirmedAt||0),
    lastSeenAt:Date.now(),
    expiresAt:confirmed?expiresAt:0
  });
}
function publishTikTokLiveSourceNow(handle,row,{mode='',source=''}={}){
  if(!row?.url)return false;
  const current=tiktokLiveLibrary.get(String(handle||'').toLowerCase())||{};
  const live=tiktokConfirmedLiveNow(handle);
  return updateTikTokLiveLibrary(handle,{
    ready:live,
    playable:live,
    type:live?String(row.type||''):'',
    mode:live?String(mode||row.mode||'fast'):'',
    source:live?String(source||row.source||'room-api'):'',
    status:live?'live':'offline',
    sourceSig:live?tiktokLibrarySourceSig(row):'',
    videoCodec:live?normalizeTikTokCodec(row.videoCodec||''):'',
    width:live?Number(row.width||0):0,
    height:live?Number(row.height||0):0,
    quality:live?String(row.quality||''):'',
    bitrate:live?Number(row.bitrate||0):0,
    flvPath:live?String(row.flvPath||row.path||''):'',
    lastSeenAt:Date.now(),
    expiresAt:live?tiktokStreamExpiresAt(row.url):0
  });
}

async function tiktokSourceHeaders(handle,row){
  const headers={};
  for(const [name,value] of Object.entries(row?.headers||{})){
    const key=String(name||'').toLowerCase();
    if(!key||key.startsWith(':')||['host','content-length','connection','accept-encoding','range'].includes(key))continue;
    headers[key]=String(value);
  }
  headers['user-agent']=headers['user-agent']||'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  headers.referer=headers.referer||'https://www.tiktok.com/@'+handle+'/live';
  headers.origin=headers.origin||'https://www.tiktok.com';
  headers.accept=headers.accept||'*/*';
  if(row?.page&&!row.page.isClosed?.()){
    const cookies=await row.page.cookies(row.url).catch(()=>[]);
    if(cookies.length)headers.cookie=cookies.map(x=>x.name+'='+x.value).join('; ');
  }
  return headers;
}
function ffprobeHeaderBlock(headers={}){
  return Object.entries(headers)
    .filter(([name,value])=>name&&value!=null&&String(value)!=='')
    .map(([name,value])=>String(name)+': '+String(value))
    .join('\r\n')+'\r\n';
}
async function probeTikTokLiveSource(handle,row){
  if(!row?.url)return {ok:false,error:'missing_url'};

  const headers=await tiktokSourceHeaders(handle,row);
  const transport=await probeTikTokFlvBytes(handle,row,headers);
  if(!transport.ok){
    return {
      ok:false,
      error:transport.error||'invalid_flv',
      hasVideo:Boolean(transport.hasVideo),
      hasAudio:Boolean(transport.hasAudio),
      videoCodec:'',
      audioCodec:'',
      width:0,
      height:0
    };
  }

  let videoCodec='';
  let audioCodec='';
  let width=0;
  let height=0;

  // Optional enrichment only. Some TikTok CDN/token combinations are playable
  // over HTTP but ffprobe cannot reopen them with identical semantics.
  try{
    const out=await execFileText('ffprobe',[
      '-v','error',
      '-rw_timeout','4500000',
      '-analyzeduration','2500000',
      '-probesize','2000000',
      '-headers',ffprobeHeaderBlock(headers),
      '-show_entries','stream=codec_type,codec_name,width,height',
      '-of','json',
      String(row.url)
    ],{timeout:6500,maxBuffer:2*1024*1024});
    const data=JSON.parse(String(out||'{}'));
    const streams=Array.isArray(data?.streams)?data.streams:[];
    const video=streams.find(x=>x?.codec_type==='video'&&Number(x?.width||0)>0&&Number(x?.height||0)>0);
    const audio=streams.find(x=>x?.codec_type==='audio');
    videoCodec=String(video?.codec_name||'').toLowerCase();
    audioCodec=String(audio?.codec_name||'').toLowerCase();
    width=Number(video?.width||0);
    height=Number(video?.height||0);

    // If ffprobe positively identifies HEVC, reject because the current player
    // target is H.264/AVC FLV. Absence of ffprobe metadata is not a rejection.
    if(/hevc|h265/i.test(videoCodec)){
      return {
        ok:false,error:'hevc_not_supported',
        hasVideo:true,hasAudio:Boolean(audio),
        videoCodec,audioCodec,width,height
      };
    }
  }catch(error){
    console.log(
      '[tiktok-library] ffprobe optional miss',
      handle,
      compactText(error?.message||error,120)
    );
  }

  return {
    ok:true,
    hasVideo:true,
    hasAudio:Boolean(transport.hasAudio),
    videoCodec,
    audioCodec,
    width,
    height,
    error:''
  };
}

function findTikTokLiveSourceBySig(handle,sourceSig){
  const key=String(handle||'').toLowerCase();
  const sig=String(sourceSig||'');
  if(!sig)return null;
  const browser=tiktokLiveSessions.get(key);
  if(browser&&!browser.page?.isClosed?.()&&tiktokLiveCacheReusable(browser)&&tiktokLibrarySourceSig(browser)===sig)return browser;
  const fast=tiktokLiveFastSources.get(key);
  // Fast FLV may be opened before ffprobe finishes. Validation is a
  // background health check, not a gate in front of playback.
  if(fast&&tiktokLiveSourceUsable(fast)&&tiktokLibrarySourceSig(fast)===sig)return fast;
  return null;
}
async function confirmTikTokLibrarySource(handle,row,{mode='',source='',preserveOnFailure=false}={}){
  if(!row?.url)return false;
  const probe=await probeTikTokLiveSource(handle,row);
  row.lastProbeAt=Date.now();
  if(probe.ok){
    const browserProbe=await probeTikTokBrowserDirectFlv(handle,row);
    if(!browserProbe.ok){
      row.confirmed=false;
      if(!preserveOnFailure){
        markTikTokBadSource(handle,row);
        const live=tiktokConfirmedLiveNow(handle);
        updateTikTokLiveLibrary(handle,{
          ready:false,playable:false,status:live?'warming':'offline',
          type:live?String(row.type||''):'',
          mode:String(mode||row.mode||''),
          source:String(source||row.source||''),
          sourceSig:'',
          videoCodec:'',audioCodec:'',width:0,height:0,
          lastProbeAt:Date.now(),lastSeenAt:Date.now()
        });
      }
      console.log(
        '[tiktok-library] browser-direct reject',
        handle,
        row.type,
        browserProbe.error||'browser_probe_failed'
      );
      return false;
    }

    row.confirmed=true;
    row.at=Date.now();
    row.videoCodec=probe.videoCodec;
    row.audioCodec=probe.audioCodec;
    row.width=probe.width;
    row.height=probe.height;
    row.browserDirect=true;
    row.browserCors=String(browserProbe.acao||'');
    clearTikTokBadSource(handle,row);
    const current=tiktokLiveLibrary.get(String(handle||'').toLowerCase())||{};
    const live=tiktokConfirmedLiveNow(handle);
    updateTikTokLiveLibrary(handle,{
      ready:live,playable:live,
      type:live?String(row.type||''):'',
      mode:String(mode||row.mode||''),
      source:String(source||row.source||''),
      status:live?'ready':'offline',
      sourceSig:live?tiktokLibrarySourceSig(row):'',
      videoCodec:probe.videoCodec,
      audioCodec:probe.audioCodec,
      width:probe.width,
      height:probe.height,
      lastProbeAt:row.lastProbeAt,
      confirmedAt:Date.now(),
      lastSeenAt:Date.now(),
      expiresAt:tiktokStreamExpiresAt(row.url)
    });
    console.log('[tiktok-library] media ready',handle,row.type,probe.videoCodec+'+'+probe.audioCodec,probe.width+'x'+probe.height);
    return true;
  }
  row.confirmed=false;
  if(!preserveOnFailure){
    markTikTokBadSource(handle,row);
    const current=tiktokLiveLibrary.get(String(handle||'').toLowerCase())||{};
    const live=tiktokConfirmedLiveNow(handle);
    updateTikTokLiveLibrary(handle,{
      ready:false,playable:false,status:live?'warming':'offline',
      type:live?String(row.type||''):'',
      mode:String(mode||row.mode||''),
      source:String(source||row.source||''),
      sourceSig:'',
      videoCodec:'',audioCodec:'',width:0,height:0,
      lastProbeAt:Date.now(),lastSeenAt:Date.now()
    });
  }
  console.log('[tiktok-library] media reject',handle,row.type,probe.error||'probe_failed',preserveOnFailure?'keep-current':'replace');
  return false;
}

async function batchTikTokLiveFallback(handles){
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,10);
  if(!normalized.length)return new Map();
  try{
    const out=await execFileText(
      'python3',
      ['tiktok_live_batch_check.py',...normalized],
      {timeout:14_000,maxBuffer:4*1024*1024}
    );
    const rows=JSON.parse(String(out||'[]'));
    const map=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      const handle=normalizeTikTokHandle(row?.username||'');
      if(handle)map.set(handle.toLowerCase(),row);
    }
    return map;
  }catch(error){
    console.log('[tiktok-library] batch fallback failed',compactText(error?.message||error,140));
    return new Map();
  }
}
function isCanonicalTikTokUserRoomEvidence(entry){
  const source=String(entry?.source||'');
  const status=(entry?.status===null||entry?.status===undefined||entry?.status==='')
    ? null
    : (Number.isFinite(Number(entry.status))?Number(entry.status):null);
  return Boolean(
    entry?.known===true&&
    (status===2||status===4)&&
    /^(?:tiktok-user-room(?:-retry)?|browser-user-room)$/.test(source)
  );
}
function addTikTokStatusEvidence(handle,entry){
  const key=String(handle||'').toLowerCase();
  if(!key)return null;
  const now=Date.now();
  const prev=tiktokRealtimeStatusByHandle.get(key)||{
    handle,known:false,live:tiktokRealtimeLiveHandles.has(key),
    offlineConfirmed:false,retained:false,checkedAt:now,evidence:[]
  };
  const normalized={
    source:String(entry?.source||'fallback'),
    known:Boolean(entry?.known),
    live:Boolean(entry?.live),
    status:(entry?.status===null||entry?.status===undefined||entry?.status==='')
      ? null
      : (Number.isFinite(Number(entry.status))?Number(entry.status):null)
  };

  // TikTok user/room is the canonical LIVE control plane. Once it returns
  // status=2 or status=4, discard stale historical evidence from FLV/browser/
  // deep resolvers so an old playable URL can never override current API truth.
  let evidence=isCanonicalTikTokUserRoomEvidence(normalized)
    ? [normalized]
    : (Array.isArray(prev.evidence)?prev.evidence.slice():[]);
  const duplicate=evidence.some(row=>
    row?.source===normalized.source&&
    Boolean(row?.known)===normalized.known&&
    Boolean(row?.live)===normalized.live&&
    (row?.status??null)===(normalized.status??null)
  );
  if(!duplicate)evidence.push(normalized);

  const canonical=evidence.find(isCanonicalTikTokUserRoomEvidence)||null;
  const positive=canonical
    ? (canonical.live?canonical:null)
    : evidence.find(row=>row?.known&&row?.live);
  const offlineSources=canonical&&!canonical.live
    ? [String(canonical.source||'tiktok-user-room')]
    : [...new Set(
        evidence.filter(row=>row?.known&&!row?.live).map(row=>String(row?.source||'')).filter(Boolean)
      )];
  const retained=canonical?false:tiktokRealtimeLiveHandles.has(key);
  const live=canonical?Boolean(canonical.live):Boolean(positive||retained);
  const offlineConfirmed=canonical
    ? !canonical.live
    : Boolean(!live&&offlineSources.length>=2);
  const next={
    ...prev,
    handle,
    known:Boolean(canonical||positive||offlineConfirmed),
    live,
    offlineConfirmed,
    retained:Boolean(!canonical&&!positive&&retained),
    checkedAt:now,
    evidence
  };
  tiktokRealtimeStatusByHandle.set(key,next);
  return next;
}

function publishDeepTikTokLive(handle,row,source='deep-fallback'){
  const key=String(handle||'').toLowerCase();
  if(!key)return false;
  const now=Date.now();
  const prev=tiktokLiveLibrary.get(key)||{};
  tiktokRealtimeLiveHandles.add(key);
  addTikTokStatusEvidence(handle,{source,known:true,live:true,status:2});

  updateTikTokLiveLibrary(handle,{
    live:true,
    ready:Boolean(prev.ready),
    playable:Boolean(prev.playable),
    status:prev.playable?'ready':'live',
    probeState:'live',
    liveCheckSource:source,
    stateChangedAt:prev.live?Number(prev.stateChangedAt||0):now,
    lastKnownAt:now,
    lastSeenAt:now
  });
  return true;
}

async function deepTikTokRoomFallback(handles){
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,10);
  const out=new Map();
  if(!normalized.length)return out;

  // First try the authenticated user-detail endpoint in one browser page. It
  // often still exposes roomId when the dedicated LIVE endpoints are returning
  // 403 to server-side fetches.
  const profiles=await browserTikTokProfileIdentities(normalized).catch(()=>new Map());

  let cursor=0;
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=normalized.length)return;
      const handle=normalized[index];
      const key=handle.toLowerCase();
      const profile=profiles.get(key)||null;
      const roomId=String(profile?.roomId||'');

      // Missing roomId is UNKNOWN, never OFFLINE. Do not fetch 10 public
      // profile pages here: the browser LIVE-page probe below is both faster
      // and closer to what the user actually sees on TikTok.
      if(!roomId){
        out.set(key,{
          evidence:[{source:'browser-profile-room-id',known:false,live:false,status:null}],
          liveRow:null
        });
        continue;
      }

      const evidence=[];
      const room=await quickTikTokRoomInfoStatus(handle,roomId).catch(()=>null);
      if(room){
        evidence.push({
          source:'profile-room-info',
          known:Boolean(room.known),
          live:Boolean(room.live),
          status:(room.status===null||room.status===undefined)?null:Number(room.status)
        });
        if(room?.live&&Array.isArray(room.candidates)&&room.candidates.length){
          const cand=room.candidates[0];
          out.set(key,{evidence,liveRow:{
            stream_url:String(cand?.url||''),
            stream_type:'flv',
            source:'profile-room-info',
            videoCodec:String(cand?.videoCodec||''),
            width:Number(cand?.width||0),
            height:Number(cand?.height||0),
            quality:String(cand?.quality||''),
            bitrate:Number(cand?.bitrate||0),
            path:String(cand?.path||'')
          }});
          continue;
        }
        if(room?.known&&room?.live){
          out.set(key,{evidence,liveRow:null});
          continue;
        }
      }

      const detail=await quickTikTokLiveDetailStatus(handle,false,roomId).catch(()=>null);
      if(detail){
        evidence.push({
          source:'profile-live-detail-room',
          known:Boolean(detail.known),
          live:Boolean(detail.live),
          status:(detail.status===null||detail.status===undefined)?null:Number(detail.status)
        });
        if(detail?.live&&Array.isArray(detail.candidates)&&detail.candidates.length){
          const cand=detail.candidates[0];
          out.set(key,{evidence,liveRow:{
            stream_url:String(cand?.url||''),
            stream_type:'flv',
            source:'profile-live-detail-room',
            videoCodec:String(cand?.videoCodec||''),
            width:Number(cand?.width||0),
            height:Number(cand?.height||0),
            quality:String(cand?.quality||''),
            bitrate:Number(cand?.bitrate||0),
            path:String(cand?.path||'')
          }});
          continue;
        }
      }
      out.set(key,{evidence,liveRow:null});
    }
  };

  await Promise.all(Array.from({length:Math.min(2,normalized.length)},()=>worker()));
  return out;
}

async function runTikTokBrowserDiscoveryBatch(handles,{maxWaitMs=4500,source='browser-live-page'}={}){
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,10);
  const result={checked:0,found:0,missed:0};
  if(!normalized.length)return result;

  let cursor=0;
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=normalized.length)return;
      const handle=normalized[index];
      const key=handle.toLowerCase();

      // Already-known LIVE is not a discovery miss. Its verified FLV/session is
      // stronger evidence than re-opening the same page every 20 seconds.
      if(tiktokRealtimeLiveHandles.has(key)){
        result.checked+=1;
        continue;
      }

      const row=await probeTikTokBrowserFlv(handle,{maxWaitMs});
      result.checked+=1;
      if(row?.live||row?.stream_url){
        publishDeepTikTokLive(
          handle,
          row,
          String(row?.source||source)
        );
        result.found+=1;
      }else{
        addTikTokStatusEvidence(handle,{
          source,known:false,live:false,status:null
        });
        result.missed+=1;
      }
    }
  };

  await Promise.all(Array.from({length:Math.min(3,normalized.length)},()=>worker()));
  return result;
}

async function runTikTokStatusFallbackBatch(handles){
  // Periodic discovery must stay faster than the rotating queue. The actual
  // TikTok LIVE page is the primary fallback because API calls and yt-dlp are
  // frequently 403/timeout from the server. A page miss remains UNKNOWN.
  return runTikTokBrowserDiscoveryBatch(handles,{
    maxWaitMs:4500,
    source:'browser-live-page'
  });
}

function queueTikTokStatusFallback(handles){
  if(tiktokLiveAuditState.running)return Promise.resolve();
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))];
  for(const handle of normalized){
    const key=handle.toLowerCase();
    if(!tiktokRealtimeLiveHandles.has(key))tiktokLiveStatusFallbackPending.add(handle);
  }
  if(tiktokLiveStatusFallbackPromise)return tiktokLiveStatusFallbackPromise;
  if(!tiktokLiveStatusFallbackPending.size)return Promise.resolve();

  tiktokLiveStatusFallbackPromise=(async()=>{
    while(tiktokLiveStatusFallbackPending.size){
      const batch=[...tiktokLiveStatusFallbackPending].slice(0,10);
      for(const handle of batch){
        tiktokLiveStatusFallbackPending.delete(handle);
        tiktokLiveStatusFallbackInflight.add(handle.toLowerCase());
      }
      try{
        await runTikTokStatusFallbackBatch(batch);
      }catch(error){
        console.log('[tiktok-live-deep] batch failed',compactText(error?.message||error,160));
      }finally{
        for(const handle of batch)tiktokLiveStatusFallbackInflight.delete(handle.toLowerCase());
      }
      if(tiktokLiveStatusFallbackPending.size)await sleep(650);
    }
    await persistTikTokLiveStore({force:true}).catch(()=>{});
  })().finally(()=>{
    tiktokLiveStatusFallbackPromise=null;
  });

  return tiktokLiveStatusFallbackPromise;
}

function seedTikTokFastSource(handle,row){
  const url=String(row?.stream_url||'');
  const type=String(row?.stream_type||'').toLowerCase();
  if(!/^https?:\/\//i.test(url)||type!=='flv')return null;
  const baseHeaders={
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept':'*/*',
    'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
    'referer':'https://www.tiktok.com/@'+handle+'/live',
    'origin':'https://www.tiktok.com'
  };
  const source={
    mode:'fast',handle,type,url,headers:baseHeaders,
    at:Date.now(),source:String(row?.source||'batch-yt-dlp'),confirmed:false,
    videoCodec:normalizeTikTokCodec(row?.videoCodec||row?.vcodec||''),
    width:Number(row?.width||0),
    height:Number(row?.height||0),
    quality:String(row?.quality||row?.format_id||''),
    bitrate:Number(row?.bitrate||row?.tbr||0),
    flvPath:String(row?.path||'')
  };
  tiktokLiveFastSources.set(handle.toLowerCase(),source);
  return source;
}

async function findPreferredTikTokFlv(handle,excludeSig=''){
  const key=String(handle||'').toLowerCase();
  const status=await quickTikTokLiveStatus(handle);
  if(status?.title||status?.thumbnail){
    updateTikTokLiveLibrary(handle,{
      title:String(status.title||''),
      thumbnail:String(status.thumbnail||'')
    });
  }
  if(status.known&&!status.live&&!tiktokRealtimeLiveHandles.has(key))return null;

  const candidates=(status.candidates||[])
    .filter(row=>
      isTikTokVideoFlvCandidate(row)&&
      !isTikTokBadSource(handle,row)&&
      (!excludeSig||tiktokLibrarySourceSig(row)!==excludeSig)
    )
    .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a));

  const candidate=candidates[0]||null;
  if(!candidate)return null;
  return {
    mode:'fast',handle,type:'flv',
    url:String(candidate.url||''),
    headers:candidate.headers||{},
    at:Date.now(),source:'room-api-flv',confirmed:false,
    videoCodec:normalizeTikTokCodec(candidate.videoCodec||''),
    width:Number(candidate.width||0),
    height:Number(candidate.height||0),
    quality:String(candidate.quality||''),
    bitrate:Number(candidate.bitrate||0),
    flvPath:String(candidate.path||'')
  };
}
async function warmTikTokLibraryHandle(handle){
  handle=normalizeTikTokHandle(handle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  if(!tiktokRealtimeLiveHandles.has(key))return false;

  tiktokLiveBadSources.delete(key);
  tiktokLiveLibraryWarmRetryAt.delete(key);

  const confirm=async(row,{mode='',source=''}={})=>{
    if(!row?.url||String(row.type||'').toLowerCase()!=='flv')return false;
    const ok=await confirmTikTokLibrarySource(handle,row,{
      mode:mode||String(row.mode||'fast'),
      source:source||String(row.source||'flv'),
      preserveOnFailure:false
    }).catch(()=>false);
    if(!ok)return false;
    row.confirmed=true;
    row.at=Date.now();
    tiktokLiveFastSources.set(key,row);
    void persistTikTokLiveStore({force:true});
    return true;
  };

  const current=currentTikTokLibrarySource(handle);
  if(current&&String(current.type||'').toLowerCase()==='flv'){
    if(await confirm(current,{
      mode:String(current.mode||'fast'),
      source:String(current.source||'cache-flv')
    }))return true;
  }

  // Try multiple semantic FLV candidates in the background. A dead highest
  // quality URL must not block another working FLV from the same LIVE room.
  let excludeSig='';
  for(let attempt=0;attempt<4;attempt+=1){
    const flv=await findPreferredTikTokFlv(handle,excludeSig).catch(()=>null);
    if(!flv?.url||String(flv.type||'').toLowerCase()!=='flv')break;
    const sig=tiktokLibrarySourceSig(flv);
    tiktokLiveFastSources.set(key,flv);
    if(await confirm(flv,{mode:'fast',source:'room-api-flv'})){
      console.log('[tiktok-live-getlink] room FLV verified',handle,'attempt='+(attempt+1));
      return true;
    }
    if(sig)excludeSig=sig;
  }

  try{
    const ytdlp=await fastTikTokLiveWithYtdlp(handle);
    if(ytdlp?.url&&String(ytdlp.type||'').toLowerCase()==='flv'){
      const seeded=seedTikTokFastSource(handle,{
        stream_url:ytdlp.url,
        stream_type:'flv',
        source:'yt-dlp-flv',
        videoCodec:ytdlp.videoCodec,
        width:ytdlp.width,
        height:ytdlp.height,
        quality:ytdlp.quality,
        bitrate:ytdlp.bitrate,
        path:ytdlp.path
      });
      if(seeded&&await confirm(seeded,{mode:'fast',source:'yt-dlp-flv'})){
        updateTikTokLiveLibrary(handle,{
          title:String(ytdlp.title||''),
          thumbnail:String(ytdlp.thumbnail||'')
        });
        console.log('[tiktok-live-getlink] yt-dlp FLV verified',handle);
        return true;
      }
    }
  }catch(error){
    console.log('[tiktok-live-getlink] yt-dlp miss',handle,compactText(error?.message||error,120));
  }

  try{
    const session=await captureTikTokLiveSession(handle);
    if(session?.url&&String(session.type||'').toLowerCase()==='flv'){
      const row={
        mode:'fast',handle,type:'flv',
        url:String(session.url||''),
        headers:session.headers||{},
        at:Date.now(),source:'browser-flv',confirmed:false
      };
      tiktokLiveFastSources.set(key,row);
      if(await confirm(row,{mode:'fast',source:'browser-flv'})){
        console.log('[tiktok-live-getlink] browser FLV verified',handle);
        return true;
      }
    }
  }catch(error){
    console.log('[tiktok-live-getlink] browser miss',handle,compactText(error?.message||error,120));
  }

  updateTikTokLiveLibrary(handle,{
    live:true,status:'live',probeState:'live',
    ready:false,playable:false,type:'',sourceSig:'',
    lastSeenAt:Date.now()
  });
  return false;
}

async function resolveTikTokLiveSourceBatch(handles){
  const requested=[...new Set(
    (handles||[]).map(normalizeTikTokHandle).filter(Boolean)
  )];
  const targets=requested.filter(handle=>{
    const key=handle.toLowerCase();
    const row=tiktokLiveLibrary.get(key)||{};
    return tiktokRealtimeLiveHandles.has(key)&&!Boolean(row.playable);
  });
  if(!targets.length)return {total:0,ready:0,failed:0};

  // If a previous batch is still running, merge these handles into the next
  // immediate batch instead of creating isolated per-channel work.
  if(tiktokLiveLibraryWarmBatchPromise){
    for(const handle of targets)tiktokLiveLibraryWarmBatchPending.add(handle);
    return tiktokLiveLibraryWarmBatchPromise;
  }

  const run=async currentTargets=>{
    const started=Date.now();
    let cursor=0;
    let ready=0;
    let failed=0;

    console.log(
      '[tiktok-live-link-batch] start',
      'channels='+currentTargets.length,
      currentTargets.join(',')
    );

    const worker=async()=>{
      while(true){
        const index=cursor++;
        if(index>=currentTargets.length)return;
        const handle=currentTargets[index];
        const key=handle.toLowerCase();
        const row=tiktokLiveLibrary.get(key)||{};
        if(!tiktokRealtimeLiveHandles.has(key)||row.playable)continue;

        let ok=false;
        try{
          ok=await warmTikTokLibraryHandle(handle);
        }catch(error){
          console.log(
            '[tiktok-live-link-batch] failed',
            handle,
            compactText(error?.message||error,120)
          );
        }

        const fresh=tiktokLiveLibrary.get(key)||{};
        if(ok&&tiktokRealtimeLiveHandles.has(key)&&fresh.playable)ready+=1;
        else failed+=1;
      }
    };

    await Promise.all(
      Array.from(
        {length:Math.min(TIKTOK_LIVE_LIBRARY_WARM_CONCURRENCY,currentTargets.length)},
        ()=>worker()
      )
    );

    await persistTikTokLiveStore({force:true}).catch(()=>{});
    console.log(
      '[tiktok-live-link-batch] done',
      'channels='+currentTargets.length,
      'ready='+ready,
      'failed='+failed,
      'ms='+(Date.now()-started)
    );
    return {total:currentTargets.length,ready,failed};
  };

  tiktokLiveLibraryWarmBatchPromise=(async()=>{
    let aggregate={total:0,ready:0,failed:0};
    let current=targets;
    while(current.length){
      const result=await run(current);
      aggregate={
        total:aggregate.total+result.total,
        ready:aggregate.ready+result.ready,
        failed:aggregate.failed+result.failed
      };
      current=[...tiktokLiveLibraryWarmBatchPending];
      tiktokLiveLibraryWarmBatchPending.clear();
      current=current.filter(handle=>{
        const key=handle.toLowerCase();
        const row=tiktokLiveLibrary.get(key)||{};
        return tiktokRealtimeLiveHandles.has(key)&&!Boolean(row.playable);
      });
    }
    return aggregate;
  })().finally(()=>{
    tiktokLiveLibraryWarmBatchPromise=null;
  });

  return tiktokLiveLibraryWarmBatchPromise;
}

function queueTikTokLibraryWarm(handle){
  handle=normalizeTikTokHandle(handle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  const row=tiktokLiveLibrary.get(key)||{};
  if(!tiktokRealtimeLiveHandles.has(key)||row.playable)return true;

  tiktokLiveLibraryWarmBatchPending.add(handle);
  if(!tiktokLiveLibraryWarmBatchTimer){
    tiktokLiveLibraryWarmBatchTimer=setTimeout(()=>{
      tiktokLiveLibraryWarmBatchTimer=null;
      const batch=[...tiktokLiveLibraryWarmBatchPending];
      tiktokLiveLibraryWarmBatchPending.clear();
      void resolveTikTokLiveSourceBatch(batch);
    },50);
    tiktokLiveLibraryWarmBatchTimer.unref?.();
  }
  return true;
}

function registerTikTokLiveSelectedHandles(handles){
  const next=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))];
  let changed=false;
  for(const handle of next){
    if(!tiktokLiveSelectedHandles.has(handle)){
      tiktokLiveSelectedHandles.add(handle);
      changed=true;
    }
  }
  return changed;
}

function touchTikTokLivePackage(){
  tiktokLiveLibraryVersion+=1;
  tiktokLiveLibraryUpdatedAt=Date.now();
  tiktokLivePersistedVersion=-1;
}

async function persistTikTokSelectedMembership(rawHandle,selected=true){
  if(TIKTOK_UPDATES_PAUSED)throw new Error('tiktok_updates_paused');
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');

  if(selected){
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_channels?on_conflict=handle',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify([{handle,selected:true,updated_at:nowIso()}])
      }
    );
    if(!r.ok)throw new Error('tiktok_membership_write_'+r.status+':'+await r.text());
  }else{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_channels?handle=eq.'+encodeURIComponent(handle),
      {
        method:'PATCH',
        headers:storeHeaders({prefer:'return=minimal'}),
        body:JSON.stringify({selected:false,updated_at:nowIso()})
      }
    );
    if(!r.ok)throw new Error('tiktok_membership_delete_'+r.status+':'+await r.text());
  }

  // yt1988_tiktok_channels.selected is the single membership source of truth.
  return true;
}

async function reconcileTikTokManagedMembership(){
  // Membership is canonical only in yt1988_tiktok_channels.selected.
  // LIVE rows no longer carry a second selected flag.
  return true;
}
async function loadTikTokLiveStore(){
  try{
    const [selectedRes,channelsRes,packageRes]=await Promise.all([
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_channels?selected=eq.true&select=handle&order=handle.asc',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_channels?select=handle,live,probe_state,playable,stream_type,stream_url,source_sig,state_changed_at,last_known_at,checked_at,updated_at',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_package?package_key=eq.live&select=version,updated_at&limit=1',
        {headers:storeHeaders()}
      )
    ]);
    if(!selectedRes.ok)throw new Error('tiktok_membership_read_'+selectedRes.status+':'+await selectedRes.text());
    if(!channelsRes.ok)throw new Error('tiktok_channels_read_'+channelsRes.status+':'+await channelsRes.text());
    if(!packageRes.ok)throw new Error('tiktok_package_read_'+packageRes.status+':'+await packageRes.text());

    const selectedRows=await selectedRes.json();
    const channels=await channelsRes.json();
    const packageRows=await packageRes.json();
    const channelMap=new Map(
      (Array.isArray(channels)?channels:[])
        .map(row=>[String(row?.handle||'').toLowerCase(),row])
    );

    tiktokLiveSelectedHandles.clear();
    tiktokRealtimeLiveHandles.clear();
    tiktokLiveFastSources.clear();
    for(const selected of Array.isArray(selectedRows)?selectedRows:[]){
      const handle=normalizeTikTokHandle(selected?.handle||'');
      if(!handle)continue;
      tiktokLiveSelectedHandles.add(handle);

      const stored=channelMap.get(handle.toLowerCase())||{};
      const type=String(stored?.stream_type||'').toLowerCase();
      const url=String(stored?.stream_url||'');
      const live=Boolean(stored?.live);
      if(live)tiktokRealtimeLiveHandles.add(handle.toLowerCase());
      let source=null;

      if(live&&type==='flv'&&/^https?:\/\//i.test(url)){
        source={
          mode:'fast-store',
          handle,
          type,
          url,
          headers:{
            'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept':'*/*',
            'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
            'referer':'https://www.tiktok.com/@'+handle+'/live',
            'origin':'https://www.tiktok.com'
          },
          at:Date.parse(stored?.checked_at||stored?.updated_at||0)||Date.now(),
          source:'supabase',
          confirmed:false
        };
        if(tiktokLiveSourceUsable(source)){
          tiktokLiveFastSources.set(handle.toLowerCase(),source);
        }else{
          source=null;
        }
      }

      updateTikTokLiveLibrary(handle,{
        live,
        ready:Boolean(source),
        playable:Boolean(stored?.playable&&source),
        type:source?.type||'',
        mode:source?'fast-store':'',
        source:source?'supabase':'',
        status:live?'live':'offline',
        probeState:String(stored?.probe_state||'unknown'),
        sourceSig:source?tiktokLibrarySourceSig(source):'',
        stateChangedAt:Date.parse(stored?.state_changed_at||0)||0,
        lastKnownAt:Date.parse(stored?.last_known_at||0)||0,
        lastSeenAt:Date.parse(stored?.checked_at||stored?.updated_at||0)||0,
        expiresAt:source?tiktokStreamExpiresAt(source.url):0
      });
    }

    const packageRow=Array.isArray(packageRows)?packageRows[0]:null;
    const storedVersion=Number(packageRow?.version||0);
    if(storedVersion>tiktokLiveLibraryVersion)tiktokLiveLibraryVersion=storedVersion;
    tiktokLivePersistedVersion=tiktokLiveLibraryVersion;
    console.log('[tiktok-store] loaded','managed='+tiktokLiveSelectedHandles.size,'version='+tiktokLiveLibraryVersion);
    void reconcileTikTokManagedMembership();
    return true;
  }catch(error){
    console.warn('[tiktok-store] load failed',compactText(error?.message||error,220));
    return false;
  }
}
function buildTikTokStoredRows(){
  const now=nowIso();
  return [...tiktokLiveSelectedHandles]
    .map(handle=>{
      const key=handle.toLowerCase();
      const item=tiktokLiveLibrary.get(key)||{};
      const source=currentTikTokLibrarySource(handle);
      const sourceType=String(source?.type||'').toLowerCase();
      const scan=tiktokRealtimeStatusByHandle.get(key)||null;
      const detectedLive=tiktokConfirmedLiveNow(handle,Date.now());
      const live=tiktokPublishedLiveNow(handle,Date.now(),item);
      const playable=live;
      return {
        handle,
        // Keep TikTok's detected LIVE state internally. Public/UI LIVE is
        // derived separately and requires a validated FLV.
        live,
        probe_state:detectedLive?'live':(scan?.offlineConfirmed?'offline':'unknown'),
        playable,
        stream_type:playable?'flv':'',
        stream_url:playable?String(source.url||''):'',
        source_sig:playable?tiktokLibrarySourceSig(source):'',
        state_changed_at:item.stateChangedAt?new Date(Number(item.stateChangedAt)).toISOString():null,
        last_known_at:item.lastKnownAt?new Date(Number(item.lastKnownAt)).toISOString():null,
        checked_at:item.lastSeenAt?new Date(Number(item.lastSeenAt)).toISOString():now,
        updated_at:now
      };
    })
    .sort((a,b)=>a.handle.localeCompare(b.handle));
}
async function persistTikTokLiveStore({force=false}={}){
  if(TIKTOK_UPDATES_PAUSED)return true;
  if(!force&&tiktokLivePersistedVersion===tiktokLiveLibraryVersion)return true;
  if(tiktokLiveStoreWritePromise)return tiktokLiveStoreWritePromise;

  tiktokLiveStoreWritePromise=(async()=>{
    const rows=buildTikTokStoredRows();
    const isPublishedLive=row=>Boolean(
      row.live&&
      row.playable&&
      String(row.stream_type||'').toLowerCase()==='flv'&&
      String(row.stream_url||'')&&
      String(row.source_sig||'')
    );
    const liveCount=rows.filter(isPublishedLive).length;
    const playableCount=liveCount;
    const detectedLiveCount=rows.filter(row=>row.probe_state==='live').length;
    const pendingLinkCount=rows.filter(
      row=>row.probe_state==='live'&&!isPublishedLive(row)
    ).length;
    const staleLiveUnknownCount=rows.filter(
      row=>row.live&&row.probe_state==='unknown'
    ).length;
    // This row is only a durable version/health marker. Per-channel state
    // already lives in yt1988_tiktok_live_channels and the UI reads LIVE from
    // the Cloudflare edge. Do not duplicate 171 channel rows inside JSONB.
    const payload={
      total:rows.length,
      live:liveCount,
      playable:playableCount,
      detectedLive:detectedLiveCount,
      pendingLink:pendingLinkCount,
      staleLiveUnknown:staleLiveUnknownCount,
      offline:rows.filter(row=>row.probe_state==='offline').length
    };
    const now=nowIso();

    const [channelsRes,packageRes]=await Promise.all([
      rows.length?fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_channels?on_conflict=handle',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify(rows)
        }
      ):Promise.resolve({ok:true,status:204,text:async()=>''}),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_package?on_conflict=package_key',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify([{
            package_key:'live',
            version:tiktokLiveLibraryVersion,
            payload,
            updated_at:now
          }])
        }
      )
    ]);

    if(!channelsRes.ok)throw new Error('tiktok_channels_write_'+channelsRes.status+':'+await channelsRes.text());
    if(!packageRes.ok)throw new Error('tiktok_package_write_'+packageRes.status+':'+await packageRes.text());

    tiktokLivePersistedVersion=tiktokLiveLibraryVersion;
    console.log(
      '[tiktok-store] saved',
      'channels='+rows.length,
      'live='+liveCount,
      'detectedLive='+detectedLiveCount,
      'pendingLink='+pendingLinkCount,
      'staleLiveUnknown='+staleLiveUnknownCount,
      'version='+tiktokLiveLibraryVersion
    );
    return true;
  })().catch(error=>{
    console.warn('[tiktok-store] save failed',compactText(error?.message||error,220));
    return false;
  }).finally(()=>{
    tiktokLiveStoreWritePromise=null;
  });

  return tiktokLiveStoreWritePromise;
}

function ensureTikTokLivePackageScan(handles=null){
  const targeted=Boolean(handles&&handles.length);
  const target=targeted
    ? [...new Set(handles.map(normalizeTikTokHandle).filter(Boolean))]
    : [...tiktokLiveSelectedHandles];
  if(!target.length)return Promise.resolve();

  // A targeted call (for example ADD CHANNEL) is only a trigger into the
  // normal LIVE checker. It has no separate LIVE/FLV rules of its own.
  // It runs independently from the global sweep so a new handle is checked now.
  if(targeted){
    return Promise.all(target.map(handle=>{
      const key=handle.toLowerCase();
      const running=tiktokLivePriorityScanPromises.get(key);
      if(running)return running;

      // New/explicit checks bypass stale throttles, but still use the exact
      // same refreshTikTokLiveLibrary -> FLV resolver definition as all checks.
      tiktokLiveLibraryRefreshAt.delete(key);
      tiktokLiveLibraryWarmRetryAt.delete(key);

      const job=(async()=>{
        console.log('[tiktok-live-check] targeted start',handle);
        // Adding/checking one channel only resolves current LIVE status.
        // Media is intentionally deferred until the user opens the stream.
        await runTikTokLiveMinuteSweep({targetHandles:[handle],exhaustive:true});
        await persistTikTokLiveStore({force:true});

      // Rebuild only this canonical membership row. No LIVE check, no profile
      // fetch and no video scan are triggered by ADD itself.
      if(tiktokCanonicalLoaded){
        const existing=tiktokCanonicalChannels.get(key);
        if(existing&&!selected){
          existing.selected=false;
          existing.updated_at=nowIso();
          tiktokCanonicalChannels.set(key,existing);
          await upsertTikTokCanonicalRows([existing],[]);
          await persistTikTokCanonicalPackage();
        }else if(selected){
          await syncTikTokCanonicalLibrary([handle],{mirror:false});
        }
      }

      const liveRow=tiktokLiveLibrary.get(key)||null;
        json(res,200,{
          ok:true,
          handle:existingHandle,
          selected:true,
          duplicate:true,
          unchanged:true,
          live:Boolean(liveRow?.live),
          ready:Boolean(liveRow?.ready),
          type:String(liveRow?.type||''),
          sourceSig:String(liveRow?.sourceSig||''),
          total:tiktokLiveSelectedHandles.size,
          version:tiktokLiveLibraryVersion
        });
        return;
      }
      if(!selected&&!had){
        json(res,200,{
          ok:true,
          handle,
          selected:false,
          unchanged:true,
          total:tiktokLiveSelectedHandles.size,
          version:tiktokLiveLibraryVersion
        });
        return;
      }

      // ADD/REMOVE is a membership mutation only. The UI has already reduced
      // the user's input to one syntactically-valid TikTok handle. Do not
      // re-query TikTok/profile/browser/TikWM here; those belong to explicit
      // open/refresh actions and make a simple add unnecessarily fragile.
      // Control plane owns state transitions. Change RAM only after validation
      // so invalid names never appear in the selected package even briefly.
      if(selected)tiktokLiveSelectedHandles.add(handle);
      else tiktokLiveSelectedHandles.delete(existingHandle||handle);

      if(selected){
        // ADD CHANNEL does not own LIVE/FLV logic. It only marks the channel as
        // selected, then invokes the existing shared LIVE checker below.
        if(!tiktokLiveLibrary.has(key)){
          updateTikTokLiveLibrary(handle,{
            live:false,
            ready:false,
            status:'checking',
            sourceSig:'',
            lastSeenAt:0
          });
        }
      }else{
        tiktokRealtimeLiveHandles.delete(key);
        tiktokLiveFastSources.delete(key);
        tiktokLiveLibrary.delete(key);
        tiktokVideoLibrary.delete(key);
        tiktokLiveLibraryRefreshAt.delete(key);
        tiktokVideoRefreshAt.delete(key);
      }

      if(had!==selected)touchTikTokLivePackage();

      try{
        await persistTikTokSelectedMembership(handle,selected);
      }catch(error){
        // Roll RAM membership back if durable selection write fails.
        if(had)tiktokLiveSelectedHandles.add(existingHandle||handle);
        else tiktokLiveSelectedHandles.delete(handle);
        throw error;
      }

      await persistTikTokLiveStore({force:true});

      // Rebuild this handle immediately. Do not wait for a background timer.
      if(tiktokCanonicalLoaded){
        const existing=tiktokCanonicalChannels.get(key);
        if(existing&&!selected){
          existing.selected=false;
          existing.updated_at=nowIso();
          tiktokCanonicalChannels.set(key,existing);
          await upsertTikTokCanonicalRows([existing],[]);
          await persistTikTokCanonicalPackage();
        }else if(selected){
          await syncTikTokCanonicalLibrary([handle],{mirror:false});
        }
      }

      if(selected){
        // ADD CHANNEL asks TikTok API for the current value only.
        console.log('[tiktok-selected] check current TikTok LIVE',handle);
        let liveState=await quickTikTokLiveStateOnly(handle).catch(()=>({
          known:false,live:false,status:null,source:'tiktok-error'
        }));
        if(!liveState?.known){
          const detailState=await quickTikTokLiveDetailStatus(handle).catch(()=>null);
          if(detailState?.known){
            liveState={
              known:true,
              live:detailState.live===true,
              status:Number(detailState.status),
              source:'tiktok-live-detail'
            };
          }
        }
        let isLive=Boolean(liveState?.known&&liveState.live===true);
        const checkedAt=Date.now();

        if(!isLive&&!liveState?.known){
          await queueTikTokStatusFallback([handle]).catch(()=>{});
          isLive=tiktokRealtimeLiveHandles.has(key);
        }

        if(isLive){
          tiktokRealtimeLiveHandles.add(key);
          updateTikTokLiveLibrary(handle,{
            live:true,
            status:'live',
            probeState:'live',
            liveCheckSource:String(liveState?.source||'tiktok-api'),
            lastSeenAt:checkedAt
          });
          void resolveTikTokLiveSourceBatch([handle]).catch(error=>{
            console.warn('[tiktok-live-getlink] add failed',handle,compactText(error?.message||error,120));
          });
        }else if(!tiktokRealtimeLiveHandles.has(key)){
          const deepStatus=tiktokRealtimeStatusByHandle.get(key);
          updateTikTokLiveLibrary(handle,{
            live:false,
            status:deepStatus?.offlineConfirmed?'offline':(liveState?.known?'offline':'unknown'),
            probeState:deepStatus?.offlineConfirmed?'offline':(liveState?.known?'offline':'unknown'),
            liveCheckSource:String(deepStatus?.offlineConfirmed?'deep-multi-source':(liveState?.source||'tiktok-api')),
            lastSeenAt:checkedAt
          });
        }
        tiktokRealtimeLiveCheckedAt=checkedAt;


        setTimeout(()=>{void ensureTikTokVideoPackageScan([handle]);},1500).unref();
        setTimeout(()=>{
          void (async()=>{
            const profile=await fetchTikTokProfileIdentity(handle).catch(()=>null);
            const profiles=new Map();
            if(profile)profiles.set(handle.toLowerCase(),profile);
            await syncTikTokCanonicalLibrary([handle],{profiles,mirror:true});
          })().catch(error=>{
            console.log('[tiktok-library] new channel profile failed',handle,compactText(error?.message||error,100));
          });
        },500).unref();
      }

      const liveRow=tiktokLiveLibrary.get(key)||null;
      json(res,200,{
        ok:true,
        handle,
        selected,
        live:Boolean(liveRow?.live),
        ready:Boolean(liveRow?.ready),
        type:String(liveRow?.type||''),
        sourceSig:String(liveRow?.sourceSig||''),
        total:tiktokLiveSelectedHandles.size
      });
    }catch(error){
      console.warn('[tiktok-selected] write failed',compactText(error?.message||error,220));
      json(res,500,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/library'&&req.method==='GET'){
    try{
      const requestedHandle=normalizeTikTokHandle(
        url.searchParams.get('user')||url.searchParams.get('handle')||''
      );

      if(requestedHandle){
        let channel=null;
        let version=0;
        let generatedAt=null;

        if(TIKTOK_UPDATES_PAUSED){
          const payload=await loadTikTokFrozenLibraryPackage();
          channel=(Array.isArray(payload?.channels)?payload.channels:[])
            .find(row=>String(row?.handle||'').toLowerCase()===requestedHandle.toLowerCase())||null;
          version=Number(payload?.version||0);
          generatedAt=payload?.generatedAt||null;
        }else{
          await loadTikTokCanonicalStore();
          channel=buildTikTokCanonicalChannel(requestedHandle);
          version=Number(tiktokCanonicalPackageVersion||0);
          generatedAt=new Date(tiktokCanonicalPackageUpdatedAt||Date.now()).toISOString();
        }

        if(!channel){
          json(res,404,{ok:false,error:'tiktok_channel_not_found',handle:requestedHandle});
          return;
        }

        void queueTikTokChannelOpenRefresh(requestedHandle);
        json(res,200,{
          ok:true,
          schema:'tiktok-channel-v1',
          handle:requestedHandle,
          version,
          generatedAt,
          channel
        });
        return;
      }

      const payload=TIKTOK_UPDATES_PAUSED
        ?await loadTikTokFrozenLibraryPackage()
        :(await loadTikTokCanonicalStore(),buildTikTokCanonicalPackage());
      const clientVersion=Number(url.searchParams.get('v')||-1);
      if(clientVersion===Number(payload.version||0)){
        json(res,200,{
          ok:true,
          unchanged:true,
          paused:TIKTOK_UPDATES_PAUSED,
          version:payload.version,
          generatedAt:payload.generatedAt
        });
        return;
      }
      json(res,200,{ok:true,unchanged:false,paused:TIKTOK_UPDATES_PAUSED,...payload});
    }catch(error){
      json(res,502,{ok:false,paused:TIKTOK_UPDATES_PAUSED,error:String(error?.message||error)});
    }
    return;
  }


  if(url.pathname==='/tiktok/video-warm'&&req.method==='GET'){
    const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
    const id=String(url.searchParams.get('id')||'').trim();
    if(!handle||!/^[0-9]{8,}$/.test(id)){
      json(res,400,{ok:false,error:'invalid_tiktok_video'});
      return;
    }

    const key=handle.toLowerCase()+':'+id;
    const cachedFile=tiktokVideoFileCache.get(key);
    if(cachedFile?.path){
      json(res,200,{ok:true,ready:true,source:'file-cache'});
      return;
    }

    // Warm only the signed/direct source metadata. Do NOT pre-download MP4
    // files onto Render: that would consume both upstream and outbound media
    // bandwidth even when direct CDN playback works in the browser.
    queueTikTokVideoPriorityWarm(handle,id,{force:false});
    json(res,202,{ok:true,ready:false,queued:true,mode:'direct-source-only'});
    return;
  }

  if(url.pathname==='/tiktok/video-stream'&&req.method==='GET'){
    if(!acquireRenderMediaProxy(res))return;
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      const id=String(url.searchParams.get('id')||'').trim();
      if(!handle||!/^[0-9]{8,}$/.test(id)){
        json(res,400,{ok:false,error:'invalid_tiktok_video'});
        return;
      }
      const key=handle.toLowerCase()+':'+id;

      // Fastest/reliable path on TikTok: an already-warmed local MP4 file.
      const cachedFile=tiktokVideoFileCache.get(key);
      if(cachedFile?.path){
        try{
          await serveTikTokVideoFile(req,res,cachedFile);
          return;
        }catch{
          tiktokVideoFileCache.delete(key);
        }
      }

      const source=lookupTikTokVideoSourceFast(handle,id);
      if(source){
        const piped=await pipeTikTokTarget(
          req,res,source.url,{
            fallbackType:'video/mp4',
            headersOverride:source.headers||null,
            deferError:true
          }
        ).catch(()=>({ok:false,status:0}));

        if(piped?.ok){
          return;
        }

        // TikTok direct MP4 URLs often return 403 outside yt-dlp's own request
        // context. Fall back to a local yt-dlp file on the same Render host.
        if([0,401,403,404,410].includes(Number(piped?.status||0))){
          try{
            const file=await downloadTikTokVideoFile(handle,id,{force:false});
            await serveTikTokVideoFile(req,res,file);
            return;
          }catch(error){
            console.log('[tiktok-video-file] fallback failed',handle,id,compactText(error?.message||error,120));
          }
        }
      }

      // No usable source yet: prepare both direct source and local file.
      if(!TIKTOK_UPDATES_PAUSED){
        queueTikTokVideoPriorityWarm(handle,id,{force:true});
        void downloadTikTokVideoFile(handle,id,{force:false}).catch(()=>{});
      }
      res.setHeader('retry-after','2');
      json(res,425,{ok:false,error:'video_source_warming'});
    }catch(error){
      console.warn('[tiktok-video-stream] failed',compactText(error?.message||error,220));
      if(!res.headersSent)json(res,502,{ok:false,error:'video_source_failed'});
      else if(!res.writableEnded)res.end();
    }
    return;
  }

  if(url.pathname==='/tiktok/video-session-stream'&&req.method==='GET'){
    // Legacy compatibility only. Media-byte relay through Render is disabled
    // unless explicitly opted in with RENDER_MEDIA_PROXY_ENABLED=1.
    if(!acquireRenderMediaProxy(res))return;
    const target=String(url.searchParams.get('url')||'').trim();
    if(!target){
      json(res,400,{ok:false,error:'missing_url'});
      return;
    }
    try{
      await pipeTikTokSessionOrigin(req,res,target);
    }catch(error){
      console.warn('[tiktok-origin-stream]',compactText(error?.message||error,180));
      if(!res.headersSent)json(res,502,{ok:false,error:String(error?.message||error||'origin_stream_failed')});
      else if(!res.writableEnded)res.end();
    }
    return;
  }

  if(url.pathname==='/tiktok/video-session-link'&&req.method==='GET'){
    const target=String(url.searchParams.get('url')||'').trim();
    if(!target){
      json(res,400,{ok:false,error:'missing_url'});
      return;
    }
    try{
      const data=await resolveTikTokSessionLink(target);
      json(res,200,{ok:true,data});
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error||'tiktok_session_link_failed')});
    }
    return;
  }

  if(url.pathname==='/media'&&req.method==='GET'){
    const target=String(url.searchParams.get('url')||'').trim();
    if(!target){
      json(res,400,{ok:false,error:'missing_url'});
      return;
    }
    try{
      const data=await resolveTikTokMediaNoStore(target);
      json(res,200,{ok:true,data});
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error||'media_resolve_failed')});
    }
    return;
  }

  if(url.pathname==='/tiktok/vod-resolve'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      const id=String(url.searchParams.get('id')||'').trim();
      let source=String(url.searchParams.get('source')||'').toLowerCase();
      const force=url.searchParams.get('refresh')==='1';
      if(!source||source==='auto'){
        const tail=Number(String(id||'').slice(-5)||0);
        source=TIKTOK_VOD_EXTERNAL_POOL[Math.abs(tail)%TIKTOK_VOD_EXTERNAL_POOL.length]||'tikwm';
      }
      const row=await resolveTikTokVodExternal(handle,id,source,{force});
      json(res,200,{
        ok:true,
        handle:row.handle,
        id:row.id,
        source:row.source,
        directUrl:row.url,
        expiresAt:row.expiresAt,
        proxyVideo:false,
        mediaBytesFromRender:false
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error||'vod_resolve_failed')});
    }
    return;
  }

  if(url.pathname==='/tiktok/video-source'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      const id=String(url.searchParams.get('id')||'').trim();
      const force=url.searchParams.get('refresh')==='1';
      const source=await resolveTikTokVideoSource(handle,id,{force});
      const relayHeaders={};
      for(const [name,value] of Object.entries(source.headers||{})){
        const key=String(name||'').toLowerCase();
        if(!['user-agent','referer','origin','accept','accept-language'].includes(key))continue;
        relayHeaders[key]=String(value||'');
      }
      relayHeaders['user-agent']=relayHeaders['user-agent']||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36';
      relayHeaders.referer=relayHeaders.referer||('https://www.tiktok.com/@'+source.handle);
      relayHeaders.accept=relayHeaders.accept||'*/*';

      json(res,200,{
        ok:true,
        handle:source.handle,
        id:source.id,
        width:source.width,
        height:source.height,
        duration:source.duration,
        directUrl:String(source.url||''),
        expiresAt:tiktokStreamExpiresAt(source.url)?new Date(tiktokStreamExpiresAt(source.url)).toISOString():null,
        source:String(source.source||'yt-dlp'),
        relayHeaders,
        stream:RENDER_MEDIA_PROXY_ENABLED
          ?('/tiktok/video-stream?user='+encodeURIComponent(source.handle)+
            '&id='+encodeURIComponent(source.id))
          :''
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/video-fingerprints'&&req.method==='GET'){
    try{
      await loadTikTokCanonicalStore();
      const items=[...tiktokLiveSelectedHandles]
        .map(handle=>{
          const key=handle.toLowerCase();
          const canonical=tiktokCanonicalChannels.get(key)||{};
          const videoRow=tiktokVideoLibrary.get(key)||{};
          const latestCanonical=[...tiktokCanonicalVideos.values()]
            .filter(row=>String(row?.handle||'').toLowerCase()===key)
            .sort((a,b)=>Number(b?.create_time||0)-Number(a?.create_time||0))[0]||null;
          return {
            handle,
            secUid:String(canonical?.sec_uid||videoRow?.secUid||''),
            videoCount:Number(canonical?.video_count||0),
            latestVideoId:String(
              videoRow?.latestVideoId||
              videoRow?.videos?.[0]?.id||
              latestCanonical?.video_id||
              ''
            )
          };
        })
        .sort((a,b)=>a.handle.localeCompare(b.handle));
      json(res,200,{
        ok:true,
        total:items.length,
        items
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/channel-videos'&&req.method==='GET'){
    const handle=normalizeTikTokHandle(url.searchParams.get('user')||url.searchParams.get('handle')||'');
    if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
    try{
      const key=handle.toLowerCase();
      const current=tiktokVideoLibrary.get(key)||{
        handle,secUid:'',latestVideoId:'',videos:[],checkedAt:0,status:'waiting'
      };
      if(url.searchParams.get('refresh')!=='0'&&!TIKTOK_UPDATES_PAUSED){
        // Cloudflare normally sends a cheap change notification. A one-off
        // user repair may request full=1&wait=1 for this channel only.
        const task=queueTikTokEdgeVideoRefresh(handle,{
          forceDeep:url.searchParams.get('full')==='1'
        });
        if(url.searchParams.get('wait')==='1'&&task)await task;
      }
      const row=tiktokVideoLibrary.get(key)||current;
      json(res,200,{
        ok:true,
        handle,
        secUid:String(row.secUid||''),
        latestVideoId:String(row.latestVideoId||''),
        videos:Array.isArray(row.videos)?row.videos.slice(0,TIKTOK_VIDEO_PER_CHANNEL):[],
        checkedAt:Number(row.checkedAt||0),
        status:String(row.status||'waiting'),
        version:tiktokVideoPackageVersion
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/video-refresh-all'&&req.method==='GET'){
    const handles=[...tiktokLiveSelectedHandles];
    if(!handles.length){
      json(res,200,{ok:true,queued:false,total:0});
      return;
    }

    if(!tiktokVideoFullRefreshPromise){
      tiktokVideoFullRefreshPromise=(async()=>{
        console.log('[tiktok-video-refresh-all] start','channels='+handles.length);
        for(const handle of handles)tiktokVideoRefreshAt.delete(handle.toLowerCase());
        await refreshTikTokVideoLibrary(handles,{forceDeep:true});
        await persistTikTokVideoStore({force:true});
        await syncTikTokCanonicalLibrary(handles,{mirror:false});
        await persistTikTokCanonicalPackage();
        console.log(
          '[tiktok-video-refresh-all] done',
          'channels='+handles.length,
          'videos='+[...tiktokCanonicalVideos.values()]
            .filter(row=>handles.some(h=>h.toLowerCase()===String(row?.handle||'').toLowerCase()))
            .length
        );
        return true;
      })()
        .catch(error=>{
          console.warn('[tiktok-video-refresh-all] failed',compactText(error?.message||error,180));
          return false;
        })
        .finally(()=>{tiktokVideoFullRefreshPromise=null;});
    }

    json(res,202,{
      ok:true,
      queued:true,
      running:true,
      total:handles.length,
      perChannel:TIKTOK_VIDEO_PER_CHANNEL
    });
    return;
  }

  if(url.pathname==='/tiktok/video-library'&&req.method==='GET'){
    if(url.searchParams.get('refresh')==='1'){
      await ensureTikTokVideoPackageScan();
    }

    const clientVersion=Number(url.searchParams.get('v')||-1);
    if(clientVersion===tiktokVideoPackageVersion){
      json(res,200,{
        ok:true,
        unchanged:true,
        version:tiktokVideoPackageVersion,
        updatedAt:tiktokVideoPackageUpdatedAt
      });
      return;
    }

    const channels=[...tiktokLiveSelectedHandles]
      .map(handle=>{
        const row=tiktokVideoLibrary.get(handle.toLowerCase())||{};
        return {
          handle,
          secUid:String(row.secUid||''),
          latestVideoId:String(row.latestVideoId||''),
          videos:Array.isArray(row.videos)?row.videos.slice(0,TIKTOK_VIDEO_PER_CHANNEL):[],
          checkedAt:Number(row.checkedAt||0),
          status:String(row.status||'waiting')
        };
      })
      .sort((a,b)=>Number(b.videos?.[0]?.createTime||0)-Number(a.videos?.[0]?.createTime||0)||a.handle.localeCompare(b.handle));

    json(res,200,{
      ok:true,
      unchanged:false,
      version:tiktokVideoPackageVersion,
      updatedAt:tiktokVideoPackageUpdatedAt,
      total:channels.length,
      videoCount:channels.reduce((sum,row)=>sum+row.videos.length,0),
      channels
    });
    return;
  }

  if(url.pathname==='/tiktok/live-statuses'&&req.method==='GET'){
    const refreshMode=String(url.searchParams.get('refresh')||'');
    const force=refreshMode==='1'||refreshMode==='all';
    const stale=Date.now()-Number(tiktokRealtimeLiveCheckedAt||0)>70_000;
    if(!TIKTOK_UPDATES_PAUSED){
      if(refreshMode==='all'){
        await runTikTokLiveAuditSweep();
      }else if(force||(!RENDER_LIVE_BACKGROUND_SWEEP?false:(AUTO_COLLECT&&(stale||!tiktokRealtimeLiveCheckedAt)))){
        await runTikTokLiveMinuteSweep();
      }
    }

    const handles=[...tiktokLiveSelectedHandles].sort((a,b)=>a.localeCompare(b));
    const items=handles.map(handle=>{
      const key=handle.toLowerCase();
      const row=tiktokLiveLibrary.get(key)||{};
      const scan=tiktokRealtimeStatusByHandle.get(key)||null;
      const retained=tiktokRealtimeLiveHandles.has(key);
      const playable=Boolean(
        retained&&row.playable&&String(row.type||'').toLowerCase()==='flv'&&String(row.sourceSig||'')
      );
      const hasCandidate=Boolean(currentTikTokLibrarySource(handle));

      let state='checking';
      if(scan?.live){
        if(playable)state='live_ready';
        else if(hasCandidate||String(row.status||'')==='warming')state='live_verifying_flv';
        else state='live_resolving_flv';
      }else if(scan?.offlineConfirmed){
        state='offline';
      }else if(scan?.retained){
        state=playable?'live_ready':'live_unverified';
      }else if(scan?.checkedAt){
        state='unknown';
      }

      const videoRow=tiktokVideoLibrary.get(key)||{};
      const canonical=tiktokCanonicalChannels.get(key)||{};
      return {
        handle,
        secUid:String(videoRow.secUid||canonical.sec_uid||''),
        latestVideoId:String(videoRow.latestVideoId||videoRow.videos?.[0]?.id||''),
        state,
        detectedLive:Boolean(scan?.live),
        retainedLive:Boolean(scan?.retained),
        playable,
        type:playable?'flv':'',
        sourceSig:playable?String(row.sourceSig||''):'',
        internalStatus:String(row.status||''),
        probeState:String(row.probeState||'unknown'),
        liveCheckSource:String(row.liveCheckSource||''),
        checkedAt:Number(scan?.checkedAt||tiktokRealtimeLiveCheckedAt||0),
        lastSeenAt:Number(row.lastSeenAt||0),
        evidence:Array.isArray(scan?.evidence)?scan.evidence:[]
      };
    });

    const counts={};
    for(const item of items)counts[item.state]=(counts[item.state]||0)+1;
    json(res,200,{
      ok:true,
      exhaustive:true,
      checkedAt:tiktokRealtimeLiveCheckedAt,
      audit:{...tiktokLiveAuditState},
      total:items.length,
      counts,
      items
    });
    return;
  }

  if(url.pathname==='/tiktok/live-now'&&req.method==='GET'){
    tiktokLiveLastViewerAt=Date.now();
    // Never expose an uninitialized empty snapshot. The first realtime read
    // waits for one complete TikTok API check of the selected channels.
    if(!tiktokRealtimeLiveCheckedAt&&!TIKTOK_UPDATES_PAUSED&&AUTO_COLLECT){
      await runTikTokLiveMinuteSweep();
    }

    const wanted=tiktokLiveSelectedHandles.size
      ?new Set([...tiktokLiveSelectedHandles].map(x=>x.toLowerCase()))
      :new Set();

    const now=Date.now();
    const handles=[...tiktokLiveSelectedHandles]
      .map(handle=>handle.toLowerCase())
      .filter(handle=>{
        if(!wanted.has(handle))return false;
        return tiktokPublishedLiveNow(handle,now);
      })
      .sort((a,b)=>a.localeCompare(b));

    const items=handles.map(handle=>{
      const row=tiktokLiveLibrary.get(handle)||{};
      const item=publicTikTokLibraryItem({...row,handle,live:true,probeState:'live',status:'live'});
      return item
        ?{
            ...item,
            live:true,
            detectedLive:true,
            probeState:'live',
            status:item.playable?'ready':'live'
          }
        :{
            handle,
            live:true,
            detectedLive:true,
            probeState:'live',
            status:'live',
            playable:false,
            type:'',
            sourceSig:'',
            streamUrl:''
          };
    });

    json(res,200,{
      ok:true,
      realtime:true,
      checkedAt:tiktokRealtimeLiveCheckedAt,
      total:wanted.size,
      live:handles.length,
      items
    });
    return;
  }


  if(url.pathname==='/tiktok/live-library'&&req.method==='GET'){
    tiktokLiveLastViewerAt=Date.now();
    // Compatibility route only. LIVE has no package/version/history semantics.
    if(!tiktokRealtimeLiveCheckedAt){
      await runTikTokLiveMinuteSweep();
    }
    const wanted=tiktokLiveSelectedHandles.size
      ?new Set([...tiktokLiveSelectedHandles].map(x=>x.toLowerCase()))
      :new Set();

    const now=Date.now();
    const handles=[...tiktokLiveSelectedHandles]
      .map(handle=>handle.toLowerCase())
      .filter(handle=>{
        if(!wanted.has(handle))return false;
        return tiktokPublishedLiveNow(handle,now);
      })
      .sort((a,b)=>a.localeCompare(b));

    const items=handles.map(handle=>{
      const row=tiktokLiveLibrary.get(handle)||{};
      const item=publicTikTokLibraryItem({...row,handle,live:true,probeState:'live',status:'live'});
      return item
        ?{
            ...item,
            live:true,
            detectedLive:true,
            probeState:'live',
            status:item.playable?'ready':'live'
          }
        :{
            handle,
            live:true,
            detectedLive:true,
            probeState:'live',
            status:'live',
            playable:false,
            type:'',
            sourceSig:'',
            streamUrl:''
          };
    });

    json(res,200,{
      ok:true,
      realtime:true,
      checkedAt:tiktokRealtimeLiveCheckedAt,
      total:wanted.size,
      live:handles.length,
      items
    });
    return;
  }


  if(url.pathname==='/tiktok/live-session'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
      const forceBrowser=url.searchParams.get('force')==='browser';
      let source;
      if(forceBrowser){
        tiktokLiveFastSources.delete(handle.toLowerCase());
        const session=await captureTikTokLiveSession(handle);
        source={mode:'browser',type:session.type,source:'browser-session',at:session.at};
      }else{
        source=await resolveTikTokLiveSource(handle);
      }
      const libraryRow=currentTikTokLibrarySource(handle);
      if(libraryRow)noteTikTokLibrarySource(handle,libraryRow,{
        mode:source.mode||'',
        source:source.source||source.mode,
        ready:Boolean(libraryRow.confirmed),
        status:libraryRow.confirmed?'ready':'warm'
      });
      json(res,200,{
        ok:true,
        handle,
        streamType:source.type,
        mode:source.mode,
        source:source.source||source.mode,
        capturedAt:new Date(source.at||Date.now()).toISOString()
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/live-stream'&&req.method==='GET'){
    if(!acquireRenderMediaProxy(res))return;
    try{
      await proxyTikTokLive(
        req,res,
        url.searchParams.get('user')||'',
        url.searchParams.get('force')==='browser',
        url.searchParams.get('source')||''
      );
    }catch(error){
      if(!res.headersSent)json(res,502,{ok:false,error:String(error?.message||error)});
      else if(!res.writableEnded)res.end();
    }
    return;
  }

  if(url.pathname==='/tiktok/profile-identities'&&req.method==='GET'){
    try{
      const handles=[...new Set(
        String(url.searchParams.get('handles')||'')
          .split(',')
          .map(normalizeTikTokHandle)
          .filter(Boolean)
      )].slice(0,120);
      if(!handles.length){json(res,200,{ok:true,items:[]});return;}

      const items=new Map();
      const missing=[];
      for(const handle of handles){
        const key=handle.toLowerCase();
        const cached=tiktokProfileIdentityCache.get(key);
        if(cached&&Date.now()-Number(cached.at||0)<TIKTOK_PROFILE_IDENTITY_TTL_MS&&
           (cached.data?.nickname||cached.data?.avatar)){
          items.set(key,{...cached.data});
        }else{
          missing.push(handle);
        }
      }

      if(missing.length){
        const browserRows=await browserTikTokProfileIdentities(missing);
        for(const handle of missing){
          const key=handle.toLowerCase();
          const row=browserRows.get(key);
          if(row)items.set(key,row);
        }
        console.log(
          '[tiktok-profile-batch]',
          'total='+missing.length,
          'browser='+browserRows.size
        );
      }

      const payload=handles.map(handle=>{
        const identity=items.get(handle.toLowerCase())||{};
        const videoRow=tiktokVideoLibrary.get(handle.toLowerCase())||null;
        const latestVideo=Array.isArray(videoRow?.videos)?videoRow.videos[0]||null:null;
        return {
          handle,
          nickname:String(identity.nickname||''),
          avatar:String(identity.avatar||''),
          secUid:String(identity.secUid||''),
          followerCount:Number(identity.followerCount||0),
          followingCount:Number(identity.followingCount||0),
          heartCount:Number(identity.heartCount||0),
          videoCount:Number(identity.videoCount||0),
          latestVideoId:String(latestVideo?.id||''),
          latestVideoPlayCount:Number(latestVideo?.playCount||0),
          latestVideoDiggCount:Number(latestVideo?.diggCount||0),
          source:String(identity.source||'')
        };
      });
      json(res,200,{ok:true,items:payload});
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/profile-identity'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
      const identity=await fetchTikTokProfileIdentity(handle);
      const videoRow=tiktokVideoLibrary.get(handle.toLowerCase())||null;
      const latestVideo=Array.isArray(videoRow?.videos)?videoRow.videos[0]||null:null;
      console.log('[tiktok-identity]',handle,'video='+(identity.videoId||latestVideo?.id||'none'),'sec='+(identity.secUid?'yes':'no'));
      json(res,200,{
        ok:true,
        handle,
        profileUrl:'https://www.tiktok.com/@'+handle,
        videoId:String(identity.videoId||''),
        videoUrl:identity.videoId?'https://www.tiktok.com/@'+handle+'/video/'+identity.videoId:'',
        nickname:String(identity.nickname||''),
        avatar:String(identity.avatar||''),
        secUid:String(identity.secUid||''),
        followerCount:Number(identity.followerCount||0),
        followingCount:Number(identity.followingCount||0),
        heartCount:Number(identity.heartCount||0),
        videoCount:Number(identity.videoCount||0),
        latestVideoId:String(latestVideo?.id||identity.videoId||''),
        latestVideoPlayCount:Number(latestVideo?.playCount||0),
        latestVideoDiggCount:Number(latestVideo?.diggCount||0),
        source:String(identity.source||'')
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/profile'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
      const limit=clamp(url.searchParams.get('limit')||6,1,12);
      const data=await getTikTokProfileSample(handle,limit);
      json(res,200,data);
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/api/get-m3u8'&&req.method==='GET'){
    try{
      const raw=String(url.searchParams.get('url')||'').trim();
      let handle=normalizeTikTokHandle(raw);
      if(!handle){
        const m=raw.match(/tiktok\.com\/@([A-Za-z0-9._]{2,32})\/live/i);
        handle=normalizeTikTokHandle(m?.[1]||'');
      }
      if(!handle){json(res,400,{success:false,error:'invalid_tiktok_live_url'});return;}
      const data=await checkTikTokLiveWithYtDlp(handle);
      if(!data?.live||!data?.streamUrl){
        json(res,404,{success:false,error:data?.note||'not_live',handle});
        return;
      }
      json(res,200,{
        success:true,
        handle,
        title:data.title||'',
        uploader:data.uploader||handle,
        stream_type:data.streamType||'',
        stream_url:data.streamUrl,
        flv:data.streamUrl||'',
        checked_at:data.checkedAt||nowIso()
      });
    }catch(error){
      json(res,502,{success:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/check-live'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}

      const evidence=[];
      const a=await quickTikTokLiveStateOnly(handle).catch(()=>({
        known:false,live:false,status:null,source:'tiktok-error'
      }));
      evidence.push({
        source:String(a?.source||'user-room'),
        known:Boolean(a?.known),
        live:Boolean(a?.live),
        status:(a?.status===null||a?.status===undefined||a?.status==='')?null:(Number.isFinite(Number(a.status))?Number(a.status):null)
      });

      // api-live/user/room is authoritative. Fallbacks are allowed only when
      // that API is UNKNOWN/unavailable; they may never contradict status=2/4.
      const apiCanonical=Boolean(
        a?.known===true&&(Number(a?.status)===2||Number(a?.status)===4)
      );

      if(!apiCanonical){
        const b=await quickTikTokLiveDetailStatus(handle).catch(()=>({
          known:false,live:false,status:null,source:'tiktok-detail-error'
        }));
        evidence.push({
          source:String(b?.source||'live-detail'),
          known:Boolean(b?.known),
          live:Boolean(b?.live),
          status:(b?.status===null||b?.status===undefined||b?.status==='')?null:(Number.isFinite(Number(b.status))?Number(b.status):null)
        });
      }

      const hasLive=()=>evidence.some(x=>x.known&&x.live);
      const offlineCount=()=>evidence.filter(x=>x.known&&!x.live).length;

      if(!apiCanonical&&!hasLive()&&offlineCount()<2){
        const rows=await browserTikTokLiveStates([handle]).catch(()=>new Map());
        const b=rows.get(handle.toLowerCase());
        if(b){
          evidence.push({
            source:String(b.source||'browser-user-room'),
            known:Boolean(b.known),
            live:Boolean(b.live),
            status:Number.isFinite(Number(b.status))?Number(b.status):null
          });
        }
      }

      const key=handle.toLowerCase();

      for(const row of evidence)addTikTokStatusEvidence(handle,row);
      if(!apiCanonical&&!hasLive()&&offlineCount()<2&&!tiktokRealtimeLiveHandles.has(key)){
        await queueTikTokStatusFallback([handle]).catch(()=>{});
        const deep=tiktokRealtimeStatusByHandle.get(key);
        for(const row of Array.isArray(deep?.evidence)?deep.evidence:[]){
          const duplicate=evidence.some(x=>
            x?.source===row?.source&&
            Boolean(x?.known)===Boolean(row?.known)&&
            Boolean(x?.live)===Boolean(row?.live)&&
            (x?.status??null)===(row?.status??null)
          );
          if(!duplicate)evidence.push(row);
        }
      }

      let live=apiCanonical?Boolean(a.live):(hasLive()||tiktokRealtimeLiveHandles.has(key));
      let offlineConfirmed=apiCanonical?!a.live:(!live&&offlineCount()>=2);
      const checkedAt=Date.now();
      const stored=tiktokLiveLibrary.get(key)||{};
      const retainedLive=Boolean(
        tiktokRealtimeLiveHandles.has(key)||
        (stored.live&&stored.playable&&String(stored.type||'').toLowerCase()==='flv'&&stored.sourceSig)
      );

      // Only UNKNOWN may temporarily retain an existing stream. A canonical
      // status=4 from TikTok clears LIVE immediately, even if an old FLV URL
      // still responds.
      if(!apiCanonical&&!live&&!offlineConfirmed&&retainedLive){
        live=true;
        evidence.push({
          source:'realtime-flv-store',
          known:true,
          live:true,
          status:2
        });
      }

      if(live){
        tiktokRealtimeLiveHandles.add(key);
        tiktokRealtimeStatusByHandle.set(key,{
          handle,known:true,live:true,offlineConfirmed:false,
          retained:!apiCanonical&&!hasLive()&&retainedLive,
          roomId:String(a?.roomId||''),
          checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:true,status:'live',probeState:'live',
          liveCheckSource:String(apiCanonical?a.source:(evidence.find(x=>x.known&&x.live)?.source||'multi-source')),
          lastSeenAt:checkedAt,lastKnownAt:checkedAt
        });
      }else if(offlineConfirmed){
        tiktokRealtimeLiveHandles.delete(key);
        tiktokRealtimeStatusByHandle.set(key,{
          handle,known:true,live:false,offlineConfirmed:true,retained:false,
          roomId:'',checkedAt,evidence
        });
        tiktokLiveFastSources.delete(key);
        updateTikTokLiveLibrary(handle,{
          live:false,ready:false,playable:false,type:'',mode:'',source:'',
          status:'offline',probeState:'offline',sourceSig:'',
          liveCheckSource:String(apiCanonical?a.source:'multi-source-offline'),
          lastSeenAt:checkedAt,expiresAt:0
        },{allowLiveRemoval:true});
      }

      json(res,200,{
        ok:true,
        handle,
        live,
        known:apiCanonical||live||offlineConfirmed,
        offlineConfirmed,
        retainedLive:Boolean(!apiCanonical&&live&&retainedLive&&!hasLive()),
        status:apiCanonical?Number(a.status):(live?2:(offlineConfirmed?4:null)),
        roomId:String(apiCanonical?a?.roomId||'':''),
        source:apiCanonical
          ? String(a.source||'tiktok-user-room')
          : (live
              ? String(evidence.find(x=>x.known&&x.live)?.source||'multi-source')
              : (offlineConfirmed?'multi-source-offline':'multi-source-unknown')),
        evidence,
        checked_at:nowIso()
      });
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/status'){
    const snapshots={};
    for(const p of PLATFORMS){
      const row=await getSnapshot(p);
      snapshots[p]=row?{
        status:row.status,
        collectedAt:row.collectedAt,
        count:Number(row.payload?.count||0),
        liveCount:Number(row.payload?.liveCount||0),
      }:null;
    }
    json(res,200,{
      ok:true,
      snapshots,
      lastRuns:Object.fromEntries(lastRuns),
      tiktokFullResync:{...tiktokFullResyncState}
    });
    return;
  }

  if(url.pathname==='/feed'&&req.method==='GET'){
    const platform=String(url.searchParams.get('platform')||'all').toLowerCase();
    const limit=clamp(url.searchParams.get('limit')||80,1,200);
    if(platform==='all'){
      const data={};
      for(const p of PLATFORMS){
        const row=await getSnapshot(p);
        data[p]=row?.payload
          ?{...row.payload,items:(row.payload.items||[]).slice(0,limit)}
          :null;
      }
      json(res,200,{ok:true,data});
      return;
    }
    if(!PLATFORMS.has(platform)){
      json(res,400,{ok:false,error:'invalid_platform'});
      return;
    }
    const row=await getSnapshot(platform);
    json(res,200,{
      ok:true,
      platform,
      status:row?.status||null,
      collectedAt:row?.collectedAt||null,
      data:row?.payload
        ?{...row.payload,items:(row.payload.items||[]).slice(0,limit)}
        :null
    });
    return;
  }

  if(url.pathname==='/collect'&&req.method==='POST'){
    if(!authorized(req)){
      json(res,401,{ok:false,error:'unauthorized'});
      return;
    }
    const platform=String(url.searchParams.get('platform')||'all').toLowerCase();
    try{
      const data=platform==='all'
        ?await enqueue(collectAll)
        :await enqueue(()=>collect(platform));
      json(res,200,{ok:true,data});
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  const sessionMatch=url.pathname.match(/^\/session\/(tiktok)$/);
  if(sessionMatch){
    if(!authorized(req)){
      json(res,401,{ok:false,error:'unauthorized'});
      return;
    }
    const platform=sessionMatch[1];
    if(req.method==='GET'){
      const row=await loadSession(platform);
      const cookies=Array.isArray(row?.state?.cookies)?row.state.cookies:[];
      json(res,200,{
        ok:true,
        platform,
        exists:cookies.length>0,
        cookieCount:cookies.length,
        updatedAt:row?.updated_at||null
      });
      return;
    }
    if(req.method==='POST'){
      try{
        const body=await readJson(req);
        const cookies=cookieParams(body?.cookies||body?.state?.cookies||[]);
        await saveSession(platform,{cookies});
        json(res,200,{ok:true,platform,cookieCount:cookies.length});
      }catch(error){
        json(res,400,{ok:false,error:String(error?.message||error)});
      }
      return;
    }
  }

  json(res,404,{ok:false,error:'not_found'});
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log('[collector] listening',PORT,'auto='+AUTO_COLLECT,'tiktokPaused='+TIKTOK_UPDATES_PAUSED);

  // TikTok image mirroring is retired. Do not touch Supabase Storage at startup.

  if(TIKTOK_UPDATES_PAUSED){
    // Read-only recovery mode: one small persisted package read, no canonical
    // table scans, no LIVE/video/profile refresh loops, no mirror/write loops.
    void Promise.all([
      loadTikTokApiCookieHeader(),
      loadTikTokLiveStore(),
      loadTikTokFrozenLibraryPackage()
    ]).then(()=>{
      console.log(
        '[tiktok-freeze] ready',
        'channels='+Number(tiktokFrozenLibraryPackage?.total||tiktokFrozenLibraryPackage?.channels?.length||0),
        'videos='+Number(tiktokFrozenLibraryPackage?.videoCount||0),
        'version='+Number(tiktokFrozenLibraryPackage?.version||0)
      );
    }).catch(error=>{
      console.warn('[tiktok-freeze] load failed',compactText(error?.message||error,160));
    });

    for(const platform of PLATFORMS)void loadSnapshot(platform);
    console.log('[collector] TikTok background updates paused');
    return;
  }

  void Promise.all([
    loadTikTokApiCookieHeader(),
    loadTikTokLiveStore()
  ]).then(async()=>{
    await loadTikTokVideoStore();
    const canonicalReady=await loadTikTokCanonicalStore();

    // Repair the durable fallback from the complete canonical tables at startup.
    // This is cheap when unchanged (version/hash gate) and guarantees that a
    // deploy cannot keep serving an older frozen package indefinitely.
    if(canonicalReady){
      await persistTikTokCanonicalPackage().catch(error=>{
        console.warn('[tiktok-library] startup fallback repair failed',compactText(error?.message||error,180));
      });
    }

    // Preview mode: make persisted FLV/MP4 available for playback, but do not
    // start any recurring TikTok collector, profile, image, LIVE or MP4 jobs.
    if(!AUTO_COLLECT){
      console.log(
        '[tiktok-preview] ready',
        'channels='+tiktokCanonicalChannels.size,
        'videos='+tiktokCanonicalVideos.size,
        'live='+tiktokRealtimeLiveHandles.size
      );

      // Cloudflare owns LIVE. Preview mode never starts a Render LIVE loop.
      // The exhaustive sweep above owns LIVE discovery. Do not run a second
      // 18/171-channel status burst here; that duplicate traffic was one cause
      // of TikTok 403s and missing LIVE channels.
      if(TIKTOK_PREVIEW_DISCOVER_LIVE){
        console.log('[tiktok-preview-current-live] exhaustive sweep owns discovery');
      }else if(TIKTOK_PREVIEW_WARM_HANDLES.length){
        const handles=TIKTOK_PREVIEW_WARM_HANDLES
          .map(normalizeTikTokHandle).filter(Boolean).slice(0,4);
        void Promise.allSettled(handles.map(async handle=>{
          const ok=await warmTikTokLibraryHandle(handle);
          console.log('[tiktok-preview-live]',handle,ok?'ready':'failed');
          return ok;
        }));
      }

      if(TIKTOK_PREVIEW_VIDEO){
        const m=TIKTOK_PREVIEW_VIDEO.match(/^([A-Za-z0-9._]{2,32}):(\d{8,})$/);
        if(m){
          void downloadTikTokVideoFile(m[1],m[2],{force:true})
            .then(file=>console.log('[tiktok-preview-video]',m[1],m[2],'ready','bytes='+Number(file?.size||0)))
            .catch(error=>console.log('[tiktok-preview-video]',m[1],m[2],'failed',compactText(error?.message||error,120)));
        }
      }
      return;
    }

    // Production TikTok is demand-driven. Supabase already contains the durable
    // library; Render only refreshes the specific channel requested by UI/edge.
    // No startup/interval profile scan, video scan, media warm, or LIVE sweep.
    console.log(
      '[tiktok-library] on-demand only',
      'channels='+tiktokCanonicalChannels.size,
      'videos='+tiktokCanonicalVideos.size
    );
    console.log('[tiktok-live] Cloudflare owns LIVE; Render background sweep disabled');
  });

  for(const platform of PLATFORMS)void loadSnapshot(platform);
  console.log('[collector] TikTok background polling disabled; targeted routes remain active');
});

const shutdown=async()=>{
  try{await tiktokQrLogin.close();}catch{}
  try{
    const browser=await browserPromise;
    await browser?.close?.();
  }catch{}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);