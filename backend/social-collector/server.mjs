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
let tiktokVideoBackgroundCursor=0;
let tiktokVideoStoreWritePromise=null;
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
  const detectedLive=Boolean(row.live);
  const probeState=String(row.probeState||'unknown');
  const type=String(row.type||'').toLowerCase();
  const sourceSig=String(row.sourceSig||'');
  const playableLive=Boolean(
    detectedLive&&
    (row.playable??row.ready)&&
    type==='flv'&&
    sourceSig
  );
  const hotSource=currentTikTokLibrarySource(String(row.handle||''));
  const directStreamUrl=playableLive?String(hotSource?.url||''):'';
  return {
    handle:String(row.handle||''),
    // Public LIVE means "can be played now", not merely "TikTok reported LIVE".
    // Detection is kept separately so the server can continue resolving FLV.
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
    // Direct-first playback: browser/CDN carries media bytes. Render is only
    // a compatibility fallback when the origin rejects direct browser access.
    streamUrl:playableLive?directStreamUrl:'',
    proxyUrl:playableLive
      ? '/tiktok/live-stream?user='+encodeURIComponent(String(row.handle||''))+
        '&source='+encodeURIComponent(sourceSig)
      : '',
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

  // HARD LOCK: once a handle has been discovered LIVE, ordinary API/package/
  // getlink paths are not allowed to turn it OFF. Only the explicit channel
  // removal control-plane path removes it from tiktokRealtimeLiveHandles.
  if(tiktokRealtimeLiveHandles.has(key)&&options.allowLiveRemoval!==true){
    next.live=true;
    next.probeState='live';
    if(!next.playable&&['offline','unknown','checking','warming'].includes(String(next.status||''))){
      next.status='live';
    }
  }

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
function noteTikTokLibrarySource(handle,row,{mode='',source='',ready=null,status=''}={}){
  if(!row?.url)return false;
  const key=String(handle||'').toLowerCase();
  const current=tiktokLiveLibrary.get(key)||{};
  const live=tiktokRealtimeLiveHandles.has(key)||Boolean(current.live);
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
  const live=tiktokRealtimeLiveHandles.has(String(handle||'').toLowerCase())||Boolean(current.live);
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
    row.confirmed=true;
    row.at=Date.now();
    row.videoCodec=probe.videoCodec;
    row.audioCodec=probe.audioCodec;
    row.width=probe.width;
    row.height=probe.height;
    clearTikTokBadSource(handle,row);
    const current=tiktokLiveLibrary.get(String(handle||'').toLowerCase())||{};
    const live=tiktokRealtimeLiveHandles.has(String(handle||'').toLowerCase())||Boolean(current.live);
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
    const live=tiktokRealtimeLiveHandles.has(String(handle||'').toLowerCase())||Boolean(current.live);
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
function addTikTokStatusEvidence(handle,entry){
  const key=String(handle||'').toLowerCase();
  if(!key)return null;
  const now=Date.now();
  const prev=tiktokRealtimeStatusByHandle.get(key)||{
    handle,known:false,live:tiktokRealtimeLiveHandles.has(key),
    offlineConfirmed:false,retained:false,checkedAt:now,evidence:[]
  };
  const evidence=Array.isArray(prev.evidence)?prev.evidence.slice():[];
  const normalized={
    source:String(entry?.source||'fallback'),
    known:Boolean(entry?.known),
    live:Boolean(entry?.live),
    status:(entry?.status===null||entry?.status===undefined||entry?.status==='')
      ? null
      : (Number.isFinite(Number(entry.status))?Number(entry.status):null)
  };
  const duplicate=evidence.some(row=>
    row?.source===normalized.source&&
    Boolean(row?.known)===normalized.known&&
    Boolean(row?.live)===normalized.live&&
    (row?.status??null)===(normalized.status??null)
  );
  if(!duplicate)evidence.push(normalized);

  const positive=evidence.find(row=>row?.known&&row?.live);
  const offlineSources=[...new Set(
    evidence.filter(row=>row?.known&&!row?.live).map(row=>String(row?.source||'')).filter(Boolean)
  )];
  const retained=tiktokRealtimeLiveHandles.has(key);
  const live=Boolean(positive||retained);
  const offlineConfirmed=Boolean(!live&&offlineSources.length>=2);
  const next={
    ...prev,
    handle,
    known:Boolean(positive||offlineConfirmed),
    live,
    offlineConfirmed,
    retained:Boolean(!positive&&retained),
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

  const seeded=row?.stream_url
    ? seedTikTokFastSource(handle,row)
    : null;
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
  if(seeded)queueTikTokLibraryWarm(handle);
  else void resolveTikTokLiveSourceBatch([handle]).catch(()=>{});
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

  // Compatibility mirror only. Nothing reads this table as membership anymore.
  if(selected){
    void fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?on_conflict=handle',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify([{handle}])
      }
    ).catch(()=>{});
  }else{
    void fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?handle=eq.'+encodeURIComponent(handle),
      {method:'DELETE',headers:storeHeaders({prefer:'return=minimal'})}
    ).catch(()=>{});
  }
  return true;
}

async function reconcileTikTokManagedMembership(){
  const handles=[...tiktokLiveSelectedHandles];
  const wanted=new Set(handles.map(h=>h.toLowerCase()));
  try{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_channels?select=handle,selected',
      {headers:storeHeaders()}
    );
    if(r.ok){
      const rows=await r.json();
      const turnOff=(Array.isArray(rows)?rows:[])
        .filter(row=>row?.selected===true&&!wanted.has(String(row?.handle||'').toLowerCase()))
        .map(row=>String(row.handle||''))
        .filter(Boolean);
      for(const handle of turnOff){
        await fetch(
          SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_channels?handle=eq.'+encodeURIComponent(handle),
          {
            method:'PATCH',
            headers:storeHeaders({prefer:'return=minimal'}),
            body:JSON.stringify({selected:false,updated_at:nowIso()})
          }
        ).catch(()=>{});
      }
    }
    // Compatibility table is rebuilt from the canonical managed set.
    await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?handle=not.is.null',
      {method:'DELETE',headers:storeHeaders({prefer:'return=minimal'})}
    ).catch(()=>{});
    if(handles.length){
      await fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?on_conflict=handle',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify(handles.map(handle=>({handle})))
        }
      ).catch(()=>{});
    }
  }catch(error){
    console.warn('[tiktok-membership] reconcile failed',compactText(error?.message||error,160));
  }
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
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_package?package_key=eq.live&select=version,payload,updated_at&limit=1',
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
      // HARD LOCK persistence: realtime LIVE is authoritative for detected LIVE.
      // A later API result cannot make persistence forget a discovered LIVE.
      const live=tiktokRealtimeLiveHandles.has(key)||Boolean(item.live);
      // Canonical LIVE playback is FLV-only. A detected LIVE without an FLV
      // remains LIVE/pending and is never removed by API status.
      const playable=Boolean(
        live&&source?.url&&sourceType==='flv'&&tiktokLiveSourceUsable(source)
      );
      return {
        handle,
        selected:true,
        // Keep TikTok's detected LIVE state internally. Public/UI LIVE is
        // derived separately and requires a validated FLV.
        live,
        probe_state:live?'live':String(item.probeState||'unknown'),
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
    const detectedLiveCount=rows.filter(row=>row.probe_state==='live').length;
    const pendingLinkCount=rows.filter(
      row=>row.probe_state==='live'&&!isPublishedLive(row)
    ).length;
    const staleLiveUnknownCount=rows.filter(
      row=>row.live&&row.probe_state==='unknown'
    ).length;
    const payload={
      items:rows.map(row=>{
        const publishedLive=isPublishedLive(row);
        return {
          handle:row.handle,
          // Package/UI LIVE is intentionally strict: only a validated FLV.
          live:publishedLive,
          detectedLive:Boolean(row.live),
          probeState:row.probe_state,
          playable:publishedLive,
          link:publishedLive?row.stream_url:'',
          type:publishedLive?'flv':'',
          sourceSig:publishedLive?row.source_sig:'',
          stateChangedAt:row.state_changed_at,
          checkedAt:row.checked_at
        };
      }),
      total:rows.length,
      live:liveCount,
      playable:liveCount,
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
        await refreshTikTokLiveLibrary([handle],{warm:true,force:true});
        await persistTikTokLiveStore({force:true});

        const row=tiktokLiveLibrary.get(key)||{};
        console.log(
          '[tiktok-live-check] targeted done',
          handle,
          'live='+Boolean(row.live),
          'playable='+Boolean(row.playable),
          'type='+String(row.type||'')
        );
        return row;
      })().finally(()=>{
        tiktokLivePriorityScanPromises.delete(key);
      });

      tiktokLivePriorityScanPromises.set(key,job);
      return job;
    }));
  }

  // Background/global package refresh remains single-flight.
  if(tiktokLivePackageScanPromise)return tiktokLivePackageScanPromise;
  tiktokLivePackageScanPromise=refreshTikTokLiveLibrary(target,{warm:false})
    .then(()=>persistTikTokLiveStore())
    .catch(error=>console.log('[tiktok-package] scan failed',compactText(error?.message||error,120)))
    .finally(()=>{tiktokLivePackageScanPromise=null;});
  return tiktokLivePackageScanPromise;
}

let tiktokLiveMinuteSweepPromise=null;
let tiktokLiveDiscoveryCursor=0;
let tiktokLivePriorityCursor=0;
let tiktokLiveRecentCursor=0;
let tiktokLiveColdCursor=0;
let tiktokLiveColdDeepCursor=0;
let tiktokRealtimeLiveHandles=new Set();
// Current scan evidence for every selected handle. This is intentionally
// separate from the playable FLV library so "LIVE detected" is never hidden
// merely because media resolution is still pending.
let tiktokRealtimeStatusByHandle=new Map();
let tiktokRealtimeLiveCheckedAt=0;
let tiktokLiveAuditPromise=null;
let tiktokLiveAuditState={
  running:false,startedAt:0,finishedAt:0,
  selectedTotal:0,liveAtStart:0,browserChecked:0,browserFound:0,browserMissed:0
};
function runTikTokLiveMinuteSweep({targetHandles=null}={}){
  if(tiktokLiveMinuteSweepPromise)return tiktokLiveMinuteSweepPromise;
  tiktokLiveMinuteSweepPromise=(async()=>{
    const selected=[...tiktokLiveSelectedHandles];
    const wanted=new Set(selected.map(handle=>handle.toLowerCase()));

    let target;
    if(Array.isArray(targetHandles)){
      target=[...new Set(targetHandles.map(normalizeTikTokHandle).filter(Boolean))]
        .filter(handle=>wanted.has(handle.toLowerCase()));
    }else{
      // Production scan: current LIVE channels are priority, while non-LIVE
      // channels rotate in a small batch. This avoids the 171-channel burst
      // that made TikTok return 403 for almost everything.
      const now=Date.now();
      const livePriority=selected.filter(handle=>tiktokRealtimeLiveHandles.has(handle.toLowerCase()));
      const recentLive=selected.filter(handle=>{
        const key=handle.toLowerCase();
        if(tiktokRealtimeLiveHandles.has(key))return false;
        const row=tiktokLiveLibrary.get(key)||{};
        const lastLiveAt=Number(row.lastKnownAt||0);
        return lastLiveAt>0&&now-lastLiveAt<=TIKTOK_LIVE_RECENT_TTL_MS;
      });
      const cold=selected.filter(handle=>{
        const key=handle.toLowerCase();
        if(tiktokRealtimeLiveHandles.has(key))return false;
        return !recentLive.some(x=>x.toLowerCase()===key);
      });

      const pickRotating=(rows,count,cursor)=>{
        if(!rows.length)return {picked:[],cursor:0};
        const take=Math.min(count,rows.length);
        const picked=[];
        for(let i=0;i<take;i+=1)picked.push(rows[(cursor+i)%rows.length]);
        return {picked,cursor:(cursor+take)%rows.length};
      };

      // Tier 1: current LIVE. Small rotating batch, checked most often.
      const livePick=pickRotating(livePriority,TIKTOK_LIVE_PRIORITY_BATCH,tiktokLivePriorityCursor);
      tiktokLivePriorityCursor=livePick.cursor;

      // Tier 2: channels that were LIVE in the last 24h. These are statistically
      // much more likely to go LIVE again, so they get a medium-cost scan.
      const recentPick=pickRotating(recentLive,TIKTOK_LIVE_RECENT_BATCH,tiktokLiveRecentCursor);
      tiktokLiveRecentCursor=recentPick.cursor;

      // Tier 3: cold channels. Cheap status-only rotation; only a tiny sample of
      // this group is allowed into the heavy detail/browser confirmation path.
      const coldPick=pickRotating(cold,TIKTOK_LIVE_COLD_BATCH,tiktokLiveColdCursor);
      tiktokLiveColdCursor=coldPick.cursor;

      target=[...new Set([...livePick.picked,...recentPick.picked,...coldPick.picked])];
    }

    if(!target.length){
      tiktokRealtimeLiveCheckedAt=Date.now();
      return;
    }

    const nowForTier=Date.now();
    const targetTier=new Map(target.map(handle=>{
      const key=handle.toLowerCase();
      if(tiktokRealtimeLiveHandles.has(key))return [key,'live'];
      const row=tiktokLiveLibrary.get(key)||{};
      const lastLiveAt=Number(row.lastKnownAt||0);
      return [key,(lastLiveAt>0&&nowForTier-lastLiveAt<=TIKTOK_LIVE_RECENT_TTL_MS)?'recent':'cold'];
    }));
    const coldTargets=target.filter(handle=>targetTier.get(handle.toLowerCase())==='cold');
    const deepPick=coldTargets.length
      ? Array.from({length:Math.min(TIKTOK_LIVE_COLD_DEEP_BATCH,coldTargets.length)},(_,i)=>
          coldTargets[(tiktokLiveColdDeepCursor+i)%coldTargets.length]
        )
      : [];
    if(coldTargets.length){
      tiktokLiveColdDeepCursor=(tiktokLiveColdDeepCursor+deepPick.length)%coldTargets.length;
    }
    const coldDeepSet=new Set(deepPick.map(x=>x.toLowerCase()));

    const first=new Array(target.length);
    let cursor=0;

    // Pass 1: fast user/room status for every selected channel.
    const worker=async()=>{
      while(true){
        const index=cursor++;
        if(index>=target.length)return;
        const handle=target[index];
        try{
          await sleep(180);
          first[index]={handle,state:await quickTikTokLiveStateOnly(handle)};
        }catch{
          first[index]={
            handle,
            state:{known:false,live:false,status:null,source:'tiktok-error'}
          };
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(3,target.length||1)},()=>worker()));

    // Pass 2: cross-check EVERY handle that was not positively LIVE.
    // A single OFFLINE answer is not enough to hide a possible LIVE.
    const detailByIndex=new Map();
    const verifyIndexes=[];
    for(let i=0;i<first.length;i+=1){
      if(first[i]?.state?.live)continue;
      const key=String(first[i]?.handle||'').toLowerCase();
      const tier=targetTier.get(key)||'cold';
      // Current/recent LIVE candidates get strong cross-checking. Cold channels
      // stay on the cheap path, except for a tiny rotating deep sample.
      if(tier!=='cold'||coldDeepSet.has(key))verifyIndexes.push(i);
    }
    let verifyCursor=0;
    const verifyWorker=async()=>{
      while(true){
        const p=verifyCursor++;
        if(p>=verifyIndexes.length)return;
        const index=verifyIndexes[p];
        const handle=first[index].handle;
        try{
          await sleep(220);
          detailByIndex.set(index,await quickTikTokLiveDetailStatus(handle));
        }catch{
          detailByIndex.set(index,{known:false,live:false,status:null,source:'tiktok-detail-error'});
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(3,verifyIndexes.length||1)},()=>verifyWorker()));

    function evidenceFor(index){
      const out=[];
      const a=first[index]?.state;
      if(a)out.push({
        source:String(a.source||'user-room'),
        known:Boolean(a.known),
        live:Boolean(a.live),
        status:Number.isFinite(Number(a.status))?Number(a.status):null,
        roomId:String(a.roomId||'')
      });
      const b=detailByIndex.get(index);
      if(b)out.push({
        source:String(b.source||'live-detail'),
        known:Boolean(b.known),
        live:Boolean(b.live),
        status:Number.isFinite(Number(b.status))?Number(b.status):null,
        roomId:String(b.roomId||'')
      });
      return out;
    }
    function resolvedFromEvidence(evidence){
      if(evidence.some(x=>x.known&&x.live))return {known:true,live:true,offlineConfirmed:false};
      const offline=evidence.filter(x=>x.known&&!x.live).length;
      if(offline>=2)return {known:true,live:false,offlineConfirmed:true};
      return {known:false,live:false,offlineConfirmed:false};
    }

    // Pass 3: only unresolved/conflicting handles use a browser-authenticated
    // batch fallback. This keeps the sweep cheap while closing the gaps that
    // used to make some genuine LIVE channels disappear.
    const unresolved=[];
    for(let i=0;i<target.length;i+=1){
      if(resolvedFromEvidence(evidenceFor(i)).known)continue;
      const key=String(target[i]||'').toLowerCase();
      const tier=targetTier.get(key)||'cold';
      if(tier!=='cold'||coldDeepSet.has(key))unresolved.push(target[i]);
    }
    const browserStates=unresolved.length
      ? await browserTikTokLiveStates(unresolved).catch(()=>new Map())
      : new Map();

    const previousStatuses=tiktokRealtimeStatusByHandle;
    const nextLive=new Set(
      [...tiktokRealtimeLiveHandles].filter(handle=>wanted.has(handle))
    );
    const nextStatuses=new Map(
      [...tiktokRealtimeStatusByHandle.entries()].filter(([handle])=>wanted.has(handle))
    );
    const checkedAt=Date.now();
    let foundNow=0;
    let unknown=0;
    let offlineConfirmedCount=0;
    let retainedUnknown=0;

    for(let i=0;i<target.length;i+=1){
      const handle=target[i];
      const key=handle.toLowerCase();
      const evidence=evidenceFor(i);
      const browser=browserStates.get(key);
      if(browser){
        evidence.push({
          source:String(browser.source||'browser-user-room'),
          known:Boolean(browser.known),
          live:Boolean(browser.live),
          status:Number.isFinite(Number(browser.status))?Number(browser.status):null,
          roomId:String(browser.roomId||'')
        });
      }

      const resolved=resolvedFromEvidence(evidence);
      const alreadyLive=nextLive.has(key);
      const liveSource=evidence.find(x=>x.known&&x.live)?.source||'';
      const offlineSources=evidence.filter(x=>x.known&&!x.live).map(x=>x.source);

      if(resolved.live){
        if(!alreadyLive)foundNow+=1;
        nextLive.add(key);
        nextStatuses.set(key,{
          handle,known:true,live:true,offlineConfirmed:false,retained:false,
          roomId:liveRoomId,checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:true,
          status:'live',
          probeState:'live',
          liveCheckSource:liveSource||'tiktok-api',
          lastSeenAt:checkedAt,
          lastKnownAt:checkedAt
        });
        continue;
      }

      if(resolved.offlineConfirmed){
        offlineConfirmedCount+=1;
        // Two independent OFFLINE confirmations may clear the realtime view.
        // This is the only automatic removal path; UNKNOWN never removes LIVE.
        nextLive.delete(key);
        nextStatuses.set(key,{
          handle,known:true,live:false,offlineConfirmed:true,retained:false,
          roomId:'',checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:false,ready:false,playable:false,type:'',mode:'',source:'',
          status:'offline',probeState:'offline',sourceSig:'',
          liveCheckSource:offlineSources.join('+')||'multi-source',
          lastSeenAt:checkedAt
        },{allowLiveRemoval:true});
        continue;
      }

      unknown+=1;
      if(alreadyLive){
        retainedUnknown+=1;
        // Inconclusive scans retain the previous LIVE so a temporary TikTok
        // API failure cannot make a genuine stream disappear.
        nextStatuses.set(key,{
          handle,known:false,live:true,offlineConfirmed:false,retained:true,
          checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:true,status:'live',probeState:'live',
          liveCheckSource:'retained-after-unknown',lastSeenAt:checkedAt
        });
      }else{
        nextStatuses.set(key,{
          handle,known:false,live:false,offlineConfirmed:false,retained:false,
          checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:false,status:'unknown',probeState:'unknown',
          liveCheckSource:'multi-source-unknown',lastSeenAt:checkedAt
        });
      }
    }

    tiktokRealtimeLiveHandles=nextLive;
    tiktokRealtimeStatusByHandle=nextStatuses;
    tiktokRealtimeLiveCheckedAt=checkedAt;

    // LIVE fingerprint first: resolve FLV only when a stream is newly LIVE,
    // the room id changed, or the previously resolved source is no longer usable.
    const liveHandles=target.filter(handle=>nextLive.has(handle.toLowerCase()));
    const resolveHandles=liveHandles.filter(handle=>{
      const key=handle.toLowerCase();
      const next=nextStatuses.get(key);
      if(next?.known!==true||next?.live!==true||next?.retained===true)return false;
      const prev=previousStatuses.get(key);
      const roomChanged=String(next?.roomId||'')!==String(prev?.roomId||'');
      const newlyLive=prev?.known!==true||prev?.live!==true||prev?.retained===true;
      const source=currentTikTokLibrarySource(handle);
      return newlyLive||roomChanged||!source;
    });
    if(resolveHandles.length){
      void refreshTikTokLiveLibrary(resolveHandles,{warm:false,force:false})
        .then(()=>resolveTikTokLiveSourceBatch(resolveHandles))
        .catch(error=>{
          console.warn('[tiktok-live-getlink] failed',compactText(error?.message||error,160));
        });
    }

    // Pass 3 above already sends unresolved/conflicting handles through the
    // browser-authenticated fallback. Do not reopen every API-confirmed OFFLINE
    // channel in Chromium after each sweep; that duplicated network/CPU usage.
    console.log(
      '[tiktok-live-current]',
      'selected='+selected.length,
      'checked='+target.length,
      'tierLive='+target.filter(h=>targetTier.get(h.toLowerCase())==='live').length,
      'tierRecent='+target.filter(h=>targetTier.get(h.toLowerCase())==='recent').length,
      'tierCold='+target.filter(h=>targetTier.get(h.toLowerCase())==='cold').length,
      'coldDeep='+coldDeepSet.size,
      'live='+nextLive.size,
      'foundNow='+foundNow,
      'offlineConfirmed='+offlineConfirmedCount,
      'unknown='+unknown,
      'retainedUnknown='+retainedUnknown,
      'browserFallback='+unresolved.length,
      'getlink='+resolveHandles.length,
      'checkedAt='+checkedAt
    );
    void persistTikTokLiveStore().catch(error=>{
      console.warn('[tiktok-live-current] persist failed',compactText(error?.message||error,120));
    });
  })().catch(error=>{
    console.warn('[tiktok-live-current] failed',compactText(error?.message||error,160));
  }).finally(()=>{
    tiktokLiveMinuteSweepPromise=null;
  });
  return tiktokLiveMinuteSweepPromise;
}

async function runTikTokLiveAuditSweep(){
  if(tiktokLiveAuditPromise)return tiktokLiveAuditPromise;

  tiktokLiveAuditPromise=(async()=>{
    // Let any small periodic batch finish so the full audit is the only owner
    // of browser-page discovery while it is running.
    if(tiktokLiveStatusFallbackPromise){
      await tiktokLiveStatusFallbackPromise.catch(()=>{});
    }

    const selected=[...tiktokLiveSelectedHandles];
    const startedAt=Date.now();
    const liveAtStart=selected.filter(handle=>
      tiktokRealtimeLiveHandles.has(handle.toLowerCase())
    ).length;

    tiktokLiveAuditState={
      running:true,startedAt,finishedAt:0,
      selectedTotal:selected.length,liveAtStart,
      browserChecked:0,browserFound:0,browserMissed:0
    };

    // Correctness path: every selected handle that is not already a verified
    // LIVE is opened through the real TikTok /@handle/live page. We watch the
    // same network traffic the browser sees. Captured FLV => LIVE immediately;
    // no FLV => UNKNOWN, never OFFLINE. This prevents 403 from hiding a LIVE.
    const unresolved=selected.filter(handle=>
      !tiktokRealtimeLiveHandles.has(handle.toLowerCase())
    );
    const chunkSize=10;

    for(let i=0;i<unresolved.length;i+=chunkSize){
      const batch=unresolved.slice(i,i+chunkSize);
      const result=await runTikTokBrowserDiscoveryBatch(batch,{
        maxWaitMs:6500,
        source:'browser-live-page-audit'
      });
      tiktokLiveAuditState.browserChecked+=Number(result.checked||0);
      tiktokLiveAuditState.browserFound+=Number(result.found||0);
      tiktokLiveAuditState.browserMissed+=Number(result.missed||0);

      // Publish discoveries promptly instead of waiting until all 171 channels
      // have finished.
      await persistTikTokLiveStore({force:true}).catch(()=>{});
      if(i+chunkSize<unresolved.length)await sleep(250);
    }

    tiktokRealtimeLiveCheckedAt=Date.now();
    tiktokLiveAuditState.running=false;
    tiktokLiveAuditState.finishedAt=tiktokRealtimeLiveCheckedAt;

    await persistTikTokLiveStore({force:true}).catch(()=>{});
    console.log(
      '[tiktok-live-audit]',
      'selected='+selected.length,
      'liveAtStart='+liveAtStart,
      'browserChecked='+tiktokLiveAuditState.browserChecked,
      'browserFound='+tiktokLiveAuditState.browserFound,
      'browserMissed='+tiktokLiveAuditState.browserMissed,
      'liveNow='+tiktokRealtimeLiveHandles.size,
      'ms='+(tiktokLiveAuditState.finishedAt-startedAt)
    );
    return {...tiktokLiveAuditState};
  })().catch(error=>{
    tiktokLiveAuditState.running=false;
    tiktokLiveAuditState.finishedAt=Date.now();
    console.warn('[tiktok-live-audit] failed',compactText(error?.message||error,180));
    throw error;
  }).finally(()=>{
    tiktokLiveAuditPromise=null;
  });

  return tiktokLiveAuditPromise;
}

async function refreshTikTokLiveLibrary(handles,{warm=true,force=false}={}){
  const scanStarted=Date.now();
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))];
  if(!normalized.length)return;

  const now=Date.now();
  const due=force
    ? normalized
    : normalized.filter(
        handle=>now-Number(tiktokLiveLibraryRefreshAt.get(handle.toLowerCase())||0)>=TIKTOK_LIVE_LIBRARY_REFRESH_MS
      );
  if(!due.length)return;

  // One package pass, but do not burst all 31 requests at TikTok at once.
  // A small worker pool is still fast and avoids false OFFLINE results caused by timeouts.
  const checked=new Array(due.length);
  let scanCursor=0;
  const worker=async()=>{
    while(true){
      const index=scanCursor++;
      if(index>=due.length)return;
      const handle=due[index];
      tiktokLiveLibraryRefreshAt.set(handle.toLowerCase(),Date.now());
      try{
        checked[index]={handle,status:await quickTikTokLiveStatus(handle)};
      }catch(error){
        checked[index]={handle,status:{known:false,live:false,candidates:[]}};
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(8,due.length)},()=>worker()));

  let scanLiveCount=0;
  let scanFlvCount=0;
  let scanUnknownCount=0;
  for(const {handle,status} of checked){
    const key=handle.toLowerCase();
    const candidates=Array.isArray(status?.candidates)?status.candidates:[];
    const flv=candidates
      .filter(isTikTokVideoFlvCandidate)
      .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))[0]||null;

    if(!status?.known){
      // Timeout/incomplete response is UNKNOWN: preserve last confirmed
      // LIVE/OFFLINE state and only record the probe result.
      scanUnknownCount+=1;
      updateTikTokLiveLibrary(handle,{
        probeState:'unknown',
        lastSeenAt:Date.now()
      });
      continue;
    }

    const isLive=status?.live===true;
    const prev=tiktokLiveLibrary.get(key)||{};
    const nowState=Date.now();
    const changedState=Boolean(prev.live)!==isLive;
    if(isLive)scanLiveCount+=1;
    if(flv)scanFlvCount+=1;

    const lockedLive=tiktokRealtimeLiveHandles.has(key);
    if(!isLive&&!lockedLive){
      updateTikTokLiveLibrary(handle,{
        live:false,
        status:'offline',
        probeState:'offline',
        lastSeenAt:Date.now()
      });
      continue;
    }

    // Detection is additive. Once locked LIVE, later API status only supplies
    // fresh media candidates; it never owns removal.
    if(isLive)tiktokRealtimeLiveHandles.add(key);
    updateTikTokLiveLibrary(handle,{
      live:true,
      probeState:'live',
      status:'live',
      stateChangedAt:isLive&&changedState?nowState:Number(prev.stateChangedAt||0),
      lastKnownAt:isLive?nowState:Number(prev.lastKnownAt||0),
      lastSeenAt:nowState
    });

    // Getlink only: publish FLV immediately when TikTok exposes it.
    if(flv){
      const row=seedTikTokFastSource(handle,{
        stream_url:String(flv.url||''),
        stream_type:'flv',
        source:'room-api-flv',
        videoCodec:flv.videoCodec,
        width:flv.width,
        height:flv.height,
        quality:flv.quality,
        bitrate:flv.bitrate,
        path:flv.path
      });
      if(row){
        noteTikTokLibrarySource(handle,row,{
          mode:'fast',
          source:'room-api-flv',
          ready:false,
          status:'warming'
        });
        queueTikTokLibraryWarm(handle);
        console.log('[tiktok-live-getlink] scan FLV queued for verify',handle);
        continue;
      }
    }

    // TikTok says LIVE but did not return FLV in this pass. Keep it marked
    // LIVE, but do not start yt-dlp/ffprobe/browser fallbacks.
    updateTikTokLiveLibrary(handle,{
      ready:false,
      playable:false,
      type:'',
      mode:'',
      source:'',
      status:'live',
      sourceSig:'',
      lastSeenAt:Date.now()
    });
    queueTikTokLibraryWarm(handle);
  }

  console.log(
    '[tiktok-scan]',
    'total='+normalized.length,
    'due='+due.length,
    'live='+scanLiveCount,
    'flv='+scanFlvCount,
    'unknown='+scanUnknownCount,
    'ms='+(Date.now()-scanStarted)
  );

  if(warm){
    const needSource=normalized.filter(handle=>{
      const row=tiktokLiveLibrary.get(handle.toLowerCase())||{};
      return Boolean(row.live)&&!Boolean(row.playable);
    });
    if(needSource.length){
      await resolveTikTokLiveSourceBatch(needSource);
    }
  }
}
async function checkTikTokLiveWithYtDlp(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');

  const cached=tiktokLiveCheckCache.get(handle.toLowerCase());
  if(cached&&Date.now()-cached.at<20_000)return cached.value;

  const url='https://www.tiktok.com/@'+handle+'/live';
  console.log('[tiktok-live-python] start',handle);
  const value=await enqueueYtdlp(async()=>{
    try{
      const out=await execFileText('python3',[
        'tiktok_stream_extract.py',
        url
      ],{
        timeout:24_000,
        maxBuffer:2*1024*1024,
        env:{...process.env,TIKTOK_COOKIE_HEADER:String(tiktokApiCookieHeader||'')}
      });
      const data=JSON.parse(String(out||'').trim()||'{}');
      if(!data?.success||!data?.stream_url){
        const note=compactText(data?.error||'stream_not_found',400);
        const notLive=/offline|not live|is not live|isn't live|video unavailable/i.test(note);
        return {
          ok:true,handle,live:false,url,title:'',thumbnail:'',uploader:handle,
          uploaderId:'',channelId:'',id:'',streamUrl:'',streamType:'',
          checkedAt:nowIso(),note:notLive?'not_live':note
        };
      }
      const streamUrl=String(data.stream_url||'');
      const streamType=String(
        data.stream_type||(/\.flv(?:\?|$)/i.test(streamUrl)?'flv':'unknown')
      ).toLowerCase();
      console.log('[tiktok-live-python]',handle,streamType);
      return {
        ok:true,
        handle,
        live:true,
        url,
        title:String(data.title||('@'+handle+' đang LIVE')),
        thumbnail:String(data.thumbnail||''),
        uploader:String(data.uploader||handle),
        uploaderId:'',
        channelId:'',
        id:String(data.id||''),
        streamUrl,
        streamType,
        checkedAt:nowIso(),
        note:'python_yt_dlp'
      };
    }catch(error){
      const message=compactText(error?.stderr||error?.message||error,500);
      console.warn('[tiktok-live-python] failed',handle,message);
      const notLive=/offline|not live|is not live|isn't live|video unavailable/i.test(message);
      return {
        ok:true,handle,live:false,url,title:'',thumbnail:'',uploader:handle,
        uploaderId:'',channelId:'',id:'',streamUrl:'',streamType:'',
        checkedAt:nowIso(),note:notLive?'not_live':(message||'python_extract_failed')
      };
    }
  });
  tiktokLiveCheckCache.set(handle.toLowerCase(),{at:Date.now(),value});
  return value;
}


const TIKTOK_LIVE_REUSE_MS=10*60*1000;

