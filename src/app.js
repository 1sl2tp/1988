const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";
const EXTRACTOR="https://one988-extractor.onrender.com";

const API_MEMORY_TTL={
  home:5*60*1000,
  trending:2*60*1000,
  search:60*1000,
  suggestions:5*60*1000,
  branding:5*60*1000,
  playback:30*1000
};
const apiMemoryCache=new Map();
const apiInflight=new Map();

async function call(action,params={},options={}){
  const url=new URL(BASE);
  url.searchParams.set("action",action);
  Object.entries(params).forEach(([key,value])=>{
    if(value!==undefined&&value!==null&&String(value)!=="")url.searchParams.set(key,String(value));
  });
  const key=url.toString();
  const ttl=Number(options.ttl??API_MEMORY_TTL[action]??0);
  const now=Date.now();
  const cached=apiMemoryCache.get(key);
  if(ttl>0&&cached&&now-cached.at<ttl)return cached.body;
  if(apiInflight.has(key))return apiInflight.get(key);

  const task=(async()=>{
    const res=await fetch(key,{signal:options.signal,cache:"default"});
    const body=await res.json().catch(()=>({ok:false,error:"bad_json"}));
    if(!res.ok||body.ok!==true)throw new Error(body.error||("HTTP "+res.status));
    if(ttl>0){
      apiMemoryCache.set(key,{at:Date.now(),body});
      if(apiMemoryCache.size>80)apiMemoryCache.delete(apiMemoryCache.keys().next().value);
    }
    return body;
  })();

  apiInflight.set(key,task);
  try{return await task;}finally{apiInflight.delete(key);}
}
const apiHome=(seed)=>call("home",{seed});
const apiTrending=(region="VN")=>call("trending",{region});
const apiSearch=(q,filter="all")=>call("search",{q,filter});
const apiSearchNext=(q,filter,nextpage)=>call("search_next",{q,filter,nextpage});
const apiSuggestions=async(q)=>{
  const r=await call("suggestions",{q});
  const d=r.data;
  if(Array.isArray(d)&&Array.isArray(d[1]))return d[1];
  return Array.isArray(d)?d:[];
};
const apiVideo=(id)=>call("video",{id});
const apiPlaylist=(id)=>call("playlist",{id});
const apiPlaylistNext=(id,nextpage)=>call("playlist_next",{id,nextpage});
const apiChannel=(id)=>call("channel",{id});
const apiChannelNext=(id,nextpage)=>call("channel_next",{id,nextpage});
const apiSponsors=(id)=>call("sponsors",{id});
const apiBackground=(id)=>call("background",{id});
const apiPlayback=(id)=>call("playback",{id});
const directMediaUrl=(id,kind="video")=>{
  const url=new URL(EXTRACTOR+"/media");
  url.searchParams.set("id",id);
  url.searchParams.set("kind",kind);
  return url.toString();
};
async function extractorPlayback(id,timeoutMs=5000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const url=new URL(EXTRACTOR+"/stream");
    url.searchParams.set("id",id);
    const res=await fetch(url.toString(),{signal:controller.signal,cache:"no-store",mode:"cors"});
    const body=await res.json().catch(()=>null);
    if(!res.ok||body?.ok!==true)throw new Error(body?.error||("HTTP "+res.status));
    return body;
  }finally{
    clearTimeout(timer);
  }
}
const apiBranding=(ids)=>call("branding",{ids:(Array.isArray(ids)?ids:[]).join(",")});
function playerUrl(id){
  const url=new URL("https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id));
  url.searchParams.set("autoplay","1");
  url.searchParams.set("playsinline","1");
  url.searchParams.set("controls","0");
  url.searchParams.set("disablekb","1");
  url.searchParams.set("fs","0");
  url.searchParams.set("cc_load_policy","0");
  url.searchParams.set("rel","0");
  url.searchParams.set("modestbranding","1");
  url.searchParams.set("iv_load_policy","3");
  url.searchParams.set("enablejsapi","1");
  url.searchParams.set("origin",location.origin);
  return url.toString();
}
function playlistPlayerUrl(id){
  const url=new URL("https://www.youtube-nocookie.com/embed/videoseries");
  url.searchParams.set("list",id);
  url.searchParams.set("autoplay","1");
  url.searchParams.set("playsinline","1");
  url.searchParams.set("controls","0");
  url.searchParams.set("disablekb","1");
  url.searchParams.set("fs","0");
  url.searchParams.set("cc_load_policy","0");
  url.searchParams.set("rel","0");
  url.searchParams.set("modestbranding","1");
  url.searchParams.set("enablejsapi","1");
  url.searchParams.set("origin",location.origin);
  return url.toString();
}

const api={
  home:apiHome,trending:apiTrending,search:apiSearch,searchNext:apiSearchNext,
  suggestions:apiSuggestions,video:apiVideo,playlist:apiPlaylist,playlistNext:apiPlaylistNext,
  channel:apiChannel,channelNext:apiChannelNext,sponsors:apiSponsors,background:apiBackground,
  playback:apiPlayback,branding:apiBranding,playerUrl,playlistPlayerUrl
};

const $=(s,r=document)=>r.querySelector(s);
const view=$("#view");
if(!api)throw new Error("YT1988_API chưa khởi tạo");
const searchForm=$("#searchForm");
const searchInput=$("#searchInput");
const suggestionsEl=$("#suggestions");
const homeButton=$("#homeButton");
const HISTORY_KEY="1988.history.v3";
const PLAYLIST_KEY="1988.playlists.v1";
const MY_LIST_KEY="1988.myplaylists.v1";
const FEED_CACHE_KEY="1988.feedcache.v1";
const BG_AUTO_KEY="1988.background.auto.v1";
const playerBox=$("#persistentPlayer");
const playerFrame=$("#playerFrame");
const nativeVideo=$("#nativeVideo");
const playerAspect=playerFrame?.closest(".player-aspect");
const miniTitle=$("#miniTitle");
const miniExpand=$("#miniExpand");
const miniClose=$("#miniClose");
const bgAudio=$("#backgroundAudio");
const playPauseButton=$("#playPauseButton");
const seekRange=$("#seekRange");
const currentTimeLabel=$("#currentTimeLabel");
const durationLabel=$("#durationLabel");
const muteButton=$("#muteButton");
const volumeRange=$("#volumeRange");
const fullscreenButton=$("#fullscreenButton");


const state={token:0,next:null,more:null,currentVideo:"",currentInfo:null,pendingVideoMeta:null,sponsorSegments:[],ytTime:0,ytDuration:0,ytPlayerState:-1,ytVolume:100,ytMuted:false,playerEngine:"none",playerLoadSeq:0,nativeInfo:null,nativeSourceIndex:0,nativeFallbackStarted:false,wasPlayingBeforeHide:false,backgroundId:"",backgroundInfo:null,backgroundReady:false,backgroundSourceIndex:0,backgroundAuto:localStorage.getItem(BG_AUTO_KEY)!=="0"};
const dearrowCache=new Map();

function cleanText(v=""){
  let s=String(v??"");
  try{
    const t=document.createElement("textarea");
    t.innerHTML=s;
    s=t.value;
  }catch{}
  try{s=s.normalize("NFC");}catch{}
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function esc(v=""){return cleanText(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function svgIcon(name,size=18){
  const base='viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const paths={
    play:'<path d="M8 5v14l11-7z"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    volume:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6M17.8 6.2a8 8 0 0 1 0 11.6"/>',
    mute:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
    fullscreen:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    minimize:'<path d="m8 3 4 4 4-4M12 7v6"/><path d="M5 17h14"/>',
    reload:'<path d="M20 7v5h-5"/><path d="M18.5 17a8 8 0 1 1 1.1-8"/>',
    share:'<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
    shield:'<path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    headphones:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"/>',
    search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  return '<svg '+base+'>'+((paths[name]||paths.play))+'</svg>';
}
function friendlySourceLabel(source=""){
  const s=String(source||"").toLowerCase();
  if(s.includes("newpipe"))return "NewPipe";
  if(s.includes("youtube"))return "YouTube";
  if(s.includes("piped"))return "Piped";
  if(s.includes("sponsor"))return "SponsorBlock";
  return "1988";
}
function actionButton(id,icon,label,extra=""){
  return '<button class="action-button '+extra+'" id="'+id+'" type="button"><span class="action-icon">'+svgIcon(icon,18)+'</span><span>'+esc(label)+'</span></button>';
}
function fmt(n){
  n=Number(n)||0;
  if(n>=1e9)return (n/1e9).toFixed(1).replace(".0","")+" tỷ";
  if(n>=1e6)return (n/1e6).toFixed(1).replace(".0","")+" Tr";
  if(n>=1e3)return (n/1e3).toFixed(1).replace(".0","")+" N";
  return n.toLocaleString("vi-VN");
}
function dur(s){
  s=Math.max(0,Number(s)||0);
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=Math.floor(s%60);
  return h?String(h)+":"+String(m).padStart(2,"0")+":"+String(x).padStart(2,"0"):String(m)+":"+String(x).padStart(2,"0");
}
function videoPublishedLabel(row={}){
  const numericCandidates=[row.uploaded,row.published,row.publishedAt,row.timestamp,row.uploadTimestamp];
  for(const value of numericCandidates){
    const n=Number(value);
    if(!Number.isFinite(n)||n<=0)continue;
    const ms=n<1e12?n*1000:n;
    const d=new Date(ms);
    if(Number.isNaN(d.getTime()))continue;
    const date=d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});
    const time=d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",hour12:false});
    return "Đăng "+date+" · "+time;
  }

  const raw=cleanText(row.uploadDate||row.uploadedDate||row.publishedText||row.publishedDate||"");
  if(!raw)return "";

  // ISO/date values: format cleanly. Only show a clock when the source actually contains one.
  const iso=/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(raw);
  if(iso){
    const d=new Date(raw.length===10?raw+"T00:00:00":raw);
    if(!Number.isNaN(d.getTime())){
      const date=d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});
      const hasTime=raw.length>10&&/[T\s]\d{1,2}:\d{2}/.test(raw);
      if(hasTime){
        const time=d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",hour12:false});
        return "Đăng "+date+" · "+time;
      }
      return "Đăng "+date;
    }
  }
  return /^đăng\b/i.test(raw)?raw:"Đăng "+raw;
}
function updatePlayerControls(){
  const current=Math.max(0,Number(state.ytTime)||0);
  const total=Math.max(0,Number(state.ytDuration)||0);
  if(currentTimeLabel)currentTimeLabel.textContent=dur(current);
  if(durationLabel)durationLabel.textContent=dur(total);
  if(seekRange){
    seekRange.max=String(total||1);
    if(document.activeElement!==seekRange)seekRange.value=String(Math.min(current,total||current));
  }
  if(playPauseButton)playPauseButton.innerHTML=svgIcon(state.ytPlayerState===1?"pause":"play",18);
  if(muteButton)muteButton.innerHTML=svgIcon(state.ytMuted||state.ytVolume===0?"mute":"volume",18);
  if(volumeRange&&document.activeElement!==volumeRange)volumeRange.value=String(Math.max(0,Math.min(100,state.ytVolume)));
}
function togglePlayerPlayback(){
  if(bgAudio&&!bgAudio.paused&&state.backgroundId===state.currentVideo){
    if(state.playerEngine==="native"){
      resumeForeground();
    }else{
      bgAudio.pause();
    }
    return;
  }
  if(state.playerEngine==="native"&&nativeVideo){
    if(nativeVideo.paused){
      if(bgAudio?.dataset.id===state.currentVideo){
        try{bgAudio.currentTime=nativeVideo.currentTime||0;}catch{}
        bgAudio.muted=true;
        bgAudio.volume=nativeVideo.volume;
        const ap=bgAudio.play();if(ap?.catch)ap.catch(()=>{});
      }
      nativeVideo.play().catch(()=>{});
    }else{
      nativeVideo.pause();
      if(bgAudio?.dataset.id===state.currentVideo)bgAudio.pause();
      state.wasPlayingBeforeHide=false;
    }
    return;
  }
  if(state.ytPlayerState===1)sendYT("pauseVideo",[]);
  else sendYT("playVideo",[]);
}
function togglePlayerMute(){
  if(state.playerEngine==="native"&&nativeVideo){
    nativeVideo.muted=!nativeVideo.muted;
    state.ytMuted=nativeVideo.muted;
    state.ytVolume=Math.round((nativeVideo.volume||0)*100);
    updatePlayerControls();
    return;
  }
  if(state.ytMuted||state.ytVolume===0){
    sendYT("unMute",[]);
    if(state.ytVolume===0){state.ytVolume=60;sendYT("setVolume",[60]);}
    state.ytMuted=false;
  }else{
    sendYT("mute",[]);
    state.ytMuted=true;
  }
  updatePlayerControls();
}
function coverYoutubeChrome(){/* Native player does not need a visual mask. */}
function enterPlayerFullscreen(){
  const target=playerBox||nativeVideo||playerFrame;
  const fn=target?.requestFullscreen||target?.webkitRequestFullscreen;
  try{fn?.call(target);}catch{}
}
function videoId(url=""){
  const m=String(url).match(/[?&]v=([A-Za-z0-9_-]{11})|\/watch\?v=([A-Za-z0-9_-]{11})|\/shorts\/([A-Za-z0-9_-]{11})/);
  return m?(m[1]||m[2]||m[3]||""):(/^[A-Za-z0-9_-]{11}$/.test(String(url))?String(url):"");
}
function playlistId(url=""){
  try{return new URL(String(url),"https://x.invalid").searchParams.get("list")||"";}catch{return "";}
}
function channelId(url=""){
  const p=String(url).split("?")[0].split("/").filter(Boolean);
  const i=p.findIndex(x=>x==="channel");
  return i>=0?(p[i+1]||""):"";
}
function read(key){try{const v=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(v)?v:[];}catch{return [];}}
function write(key,rows){try{localStorage.setItem(key,JSON.stringify(rows.slice(0,60)));}catch{}}
function saveHistory(info,id){
  const rows=read(HISTORY_KEY).filter(x=>x.id!==id);
  rows.unshift({id,title:cleanText(info?.title)||("Video "+id),thumbnail:info?.thumbnailUrl||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),uploaderName:info?.uploader||"",views:Number(info?.views)||0,duration:Number(info?.duration)||0,uploaded:Number(info?.uploaded)||0,uploadedDate:cleanText(info?.uploadedDate)||"",uploadDate:cleanText(info?.uploadDate)||""});
  write(HISTORY_KEY,rows);
}
function savePlaylist(data,id){
  const rows=read(PLAYLIST_KEY).filter(x=>x.id!==id);
  rows.unshift({id,name:data?.name||"Danh sách phát",thumbnail:data?.thumbnailUrl||"",uploader:data?.uploader||"",videos:Number(data?.videos)||0});
  write(PLAYLIST_KEY,rows);
}
function readMyLists(){return read(MY_LIST_KEY);}
function writeMyLists(rows){write(MY_LIST_KEY,rows);}
function currentVideoRecord(){
  const id=state.currentVideo;
  if(!id)return null;
  const info=state.currentInfo||{};
  return {
    id,
    title:cleanText(info.title)||cleanText(miniTitle?.textContent)||("Video "+id),
    thumbnail:info.thumbnailUrl||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),
    uploaderName:info.uploader||"",
    views:Number(info.views)||0,
    duration:Number(info.duration)||0
  };
}
function getFeedCache(key){
  try{
    const all=JSON.parse(localStorage.getItem(FEED_CACHE_KEY)||"{}");
    const row=all[key];
    if(row&&Date.now()-Number(row.at||0)<10*60*1000&&Array.isArray(row.items))return row.items;
  }catch{}
  return null;
}
function setFeedCache(key,items){
  try{
    const all=JSON.parse(localStorage.getItem(FEED_CACHE_KEY)||"{}");
    all[key]={at:Date.now(),items:(items||[]).slice(0,30)};
    localStorage.setItem(FEED_CACHE_KEY,JSON.stringify(all));
  }catch{}
}
function playlistSheetHtml(){
  const lists=readMyLists();
  const rows=lists.map(list=>'<button class="sheet-row" type="button" data-add-list="'+esc(list.id)+'"><span>'+esc(list.name)+'</span><small>'+esc(String(list.items?.length||0))+' video</small></button>').join("");
  return '<div class="sheet-backdrop" id="playlistSheet"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><strong>Thêm vào danh sách</strong><button type="button" data-close-sheet>×</button></div><div class="sheet-list">'+(rows||'<div class="sheet-empty">Chưa có danh sách nào</div>')+'</div><div class="sheet-create"><input id="newListName" type="text" placeholder="Tên danh sách" maxlength="50"><button id="createListButton" type="button">Tạo mới</button></div></div></div>';
}
function openPlaylistSheet(){
  if(!state.currentVideo)return;
  document.getElementById("playlistSheet")?.remove();
  document.body.insertAdjacentHTML("beforeend",playlistSheetHtml());
}
function addCurrentToList(listId){
  const video=currentVideoRecord();if(!video)return;
  const lists=readMyLists();
  const list=lists.find(x=>x.id===listId);if(!list)return;
  list.items=Array.isArray(list.items)?list.items:[];
  if(!list.items.some(x=>x.id===video.id))list.items.push(video);
  list.updatedAt=Date.now();
  writeMyLists(lists);
}
function createListFromCurrent(name){
  name=String(name||"").trim();if(!name)return null;
  const video=currentVideoRecord();if(!video)return null;
  const lists=readMyLists();
  const id="l"+Date.now().toString(36);
  lists.unshift({id,name,createdAt:Date.now(),updatedAt:Date.now(),items:[video]});
  writeMyLists(lists);
  return id;
}


