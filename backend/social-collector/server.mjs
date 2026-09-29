import http from 'node:http';
import { URL } from 'node:url';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
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
async function checkTikTokLiveWithYtDlp(rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');

  const cached=tiktokLiveCheckCache.get(handle.toLowerCase());
  if(cached&&Date.now()-cached.at<60_000)return cached.value;

  const url='https://www.tiktok.com/@'+handle+'/live';
  const value=await enqueueYtdlp(async()=>{
    try{
      const out=await execFileText('yt-dlp',[
        '--dump-single-json',
        '--skip-download',
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout','12',
        '--retries','1',
        '--extractor-retries','1',
        url
      ],{timeout:25_000});
      const data=JSON.parse(out);
      const live=Boolean(
        data?.is_live===true||
        data?.was_live===true||
        String(data?.live_status||'').toLowerCase()==='is_live'
      );
      const formats=Array.isArray(data?.formats)?data.formats:[];
      const flvFormat=formats.find(f=>
        String(f?.ext||'').toLowerCase()==='flv'||
        /flv/i.test(String(f?.format_id||''))||
        /\.flv(?:\?|$)/i.test(String(f?.url||''))
      )||null;
      const hlsFormat=formats.find(f=>
        String(f?.protocol||'').toLowerCase().includes('m3u8')||
        /\.m3u8(?:\?|$)/i.test(String(f?.url||''))
      )||null;
      const selected=hlsFormat||flvFormat||null;
      const streamUrl=String(selected?.url||data?.manifest_url||data?.url||'');
      const streamType=hlsFormat?'hls':
        flvFormat?'flv':
        /\.flv(?:\?|$)/i.test(streamUrl)?'flv':
        /\.m3u8(?:\?|$)/i.test(streamUrl)?'hls':'unknown';
      return {
        ok:true,
        handle,
        live,
        url,
        title:String(data?.title||''),
        thumbnail:String(data?.thumbnail||''),
        uploader:String(data?.uploader||data?.uploader_id||handle),
        id:String(data?.id||''),
        streamUrl:live?streamUrl:'',
        streamType:live?streamType:'',
        checkedAt:nowIso()
      };
    }catch(error){
      const message=compactText(error?.stderr||error?.message||error,500);
      const notLive=/not live|isn't live|is not live|offline|not currently live|unable to extract|video unavailable/i.test(message);
      return {
        ok:true,
        handle,
        live:false,
        url,
        title:'',
        thumbnail:'',
        uploader:handle,
        id:'',
        streamUrl:'',
        checkedAt:nowIso(),
        note:notLive?'not_live':message||'check_failed'
      };
    }
  });
  tiktokLiveCheckCache.set(handle.toLowerCase(),{at:Date.now(),value});
  return value;
}