function tiktokStreamExpiresAt(rawUrl){
  try{
    const value=new URL(String(rawUrl||'')).searchParams.get('expire');
    const n=Number(value||0);
    if(!Number.isFinite(n)||n<=0)return 0;
    return n>10_000_000_000?n:n*1000;
  }catch{return 0}
}
function tiktokLiveSourceUsable(row,maxAge=TIKTOK_LIVE_REUSE_MS){
  // LOCKED GETLINK PHASE: presence of an FLV URL is enough to keep it in data.
  // Expiry/health/removal belongs to the later dedicated link-check stage.
  return Boolean(
    row?.url&&
    String(row?.type||'').toLowerCase()==='flv'&&
    /^https?:\/\//i.test(String(row.url||''))
  );
}
function tiktokLiveCacheReusable(row){
  if(!tiktokLiveSourceUsable(row))return false;
  if(row.confirmed===true)return true;
  return Date.now()-Number(row.at||0)<15_000;
}

async function closeTikTokLiveSession(handle){
  const key=String(handle||'').toLowerCase();
  const row=tiktokLiveSessions.get(key);
  if(!row)return;
  tiktokLiveSessions.delete(key);
  try{await row.page?.close?.();}catch{}
}
function cleanTikTokLiveSessions(){
  for(const [key,row] of tiktokLiveSessions){
    if(!row||!tiktokLiveCacheReusable(row))void closeTikTokLiveSession(key);
  }
}

function decodeTikTokLiveText(value){
  const variants=new Set([String(value||'')]);

  // TikTok nests stream_data as escaped/URL-encoded JSON. Decode repeatedly
  // into canonical text before interpreting FLV fields.
  for(let round=0;round<4;round+=1){
    const current=[...variants];
    let changed=false;
    for(const raw of current){
      const decoded=String(raw)
        .replace(/\\u002F/gi,'/')
        .replace(/\\u0026/gi,'&')
        .replace(/\\u003A/gi,':')
        .replace(/\\u003D/gi,'=')
        .replace(/\\\//g,'/')
        .replace(/&amp;/gi,'&');
      if(decoded&&!variants.has(decoded)){variants.add(decoded);changed=true}

      try{
        const uri=decodeURIComponent(decoded);
        if(uri&&!variants.has(uri)){variants.add(uri);changed=true}
      }catch{}

      try{
        const parsed=JSON.parse(decoded);
        if(typeof parsed==='string'&&!variants.has(parsed)){
          variants.add(parsed);
          changed=true;
        }
      }catch{}
    }
    if(!changed)break;
  }
  return [...variants];
}

function parseTikTokJsonObject(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  for(const raw of decodeTikTokLiveText(value)){
    const text=String(raw||'').trim();
    if(!text.startsWith('{')||!text.endsWith('}'))continue;
    try{
      const parsed=JSON.parse(text);
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;
    }catch{}
  }
  return {};
}

function normalizeTikTokCodec(value){
  const text=String(value||'').toLowerCase();
  if(/avc|h264|avc1/.test(text))return 'h264';
  if(/hevc|h265|hev1|hvc1/.test(text))return 'h265';
  return text;
}

function parseTikTokResolution(value){
  const text=String(value||'');
  const match=text.match(/(\d{2,5})\s*[xX*]\s*(\d{2,5})/);
  if(!match)return {width:0,height:0};
  return {width:Number(match[1]||0),height:Number(match[2]||0)};
}

function tikTokQualityFromPath(path){
  const parts=String(path||'')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
  for(let i=parts.length-1;i>=0;i-=1){
    const p=parts[i];
    if([
      'origin','original','uhd','full_hd1','full_hd','fhd',
      'hd1','hd','sd','ld','ld5','sd5','sd5b','hd5','ao'
    ].includes(p))return p;
  }
  return '';
}

function parseTikTokStreamMeta(node,path=''){
  const sdk=parseTikTokJsonObject(
    node?.sdk_params||
    node?.sdkParams||
    node?.sdk_param||
    node?.sdkParam||
    ''
  );

  const resolution=
    sdk?.resolution||
    node?.resolution||
    node?.video_resolution||
    node?.videoResolution||
    '';
  const parsed=parseTikTokResolution(resolution);

  const width=Number(node?.width||sdk?.width||parsed.width||0);
  const height=Number(node?.height||sdk?.height||parsed.height||0);
  const bitrate=Math.max(
    Number(sdk?.v_rtbitrate||0),
    Number(sdk?.vbitrate||0),
    Number(sdk?.bitrate||0),
    Number(node?.v_rtbitrate||0),
    Number(node?.vbitrate||0),
    Number(node?.bitrate||0)
  );
  const videoCodec=normalizeTikTokCodec(
    sdk?.VCodec||
    sdk?.vcodec||
    sdk?.v_codec||
    sdk?.codec||
    node?.VCodec||
    node?.vcodec||
    node?.v_codec||
    ''
  );

  const lower=String(path||'').toLowerCase();
  const sourceFamily=/hevcstreamdata|h265|hevc/.test(lower)
    ?'hevc'
    :(/streamdata|stream_data/.test(lower)?'standard':'');

  return {
    videoCodec,
    width,
    height,
    bitrate,
    quality:tikTokQualityFromPath(path),
    sourceFamily
  };
}

function normalizeTikTokHttpUrl(raw){
  const candidates=decodeTikTokLiveText(raw);
  for(const text of candidates){
    const match=String(text||'').match(/https?:\/\/[^"'\\\s<>]+/i);
    if(!match)continue;
    let url=String(match[0]||'')
      .replace(/&amp;/gi,'&')
      .replace(/\\u0026/gi,'&')
      .replace(/\\u002F/gi,'/')
      .replace(/\\\//g,'/');
    try{url=decodeURIComponent(url)}catch{}
    if(/^https?:\/\//i.test(url))return url;
  }
  return '';
}

function upsertTikTokFlvCandidate(out,row){
  const url=String(row?.url||'');
  if(!/^https?:\/\//i.test(url))return out;
  const next={...row,url,type:'flv'};
  const found=out.findIndex(item=>String(item?.url||'')===url);
  if(found<0){
    out.push(next);
    return out;
  }
  const prev=out[found]||{};
  out[found]={
    ...prev,
    ...Object.fromEntries(
      Object.entries(next).filter(([,value])=>
        value!==''&&value!==null&&value!==undefined&&value!==0
      )
    )
  };
  return out;
}

function isTikTokFlvSemanticKey(rawKey){
  const normalized=String(rawKey||'')
    .replace(/([a-z0-9])([A-Z])/g,'$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'');
  return new Set([
    'flv','flvurl','flvpull','flvpullurl',
    'pullflv','pullflvurl','streamflv','streamflvurl',
    'flvstream','flvstreamurl'
  ]).has(normalized);
}

function collectTikTokLiveStreamCandidates(value,out=[],path='',depth=0){
  if(value==null||depth>20||out.length>320)return out;

  const pathLower=String(path||'').toLowerCase();
  const pathCompact=pathLower.replace(/[^a-z0-9]+/g,'');
  const pathIsFlv=
    /(^|[._\[\]])flv(?:_|[.\[\]]|$)|flv[_-]?pull|pull[_-]?flv|stream[_-]?flv/.test(pathLower)||
    /flvpull(?:url)?|pullflv(?:url)?|streamflv(?:url)?|flvstream(?:url)?|flvurl/.test(pathCompact);

  if(typeof value==='string'){
    const variants=decodeTikTokLiveText(value);

    for(const raw of variants){
      const trimmed=String(raw||'').trim();

      let structured=false;
      if(
        (trimmed.startsWith('{')&&trimmed.endsWith('}'))||
        (trimmed.startsWith('[')&&trimmed.endsWith(']'))
      ){
        try{
          collectTikTokLiveStreamCandidates(JSON.parse(trimmed),out,path,depth+1);
          structured=true;
        }catch{}
      }
      if(structured)continue;

      // Explicit .flv is only one representation.
      const explicit=/https?:\/\/[^"'\\\s<>]+?\.flv(?:\?[^"'\\\s<>]*)?/ig;
      for(const match of trimmed.matchAll(explicit)){
        const url=normalizeTikTokHttpUrl(match[0]);
        if(url)upsertTikTokFlvCandidate(out,{
          url,type:'flv',path,reason:'url-extension',
          ...parseTikTokStreamMeta({},path)
        });
      }

      // Semantic FLV field: flv_pull_url/main.flv/etc may contain a URL with
      // no ".flv" suffix. The field meaning, not the suffix, defines transport.
      if(pathIsFlv){
        const url=normalizeTikTokHttpUrl(trimmed);
        if(url)upsertTikTokFlvCandidate(out,{
          url,type:'flv',path,reason:'flv-field',
          ...parseTikTokStreamMeta({},path)
        });
      }
    }
    return out;
  }

  if(Array.isArray(value)){
    value.forEach((item,index)=>
      collectTikTokLiveStreamCandidates(item,out,path+'['+index+']',depth+1)
    );
    return out;
  }

  if(typeof value==='object'){
    const meta=parseTikTokStreamMeta(value,path);

    // Canonical structured case from TikTok:
    // stream_data.data.<quality>.main.flv + main.sdk_params
    for(const [key,child] of Object.entries(value)){
      const semantic=isTikTokFlvSemanticKey(key);
      if(semantic&&typeof child==='string'){
        const url=normalizeTikTokHttpUrl(child);
        if(url)upsertTikTokFlvCandidate(out,{
          url,
          type:'flv',
          path:path?path+'.'+key:key,
          reason:'structured-flv-field',
          ...meta
        });
      }
    }

    for(const [key,child] of Object.entries(value)){
      collectTikTokLiveStreamCandidates(
        child,
        out,
        path?path+'.'+key:key,
        depth+1
      );
    }
  }
  return out;
}

function summarizeTikTokFlvPaths(value,path='',depth=0,out=new Set()){
  if(value==null||depth>14||out.size>=40)return [...out];
  const p=String(path||'');
  const lower=p.toLowerCase();
  if(/flv|pull_data|stream_data|stream_url|live_core_sdk/.test(lower))out.add(p);
  if(Array.isArray(value)){
    value.slice(0,20).forEach((item,index)=>summarizeTikTokFlvPaths(item,p+'['+index+']',depth+1,out));
  }else if(typeof value==='object'){
    for(const [key,child] of Object.entries(value)){
      summarizeTikTokFlvPaths(child,p?p+'.'+key:key,depth+1,out);
      if(out.size>=40)break;
    }
  }else if(typeof value==='string'){
    for(const decoded of decodeTikTokLiveText(value)){
      const t=String(decoded||'').trim();
      if((t.startsWith('{')&&t.endsWith('}'))||(t.startsWith('[')&&t.endsWith(']'))){
        try{summarizeTikTokFlvPaths(JSON.parse(t),p,depth+1,out)}catch{}
      }
    }
  }
  return [...out];
}

function detectTikTokLiveRoomSignal(value,path='',depth=0){
  if(value==null||depth>18)return null;

  if(typeof value==='string'){
    const text=String(value||'').trim();
    if(
      (text.startsWith('{')&&text.endsWith('}'))||
      (text.startsWith('[')&&text.endsWith(']'))
    ){
      try{return detectTikTokLiveRoomSignal(JSON.parse(text),path,depth+1)}catch{}
    }
    return null;
  }

  if(Array.isArray(value)){
    for(let i=0;i<Math.min(value.length,80);i+=1){
      const found=detectTikTokLiveRoomSignal(value[i],path+'['+i+']',depth+1);
      if(found)return found;
    }
    return null;
  }

  if(typeof value!=='object')return null;

  const context=String(path||'').toLowerCase();
  const roomId=String(
    value?.roomId||
    value?.room_id||
    value?.liveRoomId||
    value?.live_room_id||
    ''
  ).trim();
  const rawStatus=
    value?.status ??
    value?.roomStatus ??
    value?.room_status ??
    value?.liveStatus ??
    value?.live_status;
  const status=(rawStatus===null||rawStatus===undefined||rawStatus==='')
    ? NaN
    : Number(rawStatus);
  const roomContext=Boolean(
    roomId||
    /(^|[.\[])live.?room|room.?info|webcast|live_room/i.test(context)
  );
  const hasStreamShape=Boolean(
    value?.stream_url||
    value?.streamUrl||
    value?.live_core_sdk_data||
    value?.liveCoreSdkData||
    value?.flv_pull_url||
    value?.flvPullUrl
  );

  // TikTok room status=2 is the canonical "currently LIVE" signal. Require
  // room context so unrelated status fields cannot create a false positive.
  if(roomContext&&status===2){
    return {live:true,roomId,status:2,path:String(path||'room')};
  }
  if(roomId&&hasStreamShape){
    return {live:true,roomId,status:Number.isFinite(status)?status:null,path:String(path||'room')};
  }

  for(const [key,child] of Object.entries(value)){
    const found=detectTikTokLiveRoomSignal(
      child,
      path?path+'.'+key:key,
      depth+1
    );
    if(found)return found;
  }
  return null;
}

function collectTikTokFlvCandidates(value,path=''){
  return collectTikTokLiveStreamCandidates(value,[],path)
    .filter(row=>row?.type==='flv')
    .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a));
}

function isTikTokVideoFlvCandidate(row){
  const url=String(row?.url||'');
  const path=String(row?.path||'');
  if(String(row?.type||'').toLowerCase()!=='flv'||!/^https?:\/\//i.test(url))return false;

  const text=(path+' '+String(row?.quality||'')+' '+url).toLowerCase();
  if(/[?&]only_audio=(?:1|true)(?:&|$)/i.test(url))return false;
  if(/(^|[._\[\]/-])ao(?:[._\[\]/-]|$)|audio[_-]?only|only[_-]?audio/.test(text))return false;
  return true;
}

function rankTikTokLiveCandidate(row){
  if(!isTikTokVideoFlvCandidate(row))return -1_000_000_000;

  const text=(
    String(row?.path||'')+' '+
    String(row?.quality||'')+' '+
    String(row?.videoCodec||'')+' '+
    String(row?.url||'')
  ).toLowerCase();

  const codec=normalizeTikTokCodec(row?.videoCodec||'');
  const width=Number(row?.width||0);
  const height=Number(row?.height||0);
  const bitrate=Number(row?.bitrate||0);
  const quality=String(row?.quality||'').toLowerCase();

  let score=100_000;

  // Compatibility is the first criterion. flv.js/browser playback strongly
  // prefers AVC/H.264. HEVC remains available only if no AVC candidate exists.
  if(codec==='h264'||/h264|avc|avc1/.test(text))score+=1_000_000;
  else if(codec==='h265'||/hevcstreamdata|hevc|h265|hvc1|hev1/.test(text))score+=0;
  else score+=400_000;

  if(String(row?.sourceFamily||'')==='standard')score+=20_000;
  if(String(row?.sourceFamily||'')==='hevc')score-=20_000;

  // Within the same compatibility class, choose the highest real quality.
  const pixels=width>0&&height>0?width*height:0;
  score+=Math.min(250_000,Math.floor(pixels/8));
  score+=Math.min(80_000,Math.floor(bitrate/25));

  const qualityScore={
    original:100_000,origin:100_000,uhd:90_000,
    full_hd1:85_000,full_hd:80_000,fhd:80_000,
    hd1:70_000,hd5:68_000,hd:65_000,
    sd5b:50_000,sd5:48_000,sd:45_000,
    ld5:25_000,ld:20_000
  };
  score+=Number(qualityScore[quality]||0);

  if(/\.main\.flv|[._]main[._]/.test(text))score+=10_000;
  if(/backup|bak/.test(text))score-=10_000;

  return score;
}

function inspectFlvBytes(buffer){
  const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer||[]);
  if(bytes.length<13||bytes[0]!==0x46||bytes[1]!==0x4c||bytes[2]!==0x56){
    return {ok:false,hasVideo:false,hasAudio:false,error:'invalid_flv_header'};
  }

  let offset=Number(bytes.readUInt32BE(5)||9);
  if(!Number.isFinite(offset)||offset<9)offset=9;
  offset+=4; // PreviousTagSize0

  let hasVideo=false;
  let hasAudio=false;
  let tags=0;
  while(offset+11<=bytes.length&&tags<64){
    const tagType=bytes[offset];
    const dataSize=(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];
    if(tagType===9)hasVideo=true;
    else if(tagType===8)hasAudio=true;
    tags+=1;
    const next=offset+11+dataSize+4;
    if(next<=offset||next>bytes.length)break;
    offset=next;
    if(hasVideo&&hasAudio)break;
  }

  return {
    ok:hasVideo,
    hasVideo,
    hasAudio,
    error:hasVideo?'':'flv_without_video_tag'
  };
}

async function probeTikTokFlvBytes(handle,row,headers=null){
  const url=String(row?.url||'');
  if(!/^https?:\/\//i.test(url))return {ok:false,error:'missing_url',hasVideo:false,hasAudio:false};

  const baseHeaders={
    'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'accept':'*/*',
    'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
    'referer':'https://www.tiktok.com/@'+handle+'/live',
    'origin':'https://www.tiktok.com',
    ...(headers||{})
  };

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  let reader=null;
  try{
    const r=await fetch(url,{
      headers:{...baseHeaders,range:'bytes=0-262143'},
      redirect:'follow',
      signal:controller.signal
    });
    if(!(r.ok||r.status===206)||!r.body){
      return {ok:false,error:'http_'+r.status,hasVideo:false,hasAudio:false};
    }

    reader=r.body.getReader();
    const chunks=[];
    let total=0;
    while(total<262144){
      const part=await reader.read();
      if(part.done)break;
      if(part.value?.length){
        chunks.push(Buffer.from(part.value));
        total+=part.value.length;
      }
      if(total>=65536){
        const current=inspectFlvBytes(Buffer.concat(chunks,total));
        if(current.hasVideo&&(current.hasAudio||total>=131072)){
          return {
            ...current,
            url:String(r.url||url),
            headers:baseHeaders,
            bytes:total
          };
        }
      }
    }
    const inspected=inspectFlvBytes(Buffer.concat(chunks,total));
    return {
      ...inspected,
      url:String(r.url||url),
      headers:baseHeaders,
      bytes:total
    };
  }catch(error){
    return {
      ok:false,
      error:compactText(error?.message||error,120),
      hasVideo:false,
      hasAudio:false
    };
  }finally{
    clearTimeout(timer);
    try{await reader?.cancel?.()}catch{}
  }
}

async function validateTikTokLiveCandidate(handle,row,headers=null){
  const url=String(row?.url||'');
  const type=String(row?.type||'').toLowerCase();
  if(!/^https?:\/\//i.test(url)||type!=='flv')return null;
  const probe=await probeTikTokFlvBytes(handle,row,headers);
  if(!probe.ok)return null;
  return {
    ...row,
    url:String(probe.url||url),
    type:'flv',
    headers:probe.headers||headers||{},
    flvVerified:true,
    hasVideo:Boolean(probe.hasVideo),
    hasAudio:Boolean(probe.hasAudio),
    validatedAt:Date.now()
  };
}

async function quickTikTokLiveDetailStatus(handle,retry=true,roomId=''){
  await paceTikTokStatusRequest();
  try{
    const endpoint=new URL('https://www.tiktok.com/api/live/detail/');
    endpoint.searchParams.set('aid','1988');
    if(roomId)endpoint.searchParams.set('roomID',String(roomId));
    else endpoint.searchParams.set('uniqueId',handle);

    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'en-US,en;q=0.9',
        'referer':'https://www.tiktok.com/@'+handle+'/live',
      },
      redirect:'follow',
      signal:AbortSignal.timeout(3000)
    });
    if(!r.ok){
      if(retry&&(r.status===401||r.status===403||r.status===429)){
        await refreshTikTokApiCookieHeader({force:true});
        return quickTikTokLiveDetailStatus(handle,false,roomId);
      }
      return {known:false,live:false,status:null,roomId:'',candidates:[]};
    }

    const body=await r.json();
    const liveData=
      body?.LiveRoomInfo||
      body?.data?.LiveRoomInfo||
      body?.data?.liveRoomInfo||
      null;

    if(!liveData||typeof liveData!=='object'){
      if(retry){
        await refreshTikTokApiCookieHeader({force:true});
        return quickTikTokLiveDetailStatus(handle,false,roomId);
      }
      return {known:false,live:false,status:null,roomId:'',candidates:[]};
    }

    const status=Number(liveData?.status);
    const roomId=String(
      liveData?.liveRoomId||
      liveData?.roomId||
      liveData?.id||
      ''
    );

    if(!Number.isFinite(status)){
      return {known:false,live:false,status:null,roomId,candidates:[]};
    }

    // User supplied TikTok Web API behavior:
    // status=2 => LIVE, status=4 => OFFLINE/ended.
    if(status!==2&&status!==4){
      return {known:false,live:false,status,roomId,candidates:[]};
    }

    const live=status===2;
    const keepMedia=tiktokRealtimeLiveHandles.has(String(handle||'').toLowerCase());
    const candidates=(live||keepMedia)
      ? collectTikTokLiveStreamCandidates(liveData)
          .filter(isTikTokVideoFlvCandidate)
          .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
      : [];
    if(live&&!candidates.length){
      console.log(
        '[tiktok-flv-miss]',
        handle,
        'source=live-detail',
        'paths='+summarizeTikTokFlvPaths(liveData).slice(0,16).join(',')
      );
    }else if(live&&candidates.length){
      console.log(
        '[tiktok-flv-found]',
        handle,
        'source=live-detail',
        'count='+candidates.length,
        'top='+String(candidates[0]?.path||'')
      );
    }

    return {
      known:true,
      live,
      status,
      roomId,
      title:String(liveData?.title||''),
      thumbnail:firstTikTokAssetUrl(
        liveData?.cover||
        liveData?.roomCover||
        liveData?.room_cover||
        liveData?.background||
        liveData?.owner?.avatarLarger||
        liveData?.owner?.avatar_larger
      ),
      viewerCount:Number(liveData?.userCount||0),
      candidates,
      source:'live-detail'
    };
  }catch(error){
    return {known:false,live:false,status:null,roomId:'',candidates:[]};
  }
}

async function quickTikTokRoomInfoStatus(handle,roomId){
  if(!roomId)return {known:true,live:false,status:4,roomId:'',candidates:[]};
  await paceTikTokStatusRequest();
  try{
    const endpoint=new URL('https://webcast.tiktok.com/webcast/room/info');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('room_id',String(roomId));
    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle+'/live',
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(2200)
    });
    if(!r.ok)return {known:false,live:false,status:null,roomId:String(roomId),candidates:[]};
    const body=await r.json();
    const room=body?.data||body?.room||null;
    const status=Number(room?.status);
    if(!Number.isFinite(status)){
      return {known:false,live:false,status:null,roomId:String(roomId),candidates:[]};
    }
    const live=status===2;
    const keepMedia=tiktokRealtimeLiveHandles.has(String(handle||'').toLowerCase());
    const candidates=(live||keepMedia)
      ? collectTikTokLiveStreamCandidates(room)
          .filter(isTikTokVideoFlvCandidate)
          .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
      : [];
    if(live&&!candidates.length){
      console.log(
        '[tiktok-flv-miss]',
        handle,
        'source=room-info',
        'paths='+summarizeTikTokFlvPaths(room).slice(0,16).join(',')
      );
    }else if(live&&candidates.length){
      console.log(
        '[tiktok-flv-found]',
        handle,
        'source=room-info',
        'count='+candidates.length,
        'top='+String(candidates[0]?.path||'')
      );
    }
    return {known:true,live,status,roomId:String(roomId),candidates};
  }catch(error){
    return {known:false,live:false,status:null,roomId:String(roomId),candidates:[]};
  }
}

async function quickTikTokLiveStateOnly(rawHandle,retry=true){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,live:false,status:null,source:'invalid'};

  await paceTikTokStatusRequest();
  try{
    const endpoint=new URL('https://www.tiktok.com/api-live/user/room');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('sourceType','54');
    endpoint.searchParams.set('uniqueId',handle);

    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle+'/live',
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(5000)
    });

    if(!r.ok){
      if(retry&&(r.status===401||r.status===403||r.status===429)){
        await refreshTikTokApiCookieHeader({force:true}).catch(()=>{});
        return quickTikTokLiveStateOnly(handle,false);
      }
      return {known:false,live:false,status:null,source:'tiktok-http-'+r.status};
    }

    const data=await r.json();
    const liveRoom=data?.data?.liveRoom||{};
    const rawStatus=liveRoom?.status;
    const hasStatus=rawStatus!==undefined&&rawStatus!==null&&rawStatus!=='';
    const status=hasStatus?Number(rawStatus):NaN;
    const roomId=String(liveRoom?.id||liveRoom?.roomId||liveRoom?.room_id||'');

    if(status===2){
      return {known:true,live:true,status:2,roomId,source:retry?'tiktok-user-room':'tiktok-user-room-retry'};
    }
    if(status===4){
      return {known:true,live:false,status:4,roomId,source:retry?'tiktok-user-room':'tiktok-user-room-retry'};
    }

    const apiCode=Number(data?.statusCode);
    const message=String(data?.message||'').trim().toLowerCase();
    return {
      known:false,
      live:false,
      status:Number.isFinite(status)?status:null,
      source:apiCode===19881007||message==='user_not_found'
        ?'tiktok-user-not-found'
        :(apiCode===10001||message.includes('service unavailable')
          ?'tiktok-service-unavailable'
          :'tiktok-no-status')
    };
  }catch(error){
    if(retry){
      await refreshTikTokApiCookieHeader({force:true}).catch(()=>{});
      return quickTikTokLiveStateOnly(handle,false);
    }
    return {known:false,live:false,status:null,source:'tiktok-error'};
  }
}

async function browserTikTokLiveStates(handles){
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))];
  const out=new Map();
  if(!normalized.length)return out;

  let page=null;
  try{
    const browser=await getBrowser();
    page=await browser.newPage();
    await page.setViewport({width:1100,height:760,deviceScaleFactor:1});
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});

    const stored=await loadSession('tiktok').catch(()=>null);
    const cookies=cookieParams(stored?.state?.cookies||[]);
    if(cookies.length)await page.setCookie(...cookies).catch(()=>{});

    // Use a static same-origin document. The TikTok SPA can self-navigate
    // during startup and destroy the JS execution context mid-sweep.
    await page.goto('https://www.tiktok.com/robots.txt',{
      waitUntil:'domcontentloaded',
      timeout:10_000
    }).catch(()=>{});
    await sleep(250);

    const rows=await page.evaluate(async list=>{
      const result=new Array(list.length);
      let cursor=0;
      const worker=async()=>{
        while(true){
          const index=cursor++;
          if(index>=list.length)return;
          const handle=list[index];
          try{
            await new Promise(resolve=>setTimeout(resolve,320));
            const url='/api-live/user/room?aid=1988&sourceType=54&uniqueId='+encodeURIComponent(handle);
            const controller=new AbortController();
            const timer=setTimeout(()=>controller.abort(),3500);
            let r;
            try{
              r=await fetch(url,{
                method:'GET',
                credentials:'include',
                headers:{accept:'application/json,text/plain,*/*'},
                signal:controller.signal
              });
            }finally{
              clearTimeout(timer);
            }
            if(!r.ok){
              result[index]={handle,known:false,live:false,status:null,http:r.status};
              continue;
            }
            const data=await r.json();
            const room=data?.data?.liveRoom||null;
            const roomId=String(room?.roomId||room?.id||data?.data?.user?.roomId||'');
            const status=Number(room?.status);
            if(Number.isFinite(status)){
              result[index]={handle,known:true,live:status===2,status};
            }else if(!room&&!roomId){
              result[index]={handle,known:true,live:false,status:4};
            }else{
              result[index]={handle,known:false,live:false,status:null};
            }
          }catch(error){
            result[index]={handle,known:false,live:false,status:null,error:String(error?.message||error||'fetch_failed')};
          }
        }
      };
      await Promise.all(Array.from({length:Math.min(1,list.length)},()=>worker()));
      return result;
    },normalized);

    let known=0;
    for(const row of Array.isArray(rows)?rows:[]){
      const handle=normalizeTikTokHandle(row?.handle||'');
      if(!handle)continue;
      if(row?.known)known+=1;
      out.set(handle.toLowerCase(),{
        known:Boolean(row?.known),
        live:Boolean(row?.live),
        status:Number.isFinite(Number(row?.status))?Number(row.status):null,
        source:'browser-user-room'
      });
    }
    console.log('[tiktok-browser-status]','total='+normalized.length,'known='+known,'unknown='+(normalized.length-known));
  }catch(error){
    console.warn('[tiktok-browser-status] failed',compactText(error?.message||error,180));
  }finally{
    if(page)await page.close().catch(()=>{});
  }
  return out;
}

async function quickTikTokLiveStatus(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,live:false,candidates:[]};
  const key=handle.toLowerCase();
  const keepMedia=tiktokRealtimeLiveHandles.has(key);

  // Status and media are separate. A source may confirm LIVE without carrying
  // any stream URLs; in that case continue through every media source.
  const detail=await quickTikTokLiveDetailStatus(handle);
  if(detail?.known&&!detail.live&&!keepMedia)return detail;

  const confirmedLive=detail?.known&&detail?.live===true?detail:null;
  if(confirmedLive?.candidates?.length)return confirmedLive;

  if(confirmedLive?.roomId){
    const room=await quickTikTokRoomInfoStatus(handle,confirmedLive.roomId).catch(()=>null);
    if(room?.candidates?.length){
      return {
        ...confirmedLive,
        roomId:String(room.roomId||confirmedLive.roomId||''),
        candidates:room.candidates,
        source:'live-detail>room-info'
      };
    }
  }

  // user/room can confirm LIVE while omitting streamData. Never stop there:
  // resolve media from roomId and profile-hydration roomId before giving up.
  try{
    const endpoint=new URL('https://www.tiktok.com/api-live/user/room');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('sourceType','54');
    endpoint.searchParams.set('uniqueId',handle);
    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle+'/live',
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(2500)
    });

    if(r.ok){
      const data=await r.json();
      const liveRoom=data?.data?.liveRoom||null;
      const roomStatus=Number(liveRoom?.status);
      const roomId=String(
        liveRoom?.roomId||
        liveRoom?.id||
        data?.data?.user?.roomId||
        ''
      );

      if(Number.isFinite(roomStatus)){
        const isLive=roomStatus===2;
        let candidates=(isLive||keepMedia||Boolean(confirmedLive))
          ? collectTikTokLiveStreamCandidates(liveRoom)
              .filter(isTikTokVideoFlvCandidate)
              .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
          : [];
        let mediaSource='user-room';

        if((isLive||keepMedia||confirmedLive)&&!candidates.length){
          const roomIds=[];
          if(roomId)roomIds.push(roomId);
          if(confirmedLive?.roomId&&!roomIds.includes(String(confirmedLive.roomId))){
            roomIds.push(String(confirmedLive.roomId));
          }

          const profile=await fetchTikTokProfileIdentityScraped(handle).catch(()=>null);
          const profileRoomId=String(profile?.roomId||'');
          if(profileRoomId&&!roomIds.includes(profileRoomId))roomIds.unshift(profileRoomId);

          for(const mediaRoomId of roomIds){
            const room=await quickTikTokRoomInfoStatus(handle,mediaRoomId).catch(()=>null);
            if(room?.candidates?.length){
              candidates=room.candidates;
              mediaSource='user-room>profile-room>room-info';
              break;
            }

            const byRoom=await quickTikTokLiveDetailStatus(handle,false,mediaRoomId).catch(()=>null);
            if(byRoom?.candidates?.length){
              candidates=byRoom.candidates;
              mediaSource='user-room>profile-room>live-detail-room';
              break;
            }
          }
        }

        if(candidates.length){
          console.log(
            '[tiktok-flv-found]',
            handle,
            'source='+mediaSource,
            'count='+candidates.length,
            'top='+String(candidates[0]?.path||'')
          );
          if(confirmedLive){
            return {
              ...confirmedLive,
              roomId:String(confirmedLive.roomId||roomId||''),
              candidates,
              source:mediaSource
            };
          }
          return {
            known:true,
            live:isLive,
            status:roomStatus,
            roomId,
            candidates,
            source:mediaSource
          };
        }

        if(isLive||confirmedLive){
          console.log(
            '[tiktok-flv-miss]',
            handle,
            'source='+mediaSource,
            'roomId='+String(roomId||confirmedLive?.roomId||''),
            'paths='+summarizeTikTokFlvPaths(liveRoom).slice(0,16).join(',')
          );
        }

        // A higher-priority endpoint already confirmed LIVE. A lower-priority
        // status response must not erase it merely because media is absent.
        if(confirmedLive){
          return {
            ...confirmedLive,
            roomId:String(confirmedLive.roomId||roomId||''),
            candidates:[],
            source:'live-detail>room-info>user-room>profile-room'
          };
        }

        return {
          known:true,
          live:isLive,
          status:roomStatus,
          roomId,
          candidates:[],
          source:'user-room'
        };
      }

      if(!liveRoom&&!roomId){
        if(confirmedLive)return confirmedLive;
        return {known:true,live:false,status:4,roomId:'',candidates:[],source:'user-room'};
      }

      if(roomId){
        const room=await quickTikTokRoomInfoStatus(handle,roomId);
        if(room?.candidates?.length){
          return confirmedLive
            ? {...confirmedLive,candidates:room.candidates,source:'user-room>room-info'}
            : room;
        }
      }
    }
  }catch(error){
    console.log('[tiktok-session] preflight unknown',handle,compactText(error?.message||error,140));
  }

  if(confirmedLive)return confirmedLive;
  return {known:false,live:false,candidates:[]};
}
async function fastTikTokLiveWithYtdlp(handle){
  const url='https://www.tiktok.com/@'+handle+'/live';
  try{
    const out=await execFileText('python3',[
      'tiktok_stream_extract.py',
      url
    ],{
      timeout:5200,
      maxBuffer:2*1024*1024,
      env:{...process.env,TIKTOK_COOKIE_HEADER:String(tiktokApiCookieHeader||'')}
    });
    const data=JSON.parse(String(out||'').trim()||'{}');
    if(!data?.success||!data?.stream_url)return null;
    const streamUrl=String(data.stream_url||'');
    const streamType=String(data.stream_type||'').toLowerCase();
    // FLV-only pipeline: never relabel another transport as FLV.
    if(streamType!=='flv'&&!/\.flv(?:\?|$)/i.test(streamUrl))return null;
    return {
      url:streamUrl,
      type:'flv',
      title:String(data.title||''),
      thumbnail:String(data.thumbnail||''),
      path:'yt-dlp:'+String(data?.selected?.format_id||data?.method||'fast'),
      videoCodec:normalizeTikTokCodec(data?.selected?.vcodec||''),
      width:Number(data?.selected?.width||0),
      height:Number(data?.selected?.height||0),
      quality:String(data?.selected?.format_id||''),
      bitrate:Number(data?.selected?.tbr||0)*1000
    };
  }catch(error){
    console.log('[tiktok-fast] yt-dlp miss',handle,compactText(error?.message||error,120));
    return null;
  }
}
const TIKTOK_BAD_SOURCE_MS=10*60*1000;

