const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";

const API_MEMORY_TTL={
  home:5*60*1000,
  trending:2*60*1000,
  search:60*1000,
  suggestions:5*60*1000,
  branding:5*60*1000
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
  branding:apiBranding,playerUrl,playlistPlayerUrl
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
const miniTitle=$("#miniTitle");
const miniExpand=$("#miniExpand");
const miniClose=$("#miniClose");
const bgAudio=$("#backgroundAudio");
const installButton=$("#installButton");
const playPauseButton=$("#playPauseButton");
const seekRange=$("#seekRange");
const currentTimeLabel=$("#currentTimeLabel");
const durationLabel=$("#durationLabel");
const muteButton=$("#muteButton");
const volumeRange=$("#volumeRange");
const fullscreenButton=$("#fullscreenButton");


const state={token:0,next:null,more:null,currentVideo:"",currentInfo:null,pendingVideoMeta:null,sponsorSegments:[],ytTime:0,ytDuration:0,ytPlayerState:-1,ytVolume:100,ytMuted:false,backgroundId:"",backgroundInfo:null,backgroundReady:false,backgroundSourceIndex:0,backgroundAuto:localStorage.getItem(BG_AUTO_KEY)==="1"};
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
  if(state.ytPlayerState===1)sendYT("pauseVideo",[]);
  else sendYT("playVideo",[]);
}
function togglePlayerMute(){
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
function enterPlayerFullscreen(){
  const target=playerFrame||playerBox;
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
  rows.unshift({id,title:cleanText(info?.title)||("Video "+id),thumbnail:info?.thumbnailUrl||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),uploaderName:info?.uploader||"",views:Number(info?.views)||0,duration:Number(info?.duration)||0});
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
  return '<article class="item" data-kind="video" data-id="'+esc(id)+'" data-title="'+esc(row.title||"Video")+'" data-uploader="'+esc(row.uploaderName||"")+'" data-views="'+esc(String(Number(row.views)||0))+'" data-duration="'+esc(String(Number(row.duration)||0))+'" data-thumb="'+esc(thumb)+'"><div class="thumb-wrap"><img class="thumb" src="'+esc(thumb)+'" alt="" loading="lazy"><span class="duration">'+esc(dur(row.duration))+'</span></div><div class="video-body">'+(row.uploaderAvatar?'<img class="avatar" src="'+esc(row.uploaderAvatar)+'" alt="" loading="lazy">':'<div class="avatar"></div>')+'<div class="video-text"><h3 class="title">'+esc(row.title||"Video")+'</h3><div class="meta meta-channel">'+esc(row.uploaderName||"")+'</div>'+(row.views>=0?'<div class="meta meta-stats">'+esc(fmt(row.views))+' lượt xem</div>':'')+'</div></div></article>';
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
    return '<article class="row" data-kind="video" data-id="'+esc(id)+'" data-title="'+esc(row.title||"Video")+'" data-uploader="'+esc(row.uploaderName||"")+'" data-views="'+esc(String(Number(row.views)||0))+'" data-duration="'+esc(String(Number(row.duration)||0))+'" data-thumb="'+esc(row.thumbnail||("https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"))+'"><img src="'+esc(row.thumbnail||("https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"))+'" alt="" loading="lazy"><div class="row-copy"><div class="row-title">'+esc(row.title||"Video")+'</div><div class="row-meta row-channel">'+esc(row.uploaderName||"")+'</div>'+(row.views>=0?'<div class="row-meta row-stats">'+esc(fmt(row.views))+' lượt xem</div>':'')+'</div></article>';
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
    sendYT("seekTo",[seg.end,true]);
  }
}
function ensureVideoPlayer(id){
  if(!playerBox||!playerFrame)return;
  if(state.currentVideo!==id){
    if(bgAudio&&!bgAudio.paused)bgAudio.pause();
    state.currentVideo=id;
    state.currentInfo=null;
    state.sponsorSegments=[];
    state.ytTime=0;
    state.ytDuration=0;
    state.ytPlayerState=-1;
    state.backgroundId="";
    state.backgroundInfo=null;
    playerFrame.src=api.playerUrl(id);
    miniTitle.textContent="Video";
    playerBox.hidden=false;
  }
  setPlayerMode("full");
  setTimeout(listenYT,250);
  setTimeout(listenYT,1000);
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
  if(playerFrame)playerFrame.src="about:blank";
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
function updatePositionState(){
  if(!("mediaSession" in navigator)||typeof navigator.mediaSession.setPositionState!=="function")return;
  const duration=Number(bgAudio?.duration);
  const position=Number(bgAudio?.currentTime);
  if(Number.isFinite(duration)&&duration>0&&Number.isFinite(position)&&position>=0&&position<=duration){
    try{navigator.mediaSession.setPositionState({duration,playbackRate:bgAudio.playbackRate||1,position});}catch{}
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
async function prepareBackground(id){
  if(!id||!api.background||!bgAudio)return null;
  if(state.backgroundInfo?.id===id&&state.backgroundReady)return state.backgroundInfo;
  state.backgroundReady=false;
  try{
    const r=await api.background(id);
    if(state.currentVideo!==id)return null;
    const info=r?.data||null;
    if(!info?.audioUrl&&!(Array.isArray(info?.sources)&&info.sources.length))return null;
    state.backgroundInfo=info;
    const index=chooseBackgroundSource(info);
    if(index<0||!applyBackgroundSource(info,index))return null;
    updateMediaSession(info);
    state.backgroundReady=true;
    backgroundButtonState("Phát nền",false);
    return info;
  }catch{
    backgroundButtonState("Nền không khả dụng",true);
    return null;
  }
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
  const playPromise=bgAudio.play();
  if(!playPromise||typeof playPromise.then!=="function")return false;
  playPromise.then(()=>{
    sendYT("pauseVideo",[]);
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
  if(bgAudio&&!bgAudio.paused&&bgAudio.dataset.id===id){
    resumeForeground();
    return;
  }
  if(state.backgroundReady&&state.backgroundInfo?.id===id){
    startBackgroundReady(id);
    return;
  }
  backgroundButtonState("Đang chuẩn bị…",true);
  const info=await prepareBackground(id);
  if(info)backgroundButtonState("Phát nền",false);
}
function resumeForeground(){
  if(!bgAudio)return;
  const t=Number(bgAudio.currentTime)||0;
  bgAudio.pause();
  state.ytTime=t;
  state.backgroundId="";
  playerBox?.classList.remove("background-active");
  sendYT("seekTo",[t,true]);
  sendYT("playVideo",[]);
  const btn=$("#backgroundButton");if(btn)btn.textContent="Phát nền";
  if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";
}
async function toggleBackground(){
  const id=state.currentVideo;
  if(!id)return;
  if(bgAudio&&!bgAudio.paused&&bgAudio.dataset.id===id)resumeForeground();
  else await startBackground(id);
}
function setupMediaSession(){
  if(!("mediaSession" in navigator))return;
  const safe=(name,fn)=>{try{navigator.mediaSession.setActionHandler(name,fn);}catch{}};
  safe("play",()=>bgAudio?.play());
  safe("pause",()=>bgAudio?.pause());
  safe("seekbackward",d=>{if(bgAudio)bgAudio.currentTime=Math.max(0,bgAudio.currentTime-(d.seekOffset||10));});
  safe("seekforward",d=>{if(bgAudio)bgAudio.currentTime=Math.min(bgAudio.duration||Infinity,bgAudio.currentTime+(d.seekOffset||10));});
  safe("seekto",d=>{if(bgAudio&&Number.isFinite(d.seekTime))bgAudio.currentTime=d.seekTime;});
}
function setupPwa(){
  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{}));
  }
  let deferred=null;
  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();deferred=e;if(installButton)installButton.hidden=false;
  });
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
  if(isiOS&&!standalone&&installButton)installButton.hidden=false;
  installButton?.addEventListener("click",async()=>{
    if(deferred){
      deferred.prompt();
      try{await deferred.userChoice;}catch{}
      deferred=null;installButton.hidden=true;
    }else if(isiOS){
      alert("Safari: bấm Chia sẻ → Thêm vào Màn hình chính để cài 1988.");
    }
  });
}
window.addEventListener("message",e=>{
  if(!String(e.origin||"").includes("youtube"))return;
  let data=e.data;
  try{if(typeof data==="string")data=JSON.parse(data);}catch{return;}
  if(data?.event==="onReady")enforceCaptionsOff();
  if(data?.event==="infoDelivery"){
    const info=data.info||{};
    if(Number.isFinite(Number(info.currentTime)))state.ytTime=Number(info.currentTime);
    if(Number.isFinite(Number(info.duration))&&Number(info.duration)>0)state.ytDuration=Number(info.duration);
    if(Number.isFinite(Number(info.playerState)))state.ytPlayerState=Number(info.playerState);
    if(Number.isFinite(Number(info.volume)))state.ytVolume=Number(info.volume);
    if(typeof info.muted==="boolean")state.ytMuted=info.muted;
    maybeSkipSponsor();
    updatePlayerControls();
  }
  if(data?.event==="onStateChange"){
    const value=Number(data.info);
    if(Number.isFinite(value)){state.ytPlayerState=value;updatePlayerControls();}
  }
});


