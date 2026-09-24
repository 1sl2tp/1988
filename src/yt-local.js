import { Innertube, Platform, ProtoUtils, UniversalCache, Utils, YTNodes } from 'https://cdn.jsdelivr.net/npm/youtubei.js@18.1.0/bundle/browser.js';
import { BotGuardClient, getChallenge } from 'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/botguard.js';
import { WebPoMinter, createColdStartToken } from 'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/webpo.js';
import { buildURL, getHeaders } from 'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/utils.js';

const PROXY='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt-browser-proxy';
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

Platform.shim.eval=async (data,env={})=>{
  const names=Object.keys(env);
  const values=names.map(name=>env[name]);
  const runner=new AsyncFunction(...names,'"use strict";\n'+String(data?.output||''));
  return await runner(...values);
};

let ytPromise=null;
let webPoMinterPromise=null;
const videoPoTokenCache=new Map();
const discoveryPages=new Map();

function text(value){
  if(value===undefined||value===null)return '';
  if(typeof value==='string'||typeof value==='number')return String(value);
  try{
    if(typeof value.toString==='function'){
      const out=String(value.toString());
      if(out!=='[object Object]')return out;
    }
  }catch{}
  return '';
}

function parseDuration(value){
  if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);
  const raw=text(value).trim();
  if(!raw)return 0;
  const parts=raw.split(':').map(v=>Number(v));
  if(parts.some(v=>!Number.isFinite(v)))return 0;
  return parts.reduce((acc,v)=>acc*60+v,0);
}

function parseViewCount(value){
  if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);

  let raw=text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/luot xem|views?|watching|dang xem/g,' ')
    .trim();

  if(!raw)return 0;

  const unitMatch=raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*(ty|tr|trieu|nghin|n|k|m|b)\b/);
  if(unitMatch){
    const number=Number(unitMatch[1].replace(',','.'))||0;
    const unit=unitMatch[2];
    if(unit==='ty'||unit==='b')return Math.round(number*1e9);
    if(unit==='tr'||unit==='trieu'||unit==='m')return Math.round(number*1e6);
    if(unit==='nghin'||unit==='n'||unit==='k')return Math.round(number*1e3);
  }

  const digits=raw.replace(/[^0-9]/g,'');
  return Number(digits)||0;
}

function thumbnailOf(node,id){
  const rows=
    node?.thumbnails||
    node?.thumbnail||
    node?.video_thumbnails||
    node?.content_image?.image||
    [];
  const first=Array.isArray(rows)?rows[0]:null;
  const url=first?.url||node?.thumbnailUrl||node?.thumbnail_url||'';
  return url||('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg');
}

function lockupMetadataParts(node){
  const rows=node?.metadata?.metadata?.metadata_rows||[];
  const out=[];
  for(const row of rows){
    for(const part of row?.metadata_parts||[]){
      const value=text(part?.text).trim();
      if(value)out.push(value);
    }
  }
  return out;
}

function lockupBadges(node){
  const rows=node?.metadata?.metadata?.metadata_rows||[];
  const out=[];
  for(const row of rows){
    for(const badge of row?.badges||[]){
      const value=text(badge?.text||badge?.accessibility_label||badge?.style).trim();
      if(value)out.push(value);
    }
  }
  return out;
}

function inferPublishedText(parts=[]){
  return parts.find(value=>{
    const raw=String(value||'').toLowerCase();
    return /(?:trước|ago|vừa xong|just now|moments ago|phút|giờ|ngày|tuần|tháng|năm|minute|hour|day|week|month|year)/i.test(raw);
  })||'';
}

function inferViewText(parts=[]){
  return parts.find(value=>
    /(?:lượt xem|views?|đang xem|watching)/i.test(String(value||''))
  )||'';
}

function unwrap(node){
  let row=node;
  for(let i=0;i<3;i++){
    if(row?.content&&typeof row.content==='object')row=row.content;
    else break;
  }
  return row;
}

