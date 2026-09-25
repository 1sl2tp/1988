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
const aiDisclosureMemory=new Map();
const AI_DISCLOSURE_TTL=12*60*60*1000;
const AI_DISCLOSURE_STORAGE_PREFIX='1988-ai-disclosure-v1:';

const embedPlaybackCache=new Map();
const embedPlaybackPending=new Map();
const EMBED_PLAYBACK_TTL=6*60*60*1000;
const EMBED_PLAYBACK_UNKNOWN_TTL=10*60*1000;

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

function thumbnailInfo(node,id){
  const rows=
    node?.thumbnails||
    node?.thumbnail||
    node?.video_thumbnails||
    node?.content_image?.image||
    [];
  const list=Array.isArray(rows)?rows:[rows];
  const usable=list.filter(Boolean);
  const best=usable.find(item=>Number(item?.width)>0&&Number(item?.height)>0)||usable[0]||null;
  const url=best?.url||node?.thumbnailUrl||node?.thumbnail_url||('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg');
  const width=Number(best?.width)||0;
  const height=Number(best?.height)||0;
  return {url,width,height,aspectRatio:width>0&&height>0?width/height:0};
}

function thumbnailOf(node,id){
  return thumbnailInfo(node,id).url;
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

function videoChannelId(node={}){
  const candidates=[
    node?.author?.id,
    node?.author?.channel_id,
    node?.author?.channelId,
    node?.author?.endpoint?.payload?.browseId,
    node?.author?.endpoint?.payload?.browse_id,
    node?.short_byline_text?.runs?.[0]?.endpoint?.payload?.browseId,
    node?.long_byline_text?.runs?.[0]?.endpoint?.payload?.browseId,
    node?.byline_text?.runs?.[0]?.endpoint?.payload?.browseId,
    node?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.runs?.[0]?.endpoint?.payload?.browseId
  ];
  for(const value of candidates){
    const id=String(value||'').trim();
    if(/^UC[A-Za-z0-9_-]+$/.test(id))return id;
  }
  return '';
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

  const authorThumbs=node?.author?.thumbnails||node?.author?.thumbnail||[];
  const uploaderThumbnailUrl=Array.isArray(authorThumbs)
    ?(authorThumbs[0]?.url||'')
    :(authorThumbs?.url||'');

  const thumbInfo=thumbnailInfo(node,id);
  const endpointUrl=String(
    node?.endpoint?.metadata?.url||
    node?.navigation_endpoint?.metadata?.url||
    node?.command?.metadata?.url||
    ''
  );
  const isShort=
    node?.is_short===true||
    node?.isShort===true||
    /\/shorts\//i.test(endpointUrl)||
    (thumbInfo.aspectRatio>0&&thumbInfo.aspectRatio<.80&&duration>0&&duration<=240);

  return {
    videoId:id,
    url:'/watch?v='+id,
    title,
    uploader,
    channelId:videoChannelId(node),
    thumbnailUrl:thumbInfo.url,
    thumbnailWidth:thumbInfo.width,
    thumbnailHeight:thumbInfo.height,
    aspectRatio:isShort?9/16:thumbInfo.aspectRatio,
    isShort,
    uploaderThumbnailUrl,
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

function normalizeChannelNode(input){
  const node=unwrap(input);
  if(!node||typeof node!=='object')return null;

  const id=String(
    node.id||
    node.channel_id||
    node.channelId||
    node.author?.id||
    node.endpoint?.payload?.browseId||
    node.navigation_endpoint?.payload?.browseId||
    ''
  );
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;

  const name=text(
    node.author?.name||
    node.title||
    node.display_name||
    node.name||
    node.metadata?.title||
    ''
  ).trim();
  if(!name)return null;

  const thumbnails=
    node.author?.thumbnails||
    node.thumbnail||
    node.thumbnails||
    node.content_image?.image||
    [];
  const first=Array.isArray(thumbnails)?thumbnails[0]:null;

  return {
    id,
    name,
    thumbnailUrl:first?.url||'',
    subscribers:text(node.video_count||node.subscribers||node.subscriber_count||''),
    verified:!!node.author?.is_verified
  };
}

function normalizeChannels(rows,limit=24){
  const out=[];
  const seen=new Set();
  for(const raw of rows||[]){
    const row=normalizeChannelNode(raw);
    if(!row||seen.has(row.id))continue;
    seen.add(row.id);
    out.push(row);
    if(out.length>=limit)break;
  }
  return out;
}
function channelFromVideoNode(input){
  const node=unwrap(input);
  if(!node||typeof node!=='object')return null;

  const id=videoChannelId(node);
  if(!id)return null;

  const name=String(
    node?.author?.name||
    text(node?.short_byline_text)||
    text(node?.long_byline_text)||
    text(node?.byline_text)||
    ''
  ).trim();
  if(!name)return null;

  const thumbnails=
    node?.author?.thumbnails||
    node?.author?.thumbnail||
    [];
  const first=Array.isArray(thumbnails)?thumbnails[0]:null;

  return {
    id,
    name,
    thumbnailUrl:first?.url||'',
    subscribers:'',
    verified:!!node?.author?.is_verified
  };
}

function channelsFromVideoRows(rows,limit=24){
  const out=[];
  const seen=new Set();
  for(const raw of rows||[]){
    const row=channelFromVideoNode(raw);
    if(!row||seen.has(row.id))continue;
    seen.add(row.id);
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
    result?.videos||
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

function classifyEmbedPlayback(info){
  const play=info?.playability_status||{};
  const status=String(play?.status||'').trim().toUpperCase();
  const reasonParts=[
    text(play?.reason),
    text(play?.subreason),
    text(play?.messages),
    text(play?.error_screen?.reason),
    text(play?.error_screen?.subreason),
    text(info?.basic_info?.reason)
  ].map(value=>String(value||'').trim()).filter(Boolean);
  const reason=reasonParts.join(' · ');
  const reasonNorm=reason.toLowerCase();
  const basic=info?.basic_info||{};
  const embeddable=[
    play?.embeddable,
    play?.playableInEmbed,
    basic?.is_embeddable,
    basic?.isEmbeddable,
    basic?.playable_in_embed
  ].find(value=>typeof value==='boolean')??null;

  if(embeddable===false){
    return {playable:false,definitive:true,status:status||'UNPLAYABLE',reason:reason||'embed_disabled'};
  }

  if(
    /other\s+(?:web)?sites?|embedding|embed(?:ding)?\s+(?:has\s+been\s+)?disabled|playback\s+on\s+other|watch\s+(?:this\s+)?video\s+on\s+youtube|xem\s+trên\s+youtube/i.test(reason)
  ){
    return {playable:false,definitive:true,status:status||'UNPLAYABLE',reason};
  }

  if(
    /private\s+video|video\s+is\s+private|video\s+unavailable|not\s+available|has\s+been\s+removed|deleted\s+video|members?[- ]only|video\s+riêng\s+tư|video\s+không\s+khả\s+dụng|đã\s+bị\s+xóa|không\s+có\s+sẵn/i.test(reason)
  ){
    return {playable:false,definitive:true,status:status||'UNPLAYABLE',reason};
  }

  if(status==='OK'){
    return {playable:true,definitive:true,status,reason};
  }

  // Bot-verification failures are transport noise, not proof that the video
  // itself cannot be embedded. Keep the result visible and retry later.
  if(/bot|confirm\s+you(?:'re| are)\s+not/i.test(reasonNorm)){
    return {playable:null,definitive:false,status,reason};
  }

  if([
    'UNPLAYABLE',
    'ERROR',
    'AGE_CHECK_REQUIRED',
    'CONTENT_CHECK_REQUIRED',
    'LOGIN_REQUIRED',
    'LIVE_STREAM_OFFLINE'
  ].includes(status)){
    return {playable:false,definitive:true,status,reason};
  }

  return {playable:null,definitive:false,status,reason};
}

function rememberEmbedPlayback(id,result){
  id=String(id||'').trim();
  if(!VIDEO_ID_RE.test(id))return result;
  const ttl=result?.definitive?EMBED_PLAYBACK_TTL:EMBED_PLAYBACK_UNKNOWN_TTL;
  embedPlaybackCache.set(id,{at:Date.now(),ttl,result});
  return result;
}

function cachedEmbedPlayback(id){
  id=String(id||'').trim();
  const cached=embedPlaybackCache.get(id);
  if(!cached)return null;
  if(Date.now()-cached.at>cached.ttl){
    embedPlaybackCache.delete(id);
    return null;
  }
  return cached.result||null;
}

async function embedPlaybackStatus(id){
  id=String(id||'').trim();
  if(!VIDEO_ID_RE.test(id))return {playable:null,definitive:false,status:'INVALID_ID',reason:''};

  const cached=cachedEmbedPlayback(id);
  if(cached)return cached;

  const pending=embedPlaybackPending.get(id);
  if(pending)return pending;

  const task=(async()=>{
    const yt=await getYT();
    let last={playable:null,definitive:false,status:'',reason:''};

    // Ask the embedded client first because this matches the real 1988 player.
    // Fall back to WEB only when the embedded answer is inconclusive.
    for(const client of ['WEB_EMBEDDED','WEB']){
      try{
        const info=await yt.getBasicInfo(id,{client});
        const result=classifyEmbedPlayback(info);
        last={...result,client};

        if(result.playable===false)return rememberEmbedPlayback(id,last);
        if(result.playable===true)return rememberEmbedPlayback(id,last);
      }catch(error){
        last={
          playable:null,
          definitive:false,
          status:'PROBE_ERROR',
          reason:String(error?.message||error||''),
          client
        };
      }
    }

    return rememberEmbedPlayback(id,last);
  })().finally(()=>embedPlaybackPending.delete(id));

  embedPlaybackPending.set(id,task);
  return task;
}

function markEmbedUnplayable(id,reason='iframe_embed_error'){
  return rememberEmbedPlayback(String(id||'').trim(),{
    playable:false,
    definitive:true,
    status:'UNPLAYABLE',
    reason:String(reason||'iframe_embed_error'),
    client:'iframe'
  });
}

function obviousUnavailableRow(row={}){
  const title=text(row?.title||row?._displayTitle||'').trim();
  return /^(?:\[?private video\]?|\[?deleted video\]?|video unavailable|video riêng tư|video không khả dụng|video đã bị xóa)$/i.test(title);
}

async function filterEmbeddableRows(rows=[],options={}){
  const list=(Array.isArray(rows)?rows:[]).filter(row=>row&&!obviousUnavailableRow(row));
  if(!list.length)return [];

  const concurrency=Math.max(1,Math.min(10,Number(options?.concurrency)||6));
  const output=new Array(list.length);
  let cursor=0;

  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=list.length)return;
      const row=list[index];
      const id=String(
        row?.videoId||
        row?.id||
        row?.video_id||
        row?.content_id||
        ''
      ).trim();

      if(!VIDEO_ID_RE.test(id)){
        continue;
      }

      try{
        const status=await embedPlaybackStatus(id);
        // Unknown stays visible; only a definitive "cannot play here" is removed.
        if(status?.playable!==false)output[index]=row;
      }catch{
        output[index]=row;
      }
    }
  };

  await Promise.all(Array.from({length:Math.min(concurrency,list.length)},worker));
  return output.filter(Boolean);
}

async function search(query,filters={}){
  const yt=await getYT();
  const result=await yt.search(String(query||'').trim(),{type:'video',...filters});
  return pageRows(result,36);
}

async function searchChannels(query){
  const q=String(query||'').trim();
  if(!q)return [];
  const yt=await getYT();

  const [channelResult,videoResult]=await Promise.all([
    yt.search(q,{type:'channel'}).catch(()=>null),
    yt.search(q,{type:'video'}).catch(()=>null)
  ]);

  const channelRows=
    channelResult?.results||
    channelResult?.contents?.contents||
    channelResult?.contents||
    [];
  const videoRows=
    videoResult?.results||
    videoResult?.contents?.contents||
    videoResult?.contents||
    [];

  const direct=normalizeChannels(channelRows,24);
  const fromVideos=channelsFromVideoRows(videoRows,24);
  const out=[];
  const seen=new Set();

  for(const row of [...direct,...fromVideos]){
    if(!row||seen.has(row.id))continue;
    seen.add(row.id);
    out.push(row);
    if(out.length>=24)break;
  }
  return out;
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

async function channelVideosPage(key,channelId,reset=false){
  const channel=String(channelId||'').trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(channel))throw new Error('invalid_channel');

  const id='channel:'+String(key||channel);
  const yt=await getYT();
  let result=null;

  if(!reset&&discoveryPages.has(id)){
    result=await nextPage(discoveryPages.get(id));
    if(!result)return [];
  }else{
    const page=await yt.getChannel(channel);
    result=await page.getVideos();
  }

  discoveryPages.set(id,result);
  return pageRows(result,36);
}

async function channelMeta(channelId){
  const channel=String(channelId||'').trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(channel))throw new Error('invalid_channel');

  const yt=await getYT();
  const page=await yt.getChannel(channel);
  const header=page?.header||{};
  const metadata=page?.metadata||{};

  const firstThumb=(rows)=>{
    const list=Array.isArray(rows)?rows:[];
    return list[0]?.url||'';
  };

  const strings=[];
  const seen=new Set();
  const walk=(value,depth=0)=>{
    if(value===undefined||value===null||depth>4||strings.length>100)return;
    if(typeof value==='string'){
      const v=value.trim();
      if(v)strings.push(v);
      return;
    }
    if(typeof value==='number'||typeof value==='boolean')return;
    const direct=text(value).trim();
    if(direct&&direct!=='[object Object]')strings.push(direct);
    if(typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    if(Array.isArray(value)){
      for(const item of value)walk(item,depth+1);
      return;
    }
    for(const [key,item] of Object.entries(value)){
      if(/endpoint|command|actions|memo|page|contents/i.test(key))continue;
      try{walk(item,depth+1)}catch{}
    }
  };
  walk(header);

  const subscriberText=
    text(header?.subscribers)||
    text(header?.metadata).match(/[^·\n]*(?:người đăng ký|subscribers?)[^·\n]*/i)?.[0]?.trim()||
    strings.find(value=>/(?:người đăng ký|subscribers?)/i.test(value))||
    '';

  const avatar=
    firstThumb(metadata?.avatar)||
    firstThumb(header?.author?.thumbnails)||
    firstThumb(header?.box_art)||
    firstThumb(header?.banner)||
    '';

  const name=
    text(metadata?.title)||
    text(header?.author?.name)||
    text(header?.title)||
    text(header?.page_title)||
    '';

  const verified=
    !!header?.author?.is_verified||
    Array.isArray(header?.badges)&&header.badges.some(badge=>/verified/i.test(text(badge?.label||badge?.tooltip||badge)));

  return {
    id:channel,
    name:name.trim(),
    thumbnailUrl:avatar,
    subscribers:subscriberText,
    verified
  };
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

function disclosureStorageRead(id){
  try{
    const saved=JSON.parse(localStorage.getItem(AI_DISCLOSURE_STORAGE_PREFIX+id)||'null');
    if(!saved||Date.now()-Number(saved.at||0)>AI_DISCLOSURE_TTL)return null;
    return {
      checked:!!saved.checked,
      madeWithAi:!!saved.madeWithAi,
      text:String(saved.text||'').slice(0,1200),
      at:Number(saved.at)||Date.now()
    };
  }catch{
    return null;
  }
}

function disclosureStorageWrite(id,result){
  try{
    localStorage.setItem(AI_DISCLOSURE_STORAGE_PREFIX+id,JSON.stringify({
      at:Date.now(),
      checked:!!result?.checked,
      madeWithAi:!!result?.madeWithAi,
      text:String(result?.text||'').slice(0,1200)
    }));
  }catch{}
}

function disclosureText(node){
  return [
    text(node?.section_title),
    text(node?.body_header),
    text(node?.body_text),
    text(node?.attribution_text)
  ].map(value=>String(value||'').trim()).filter(Boolean).join(' · ');
}

function isMadeWithAiDisclosure(raw=''){
  const plain=String(raw||'').toLowerCase();
  const norm=plain
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d');

  const signals=[
    'made with ai',
    'created with ai',
    'generated with ai',
    'ai-generated',
    'ai generated',
    'created or edited with ai',
    'altered or synthetic content',
    'altered content',
    'synthetic content',
    'duoc tao bang ai',
    'tao bang ai',
    'do ai tao',
    'tao boi ai',
    'tri tue nhan tao',
    'duoc tao hoac chinh sua bang ai',
    'noi dung bi chinh sua hoac tong hop',
    'noi dung tong hop'
  ];

  return signals.some(signal=>norm.includes(signal));
}

function howThisWasMadeNodes(result){
  const out=[];
  try{
    const memo=result?.page?.[1]?.contents_memo;
    const direct=memo?.getType?.(YTNodes.HowThisWasMadeSectionView)||[];
    for(const node of Array.from(direct||[]))out.push(node);
  }catch{}

  if(out.length)return out;

  try{
    const panels=Array.from(result?.page?.[1]?.engagement_panels||[]);
    for(const panel of panels){
      const content=panel?.content;
      const items=Array.from(content?.items||content?.contents||[]);
      for(const node of items){
        const type=node?.type||node?.constructor?.type||node?.constructor?.name||'';
        let isTarget=type==='HowThisWasMadeSectionView';
        try{
          if(!isTarget&&node?.is&&YTNodes.HowThisWasMadeSectionView){
            isTarget=!!node.is(YTNodes.HowThisWasMadeSectionView);
          }
        }catch{}
        if(isTarget)out.push(node);
      }
    }
  }catch{}

  return out;
}

async function aiDisclosure(id){
  id=String(id||'').trim();
  if(!VIDEO_ID_RE.test(id))throw new Error('invalid_video');

  const memory=aiDisclosureMemory.get(id);
  if(memory&&Date.now()-Number(memory.at||0)<AI_DISCLOSURE_TTL)return memory;

  const stored=disclosureStorageRead(id);
  if(stored){
    aiDisclosureMemory.set(id,stored);
    return stored;
  }

  const yt=await getYT();
  try{
    const result=await yt.getInfo(id,{client:'WEB'});
    const nodes=howThisWasMadeNodes(result);
    const textValue=nodes.map(disclosureText).filter(Boolean).join(' · ');
    const out={
      checked:true,
      madeWithAi:isMadeWithAiDisclosure(textValue),
      text:textValue,
      at:Date.now()
    };
    aiDisclosureMemory.set(id,out);
    disclosureStorageWrite(id,out);
    return out;
  }catch(error){
    const out={
      checked:false,
      madeWithAi:false,
      text:'',
      at:Date.now()
    };
    aiDisclosureMemory.set(id,out);
    return out;
  }
}

function validDimensions(width,height,source=""){
  width=Number(width)||0;
  height=Number(height)||0;
  if(width<=0||height<=0)return null;
  const ratio=width/height;
  if(!Number.isFinite(ratio)||ratio<.25||ratio>4)return null;
  return {width,height,aspectRatio:ratio,source};
}

function pickVideoDimensions(candidates=[]){
  const rows=(Array.isArray(candidates)?candidates:[])
    .filter(row=>row&&row.width>0&&row.height>0);

  if(!rows.length)return {width:0,height:0,aspectRatio:0,source:""};

  // Storyboard shape comes from actual video frames. If available, use it
  // before generic embed/player dimensions.
  const storyboard=rows
    .filter(row=>String(row.source||"")==="storyboard")
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(storyboard)return storyboard;

  const portrait=rows
    .filter(row=>row.aspectRatio<.80)
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(portrait)return portrait;

  const square=rows
    .filter(row=>row.aspectRatio>=.80&&row.aspectRatio<=1.20)
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(square)return square;

  return rows.sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
}

function videoDimensionsFromInfo(result={}){
  const candidates=[];

  // YouTube storyboards use the native frame shape and are a better aspect
  // signal than the generic 16:9 embed/player box.
  const storyboardBoards=Array.isArray(result?.storyboards?.boards)
    ?result.storyboards.boards
    :[];
  for(const board of storyboardBoards){
    const candidate=validDimensions(
      board?.thumbnail_width,
      board?.thumbnail_height,
      "storyboard"
    );
    if(candidate)candidates.push(candidate);
  }

  const formats=[
    ...(Array.isArray(result?.streaming_data?.formats)?result.streaming_data.formats:[]),
    ...(Array.isArray(result?.streaming_data?.adaptive_formats)?result.streaming_data.adaptive_formats:[]),
    ...(Array.isArray(result?.streaming_data?.adaptiveFormats)?result.streaming_data.adaptiveFormats:[])
  ];

  for(const row of formats){
    const candidate=validDimensions(row?.width,row?.height,"stream");
    if(candidate)candidates.push(candidate);
  }

  // YouTube.js exposes embed dimensions through basic_info in some clients.
  // These are fallback hints only; a portrait stream candidate above wins.
  const basic=result?.basic_info||{};
  const embeds=[
    basic?.embed,
    result?.embed,
    result?.microformat,
    result?.microformat?.embed,
    result?.player_microformat,
    result?.player_microformat?.embed
  ];
  for(const embed of embeds){
    const candidate=validDimensions(embed?.width,embed?.height,"embed");
    if(candidate)candidates.push(candidate);
  }

  const direct=[
    validDimensions(basic?.width,basic?.height,"basic"),
    validDimensions(result?.width,result?.height,"direct")
  ].filter(Boolean);
  candidates.push(...direct);

  const isShort=
    basic?.is_short===true||
    basic?.isShort===true||
    result?.is_short===true||
    result?.isShort===true;

  let best=pickVideoDimensions(candidates);
  if(isShort&&best.width>0&&best.aspectRatio>=.80){
    const height=Math.max(best.height,best.width);
    best={
      width:Math.round(height*9/16),
      height,
      aspectRatio:9/16,
      source:"short"
    };
  }

  return best;
}

const videoAspectCache=new Map();
const videoAspectPending=new Map();

async function videoAspect(id){
  id=String(id||'').trim();
  if(!VIDEO_ID_RE.test(id))return {width:0,height:0,aspectRatio:0};

  const cached=videoAspectCache.get(id);
  if(cached&&Date.now()-cached.at<6*60*60*1000)return cached.value;
  if(videoAspectPending.has(id))return videoAspectPending.get(id);

  const task=(async()=>{
    const yt=await getYT();
    const candidates=[];

    // getInfo includes parsed storyboard metadata. This is usually the fastest
    // reliable orientation signal for long-form portrait uploads.
    try{
      const full=await yt.getInfo(id,{client:"WEB"});
      const storyboardDimensions=videoDimensionsFromInfo({
        storyboards:full?.storyboards,
        basic_info:full?.basic_info
      });
      if(storyboardDimensions.width>0&&storyboardDimensions.height>0){
        candidates.push(storyboardDimensions);
        if(storyboardDimensions.source==="storyboard"){
          const value={
            width:storyboardDimensions.width,
            height:storyboardDimensions.height,
            aspectRatio:storyboardDimensions.aspectRatio,
            source:"storyboard"
          };
          videoAspectCache.set(id,{at:Date.now(),value});
          return value;
        }
      }
    }catch{}

    // Probe more than one client. Some clients expose only generic 16:9
    // metadata while another exposes the actual portrait stream dimensions.
    const clients=["IOS","WEB","ANDROID","MWEB"];

    for(const client of clients){
      try{
        const basic=await yt.getBasicInfo(id,{client});
        const dimensions=videoDimensionsFromInfo(basic);
        if(dimensions.width>0&&dimensions.height>0){
          candidates.push({...dimensions,source:"basic:"+client});
          // If we already found a real portrait shape, use it immediately.
          if(dimensions.aspectRatio<.80){
            const value={
              width:dimensions.width,
              height:dimensions.height,
              aspectRatio:dimensions.aspectRatio,
              source:String(dimensions.source||"")
            };
            videoAspectCache.set(id,{at:Date.now(),value});
            return value;
          }
        }
      }catch{}
    }

    // getStreamingData runs the player's actual format chooser. It is slower
    // than getBasicInfo, so use it only when BasicInfo did not reveal portrait.
    for(const client of ["IOS","WEB"]){
      try{
        const format=await yt.getStreamingData(id,{
          type:"video",
          quality:"best",
          format:"any",
          client
        });
        const dimensions=validDimensions(format?.width,format?.height,"format:"+client);
        if(dimensions){
          candidates.push(dimensions);
          if(dimensions.aspectRatio<.80){
            const value={
              width:dimensions.width,
              height:dimensions.height,
              aspectRatio:dimensions.aspectRatio,
              source:String(dimensions.source||"")
            };
            videoAspectCache.set(id,{at:Date.now(),value});
            return value;
          }
        }
      }catch{}
    }

    // Shorts endpoint is another useful orientation signal. It is safe to
    // ignore failures because normal /watch videos may not support it.
    if(typeof yt.getShortsVideoInfo==="function"){
      try{
        const shorts=await yt.getShortsVideoInfo(id,"WEB");
        const dimensions=videoDimensionsFromInfo(shorts);
        if(dimensions.width>0&&dimensions.height>0){
          candidates.push({...dimensions,source:"shorts"});
        }
      }catch{}
    }

    const best=pickVideoDimensions(candidates);
    const value={
      width:Number(best?.width)||0,
      height:Number(best?.height)||0,
      aspectRatio:Number(best?.aspectRatio)||0,
      source:String(best?.source||"")
    };
    if(value.width>0&&value.height>0){
      videoAspectCache.set(id,{at:Date.now(),value});
    }
    return value;
  })().finally(()=>videoAspectPending.delete(id));

  videoAspectPending.set(id,task);
  return task;
}

async function info(id){
  if(!VIDEO_ID_RE.test(String(id||'')))throw new Error('invalid_video');
  const yt=await getYT();
  const result=await yt.getInfo(id,{client:'WEB'});
  const basic=result?.basic_info||{};
  const thumbnails=Array.isArray(basic.thumbnail)?basic.thumbnail:[];
  const related=normalizeRows(result?.watch_next_feed||[],24);
  const playlistRaw=result?.playlist||null;
  const playlistItems=normalizeRows(playlistRaw?.contents||[],100);
  const playlist=playlistRaw&&playlistItems.length?{
    id:String(playlistRaw.id||''),
    title:String(playlistRaw.title||''),
    currentIndex:Number.isFinite(Number(playlistRaw.current_index))?Number(playlistRaw.current_index):0,
    isInfinite:playlistRaw.is_infinite===true,
    items:playlistItems
  }:null;
  let dimensions=videoDimensionsFromInfo(result);
  if(!dimensions.width||!dimensions.height){
    dimensions=await videoAspect(id);
  }

  return {
    meta:{
      videoId:id,
      title:String(basic.title||''),
      uploader:String(basic.author||basic.channel?.name||''),
      channelId:String(basic.channel?.id||basic.channel_id||''),
      description:String(basic.short_description||basic.description||''),
      views:Number(basic.view_count)||0,
      duration:Number(basic.duration)||0,
      thumbnailUrl:thumbnails[0]?.url||('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'),
      uploadDate:String(basic.upload_date||basic.publish_date||''),
      videoWidth:Number(dimensions.width)||0,
      videoHeight:Number(dimensions.height)||0,
      aspectRatio:Number(dimensions.aspectRatio)||0,
      aspectSource:String(dimensions.source||"")
    },
    related,
    playlist
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
        width:Number(format.width)||0,
        height:Number(format.height)||0,
        aspectRatio:(Number(format.width)>0&&Number(format.height)>0)?Number(format.width)/Number(format.height):0,
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
        width:Number(format.width)||0,
        height:Number(format.height)||0,
        aspectRatio:(Number(format.width)>0&&Number(format.height)>0)?Number(format.width)/Number(format.height):0,
        client:'WEB',
        poTokenBound:!!freshToken
      };
    }
  }catch(error){
    lastError=error;
  }

  throw lastError||new Error('no_media_stream');
}


const visualAspectCache=new Map();
const visualAspectPending=new Map();

function waitMediaEvent(target,event,timeout=5000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(ok,value)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      target.removeEventListener(event,onEvent);
      target.removeEventListener("error",onError);
      ok?resolve(value):reject(value);
    };
    const onEvent=()=>finish(true,true);
    const onError=()=>finish(false,new Error("media_"+event+"_error"));
    const timer=setTimeout(()=>finish(false,new Error("media_"+event+"_timeout")),timeout);
    target.addEventListener(event,onEvent,{once:true});
    target.addEventListener("error",onError,{once:true});
  });
}

