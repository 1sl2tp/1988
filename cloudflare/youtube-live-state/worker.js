const STATE_URL="https://mstltsunsawqomzniqok.supabase.co/functions/v1/yt1988-state";
const PACKAGE_REFRESH_URL="https://mstltsunsawqomzniqok.supabase.co/functions/v1/yt1988-refresh";
const SNAPSHOT_KEY="youtube:live:snapshot:v1";
const CYCLE_KEY="youtube:live:cycle:v1";
const BATCH_SIZE=32;
const YT_PLAYER_KEYS=[
  "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8"
];
const YT_PLAYER_CLIENTS=[
  {
    clientName:"WEB",
    clientNumericName:"1",
    clientVersion:"2.20260925.01.00",
    userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
  },
  {
    clientName:"ANDROID",
    clientNumericName:"3",
    clientVersion:"20.10.38",
    androidSdkVersion:35,
    userAgent:"com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
  }
];
const SEARCH_QUERIES=[
  "trực tiếp ca nhạc",
  "trực tiếp bolero",
  "trực tiếp radio",
  "trực tiếp thể thao",
  "trực tiếp bóng đá",
  "trực tiếp thời sự",
  "trực tiếp tin tức",
  "trực tiếp game",
  "trực tiếp sự kiện",
  "trực tiếp 24/7"
];