function tiktokLiveSourceFingerprint(rawUrl,type=''){
  try{
    const u=new URL(String(rawUrl||''));
    const kind=String(type||'').toLowerCase();
    // FLV validity is session-specific. The same stream path can work again
    // immediately with a fresh TikTok _session_id, so never blacklist the
    // whole FLV path.
    if(kind==='flv'){
      const sid=u.searchParams.get('_session_id')||u.searchParams.get('session_id')||'';
      const sign=u.searchParams.get('sign')||'';
      return kind+'|'+u.hostname.toLowerCase()+'|'+u.pathname+'|'+(sid||sign||u.search);
    }
    return kind+'|'+u.hostname.toLowerCase()+'|'+u.pathname+'|'+u.search;
  }catch{
    return String(type||'')+'|'+String(rawUrl||'').split('?')[0];
  }
}
function cleanTikTokBadSources(){
  const cutoff=Date.now()-TIKTOK_BAD_SOURCE_MS;
  for(const [handle,map] of tiktokLiveBadSources){
    if(!(map instanceof Map)){tiktokLiveBadSources.delete(handle);continue}
    for(const [fingerprint,at] of map){
      if(Number(at||0)<cutoff)map.delete(fingerprint);
    }
    if(!map.size)tiktokLiveBadSources.delete(handle);
  }
}
function markTikTokBadSource(handle,row){
  if(!row?.url)return;
  cleanTikTokBadSources();
  const key=String(handle||'').toLowerCase();
  let map=tiktokLiveBadSources.get(key);
  if(!map){map=new Map();tiktokLiveBadSources.set(key,map)}
  const fingerprint=tiktokLiveSourceFingerprint(row.url,row.type);
  map.set(fingerprint,Date.now());
  console.log('[tiktok-source] blacklist',handle,row.type,fingerprint.slice(0,180));
}
function isTikTokBadSource(handle,row){
  if(!row?.url)return false;
  cleanTikTokBadSources();
  const map=tiktokLiveBadSources.get(String(handle||'').toLowerCase());
  return Boolean(map?.has(tiktokLiveSourceFingerprint(row.url,row.type)));
}
function clearTikTokBadSource(handle,row){
  if(!row?.url)return;
  const key=String(handle||'').toLowerCase();
  const map=tiktokLiveBadSources.get(key);
  if(!map)return;
  map.delete(tiktokLiveSourceFingerprint(row.url,row.type));
  if(!map.size)tiktokLiveBadSources.delete(key);
}

function cleanTikTokPreferBrowser(){
  const now=Date.now();
  for(const [key,until] of tiktokLivePreferBrowser){
    if(Number(until||0)<=now)tiktokLivePreferBrowser.delete(key);
  }
}
function preferTikTokBrowser(handle,ms=10*60*1000){
  cleanTikTokPreferBrowser();
  tiktokLivePreferBrowser.set(String(handle||'').toLowerCase(),Date.now()+ms);
}
function shouldPreferTikTokBrowser(handle){
  cleanTikTokPreferBrowser();
  return Number(tiktokLivePreferBrowser.get(String(handle||'').toLowerCase())||0)>Date.now();
}

function cleanTikTokFastSources(){
  // Do not age-out or blacklist FLV during the locked getlink phase.
  for(const [key,row] of tiktokLiveFastSources){
    if(!row||!tiktokLiveSourceUsable(row)){
      tiktokLiveFastSources.delete(key);
    }
  }
}
async function resolveTikTokLiveSource(rawHandle){
  cleanTikTokFastSources();
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const key=handle.toLowerCase();

  const cached=tiktokLiveFastSources.get(key);
  if(cached&&isTikTokVideoFlvCandidate(cached)){
    cached.at=Date.now();
    return {...cached,type:'flv',mode:cached.mode||'fast-cache'};
  }

  const preflight=await quickTikTokLiveStatus(handle);
  if(preflight.known&&!preflight.live&&!tiktokRealtimeLiveHandles.has(key)){
    throw new Error('tiktok_not_live');
  }

  const candidate=(preflight.candidates||[])
    .filter(row=>isTikTokVideoFlvCandidate(row)&&!isTikTokBadSource(handle,row))
    .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))[0]||null;
  if(candidate){
    const row={
      mode:'fast',handle,type:'flv',
      url:String(candidate.url||''),
      headers:candidate.headers||{},
      at:Date.now(),source:'room-api-flv',confirmed:false
    };
    tiktokLiveFastSources.set(key,row);
    return row;
  }

  const ytdlp=await fastTikTokLiveWithYtdlp(handle).catch(()=>null);
  if(ytdlp&&isTikTokVideoFlvCandidate({...ytdlp,type:'flv'})){
    const row={
      mode:'fast',handle,type:'flv',url:String(ytdlp.url||''),
      headers:ytdlp.headers||{},at:Date.now(),
      source:'yt-dlp-flv',confirmed:false
    };
    tiktokLiveFastSources.set(key,row);
    return row;
  }

  const session=await captureTikTokLiveSession(handle);
  if(!isTikTokVideoFlvCandidate(session))throw new Error('tiktok_live_flv_not_found');
  const row={
    mode:'fast',handle,type:'flv',url:String(session.url||''),
    headers:session.headers||{},at:Date.now(),
    source:'browser-flv',confirmed:false
  };
  tiktokLiveFastSources.set(key,row);
  return row;
}

async function captureTikTokLiveSessionOnce(rawHandle,options={}){
  cleanTikTokLiveSessions();
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  console.log('[tiktok-session] start',handle);

  const key=handle.toLowerCase();
  const maxWaitMs=Math.max(1500,Math.min(12000,Number(options?.maxWaitMs||12000)));
  const skipPreflight=Boolean(options?.skipPreflight);
  let preflight={known:false,live:false,status:null};
  if(!skipPreflight&&!shouldPreferTikTokBrowser(handle)){
    preflight=await quickTikTokLiveStatus(handle);
    if(preflight.known&&!preflight.live&&!tiktokRealtimeLiveHandles.has(key)){
      console.log('[tiktok-session] offline',handle,'status='+preflight.status);
      throw new Error('tiktok_not_live');
    }
  }else{
    console.log('[tiktok-session] skip preflight',handle,skipPreflight?'forced':'preferred');
  }
  const current=tiktokLiveSessions.get(key);
  if(current&&current.page&&!current.page.isClosed()&&tiktokLiveCacheReusable(current)){
    current.at=Date.now();
    console.log('[tiktok-cache] session reuse',handle,current.type);
    return current;
  }
  if(current)await closeTikTokLiveSession(key);

  const browser=await getBrowser();
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});
  await page.emulateTimezone(TZ).catch(()=>{});
  await page.setCacheEnabled(false).catch(()=>{});
  await page.setRequestInterception(true).catch(()=>{});

  const stored=await loadSession('tiktok');
  const savedCookies=cookieParams(stored?.state?.cookies||[]);
  if(savedCookies.length)await page.setCookie(...savedCookies).catch(()=>{});

  let capturedFlv=null;
  let capturedLiveSignal=null;
  let firstMediaAt=0;
  const pendingBodies=new Set();

  const remember=(url,type,headers={})=>{
    const next={url:String(url||''),type,headers,at:Date.now()};
    if(type==='flv'&&!capturedFlv){
      capturedFlv=next;
      console.log('[tiktok-session] capture',handle,'flv',next.url.slice(0,200));
    }
    if(!firstMediaAt)firstMediaAt=Date.now();
  };

  const onRequest=request=>{
    try{
      const requestUrl=String(request.url()||'');
      const lower=requestUrl.toLowerCase();
      if(lower.includes('.flv')&&isTikTokVideoFlvCandidate({url:requestUrl,type:'flv',path:'browser-request'})){
        remember(requestUrl,'flv',request.headers?.()||{});
      }

      if(request.isInterceptResolutionHandled?.())return;
      const kind=String(request.resourceType?.()||'');
      if(['image','font','stylesheet'].includes(kind))request.abort().catch(()=>{});
      else request.continue().catch(()=>{});
    }catch{
      try{
        if(!request.isInterceptResolutionHandled?.())request.continue().catch(()=>{});
      }catch{}
    }
  };

  const onResponse=response=>{
    try{
      const responseUrl=String(response.url()||'');
      if(!/tiktok\.com|tiktokv\.com|byteoversea\.com|tiktokcdn\.com/i.test(responseUrl))return;
      const headers=response.headers?.()||{};
      const type=String(headers['content-type']||headers['Content-Type']||'').toLowerCase();

      // TikTok FLV URLs do not always end in ".flv". The browser/network
      // response itself is authoritative: if TikTok serves video/x-flv, keep
      // that URL as FLV even when the path is opaque or extensionless.
      if(/(?:video|application)\/(?:x-)?flv/.test(type)){
        const requestHeaders=response.request?.()?.headers?.()||{};
        if(!capturedFlv){
          remember(responseUrl,'flv',requestHeaders);
          console.log('[tiktok-session] response-flv',handle,responseUrl.slice(0,200));
        }
        return;
      }

      // Structured TikTok API responses may carry semantic FLV fields
      // (main.flv, flv_pull_url, stream_flv_url...) whose URL also has no
      // ".flv" suffix. Parse those text/JSON payloads recursively.
      if(type&&!/json|text|javascript/i.test(type))return;
      const task=(async()=>{
        const text=await response.text().catch(()=>null);
        if(!text||text.length>3_000_000)return;

        if(!capturedLiveSignal){
          const liveSignal=detectTikTokLiveRoomSignal(text,'browser-response');
          if(liveSignal){
            capturedLiveSignal={
              ...liveSignal,
              source:'browser-response-live-room',
              at:Date.now()
            };
            console.log(
              '[tiktok-session] live-signal',
              handle,
              'status='+String(liveSignal.status??''),
              'room='+String(liveSignal.roomId||'')
            );
          }
        }

        const flv=collectTikTokLiveStreamCandidates(text,[],'browser-response')
          .filter(isTikTokVideoFlvCandidate)
          .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))[0];

        if(flv&&!capturedFlv){
          remember(flv.url,'flv',response.request?.()?.headers?.()||{});
          console.log('[tiktok-session] payload-flv',handle,flv.path||'');
        }
      })();
      pendingBodies.add(task);
      task.finally(()=>pendingBodies.delete(task));
    }catch{}
  };

  page.on('request',onRequest);
  page.on('response',onResponse);

  try{
    const navPromise=page.goto('https://www.tiktok.com/@'+handle+'/live',{
      waitUntil:'domcontentloaded',
      timeout:20000
    }).catch(error=>{
      console.warn('[tiktok-session] goto',handle,compactText(error?.message||error,180));
      return null;
    });

    const started=Date.now();
    while(Date.now()-started<maxWaitMs&&!capturedFlv){
      await page.evaluate(()=>{
        for(const video of document.querySelectorAll('video')){
          try{video.muted=true;void video.play?.()}catch{}
        }
      }).catch(()=>{});

      if(pendingBodies.size)await Promise.race([
        Promise.allSettled([...pendingBodies]),
        sleep(180)
      ]).catch(()=>{});

      await sleep(350);
    }

    if(pendingBodies.size)await Promise.race([
      Promise.allSettled([...pendingBodies]),
      sleep(500)
    ]).catch(()=>{});

    // A LIVE page can emit its FLV a few hundred milliseconds after the main
    // wait expires (especially while a navigation promise is still settling).
    // Do one final grace window before declaring "no FLV"; without this, logs
    // showed no-flv followed ~100 ms later by a valid FLV capture.
    if(!capturedFlv){
      const graceStarted=Date.now();
      while(Date.now()-graceStarted<1500&&!capturedFlv){
        if(pendingBodies.size)await Promise.race([
          Promise.allSettled([...pendingBodies]),
          sleep(120)
        ]).catch(()=>{});
        await sleep(120);
      }
    }

    // If FLV is late/hidden, the live page can still prove the room exists.
    // This is detection evidence only; playback remains FLV-only.
    if(!capturedFlv&&!capturedLiveSignal){
      const domSignal=await page.evaluate(()=>{
        try{
          const path=String(location.pathname||'');
          const onLivePath=/\/@[^/]+\/live\/?$/i.test(path);
          const videos=[...document.querySelectorAll('video')];
          const hasVideo=videos.some(video=>
            Number(video.videoWidth||0)>0||
            Number(video.videoHeight||0)>0||
            Boolean(video.src||video.currentSrc)
          );
          return onLivePath&&hasVideo
            ? {live:true,status:2,roomId:'',path:'dom-live-video'}
            : null;
        }catch{return null}
      }).catch(()=>null);
      if(domSignal){
        capturedLiveSignal={
          ...domSignal,
          source:'browser-dom-live-video',
          at:Date.now()
        };
        console.log('[tiktok-session] live-signal',handle,'dom-video');
      }
    }

    // FLV-only playback. Non-FLV observations are ignored for streaming, but
    // discovery callers may accept a strong LIVE-room signal and resolve FLV
    // separately.
    const captured=capturedFlv;
    if(!captured){
      if(capturedLiveSignal&&options?.allowLiveEvidence){
        page.off('request',onRequest);
        page.off('response',onResponse);
        await page.close().catch(()=>{});
        console.log('[tiktok-session] live-no-flv',handle,capturedLiveSignal.source||'browser-live');
        return {
          handle,page:null,url:'',type:'',headers:{},at:Date.now(),
          confirmed:false,live:true,
          evidenceSource:String(capturedLiveSignal.source||'browser-live')
        };
      }
      console.log('[tiktok-session] no-flv',handle,'no-media');
      throw new Error(preflight.known&&preflight.live?'live_flv_not_captured':'tiktok_not_live_or_blocked');
    }

    page.off('request',onRequest);
    page.off('response',onResponse);

    const row={handle,page,url:captured.url,type:captured.type,headers:captured.headers,at:Date.now(),confirmed:false};
    tiktokLiveSessions.set(key,row);
    console.log('[tiktok-session] ready',handle,row.type,'ms='+(Date.now()-started));
    void navPromise;
    return row;
  }catch(error){
    page.off('request',onRequest);
    page.off('response',onResponse);
    await page.close().catch(()=>{});
    throw error;
  }
}

async function captureTikTokLiveSession(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const key=handle.toLowerCase();

  const current=tiktokLiveSessions.get(key);
  if(current&&current.page&&!current.page.isClosed()&&tiktokLiveCacheReusable(current)){
    current.at=Date.now();
    return current;
  }

  const pending=tiktokLiveSessionInflight.get(key);
  if(pending)return pending;

  const task=captureTikTokLiveSessionOnce(handle);
  tiktokLiveSessionInflight.set(key,task);
  try{
    return await task;
  }finally{
    if(tiktokLiveSessionInflight.get(key)===task)tiktokLiveSessionInflight.delete(key);
  }
}

async function probeTikTokBrowserFlv(rawHandle,{maxWaitMs=4500}={}){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return null;
  const key=handle.toLowerCase();
  const cached=currentTikTokLibrarySource(handle);
  if(cached&&String(cached.type||'').toLowerCase()==='flv'){
    return {
      stream_url:String(cached.url||''),
      stream_type:'flv',
      source:String(cached.source||'browser-cache'),
      headers:cached.headers||{}
    };
  }
  try{
    const session=await captureTikTokLiveSessionOnce(handle,{
      maxWaitMs,
      skipPreflight:true,
      allowLiveEvidence:true
    });
    if(session?.live&&!session?.url){
      return {
        live:true,
        stream_url:'',
        stream_type:'',
        source:String(session.evidenceSource||'browser-live-page'),
        headers:{}
      };
    }
    if(!session?.url||String(session.type||'').toLowerCase()!=='flv')return null;
    return {
      live:true,
      stream_url:String(session.url||''),
      stream_type:'flv',
      source:'browser-live-page',
      headers:session.headers||{}
    };
  }catch(error){
    console.log('[tiktok-live-deep] browser miss',handle,compactText(error?.message||error,100));
    return null;
  }
}

async function liveSessionHeaders(req,row,targetUrl){
  const headers={};
  for(const [name,value] of Object.entries(row?.headers||{})){
    const key=String(name||'').toLowerCase();
    if(!key||key.startsWith(':')||['host','content-length','connection','accept-encoding'].includes(key))continue;
    headers[key]=String(value);
  }
  headers['user-agent']=headers['user-agent']||'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  headers.referer=headers.referer||'https://www.tiktok.com/@'+row.handle+'/live';
  headers.origin=headers.origin||'https://www.tiktok.com';
  headers.accept=headers.accept||'*/*';
  const cookies=await row.page.cookies(targetUrl).catch(()=>[]);
  if(cookies.length)headers.cookie=cookies.map(x=>x.name+'='+x.value).join('; ');
  if(req.headers.range)headers.range=String(req.headers.range);
  return headers;
}

function liveProxyHeaders(req){
  const headers={
    'user-agent':String(req.headers['user-agent']||'Mozilla/5.0'),
    'referer':'https://www.tiktok.com/',
    'origin':'https://www.tiktok.com',
    'accept':'*/*'
  };
  if(req.headers.range)headers.range=String(req.headers.range);
  return headers;
}
async function pipeTikTokTarget(req,res,targetUrl,{fallbackType='application/octet-stream',handle='',headersOverride=null,deferError=false}={}){
  try{res.socket?.setNoDelay?.(true)}catch{}
  const session=handle?tiktokLiveSessions.get(String(handle).toLowerCase()):null;
  const headers=headersOverride
    ? {...headersOverride}
    : (session?await liveSessionHeaders(req,session,targetUrl):liveProxyHeaders(req));
  // MP4 playback depends on byte-range requests. Preserve yt-dlp's required
  // headers, but always forward the browser Range header as well.
  if(req.headers.range)headers.range=String(req.headers.range);
  if(!headers.accept)headers.accept='*/*';
  const upstream=await fetch(targetUrl,{
    headers,
    redirect:'follow'
  });
  if(!upstream.ok||!upstream.body){
    console.warn('[tiktok-proxy] upstream failed',upstream.status,String(targetUrl||'').slice(0,180));
    if(!deferError)json(res,502,{ok:false,error:'upstream_stream_'+upstream.status});
    return {ok:false,status:Number(upstream.status||0)};
  }
  const contentType=String(upstream.headers.get('content-type')||fallbackType);
  const finalUrl=String(upstream.url||targetUrl);
  const outHeaders={
    'content-type':contentType,
    'access-control-allow-origin':ORIGIN,
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'range',
    'access-control-expose-headers':'content-length,content-range,accept-ranges,content-type',
    'cache-control':'no-store',
    'x-accel-buffering':'no'
  };
  for(const key of ['content-length','content-range','accept-ranges']){
    const value=upstream.headers.get(key);
    if(value)outHeaders[key]=value;
  }
  res.writeHead(upstream.status,outHeaders);
  try{
    for await(const chunk of upstream.body){
      if(res.destroyed)break;
      if(!res.write(Buffer.from(chunk)))await new Promise(resolve=>res.once('drain',resolve));
    }
  }finally{
    if(!res.writableEnded)res.end();
  }
  return {ok:true,status:Number(upstream.status||200)};
}
async function proxyTikTokLive(req,res,rawHandle,forceBrowser=false,sourceSig=''){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}

  // Debug-only explicit browser force can still prepare a source. Normal UI
  // playback never uses this branch.
  let source=null;
  if(forceBrowser){
    if(TIKTOK_UPDATES_PAUSED){
      json(res,503,{ok:false,error:'tiktok_updates_paused'});
      return;
    }
    const session=await captureTikTokLiveSession(handle);
    const candidate={
      mode:'browser',handle,type:session.type,url:session.url,
      headers:session.headers||{},at:session.at,source:'browser-session'
    };
    const verified=await confirmTikTokLibrarySource(handle,candidate,{
      mode:'browser',source:'browser-session'
    }).catch(()=>false);
    if(verified){
      candidate.confirmed=true;
      tiktokLiveFastSources.set(handle.toLowerCase(),candidate);
      source=candidate;
    }
  }else if(sourceSig){
    // sourceSig versions the package, but the route itself stays reconnectable:
    // if that exact FLV expired, use the newly verified hot source for the same
    // handle rather than forcing the browser to rediscover media.
    source=findTikTokLiveSourceBySig(handle,sourceSig)||currentTikTokLibrarySource(handle);
  }else{
    source=currentTikTokLibrarySource(handle);
  }

  if(!source?.url||String(source.type||'').toLowerCase()!=='flv'){
    if(!TIKTOK_UPDATES_PAUSED)queueTikTokLibraryWarm(handle);
    json(res,410,{ok:false,error:'live_source_not_ready'});
    return;
  }

  // HOT PATH: lookup already prepared FLV -> pipe. No probe/getlink/yt-dlp/API.
  source.at=Date.now();
  const fast=String(source.mode||'').startsWith('fast');
  const piped=await pipeTikTokTarget(req,res,source.url,{
    fallbackType:'video/x-flv',
    handle:fast?'':handle,
    headersOverride:fast?source.headers:null,
    deferError:true
  });

  if(piped?.ok)return;

  markTikTokBadSource(handle,source);
  const key=handle.toLowerCase();
  const cached=tiktokLiveFastSources.get(key);
  if(cached&&tiktokLibrarySourceSig(cached)===tiktokLibrarySourceSig(source)){
    tiktokLiveFastSources.delete(key);
  }

  // Keep LIVE locked. Only the media source failed; prepare the replacement in
  // background so the next reconnect hits a fresh source.
  updateTikTokLiveLibrary(handle,{
    live:true,status:'live',probeState:'live',
    ready:false,playable:false,type:'',sourceSig:'',
    lastSeenAt:Date.now()
  });
  if(!TIKTOK_UPDATES_PAUSED)queueTikTokLibraryWarm(handle);
  if(tiktokLiveSelectedHandles.has(handle))void persistTikTokLiveStore({force:true});

  if(!res.headersSent){
    json(res,502,{ok:false,error:'upstream_stream_'+Number(piped?.status||0)});
  }else if(!res.writableEnded){
    res.end();
  }
}

function findTikTokUserObject(value,handle,depth=0){
  if(!value||depth>12)return null;
  if(Array.isArray(value)){
    for(const item of value){
      const found=findTikTokUserObject(item,handle,depth+1);
      if(found)return found;
    }
    return null;
  }
  if(typeof value!=='object')return null;

  const uniqueId=String(value?.uniqueId||value?.unique_id||'');
  const secUid=String(value?.secUid||value?.sec_uid||'');
  if(secUid&&(!uniqueId||uniqueId.toLowerCase()===String(handle||'').toLowerCase())){
    return value;
  }

  for(const child of Object.values(value)){
    const found=findTikTokUserObject(child,handle,depth+1);
    if(found)return found;
  }
  return null;
}

async function fetchTikTokProfileIdentityScraped(handle){
  const url='https://www.tiktok.com/@'+handle;
  try{
    const r=await fetch(url,{
      redirect:'follow',
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      signal:AbortSignal.timeout(15000)
    });
    if(!r.ok)throw new Error('profile_http_'+r.status);
    const html=await r.text();

    const parseScriptJson=id=>{
      let at=html.indexOf('id="'+id+'"');
      if(at<0)at=html.indexOf("id='"+id+"'");
      if(at<0)return null;
      const open=html.indexOf('>',at);
      if(open<0)return null;
      const close=html.indexOf('</script>',open+1);
      if(close<0)return null;
      const raw=html.slice(open+1,close).trim();
      if(!raw)return null;
      try{return JSON.parse(raw)}catch{return null}
    };

    let user=null;
    let stats=null;
    const hydration=parseScriptJson('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if(hydration){
      const scope=hydration?.__DEFAULT_SCOPE__||{};
      const detailScope=scope?.['webapp.user-detail']||null;
      user=
        detailScope?.userInfo?.user||
        detailScope?.user||
        findTikTokUserObject(detailScope,handle)||
        findTikTokUserObject(hydration,handle);
      stats=
        detailScope?.userInfo?.stats||
        detailScope?.stats||
        null;
    }

    if(!user){
      const sigi=parseScriptJson('SIGI_STATE');
      if(sigi){
        user=findTikTokUserObject(sigi,handle);
        const uid=String(user?.id||user?.uid||'');
        stats=
          sigi?.UserModule?.stats?.[handle]||
          sigi?.UserModule?.stats?.[uid]||
          null;
      }
    }

    if(user){
      const avatar=firstTikTokAssetUrl(
        user?.avatarLarger||
        user?.avatarMedium||
        user?.avatarThumb||
        user?.avatarUri
      );
      return {
        secUid:String(user?.secUid||user?.sec_uid||''),
        userId:String(user?.id||user?.uid||user?.userId||''),
        roomId:String(user?.roomId||user?.room_id||''),
        nickname:String(user?.nickname||user?.nickName||''),
        avatar,
        followerCount:Number(stats?.followerCount||stats?.follower_count||0),
        followingCount:Number(stats?.followingCount||stats?.following_count||0),
        heartCount:Number(stats?.heartCount||stats?.heart||stats?.diggCount||0),
        videoCount:Number(stats?.videoCount||stats?.video_count||0),
        videoId:''
      };
    }

    const pick=(patterns)=>{
      for(const re of patterns){
        const m=html.match(re);
        if(m?.[1])return String(m[1]).replace(/\\u002F/g,'/').replace(/\\u0026/g,'&');
      }
      return '';
    };
    const secUid=pick([
      /"secUid":"([^"]+)"/,
      /"sec_uid":"([^"]+)"/,
      /\\"secUid\\":\\"([^"]+)\\"/
    ]);
    const userId=pick([
      /"id":"(\d{6,30})","shortId"/,
      /"uid":"(\d{6,30})"/,
      /"userId":"(\d{6,30})"/
    ]);
    const roomId=pick([
      /"roomId":"?(\d{8,30})"?/,
      /"room_id":"?(\d{8,30})"?/,
      /"liveRoomId":"?(\d{8,30})"?/,
      /\\"roomId\\":\\"?(\d{8,30})/
    ]);
    const nickname=pick([
      /"nickname":"([^"]+)"/,
      /\\"nickname\\":\\"([^"]+)\\"/
    ]);
    const avatar=pick([
      /"avatarLarger":"([^"]+)"/,
      /"avatarMedium":"([^"]+)"/,
      /\\"avatarLarger\\":\\"([^"]+)\\"/
    ]);
    const safeHandle=handle.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
    const videoId=pick([
      new RegExp('https?:\\\\/\\\\/www\\\\.tiktok\\\\.com\\\\/@'+safeHandle+'\\\\/video\\\\/(\\\\d{8,})','i'),
      new RegExp('\\\\/@'+safeHandle+'\\\\/video\\\\/(\\\\d{8,})','i')
    ]);

    const followerCount=Number(pick([/"followerCount":(\d+)/,/"follower_count":(\d+)/])||0);
    const followingCount=Number(pick([/"followingCount":(\d+)/,/"following_count":(\d+)/])||0);
    const heartCount=Number(pick([/"heartCount":(\d+)/,/"heart":(\d+)/])||0);
    const videoCount=Number(pick([/"videoCount":(\d+)/,/"video_count":(\d+)/])||0);
    return {secUid,userId,roomId,nickname,avatar,videoId,followerCount,followingCount,heartCount,videoCount};
  }catch(error){
    console.warn('[tiktok-profile] html identity failed',handle,compactText(error?.message||error,220));
    return {secUid:'',userId:'',roomId:'',nickname:'',avatar:'',videoId:''};
  }
}

async function getTikTokClientAccessToken(){
  if(!TIKTOK_CLIENT_KEY||!TIKTOK_CLIENT_SECRET)return '';
  if(tiktokOfficialIdentityDisabledUntil>Date.now())return '';
  if(tiktokClientAccessToken&&tiktokClientAccessTokenExpiresAt>Date.now()+60_000){
    return tiktokClientAccessToken;
  }

  try{
    const body=new URLSearchParams({
      client_key:TIKTOK_CLIENT_KEY,
      client_secret:TIKTOK_CLIENT_SECRET,
      grant_type:'client_credentials'
    });
    const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body,
      signal:AbortSignal.timeout(7000)
    });
    const data=await r.json().catch(()=>({}));
    const token=String(data?.access_token||'');
    if(!r.ok||!token){
      if([400,401,403,429].includes(r.status)){
        tiktokOfficialIdentityDisabledUntil=Date.now()+10*60*1000;
      }
      throw new Error('tiktok_client_token_'+r.status+':'+compactText(data?.error_description||data?.error||'',120));
    }
    tiktokClientAccessToken=token;
    tiktokClientAccessTokenExpiresAt=Date.now()+Math.max(60,Number(data?.expires_in||7200))*1000;
    return token;
  }catch(error){
    console.warn('[tiktok-official] client token unavailable',compactText(error?.message||error,180));
    return '';
  }
}

async function fetchTikTokOfficialProfileIdentity(handle){
  if(tiktokOfficialIdentityDisabledUntil>Date.now())return null;
  const token=await getTikTokClientAccessToken();
  if(!token)return null;

  try{
    const r=await fetch(
      'https://open.tiktokapis.com/v2/research/user/info/?fields=display_name,avatar_url,follower_count,following_count,likes_count,video_count',
      {
        method:'POST',
        headers:{
          authorization:'Bearer '+token,
          'content-type':'application/json'
        },
        body:JSON.stringify({username:handle}),
        signal:AbortSignal.timeout(7000)
      }
    );
    const body=await r.json().catch(()=>({}));
    if(!r.ok){
      if([401,403].includes(r.status)){
        // Client credentials are valid, but arbitrary profile lookup requires
        // Research API access. Back off and use the public-profile fallback.
        tiktokOfficialIdentityDisabledUntil=Date.now()+30*60*1000;
      }
      console.warn('[tiktok-official] identity unavailable',handle,r.status,compactText(body?.error?.message||body?.error||'',140));
      return null;
    }

    const row=body?.data?.user||body?.data||body?.user||{};
    const nickname=String(row?.display_name||row?.displayName||'');
    const avatar=String(row?.avatar_url||row?.avatarUrl||'');
    if(!nickname&&!avatar)return null;
    return {
      nickname,
      avatar,
      followerCount:Number(row?.follower_count||row?.followerCount||0),
      followingCount:Number(row?.following_count||row?.followingCount||0),
      heartCount:Number(row?.likes_count||row?.likesCount||0),
      videoCount:Number(row?.video_count||row?.videoCount||0),
      source:'official'
    };
  }catch(error){
    console.warn('[tiktok-official] identity failed',handle,compactText(error?.message||error,140));
    return null;
  }
}

