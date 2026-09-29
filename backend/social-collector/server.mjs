import http from 'node:http';
import { URL } from 'node:url';
import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {createTikTokLoginRuntime} from './tiktok-login-runtime.mjs';

const PORT=Math.max(1,Number(process.env.PORT)||10000);
const ORIGIN=String(process.env.ALLOW_ORIGIN||'https://yt.taphoa.xyz');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const COLLECTOR_TOKEN=String(process.env.COLLECTOR_TOKEN||'');
const LOGIN_TOKEN=String(process.env.LOGIN_TOKEN||'');
const AUTO_COLLECT=String(process.env.AUTO_COLLECT||'1')!=='0';
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
const tiktokProxyTargets=new Map();
const tiktokLiveSessions=new Map();
const tiktokLiveSessionInflight=new Map();
const tiktokLiveFastSources=new Map();
const tiktokLiveBadSources=new Map();
const tiktokLivePreferBrowser=new Map();
const tiktokLiveLibrary=new Map();
const tiktokLiveLibraryRefreshAt=new Map();
const tiktokLiveSelectedHandles=new Set();
const tiktokVideoLibrary=new Map();
const tiktokVideoRefreshAt=new Map();
let tiktokVideoPackageVersion=0;
let tiktokVideoPackageUpdatedAt=0;
let tiktokVideoPackageScanPromise=null;
let tiktokVideoStoreWritePromise=null;
let tiktokVideoPersistedVersion=-1;
const TIKTOK_VIDEO_LIBRARY_REFRESH_MS=60_000;
let tiktokLivePackageScanPromise=null;
let tiktokLiveStoreWritePromise=null;
let tiktokApiCookieHeader='';
let tiktokApiCookieRefreshAt=0;
let tiktokApiCookieRefreshPromise=null;
let tiktokLivePersistedVersion=-1;
const TIKTOK_LIVE_LIBRARY_REFRESH_MS=3_000;
let tiktokLiveLibraryVersion=0;
let tiktokLiveLibraryUpdatedAt=0;
const tiktokLiveLibraryWarmInflight=new Map();
const tiktokLiveLibraryWarmRetryAt=new Map();
const tiktokLiveStatusFallbackInflight=new Set();
const TIKTOK_LIVE_LIBRARY_WARM_CONCURRENCY=2;
const TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS=30_000;
let tiktokLiveLibraryRefreshCursor=0;
let ytdlpSerial=Promise.resolve();

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function nowIso(){return new Date().toISOString();}
function compactText(value,max=500){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
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
    'access-control-allow-origin':ORIGIN,
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
  const origin=String(req.headers.origin||'').replace(/\/$/,'');
  const allowed=String(ORIGIN||'').replace(/\/$/,'');
  return authorized(req)||Boolean(origin&&allowed&&origin===allowed);
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
function execFileText(file,args,{timeout=25000,maxBuffer=4*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    execFile(file,args,{timeout,maxBuffer,encoding:'utf8'},(error,stdout,stderr)=>{
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
    String(row?.sourceSig||''),
    String(row?.videoCodec||''),
    String(row?.audioCodec||''),
    Number(row?.width||0),
    Number(row?.height||0),
    Number(row?.expiresAt||0)
  ]);
}
function publicTikTokLibraryItem(row){
  if(!row)return null;
  return {
    handle:String(row.handle||''),
    live:Boolean(row.live),
    ready:Boolean(row.ready),
    type:String(row.type||''),
    mode:String(row.mode||''),
    source:String(row.source||''),
    status:String(row.status||'unknown'),
    sourceSig:String(row.sourceSig||''),
    videoCodec:String(row.videoCodec||''),
    audioCodec:String(row.audioCodec||''),
    width:Number(row.width||0),
    height:Number(row.height||0),
    lastProbeAt:Number(row.lastProbeAt||0),
    changedAt:Number(row.changedAt||0),
    confirmedAt:Number(row.confirmedAt||0),
    lastSeenAt:Number(row.lastSeenAt||0),
    expiresAt:Number(row.expiresAt||0)
  };
}

function updateTikTokLiveLibrary(rawHandle,patch={},options={}){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  const now=Date.now();
  const prev=tiktokLiveLibrary.get(key)||{
    handle,live:false,ready:false,type:'',mode:'',source:'',
    status:'unknown',sourceSig:'',videoCodec:'',audioCodec:'',width:0,height:0,lastProbeAt:0,changedAt:now,confirmedAt:0,lastSeenAt:0,expiresAt:0
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
  if(fast&&tiktokLiveSourceUsable(fast)&&!isTikTokBadSource(handle,fast))return fast;
  return null;
}
function noteTikTokLibrarySource(handle,row,{mode='',source='',ready=null,status=''}={}){
  if(!row?.url)return false;
  const confirmed=ready==null?Boolean(row.confirmed):Boolean(ready);
  const expiresAt=tiktokStreamExpiresAt(row.url);
  return updateTikTokLiveLibrary(handle,{
    live:true,
    ready:confirmed,
    type:String(row.type||''),
    mode:String(mode||row.mode||''),
    source:String(source||row.source||''),
    status:String(status||(confirmed?'ready':'warm')),
    sourceSig:tiktokLibrarySourceSig(row),
    confirmedAt:confirmed?Date.now():Number(tiktokLiveLibrary.get(String(handle).toLowerCase())?.confirmedAt||0),
    lastSeenAt:Date.now(),
    expiresAt
  });
}

function publishTikTokLiveSourceNow(handle,row,{mode='',source=''}={}){
  if(!row?.url)return false;
  return updateTikTokLiveLibrary(handle,{
    live:true,
    ready:true,
    type:String(row.type||''),
    mode:String(mode||row.mode||'fast'),
    source:String(source||row.source||'room-api'),
    status:'live',
    sourceSig:tiktokLibrarySourceSig(row),
    lastSeenAt:Date.now(),
    expiresAt:tiktokStreamExpiresAt(row.url)
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
  try{
    const out=await execFileText('ffprobe',[
      '-v','error',
      '-rw_timeout','6000000',
      '-analyzeduration','4500000',
      '-probesize','4000000',
      '-headers',ffprobeHeaderBlock(headers),
      '-show_entries','stream=codec_type,codec_name,width,height',
      '-of','json',
      String(row.url)
    ],{timeout:8000,maxBuffer:2*1024*1024});
    const data=JSON.parse(String(out||'{}'));
    const streams=Array.isArray(data?.streams)?data.streams:[];
    const video=streams.find(s=>s?.codec_type==='video'&&Number(s?.width||0)>0&&Number(s?.height||0)>0);
    const audio=streams.find(s=>s?.codec_type==='audio');
    const videoCodec=String(video?.codec_name||'').toLowerCase();
    const audioCodec=String(audio?.codec_name||'').toLowerCase();
    const compatibleVideo=Boolean(video)&&!/(hevc|h265)/i.test(videoCodec);
    return {
      ok:Boolean(compatibleVideo&&audio),
      hasVideo:Boolean(video),
      hasAudio:Boolean(audio),
      videoCodec,
      audioCodec,
      width:Number(video?.width||0),
      height:Number(video?.height||0),
      error:compatibleVideo&&audio?'':'missing_or_incompatible_media'
    };
  }catch(error){
    return {
      ok:false,error:compactText(error?.message||error,140),
      hasVideo:false,hasAudio:false,videoCodec:'',audioCodec:'',width:0,height:0
    };
  }
}
function findTikTokLiveSourceBySig(handle,sourceSig){
  const key=String(handle||'').toLowerCase();
  const sig=String(sourceSig||'');
  if(!sig)return null;
  const browser=tiktokLiveSessions.get(key);
  if(browser&&!browser.page?.isClosed?.()&&tiktokLiveCacheReusable(browser)&&tiktokLibrarySourceSig(browser)===sig)return browser;
  const fast=tiktokLiveFastSources.get(key);
  // Fast FLV/HLS may be opened before ffprobe finishes. Validation is a
  // background health check, not a gate in front of playback.
  if(fast&&tiktokLiveSourceUsable(fast)&&!isTikTokBadSource(handle,fast)&&tiktokLibrarySourceSig(fast)===sig)return fast;
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
    updateTikTokLiveLibrary(handle,{
      live:true,ready:true,
      type:String(row.type||''),
      mode:String(mode||row.mode||''),
      source:String(source||row.source||''),
      status:'ready',
      sourceSig:tiktokLibrarySourceSig(row),
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
    updateTikTokLiveLibrary(handle,{
      live:true,ready:false,status:'warming',
      type:String(row.type||''),
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
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,5);
  if(!normalized.length)return new Map();
  try{
    const out=await execFileText(
      'python3',
      ['tiktok_live_batch_check.py',...normalized],
      {timeout:10_500,maxBuffer:4*1024*1024}
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
function queueTikTokStatusFallback(handles){
  const fresh=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))]
    .filter(handle=>!tiktokLiveStatusFallbackInflight.has(handle.toLowerCase()))
    .slice(0,5);
  if(!fresh.length)return;

  fresh.forEach(handle=>tiktokLiveStatusFallbackInflight.add(handle.toLowerCase()));
  void (async()=>{
    const result=await batchTikTokLiveFallback(fresh);
    for(const handle of fresh){
      const key=handle.toLowerCase();
      const row=result.get(key);
      if(row?.status==='LIVE'){
        seedTikTokFastSource(handle,row);
        updateTikTokLiveLibrary(handle,{
          live:true,ready:false,status:'warming',lastSeenAt:Date.now()
        });
        queueTikTokLibraryWarm(handle);
      }else if(row?.status==='OFFLINE'){
        updateTikTokLiveLibrary(handle,{
          live:false,ready:false,status:'offline',sourceSig:'',
          videoCodec:'',audioCodec:'',width:0,height:0,lastSeenAt:Date.now()
        });
        tiktokLiveLibraryWarmRetryAt.delete(key);
      }else{
        updateTikTokLiveLibrary(handle,{
          live:false,ready:false,status:'checking',lastSeenAt:Date.now()
        });
      }
    }
  })().catch(error=>{
    console.log('[tiktok-library] async status fallback failed',compactText(error?.message||error,140));
  }).finally(()=>{
    fresh.forEach(handle=>tiktokLiveStatusFallbackInflight.delete(handle.toLowerCase()));
  });
}

function seedTikTokFastSource(handle,row){
  const url=String(row?.stream_url||'');
  const type=String(row?.stream_type||'').toLowerCase();
  if(!/^https?:\/\//i.test(url)||!['flv','hls'].includes(type))return null;
  const baseHeaders={
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept':'*/*',
    'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
    'referer':'https://www.tiktok.com/@'+handle+'/live',
    'origin':'https://www.tiktok.com'
  };
  const source={
    mode:'fast',handle,type,url,headers:baseHeaders,
    at:Date.now(),source:'batch-yt-dlp',confirmed:false
  };
  tiktokLiveFastSources.set(handle.toLowerCase(),source);
  return source;
}

async function findPreferredTikTokFlv(handle,excludeSig=''){
  const status=await quickTikTokLiveStatus(handle);
  if(status.known&&!status.live)return null;
  const candidates=(status.candidates||[])
    .filter(row=>row.type==='flv'&&!isTikTokBadSource(handle,row)&&(!excludeSig||tiktokLibrarySourceSig(row)!==excludeSig))
    .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a));
  for(const candidate of candidates.slice(0,6)){
    const valid=await validateTikTokLiveCandidate(handle,candidate);
    if(valid&&!isTikTokBadSource(handle,valid)){
      return {
        mode:'fast',handle,type:'flv',url:valid.url,headers:valid.headers,
        at:Date.now(),source:'room-api-flv',confirmed:false
      };
    }
  }
  return null;
}
async function warmTikTokLibraryHandle(handle){
  const key=String(handle||'').toLowerCase();
  const now=Date.now();
  const retryAt=Number(tiktokLiveLibraryWarmRetryAt.get(key)||0);
  if(retryAt>now)return false;

  let current=currentTikTokLibrarySource(handle);

  // Stable FLV already wins. Periodic ffprobe only refreshes health; it does
  // not change library version when the source itself is unchanged.
  if(current?.confirmed&&current.type==='flv'){
    if(now-Number(current.lastProbeAt||0)<30_000){
      noteTikTokLibrarySource(handle,current,{ready:true,status:'ready',mode:current.mode||'cache',source:current.source||'cache'});
      return true;
    }
    const ok=await confirmTikTokLibrarySource(handle,current,{mode:current.mode||'cache',source:current.source||'cache'});
    if(!ok)tiktokLiveLibraryWarmRetryAt.set(key,Date.now()+TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS);
    return ok;
  }

  // Provisional FLV is already usable by the UI. Check it afterwards.
  // If it is good, nothing changes. If it is bad, keep it in place while a
  // verified replacement is prepared, so the current UI is never reset by a
  // background check.
  if(current&&!current.confirmed&&current.type==='flv'){
    const currentSig=tiktokLibrarySourceSig(current);
    if(await confirmTikTokLibrarySource(handle,current,{
      mode:current.mode||'fast',
      source:current.source||'discovered',
      preserveOnFailure:true
    })){
      tiktokLiveLibraryWarmRetryAt.delete(key);
      return true;
    }

    const replacement=await findPreferredTikTokFlv(handle,currentSig).catch(()=>null);
    if(replacement&&await confirmTikTokLibrarySource(handle,replacement,{
      mode:'fast',source:'room-api-flv'
    })){
      tiktokLiveFastSources.set(key,replacement);
      tiktokLiveLibraryWarmRetryAt.delete(key);
      console.log('[tiktok-library] replaced provisional FLV',handle);
      return true;
    }

    // Leave the provisional URL available. The real player watchdog is the
    // final authority: only a playback failure will evict it immediately.
    tiktokLiveLibraryWarmRetryAt.set(key,Date.now()+TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS);
    return false;
  }

  // A verified HLS is safe to keep. Look for FLV in the background, but never
  // touch the current player until the FLV has passed ffprobe.
  if(current?.confirmed&&current.type==='hls'){
    const flv=await findPreferredTikTokFlv(handle).catch(()=>null);
    if(flv&&await confirmTikTokLibrarySource(handle,flv,{mode:'fast',source:'room-api-flv'})){
      tiktokLiveFastSources.set(key,flv);
      tiktokLiveLibraryWarmRetryAt.delete(key);
      console.log('[tiktok-library] upgraded',handle,'hls->flv');
      return true;
    }
    if(now-Number(current.lastProbeAt||0)>=30_000){
      const ok=await confirmTikTokLibrarySource(handle,current,{mode:current.mode||'cache',source:current.source||'cache'});
      if(!ok)tiktokLiveLibraryWarmRetryAt.set(key,Date.now()+TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS);
      return ok;
    }
    return true;
  }

  // Unconfirmed HLS can be used only after we fail to find FLV.
  const discoveredHls=current&&!current.confirmed&&current.type==='hls'?current:null;

  const flv=await findPreferredTikTokFlv(handle).catch(()=>null);
  if(flv){
    if(await confirmTikTokLibrarySource(handle,flv,{mode:'fast',source:'room-api-flv'})){
      tiktokLiveFastSources.set(key,flv);
      tiktokLiveLibraryWarmRetryAt.delete(key);
      return true;
    }
  }

  if(discoveredHls){
    if(await confirmTikTokLibrarySource(handle,discoveredHls,{mode:discoveredHls.mode||'fast',source:discoveredHls.source||'discovered'})){
      tiktokLiveLibraryWarmRetryAt.delete(key);
      return true;
    }
    if(tiktokLiveFastSources.get(key)===discoveredHls)tiktokLiveFastSources.delete(key);
  }

  // Browser capture is the expensive last resort and only runs for a channel
  // already classified LIVE.
  try{
    const session=await captureTikTokLiveSession(handle);
    if(await confirmTikTokLibrarySource(handle,session,{mode:'browser',source:'browser-session'})){
      tiktokLiveLibraryWarmRetryAt.delete(key);
      return true;
    }
    await closeTikTokLiveSession(key);
  }catch(error){
    console.log('[tiktok-library] browser warm failed',handle,compactText(error?.message||error,120));
  }

  tiktokLiveLibraryWarmRetryAt.set(key,Date.now()+TIKTOK_LIVE_LIBRARY_WARM_RETRY_MS);
  return false;
}
function queueTikTokLibraryWarm(handle){
  handle=normalizeTikTokHandle(handle);
  if(!handle)return false;
  const key=handle.toLowerCase();
  if(tiktokLiveLibraryWarmInflight.has(key))return true;
  if(tiktokLiveLibraryWarmInflight.size>=TIKTOK_LIVE_LIBRARY_WARM_CONCURRENCY)return false;
  const task=warmTikTokLibraryHandle(handle)
    .catch(error=>console.log('[tiktok-library] warm failed',handle,compactText(error?.message||error,120)))
    .finally(()=>tiktokLiveLibraryWarmInflight.delete(key));
  tiktokLiveLibraryWarmInflight.set(key,task);
  return true;
}


function registerTikTokLiveSelectedHandles(handles){
  const next=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,60);
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
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');

  if(selected){
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?on_conflict=handle',
      {
        method:'POST',
        headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify([{handle}])
      }
    );
    if(!r.ok)throw new Error('tiktok_selected_write_'+r.status+':'+await r.text());
    return true;
  }

  const r=await fetch(
    SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?handle=eq.'+encodeURIComponent(handle),
    {
      method:'DELETE',
      headers:storeHeaders({prefer:'return=minimal'})
    }
  );
  if(!r.ok)throw new Error('tiktok_selected_delete_'+r.status+':'+await r.text());
  return true;
}

async function loadTikTokLiveStore(){
  try{
    const [selectedRes,channelsRes,packageRes]=await Promise.all([
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_selected?select=handle&order=handle.asc',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_channels?select=handle,live,stream_type,stream_url,source_sig,checked_at,updated_at',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_live_package?package_key=eq.live&select=version,payload,updated_at&limit=1',
        {headers:storeHeaders()}
      )
    ]);
    if(!selectedRes.ok)throw new Error('tiktok_selected_read_'+selectedRes.status+':'+await selectedRes.text());
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
    tiktokLiveFastSources.clear();
    for(const selected of Array.isArray(selectedRows)?selectedRows:[]){
      const handle=normalizeTikTokHandle(selected?.handle||'');
      if(!handle)continue;
      tiktokLiveSelectedHandles.add(handle);

      const stored=channelMap.get(handle.toLowerCase())||{};
      const type=String(stored?.stream_type||'').toLowerCase();
      const url=String(stored?.stream_url||'');
      const live=Boolean(stored?.live);
      let source=null;

      if(live&&type==='flv'&&/^https?:\/\//i.test(url)){
        source={
          mode:'fast-store',
          handle,
          type:'flv',
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
        type:source?.type||'',
        mode:source?'fast-store':'',
        source:source?'supabase':'',
        status:live?'live':'offline',
        sourceSig:source?tiktokLibrarySourceSig(source):'',
        lastSeenAt:Date.parse(stored?.checked_at||stored?.updated_at||0)||0,
        expiresAt:source?tiktokStreamExpiresAt(source.url):0
      });
    }

    const packageRow=Array.isArray(packageRows)?packageRows[0]:null;
    const storedVersion=Number(packageRow?.version||0);
    if(storedVersion>tiktokLiveLibraryVersion)tiktokLiveLibraryVersion=storedVersion;
    tiktokLivePersistedVersion=tiktokLiveLibraryVersion;
    console.log('[tiktok-store] loaded','selected='+tiktokLiveSelectedHandles.size,'version='+tiktokLiveLibraryVersion);
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
      const live=Boolean(item.live);
      const usable=live&&source&&source.type==='flv'&&tiktokLiveSourceUsable(source);
      return {
        handle,
        live,
        stream_type:usable?'flv':'',
        stream_url:usable?String(source.url||''):'',
        source_sig:usable?tiktokLibrarySourceSig(source):'',
        checked_at:item.lastSeenAt?new Date(Number(item.lastSeenAt)).toISOString():now,
        updated_at:now
      };
    })
    .sort((a,b)=>a.handle.localeCompare(b.handle));
}

async function persistTikTokLiveStore({force=false}={}){
  if(!force&&tiktokLivePersistedVersion===tiktokLiveLibraryVersion)return true;
  if(tiktokLiveStoreWritePromise)return tiktokLiveStoreWritePromise;

  tiktokLiveStoreWritePromise=(async()=>{
    const rows=buildTikTokStoredRows();
    const liveCount=rows.filter(row=>row.live).length;
    const payload={
      items:rows.map(row=>({
        handle:row.handle,
        live:row.live,
        link:row.stream_url,
        type:row.stream_type
      })),
      total:rows.length,
      live:liveCount,
      offline:rows.length-liveCount
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
    console.log('[tiktok-store] saved','channels='+rows.length,'live='+liveCount,'version='+tiktokLiveLibraryVersion);
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
  const target=(handles&&handles.length)
    ? [...new Set(handles.map(normalizeTikTokHandle).filter(Boolean))]
    : [...tiktokLiveSelectedHandles];
  if(!target.length)return Promise.resolve();
  if(tiktokLivePackageScanPromise)return tiktokLivePackageScanPromise;
  tiktokLivePackageScanPromise=refreshTikTokLiveLibrary(target,{warm:false})
    .then(()=>persistTikTokLiveStore())
    .catch(error=>console.log('[tiktok-package] scan failed',compactText(error?.message||error,120)))
    .finally(()=>{tiktokLivePackageScanPromise=null;});
  return tiktokLivePackageScanPromise;
}

async function refreshTikTokLiveLibrary(handles,{warm=true}={}){
  const scanStarted=Date.now();
  const normalized=[...new Set((handles||[]).map(normalizeTikTokHandle).filter(Boolean))].slice(0,60);
  if(!normalized.length)return;

  const now=Date.now();
  const due=normalized.filter(
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
      .filter(row=>row?.type==='flv'&&!isTikTokBadSource(handle,row))
      .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))[0]||null;

    if(!status?.known){
      // Timeout/incomplete response is UNKNOWN, never OFFLINE.
      scanUnknownCount+=1;
      continue;
    }

    const isLive=status?.live===true;
    if(isLive)scanLiveCount+=1;
    if(flv)scanFlvCount+=1;

    if(!isLive){
      tiktokLiveFastSources.delete(key);
      updateTikTokLiveLibrary(handle,{
        live:false,
        ready:false,
        type:'',
        mode:'',
        source:'',
        status:'offline',
        sourceSig:'',
        videoCodec:'',
        audioCodec:'',
        width:0,
        height:0,
        lastSeenAt:Date.now(),
        expiresAt:0
      });
      continue;
    }

    // LIVE: use FLV immediately. Do not probe it first and do not try another
    // transport. The player is the health check. If it dies, feedback below
    // discards it and this same fast scan fetches a fresh FLV URL.
    if(flv){
      let row=tiktokLiveFastSources.get(key);
      if(!row||!tiktokLiveSourceUsable(row)||isTikTokBadSource(handle,row)){
        row=seedTikTokFastSource(handle,{
          stream_url:flv.url,
          stream_type:'flv'
        });
      }

      if(row){
        publishTikTokLiveSourceNow(handle,row,{
          mode:String(row.mode||'fast'),
          source:String(row.source||'room-api-flv')
        });
      }
      continue;
    }

    // TikTok says LIVE but did not return FLV in this pass. Keep it marked
    // LIVE, but do not start yt-dlp/ffprobe/browser fallbacks.
    updateTikTokLiveLibrary(handle,{
      live:true,
      ready:false,
      type:'',
      mode:'',
      source:'',
      status:'live',
      sourceSig:'',
      lastSeenAt:Date.now()
    });
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
      ],{timeout:24_000,maxBuffer:2*1024*1024});
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
      const streamType=String(data.stream_type||(
        /\.m3u8(?:\?|$)/i.test(streamUrl)?'hls':
        /\.flv(?:\?|$)/i.test(streamUrl)?'flv':'unknown'
      )).toLowerCase();
      console.log('[tiktok-live-python]',handle,streamType,streamUrl.includes('.m3u8')?'m3u8':'other');
      return {
        ok:true,
        handle,
        live:true,
        url,
        title:String(data.title||('@'+handle+' đang LIVE')),
        thumbnail:'',
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
  if(!row?.url||!row?.at)return false;
  if(Date.now()-Number(row.at)>maxAge)return false;
  const expiresAt=tiktokStreamExpiresAt(row.url);
  if(expiresAt&&expiresAt-Date.now()<60_000)return false;
  return true;
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

function collectTikTokLiveStreamCandidates(value,out=[],path='',depth=0){
  if(value==null||depth>14||out.length>120)return out;

  if(typeof value==='string'){
    const raw=String(value);
    const trimmed=raw.trim();

    // TikTok often nests stream_data as a JSON string. Parse it so paths keep
    // useful markers such as streamData/hevcStreamData and FULL_HD1/HD1.
    if((trimmed.startsWith('{')&&trimmed.endsWith('}'))||(trimmed.startsWith('[')&&trimmed.endsWith(']'))){
      try{
        const parsed=JSON.parse(trimmed);
        collectTikTokLiveStreamCandidates(parsed,out,path,depth+1);
      }catch{}
    }

    const text=raw.replace(/\\u002F/g,'/').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    const re=/https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|flv)(?:\?[^"'\\\s<>]*)?/ig;
    for(const match of text.matchAll(re)){
      const url=String(match[0]||'').replace(/&amp;/g,'&');
      const type=/\.m3u8(?:\?|$)/i.test(url)?'hls':'flv';
      if(url&&!out.some(row=>row.url===url))out.push({url,type,path});
    }
    return out;
  }

  if(Array.isArray(value)){
    value.forEach((item,index)=>collectTikTokLiveStreamCandidates(item,out,path+'['+index+']',depth+1));
    return out;
  }

  if(typeof value==='object'){
    for(const [key,child] of Object.entries(value)){
      collectTikTokLiveStreamCandidates(child,out,path?path+'.'+key:key,depth+1);
    }
  }
  return out;
}
function rankTikTokLiveCandidate(row){
  const text=(String(row?.path||'')+' '+String(row?.url||'')).toLowerCase();
  let score=0;

  // Compatibility before raw resolution. A decoded H.264/AVC picture is more
  // important than selecting a higher HEVC tier that may play audio only.
  if(/hevcstreamdata|hevc|h265|hvc1|hev1/.test(text))score-=5000;
  if(/(^|[._])streamdata([._]|$)|h264|avc|avc1/.test(text))score+=2500;

  if(row?.type==='flv')score+=1000;
  else if(row?.type==='hls')score+=800;

  if(/full[_ -]?hd1|full_hd1/.test(text))score+=600;
  else if(/(^|[._])hd1([._]|$)|_hd1/.test(text))score+=500;
  else if(/full[_ -]?hd|1080/.test(text))score+=350;
  else if(/(^|[._])hd([._]|$)|_hd|720/.test(text))score+=250;
  else if(/sd|540|480/.test(text))score+=120;

  // TikTok's UHD/HEVC variants are the common "audio but black video" case in
  // Chromium, so don't let resolution alone beat an AVC/FLV stream.
  if(/uhd/.test(text))score-=250;
  if(/backup|bak/.test(text))score-=30;
  return score;
}

async function validateTikTokLiveCandidate(handle,row,headers=null){
  const url=String(row?.url||'');
  const type=String(row?.type||'').toLowerCase();
  if(!/^https?:\/\//i.test(url)||!['hls','flv'].includes(type))return null;
  const baseHeaders={
    'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    'accept':'*/*',
    'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
    'referer':'https://www.tiktok.com/@'+handle+'/live',
    'origin':'https://www.tiktok.com',
    ...(headers||{})
  };
  try{
    if(type==='hls'){
      const r=await fetch(url,{
        headers:baseHeaders,
        redirect:'follow',
        signal:AbortSignal.timeout(2800)
      });
      if(!r.ok)return null;
      const text=await r.text();
      if(!/#EXTM3U/i.test(text))return null;
      return {...row,url:String(r.url||url),type:'hls',headers:baseHeaders,validatedAt:Date.now()};
    }
    const r=await fetch(url,{
      headers:{...baseHeaders,range:'bytes=0-2047'},
      redirect:'follow',
      signal:AbortSignal.timeout(2800)
    });
    const ok=r.ok||r.status===206;
    try{await r.body?.cancel?.()}catch{}
    return ok?{...row,url:String(r.url||url),type:'flv',headers:baseHeaders,validatedAt:Date.now()}:null;
  }catch{
    return null;
  }
}
async function quickTikTokLiveDetailStatus(handle,retry=true){
  try{
    const endpoint=new URL('https://www.tiktok.com/api/live/detail/');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('uniqueId',handle);

    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'en-US,en;q=0.9',
        'referer':'https://www.tiktok.com/@'+handle+'/live',
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(3000)
    });
    if(!r.ok){
      if(retry&&(r.status===401||r.status===403||r.status===429)){
        await refreshTikTokApiCookieHeader({force:true});
        return quickTikTokLiveDetailStatus(handle,false);
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
        return quickTikTokLiveDetailStatus(handle,false);
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
    const candidates=live
      ? collectTikTokLiveStreamCandidates(liveData)
          .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
      : [];

    return {
      known:true,
      live,
      status,
      roomId,
      title:String(liveData?.title||''),
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
  try{
    const endpoint=new URL('https://webcast.tiktok.com/webcast/room/info/');
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
    const candidates=live
      ? collectTikTokLiveStreamCandidates(room)
          .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
      : [];
    return {known:true,live,status,roomId:String(roomId),candidates};
  }catch(error){
    return {known:false,live:false,status:null,roomId:String(roomId),candidates:[]};
  }
}

async function quickTikTokLiveStatus(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,live:false,candidates:[]};

  // First use the lightweight Web endpoint from the supplied reference code.
  // It gives a direct LiveRoomInfo.status (2 LIVE / 4 OFFLINE), plus room id,
  // title and viewer count, without opening Chromium.
  const detail=await quickTikTokLiveDetailStatus(handle);
  if(detail?.known){
    if(!detail.live)return detail;

    if(detail.candidates?.length)return detail;

    // A confirmed LIVE without embedded pull URLs can still provide roomId.
    // Resolve only the media candidates from room-info; keep the LIVE verdict
    // from live/detail even if room-info itself is incomplete.
    if(detail.roomId){
      const room=await quickTikTokRoomInfoStatus(handle,detail.roomId);
      if(room?.candidates?.length){
        return {...detail,candidates:room.candidates};
      }
    }
    return detail;
  }

  // Fallback for accounts where /api/live/detail is missing or blocked.
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
    if(!r.ok)return {known:false,live:false,candidates:[]};
    const data=await r.json();
    const liveRoom=data?.data?.liveRoom||null;
    const roomStatus=Number(liveRoom?.status);
    const roomId=String(liveRoom?.roomId||liveRoom?.id||data?.data?.user?.roomId||'');

    if(Number.isFinite(roomStatus)){
      const isLive=roomStatus===2;
      const candidates=isLive
        ? collectTikTokLiveStreamCandidates(liveRoom)
            .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a))
        : [];
      return {
        known:true,
        live:isLive,
        status:roomStatus,
        roomId,
        candidates,
        source:'user-room'
      };
    }

    if(!liveRoom&&!roomId){
      return {known:true,live:false,status:4,roomId:'',candidates:[],source:'user-room'};
    }

    if(roomId){
      return await quickTikTokRoomInfoStatus(handle,roomId);
    }

    return {known:false,live:false,status:null,roomId,candidates:[]};
  }catch(error){
    console.log('[tiktok-session] preflight unknown',handle,compactText(error?.message||error,140));
  }
  return {known:false,live:false,candidates:[]};
}
async function fastTikTokLiveWithYtdlp(handle){
  const url='https://www.tiktok.com/@'+handle+'/live';
  try{
    const out=await execFileText('python3',[
      'tiktok_stream_extract.py',
      url
    ],{timeout:5200,maxBuffer:2*1024*1024});
    const data=JSON.parse(String(out||'').trim()||'{}');
    if(!data?.success||!data?.stream_url)return null;
    return {
      url:String(data.stream_url),
      type:String(data.stream_type||(/\.m3u8(?:\?|$)/i.test(data.stream_url)?'hls':'flv')).toLowerCase(),
      path:'yt-dlp:'+String(data?.selected?.format_id||data?.method||'fast')
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
    // HLS failures are commonly variant/codec-specific, so path-level memory
    // is useful for rotating away from a bad rendition.
    return kind+'|'+u.hostname.toLowerCase()+'|'+u.pathname;
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
  for(const [key,row] of tiktokLiveFastSources){
    if(!row||!tiktokLiveSourceUsable(row)||isTikTokBadSource(key,row)){
      tiktokLiveFastSources.delete(key);
    }
  }
}
async function resolveTikTokLiveSource(rawHandle){
  cleanTikTokFastSources();
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const key=handle.toLowerCase();

  const browserSession=tiktokLiveSessions.get(key);
  if(browserSession&&browserSession.page&&!browserSession.page.isClosed()&&tiktokLiveCacheReusable(browserSession)){
    browserSession.at=Date.now();
    console.log('[tiktok-cache] browser reuse',handle,browserSession.type);
    return {mode:'browser-cache',handle,type:browserSession.type,url:browserSession.url,at:browserSession.at,source:'browser-cache'};
  }

  const cached=tiktokLiveFastSources.get(key);
  if(cached&&tiktokLiveCacheReusable(cached)&&!isTikTokBadSource(handle,cached)){
    cached.at=Date.now();
    console.log('[tiktok-cache] fast reuse',handle,cached.type,cached.source||'fast');
    return {...cached,mode:'fast-cache'};
  }
  if(cached&&isTikTokBadSource(handle,cached))tiktokLiveFastSources.delete(key);

  if(shouldPreferTikTokBrowser(handle)){
    console.log('[tiktok-source] prefer browser',handle);
    const session=await captureTikTokLiveSession(handle);
    return {mode:'browser',handle,type:session.type,url:session.url,at:session.at,source:'browser-preferred'};
  }

  const preflight=await quickTikTokLiveStatus(handle);
  if(preflight.known&&!preflight.live){
    updateTikTokLiveLibrary(handle,{live:false,ready:false,status:'offline',lastSeenAt:Date.now()});
    throw new Error('tiktok_not_live');
  }

  const candidates=(preflight.candidates||[]).filter(row=>!isTikTokBadSource(handle,row));
  for(const candidate of candidates.slice(0,10)){
    const valid=await validateTikTokLiveCandidate(handle,candidate);
    if(valid&&!isTikTokBadSource(handle,valid)){
      const row={mode:'fast',handle,type:valid.type,url:valid.url,headers:valid.headers,at:Date.now(),source:'room-api',confirmed:false};
      tiktokLiveFastSources.set(key,row);
      console.log('[tiktok-fast] room-api',handle,row.type);
      return row;
    }
  }

  const ytdlp=await fastTikTokLiveWithYtdlp(handle);
  if(ytdlp){
    const valid=await validateTikTokLiveCandidate(handle,ytdlp);
    if(valid){
      const row={mode:'fast',handle,type:valid.type,url:valid.url,headers:valid.headers,at:Date.now(),source:'yt-dlp',confirmed:false};
      tiktokLiveFastSources.set(key,row);
      console.log('[tiktok-fast] yt-dlp',handle,row.type);
      return row;
    }
  }

  const session=await captureTikTokLiveSession(handle);
  return {mode:'browser',handle,type:session.type,url:session.url,at:session.at,source:'browser-session'};
}

async function resolveTikTokCompatibleLiveSource(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const key=handle.toLowerCase();

  // Discard any fast HLS that produced audio/no picture on the client.
  tiktokLiveFastSources.delete(key);

  const preflight=await quickTikTokLiveStatus(handle);
  if(preflight.known&&!preflight.live)throw new Error('tiktok_not_live');

  const flvCandidates=(preflight.candidates||[])
    .filter(row=>row.type==='flv'&&!isTikTokBadSource(handle,row))
    .sort((a,b)=>rankTikTokLiveCandidate(b)-rankTikTokLiveCandidate(a));

  for(const candidate of flvCandidates.slice(0,6)){
    const valid=await validateTikTokLiveCandidate(handle,candidate);
    if(valid&&!isTikTokBadSource(handle,valid)){
      const row={
        mode:'fast',handle,type:'flv',url:valid.url,headers:valid.headers,
        at:Date.now(),source:'room-api-flv',confirmed:false
      };
      tiktokLiveFastSources.set(key,row);
      console.log('[tiktok-compat] flv',handle);
      return row;
    }
  }

  const session=await captureTikTokLiveSession(handle);
  return {
    mode:'browser',handle,type:session.type,url:session.url,
    at:session.at,source:'browser-session'
  };
}

async function captureTikTokLiveSessionOnce(rawHandle){
  cleanTikTokLiveSessions();
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  console.log('[tiktok-session] start',handle);

  const key=handle.toLowerCase();
  let preflight={known:false,live:false,status:null};
  if(!shouldPreferTikTokBrowser(handle)){
    preflight=await quickTikTokLiveStatus(handle);
    if(preflight.known&&!preflight.live){
      console.log('[tiktok-session] offline',handle,'status='+preflight.status);
      throw new Error('tiktok_not_live');
    }
  }else{
    console.log('[tiktok-session] skip preflight',handle);
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

  let capturedHls=null;
  let capturedFlv=null;
  let hlsCandidate='';
  let firstMediaAt=0;
  const pendingBodies=new Set();

  const remember=(url,type,headers={})=>{
    const next={url:String(url||''),type,headers,at:Date.now()};
    if(type==='hls'){
      if(!capturedHls){
        capturedHls=next;
        console.log('[tiktok-session] capture',handle,'hls',next.url.slice(0,200));
      }
    }else if(type==='flv'&&!capturedFlv){
      capturedFlv=next;
      console.log('[tiktok-session] capture',handle,'flv',next.url.slice(0,200));
    }
    if(!firstMediaAt)firstMediaAt=Date.now();
  };

  const onRequest=request=>{
    try{
      const requestUrl=String(request.url()||'');
      const lower=requestUrl.toLowerCase();
      if(lower.includes('.flv'))remember(requestUrl,'flv',request.headers?.()||{});
      else if(lower.includes('.m3u8'))hlsCandidate=requestUrl;

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
      const lower=responseUrl.toLowerCase();
      if(lower.includes('.m3u8')){
        const status=Number(response.status?.()||0);
        if(status>=200&&status<400){
          const req=response.request?.();
          remember(responseUrl,'hls',req?.headers?.()||{});
        }else{
          console.log('[tiktok-session] reject hls',handle,'status='+status,responseUrl.slice(0,160));
        }
        return;
      }

      if(!/tiktok\.com|tiktokv\.com|byteoversea\.com|tiktokcdn\.com/i.test(responseUrl))return;
      const headers=response.headers?.()||{};
      const type=String(headers['content-type']||headers['Content-Type']||'');
      if(type&&!/json|text|javascript/i.test(type))return;
      const task=(async()=>{
        const text=await response.text().catch(()=>null);
        if(!text||text.length>3_000_000)return;
        const decoded=String(text)
          .replace(/\\u002F/g,'/')
          .replace(/\\u0026/g,'&')
          .replace(/\\\//g,'/')
          .replace(/&amp;/g,'&');
        const match=decoded.match(/https?:\/\/[^"'\\\s<>]+\.m3u8(?:\?[^"'\\\s<>]*)?/i)?.[0]||'';
        if(match&&!hlsCandidate)hlsCandidate=match;
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
    while(Date.now()-started<12000&&!capturedFlv){
      await page.evaluate(()=>{
        for(const video of document.querySelectorAll('video')){
          try{video.muted=true;void video.play?.()}catch{}
        }
      }).catch(()=>{});

      if(pendingBodies.size)await Promise.race([
        Promise.allSettled([...pendingBodies]),
        sleep(180)
      ]).catch(()=>{});

      // Browser fallback is our compatibility path: give TikTok a few seconds
      // to expose FLV/H.264 even when an HLS URL appears first.
      if(capturedHls&&!capturedFlv&&Date.now()-capturedHls.at>2500)break;
      await sleep(350);
    }

    if(pendingBodies.size)await Promise.race([
      Promise.allSettled([...pendingBodies]),
      sleep(500)
    ]).catch(()=>{});

    // Do not trust an HLS URL merely found in page JSON. We only use HLS if
    // the same browser session actually received that playlist successfully.
    const captured=capturedFlv||capturedHls;
    if(!captured){
      console.log('[tiktok-session] no-media',handle,hlsCandidate?'unverified-hls':'no-hls');
      throw new Error(preflight.known&&preflight.live?'live_media_not_captured':'tiktok_not_live_or_blocked');
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

function cleanProxyTargets(){
  const cutoff=Date.now()-3*60*1000;
  for(const [key,row] of tiktokProxyTargets){
    if(!row||row.at<cutoff)tiktokProxyTargets.delete(key);
  }
}
function registerTikTokProxyTarget(targetUrl,handle='',proxySegments=false){
  cleanProxyTargets();
  const key=randomUUID();
  tiktokProxyTargets.set(key,{
    url:String(targetUrl||''),
    handle:String(handle||''),
    proxySegments:Boolean(proxySegments),
    at:Date.now()
  });
  return key;
}
function proxyPathFor(targetUrl,handle='',proxySegments=false){
  const key=registerTikTokProxyTarget(targetUrl,handle,proxySegments);
  return '/tiktok/live-part?id='+encodeURIComponent(key);
}
function rewriteHlsManifest(text,baseUrl,handle='',proxySegments=false){
  const absolute=value=>{
    try{return new URL(value,baseUrl).toString();}
    catch{return '';}
  };
  const isPlaylist=value=>/\.m3u8(?:\?|$)/i.test(String(value||''));
  const directMediaHost=value=>{
    try{
      const host=new URL(value).hostname.toLowerCase();
      return host==='tiktokcdn.com'||host.endsWith('.tiktokcdn.com')||
        host==='tiktokv.com'||host.endsWith('.tiktokv.com')||
        host==='byteoversea.com'||host.endsWith('.byteoversea.com');
    }catch{return false}
  };
  const viaProxy=value=>proxyPathFor(value,handle,proxySegments);

  return String(text||'')
    .split(/\r?\n/)
    .map(line=>{
      const trimmed=line.trim();
      if(!trimmed)return line;

      if(trimmed.startsWith('#')){
        return line.replace(/URI="([^"]+)"/g,(m,uri)=>{
          const target=absolute(uri);
          if(!target)return m;
          // Playlist/key stay on relay. Media segments go direct only when
          // they are on a TikTok CDN host that browsers can request safely.
          // Alternate hosts such as realcrius.com remain on relay.
          const mustProxy=proxySegments||isPlaylist(target)||
            /^#EXT-X-(?:SESSION-)?KEY/i.test(trimmed)||
            !directMediaHost(target);
          return 'URI="'+(mustProxy?viaProxy(target):target)+'"';
        });
      }

      const target=absolute(trimmed);
      if(!target)return line;
      const mustProxy=proxySegments||isPlaylist(target)||!directMediaHost(target);
      return mustProxy?viaProxy(target):target;
    })
    .join('\n');
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
async function pipeTikTokTarget(req,res,targetUrl,{fallbackType='application/octet-stream',handle='',proxySegments=false,headersOverride=null}={}){
  const session=handle?tiktokLiveSessions.get(String(handle).toLowerCase()):null;
  const headers=headersOverride||(
    session?await liveSessionHeaders(req,session,targetUrl):liveProxyHeaders(req)
  );
  const upstream=await fetch(targetUrl,{
    headers,
    redirect:'follow'
  });
  if(!upstream.ok||!upstream.body){
    console.warn('[tiktok-proxy] upstream failed',upstream.status,String(targetUrl||'').slice(0,180));
    json(res,502,{ok:false,error:'upstream_stream_'+upstream.status});
    return;
  }
  const contentType=String(upstream.headers.get('content-type')||fallbackType);
  const finalUrl=String(upstream.url||targetUrl);
  const isHls=/mpegurl|m3u8/i.test(contentType)||/\.m3u8(?:\?|$)/i.test(finalUrl);
  if(isHls){
    const manifest=await upstream.text();
    console.log('[tiktok-proxy] hls',upstream.status,contentType,'bytes='+manifest.length,finalUrl.slice(0,180));
    const body=rewriteHlsManifest(manifest,finalUrl,handle,proxySegments);
    res.writeHead(200,{
      'content-type':'application/vnd.apple.mpegurl; charset=utf-8',
      'access-control-allow-origin':ORIGIN,
      'access-control-allow-methods':'GET,OPTIONS',
      'access-control-allow-headers':'range',
      'access-control-expose-headers':'content-length,content-range,accept-ranges,content-type',
      'cache-control':'no-store'
    });
    res.end(body);
    return;
  }
  const outHeaders={
    'content-type':contentType,
    'access-control-allow-origin':ORIGIN,
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'range',
    'access-control-expose-headers':'content-length,content-range,accept-ranges,content-type',
    'cache-control':'no-store'
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
}
async function proxyTikTokLive(req,res,rawHandle,forceBrowser=false,sourceSig=''){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}

  const proxySegments=/[?&]segments=proxy(?:&|$)/i.test(String(req.url||''));
  let source;

  if(sourceSig){
    source=findTikTokLiveSourceBySig(handle,sourceSig);
    if(!source){
      json(res,410,{ok:false,error:'cached_live_source_expired'});
      return;
    }
    source.at=Date.now();
  }else if(forceBrowser){
    // Drop any fast source that produced audio without picture and capture
    // again from the real TikTok browser session.
    tiktokLiveFastSources.delete(handle.toLowerCase());
    const session=await captureTikTokLiveSession(handle);
    source={mode:'browser',handle,type:session.type,url:session.url,at:session.at,source:'browser-session'};
  }else{
    source=await resolveTikTokLiveSource(handle);
  }

  const fast=String(source.mode||'').startsWith('fast');
  await pipeTikTokTarget(req,res,source.url,{
    fallbackType:source.type==='flv'?'video/x-flv':'application/vnd.apple.mpegurl',
    handle:fast?'':handle,
    headersOverride:fast?source.headers:null,
    proxySegments
  });
}

async function proxyTikTokLivePart(req,res,id){
  cleanProxyTargets();
  const row=tiktokProxyTargets.get(String(id||''));
  if(!row?.url){
    json(res,404,{ok:false,error:'expired_live_part'});
    return;
  }
  row.at=Date.now();
  const session=row.handle?tiktokLiveSessions.get(String(row.handle).toLowerCase()):null;
  if(session)session.at=Date.now();
  await pipeTikTokTarget(req,res,row.url,{
    handle:row.handle||'',
    proxySegments:Boolean(row.proxySegments)
  });
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

async function fetchTikTokProfileIdentity(handle){
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
    const hydration=parseScriptJson('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if(hydration){
      const scope=hydration?.__DEFAULT_SCOPE__||{};
      user=
        scope?.['webapp.user-detail']?.userInfo?.user||
        scope?.['webapp.user-detail']?.user||
        findTikTokUserObject(scope?.['webapp.user-detail'],handle)||
        findTikTokUserObject(hydration,handle);
    }

    if(!user){
      const sigi=parseScriptJson('SIGI_STATE');
      if(sigi)user=findTikTokUserObject(sigi,handle);
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
        nickname:String(user?.nickname||user?.nickName||''),
        avatar,
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

    return {secUid,userId,nickname,avatar,videoId};
  }catch(error){
    console.warn('[tiktok-profile] html identity failed',handle,compactText(error?.message||error,220));
    return {secUid:'',userId:'',nickname:'',avatar:'',videoId:''};
  }
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
    const user=
      body?.userInfo?.user||
      body?.data?.userInfo?.user||
      body?.data?.user||
      null;
    if(!user)return null;
    return {
      secUid:String(user?.secUid||user?.sec_uid||''),
      userId:String(user?.id||user?.uid||''),
      nickname:String(user?.nickname||''),
      avatar:firstTikTokAssetUrl(user?.avatarLarger||user?.avatarMedium||user?.avatarThumb)
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
    shareCount:Number(stats?.shareCount||stats?.share_count||0)
  };
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
  next.videos=Array.isArray(next.videos)?next.videos.slice(0,5):[];
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

async function fetchTikTokChannelVideosYtdlp(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};
  try{
    const text=await execFileText('yt-dlp',[
      '--flat-playlist',
      '--playlist-end','5',
      '--dump-json',
      '--no-warnings',
      '--socket-timeout','4',
      '--retries','0',
      '--extractor-retries','0',
      'https://www.tiktok.com/@'+handle
    ],{timeout:7_000,maxBuffer:6*1024*1024});

    const rows=String(text||'')
      .split(/\r?\n/)
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>{try{return JSON.parse(line)}catch{return null}})
      .filter(Boolean);

    const first=rows[0]||{};
    const secUid=String(first?.channel_id||first?.channelId||'');
    const videos=rows
      .map(row=>normalizeTikTokPostItem(handle,{
        id:row?.id||row?.video_id,
        desc:row?.title||row?.description,
        createTime:row?.timestamp||row?.release_timestamp||0,
        video:{duration:row?.duration||0,cover:row?.thumbnail||''},
        stats:{
          playCount:row?.view_count||0,
          diggCount:row?.like_count||0,
          commentCount:row?.comment_count||0,
          shareCount:row?.repost_count||0
        }
      }))
      .filter(Boolean)
      .slice(0,5);

    if(!videos.length){
      return {known:false,handle,secUid,videos:[],error:'ytdlp_no_videos'};
    }

    return {
      known:true,
      handle,
      secUid,
      videos,
      latestVideoId:String(videos[0]?.id||''),
      hasMore:false,
      cursor:'',
      source:'yt-dlp-profile'
    };
  }catch(error){
    return {
      known:false,handle,secUid:'',videos:[],
      error:'ytdlp_'+compactText(error?.stderr||error?.message||error,120)
    };
  }
}

async function fetchTikTokChannelVideos(rawHandle,knownSecUid=''){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)return {known:false,handle:'',secUid:'',videos:[],error:'invalid_handle'};

  let secUid=String(knownSecUid||'').trim();
  if(!secUid){
    const identity=await fetchTikTokProfileIdentity(handle);
    secUid=String(identity?.secUid||'').trim();
  }
  if(!secUid){
    const detail=await fetchTikTokUserDetail(handle);
    secUid=String(detail?.secUid||'').trim();
  }
  if(!secUid){
    return await fetchTikTokChannelVideosYtdlp(handle);
  }

  try{
    const endpoint=new URL('https://www.tiktok.com/api/post/item_list/');
    endpoint.searchParams.set('aid','1988');
    endpoint.searchParams.set('count','5');
    endpoint.searchParams.set('cursor','0');
    endpoint.searchParams.set('from_page','user');
    endpoint.searchParams.set('secUid',secUid);

    const r=await fetch(endpoint,{
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':'application/json,text/plain,*/*',
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5',
        'referer':'https://www.tiktok.com/@'+handle,
        ...(tiktokApiCookieHeader?{'cookie':tiktokApiCookieHeader}:{})
      },
      redirect:'follow',
      signal:AbortSignal.timeout(5000)
    });
    if(!r.ok){
      return await fetchTikTokChannelVideosYtdlp(handle);
    }

    const body=await r.json();
    const rawItems=
      (Array.isArray(body?.itemList)&&body.itemList)||
      (Array.isArray(body?.item_list)&&body.item_list)||
      (Array.isArray(body?.data?.itemList)&&body.data.itemList)||
      (Array.isArray(body?.data?.item_list)&&body.data.item_list)||
      (Array.isArray(body?.items)&&body.items)||
      null;

    if(!Array.isArray(rawItems)){
      return await fetchTikTokChannelVideosYtdlp(handle);
    }

    const videos=rawItems
      .map(row=>normalizeTikTokPostItem(handle,row))
      .filter(Boolean)
      .sort((a,b)=>Number(b.createTime||0)-Number(a.createTime||0))
      .slice(0,5);

    return {
      known:true,
      handle,
      secUid,
      videos,
      latestVideoId:String(videos?.[0]?.id||''),
      hasMore:Boolean(body?.hasMore??body?.has_more),
      cursor:String(body?.cursor??body?.data?.cursor??'')
    };
  }catch(error){
    return {
      known:false,handle,secUid,videos:[],
      error:compactText(error?.message||error,160)
    };
  }
}

async function loadTikTokVideoStore(){
  try{
    const [channelsRes,packageRes]=await Promise.all([
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_channels?select=handle,sec_uid,latest_video_id,videos,checked_at,updated_at',
        {headers:storeHeaders()}
      ),
      fetch(
        SUPABASE_URL+'/rest/v1/yt1988_tiktok_video_package?package_key=eq.latest&select=version,payload,updated_at&limit=1',
        {headers:storeHeaders()}
      )
    ]);
    if(!channelsRes.ok)throw new Error('tiktok_video_channels_read_'+channelsRes.status+':'+await channelsRes.text());
    if(!packageRes.ok)throw new Error('tiktok_video_package_read_'+packageRes.status+':'+await packageRes.text());

    const rows=await channelsRes.json();
    const packageRows=await packageRes.json();
    const storedMap=new Map(
      (Array.isArray(rows)?rows:[])
        .map(row=>[String(row?.handle||'').toLowerCase(),row])
    );

    tiktokVideoLibrary.clear();
    for(const handle of tiktokLiveSelectedHandles){
      const stored=storedMap.get(handle.toLowerCase())||{};
      const videos=Array.isArray(stored?.videos)?stored.videos:[];
      tiktokVideoLibrary.set(handle.toLowerCase(),{
        handle,
        secUid:String(stored?.sec_uid||''),
        latestVideoId:String(stored?.latest_video_id||videos?.[0]?.id||''),
        videos:videos.slice(0,5),
        checkedAt:Date.parse(stored?.checked_at||stored?.updated_at||0)||0,
        changedAt:0,
        status:videos.length?'ready':'waiting'
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
        handle,secUid:'',latestVideoId:'',videos:[],checkedAt:0
      };
      return {
        handle,
        sec_uid:String(row.secUid||''),
        latest_video_id:String(row.latestVideoId||row?.videos?.[0]?.id||''),
        videos:Array.isArray(row.videos)?row.videos.slice(0,5):[],
        checked_at:row.checkedAt?new Date(Number(row.checkedAt)).toISOString():null,
        updated_at:now
      };
    })
    .sort((a,b)=>a.handle.localeCompare(b.handle));
}

async function persistTikTokVideoStore({force=false}={}){
  if(!force&&tiktokVideoPersistedVersion===tiktokVideoPackageVersion)return true;
  if(tiktokVideoStoreWritePromise)return tiktokVideoStoreWritePromise;

  tiktokVideoStoreWritePromise=(async()=>{
    const rows=buildTikTokVideoStoredRows();
    const payload={
      channels:rows.map(row=>({
        handle:row.handle,
        secUid:row.sec_uid,
        latestVideoId:row.latest_video_id,
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
    return true;
  })().catch(error=>{
    console.warn('[tiktok-video-store] save failed',compactText(error?.message||error,220));
    return false;
  }).finally(()=>{
    tiktokVideoStoreWritePromise=null;
  });

  return tiktokVideoStoreWritePromise;
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
      const result=await fetchTikTokChannelVideos(handle,current.secUid||'');
      if(!result?.known){
        unknownCount+=1;
        const reason=String(result?.error||'unknown').slice(0,80);
        errorCounts.set(reason,Number(errorCounts.get(reason)||0)+1);
        continue;
      }
      okCount+=1;
      updateTikTokVideoLibrary(handle,{
        secUid:result.secUid,
        latestVideoId:result.latestVideoId,
        videos:result.videos,
        checkedAt:Date.now(),
        status:'ready'
      });
    }
  };
  await Promise.all(Array.from({length:Math.min(4,due.length)},()=>worker()));
  console.log(
    '[tiktok-video-scan]',
    'total='+target.length,
    'due='+due.length,
    'ok='+okCount,
    'unknown='+unknownCount,
    'errors='+JSON.stringify(Object.fromEntries(errorCounts))
  );
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
async function loadSession(platform){
  if(!BROWSER_PLATFORMS.has(platform))return null;
  try{
    const r=await fetch(
      SUPABASE_URL+'/rest/v1/yt1988_social_sessions?platform=eq.'+
      encodeURIComponent(platform)+'&select=state,updated_at&limit=1',
      {headers:storeHeaders()}
    );
    if(!r.ok)throw new Error('session_read_'+r.status);
    const rows=await r.json();
    const row=Array.isArray(rows)?rows[0]:null;
    return row||null;
  }catch(error){
    console.warn('[store] load session failed',platform,String(error?.message||error));
    return null;
  }
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
  if(!force&&tiktokApiCookieHeader&&Date.now()-tiktokApiCookieRefreshAt<10*60*1000){
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

    tiktokApiCookieHeader=header;
    tiktokApiCookieRefreshAt=Date.now();
    const names=new Set(
      String(header||'').split(';').map(x=>x.trim().split('=',1)[0]).filter(Boolean)
    );
    console.log('[tiktok-api] cookie bootstrap','count='+names.size,'ttwid='+(names.has('ttwid')?'yes':'no'));
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
    node.pull_data||node.pullData||node.hls_pull_url||node.hlsPullUrl||
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

  if(url.pathname==='/tiktok/live-part'&&req.method==='GET'){
    try{
      await proxyTikTokLivePart(req,res,url.searchParams.get('id')||'');
    }catch(error){
      if(!res.headersSent)json(res,502,{ok:false,error:String(error?.message||error)});
      else if(!res.writableEnded)res.end();
    }
    return;
  }

  if(url.pathname==='/tiktok/hls-proxy'&&req.method==='GET'){
    try{
      const raw=String(url.searchParams.get('url')||'').trim();
      let target;
      try{target=new URL(raw);}catch{target=null;}
      const host=String(target?.hostname||'').toLowerCase();
      const allowed=Boolean(
        target?.protocol==='https:'&&(
          host==='tiktokcdn.com'||host.endsWith('.tiktokcdn.com')||
          host==='tiktokv.com'||host.endsWith('.tiktokv.com')||
          host==='byteoversea.com'||host.endsWith('.byteoversea.com')
        )
      );
      if(!allowed){json(res,400,{ok:false,error:'invalid_tiktok_cdn_url'});return;}
      console.log('[tiktok-hls-proxy]',host,target.pathname.slice(0,140));
      await pipeTikTokTarget(req,res,target.toString(),{
        fallbackType:'application/vnd.apple.mpegurl'
      });
    }catch(error){
      if(!res.headersSent)json(res,502,{ok:false,error:String(error?.message||error)});
      else if(!res.writableEnded)res.end();
    }
    return;
  }

  if(url.pathname==='/tiktok/live-feedback'&&req.method==='GET'){
    const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
    const status=String(url.searchParams.get('status')||'').toLowerCase();
    const type=String(url.searchParams.get('type')||'').toLowerCase();
    if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
    const key=handle.toLowerCase();
    const fast=tiktokLiveFastSources.get(key);
    const browser=tiktokLiveSessions.get(key);

    if(status==='ok'){
      let marked=false;
      if(fast&&(!type||fast.type===type)){
        fast.confirmed=true;
        fast.at=Date.now();
        clearTikTokBadSource(handle,fast);
        marked=true;
      }
      if(browser&&(!type||browser.type===type)){
        browser.confirmed=true;
        browser.at=Date.now();
        clearTikTokBadSource(handle,browser);
        marked=true;
      }
      const good=currentTikTokLibrarySource(handle);
      if(good&&good.confirmed)noteTikTokLibrarySource(handle,good,{
        ready:true,
        status:'ready',
        mode:good===browser?'browser-cache':'fast-cache',
        source:good.source||''
      });
      console.log('[tiktok-cache] confirmed',handle,type||'any',marked?'yes':'miss');
      json(res,200,{ok:true,confirmed:marked});
      return;
    }

    if(status==='bad'){
      if(fast&&(!type||fast.type===type)){
        markTikTokBadSource(handle,fast);
        tiktokLiveFastSources.delete(key);
      }
      if(browser&&(!type||browser.type===type)){
        await closeTikTokLiveSession(key);
      }
      tiktokLiveLibraryRefreshAt.delete(key);
      updateTikTokLiveLibrary(handle,{
        live:true,ready:false,status:'live',sourceSig:'',lastSeenAt:Date.now()
      });
      void ensureTikTokLivePackageScan([handle]);
      console.log('[tiktok-cache] dead source -> refresh FLV package',handle,type||'any');
      json(res,200,{ok:true});
      return;
    }

    json(res,400,{ok:false,error:'invalid_status'});
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
      const had=tiktokLiveSelectedHandles.has(handle);

      await persistTikTokSelectedMembership(handle,selected);

      if(selected){
        tiktokLiveSelectedHandles.add(handle);
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
        tiktokLiveSelectedHandles.delete(handle);
        tiktokLiveFastSources.delete(key);
        tiktokLiveLibrary.delete(key);
        tiktokVideoLibrary.delete(key);
        tiktokLiveLibraryRefreshAt.delete(key);
        tiktokVideoRefreshAt.delete(key);
      }

      if(had!==selected)touchTikTokLivePackage();
      await persistTikTokLiveStore({force:true});

      if(selected){
        void ensureTikTokLivePackageScan([handle]);
        void ensureTikTokVideoPackageScan([handle]);
      }

      json(res,200,{
        ok:true,
        handle,
        selected,
        total:tiktokLiveSelectedHandles.size,
        version:tiktokLiveLibraryVersion
      });
    }catch(error){
      console.warn('[tiktok-selected] write failed',compactText(error?.message||error,220));
      json(res,500,{ok:false,error:String(error?.message||error)});
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
          videos:Array.isArray(row.videos)?row.videos.slice(0,5):[],
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

  if(url.pathname==='/tiktok/live-library'&&req.method==='GET'){
    const handles=String(url.searchParams.get('handles')||'')
      .split(',')
      .map(normalizeTikTokHandle)
      .filter(Boolean)
      .slice(0,60);

    // Supabase is the source of truth for the selected-channel list.
    // UI-supplied handles are ignored here so opening a browser cannot mutate
    // the package membership or make the list grow accidentally.
    if(url.searchParams.get('refresh')==='1'){
      await ensureTikTokLivePackageScan();
    }

    const clientVersion=Number(url.searchParams.get('v')||-1);
    if(clientVersion===tiktokLiveLibraryVersion){
      json(res,200,{
        ok:true,unchanged:true,
        version:tiktokLiveLibraryVersion,
        updatedAt:tiktokLiveLibraryUpdatedAt
      });
      return;
    }

    const wanted=tiktokLiveSelectedHandles.size?new Set([...tiktokLiveSelectedHandles].map(x=>x.toLowerCase())):null;
    const items=[...tiktokLiveLibrary.values()]
      .filter(row=>!wanted||wanted.has(String(row.handle||'').toLowerCase()))
      .map(publicTikTokLibraryItem)
      .filter(Boolean)
      .sort((a,b)=>Number(b.live)-Number(a.live)||Number(b.ready)-Number(a.ready)||Number(b.changedAt)-Number(a.changedAt));

    json(res,200,{
      ok:true,unchanged:false,
      version:tiktokLiveLibraryVersion,
      updatedAt:tiktokLiveLibraryUpdatedAt,
      items
    });
    return;
  }

  if(url.pathname==='/tiktok/live-session'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
      const forceBrowser=url.searchParams.get('force')==='browser';
      const compatMode=url.searchParams.get('compat')==='1';
      let source;
      if(forceBrowser){
        tiktokLiveFastSources.delete(handle.toLowerCase());
        const session=await captureTikTokLiveSession(handle);
        source={mode:'browser',type:session.type,source:'browser-session',at:session.at};
      }else if(compatMode){
        source=await resolveTikTokCompatibleLiveSource(handle);
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

  if(url.pathname==='/tiktok/profile-identity'&&req.method==='GET'){
    try{
      const handle=normalizeTikTokHandle(url.searchParams.get('user')||'');
      if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
      const identity=await fetchTikTokProfileIdentity(handle);
      console.log('[tiktok-identity]',handle,'video='+(identity.videoId||'none'),'sec='+(identity.secUid?'yes':'no'));
      json(res,200,{
        ok:true,
        handle,
        profileUrl:'https://www.tiktok.com/@'+handle,
        videoId:String(identity.videoId||''),
        videoUrl:identity.videoId?'https://www.tiktok.com/@'+handle+'/video/'+identity.videoId:'',
        nickname:String(identity.nickname||''),
        avatar:String(identity.avatar||'')
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
        m3u8:data.streamType==='hls'?data.streamUrl:'',
        flv:data.streamType==='flv'?data.streamUrl:'',
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
      const data=await checkTikTokLiveWithYtDlp(handle);
      json(res,200,data);
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
    json(res,200,{ok:true,snapshots,lastRuns:Object.fromEntries(lastRuns)});
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
  console.log('[collector] listening',PORT,'auto='+AUTO_COLLECT);
  void Promise.all([
    loadTikTokApiCookieHeader(),
    loadTikTokLiveStore()
  ]).then(async()=>{
    await loadTikTokVideoStore();
    void ensureTikTokLivePackageScan();
    void ensureTikTokVideoPackageScan();
  });
  setInterval(()=>{void ensureTikTokLivePackageScan();},3000).unref();
  setInterval(()=>{void ensureTikTokVideoPackageScan();},60_000).unref();
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
