import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROFILE="owner";
const SCOPES=[
  "live","latest","week","news","economy","law",
  "film","music","tech","sports","entertainment"
];
const SCOPE_META:any={
  live:{profile:"live",label:"Live",kind:"live"},
  latest:{profile:"day",label:"Ngày",kind:"time"},
  week:{profile:"week",label:"Tuần",kind:"time"},
  news:{profile:"explore",label:"Khám phá",kind:"content"},
  economy:{profile:"review",label:"Review",kind:"content"},
  law:{profile:"comedy",label:"Hài",kind:"content"},
  film:{profile:"short_film",label:"Phim ngắn",kind:"content"},
  music:{profile:"music",label:"Nhạc",kind:"content"},
  tech:{profile:"technology",label:"Công nghệ",kind:"content"},
  sports:{profile:"sports",label:"Thể thao",kind:"content"},
  entertainment:{profile:"showbiz",label:"Showbiz",kind:"content"}
};
const CONTENT_SCOPES=new Set(SCOPES.filter((s)=>SCOPE_META[s]?.kind==="content"));
const DAY_MS=24*60*60*1000;
const CHANNEL_CACHE_MAX_AGE_MS=8*DAY_MS;
const CHANNEL_FAILURE_RETRY_MS=2*60*1000;
const MAX_CHANNEL_FETCHES_PER_RUN=30;
const LIVE_PIPELINE_VERSION="live-v13";
const LIVE_SEARCH_QUERIES=[
  "trực tiếp",
  "live việt nam",
  "đang phát trực tiếp",
  "livestream việt nam"
];
const DEFAULT_SCOPE_INTERVAL_MINUTES:any={
  live:2,
  latest:2,
  week:5,
  news:5,
  economy:10,
  law:10,
  film:10,
  music:10,
  tech:5,
  sports:5,
  entertainment:5
};
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods":"POST, OPTIONS",
  "cache-control":"no-store"
};

function json(data:any,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"content-type":"application/json; charset=utf-8"}
  });
}
function clean(value:any,max=1000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function normalizeText(value:any){
  return clean(value,600)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d").replace(/Đ/g,"D")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function fastHash(value:any){
  let hash=2166136261;
  const text=String(value??"");
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}
function videoId(row:any){
  const direct=clean(row?.id||row?.videoId||"",64);
  if(/^[A-Za-z0-9_-]{11}$/.test(direct))return direct;
  const url=clean(row?.url||row?.videoUrl||"",500);
  return url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1]||"";
}
function channelId(row:any){
  const direct=clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180);
  if(/^UC[A-Za-z0-9_-]+$/.test(direct))return direct;
  const url=clean(row?.uploaderUrl||row?.channelUrl||"",500);
  return url.match(/\/channel\/(UC[A-Za-z0-9_-]+)/i)?.[1]||"";
}
function isLive(row:any){
  return row?.isLive===true||Number(row?.duration)<0||Number(row?.uploaded)===-1;
}
function normalizeLiveText(value:any){
  return normalizeText(value);
}
function liveKeywordBlocked(row:any,keywords:string[]){
  if(!Array.isArray(keywords)||!keywords.length)return false;
  const haystack=normalizeLiveText([
    row?._displayTitle||row?.title||"",
    row?._sourceName||row?.uploaderName||row?.uploader||row?.channelName||""
  ].join(" "));
  if(!haystack)return false;
  return keywords.some((keyword)=> {
    const needle=normalizeLiveText(keyword);
    return !!needle&&haystack.includes(needle);
  });
}

