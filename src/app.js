const api=window.YT1988_API;

const $=(s,r=document)=>r.querySelector(s);
const view=$("#view");
if(!api)throw new Error("YT1988_API chưa khởi tạo");
const searchForm=$("#searchForm");
const searchInput=$("#searchInput");
const suggestionsEl=$("#suggestions");
const homeButton=$("#homeButton");
const HISTORY_KEY="1988.history.v3";
const PLAYLIST_KEY="1988.playlists.v1";
const BG_AUTO_KEY="1988.background.auto.v1";
const playerBox=$("#persistentPlayer");
const playerFrame=$("#playerFrame");
const miniTitle=$("#miniTitle");
const miniExpand=$("#miniExpand");
const miniClose=$("#miniClose");
const bgAudio=$("#backgroundAudio");
const installButton=$("#installButton");


const state={token:0,next:null,more:null,currentVideo:"",currentInfo:null,sponsorSegments:[],ytTime:0,backgroundId:"",backgroundInfo:null,backgroundAuto:localStorage.getItem(BG_AUTO_KEY)==="1"};
const dearrowCache=new Map();

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
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
  rows.unshift({id,title:info?.title||("Video "+id),thumbnail:info?.thumbnailUrl||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),uploaderName:info?.uploader||"",views:Number(info?.views)||0,duration:Number(info?.duration)||0});
  write(HISTORY_KEY,rows);
}
function savePlaylist(data,id){
  const rows=read(PLAYLIST_KEY).filter(x=>x.id!==id);
  rows.unshift({id,name:data?.name||"Danh sách phát",thumbnail:data?.thumbnailUrl||"",uploader:data?.uploader||"",videos:Number(data?.videos)||0});
  write(PLAYLIST_KEY,rows);
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
  return '<article class="item" data-kind="video" data-id="'+esc(id)+'"><div class="thumb-wrap"><img class="thumb" src="'+esc(thumb)+'" alt="" loading="lazy"><span class="duration">'+esc(dur(row.duration))+'</span></div><div class="video-body">'+(row.uploaderAvatar?'<img class="avatar" src="'+esc(row.uploaderAvatar)+'" alt="" loading="lazy">':'<div class="avatar"></div>')+'<div><h3 class="title">'+esc(row.title||"Video")+'</h3><div class="meta">'+esc(row.uploaderName||"")+(row.views>=0?" · "+esc(fmt(row.views))+" lượt xem":"")+'</div></div></div></article>';
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
    view.innerHTML='<div class="section-head"><h1>'+esc(title)+'</h1><small>'+esc(source?new URL(source).hostname:"")+'</small></div><div class="feed" id="feed"></div><button class="more" id="moreButton" type="button" hidden>Tải thêm</button>';
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
    return '<article class="row" data-kind="video" data-id="'+esc(id)+'"><img src="'+esc(row.thumbnail||("https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"))+'" alt="" loading="lazy"><div><div class="row-title">'+esc(row.title||"Video")+'</div><div class="row-meta">'+esc(row.uploaderName||"")+(row.views>=0?" · "+esc(fmt(row.views))+" lượt xem":"")+'</div></div></article>';
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
    if(data.title&&title)title.textContent=data.title;
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
function listenYT(){
  try{
    playerFrame?.contentWindow?.postMessage(JSON.stringify({event:"listening",id:"1988"}),"*");
  }catch{}
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
  state.ytTime=0;
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
async function prepareBackground(id){
  if(!id||!api.background)return null;
  if(state.backgroundInfo?.id===id)return state.backgroundInfo;
  try{
    const r=await api.background(id);
    if(state.currentVideo!==id)return null;
    const info=r?.data||null;
    if(!info?.audioUrl)return null;
    state.backgroundInfo=info;
    if(bgAudio&&bgAudio.dataset.id!==id&&!bgAudio.paused)bgAudio.pause();
    if(bgAudio&&bgAudio.dataset.id!==id){
      bgAudio.dataset.id=id;
      bgAudio.src=info.audioUrl;
      bgAudio.load();
    }
    updateMediaSession(info);
    return info;
  }catch{return null;}
}
async function startBackground(id,{auto=false}={}){
  const info=await prepareBackground(id);
  if(!info||!bgAudio)return false;
  if(bgAudio.dataset.id!==id){
    bgAudio.dataset.id=id;
    bgAudio.src=info.audioUrl;
    bgAudio.load();
  }
  const startAt=Math.max(0,Number(state.ytTime)||0);
  if(bgAudio.readyState>=1&&startAt>0){
    try{bgAudio.currentTime=Math.min(startAt,Math.max(0,(bgAudio.duration||startAt)-0.2));}catch{}
  }else if(startAt>0){
    bgAudio.addEventListener("loadedmetadata",()=>{
      try{bgAudio.currentTime=Math.min(startAt,Math.max(0,(bgAudio.duration||startAt)-0.2));}catch{}
    },{once:true});
  }
  sendYT("pauseVideo",[]);
  try{
    await bgAudio.play();
    state.backgroundId=id;
    state.backgroundAuto=true;
    localStorage.setItem(BG_AUTO_KEY,"1");
    playerBox?.classList.add("background-active");
    updateMediaSession(info);
    if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";
    const btn=$("#backgroundButton");if(btn)btn.textContent="Xem video";
    return true;
  }catch{
    if(!auto){
      const btn=$("#backgroundButton");if(btn)btn.textContent="Thử lại phát nền";
    }
    return false;
  }
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
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
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
  if(data?.event==="infoDelivery"&&Number.isFinite(Number(data?.info?.currentTime))){
    state.ytTime=Number(data.info.currentTime);
    maybeSkipSponsor();
  }
});

async function home(title="Dành cho bạn",nav="home"){
  setActive(nav);searchInput.value="";
  const token=++state.token;state.next=null;state.more=null;
  view.innerHTML='<div class="section-head"><h1>'+esc(title)+'</h1></div>'+loading();
  try{
    const r=await api.trending("VN");if(token!==state.token)return;
    renderCollection(title,r.data,r.source);
  }catch{if(token===state.token)view.innerHTML='<div class="error">Không tải được video. Thử lại sau.</div>';}
}
async function searchPage(q){
  setActive("");searchInput.value=q;
  const token=++state.token;state.next=null;
  view.innerHTML='<div class="section-head"><h1>Kết quả cho “'+esc(q)+'”</h1></div>'+loading();
  try{
    const r=await api.search(q,"all");if(token!==state.token)return;
    state.next=r.data?.nextpage||null;
    renderCollection("Kết quả cho “"+q+"”",r.data?.items||[],r.source);
    state.more=async()=>{
      if(!state.next)return;const next=state.next;state.next=null;$("#moreButton").hidden=true;
      const x=await api.searchNext(q,"all",next);state.next=x.data?.nextpage||null;renderCollection("",x.data?.items||[],"",true);
    };
  }catch{if(token===state.token)view.innerHTML='<div class="error">Tìm kiếm đang lỗi nguồn. Thử lại.</div>';}
}
function historyPage(){
  ++state.token;setActive("history");state.next=null;state.more=null;
  const items=read(HISTORY_KEY).map(x=>({type:"stream",url:"/watch?v="+x.id,title:x.title,thumbnail:x.thumbnail,uploaderName:x.uploaderName,views:x.views,duration:x.duration}));
  renderCollection("Đã xem",items);
}
function playlistsPage(){
  ++state.token;setActive("playlists");state.next=null;state.more=null;
  const items=read(PLAYLIST_KEY).map(x=>({type:"playlist",id:x.id,name:x.name,thumbnail:x.thumbnail,uploader:x.uploader,videos:x.videos}));
  renderCollection("Danh sách gần đây",items);
}
async function playlistPage(id){
  setActive("playlists");const token=++state.token;state.next=null;
  view.innerHTML='<div class="player-shell"><iframe id="playlistPlayer" src="'+esc(api.playlistPlayerUrl(id))+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div><section class="hero"><div class="hero-main"><div class="hero-avatar skeleton" style="border-radius:10px"></div><div><h1>Danh sách phát</h1><p>Đang tải thông tin…</p></div></div></section><div class="subhead">Video</div><div class="compact" id="feed"></div><button class="more" id="moreButton" type="button" hidden>Tải thêm</button>';
  try{
    const r=await api.playlist(id);if(token!==state.token)return;const d=r.data||{};savePlaylist(d,id);
    state.next=d.nextpage||null;
    const hero=$(".hero");
    if(hero)hero.innerHTML=(d.bannerUrl?'<img class="hero-cover" src="'+esc(d.bannerUrl)+'" alt="">':'')+'<div class="hero-main">'+(d.thumbnailUrl?'<img class="hero-avatar" style="border-radius:10px" src="'+esc(d.thumbnailUrl)+'" alt="">':'')+'<div><h1>'+esc(d.name||"Danh sách phát")+'</h1><p>'+esc(d.uploader||"")+' · '+esc(String(d.videos||0))+' video</p></div></div>';
    $("#feed").innerHTML=compactRows(d.relatedStreams||[]);
    void enhanceDeArrow($("#feed"));
    $("#moreButton").hidden=!state.next;
    state.more=async()=>{if(!state.next)return;const next=state.next;state.next=null;$("#moreButton").hidden=true;const x=await api.playlistNext(id,next);state.next=x.data?.nextpage||null;$("#feed").insertAdjacentHTML("beforeend",compactRows(x.data?.relatedStreams||x.data?.items||[]));void enhanceDeArrow($("#feed"));$("#moreButton").hidden=!state.next;};
  }catch{
    if(token===state.token){
      const hero=$(".hero");if(hero)hero.innerHTML='<div class="hero-main"><div><h1>Danh sách phát</h1><p>Player đã mở; dữ liệu danh sách đang tạm lỗi.</p></div></div>';
    }
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
async function watchPage(id){
  setActive("");const token=++state.token;
  ensureVideoPlayer(id);
  view.innerHTML='<div class="watch-layout"><section><div class="watch-info"><h1 id="watchTitle">Video '+esc(id)+'</h1><div class="channel-line" id="channelLine"></div><div class="watch-actions"><button class="pill" id="backgroundButton" type="button">Phát nền</button><button class="pill" id="minimizeButton" type="button">Thu nhỏ</button><button class="pill" id="reloadPlayer" type="button">Tải lại</button><button class="pill" id="shareVideo" type="button">Chia sẻ</button><span class="pill" id="sponsorBadge">SponsorBlock</span></div></div><div class="description" id="description" hidden></div></section><aside class="watch-side"><div class="subhead">Tiếp theo</div><div class="compact" id="related"></div></aside></div>';
  $("#backgroundButton").onclick=toggleBackground;
  $("#minimizeButton").onclick=()=>{minimizeVideo();navigate({});};
  $("#reloadPlayer").onclick=()=>{playerFrame.src=api.playerUrl(id);setTimeout(listenYT,400);};
  $("#shareVideo").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$("#shareVideo").textContent="Đã sao chép";setTimeout(()=>$("#shareVideo").textContent="Chia sẻ",900);}catch{}};
  void prepareBackground(id);
  try{
    const [r,s]=await Promise.all([api.video(id),api.sponsors(id).catch(()=>null)]);if(token!==state.token)return;const d=r.data||{};
    state.currentInfo=d;
    saveHistory(d,id);
    const title=d.title||("Video "+id);
    $("#watchTitle").textContent=title;updateMiniTitle(title);document.title=title+" · 1988";
    const cid=channelId(d.uploaderUrl||"");
    $("#channelLine").innerHTML=(d.uploaderAvatar?'<img src="'+esc(d.uploaderAvatar)+'" alt="">':'<div class="avatar"></div>')+'<div '+(cid?'data-kind="channel" data-id="'+esc(cid)+'" style="cursor:pointer"':'')+'><div class="channel-name">'+esc(d.uploader||"")+'</div><div class="channel-sub">'+esc(fmt(d.views||0))+' lượt xem · '+esc(d.uploadDate||"")+'</div></div>';
    if(d.description){$("#description").textContent=d.description;$("#description").hidden=false;}
    $("#related").innerHTML=compactRows((d.relatedStreams||[]).slice(0,18));
    void enhanceDeArrow($("#related"));
    api.branding?.([id]).then(x=>{const b=x?.data?.[id];if(b?.title&&token===state.token){$("#watchTitle").textContent=b.title;updateMiniTitle(b.title);}}).catch(()=>{});
    state.sponsorSegments=normalizeSponsors(s?.data);
    $("#sponsorBadge").textContent=state.sponsorSegments.length?"SponsorBlock · "+state.sponsorSegments.length+" đoạn":"SponsorBlock";
    const bg=await prepareBackground(id);if(bg)updateMediaSession({...bg,title});
  }catch{}
}
function route(){
  suggestionsEl.hidden=true;const p=new URLSearchParams(location.search);
  const v=p.get("v"),list=p.get("list"),channel=p.get("channel"),q=p.get("q"),page=p.get("page");
  if(v)return watchPage(v);
  if(list){closeVideo();return playlistPage(list);}
  if(state.currentVideo)minimizeVideo();
  if(channel)return channelPage(channel);if(q)return searchPage(q);
  if(page==="trending")return home("Thịnh hành tại Việt Nam","trending");
  if(page==="history")return historyPage();
  if(page==="playlists")return playlistsPage();
  return home();
}

view.addEventListener("click",e=>{
  const more=e.target.closest("#moreButton");if(more&&state.more){state.more().catch(()=>{});return;}
  const item=e.target.closest("[data-kind][data-id]");if(!item)return;
  const kind=item.dataset.kind,id=item.dataset.id;
  if(kind==="video")navigate({v:id});else if(kind==="playlist")navigate({list:id});else if(kind==="channel")navigate({channel:id});
});
homeButton.addEventListener("click",()=>navigate({}));
document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{const n=b.dataset.nav;if(n==="home")navigate({});else navigate({page:n});}));
searchForm.addEventListener("submit",e=>{e.preventDefault();const q=searchInput.value.trim();if(q)navigate({q});});
let suggestTimer=0,suggestAbort=0;
searchInput.addEventListener("input",()=>{
  clearTimeout(suggestTimer);const q=searchInput.value.trim();if(q.length<2){suggestionsEl.hidden=true;return;}
  const mark=++suggestAbort;suggestTimer=setTimeout(async()=>{try{const rows=(await api.suggestions(q)).slice(0,8);if(mark!==suggestAbort)return;suggestionsEl.innerHTML=rows.map(x=>'<button type="button" data-suggest="'+esc(x)+'">'+esc(x)+'</button>').join("");suggestionsEl.hidden=!rows.length;}catch{suggestionsEl.hidden=true;}},250);
});
suggestionsEl.addEventListener("click",e=>{const b=e.target.closest("[data-suggest]");if(!b)return;const q=b.dataset.suggest||"";searchInput.value=q;navigate({q});});
document.addEventListener("click",e=>{if(!e.target.closest(".search"))suggestionsEl.hidden=true;});
window.addEventListener("popstate",route);
playerFrame?.addEventListener("load",()=>{setTimeout(listenYT,250);setTimeout(listenYT,900);});
miniExpand?.addEventListener("click",()=>{if(state.currentVideo)navigate({v:state.currentVideo});});
miniClose?.addEventListener("click",closeVideo);
miniTitle?.addEventListener("click",()=>{if(state.currentVideo)navigate({v:state.currentVideo});});
bgAudio?.addEventListener("play",()=>{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";});
bgAudio?.addEventListener("pause",()=>{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";});
bgAudio?.addEventListener("timeupdate",updatePositionState);
bgAudio?.addEventListener("ended",()=>{state.backgroundId="";playerBox?.classList.remove("background-active");});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&state.backgroundAuto&&state.currentVideo&&bgAudio?.paused)void startBackground(state.currentVideo,{auto:true});
});
setupMediaSession();
setupPwa();
route();