async function home(topic="all"){
  setActive("home");searchInput.value="";
  const selected=HOME_TOPICS.find(x=>x.id===topic)||HOME_TOPICS[0];
  const token=++state.token;state.next=null;state.more=null;
  const cacheKey="home:fixed:"+selected.id;
  const cached=getFeedCache(cacheKey);
  if(cached?.length){
    renderCollection("Dành cho bạn",cached,"");
    view.insertAdjacentHTML("afterbegin",topicBar("home",selected.id));
  }else{
    view.innerHTML=topicBar("home",selected.id)+'<div class="section-head"><h1>Dành cho bạn</h1></div>'+loading();
  }
  try{
    const r=await api.home(selected.query);if(token!==state.token)return;
    const items=r.data?.items||r.data||[];
    setFeedCache(cacheKey,items);
    renderCollection("Dành cho bạn",items,"");
    view.insertAdjacentHTML("afterbegin",topicBar("home",selected.id));
  }catch{
    if(token===state.token&&!cached)view.innerHTML=topicBar("home",selected.id)+'<div class="error">Không tải được Trang chủ.</div>';
  }
}
async function trendingPage(topic="top"){
  setActive("trending");searchInput.value="";
  const selected=TREND_TOPICS.find(x=>x.id===topic)||TREND_TOPICS[0];
  const token=++state.token;state.next=null;state.more=null;
  const cacheKey="trending:"+selected.id;
  const cached=getFeedCache(cacheKey);
  const heading=selected.id==="top"?"Thịnh hành tại Việt Nam":selected.label;
  if(cached?.length){
    renderCollection(heading,cached,"");
    view.insertAdjacentHTML("afterbegin",topicBar("trending",selected.id));
  }else{
    view.innerHTML=topicBar("trending",selected.id)+'<div class="section-head"><h1>'+esc(heading)+'</h1></div>'+loading();
  }
  try{
    const r=selected.id==="top"?await api.trending("VN"):await api.search(selected.query,"videos");
    if(token!==state.token)return;
    const items=selected.id==="top"?(r.data||[]):(r.data?.items||[]);
    setFeedCache(cacheKey,items);
    renderCollection(heading,items,"");
    view.insertAdjacentHTML("afterbegin",topicBar("trending",selected.id));
  }catch{
    if(token===state.token&&!cached)view.innerHTML=topicBar("trending",selected.id)+'<div class="error">Không tải được '+esc(heading)+'.</div>';
  }
}

