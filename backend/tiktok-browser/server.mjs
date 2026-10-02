import http from 'node:http';
import { URL } from 'node:url';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {createSocialHub} from './social-hub.mjs';
import {classifyObservedUrl,extractTikTokMediaFromPayload,chooseBestTikTokMedia} from './tiktok-media.mjs';

const PORT = Number(process.env.PORT || 10000);
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://yt.taphoa.xyz';
const LOGIN_TOKEN = String(process.env.LOGIN_TOKEN || '');

chromium.setGraphicsMode = false;

let browserPromise = null;
const cache = new Map();
const warmFeeds = new Map();
const refreshInFlight = new Map();

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function getBrowser() {
  if (!browserPromise) {
    // Assign the promise before awaiting Chromium extraction. Multiple feed
    // warmers must share one extraction/launch or Render can hit ETXTBSY.
    browserPromise = (async () => {
      const executablePath = await chromium.executablePath();
      const args = await puppeteer.defaultArgs({
        args: [
          ...chromium.args,
          '--lang=vi-VN,vi',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-default-browser-check',
        ],
        headless: 'shell',
      });

      return puppeteer.launch({
        args,
        executablePath,
        headless: 'shell',
        defaultViewport: {
          width: 1365,
          height: 900,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: true,
        },
      });
    })().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }

  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

const socialHub=createSocialHub({getBrowser,logger:console});

let tiktokLoginPage=null;
let tiktokLoginStatus='idle';
let tiktokLoginError='';
let tiktokLoginQr=null;
let tiktokLoginUpdatedAt=0;

function loginAuthorized(url){
  return Boolean(LOGIN_TOKEN) && String(url.searchParams.get('key') || '') === LOGIN_TOKEN;
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

async function closeTikTokLoginPage(){
  const page=tiktokLoginPage;
  tiktokLoginPage=null;
  if(page){
    try{await page.close();}catch{}
  }
}

async function captureTikTokLoginQr(){
  const page=tiktokLoginPage;
  if(!page || page.isClosed())return null;

  const selector=await page.evaluate(()=>{
    const candidates=[];
    let index=0;
    for(const el of document.querySelectorAll('canvas,img,svg')){
      const rect=el.getBoundingClientRect();
      const w=rect.width;
      const h=rect.height;
      if(w<110||h<110||w>520||h>520)continue;
      if(Math.abs(w-h)>Math.max(45,Math.min(w,h)*.35))continue;
      const style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
      const r={
        tag:el.tagName.toLowerCase(),
        i:index++,
        area:w*h,
        top:rect.top,
        left:rect.left,
        text:String(el.getAttribute('alt')||el.getAttribute('aria-label')||'')
      };
      candidates.push(r);
    }
    candidates.sort((a,b)=>{
      const aq=/qr|code|mã/i.test(a.text)?1:0;
      const bq=/qr|code|mã/i.test(b.text)?1:0;
      if(aq!==bq)return bq-aq;
      return b.area-a.area;
    });
    const pick=candidates[0];
    if(!pick)return null;
    return pick.tag+':nth-of-type('+(pick.i+1)+')';
  }).catch(()=>null);

  if(selector){
    try{
      const elements=await page.$('canvas,img,svg');
      const candidates=[];
      for(const el of elements){
        const box=await el.boundingBox().catch(()=>null);
        if(!box)continue;
        const {width,height}=box;
        if(width<110||height<110||width>520||height>520)continue;
        if(Math.abs(width-height)>Math.max(45,Math.min(width,height)*.35))continue;
        candidates.push({el,area:width*height});
      }
      candidates.sort((a,b)=>b.area-a.area);
      if(candidates[0]){
        return await candidates[0].el.screenshot({type:'png'});
      }
    }catch{}
  }

  try{
    return await page.screenshot({type:'png',fullPage:false});
  }catch{
    return null;
  }
}

async function refreshTikTokLoginState({capture=true}={}){
  const page=tiktokLoginPage;
  if(!page||page.isClosed()){
    if(tiktokLoginStatus!=='success')tiktokLoginStatus='idle';
    return;
  }

  try{
    const cookies=await page.cookies('https://www.tiktok.com/');
    const loggedIn=cookies.some(cookie=>
      ['sessionid','sessionid_ss','sid_tt'].includes(String(cookie?.name||'').toLowerCase())
      && String(cookie?.value||'').length>8
    );

    if(loggedIn){
      await socialHub.importSession('tiktok',cookies);
      tiktokLoginStatus='success';
      tiktokLoginError='';
      tiktokLoginQr=null;
      tiktokLoginUpdatedAt=Date.now();
      setTimeout(()=>{void closeTikTokLoginPage();},1500).unref();
      return;
    }

    tiktokLoginStatus='waiting';
    if(capture){
      const shot=await captureTikTokLoginQr();
      if(shot)tiktokLoginQr=shot;
    }
    tiktokLoginUpdatedAt=Date.now();
  }catch(error){
    tiktokLoginStatus='error';
    tiktokLoginError=String(error?.message||error);
    tiktokLoginUpdatedAt=Date.now();
  }
}

async function startTikTokLogin({restart=false}={}){
  if(restart)await closeTikTokLoginPage();

  if(tiktokLoginPage&&!tiktokLoginPage.isClosed()){
    await refreshTikTokLoginState({capture:true});
    return;
  }

  tiktokLoginStatus='starting';
  tiktokLoginError='';
  tiktokLoginQr=null;
  tiktokLoginUpdatedAt=Date.now();

  const browser=await getBrowser();
  const page=await browser.newPage();
  tiktokLoginPage=page;

  await page.setViewport({width:900,height:760,deviceScaleFactor:1});
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4',
  });
  await page.emulateTimezone('Asia/Ho_Chi_Minh').catch(()=>{});

  // Fresh authorization page: do not restore an older TikTok session here.
  await page.goto('https://www.tiktok.com/login/qrcode?lang=vi-VN',{
    waitUntil:'domcontentloaded',
    timeout:30000,
  });
  await new Promise(resolve=>setTimeout(resolve,2200));
  await refreshTikTokLoginState({capture:true});
}

