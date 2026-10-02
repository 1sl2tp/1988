const RENDER_API = "https://one988-tiktok-session.onrender.com";
const SNAPSHOT_KEY = "tiktok:live:snapshot";
const BATCH_SIZE = 45;
const LIVE_PRIORITY_MAX = 16;
const VIDEO_SOURCE_CACHE_SECONDS = 240;

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,range",
    "access-control-expose-headers": "content-length,content-range,accept-ranges,content-type,etag,last-modified,x-1988-media",
    "cache-control": "no-store"
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), "content-type": "application/json; charset=utf-8" }
  });
}
function normalizeHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._]{2,32}$/.test(handle) ? handle : "";
}
function canonicalMaterial(snapshot) {
  const rows = Object.entries(snapshot?.channels || {})
    .map(([handle, row]) => [handle, Number(row?.status || 0), String(row?.roomId || "")])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(rows);
}
async function loadSnapshot(env) {
  const row = await env.TIKTOK_LIVE.get(SNAPSHOT_KEY, "json").catch(() => null);
  return row && typeof row === "object"
    ? row
    : { version: 1, channels: {}, selected: [], changedAt: 0 };
}
async function selectedHandles() {
  const r = await fetch(RENDER_API + "/tiktok/live-statuses?t=" + Date.now(), {
    headers: { accept: "application/json" }
  });
  if (!r.ok) throw new Error("selected_http_" + r.status);
  const data = await r.json();
  return [...new Set(
    (Array.isArray(data?.items) ? data.items : [])
      .map((x) => normalizeHandle(x?.handle))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}
async function checkTikTok(handle) {
  const endpoint = new URL("https://www.tiktok.com/api-live/user/room");
  endpoint.searchParams.set("aid", "1988");
  endpoint.searchParams.set("sourceType", "54");
  endpoint.searchParams.set("uniqueId", handle);
  try {
    const r = await fetch(endpoint, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        accept: "application/json,text/plain,*/*",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
        referer: "https://www.tiktok.com/@" + handle + "/live"
      },
      redirect: "follow"
    });
    if (!r.ok) return { known: false, status: null, roomId: "", source: "http-" + r.status };
    const data = await r.json();
    const room = data?.data?.liveRoom || null;
    const status = Number(room?.status);
    const roomId = String(room?.id || room?.roomId || room?.room_id || "");
    if (status === 2) return { known: true, status: 2, roomId, source: "tiktok-user-room" };
    if (status === 4) return { known: true, status: 4, roomId, source: "tiktok-user-room" };
    if (!room && !roomId) {
      const code = Number(data?.statusCode);
      const message = String(data?.message || "").toLowerCase();
      if (code === 10001 || message.includes("service unavailable")) {
        return { known: false, status: null, roomId: "", source: "service-unavailable" };
      }
      return { known: true, status: 4, roomId: "", source: "tiktok-user-room-empty" };
    }
    return { known: false, status: Number.isFinite(status) ? status : null, roomId, source: "no-status" };
  } catch (error) {
    return { known: false, status: null, roomId: "", source: "fetch-error" };
  }
}
async function mapLimit(rows, limit, fn) {
  const out = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      out[i] = await fn(rows[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, rows.length || 1) }, () => worker()));
  return out;
}
async function sweep(env) {
  const selected = await selectedHandles();
  const selectedSet = new Set(selected.map((x) => x.toLowerCase()));
  const snapshot = await loadSnapshot(env);
  const previousMaterial = canonicalMaterial(snapshot);

  const nextChannels = {};
  for (const [rawHandle, row] of Object.entries(snapshot.channels || {})) {
    const handle = normalizeHandle(rawHandle);
    if (!handle || !selectedSet.has(handle.toLowerCase())) continue;
    nextChannels[handle.toLowerCase()] = {
      status: Number(row?.status || 0) || 0,
      roomId: String(row?.roomId || ""),
      changedAt: Number(row?.changedAt || 0),
      source: String(row?.source || "")
    };
  }

  const livePriority = selected
    .filter((h) => Number(nextChannels[h.toLowerCase()]?.status) === 2)
    .slice(0, LIVE_PRIORITY_MAX);

  const cold = selected.filter((h) => !livePriority.some((x) => x.toLowerCase() === h.toLowerCase()));
  const partitions = Math.max(1, Math.ceil(Math.max(1, cold.length) / Math.max(1, BATCH_SIZE - livePriority.length)));
  const minute = Math.floor(Date.now() / 60000);
  const slot = minute % partitions;
  const coldBatchSize = Math.max(1, BATCH_SIZE - livePriority.length);
  const coldStart = slot * coldBatchSize;
  const coldBatch = cold.slice(coldStart, coldStart + coldBatchSize);
  const targets = [...new Set([...livePriority, ...coldBatch])].slice(0, BATCH_SIZE);

  const results = await mapLimit(targets, 6, async (handle) => ({ handle, state: await checkTikTok(handle) }));
  let known = 0;
  let live = 0;
  let offline = 0;
  let unknown = 0;
  const now = Date.now();

  for (const { handle, state } of results) {
    const key = handle.toLowerCase();
    if (state?.known && (state.status === 2 || state.status === 4)) {
      known += 1;
      if (state.status === 2) live += 1;
      else offline += 1;
      const prev = nextChannels[key] || {};
      const changed = Number(prev.status || 0) !== state.status || String(prev.roomId || "") !== String(state.roomId || "");
      nextChannels[key] = {
        status: state.status,
        roomId: String(state.roomId || ""),
        changedAt: changed ? now : Number(prev.changedAt || 0),
        source: String(state.source || "tiktok-user-room")
      };
    } else {
      unknown += 1;
    }
  }

  for (const handle of selected) {
    const key = handle.toLowerCase();
    if (!nextChannels[key]) {
      nextChannels[key] = { status: 0, roomId: "", changedAt: 0, source: "waiting" };
    }
  }

  const next = {
    version: Number(snapshot.version || 0) + 1,
    selected,
    channels: nextChannels,
    changedAt: Number(snapshot.changedAt || 0),
    lastSweepAt: now,
    batch: { slot, partitions, checked: targets.length, known, live, offline, unknown }
  };

  const nextMaterial = canonicalMaterial(next);
  const selectedChanged = JSON.stringify(snapshot.selected || []) !== JSON.stringify(selected);
  const stateChanged = nextMaterial !== previousMaterial || selectedChanged;

  // KV Free writes are scarce. Persist only material state changes. Do not
  // write every minute just to update lastSweepAt.
  if (stateChanged) {
    next.changedAt = now;
    await env.TIKTOK_LIVE.put(SNAPSHOT_KEY, JSON.stringify(next));
  }

  return { ...next, persisted: stateChanged };
}
function normalizeLiveUrl(value) {
  let text=String(value||"").trim();
  if(!text)return "";
  for(let i=0;i<3;i++){
    const next=text
      .replace(/\\u0026/gi,"&")
      .replace(/\\u003d/gi,"=")
      .replace(/\\u002f/gi,"/")
      .replace(/\\\//g,"/");
    if(next===text)break;
    text=next;
  }
  try{text=decodeURIComponent(text)}catch{}
  return /^https?:\/\//i.test(text)?text:"";
}
function isFlvKey(key) {
  const k=String(key||"")
    .replace(/([a-z0-9])([A-Z])/g,"$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
  return new Set([
    "flv","flvurl","flvpull","flvpullurl",
    "pullflv","pullflvurl","streamflv","streamflvurl",
    "flvstream","flvstreamurl"
  ]).has(k);
}
function isHlsKey(key) {
  const k=String(key||"")
    .replace(/([a-z0-9])([A-Z])/g,"$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
  return /^(hls|hlsurl|hlspull|hlspullurl|pullhls|pullhlsurl|m3u8|m3u8url)$/.test(k);
}
function collectLiveMedia(value,out={flv:[],hls:[]},path="",depth=0) {
  if(value==null||depth>18)return out;

  if(typeof value==="string"){
    const raw=String(value||"").trim();
    if(
      (raw.startsWith("{")&&raw.endsWith("}"))||
      (raw.startsWith("[")&&raw.endsWith("]"))
    ){
      try{return collectLiveMedia(JSON.parse(raw),out,path,depth+1)}catch{}
    }

    const decoded=normalizeLiveUrl(raw);
    if(decoded){
      const p=path.toLowerCase();
      if(/\.flv(?:\?|$)/i.test(decoded)||/flv/.test(p)){
        if(!out.flv.includes(decoded))out.flv.push(decoded);
      }else if(/\.m3u8(?:\?|$)/i.test(decoded)||/hls|m3u8/.test(p)){
        if(!out.hls.includes(decoded))out.hls.push(decoded);
      }
    }
    return out;
  }

  if(Array.isArray(value)){
    for(let i=0;i<Math.min(value.length,80);i++){
      collectLiveMedia(value[i],out,path+"["+i+"]",depth+1);
    }
    return out;
  }

  if(typeof value==="object"){
    for(const [key,child] of Object.entries(value)){
      const p=path?path+"."+key:key;
      if(typeof child==="string"){
        const url=normalizeLiveUrl(child);
        if(url&&isFlvKey(key)&&!out.flv.includes(url))out.flv.push(url);
        if(url&&isHlsKey(key)&&!out.hls.includes(url))out.hls.push(url);
      }
      collectLiveMedia(child,out,p,depth+1);
    }
  }
  return out;
}
function liveMediaRank(url) {
  const u=String(url||"").toLowerCase();
  let score=0;
  if(/origin|full_hd|uhd|1080|_hd/.test(u))score+=40;
  if(/720|sd/.test(u))score+=20;
  if(/ld|360/.test(u))score-=10;
  return score;
}
function firstLiveAssetUrl(value,depth=0) {
  if(value==null||depth>8)return "";
  if(typeof value==="string")return normalizeLiveUrl(value);
  if(Array.isArray(value)){
    for(const item of value){
      const u=firstLiveAssetUrl(item,depth+1);
      if(u)return u;
    }
    return "";
  }
  if(typeof value==="object"){
    for(const key of ["url_list","urlList","urls","url","uri"]){
      if(value[key]!=null){
        const u=firstLiveAssetUrl(value[key],depth+1);
        if(u)return u;
      }
    }
    for(const child of Object.values(value)){
      const u=firstLiveAssetUrl(child,depth+1);
      if(u)return u;
    }
  }
  return "";
}
async function fetchTikTokLiveJson(url,handle) {
  const r=await fetch(url,{
    headers:{
      "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept":"application/json,text/plain,*/*",
      "accept-language":"vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
      "referer":"https://www.tiktok.com/@"+handle+"/live"
    },
    redirect:"follow",
    cf:{cacheTtl:0,cacheEverything:false}
  });
  if(!r.ok)return null;
  return r.json().catch(()=>null);
}
async function probeDirectLiveUrl(url,handle) {
  if(!url)return false;
  try{
    const r=await fetch(url,{
      method:"GET",
      headers:{
        "range":"bytes=0-65535",
        "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "referer":"https://www.tiktok.com/@"+handle+"/live",
        "accept":"*/*"
      },
      redirect:"follow",
      cf:{cacheTtl:0,cacheEverything:false}
    });
    const cors=String(r.headers.get("access-control-allow-origin")||"");
    try{await r.body?.cancel?.()}catch{}
    return (r.ok||r.status===206)&&(cors==="*"||cors==="https://yt.taphoa.xyz");
  }catch{
    return false;
  }
}
async function resolveTikTokLiveEdge(handle,roomIdHint="") {
  let roomId=String(roomIdHint||"");
  let room=null;
  let title="";
  let preview="";
  let avatar="";
  let viewerCount=0;
  let media={flv:[],hls:[]};

  const userRoom=new URL("https://www.tiktok.com/api-live/user/room");
  userRoom.searchParams.set("aid","1988");
  userRoom.searchParams.set("sourceType","54");
  userRoom.searchParams.set("uniqueId",handle);
  const userData=await fetchTikTokLiveJson(userRoom,handle);
  const userLiveRoom=userData?.data?.liveRoom||null;
  if(userLiveRoom){
    const status=Number(userLiveRoom?.status);
    if(status===4)return null;
    room=userLiveRoom;
    roomId=String(userLiveRoom?.roomId||userLiveRoom?.id||roomId||"");
    title=String(userLiveRoom?.title||"");
    preview=firstLiveAssetUrl(
      userLiveRoom?.cover||
      userLiveRoom?.roomCover||
      userLiveRoom?.room_cover||
      userLiveRoom?.background
    );
    avatar=firstLiveAssetUrl(
      userLiveRoom?.owner?.avatarLarger||
      userLiveRoom?.owner?.avatar_larger||
      userData?.data?.user?.avatarLarger||
      userData?.data?.user?.avatar_larger
    );
    viewerCount=Number(userLiveRoom?.userCount||userLiveRoom?.user_count||0);
    media=collectLiveMedia(userLiveRoom);
  }

  if(!media.flv.length&&!media.hls.length){
    const detail=new URL("https://www.tiktok.com/api/live/detail/");
    detail.searchParams.set("aid","1988");
    if(roomId)detail.searchParams.set("roomID",roomId);
    else detail.searchParams.set("uniqueId",handle);
    const detailData=await fetchTikTokLiveJson(detail,handle);
    const liveData=
      detailData?.LiveRoomInfo||
      detailData?.data?.LiveRoomInfo||
      detailData?.data?.liveRoomInfo||
      null;
    if(liveData){
      room=liveData;
      roomId=String(liveData?.liveRoomId||liveData?.roomId||liveData?.id||roomId||"");
      title=String(liveData?.title||title||"");
      preview=firstLiveAssetUrl(
        liveData?.cover||
        liveData?.roomCover||
        liveData?.room_cover||
        liveData?.background
      )||preview;
      avatar=firstLiveAssetUrl(
        liveData?.owner?.avatarLarger||
        liveData?.owner?.avatar_larger
      )||avatar;
      viewerCount=Number(liveData?.userCount||viewerCount||0);
      media=collectLiveMedia(liveData);
    }
  }

  if(!media.flv.length&&!media.hls.length&&roomId){
    const info=new URL("https://webcast.tiktok.com/webcast/room/info");
    info.searchParams.set("aid","1988");
    info.searchParams.set("room_id",roomId);
    const infoData=await fetchTikTokLiveJson(info,handle);
    const infoRoom=infoData?.data||infoData?.room||null;
    if(infoRoom){
      room=infoRoom;
      title=String(infoRoom?.title||title||"");
      preview=firstLiveAssetUrl(
        infoRoom?.cover||
        infoRoom?.roomCover||
        infoRoom?.room_cover||
        infoRoom?.background
      )||preview;
      avatar=firstLiveAssetUrl(
        infoRoom?.owner?.avatarLarger||
        infoRoom?.owner?.avatar_larger
      )||avatar;
      viewerCount=Number(infoRoom?.userCount||infoRoom?.user_count||viewerCount||0);
      media=collectLiveMedia(infoRoom);
    }
  }

  const flv=[...media.flv].sort((a,b)=>liveMediaRank(b)-liveMediaRank(a));
  const hls=[...media.hls].sort((a,b)=>liveMediaRank(b)-liveMediaRank(a));

  let streamUrl="";
  for(const candidate of flv.slice(0,4)){
    if(await probeDirectLiveUrl(candidate,handle)){
      streamUrl=candidate;
      break;
    }
  }

  let hlsUrl="";
  if(!streamUrl){
    for(const candidate of hls.slice(0,3)){
      if(await probeDirectLiveUrl(candidate,handle)){
        hlsUrl=candidate;
        break;
      }
    }
  }

  if(!streamUrl&&!hlsUrl)return null;
  return {
    handle,
    live:true,
    detectedLive:true,
    edgeConfirmed:true,
    playable:true,
    roomId,
    title:title||("@"+handle+" · LIVE"),
    preview,
    cover:preview,
    avatar,
    viewerCount,
    type:streamUrl?"flv":"hls",
    streamUrl,
    hlsUrl,
    sourceSig:"cloudflare-tiktok-direct",
    source:"cloudflare-tiktok-direct",
    status:"live",
    probeState:"live",
    width:0,
    height:0,
    lastSeenAt:Date.now()
  };
}
async function liveNow(env) {
  const snapshot=await loadSnapshot(env);
  const liveRows=Object.entries(snapshot.channels||{})
    .filter(([,row])=>Number(row?.status)===2)
    .map(([handle,row])=>({handle,roomId:String(row?.roomId||"")}))
    .sort((a,b)=>a.handle.localeCompare(b.handle));

  if(!liveRows.length){
    return {
      ok:true,
      edge:true,
      realtime:true,
      checkedAt:Number(snapshot.lastSweepAt||snapshot.changedAt||0),
      total:Array.isArray(snapshot.selected)?snapshot.selected.length:0,
      live:0,
      items:[]
    };
  }

  const resolved=await mapLimit(liveRows,3,async row=>
    resolveTikTokLiveEdge(row.handle,row.roomId).catch(()=>null)
  );
  const items=resolved.filter(Boolean);

  return {
    ok:true,
    edge:true,
    realtime:true,
    checkedAt:Date.now(),
    total:Array.isArray(snapshot.selected)?snapshot.selected.length:0,
    live:items.length,
    detectedLive:liveRows.length,
    items
  };
}

function normalizeVideoId(value) {
  const id = String(value || "").trim();
  return /^\d{8,}$/.test(id) ? id : "";
}
function videoSourceCacheKey(handle, id) {
  return new Request(
    "https://1988-edge-cache.invalid/tiktok/video-source?user=" +
      encodeURIComponent(handle.toLowerCase()) +
      "&id=" + encodeURIComponent(id)
  );
}
async function resolveTikTokVideoSourceEdge(handle, id, { refresh = false } = {}) {
  const cache = caches.default;
  const cacheKey = videoSourceCacheKey(handle, id);

  if (!refresh) {
    const cached = await cache.match(cacheKey).catch(() => null);
    if (cached) {
      const data = await cached.json().catch(() => null);
      if (data?.directUrl) return data;
    }
  }

  const endpoint = new URL(RENDER_API + "/tiktok/video-source");
  endpoint.searchParams.set("user", handle);
  endpoint.searchParams.set("id", id);
  if (refresh) endpoint.searchParams.set("refresh", "1");

  const r = await fetch(endpoint, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!r.ok) throw new Error("resolver_http_" + r.status);

  const data = await r.json();
  if (!data?.ok || !data?.directUrl) throw new Error("resolver_no_direct_url");

  const safe = {
    handle: normalizeHandle(data.handle || handle) || handle,
    id: normalizeVideoId(data.id || id) || id,
    directUrl: String(data.directUrl || ""),
    expiresAt: String(data.expiresAt || ""),
    relayHeaders:
      data.relayHeaders && typeof data.relayHeaders === "object"
        ? data.relayHeaders
        : {}
  };

  const ttlResponse = new Response(JSON.stringify(safe), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public,max-age=" + VIDEO_SOURCE_CACHE_SECONDS
    }
  });
  await cache.put(cacheKey, ttlResponse).catch(() => {});
  return safe;
}
function copyMediaHeader(from, to, name) {
  const value = from.get(name);
  if (value) to.set(name, value);
}
async function resolveTikwmVideoSource(handle, id) {
  const cache = caches.default;
  const cacheKey = new Request(
    "https://1988-edge-cache.invalid/tikwm/video-source?user=" +
      encodeURIComponent(handle.toLowerCase()) +
      "&id=" + encodeURIComponent(id)
  );

  const cached = await cache.match(cacheKey).catch(() => null);
  if (cached) {
    const row = await cached.json().catch(() => null);
    if (row?.url) return row;
  }

  const pageUrl = "https://www.tiktok.com/@" + handle + "/video/" + id;
  const api = new URL("https://www.tikwm.com/api/");
  api.searchParams.set("url", pageUrl);

  const r = await fetch(api, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
      "accept": "application/json,text/plain,*/*",
      "referer": "https://www.tikwm.com/"
    },
    redirect: "follow",
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!r.ok) throw new Error("tikwm_api_http_" + r.status);

  const data = await r.json();
  const body = data?.data || {};
  let mediaUrl = String(body.play || body.wmplay || body.hdplay || "").trim();
  if (!mediaUrl) throw new Error("tikwm_no_media_url");
  if (mediaUrl.startsWith("//")) mediaUrl = "https:" + mediaUrl;
  else if (mediaUrl.startsWith("/")) mediaUrl = "https://www.tikwm.com" + mediaUrl;

  const row = { url: mediaUrl, source: "tikwm" };
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(row), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public,max-age=300"
      }
    })
  ).catch(() => {});
  return row;
}