async function searchPage(q){
  setActive("");searchInput.value=q;
  const token=++state.token;state.next=null;
  const cacheKey="search:"+String(q||"").trim().toLocaleLowerCase("vi");
  const cached=getFeedCache(cacheKey);
  if(cached?.length)renderCollection("Kết quả tìm kiếm",cached,"");
  else view.innerHTML='<div class="section-head"><h1>Kết quả tìm kiếm</h1></div>'+loading();
  try{
    const r=await api.search(q,"all");if(token!==state.token)return;
    state.next=r.data?.nextpage||null;
    const items=r.data?.items||[];
    setFeedCache(cacheKey,items);
    renderCollection("Kết quả tìm kiếm",items,"");
    state.more=async()=>{
      if(!state.next)return;const next=state.next;state.next=null;$("#moreButton").hidden=true;
      const x=await api.searchNext(q,"all",next);state.next=x.data?.nextpage||null;renderCollection("",x.data?.items||[],"",true);
    };
  }catch{
    if(token===state.token&&!cached)view.innerHTML='<div class="error">Tìm kiếm đang lỗi nguồn. Thử lại.</div>';
  }
}
function historyPage(){
  ++state.token;setActive("history");state.next=null;state.more=null;
  const items=read(HISTORY_KEY).map(x=>({type:"stream",url:"/watch?v="+x.id,title:x.title,thumbnail:x.thumbnail,uploaderName:x.uploaderName,views:x.views,duration:x.duration}));
  renderCollection("Đã xem",items);
}