function detectPillarboxAspect(video){
  const vw=Number(video?.videoWidth)||0;
  const vh=Number(video?.videoHeight)||0;
  if(vw<=0||vh<=0)return 0;

  const sourceAspect=vw/vh;
  if(sourceAspect<.80)return sourceAspect;
  if(sourceAspect<1.20)return sourceAspect;

  const width=192;
  const height=Math.max(72,Math.min(128,Math.round(width/sourceAspect)));
  const canvas=document.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return 0;

  try{
    ctx.drawImage(video,0,0,width,height);
  }catch{
    return 0;
  }

  let data;
  try{
    data=ctx.getImageData(0,0,width,height).data;
  }catch{
    return 0;
  }

  const means=new Array(width).fill(0);
  const active=new Array(width).fill(0);

  for(let x=0;x<width;x++){
    let sum=0;
    let bright=0;
    for(let y=0;y<height;y++){
      const i=(y*width+x)*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      const l=.2126*r+.7152*g+.0722*b;
      sum+=l;
      if(l>28)bright++;
    }
    means[x]=sum/height;
    active[x]=bright/height;
  }

  const centerStart=Math.floor(width*.40);
  const centerEnd=Math.ceil(width*.60);
  let centerMean=0;
  for(let x=centerStart;x<centerEnd;x++)centerMean+=means[x];
  centerMean/=Math.max(1,centerEnd-centerStart);
  if(centerMean<18)return 0;

  const darkThreshold=Math.max(10,Math.min(30,centerMean*.26));
  const isBar=x=>means[x]<darkThreshold&&active[x]<.13;

  let left=0;
  while(left<width*.45&&isBar(left))left++;

  let right=width-1;
  while(right>width*.55&&isBar(right))right--;

  const leftCut=left/width;
  const rightCut=(width-1-right)/width;
  if(leftCut<.16||rightCut<.16)return 0;

  const contentFraction=(right-left+1)/width;
  const contentAspect=sourceAspect*contentFraction;

  // Only act when the actual bright/content region is clearly portrait.
  if(contentAspect>=.84||contentAspect<.34)return 0;
  return contentAspect;
}