async function redirectTikTokVideoDirect(request) {
  const url=new URL(request.url);
  const handle=normalizeHandle(url.searchParams.get("user")||"");
  const id=normalizeVideoId(url.searchParams.get("id")||"");
  if(!handle||!id)return json({ok:false,error:"invalid_tiktok_video"},400);

  try{
    const source=await resolveTikwmVideoSource(handle,id);
    const target=String(source?.url||"").trim();
    if(!/^https?:\/\//i.test(target))throw new Error("tikwm_no_media_url");
    // 302 only: the browser follows the TikWM URL and downloads the MP4
    // directly. Cloudflare does not carry the video body.
    return new Response(null,{
      status:302,
      headers:{
        ...cors(),
        "location":target,
        "cache-control":"private,max-age=240",
        "x-1988-media":"redirect-tikwm-direct"
      }
    });
  }catch(error){
    return json({ok:false,error:String(error?.message||error||"tikwm_resolve_failed")},502);
  }
}

async function fetchTikTokMediaTarget(targetUrl, request, extraHeaders = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(extraHeaders || {})) {
    const key = String(name || "").toLowerCase();
    if (!["user-agent", "referer", "origin", "accept", "accept-language"].includes(key)) continue;
    if (value) headers.set(key, String(value));
  }
  if (!headers.has("user-agent")) {
    headers.set(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36"
    );
  }
  if (!headers.has("accept")) headers.set("accept", "*/*");
  const range = request.headers.get("range") || "";
  if (range) headers.set("range", range);

  return fetch(targetUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "follow",
    cf: { cacheTtl: 0, cacheEverything: false }
  });
}