function normalizeNode(input){
  const node=unwrap(input);
  if(!node||typeof node!=='object')return null;

  const contentType=String(node.content_type||'').toUpperCase();
  const isLockup=Boolean(node.content_id);
  if(isLockup&&contentType&&contentType!=='VIDEO')return null;

  const id=String(
    node.video_id||
    node.videoId||
    node.content_id||
    node.id||
    node.endpoint?.payload?.videoId||
    ''
  );
  if(!VIDEO_ID_RE.test(id))return null;

  const lockupParts=isLockup?lockupMetadataParts(node):[];
  const badges=isLockup?lockupBadges(node):[];

  const duration=Number(node.duration?.seconds)||parseDuration(node.length_text||node.duration);
  const inferredView=inferViewText(lockupParts);
  const inferredPublished=inferPublishedText(lockupParts);
  const views=parseViewCount(node.view_count||node.views||node.short_view_count||inferredView);
  const title=text(node.title||node.video_title||node.metadata?.title)||'Video';

  let uploader=
    node.author?.name||
    text(node.short_byline_text)||
    text(node.long_byline_text)||
    text(node.byline_text)||
    '';

  if(!uploader&&lockupParts.length){
    uploader=lockupParts.find(value=>
      value!==inferredView &&
      value!==inferredPublished &&
      !/(?:lượt xem|views?|đang xem|watching)/i.test(value)
    )||'';
  }

  const publishedText=
    text(node.published||node.published_time||node.published_time_text)||
    inferredPublished;

  const badgeText=badges.join(' ').toLowerCase();
  const isLive=
    !!node.is_live||
    /\blive\b|trực tiếp|dang live|đang live/.test(badgeText)||
    /đang xem|watching now/.test(String(inferredView||'').toLowerCase());

  return {
    videoId:id,
    url:'/watch?v='+id,
    title,
    uploader,
    thumbnailUrl:thumbnailOf(node,id),
    duration,
    views,
    viewText:text(node.short_view_count||node.view_count||node.views)||inferredView,
    publishedText,
    isLive
  };
}

function normalizeRows(rows,limit=30){
  const out=[];
  const seen=new Set();
  for(const raw of rows||[]){
    const row=normalizeNode(raw);
    if(!row||seen.has(row.videoId))continue;
    seen.add(row.videoId);
    out.push(row);
    if(out.length>=limit)break;
  }
  return out;
}

function makeProxyUrl(raw,headers=new Headers()){
  const src=new URL(raw);
  const out=new URL(PROXY);
  out.searchParams.set('__host',src.host);
  out.searchParams.set('__path',src.pathname);
  for(const [k,v] of src.searchParams)out.searchParams.append(k,v);
  out.searchParams.set('__headers',JSON.stringify([...headers]));
  return out.toString();
}

async function proxyFetch(input,init={}){
  const original=input instanceof Request?input:null;
  const src=typeof input==='string'||input instanceof URL?new URL(input):new URL(input.url);
  const headers=new Headers(init.headers||(original?original.headers:undefined));
  const target=makeProxyUrl(src.toString(),headers);
  headers.delete('user-agent');

  const method=String(init.method||(original?original.method:'GET')).toUpperCase();
  let body=init.body;
  if(body===undefined&&original&&!['GET','HEAD'].includes(method)){
    try{body=await original.clone().arrayBuffer()}catch{}
  }

  return fetch(target,{
    ...init,
    method,
    headers,
    body:['GET','HEAD'].includes(method)?undefined:body,
    credentials:'omit',
    redirect:'follow'
  });
}

async function getWebPoMinter(){
  if(webPoMinterPromise)return webPoMinterPromise;

  webPoMinterPromise=(async()=>{
    const requestKey='O43z0dpjhgX20SCx4KAo';
    const challenge=await getChallenge({
      fetchFunction:fetch,
      requestKey
    });

    let interpreterJavascript=
      challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue||'';

    if(!interpreterJavascript){
      const rawUrl=
        challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue||'';
      if(rawUrl){
        const interpreterUrl=rawUrl.startsWith('//')?'https:'+rawUrl:rawUrl;
        const interpreterResponse=await fetch(interpreterUrl,{cache:'no-store'});
        if(!interpreterResponse.ok)throw new Error('pot_interpreter_'+interpreterResponse.status);
        interpreterJavascript=await interpreterResponse.text();
      }
    }

    if(!interpreterJavascript)throw new Error('pot_interpreter_missing');
    new Function(interpreterJavascript)();

    const botGuardClient=await BotGuardClient.create({
      program:challenge.program,
      globalName:challenge.globalName,
      globalObject:window
    });

    const webPoSignalOutput=[];
    const botguardResponse=await botGuardClient.snapshot({webPoSignalOutput},8000);

    const integrityResponse=await fetch(buildURL('GenerateIT'),{
      method:'POST',
      headers:getHeaders(),
      body:JSON.stringify([requestKey,botguardResponse]),
      cache:'no-store'
    });

    if(!integrityResponse.ok){
      throw new Error('pot_integrity_'+integrityResponse.status);
    }

    const integrityJson=await integrityResponse.json();
    const [integrityToken,estimatedTtlSecs,mintRefreshThreshold,websafeFallbackToken]=integrityJson;

    return WebPoMinter.create({
      integrityToken,
      estimatedTtlSecs,
      mintRefreshThreshold,
      websafeFallbackToken
    },webPoSignalOutput);
  })().catch(error=>{
    webPoMinterPromise=null;
    throw error;
  });

  return webPoMinterPromise;
}