const HOME_TOPICS=[
  {id:"all",label:"Khám phá",query:"video việt nam mới nhất"},
  {id:"music",label:"Âm nhạc",query:"âm nhạc việt nam mới"},
  {id:"news",label:"Tin tức",query:"tin tức việt nam mới nhất"},
  {id:"entertainment",label:"Giải trí",query:"giải trí việt nam"},
  {id:"tech",label:"Công nghệ",query:"công nghệ việt nam"}
];
const TREND_TOPICS=[
  {id:"top",label:"Top"},
  {id:"news",label:"Tin tức",query:"tin tức việt nam mới nhất"},
  {id:"music",label:"Âm nhạc",query:"âm nhạc thịnh hành việt nam"},
  {id:"entertainment",label:"Giải trí",query:"giải trí thịnh hành việt nam"},
  {id:"sports",label:"Thể thao",query:"thể thao việt nam mới nhất"},
  {id:"tech",label:"Công nghệ",query:"công nghệ mới việt nam"}
];
function topicBar(kind,active){
  const rows=kind==="trending"?TREND_TOPICS:HOME_TOPICS;
  return '<div class="topic-bar">'+rows.map(row=>'<button type="button" class="topic-chip '+(row.id===active?'active':'')+'" data-topic-kind="'+kind+'" data-topic-id="'+row.id+'">'+esc(row.label)+'</button>').join("")+'</div>';
}
function setActive(name){
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
}
function navigate(params={},push=true){
  const u=new URL(location.href);u.search="";
  Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=="")u.searchParams.set(k,String(v));});
  if(push)history.pushState({}, "", u);else history.replaceState({}, "", u);
  route();
}
function loading(){
  return '<div class="feed">'+Array.from({length:6},()=>'<div><div class="thumb-wrap skeleton"></div><div class="video-body"><div class="avatar skeleton"></div><div><div class="skeleton" style="height:13px;border-radius:4px;margin-bottom:7px"></div><div class="skeleton" style="height:10px;width:65%;border-radius:4px"></div></div></div></div>').join("")+'</div>';
}
function videoCard(row){
  const id=videoId(row.url||row.videoId||"");if(!id)return "";
  const thumb=row.thumbnail||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
  const published=videoPublishedLabel(row);
  return '<article class="item" data-kind="video" data-id="'+esc(id)+'" data-title="'+esc(row.title||"Video")+'" data-uploader="'+esc(row.uploaderName||"")+'" data-views="'+esc(String(Number(row.views)||0))+'" data-duration="'+esc(String(Number(row.duration)||0))+'" data-uploaded="'+esc(String(Number(row.uploaded)||0))+'" data-upload-date="'+esc(row.uploadDate||"")+'" data-uploaded-date="'+esc(row.uploadedDate||"")+'" data-thumb="'+esc(thumb)+'"><div class="thumb-wrap"><img class="thumb" src="'+esc(thumb)+'" alt="" loading="lazy"><span class="duration">'+esc(dur(row.duration))+'</span></div><div class="video-body">'+(row.uploaderAvatar?'<img class="avatar" src="'+esc(row.uploaderAvatar)+'" alt="" loading="lazy">':'<div class="avatar"></div>')+'<div class="video-text"><h3 class="title">'+esc(row.title||"Video")+'</h3><div class="meta meta-channel">'+esc(row.uploaderName||"")+'</div><div class="meta meta-stats">'+(row.views>=0?esc(fmt(row.views))+' lượt xem':'')+(published?(row.views>=0?' · ':'')+esc(published):'')+'</div></div></div></article>';
}
function playlistCard(row){
  const id=row.id||playlistId(row.url||"");if(!id)return "";
  const name=row.name||row.title||"Danh sách phát";
  const thumb=row.thumbnail||row.thumbnailUrl||"";
  return '<article class="entity item" data-kind="playlist" data-id="'+esc(id)+'"><div class="thumb-wrap" style="aspect-ratio:16/9;border-radius:8px"><img class="thumb" src="'+esc(thumb)+'" alt="" loading="lazy"><span class="kind-badge">☷ '+esc(row.videos>=0?String(row.videos):"")+'</span></div><div><h3>'+esc(name)+'</h3><p>'+esc(row.uploaderName||row.uploader||"Danh sách phát")+'</p></div></article>';
}
function channelCard(row){
  const id=row.id||channelId(row.url||"");if(!id)return "";
  return '<article class="entity channel item" data-kind="channel" data-id="'+esc(id)+'"><img src="'+esc(row.thumbnail||row.avatarUrl||"")+'" alt="" loading="lazy"><div><h3>'+esc(row.name||row.uploaderName||"Kênh")+'</h3><p>'+esc(row.description||"")+(row.subscribers>=0?" · "+esc(fmt(row.subscribers))+" người đăng ký":"")+'</p></div></article>';
}
function card(row){
  if(row?.type==="playlist")return playlistCard(row);
  if(row?.type==="channel")return channelCard(row);
  return videoCard(row);
}
function renderCollection(title,items,source="",append=false){
  if(!append){
    view.innerHTML='<div class="section-head"><h1>'+esc(title)+'</h1></div><div class="feed" id="feed"></div><button class="more" id="moreButton" type="button" hidden>Tải thêm</button>';
  }
  const feed=$("#feed");
  if(!feed)return;
  const html=(items||[]).map(card).join("");
  if(append)feed.insertAdjacentHTML("beforeend",html);else feed.innerHTML=html||'<div class="empty"><div><strong>Không có dữ liệu</strong>Thử lại hoặc tìm từ khóa khác.</div></div>';
  const more=$("#moreButton");if(more)more.hidden=!state.next;
  void enhanceDeArrow(feed);
}
function compactRows(items){
  return (items||[]).map(row=>{
    const id=videoId(row.url||row.videoId||"");if(!id)return "";
    const published=videoPublishedLabel(row);
    return '<article class="row" data-kind="video" data-id="'+esc(id)+'" data-title="'+esc(row.title||"Video")+'" data-uploader="'+esc(row.uploaderName||"")+'" data-views="'+esc(String(Number(row.views)||0))+'" data-duration="'+esc(String(Number(row.duration)||0))+'" data-uploaded="'+esc(String(Number(row.uploaded)||0))+'" data-upload-date="'+esc(row.uploadDate||"")+'" data-uploaded-date="'+esc(row.uploadedDate||"")+'" data-thumb="'+esc(row.thumbnail||("https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"))+'"><img src="'+esc(row.thumbnail||("https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"))+'" alt="" loading="lazy"><div class="row-copy"><div class="row-title">'+esc(row.title||"Video")+'</div><div class="row-meta row-channel">'+esc(row.uploaderName||"")+'</div><div class="row-meta row-stats">'+(row.views>=0?esc(fmt(row.views))+' lượt xem':'')+(published?(row.views>=0?' · ':'')+esc(published):'')+'</div></div></article>';
  }).join("");
}
async function enhanceDeArrow(root=document){
  const cards=[...root.querySelectorAll('[data-kind="video"][data-id]')];
  if(!cards.length||!api.branding)return;
  const ids=[...new Set(cards.map(el=>el.dataset.id).filter(Boolean))];
  const missing=ids.filter(id=>!dearrowCache.has(id)).slice(0,24);
  if(missing.length){
    try{
      const r=await api.branding(missing);
      const rows=r?.data||{};
      missing.forEach(id=>dearrowCache.set(id,rows[id]||null));
    }catch{
      missing.forEach(id=>dearrowCache.set(id,null));
    }
  }
  cards.forEach(card=>{
    const id=card.dataset.id;
    const data=dearrowCache.get(id);
    if(!data)return;
    const title=card.querySelector(".title,.row-title");
    const image=card.querySelector("img.thumb,img");
    if(data.title&&title)title.textContent=cleanText(data.title);
    if(data.thumbnailUrl&&image&&!image.dataset.dearrow){
      image.dataset.dearrow="1";
      image.src=data.thumbnailUrl;
    }
  });
}