function cors(){
  return {
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,OPTIONS",
    "access-control-allow-headers":"content-type",
    "cache-control":"no-store"
  };
}
function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors(),"content-type":"application/json; charset=utf-8"}
  });
}
function clean(value,max=1000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function normalizeText(value=""){
  return String(value??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/đ/g,"d")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function humanCount(value=""){
  const raw=clean(value,120);
  if(!raw)return 0;
  const norm=normalizeText(raw);
  const match=norm.match(/(\d+(?:[.,]\d+)?)\s*(k|n|nghin|m|tr|trieu|b|ty)?\b/);
  if(!match)return 0;

  let numeric=String(match[1]||"");
  const suffix=String(match[2]||"");
  let n=0;
  if(suffix){
    n=Number(numeric.replace(",","."));
  }else{
    const sep=numeric.match(/[.,]/)?.[0]||"";
    if(sep){
      const parts=numeric.split(/[.,]/);
      numeric=parts.length===2&&parts[1].length===3
        ?parts.join("")
        :numeric.replace(",",".");
    }
    n=Number(numeric);
  }
  if(!Number.isFinite(n)||n<=0)return 0;
  const factor=
    /^(k|n|nghin)$/.test(suffix)?1e3:
    /^(m|tr|trieu)$/.test(suffix)?1e6:
    /^(b|ty)$/.test(suffix)?1e9:
    1;
  return Math.max(0,Math.round(n*factor));
}
function liveViewerCountFromHtml(html=""){
  const text=String(html||"");
  const patterns=[
    /"viewCountText":\{"simpleText":"((?:\\.|[^"])*)"/g,
    /"viewCountText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/g,
    /"shortViewCount":\{"simpleText":"((?:\\.|[^"])*)"/g,
    /"shortViewCount":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/g
  ];
  let fallback=0;
  for(const pattern of patterns){
    for(const match of text.matchAll(pattern)){
      const label=decodeJsonString(match[1]||"");
      const norm=normalizeText(label);
      const count=humanCount(label);
      if(!count)continue;
      if(/dang xem|watching now|watching/.test(norm))return count;
      if(!fallback)fallback=count;
    }
  }
  return fallback;
}
function liveKeywordList(state={}){
  const labels=
    state?.sourceLabels&&typeof state.sourceLabels==="object"&&!Array.isArray(state.sourceLabels)
      ?state.sourceLabels:{};
  return String(labels?.__live_keywords||"")
    .split(/[\r\n,;|]+/u)
    .map(value=>clean(value,120))
    .filter(Boolean);
}
function liveKeywordBlocked(row={},keywords=[]){
  if(!Array.isArray(keywords)||!keywords.length)return false;
  const haystack=normalizeText([
    row?.title||"",
    row?.sourceName||"",
    row?.channelName||""
  ].join(" "));
  return keywords.some(keyword=>{
    const needle=normalizeText(keyword);
    return !!needle&&haystack.includes(needle);
  });
}
function genericLiveSegment(value=""){
  const n=normalizeText(value);
  return /^(?:live|live stream|livestream|truc tiep|dang truc tiep|item|video)$/.test(n);
}
function sourceSegmentMatches(value="",sourceName=""){
  const a=normalizeText(value);
  let b=normalizeText(sourceName);
  if(!a||!b)return false;
  if(a===b)return true;
  b=b.replace(/\b(?:official|official channel|channel|news|television|media)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
  return !!b&&a===b;
}
function cleanLiveDisplayTitle(value="",sourceName=""){
  // LIVE title is source data. Do not remove LIVE/TRỰC TIẾP markers,
  // channel names, separators, emoji or any other content.
  return clean(value,300);
}

function validChannelId(value){
  const id=clean(value,180);
  return /^UC[A-Za-z0-9_-]+$/.test(id)?id:"";
}
function validVideoId(value){
  const id=clean(value,64);
  return /^[A-Za-z0-9_-]{11}$/.test(id)?id:"";
}
function hash(value){
  let h=2166136261;
  for(const ch of String(value??"")){
    h^=ch.charCodeAt(0);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(36);
}
function decodeJsonString(value=""){
  try{return JSON.parse('"'+String(value).replace(/"/g,'\\\"')+'"')}catch{}
  return String(value)
    .replace(/\\u0026/g,"&")
    .replace(/\\u003d/g,"=")
    .replace(/\\u002F/g,"/")
    .replace(/\\\//g,"/");
}
async function fetchJson(url,timeout=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{
      cache:"no-store",
      signal:controller.signal,
      headers:{
        accept:"application/json,text/plain,*/*",
        "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
        "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
      }
    });
    if(!r.ok)throw new Error("http_"+r.status);
    return await r.json();
  }finally{clearTimeout(timer)}
}
async function fetchText(url,timeout=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{
      cache:"no-store",
      redirect:"follow",
      signal:controller.signal,
      headers:{
        accept:"text/html,application/xhtml+xml",
        "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
        "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
      }
    });
    return {ok:r.ok,status:r.status,url:r.url,text:r.ok?await r.text():""};
  }catch(error){
    return {ok:false,status:0,url:"",text:"",error:String(error?.message||error)};
  }finally{clearTimeout(timer)}
}
function stateTargets(payload){
  const state=payload?.state&&typeof payload.state==="object"?payload.state:{};
  const selected=new Set();
  const blocked=new Set();

  for(const id of Array.isArray(state?.selected)?state.selected:[]){
    const sid=validChannelId(id); if(sid)selected.add(sid);
  }
  const scopedSelected=state?.scopedSelected&&typeof state.scopedSelected==="object"
    ?state.scopedSelected:{};
  for(const ids of Object.values(scopedSelected)){
    for(const id of Array.isArray(ids)?ids:[]){
      const sid=validChannelId(id); if(sid)selected.add(sid);
    }
  }
  for(const id of Array.isArray(state?.blocked)?state.blocked:[]){
    const sid=validChannelId(id); if(sid)blocked.add(sid);
  }
  const scopedBlocked=
    state?.scopedBlocked&&typeof state.scopedBlocked==="object"
      ?state.scopedBlocked:{};
  for(const ids of Object.values(scopedBlocked)){
    for(const id of Array.isArray(ids)?ids:[]){
      const sid=validChannelId(id); if(sid)blocked.add(sid);
    }
  }

  const meta=new Map();
  for(const row of Array.isArray(state?.customSources)?state.customSources:[]){
    const id=validChannelId(row?.id); if(!id)continue;
    meta.set(id,{
      channelId:id,
      sourceName:clean(row?.name,180),
      sourceAvatar:clean(row?.thumbnailUrl,1000),
      origin:"selected"
    });
  }

  return {
    selected:[...selected].filter(id=>!blocked.has(id)),
    blocked,
    meta,
    liveKeywords:liveKeywordList(state)
  };
}
function parseSearchLiveCandidates(html,origin){
  const rows=[];
  const parts=String(html||"").split('"videoRenderer":').slice(1);
  for(const part of parts){
    const chunk=part.slice(0,14000);
    if(!/BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW|\bLIVE\b/.test(chunk))continue;
    const videoId=validVideoId(chunk.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1]||"");
    const channelId=validChannelId(
      chunk.match(/"browseId":"(UC[A-Za-z0-9_-]+)"/)?.[1]||""
    );
    if(!videoId||!channelId)continue;
    const titleRaw=chunk.match(/"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/)?.[1]||"";
    const sourceRaw=chunk.match(/"ownerText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/)?.[1]||
      chunk.match(/"shortBylineText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"/)?.[1]||"";
    const thumb=chunk.match(/"thumbnail":\{"thumbnails":\[\{"url":"((?:\\.|[^"])*)"/)?.[1]||"";
    const sourceName=decodeJsonString(sourceRaw);
    rows.push({
      channelId,
      videoId,
      title:clean(decodeJsonString(titleRaw),300),
      sourceName,
      thumbnail:decodeJsonString(thumb),
      viewerCount:liveViewerCountFromHtml(chunk),
      origin
    });
  }
  return rows;
}
async function discoverSearchCandidates(blocked,keywords=[]){
  const results=await Promise.all(SEARCH_QUERIES.map(async query=>{
    const url="https://www.youtube.com/results?hl=vi&gl=VN&search_query="+encodeURIComponent(query);
    const page=await fetchText(url,6500);
    return page.ok?parseSearchLiveCandidates(page.text,"search:"+query):[];
  }));
  const byChannel=new Map();
  for(const row of results.flat()){
    if(
      blocked.has(row.channelId)||
      liveKeywordBlocked(row,keywords)||
      byChannel.has(row.channelId)
    )continue;
    byChannel.set(row.channelId,row);
  }
  return [...byChannel.values()];
}
function liveCandidateIdsFromChannelHtml(html,targetVideoId=""){
  const text=String(html||"");
  const ids=[];
  const push=id=>{
    id=validVideoId(id);
    if(id&&!ids.includes(id))ids.push(id);
  };

  const target=validVideoId(targetVideoId);
  if(target&&text.includes('"videoId":"'+target+'"'))push(target);

  for(const marker of text.matchAll(/"isLive":true/g)){
    const pos=marker.index||0;
    const start=Math.max(0,pos-5000);
    const end=Math.min(text.length,pos+5000);
    const segment=text.slice(start,end);
    const found=[];
    for(const match of segment.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)){
      const absolute=start+(match.index||0);
      found.push({id:match[1],distance:Math.abs(absolute-pos)});
    }
    found.sort((a,b)=>a.distance-b.distance);
    for(const row of found.slice(0,6))push(row.id);
  }
  return ids.slice(0,8);
}

function playerMetaFromResponse(data={}){
  const details=data?.videoDetails||{};
  const liveDetails=data?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails||{};
  const ended=Boolean(liveDetails?.endTimestamp)&&liveDetails?.isLiveNow!==true;
  let live=details?.isLive===true||liveDetails?.isLiveNow===true;

  // Some current-live responses omit isLive/isLiveNow but expose this tracking
  // signal. Never use it after YouTube has emitted an endTimestamp.
  if(!live&&!ended){
    const tracking=Array.isArray(data?.responseContext?.serviceTrackingParams)
      ?data.responseContext.serviceTrackingParams
      :[];
    for(const service of tracking){
      for(const param of Array.isArray(service?.params)?service.params:[]){
        if(param?.key==="is_viewed_live"&&String(param?.value||"").toLowerCase()==="true"){
          live=true;
          break;
        }
      }
      if(live)break;
    }
  }

  const thumbs=Array.isArray(details?.thumbnail?.thumbnails)
    ?details.thumbnail.thumbnails.slice()
    :[];
  thumbs.sort((a,b)=>(Number(b?.width)||0)-(Number(a?.width)||0));

  return {
    known:true,
    live,
    ended,
    channelId:validChannelId(details?.channelId),
    sourceName:clean(details?.author,180),
    title:clean(details?.title,300),
    thumbnail:clean(thumbs[0]?.url,1000),
    totalViews:Math.max(0,Number(details?.viewCount)||0)
  };
}
async function inspectPlayerLive(videoId){
  const id=validVideoId(videoId);
  if(!id)return {known:false,live:false,ended:false,channelId:"",sourceName:"",title:"",thumbnail:"",totalViews:0};

  let fallback={known:false,live:false,ended:false,channelId:"",sourceName:"",title:"",thumbnail:"",totalViews:0};
  for(const profile of YT_PLAYER_CLIENTS){
    for(const apiKey of YT_PLAYER_KEYS){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),4200);
      try{
        const client={
          clientName:profile.clientName,
          clientVersion:profile.clientVersion,
          hl:"vi",
          gl:"VN"
        };
        if(profile.androidSdkVersion)client.androidSdkVersion=profile.androidSdkVersion;

        const response=await fetch(
          "https://youtubei.googleapis.com/youtubei/v1/player?key="+
            encodeURIComponent(apiKey)+"&prettyPrint=false",
          {
            method:"POST",
            cache:"no-store",
            signal:controller.signal,
            headers:{
              "content-type":"application/json",
              "accept":"*/*",
              "user-agent":profile.userAgent,
              "x-youtube-client-name":profile.clientNumericName,
              "x-youtube-client-version":profile.clientVersion,
              "x-origin":"https://www.youtube.com",
              "origin":"https://www.youtube.com"
            },
            body:JSON.stringify({
              context:{client},
              videoId:id,
              contentCheckOk:true,
              racyCheckOk:true
            })
          }
        );
        if(!response.ok)continue;
        const data=await response.json().catch(()=>null);
        if(!data)continue;
        const meta=playerMetaFromResponse(data);
        fallback=meta;
        if(meta.live||meta.ended||meta.channelId)return meta;
      }catch{
        // Try the next client/key pair.
      }finally{
        clearTimeout(timer);
      }
    }
  }
  return fallback;
}

async function inspectWatchLive(videoId){
  const id=validVideoId(videoId);
  if(!id)return {known:false,live:false,viewerCount:0,channelId:"",sourceName:"",title:"",thumbnail:""};

  // InnerTube is the only current-LIVE authority. isLiveContent is intentionally
  // ignored because archived livestreams can retain it after ending.
  const player=await inspectPlayerLive(id);
  if(player?.known!==true){
    return {known:false,live:false,viewerCount:0,...player};
  }
  if(player?.live!==true||player?.ended===true){
    return {known:true,live:false,viewerCount:0,...player};
  }

  // Viewer count is optional decoration. A watch-page failure must not change
  // the already verified LIVE/owner decision.
  const page=await fetchText(
    "https://www.youtube.com/watch?v="+encodeURIComponent(id)+"&hl=vi&gl=VN",
    4500
  );
  const viewerCount=page.ok?liveViewerCountFromHtml(page.text):0;
  return {
    ...player,
    known:true,
    live:true,
    viewerCount
  };
}

async function checkChannelLive(target){
  const channelId=validChannelId(target?.channelId);
  if(!channelId)return {...target,known:false,live:false,error:"invalid_channel"};

  const acceptVerified=(id,state)=>{
    if(
      state?.known!==true||
      state?.live!==true||
      validChannelId(state?.channelId)!==channelId
    )return null;

    const sourceName=clean(
      state?.sourceName||target?.sourceName,
      180
    );
    const title=clean(state?.title,300);
    return {
      ...target,
      known:true,
      live:true,
      videoId:id,
      channelId,
      sourceName,
      title,
      thumbnail:clean(state?.thumbnail,1000)||
        (validVideoId(target?.videoId)===id?clean(target?.thumbnail,1000):"")||
        ("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),
      viewerCount:Math.max(0,Number(state?.viewerCount)||0),
      checkedAt:Date.now(),
      verifiedOwner:true,
      verifiedLive:true,
      verification:"innertube_is_live+owner_match"
    };
  };

  // Search/trending gives a candidate only. It is accepted only when InnerTube
  // confirms both current LIVE state and the exact canonical owner.
  const hintedId=validVideoId(target?.videoId);
  if(hintedId){
    const hintedState=await inspectWatchLive(hintedId);
    const verified=acceptVerified(hintedId,hintedState);
    if(verified)return verified;
    // A definitive owner mismatch/non-live result invalidates the hint. Continue
    // with this channel's own /live surface to find its current candidate.
  }

  const page=await fetchText(
    "https://www.youtube.com/channel/"+encodeURIComponent(channelId)+"/live?hl=vi&gl=VN",
    5000
  );
  if(!page.ok)return {...target,known:false,live:false,error:"http_"+page.status};

  const finalUrl=String(page.url||"");
  const candidates=[];
  const redirected=validVideoId(finalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||"");
  if(redirected)candidates.push(redirected);
  for(const id of liveCandidateIdsFromChannelHtml(page.text,target?.videoId)){
    if(!candidates.includes(id))candidates.push(id);
  }

  let sawKnown=false;
  for(const candidate of candidates){
    const state=await inspectWatchLive(candidate);
    if(state?.known===true)sawKnown=true;
    const verified=acceptVerified(candidate,state);
    if(verified)return verified;
  }

  // If candidate probes were definitive, this channel is known offline. If all
  // probes failed upstream, preserve the previous snapshot rather than erasing.
  return {
    ...target,
    known:sawKnown||candidates.length===0,
    live:false,
    videoId:""
  };
}

async function mapLimit(rows,limit,fn){
  const out=new Array(rows.length); let cursor=0;
  const work=async()=>{while(true){const i=cursor++;if(i>=rows.length)return;out[i]=await fn(rows[i],i)}};
  await Promise.all(Array.from({length:Math.min(limit,rows.length||1)},()=>work()));
  return out;
}
async function loadSnapshot(env){
  try{return JSON.parse(await env.YOUTUBE_LIVE.get(SNAPSHOT_KEY)||"{}")}catch{return {}}
}
async function wakeLivePackage(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const response=await fetch(PACKAGE_REFRESH_URL,{
      method:"POST",
      cache:"no-store",
      signal:controller.signal,
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        scopes:["live"],
        client_check:true,
        reason:"cloud-live-signal"
      })
    });
    return response.ok;
  }catch{
    return false;
  }finally{
    clearTimeout(timer);
  }
}
async function loadCycle(env){
  try{return JSON.parse(await env.YOUTUBE_LIVE.get(CYCLE_KEY)||"{}")}catch{return {}}
}
async function startCycle(env){
  const state=await fetchJson(STATE_URL,8000);
  const base=stateTargets(state);
  const discovered=await discoverSearchCandidates(base.blocked,base.liveKeywords);

  const targets=new Map();
  for(const id of base.selected){
    const m=base.meta.get(id)||{};
    targets.set(id,{
      channelId:id,
      sourceName:clean(m.sourceName,180),
      sourceAvatar:clean(m.sourceAvatar,1000),
      title:"",
      thumbnail:"",
      origin:"selected"
    });
  }
  for(const row of discovered){
    if(base.blocked.has(row.channelId))continue;
    const existing=targets.get(row.channelId)||{};
    targets.set(row.channelId,{
      ...row,
      ...existing,
      channelId:row.channelId,
      sourceName:clean(existing.sourceName||row.sourceName,180),
      sourceAvatar:clean(existing.sourceAvatar,1000),
      origin:existing.origin==="selected"?"selected+search":row.origin
    });
  }

  const rows=[...targets.values()];
  const cycle={
    id:Date.now().toString(36)+"-"+hash(rows.map(r=>r.channelId).join("|")),
    createdAt:Date.now(),
    cursor:0,
    targets:rows,
    results:{},
    selectedCount:base.selected.length,
    discoveredCount:discovered.length,
    liveKeywords:base.liveKeywords
  };
  await env.YOUTUBE_LIVE.put(CYCLE_KEY,JSON.stringify(cycle),{expirationTtl:600});
  return cycle;
}
function snapshotMaterial(items){
  return items.map(row=>[
    row.channelId,row.videoId,row.title,row.sourceName,row.thumbnail,row.sourceAvatar,
    row.origin,row.viewerCount,row.verifiedLive===true,row.verifiedOwner===true,row.verification||""
  ].join("|")).sort().join("\n");
}
async function scanStep(env,{start=false}={}){
  let cycle=await loadCycle(env);
  const reusable=Boolean(
    cycle?.id&&
    Array.isArray(cycle?.targets)&&
    Number(cycle?.cursor||0)<cycle.targets.length&&
    Date.now()-Number(cycle?.createdAt||0)<75_000
  );
  if(!reusable)cycle=await startCycle(env);

  const startAt=Math.max(0,Number(cycle.cursor)||0);
  const batch=cycle.targets.slice(startAt,startAt+BATCH_SIZE);
  const checked=await mapLimit(batch,8,checkChannelLive);
  const results={...(cycle.results||{})};
  for(const row of checked){
    const id=validChannelId(row?.channelId);
    if(id)results[id]=row;
  }
  cycle.results=results;
  cycle.cursor=startAt+batch.length;

  const done=cycle.cursor>=cycle.targets.length;
  if(!done){
    await env.YOUTUBE_LIVE.put(CYCLE_KEY,JSON.stringify(cycle),{expirationTtl:600});
    return {
      ok:true,edge:true,cycleId:cycle.id,done:false,
      cursor:cycle.cursor,total:cycle.targets.length,
      selected:cycle.selectedCount,discovered:cycle.discoveredCount,
      checked:batch.length
    };
  }

  const previous=await loadSnapshot(env);
  const keywords=Array.isArray(cycle?.liveKeywords)?cycle.liveKeywords:[];
  const items=Object.values(results)
    .filter(row=>
      row?.known&&
      row?.live&&
      validVideoId(row?.videoId)&&
      !liveKeywordBlocked(row,keywords)
    )
    .map(row=>{
      const sourceName=clean(row.sourceName,180)||String(row.channelId);
      return {
        id:String(row.videoId),
        videoId:String(row.videoId),
        provider:"youtube",
        channelId:String(row.channelId),
        sourceId:String(row.channelId),
        sourceName,
        sourceAvatar:clean(row.sourceAvatar,1000),
        title:clean(row.title,300),
        thumbnail:clean(row.thumbnail,1000)||("https://i.ytimg.com/vi/"+row.videoId+"/hqdefault.jpg"),
        isLive:true,
        viewerCount:Math.max(0,Number(row?.viewerCount)||0),
        publishedText:"Đang trực tiếp",
        duration:-1,
        uploaded:-1,
        views:0,
        origin:clean(row.origin,80),
        checkedAt:Number(row.checkedAt)||Date.now(),
        verifiedLive:row?.verifiedLive===true,
        verifiedOwner:row?.verifiedOwner===true,
        verification:clean(row?.verification,120)
      };
    });

  // Never erase a previously confirmed LIVE merely because the newest probe
  // was unknown (timeout/network/temporary YouTube failure). A LIVE entry is
  // removed only after that channel returns a known non-live result, or it
  // legitimately falls out of the current target set.
  const nextChannels=new Set(items.map(row=>String(row.channelId)));
  for(const prev of Array.isArray(previous.items)?previous.items:[]){
    const channelId=validChannelId(prev?.channelId||prev?.sourceId);
    const probe=channelId?results[channelId]:null;
    if(
      !channelId||
      nextChannels.has(channelId)||
      !probe||
      probe.known!==false||
      prev?.verifiedLive!==true||
      prev?.verifiedOwner!==true
    )continue;
    items.push({...prev});
    nextChannels.add(channelId);
  }
  items.sort((a,b)=>String(a.channelId).localeCompare(String(b.channelId)));

  const changed=snapshotMaterial(previous.items||[])!==snapshotMaterial(items);
  const next={
    ok:true,edge:true,
    version:Number(previous.version||0)+(changed?1:0),
    changedAt:changed?Date.now():Number(previous.changedAt||0),
    checkedAt:Date.now(),
    selected:cycle.selectedCount,
    discovered:cycle.discoveredCount,
    checked:cycle.targets.length,
    live:items.length,
    items
  };
  if(changed||!previous.checkedAt){
    await env.YOUTUBE_LIVE.put(SNAPSHOT_KEY,JSON.stringify(next));

    // Cloudflare only discovers current LIVE state. The durable/browser-facing
    // feed remains the Supabase LIVE package, so a changed discovery snapshot
    // immediately wakes that package builder.
    await wakeLivePackage();
  }else{
    // checkedAt is diagnostic only; avoid KV churn when the LIVE set is unchanged.
    next.checkedAt=Number(previous.checkedAt||0);
  }
  await env.YOUTUBE_LIVE.delete(CYCLE_KEY);
  return {...next,done:true,cycleId:cycle.id,changed};
}
async function liveNow(env){
  const snapshot=await loadSnapshot(env);
  return {
    ok:true,edge:true,
    version:Number(snapshot.version||0),
    changedAt:Number(snapshot.changedAt||0),
    checkedAt:Number(snapshot.checkedAt||0),
    selected:Number(snapshot.selected||0),
    discovered:Number(snapshot.discovered||0),
    checked:Number(snapshot.checked||0),
    live:Array.isArray(snapshot.items)?snapshot.items.length:0,
    items:Array.isArray(snapshot.items)?snapshot.items:[]
  };
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true,service:"1988-youtube-live-state",mode:"demand-only-discover-and-wake-package"});
    if(url.pathname==="/youtube/live-now")return json(await liveNow(env));
    if(url.pathname==="/youtube/live-scan"){
      const start=url.searchParams.get("start")==="1";
      return json(await scanStep(env,{start}));
    }
    return json({ok:false,error:"not_found"},404);
  }
};