async function fetchTikTokProfileIdentity(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {secUid:'',userId:'',nickname:'',avatar:'',videoId:'',followerCount:0,followingCount:0,heartCount:0,videoCount:0,source:'none'};
  const key=handle.toLowerCase();
  const cached=tiktokProfileIdentityCache.get(key);
  if(cached&&Date.now()-Number(cached.at||0)<TIKTOK_PROFILE_IDENTITY_TTL_MS){
    return {...cached.data};
  }
  if(tiktokProfileIdentityInflight.has(key)){
    return tiktokProfileIdentityInflight.get(key);
  }

  const task=(async()=>{
    const [official,detail]=await Promise.all([
      fetchTikTokOfficialProfileIdentity(handle).catch(()=>null),
      fetchTikTokUserDetail(handle).catch(()=>null)
    ]);

    let scraped=null;
    if(!detail?.secUid||(!official?.nickname&&!detail?.nickname)||(!official?.avatar&&!detail?.avatar)){
      scraped=await fetchTikTokProfileIdentityScraped(handle);
    }

    const data={
      secUid:String(detail?.secUid||scraped?.secUid||''),
      userId:String(detail?.userId||scraped?.userId||''),
      roomId:String(detail?.roomId||scraped?.roomId||''),
      nickname:String(official?.nickname||detail?.nickname||scraped?.nickname||''),
      avatar:String(official?.avatar||detail?.avatar||scraped?.avatar||''),
      bio:String(detail?.bio||scraped?.bio||''),
      verified:Boolean(detail?.verified??scraped?.verified??false),
      videoId:String(scraped?.videoId||''),
      followerCount:Number(official?.followerCount||detail?.followerCount||scraped?.followerCount||0),
      followingCount:Number(official?.followingCount||detail?.followingCount||scraped?.followingCount||0),
      heartCount:Number(official?.heartCount||detail?.heartCount||scraped?.heartCount||0),
      videoCount:Number(official?.videoCount||detail?.videoCount||scraped?.videoCount||0),
      source:official?'official':(detail?'user-detail':'profile')
    };
    tiktokProfileIdentityCache.set(key,{at:Date.now(),data});
    return {...data};
  })().finally(()=>tiktokProfileIdentityInflight.delete(key));

  tiktokProfileIdentityInflight.set(key,task);
  return task;
}

async function browserTikTokProfileIdentities(handles){
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,120);
  const out=new Map();
  if(!normalized.length)return out;

  let page=null;
  try{
    const browser=await getBrowser();
    page=await browser.newPage();
    await page.setViewport({width:1000,height:700,deviceScaleFactor:1});
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});

    const stored=await loadSession('tiktok').catch(()=>null);
    const cookies=cookieParams(stored?.state?.cookies||[]);
    if(cookies.length)await page.setCookie(...cookies).catch(()=>{});

    await page.goto('https://www.tiktok.com/robots.txt',{
      waitUntil:'domcontentloaded',
      timeout:10_000
    }).catch(()=>{});
    await sleep(250);

    const rows=await page.evaluate(async list=>{
      const result=new Array(list.length);
      let cursor=0;
      const firstUrl=value=>{
        if(!value)return '';
        if(typeof value==='string')return value;
        if(Array.isArray(value)){
          for(const item of value){
            const url=firstUrl(item);
            if(url)return url;
          }
          return '';
        }
        if(typeof value==='object'){
          for(const key of ['urlList','url_list','url','uri']){
            const url=firstUrl(value[key]);
            if(url)return url;
          }
        }
        return '';
      };
      const worker=async()=>{
        while(true){
          const index=cursor++;
          if(index>=list.length)return;
          const handle=list[index];
          try{
            const url='/api/user/detail/?aid=1988&uniqueId='+encodeURIComponent(handle);
            const r=await fetch(url,{
              method:'GET',
              credentials:'include',
              headers:{accept:'application/json,text/plain,*/*'}
            });
            if(!r.ok){
              result[index]={handle,ok:false,http:r.status};
              continue;
            }
            const body=await r.json();
            const info=body?.userInfo||body?.data?.userInfo||null;
            const user=info?.user||body?.data?.user||null;
            const stats=info?.stats||body?.data?.stats||null;
            if(!user){
              result[index]={handle,ok:false};
              continue;
            }
            result[index]={
              handle,
              ok:true,
              secUid:String(user?.secUid||user?.sec_uid||''),
              userId:String(user?.id||user?.uid||''),
              roomId:String(user?.roomId||user?.room_id||''),
              nickname:String(user?.nickname||''),
              avatar:firstUrl(user?.avatarLarger||user?.avatarMedium||user?.avatarThumb),
              followerCount:Number(stats?.followerCount||stats?.follower_count||0),
              followingCount:Number(stats?.followingCount||stats?.following_count||0),
              heartCount:Number(stats?.heartCount||stats?.heart||0),
              videoCount:Number(stats?.videoCount||stats?.video_count||0)
            };
          }catch(error){
            result[index]={handle,ok:false,error:String(error?.message||error||'profile_failed')};
          }
        }
      };
      await Promise.all(Array.from({length:Math.min(5,list.length)},()=>worker()));
      return result;
    },normalized);

    let okCount=0;
    for(const row of Array.isArray(rows)?rows:[]){
      const handle=normalizeTikTokHandle(row?.handle||'');
      if(!handle||!row?.ok)continue;
      const data={
        secUid:String(row.secUid||''),
        userId:String(row.userId||''),
        roomId:String(row.roomId||''),
        nickname:String(row.nickname||''),
        avatar:String(row.avatar||''),
        followerCount:Number(row.followerCount||0),
        followingCount:Number(row.followingCount||0),
        heartCount:Number(row.heartCount||0),
        videoCount:Number(row.videoCount||0),
        videoId:'',
        source:'browser-user-detail'
      };
      out.set(handle.toLowerCase(),data);
      tiktokProfileIdentityCache.set(handle.toLowerCase(),{at:Date.now(),data});
      okCount+=1;
    }
    console.log('[tiktok-browser-profile]','total='+normalized.length,'ok='+okCount,'miss='+(normalized.length-okCount));
  }catch(error){
    console.warn('[tiktok-browser-profile] failed',compactText(error?.message||error,180));
  }finally{
    if(page)await page.close().catch(()=>{});
  }
  return out;
}

async function fetchTikwmProfileIdentity(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return null;
  return enqueueTikwmApi(async()=>{
    try{
      const body=new URLSearchParams({unique_id:handle});
      const r=await fetch('https://www.tikwm.com/api/user/info/',{
        method:'POST',
        headers:{
          'content-type':'application/x-www-form-urlencoded',
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'accept':'application/json,text/plain,*/*',
          'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5'
        },
        body,
        redirect:'follow',
        signal:AbortSignal.timeout(8000)
      });
      if(!r.ok){
        console.log('[tikwm-profile]',handle,'http='+r.status);
        return null;
      }
      const json=await r.json();
      if(Number(json?.code)!==0){
        console.log('[tikwm-profile]',handle,'code='+String(json?.code||'unknown'),compactText(json?.msg||'',100));
        return null;
      }
      const data=json?.data||{};
      const info=data?.userInfo||{};
      const user=info?.user||data?.user||{};
      const stats=info?.stats||data?.stats||{};
      const nickname=String(user?.nickname||user?.nickName||'');
      const avatar=firstTikTokAssetUrl(
        user?.avatarLarger||
        user?.avatarMedium||
        user?.avatarThumb||
        user?.avatar_300x300||
        user?.avatar_168x168
      );
      if(!nickname&&!avatar)return null;
      return {
        secUid:String(user?.secUid||user?.sec_uid||''),
        userId:String(user?.id||user?.uid||user?.userId||''),
        nickname,
        avatar,
        bio:String(user?.signature||user?.bio||''),
        verified:Boolean(user?.verified),
        followerCount:Number(stats?.followerCount||stats?.follower_count||user?.follower_count||0),
        followingCount:Number(stats?.followingCount||stats?.following_count||user?.following_count||0),
        heartCount:Number(stats?.heartCount||stats?.heart||stats?.diggCount||user?.total_favorited||0),
        videoCount:Number(stats?.videoCount||stats?.video_count||user?.aweme_count||0),
        videoId:'',
        source:'tikwm'
      };
    }catch(error){
      console.log('[tikwm-profile]',handle,'failed',compactText(error?.message||error,120));
      return null;
    }
  });
}

async function fetchTikTokUserDetail(handle){
  try{
    const endpoint=new URL('https://www.tiktok.com/api/user/detail/');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('uniqueId',handle);
    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle,
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(4000)
    });
    if(!r.ok)return null;
    const body=await r.json();
    const info=body?.userInfo||body?.data?.userInfo||null;
    const user=
      info?.user||
      body?.data?.user||
      null;
    const stats=
      info?.stats||
      body?.data?.stats||
      null;
    if(!user)return null;
    return {
      secUid:String(user?.secUid||user?.sec_uid||''),
      userId:String(user?.id||user?.uid||''),
      roomId:String(user?.roomId||user?.room_id||''),
      nickname:String(user?.nickname||''),
      avatar:firstTikTokAssetUrl(user?.avatarLarger||user?.avatarMedium||user?.avatarThumb),
      bio:String(user?.signature||''),
      verified:Boolean(user?.verified),
      followerCount:Number(stats?.followerCount||stats?.follower_count||0),
      followingCount:Number(stats?.followingCount||stats?.following_count||0),
      heartCount:Number(stats?.heartCount||stats?.heart||0),
      videoCount:Number(stats?.videoCount||stats?.video_count||0)
    };
  }catch{
    return null;
  }
}

function firstTikTokAssetUrl(value){
  if(!value)return '';
  if(typeof value==='string')return value;
  if(Array.isArray(value)){
    for(const item of value){
      const url=firstTikTokAssetUrl(item);
      if(url)return url;
    }
    return '';
  }
  if(typeof value==='object'){
    for(const key of ['urlList','url_list','url','uri']){
      const url=firstTikTokAssetUrl(value[key]);
      if(url)return url;
    }
  }
  return '';
}

function normalizeTikTokPostItem(handle,row){
  const id=String(row?.id||row?.itemId||row?.aweme_id||'').trim();
  if(!/^\d{8,}$/.test(id))return null;
  const stats=row?.stats||row?.statistics||{};
  const video=row?.video||{};
  return {
    id,
    handle,
    url:'https://www.tiktok.com/@'+handle+'/video/'+id,
    title:String(row?.desc||row?.title||row?.description||'').slice(0,300),
    createTime:Number(row?.createTime||row?.create_time||0),
    duration:Number(video?.duration||row?.duration||0),
    cover:firstTikTokAssetUrl(video?.cover||video?.originCover||video?.dynamicCover||row?.cover),
    playCount:Number(stats?.playCount||stats?.play_count||0),
    diggCount:Number(stats?.diggCount||stats?.digg_count||0),
    commentCount:Number(stats?.commentCount||stats?.comment_count||0),
    shareCount:Number(stats?.shareCount||stats?.share_count||0),
    collectCount:Number(stats?.collectCount||stats?.collect_count||stats?.bookmarkCount||0),
    playUrl:firstTikTokAssetUrl(
      row?.play||
      row?.playUrl||
      row?.play_url||
      video?.playAddr||
      video?.play_addr||
      video?.downloadAddr||
      video?.download_addr
    ),
    width:Number(video?.width||row?.width||0),
    height:Number(video?.height||row?.height||0)
  };
}

function seedTikTokVideoSource(rawHandle,video){
  const handle=normalizeTikTokHandle(rawHandle);
  const id=String(video?.id||video?.video_id||'').trim();
  const url=String(video?.playUrl||video?.play_url||'').trim();
  if(!handle||!/^[0-9]{8,}$/.test(id)||!/^https?:\/\//i.test(url))return false;
  // Flat playlist rows can contain the TikTok webpage URL; only cache real media/CDN URLs.
  if(/tiktok\.com\/@[^/]+\/video\//i.test(url))return false;
  const key=handle.toLowerCase()+':'+id;
  const prev=tiktokVideoSourceCache.get(key);
  if(prev?.url===url&&Date.now()-Number(prev.at||0)<TIKTOK_VIDEO_SOURCE_TTL_MS)return true;
  tiktokVideoSourceCache.set(key,{
    at:Date.now(),
    handle,
    id,
    url,
    ext:'mp4',
    mime:'',
    headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'referer':'https://www.tiktok.com/@'+handle
    },
    width:Number(video?.width||0),
    height:Number(video?.height||0),
    duration:Number(video?.duration||0),
    source:'library-play-url'
  });
  return true;
}

function tiktokVideoMaterial(row){
  return JSON.stringify([
    String(row?.secUid||''),
    (Array.isArray(row?.videos)?row.videos:[]).map(video=>[
      String(video?.id||''),
      String(video?.title||''),
      Number(video?.createTime||0)
    ])
  ]);
}

function updateTikTokVideoLibrary(rawHandle,patch={}){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  const now=Date.now();
  const prev=tiktokVideoLibrary.get(key)||{
    handle,secUid:'',latestVideoId:'',videos:[],checkedAt:0,changedAt:0,status:'unknown'
  };
  const next={...prev,...patch,handle};
  next.videos=Array.isArray(next.videos)?next.videos.slice(0,TIKTOK_VIDEO_PER_CHANNEL):[];
  next.latestVideoId=String(next.videos?.[0]?.id||next.latestVideoId||'');
  const changed=tiktokVideoMaterial(prev)!==tiktokVideoMaterial(next);
  if(changed){
    next.changedAt=now;
    tiktokVideoPackageVersion+=1;
    tiktokVideoPackageUpdatedAt=now;
  }
  tiktokVideoLibrary.set(key,next);
  return changed;
}

async function browserTikTokChannelVideos(rawHandle,knownSecUid='',count=TIKTOK_VIDEO_PER_CHANNEL){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  let resolvedSecUid=String(knownSecUid||'').trim();
  if(!resolvedSecUid){
    try{
      const identity=await fetchTikwmProfileIdentity(handle);
      resolvedSecUid=String(identity?.secUid||'').trim();
    }catch{}
  }
  if(!resolvedSecUid){
    try{
      const scraped=await fetchTikTokProfileIdentityScraped(handle);
      resolvedSecUid=String(scraped?.secUid||'').trim();
    }catch{}
  }

  let page=null;
  try{
    const browser=await getBrowser();
    page=await browser.newPage();
    await page.setViewport({width:1100,height:760,deviceScaleFactor:1});
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5'});

    const stored=await loadSession('tiktok').catch(()=>null);
    const cookies=cookieParams(stored?.state?.cookies||[]);
    if(cookies.length)await page.setCookie(...cookies).catch(()=>{});

    // Static same-origin page avoids TikTok SPA redirects destroying evaluate().
    await page.goto('https://www.tiktok.com/robots.txt',{
      waitUntil:'domcontentloaded',
      timeout:10_000
    }).catch(()=>{});
    await sleep(220);

    const payload=await page.evaluate(async input=>{
      const handle=input.handle;
      let secUid=String(input.secUid||'');
      const count=Math.max(1,Math.min(20,Number(input.count)||10));

      const safeJson=async response=>{
        try{return await response.json()}catch{return null}
      };

      if(!secUid){
        try{
          const u='/api/user/detail/?aid=1988&uniqueId='+encodeURIComponent(handle);
          const r=await fetch(u,{
            method:'GET',
            credentials:'include',
            headers:{accept:'application/json,text/plain,*/*'}
          });
          if(r.ok){
            const body=await safeJson(r);
            const info=body?.userInfo||body?.data?.userInfo||null;
            const user=info?.user||body?.data?.user||null;
            secUid=String(user?.secUid||user?.sec_uid||'');
          }
        }catch{}
      }

      if(!secUid)return {ok:false,secUid:'',items:[],error:'no_sec_uid'};

      try{
        const q=new URLSearchParams({
          aid:'1988',
          count:String(count),
          cursor:'0',
          from_page:'user',
          secUid
        });
        const r=await fetch('/api/post/item_list/?'+q.toString(),{
          method:'GET',
          credentials:'include',
          headers:{
            accept:'application/json,text/plain,*/*',
            'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5'
          }
        });
        if(!r.ok)return {ok:false,secUid,items:[],error:'http_'+r.status};
        const body=await safeJson(r);
        if(!body)return {ok:false,secUid,items:[],error:'invalid_json'};
        const items=
          (Array.isArray(body?.itemList)&&body.itemList)||
          (Array.isArray(body?.item_list)&&body.item_list)||
          (Array.isArray(body?.data?.itemList)&&body.data.itemList)||
          (Array.isArray(body?.data?.item_list)&&body.data.item_list)||
          (Array.isArray(body?.items)&&body.items)||
          [];
        return {
          ok:Array.isArray(items)&&items.length>0,
          secUid,
          items,
          hasMore:Boolean(body?.hasMore??body?.has_more),
          cursor:String(body?.cursor??body?.data?.cursor??''),
          error:Array.isArray(items)&&items.length?'':'no_items'
        };
      }catch(error){
        return {ok:false,secUid,items:[],error:String(error?.message||error||'fetch_failed')};
      }
    },{
      handle,
      secUid:resolvedSecUid,
      count:Number(count)||TIKTOK_VIDEO_PER_CHANNEL
    });

    const items=Array.isArray(payload?.items)?payload.items:[];
    const videos=items
      .map(row=>normalizeTikTokPostItem(handle,row))
      .filter(Boolean)
      .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))
      .slice(0,TIKTOK_VIDEO_PER_CHANNEL);

    console.log(
      '[tiktok-browser-videos]',
      handle,
      videos.length?'ok':'miss',
      'videos='+videos.length,
      payload?.error?compactText(payload.error,90):''
    );

    if(!videos.length){
      return {
        known:false,
        handle,
        secUid:String(payload?.secUid||resolvedSecUid||''),
        videos:[],
        error:'browser_'+String(payload?.error||'no_videos')
      };
    }

    return {
      known:true,
      handle,
      secUid:String(payload?.secUid||resolvedSecUid||''),
      videos,
      latestVideoId:String(videos[0]?.id||''),
      hasMore:Boolean(payload?.hasMore),
      cursor:String(payload?.cursor||''),
      source:'browser-user-posts'
    };
  }catch(error){
    console.warn('[tiktok-browser-videos] failed',handle,compactText(error?.message||error,150));
    return {
      known:false,handle,secUid:String(resolvedSecUid||''),videos:[],
      error:'browser_'+compactText(error?.message||error,120)
    };
  }finally{
    if(page)await page.close().catch(()=>{});
  }
}

async function browserTikTokProfileGridVideos(rawHandle,count=TIKTOK_VIDEO_PER_CHANNEL){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  let page=null;
  try{
    const browser=await getBrowser();
    page=await browser.newPage();
    await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5'});

    const stored=await loadSession('tiktok').catch(()=>null);
    const cookies=cookieParams(stored?.state?.cookies||[]);
    if(cookies.length)await page.setCookie(...cookies).catch(()=>{});

    await page.goto('https://www.tiktok.com/@'+handle,{
      waitUntil:'domcontentloaded',
      timeout:14_000
    });
    await sleep(1200);

    const result=await page.evaluate(input=>{
      const max=Math.max(1,Math.min(20,Number(input.count)||10));
      const handle=input.handle;
      const map=new Map();

      const put=(id,patch={})=>{
        id=String(id||'').trim();
        if(!/^\d{8,}$/.test(id))return;
        const prev=map.get(id)||{
          id,
          handle,
          url:'https://www.tiktok.com/@'+handle+'/video/'+id,
          title:'',
          createTime:0,
          duration:0,
          cover:'',
          playCount:0,
          diggCount:0,
          commentCount:0,
          shareCount:0,
          playUrl:'',
          width:0,
          height:0
        };
        for(const [key,value] of Object.entries(patch||{})){
          if(value!==undefined&&value!==null&&value!=='')prev[key]=value;
        }
        map.set(id,prev);
      };

      // 1) Visible profile grid is the most robust source of video IDs.
      for(const a of document.querySelectorAll('a[href*="/video/"]')){
        const href=String(a.getAttribute('href')||a.href||'');
        const m=href.match(/\/video\/(\d{8,})/);
        if(!m)continue;
        const img=a.querySelector('img');
        const title=
          String(a.getAttribute('aria-label')||'').trim()||
          String(img?.getAttribute('alt')||'').trim()||
          '';
        const cover=String(img?.currentSrc||img?.src||'').trim();
        put(m[1],{title,cover});
        if(map.size>=max)break;
      }

      // 2) Enrich from TikTok hydration scripts when available.
      const parseScript=id=>{
        const el=document.getElementById(id);
        if(!el)return null;
        try{return JSON.parse(el.textContent||'')}catch{return null}
      };
      const roots=[
        parseScript('__UNIVERSAL_DATA_FOR_REHYDRATION__'),
        parseScript('SIGI_STATE')
      ].filter(Boolean);

      const seen=new Set();
      const walk=value=>{
        if(!value||typeof value!=='object'||seen.has(value))return;
        seen.add(value);
        if(Array.isArray(value)){
          for(const item of value)walk(item);
          return;
        }

        const id=String(value?.id||value?.itemId||value?.aweme_id||'');
        const video=value?.video||{};
        const stats=value?.stats||value?.statistics||{};
        if(/^\d{8,}$/.test(id)&&(value?.video||value?.desc||value?.title||value?.aweme_id)){
          const firstUrl=v=>{
            if(!v)return '';
            if(typeof v==='string')return v;
            if(Array.isArray(v)){
              for(const x of v){const y=firstUrl(x);if(y)return y;}
              return '';
            }
            if(typeof v==='object'){
              for(const k of ['urlList','url_list','url','uri']){
                const y=firstUrl(v[k]);if(y)return y;
              }
            }
            return '';
          };
          put(id,{
            title:String(value?.desc||value?.title||value?.description||'').slice(0,300),
            createTime:Number(value?.createTime||value?.create_time||0),
            duration:Number(video?.duration||value?.duration||0),
            cover:firstUrl(video?.cover||video?.originCover||video?.dynamicCover||value?.cover),
            playCount:Number(stats?.playCount||stats?.play_count||0),
            diggCount:Number(stats?.diggCount||stats?.digg_count||0),
            commentCount:Number(stats?.commentCount||stats?.comment_count||0),
            shareCount:Number(stats?.shareCount||stats?.share_count||0),
            playUrl:firstUrl(video?.playAddr||video?.play_addr||video?.downloadAddr||video?.download_addr),
            width:Number(video?.width||0),
            height:Number(video?.height||0)
          });
        }

        for(const child of Object.values(value))walk(child);
      };
      for(const root of roots)walk(root);

      return {
        title:document.title,
        videos:[...map.values()].slice(0,max)
      };
    },{handle,count});

    const videos=(Array.isArray(result?.videos)?result.videos:[])
      .map(row=>normalizeTikTokPostItem(handle,{
        id:row.id,
        desc:row.title,
        createTime:row.createTime,
        duration:row.duration,
        cover:row.cover,
        play:row.playUrl,
        width:row.width,
        height:row.height,
        stats:{
          playCount:row.playCount,
          diggCount:row.diggCount,
          commentCount:row.commentCount,
          shareCount:row.shareCount
        }
      }))
      .filter(Boolean)
      .slice(0,TIKTOK_VIDEO_PER_CHANNEL);

    console.log(
      '[tiktok-profile-grid]',
      handle,
      videos.length?'ok':'miss',
      'videos='+videos.length,
      compactText(result?.title||'',80)
    );

    if(!videos.length){
      return {known:false,handle,secUid:'',videos:[],error:'profile_grid_no_videos'};
    }

    return {
      known:true,
      handle,
      secUid:'',
      videos,
      latestVideoId:String(videos[0]?.id||''),
      hasMore:false,
      cursor:'',
      source:'browser-profile-grid'
    };
  }catch(error){
    console.warn('[tiktok-profile-grid] failed',handle,compactText(error?.message||error,150));
    return {
      known:false,handle,secUid:'',videos:[],
      error:'profile_grid_'+compactText(error?.message||error,120)
    };
  }finally{
    if(page)await page.close().catch(()=>{});
  }
}

async function fetchTikwmChannelVideos(rawHandle,count=TIKTOK_VIDEO_PER_CHANNEL){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  return enqueueTikwmApi(async()=>{
    try{
      const endpoint=new URL('https://tikwm.com/api/user/posts');
      endpoint.searchParams.set('unique_id',handle);
      endpoint.searchParams.set('count',String(Math.max(1,Math.min(10,Number(count)||10))));
      endpoint.searchParams.set('cursor','0');

      const r=await fetch(endpoint,{
        method:'GET',
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'accept':'application/json,text/plain,*/*',
          'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5'
        },
        redirect:'follow',
        signal:AbortSignal.timeout(10_000)
      });
      if(!r.ok){
        console.log('[tikwm-videos]',handle,'http='+r.status);
        return {known:false,handle,secUid:'',videos:[],error:'tikwm_http_'+r.status};
      }

      const json=await r.json();
      if(Number(json?.code)!==0){
        console.log('[tikwm-videos]',handle,'code='+String(json?.code||'unknown'),compactText(json?.msg||'',120));
        return {known:false,handle,secUid:'',videos:[],error:'tikwm_'+String(json?.msg||json?.code||'error')};
      }

      const data=json?.data||{};
      const author=data?.user||data?.author||{};
      const rows=
        (Array.isArray(data?.videos)&&data.videos)||
        (Array.isArray(data?.items)&&data.items)||
        [];

      const videos=rows
        .map(row=>normalizeTikTokPostItem(handle,{
          id:row?.video_id||row?.aweme_id||row?.id,
          desc:row?.title||row?.desc||row?.description,
          createTime:row?.create_time||row?.createTime||row?.create_time_ms||0,
          duration:row?.duration||0,
          cover:row?.cover||row?.origin_cover||row?.ai_dynamic_cover,
          play:row?.play||row?.wmplay||row?.hdplay,
          width:row?.width||0,
          height:row?.height||0,
          stats:{
            playCount:row?.play_count||row?.playCount||row?.views||0,
            diggCount:row?.digg_count||row?.diggCount||row?.likes||0,
            commentCount:row?.comment_count||row?.commentCount||row?.comment||0,
            shareCount:row?.share_count||row?.shareCount||row?.share||0
          }
        }))
        .filter(Boolean)
        .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))
        .slice(0,TIKTOK_VIDEO_PER_CHANNEL);

      if(!videos.length){
        return {known:false,handle,secUid:'',videos:[],error:'tikwm_no_videos'};
      }

      return {
        known:true,
        handle,
        secUid:String(author?.sec_uid||author?.secUid||''),
        videos,
        latestVideoId:String(videos[0]?.id||''),
        hasMore:Boolean(data?.hasMore??data?.has_more),
        cursor:String(data?.cursor||''),
        source:'tikwm-user-posts'
      };
    }catch(error){
      return {
        known:false,handle,secUid:'',videos:[],
        error:'tikwm_'+compactText(error?.message||error,140)
      };
    }
  });
}

async function mergeDetailedTikTokVideoMetadata(handle,id,row,{persist=true}={}){
  if(!row||typeof row!=='object')return false;
  const normalized=normalizeTikTokPostItem(handle,{
    id,
    desc:row?.title||row?.description||row?.fulltitle||'',
    createTime:row?.timestamp||row?.release_timestamp||0,
    duration:row?.duration||0,
    cover:firstTikTokAssetUrl(row?.thumbnail||row?.thumbnails||''),
    width:row?.width||row?.requested_downloads?.[0]?.width||0,
    height:row?.height||row?.requested_downloads?.[0]?.height||0,
    stats:{
      playCount:row?.view_count||0,
      diggCount:row?.like_count||0,
      commentCount:row?.comment_count||0,
      shareCount:row?.repost_count||0,
      collectCount:row?.bookmark_count||row?.collect_count||0
    }
  });
  if(!normalized)return false;

  const key=handle.toLowerCase();
  const profile=tiktokProfileFromYtdlpRow(handle,row,'yt-dlp-video');
  if(profile){
    const cached=tiktokProfileIdentityCache.get(key)?.data||{};
    tiktokProfileIdentityCache.set(key,{
      at:Date.now(),
      data:mergeTikTokProfileData(handle,cached,profile)
    });
  }

  if(!tiktokCanonicalLoaded)return false;
  const merged=canonicalMergeVideo(handle,normalized);
  if(!merged)return false;
  if(persist){
    void upsertTikTokCanonicalRows([], [merged])
      .then(()=>queueTikTokCanonicalSync([handle]))
      // Keep image URLs only; do not upload image bytes to Supabase Storage.
      .catch(error=>console.log('[tiktok-video-meta] persist failed',handle,id,compactText(error?.message||error,120)));
  }
  return true;
}

async function enrichTikTokCanonicalVideo(handle,id){
  handle=normalizeTikTokHandle(handle);
  id=String(id||'').trim();
  if(!handle||!/^\d{8,}$/.test(id))return false;
  const retryKey=handle.toLowerCase()+':'+id;
  if(Date.now()<Number(tiktokCanonicalVideoEnrichRetryAt.get(retryKey)||0))return false;

  try{
    const pageUrl='https://www.tiktok.com/@'+handle+'/video/'+id;
    const text=await enqueueYtdlp(()=>execTikTokYtdlp([
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout','8',
      '--retries','1',
      '--extractor-retries','1',
      '--user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      '--add-header','Referer:https://www.tiktok.com/@'+handle,
      pageUrl
    ],{
      timeout:25_000,
      maxBuffer:10*1024*1024
    }));
    const row=JSON.parse(String(text||'{}'));
    await mergeDetailedTikTokVideoMetadata(handle,id,row,{persist:true});
    tiktokCanonicalVideoEnrichRetryAt.set(retryKey,Date.now()+24*60*60_000);
    console.log('[tiktok-video-meta] enriched',handle,id);
    return true;
  }catch(error){
    tiktokCanonicalVideoEnrichRetryAt.set(retryKey,Date.now()+2*60*60_000);
    console.log('[tiktok-video-meta] failed',handle,id,compactText(error?.stderr||error?.message||error,120));
    return false;
  }
}

async function enrichNextTikTokCanonicalVideo(){
  if(tiktokCanonicalVideoEnrichBusy||!tiktokCanonicalLoaded)return false;
  const selected=new Set([...tiktokLiveSelectedHandles].map(x=>x.toLowerCase()));
  const candidates=[...tiktokCanonicalVideos.values()]
    .filter(row=>selected.has(String(row.handle||'').toLowerCase()))
    .filter(row=>
      !row.cover_source_url||
      !row.play_count||
      !row.digg_count||
      !row.comment_count||
      !row.share_count
    )
    .sort((a,b)=>Number(b.create_time||0)-Number(a.create_time||0));

  const row=candidates.find(row=>{
    const key=String(row.handle||'').toLowerCase()+':'+String(row.video_id||'');
    return Date.now()>=Number(tiktokCanonicalVideoEnrichRetryAt.get(key)||0);
  });
  if(!row)return false;

  tiktokCanonicalVideoEnrichBusy=true;
  try{
    return await enrichTikTokCanonicalVideo(row.handle,row.video_id);
  }finally{
    tiktokCanonicalVideoEnrichBusy=false;
  }
}

async function pruneTikTokVideoFileCache({force=false}={}){
  const now=Date.now();
  if(!force&&now-tiktokVideoFileLastPruneAt<TIKTOK_VIDEO_FILE_PRUNE_MS)return 0;
  if(tiktokVideoFilePrunePromise)return tiktokVideoFilePrunePromise;
  tiktokVideoFileLastPruneAt=now;

  const task=(async()=>{
    await mkdir(TIKTOK_VIDEO_FILE_CACHE_DIR,{recursive:true});
    const keep=new Set();
    let removed=0;

    for(const [key,row] of tiktokVideoFileCache.entries()){
      const fresh=Boolean(row?.path)&&now-Number(row?.at||0)<TIKTOK_VIDEO_FILE_TTL_MS;
      if(fresh){
        try{
          const info=await stat(row.path);
          if(info.size>1024){
            keep.add(row.path);
            continue;
          }
        }catch{}
      }
      tiktokVideoFileCache.delete(key);
      if(row?.path){
        const ok=await unlink(row.path).then(()=>true).catch(()=>false);
        if(ok)removed+=1;
      }
    }

    const entries=await readdir(TIKTOK_VIDEO_FILE_CACHE_DIR,{withFileTypes:true}).catch(()=>[]);
    for(const entry of entries){
      if(!entry?.isFile?.())continue;
      const path=join(TIKTOK_VIDEO_FILE_CACHE_DIR,entry.name);
      if(keep.has(path))continue;
      try{
        const info=await stat(path);
        if(now-Number(info.mtimeMs||0)<TIKTOK_VIDEO_FILE_TTL_MS)continue;
        await unlink(path);
        removed+=1;
      }catch{}
    }

    if(removed)console.log('[tiktok-video-file] pruned','files='+removed);
    return removed;
  })().finally(()=>{tiktokVideoFilePrunePromise=null;});

  tiktokVideoFilePrunePromise=task;
  return task;
}