function tiktokLoginHtml(key){
  const safeKey=JSON.stringify(String(key||''));
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Đăng nhập TikTok · 1988</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0f0f0f;color:#f1f1f1;font-family:Roboto,Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}
.card{width:min(460px,100%);background:#181818;border:1px solid #303030;border-radius:18px;padding:20px;text-align:center}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 14px;color:#aaa;font-size:14px;line-height:1.45}
.qr{width:min(320px,82vw);aspect-ratio:1;margin:12px auto;border-radius:14px;background:#fff;display:grid;place-items:center;overflow:hidden}
.qr img{display:block;width:100%;height:100%;object-fit:contain}
.status{min-height:24px;margin-top:12px;font-size:14px}
.ok{color:#5fd36b}.err{color:#ff6b6b}
button{border:0;border-radius:18px;padding:9px 16px;background:#2f2f2f;color:#fff;font:500 14px/18px inherit;cursor:pointer}
button:hover{background:#3f3f3f}
</style>
</head>
<body>
<div class="card">
<h1>Đăng nhập TikTok cho 1988</h1>
<p>Mở TikTok trên điện thoại → quét mã QR → xác nhận đăng nhập. Phiên sẽ được lưu tự động.</p>
<div class="qr" id="qr"><span>Đang tạo mã QR…</span></div>
<div class="status" id="status">Đang khởi tạo…</div>
<button id="restart" type="button">Tạo QR mới</button>
</div>
<script>
const key=${safeKey};
const qr=document.getElementById('qr');
const status=document.getElementById('status');
async function poll(){
  try{
    const r=await fetch('/login/tiktok/status?key='+encodeURIComponent(key)+'&_='+Date.now(),{cache:'no-store'});
    const j=await r.json();
    if(j.status==='success'){
      status.className='status ok';
      status.textContent='Đã đăng nhập và lưu phiên TikTok.';
      qr.innerHTML='<span>✓</span>';
      return;
    }
    if(j.status==='error'){
      status.className='status err';
      status.textContent=j.error||'Đăng nhập lỗi.';
    }else{
      status.className='status';
      status.textContent=j.status==='starting'?'Đang tạo QR…':'Đang chờ bạn quét QR…';
    }
    qr.innerHTML='<img alt="TikTok QR" src="/login/tiktok/qr?key='+encodeURIComponent(key)+'&_='+Date.now()+'">';
  }catch{
    status.className='status err';
    status.textContent='Chưa kết nối được tới Render.';
  }
  setTimeout(poll,2000);
}
document.getElementById('restart').onclick=async()=>{
  status.className='status';
  status.textContent='Đang tạo QR mới…';
  await fetch('/login/tiktok/restart?key='+encodeURIComponent(key),{cache:'no-store'});
  setTimeout(poll,800);
};
poll();
</script>
</body>
</html>`;
}

async function newTikTokPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4',
  });
  await page.emulateTimezone('Asia/Ho_Chi_Minh').catch(() => {});
  await socialHub.bindPageSession('tiktok',page);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const type = request.resourceType();
    if (type === 'font' || type === 'media') {
      request.abort().catch(() => {});
    } else {
      request.continue().catch(() => {});
    }
  });
  return page;
}


async function resolveTikTokMedia(postUrl) {
  const target = new URL(postUrl);
  if (!/(^|\\.)tiktok\\.com$/i.test(target.hostname)) throw new Error('invalid_tiktok_url');

  const browser = await getBrowser();
  const page = await browser.newPage();
  const networkVideoUrls = [];
  const networkAudioUrls = [];
  const payloadBuckets = [];

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4',
    });
    await page.emulateTimezone('Asia/Ho_Chi_Minh').catch(() => {});
    await socialHub.bindPageSession('tiktok', page);

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const type = request.resourceType();
      const hit = classifyObservedUrl(request.url(), type);
      if (hit?.kind === 'video') networkVideoUrls.push(hit.url);
      else if (hit?.kind === 'audio') networkAudioUrls.push(hit.url);

      // The URL is already captured above; avoid actually transferring heavy media bytes.
      if (type === 'font' || type === 'media') request.abort().catch(() => {});
      else request.continue().catch(() => {});
    });

    page.on('response', async (response) => {
      const u = response.url();
      if (!/\\/api\\/(?:item\\/detail|recommend\\/item_list|post\\/item_list)\\//i.test(u)) return;
      try {
        const type = String(response.headers()['content-type'] || '');
        if (!type.includes('json')) return;
        payloadBuckets.push(await response.json());
      } catch {}
    });

    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((resolve) => setTimeout(resolve, 2800));

    const dom = await page.evaluate(() => {
      const payloads = [];
      for (const selector of [
        '#__UNIVERSAL_DATA_FOR_REHYDRATION__',
        '#SIGI_STATE',
        'script[id*="UNIVERSAL"]',
        'script[id*="SIGI"]',
      ]) {
        const node = document.querySelector(selector);
        const text = node?.textContent || '';
        if (!text) continue;
        try { payloads.push(JSON.parse(text)); } catch {}
      }

      const videoUrls = [];
      for (const video of document.querySelectorAll('video')) {
        for (const value of [video.currentSrc, video.src, video.querySelector('source')?.src]) {
          if (value) videoUrls.push(value);
        }
      }

      const downloadLinks = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const label = [a.textContent, a.getAttribute('aria-label'), a.getAttribute('download')]
          .filter(Boolean).join(' ').toLowerCase();
        if (/download|tải xuống|tải về/.test(label)) downloadLinks.push(a.href);
      }

      const performanceUrls = performance.getEntriesByType('resource')
        .map((entry) => entry?.name || '')
        .filter(Boolean);

      return { payloads, videoUrls, downloadLinks, performanceUrls, title: document.title };
    });

    const merged = { videoUrls: [], audioUrls: [], downloadUrls: [] };
    for (const payload of [...payloadBuckets, ...(dom.payloads || [])]) {
      const hit = extractTikTokMediaFromPayload(payload);
      merged.videoUrls.push(...hit.videoUrls);
      merged.audioUrls.push(...hit.audioUrls);
      merged.downloadUrls.push(...hit.downloadUrls);
    }
    merged.downloadUrls.push(...(dom.downloadLinks || []));

    for (const raw of [...(dom.videoUrls || []), ...(dom.performanceUrls || [])]) {
      const hit = classifyObservedUrl(raw, '');
      if (hit?.kind === 'video') networkVideoUrls.push(hit.url);
      else if (hit?.kind === 'audio') networkAudioUrls.push(hit.url);
    }

    const best = chooseBestTikTokMedia({
      downloadUrls: merged.downloadUrls,
      videoUrls: merged.videoUrls,
      networkVideoUrls,
      audioUrls: [...merged.audioUrls, ...networkAudioUrls],
    });

    return {
      url: target.href,
      title: dom.title || '',
      ...best,
      downloadUrls: [...new Set(merged.downloadUrls)],
      videoUrls: [...new Set(merged.videoUrls)],
      networkVideoUrls: [...new Set(networkVideoUrls)],
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function uniqueRows(rows, max = 60) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = String(row?.id || '');
    const handle = String(row?.handle || '');
    const key = id ? id : 'live:' + handle.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}


function rowFromTikTokItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || item.itemId || item.aweme_id || '');
  const author = item.author || item.authorInfo || item.user || {};
  const handle = String(author.uniqueId || author.unique_id || author.secUid || item.authorName || '');
  if (!/^\d{12,24}$/.test(id) || !handle) return null;

  const stats = item.stats || item.statsV2 || item.statistics || {};
  const video = item.video || {};
  return {
    id,
    handle,
    url: 'https://www.tiktok.com/@' + handle + '/video/' + id,
    title: String(item.desc || item.description || item.title || ''),
    thumbnail: String(
      video.cover || video.originCover || video.dynamicCover ||
      video?.cover?.urlList?.[0] || video?.originCover?.urlList?.[0] || ''
    ),
    timestamp: Number(item.createTime || item.create_time || 0) || Number(BigInt(id) >> 32n),
    viewCount: Number(stats.playCount || stats.play_count || stats.viewCount || 0),
    likeCount: Number(stats.diggCount || stats.digg_count || stats.likeCount || 0),
    commentCount: Number(stats.commentCount || stats.comment_count || 0),
    shareCount: Number(stats.shareCount || stats.share_count || 0),
    live: false,
  };
}

function rowsFromTikTokPayload(payload, max = 80) {
  const rows = [];
  const seenObjects = new Set();

  function walk(value, depth = 0) {
    if (rows.length >= max || depth > 9 || value == null) return;
    if (typeof value !== 'object') return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    const row = rowFromTikTokItem(value);
    if (row) rows.push(row);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    for (const child of Object.values(value)) {
      walk(child, depth + 1);
      if (rows.length >= max) break;
    }
  }

  walk(payload);
  return uniqueRows(rows, max);
}

async function universalRows(page, max = 80) {
  const payload = await page.evaluate(() => {
    const selectors = [
      '#__UNIVERSAL_DATA_FOR_REHYDRATION__',
      '#SIGI_STATE',
      'script[id*="UNIVERSAL"]',
      'script[id*="SIGI"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = node?.textContent || '';
      if (!text) continue;
      try { return JSON.parse(text); } catch {}
    }
    return null;
  }).catch(() => null);
  return rowsFromTikTokPayload(payload, max);
}

function captureTikTokResponses(page, max = 80) {
  const rows = [];
  const pending = new Set();

  const handler = (response) => {
    const url = response.url();
    if (!/(?:\/api\/.*(?:item|recommend|feed)|\/aweme\/v1\/feed)/i.test(url)) return;
    const task = response.json()
      .then((payload) => {
        rows.push(...rowsFromTikTokPayload(payload, max));
      })
      .catch(() => {})
      .finally(() => pending.delete(task));
    pending.add(task);
  };

  page.on('response', handler);

  return {
    async collect() {
      if (pending.size) await Promise.allSettled([...pending]);
      return uniqueRows(rows, max);
    },
    stop() {
      page.off('response', handler);
    },
  };
}

async function logTikTokPageDebug(page, label) {
  const info = await page.evaluate(() => ({
    title: document.title,
    href: location.href,
    anchors: document.querySelectorAll('a').length,
    videoAnchors: document.querySelectorAll('a[href*="/video/"]').length,
    body: String(document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
  })).catch(() => null);
  console.log('page:debug', label, JSON.stringify(info));
}

function parseVideoHref(href) {
  const match = String(href || '').match(/https?:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)\/video\/(\d{12,24})/i);
  if (!match) return null;
  return {
    id: match[2],
    handle: match[1],
    url: 'https://www.tiktok.com/@' + match[1] + '/video/' + match[2],
    live: false,
  };
}

async function collectVideoLinks(page, max = 60) {
  const rows = await page.evaluate(() => {
    const found = [];
    for (const anchor of document.querySelectorAll('a[href*="/video/"]')) {
      const href = anchor.href;
      const text = String(anchor.innerText || anchor.getAttribute('aria-label') || '').trim();
      found.push({ href, text: text.slice(0, 500) });
    }
    return found;
  }).catch(() => []);

  return uniqueRows(rows.map((row) => {
    const parsed = parseVideoHref(row.href);
    if (!parsed) return null;
    return {
      ...parsed,
      title: row.text || '',
      timestamp: Number(BigInt(parsed.id) >> 32n),
    };
  }).filter(Boolean), max);
}

async function scrollFeed(page, passes = 7) {
  for (let i = 0; i < passes; i += 1) {
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 900)));
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
}

async function tryRecommendApi(page, max = 60) {
  const payload = await page.evaluate(async () => {
    const root = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
    let app = {};
    if (root?.textContent) {
      try {
        const parsed = JSON.parse(root.textContent);
        app = parsed?.__DEFAULT_SCOPE__?.['webapp.app-context'] || {};
      } catch {}
    }

    const params = new URLSearchParams({
      aid: '1988',
      app_name: 'tiktok_web',
      device_platform: 'web_pc',
      count: '30',
      from_page: 'fyp',
      priority_region: 'VN',
      region: 'VN',
      browser_language: 'vi-VN',
      app_language: 'vi-VN',
      browser_platform: 'MacIntel',
      browser_name: 'Mozilla',
      browser_online: 'true',
      cookie_enabled: 'true',
      screen_width: String(screen.width || 1365),
      screen_height: String(screen.height || 900),
      device_id: String(app?.wid || ''),
      odinId: String(app?.odinId || ''),
      WebIdLastTime: String(app?.webIdCreatedTime || ''),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/recommend/item_list/?' + params.toString(), {
        credentials: 'include',
        signal: controller.signal,
      });
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }).catch(() => null);

  const items = payload?.itemList || payload?.item_list || [];
  return uniqueRows(items.map((item) => {
    const author = item?.author || {};
    const stats = item?.stats || item?.statsV2 || {};
    const video = item?.video || {};
    const id = String(item?.id || '');
    const handle = String(author?.uniqueId || '');
    if (!/^\d{12,24}$/.test(id) || !handle) return null;
    return {
      id,
      handle,
      url: 'https://www.tiktok.com/@' + handle + '/video/' + id,
      title: String(item?.desc || ''),
      thumbnail: String(video?.cover || video?.originCover || video?.dynamicCover || ''),
      timestamp: Number(item?.createTime || 0) || Number(BigInt(id) >> 32n),
      viewCount: Number(stats?.playCount || stats?.play_count || 0),
      likeCount: Number(stats?.diggCount || stats?.digg_count || 0),
      commentCount: Number(stats?.commentCount || stats?.comment_count || 0),
      shareCount: Number(stats?.shareCount || stats?.share_count || 0),
      live: false,
    };
  }).filter(Boolean), max);
}

async function collectRecommend(max = 60) {
  const page = await newTikTokPage();
  const capture = captureTikTokResponses(page, max);
  try {
    await page.goto('https://www.tiktok.com/foryou?lang=vi-VN&region=VN', {
      waitUntil: 'domcontentloaded',
      timeout: 14000,
    }).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2200));

    const initial = uniqueRows([
      ...(await capture.collect()),
      ...(await universalRows(page, max)),
    ], max);
    if (initial.length >= 5) {
      console.log('recommend:initial', initial.length);
      return initial;
    }

    const apiRows = await tryRecommendApi(page, max);
    if (apiRows.length >= 5) {
      console.log('recommend:same-origin-api', apiRows.length);
      return uniqueRows([...initial, ...apiRows], max);
    }

    await scrollFeed(page, 5);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const rows = uniqueRows([
      ...initial,
      ...apiRows,
      ...(await capture.collect()),
      ...(await universalRows(page, max)),
      ...(await collectVideoLinks(page, max)),
    ], max);

    console.log('recommend:collected', rows.length);
    if (!rows.length) await logTikTokPageDebug(page, 'recommend');
    return rows;
  } finally {
    capture.stop();
    await page.close().catch(() => {});
  }
}

async function collectExplore(max = 60) {
  const page = await newTikTokPage();
  const capture = captureTikTokResponses(page, max);
  try {
    await page.goto('https://www.tiktok.com/explore?lang=vi-VN&region=VN', {
      waitUntil: 'domcontentloaded',
      timeout: 14000,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 2200));

    await scrollFeed(page, 5);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const rows = uniqueRows([
      ...(await capture.collect()),
      ...(await universalRows(page, max)),
      ...(await collectVideoLinks(page, max)),
    ], max);

    console.log('explore:collected', rows.length);
    if (!rows.length) await logTikTokPageDebug(page, 'explore');
    return rows;
  } finally {
    capture.stop();
    await page.close().catch(() => {});
  }
}

async function collectProfile(handle, max = 12) {
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(handle)) return [];
  const page = await newTikTokPage();
  try {
    await page.goto('https://www.tiktok.com/@' + encodeURIComponent(handle) + '?lang=vi-VN', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await scrollFeed(page, 4);
    return await collectVideoLinks(page, max);
  } finally {
    await page.close().catch(() => {});
  }
}

async function collectFollowing(handles, max = 60) {
  const unique = [...new Set(handles.filter((value) => /^[A-Za-z0-9._-]{2,64}$/.test(value)))].slice(0, 20);
  if (!unique.length) return [];

  const batches = [];
  for (let i = 0; i < unique.length; i += 4) {
    batches.push(unique.slice(i, i + 4));
  }

  const rows = [];
  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((handle) => collectProfile(handle, 10)));
    for (const result of results) {
      if (result.status === 'fulfilled') rows.push(...result.value);
    }
    if (rows.length >= max) break;
  }

  return uniqueRows(rows, max).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

async function getLiveInfo(handle) {
  const referer = 'https://www.tiktok.com/@' + handle + '/live';
  try {
    const url = new URL('https://www.tiktok.com/api-live/user/room');
    url.searchParams.set('aid', '1988');
    url.searchParams.set('sourceType', '54');
    url.searchParams.set('uniqueId', handle);

    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/153 Safari/537.36',
        'referer': referer,
        'accept-language': 'vi-VN,vi;q=0.9,en;q=0.5',
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const room = data?.data?.liveRoom;
    if (!room || Number(room.status) === 4) return null;

    let streamUrl = '';
    const raw = room?.streamData?.pull_data?.stream_data;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const variants = Object.values(parsed?.data || {});
        variants.sort((a, b) => {
          const av = Number(JSON.parse(a?.main?.sdk_params || '{}')?.vbitrate || 0);
          const bv = Number(JSON.parse(b?.main?.sdk_params || '{}')?.vbitrate || 0);
          return bv - av;
        });
        streamUrl = String(variants?.[0]?.main?.flv || '');
      } catch {}
    }

    return {
      id: String(room.streamId || handle),
      handle,
      title: String(room.title || ('@' + handle + ' đang LIVE')),
      thumbnail: '',
      timestamp: Math.floor(Date.now() / 1000),
      viewCount: Number(room?.user_count || room?.viewerCount || 0),
      live: true,
      streamUrl,
      url: referer,
    };
  } catch {
    return null;
  }
}

async function collectLive(max = 30) {
  const page = await newTikTokPage();
  try {
    await page.goto('https://www.tiktok.com/live?lang=vi-VN&region=VN', {
      waitUntil: 'domcontentloaded',
      timeout: 14000,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await scrollFeed(page, 5);

    const handles = await page.evaluate(() => {
      const set = new Set();
      for (const anchor of document.querySelectorAll('a[href*="/live"], a[href^="/@"]')) {
        const href = anchor.href || '';
        let match = href.match(/tiktok\.com\/@([^/?#]+)\/live/i);
        if (match) {
          set.add(match[1]);
          continue;
        }
        const text = String(anchor.closest('div')?.innerText || '').toUpperCase();
        match = href.match(/tiktok\.com\/@([^/?#]+)(?:$|[?#])/i);
        if (match && text.includes('LIVE')) set.add(match[1]);
      }
      return [...set];
    }).catch(() => []);

    const results = await Promise.allSettled(handles.slice(0, 40).map(getLiveInfo));
    return uniqueRows(results
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value), max);
  } finally {
    await page.close().catch(() => {});
  }
}

function cached(key, ttlMs) {
  const row = cache.get(key);
  if (row && Date.now() - row.at < ttlMs) return row.value;
  return null;
}

function putCache(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 30) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}


async function refreshPublicFeed(mode) {
  if (!['recommend', 'explore', 'live'].includes(mode)) return [];
  if (refreshInFlight.has(mode)) return refreshInFlight.get(mode);

  const task = (async () => {
    const started = Date.now();
    let items = [];
    try {
      if (mode === 'recommend') items = await collectRecommend(70);
      else if (mode === 'explore') items = await collectExplore(70);
      else items = await collectLive(40);

      if (items.length) {
        warmFeeds.set(mode, { at: Date.now(), items });
        console.log('prefetch:done', mode, 'items=' + items.length, 'ms=' + (Date.now() - started));
      } else {
        console.log('prefetch:empty', mode, 'ms=' + (Date.now() - started));
      }
      return items;
    } catch (error) {
      console.error('prefetch:failed', mode, error?.message || error);
      return [];
    } finally {
      refreshInFlight.delete(mode);
    }
  })();

  refreshInFlight.set(mode, task);
  return task;
}

function publicFeedCache(mode, limit) {
  const row = warmFeeds.get(mode);
  if (!row?.items?.length) return null;
  const maxAge = mode === 'live' ? 2 * 60 * 1000 : 8 * 60 * 1000;
  if (Date.now() - row.at > maxAge) {
    void refreshPublicFeed(mode);
  }
  return row.items.slice(0, limit);
}

async function withTimeout(promise, ms, fallback = []) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function feed(mode, handles, limit) {
  const started = Date.now();
  console.log('feed:start', mode, 'handles=' + handles.length, 'limit=' + limit);

  if (['recommend', 'explore', 'live'].includes(mode)) {
    let items = publicFeedCache(mode, limit);
    if (!items) {
      items = await withTimeout(refreshPublicFeed(mode), 30000, []);
      items = items.slice(0, limit);
    }

    const value = {
      items,
      sources: [...new Set(items.map((item) => item.handle).filter(Boolean))],
      mode,
      warming: items.length === 0 && refreshInFlight.has(mode),
    };
    console.log('feed:done', mode, 'items=' + items.length, 'ms=' + (Date.now() - started));
    return value;
  }

  if (mode === 'following') {
    const cacheKey = mode + ':' + handles.join(',') + ':' + limit;
    const hit = cached(cacheKey, 90_000);
    if (hit) return hit;

    const items = await withTimeout(collectFollowing(handles, limit), 30000, []);
    const value = {
      items,
      sources: [...new Set(items.map((item) => item.handle).filter(Boolean))],
      mode,
    };
    putCache(cacheKey, value);
    console.log('feed:done', mode, 'items=' + items.length, 'ms=' + (Date.now() - started));
    return value;
  }

  throw new Error('unsupported_mode');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': ORIGIN,
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      service: '1988-tiktok-browser',
      browser: Boolean(browserPromise),
      platforms: ['tiktok'],
    });
    return;
  }

  if (url.pathname === '/login/tiktok') {
    if (!loginAuthorized(url)) {
      html(res, 403, '<!doctype html><meta charset="utf-8"><title>403</title><p>Link đăng nhập không hợp lệ.</p>');
      return;
    }
    try {
      await startTikTokLogin();
      html(res, 200, tiktokLoginHtml(url.searchParams.get('key') || ''));
    } catch (error) {
      tiktokLoginStatus='error';
      tiktokLoginError=String(error?.message||error);
      html(res, 502, '<!doctype html><meta charset="utf-8"><title>Lỗi TikTok</title><p>Không tạo được QR TikTok. Hãy tải lại trang sau.</p>');
    }
    return;
  }

  if (url.pathname === '/login/tiktok/status') {
    if (!loginAuthorized(url)) {
      json(res, 403, { ok:false, error:'invalid_login_link' });
      return;
    }
    await refreshTikTokLoginState({capture:false});
    json(res, 200, {
      ok:true,
      status:tiktokLoginStatus,
      error:tiktokLoginError||null,
      updatedAt:tiktokLoginUpdatedAt||null,
    });
    return;
  }

  if (url.pathname === '/login/tiktok/qr') {
    if (!loginAuthorized(url)) {
      res.writeHead(403,{'cache-control':'no-store'});
      res.end();
      return;
    }
    await refreshTikTokLoginState({capture:true});
    if(!tiktokLoginQr){
      res.writeHead(404,{'cache-control':'no-store'});
      res.end();
      return;
    }
    res.writeHead(200,{
      'content-type':'image/png',
      'cache-control':'no-store',
      'content-length':String(tiktokLoginQr.length),
    });
    res.end(tiktokLoginQr);
    return;
  }

  if (url.pathname === '/login/tiktok/restart') {
    if (!loginAuthorized(url)) {
      json(res, 403, { ok:false, error:'invalid_login_link' });
      return;
    }
    try{
      await startTikTokLogin({restart:true});
      json(res, 200, {ok:true,status:tiktokLoginStatus});
    }catch(error){
      tiktokLoginStatus='error';
      tiktokLoginError=String(error?.message||error);
      json(res, 502, {ok:false,error:tiktokLoginError});
    }
    return;
  }

  if (url.pathname === '/social-status') {
    try {
      json(res, 200, { ok: true, ...(await socialHub.status()) });
    } catch (error) {
      json(res, 502, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (url.pathname === '/social-feed' && req.method === 'GET') {
    const platform = String(url.searchParams.get('platform') || '').toLowerCase();
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 80), 200));
    if (!['tiktok','youtube','facebook','news'].includes(platform)) {
      json(res, 400, { ok: false, error: 'invalid_platform' });
      return;
    }
    try {
      const row = await socialHub.getSnapshot(platform);
      json(res, 200, {
        ok: true,
        platform,
        status: row?.status || null,
        collectedAt: row?.collectedAt || null,
        data: row?.payload
          ? { ...row.payload, items: (row.payload.items || []).slice(0, limit) }
          : null,
      });
    } catch (error) {
      json(res, 502, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (url.pathname === '/collect' && req.method === 'POST') {
    if (!socialHub.authorized(req)) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const platform = String(url.searchParams.get('platform') || '').toLowerCase();
    try {
      let data;
      if (platform === 'tiktok') {
        const live = await feed('live', [], 40);
        const recommend = await feed('recommend', [], 70);
        data = {
          platform: 'tiktok',
          count: recommend.items.length + live.items.length,
          liveCount: live.items.length,
          items: uniqueRows([
            ...live.items.map(item => ({ platform:'tiktok', ...item, isLive:true })),
            ...recommend.items.map(item => ({ platform:'tiktok', ...item, isLive:Boolean(item.live) })),
          ], 100),
        };
        await socialHub.saveSnapshot('tiktok', data, 'ok');
      } else {
        data = await socialHub.collect(platform);
      }
      json(res, 200, { ok: true, data });
    } catch (error) {
      json(res, 502, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  const sessionMatch = url.pathname.match(/^\/session\/(tiktok|youtube|facebook)$/);
  if (sessionMatch) {
    if (!socialHub.authorized(req)) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const platform = sessionMatch[1];
    try {
      if (req.method === 'GET') {
        json(res, 200, { ok: true, ...(await socialHub.sessionInfo(platform)) });
        return;
      }
      if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new Error('body_too_large');
          chunks.push(chunk);
        }
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        const cookies = body?.cookies || body?.state?.cookies || [];
        json(res, 200, { ok: true, ...(await socialHub.importSession(platform, cookies)) });
        return;
      }
      json(res, 405, { ok: false, error: 'method_not_allowed' });
    } catch (error) {
      json(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (url.pathname === '/media' && req.method === 'GET') {
    const target = String(url.searchParams.get('url') || '').trim();
    if (!target) {
      json(res, 400, { ok: false, error: 'missing_url' });
      return;
    }
    try {
      const data = await resolveTikTokMedia(target);
      json(res, data.bestVideoUrl ? 200 : 404, {
        ok: Boolean(data.bestVideoUrl),
        data,
        error: data.bestVideoUrl ? null : 'media_not_found',
      });
    } catch (error) {
      json(res, 502, { ok: false, error: String(error?.message || error || 'media_resolve_failed') });
    }
    return;
  }

  if (url.pathname === '/feed') {
    const mode = String(url.searchParams.get('mode') || 'recommend');
    const handles = String(url.searchParams.get('handles') || '')
      .split(',')
      .map((value) => value.trim().replace(/^@/, ''))
      .filter(Boolean);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 50), 80));

    try {
      const data = await feed(mode, handles, limit);
      json(res, 200, { ok: true, data });
    } catch (error) {
      browserPromise = null;
      json(res, 502, {
        ok: false,
        error: String(error?.message || error || 'feed_failed'),
      });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('1988 social hub service listening on', PORT);
  void socialHub.init();
  void getBrowser()
    .then(async () => {
      console.log('chromium:warm');
      // Warm serially. One browser is enough; parallel page launches on a free
      // instance waste CPU/RAM and previously caused Chromium extraction races.
      await refreshPublicFeed('recommend');
      await refreshPublicFeed('explore');
      await refreshPublicFeed('live');
    })
    .catch((error) => console.error('chromium:warm-failed', error?.message || error));

  setInterval(() => {
    void refreshPublicFeed('recommend');
    void refreshPublicFeed('explore');
  }, 5 * 60 * 1000).unref();

  setInterval(() => {
    void refreshPublicFeed('live');
  }, 60 * 1000).unref();

});
