function nowIso(){return new Date().toISOString();}

function safeJson(text){
  if(text&&typeof text==='object')return text;
  const raw=String(text||'').trim();
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{}
  return null;
}

function deepFind(value,names,depth=0){
  if(depth>7||value==null)return null;
  if(typeof value==='string'){
    const parsed=safeJson(value);
    if(parsed&&parsed!==value)return deepFind(parsed,names,depth+1);
    return null;
  }
  if(Array.isArray(value)){
    for(const item of value){
      const found=deepFind(item,names,depth+1);
      if(found!=null)return found;
    }
    return null;
  }
  if(typeof value!=='object')return null;
  for(const name of names){
    if(Object.prototype.hasOwnProperty.call(value,name)&&value[name]!=null)return value[name];
  }
  for(const item of Object.values(value)){
    const found=deepFind(item,names,depth+1);
    if(found!=null)return found;
  }
  return null;
}

function signalFrom(raw){
  const payload=safeJson(raw);
  let status=deepFind(payload,['status','qr_status','status_code','scan_status']);
  let redirect=deepFind(payload,['redirect_url','redirectUri','redirect_uri','redirectUrl']);

  if(!payload&&typeof raw==='string'){
    const redirectMatch=raw.match(/["']redirect_(?:url|uri)["']\s*:\s*["']([^"']+)["']/i);
    const statusMatch=raw.match(/["'](?:qr_)?status(?:_code)?["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/i);
    if(redirectMatch)redirect=redirectMatch[1].replace(/\\u002F/g,'/').replace(/\\\//g,'/');
    if(statusMatch)status=statusMatch[1];
  }
  return {
    status:status==null?'':String(status).toLowerCase(),
    redirect:redirect==null?'':String(redirect).replace(/\\u002F/g,'/').replace(/\\\//g,'/'),
  };
}

function safeRedirect(value){
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return '';
    const h=u.hostname.toLowerCase();
    if(h==='tiktok.com'||h.endsWith('.tiktok.com')||h==='tiktokv.com'||h.endsWith('.tiktokv.com')){
      return u.toString();
    }
  }catch{}
  return '';
}

async function browserCookies(page){
  let cdp=null;
  try{
    cdp=await page.createCDPSession();
    await cdp.send('Network.enable');
    const out=await cdp.send('Network.getAllCookies');
    return (out?.cookies||[]).filter(cookie=>{
      const d=String(cookie?.domain||'').replace(/^\./,'').toLowerCase();
      return d==='tiktok.com'||d.endsWith('.tiktok.com')||d==='tiktokv.com'||d.endsWith('.tiktokv.com');
    });
  }catch{
    return await page.cookies('https://www.tiktok.com/').catch(()=>[]);
  }finally{
    try{await cdp?.detach?.();}catch{}
  }
}

export function createTikTokLoginRuntime({
  getBrowser,
  loadSession,
  saveSession,
  normalizeCookies,
  sleep,
  logger=console,
}){
  let page=null;
  let qr=null;
  let pollTimer=0;
  let cdp=null;
  let completing=false;
  let state={
    status:'idle',
    userId:null,
    username:null,
    error:null,
    updatedAt:nowIso(),
  };

  const set=patch=>{
    state={...state,...patch,updatedAt:nowIso()};
    return {...state};
  };

  function snapshot(){return {...state};}

  async function waitForQrVisual(pageRef,timeoutMs=14000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      if(!pageRef||pageRef.isClosed())return false;
      const ready=await pageRef.evaluate(()=>{
        const scoreNode=el=>{
          try{
            const r=el.getBoundingClientRect();
            const w=r.width,h=r.height;
            if(w<140||h<140||w>460||h>460)return 0;
            if(Math.abs(w-h)>90)return 0;
            if(r.bottom<80||r.top>innerHeight-80)return 0;
            if(r.right<80||r.left>innerWidth-80)return 0;
            let score=Math.min(w,h);
            if(el.tagName==='CANVAS')score+=80;
            if(el.tagName==='SVG')score+=50;
            if(el.tagName==='IMG'){
              const nw=Number(el.naturalWidth||0),nh=Number(el.naturalHeight||0);
              if(nw<100||nh<100)return 0;
              score+=40;
            }
            const centerX=r.left+w/2,centerY=r.top+h/2;
            if(centerX>innerWidth*.2&&centerX<innerWidth*.8)score+=40;
            if(centerY>innerHeight*.12&&centerY<innerHeight*.75)score+=40;
            return score;
          }catch{return 0}
        };
        const nodes=[...document.querySelectorAll('canvas,img,svg')];
        const best=nodes.reduce((acc,el)=>{
          const score=scoreNode(el);
          return score>acc.score?{score,tag:el.tagName}:acc;
        },{score:0,tag:''});
        return best.score>=220;
      }).catch(()=>false);
      if(ready)return true;
      await new Promise(resolve=>setTimeout(resolve,280));
    }
    return false;
  }

  async function captureQr(){
    const pageRef=page;
    if(!pageRef||pageRef.isClosed())return null;
    const visualReady=await waitForQrVisual(pageRef,14000);
    if(!visualReady||page!==pageRef||pageRef.isClosed())return null;
    qr=await pageRef.screenshot({
      type:'png',
      fullPage:false,
      captureBeyondViewport:false,
    }).catch(()=>null);
    return qr;
  }

  async function readProfile(pageRef=page){
    if(!pageRef||pageRef.isClosed())return {username:null,userId:null};
    return pageRef.evaluate(()=>{
      const links=[...document.querySelectorAll('a[href^="/@"]')];
      let pick=links.find(a=>
        a.querySelector('img')||
        /profile|hồ sơ|trang cá nhân/i.test(String(a.getAttribute('aria-label')||a.textContent||''))
      );
      if(!pick)pick=links[0]||null;
      const href=String(pick?.getAttribute('href')||'');
      const m=href.match(/^\/@([^/?#]+)/);
      const username=m?m[1]:null;
      const scripts=[...document.querySelectorAll('script')].map(s=>String(s.textContent||''));
      let userId=null;
      for(const text of scripts){
        if(!username||!text.includes(username))continue;
        const uid=text.match(/"(?:uid|user_id|userId)"\s*:\s*"?(\d{6,30})"?/);
        if(uid){userId=uid[1];break;}
      }
      return {username,userId};
    }).catch(()=>({username:null,userId:null}));
  }

  async function persistAfterConfirmed(redirectUrl,source){
    if(completing||!page||page.isClosed())return;
    completing=true;
    set({status:'confirming',error:null});
    try{
      const redirect=safeRedirect(redirectUrl);
      if(redirect){
        logger.info?.('[tiktok-login] confirmed via '+source+'; following official redirect');
        await page.goto(redirect,{waitUntil:'domcontentloaded',timeout:25000}).catch(error=>{
          logger.warn?.('[tiktok-login] redirect navigation',String(error?.message||error));
        });
      }else{
        logger.info?.('[tiktok-login] confirmed via '+source+'; opening TikTok home');
      }

      if(!/^https:\/\/[^/]*tiktok\.com\//i.test(page.url())||/\/login(?:\/|\?|$)/i.test(page.url())){
        await page.goto('https://www.tiktok.com/foryou?lang=vi-VN',{
          waitUntil:'domcontentloaded',
          timeout:25000,
        }).catch(()=>{});
      }
      await sleep(1400);

      const cookies=await browserCookies(page);
      if(!cookies.length)throw new Error('tiktok_session_cookie_empty');

      const normalized=normalizeCookies(cookies);
      const saved=await saveSession('tiktok',{cookies:normalized});
      if(saved===false)throw new Error('tiktok_session_save_failed');

      const profile=await readProfile();
      set({
        status:'success',
        username:profile.username||null,
        userId:profile.userId||null,
        error:null,
      });
      qr=null;
      logger.info?.(
        '[tiktok-login] logged in'+
        (profile.username?' @'+profile.username:'')+
        ' cookies='+normalized.length
      );
      if(pollTimer){clearInterval(pollTimer);pollTimer=0;}
    }catch(error){
      set({status:'error',error:String(error?.message||error)});
      logger.error?.('[tiktok-login] finalize failed',String(error?.message||error));
    }finally{
      completing=false;
    }
  }

  async function processSignal(raw,source='network'){
    const {status,redirect}=signalFrom(raw);
    if(redirect){
      await persistAfterConfirmed(redirect,source);
      return;
    }
    if(!status)return;

    if(status==='scanned'||status==='scan'||status==='1'){
      if(state.status!=='success'&&state.status!=='confirming')set({status:'scanned',error:null});
      return;
    }
    if(status==='confirmed'||status==='confirm'||status==='approved'){
      if(state.status!=='success')set({status:'confirming',error:null});
      return;
    }
    if(status==='expired'||status==='refused'||status==='4'){
      if(state.status!=='success')set({status:'expired',error:null});
    }
  }

  async function detectAuthenticated(source='watch'){
    const pageRef=page;
    if(completing||!pageRef||pageRef.isClosed())return false;
    try{
      const cookies=await browserCookies(pageRef);
      if(page!==pageRef||pageRef.isClosed())return false;
      const profile=await readProfile(pageRef);
      if(page!==pageRef||pageRef.isClosed())return false;
      const currentUrl=String(pageRef.url()||'');
      const hasSessionCookie=cookies.some(cookie=>
        /^(sessionid|sessionid_ss)$/i.test(String(cookie?.name||''))&&
        String(cookie?.value||'').length>8
      );
      const leftLogin=!/\/login(?:\/|\?|$)/i.test(currentUrl);
      if(!hasSessionCookie&&!(leftLogin&&profile.username))return false;

      completing=true;
      set({status:'confirming',error:null});
      const normalized=normalizeCookies(cookies);
      const saved=await saveSession('tiktok',{cookies:normalized});
      if(saved===false)throw new Error('tiktok_session_save_failed');

      set({
        status:'success',
        username:profile.username||null,
        userId:profile.userId||null,
        error:null,
      });
      qr=null;
      logger.info?.(
        '[tiktok-login] logged in via '+source+
        (profile.username?' @'+profile.username:'')+
        ' cookies='+normalized.length
      );
      if(pollTimer){clearInterval(pollTimer);pollTimer=0;}
      return true;
    }catch(error){
      logger.warn?.('[tiktok-login] auth watch',String(error?.message||error));
      return false;
    }finally{
      completing=false;
    }
  }

  async function attachNetwork(){
    page.on('response',response=>{
      const url=String(response.url()||'');
      if(!/check_qrconnect/i.test(url))return;
      void response.text()
        .then(async text=>{
          const signal=signalFrom(text);
          logger.info?.(
            '[tiktok-login] qr signal status='+(signal.status||'unknown')+
            ' redirect='+(signal.redirect?'yes':'no')
          );
          await processSignal(text,'http');
          await detectAuthenticated('http');
        })
        .catch(()=>{});
    });

    try{
      cdp=await page.createCDPSession();
      await cdp.send('Network.enable');
      cdp.on('Network.webSocketFrameReceived',event=>{
        const data=String(event?.response?.payloadData||'');
        if(!data||!/confirmed|redirect_url|qrconnect|scanned/i.test(data))return;
        const signal=signalFrom(data);
        logger.info?.(
          '[tiktok-login] ws signal status='+(signal.status||'unknown')+
          ' redirect='+(signal.redirect?'yes':'no')
        );
        void processSignal(data,'websocket');
      });
    }catch(error){
      logger.warn?.('[tiktok-login] websocket monitor unavailable',String(error?.message||error));
    }

    pollTimer=setInterval(()=>{void detectAuthenticated('watch');},1000);
    pollTimer.unref?.();
  }

  async function restoreSavedSession(){
    const saved=await loadSession('tiktok').catch(()=>null);
    const cookies=normalizeCookies(saved?.state?.cookies||[]);
    if(!cookies.length)return false;
    await page.setCookie(...cookies).catch(()=>{});
    await page.goto('https://www.tiktok.com/foryou?lang=vi-VN',{
      waitUntil:'domcontentloaded',
      timeout:18000,
    }).catch(()=>{});
    await sleep(900);
    const profile=await readProfile();
    const all=await browserCookies(page);
    const authCookie=all.some(cookie=>
      /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss)$/i.test(String(cookie?.name||''))&&
      String(cookie?.value||'').length>8
    );
    if(!authCookie&&!profile.username)return false;
    set({
      status:'success',
      username:profile.username||null,
      userId:profile.userId||null,
      error:null,
    });
    logger.info?.('[tiktok-login] restored saved session'+(profile.username?' @'+profile.username:''));
    return true;
  }

  async function close(){
    if(pollTimer){clearInterval(pollTimer);pollTimer=0;}
    completing=false;
    try{await cdp?.detach?.();}catch{}
    cdp=null;
    const old=page;
    page=null;
    if(old)await old.close().catch(()=>{});
  }

  async function start({restart=false}={}){
    if(restart)await close();

    if(page&&!page.isClosed()){
      if(!qr&&state.status!=='success')await captureQr();
      return snapshot();
    }

    set({status:'starting',username:null,userId:null,error:null});
    qr=null;

    try{
      logger.info?.('[tiktok-login] start browser page');
      const browser=await getBrowser();
      page=await browser.newPage();

      await page.setViewport({width:900,height:760,deviceScaleFactor:2});
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '+
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'accept-language':'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.4'
      });
      await page.emulateTimezone('Asia/Ho_Chi_Minh').catch(()=>{});

      await attachNetwork();

      logger.info?.('[tiktok-login] open qr page');
      await page.goto('https://www.tiktok.com/login/qrcode?lang=vi-VN',{
        waitUntil:'domcontentloaded',
        timeout:20000,
      }).catch(error=>{
        logger.warn?.('[tiktok-login] qr page navigation',String(error?.message||error));
      });

      // TikTok often returns the QR token several seconds after DOMContentLoaded.
      // Do not mark a screenshot containing only the spinner as a ready QR.
      const image=await captureQr();
      if(!image)throw new Error('tiktok_qr_capture_failed');

      set({status:'waiting_qr',error:null});
      logger.info?.('[tiktok-login] qr ready');
      return snapshot();
    }catch(error){
      set({status:'error',error:String(error?.message||error)});
      logger.error?.('[tiktok-login] start failed',String(error?.stack||error?.message||error));
      await close().catch(()=>{});
      throw error;
    }
  }
  async function refresh(){
    if(state.status==='waiting_qr'||state.status==='scanned'||state.status==='confirming'){
      await detectAuthenticated('status');
    }
    return snapshot();
  }

  return {
    start,
    refresh,
    snapshot,
    qr(){return qr;},
    close,
  };
}