async function downloadTikTokVideoFile(rawHandle,rawId,{force=false}={}){
  const handle=normalizeTikTokHandle(rawHandle);
  const id=String(rawId||'').trim();
  if(!handle||!/^[0-9]{8,}$/.test(id))throw new Error('invalid_tiktok_video');
  await pruneTikTokVideoFileCache().catch(()=>0);
  const key=handle.toLowerCase()+':'+id;
  if(force){
    const prev=tiktokVideoFileCache.get(key);
    tiktokVideoFileCache.delete(key);
    if(prev?.path)void unlink(prev.path).catch(()=>{});
  }
  const cached=tiktokVideoFileCache.get(key);
  if(cached?.path&&Date.now()-Number(cached.at||0)<TIKTOK_VIDEO_FILE_TTL_MS){
    try{
      const info=await stat(cached.path);
      if(info.size>1024)return {...cached,size:info.size};
    }catch{}
  }
  if(cached){
    tiktokVideoFileCache.delete(key);
    if(cached?.path)await unlink(cached.path).catch(()=>{});
  }
  const inflight=tiktokVideoFileInflight.get(key);
  if(inflight)return inflight;

  const task=(async()=>{
    await mkdir(TIKTOK_VIDEO_FILE_CACHE_DIR,{recursive:true});
    const path=join(TIKTOK_VIDEO_FILE_CACHE_DIR,handle.replace(/[^A-Za-z0-9._-]/g,'_')+'-'+id+'-'+Date.now()+'.mp4');
    const pageUrl='https://www.tiktok.com/@'+handle+'/video/'+id;
    try{
      // Playback downloads must not wait behind background discovery jobs.
      // execTikTokYtdlp is safe to run independently because each invocation
      // gets its own temporary cookie file.
      await execTikTokYtdlp([
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout','10',
        '--retries','2',
        '--extractor-retries','1',
        '--format','best[ext=mp4]/best',
        '--output',path,
        '--user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        '--add-header','Referer:https://www.tiktok.com/@'+handle,
        pageUrl
      ],{timeout:60_000,maxBuffer:4*1024*1024});
      const info=await stat(path);
      if(info.size<=1024)throw new Error('tiktok_video_file_empty');
      const row={at:Date.now(),handle,id,path,size:info.size,source:'yt-dlp-file'};
      tiktokVideoFileCache.set(key,row);
      console.log('[tiktok-video-file]',handle,id,'ready','bytes='+info.size);
      return row;
    }catch(error){
      await unlink(path).catch(()=>{});
      throw error;
    }
  })().finally(()=>tiktokVideoFileInflight.delete(key));

  tiktokVideoFileInflight.set(key,task);
  return task;
}

async function serveTikTokVideoFile(req,res,file){
  const info=await stat(file.path);
  const size=Number(info.size||file.size||0);
  if(!size)throw new Error('tiktok_video_file_empty');
  let start=0;
  let end=size-1;
  let status=200;
  const rawRange=String(req.headers.range||'').trim();
  const match=rawRange.match(/^bytes=(\d*)-(\d*)$/i);
  if(match){
    if(match[1])start=Math.min(size-1,Math.max(0,Number(match[1])||0));
    if(match[2])end=Math.min(size-1,Math.max(start,Number(match[2])||0));
    status=206;
  }
  const length=end-start+1;
  const headers={
    'content-type':'video/mp4',
    'content-length':String(length),
    'accept-ranges':'bytes',
    'access-control-allow-origin':ORIGIN,
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'range',
    'access-control-expose-headers':'content-length,content-range,accept-ranges,content-type',
    'cache-control':'private, max-age=300',
    'x-accel-buffering':'no'
  };
  if(status===206)headers['content-range']='bytes '+start+'-'+end+'/'+size;
  res.writeHead(status,headers);
  await new Promise((resolve,reject)=>{
    const stream=createReadStream(file.path,{start,end});
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      res.off('close',onClose);
      resolve();
    };
    const fail=error=>{
      if(settled)return;
      settled=true;
      res.off('close',onClose);
      reject(error);
    };
    const onClose=()=>{
      // Only abort when the response/client connection actually closes.
      // req.close can fire after the request body is complete and was
      // prematurely killing valid MP4 range streams.
      if(!res.writableEnded){
        try{stream.destroy();}catch{}
      }
    };
    stream.on('error',fail);
    stream.on('end',finish);
    res.on('close',onClose);
    stream.pipe(res,{end:true});
  });
  return {ok:true,status};
}

function tiktokVideoSourceReusable(row){
  if(!row?.url||!row?.at)return false;
  if(Date.now()-Number(row.at||0)>=TIKTOK_VIDEO_SOURCE_TTL_MS)return false;
  const expiresAt=tiktokStreamExpiresAt(row.url);
  if(expiresAt&&expiresAt-Date.now()<60_000)return false;
  return true;
}
function lookupTikTokVideoSourceFast(rawHandle,rawId){
  const handle=normalizeTikTokHandle(rawHandle);
  const id=String(rawId||'').trim();
  if(!handle||!/^[0-9]{8,}$/.test(id))return null;
  const key=handle.toLowerCase()+':'+id;

  if(tiktokCanonicalLoaded){
    const stored=tiktokCanonicalVideos.get(id);
    if(stored&&String(stored.handle||'').toLowerCase()===handle.toLowerCase()&&canonicalMp4Usable(stored)){
      const data={
        at:Date.now(),
        handle,
        id,
        url:String(stored.mp4_url||''),
        ext:'mp4',
        mime:'',
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
          'referer':'https://www.tiktok.com/@'+handle,
          'accept':'*/*',
          ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
        },
        width:Number(stored.width||0),
        height:Number(stored.height||0),
        duration:Number(stored.duration||0),
        source:String(stored.mp4_source||'library')
      };
      tiktokVideoSourceCache.set(key,data);
      return data;
    }
  }

  const cached=tiktokVideoSourceCache.get(key);
  if(cached&&tiktokVideoSourceReusable(cached))return cached;
  return null;
}

function queueTikTokVideoPriorityWarm(rawHandle,rawId,{force=false}={}){
  if(TIKTOK_UPDATES_PAUSED)return false;
  const handle=normalizeTikTokHandle(rawHandle);
  const id=String(rawId||'').trim();
  if(!handle||!/^[0-9]{8,}$/.test(id))return false;
  const key=handle.toLowerCase()+':'+id;
  const now=Date.now();

  // Even repeated clicks/errors must collapse into one background resolver job.
  if(now-Number(tiktokVideoPriorityWarmAt.get(key)||0)<15_000)return false;
  tiktokVideoPriorityWarmAt.set(key,now);

  const timer=setTimeout(()=>{
    void resolveTikTokVideoSource(handle,id,{force}).catch(error=>{
      console.log('[tiktok-video-priority-warm] failed',handle,id,compactText(error?.message||error,120));
    });
  },0);
  timer.unref?.();
  return true;
}

async function persistTikTokCanonicalMp4Source(source){
  if(!source?.handle||!source?.id||!isDirectTikTokMediaUrl(source.url))return false;
  const ext=String(source?.ext||'').toLowerCase();
  const width=Number(source?.width||0);
  const height=Number(source?.height||0);
  if(ext!=='mp4'||width<=0||height<=0){
    console.log('[tiktok-mp4-library] reject non-video',source?.handle,source?.id,ext,width+'x'+height);
    return false;
  }
  if(!tiktokCanonicalLoaded)return false;
  const row=tiktokCanonicalVideos.get(String(source.id));
  if(!row||String(row.handle||'').toLowerCase()!==String(source.handle||'').toLowerCase())return false;
  const expiresAt=tiktokStreamExpiresAt(source.url)||Date.now()+10*60_000;
  if(row.mp4_url===source.url&&canonicalMp4Usable(row,90_000))return true;
  row.mp4_url=String(source.url||'');
  row.mp4_expires_at=new Date(expiresAt).toISOString();
  row.mp4_source=String(source.source||'yt-dlp');
  row.mp4_updated_at=nowIso();
  if(width>0)row.width=Math.round(width);
  if(height>0)row.height=Math.round(height);
  if(Number(source?.duration||0)>0)row.duration=Math.round(Number(source.duration));
  row.updated_at=nowIso();
  tiktokCanonicalVideos.set(String(row.video_id),row);
  await upsertTikTokCanonicalRows([], [row]);
  await persistTikTokCanonicalPackage();
  console.log('[tiktok-mp4-library]',source.handle,source.id,'saved',row.mp4_source);
  return true;
}
async function resolveTikTokVideoSource(rawHandle,rawId,{force=false}={}){
  const handle=normalizeTikTokHandle(rawHandle);
  const id=String(rawId||'').trim();
  if(!handle||!/^[0-9]{8,}$/.test(id))throw new Error('invalid_tiktok_video');

  const key=handle.toLowerCase()+':'+id;
  if(force)tiktokVideoSourceCache.delete(key);
  if(!force&&tiktokCanonicalLoaded){
    const stored=tiktokCanonicalVideos.get(id);
    if(stored&&String(stored.handle||'').toLowerCase()===handle.toLowerCase()&&canonicalMp4Usable(stored)){
      const data={
        at:Date.now(),
        handle,
        id,
        url:String(stored.mp4_url||''),
        ext:'mp4',
        mime:'',
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
          'referer':'https://www.tiktok.com/@'+handle,
          'accept':'*/*',
          ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
        },
        width:Number(stored.width||0),
        height:Number(stored.height||0),
        duration:Number(stored.duration||0),
        source:String(stored.mp4_source||'library')
      };
      tiktokVideoSourceCache.set(key,data);
      return data;
    }
  }
  const cached=tiktokVideoSourceCache.get(key);
  if(cached&&tiktokVideoSourceReusable(cached)){
    if(tiktokCanonicalLoaded)void persistTikTokCanonicalMp4Source(cached).catch(()=>{});
    return cached;
  }

  const existing=tiktokVideoSourceInflight.get(key);
  if(existing)return existing;

  const task=(async()=>{
    const pageUrl='https://www.tiktok.com/@'+handle+'/video/'+id;
    const args=[
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout','8',
      '--retries','1',
      '--extractor-retries','1',
      '--format','best[ext=mp4]/best',
      '--user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      '--add-header','Referer:https://www.tiktok.com/@'+handle,
      pageUrl
    ];

    const out=await enqueueYtdlp(()=>execTikTokYtdlp(args,{
      timeout:30_000,
      maxBuffer:12*1024*1024
    }));
    const row=JSON.parse(String(out||'{}'));
    void mergeDetailedTikTokVideoMetadata(handle,id,row,{persist:true});

    const requested=Array.isArray(row?.requested_downloads)?row.requested_downloads[0]:null;
    const url=String(
      requested?.url||
      row?.url||
      row?.requested_formats?.find?.(x=>x?.url)?.url||
      ''
    ).trim();
    if(!url)throw new Error('tiktok_video_no_media_url');

    const headers={
      ...(requested?.http_headers||row?.http_headers||{}),
      'user-agent':
        String((requested?.http_headers||row?.http_headers||{})['User-Agent']||
               (requested?.http_headers||row?.http_headers||{})['user-agent']||
               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36'),
      'referer':
        String((requested?.http_headers||row?.http_headers||{})['Referer']||
               (requested?.http_headers||row?.http_headers||{})['referer']||
               'https://www.tiktok.com/@'+handle),
      ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
    };

    const data={
      at:Date.now(),
      handle,
      id,
      url,
      ext:String(requested?.ext||row?.ext||'mp4'),
      mime:String(requested?.protocol||row?.protocol||''),
      headers,
      width:Number(requested?.width||row?.width||0),
      height:Number(requested?.height||row?.height||0),
      duration:Number(row?.duration||0),
      source:'yt-dlp'
    };
    tiktokVideoSourceCache.set(key,data);
    await persistTikTokCanonicalMp4Source(data).catch(error=>{
      console.log('[tiktok-mp4-library] save failed',handle,id,compactText(error?.message||error,120));
    });
    console.log('[tiktok-video-source]',handle,id,'ok',data.ext,data.width+'x'+data.height);
    return data;
  })().finally(()=>tiktokVideoSourceInflight.delete(key));

  tiktokVideoSourceInflight.set(key,task);
  return task;
}

async function warmTikTokVideoSources(limit=TIKTOK_VIDEO_SOURCE_WARM_BATCH){
  if(!await loadTikTokCanonicalStore())return false;
  const rows=[...tiktokCanonicalVideos.values()]
    .filter(row=>tiktokLiveSelectedHandles.has(String(row.handle||'')))
    .sort((a,b)=>Number(b.create_time||0)-Number(a.create_time||0));
  if(!rows.length)return false;

  const candidates=[];
  for(let step=0;step<rows.length&&candidates.length<Math.max(1,limit);step++){
    const index=(tiktokVideoSourceWarmCursor+step)%rows.length;
    const row=rows[index];
    const key=String(row.handle||'').toLowerCase()+':'+String(row.video_id||'');
    const cached=tiktokVideoSourceCache.get(key);
    if(cached&&Date.now()-Number(cached.at||0)<TIKTOK_VIDEO_SOURCE_TTL_MS)continue;
    candidates.push(row);
  }
  tiktokVideoSourceWarmCursor=(tiktokVideoSourceWarmCursor+Math.max(1,candidates.length))%rows.length;
  if(!candidates.length)return true;

  const run=async()=>{
    let ok=0;
    for(const row of candidates){
      try{
        await resolveTikTokVideoSource(row.handle,row.video_id,{force:!canonicalMp4Usable(row,2*60_000)});
        ok+=1;
      }catch(error){
        console.log('[tiktok-video-warm] failed',row.handle,row.video_id,compactText(error?.message||error,100));
      }
    }
    console.log('[tiktok-video-warm] batch','ok='+ok,'total='+candidates.length);
    return ok>0;
  };
  const task=tiktokVideoSourceWarmSerial.then(run,run);
  tiktokVideoSourceWarmSerial=task.catch(()=>{});
  return task;
}

async function refreshTikTokCanonicalMp4Batch(limit=4,handles=null){
  if(!await loadTikTokCanonicalStore())return false;
  const selected=handles&&handles.length
    ? new Set(handles.map(x=>String(x).toLowerCase()))
    : new Set([...tiktokLiveSelectedHandles].map(x=>String(x).toLowerCase()));
  const rows=[...tiktokCanonicalVideos.values()]
    .filter(row=>selected.has(String(row.handle||'').toLowerCase()))
    .sort((a,b)=>Number(b.create_time||0)-Number(a.create_time||0));
  if(!rows.length)return false;
  const candidates=[];
  for(let step=0;step<rows.length&&candidates.length<Math.max(1,limit);step++){
    const index=(tiktokCanonicalMp4Cursor+step)%rows.length;
    const row=rows[index];
    if(canonicalMp4Usable(row,2*60_000))continue;
    candidates.push(row);
  }
  tiktokCanonicalMp4Cursor=(tiktokCanonicalMp4Cursor+Math.max(1,candidates.length))%rows.length;
  if(!candidates.length)return true;
  const run=async()=>{
    let ok=0;
    for(const row of candidates){
      try{
        await resolveTikTokVideoSource(row.handle,row.video_id,{force:true});
        ok+=1;
      }catch(error){
        console.log('[tiktok-mp4-refresh] failed',row.handle,row.video_id,compactText(error?.stderr||error?.message||error,120));
      }
    }
    console.log('[tiktok-mp4-refresh] batch','ok='+ok,'total='+candidates.length);
    return ok>0;
  };
  const task=tiktokCanonicalMp4RefreshSerial.then(run,run);
  tiktokCanonicalMp4RefreshSerial=task.catch(()=>{});
  return task;
}

async function fetchTikTokChannelVideosYtdlp(rawHandle,knownSecUid=''){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  let secUid=String(knownSecUid||'').trim();
  if(!secUid){
    try{
      const identity=await fetchTikwmProfileIdentity(handle);
      secUid=String(identity?.secUid||'').trim();
    }catch{}
  }
  if(!secUid){
    try{
      const scraped=await fetchTikTokProfileIdentityScraped(handle);
      secUid=String(scraped?.secUid||'').trim();
    }catch{}
  }

  const targets=[
    ...(secUid?['tiktokuser:'+secUid]:[]),
    'https://www.tiktok.com/@'+handle
  ];

  let lastError='';
  for(const target of targets){
    try{
      const args=[
        // Full entries, not flat playlist: one channel scan must return the
        // actual recent videos with thumbnails/stats/dimensions/playback URL.
        '--playlist-end',String(TIKTOK_VIDEO_PER_CHANNEL),
        '--dump-json',
        '--no-warnings',
        '--socket-timeout','8',
        '--retries','1',
        '--extractor-retries','1',
        '--format','best[ext=mp4]/best',
        '--user-agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        '--add-header','Referer:https://www.tiktok.com/@'+handle
      ];
      args.push(target);

      const text=await enqueueYtdlp(()=>execTikTokYtdlp(args,{
        timeout:25_000,
        maxBuffer:8*1024*1024
      }));

      const rows=String(text||'')
        .split(/\r?\n/)
        .map(line=>line.trim())
        .filter(Boolean)
        .map(line=>{try{return JSON.parse(line)}catch{return null}})
        .filter(Boolean);

      const first=rows[0]||{};
      if(!secUid){
        secUid=String(first?.channel_id||first?.channelId||'').trim();
      }
      const profile=tiktokProfileFromYtdlpRow(
        handle,
        first,
        target.startsWith('tiktokuser:')?'yt-dlp-tiktokuser':'yt-dlp-profile'
      );

      const videos=rows
        .map(row=>normalizeTikTokPostItem(handle,{
          id:row?.id||row?.video_id,
          desc:row?.title||row?.description,
          createTime:row?.timestamp||row?.release_timestamp||0,
          duration:row?.duration||0,
          cover:firstTikTokAssetUrl(row?.thumbnail||row?.thumbnails||''),
          play:row?.url||row?.requested_downloads?.[0]?.url||'',
          width:row?.width||row?.requested_downloads?.[0]?.width||0,
          height:row?.height||row?.requested_downloads?.[0]?.height||0,
          stats:{
            playCount:row?.view_count||0,
            diggCount:row?.like_count||0,
            commentCount:row?.comment_count||0,
            shareCount:row?.repost_count||0
          }
        }))
        .filter(Boolean)
        .slice(0,TIKTOK_VIDEO_PER_CHANNEL);

      if(videos.length){
        console.log(
          '[tiktok-ytdlp-videos]',
          handle,
          'ok',
          'videos='+videos.length,
          target.startsWith('tiktokuser:')?'tiktokuser':'profile'
        );
        return {
          known:true,
          handle,
          secUid,
          videos,
          latestVideoId:String(videos[0]?.id||''),
          hasMore:false,
          cursor:'',
          source:target.startsWith('tiktokuser:')?'yt-dlp-tiktokuser':'yt-dlp-profile',
          profile
        };
      }

      lastError='ytdlp_no_videos';
    }catch(error){
      lastError=compactText(error?.stderr||error?.message||error,180);
      console.log(
        '[tiktok-ytdlp-videos]',
        handle,
        'miss',
        target.startsWith('tiktokuser:')?'tiktokuser':'profile',
        lastError
      );
    }
  }

  return {
    known:false,
    handle,
    secUid,
    videos:[],
    error:'ytdlp_'+(lastError||'no_videos')
  };
}

async function fetchTikTokVideoFingerprint(rawHandle,knownSecUid=''){
  const handle=normalizeTikTokHandle(rawHandle);
  const secUid=String(knownSecUid||'').trim();
  if(!handle||!secUid)return {known:false,handle,secUid,latestVideoId:'',source:'missing-secuid'};

  try{
    const endpoint=new URL('https://www.tiktok.com/api/post/item_list/');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('count','1');
    endpoint.searchParams.set('cursor','0');
    endpoint.searchParams.set('from_page','user');
    endpoint.searchParams.set('secUid',secUid);

    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle,
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(4000)
    });
    if(!r.ok)return {known:false,handle,secUid,latestVideoId:'',source:'http-'+r.status};

    const body=await r.json();
    const rawItems=
      (Array.isArray(body?.itemList)&&body.itemList)||
      (Array.isArray(body?.item_list)&&body.item_list)||
      (Array.isArray(body?.data?.itemList)&&body.data.itemList)||
      (Array.isArray(body?.data?.item_list)&&body.data.item_list)||
      (Array.isArray(body?.items)&&body.items)||
      null;
    if(!Array.isArray(rawItems))return {known:false,handle,secUid,latestVideoId:'',source:'no-items'};

    const first=rawItems
      .map(row=>normalizeTikTokPostItem(handle,row))
      .filter(Boolean)
      .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))[0]||null;

    return {
      known:true,
      handle,
      secUid,
      latestVideoId:String(first?.id||''),
      latestCreateTime:Number(first?.createTime||0),
      source:'tiktok-web-api-fingerprint'
    };
  }catch(error){
    return {
      known:false,handle,secUid,latestVideoId:'',
      source:'error:'+compactText(error?.message||error,80)
    };
  }
}

async function fetchTikTokChannelVideos(rawHandle,knownSecUid=''){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  let secUid=String(knownSecUid||'').trim();

  // Membership/profile canonical data already owns secUid. When available,
  // query TikTok Web API first: it is much cheaper than launching yt-dlp and
  // is sufficient to discover the recent video list + metadata.
  if(secUid){
    try{
      const endpoint=new URL('https://www.tiktok.com/api/post/item_list/');
      endpoint.searchParams.set('aid','1988');
      endpoint.searchParams.set('count',String(TIKTOK_VIDEO_PER_CHANNEL));
      endpoint.searchParams.set('cursor','0');
      endpoint.searchParams.set('from_page','user');
      endpoint.searchParams.set('secUid',secUid);

      const r=await fetch(endpoint,{
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'accept':'application/json,text/plain,*/*',
          'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
          'referer':'https://www.tiktok.com/@'+handle,
          ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
        },
        redirect:'follow',
        signal:AbortSignal.timeout(5000)
      });
      if(r.ok){
        const body=await r.json();
        const rawItems=
          (Array.isArray(body?.itemList)&&body.itemList)||
          (Array.isArray(body?.item_list)&&body.item_list)||
          (Array.isArray(body?.data?.itemList)&&body.data.itemList)||
          (Array.isArray(body?.data?.item_list)&&body.data.item_list)||
          (Array.isArray(body?.items)&&body.items)||
          null;

        if(Array.isArray(rawItems)){
          const videos=rawItems
            .map(row=>normalizeTikTokPostItem(handle,row))
            .filter(Boolean)
            .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))
            .slice(0,TIKTOK_VIDEO_PER_CHANNEL);
          return {
            known:true,
            handle,
            secUid,
            videos,
            latestVideoId:String(videos?.[0]?.id||''),
            hasMore:Boolean(body?.hasMore??body?.has_more),
            cursor:String(body?.cursor??body?.data?.cursor??''),
            source:'tiktok-web-api'
          };
        }
      }
    }catch(error){
      console.log('[tiktok-video-api] miss',handle,compactText(error?.message||error,120));
    }
  }

  // Fallback/enrichment path.
  const ytdlp=await fetchTikTokChannelVideosYtdlp(handle,secUid);
  if(ytdlp?.known)return ytdlp;
  secUid=String(ytdlp?.secUid||secUid||'').trim();

  // One last API attempt if yt-dlp discovered a secUid.
  if(secUid&&secUid!==String(knownSecUid||'').trim()){
    try{
      const endpoint=new URL('https://www.tiktok.com/api/post/item_list/');
      endpoint.searchParams.set('aid','1988');
      endpoint.searchParams.set('count',String(TIKTOK_VIDEO_PER_CHANNEL));
      endpoint.searchParams.set('cursor','0');
      endpoint.searchParams.set('from_page','user');
      endpoint.searchParams.set('secUid',secUid);
      const r=await fetch(endpoint,{
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'accept':'application/json,text/plain,*/*',
          'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
          'referer':'https://www.tiktok.com/@'+handle,
          ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
        },
        redirect:'follow',
        signal:AbortSignal.timeout(5000)
      });
      if(r.ok){
        const body=await r.json();
        const rawItems=
          (Array.isArray(body?.itemList)&&body.itemList)||
          (Array.isArray(body?.item_list)&&body.item_list)||
          (Array.isArray(body?.data?.itemList)&&body.data.itemList)||
          (Array.isArray(body?.data?.item_list)&&body.data.item_list)||
          (Array.isArray(body?.items)&&body.items)||
          null;
        if(Array.isArray(rawItems)){
          const videos=rawItems
            .map(row=>normalizeTikTokPostItem(handle,row))
            .filter(Boolean)
            .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))
            .slice(0,TIKTOK_VIDEO_PER_CHANNEL);
          return {
            known:true,handle,secUid,videos,
            latestVideoId:String(videos?.[0]?.id||''),
            hasMore:Boolean(body?.hasMore??body?.has_more),
            cursor:String(body?.cursor??body?.data?.cursor??''),
            source:'tiktok-web-api-after-ytdlp'
          };
        }
      }
    }catch{}
  }

  return ytdlp;
}

async function loadTikTokVideoStore(){
  try{
    const [channelsRes,canonicalRes,packageRes]=await Promise.all([
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_channels?select=handle,sec_uid,latest_video_id,videos,scan_status,scan_error,checked_at,updated_at',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_channels?selected=eq.true&select=handle,sec_uid',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_package?package_key=eq.latest&select=version,payload,updated_at&limit=1',
        {headers:storeHeaders()}
      )
    ]);
    if(!channelsRes.ok)throw new Error('tiktok_video_channels_read_'+channelsRes.status+':'+await channelsRes.text());
    if(!canonicalRes.ok)throw new Error('tiktok_video_canonical_read_'+canonicalRes.status+':'+await canonicalRes.text());
    if(!packageRes.ok)throw new Error('tiktok_video_package_read_'+packageRes.status+':'+await packageRes.text());

    const rows=await channelsRes.json();
    const canonicalRows=await canonicalRes.json();
    const canonicalMap=new Map(
      (Array.isArray(canonicalRows)?canonicalRows:[])
        .map(row=>[String(row?.handle||'').toLowerCase(),row])
    );
    const packageRows=await packageRes.json();
    const storedMap=new Map(
      (Array.isArray(rows)?rows:[])
        .map(row=>[String(row?.handle||'').toLowerCase(),row])
    );

    tiktokVideoLibrary.clear();
    for(const handle of tiktokLiveSelectedHandles){
      const stored=storedMap.get(handle.toLowerCase())||{};
      const videos=Array.isArray(stored?.videos)?stored.videos:[];
      const canonical=canonicalMap.get(handle.toLowerCase())||{};
      const status=String(stored?.scan_status||'');
      tiktokVideoLibrary.set(handle.toLowerCase(),{
        handle,
        secUid:String(stored?.sec_uid||canonical?.sec_uid||''),
        latestVideoId:String(stored?.latest_video_id||videos?.[0]?.id||''),
        videos:videos.slice(0,TIKTOK_VIDEO_PER_CHANNEL),
        checkedAt:Date.parse(stored?.checked_at||stored?.updated_at||0)||0,
        changedAt:0,
        status:['ready','empty','unknown'].includes(status)
          ? status
          : (videos.length?'ready':'unknown'),
        error:String(stored?.scan_error||'')
      });
    }

    const packageRow=Array.isArray(packageRows)?packageRows[0]:null;
    tiktokVideoPackageVersion=Number(packageRow?.version||0);
    tiktokVideoPersistedVersion=tiktokVideoPackageVersion;
    tiktokVideoPackageUpdatedAt=Date.parse(packageRow?.updated_at||0)||0;
    console.log('[tiktok-video-store] loaded','channels='+tiktokVideoLibrary.size,'version='+tiktokVideoPackageVersion);
    return true;
  }catch(error){
    console.warn('[tiktok-video-store] load failed',compactText(error?.message||error,220));
    return false;
  }
}

function buildTikTokVideoStoredRows(){
  const now=nowIso();
  return [...tiktokLiveSelectedHandles]
    .map(handle=>{
      const row=tiktokVideoLibrary.get(handle.toLowerCase())||{
        handle,secUid:'',latestVideoId:'',videos:[],checkedAt:0,status:'unknown',error:''
      };
      const videos=Array.isArray(row.videos)?row.videos.slice(0,TIKTOK_VIDEO_PER_CHANNEL):[];
      return {
        handle,
        sec_uid:String(row.secUid||''),
        latest_video_id:String(row.latestVideoId||videos?.[0]?.id||''),
        videos,
        scan_status:String(row.status|| (videos.length?'ready':'unknown')),
        scan_error:String(row.error||'').slice(0,300),
        checked_at:row.checkedAt?new Date(Number(row.checkedAt)).toISOString():null,
        updated_at:now
      };
    })
    .sort((a,b)=>a.handle.localeCompare(b.handle));
}

async function persistTikTokVideoStore({force=false}={}){
  if(TIKTOK_UPDATES_PAUSED)return true;
  if(!force&&tiktokVideoPersistedVersion===tiktokVideoPackageVersion)return true;
  if(tiktokVideoStoreWritePromise)return tiktokVideoStoreWritePromise;

  tiktokVideoStoreWritePromise=(async()=>{
    const rows=buildTikTokVideoStoredRows();
    const payload={
      channels:rows.map(row=>({
        handle:row.handle,
        secUid:row.sec_uid,
        latestVideoId:row.latest_video_id,
        scanStatus:row.scan_status,
        videos:row.videos
      })),
      total:rows.length,
      videoCount:rows.reduce((sum,row)=>sum+row.videos.length,0)
    };
    const now=nowIso();

    const [channelsRes,packageRes]=await Promise.all([
      rows.length?fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_channels?on_conflict=handle',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify(rows)
        }
      ):Promise.resolve({ok:true,status:204,text:async()=>''}),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_package?on_conflict=package_key',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify([{
            package_key:'latest',
            version:tiktokVideoPackageVersion,
            payload,
            updated_at:now
          }])
        }
      )
    ]);

    if(!channelsRes.ok)throw new Error('tiktok_video_channels_write_'+channelsRes.status+':'+await channelsRes.text());
    if(!packageRes.ok)throw new Error('tiktok_video_package_write_'+packageRes.status+':'+await packageRes.text());

    tiktokVideoPersistedVersion=tiktokVideoPackageVersion;
    console.log('[tiktok-video-store] saved','channels='+rows.length,'videos='+payload.videoCount,'version='+tiktokVideoPackageVersion);
    void queueTikTokCanonicalSync(rows.map(row=>row.handle));
    return true;
  })().catch(error=>{
    console.warn('[tiktok-video-store] save failed',compactText(error?.message||error,220));
    return false;
  }).finally(()=>{
    tiktokVideoStoreWritePromise=null;
  });

  return tiktokVideoStoreWritePromise;
}

async function refreshAllTikTokChannelProfiles(handles){
  const profiles=new Map();
  let done=0;
  let errors=0;
  for(const handle of handles){
    try{
      const profile=await fetchTikwmProfileIdentity(handle);
      if(profile){
        const key=handle.toLowerCase();
        const cached=tiktokProfileIdentityCache.get(key)?.data||{};
        const merged=mergeTikTokProfileData(handle,cached,profile);
        tiktokProfileIdentityCache.set(key,{at:Date.now(),data:merged});
        profiles.set(key,merged);
      }else{
        errors+=1;
      }
    }catch{
      errors+=1;
    }
    done+=1;
    tiktokFullResyncState.channelsDone=done;
  }
  return {profiles,errors};
}

async function refreshAllTikTokMp4Sources(handles){
  const wanted=new Set(handles.map(x=>String(x).toLowerCase()));
  const rows=[...tiktokCanonicalVideos.values()]
    .filter(row=>wanted.has(String(row.handle||'').toLowerCase()))
    .sort((a,b)=>
      String(a.handle||'').localeCompare(String(b.handle||''))||
      Number(b.create_time||0)-Number(a.create_time||0)
    );
  tiktokFullResyncState.videosTotal=rows.length;
  let ready=0;
  let errors=0;
  for(const row of rows){
    try{
      await resolveTikTokVideoSource(
        row.handle,
        row.video_id,
        {force:!canonicalMp4Usable(row,5*60_000)}
      );
      if(canonicalMp4Usable(tiktokCanonicalVideos.get(String(row.video_id))||row,60_000))ready+=1;
    }catch(error){
      errors+=1;
      console.log(
        '[tiktok-full-resync] mp4 failed',
        row.handle,row.video_id,
        compactText(error?.stderr||error?.message||error,100)
      );
    }
    tiktokFullResyncState.videosReady=ready;
  }
  return {total:rows.length,ready,errors};
}

async function repairTikTokIncompleteVideoData(){
  const targets=[...tiktokLiveSelectedHandles].filter(handle=>{
    const row=tiktokVideoLibrary.get(handle.toLowerCase())||{};
    return !Array.isArray(row.videos)||row.videos.length===0;
  });
  if(!targets.length){
    console.log('[tiktok-video-repair] nothing-to-repair');
    return true;
  }
  console.log('[tiktok-video-repair] start','channels='+targets.length);
  for(const handle of targets)tiktokVideoRefreshAt.delete(handle.toLowerCase());
  await refreshTikTokVideoLibrary(targets);
  await persistTikTokVideoStore({force:true});
  await syncTikTokCanonicalLibrary(targets,{mirror:false}).catch(()=>{});
  await persistTikTokCanonicalPackage().catch(()=>{});
  const ready=targets.filter(handle=>(tiktokVideoLibrary.get(handle.toLowerCase())?.videos||[]).length>0).length;
  const empty=targets.filter(handle=>tiktokVideoLibrary.get(handle.toLowerCase())?.status==='empty').length;
  const unknown=targets.filter(handle=>tiktokVideoLibrary.get(handle.toLowerCase())?.status==='unknown').length;
  console.log('[tiktok-video-repair] done','ready='+ready,'empty='+empty,'unknown='+unknown);
  return true;
}