function cleanProxyTargets(){
  const cutoff=Date.now()-3*60*1000;
  for(const [key,row] of tiktokProxyTargets){
    if(!row||row.at<cutoff)tiktokProxyTargets.delete(key);
  }
}
function registerTikTokProxyTarget(targetUrl){
  cleanProxyTargets();
  const key=randomUUID();
  tiktokProxyTargets.set(key,{url:String(targetUrl||''),at:Date.now()});
  return key;
}
function proxyPathFor(targetUrl){
  const key=registerTikTokProxyTarget(targetUrl);
  return '/tiktok/live-part?id='+encodeURIComponent(key);
}
function rewriteHlsManifest(text,baseUrl){
  const absolute=value=>{
    try{return new URL(value,baseUrl).toString();}
    catch{return '';}
  };
  return String(text||'')
    .split(/\r?\n/)
    .map(line=>{
      const trimmed=line.trim();
      if(!trimmed)return line;
      if(trimmed.startsWith('#')){
        return line.replace(/URI="([^"]+)"/g,(m,uri)=>{
          const target=absolute(uri);
          return target?'URI="'+proxyPathFor(target)+'"':m;
        });
      }
      const target=absolute(trimmed);
      return target?proxyPathFor(target):line;
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
async function pipeTikTokTarget(req,res,targetUrl,{fallbackType='application/octet-stream'}={}){
  const upstream=await fetch(targetUrl,{
    headers:liveProxyHeaders(req),
    redirect:'follow'
  });
  if(!upstream.ok||!upstream.body){
    json(res,502,{ok:false,error:'upstream_stream_'+upstream.status});
    return;
  }
  const contentType=String(upstream.headers.get('content-type')||fallbackType);
  const finalUrl=String(upstream.url||targetUrl);
  const isHls=/mpegurl|m3u8/i.test(contentType)||/\.m3u8(?:\?|$)/i.test(finalUrl);
  if(isHls){
    const manifest=await upstream.text();
    const body=rewriteHlsManifest(manifest,finalUrl);
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
async function proxyTikTokLive(req,res,rawHandle){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle){json(res,400,{ok:false,error:'invalid_tiktok_handle'});return;}
  const data=await checkTikTokLiveWithYtDlp(handle);
  if(!data?.live||!data?.streamUrl){
    json(res,404,{ok:false,error:'tiktok_not_live',handle});
    return;
  }
  await pipeTikTokTarget(req,res,data.streamUrl,{
    fallbackType:data.streamType==='flv'?'video/x-flv':'application/octet-stream'
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
  await pipeTikTokTarget(req,res,row.url);
}

async function getTikTokProfileSample(rawHandle,limit=6){
  const handle=normalizeTikTokHandle(rawHandle);
  if(!handle)throw new Error('invalid_tiktok_handle');
  const profileUrl='https://www.tiktok.com/@'+handle;

  const profileTask=execFileText('yt-dlp',[
    '--flat-playlist',
    '--playlist-end',String(limit),
    '--dump-json',
    '--no-warnings',
    '--socket-timeout','10',
    '--retries','1',
    '--extractor-retries','1',
    profileUrl
  ],{timeout:25_000,maxBuffer:6*1024*1024})
    .then(text=>{
      const entries=String(text||'')
        .split(/\r?\n/)
        .map(line=>line.trim())
        .filter(Boolean)
        .map(line=>{try{return JSON.parse(line)}catch{return null}})
        .filter(Boolean);
      const first=entries[0]||{};
      const account={
        handle:String(
          first.uploader_id||
          first.channel_id||
          first.creator_id||
          handle
        ).replace(/^@/,''),
        displayName:String(
          first.uploader||
          first.channel||
          first.creator||
          ''
        ),
        avatar:String(first.thumbnail||''),
        bio:'',
        numericId:''
      };
      const videos=[];
      const seen=new Set();
      for(const row of entries){
        const id=String(row?.id||row?.video_id||'').trim();
        if(!/^\d{8,}$/.test(id)||seen.has(id))continue;
        seen.add(id);
        const rowHandle=String(
          row?.uploader_id||
          row?.channel_id||
          row?.creator_id||
          handle
        ).replace(/^@/,'');
        videos.push({
          id,
          handle:rowHandle||handle,
          url:'https://www.tiktok.com/@'+(rowHandle||handle)+'/video/'+id,
          title:String(row?.title||row?.description||'').slice(0,220),
          thumbnail:String(row?.thumbnail||'')
        });
        if(videos.length>=limit)break;
      }
      return {account,videos};
    })
    .catch(error=>{
      console.warn('[tiktok-profile] yt-dlp failed',handle,compactText(error?.stderr||error?.message||error,300));
      return {
        account:{handle,displayName:'',avatar:'',bio:'',numericId:''},
        videos:[]
      };
    });

  const liveTask=checkTikTokLiveWithYtDlp(handle).catch(error=>({
    ok:true,handle,live:false,url:'https://www.tiktok.com/@'+handle+'/live',
    title:'',thumbnail:'',streamUrl:'',streamType:'',
    note:compactText(error?.message||error,200)
  }));

  const [profile,live]=await Promise.all([profileTask,liveTask]);
  return {
    ok:true,
    type:'account',
    profileUrl,
    account:{
      handle:String(profile?.account?.handle||handle).replace(/^@/,''),
      displayName:String(profile?.account?.displayName||''),
      avatar:String(profile?.account?.avatar||''),
      bio:String(profile?.account?.bio||''),
      numericId:String(profile?.account?.numericId||'')
    },
    live:live?.live?{
      type:'live',
      handle,
      url:live.url,
      title:live.title||('@'+handle+' đang LIVE'),
      thumbnail:live.thumbnail||'',
      streamUrl:live.streamUrl||'',
      streamType:live.streamType||''
    }:null,
    videos:(Array.isArray(profile?.videos)?profile.videos:[]).map(row=>({
      type:'video',
      ...row,
      isLive:false
    })),
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

  if(url.pathname==='/tiktok/live-stream'&&req.method==='GET'){
    try{
      await proxyTikTokLive(req,res,url.searchParams.get('user')||'');
    }catch(error){
      if(!res.headersSent)json(res,502,{ok:false,error:String(error?.message||error)});
      else if(!res.writableEnded)res.end();
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
  void getBrowser()
    .then(()=>console.log('[collector] browser prewarmed'))
    .catch(error=>console.warn('[collector] browser prewarm failed',String(error?.message||error)));
  for(const platform of PLATFORMS)void loadSnapshot(platform);
  if(AUTO_COLLECT){
    setTimeout(()=>{void schedulerTick();},8000).unref();
    setInterval(()=>{void schedulerTick();},30000).unref();
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