function playlistsPage(){
  ++state.token;setActive("playlists");state.next=null;state.more=null;
  const mine=readMyLists();
  const recent=read(PLAYLIST_KEY);
  const localCards=mine.map(list=>{
    const first=list.items?.[0]||{};
    return '<article class="library-card" data-kind="mylist" data-id="'+esc(list.id)+'"><div class="library-cover">'+(first.thumbnail?'<img src="'+esc(first.thumbnail)+'" alt="">':'<div class="library-placeholder">'+svgIcon("list",28)+'</div>')+'<div class="library-stack"></div><span class="library-count">'+esc(String(list.items?.length||0))+' video</span><span class="library-play">'+svgIcon("play",20)+'</span></div><div class="library-copy"><h3>'+esc(list.name)+'</h3><p>Danh sách của tôi</p></div></article>';
  }).join("");
  const ytCards=recent.map(list=>{
    return '<article class="library-card" data-kind="playlist" data-id="'+esc(list.id)+'"><div class="library-cover">'+(list.thumbnail?'<img src="'+esc(list.thumbnail)+'" alt="">':'<div class="library-placeholder">'+svgIcon("list",28)+'</div>')+'<div class="library-stack"></div><span class="library-count">'+esc(String(list.videos||0))+' video</span><span class="library-play">'+svgIcon("play",20)+'</span></div><div class="library-copy"><h3>'+esc(list.name||"Danh sách phát")+'</h3><p>'+esc(list.uploader||"Playlist YouTube")+'</p></div></article>';
  }).join("");
  view.innerHTML=
    '<div class="library-head"><div><h1>Danh sách</h1><p>Video và playlist bạn đã lưu</p></div><span class="library-total">'+esc(String(mine.length+recent.length))+'</span></div>'+
    '<section class="library-section"><div class="library-section-head"><h2>Danh sách của tôi</h2><span>'+esc(String(mine.length))+'</span></div><div class="library-grid">'+
      (localCards||'<div class="library-empty"><div>'+svgIcon("list",30)+'</div><strong>Chưa có danh sách</strong><span>Mở một video và chọn “Danh sách” để tạo.</span></div>')+
    '</div></section>'+
    '<section class="library-section"><div class="library-section-head"><h2>Playlist gần đây</h2><span>'+esc(String(recent.length))+'</span></div><div class="library-grid">'+
      (ytCards||'<div class="library-empty"><div>'+svgIcon("list",30)+'</div><strong>Chưa có playlist</strong><span>Playlist YouTube đã mở sẽ xuất hiện tại đây.</span></div>')+
    '</div></section>';
}