async function fullResyncTikTokSelectedData(){
  if(tiktokFullResyncPromise)return tiktokFullResyncPromise;
  const run=async()=>{
    const handles=[...tiktokLiveSelectedHandles];
    if(!handles.length)return false;

    tiktokFullResyncState={
      running:true,
      startedAt:Date.now(),
      finishedAt:0,
      phase:'profiles',
      channelsTotal:handles.length,
      channelsDone:0,
      videosTotal:0,
      videosReady:0,
      errors:0
    };
    console.log('[tiktok-full-resync] start','channels='+handles.length);

    // 1) Force a fresh full-video scan for every selected channel first.
    // This is the primary data refresh and already carries video metadata+MP4.
    tiktokFullResyncState.phase='video-lists';
    for(const handle of handles)tiktokVideoRefreshAt.delete(handle.toLowerCase());
    await refreshTikTokVideoLibrary(handles);
    await persistTikTokVideoStore({force:true});

    // 2) Refresh channel/profile metadata for every selected channel.
    tiktokFullResyncState.phase='profiles';
    tiktokFullResyncState.channelsDone=0;
    const profileResult=await refreshAllTikTokChannelProfiles(handles);
    tiktokFullResyncState.errors+=profileResult.errors;

    // 3) Merge profile + fully extracted video rows into canonical immediately.
    tiktokFullResyncState.phase='canonical';
    await syncTikTokCanonicalLibrary(handles,{
      profiles:profileResult.profiles,
      mirror:false
    });

    // 4) Refresh LIVE/non-LIVE state independently from canonical media data.
    tiktokFullResyncState.phase='live';
    await runTikTokLiveMinuteSweep().catch(()=>{});
    await persistTikTokLiveStore({force:true}).catch(()=>{});

    // 5) Fill playback metadata server-side for every canonical video.
    tiktokFullResyncState.phase='mp4';
    const mp4=await refreshAllTikTokMp4Sources(handles);
    tiktokFullResyncState.errors+=mp4.errors;

    // 6) Persist one final unified package and mirror images in background.
    tiktokFullResyncState.phase='package';
    await syncTikTokCanonicalLibrary(handles,{profiles:profileResult.profiles,mirror:false});
    await persistTikTokCanonicalPackage();
    // Images remain origin URLs; do not mirror them into Supabase Storage.

    tiktokFullResyncState.running=false;
    tiktokFullResyncState.phase='done';
    tiktokFullResyncState.finishedAt=Date.now();
    console.log(
      '[tiktok-full-resync] done',
      'channels='+handles.length,
      'videos='+mp4.total,
      'ready='+mp4.ready,
      'errors='+tiktokFullResyncState.errors
    );
    return true;
  };
  tiktokFullResyncPromise=run()
    .catch(error=>{
      tiktokFullResyncState.running=false;
      tiktokFullResyncState.phase='error';
      tiktokFullResyncState.finishedAt=Date.now();
      tiktokFullResyncState.errors+=1;
      console.warn('[tiktok-full-resync] failed',compactText(error?.message||error,180));
      return false;
    })
    .finally(()=>{tiktokFullResyncPromise=null;});
  return tiktokFullResyncPromise;
}

async function refreshTikTokVideoLibrary(handles=null){
  const target=(handles&&handles.length)
    ? [...new Set(handles.map(normalizeTikTokHandle).filter(Boolean))]
    : [...tiktokLiveSelectedHandles];
  if(!target.length)return;

  const now=Date.now();
  const due=target.filter(
    handle=>now-Number(tiktokVideoRefreshAt.get(handle.toLowerCase())||0)>=TIKTOK_VIDEO_LIBRARY_REFRESH_MS
  );
  if(!due.length)return;

  let cursor=0;
  let okCount=0;
  let unknownCount=0;
  const errorCounts=new Map();
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=due.length)return;
      const handle=due[index];
      const key=handle.toLowerCase();
      tiktokVideoRefreshAt.set(key,Date.now());
      const current=tiktokVideoLibrary.get(key)||{};
      const fingerprint=await fetchTikTokVideoFingerprint(handle,current.secUid||'');
      const currentLatest=String(current.latestVideoId||current.videos?.[0]?.id||'');

      // Cheap path: the newest ID did not move, so there is nothing to crawl,
      // enrich or persist. checkedAt is intentionally non-material.
      if(fingerprint?.known&&fingerprint.latestVideoId&&fingerprint.latestVideoId===currentLatest){
        okCount+=1;
        updateTikTokVideoLibrary(handle,{
          checkedAt:Date.now(),
          status:Array.isArray(current.videos)&&current.videos.length?'ready':'empty',
          error:''
        });
        continue;
      }

      // Deep fetch is allowed only for a new fingerprint, initial bootstrap, or
      // a very occasional recovery when the lightweight endpoint is unavailable.
      const lastDeep=Number(tiktokVideoDeepCheckAt.get(key)||0);
      const deepDue=!currentLatest||Date.now()-lastDeep>=TIKTOK_VIDEO_DEEP_FALLBACK_MS;
      if(!fingerprint?.known&&!deepDue){
        unknownCount+=1;
        updateTikTokVideoLibrary(handle,{
          checkedAt:Date.now(),
          status:String(current.status||'ready'),
          error:'fingerprint_unavailable'
        });
        continue;
      }

      tiktokVideoDeepCheckAt.set(key,Date.now());
      const result=await fetchTikTokChannelVideos(handle,current.secUid||fingerprint?.secUid||'');
      if(!result?.known){
        unknownCount+=1;
        const reason=String(result?.error||fingerprint?.source||'unknown').slice(0,180);
        errorCounts.set(reason.slice(0,80),Number(errorCounts.get(reason.slice(0,80))||0)+1);
        updateTikTokVideoLibrary(handle,{
          secUid:String(current.secUid||result?.secUid||fingerprint?.secUid||''),
          checkedAt:Date.now(),
          status:currentLatest?String(current.status||'ready'):'unknown',
          error:reason
        });
        continue;
      }
      okCount+=1;
      if(result?.profile){
        const profile={...result.profile};
        if(!profile.secUid&&result.secUid)profile.secUid=String(result.secUid);
        tiktokProfileIdentityCache.set(key,{at:Date.now(),data:profile});
      }
      const videos=Array.isArray(result.videos)?result.videos:[];
      updateTikTokVideoLibrary(handle,{
        secUid:result.secUid,
        latestVideoId:result.latestVideoId,
        videos,
        checkedAt:Date.now(),
        status:videos.length?'ready':'empty',
        error:''
      });
    }
  };
  await Promise.all(Array.from({length:Math.min(1,due.length)},()=>worker()));
  console.log(
    '[tiktok-video-scan]',
    'total='+target.length,
    'due='+due.length,
    'ok='+okCount,
    'unknown='+unknownCount,
    'errors='+JSON.stringify(Object.fromEntries(errorCounts))
  );
}

function nextTikTokVideoBackgroundBatch(size=4){
  const list=[...tiktokLiveSelectedHandles];
  if(!list.length)return [];
  const out=[];
  for(let i=0;i<Math.min(size,list.length);i++){
    out.push(list[(tiktokVideoBackgroundCursor+i)%list.length]);
  }
  tiktokVideoBackgroundCursor=(tiktokVideoBackgroundCursor+out.length)%list.length;
  return out;
}

function ensureTikTokVideoPackageScan(handles=null){
  if(tiktokVideoPackageScanPromise)return tiktokVideoPackageScanPromise;
  tiktokVideoPackageScanPromise=refreshTikTokVideoLibrary(handles)
    .then(()=>persistTikTokVideoStore())
    .catch(error=>console.log('[tiktok-video-package] scan failed',compactText(error?.message||error,160)))
    .finally(()=>{tiktokVideoPackageScanPromise=null;});
  return tiktokVideoPackageScanPromise;
}

async function getTikTokProfileSample(rawHandle,limit=6){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const profileUrl='https://www.tiktok.com/@'+handle;

  const parseEntries=(text)=>{
    const entries=String(text||'')
      .split(/\r?\n/)
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>{try{return JSON.parse(line)}catch{return null}})
      .filter(Boolean);
    const first=entries[0]||{};
    const account={
      handle,
      displayName:String(first.channel||first.uploader||first.creator||''),
      avatar:String(first.thumbnail||''),
      bio:'',
      numericId:String(first.uploader_id||''),
      channelId:String(first.channel_id||'')
    };
    const videos=[];
    const seen=new Set();
    for(const row of entries){
      const id=String(row?.id||row?.video_id||'').trim();
      if(!/^\d{8,}$/.test(id)||seen.has(id))continue;
      seen.add(id);
      videos.push({
        id,
        handle,
        url:'https://www.tiktok.com/@'+handle+'/video/'+id,
        title:String(row?.title||row?.description||'').slice(0,220),
        thumbnail:String(row?.thumbnail||'')
      });
      if(videos.length>=limit)break;
    }
    return {account,videos};
  };

  const loadVideos=async source=>{
    const text=await execFileText('yt-dlp',[
      '--flat-playlist',
      '--playlist-end',String(limit),
      '--dump-json',
      '--no-warnings',
      '--socket-timeout','10',
      '--retries','1',
      '--extractor-retries','1',
      source
    ],{timeout:25_000,maxBuffer:6*1024*1024});
    return parseEntries(text);
  };

  const [identity,live]=await Promise.all([
    fetchTikTokProfileIdentity(handle),
    checkTikTokLiveWithYtDlp(handle).catch(error=>({
      ok:true,handle,live:false,url:'https://www.tiktok.com/@'+handle+'/live',
      title:'',thumbnail:'',streamUrl:'',streamType:'',channelId:'',
      note:compactText(error?.message||error,200)
    }))
  ]);

  let profile=null;
  let profileError='';
  const sources=[];
  if(identity?.secUid)sources.push('tiktokuser:'+identity.secUid);
  sources.push(profileUrl);
  if(live?.channelId&&live.channelId!==identity?.secUid)sources.push('tiktokuser:'+live.channelId);

  for(const source of sources){
    try{
      profile=await loadVideos(source);
      if(profile?.videos?.length){
        console.log('[tiktok-profile] videos ok',handle,source,profile.videos.length);
        break;
      }
    }catch(error){
      profileError=compactText(error?.stderr||error?.message||error,260);
      console.warn('[tiktok-profile] source failed',handle,source,profileError);
    }
  }

  if(!profile)profile={
    account:{handle,displayName:'',avatar:'',bio:'',numericId:'',channelId:''},
    videos:[]
  };

  if(!profile.videos.length&&identity?.videoId){
    profile.videos=[{
      id:identity.videoId,
      handle,
      url:'https://www.tiktok.com/@'+handle+'/video/'+identity.videoId,
      title:'',
      thumbnail:''
    }];
  }

  return {
    ok:true,
    type:'account',
    profileUrl,
    account:{
      handle,
      displayName:String(identity?.nickname||profile?.account?.displayName||live?.uploader||''),
      avatar:String(identity?.avatar||profile?.account?.avatar||live?.thumbnail||''),
      bio:'',
      numericId:String(identity?.userId||profile?.account?.numericId||live?.uploaderId||''),
      channelId:String(identity?.secUid||profile?.account?.channelId||live?.channelId||'')
    },
    live:live?.live?{
      type:'live',
      handle,
      url:live.url,
      title:live.title||('@'+handle+' đang LIVE'),
      thumbnail:live.thumbnail||'',
      streamUrl:live.streamUrl||'',
      streamType:live.streamType||'',
      channelId:String(live.channelId||identity?.secUid||'')
    }:null,
    videos:(Array.isArray(profile?.videos)?profile.videos:[]).map(row=>({
      type:'video',
      ...row,
      isLive:false
    })),
    profileError:profile?.videos?.length?'':profileError,
    checkedAt:nowIso()
  };
}


function enqueue(task){
  queueDepth+=1;
  const run=serial.then(task,task);
  serial=run.catch(()=>{}).finally(()=>{queueDepth=Math.max(0,queueDepth-1);});
  return run;
}

function storeHeaders(extra={}){
  if(!SUPABASE_URL||!SUPABASE_KEY||!COLLECTOR_TOKEN)throw new Error('store_not_configured');
  return {
    apikey:SUPABASE_KEY,
    authorization:'Bearer '+SUPABASE_KEY,
    'x-collector-token':COLLECTOR_TOKEN,
    'content-type':'application/json',
    ...extra,
  };
}

function canonicalText(next,prev=''){
  const value=String(next||'').trim();
  return value||String(prev||'');
}
function canonicalCount(next,prev=0){
  const value=Number(next);
  return Number.isFinite(value)&&value>0?Math.round(value):Number(prev||0);
}
function canonicalEpochSeconds(value){
  let n=Number(value||0);
  if(!Number.isFinite(n)||n<=0)return 0;
  if(n>10_000_000_000)n=Math.floor(n/1000);
  return Math.floor(n);
}
function canonicalProfileName(value,handle,prev=''){
  const name=String(value||'').trim();
  const old=String(prev||'').trim();
  if(!name)return old;
  const clean=name.replace(/^@/,'').toLowerCase();
  const key=String(handle||'').replace(/^@/,'').toLowerCase();
  // yt-dlp frequently reports the handle as uploader/channel. Treat that as a
  // fallback label, not a real display name that may overwrite richer metadata.
  if(clean===key&&old&&old.replace(/^@/,'').toLowerCase()!==key)return old;
  return name;
}
function mergeTikTokProfileData(handle,base={},incoming={}){
  const key=String(handle||'').toLowerCase();
  const source=String(incoming?.source||base?.source||'');
  const incomingName=String(incoming?.nickname||'').trim();
  const name=canonicalProfileName(incomingName,handle,base?.nickname||'');
  const avatar=String(incoming?.avatar||'').trim()||String(base?.avatar||'');
  return {
    ...base,
    ...incoming,
    nickname:name,
    avatar,
    secUid:String(incoming?.secUid||'').trim()||String(base?.secUid||''),
    userId:String(incoming?.userId||'').trim()||String(base?.userId||''),
    bio:String(incoming?.bio||'').trim()||String(base?.bio||''),
    verified:Boolean(incoming?.verified)||Boolean(base?.verified),
    followerCount:canonicalCount(incoming?.followerCount,base?.followerCount),
    followingCount:canonicalCount(incoming?.followingCount,base?.followingCount),
    heartCount:canonicalCount(incoming?.heartCount,base?.heartCount),
    videoCount:canonicalCount(incoming?.videoCount,base?.videoCount),
    source
  };
}
function tiktokProfileFromYtdlpRow(handle,row,source='yt-dlp'){
  if(!row||typeof row!=='object')return null;
  const nickname=String(
    row?.uploader||
    row?.channel||
    row?.creator||
    ''
  ).trim();
  const secUid=String(row?.channel_id||row?.channelId||'').trim();
  const userId=String(row?.uploader_id||row?.uploaderId||'').trim();
  const followerCount=Number(
    row?.channel_follower_count||
    row?.follower_count||
    row?.uploader_follower_count||
    0
  );
  const avatar=firstTikTokAssetUrl(
    row?.channel_thumbnail||
    row?.uploader_thumbnail||
    row?.channel_thumbnails||
    row?.uploader_thumbnails||
    ''
  );
  if(!nickname&&!secUid&&!userId&&!avatar&&!followerCount)return null;
  return {
    userId,
    secUid,
    nickname,
    avatar,
    bio:'',
    verified:false,
    followerCount:Number.isFinite(followerCount)?followerCount:0,
    followingCount:0,
    heartCount:0,
    videoCount:0,
    source
  };
}

function canonicalChannelDefault(handle){
  return {
    handle,
    selected:true,
    user_id:'',
    sec_uid:'',
    display_name:'',
    bio:'',
    verified:false,
    avatar_source_url:'',
    avatar_stored_url:'',
    avatar_width:0,
    avatar_height:0,
    follower_count:0,
    following_count:0,
    heart_count:0,
    video_count:0,
    profile_source:'',
    profile_checked_at:null,
    live:false,
    live_title:'',
    live_cover_source_url:'',
    live_cover_stored_url:'',
    live_stream_type:'',
    live_stream_url:'',
    live_source_sig:'',
    live_checked_at:null,
    live_updated_at:null,
    first_seen_at:nowIso(),
    updated_at:nowIso()
  };
}
function canonicalVideoDefault(handle,id){
  return {
    video_id:String(id||''),
    handle,
    title:'',
    create_time:0,
    duration:0,
    page_url:'',
    cover_source_url:'',
    cover_stored_url:'',
    width:0,
    height:0,
    play_count:0,
    digg_count:0,
    comment_count:0,
    share_count:0,
    collect_count:0,
    mp4_url:'',
    mp4_expires_at:null,
    mp4_source:'',
    mp4_updated_at:null,
    first_seen_at:nowIso(),
    metrics_updated_at:null,
    updated_at:nowIso()
  };
}
function isDirectTikTokMediaUrl(value){
  const url=String(value||'').trim();
  if(!/^https?:\/\//i.test(url))return false;
  if(/tiktok\.com\/@[^/]+\/video\//i.test(url))return false;
  return true;
}
function canonicalMp4ExpiryMs(row){
  const explicit=row?.mp4_expires_at?Date.parse(row.mp4_expires_at):0;
  if(Number.isFinite(explicit)&&explicit>0)return explicit;
  const fromUrl=tiktokStreamExpiresAt(row?.mp4_url||'');
  return Number(fromUrl||0);
}
function canonicalMp4Usable(row,minRemainMs=60_000){
  const url=String(row?.mp4_url||'').trim();
  if(!isDirectTikTokMediaUrl(url))return false;
  // Canonical MP4 means an actual video frame source. Audio-only/photo posts
  // must never be exposed to the <video> player as ready MP4.
  if(Number(row?.width||0)<=0||Number(row?.height||0)<=0)return false;
  const expiresAt=canonicalMp4ExpiryMs(row);
  return !expiresAt||expiresAt-Date.now()>minRemainMs;
}
function canonicalMergeVideo(handle,video){
  const id=String(video?.id||video?.video_id||'').trim();
  if(!/^\d{8,}$/.test(id))return null;
  const prev=tiktokCanonicalVideos.get(id)||canonicalVideoDefault(handle,id);
  const next={...prev};
  next.handle=handle;
  next.title=canonicalText(video?.title,prev.title);
  next.create_time=canonicalEpochSeconds(video?.createTime||video?.create_time)||Number(prev.create_time||0);
  next.duration=Number(video?.duration||0)>0?Math.round(Number(video.duration)):Number(prev.duration||0);
  next.page_url=canonicalText(video?.url||video?.page_url,prev.page_url)||('https://www.tiktok.com/@'+handle+'/video/'+id);

  const cover=String(video?.cover||video?.cover_source_url||'').trim();
  if(cover&&cover!==String(prev.cover_source_url||'')){
    next.cover_source_url=cover;
    next.cover_stored_url='';
  }
  if(Number(video?.width||0)>0)next.width=Math.round(Number(video.width));
  if(Number(video?.height||0)>0)next.height=Math.round(Number(video.height));

  const directMp4=String(video?.mp4Url||video?.mp4_url||video?.playback?.url||video?.playUrl||'').trim();
  if(isDirectTikTokMediaUrl(directMp4)){
    const expiresAt=tiktokStreamExpiresAt(directMp4)||Date.now()+10*60_000;
    next.mp4_url=directMp4;
    next.mp4_expires_at=new Date(expiresAt).toISOString();
    next.mp4_source=canonicalText(video?.mp4Source||video?.mp4_source||video?.playback?.source,'yt-dlp');
    next.mp4_updated_at=nowIso();
  }

  let statsChanged=false;
  for(const [key,value] of [
    ['play_count',video?.playCount??video?.play_count],
    ['digg_count',video?.diggCount??video?.digg_count],
    ['comment_count',video?.commentCount??video?.comment_count],
    ['share_count',video?.shareCount??video?.share_count],
    ['collect_count',video?.collectCount??video?.collect_count]
  ]){
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)continue;
    // Zero is valid only when we have no prior measurement. Never let a poorer
    // metadata source erase an already-known positive counter.
    if(n===0&&Number(next[key]||0)>0)continue;
    const rounded=Math.round(n);
    if(rounded!==Number(next[key]||0)){
      next[key]=rounded;
      statsChanged=true;
    }
  }
  if(statsChanged)next.metrics_updated_at=nowIso();
  next.updated_at=nowIso();
  tiktokCanonicalVideos.set(id,next);
  return next;
}
function canonicalPackageVideo(row){
  const handle=String(row.handle||'');
  const id=String(row.video_id||'');
  const sourceCover=String(row.cover_source_url||'');
  const storedCover=String(row.cover_stored_url||'');
  return {
    id,
    handle,
    title:String(row.title||''),
    createTime:Number(row.create_time||0),
    duration:Number(row.duration||0),
    pageUrl:String(row.page_url||('https://www.tiktok.com/@'+handle+'/video/'+id)),
    cover:{
      url:sourceCover||storedCover,
      sourceUrl:sourceCover,
      storedUrl:storedCover,
      width:Number(row.width||0),
      height:Number(row.height||0)
    },
    stats:{
      views:Number(row.play_count||0),
      likes:Number(row.digg_count||0),
      comments:Number(row.comment_count||0),
      shares:Number(row.share_count||0),
      collects:Number(row.collect_count||0)
    },
    playback:{
      type:'mp4',
      ready:canonicalMp4Usable(row),
      // Direct CDN first. Keep the Render route only as a fallback.
      url:canonicalMp4Usable(row)?String(row.mp4_url||''):'',
      proxyUrl:canonicalMp4Usable(row)
        ? '/tiktok/video-stream?user='+encodeURIComponent(handle)+'&id='+encodeURIComponent(id)
        : '',
      source:String(row.mp4_source||''),
      expiresAt:row.mp4_expires_at||null,
      updatedAt:row.mp4_updated_at||null
    }
  };
}
function buildTikTokCanonicalPackage(){
  const selected=new Set([...tiktokLiveSelectedHandles].map(x=>String(x).toLowerCase()));
  const videosByHandle=new Map();
  for(const row of tiktokCanonicalVideos.values()){
    const key=String(row.handle||'').toLowerCase();
    if(!videosByHandle.has(key))videosByHandle.set(key,[]);
    videosByHandle.get(key).push(row);
  }
  for(const rows of videosByHandle.values()){
    rows.sort((a,b)=>Number(b.create_time||0)-Number(a.create_time||0)||String(b.video_id).localeCompare(String(a.video_id)));
  }

  const channels=[...tiktokCanonicalChannels.values()]
    .filter(row=>row.selected!==false&&(!selected.size||selected.has(String(row.handle||'').toLowerCase())))
    .map(row=>{
      const handle=String(row.handle||'');
      const avatarSource=String(row.avatar_source_url||'');
      const avatarStored=String(row.avatar_stored_url||'');
      const liveCoverSource=String(row.live_cover_source_url||'');
      const liveCoverStored=String(row.live_cover_stored_url||'');
      const recent=(videosByHandle.get(handle.toLowerCase())||[])
        .slice(0,TIKTOK_LIBRARY_RECENT_VIDEOS)
        .map(canonicalPackageVideo);
      return {
        handle,
        profile:{
          userId:String(row.user_id||''),
          secUid:String(row.sec_uid||''),
          name:String(row.display_name||''),
          bio:String(row.bio||''),
          verified:Boolean(row.verified),
          avatar:{
            url:avatarSource||avatarStored,
            sourceUrl:avatarSource,
            storedUrl:avatarStored,
            width:Number(row.avatar_width||0),
            height:Number(row.avatar_height||0)
          },
          followers:Number(row.follower_count||0),
          following:Number(row.following_count||0),
          likes:Number(row.heart_count||0),
          videoCount:Number(row.video_count||0),
          source:String(row.profile_source||''),
          checkedAt:row.profile_checked_at||null
        },
        live:{
          isLive:Boolean(row.live),
          playable:Boolean(row.live&&row.live_stream_url&&row.live_source_sig),
          title:String(row.live_title||''),
          cover:{
            url:liveCoverSource||liveCoverStored,
            sourceUrl:liveCoverSource,
            storedUrl:liveCoverStored
          },
          stream:{
            type:String(row.live_stream_type||''),
            sourceSig:String(row.live_source_sig||''),
            // Direct CDN first. Proxy remains a compatibility fallback only.
            url:row.live&&row.live_source_sig?String(row.live_stream_url||''):'',
            proxyUrl:row.live&&row.live_source_sig
              ? '/tiktok/live-stream?user='+encodeURIComponent(handle)+'&source='+encodeURIComponent(row.live_source_sig)
              : ''
          },
          checkedAt:row.live_checked_at||null,
          updatedAt:row.live_updated_at||null
        },
        videos:recent
      };
    })
    .sort((a,b)=>Number(b.live.isLive)-Number(a.live.isLive)||a.handle.localeCompare(b.handle));

  const material={
    schema:'tiktok-library-v3',
    recentVideoLimit:TIKTOK_LIBRARY_RECENT_VIDEOS,
    retention:{
      channels:'persistent-until-unselected',
      videos:'append-only-by-video-id',
      liveStream:'replace-or-clear-only',
      images:'current-reference-only-with-orphan-cleanup',
      videoPlayback:'refreshable-signed-mp4-kept-in-library'
    },
    channels
  };
  const versionMaterial={
    schema:material.schema,
    channels:channels.map(ch=>({
      handle:ch.handle,
      profile:{
        ...ch.profile,
        checkedAt:undefined
      },
      live:{
        ...ch.live,
        checkedAt:undefined,
        updatedAt:undefined
      },
      videos:ch.videos
    }))
  };
  const hash=createHash('sha1').update(JSON.stringify(versionMaterial)).digest('hex');
  if(hash!==tiktokCanonicalMaterialHash){
    tiktokCanonicalMaterialHash=hash;
    tiktokCanonicalPackageVersion+=1;
    tiktokCanonicalPackageUpdatedAt=Date.now();
  }
  return {
    ...material,
    version:tiktokCanonicalPackageVersion,
    generatedAt:new Date(tiktokCanonicalPackageUpdatedAt||Date.now()).toISOString(),
    total:channels.length,
    liveCount:channels.filter(x=>x.live.isLive).length,
    videoCount:channels.reduce((sum,x)=>sum+x.videos.length,0)
  };
}
async function fetchTikTokCanonicalPages(path,{pageSize=1000,maxRows=50000}={}){
  const all=[];
  for(let offset=0;offset<maxRows;offset+=pageSize){
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/'+path,
      {
        headers:storeHeaders({range:offset+'-'+(offset+pageSize-1)}),
        signal:AbortSignal.timeout(12_000)
      }
    );
    if(!r.ok)throw new Error('tiktok_library_page_read_'+r.status+':'+compactText(await r.text(),140));
    const rows=await r.json();
    if(!Array.isArray(rows)||!rows.length)break;
    all.push(...rows);
    if(rows.length<pageSize)break;
  }
  return all;
}

async function loadTikTokCanonicalStore(){
  if(tiktokCanonicalLoaded)return true;
  if(tiktokCanonicalLoadPromise)return tiktokCanonicalLoadPromise;
  if(tiktokCanonicalLoadFailedAt&&Date.now()-tiktokCanonicalLoadFailedAt<TIKTOK_CANONICAL_LOAD_RETRY_MS){
    return false;
  }
  tiktokCanonicalLoadPromise=(async()=>{
    const [channelRows,videoRows,packageRes]=await Promise.all([
      fetchTikTokCanonicalPages('yt1988_tiktok_channels?select=*&order=handle.asc',{maxRows:5000}),
      fetchTikTokCanonicalPages('yt1988_tiktok_videos?select=*&order=create_time.desc',{maxRows:50000}),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_library_package?package_key=eq.library&select=version,payload,updated_at&limit=1',
        {headers:storeHeaders()}
      )
    ]);
    const packageRows=packageRes.ok?await packageRes.json():[];
    tiktokCanonicalChannels.clear();
    tiktokCanonicalVideos.clear();
    for(const row of Array.isArray(channelRows)?channelRows:[]){
      const handle=normalizeTikTokHandle(row?.handle||'');
      if(handle)tiktokCanonicalChannels.set(handle.toLowerCase(),{...canonicalChannelDefault(handle),...row,handle});
    }
    for(const row of Array.isArray(videoRows)?videoRows:[]){
      const id=String(row?.video_id||'');
      const handle=normalizeTikTokHandle(row?.handle||'');
      if(/^\d{8,}$/.test(id)&&handle){
        const canonical={...canonicalVideoDefault(handle,id),...row,video_id:id,handle};
        tiktokCanonicalVideos.set(id,canonical);
        if(canonicalMp4Usable(canonical)){
          tiktokVideoSourceCache.set(handle.toLowerCase()+':'+id,{
            at:Date.now(),
            handle,
            id,
            url:String(canonical.mp4_url||''),
            ext:'mp4',
            mime:'',
            headers:{
              'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
              'referer':'https://www.tiktok.com/@'+handle,
              'accept':'*/*'
            },
            width:Number(canonical.width||0),
            height:Number(canonical.height||0),
            duration:Number(canonical.duration||0),
            source:String(canonical.mp4_source||'library')
          });
        }
      }
    }
    const pkg=Array.isArray(packageRows)?packageRows[0]:null;
    tiktokCanonicalPackageVersion=Number(pkg?.version||0);
    tiktokCanonicalPersistedVersion=tiktokCanonicalPackageVersion;
    tiktokCanonicalPackageUpdatedAt=pkg?.updated_at?Date.parse(pkg.updated_at):0;
    tiktokCanonicalLoadFailedAt=0;
    tiktokCanonicalMaterialHash='';
    tiktokCanonicalLoaded=true;
    buildTikTokCanonicalPackage();
    console.log('[tiktok-library] loaded','channels='+tiktokCanonicalChannels.size,'videos='+tiktokCanonicalVideos.size,'version='+tiktokCanonicalPackageVersion);
    return true;
  })().catch(error=>{
    tiktokCanonicalLoadFailedAt=Date.now();
    console.warn('[tiktok-library] load failed',compactText(error?.message||error,180));
    return false;
  }).finally(()=>{tiktokCanonicalLoadPromise=null;});
  return tiktokCanonicalLoadPromise;
}
async function upsertTikTokCanonicalRows(channelRows=[],videoRows=[]){
  if(TIKTOK_UPDATES_PAUSED)return true;
  const tasks=[];
  if(channelRows.length){
    tasks.push(fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_channels?on_conflict=handle',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify(channelRows)
      }
    ).then(async r=>{
      if(!r.ok)throw new Error('tiktok_library_channels_write_'+r.status+':'+await r.text());
    }));
  }
  for(let i=0;i<videoRows.length;i+=200){
    const chunk=videoRows.slice(i,i+200);
    tasks.push(fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_videos?on_conflict=video_id',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify(chunk)
      }
    ).then(async r=>{
      if(!r.ok)throw new Error('tiktok_library_videos_write_'+r.status+':'+await r.text());
    }));
  }
  await Promise.all(tasks);
}
function validateTikTokCanonicalPackage(payload){
  if(!payload||payload.schema!=='tiktok-library-v3'||!Array.isArray(payload.channels)){
    throw new Error('tiktok_library_package_invalid_shape');
  }
  if(Number(payload.total)!==payload.channels.length){
    throw new Error('tiktok_library_package_total_mismatch');
  }
  const handles=new Set();
  let videoCount=0;
  for(const channel of payload.channels){
    const handle=normalizeTikTokHandle(channel?.handle||'');
    if(!handle)throw new Error('tiktok_library_package_invalid_handle');
    const key=handle.toLowerCase();
    if(handles.has(key))throw new Error('tiktok_library_package_duplicate_handle:'+handle);
    handles.add(key);
    if(!Array.isArray(channel?.videos))throw new Error('tiktok_library_package_invalid_videos:'+handle);
    const videoIds=new Set();
    for(const video of channel.videos){
      const id=String(video?.id||'');
      if(!/^\d{8,}$/.test(id))throw new Error('tiktok_library_package_invalid_video:'+handle);
      if(videoIds.has(id))throw new Error('tiktok_library_package_duplicate_video:'+id);
      videoIds.add(id);
      videoCount+=1;
    }
  }
  if(Number(payload.videoCount)!==videoCount){
    throw new Error('tiktok_library_package_video_count_mismatch');
  }
  return true;
}