function mediaRelayResponse(upstream, method, sourceLabel) {
  const out = new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "range",
    "access-control-expose-headers":
      "content-length,content-range,accept-ranges,content-type,etag,last-modified,x-1988-media",
    "cache-control": "no-store",
    "x-1988-media": sourceLabel
  });
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified"
  ]) copyMediaHeader(upstream.headers, out, name);
  if (!out.has("content-type")) out.set("content-type", "video/mp4");
  if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: out
  });
}

async function relayTikTokVideo(request) {
  const url = new URL(request.url);
  const handle = normalizeHandle(url.searchParams.get("user") || "");
  const id = normalizeVideoId(url.searchParams.get("id") || "");
  if (!handle || !id) return json({ ok: false, error: "invalid_tiktok_video" }, 400);

  const method = request.method === "HEAD" ? "HEAD" : "GET";

  // 1) Prefer TikWM's browser-friendly MP4 URL. This keeps media bytes off Render
  // and avoids TikTok signed-CDN 403s from Cloudflare data-center IPs.
  try {
    const source = await resolveTikwmVideoSource(handle, id);
    const upstream = await fetchTikTokMediaTarget(source.url, request, {
      referer: "https://www.tikwm.com/",
      accept: "*/*"
    });
    if (upstream.ok && (upstream.body || method === "HEAD")) {
      return mediaRelayResponse(upstream, method, "cloudflare-tikwm");
    }
  } catch (error) {
    // Continue to the direct TikTok source path below.
  }

  // 2) Fallback to Render only as a tiny source resolver. Render returns metadata
  // (signed URL + safe headers), never the MP4 byte stream.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let source;
    try {
      source = await resolveTikTokVideoSourceEdge(handle, id, { refresh: attempt === 1 });
    } catch (error) {
      if (attempt === 0) continue;
      return json({ ok: false, error: String(error?.message || error) }, 502);
    }

    const upstream = await fetchTikTokMediaTarget(source.directUrl, request, source.relayHeaders || {});
    lastStatus = upstream.status;

    if ([401, 403, 410].includes(upstream.status) && attempt === 0) continue;
    if (upstream.ok && (upstream.body || method === "HEAD")) {
      return mediaRelayResponse(upstream, method, "cloudflare-direct-tiktok");
    }
  }

  return json({ ok: false, error: "tiktok_upstream_" + lastStatus, edge: true }, 502);
}