function strongFreshLiveSignal(row:any){
  return Number(row?.duration)<0&&Number(row?.uploaded)===-1;
}
function relativeAgeMs(value:any){
  const raw=normalizeText(value);
  if(!raw)return Number.MAX_SAFE_INTEGER;
  if(/\b(vua xong|just now|moments ago|few seconds ago)\b/.test(raw))return 0;

  const match=raw.match(/(\d+)\s*(giay|phut|gio|ngay|tuan|thang|nam|second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b/);
  if(!match)return Number.MAX_SAFE_INTEGER;

  const n=Math.max(0,Number(match[1])||0);
  const unit=match[2];
  const minute=60*1000;
  if(/giay|second/.test(unit))return n*1000;
  if(/phut|minute/.test(unit))return n*minute;
  if(/gio|hour/.test(unit))return n*60*minute;
  if(/ngay|day/.test(unit))return n*24*60*minute;
  if(/tuan|week/.test(unit))return n*7*24*60*minute;
  if(/thang|month/.test(unit))return n*30*24*60*minute;
  if(/nam|year/.test(unit))return n*365*24*60*minute;
  return Number.MAX_SAFE_INTEGER;
}
function ageMs(row:any){
  if(isLive(row))return -1;
  const value=Number(row?.uploaded||row?.published||row?.publishedAt||0);
  if(Number.isFinite(value)&&value>0){
    const ms=value<1e12?value*1000:value;
    return Math.max(0,Date.now()-ms);
  }

  const raw=clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"",120);
  const relative=relativeAgeMs(raw);
  if(Number.isFinite(relative)&&relative!==Number.MAX_SAFE_INTEGER)return relative;

  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?Math.max(0,Date.now()-parsed):Number.MAX_SAFE_INTEGER;
}
function publishedText(row:any){
  return clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"",120);
}
function normalizeRow(row:any,source:any={}){
  const id=videoId(row);
  if(!id)return null;
  const sid=clean(source?.id||channelId(row),180);
  const sname=clean(source?.name||row?.uploaderName||row?.uploader||row?.channelName||"",180);
  return {
    ...row,
    id,
    videoId:id,
    title:clean(row?.title||"",300),
    thumbnail:clean(row?.thumbnail||row?.thumbnailUrl||row?.thumbnail_url||"",1000),
    thumbnailUrl:clean(row?.thumbnailUrl||row?.thumbnail||row?.thumbnail_url||"",1000),
    uploader:clean(row?.uploader||row?.uploaderName||sname,180),
    uploaderName:clean(row?.uploaderName||row?.uploader||sname,180),
    channelId:sid||clean(row?.channelId||row?.uploaderId||"",180),
    _sourceId:sid,
    _sourceName:sname,
    isLive:isLive(row),
    publishedText:publishedText(row),
    views:Number(row?.views)||0,
    duration:Number(row?.duration)||0
  };
}
function dedupeRows(rows:any[]){
  const ids=new Set<string>();
  const titleHashes=new Set<string>();
  const out:any[]=[];
  for(const row of rows){
    const id=videoId(row);
    if(!id||ids.has(id))continue;
    const title=normalizeText(row?._displayTitle||row?.title||"");
    const th=title.length>=16?fastHash(title):"";
    if(th&&titleHashes.has(th))continue;
    ids.add(id);
    if(th)titleHashes.add(th);
    out.push(row);
  }
  return out;
}
function strongAd(row:any){
  const title=clean(row?._displayTitle||row?.title||"",260);
  const norm=normalizeText(title);
  const phone=/(?:^|[^\d])(?:\+?84|0)(?:3|5|7|8|9)(?:[\s.\-]?\d){8}(?:[^\d]|$)/u.test(title);
  const url=/(?:https?:\/\/|www\.|(?:^|\s)[a-z0-9-]+\.(?:com|net|org|vn|me|io|cc|xyz)(?:\s|\/|$))/iu.test(title);
  const promo=/\b(?:giftcode|coupon|voucher|ma giam gia|ma khuyen mai|nhap ma|code tan thu|code nhan qua|ma nhan qua|affiliate)\b/u.test(norm);
  const contact=/\b(?:zalo|telegram|whatsapp|hotline|lien he|inbox|ib)\b/u.test(norm);
  const handle=/(?:^|\s)@[a-z0-9_.-]{4,}/iu.test(title);
  return phone||url||promo||(contact&&handle);
}
function reviewCleanTitle(value:any){
  const original=clean(value,300);
  if(!original)return "";
  const title=original
    .replace(/https?:\/\/\S+|www\.\S+/giu," ")
    .replace(/(?:#[\p{L}\p{N}_-]+\s*)+$/gu," ")
    .replace(/^\s*(?:review\s*phim|phim\s*review|tóm\s*tắt\s*phim|tom\s*tat\s*phim|movie\s*recap)\s*[:|\-–—]*\s*/iu,"")
    .replace(/\b(?:full\s*tập|full\s*tap|trọn\s*bộ|tron\s*bo|vietsub|thuyết\s*minh|thuyet\s*minh)\b/giu," ")
    .replace(/([!?.,])\1{1,}/g,"$1")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/g,"")
    .trim();
  return title.length>=10?title:original;
}
function sourceSignature(rows:any[],scope:string){
  return rows
    .filter((r)=>r.scope===scope&&r.status==="selected")
    .map((r)=>clean(r.channel_id,180))
    .filter(Boolean)
    .filter((id)=>!rows.some((b)=>b.scope===scope&&b.channel_id===id&&b.status==="blocked"))
    .sort()
    .join("|");
}
function snapshotRowsHash(rows:any[],sourceSig=""){
  const body=rows.map((row)=>[
    videoId(row),
    clean(row?._displayTitle||row?.title||"",300),
    publishedText(row),
    clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180),
    isLive(row)?"1":"0"
  ].join("|")).join("\n");
  return fastHash(String(sourceSig||"")+"\n"+body);
}
function sortRows(rows:any[]){
  return rows.slice().sort((a,b)=>{
    const aa=ageMs(a),bb=ageMs(b);
    if(aa!==bb)return aa-bb;
    return (Number(b?.views)||0)-(Number(a?.views)||0);
  });
}
async function fetchJson(url:string,headers:any={},timeout=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const res=await fetch(url,{headers,cache:"no-store",signal:controller.signal});
    const data=await res.json().catch(()=>null);
    if(!res.ok||data?.ok===false)throw new Error(data?.error||("HTTP "+res.status));
    return data;
  }finally{clearTimeout(timer);}
}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>){
  const out=new Array<R>(items.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)return;
      out[i]=await fn(items[i],i);
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

function decodeXmlText(value:any){
  return String(value||"")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'")
    .trim();
}

async function youtubeRssLiveCandidates(source:any){
  const id=clean(source?.id,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return [];
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3200);
  try{
    const endpoint="https://www.youtube.com/feeds/videos.xml?channel_id="+encodeURIComponent(id);
    const res=await fetch(endpoint,{
      signal:controller.signal,
      cache:"no-store",
      headers:{accept:"application/atom+xml,application/xml,text/xml,*/*"}
    });
    if(!res.ok)throw new Error("youtube_rss_http_"+res.status);
    const xml=await res.text();
    const feedTitle=decodeXmlText(
      xml.match(/<feed[\s\S]*?<title>([\s\S]*?)<\/title>/i)?.[1]||source?.name||""
    );
    const out:any[]=[];
    for(const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)){
      const entry=match[1]||"";
      const idValue=String(entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1]||"").trim();
      if(!/^[A-Za-z0-9_-]{11}$/.test(idValue))continue;
      const published=String(entry.match(/<published>([^<]+)<\/published>/i)?.[1]||"").trim();
      const uploaded=Date.parse(published);
      const row=normalizeRow({
        id:idValue,
        videoId:idValue,
        url:"/watch?v="+idValue,
        title:decodeXmlText(entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||""),
        thumbnail:decodeXmlText(entry.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1]||""),
        uploaderName:feedTitle||clean(source?.name,180),
        uploaderUrl:"/channel/"+id,
        uploadedDate:published,
        publishedText:published,
        uploaded:Number.isFinite(uploaded)?uploaded:0,
        duration:0,
        views:Number(entry.match(/<media:statistics[^>]+views=["'](\d+)["']/i)?.[1]||0)||0,
        isLive:false
      },source);
      if(row)out.push(row);
      if(out.length>=4)break;
    }
    return out;
  }finally{
    clearTimeout(timer);
  }
}

async function searchSelectedSourceLiveCandidates(
  source:any,
  supabaseUrl:string,
  serviceKey:string
){
  const id=clean(source?.id,180);
  const query=clean(source?.name,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!query)return [];
  const result=await fetchJson(
    supabaseUrl+"/functions/v1/yt1988?action=search&q="+encodeURIComponent(query)+"&filter=videos",
    {
      "apikey":serviceKey,
      "authorization":"Bearer "+serviceKey
    },
    4200
  );
  const raw=Array.isArray(result?.data?.items)?result.data.items:
    Array.isArray(result?.data)?result.data:[];
  return raw
    .map((row:any)=>normalizeRow(row,source))
    .filter((row:any)=>row&&channelId(row)===id&&strongFreshLiveSignal(row))
    .slice(0,4);
}

async function discoverGlobalLiveCandidates(
  supabaseUrl:string,
  serviceKey:string,
  blockedIds:Set<string>,
  keywords:string[]
){
  const deadline=Date.now()+14000;
  const out:any[]=[];

  for(const query of LIVE_SEARCH_QUERIES){
    if(Date.now()>=deadline)break;
    let nextpage="";
    let first=true;

    do{
      const action=first
        ?"search&q="+encodeURIComponent(query)+"&filter=videos"
        :"search_next&q="+encodeURIComponent(query)+
          "&filter=videos&nextpage="+encodeURIComponent(nextpage);
      const result=await fetchJson(
        supabaseUrl+"/functions/v1/yt1988?action="+action,
        {
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },
        4200
      );
      const raw=Array.isArray(result?.data?.items)?result.data.items:
        Array.isArray(result?.data)?result.data:[];

      for(const item of raw){
        const row=normalizeRow(item,{});
        if(!row||!strongFreshLiveSignal(row))continue;
        const sid=channelId(row);
        if(sid&&blockedIds.has(sid))continue;
        if(liveKeywordBlocked(row,keywords))continue;
        out.push({...row,_liveOrigin:"search"});
      }

      nextpage=String(result?.data?.nextpage||"").trim();
      first=false;
    }while(nextpage&&Date.now()<deadline);
  }

  return dedupeRows(out);
}

async function verifyLiveCandidate(row:any,supabaseUrl:string,serviceKey:string){
  const id=videoId(row);
  if(!id)return null;
  if(strongFreshLiveSignal(row))return {
    ...row,
    isLive:true,
    duration:-1,
    uploaded:-1
  };
  const result=await fetchJson(
    supabaseUrl+"/functions/v1/yt1988?action=video&id="+encodeURIComponent(id),
    {
      "apikey":serviceKey,
      "authorization":"Bearer "+serviceKey
    },
    3600
  );
  const data=result?.data||{};
  const active=
    data?.livestream===true&&(
      !!clean(data?.hls||"",1200)||
      (Array.isArray(data?.hlsSources)&&data.hlsSources.some((item:any)=>!!clean(item?.url||"",1200)))||
      Number(data?.duration)<0
    );
  if(!active)return null;
  return {
    ...row,
    isLive:true,
    duration:Number(data?.duration)<0?Number(data.duration):-1,
    uploaded:-1
  };
}

async function verifyLiveRows(rows:any[],supabaseUrl:string,serviceKey:string){
  const verified=await mapLimit(rows,8,async(row)=>{
    try{
      return await verifyLiveCandidate(row,supabaseUrl,serviceKey);
    }catch(error){
      console.warn("live verify failed",videoId(row),String(error));
      return null;
    }
  });
  return verified.filter(Boolean);
}

async function claimLease(rest:string,headers:any){
  const res=await fetch(rest+"/rpc/yt1988_try_refresh_lock",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_lease_seconds:110})
  });
  if(!res.ok)return false;
  return (await res.json())===true;
}
async function queuePendingRefresh(rest:string,headers:any,scopes:string[]){
  if(!scopes.length)return;
  await fetch(rest+"/rpc/yt1988_queue_refresh",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_scopes:scopes})
  }).catch(()=>{});
}
async function finishLease(rest:string,headers:any,ok:boolean,error=""){
  try{
    const res=await fetch(rest+"/rpc/yt1988_finish_refresh_v2",{
      method:"POST",headers,
      body:JSON.stringify({p_profile_key:PROFILE,p_ok:ok,p_error:clean(error,1800)})
    });
    if(res.ok){
      const pending=await res.json().catch(()=>[]);
      return Array.isArray(pending)?pending.filter((s:any)=>SCOPES.includes(clean(s,32))):[];
    }
  }catch{}

  await fetch(rest+"/rpc/yt1988_finish_refresh",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_ok:ok,p_error:clean(error,1800)})
  }).catch(()=>{});
  return [];
}
function triggerFollowupRefresh(supabaseUrl:string,serviceKey:string,scopes:string[]){
  const wanted=[...new Set(scopes.map((s)=>clean(s,32)).filter((s)=>SCOPES.includes(s)))];
  if(!wanted.length)return;
  const task=fetch(supabaseUrl+"/functions/v1/yt1988-refresh",{
    method:"POST",
    headers:{
      "apikey":serviceKey,
      "authorization":"Bearer "+serviceKey,
      "content-type":"application/json"
    },
    body:JSON.stringify({scopes:wanted})
  }).catch((error)=>console.warn("followup refresh failed",String(error)));
  try{(globalThis as any).EdgeRuntime?.waitUntil?.(task);}catch{}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);

  // This endpoint only rebuilds server-owned read packages from authoritative
  // source state. A DB lease limits execution frequency and prevents overlap.
  const rest=supabaseUrl+"/rest/v1";
  const authHeaders={
    "apikey":serviceKey,
    "authorization":"Bearer "+serviceKey,
    "content-type":"application/json"
  };

  let body:any={};
  try{body=await req.json();}catch{}
  const requested=new Set(
    (Array.isArray(body?.scopes)?body.scopes:[])
      .map((s:any)=>clean(s,32))
      .filter((s:string)=>SCOPES.includes(s))
  );
  let scopes=requested.size?[...requested]:SCOPES.slice();

  if(!await claimLease(rest,authHeaders)){
    await queuePendingRefresh(rest,authHeaders,scopes);
    return json({ok:true,skipped:true,queued:true,reason:"refresh_already_running",scopes});
  }

  // LIVE is latency-sensitive and must not wait behind channel snapshot work.
  // Defer other due scopes to the existing pending-scope handoff.
  if(scopes.includes("live")&&scopes.length>1){
    const deferredScopes=scopes.filter((scope)=>scope!=="live");
    await queuePendingRefresh(rest,authHeaders,deferredScopes);
    scopes=["live"];
  }

  let ok=false;
  let failure="";
  try{
    const stateRes=await fetch(
      rest+"/yt1988_source_state?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&scope=in.("+[...SCOPES,"general"].map(encodeURIComponent).join(",")+")"+
      "&select=scope,channel_id,status,name,thumbnail_url,subscribers",
      {headers:authHeaders}
    );
    if(!stateRes.ok)throw new Error("source_state_read_failed");
    const stateRows=await stateRes.json();
    const rows=Array.isArray(stateRows)?stateRows:[];

    const packageRes=await fetch(
      rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&select=scope,hash,input_hash,source_signature,version,items,updated_at",
      {headers:authHeaders}
    );
    if(!packageRes.ok)throw new Error("package_manifest_read_failed");
    const packageRows=await packageRes.json();
    const currentByScope=new Map((Array.isArray(packageRows)?packageRows:[]).map((r:any)=>[r.scope,r]));

    // Refresh cadence is data, not code. This keeps "2/5/10 minutes" adjustable
    // without changing the worker. If config is temporarily unavailable, use
    // the safe defaults above.
    const intervalByScope=new Map<string,number>(
      SCOPES.map((scope)=>[scope,Number(DEFAULT_SCOPE_INTERVAL_MINUTES[scope])||10])
    );
    try{
      const configRes=await fetch(
        rest+"/yt1988_refresh_config?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&enabled=eq.true&select=scope,interval_minutes",
        {headers:authHeaders}
      );
      if(configRes.ok){
        const configRows=await configRes.json();
        for(const row of Array.isArray(configRows)?configRows:[]){
          const scope=clean(row?.scope,32);
          const minutes=Math.max(1,Math.min(1440,Number(row?.interval_minutes)||0));
          if(SCOPES.includes(scope)&&minutes>0)intervalByScope.set(scope,minutes);
        }
      }
    }catch{}

    const blockedByScope=new Map<string,Set<string>>();
    const selectedByScope=new Map<string,any[]>();
    const generalBlockedIds=new Set<string>();
    const channelMeta=new Map<string,any>();

    for(const scope of SCOPES){
      blockedByScope.set(scope,new Set());
      selectedByScope.set(scope,[]);
    }
    for(const row of rows){
      const scope=clean(row?.scope,32);
      const id=clean(row?.channel_id,180);
      if(!id)continue;
      if(scope==="general"){
        if(row?.status==="blocked")generalBlockedIds.add(id);
        continue;
      }
      if(!SCOPES.includes(scope))continue;
      if(row?.status==="blocked"){
        blockedByScope.get(scope)?.add(id);
      }else if(row?.status==="selected"){
        selectedByScope.get(scope)?.push({
          id,
          name:clean(row?.name,180),
          thumbnailUrl:clean(row?.thumbnail_url,1000)
        });
      }
      if(!channelMeta.has(id)){
        channelMeta.set(id,{
          id,
          name:clean(row?.name,180),
          thumbnailUrl:clean(row?.thumbnail_url,1000)
        });
      }
    }

    for(const scope of SCOPES){
      const blocked=blockedByScope.get(scope)||new Set();
      selectedByScope.set(
        scope,
        (selectedByScope.get(scope)||[]).filter((s:any)=>!blocked.has(s.id))
      );
    }

    let liveKeywords:string[]=[];
    let verifiedLiveRowsCache:any[]=[];

    const allBlockedLiveSourceIds=new Set<string>(generalBlockedIds);
    for(const scope of SCOPES){
      for(const id of blockedByScope.get(scope)||[])allBlockedLiveSourceIds.add(id);
    }

    const explicitLiveSources=selectedByScope.get("live")||[];
    const explicitLiveIds=new Set(explicitLiveSources.map((source:any)=>source.id));
    const liveSourceById=new Map<string,any>();

    for(const source of SCOPES.flatMap((scope)=>selectedByScope.get(scope)||[])){
      if(!source?.id||allBlockedLiveSourceIds.has(source.id))continue;
      const current=liveSourceById.get(source.id);
      liveSourceById.set(source.id,{
        ...current,
        ...source,
        name:clean(source?.name||current?.name||"",180),
        thumbnailUrl:clean(source?.thumbnailUrl||current?.thumbnailUrl||"",1000)
      });
    }
    for(const source of explicitLiveSources){
      if(!source?.id||allBlockedLiveSourceIds.has(source.id))continue;
      const current=liveSourceById.get(source.id)||{};
      liveSourceById.set(source.id,{
        ...current,
        ...source,
        name:clean(source?.name||current?.name||"",180),
        thumbnailUrl:clean(source?.thumbnailUrl||current?.thumbnailUrl||"",1000)
      });
    }

    const selectedLiveSources=[...liveSourceById.values()];
    const inheritedLiveIds=new Set(
      selectedLiveSources
        .map((source:any)=>source.id)
        .filter((id:string)=>!explicitLiveIds.has(id))
    );

    if(scopes.includes("live")){
      try{
        const keywordsRes=await fetch(
          rest+"/yt1988_live_keywords?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&select=keyword_display&order=keyword_display.asc",
          {headers:authHeaders}
        );
        if(keywordsRes.ok){
          const keywordRows=await keywordsRes.json();
          liveKeywords=(Array.isArray(keywordRows)?keywordRows:[])
            .map((row:any)=>clean(row?.keyword_display||"",120))
            .filter(Boolean);
        }
      }catch(error){
        console.warn("live keyword read failed",String(error));
      }

      const selectedDiscoveryBatches=await mapLimit(selectedLiveSources,6,async(source)=>{
        try{
          const direct=await searchSelectedSourceLiveCandidates(
            source,supabaseUrl,serviceKey
          );
          if(direct.length)return direct;
        }catch(error){
          console.warn("selected live search failed",source?.id,String(error));
        }
        try{
          return await youtubeRssLiveCandidates(source);
        }catch(error){
          console.warn("live rss failed",source?.id,String(error));
          return [];
        }
      });

      let globalCandidates:any[]=[];
      try{
        globalCandidates=await discoverGlobalLiveCandidates(
          supabaseUrl,
          serviceKey,
          allBlockedLiveSourceIds,
          liveKeywords
        );
      }catch(error){
        console.warn("global live discovery failed",String(error));
      }

      const candidates=dedupeRows([
        ...selectedDiscoveryBatches.flat().map((row:any)=>({...row,_liveOrigin:"source"})),
        ...globalCandidates
      ])
        .filter((row:any)=>{
          const sid=channelId(row);
          return !sid||!allBlockedLiveSourceIds.has(sid);
        })
        .filter((row:any)=>!liveKeywordBlocked(row,liveKeywords))
        .map((row:any)=>{
          const sid=channelId(row);
          return {
            ...row,
            _interestPriority:explicitLiveIds.has(sid)
              ?2
              :inheritedLiveIds.has(sid)
                ?1
                :0
          };
        })
        .sort((a:any,b:any)=>
          (Number(b?._interestPriority)||0)-(Number(a?._interestPriority)||0)
        );

      verifiedLiveRowsCache=await verifyLiveRows(candidates,supabaseUrl,serviceKey);
    }

    const nonLiveScopes=scopes.filter((scope)=>scope!=="live");
    const neededIds=[...new Set(
      nonLiveScopes.flatMap((scope)=>selectedByScope.get(scope)||[]).map((s:any)=>s.id)
    )];
    const channelRows=new Map<string,any[]>();
    const channelFetchOk=new Set<string>();
    const cacheById=new Map<string,any>();
    const cacheWrites:any[]=[];
    const now=Date.now();

    // Load persistent per-channel snapshots. These are the server equivalent
    // of the old browser channel cache: one failed upstream request must never
    // erase a channel that was previously fetched successfully.
    for(let start=0;start<neededIds.length;start+=50){
      const ids=neededIds.slice(start,start+50);
      if(!ids.length)continue;
      const cacheRes=await fetch(
        rest+"/yt1988_channel_cache?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
        "&select=channel_id,items,hash,newest_video_id,newest_uploaded_at,source_name,thumbnail_url,checked_at,last_success_at,last_error,retry_after,version",
        {headers:authHeaders}
      );
      if(!cacheRes.ok){
        console.warn("channel cache read failed",await cacheRes.text());
        continue;
      }
      const cacheRows=await cacheRes.json();
      for(const row of Array.isArray(cacheRows)?cacheRows:[]){
        const id=clean(row?.channel_id,180);
        if(id)cacheById.set(id,row);
      }
    }

    // Existing packages are also valid reserve data during the first migration
    // run, before every selected channel has its own cache row.
    for(const pkg of Array.isArray(packageRows)?packageRows:[]){
      for(const item of Array.isArray(pkg?.items)?pkg.items:[]){
        const id=channelId(item);
        if(!id||cacheById.has(id))continue;
        const list=(cacheById.get(id)?.items)||[];
        list.push(item);
        cacheById.set(id,{
          channel_id:id,
          items:list,
          source_name:clean(item?._sourceName||item?.uploaderName||item?.uploader||"",180),
          thumbnail_url:"",
          checked_at:pkg?.updated_at||null,
          last_success_at:pkg?.updated_at||null,
          retry_after:null,
          hash:""
        });
      }
    }

    for(const id of neededIds){
      const cached=cacheById.get(id);
      const source=channelMeta.get(id)||{id,name:""};
      if(!source.name&&cached?.source_name)source.name=clean(cached.source_name,180);
      if(!source.thumbnailUrl&&cached?.thumbnail_url)source.thumbnailUrl=clean(cached.thumbnail_url,1000);
      channelMeta.set(id,source);

      const successAt=Date.parse(String(cached?.last_success_at||cached?.checked_at||""));
      const rows=dedupeRows(Array.isArray(cached?.items)?cached.items:[])
        .map((row:any)=>normalizeRow(row,source)).filter(Boolean).slice(0,30);
      if(rows.length&&Number.isFinite(successAt)&&now-successAt<=CHANNEL_CACHE_MAX_AGE_MS){
        channelRows.set(id,rows);
      }
    }

    const checkedTime=(id:string)=>{
      const value=Date.parse(String(cacheById.get(id)?.checked_at||""));
      return Number.isFinite(value)?value:0;
    };
    const channelRecheckMs=(id:string)=>{
      const minutes=scopes
        .filter((scope)=>(selectedByScope.get(scope)||[]).some((source:any)=>source.id===id))
        .map((scope)=>Number(intervalByScope.get(scope))||10);
      const fastest=minutes.length?Math.min(...minutes):10;
      return Math.max(60*1000,fastest*60*1000);
    };
    const dueIds=neededIds
      .filter((id)=>{
        const cached=cacheById.get(id);
        const retry=Date.parse(String(cached?.retry_after||""));
        if(Number.isFinite(retry)&&retry>now)return false;
        const checked=checkedTime(id);
        return !checked||now-checked>=channelRecheckMs(id)||!channelRows.get(id)?.length;
      })
      .sort((a,b)=>checkedTime(a)-checkedTime(b))
      .slice(0,MAX_CHANNEL_FETCHES_PER_RUN);

    // Bound both request count and concurrency. Large tabs are refreshed in
    // rotation; uncached channels get priority on the next pass.
    await mapLimit(dueIds,3,async(id,index)=>{
      const source=channelMeta.get(id)||{id,name:"",thumbnailUrl:""};
      const previous=cacheById.get(id)||{};
      const previousRows=channelRows.get(id)||[];
      const checkedAt=new Date().toISOString();

      try{
        const url=supabaseUrl+"/functions/v1/yt1988?action=channel&id="+encodeURIComponent(id);
        const result=await fetchJson(url,{
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },7500);
        const data=result?.data||{};
        const raw=Array.isArray(data?.relatedStreams)
          ?data.relatedStreams
          :Array.isArray(data?.items)?data.items:[];
        const fresh=dedupeRows(
          raw.map((row:any)=>normalizeRow(row,source)).filter(Boolean)
        ).slice(0,30);

        if(!fresh.length)throw new Error("empty_channel_payload");

        const sourceName=clean(
          source?.name||
          fresh[0]?.uploaderName||
          fresh[0]?.uploader||
          fresh[0]?._sourceName||
          previous?.source_name||
          "",
          180
        );
        if(sourceName&&!source.name){
          source.name=sourceName;
          channelMeta.set(id,source);
        }

        channelRows.set(id,fresh);
        channelFetchOk.add(id);

        const newest=fresh
          .map((row:any)=>({id:videoId(row),age:ageMs(row)}))
          .filter((row:any)=>row.id&&Number.isFinite(row.age)&&row.age>=0&&row.age<Number.MAX_SAFE_INTEGER)
          .sort((a:any,b:any)=>a.age-b.age)[0]||null;

        const cacheHash=fastHash(fresh.map((row:any)=>[
          videoId(row),clean(row?.title,300),publishedText(row)
        ].join("|")).join("\n"));

        cacheWrites.push({
          profile_key:PROFILE,
          channel_id:id,
          items:fresh,
          hash:cacheHash,
          newest_video_id:newest?.id||"",
          newest_uploaded_at:newest?new Date(Date.now()-newest.age).toISOString():null,
          source_name:sourceName,
          thumbnail_url:clean(source?.thumbnailUrl||previous?.thumbnail_url||"",1000),
          checked_at:checkedAt,
          last_success_at:checkedAt,
          last_error:"",
          retry_after:null,
          version:Date.now()*100+index
        });
      }catch(error){
        console.warn("channel refresh failed",id,String(error));
        const message=clean(String((error as any)?.message||error||"channel_refresh_failed"),500);
        cacheWrites.push({
          profile_key:PROFILE,
          channel_id:id,
          items:previousRows,
          hash:clean(previous?.hash,100),
          newest_video_id:clean(previous?.newest_video_id,64),
          newest_uploaded_at:previous?.newest_uploaded_at||null,
          source_name:clean(source?.name||previous?.source_name||"",180),
          thumbnail_url:clean(source?.thumbnailUrl||previous?.thumbnail_url||"",1000),
          checked_at:checkedAt,
          last_success_at:previous?.last_success_at||null,
          last_error:message,
          retry_after:new Date(Date.now()+CHANNEL_FAILURE_RETRY_MS).toISOString(),
          version:Date.now()*100+index
        });
      }
      return true;
    });

    for(let start=0;start<cacheWrites.length;start+=20){
      const chunk=cacheWrites.slice(start,start+20);
      if(!chunk.length)continue;
      const writeRes=await fetch(
        rest+"/yt1988_channel_cache?on_conflict=profile_key,channel_id",
        {
          method:"POST",
          headers:{...authHeaders,"prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify(chunk)
        }
      );
      if(!writeRes.ok)console.warn("channel cache write failed",await writeRes.text());
    }

    const results:any[]=[];
    const degradedNotes:string[]=[];
    for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
      const scope=scopes[scopeIndex];
      const meta=SCOPE_META[scope]||{profile:"general",label:scope,kind:"content"};
      const selected=selectedByScope.get(scope)||[];
      const blocked=blockedByScope.get(scope)||new Set<string>();
      const selectedIds=new Set(selected.map((s:any)=>s.id));
      const current=currentByScope.get(scope);

      // Coverage is based on usable snapshots, not only requests from this run.
      // This is the key stale-while-revalidate guarantee: a temporary 429/503
      // reuses the previous good channel rows instead of deleting them.
      const usableChannels=selected.filter((s:any)=>(channelRows.get(s.id)||[]).length).length;
      const coverage=selected.length?usableChannels/selected.length:1;
      if(scope!=="live"&&selected.length&&coverage<.6){
        const reason="insufficient_channel_snapshots:"+usableChannels+"/"+selected.length;
        degradedNotes.push(scope+":"+reason);
        results.push({
          scope,
          changed:false,
          reason:"insufficient_channel_snapshots",
          usableChannels,
          selectedChannels:selected.length
        });
        continue;
      }

      const attempted=selected.filter((s:any)=>dueIds.includes(s.id)).length;
      const freshOk=selected.filter((s:any)=>channelFetchOk.has(s.id)).length;
      if(attempted>freshOk)degradedNotes.push(scope+":channel_errors="+(attempted-freshOk));

      let raw:any[]=[];

      for(const source of selected){
        for(const row of channelRows.get(source.id)||[]){
          if(blocked.has(source.id))continue;
          raw.push(row);
        }
      }

      if(scope==="live"){
        // LIVE is built only from candidates that were freshly verified above.
        // Never fall back to stale channel-cache live flags.
        raw=verifiedLiveRowsCache
          .filter((row:any)=>{
            const sid=channelId(row);
            return !sid||!allBlockedLiveSourceIds.has(sid);
          })
          .sort((a:any,b:any)=>
            (Number(b?._interestPriority)||0)-(Number(a?._interestPriority)||0)
          );
      }else if(scope==="latest"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<DAY_MS;
        });
      }else if(scope==="week"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=DAY_MS&&age<7*DAY_MS;
        });
      }else{
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<7*DAY_MS;
        });
      }

      if(meta.kind!=="live")raw=sortRows(raw);
      raw=dedupeRows(raw)
        .filter((r:any)=>meta.kind!=="content"||!strongAd(r));
      if(meta.kind!=="live")raw=raw.slice(0,90);

      if(meta.profile==="review"){
        raw=raw.map((r:any)=>{
          const title=reviewCleanTitle(r?._displayTitle||r?.title||"");
          return title&&title!==r?.title?{...r,_displayTitle:title}:r;
        });
      }

      const sig=sourceSignature(rows,scope);
      const policyKey=(meta.kind==="live"?LIVE_PIPELINE_VERSION:"server-scope-policy-v4")+":"+meta.profile;
      const rawHash=snapshotRowsHash(raw,sig);
      const inputHash=fastHash(rawHash+"|"+policyKey);
      if(current?.input_hash===inputHash&&current?.source_signature===sig){
        results.push({scope,changed:false,reason:"same_input"});
        continue;
      }

      let packaged=raw;
      if(meta.kind!=="live"&&raw.length>=4){
        try{
          const aiRes=await fetch(supabaseUrl+"/functions/v1/yt1988-topics",{
            method:"POST",
            headers:{
              ...authHeaders,
              "content-type":"application/json"
            },
            body:JSON.stringify({
              mode:"dedupe",
              scope,
              parentLabel:meta.label,
              contentProfile:meta.profile,
              reviewMode:meta.profile==="review",
              videos:raw.slice(0,120).map((r:any)=>({
                id:videoId(r),
                title:clean(r?.title,300),
                channel:clean(r?.uploaderName||r?.uploader||r?._sourceName,180),
                published:publishedText(r),
                views:Number(r?.views)||0,
                duration:Number(r?.duration)||0,
                description:clean(r?.description||r?.shortDescription||"",1200),
                contentHash:fastHash(normalizeText(r?._displayTitle||r?.title||""))
              }))
            })
          });
          const payload=await aiRes.json().catch(()=>null);
          if(aiRes.ok&&payload?.ok!==false){
            const allowed=new Set(raw.map(videoId));
            const keep=new Set(
              (Array.isArray(payload?.keepVideoIds)?payload.keepVideoIds:[])
                .map((id:any)=>clean(id,32)).filter((id:string)=>allowed.has(id))
            );
            const cleanup=new Map(
              (Array.isArray(payload?.cleanups)?payload.cleanups:[])
                .map((x:any)=>[clean(x?.id,32),clean(x?.displayTitle,180)])
                .filter(([id,title]:any)=>allowed.has(id)&&title.length>=8)
            );
            if(keep.size)packaged=raw.filter((r:any)=>keep.has(videoId(r)));
            packaged=packaged.map((r:any)=>{
              const title=cleanup.get(videoId(r));
              return title?{...r,_displayTitle:title}:r;
            });
          }
        }catch(error){
          console.warn("ai package failed",scope,String(error));
        }
      }

      packaged=dedupeRows(packaged).slice(0,90);
      if(!packaged.length&&scope!=="live"){
        results.push({scope,changed:false,reason:"empty_after_filter"});
        continue;
      }

      // Content tabs should never collapse from a recently healthy package to
      // a tiny partial package in a single refresh. Time feeds and LIVE are
      // intentionally excluded because their membership naturally changes fast.
      const currentItems=Array.isArray(current?.items)?current.items:[];
      const sameSelection=current?.source_signature===sig;
      const currentAt=Date.parse(String(current?.updated_at||""));
      const currentRecent=Number.isFinite(currentAt)&&Date.now()-currentAt<6*60*60*1000;
      if(meta.kind==="content"&&sameSelection&&currentRecent&&currentItems.length>=8){
        const currentSources=new Set(currentItems.map(channelId).filter(Boolean)).size;
        const nextSources=new Set(packaged.map(channelId).filter(Boolean)).size;
        const itemCollapse=packaged.length<Math.max(3,Math.floor(currentItems.length*.35));
        const sourceCollapse=currentSources>=4&&nextSources<Math.max(1,Math.floor(currentSources*.4));
        if(itemCollapse||sourceCollapse){
          const reason="catastrophic_package_shrink:"+currentItems.length+"->"+packaged.length+
            ",sources="+currentSources+"->"+nextSources;
          degradedNotes.push(scope+":"+reason);
          results.push({scope,changed:false,reason:"catastrophic_package_shrink",
            previousItems:currentItems.length,nextItems:packaged.length,
            previousSources:currentSources,nextSources});
          continue;
        }
      }

      const hash=snapshotRowsHash(packaged,sig);
      if(current?.hash===hash&&current?.input_hash===inputHash&&current?.source_signature===sig){
        results.push({scope,changed:false,reason:"same_package"});
        continue;
      }

      const version=Date.now()*100+scopeIndex;
      const rpc=await fetch(rest+"/rpc/yt1988_set_package",{
        method:"POST",
        headers:authHeaders,
        body:JSON.stringify({
          p_profile_key:PROFILE,
          p_scope:scope,
          p_hash:hash,
          p_input_hash:inputHash,
          p_source_signature:sig,
          p_items:packaged,
          p_version:version
        })
      });
      if(!rpc.ok)throw new Error("package_write_failed:"+scope+":"+await rpc.text());
      results.push({scope,changed:true,items:packaged.length,hash});
    }

    const degraded=degradedNotes.length>0;
    ok=true;
    const pending=await finishLease(
      rest,
      authHeaders,
      !degraded,
      degraded?degradedNotes.slice(0,12).join(";"):""
    );
    triggerFollowupRefresh(supabaseUrl,serviceKey,pending);
    return json({ok:true,degraded,pending_scopes:pending,scopes:results});
  }catch(error){
    failure=String((error as any)?.message||error||"refresh_failed");
    const pending=await finishLease(rest,authHeaders,false,failure);
    triggerFollowupRefresh(supabaseUrl,serviceKey,pending);
    return json({ok:false,error:failure,pending_scopes:pending},500);
  }
});