async function persistTikTokCanonicalPackage(){
  if(TIKTOK_UPDATES_PAUSED){
    return tiktokFrozenLibraryPackage||buildTikTokCanonicalPackage();
  }
  const write=async()=>{
    // Build at execution time, not queue time, so concurrent updates collapse
    // into the newest package instead of fighting over the same singleton row.
    const payload=buildTikTokCanonicalPackage();
    // A fallback package is replaced only after a complete canonical snapshot
    // has been built and validated in memory. PostgREST upserts the singleton
    // row atomically, so a failed/partial rebuild leaves the previous package.
    validateTikTokCanonicalPackage(payload);
    if(tiktokCanonicalPersistedVersion===tiktokCanonicalPackageVersion)return payload;
    let lastError='';
    for(let attempt=0;attempt<3;attempt++){
      try{
        const r=await fetch(
          SUPABASE_URL+'/rest/v1/yt1988_tiktok_library_package?on_conflict=package_key',
          {
            method:'POST',
            headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
            body:JSON.stringify([{
              package_key:'library',
              version:tiktokCanonicalPackageVersion,
              payload,
              updated_at:nowIso()
            }]),
            signal:AbortSignal.timeout(15_000)
          }
        );
        if(r.ok){
          tiktokCanonicalPersistedVersion=tiktokCanonicalPackageVersion;
          tiktokFrozenLibraryPackage=payload;
          tiktokFrozenLibraryLoadedAt=Date.now();
          return payload;
        }
        lastError='tiktok_library_package_write_'+r.status+':'+compactText(await r.text(),180);
      }catch(error){
        lastError=compactText(error?.message||error,180);
      }
      if(attempt<2)await sleep(attempt===0?300:900);
    }
    // The in-memory canonical package remains valid and /tiktok/library can
    // still serve it. Never crash the collector because durable package write
    // is temporarily locked/timed out; the next canonical change retries it.
    console.warn('[tiktok-library] package persist deferred',lastError);
    return payload;
  };

  const run=(tiktokCanonicalWritePromise||Promise.resolve()).then(write,write);
  tiktokCanonicalWritePromise=run.catch(()=>null).finally(()=>{
    if(tiktokCanonicalWritePromise===run)tiktokCanonicalWritePromise=null;
  });
  return run;
}
async function mirrorTikTokOriginalImage(sourceUrl,kind,handle,id=''){
  const source=String(sourceUrl||'').trim();
  if(!/^https?:\/\//i.test(source))return '';
  const r=await fetch(source,{
    headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      'referer':'https://www.tiktok.com/@'+handle
    },
    redirect:'follow',
    signal:AbortSignal.timeout(10_000)
  });
  if(!r.ok)throw new Error('image_fetch_'+r.status);
  const mime=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const extMap={
    'image/jpeg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
    'image/gif':'gif'
  };
  const ext=extMap[mime];
  if(!ext)throw new Error('image_type_'+mime);
  const bytes=Buffer.from(await r.arrayBuffer());
  if(!bytes.length||bytes.length>10*1024*1024)throw new Error('image_size_'+bytes.length);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const safeHandle=normalizeTikTokHandle(handle)||'unknown';
  const parts=[kind,safeHandle];
  if(id)parts.push(String(id).replace(/[^A-Za-z0-9._-]/g,'_'));
  parts.push(hash+'.'+ext);
  const path=parts.join('/');
  const encoded=parts.map(encodeURIComponent).join('/');
  const upload=await fetch(
    SUPABASE_URL+'/functions/v1/tiktok-image-store',
    {
      method:'POST',
      headers:{
        'x-collector-token':COLLECTOR_TOKEN,
        'x-object-path':path,
        'content-type':mime
      },
      body:bytes,
      signal:AbortSignal.timeout(15_000)
    }
  );
  if(!upload.ok)throw new Error('image_store_'+upload.status+':'+compactText(await upload.text(),160));
  const saved=await upload.json();
  return String(saved?.url||(
    SUPABASE_URL+'/storage/v1/object/public/'+encodeURIComponent(TIKTOK_ORIGINAL_BUCKET)+'/'+encoded
  ));
}
async function cleanupTikTokOriginalStorage(){
  if(!SUPABASE_URL||!COLLECTOR_TOKEN)return 0;
  try{
    const r=await fetch(SUPABASE_URL+'/functions/v1/tiktok-image-store',{
      method:'POST',
      headers:{
        'x-collector-token':COLLECTOR_TOKEN,
        'x-cleanup':'orphans'
      },
      signal:AbortSignal.timeout(30_000)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(String(data?.error||('cleanup_http_'+r.status)));
    const deleted=Number(data?.deleted||0);
    if(deleted)console.log('[tiktok-storage] orphan cleanup','deleted='+deleted);
    return deleted;
  }catch(error){
    console.warn('[tiktok-storage] orphan cleanup failed',compactText(error?.message||error,160));
    return 0;
  }
}

async function mirrorTikTokCanonicalImages(limit=6){
  if(!tiktokCanonicalLoaded)return;
  const jobs=[];
  for(const row of tiktokCanonicalChannels.values()){
    if(jobs.length>=limit)break;
    if(row.avatar_source_url&&!row.avatar_stored_url){
      jobs.push({type:'channel-avatar',handle:row.handle,source:row.avatar_source_url});
    }
    if(jobs.length>=limit)break;
    if(row.live_cover_source_url&&!row.live_cover_stored_url){
      jobs.push({type:'live-cover',handle:row.handle,source:row.live_cover_source_url});
    }
  }
  if(jobs.length<limit){
    for(const row of tiktokCanonicalVideos.values()){
      if(jobs.length>=limit)break;
      if(row.cover_source_url&&!row.cover_stored_url){
        jobs.push({type:'video-cover',handle:row.handle,id:row.video_id,source:row.cover_source_url});
      }
    }
  }
  if(!jobs.length)return;

  const task=async()=>{
    const changedChannels=new Map();
    const changedVideos=new Map();
    for(const job of jobs){
      try{
        const stored=await mirrorTikTokOriginalImage(job.source,job.type,job.handle,job.id||'');
        if(!stored)continue;
        if(job.type==='video-cover'){
          const row=tiktokCanonicalVideos.get(String(job.id));
          if(row&&row.cover_source_url===job.source&&!row.cover_stored_url){
            row.cover_stored_url=stored;
            row.updated_at=nowIso();
            changedVideos.set(row.video_id,row);
          }
        }else{
          const row=tiktokCanonicalChannels.get(job.handle.toLowerCase());
          if(!row)continue;
          if(job.type==='channel-avatar'&&row.avatar_source_url===job.source&&!row.avatar_stored_url){
            row.avatar_stored_url=stored;
            row.updated_at=nowIso();
            changedChannels.set(row.handle.toLowerCase(),row);
          }
          if(job.type==='live-cover'&&row.live_cover_source_url===job.source&&!row.live_cover_stored_url){
            row.live_cover_stored_url=stored;
            row.updated_at=nowIso();
            changedChannels.set(row.handle.toLowerCase(),row);
          }
        }
      }catch(error){
        console.log('[tiktok-image] mirror failed',job.type,job.handle,compactText(error?.message||error,100));
      }
    }
    if(changedChannels.size||changedVideos.size){
      await upsertTikTokCanonicalRows([...changedChannels.values()],[...changedVideos.values()]);
      await persistTikTokCanonicalPackage();
      console.log('[tiktok-image] mirrored','channels='+changedChannels.size,'videos='+changedVideos.size);
    }
  };
  tiktokCanonicalImageSerial=tiktokCanonicalImageSerial.then(task,task);
  return tiktokCanonicalImageSerial;
}
async function syncTikTokCanonicalLibrary(handles=null,{profiles=null,mirror=false}={}){
  if(TIKTOK_UPDATES_PAUSED)return false;
  if(!await loadTikTokCanonicalStore())return false;
  const target=(handles&&handles.length)
    ? [...new Set(handles.map(normalizeTikTokHandle).filter(Boolean))]
    : [...tiktokLiveSelectedHandles];
  if(!target.length)return false;

  const channelRows=[];
  const videoRows=[];
  const profileMap=profiles instanceof Map?profiles:new Map();

  for(const handle of target){
    const key=handle.toLowerCase();
    const prev=tiktokCanonicalChannels.get(key)||canonicalChannelDefault(handle);
    const next={...prev,handle,selected:tiktokLiveSelectedHandles.has(handle),updated_at:nowIso()};
    const cached=profileMap.get(key)||tiktokProfileIdentityCache.get(key)?.data||null;
    if(cached){
      next.user_id=canonicalText(cached.userId,prev.user_id);
      next.sec_uid=canonicalText(cached.secUid,prev.sec_uid);
      next.display_name=canonicalProfileName(cached.nickname,handle,prev.display_name);
      next.bio=canonicalText(cached.bio,prev.bio);
      if(cached.verified!==undefined&&cached.verified!==null)next.verified=Boolean(cached.verified);
      const avatar=String(cached.avatar||'').trim();
      if(avatar&&avatar!==String(prev.avatar_source_url||'')){
        next.avatar_source_url=avatar;
        next.avatar_stored_url='';
      }
      next.follower_count=canonicalCount(cached.followerCount,prev.follower_count);
      next.following_count=canonicalCount(cached.followingCount,prev.following_count);
      next.heart_count=canonicalCount(cached.heartCount,prev.heart_count);
      next.video_count=canonicalCount(cached.videoCount,prev.video_count);
      const incomingSource=String(cached.source||'');
      const prevSource=String(prev.profile_source||'');
      const incomingWeak=/^yt-dlp(?:-video|-profile|-tiktokuser)?$/i.test(incomingSource);
      const prevRich=Boolean(
        prev.avatar_source_url||
        prev.follower_count||
        prev.following_count||
        prev.heart_count||
        (prev.display_name&&String(prev.display_name).toLowerCase()!==handle.toLowerCase())
      );
      if(!incomingWeak||!prevRich)next.profile_source=canonicalText(incomingSource,prevSource);
      next.profile_checked_at=nowIso();
    }

    const liveRow=tiktokLiveLibrary.get(key)||null;
    if(liveRow){
      const source=liveRow.live?currentTikTokLibrarySource(handle):null;
      const sourceType=String(source?.type||'').toLowerCase();
      const sourceUsable=Boolean(
        liveRow.live&&
        source?.url&&
        sourceType==='flv'&&
        tiktokLiveSourceUsable(source)
      );
      // Canonical/UI-facing LIVE means playable now. Detection/UNKNOWN state
      // stays internal in tiktokLiveLibrary and must never leak as a fake LIVE.
      next.live=sourceUsable;
      next.live_checked_at=liveRow.lastSeenAt?new Date(Number(liveRow.lastSeenAt)).toISOString():nowIso();
      if(liveRow.title)next.live_title=String(liveRow.title);
      const liveCover=String(liveRow.thumbnail||liveRow.cover||'').trim();
      if(liveCover&&liveCover!==String(prev.live_cover_source_url||'')){
        next.live_cover_source_url=liveCover;
        next.live_cover_stored_url='';
      }
      if(sourceUsable){
        const nextType=sourceType;
        const nextUrl=String(source.url||'');
        const nextSig=tiktokLibrarySourceSig(source);
        const streamChanged=
          nextType!==String(prev.live_stream_type||'')||
          nextUrl!==String(prev.live_stream_url||'')||
          nextSig!==String(prev.live_source_sig||'');
        next.live_stream_type=nextType;
        next.live_stream_url=nextUrl;
        next.live_source_sig=nextSig;
        if(streamChanged)next.live_updated_at=nowIso();
      }else{
        next.live_stream_type='';
        next.live_stream_url='';
        next.live_source_sig='';
      }
    }

    const videoRow=tiktokVideoLibrary.get(key)||null;
    if(videoRow?.secUid)next.sec_uid=canonicalText(videoRow.secUid,next.sec_uid);
    for(const video of Array.isArray(videoRow?.videos)?videoRow.videos:[]){
      seedTikTokVideoSource(handle,video);
      const merged=canonicalMergeVideo(handle,video);
      if(merged)videoRows.push(merged);
    }

    tiktokCanonicalChannels.set(key,next);
    channelRows.push(next);
  }

  await upsertTikTokCanonicalRows(channelRows,videoRows);
  await persistTikTokCanonicalPackage();
  // MP4 URLs are resolved on demand by playback. Metadata/profile sync must
  // not force yt-dlp refreshes for unrelated videos.
  if(mirror)void mirrorTikTokCanonicalImages(6);
  console.log('[tiktok-library] synced','channels='+channelRows.length,'videos='+videoRows.length,'version='+tiktokCanonicalPackageVersion);
  return true;
}
function queueTikTokCanonicalSync(handles=null){
  const list=(handles&&handles.length)?handles:[...tiktokLiveSelectedHandles];
  for(const raw of list){
    const handle=normalizeTikTokHandle(raw);
    if(handle)tiktokCanonicalPendingHandles.add(handle);
  }
  if(tiktokCanonicalSyncPromise)return tiktokCanonicalSyncPromise;
  tiktokCanonicalSyncPromise=(async()=>{
    while(tiktokCanonicalPendingHandles.size){
      const batch=[...tiktokCanonicalPendingHandles];
      tiktokCanonicalPendingHandles.clear();
      await syncTikTokCanonicalLibrary(batch,{mirror:false});
    }
  })().catch(error=>{
    console.warn('[tiktok-library] queued sync failed',compactText(error?.message||error,160));
  }).finally(()=>{tiktokCanonicalSyncPromise=null;});
  return tiktokCanonicalSyncPromise;
}
async function fetchTikTokMetaBundle(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return null;
  const run=async()=>{
    const wait=Math.max(0,1400-(Date.now()-tiktokCanonicalMetaLastAt));
    if(wait)await sleep(wait);
    tiktokCanonicalMetaLastAt=Date.now();
    const r=await fetch(
      SUPABASE_URL+'/functions/v1/tiktok-meta-bundle',
      {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-collector-token':COLLECTOR_TOKEN
        },
        body:JSON.stringify({handle,count:TIKTOK_LIBRARY_RECENT_VIDEOS}),
        signal:AbortSignal.timeout(20_000)
      }
    );
    if(!r.ok)throw new Error('tiktok_meta_bundle_'+r.status+':'+compactText(await r.text(),120));
    return await r.json();
  };
  const task=tiktokCanonicalMetaSerial.then(run,run);
  tiktokCanonicalMetaSerial=task.catch(()=>{});
  return task;
}
function parseTikTokMetaProfile(bundle){
  const root=bundle?.profile?.data||{};
  if(Number(root?.code)!==0)return null;
  const data=root?.data||{};
  const info=data?.userInfo||{};
  const user=info?.user||data?.user||{};
  const stats=info?.stats||data?.stats||{};
  const nickname=String(user?.nickname||user?.nickName||'').trim();
  const avatar=firstTikTokAssetUrl(
    user?.avatarLarger||
    user?.avatarMedium||
    user?.avatarThumb||
    user?.avatar_300x300||
    user?.avatar_168x168
  );
  if(!nickname&&!avatar&&!Object.keys(stats).length)return null;
  return {
    userId:String(user?.id||user?.uid||user?.userId||''),
    secUid:String(user?.secUid||user?.sec_uid||''),
    nickname,
    avatar,
    bio:String(user?.signature||user?.bio||''),
    verified:Boolean(user?.verified),
    followerCount:Number(stats?.followerCount||stats?.follower_count||0),
    followingCount:Number(stats?.followingCount||stats?.following_count||0),
    heartCount:Number(stats?.heartCount||stats?.heart||stats?.diggCount||0),
    videoCount:Number(stats?.videoCount||stats?.video_count||0),
    source:'tikwm-edge'
  };
}
function mergeTikTokMetaPosts(handle,bundle){
  const root=bundle?.posts?.data||{};
  if(Number(root?.code)!==0)return 0;
  const data=root?.data||{};
  const rows=
    (Array.isArray(data?.videos)&&data.videos)||
    (Array.isArray(data?.items)&&data.items)||
    [];
  let changed=0;
  for(const row of rows.slice(0,TIKTOK_LIBRARY_RECENT_VIDEOS)){
    const id=String(row?.id||row?.video_id||row?.aweme_id||'').trim();
    if(!/^\d{8,}$/.test(id))continue;
    // TikWM supplements metadata only. yt-dlp remains the discovery source.
    if(!tiktokCanonicalVideos.has(id))continue;
    const merged=canonicalMergeVideo(handle,{
      id,
      title:row?.title||row?.desc||row?.description||'',
      createTime:row?.create_time||row?.createTime||0,
      duration:row?.duration||0,
      cover:row?.cover||row?.origin_cover||row?.ai_dynamic_cover||'',
      width:row?.width||0,
      height:row?.height||0,
      playCount:row?.play_count||row?.playCount||0,
      diggCount:row?.digg_count||row?.diggCount||0,
      commentCount:row?.comment_count||row?.commentCount||0,
      shareCount:row?.share_count||row?.shareCount||0,
      collectCount:row?.collect_count||row?.collectCount||row?.bookmark_count||0
    });
    if(merged)changed+=1;
  }
  return changed;
}
async function refreshTikTokCanonicalProfileFastBatch(size=8){
  if(tiktokProfileBackfillBusy)return false;
  if(!await loadTikTokCanonicalStore())return false;
  const all=[...tiktokLiveSelectedHandles];
  if(!all.length)return false;

  const missing=all.filter(handle=>{
    const row=tiktokCanonicalChannels.get(handle.toLowerCase())||{};
    return !row.avatar_source_url||
      !row.follower_count||
      !row.display_name||
      String(row.display_name||'').toLowerCase()===handle.toLowerCase();
  });
  if(!missing.length)return true;

  const batch=[];
  for(let i=0;i<Math.min(size,missing.length);i++){
    batch.push(missing[(tiktokProfileBackfillCursor+i)%missing.length]);
  }
  tiktokProfileBackfillCursor=(tiktokProfileBackfillCursor+batch.length)%Math.max(1,missing.length);

  tiktokProfileBackfillBusy=true;
  try{
    const profiles=new Map();
    for(const handle of batch){
      const profile=await fetchTikwmProfileIdentity(handle).catch(()=>null);
      if(!profile)continue;
      const key=handle.toLowerCase();
      const cached=tiktokProfileIdentityCache.get(key)?.data||{};
      const merged=mergeTikTokProfileData(handle,cached,profile);
      profiles.set(key,merged);
      tiktokProfileIdentityCache.set(key,{at:Date.now(),data:merged});
    }
    if(profiles.size){
      await syncTikTokCanonicalLibrary(batch,{profiles,mirror:true});
    }
    console.log('[tiktok-profile-backfill]','batch='+batch.length,'ok='+profiles.size,'remaining='+Math.max(0,missing.length-profiles.size));
    return profiles.size>0;
  }finally{
    tiktokProfileBackfillBusy=false;
  }
}

async function refreshTikTokCanonicalProfileBatch(size=20){
  if(tiktokCanonicalMetaBusy)return false;
  if(!await loadTikTokCanonicalStore())return false;
  const list=[...tiktokLiveSelectedHandles];
  if(!list.length)return false;
  const batch=[];
  for(let i=0;i<Math.min(size,list.length);i++){
    batch.push(list[(tiktokCanonicalProfileCursor+i)%list.length]);
  }
  tiktokCanonicalProfileCursor=(tiktokCanonicalProfileCursor+batch.length)%list.length;

  tiktokCanonicalMetaBusy=true;
  try{
    const profiles=new Map();
    let postRows=0;
    let ok=0;
    for(const handle of batch){
      try{
        const bundle=await fetchTikTokMetaBundle(handle);
        const profile=parseTikTokMetaProfile(bundle);
        if(profile){
          const key=handle.toLowerCase();
          const cached=tiktokProfileIdentityCache.get(key)?.data||{};
          const mergedProfile=mergeTikTokProfileData(handle,cached,profile);
          profiles.set(key,mergedProfile);
          tiktokProfileIdentityCache.set(key,{at:Date.now(),data:mergedProfile});
          ok+=1;
        }
        postRows+=mergeTikTokMetaPosts(handle,bundle);
      }catch(error){
        console.log('[tiktok-meta] failed',handle,compactText(error?.message||error,120));
      }
    }

    let missing=batch.filter(handle=>!profiles.has(handle.toLowerCase()));
    if(missing.length){
      const browserProfiles=await browserTikTokProfileIdentities(missing).catch(()=>new Map());
      for(const handle of missing){
        const key=handle.toLowerCase();
        const profile=browserProfiles.get(key);
        if(!profile)continue;
        const cached=tiktokProfileIdentityCache.get(key)?.data||{};
        const mergedProfile=mergeTikTokProfileData(handle,cached,profile);
        profiles.set(key,mergedProfile);
        tiktokProfileIdentityCache.set(key,{at:Date.now(),data:mergedProfile});
        ok+=1;
      }
    }

    await syncTikTokCanonicalLibrary(batch,{profiles,mirror:true});
    console.log(
      '[tiktok-meta] batch',
      'channels='+batch.length,
      'profiles='+ok,
      'videos='+postRows,
      'browserFallback='+(batch.length-Math.min(batch.length,profiles.size))
    );
    return true;
  }finally{
    tiktokCanonicalMetaBusy=false;
  }
}
async function bootstrapTikTokCanonicalMeta(){
  if(!await loadTikTokCanonicalStore())return;
  const total=tiktokLiveSelectedHandles.size;
  const rounds=Math.ceil(total/20);
  for(let i=0;i<rounds;i++){
    await refreshTikTokCanonicalProfileBatch(20);
    await sleep(1200);
  }
}


const SESSION_CACHE_MS=60_000;
const sessionCache=new Map();
const sessionLoadPromises=new Map();

async function loadSession(platform){
  if(!BROWSER_PLATFORMS.has(platform))return null;

  const cached=sessionCache.get(platform);
  if(cached&&Date.now()-cached.at<SESSION_CACHE_MS)return cached.row;
  if(sessionLoadPromises.has(platform))return sessionLoadPromises.get(platform);

  const task=(async()=>{
    let lastError=null;
    for(let attempt=0;attempt<4;attempt+=1){
      try{
        const r=await fetch(
          SUPABASE_URL+'/rest/v1/yt1988_social_sessions?platform=eq.'+
          encodeURIComponent(platform)+'&select=state,updated_at&limit=1',
          {
            headers:storeHeaders(),
            signal:AbortSignal.timeout(7000)
          }
        );

        // Session reads are idempotent. A transient Supabase/PostgREST 5xx must
        // never be interpreted as "there is no TikTok login", especially during
        // a fresh Render deploy when losing cookies breaks restricted LIVE rooms.
        if(!r.ok){
          const error=new Error('session_read_'+r.status);
          lastError=error;
          if(r.status>=500&&attempt<3){
            await sleep([350,800,1600][attempt]||1600);
            continue;
          }
          throw error;
        }

        const rows=await r.json();
        const row=Array.isArray(rows)?rows[0]:null;
        sessionCache.set(platform,{row:row||null,at:Date.now()});
        return row||null;
      }catch(error){
        lastError=error;
        const retryable=
          /abort|timeout|fetch|network|socket|econn|session_read_5\d\d/i.test(
            String(error?.message||error)
          );
        if(retryable&&attempt<3){
          await sleep([350,800,1600][attempt]||1600);
          continue;
        }
        break;
      }
    }

    // If Supabase has a brief outage, prefer the last known login session
    // rather than hammering the same row and accidentally dropping cookies.
    if(cached)return cached.row;
    console.warn('[store] load session failed',platform,String(lastError?.message||lastError||'unknown'));
    return null;
  })().finally(()=>sessionLoadPromises.delete(platform));

  sessionLoadPromises.set(platform,task);
  return task;
}
async function saveSession(platform,state){
  if(!BROWSER_PLATFORMS.has(platform))return;
  try{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_social_sessions?on_conflict=platform',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify([{platform,state,updated_at:nowIso()}])
      }
    );
    if(!r.ok)throw new Error('session_write_'+r.status+':'+await r.text());
    sessionCache.set(platform,{row:{platform,state,updated_at:nowIso()},at:Date.now()});
    return true;
  }catch(error){
    console.warn('[store] save session failed',platform,String(error?.message||error));
    return false;
  }
}
async function loadSnapshot(platform){
  try{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_social_snapshots?platform=eq.'+
      encodeURIComponent(platform)+
      '&select=payload,status,collected_at,updated_at&limit=1',
      {headers:storeHeaders()}
    );
    if(!r.ok)throw new Error('snapshot_read_'+r.status);
    const rows=await r.json();
    const row=Array.isArray(rows)?rows[0]:null;
    if(row?.payload)memorySnapshots.set(platform,{
      payload:row.payload,
      status:row.status||'ok',
      collectedAt:row.collected_at||row.updated_at||null
    });
    return row||null;
  }catch(error){
    console.warn('[store] load snapshot failed',platform,String(error?.message||error));
    return null;
  }
}
async function saveSnapshot(platform,payload,status='ok'){
  const collectedAt=nowIso();
  memorySnapshots.set(platform,{payload,status,collectedAt});
  try{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_social_snapshots?on_conflict=platform',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify([{
          platform,payload,status,collected_at:collectedAt,updated_at:collectedAt
        }])
      }
    );
    if(!r.ok)throw new Error('snapshot_write_'+r.status+':'+await r.text());
  }catch(error){
    console.warn('[store] save snapshot failed',platform,String(error?.message||error));
  }
}

async function getBrowser(){
  if(!browserPromise){
    browserPromise=(async()=>{
      const executablePath=await chromium.executablePath();
      const args=await puppeteer.defaultArgs({
        args:[
          ...chromium.args,
          '--lang=vi-VN,vi',
          '--disable-dev-shm-usage',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',
        ],
        headless:'shell',
      });
      return puppeteer.launch({
        executablePath,
        args,
        headless:'shell',
        defaultViewport:{
          width:1365,
          height:900,
          deviceScaleFactor:1,
          isMobile:false,
          hasTouch:false,
          isLandscape:true,
        },
      });
    })().catch(error=>{
      browserPromise=null;
      throw error;
    });
  }
  const browser=await browserPromise;
  if(!browser.connected){
    browserPromise=null;
    return getBrowser();
  }
  return browser;
}
let tiktokLoginPage=null;
let tiktokLoginQr=null;
let tiktokLoginStatus='idle';
let tiktokLoginError='';
let tiktokLoginUpdatedAt=0;

function loginAuthorized(url){
  return Boolean(LOGIN_TOKEN)&&String(url.searchParams.get('key')||'')===LOGIN_TOKEN;
}
function html(res,status,body){
  res.writeHead(status,{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
  });
  res.end(body);
}
async function closeTikTokLogin(){
  const page=tiktokLoginPage;
  tiktokLoginPage=null;
  if(page)await page.close().catch(()=>{});
}
async function refreshTikTokLogin({capture=true}={}){
  const page=tiktokLoginPage;
  if(!page||page.isClosed()){
    if(tiktokLoginStatus!=='success')tiktokLoginStatus='idle';
    return;
  }
  try{
    const strongCookieNames=new Set([
      'sessionid','sessionid_ss','sid_tt','sid_guard','uid_tt','uid_tt_ss'
    ]);
    const readState=async()=>{
      const cookies=await page.cookies('https://www.tiktok.com/');
      const ui=await page.evaluate(()=>{
        const text=String(document.body?.innerText||'').replace(/\s+/g,' ').trim();
        const url=location.href;
        const hasProfile=Boolean(
          document.querySelector('[data-e2e="profile-icon"],[data-e2e="nav-profile"],a[href^="/@"] img')
        );
        const confirmed=/login successful|successfully logged in|đăng nhập thành công|đã đăng nhập|xác nhận đăng nhập thành công/i.test(text);
        return {url,hasProfile,confirmed,text:text.slice(0,900)};
      }).catch(()=>({url:page.url(),hasProfile:false,confirmed:false,text:''}));
      const strongCookie=cookies.some(cookie=>
        strongCookieNames.has(String(cookie?.name||'').toLowerCase())
        && String(cookie?.value||'').length>8
      );
      const leftLogin=!/\/login(?:\/|\?|$)/i.test(String(ui.url||''));
      return {cookies,ui,strongCookie,leftLogin};
    };

    let state=await readState();

    // TikTok sometimes leaves the QR page visible after the phone says success.
    // When the page itself reports confirmation, force one normal TikTok
    // navigation so Chromium receives the authenticated web session cookies.
    if(!state.strongCookie && state.ui.confirmed){
      await page.goto('https://www.tiktok.com/foryou?lang=vi-VN',{
        waitUntil:'domcontentloaded',
        timeout:20000
      }).catch(()=>{});
      await sleep(1200);
      state=await readState();
    }

    const loggedIn=state.strongCookie || (state.leftLogin && state.ui.hasProfile);
    if(loggedIn){
      await saveSession('tiktok',{cookies:cookieParams(state.cookies)});
      setTimeout(()=>{
        void enqueue(()=>collect('tiktok')).catch(error=>
          console.warn('[tiktok-login] post-login collect',String(error?.message||error))
        );
      },1200).unref();
      tiktokLoginStatus='success';
      tiktokLoginError='';
      tiktokLoginQr=null;
      tiktokLoginUpdatedAt=Date.now();
      console.log('[tiktok-login] authenticated cookies='+state.cookies.length);
      setTimeout(()=>{void closeTikTokLogin();},1500).unref();
      return;
    }

    tiktokLoginStatus='waiting';
    if(capture){
      tiktokLoginQr=await page.screenshot({type:'png',fullPage:false}).catch(()=>null);
    }
    tiktokLoginUpdatedAt=Date.now();
  }catch(error){
    tiktokLoginStatus='error';
    tiktokLoginError=String(error?.message||error);
    tiktokLoginUpdatedAt=Date.now();
  }
}
async function startTikTokLogin({restart=false}={}){
  if(restart)await closeTikTokLogin();
  if(tiktokLoginPage&&!tiktokLoginPage.isClosed()){
    await refreshTikTokLogin({capture:true});
    return;
  }

  tiktokLoginStatus='starting';
  tiktokLoginError='';
  tiktokLoginQr=null;
  tiktokLoginUpdatedAt=Date.now();

  const browser=await getBrowser();
  const page=await browser.newPage();
  tiktokLoginPage=page;
  await page.setViewport({width:900,height:760,deviceScaleFactor:2});
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});
  await page.emulateTimezone(TZ).catch(()=>{});
  await page.goto('https://www.tiktok.com/login/qrcode?lang=vi-VN',{
    waitUntil:'domcontentloaded',
    timeout:30000
  });
  await sleep(2200);
  await refreshTikTokLogin({capture:true});
}
function tiktokLoginHtml(key){
  const safeKey=JSON.stringify(String(key||''));
  return `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đăng nhập TikTok · 1988</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:18px;background:#0f0f0f;color:#f1f1f1;font-family:Arial,sans-serif}
.card{width:min(520px,100%);padding:18px;border:1px solid #303030;border-radius:18px;background:#181818;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.45;color:#aaa;margin:0 0 12px}
.qr{width:100%;max-height:560px;overflow:hidden;border-radius:14px;background:#fff}
.qr img{display:block;width:100%;height:auto}
.status{margin:12px 0;min-height:20px;font-size:14px}.ok{color:#62d26f}.err{color:#ff6b6b}
button{border:0;border-radius:18px;padding:9px 15px;background:#2f2f2f;color:#fff;cursor:pointer}
</style></head><body><div class="card">
<h1>Đăng nhập TikTok cho 1988</h1>
<p>Mở TikTok trên điện thoại, quét QR trong ảnh và xác nhận đăng nhập.</p>
<div class="qr" id="qr"><span>Đang tạo QR…</span></div>
<div class="status" id="status">Đang khởi tạo…</div>
<button id="restart">Tạo QR mới</button>
</div><script>
const key=${safeKey},qr=document.getElementById('qr'),status=document.getElementById('status');
let qrLoaded=false;
function loadQr(force=false){
  if(qrLoaded&&!force)return;
  qrLoaded=true;
  const img=new Image();
  img.alt='TikTok QR';
  img.onload=()=>{qr.replaceChildren(img);};
  img.onerror=()=>{
    qrLoaded=false;
    qr.innerHTML='<span>Chưa lấy được QR, đang thử lại…</span>';
    setTimeout(()=>loadQr(false),1200);
  };
  img.src='/login/tiktok/qr?key='+encodeURIComponent(key)+'&_='+Date.now();
}
async function poll(){
  try{
    const r=await fetch('/login/tiktok/status?key='+encodeURIComponent(key)+'&_='+Date.now(),{cache:'no-store'});
    const j=await r.json();
    if(j.status==='success'){
      status.className='status ok';
      status.textContent='Đã đăng nhập và lưu phiên TikTok.';
      qr.innerHTML='<div style="padding:60px;color:#111;font-size:36px">✓</div>';
      return;
    }
    status.className=j.status==='error'?'status err':'status';
    if(j.status==='error')status.textContent=j.error||'Có lỗi';
    else if(j.status==='starting')status.textContent='Đang tạo QR…';
    else if(j.status==='scanned')status.textContent='Đã quét QR — hãy xác nhận đăng nhập trên TikTok…';
    else if(j.status==='confirming')status.textContent='Đã xác nhận — đang lưu phiên TikTok…';
    else if(j.status==='expired')status.textContent='QR đã hết hạn — bấm Tạo QR mới.';
    else status.textContent='Đang chờ bạn quét QR và xác nhận trên TikTok…';
    if(!qrLoaded)loadQr(false);
  }catch{
    status.className='status err';
    status.textContent='Chưa kết nối được Render.';
  }
  setTimeout(poll,2000);
}
document.getElementById('restart').onclick=async()=>{
  status.className='status';
  status.textContent='Đang tạo QR mới…';
  qrLoaded=false;
  qr.innerHTML='<span>Đang tạo QR mới…</span>';
  await fetch('/login/tiktok/restart?key='+encodeURIComponent(key),{cache:'no-store'});
  setTimeout(()=>loadQr(true),900);
};
loadQr(false);
poll();
</script></body></html>`;
}

function cookieHeaderValue(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .filter(row=>row?.name&&row?.value)
    .map(row=>String(row.name)+'='+String(row.value))
    .join('; ');
}
function mergeTikTokCookiePairs(header='',setCookies=[]){
  const jar=new Map();
  for(const part of String(header||'').split(';')){
    const i=part.indexOf('=');
    if(i<=0)continue;
    jar.set(part.slice(0,i).trim(),part.slice(i+1).trim());
  }
  for(const raw of Array.isArray(setCookies)?setCookies:[]){
    const first=String(raw||'').split(';',1)[0];
    const i=first.indexOf('=');
    if(i<=0)continue;
    jar.set(first.slice(0,i).trim(),first.slice(i+1).trim());
  }
  return [...jar.entries()].map(([k,v])=>k+'='+v).join('; ');
}