async function getVideoPoToken(id){
  const cached=videoPoTokenCache.get(id);
  if(cached&&Date.now()-cached.at<8*60*1000)return cached.token;

  let token='';
  try{
    const minter=await getWebPoMinter();
    token=await minter.mintAsWebsafeString(id);
  }catch(error){
    console.warn('content PoToken mint failed',error);
    try{token=createColdStartToken(id);}catch{}
  }

  if(token)videoPoTokenCache.set(id,{token,at:Date.now()});
  return token;
}

async function getYT(){
  if(ytPromise)return ytPromise;
  ytPromise=(async()=>{
    const visitorData=ProtoUtils.encodeVisitorData(
      Utils.generateRandomString(11),
      Math.floor(Date.now()/1000)
    );
    const cold=createColdStartToken(visitorData);

    return Innertube.create({
      lang:'vi',
      location:'VN',
      timezone:'Asia/Ho_Chi_Minh',
      po_token:cold,
      visitor_data:visitorData,
      fetch:proxyFetch,
      generate_session_locally:true,
      cache:new UniversalCache(false)
    });
  })();

  return ytPromise;
}

function proxiedMediaUrl(raw){
  const headers=new Headers({Accept:'*/*'});
  return makeProxyUrl(raw,headers);
}

function pageRows(result,limit=36){
  return normalizeRows(
    result?.results||
    result?.contents?.contents||
    result?.contents||
    [],
    limit
  );
}

async function nextPage(result){
  if(!result)return null;
  try{
    if(result.has_continuation===false)return null;
    if(typeof result.getContinuation==='function')return await result.getContinuation();
  }catch{}
  return null;
}

async function search(query,filters={}){
  const yt=await getYT();
  const result=await yt.search(String(query||'').trim(),{type:'video',...filters});
  return pageRows(result,36);
}

async function searchPage(key,query,filters={},reset=false){
  const id='search:'+String(key||query||'default');
  const yt=await getYT();
  let result=null;

  if(!reset&&discoveryPages.has(id)){
    result=await nextPage(discoveryPages.get(id));
    if(!result)return [];
  }else{
    result=await yt.search(String(query||'').trim(),{type:'video',...filters});
  }

  discoveryPages.set(id,result);
  return pageRows(result,36);
}

async function home(){
  const yt=await getYT();
  try{
    const result=await yt.getHomeFeed();
    return pageRows(result,30);
  }catch{
    return [];
  }
}

async function homePage(key='home',reset=false){
  const id='home:'+String(key||'home');
  const yt=await getYT();
  let result=null;

  if(!reset&&discoveryPages.has(id)){
    result=await nextPage(discoveryPages.get(id));
    if(!result)return [];
  }else{
    try{result=await yt.getHomeFeed()}catch{}
    if(!result)return [];
  }

  discoveryPages.set(id,result);
  return pageRows(result,36);
}


async function hypeFeed(){
  const yt=await getYT();
  const guide=await yt.getGuide();
  let hype=null;

  for(const section of Array.from(guide?.contents||[])){
    for(const item of Array.from(section?.items||[])){
      if(item?.endpoint?.payload?.browseId==='FEhype_leaderboard'){
        hype=item;
        break;
      }
    }
    if(hype)break;
  }

  if(!hype?.endpoint)return [];

  const parsed=await hype.endpoint.call(yt.actions,{parse:true});
  const memo=parsed?.contents_memo;
  if(!memo)return [];

  const nodes=memo.getType(
    YTNodes.LockupView,
    YTNodes.Video,
    YTNodes.GridVideo,
    YTNodes.VideoCard,
    YTNodes.CompactVideo,
    YTNodes.ReelItem,
    YTNodes.ShortsLockupView
  )||[];

  return normalizeRows(nodes,80);
}

function resetDiscovery(key=''){
  if(!key){
    discoveryPages.clear();
    return;
  }
  for(const id of [...discoveryPages.keys()]){
    if(id.endsWith(':'+key)||id.includes(':'+key+':'))discoveryPages.delete(id);
  }
}

async function suggestions(query){
  const q=String(query||'').trim();
  if(q.length<2)return [];
  const yt=await getYT();
  try{
    const rows=await yt.getSearchSuggestions(q);
    return [...new Set((rows||[]).map(text).filter(Boolean))].slice(0,8);
  }catch{
    return [];
  }
}

