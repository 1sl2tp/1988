const RENDER_API = "https://one988-tiktok-session.onrender.com";
const SNAPSHOT_KEY = "tiktok:live:snapshot";
const VIDEO_SNAPSHOT_KEY = "tiktok:video:fingerprint";
const BATCH_SIZE = 40;
const LIVE_PRIORITY_MAX = 16;
const VIDEO_BATCH_SIZE = 6;
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
async function selectedChannels() {
  const r = await fetch(RENDER_API + "/tiktok/live-statuses?t=" + Date.now(), {
    headers: { accept: "application/json" }
  });
  if (!r.ok) throw new Error("selected_http_" + r.status);
  const data = await r.json();
  const byHandle = new Map();
  for (const row of Array.isArray(data?.items) ? data.items : []) {
    const handle = normalizeHandle(row?.handle);
    if (!handle) continue;
    byHandle.set(handle.toLowerCase(), {
      handle,
      secUid: String(row?.secUid || "").trim(),
      latestVideoId: normalizeVideoId(row?.latestVideoId || "")
    });
  }
  return [...byHandle.values()].sort((a, b) => a.handle.localeCompare(b.handle));
}
async function loadVideoSnapshot(env) {
  const row = await env.TIKTOK_LIVE.get(VIDEO_SNAPSHOT_KEY, "json").catch(() => null);
  return row && typeof row === "object"
    ? row
    : { version: 1, channels: {}, selected: [], pending: [], changedAt: 0 };
}
function videoFingerprintMaterial(snapshot) {
  return JSON.stringify(
    Object.entries(snapshot?.channels || {})
      .map(([handle, row]) => [handle, normalizeVideoId(row?.latestVideoId || "")])
      .sort((a, b) => a[0].localeCompare(b[0]))
  );
}
async function checkTikTokVideoFingerprint(channel) {
  const handle = normalizeHandle(channel?.handle);
  const secUid = String(channel?.secUid || "").trim();
  if (!handle || !secUid) {
    return { known: false, handle, latestVideoId: "", source: "missing-secuid" };
  }
  const endpoint = new URL("https://www.tiktok.com/api/post/item_list/");
  endpoint.searchParams.set("aid", "1988");
  endpoint.searchParams.set("count", "1");
  endpoint.searchParams.set("cursor", "0");
  endpoint.searchParams.set("from_page", "user");
  endpoint.searchParams.set("secUid", secUid);
  try {
    const r = await fetch(endpoint, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
        accept: "application/json,text/plain,*/*",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
        referer: "https://www.tiktok.com/@" + handle
      },
      redirect: "follow"
    });
    if (!r.ok) return { known: false, handle, latestVideoId: "", source: "http-" + r.status };
    const body = await r.json().catch(() => null);
    const items =
      (Array.isArray(body?.itemList) && body.itemList) ||
      (Array.isArray(body?.item_list) && body.item_list) ||
      (Array.isArray(body?.data?.itemList) && body.data.itemList) ||
      (Array.isArray(body?.data?.item_list) && body.data.item_list) ||
      (Array.isArray(body?.items) && body.items) ||
      null;
    if (!Array.isArray(items)) {
      return { known: false, handle, latestVideoId: "", source: "no-items" };
    }
    const latestVideoId = items
      .map((row) => normalizeVideoId(row?.id || row?.video_id || row?.aweme_id || ""))
      .find(Boolean) || "";
    return { known: true, handle, latestVideoId, source: "tiktok-post-item-list" };
  } catch {
    return { known: false, handle, latestVideoId: "", source: "fetch-error" };
  }
}
async function wakeRenderVideoRefresh(handle) {
  const endpoint = new URL(RENDER_API + "/tiktok/channel-videos");
  endpoint.searchParams.set("user", handle);
  endpoint.searchParams.set("refresh", "1");
  endpoint.searchParams.set("full", "1");
  const r = await fetch(endpoint, { headers: { accept: "application/json" } });
  try { await r.body?.cancel?.(); } catch {}
  return r.ok;
}
async function videoFingerprintSweep(env, selectedRows) {
  const selected = (Array.isArray(selectedRows) ? selectedRows : [])
    .filter((row) => normalizeHandle(row?.handle) && String(row?.secUid || "").trim());
  const selectedNames = selected.map((row) => row.handle.toLowerCase()).sort();
  const selectedSet = new Set(selectedNames);
  const snapshot = await loadVideoSnapshot(env);
  const previousMaterial = videoFingerprintMaterial(snapshot);
  const nextChannels = {};

  for (const [rawHandle, row] of Object.entries(snapshot.channels || {})) {
    const handle = normalizeHandle(rawHandle);
    if (!handle || !selectedSet.has(handle.toLowerCase())) continue;
    nextChannels[handle.toLowerCase()] = {
      latestVideoId: normalizeVideoId(row?.latestVideoId || "")
    };
  }

  // Render contributes only the already-saved baseline. It does not scan.
  for (const row of selected) {
    const key = row.handle.toLowerCase();
    const saved = normalizeVideoId(row.latestVideoId || "");
    if (!nextChannels[key]) nextChannels[key] = { latestVideoId: saved };
  }

  const partitions = Math.max(1, Math.ceil(Math.max(1, selected.length) / VIDEO_BATCH_SIZE));
  const minute = Math.floor(Date.now() / 60000);
  const slot = minute % partitions;
  const start = slot * VIDEO_BATCH_SIZE;
  const targets = selected.slice(start, start + VIDEO_BATCH_SIZE);
  const results = await mapLimit(targets, 3, async (channel) => checkTikTokVideoFingerprint(channel));

  let known = 0;
  let unknown = 0;
  let seeded = 0;
  let changed = 0;
  const pending = new Set(
    (Array.isArray(snapshot.pending) ? snapshot.pending : [])
      .map(normalizeHandle)
      .filter((handle) => handle && selectedSet.has(handle.toLowerCase()))
  );

  for (const result of results) {
    const handle = normalizeHandle(result?.handle);
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (!result?.known) {
      unknown += 1;
      continue;
    }
    known += 1;
    const latest = normalizeVideoId(result.latestVideoId || "");
    if (!latest) continue;
    const previous = normalizeVideoId(nextChannels[key]?.latestVideoId || "");
    if (!previous) {
      // First observation is only a baseline. This intentionally does not
      // backfill old/missing channels.
      nextChannels[key] = { latestVideoId: latest };
      seeded += 1;
      continue;
    }
    if (latest !== previous) {
      nextChannels[key] = { latestVideoId: latest };
      pending.add(handle);
      changed += 1;
    }
  }

  // Wake at most one channel per minute. This keeps the scheduled Worker below
  // the Free-plan subrequest ceiling even if several channels post at once.
  let woke = "";
  const nextWake = [...pending][0] || "";
  if (nextWake) {
    const ok = await wakeRenderVideoRefresh(nextWake).catch(() => false);
    if (ok) {
      pending.delete(nextWake);
      woke = nextWake;
    }
  }

  const next = {
    version: Number(snapshot.version || 0) + 1,
    selected: selectedNames,
    channels: nextChannels,
    pending: [...pending],
    changedAt: Number(snapshot.changedAt || 0),
    batch: { slot, partitions, checked: targets.length, known, unknown, seeded, changed, woke }
  };
  const materialChanged =
    videoFingerprintMaterial(next) !== previousMaterial ||
    JSON.stringify(snapshot.selected || []) !== JSON.stringify(selectedNames) ||
    JSON.stringify(snapshot.pending || []) !== JSON.stringify(next.pending);

  if (materialChanged) {
    next.changedAt = Date.now();
    await env.TIKTOK_LIVE.put(VIDEO_SNAPSHOT_KEY, JSON.stringify(next));
  }
  return { ...next.batch, pending: next.pending.length, persisted: materialChanged };
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
  const selectedRows = await selectedChannels();
  const selected = selectedRows.map((row) => row.handle);
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

  const video = await videoFingerprintSweep(env, selectedRows);
  return { ...next, persisted: stateChanged, video };
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
function liveText(value){
  return String(value==null?"":value).replace(/\s+/g," ").trim();
}
function liveComparable(value){
  return liveText(value)
    .toLowerCase()
    .replace(/^@/,"")
    .replace(/[·|｜•]+/g," ")
    .replace(/\blive\b|\btrực tiếp\b/g,"")
    .replace(/[^a-z0-9._\p{L}\p{N}]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
}
function liveSourceName(room,handle=""){
  return liveText(
    room?.owner?.nickname||
    room?.owner?.displayName||
    room?.owner?.display_name||
    room?.user?.nickname||
    room?.user?.displayName||
    room?.user?.display_name||
    room?.nickname||
    room?.displayName||
    room?.display_name||
    ""
  );
}
function liveTitleFromRoom(room,handle="",sourceName=""){
  const candidates=[
    room?.title,
    room?.roomTitle,
    room?.room_title,
    room?.liveRoomTitle,
    room?.live_room_title,
    room?.liveTitle,
    room?.live_title,
    room?.eventTitle,
    room?.event_title,
    room?.contentTitle,
    room?.content_title,
    room?.roomInfo?.title,
    room?.room_info?.title
  ].map(liveText).filter(Boolean);

  const handleKey=liveComparable(handle);
  const sourceKey=liveComparable(sourceName);
  for(const candidate of candidates){
    const key=liveComparable(candidate);
    if(!key)continue;
    if(key===handleKey||key===sourceKey)continue;
    return candidate;
  }
  return "";
}
function parseLiveViewerCount(value){
  if(typeof value==="number"){
    return Number.isFinite(value)&&value>0?Math.round(value):0;
  }
  let text=liveText(value).toLowerCase();
  if(!text)return 0;
  text=text
    .replace(/người đang xem|đang xem|viewers?|watching|online/gi,"")
    .replace(/,/g,"")
    .trim();
  const m=text.match(/([0-9]+(?:\.[0-9]+)?)\s*([kmb])?/i);
  if(!m)return 0;
  let n=Number(m[1]);
  if(!Number.isFinite(n)||n<=0)return 0;
  const unit=String(m[2]||"").toLowerCase();
  if(unit==="k")n*=1e3;
  else if(unit==="m")n*=1e6;
  else if(unit==="b")n*=1e9;
  return Math.round(n);
}
function liveViewerCountFromRoom(room){
  const candidates=[
    room?.userCount,
    room?.user_count,
    room?.viewerCount,
    room?.viewer_count,
    room?.watchingCount,
    room?.watching_count,
    room?.liveUserCount,
    room?.live_user_count,
    room?.stats?.userCount,
    room?.stats?.user_count,
    room?.stats?.viewerCount,
    room?.stats?.viewer_count,
    room?.roomStats?.userCount,
    room?.roomStats?.user_count,
    room?.room_stats?.user_count,
    room?.liveRoomStats?.userCount,
    room?.liveRoomStats?.user_count,
    room?.live_room_stats?.userCount,
    room?.live_room_stats?.user_count,
    room?.liveRoomStats?.enterCount,
    room?.liveRoomStats?.enter_count,
    room?.roomViewStats?.displayValue,
    room?.roomViewStats?.display_value,
    room?.room_view_stats?.displayValue,
    room?.room_view_stats?.display_value,
    room?.roomViewStats?.displayShort,
    room?.roomViewStats?.display_short,
    room?.room_view_stats?.display_short
  ];
  for(const value of candidates){
    const n=parseLiveViewerCount(value);
    if(n>0)return n;
  }
  return 0;
}

function liveCoverFromRoom(room){
  const candidates=[
    room?.cover,
    room?.roomCover,
    room?.room_cover,
    room?.liveCover,
    room?.live_cover,
    room?.background,
    room?.backgroundImage,
    room?.background_image,
    room?.coverUrl,
    room?.cover_url,
    room?.roomInfo?.cover,
    room?.room_info?.cover,
    room?.owner?.roomCover,
    room?.owner?.room_cover,
    room?.owner?.liveCover,
    room?.owner?.live_cover
  ];
  for(const value of candidates){
    const url=firstLiveAssetUrl(value);
    if(url)return url;
  }
  return "";
}
function liveAvatarFromRoom(room){
  return firstLiveAssetUrl(
    room?.owner?.avatarLarger||
    room?.owner?.avatar_larger||
    room?.owner?.avatarMedium||
    room?.owner?.avatar_medium||
    room?.owner?.avatarThumb||
    room?.owner?.avatar_thumb||
    room?.user?.avatarLarger||
    room?.user?.avatar_larger||
    room?.user?.avatarMedium||
    room?.user?.avatar_medium
  );
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
  let sourceName="";
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
    sourceName=
      liveSourceName(userLiveRoom,handle)||
      liveSourceName(userData?.data?.user||{},handle);
    title=liveTitleFromRoom(userLiveRoom,handle,sourceName);
    preview=liveCoverFromRoom(userLiveRoom);
    avatar=liveAvatarFromRoom(userLiveRoom)||
      liveAvatarFromRoom(userData?.data?.user||{})||
      firstLiveAssetUrl(
        userData?.data?.user?.avatarLarger||
        userData?.data?.user?.avatar_larger||
        userData?.data?.user?.avatarMedium||
        userData?.data?.user?.avatar_medium
      );
    viewerCount=
      liveViewerCountFromRoom(userLiveRoom)||
      liveViewerCountFromRoom(userData?.data?.liveRoomStats||{})||
      liveViewerCountFromRoom(userData?.data?.live_room_stats||{});
    media=collectLiveMedia(userLiveRoom);
  }

  if(
    !media.flv.length&&!media.hls.length||
    !preview||!title||!viewerCount||!sourceName
  ){
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
      sourceName=liveSourceName(liveData,handle)||sourceName;
      title=liveTitleFromRoom(liveData,handle,sourceName)||title;
      preview=liveCoverFromRoom(liveData)||preview;
      avatar=liveAvatarFromRoom(liveData)||avatar;
      viewerCount=
        liveViewerCountFromRoom(liveData)||
        liveViewerCountFromRoom(detailData?.LiveRoomStats||{})||
        liveViewerCountFromRoom(detailData?.liveRoomStats||{})||
        liveViewerCountFromRoom(detailData?.data?.LiveRoomStats||{})||
        liveViewerCountFromRoom(detailData?.data?.liveRoomStats||{})||
        viewerCount;
      const detailMedia=collectLiveMedia(liveData);
      media={
        flv:[...new Set([...(media.flv||[]),...(detailMedia.flv||[])])],
        hls:[...new Set([...(media.hls||[]),...(detailMedia.hls||[])])]
      };
    }
  }

  if(
    roomId&&(
      !media.flv.length&&!media.hls.length||
      !preview||!title||!viewerCount||!sourceName
    )
  ){
    const info=new URL("https://webcast.tiktok.com/webcast/room/info");
    info.searchParams.set("aid","1988");
    info.searchParams.set("room_id",roomId);
    const infoData=await fetchTikTokLiveJson(info,handle);
    const infoRoom=infoData?.data||infoData?.room||null;
    if(infoRoom){
      room=infoRoom;
      sourceName=liveSourceName(infoRoom,handle)||sourceName;
      title=liveTitleFromRoom(infoRoom,handle,sourceName)||title;
      preview=liveCoverFromRoom(infoRoom)||preview;
      avatar=liveAvatarFromRoom(infoRoom)||avatar;
      viewerCount=liveViewerCountFromRoom(infoRoom)||viewerCount;
      const infoMedia=collectLiveMedia(infoRoom);
      media={
        flv:[...new Set([...(media.flv||[]),...(infoMedia.flv||[])])],
        hls:[...new Set([...(media.hls||[]),...(infoMedia.hls||[])])]
      };
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
    title:title||"Đang trực tiếp",
    sourceName:sourceName||("@"+handle),
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
async function resolveTikwmVideoSource(handle, id, { refresh = false } = {}) {
  const cache = caches.default;
  const cacheKey = new Request(
    "https://1988-edge-cache.invalid/tikwm/video-source?user=" +
      encodeURIComponent(handle.toLowerCase()) +
      "&id=" + encodeURIComponent(id)
  );

  if (!refresh) {
    const cached = await cache.match(cacheKey).catch(() => null);
    if (cached) {
      const row = await cached.json().catch(() => null);
      if (row?.url) return row;
    }
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

async function resolveTdownVideoSource(handle, id, { refresh = false } = {}) {
  const cache = caches.default;
  const cacheKey = new Request(
    "https://1988-edge-cache.invalid/tdown/video-source?user=" +
      encodeURIComponent(handle.toLowerCase()) +
      "&id=" + encodeURIComponent(id)
  );

  if (!refresh) {
    const cached = await cache.match(cacheKey).catch(() => null);
    if (cached) {
      const row = await cached.json().catch(() => null);
      if (row?.url) return row;
    }
  }

  const pageUrl = "https://www.tiktok.com/@" + handle + "/video/" + id;
  const api = new URL("https://tdownv4.sl-bjs.workers.dev/");
  api.searchParams.set("down", pageUrl);

  const r = await fetch(api, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
      "accept": "application/json,text/plain,*/*"
    },
    redirect: "follow",
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!r.ok) throw new Error("tdown_api_http_" + r.status);

  const data = await r.json();
  let mediaUrl = String(
    data?.download_url ||
    data?.downloadUrl ||
    data?.video?.download_url ||
    data?.data?.download_url ||
    ""
  ).trim();
  if (!mediaUrl) throw new Error("tdown_no_media_url");
  if (mediaUrl.startsWith("//")) mediaUrl = "https:" + mediaUrl;

  const row = { url: mediaUrl, source: "tdownv4" };
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(row), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public,max-age=180"
      }
    })
  ).catch(() => {});
  return row;
}