async function refreshTikTokApiCookieHeader({force=false}={}){
  if(tiktokApiCookieRefreshPromise)return tiktokApiCookieRefreshPromise;
  const cookieAge=Date.now()-Number(tiktokApiCookieRefreshAt||0);
  if(tiktokApiCookieHeader&&(
    (!force&&cookieAge<10*60*1000)||
    (force&&cookieAge<30_000)
  )){
    return tiktokApiCookieHeader;
  }

  tiktokApiCookieRefreshPromise=(async()=>{
    const row=await loadSession('tiktok').catch(()=>null);
    const saved=cookieHeaderValue(row?.state?.cookies||[]);
    let header=saved;

    // Bootstrap the same first-party web session TikTok itself uses.
    // The homepage response supplies/refreshes ttwid; then the internal LIVE
    // API request reuses that cookie jar instead of behaving like a stateless bot.
    try{
      const r=await fetch('https://www.tiktok.com/',{
        headers:{
          'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          ...(saved?{'cookie':saved}:{})
        },
        redirect:'follow',
        signal:AbortSignal.timeout(5000)
      });
      const setCookies=typeof r.headers?.getSetCookie==='function'
        ? r.headers.getSetCookie()
        : [];
      header=mergeTikTokCookiePairs(saved,setCookies);
    }catch(error){
      console.log('[tiktok-api] cookie bootstrap failed',compactText(error?.message||error,120));
    }

    // Never cache an empty cookie result for ten minutes. A transient store
    // failure on boot should be retried on the next LIVE check, not treated as
    // an anonymous TikTok session.
    if(header){
      tiktokApiCookieHeader=header;
      tiktokApiCookieRefreshAt=Date.now();
    }else{
      tiktokApiCookieRefreshAt=0;
    }

    const names=new Set(
      String(header||'').split(';').map(x=>x.trim().split('=',1)[0]).filter(Boolean)
    );
    console.log(
      '[tiktok-api] cookie bootstrap',
      'count='+names.size,
      'ttwid='+(names.has('ttwid')?'yes':'no'),
      'session='+(names.has('sessionid')||names.has('sessionid_ss')||names.has('sid_tt')?'yes':'no'),
      'idc='+(names.has('tt-target-idc')?'yes':'no')
    );
    return header;
  })().finally(()=>{tiktokApiCookieRefreshPromise=null});

  return tiktokApiCookieRefreshPromise;
}

async function loadTikTokApiCookieHeader(){
  return refreshTikTokApiCookieHeader({force:true});
}

function cookieParams(rows=[]){
  return rows.map(row=>{
    const out={
      name:String(row?.name||''),
      value:String(row?.value||''),
      domain:String(row?.domain||''),
      path:String(row?.path||'/'),
      secure:Boolean(row?.secure),
      httpOnly:Boolean(row?.httpOnly),
    };
    if(Number.isFinite(Number(row?.expires))&&Number(row.expires)>0)out.expires=Number(row.expires);
    if(['Strict','Lax','None'].includes(row?.sameSite))out.sameSite=row.sameSite;
    return out;
  }).filter(row=>row.name&&row.domain);
}
const tiktokQrLogin=createTikTokLoginRuntime({
  getBrowser,
  loadSession,
  saveSession,
  normalizeCookies:cookieParams,
  sleep,
  logger:console,
});

async function openPlatform(platform){
  const browser=await getBrowser();
  const page=await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});
  await page.emulateTimezone(TZ).catch(()=>{});

  const stored=await loadSession(platform);
  const cookies=cookieParams(stored?.state?.cookies||[]);
  if(cookies.length){
    await page.setCookie(...cookies).catch(error=>{
      console.warn('[session] restore failed',platform,String(error?.message||error));
    });
  }

  await page.setRequestInterception(true);
  page.on('request',request=>{
    const type=request.resourceType();
    if(type==='font'||type==='media'){
      request.abort().catch(()=>{});
    }else{
      request.continue().catch(()=>{});
    }
  });

  return {
    page,
    async close(){
      try{
        const current=await page.cookies();
        if(current.length)await saveSession(platform,{cookies:current});
      }catch(error){
        console.warn('[session] export failed',platform,String(error?.message||error));
      }
      await page.close().catch(()=>{});
    }
  };
}

async function scroll(page,passes=4){
  for(let i=0;i<passes;i+=1){
    await page.evaluate(()=>window.scrollBy(0,Math.max(window.innerHeight,850))).catch(()=>{});
    await sleep(550);
  }
}
async function goto(page,url,timeout=18000){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout}).catch(error=>{
    console.warn('[page] goto',url,String(error?.message||error));
  });
  await sleep(1200);
}

async function readTikTokCurrentAccount(page){
  return page.evaluate(()=>{
    const profileSelectors=[
      '[data-e2e="profile-icon"]',
      '[data-e2e="nav-profile"]',
      'a[href^="/@"][aria-label*="rofile" i]',
      'a[href^="/@"][aria-label*="ồ sơ" i]'
    ];
    let handle='';
    for(const selector of profileSelectors){
      const el=document.querySelector(selector);
      const anchor=el?.closest?.('a[href]')||el;
      const href=String(anchor?.getAttribute?.('href')||anchor?.href||'');
      const m=href.match(/\/@([^/?#]+)/);
      if(m){handle=m[1];break;}
    }

    let numericId='';
    try{
      const script=document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if(script?.textContent){
        const data=JSON.parse(script.textContent);
        const user=data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
        if(!handle&&user?.uniqueId)handle=String(user.uniqueId);
        if(user?.id)numericId=String(user.id);
      }
    }catch{}

    return {handle,numericId};
  }).catch(()=>({handle:'',numericId:''}));
}

function firstText(...values){
  for(const value of values){
    const text=String(value??'').trim();
    if(text)return text;
  }
  return '';
}
function firstNumericId(...values){
  for(const value of values){
    const text=String(value??'').trim();
    if(/^\d{6,30}$/.test(text))return text;
  }
  return '';
}
function imageUrl(value){
  if(!value)return '';
  if(typeof value==='string')return /^https?:\/\//i.test(value)?value:'';
  if(Array.isArray(value)){
    for(const item of value){
      const found=imageUrl(item);
      if(found)return found;
    }
    return '';
  }
  if(typeof value==='object'){
    return imageUrl(
      value.url_list||
      value.urlList||
      value.urls||
      value.url||
      value.uri
    );
  }
  return '';
}
function liveRoomFromObject(node){
  if(!node||typeof node!=='object'||Array.isArray(node))return null;

  const owner=node.owner||node.user||node.author||node.anchor||node.host||null;
  const handle=firstText(
    owner?.unique_id,owner?.uniqueId,owner?.sec_uid&&owner?.display_id,
    node.unique_id,node.uniqueId,node.owner_unique_id,node.ownerUniqueId
  ).replace(/^@/,'');
  const roomId=firstNumericId(
    node.room_id,node.roomId,node.room_id_str,node.roomIdStr,
    node?.room?.id,node?.room?.room_id,node?.room?.roomId
  );
  const streamLike=Boolean(
    node.stream_url||node.streamUrl||node.stream_data||node.streamData||
    node.pull_data||node.pullData||
    node.live_room_mode||node.liveRoomMode
  );
  const liveFlag=Boolean(
    node.is_live===true||node.isLive===true||
    String(node.live_status??node.liveStatus??'')==='1'||
    String(node.status??'')==='2'||
    String(node.room_status??node.roomStatus??'')==='2'||
    streamLike
  );

  if(!roomId&&!handle)return null;
  if(!liveFlag&&!streamLike)return null;

  const title=firstText(
    node.title,node.room_title,node.roomTitle,node.description,
    node?.room?.title,
    handle?('@'+handle+' đang LIVE'):'TikTok LIVE'
  );
  const thumbnail=imageUrl(
    node.cover||node.room_cover||node.roomCover||
    node.background||node?.room?.cover||
    owner?.avatar_larger||owner?.avatarLarger||owner?.avatar_medium||owner?.avatarMedium
  );
  const url=firstText(
    node.share_url,node.shareUrl,node.web_url,node.webUrl,
    handle?('https://www.tiktok.com/@'+handle+'/live'):''
  );

  return {
    id:roomId?('room:'+roomId):(handle?('live:'+handle.toLowerCase()):''),
    roomId,
    handle,
    title,
    thumbnail,
    url,
    live:true,
    origin:'network'
  };
}
function collectLiveRoomsFromJson(payload,max=120){
  const out=[];
  const seenObjects=new Set();
  const seenKeys=new Set();
  const walk=(value,depth=0)=>{
    if(out.length>=max||depth>9||value==null)return;
    if(Array.isArray(value)){
      for(const item of value)walk(item,depth+1);
      return;
    }
    if(typeof value!=='object')return;
    if(seenObjects.has(value))return;
    seenObjects.add(value);

    const room=liveRoomFromObject(value);
    if(room?.id&&!seenKeys.has(room.id)){
      seenKeys.add(room.id);
      out.push(room);
    }
    for(const child of Object.values(value))walk(child,depth+1);
  };
  walk(payload,0);
  return out;
}
async function attachTikTokLiveNetworkCollector(page,rows){
  const pending=new Set();
  const handler=response=>{
    try{
      const url=String(response.url()||'');
      if(!/tiktok\.com|tiktokv\.com|byteoversea\.com/i.test(url))return;
      if(!/live|room|recommend|feed|webcast|aweme/i.test(url))return;
      const task=(async()=>{
        const headers=response.headers?.()||{};
        const type=String(headers['content-type']||headers['Content-Type']||'');
        if(type&&!/json|text/i.test(type))return;
        const text=await response.text().catch(()=>null);
        if(!text||text.length>8_000_000)return;
        let data;
        try{data=JSON.parse(text);}catch{return;}
        const found=collectLiveRoomsFromJson(data,100);
        if(found.length){
          rows.push(...found);
          console.log('[tiktok-live-network]',found.length,url.slice(0,180));
        }
      })();
      pending.add(task);
      task.finally(()=>pending.delete(task));
    }catch{}
  };
  page.on('response',handler);
  return {
    async flush(){
      if(pending.size)await Promise.allSettled([...pending]);
    },
    detach(){
      page.off('response',handler);
    }
  };
}

async function collectTikTok(){
  const runtime=await openPlatform('tiktok');
  const {page}=runtime;
  const rows=[];
  const network=await attachTikTokLiveNetworkCollector(page,rows);
  try{
    for(const url of [
      'https://www.tiktok.com/foryou?lang=vi-VN&region=VN',
      'https://www.tiktok.com/live?lang=vi-VN&region=VN',
    ]){
      await goto(page,url,16000);
      await scroll(page,4);
      const found=await page.evaluate(()=>{
        const out=[];
        for(const a of document.querySelectorAll('a[href]')){
          const href=String(a.href||'');
          const liveMatch=href.match(/tiktok\.com\/@([^/?#]+)\/live/i);
          const videoMatch=href.match(/tiktok\.com\/@([^/?#]+)\/video\/(\d{12,24})/i);
          const card=a.closest('[data-e2e],article,div');
          const text=String(card?.innerText||a.innerText||'').replace(/\s+/g,' ').trim();
          const img=card?.querySelector('img');
          const thumbnail=String(img?.currentSrc||img?.src||'');
          if(liveMatch){
            out.push({
              id:'live:'+liveMatch[1].toLowerCase(),
              handle:liveMatch[1],
              title:text.slice(0,300)||('@'+liveMatch[1]+' đang LIVE'),
              thumbnail,
              url:'https://www.tiktok.com/@'+liveMatch[1]+'/live',
              live:true
            });
          }else if(videoMatch){
            out.push({
              id:videoMatch[2],
              handle:videoMatch[1],
              title:text.slice(0,300),
              thumbnail,
              url:'https://www.tiktok.com/@'+videoMatch[1]+'/video/'+videoMatch[2],
              live:/\bLIVE\b|TRỰC TIẾP/i.test(text)
            });
          }
        }
        return out;
      }).catch(()=>[]);
      rows.push(...found);
      await network.flush();
    }
    await sleep(900);
    await network.flush();

    const unique=uniq(rows,row=>row.roomId||row.id||row.url,120).map(row=>({
      platform:'tiktok',
      ...row,
      sourceName:'@'+String(row.handle||''),
      isLive:Boolean(row.live),
      collectedAt:nowIso(),
    }));

    // Read the signed-in profile from a normal TikTok page after the feed pass.
    await goto(page,'https://www.tiktok.com/foryou?lang=vi-VN&region=VN',16000);
    const account=await readTikTokCurrentAccount(page);
    const liveSample=unique.filter(row=>row.isLive).slice(0,6).map(row=>({
      id:row.id,
      handle:row.handle,
      url:row.url,
      title:row.title
    }));
    console.log(
      '[tiktok-sample]',
      'account='+(account.handle?'@'+account.handle:'unknown'),
      'uid='+(account.numericId||'unknown'),
      'live='+liveSample.map(x=>'@'+x.handle).join(',')
    );

    return {
      platform:'tiktok',
      account,
      sessionRestored:Boolean((await loadSession('tiktok'))?.state?.cookies?.length),
      count:unique.length,
      liveCount:unique.filter(row=>row.isLive).length,
      liveSample,
      items:unique,
    };
  }finally{
    network.detach();
    await runtime.close();
  }
}

async function youtubeRows(page,origin){
  return page.evaluate((originLabel)=>{
    const out=[];
    const cards=document.querySelectorAll(
      'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer'
    );
    for(const card of cards){
      const a=card.querySelector('a#video-title-link,a#video-title,a[href^="/watch?v="]');
      const href=String(a?.href||'');
      const m=href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if(!m)continue;
      const title=String(a?.getAttribute('title')||a?.textContent||'').replace(/\s+/g,' ').trim();
      const source=String(
        card.querySelector('ytd-channel-name a,#channel-name a,a.yt-simple-endpoint.style-scope.yt-formatted-string')?.textContent||''
      ).replace(/\s+/g,' ').trim();
      const meta=String(card.innerText||'').replace(/\s+/g,' ').trim();
      const img=card.querySelector('img');
      out.push({
        id:m[1],
        url:'https://www.youtube.com/watch?v='+m[1],
        title,
        sourceName:source,
        thumbnail:String(img?.currentSrc||img?.src||''),
        isLive:/TRỰC TIẾP|ĐANG PHÁT TRỰC TIẾP|LIVE NOW|\bLIVE\b/i.test(meta),
        meta:meta.slice(0,500),
        origin:originLabel
      });
    }
    return out;
  },origin).catch(()=>[]);
}
async function collectYouTube(){
  const runtime=await openPlatform('youtube');
  const {page}=runtime;
  const rows=[];
  try{
    for(const [origin,url] of [
      ['home','https://www.youtube.com/'],
      ['subscriptions','https://www.youtube.com/feed/subscriptions'],
    ]){
      await goto(page,url,18000);
      await scroll(page,3);
      rows.push(...await youtubeRows(page,origin));
    }
    const unique=uniq(rows,row=>row.id,100).map(row=>({
      platform:'youtube',
      ...row,
      collectedAt:nowIso(),
    }));
    return {
      platform:'youtube',
      count:unique.length,
      liveCount:unique.filter(row=>row.isLive).length,
      items:unique
    };
  }finally{
    await runtime.close();
  }
}

async function facebookRows(page,origin){
  return page.evaluate((originLabel)=>{
    const out=[];
    const seen=new Set();
    for(const a of document.querySelectorAll('a[href]')){
      const href=String(a.href||'');
      if(!/facebook\.com\//i.test(href))continue;
      if(!/(\/videos\/|\/live\/|watch\/\?v=|watch\/live)/i.test(href))continue;
      const article=a.closest('[role="article"]')||a.closest('div');
      const text=String(article?.innerText||a.innerText||'').replace(/\s+/g,' ').trim();
      const img=article?.querySelector('img');
      const clean=href.split('#')[0];
      if(seen.has(clean))continue;
      seen.add(clean);
      out.push({
        id:clean,
        url:clean,
        title:text.slice(0,400),
        sourceName:'',
        thumbnail:String(img?.currentSrc||img?.src||''),
        isLive:/đang phát trực tiếp|trực tiếp|\blive\b/i.test(text),
        origin:originLabel
      });
      if(out.length>=80)break;
    }
    return out;
  },origin).catch(()=>[]);
}
async function collectFacebook(){
  const runtime=await openPlatform('facebook');
  const {page}=runtime;
  const rows=[];
  try{
    for(const [origin,url] of [
      ['home','https://www.facebook.com/'],
      ['live','https://www.facebook.com/watch/live/'],
    ]){
      await goto(page,url,20000);
      await scroll(page,3);
      rows.push(...await facebookRows(page,origin));
    }
    const unique=uniq(rows,row=>row.id,100).map(row=>({
      platform:'facebook',
      ...row,
      collectedAt:nowIso(),
    }));
    return {
      platform:'facebook',
      count:unique.length,
      liveCount:unique.filter(row=>row.isLive).length,
      items:unique
    };
  }finally{
    await runtime.close();
  }
}

const RSS=[
  ['vnexpress','https://vnexpress.net/rss/tin-moi-nhat.rss'],
  ['dantri','https://dantri.com.vn/rss/home.rss'],
  ['tuoitre','https://tuoitre.vn/rss/tin-moi-nhat.rss'],
  ['vietnamnet','https://vietnamnet.vn/rss/tin-moi-nhat.rss'],
  ['thanhnien','https://thanhnien.vn/rss/home.rss'],
];
function xmlText(value=''){
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}
function tag(block,name){
  const m=String(block).match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return m?xmlText(m[1]):'';
}
async function collectNews(){
  const rows=[];
  for(const [source,url] of RSS){
    try{
      const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 1988-news/1.0'}});
      if(!r.ok)continue;
      const xml=await r.text();
      const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
      for(const item of items.slice(0,18)){
        const link=tag(item,'link');
        const title=tag(item,'title');
        if(!link||!title)continue;
        rows.push({
          platform:'news',
          id:link,
          url:link,
          title,
          sourceName:source,
          description:tag(item,'description').slice(0,500),
          publishedAt:tag(item,'pubDate'),
          isLive:false,
          collectedAt:nowIso(),
        });
      }
    }catch(error){
      console.warn('[news] rss failed',source,String(error?.message||error));
    }
  }
  const unique=uniq(rows,row=>row.url,100);
  return {platform:'news',count:unique.length,liveCount:0,items:unique};
}

const collectors={
  tiktok:collectTikTok,
  youtube:collectYouTube,
  facebook:collectFacebook,
  news:collectNews,
};

async function collect(platform){
  if(!PLATFORMS.has(platform))throw new Error('invalid_platform');
  const started=Date.now();
  lastRuns.set(platform,{status:'running',startedAt:nowIso()});
  try{
    const payload=await collectors[platform]();
    await saveSnapshot(platform,payload,'ok');
    lastRuns.set(platform,{
      status:'ok',
      startedAt:lastRuns.get(platform)?.startedAt||nowIso(),
      finishedAt:nowIso(),
      ms:Date.now()-started,
      count:Number(payload?.count||0),
      liveCount:Number(payload?.liveCount||0),
    });
    console.log('[collect]',platform,'count='+Number(payload?.count||0),'live='+Number(payload?.liveCount||0),'ms='+(Date.now()-started));
    return payload;
  }catch(error){
    const message=String(error?.message||error);
    lastRuns.set(platform,{
      status:'error',
      startedAt:lastRuns.get(platform)?.startedAt||nowIso(),
      finishedAt:nowIso(),
      ms:Date.now()-started,
      error:message,
    });
    console.error('[collect]',platform,message);
    throw error;
  }
}
async function collectAll(){
  const out={};
  for(const platform of ['tiktok']){
    try{out[platform]=await collect(platform);}
    catch(error){out[platform]={platform,error:String(error?.message||error)};}
  }
  return out;
}

async function getSnapshot(platform){
  const memory=memorySnapshots.get(platform);
  if(memory)return memory;
  const stored=await loadSnapshot(platform);
  if(!stored)return null;
  return {
    payload:stored.payload||null,
    status:stored.status||null,
    collectedAt:stored.collected_at||stored.updated_at||null
  };
}

async function schedulerTick(){
  if(!AUTO_COLLECT)return;
  const now=Date.now();
  for(const platform of ['tiktok']){
    const last=lastRuns.get(platform);
    const lastAt=Date.parse(last?.finishedAt||last?.startedAt||0)||0;
    if(now-lastAt<intervals[platform])continue;
    await enqueue(()=>collect(platform)).catch(()=>{});
  }
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){
    json(res,204,{});
    return;
  }
  const url=new URL(req.url||'/','http://localhost');

  if(url.pathname==='/health'){
    json(res,200,{
      ok:true,
      service:'1988-social-collector',
      browser:Boolean(browserPromise),
      queueDepth,
      autoCollect:AUTO_COLLECT,
      lastRuns:Object.fromEntries(lastRuns),
      login:tiktokQrLogin.snapshot(),
      now:nowIso(),
    });
    return;
  }

  if(url.pathname==='/login/tiktok'){
    if(!loginAuthorized(url)){
      html(res,403,'<!doctype html><meta charset="utf-8"><p>Link đăng nhập không hợp lệ.</p>');
      return;
    }
    html(res,200,tiktokLoginHtml(url.searchParams.get('key')||''));
    void tiktokQrLogin.start().catch(error=>{
      console.error('[tiktok-login] background start',String(error?.message||error));
    });
    return;
  }

  if(url.pathname==='/login/tiktok/status'){
    if(!loginAuthorized(url)){json(res,403,{ok:false,error:'invalid_login_link'});return;}
    json(res,200,{ok:true,...tiktokQrLogin.snapshot()});
    return;
  }

  if(url.pathname==='/login/tiktok/qr'){
    if(!loginAuthorized(url)){res.writeHead(403,{'cache-control':'no-store'});res.end();return;}
    const image=tiktokQrLogin.qr();
    if(!image){
      res.writeHead(202,{
        'cache-control':'no-store',
        'retry-after':'1'
      });
      res.end();
      return;
    }
    res.writeHead(200,{
      'content-type':'image/png',
      'cache-control':'no-store',
      'content-length':String(image.length)
    });
    res.end(image);
    return;
  }

  if(url.pathname==='/login/tiktok/restart'){
    if(!loginAuthorized(url)){json(res,403,{ok:false,error:'invalid_login_link'});return;}
    json(res,202,{ok:true,status:'starting'});
    void tiktokQrLogin.start({restart:true}).catch(error=>{
      console.error('[tiktok-login] background restart',String(error?.message||error));
    });
    return;
  }

  if(url.pathname==='/tiktok-info'){
    try{
      const session=await loadSession('tiktok');
      const cookies=cookieParams(session?.state?.cookies||[]);
      const browser=await getBrowser();
      const page=await browser.newPage();
      try{
        if(cookies.length)await page.setCookie(...cookies).catch(()=>{});
        await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});
        await page.goto('https://www.tiktok.com/foryou?lang=vi-VN&region=VN',{
          waitUntil:'domcontentloaded',
          timeout:20000
        }).catch(()=>{});
        await sleep(1200);

        const account=await page.evaluate(()=>{
          const body=String(document.body?.innerText||'').replace(/\s+/g,' ').trim();
          const profileAnchor=[...document.querySelectorAll('a[href^="/@"]')]
            .find(a=>a.querySelector('img')||/profile|hồ sơ|trang cá nhân/i.test(String(a.textContent||'')));
          const href=String(profileAnchor?.getAttribute('href')||'');
          const m=href.match(/^\/@([^/?#]+)/);
          const username=m?m[1]:null;
          return {
            username,
            profileUrl:username?('https://www.tiktok.com/@'+username):null,
            loggedIn:Boolean(username)||!/Log in|Đăng nhập/i.test(body.slice(0,1200))
          };
        }).catch(()=>({username:null,profileUrl:null,loggedIn:false}));

        await page.goto('https://www.tiktok.com/live?lang=vi-VN&region=VN',{
          waitUntil:'domcontentloaded',
          timeout:20000
        }).catch(()=>{});
        await sleep(1400);
        for(let i=0;i<3;i+=1){
          await page.evaluate(()=>window.scrollBy(0,Math.max(700,innerHeight*.8))).catch(()=>{});
          await sleep(450);
        }

        const lives=await page.evaluate(()=>{
          const out=[]; const seen=new Set();
          for(const a of document.querySelectorAll('a[href]')){
            const href=String(a.href||'');
            const m=href.match(/tiktok\.com\/@([^/?#]+)\/live/i);
            if(!m)continue;
            const id=m[1];
            if(seen.has(id))continue;
            seen.add(id);
            const card=a.closest('[data-e2e],article,div');
            const text=String(card?.innerText||a.innerText||'').replace(/\s+/g,' ').trim();
            out.push({
              id,
              url:'https://www.tiktok.com/@'+id+'/live',
              title:text.slice(0,160)
            });
            if(out.length>=5)break;
          }
          return out;
        }).catch(()=>[]);

        json(res,200,{
          ok:true,
          account,
          liveCount:lives.length,
          lives
        });
      }finally{
        await page.close().catch(()=>{});
      }
    }catch(error){
      json(res,502,{ok:false,error:String(error?.message||error)});
    }
    return;
  }

  if(url.pathname==='/tiktok/selected-channel'&&req.method==='POST'){
    if(!trustedTikTokUiMutation(req)){
      json(res,403,{ok:false,error:'forbidden'});
      return;
    }

    try{
      const body=await readJson(req,4096);
      const handle=normalizeTikTokHandle(body?.handle||body?.user||'');
      if(!handle){
        json(res,400,{ok:false,error:'invalid_tiktok_handle'});
        return;
      }

      const selected=body?.selected!==false&&String(body?.action||'save').toLowerCase()!=='remove';
      const key=handle.toLowerCase();
      const existingHandle=[...tiktokLiveSelectedHandles]
        .find(item=>String(item||'').toLowerCase()===key)||'';
      const had=Boolean(existingHandle);

      // Membership mutations are idempotent. Re-adding the same channel is a
      // strict no-op so it cannot create duplicate work, duplicate rows or a
      // second scan just because casing/input format differs.
      if(selected&&had){
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

      // Never persist an arbitrary syntactically-valid handle. Verify the
      // exact TikTok account first; use the browser-backed user-detail lookup
      // only as a fallback when the direct public endpoint cannot verify it.
      if(selected){
        let identity=await fetchTikTokUserDetail(handle).catch(()=>null);
        if(!identity?.secUid&&!identity?.userId){
          const profiles=await browserTikTokProfileIdentities([handle]).catch(()=>new Map());
          identity=profiles.get(key)||null;
        }
        if(!identity?.secUid&&!identity?.userId){
          json(res,404,{ok:false,error:'tiktok_channel_not_found',handle});
          return;
        }
        tiktokProfileIdentityCache.set(key,{
          at:Date.now(),
          data:{
            ...identity,
            videoId:String(identity?.videoId||''),
            source:String(identity?.source||'validated-user-detail')
          }
        });
      }

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
      // Never fall back to a full canonical table scan while paused.
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

  if(url.pathname==='/tiktok/video-source'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      const id=String(url.searchParams.get('id')||'').trim();
      const force=url.searchParams.get('refresh')==='1';
      const source=await resolveTikTokVideoSource(handle,id,{force});
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
        stream:
          '/tiktok/video-stream?user='+encodeURIComponent(source.handle)+
          '&id='+encodeURIComponent(source.id)
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
        // Read path stays fast: existing channels return the saved package
        // immediately and refresh only their tiny fingerprint in background.
        // A brand-new channel with no snapshot may bootstrap once synchronously.
        if(Array.isArray(current.videos)&&current.videos.length){
          void ensureTikTokVideoPackageScan([handle]);
        }else{
          await ensureTikTokVideoPackageScan([handle]);
        }
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
      }else if(force||(AUTO_COLLECT&&(stale||!tiktokRealtimeLiveCheckedAt))){
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

      return {
        handle,
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
    const handles=[...tiktokRealtimeLiveHandles]
      .filter(handle=>{
        if(!wanted.has(handle))return false;
        const scan=tiktokRealtimeStatusByHandle.get(handle);
        // "Đang phát" is a current fact, not a sticky recovery state.
        // UNKNOWN may keep internal LIVE state/FLV warm, but must never be
        // presented to the viewer as currently broadcasting.
        return Boolean(
          scan?.known===true &&
          scan?.live===true &&
          scan?.retained!==true &&
          now-Number(scan?.checkedAt||0)<=TIKTOK_LIVE_PUBLIC_CONFIRM_TTL_MS
        );
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
    const handles=[...tiktokRealtimeLiveHandles]
      .filter(handle=>{
        if(!wanted.has(handle))return false;
        const scan=tiktokRealtimeStatusByHandle.get(handle);
        // "Đang phát" is a current fact, not a sticky recovery state.
        // UNKNOWN may keep internal LIVE state/FLV warm, but must never be
        // presented to the viewer as currently broadcasting.
        return Boolean(
          scan?.known===true &&
          scan?.live===true &&
          scan?.retained!==true &&
          now-Number(scan?.checkedAt||0)<=TIKTOK_LIVE_PUBLIC_CONFIRM_TTL_MS
        );
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

      if(!a?.live){
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

      if(!hasLive()&&offlineCount()<2){
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

      // Feed the fast/browser evidence into the shared status record, then run
      // the same deep yt-dlp + profile-room fallback used by background scans.
      for(const row of evidence)addTikTokStatusEvidence(handle,row);
      if(!hasLive()&&offlineCount()<2&&!tiktokRealtimeLiveHandles.has(key)){
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

      let live=hasLive()||tiktokRealtimeLiveHandles.has(key);
      let offlineConfirmed=!live&&offlineCount()>=2;
      const checkedAt=Date.now();
      const stored=tiktokLiveLibrary.get(key)||{};
      const retainedLive=Boolean(
        tiktokRealtimeLiveHandles.has(key)||
        (stored.live&&stored.playable&&String(stored.type||'').toLowerCase()==='flv'&&stored.sourceSig)
      );

      // A transient 403/unknown from TikTok must not contradict an already
      // verified realtime FLV. Only two explicit OFFLINE confirmations may
      // clear it.
      if(!live&&!offlineConfirmed&&retainedLive){
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
          retained:!hasLive()&&retainedLive,
          checkedAt,evidence
        });
        updateTikTokLiveLibrary(handle,{
          live:true,status:'live',probeState:'live',
          liveCheckSource:String(evidence.find(x=>x.known&&x.live)?.source||'multi-source'),
          lastSeenAt:checkedAt
        });
      }

      json(res,200,{
        ok:true,
        handle,
        live,
        known:live||offlineConfirmed,
        offlineConfirmed,
        retainedLive:Boolean(live&&retainedLive&&!hasLive()),
        status:live?2:(offlineConfirmed?4:null),
        source:live
          ? String(evidence.find(x=>x.known&&x.live)?.source||'multi-source')
          : (offlineConfirmed?'multi-source-offline':'multi-source-unknown'),
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

  void cleanupTikTokOriginalStorage();
  setInterval(()=>{void cleanupTikTokOriginalStorage();},6*60*60_000).unref();

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

      // LIVE status is the realtime control plane for the viewer. It must keep
      // refreshing even when heavyweight profile/video collection is disabled.
      void runTikTokLiveMinuteSweep();
      startTikTokLiveSweepScheduler();

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

    // Startup must be read-mostly. Do not re-sync every selected channel, run
    // full metadata bootstrap, repair every missing video, or full-resync all
    // media after each deploy. Incremental workers below handle small batches.
    if(canonicalReady){
      setTimeout(()=>{void refreshTikTokCanonicalProfileFastBatch(4);},30_000).unref();
      setTimeout(()=>{void mirrorTikTokCanonicalImages(4);},45_000).unref();
    }

    void runTikTokLiveMinuteSweep();
    startTikTokLiveSweepScheduler();
    setTimeout(()=>{void ensureTikTokVideoPackageScan(nextTikTokVideoBackgroundBatch(2));},90_000).unref();
  });
  if(AUTO_COLLECT){
    setInterval(()=>{void ensureTikTokVideoPackageScan(nextTikTokVideoBackgroundBatch(2));},5*60_000).unref();
    setInterval(()=>{void refreshTikTokCanonicalProfileFastBatch(4);},5*60_000).unref();
    setInterval(()=>{void refreshTikTokCanonicalProfileBatch(10);},2*60*60_000).unref();
    setInterval(()=>{void mirrorTikTokCanonicalImages(6);},30*60_000).unref();
    setInterval(()=>{void enrichNextTikTokCanonicalVideo();},15*60_000).unref();
  }

  for(const platform of PLATFORMS)void loadSnapshot(platform);
  if(AUTO_COLLECT){
    void getBrowser()
      .then(()=>console.log('[collector] browser prewarmed'))
      .catch(error=>console.warn('[collector] browser prewarm failed',String(error?.message||error)));
    setTimeout(()=>{void schedulerTick();},8000).unref();
    setInterval(()=>{void schedulerTick();},30000).unref();
  }else{
    console.log('[collector] background browser collection disabled');
  }
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