async function refreshOne(env, rawHandle) {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return json({ ok: false, error: "invalid_tiktok_handle" }, 400);
  const state = await checkTikTok(handle);
  const snapshot = await loadSnapshot(env);
  if (state.known && (state.status === 2 || state.status === 4)) {
    const key = handle.toLowerCase();
    const prev = snapshot.channels?.[key] || {};
    const changed = Number(prev.status || 0) !== state.status || String(prev.roomId || "") !== String(state.roomId || "");
    if (changed) {
      snapshot.channels = { ...(snapshot.channels || {}) };
      snapshot.channels[key] = {
        status: state.status,
        roomId: String(state.roomId || ""),
        changedAt: Date.now(),
        source: String(state.source || "tiktok-user-room")
      };
      snapshot.changedAt = Date.now();
      snapshot.version = Number(snapshot.version || 0) + 1;
      await env.TIKTOK_LIVE.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  }
  return json({ ok: true, handle, ...state, checkedAt: Date.now() });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "1988-tiktok-live-state" });
    if (url.pathname === "/state") return json({ ok: true, ...(await loadSnapshot(env)) });
    if (url.pathname === "/tiktok/live-now") return json(await liveNow(env));
    if (url.pathname === "/tiktok/video-direct" &&
        (request.method === "GET" || request.method === "HEAD"))
      return redirectTikTokVideoDirect(request);

    if (url.pathname === "/tiktok/video-stream" && (request.method === "GET" || request.method === "HEAD")) {
      return relayTikTokVideo(request);
    }
    if (url.pathname === "/refresh") return refreshOne(env, url.searchParams.get("user") || "");
    if (url.pathname === "/sweep") return json({ ok: true, ...(await sweep(env)) });
    return json({ ok: false, error: "not_found" }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sweep(env).catch((error) => console.error("tiktok sweep failed", error)));
  }
};