async function resolveVodSourceByName(name, handle, id, { refresh = false } = {}) {
  if (name === "tdown") {
    const source = await resolveTdownVideoSource(handle, id, { refresh });
    return {
      name: "tdown",
      url: String(source.url || ""),
      headers: { accept: "*/*" }
    };
  }
  if (name === "direct") {
    const source = await resolveTikTokVideoSourceEdge(handle, id, { refresh });
    return {
      name: "direct",
      url: String(source.directUrl || ""),
      headers: source.relayHeaders || {}
    };
  }
  const source = await resolveTikwmVideoSource(handle, id, { refresh });
  return {
    name: "tikwm",
    url: String(source.url || ""),
    headers: { referer: "https://www.tikwm.com/", accept: "*/*" }
  };
}

function vodSourceOrder(preferred = "") {
  if (preferred === "tdown") return ["tdown", "tikwm"];
  if (preferred === "direct") return ["direct", "tikwm", "tdown"];
  return ["tikwm", "tdown"];
}

function vodWarmCacheKey(handle,id) {
  return new Request(
    "https://1988-edge-cache.invalid/tiktok/vod-warm?user=" +
      encodeURIComponent(handle.toLowerCase()) +
      "&id=" + encodeURIComponent(id)
  );
}

async function readVodWarmPreference(handle,id) {
  const hit=await caches.default.match(vodWarmCacheKey(handle,id)).catch(()=>null);
  if(!hit)return "";
  const row=await hit.json().catch(()=>null);
  return ["tikwm","tdown"].includes(String(row?.preferred||""))?String(row.preferred):"";
}

