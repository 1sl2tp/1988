const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const COLLECTOR_TOKEN=String(process.env.COLLECTOR_TOKEN||'');
const TZ='Asia/Ho_Chi_Minh';

const PLATFORMS=new Set(['tiktok','youtube','facebook','news']);
const BROWSER_PLATFORMS=new Set(['tiktok','youtube','facebook']);

function nowIso(){return new Date().toISOString();}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function clean(value,max=500){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);}
function uniq(rows,keyFn,max=100){
  const out=[]; const seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row)continue;
    const key=String(keyFn(row)||'');
    if(!key||seen.has(key))continue;
    seen.add(key); out.push(row);
    if(out.length>=max)break;
  }
  return out;
}

export function createSocialHub({getBrowser,logger=console}){
  const snapshots=new Map();
  const lastRuns=new Map();

  function authorized(req){
    return Boolean(COLLECTOR_TOKEN)&&String(req?.headers?.['x-collector-token']||'')===COLLECTOR_TOKEN;
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
      return Array.isArray(rows)?rows[0]||null:null;
    }catch(error){
      logger.warn('[social-store] load session',platform,String(error?.message||error));
      return null;
    }
  }
  async function saveSession(platform,state){
    if(!BROWSER_PLATFORMS.has(platform))return false;
    try{
      const r=await fetch(
        SUPABASE_URL+'/rest/v1/yt1988_social_sessions?on_conflict=platform',
        {
          method:'POST',
          headers:storeHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify([{platform,state,updated_at:nowIso()}])
        }
      );
      if(!r.ok)throw new Error('session_write_'+r.status);
      return true;
    }catch(error){
      logger.warn('[social-store] save session',platform,String(error?.message||error));
      return false;
    }
  }
  async function loadSnapshot(platform){
    try{
      const r=await fetch(
        SUPABASE_URL+'/rest/v1/yt1988_social_snapshots?platform=eq.'+
        encodeURIComponent(platform)+'&select=payload,status,collected_at,updated_at&limit=1',
        {headers:storeHeaders()}
      );
      if(!r.ok)throw new Error('snapshot_read_'+r.status);
      const rows=await r.json();
      const row=Array.isArray(rows)?rows[0]||null:null;
      if(row?.payload)snapshots.set(platform,{
        payload:row.payload,
        status:row.status||'ok',
        collectedAt:row.collected_at||row.updated_at||null
      });
      return row;
    }catch(error){
      logger.warn('[social-store] load snapshot',platform,String(error?.message||error));
      return null;
    }
  }
  async function saveSnapshot(platform,payload,status='ok'){
    const collectedAt=nowIso();
    snapshots.set(platform,{payload,status,collectedAt});
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
      if(!r.ok)throw new Error('snapshot_write_'+r.status);
      return true;
    }catch(error){
      logger.warn('[social-store] save snapshot',platform,String(error?.message||error));
      return false;
    }
  }

  function normalizeCookies(rows=[]){
    return (Array.isArray(rows)?rows:[]).map(row=>{
      const out={
        name:String(row?.name||''),
        value:String(row?.value||''),
        domain:String(row?.domain||''),
        path:String(row?.path||'/'),
        secure:Boolean(row?.secure),
        httpOnly:Boolean(row?.httpOnly),
      };
      if(Number(row?.expires)>0)out.expires=Number(row.expires);
      if(['Strict','Lax','None'].includes(row?.sameSite))out.sameSite=row.sameSite;
      return out;
    }).filter(row=>row.name&&row.domain);
  }

  async function bindPageSession(platform,page){
    if(!BROWSER_PLATFORMS.has(platform)||!page)return page;
    const stored=await loadSession(platform);
    const cookies=normalizeCookies(stored?.state?.cookies||[]);
    if(cookies.length){
      await page.setCookie(...cookies).catch(error=>{
        logger.warn('[social-session] restore',platform,String(error?.message||error));
      });
    }

    const rawClose=page.close.bind(page);
    let closed=false;
    page.close=async(...args)=>{
      if(closed)return;
      closed=true;
      try{
        const current=await page.cookies();
        if(current.length)await saveSession(platform,{cookies:current});
      }catch(error){
        logger.warn('[social-session] export',platform,String(error?.message||error));
      }
      return rawClose(...args);
    };
    return page;
  }

  async function newPlatformPage(platform){
    const browser=await getBrowser();
    const page=await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'});
    await page.emulateTimezone(TZ).catch(()=>{});
    await bindPageSession(platform,page);
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const type=request.resourceType();
      if(type==='font'||type==='media')request.abort().catch(()=>{});
      else request.continue().catch(()=>{});
    });
    return page;
  }

  async function goto(page,url,timeout=18000){
    await page.goto(url,{waitUntil:'domcontentloaded',timeout}).catch(error=>{
      logger.warn('[social-page] goto',url,String(error?.message||error));
    });
    await sleep(1200);
  }
  async function scroll(page,passes=3){
    for(let i=0;i<passes;i+=1){
      await page.evaluate(()=>window.scrollBy(0,Math.max(window.innerHeight,850))).catch(()=>{});
      await sleep(500);
    }
  }

  async function collectYouTube(){
    const page=await newPlatformPage('youtube');
    const rows=[];
    try{
      for(const [origin,url] of [
        ['home','https://www.youtube.com/'],
        ['subscriptions','https://www.youtube.com/feed/subscriptions'],
      ]){
        await goto(page,url);
        await scroll(page,3);
        const found=await page.evaluate((originLabel)=>{
          const out=[];
          for(const card of document.querySelectorAll(
            'ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer'
          )){
            const a=card.querySelector('a#video-title-link,a#video-title,a[href^="/watch?v="]');
            const href=String(a?.href||'');
            const m=href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
            if(!m)continue;
            const meta=String(card.innerText||'').replace(/\s+/g,' ').trim();
            const img=card.querySelector('img');
            out.push({
              id:m[1],
              url:'https://www.youtube.com/watch?v='+m[1],
              title:String(a?.getAttribute('title')||a?.textContent||'').replace(/\s+/g,' ').trim(),
              sourceName:String(card.querySelector('ytd-channel-name a,#channel-name a')?.textContent||'').replace(/\s+/g,' ').trim(),
              thumbnail:String(img?.currentSrc||img?.src||''),
              isLive:/TRỰC TIẾP|ĐANG PHÁT TRỰC TIẾP|LIVE NOW|\bLIVE\b/i.test(meta),
              meta:meta.slice(0,500),
              origin:originLabel
            });
          }
          return out;
        },origin).catch(()=>[]);
        rows.push(...found);
      }
      const items=uniq(rows,row=>row.id,100).map(row=>({
        platform:'youtube',...row,collectedAt:nowIso()
      }));
      return {platform:'youtube',count:items.length,liveCount:items.filter(x=>x.isLive).length,items};
    }finally{
      await page.close().catch(()=>{});
    }
  }

  async function collectFacebook(){
    const page=await newPlatformPage('facebook');
    const rows=[];
    try{
      for(const [origin,url] of [
        ['home','https://www.facebook.com/'],
        ['live','https://www.facebook.com/watch/live/'],
      ]){
        await goto(page,url,20000);
        await scroll(page,3);
        const found=await page.evaluate((originLabel)=>{
          const out=[]; const seen=new Set();
          for(const a of document.querySelectorAll('a[href]')){
            const href=String(a.href||'');
            if(!/facebook\.com\//i.test(href))continue;
            if(!/(\/videos\/|\/live\/|watch\/\?v=|watch\/live)/i.test(href))continue;
            const article=a.closest('[role="article"]')||a.closest('div');
            const text=String(article?.innerText||a.innerText||'').replace(/\s+/g,' ').trim();
            const img=article?.querySelector('img');
            const id=href.split('#')[0];
            if(seen.has(id))continue;
            seen.add(id);
            out.push({
              id,url:id,title:text.slice(0,400),sourceName:'',
              thumbnail:String(img?.currentSrc||img?.src||''),
              isLive:/đang phát trực tiếp|trực tiếp|\blive\b/i.test(text),
              origin:originLabel
            });
            if(out.length>=100)break;
          }
          return out;
        },origin).catch(()=>[]);
        rows.push(...found);
      }
      const items=uniq(rows,row=>row.id,100).map(row=>({
        platform:'facebook',...row,collectedAt:nowIso()
      }));
      return {platform:'facebook',count:items.length,liveCount:items.filter(x=>x.isLive).length,items};
    }finally{
      await page.close().catch(()=>{});
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
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
      .replace(/\s+/g,' ').trim();
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
            platform:'news',id:link,url:link,title,sourceName:source,
            description:tag(item,'description').slice(0,500),
            publishedAt:tag(item,'pubDate'),isLive:false,collectedAt:nowIso()
          });
        }
      }catch(error){
        logger.warn('[news] rss',source,String(error?.message||error));
      }
    }
    const items=uniq(rows,row=>row.url,100);
    return {platform:'news',count:items.length,liveCount:0,items};
  }

  const collectors={youtube:collectYouTube,facebook:collectFacebook,news:collectNews};

  async function collect(platform){
    if(!collectors[platform])throw new Error('unsupported_social_platform');
    const started=Date.now();
    lastRuns.set(platform,{status:'running',startedAt:nowIso()});
    try{
      const payload=await collectors[platform]();
      await saveSnapshot(platform,payload,'ok');
      lastRuns.set(platform,{
        status:'ok',finishedAt:nowIso(),ms:Date.now()-started,
        count:Number(payload.count||0),liveCount:Number(payload.liveCount||0)
      });
      logger.log('[social-collect]',platform,'count='+payload.count,'live='+payload.liveCount,'ms='+(Date.now()-started));
      return payload;
    }catch(error){
      lastRuns.set(platform,{status:'error',finishedAt:nowIso(),ms:Date.now()-started,error:String(error?.message||error)});
      throw error;
    }
  }

  async function getSnapshot(platform){
    if(snapshots.has(platform))return snapshots.get(platform);
    const row=await loadSnapshot(platform);
    if(!row)return null;
    return {
      payload:row.payload||null,
      status:row.status||null,
      collectedAt:row.collected_at||row.updated_at||null
    };
  }

  async function status(){
    const out={};
    for(const platform of PLATFORMS){
      const row=await getSnapshot(platform);
      out[platform]=row?{
        status:row.status,
        collectedAt:row.collectedAt,
        count:Number(row.payload?.count||0),
        liveCount:Number(row.payload?.liveCount||0)
      }:null;
    }
    return {snapshots:out,lastRuns:Object.fromEntries(lastRuns)};
  }

  async function importSession(platform,cookies){
    if(!BROWSER_PLATFORMS.has(platform))throw new Error('invalid_platform');
    const normalized=normalizeCookies(cookies);
    await saveSession(platform,{cookies:normalized});
    return {platform,cookieCount:normalized.length};
  }

  async function sessionInfo(platform){
    if(!BROWSER_PLATFORMS.has(platform))throw new Error('invalid_platform');
    const row=await loadSession(platform);
    const cookies=Array.isArray(row?.state?.cookies)?row.state.cookies:[];
    return {platform,exists:cookies.length>0,cookieCount:cookies.length,updatedAt:row?.updated_at||null};
  }

  async function init(){
    for(const p of PLATFORMS)void loadSnapshot(p);
  }

  return {
    authorized,
    bindPageSession,
    saveSnapshot,
    collect,
    getSnapshot,
    status,
    importSession,
    sessionInfo,
    init,
  };
}