function myListPage(id){
  ++state.token;setActive("playlists");state.next=null;state.more=null;
  const list=readMyLists().find(x=>x.id===id);
  if(!list){view.innerHTML='<div class="error">Không tìm thấy danh sách.</div>';return;}
  const items=(list.items||[]).map(x=>({type:"stream",url:"/watch?v="+x.id,title:x.title,thumbnail:x.thumbnail,uploaderName:x.uploaderName,views:x.views,duration:x.duration}));
  const first=list.items?.[0]||null;
  view.innerHTML='<section class="playlist-detail"><div class="playlist-detail-cover">'+(first?.thumbnail?'<img src="'+esc(first.thumbnail)+'" alt="">':'<div class="playlist-detail-placeholder">'+svgIcon("list",32)+'</div>')+'</div><div class="playlist-detail-copy"><span class="playlist-kicker">Danh sách của tôi</span><h1>'+esc(list.name)+'</h1><p>'+esc(String(items.length))+' video</p><div class="playlist-actions">'+(first?'<button class="playlist-primary" id="playListFirst" type="button">'+svgIcon("play",17)+'<span>Phát từ đầu</span></button>':'')+'<button class="playlist-secondary" id="shareList" type="button">'+svgIcon("share",17)+'<span>Chia sẻ</span></button></div></div></section><div class="playlist-list-head"><strong>Video</strong><span>'+esc(String(items.length))+'</span></div><div class="compact playlist-video-list" id="feed">'+compactRows(items)+'</div>';
  if(first)$("#playListFirst").onclick=()=>{state.pendingVideoMeta={...first};navigate({v:first.id});};
  $("#shareList").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$("#shareList span:last-child").textContent="Đã sao chép";setTimeout(()=>{$("#shareList span:last-child").textContent="Chia sẻ";},900);}catch{}};
  void enhanceDeArrow($("#feed"));
}
async function playlistPage(id){
  setActive("playlists");const token=++state.token;state.next=null;state.more=null;
  view.innerHTML='<section class="playlist-detail playlist-loading"><div class="playlist-detail-cover skeleton"></div><div class="playlist-detail-copy"><div class="skeleton" style="height:11px;width:90px;border-radius:4px"></div><div class="skeleton" style="height:22px;width:75%;border-radius:5px;margin-top:10px"></div><div class="skeleton" style="height:11px;width:140px;border-radius:4px;margin-top:9px"></div></div></section><div class="playlist-list-head"><strong>Video</strong></div><div class="compact playlist-video-list" id="feed">'+loading()+'</div>';
  try{
    const r=await api.playlist(id);if(token!==state.token)return;
    const d=r.data||{};savePlaylist(d,id);
    let rows=Array.isArray(d.relatedStreams)?d.relatedStreams:[];
    state.next=d.nextpage||null;
    if(!rows.length&&state.next){
      try{
        const x=await api.playlistNext(id,state.next);
        if(token!==state.token)return;
        rows=x.data?.relatedStreams||x.data?.items||[];
        state.next=x.data?.nextpage||null;
      }catch{}
    }
    const first=rows[0]||null;
    view.innerHTML='<section class="playlist-detail"><div class="playlist-detail-cover">'+(d.thumbnailUrl?'<img src="'+esc(d.thumbnailUrl)+'" alt="">':'<div class="playlist-detail-placeholder">'+svgIcon("list",32)+'</div>')+'</div><div class="playlist-detail-copy"><span class="playlist-kicker">Playlist</span><h1>'+esc(d.name||"Danh sách phát")+'</h1><p>'+esc(d.uploader||"")+(d.videos>=0?' · '+esc(String(d.videos))+' video':'')+'</p><div class="playlist-actions">'+(first?'<button class="playlist-primary" id="playListFirst" type="button">'+svgIcon("play",17)+'<span>Phát từ đầu</span></button>':'')+'<button class="playlist-secondary" id="shareList" type="button">'+svgIcon("share",17)+'<span>Chia sẻ</span></button></div></div></section><div class="playlist-list-head"><strong>Video</strong><span>'+esc(String(d.videos||rows.length||0))+'</span></div><div class="compact playlist-video-list" id="feed">'+compactRows(rows)+'</div><button class="more" id="moreButton" type="button" '+(state.next?"":"hidden")+'>Tải thêm</button>';
    if(first){
      const firstId=videoId(first.url||first.videoId||"");
      $("#playListFirst").onclick=()=>{if(!firstId)return;state.pendingVideoMeta={id:firstId,title:cleanText(first.title||""),uploaderName:cleanText(first.uploaderName||""),views:Number(first.views)||0,duration:Number(first.duration)||0,thumbnail:first.thumbnail||""};navigate({v:firstId});};
    }
    $("#shareList").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$("#shareList span:last-child").textContent="Đã sao chép";setTimeout(()=>{$("#shareList span:last-child").textContent="Chia sẻ";},900);}catch{}};
    void enhanceDeArrow($("#feed"));
    state.more=async()=>{
      if(!state.next)return;
      const next=state.next;state.next=null;$("#moreButton").hidden=true;
      const x=await api.playlistNext(id,next);
      state.next=x.data?.nextpage||null;
      $("#feed").insertAdjacentHTML("beforeend",compactRows(x.data?.relatedStreams||x.data?.items||[]));
      void enhanceDeArrow($("#feed"));
      $("#moreButton").hidden=!state.next;
    };
  }catch{
    if(token===state.token)view.innerHTML='<div class="error">Không tải được nội dung danh sách. Thử lại.</div>';
  }
}
async function channelPage(id){
  setActive("");const token=++state.token;state.next=null;
  view.innerHTML='<div class="hero"><div class="skeleton" style="height:170px;border-radius:12px"></div></div>'+loading();
  try{
    const r=await api.channel(id);if(token!==state.token)return;const d=r.data||{};state.next=d.nextpage||null;
    view.innerHTML='<section class="hero">'+(d.bannerUrl?'<img class="hero-cover" src="'+esc(d.bannerUrl)+'" alt="">':'')+'<div class="hero-main">'+(d.avatarUrl?'<img class="hero-avatar" src="'+esc(d.avatarUrl)+'" alt="">':'')+'<div><h1>'+esc(d.name||"Kênh")+'</h1><p>'+esc(fmt(d.subscriberCount||0))+' người đăng ký</p></div></div>'+(d.description?'<p>'+esc(d.description)+'</p>':'')+'</section><div class="subhead">Video</div><div class="compact" id="feed">'+compactRows(d.relatedStreams||[])+'</div><button class="more" id="moreButton" type="button" '+(state.next?"":"hidden")+'>Tải thêm</button>';
    void enhanceDeArrow($("#feed"));
    state.more=async()=>{if(!state.next)return;const next=state.next;state.next=null;$("#moreButton").hidden=true;const x=await api.channelNext(id,next);state.next=x.data?.nextpage||null;$("#feed").insertAdjacentHTML("beforeend",compactRows(x.data?.relatedStreams||x.data?.items||[]));void enhanceDeArrow($("#feed"));$("#moreButton").hidden=!state.next;};
  }catch{if(token===state.token)view.innerHTML='<div class="error">Không mở được kênh.</div>';}
}
async function fillRelated(title,id,initial=[]){
  const related=$("#related");
  if(!related)return;
  let rows=Array.isArray(initial)?initial.filter(row=>videoId(row?.url||row?.videoId||"")!==id):[];
  if(!rows.length&&title){
    try{
      const r=await api.search(title,"videos");
      rows=(r?.data?.items||[]).filter(row=>videoId(row?.url||row?.videoId||"")!==id);
    }catch{}
  }
  related.innerHTML=compactRows(rows.slice(0,18));
  if(!rows.length)related.innerHTML='<div class="related-empty">Chưa có gợi ý liên quan.</div>';
  else void enhanceDeArrow(related);
}
async function watchPage(id){
  setActive("");const token=++state.token;
  ensureVideoPlayer(id);
  const pending=state.pendingVideoMeta?.id===id?state.pendingVideoMeta:null;
  const cached=read(HISTORY_KEY).find(x=>x.id===id);
  const instant=pending||cached;
  const initialTitle=cleanText(instant?.title)||"Đang tải thông tin…";
  view.innerHTML='<div class="watch-layout"><section class="watch-main"><div class="video-meta-block"><h1 id="watchTitle">'+esc(initialTitle)+'</h1><div class="channel-line" id="channelLine">'+(instant?.uploaderName?'<div class="channel-copy"><div class="channel-name">'+esc(instant.uploaderName)+'</div></div>':'')+'</div><div class="video-facts"><span id="videoSource" class="source-label">Nguồn · YouTube</span><span id="videoStats" class="video-stats">'+(instant?.views?esc(fmt(instant.views))+' lượt xem':'')+(instant?.duration?' · '+esc(dur(instant.duration)):'')+'</span></div></div><div class="watch-actions">'+actionButton("backgroundButton","headphones","Phát nền")+actionButton("addListButton","list","Danh sách")+actionButton("minimizeButton","minimize","Thu nhỏ")+actionButton("reloadPlayer","reload","Tải lại")+actionButton("shareVideo","share","Chia sẻ")+'<span class="action-status" id="sponsorBadge">'+svgIcon("shield",17)+'<span>SponsorBlock</span></span></div><div class="description" id="description" hidden></div></section><aside class="watch-side"><div class="related-heading">Gợi ý liên quan</div><div class="compact" id="related"><div class="related-loading"><span></span><span></span><span></span></div></div></aside></div>';
  $("#backgroundButton").disabled=true;$("#backgroundButton").querySelector("span:last-child").textContent="Đang chuẩn bị";$("#backgroundButton").onclick=toggleBackground;
  $("#addListButton").onclick=openPlaylistSheet;
  $("#minimizeButton").onclick=()=>{minimizeVideo();navigate({});};
  $("#reloadPlayer").onclick=()=>{playerFrame.src=api.playerUrl(id);setTimeout(listenYT,400);};
  $("#shareVideo").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$("#shareVideo").querySelector("span:last-child").textContent="Đã sao chép";setTimeout(()=>{$("#shareVideo").querySelector("span:last-child").textContent="Chia sẻ";},900);}catch{}};
  void prepareBackground(id);
  try{
    const [r,s]=await Promise.all([api.video(id),api.sponsors(id).catch(()=>null)]);if(token!==state.token)return;const d=r.data||{};
    state.currentInfo=d;
    const title=cleanText(d.title)||cleanText(instant?.title)||("Video "+id);
    const uploader=cleanText(d.uploader)||cleanText(instant?.uploaderName)||"";
    saveHistory({...d,title,uploader},id);
    $("#watchTitle").textContent=title;updateMiniTitle(title);document.title=title+" · 1988";
    const cid=channelId(d.uploaderUrl||"");
    $("#channelLine").innerHTML=(d.uploaderAvatar?'<img src="'+esc(d.uploaderAvatar)+'" alt="">':'')+'<div class="channel-copy" '+(cid?'data-kind="channel" data-id="'+esc(cid)+'" style="cursor:pointer"':'')+'><div class="channel-name">'+esc(uploader||"Không rõ kênh")+'</div><div class="channel-sub">'+(d.uploadDate?esc(d.uploadDate):"")+'</div></div>';
    $("#videoSource").textContent="Nguồn · YouTube";
    const stats=[];if(Number(d.views)>0)stats.push(fmt(d.views)+" lượt xem");if(Number(d.duration)>0)stats.push(dur(d.duration));$("#videoStats").textContent=stats.join(" · ");
    if(d.description){$("#description").textContent=cleanText(d.description);$("#description").hidden=false;}
    void fillRelated(title,id,d.relatedStreams||[]);
    api.branding?.([id]).then(x=>{const b=x?.data?.[id];if(b?.title&&token===state.token){const clean=cleanText(b.title);$("#watchTitle").textContent=clean;updateMiniTitle(clean);}}).catch(()=>{});
    state.sponsorSegments=normalizeSponsors(s?.data);
    $("#sponsorBadge").innerHTML=svgIcon("shield",17)+'<span>'+(state.sponsorSegments.length?("SponsorBlock · "+state.sponsorSegments.length):"SponsorBlock")+'</span>';
    const bg=await prepareBackground(id);if(bg)updateMediaSession({...bg,title});
  }catch{
    const fallbackTitle=cleanText(instant?.title)||("Video "+id);
    $("#watchTitle").textContent=fallbackTitle;updateMiniTitle(fallbackTitle);
    void fillRelated(fallbackTitle,id,[]);
  }
}
function route(){
  closeSuggestions();const p=new URLSearchParams(location.search);
  const v=p.get("v"),list=p.get("list"),mylist=p.get("mylist"),channel=p.get("channel"),q=p.get("q"),page=p.get("page"),topic=p.get("topic")||"";
  if(v)return watchPage(v);
  if(list){if(state.currentVideo)minimizeVideo();return playlistPage(list);}
  if(mylist){if(state.currentVideo)minimizeVideo();return myListPage(mylist);}
  if(state.currentVideo)minimizeVideo();
  if(channel)return channelPage(channel);if(q)return searchPage(q);
  if(page==="trending")return trendingPage(topic||"top");
  if(page==="history")return historyPage();
  if(page==="playlists")return playlistsPage();
  return home(topic||"all");
}