async function probeVodSource(source,handle) {
  const started=Date.now();
  try{
    const headers=new Headers(source.headers||{});
    headers.set("range","bytes=0-1");
    if(!headers.has("user-agent")){
      headers.set(
        "user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36"
      );
    }
    headers.set("accept","*/*");
    const r=await fetch(source.url,{
      method:"GET",
      headers,
      redirect:"follow",
      cf:{cacheTtl:0,cacheEverything:false}
    });
    const ok=r.ok||r.status===206;
    try{await r.body?.cancel?.()}catch{}
    return {
      ok,
      name:source.name,
      ms:Date.now()-started,
      status:r.status
    };
  }catch(error){
    return {
      ok:false,
      name:source.name,
      ms:Date.now()-started,
      status:0,
      error:String(error?.message||error||"probe_failed")
    };
  }
}

async function warmTikTokVod(request) {
  const url=new URL(request.url);
  const handle=normalizeHandle(url.searchParams.get("user")||"");
  const id=normalizeVideoId(url.searchParams.get("id")||"");
  if(!handle||!id)return json({ok:false,error:"invalid_tiktok_video"},400);

  const existing=await readVodWarmPreference(handle,id);
  if(existing){
    const names=existing==="tdown"?["tdown","tikwm"]:["tikwm","tdown"];
    const sources=[];
    for(const name of names){
      try{
        const source=await resolveVodSourceByName(name,handle,id);
        if(/^https?:\/\//i.test(String(source?.url||""))){
          sources.push({name,url:String(source.url||"")});
        }
      }catch{}
    }
    return json({ok:true,warm:true,cached:true,preferred:existing,sources});
  }

  const names=["tikwm","tdown"];
  const checks=await Promise.all(names.map(async name=>{
    const started=Date.now();
    try{
      const source=await resolveVodSourceByName(name,handle,id);
      const probe=await probeVodSource(source,handle);
      return {
        ...probe,
        url:String(source.url||""),
        resolveMs:Math.max(0,Date.now()-started-probe.ms)
      };
    }catch(error){
      return {
        ok:false,
        name,
        url:"",
        ms:Date.now()-started,
        resolveMs:Date.now()-started,
        status:0,
        error:String(error?.message||error||"resolve_failed")
      };
    }
  }));

  const good=checks
    .filter(x=>x.ok&&/^https?:\/\//i.test(String(x.url||"")))
    .sort((a,b)=>(a.ms+a.resolveMs)-(b.ms+b.resolveMs));
  const preferred=String(good[0]?.name||"");
  if(preferred){
    await caches.default.put(
      vodWarmCacheKey(handle,id),
      new Response(JSON.stringify({preferred,checkedAt:Date.now()}),{
        headers:{
          "content-type":"application/json",
          "cache-control":"public,max-age=180"
        }
      })
    ).catch(()=>{});
  }

  return json({
    ok:Boolean(preferred),
    warm:Boolean(preferred),
    cached:false,
    preferred,
    sources:good.map(x=>({
      name:String(x.name||""),
      url:String(x.url||""),
      ms:Number(x.ms||0),
      resolveMs:Number(x.resolveMs||0)
    })),
    checks:checks.map(x=>({
      ok:Boolean(x.ok),
      name:String(x.name||""),
      ms:Number(x.ms||0),
      resolveMs:Number(x.resolveMs||0),
      status:Number(x.status||0),
      error:String(x.error||"")
    }))
  },preferred?200:502);
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
  let preferred = String(url.searchParams.get("source") || "").toLowerCase();
  if(!preferred||preferred==="auto"){
    preferred=await readVodWarmPreference(handle,id);
  }
  const order = vodSourceOrder(preferred);
  let lastStatus = 0;
  let lastError = "";

  // Rotate independent resolvers between consecutive videos, then fail over.
  // All successful media responses still preserve native Range/206 semantics.
  for (const sourceName of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let source;
      try {
        source = await resolveVodSourceByName(sourceName, handle, id, {
          refresh: attempt === 1
        });
      } catch (error) {
        lastError = sourceName + ":" + String(error?.message || error || "resolve_failed");
        break;
      }

      if (!/^https?:\/\//i.test(source.url)) {
        lastError = sourceName + ":empty_url";
        break;
      }

      let upstream;
      try {
        upstream = await fetchTikTokMediaTarget(source.url, request, source.headers || {});
      } catch (error) {
        lastError = sourceName + ":" + String(error?.message || error || "fetch_failed");
        if (attempt === 0) continue;
        break;
      }

      lastStatus = upstream.status;
      if (upstream.ok || upstream.status === 206) {
        return mediaRelayResponse(upstream, method, "cloudflare-" + sourceName);
      }

      try { await upstream.body?.cancel?.(); } catch {}
      lastError = sourceName + ":http_" + upstream.status;

      // Signed URLs can expire. Refresh that resolver once, then move to the
      // next independent source instead of retrying the same CDN indefinitely.
      if ([401, 403, 404, 410, 416, 429].includes(upstream.status) && attempt === 0) {
        continue;
      }
      break;
    }
  }

  return json({
    ok: false,
    error: lastError || ("tiktok_upstream_" + lastStatus),
    edge: true,
    attempted: order
  }, 502);
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

function originVideoId(value){
  const m=String(value||"").match(/\/video\/(\d{8,})/);
  return m?m[1]:"";
}
function originHandle(value){
  const m=String(value||"").match(/tiktok\.com\/@([^/?#]+)\/video\//i);
  return m?normalizeHandle(decodeURIComponent(m[1])):"";
}
function originAssetUrls(value){
  const out=[];
  const seen=new Set();
  const walk=(v,depth=0)=>{
    if(v==null||depth>7)return;
    if(typeof v==="string"){
      const s=v.trim();
      if(/^https?:\/\//i.test(s)&&!seen.has(s)){seen.add(s);out.push(s);}
      return;
    }
    if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return;}
    if(typeof v==="object"){
      for(const k of ["urlList","UrlList","url_list","urls","url","MainUrl","BackupUrl","FallbackUrl","mainUrl","backupUrl","fallbackUrl","uri"]){
        if(v[k]!=null)walk(v[k],depth+1);
      }
    }
  };
  walk(value);
  return out;
}
function originParseJson(value){
  if(!value)return {};
  if(typeof value==="object")return value;
  try{return JSON.parse(String(value))}catch{return {}}
}
function originFirstString(...values){
  for(const value of values){
    if(typeof value==="string"&&value.trim())return value.trim();
  }
  return "";
}
function originNumberish(...values){
  for(const value of values){
    const n=Number(value);
    if(Number.isFinite(n)&&n>0)return n;
  }
  return 0;
}
function originCollectVideo(node,wantedId){
  const download=[];
  const play=[];
  const audio=[];
  const variants=[];
  const audioTracks=[];
  const seen=new Set();

  const add=(bucket,v)=>{
    for(const u of originAssetUrls(v)){
      if(/^https?:\/\//i.test(u))bucket.push(u);
    }
  };

  const addAudioTrack=(row)=>{
    if(!row||typeof row!=="object")return;
    const urls=originAssetUrls(row?.UrlList||row?.urlList||row?.url_list||row)
      .filter(u=>/^https?:\/\//i.test(u));
    if(!urls.length)return;
    const fileId=originFirstString(
      row.FileId,row.fileId,row.file_id,row.FileHash,row.fileHash,row.file_hash
    );
    audioTracks.push({
      fileId,
      bitrate:originNumberish(row.Bitrate,row.bitrate,row.bit_rate),
      codec:originFirstString(row.CodecType,row.codecType,row.codec_type,row.Codec,row.codec),
      format:originFirstString(row.Format,row.format,"audio"),
      mediaType:originFirstString(row.MediaType,row.mediaType,row.media_type),
      bytes:originNumberish(row.AudioDataSize,row.audioDataSize,row.DataSize,row.dataSize,row.data_size),
      urls:[...new Set(urls)]
    });
    audio.push(...urls);
  };

  const addVariant=(row)=>{
    if(!row||typeof row!=="object")return;
    const addr=row?.PlayAddr||row?.playAddr||row?.play_addr||row;
    const urls=originAssetUrls(addr).filter(u=>/^https?:\/\//i.test(u));
    if(!urls.length)return;

    const extra=originParseJson(
      row.VideoExtra||row.videoExtra||row.video_extra||
      addr.VideoExtra||addr.videoExtra||addr.video_extra
    );
    const audioFileId=originFirstString(
      extra.audio_file_id,extra.audioFileId,extra.audio_fileid,
      row.AudioFileId,row.audioFileId,row.audio_file_id
    );
    const format=originFirstString(row.Format,row.format,addr.Format,addr.format,"mp4");
    const codec=originFirstString(
      row.CodecType,row.codecType,row.codec_type,
      addr.CodecType,addr.codecType,addr.codec_type
    );
    const urlKey=originFirstString(addr.UrlKey,addr.urlKey,addr.url_key,row.GearName,row.gearName,row.gear_name);
    const role=/dash/i.test(format)?"video":"muxed";

    variants.push({
      key:urlKey||urls[0],
      gear:originFirstString(row.GearName,row.gearName,row.gear_name),
      codec,
      format,
      role,
      bitrate:originNumberish(row.Bitrate,row.bitrate,row.bit_rate),
      fps:originNumberish(row.BitrateFPS,row.bitrateFPS,row.FPS,row.fps),
      width:originNumberish(addr.Width,addr.width,row.Width,row.width),
      height:originNumberish(addr.Height,addr.height,row.Height,row.height),
      bytes:originNumberish(addr.DataSize,addr.dataSize,addr.data_size),
      fileId:originFirstString(addr.FileHash,addr.fileHash,addr.file_hash,addr.FileId,addr.fileId,addr.file_id),
      audioFileId,
      packetMap:extra?.PktOffsetMap||extra?.pkt_offset_map||null,
      urls:[...new Set(urls)]
    });
    play.push(...urls);
  };

  const walk=(v,depth=0)=>{
    if(!v||typeof v!=="object"||depth>12||seen.has(v))return;
    seen.add(v);

    const id=String(v.id||v.itemId||v.aweme_id||v.awemeId||"");
    const relevant=!wantedId||!id||id===wantedId;
    const video=(v.video&&typeof v.video==="object")?v.video:v;

    if(relevant){
      for(const k of ["downloadAddr","download_addr","DownloadAddr","DownloadAddrStruct","downloadUrl","download_url"]){
        if(video[k]!=null)add(download,video[k]);
      }
      for(const k of ["playAddr","play_addr","PlayAddr","PlayAddrStruct","playUrl","play_url"]){
        if(video[k]!=null)add(play,video[k]);
      }
      for(const row of video.bitrateAudioInfo||video.bitrate_audio_info||[])addAudioTrack(row);
      for(const row of video.bitrateInfo||video.bitrate_info||[])addVariant(row);
    }

    if(Array.isArray(v)){for(const x of v)walk(x,depth+1);}
    else for(const x of Object.values(v))walk(x,depth+1);
  };

  walk(node);

  const audioById=new Map();
  for(const track of audioTracks){
    if(track.fileId&&!audioById.has(track.fileId))audioById.set(track.fileId,track);
  }

  const normalizedVariants=[];
  const variantSeen=new Set();
  for(const variant of variants){
    const key=[variant.key,variant.codec,variant.format,variant.urls[0]].join("|");
    if(variantSeen.has(key))continue;
    variantSeen.add(key);
    normalizedVariants.push({
      ...variant,
      audio:variant.audioFileId?audioById.get(variant.audioFileId)||null:null
    });
  }

  const normalizedAudio=[];
  const audioSeen=new Set();
  for(const track of audioTracks){
    const key=[track.fileId,track.urls[0]].join("|");
    if(audioSeen.has(key))continue;
    audioSeen.add(key);
    normalizedAudio.push(track);
  }

  return {
    download:[...new Set(download)],
    play:[...new Set(play)],
    audio:[...new Set(audio)],
    variants:normalizedVariants,
    audioTracks:normalizedAudio
  };
}
function originParseScript(html,id){
  let at=html.indexOf('id="'+id+'"');
  if(at<0)at=html.indexOf("id='"+id+"'");
  if(at<0)return null;
  const open=html.indexOf(">",at);
  const close=html.indexOf("</script>",open+1);
  if(open<0||close<0)return null;
  const raw=html.slice(open+1,close).trim();
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
function originFallbackUrls(html){
  const normalized=String(html||"")
    .replace(/\\u002F/gi,"/")
    .replace(/\\u0026/gi,"&")
    .replace(/\\u003A/gi,":")
    .replace(/\\u003D/gi,"=")
    .replace(/\\\//g,"/");
  const out=[];
  const re=/https?:\/\/[^"'<>\s\\]+/g;
  for(const m of normalized.matchAll(re)){
    const u=String(m[0]||"").replace(/&amp;/g,"&");
    if(/tiktokcdn|tiktokv|byteoversea|bytecdn|muscdn|akamaized/i.test(u))out.push(u);
  }
  return [...new Set(out)];
}
function originScoreUrl(url,kind,probe=null){
  let s=0;
  if(kind==="download")s+=80;
  if(kind==="play")s+=50;
  // Keep TikTok's own play gateway instead of a final signed CDN URL.
  // It redirects to the current CDN variant and exposes codec metadata.
  if(/^https:\/\/www\.tiktok\.com\/aweme\/v1\/play\//i.test(url))s+=320;
  if(/\/video\/tos\//i.test(url))s+=25;
  if(/video_mp4|mime_type=video/i.test(url))s+=20;
  if(/\.mp4(?:$|\?)/i.test(url))s+=15;
  if(/playwm/i.test(url))s-=30;
  if(/^https:\/\//i.test(url))s+=2;

  if(probe){
    if(probe.ok===false)s-=500;
    if(probe.contentType.startsWith("audio/"))s-=220;
    if(probe.avc1)s+=180;
    if(probe.mp4a)s+=90;
    if(probe.avc1&&probe.mp4a)s+=180;
    if(probe.hvc1||probe.hev1)s-=120;
    if(probe.av01)s+=40;
    if(probe.videoCodec===false)s-=240;
    if(probe.audioOnly===true)s-=320;
  }
  return s;
}
async function originProbeMedia(url,referer){
  const headers={
    "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "accept":"*/*",
    "referer":referer||"https://www.tiktok.com/",
    "range":"bytes=0-196607"
  };
  let r;
  try{
    r=await fetch(url,{
      method:"GET",
      headers,
      redirect:"follow",
      cf:{cacheTtl:0,cacheEverything:false}
    });
  }catch{
    return {ok:false,status:0,contentType:"",bytes:0};
  }

  const contentType=String(r.headers.get("content-type")||"").toLowerCase();
  let total=0;
  const chunks=[];
  try{
    const reader=r.body?.getReader?.();
    if(reader){
      while(total<196608){
        const part=await reader.read();
        if(part.done)break;
        const value=part.value||new Uint8Array();
        const take=Math.min(value.byteLength,196608-total);
        if(take>0){
          chunks.push(value.slice(0,take));
          total+=take;
        }
        if(total>=196608)break;
      }
      await reader.cancel().catch(()=>{});
    }
  }catch{
    try{await r.body?.cancel?.()}catch{}
  }

  const buf=new Uint8Array(total);
  let at=0;
  for(const chunk of chunks){buf.set(chunk,at);at+=chunk.byteLength;}
  let text="";
  try{text=new TextDecoder("latin1").decode(buf);}catch{
    text=String.fromCharCode(...buf.slice(0,60000));
  }

  const avc1=/avc1|avc3/i.test(text);
  const hvc1=/hvc1/i.test(text);
  const hev1=/hev1/i.test(text);
  const av01=/av01/i.test(text);
  const vp09=/vp09/i.test(text);
  const mp4a=/mp4a/i.test(text);
  const opus=/Opus/i.test(text);
  const videoCodec=avc1||hvc1||hev1||av01||vp09;
  const audioCodec=mp4a||opus;
  const audioOnly=audioCodec&&!videoCodec&&contentType.startsWith("audio/");

  return {
    ok:r.ok||r.status===206,
    status:r.status,
    contentType,
    bytes:total,
    avc1,hvc1,hev1,av01,vp09,mp4a,opus,
    videoCodec,
    audioCodec,
    audioOnly
  };
}
async function resolveTikTokOriginVideo(request){
  const incoming=new URL(request.url);
  const raw=String(incoming.searchParams.get("url")||"").trim();
  let target;
  try{target=new URL(raw)}catch{return json({ok:false,error:"invalid_tiktok_url"},400);}
  if(!/(^|\.)tiktok\.com$/i.test(target.hostname))
    return json({ok:false,error:"invalid_tiktok_host"},400);

  const id=originVideoId(target.href);
  const handle=originHandle(target.href);
  if(!id||!handle)return json({ok:false,error:"invalid_tiktok_video"},400);

  const headers={
    "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language":"vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
    "referer":"https://www.tiktok.com/"
  };

  const roots=[];
  let pageStatus=0;
  let apiStatus=0;

  // 1) TikTok web JSON directly. No third-party resolver.
  try{
    const api=new URL("https://www.tiktok.com/api/item/detail/");
    api.searchParams.set("aid","1988");
    api.searchParams.set("itemId",id);
    const r=await fetch(api,{headers,redirect:"follow",cf:{cacheTtl:0,cacheEverything:false}});
    apiStatus=r.status;
    if(r.ok){
      const data=await r.json().catch(()=>null);
      if(data)roots.push(data);
    }
  }catch{}

  // 2) Exact public post page, then hydration JSON.
  let fallback=[];
  try{
    const r=await fetch(target.href,{headers,redirect:"follow",cf:{cacheTtl:0,cacheEverything:false}});
    pageStatus=r.status;
    if(r.ok){
      const html=await r.text();
      const universal=originParseScript(html,"__UNIVERSAL_DATA_FOR_REHYDRATION__");
      const sigi=originParseScript(html,"SIGI_STATE");
      if(universal)roots.push(universal);
      if(sigi)roots.push(sigi);
      fallback=originFallbackUrls(html);
    }
  }catch{}

  const download=[],play=[],audio=[],variants=[],audioTracks=[];
  for(const root of roots){
    const hit=originCollectVideo(root,id);
    download.push(...hit.download);
    play.push(...hit.play);
    audio.push(...hit.audio);
    variants.push(...(hit.variants||[]));
    audioTracks.push(...(hit.audioTracks||[]));
  }

  const trackKey=row=>[
    row?.key||"",row?.codec||"",row?.format||"",row?.role||"",
    row?.urls?.[0]||""
  ].join("|");
  const dedupeTracks=(rows,keyFn)=>{
    const out=[],seen=new Set();
    for(const row of rows){
      const key=keyFn(row);
      if(!key||seen.has(key))continue;
      seen.add(key);out.push(row);
    }
    return out;
  };
  const cleanVariants=dedupeTracks(variants,trackKey);
  const cleanAudioTracks=dedupeTracks(audioTracks,row=>[
    row?.fileId||"",row?.urls?.[0]||""
  ].join("|"));

  const codecRank=value=>{
    const s=String(value||"").toLowerCase();
    if(/h264|avc/.test(s))return 50;
    if(/h265|hevc|hvc/.test(s))return 20;
    if(/av1|av01/.test(s))return 10;
    return 0;
  };
  const variantRank=row=>{
    let score=codecRank(row?.codec);
    if(String(row?.role)==="muxed")score+=80;
    if(String(row?.format||"").toLowerCase()==="mp4")score+=30;
    score+=Math.min(50,Number(row?.bitrate||0)/100000);
    if((row?.urls||[]).some(u=>!/(^|\.)www\.tiktok\.com$/i.test((()=>{try{return new URL(u).hostname}catch{return""}})())))score+=10;
    return score;
  };
  cleanVariants.sort((a,b)=>variantRank(b)-variantRank(a));
  cleanAudioTracks.sort((a,b)=>Number(b?.bitrate||0)-Number(a?.bitrate||0));

  const candidates=[
    ...[...new Set(download)].map(url=>({url,kind:"download"})),
    ...[...new Set(play)].map(url=>({url,kind:"play"}))
  ];
  const known=new Set(candidates.map(x=>x.url));
  for(const url of fallback){
    if(!known.has(url)){
      known.add(url);
      candidates.push({url,kind:"html-cdn"});
    }
  }
  candidates.sort((a,b)=>originScoreUrl(b.url,b.kind)-originScoreUrl(a.url,a.kind));

  // Probe only a few top TikTok-origin candidates. We read at most ~192 KB
  // from each candidate and cancel the body; the actual video is never proxied.
  const top=candidates.slice(0,6);
  const probed=await Promise.all(top.map(async row=>{
    const probe=await originProbeMedia(row.url,target.href);
    return {...row,probe,score:originScoreUrl(row.url,row.kind,probe)};
  }));
  probed.sort((a,b)=>b.score-a.score);

  const untouched=candidates.slice(6).map(row=>({...row,score:originScoreUrl(row.url,row.kind,null)}));
  candidates.splice(0,candidates.length,...probed,...untouched);
  candidates.sort((a,b)=>Number(b.score||0)-Number(a.score||0));

  const best=
    candidates.find(row=>row?.probe?.avc1&&row?.probe?.mp4a)||
    candidates.find(row=>row?.probe?.avc1)||
    candidates.find(row=>row?.probe?.videoCodec&&!row?.probe?.audioOnly)||
    candidates.find(row=>!row?.probe?.audioOnly)||
    null;
  if(!best){
    return json({
      ok:false,
      error:"tiktok_origin_media_not_found",
      handle,id,
      apiStatus,pageStatus,
      resolver:"tiktok-origin-only",
      render:false,
      tikwm:false,
      tdown:false,
      storage:"none"
    },404);
  }

  return json({
    ok:true,
    data:{
      handle,id,
      directUrl:best.url,
      bestVideoUrl:best.url,
      bestSource:"tiktok-origin-"+best.kind,
      candidates:candidates.slice(0,16).map(row=>({
        url:row.url,
        kind:row.kind,
        score:Number(row.score||originScoreUrl(row.url,row.kind,row.probe||null)),
        probe:row.probe||null
      })),
      audioUrls:[...new Set(audio)],
      mediaModel:{
        variants:cleanVariants.slice(0,24),
        audioTracks:cleanAudioTracks.slice(0,16),
        preferredMuxed:cleanVariants.find(row=>
          row.role==="muxed"&&/h264|avc/i.test(String(row.codec||""))
        )||cleanVariants.find(row=>row.role==="muxed")||null,
        preferredDash:cleanVariants.find(row=>
          row.role==="video"&&/h264|avc/i.test(String(row.codec||""))&&row.audio
        )||cleanVariants.find(row=>row.role==="video"&&row.audio)||null
      },
      apiStatus,pageStatus,
      resolver:"tiktok-origin-only",
      render:false,
      tikwm:false,
      tdown:false,
      proxyVideo:false,
      storage:"none",
      supabaseWrites:0
    }
  });
}

async function resolveTikTokOriginLocation(request){
  const incoming=new URL(request.url);
  const raw=String(incoming.searchParams.get("url")||"").trim();
  let target;
  try{target=new URL(raw)}catch{return json({ok:false,error:"invalid_origin_play_url"},400);}

  const host=target.hostname.toLowerCase();
  if(!(host==="www.tiktok.com"||host==="tiktok.com")||
     !/^\/aweme\/v1\/play\//i.test(target.pathname)){
    return json({ok:false,error:"invalid_origin_play_url"},400);
  }

  let upstream;
  try{
    upstream=await fetch(target.toString(),{
      method:"GET",
      headers:{
        "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
        "accept":"*/*",
        "accept-language":"vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
        "referer":"https://www.tiktok.com/",
        "range":"bytes=0-0"
      },
      redirect:"manual",
      cf:{cacheTtl:0,cacheEverything:false}
    });
  }catch(error){
    return json({ok:false,error:String(error?.message||error||"origin_location_failed")},502);
  }

  const location=String(upstream.headers.get("location")||"");
  const codec=String(upstream.headers.get("x-video-codec-type")||"");
  const status=upstream.status;
  try{await upstream.body?.cancel?.()}catch{}

  if(location&&status>=300&&status<400){
    return json({
      ok:true,
      url:location,
      codec:codec||"unknown",
      status,
      source:"tiktok-origin-location",
      proxyVideo:false,
      storage:"none"
    },200,{"cache-control":"no-store"});
  }

  return json({
    ok:false,
    error:"origin_location_no_redirect",
    status,
    codec
  },502);
}

async function relayTikTokOriginPlay(request){
  const incoming=new URL(request.url);
  const raw=String(incoming.searchParams.get("url")||"").trim();
  let target;
  try{target=new URL(raw)}catch{return json({ok:false,error:"invalid_origin_play_url"},400);}

  const host=target.hostname.toLowerCase();
  if(!(host==="www.tiktok.com"||host==="tiktok.com")||
     !/^\/aweme\/v1\/play\//i.test(target.pathname)){
    return json({ok:false,error:"invalid_origin_play_url"},400);
  }

  const ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15";
  const baseHeaders={
    "user-agent":ua,
    "accept":"*/*",
    "accept-language":"vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
    "referer":"https://www.tiktok.com/"
  };

  // Step 1: ask TikTok only for the signed CDN Location.
  let gateway;
  try{
    gateway=await fetch(target.toString(),{
      method:"GET",
      headers:{...baseHeaders,"range":"bytes=0-0"},
      redirect:"manual",
      cf:{cacheTtl:0,cacheEverything:false}
    });
  }catch(error){
    return json({ok:false,error:String(error?.message||error||"origin_gateway_failed")},502);
  }

  const location=String(gateway.headers.get("location")||"");
  const gatewayStatus=gateway.status;
  try{await gateway.body?.cancel?.()}catch{}

  if(!location||gatewayStatus<300||gatewayStatus>=400){
    return json({
      ok:false,
      error:"origin_gateway_no_location",
      status:gatewayStatus
    },502);
  }

  let cdn;
  try{cdn=new URL(location)}catch{
    return json({ok:false,error:"origin_gateway_bad_location"},502);
  }
  if(!/^https?:$/i.test(cdn.protocol)){
    return json({ok:false,error:"origin_gateway_bad_protocol"},502);
  }

  // Step 2: fetch the CDN URL directly. Do not ask Workers/TikTok to follow
  // the gateway redirect because that path can return the TikTok HTML shell.
  const method=request.method==="HEAD"?"HEAD":"GET";
  const headers=new Headers(baseHeaders);
  headers.set("referer","https://www.tiktok.com/");
  const range=request.headers.get("range");
  if(range)headers.set("range",range);
  else if(method==="GET")headers.set("range","bytes=0-");

  let upstream;
  try{
    upstream=await fetch(cdn.toString(),{
      method,
      headers,
      redirect:"manual",
      cf:{cacheTtl:0,cacheEverything:false}
    });
  }catch(error){
    return json({ok:false,error:String(error?.message||error||"origin_cdn_failed")},502);
  }

  const type=String(upstream.headers.get("content-type")||"").toLowerCase();
  if(!(upstream.ok||upstream.status===206)||!(/video\/mp4|audio\/mp4|application\/octet-stream/.test(type))){
    const status=upstream.status;
    const contentType=type;
    try{await upstream.body?.cancel?.()}catch{}
    return json({
      ok:false,
      error:"origin_cdn_invalid_response",
      status,
      contentType
    },502);
  }

  return mediaRelayResponse(upstream,method,"cloudflare-tiktok-origin-cdn");
}

async function redirectTikTokOriginPlay(request){
  const incoming=new URL(request.url);
  const raw=String(incoming.searchParams.get("url")||"").trim();
  let target;
  try{target=new URL(raw)}catch{return json({ok:false,error:"invalid_origin_play_url"},400);}

  const host=target.hostname.toLowerCase();
  if(!(host==="www.tiktok.com"||host==="tiktok.com")||
     !/^\/aweme\/v1\/play\//i.test(target.pathname)){
    return json({ok:false,error:"invalid_origin_play_url"},400);
  }

  let upstream;
  try{
    upstream=await fetch(target.toString(),{
      method:"GET",
      headers:{
        "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "accept":"*/*",
        "accept-language":"vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
        "referer":"https://www.tiktok.com/",
        "range":"bytes=0-0"
      },
      redirect:"manual",
      cf:{cacheTtl:0,cacheEverything:false}
    });
  }catch(error){
    return json({ok:false,error:String(error?.message||error||"origin_redirect_failed")},502);
  }

  const location=String(upstream.headers.get("location")||"");
  const codec=String(upstream.headers.get("x-video-codec-type")||"");
  try{await upstream.body?.cancel?.()}catch{}

  if(location&&upstream.status>=300&&upstream.status<400){
    return new Response(null,{
      status:302,
      headers:{
        ...cors(),
        "location":location,
        "cache-control":"no-store",
        "x-1988-media":"tiktok-origin-redirect-only",
        "x-video-codec-type":codec||"unknown"
      }
    });
  }

  return json({
    ok:false,
    error:"origin_play_no_redirect",
    status:upstream.status,
    codec
  },502);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "1988-tiktok-live-state" });
    if (url.pathname === "/state") return json({ ok: true, ...(await loadSnapshot(env)) });
    if (url.pathname === "/tiktok/live-now") return json(await liveNow(env));
    if (url.pathname === "/tiktok/video-origin" && request.method === "GET")
      return resolveTikTokOriginVideo(request);
    if (url.pathname === "/tiktok/video-origin-redirect" &&
        (request.method === "GET" || request.method === "HEAD"))
      return redirectTikTokOriginPlay(request);
    if (url.pathname === "/tiktok/video-origin-stream" &&
        (request.method === "GET" || request.method === "HEAD"))
      return relayTikTokOriginPlay(request);
    if (url.pathname === "/tiktok/video-origin-location" &&
        request.method === "GET")
      return resolveTikTokOriginLocation(request);
    if (url.pathname === "/tiktok/video-direct" &&
        (request.method === "GET" || request.method === "HEAD"))
      return redirectTikTokVideoDirect(request);

    if (url.pathname === "/tiktok/video-warm-edge" && request.method === "GET") {
      return warmTikTokVod(request);
    }
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