async function info(id){
  if(!VIDEO_ID_RE.test(String(id||'')))throw new Error('invalid_video');
  const yt=await getYT();
  const result=await yt.getInfo(id,{client:'WEB'});
  const basic=result?.basic_info||{};
  const thumbnails=Array.isArray(basic.thumbnail)?basic.thumbnail:[];
  const related=normalizeRows(result?.watch_next_feed||[],24);
  return {
    meta:{
      videoId:id,
      title:String(basic.title||''),
      uploader:String(basic.author||basic.channel?.name||''),
      views:Number(basic.view_count)||0,
      duration:Number(basic.duration)||0,
      thumbnailUrl:thumbnails[0]?.url||('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'),
      uploadDate:String(basic.upload_date||basic.publish_date||'')
    },
    related
  };
}

async function probeResolvedMedia(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const res=await fetch(url,{
      method:'GET',
      headers:{Range:'bytes=0-1023'},
      cache:'no-store',
      signal:controller.signal
    });
    const type=String(res.headers.get('content-type')||'').toLowerCase();
    const ok=(res.status===200||res.status===206)&&
      !type.includes('text/html')&&
      !type.includes('application/json')&&
      !type.includes('text/plain');
    try{await res.body?.cancel()}catch{}
    if(!ok)throw new Error('media_probe_'+res.status);
    return true;
  }finally{
    clearTimeout(timer);
  }
}

async function media(id,kind='video'){
  if(!VIDEO_ID_RE.test(String(id||'')))throw new Error('invalid_video');
  if(kind!=='video'&&kind!=='audio')throw new Error('invalid_kind');

  const yt=await getYT();
  const poToken=await getVideoPoToken(id);

  try{
    if(poToken&&yt?.session?.player)yt.session.player.po_token=poToken;
  }catch{}

  const clients=[
    'WEB',
    'MWEB',
    'IOS',
    'ANDROID',
    'WEB_EMBEDDED',
    'TV_EMBEDDED',
    'TV',
    'ANDROID_VR'
  ];
  const tries=[];

  for(const client of clients){
    if(kind==='video'){
      tries.push({
        type:'video+audio',
        quality:'best',
        format:'mp4',
        client,
        ...(poToken?{po_token:poToken}:{})
      });
    }else{
      tries.push({
        type:'audio',
        quality:'best',
        format:'mp4',
        client,
        ...(poToken?{po_token:poToken}:{})
      });
    }
  }

  if(kind==='audio'){
    tries.push({
      type:'audio',
      quality:'best',
      format:'any',
      client:'WEB',
      ...(poToken?{po_token:poToken}:{})
    });
  }

  let lastError=null;

  for(const options of tries){
    try{
      const format=await yt.getStreamingData(id,options);
      if(!format?.url)continue;

      const proxied=proxiedMediaUrl(format.url);
      await probeResolvedMedia(proxied);

      const mime=String(
        format.mime_type||
        format.mimeType||
        (kind==='audio'?'audio/mp4':'video/mp4')
      );

      return {
        url:proxied,
        mimeType:mime,
        itag:format.itag,
        quality:String(format.quality_label||format.quality||''),
        hasAudio:format.has_audio!==false,
        client:options.client,
        poTokenBound:!!poToken
      };
    }catch(error){
      lastError=error;
    }
  }

  // One clean retry with a freshly minted content-bound token in case the
  // previous token aged out while the player metadata was loading.
  try{
    videoPoTokenCache.delete(id);
    const freshToken=await getVideoPoToken(id);
    if(freshToken&&yt?.session?.player)yt.session.player.po_token=freshToken;

    const retryOptions={
      type:kind==='video'?'video+audio':'audio',
      quality:'best',
      format:'mp4',
      client:'WEB',
      ...(freshToken?{po_token:freshToken}:{})
    };

    const format=await yt.getStreamingData(id,retryOptions);
    if(format?.url){
      const proxied=proxiedMediaUrl(format.url);
      await probeResolvedMedia(proxied);
      return {
        url:proxied,
        mimeType:String(format.mime_type||format.mimeType||(kind==='audio'?'audio/mp4':'video/mp4')),
        itag:format.itag,
        quality:String(format.quality_label||format.quality||''),
        hasAudio:format.has_audio!==false,
        client:'WEB',
        poTokenBound:!!freshToken
      };
    }
  }catch(error){
    lastError=error;
  }

  throw lastError||new Error('no_media_stream');
}

const api={getYT,search,searchPage,home,homePage,hypeFeed,resetDiscovery,suggestions,info,media,normalizeRows};
window.YTLocal=api;
window.dispatchEvent(new CustomEvent('ytlocalready'));

export default api;