async function visualContentAspect(id){
  id=String(id||"").trim();
  if(!VIDEO_ID_RE.test(id))return {aspectRatio:0,source:""};

  const cached=visualAspectCache.get(id);
  if(cached&&Date.now()-cached.at<6*60*60*1000)return cached.value;
  if(visualAspectPending.has(id))return visualAspectPending.get(id);

  const task=(async()=>{
    let resolved;
    try{
      resolved=await media(id,"video");
    }catch{
      return {aspectRatio:0,source:""};
    }

    const directW=Number(resolved?.width)||0;
    const directH=Number(resolved?.height)||0;
    if(directW>0&&directH>0&&directW/directH<.80){
      const value={
        width:directW,
        height:directH,
        aspectRatio:directW/directH,
        source:"resolved-stream"
      };
      visualAspectCache.set(id,{at:Date.now(),value});
      return value;
    }

    const video=document.createElement("video");
    video.muted=true;
    video.playsInline=true;
    video.preload="auto";
    video.setAttribute("playsinline","");
    video.style.cssText="position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(video);

    try{
      video.src=String(resolved?.url||"");
      video.load();

      if(video.readyState<1)await waitMediaEvent(video,"loadedmetadata",6000);

      const vw=Number(video.videoWidth)||0;
      const vh=Number(video.videoHeight)||0;
      if(vw>0&&vh>0&&vw/vh<.80){
        const value={width:vw,height:vh,aspectRatio:vw/vh,source:"video-metadata"};
        visualAspectCache.set(id,{at:Date.now(),value});
        return value;
      }

      // Decode a real frame. Muted autoplay is allowed and avoids depending
      // on user interaction for this hidden probe.
      try{
        const play=video.play();
        if(play&&typeof play.then==="function")await Promise.race([
          play.catch(()=>{}),
          new Promise(resolve=>setTimeout(resolve,1200))
        ]);
      }catch{}

      if(video.readyState<2){
        try{await waitMediaEvent(video,"loadeddata",4500);}catch{}
      }

      const duration=Number(video.duration)||0;
      const samples=[];
      if(duration>4)samples.push(Math.min(2.2,duration*.08));
      samples.push(0);

      let detected=0;
      for(const time of samples){
        if(time>0&&Number.isFinite(duration)&&duration>time+.2){
          try{
            video.currentTime=time;
            await waitMediaEvent(video,"seeked",3500);
          }catch{}
        }

        detected=detectPillarboxAspect(video);
        if(detected>0)break;
      }

      try{video.pause()}catch{}

      const value=detected>0
        ?{
            width:Math.max(1,Math.round((Number(video.videoHeight)||720)*detected)),
            height:Number(video.videoHeight)||720,
            aspectRatio:detected,
            source:"frame-pillarbox"
          }
        :{aspectRatio:0,source:""};

      if(value.aspectRatio>0)visualAspectCache.set(id,{at:Date.now(),value});
      return value;
    }finally{
      try{
        video.pause();
        video.removeAttribute("src");
        video.load();
      }catch{}
      video.remove();
    }
  })().finally(()=>visualAspectPending.delete(id));

  visualAspectPending.set(id,task);
  return task;
}

const api={getYT,search,searchChannels,searchPage,channelVideosPage,channelMeta,home,homePage,hypeFeed,resetDiscovery,suggestions,info,videoAspect,aiDisclosure,media,visualContentAspect,embedPlaybackStatus,filterEmbeddableRows,markEmbedUnplayable,normalizeRows,normalizeChannels};
window.YTLocal=api;
window.dispatchEvent(new CustomEvent('ytlocalready'));

export default api;