function setPlayerMode(mode){
  if(!playerBox)return;
  if(!state.currentVideo){
    playerBox.hidden=true;
    playerBox.classList.remove("full","mini");
    return;
  }
  playerBox.hidden=false;
  playerBox.classList.toggle("full",mode==="full");
  playerBox.classList.toggle("mini",mode==="mini");
}
function sendYT(func,args=[]){
  try{
    playerFrame?.contentWindow?.postMessage(JSON.stringify({event:"command",func,args,id:"1988"}),"*");
  }catch{}
}
function disableCaptions(){
  // cc_load_policy=0 only avoids forcing captions on; YouTube can still restore
  // the viewer's previous CC preference. Explicitly clear and unload captions.
  sendYT("setOption",["captions","track",{}]);
  sendYT("unloadModule",["captions"]);
  sendYT("unloadModule",["cc"]);
}
function enforceCaptionsOff(){
  disableCaptions();
  setTimeout(disableCaptions,300);
  setTimeout(disableCaptions,1200);
}
function listenYT(){
  try{
    playerFrame?.contentWindow?.postMessage(JSON.stringify({event:"listening",id:"1988"}),"*");
  }catch{}
  enforceCaptionsOff();
}
function normalizeSponsors(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const seg=Array.isArray(row?.segment)?row.segment:null;
    const start=seg?Number(seg[0]):Number(row?.startTime);
    const end=seg?Number(seg[1]):Number(row?.endTime);
    return {start,end,category:String(row?.category||"")};
  }).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start);
}
function maybeSkipSponsor(){
  if(bgAudio&&!bgAudio.paused)return;
  const t=Number(state.ytTime)||0;
  const seg=state.sponsorSegments.find(x=>t>=x.start&&t<x.end-0.15);
  if(seg){
    state.ytTime=seg.end;
    if(state.playerEngine==="native"&&nativeVideo){
      try{nativeVideo.currentTime=seg.end;}catch{}
    }else{
      sendYT("seekTo",[seg.end,true]);
    }
  }
}
function primeBackgroundFromGesture(id){
  if(!id||!bgAudio)return false;
  try{bgAudio.pause();}catch{}
  bgAudio.dataset.id=id;
  bgAudio.dataset.source="direct";
  bgAudio.muted=true;
  bgAudio.volume=Math.max(0,Math.min(1,(Number(state.ytVolume)||100)/100));
  bgAudio.src=directMediaUrl(id,"audio");
  bgAudio.load();
  const p=bgAudio.play();
  if(p?.catch)p.catch(()=>{});
  return true;
}
function chooseNativeSource(info){
  if(!nativeVideo||!info)return null;
  const hls=String(info.hls||"");
  if(hls){
    const hlsSupport=nativeVideo.canPlayType("application/vnd.apple.mpegurl")||nativeVideo.canPlayType("application/x-mpegURL");
    if(hlsSupport)return {url:hls,mimeType:"application/vnd.apple.mpegurl",live:true};
  }
  const rows=Array.isArray(info.sources)?info.sources:[];
  let fallback=null;
  for(const row of rows){
    if(!row?.url)continue;
    const type=String(row.mimeType||"");
    if(!fallback)fallback=row;
    if(!type)return row;
    const support=nativeVideo.canPlayType(type);
    if(support==="probably")return row;
    if(support==="maybe"&&!fallback)fallback=row;
  }
  return fallback;
}
function stopNativePlayer(){
  if(!nativeVideo)return;
  try{nativeVideo.pause();nativeVideo.removeAttribute("src");nativeVideo.load();}catch{}
  nativeVideo.hidden=true;
}
function startYoutubeFallback(id,autoplay=true){
  if(!playerFrame||state.currentVideo!==id)return;
  state.playerEngine="youtube";
  state.nativeFallbackStarted=true;
  stopNativePlayer();
  playerFrame.hidden=false;
  playerFrame.src=api.playerUrl(id);
  if(autoplay){setTimeout(listenYT,250);setTimeout(listenYT,900);}
  const source=$("#videoSource");if(source)source.textContent="Nguồn · YouTube";
}
async function applyNativeInfo(id,seq,info,label){
  if(state.currentVideo!==id||seq!==state.playerLoadSeq)return false;
  const source=chooseNativeSource(info);
  if(!source?.url)return false;
  state.playerEngine="native";
  state.nativeInfo=info;
  state.nativeFallbackStarted=false;
  state.nativeSourceIndex=0;
  playerFrame.hidden=true;
  playerFrame.src="about:blank";
  nativeVideo.hidden=false;
  nativeVideo.poster=info.thumbnailUrl||"";
  nativeVideo.src=source.url;
  nativeVideo.load();
  setTimeout(()=>{
    if(state.currentVideo===id&&seq===state.playerLoadSeq&&state.playerEngine==="native"&&nativeVideo.readyState<2&&!state.nativeFallbackStarted){
      startYoutubeFallback(id);
    }
  },6500);
  updateMediaSession(info);
  const sourceLabel=$("#videoSource");if(sourceLabel)sourceLabel.textContent="Nguồn · "+label;
  const p=nativeVideo.play();
  if(p?.catch)p.catch(()=>{});
  return true;
}
async function startNativePlayer(id,seq){
  if(!nativeVideo)return startYoutubeFallback(id);
  try{
    const r=await extractorPlayback(id,5000);
    const ok=await applyNativeInfo(id,seq,r?.data||null,"NewPipe");
    if(ok)return;
  }catch{}
  try{
    if(!api.playback)throw new Error("no_piped_playback");
    const r=await api.playback(id);
    const ok=await applyNativeInfo(id,seq,r?.data||null,"Piped");
    if(ok)return;
  }catch{}
  if(state.currentVideo===id&&seq===state.playerLoadSeq)startYoutubeFallback(id);
}
function ensureVideoPlayer(id){
  if(!playerBox||!playerFrame)return;
  if(state.currentVideo!==id){
    ++state.playerLoadSeq;
    state.currentVideo=id;
    state.currentInfo=null;
    state.sponsorSegments=[];
    state.ytTime=0;
    state.ytDuration=0;
    state.ytPlayerState=-1;
    state.playerEngine="youtube";
    state.nativeInfo=null;
    state.nativeFallbackStarted=false;
    state.backgroundId="";
    state.backgroundInfo=null;
    state.backgroundReady=false;
    stopNativePlayer();
    playerFrame.hidden=false;
    playerFrame.src=api.playerUrl(id);
    miniTitle.textContent="Video";
    playerBox.hidden=false;
    setTimeout(listenYT,220);
    setTimeout(listenYT,800);
    setTimeout(enforceCaptionsOff,1200);
  }
  setPlayerMode("full");
}
function minimizeVideo(){
  if(state.currentVideo)setPlayerMode("mini");
}
function closeVideo(){
  try{bgAudio.pause();bgAudio.removeAttribute("src");bgAudio.load();}catch{}
  state.currentVideo="";
  state.currentInfo=null;
  state.sponsorSegments=[];
  state.backgroundId="";
  state.backgroundInfo=null;
  state.backgroundReady=false;
  state.backgroundSourceIndex=0;
  state.ytTime=0;
  state.ytDuration=0;
  state.ytPlayerState=-1;
  stopNativePlayer();
  if(playerFrame){playerFrame.hidden=true;playerFrame.src="about:blank";}
  state.playerEngine="none";
  state.nativeInfo=null;
  if(playerBox){playerBox.hidden=true;playerBox.classList.remove("full","mini","background-active");}
  document.title="1988";
}
function updateMiniTitle(title){
  if(miniTitle)miniTitle.textContent=title||"1988";
}
function updateMediaSession(info){
  if(!("mediaSession" in navigator)||!info)return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:info.title||"1988",
      artist:info.uploader||"",
      album:"1988",
      artwork:info.thumbnailUrl?[{src:info.thumbnailUrl,sizes:"512x512"}]:[]
    });
  }catch{}
}
function activeMediaElement(){
  if(bgAudio&&!bgAudio.paused&&state.backgroundId===state.currentVideo)return bgAudio;
  if(state.playerEngine==="native"&&nativeVideo)return nativeVideo;
  return bgAudio;
}
function updatePositionState(){
  if(!("mediaSession" in navigator)||typeof navigator.mediaSession.setPositionState!=="function")return;
  const media=activeMediaElement();
  const duration=Number(media?.duration);
  const position=Number(media?.currentTime);
  if(Number.isFinite(duration)&&duration>0&&Number.isFinite(position)&&position>=0&&position<=duration){
    try{navigator.mediaSession.setPositionState({duration,playbackRate:media.playbackRate||1,position});}catch{}
  }
}
function chooseBackgroundSource(info){
  const rows=Array.isArray(info?.sources)&&info.sources.length?info.sources:(info?.audioUrl?[{url:info.audioUrl,mimeType:info.mimeType||"",bitrate:info.bitrate||0}]:[]);
  if(!rows.length)return -1;
  if(!bgAudio?.canPlayType)return 0;
  let fallback=0;
  for(let i=0;i<rows.length;i++){
    const type=String(rows[i]?.mimeType||"");
    if(!type){fallback=i;continue;}
    const support=bgAudio.canPlayType(type);
    if(support==="probably")return i;
    if(support==="maybe")fallback=i;
  }
  return fallback;
}
function applyBackgroundSource(info,index){
  if(!bgAudio||!info)return false;
  const rows=Array.isArray(info.sources)&&info.sources.length?info.sources:(info.audioUrl?[{url:info.audioUrl,mimeType:info.mimeType||""}]:[]);
  const row=rows[index];
  if(!row?.url)return false;
  state.backgroundSourceIndex=index;
  bgAudio.dataset.id=info.id||state.currentVideo;
  bgAudio.dataset.source=String(index);
  bgAudio.src=row.url;
  bgAudio.load();
  return true;
}
function backgroundButtonState(text,disabled=false){
  const btn=$("#backgroundButton");
  if(!btn)return;
  const label=btn.querySelector("span:last-child");
  if(label)label.textContent=text;else btn.textContent=text;
  btn.disabled=!!disabled;
}
function warmBackgroundInfo(id){
  if(!bgAudio||bgAudio.dataset.id!==id||bgAudio.dataset.source!=="direct")return null;
  const src=bgAudio.currentSrc||bgAudio.src||"";
  if(!src)return null;
  return {
    id,
    title:state.nativeInfo?.title||state.currentInfo?.title||miniTitle?.textContent||"1988",
    uploader:state.nativeInfo?.uploader||state.currentInfo?.uploader||"",
    thumbnailUrl:state.nativeInfo?.thumbnailUrl||state.currentInfo?.thumbnailUrl||"",
    duration:Number(state.nativeInfo?.duration)||Number(state.currentInfo?.duration)||Number(state.ytDuration)||0,
    audioUrl:src,
    mimeType:"",
    sources:[{url:src,mimeType:"",bitrate:0,direct:true}]
  };
}
async function prepareBackground(id){
  if(!id||!bgAudio)return null;
  if(state.backgroundInfo?.id===id&&state.backgroundReady)return state.backgroundInfo;

  const warm=warmBackgroundInfo(id);
  if(warm){
    state.backgroundInfo=warm;
    state.backgroundSourceIndex=-1;
    state.backgroundReady=true;
    updateMediaSession(warm);
    backgroundButtonState("Phát nền",false);

    // Enrich the already-running direct audio with NewPipe metadata without
    // replacing or restarting the media element.
    extractorPlayback(id,4500).then(r=>{
      if(state.currentVideo!==id)return;
      const d=r?.data||{};
      const enriched={
        ...warm,
        title:d.title||warm.title,
        uploader:d.uploader||warm.uploader,
        duration:Number(d.duration)||warm.duration,
        sources:Array.isArray(d.audioSources)&&d.audioSources.length?d.audioSources:warm.sources
      };
      state.backgroundInfo=enriched;
      updateMediaSession(enriched);
    }).catch(()=>{});
    return warm;
  }

  // No primed audio (for example a direct URL open): NewPipe first, Piped fallback.
  try{
    const r=await extractorPlayback(id,5000);
    if(state.currentVideo!==id)return null;
    const d=r?.data||{};
    const info={
      id,
      title:d.title||miniTitle?.textContent||"1988",
      uploader:d.uploader||"",
      duration:Number(d.duration)||0,
      sources:Array.isArray(d.audioSources)?d.audioSources:[],
      audioUrl:Array.isArray(d.audioSources)&&d.audioSources[0]?.url?d.audioSources[0].url:""
    };
    const index=chooseBackgroundSource(info);
    if(index>=0&&applyBackgroundSource(info,index)){
      state.backgroundInfo=info;
      state.backgroundReady=true;
      updateMediaSession(info);
      backgroundButtonState("Phát nền",false);
      return info;
    }
  }catch{}

  try{
    const r=await api.background(id);
    if(state.currentVideo!==id)return null;
    const info=r?.data||null;
    const index=chooseBackgroundSource(info);
    if(info&&index>=0&&applyBackgroundSource(info,index)){
      state.backgroundInfo=info;
      state.backgroundReady=true;
      updateMediaSession(info);
      backgroundButtonState("Phát nền",false);
      return info;
    }
  }catch{}

  state.backgroundReady=false;
  backgroundButtonState("Nền chưa sẵn sàng",false);
  return null;
}
function maybeSkipBackgroundSponsor(){
  if(!bgAudio||bgAudio.paused)return;
  const t=Number(bgAudio.currentTime)||0;
  const seg=state.sponsorSegments.find(x=>t>=x.start&&t<x.end-0.15);
  if(seg){
    try{bgAudio.currentTime=seg.end;}catch{}
  }
}
function startBackgroundReady(id){
  const info=state.backgroundInfo;
  if(!id||!bgAudio||!info||info.id!==id||!state.backgroundReady)return false;
  const startAt=Math.max(0,Number(state.ytTime)||0);
  if(bgAudio.readyState>=1&&startAt>0){
    try{bgAudio.currentTime=Math.min(startAt,Math.max(0,(bgAudio.duration||startAt)-0.2));}catch{}
  }else if(startAt>0){
    bgAudio.addEventListener("loadedmetadata",()=>{
      try{bgAudio.currentTime=Math.min(startAt,Math.max(0,(bgAudio.duration||startAt)-0.2));}catch{}
    },{once:true});
  }
  bgAudio.muted=false;
  if(nativeVideo)bgAudio.volume=nativeVideo.volume;
  const playPromise=bgAudio.play();
  if(!playPromise||typeof playPromise.then!=="function")return false;
  playPromise.then(()=>{
    if(state.playerEngine==="native"&&nativeVideo)nativeVideo.pause();
    else sendYT("pauseVideo",[]);
    state.backgroundId=id;
    state.backgroundAuto=true;
    localStorage.setItem(BG_AUTO_KEY,"1");
    playerBox?.classList.add("background-active");
    updateMediaSession(info);
    if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";
    backgroundButtonState("Xem video",false);
  }).catch(()=>{
    backgroundButtonState("Thử lại phát nền",false);
  });
  return true;
}
async function toggleBackground(){
  const id=state.currentVideo;
  if(!id)return;
  if(state.backgroundId===id&&bgAudio&&!bgAudio.paused&&!bgAudio.muted){
    resumeForeground();
    return;
  }
  if(state.backgroundReady&&state.backgroundInfo?.id===id){
    startBackgroundReady(id);
    return;
  }
  backgroundButtonState("Đang chuẩn bị…",true);
  const info=await prepareBackground(id);
  if(info)startBackgroundReady(id);
}
function resumeForeground(){
  if(!bgAudio)return;
  const t=Number(bgAudio.currentTime)||Number(state.ytTime)||0;
  state.ytTime=t;
  state.backgroundId="";
  playerBox?.classList.remove("background-active");
  if(state.playerEngine==="youtube"){
    bgAudio.muted=true;
    try{bgAudio.currentTime=t;}catch{}
    if(bgAudio.paused){
      const ap=bgAudio.play();
      if(ap?.catch)ap.catch(()=>{});
    }
    sendYT("seekTo",[t,true]);
    sendYT("playVideo",[]);
  }else if(state.playerEngine==="native"&&nativeVideo){
    bgAudio.muted=true;
    try{nativeVideo.currentTime=t;}catch{}
    nativeVideo.play().catch(()=>{});
  }
  backgroundButtonState("Phát nền",false);
  if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";
}
function setupMediaSession(){
  if(!("mediaSession" in navigator))return;
  const safe=(name,fn)=>{try{navigator.mediaSession.setActionHandler(name,fn);}catch{}};
  safe("play",()=>{const m=activeMediaElement();m?.play?.().catch?.(()=>{});});
  safe("pause",()=>activeMediaElement()?.pause?.());
  safe("seekbackward",d=>{const m=activeMediaElement();if(m)m.currentTime=Math.max(0,m.currentTime-(d.seekOffset||10));});
  safe("seekforward",d=>{const m=activeMediaElement();if(m)m.currentTime=Math.min(m.duration||Infinity,m.currentTime+(d.seekOffset||10));});
  safe("seekto",d=>{const m=activeMediaElement();if(m&&Number.isFinite(d.seekTime))m.currentTime=d.seekTime;});
}
function showInstallSheet(){
  document.getElementById("installSheet")?.remove();
  const sheet=document.createElement("div");
  sheet.id="installSheet";
  sheet.className="install-sheet-backdrop";
  sheet.innerHTML='<div class="install-sheet" role="dialog" aria-modal="true" aria-label="Cài 1988">'
    +'<div class="install-sheet-handle"></div>'
    +'<div class="install-sheet-head"><strong>Cài 1988 trên iPhone</strong><button type="button" data-install-close aria-label="Đóng">×</button></div>'
    +'<div class="install-step"><b>1</b><span>Mở trang này bằng <strong>Safari</strong>.</span></div>'
    +'<div class="install-step"><b>2</b><span>Bấm <strong>Chia sẻ</strong> trong Safari.</span></div>'
    +'<div class="install-step"><b>3</b><span>Chọn <strong>Thêm vào Màn hình chính</strong>. Nếu chưa thấy, kéo xuống cuối → <strong>Sửa tác vụ / Edit Actions</strong> → bật mục này.</span></div>'
    +'<div class="install-step"><b>4</b><span>Bật <strong>Mở dưới dạng ứng dụng / Open as Web App</strong>, rồi bấm <strong>Thêm / Add</strong>.</span></div>'
    +'<div class="install-note">Mở 1988 từ biểu tượng vừa tạo trên Màn hình chính. Khi cài đúng dạng Web App, thanh địa chỉ Safari sẽ không còn.</div>'
    +'</div>';
  document.body.appendChild(sheet);
  sheet.addEventListener("click",e=>{
    if(e.target===sheet||e.target.closest("[data-install-close]"))sheet.remove();
  });
}
function setupPwa(){}
function setupZoomLock(){
  const editable=(target)=>target?.closest?.('input,textarea,[contenteditable="true"]');
  document.addEventListener("gesturestart",e=>{if(!editable(e.target))e.preventDefault();},{passive:false});
  document.addEventListener("gesturechange",e=>{if(!editable(e.target))e.preventDefault();},{passive:false});
  document.addEventListener("touchmove",e=>{if(e.touches?.length>1&&!editable(e.target))e.preventDefault();},{passive:false});
  let lastTouchEnd=0;
  document.addEventListener("touchend",e=>{
    if(editable(e.target)){lastTouchEnd=0;return;}
    const now=Date.now();
    if(now-lastTouchEnd<320)e.preventDefault();
    lastTouchEnd=now;
  },{passive:false});
}
try{
  setupZoomLock();
  setupMediaSession();
  setupPwa();
  setTimeout(()=>fetch(EXTRACTOR+"/health",{cache:"no-store",mode:"cors"}).catch(()=>{}),60);
  route();
  const bootParams=new URLSearchParams(location.search);
  if(!bootParams.has("q")&&!bootParams.has("v")&&!bootParams.has("playlist")&&!bootParams.has("channel")&&!bootParams.has("page")){
    setTimeout(()=>{
      if(!getFeedCache("trending:top")){
        api.trending("VN").then(r=>setFeedCache("trending:top",r.data||[])).catch(()=>{});
      }
    },300);
  }
}catch(err){
  console.error("1988 boot",err);
  if(view)view.innerHTML='<div class="error">1988 không khởi động được: '+esc(err?.message||"lỗi không xác định")+'</div>';
}