view.addEventListener("click",e=>{
  const more=e.target.closest("#moreButton");if(more&&state.more){state.more().catch(()=>{});return;}
  const item=e.target.closest("[data-kind][data-id]");if(!item)return;
  const kind=item.dataset.kind,id=item.dataset.id;
  if(kind==="video"){
    state.pendingVideoMeta={
      id,
      title:cleanText(item.querySelector(".title,.row-title")?.textContent||item.dataset.title||""),
      uploaderName:cleanText(item.dataset.uploader||item.querySelector(".meta-channel,.row-channel")?.textContent||""),
      views:Number(item.dataset.views)||0,
      duration:Number(item.dataset.duration)||0,
      thumbnail:item.dataset.thumb||item.querySelector("img")?.src||""
    };
    navigate({v:id});
  }else if(kind==="playlist")navigate({list:id});else if(kind==="mylist")navigate({mylist:id});else if(kind==="channel")navigate({channel:id});
});
view.addEventListener("click",e=>{
  const chip=e.target.closest("[data-topic-kind][data-topic-id]");
  if(!chip)return;
  const kind=chip.dataset.topicKind,topic=chip.dataset.topicId;
  if(kind==="trending")navigate({page:"trending",topic});
  else navigate({topic});
});
homeButton.addEventListener("click",()=>navigate({}));
document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{const n=b.dataset.nav;if(n==="home")navigate({});else navigate({page:n});}));
let suggestTimer=0,suggestAbort=0;
const suggestionRowsCache=new Map();
let lastSuggestionRows=[];
function renderSuggestions(rows){
  const clean=[...new Set((rows||[]).map(cleanText).filter(x=>x&&!x.includes("\uFFFD")))].slice(0,8);
  suggestionsEl.innerHTML=clean.map(x=>'<button type="button" data-suggest="'+esc(x)+'">'+esc(x)+'</button>').join("");
  suggestionsEl.hidden=!clean.length;
  return clean;
}
function closeSuggestions(){clearTimeout(suggestTimer);suggestAbort++;suggestionsEl.hidden=true;suggestionsEl.innerHTML="";}
searchForm.addEventListener("submit",e=>{e.preventDefault();const q=searchInput.value.trim();if(q){closeSuggestions();searchInput.blur();navigate({q});}});
searchInput.addEventListener("input",()=>{
  clearTimeout(suggestTimer);const q=searchInput.value.trim();if(q.length<2){closeSuggestions();return;}
  const key=q.toLocaleLowerCase("vi");
  const exact=suggestionRowsCache.get(key);
  if(exact?.length)renderSuggestions(exact);
  else{
    const provisional=lastSuggestionRows.filter(x=>cleanText(x).toLocaleLowerCase("vi").includes(key)).slice(0,8);
    if(provisional.length)renderSuggestions(provisional);
  }
  const mark=++suggestAbort;suggestTimer=setTimeout(async()=>{try{
    const raw=await api.suggestions(q);
    const rows=[...new Set((raw||[]).map(cleanText).filter(x=>x&&!x.includes("\uFFFD")))].slice(0,8);
    suggestionRowsCache.set(key,rows);
    lastSuggestionRows=rows;
    if(suggestionRowsCache.size>40)suggestionRowsCache.delete(suggestionRowsCache.keys().next().value);
    if(mark!==suggestAbort)return;
    renderSuggestions(rows);
  }catch{
    if(mark===suggestAbort&&!suggestionsEl.innerHTML)suggestionsEl.hidden=true;
  }},70);
});
searchInput.addEventListener("focus",()=>{if(searchInput.value.trim().length>=2)searchInput.dispatchEvent(new Event("input"));});
suggestionsEl.addEventListener("click",e=>{const b=e.target.closest("[data-suggest]");if(!b)return;const q=b.dataset.suggest||"";searchInput.value=q;closeSuggestions();searchInput.blur();navigate({q});});
document.addEventListener("click",e=>{
  if(!e.target.closest(".search"))closeSuggestions();
  if(e.target.closest("[data-close-sheet]")||e.target.classList.contains("sheet-backdrop"))document.getElementById("playlistSheet")?.remove();
  const add=e.target.closest("[data-add-list]");
  if(add){
    addCurrentToList(add.dataset.addList);
    add.querySelector("small").textContent="Đã thêm";
  }
});
document.addEventListener("click",e=>{
  if(e.target.id!=="createListButton")return;
  const input=document.getElementById("newListName");
  const id=createListFromCurrent(input?.value||"");
  if(id)document.getElementById("playlistSheet")?.remove();
});
window.addEventListener("popstate",route);
playerFrame?.addEventListener("load",()=>{setTimeout(listenYT,250);setTimeout(listenYT,900);setTimeout(enforceCaptionsOff,1600);});
playPauseButton?.addEventListener("click",togglePlayerPlayback);
seekRange?.addEventListener("input",()=>{state.ytTime=Number(seekRange.value)||0;updatePlayerControls();});
seekRange?.addEventListener("change",()=>sendYT("seekTo",[Number(seekRange.value)||0,true]));
muteButton?.addEventListener("click",togglePlayerMute);
volumeRange?.addEventListener("input",()=>{
  const v=Math.max(0,Math.min(100,Number(volumeRange.value)||0));
  state.ytVolume=v;
  state.ytMuted=v===0;
  sendYT("setVolume",[v]);
  if(v>0)sendYT("unMute",[]);
  updatePlayerControls();
});
fullscreenButton?.addEventListener("click",enterPlayerFullscreen);
miniExpand?.addEventListener("click",()=>{if(state.currentVideo)navigate({v:state.currentVideo});});
miniClose?.addEventListener("click",closeVideo);
miniTitle?.addEventListener("click",()=>{if(state.currentVideo)navigate({v:state.currentVideo});});
bgAudio?.addEventListener("play",()=>{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";});
bgAudio?.addEventListener("pause",()=>{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";});
bgAudio?.addEventListener("timeupdate",()=>{updatePositionState();maybeSkipBackgroundSponsor();});
bgAudio?.addEventListener("ended",()=>{state.backgroundId="";playerBox?.classList.remove("background-active");});
bgAudio?.addEventListener("error",()=>{
  const info=state.backgroundInfo;
  const rows=Array.isArray(info?.sources)?info.sources:[];
  const next=state.backgroundSourceIndex+1;
  if(info&&next<rows.length&&applyBackgroundSource(info,next)){
    state.backgroundReady=true;
    if(state.backgroundId===state.currentVideo){
      const p=bgAudio.play();
      if(p?.catch)p.catch(()=>{});
    }else{
      backgroundButtonState("Phát nền",false);
    }
  }else{
    state.backgroundReady=false;
    backgroundButtonState("Nền không khả dụng",true);
  }
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&bgAudio&&!bgAudio.paused&&state.currentVideo){
    updateMediaSession(state.backgroundInfo||state.currentInfo||{title:miniTitle?.textContent||"1988"});
  }
});
try{
  setupMediaSession();
  setupPwa();
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