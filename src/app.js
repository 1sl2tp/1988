"use strict";

const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";
const MEDIA_SERVICE="https://one988-media.onrender.com";

const $=s=>document.querySelector(s);
const searchForm=$("#searchForm");
const queryInput=$("#queryInput");
const playerSection=$("#playerSection");
const videoTitle=$("#videoTitle");
const videoMeta=$("#videoMeta");
const ytPlayerHost=$("#yt-player");
const nativePlayer=$("#nativePlayer");
const suggestions=$("#suggestions");
const topicChips=$("#topicChips");
const videoBtn=$("#videoBtn");
const backgroundBtn=$("#backgroundBtn");
const lockBtn=$("#lockBtn");
const shareBtn=$("#shareBtn");
const statusText=$("#statusText");
const feed=$("#feed");
const feedTitle=$("#feedTitle");
const feedStatus=$("#feedStatus");
const bgAudio=$("#bgAudio");
const installBtn=$("#installBtn");
const installSheet=$("#installSheet");
const closeInstallSheet=$("#closeInstallSheet");

const state={
  player:null,
  playerReady:false,
  pendingVideoId:"",
  currentId:"",
  currentMeta:null,
  mode:"video",
  installPrompt:null,
  audioMaster:false,
  engine:"iframe",
  nativeSource:"",
  activeFeed:"home",
  videoPlaying:false,
  floatRaf:0,
  floatGesture:null,
  floatBox:null,
  keepFloating:false,
  floatDock:"right",
  floatTucked:false,
  fullscreenScrollY:null,
  intentPlay:false,
  resumeOnReturn:false,
  transitionUntil:0,
  resumeTimer:0,
  feedLoading:false,
  feedHasMore:true,
  feedRows:[],
  feedSeq:0
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

async function localEngine(timeoutMs=15000){
  if(window.YTLocal)return window.YTLocal;
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(fn,value)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      window.removeEventListener("ytlocalready",onReady);
      fn(value);
    };
    const onReady=()=>window.YTLocal
      ?finish(resolve,window.YTLocal)
      :finish(reject,new Error("ytlocal_missing"));
    const timer=setTimeout(()=>finish(reject,new Error("ytlocal_timeout")),timeoutMs);
    window.addEventListener("ytlocalready",onReady,{once:true});
  });
}

function ensureFloatHandles(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame||frame.querySelector(".float-dock-edge"))return;

  const dock=document.createElement("div");
  dock.className="float-dock-edge";
  dock.setAttribute("aria-label","Di chuyển hoặc thu gọn video");

  const resize=document.createElement("div");
  resize.className="float-resize-edge";
  resize.setAttribute("aria-label","Đổi kích thước video");

  frame.append(dock,resize);

  const start=(mode,event)=>{
    if(!frame.classList.contains("floating-iframe"))return;
    event.preventDefault();
    event.stopPropagation();

    if(state.floatTucked){
      state.floatTucked=false;
      frame.classList.remove("float-tucked");
    }

    const rect=frame.getBoundingClientRect();
    state.floatGesture={
      id:event.pointerId,
      mode,
      startX:event.clientX,
      startY:event.clientY,
      left:rect.left,
      top:rect.top,
      width:rect.width,
      moved:false
    };

    frame.style.left=rect.left+"px";
    frame.style.top=rect.top+"px";
    frame.style.right="auto";
    frame.style.bottom="auto";
    frame.style.width=rect.width+"px";

    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  };

  dock.addEventListener("pointerdown",event=>start("move",event));
  resize.addEventListener("pointerdown",event=>start("resize",event));

  const onMove=event=>{
    const g=state.floatGesture;
    if(!g||g.id!==event.pointerId||!frame.classList.contains("floating-iframe"))return;
    event.preventDefault();

    const dx=event.clientX-g.startX;
    const dy=event.clientY-g.startY;
    if(Math.abs(dx)+Math.abs(dy)>8)g.moved=true;

    if(g.mode==="resize"){
      const maxWidth=Math.max(220,Math.min(window.innerWidth-16,560));
      const minWidth=Math.min(220,Math.max(170,window.innerWidth*.42));
      const direction=state.floatDock==="right"?-1:1;
      const width=Math.max(minWidth,Math.min(maxWidth,g.width+(dx*direction)));
      const height=width*9/16;
      frame.style.width=width+"px";

      let left=g.left;
      if(state.floatDock==="right")left=g.left+g.width-width;
      left=Math.max(8,Math.min(window.innerWidth-width-8,left));
      const top=Math.max(8,Math.min(window.innerHeight-height-8,g.top+dy*.15));
      frame.style.left=left+"px";
      frame.style.top=top+"px";
      return;
    }

    const rect=frame.getBoundingClientRect();
    const left=Math.max(8,Math.min(window.innerWidth-rect.width-8,g.left+dx));
    const top=Math.max(8,Math.min(window.innerHeight-rect.height-8,g.top+dy));
    frame.style.left=left+"px";
    frame.style.top=top+"px";
  };

  const stop=event=>{
    const g=state.floatGesture;
    if(!g||g.id!==event.pointerId)return;

    const rect=frame.getBoundingClientRect();

    if(g.mode==="move"&&!g.moved){
      state.floatTucked=!state.floatTucked;
      frame.classList.toggle("float-tucked",state.floatTucked);
    }else if(g.mode==="move"){
      const dx=event.clientX-g.startX;
      const snapLeft=rect.left+rect.width/2<window.innerWidth/2;
      state.floatDock=snapLeft?"left":"right";
      const left=snapLeft?8:Math.max(8,window.innerWidth-rect.width-8);
      frame.style.left=left+"px";
      frame.classList.toggle("dock-left",snapLeft);
      frame.classList.toggle("dock-right",!snapLeft);

      const swipedIntoEdge=(snapLeft&&dx<-26)||(!snapLeft&&dx>26);
      if(swipedIntoEdge){
        state.floatTucked=true;
        frame.classList.add("float-tucked");
      }
    }

    const finalRect=frame.getBoundingClientRect();
    state.floatBox={
      left:Number.parseFloat(frame.style.left)||finalRect.left,
      top:Number.parseFloat(frame.style.top)||finalRect.top,
      width:finalRect.width
    };
    state.floatGesture=null;
  };

  dock.addEventListener("pointermove",onMove);
  resize.addEventListener("pointermove",onMove);
  dock.addEventListener("pointerup",stop);
  resize.addEventListener("pointerup",stop);
  dock.addEventListener("pointercancel",stop);
  resize.addEventListener("pointercancel",stop);
}
function restoreFloatBox(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  frame.classList.toggle("dock-left",state.floatDock==="left");
  frame.classList.toggle("dock-right",state.floatDock!=="left");
  frame.classList.toggle("float-tucked",state.floatTucked);

  const box=state.floatBox;
  if(!box)return;

  const width=Math.max(170,Math.min(box.width,window.innerWidth-16));
  const height=width*9/16;
  const left=Math.max(8,Math.min(window.innerWidth-width-8,box.left));
  const top=Math.max(8,Math.min(window.innerHeight-height-8,box.top));
  frame.style.width=width+"px";
  frame.style.left=left+"px";
  frame.style.top=top+"px";
  frame.style.right="auto";
  frame.style.bottom="auto";
}
function clearFloatBoxStyles(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;
  for(const prop of ["left","top","right","bottom","width"])frame.style.removeProperty(prop);
}

function applyFloatingIframe(force){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  const floating=frame.classList.contains("floating-iframe");

  if(
    force===false ||
    state.engine!=="iframe" ||
    !state.currentId ||
    playerSection.hidden
  ){
    if(floating){
      const rect=frame.getBoundingClientRect();
      if(rect.width>0){
        state.floatBox={left:rect.left,top:rect.top,width:rect.width};
      }
      frame.classList.remove("floating-iframe","float-tucked");
      state.floatTucked=false;
      clearFloatBoxStyles();
      playerSection.style.removeProperty("min-height");
    }
    return;
  }

  const rect=playerSection.getBoundingClientRect();
  const chipsBottom=topicChips?.getBoundingClientRect?.().bottom||0;
  const boundary=Math.max(0,chipsBottom);
  const nearTop=window.scrollY<=12;

  // Float only after the original player area has completely passed the
  // sticky header/chips. As soon as that original area comes back into view,
  // return the iframe to its real place.
  const passedOriginal=rect.bottom<=boundary+4;
  const originalReturning=rect.bottom>boundary+18;

  const shouldFloat=nearTop
    ? false
    : floating
      ? !originalReturning
      : passedOriginal;

  if(shouldFloat===floating)return;

  if(shouldFloat){
    playerSection.style.minHeight=Math.max(1,Math.round(frame.getBoundingClientRect().height))+"px";
    frame.classList.add("floating-iframe");
    ensureFloatHandles();
    restoreFloatBox();
  }else{
    if(floating){
      const rect=frame.getBoundingClientRect();
      if(rect.width>0){
        state.floatBox={
          left:rect.left,
          top:rect.top,
          width:rect.width
        };
      }
    }
    frame.classList.remove("floating-iframe","float-tucked","dock-left","dock-right");
    state.floatTucked=false;
    clearFloatBoxStyles();
    playerSection.style.removeProperty("min-height");
  }
}

function queueFloatingIframe(){
  const frame=playerSection?.querySelector(".player-frame");
  if(frame?.classList.contains("floating-iframe"))state.fullscreenScrollY=window.scrollY;
  if(state.floatRaf)return;
  state.floatRaf=requestAnimationFrame(()=>{
    state.floatRaf=0;
    applyFloatingIframe();
  });
}

function setupFloatingIframe(){
  window.addEventListener("scroll",queueFloatingIframe,{passive:true});
  window.addEventListener("resize",queueFloatingIframe,{passive:true});
  window.visualViewport?.addEventListener?.("resize",queueFloatingIframe,{passive:true});
  window.visualViewport?.addEventListener?.("scroll",queueFloatingIframe,{passive:true});
}

function markPlaybackTransition(){
  if(state.mode!=="video"||!state.currentId)return;
  let playing=state.videoPlaying;
  try{
    const ps=state.player?.getPlayerState?.();
    playing=playing||ps===YT.PlayerState.PLAYING||ps===YT.PlayerState.BUFFERING;
  }catch{}
  if(!playing&&!state.intentPlay)return;
  state.intentPlay=true;
  state.resumeOnReturn=true;
  state.transitionUntil=Date.now()+5000;
}

function resumeVideoAfterReturn(){
  if(
    state.mode!=="video" ||
    !state.currentId ||
    !state.intentPlay ||
    MediaCore.modeUsesAudio(state.mode)
  )return;

  state.resumeOnReturn=false;
  state.transitionUntil=Date.now()+1400;
  clearTimeout(state.resumeTimer);

  const attempt=()=>{
    if(state.mode!=="video"||!state.currentId||!state.intentPlay)return;
    try{
      const ps=state.player?.getPlayerState?.();
      if(ps===YT.PlayerState.PLAYING){
        state.videoPlaying=true;
        applyFloatingIframe();
        return;
      }
      ensureIframePlaying();
    }catch{}
  };

  attempt();
  state.resumeTimer=setTimeout(attempt,220);
  setTimeout(attempt,650);
}

function setupFullscreenReturn(){
  const remember=()=>{
    state.fullscreenScrollY=window.scrollY;
    markPlaybackTransition();
  };
  const restore=()=>{
    const y=state.fullscreenScrollY;
    requestAnimationFrame(()=>{
      if(y!==null&&y!==undefined)window.scrollTo({top:y,left:0,behavior:"instant"});
      applyFloatingIframe();
      resumeVideoAfterReturn();
    });
  };

  document.addEventListener("fullscreenchange",()=>{
    if(document.fullscreenElement)remember();
    else restore();
  });
  document.addEventListener("webkitfullscreenchange",()=>{
    if(document.webkitFullscreenElement)remember();
    else restore();
  });

  window.addEventListener("pagehide",markPlaybackTransition,{passive:true});
  window.addEventListener("pageshow",restore,{passive:true});
}
function showNativePlayer(){
  state.engine="native";
  nativePlayer.hidden=false;
  ytPlayerHost.hidden=true;
}

function showIframePlayer(){
  state.engine="iframe";
  nativePlayer.hidden=true;
  ytPlayerHost.hidden=false;
}

function clearSuggestions(){
  suggestions.hidden=true;
  suggestions.innerHTML="";
}

function setActiveChip(name){
  state.activeFeed=name||"";
  let activeButton=null;
  topicChips?.querySelectorAll(".topic-chip").forEach(button=>{
    const active=button.dataset.feed===state.activeFeed;
    button.classList.toggle("active",active);
    if(active)activeButton=button;
  });
  if(activeButton&&topicChips){
    requestAnimationFrame(()=>{
      const left=Math.max(0,activeButton.offsetLeft-(topicChips.clientWidth-activeButton.offsetWidth)/2);
      topicChips.scrollTo({left,behavior:"smooth"});
    });
  }
}

function extractVideoId(value=""){
  const raw=clean(value);
  if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
  try{
    const u=new URL(raw);
    const host=u.hostname.replace(/^www\./,"");
    if(host==="youtu.be"){
      const id=u.pathname.split("/").filter(Boolean)[0]||"";
      if(/^[A-Za-z0-9_-]{11}$/.test(id))return id;
    }
    if(host.endsWith("youtube.com")||host.endsWith("youtube-nocookie.com")){
      const v=u.searchParams.get("v")||"";
      if(/^[A-Za-z0-9_-]{11}$/.test(v))return v;
      const parts=u.pathname.split("/").filter(Boolean);
      const marker=["shorts","embed","live"].find(x=>parts[0]===x);
      if(marker&&/^[A-Za-z0-9_-]{11}$/.test(parts[1]||""))return parts[1];
    }
  }catch{}
  const m=raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
  return m?.[1]||"";
}

function itemVideoId(row={}){
  return extractVideoId(row.videoId||row.url||row.id||"");
}

function thumb(row={},id=""){
  const value=row.thumbnail||row.thumbnailUrl||row.thumbnails?.[0]?.url||"";
  return value||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
}

function fmtViews(n){
  n=Number(n)||0;
  if(n>=1e9)return (n/1e9).toFixed(1).replace(".0","")+" tỷ";
  if(n>=1e6)return (n/1e6).toFixed(1).replace(".0","")+" Tr";
  if(n>=1e3)return (n/1e3).toFixed(1).replace(".0","")+" N";
  return n.toLocaleString("vi-VN");
}

function fmtDuration(sec){
  sec=Math.max(0,Number(sec)||0);
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  return h?String(h)+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m)+":"+String(s).padStart(2,"0");
}


const SOURCE_ALIASES=[
  {name:"VTV24",aliases:["vtv24","vtv 24"]},
  {name:"VTC NOW",aliases:["vtc now","vtcnow","vtc"]},
  {name:"ANTV",aliases:["antv","công an nhân dân","cong an nhan dan"]},
  {name:"VNEWS",aliases:["vnews","thông tấn","thong tan"]},
  {name:"Thanh Niên",aliases:["thanh niên","thanh nien"]},
  {name:"Tuổi Trẻ",aliases:["tuổi trẻ","tuoi tre"]},
  {name:"VnExpress",aliases:["vnexpress"]},
  {name:"Dân Trí",aliases:["dân trí","dan tri"]},
  {name:"VietnamNet",aliases:["vietnamnet"]},
  {name:"Lao Động",aliases:["lao động","lao dong"]},
  {name:"Người Lao Động",aliases:["người lao động","nguoi lao dong"]},
  {name:"PLO",aliases:["plo","pháp luật tp","phap luat tp"]}
];

function normalizeSearchText(value=""){
  return String(value||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d")
    .replace(/Đ/g,"D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function requestedSource(query=""){
  const q=normalizeSearchText(query);
  if(!q)return null;
  for(const source of SOURCE_ALIASES){
    if(source.aliases.some(alias=>q.includes(normalizeSearchText(alias))))return source;
  }
  return null;
}

function sourceAwareRows(rows=[],query=""){
  const source=requestedSource(query);
  if(!source)return rows;
  const aliases=source.aliases.map(normalizeSearchText);
  const matches=[];
  const rest=[];
  for(const row of rows){
    const channel=normalizeSearchText(row?.uploaderName||row?.uploader||row?.channelName||"");
    const title=normalizeSearchText(row?.title||"");
    const hit=aliases.some(alias=>channel.includes(alias)||title.startsWith(alias+" "));
    (hit?matches:rest).push(row);
  }
  return matches.length?matches:rows;
}

function publishedLabel(row={}){
  const unix=Number(row.uploaded||row.published||row.publishedAt||0);
  if(Number.isFinite(unix)&&unix>0){
    const d=new Date(unix<1e12?unix*1000:unix);
    if(!Number.isNaN(d.getTime())){
      return d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});
    }
  }
  return clean(row.uploadDate||row.uploadedDate||row.publishedText||"");
}

function publishedAgeMs(row={}){
  if(row?.isLive)return -1;
  const raw=normalizeSearchText(
    row?.publishedText||
    row?.uploadDate||
    row?.uploadedDate||
    ""
  );
  if(!raw)return Number.MAX_SAFE_INTEGER;
  if(/vua xong|just now|moments ago/.test(raw))return 0;

  const m=raw.match(/(\d+)\s*(giay|phut|gio|ngay|tuan|thang|nam|second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)/);
  if(m){
    const n=Number(m[1])||0;
    const unit=m[2];
    const minute=60*1000;
    if(/giay|second/.test(unit))return n*1000;
    if(/phut|minute/.test(unit))return n*minute;
    if(/gio|hour/.test(unit))return n*60*minute;
    if(/ngay|day/.test(unit))return n*24*60*minute;
    if(/tuan|week/.test(unit))return n*7*24*60*minute;
    if(/thang|month/.test(unit))return n*30*24*60*minute;
    if(/nam|year/.test(unit))return n*365*24*60*minute;
  }

  const parsed=Date.parse(row?.uploadDate||row?.uploadedDate||row?.publishedText||"");
  if(Number.isFinite(parsed))return Math.max(0,Date.now()-parsed);
  return Number.MAX_SAFE_INTEGER;
}

function newestFirst(rows=[]){
  return rows
    .map((row,index)=>({row,index,age:publishedAgeMs(row)}))
    .sort((a,b)=>(a.age-b.age)||(a.index-b.index))
    .map(item=>item.row);
}

function mergeUniqueRows(base=[],extra=[]){
  const seen=new Set();
  const out=[];
  for(const row of [...base,...extra]){
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

async function api(action,params={},timeoutMs=8000){
  const url=new URL(BASE);
  url.searchParams.set("action",action);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined&&v!==null&&v!=="")url.searchParams.set(k,String(v));
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url.toString(),{
      cache:"no-store",
      signal:controller.signal
    });
    const body=await res.json().catch(()=>null);
    if(!res.ok||body?.ok===false)throw new Error(body?.error||("HTTP "+res.status));
    return body;
  }finally{
    clearTimeout(timer);
  }
}

async function backgroundSources(id){
  if(!id)return [];
  const local=await localEngine(20000);
  const row=await local.media(id,"audio");
  if(!row?.url)return [];
  return [{
    url:row.url,
    mimeType:row.mimeType||"audio/mp4",
    bitrate:128000,
    priority:1000,
    engine:"youtubejs-local"
  }];
}

const backgroundPlayer=new HTML5BackgroundPlayer({
  audio:bgAudio,
  sourcesFor:backgroundSources,
  onState(event){
    if(event.id&&event.id!==state.currentId)return;

    if(event.type==="armed"){
      statusText.textContent="Đang chuẩn bị âm thanh nền…";
    }

    if(event.type==="source"){
      state.audioMaster=true;
      pauseVideoEngine();
      statusText.textContent=state.mode==="lock"
        ?"Âm thanh khóa màn hình đã sẵn sàng"
        :"Âm thanh nền đang phát";
      updateModeUi();
    }

    if(event.type==="ready"&&!event.count){
      state.audioMaster=false;
      statusText.textContent="Chưa lấy được luồng âm thanh nền";
    }

    if(event.type==="ended"){
      state.audioMaster=false;
      statusText.textContent="Đã phát xong";
      updateModeUi();
    }
  }
});

function renderCards(rows=[],options={}){
  const append=options.append===true;
  const seen=new Set(
    append
      ? [...feed.querySelectorAll("[data-video-id]")].map(card=>card.dataset.videoId).filter(Boolean)
      : []
  );
  const cards=[];
  for(const row of rows){
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    const title=clean(row.title)||"Video";
    const channel=clean(row.uploaderName||row.uploader||row.channelName||"");
    const views=Number(row.views)||0;
    const viewText=clean(row.viewText||"");
    const duration=Number(row.duration)||0;
    const isLive=!!row.isLive;
    const published=publishedLabel(row)||clean(row.publishedText||"");
    const statBits=[];
    if(viewText)statBits.push(viewText);
    else if(views)statBits.push(fmtViews(views)+" lượt xem");
    if(published)statBits.push(published);
    cards.push(
      '<article class="card" data-video-id="'+esc(id)+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-view-text="'+esc(viewText)+'" data-duration="'+esc(String(duration))+'" data-live="'+(isLive?'1':'0')+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumb(row,id))+'">'+
        '<div class="thumb-wrap"><img src="'+esc(thumb(row,id))+'" alt="" loading="lazy">'+(isLive?'<span class="live-badge">LIVE</span>':duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+'</div>'+
        '<div class="card-copy"><div class="card-title">'+esc(title)+'</div>'+
          '<div class="card-channel">'+esc(channel)+'</div>'+
          '<div class="card-stats">'+esc(statBits.join(" · "))+'</div>'+
        '</div>'+
      '</article>'
    );
  }

  if(append){
    if(cards.length)feed.insertAdjacentHTML("beforeend",cards.join(""));
  }else{
    feed.innerHTML=cards.join("")||'<div class="empty">Chưa có video.</div>';
  }

  const total=feed.querySelectorAll("[data-video-id]").length;
  feedStatus.textContent=total?total+" video":"";
  return cards.length;
}

function rowFromCard(card){
  return {
    title:card.dataset.title||"",
    uploader:card.dataset.channel||"",
    views:Number(card.dataset.views)||0,
    viewText:card.dataset.viewText||"",
    duration:Number(card.dataset.duration)||0,
    isLive:card.dataset.live==="1",
    uploadDate:card.dataset.published||"",
    publishedText:card.dataset.published||"",
    thumbnailUrl:card.dataset.thumb||""
  };
}

function updateNow(meta={}){
  const title=clean(meta.title)||"Video";
  const channel=clean(meta.uploader||meta.uploaderName||"");
  const views=Number(meta.views)||0;
  const duration=Number(meta.duration)||0;
  const published=publishedLabel(meta);
  videoTitle.textContent=title;
  const bits=[];
  if(channel)bits.push(channel);
  if(views)bits.push(fmtViews(views)+" lượt xem");
  if(published)bits.push("Đăng "+published.replace(/^Đăng\s+/i,""));
  if(duration)bits.push(fmtDuration(duration));
  videoMeta.textContent=bits.join(" · ");
  document.title=title+" · 1988";
  updateMediaSession(meta);
}

function updateModeUi(){
  const active=state.mode;
  const rows=[
    [videoBtn,"video"],
    [backgroundBtn,"audio"],
    [lockBtn,"lock"]
  ];
  rows.forEach(([button,mode])=>{
    if(!button)return;
    button.hidden=false;
    button.classList.toggle("active",active===mode);
    button.setAttribute("aria-pressed",active===mode?"true":"false");
  });

}

function updateMediaSession(meta=state.currentMeta||{}){
  backgroundPlayer.setMetadata(meta);
}

function getVideoTime(){
  if(state.engine==="native"){
    return Math.max(0,Number(nativePlayer.currentTime)||0);
  }
  try{return Math.max(0,Number(state.player?.getCurrentTime?.())||0);}catch{return 0;}
}

function seekVideo(time){
  const target=Math.max(0,Number(time)||0);
  if(state.engine==="native"){
    try{nativePlayer.currentTime=target;}catch{}
    return;
  }
  try{state.player?.seekTo?.(target,true);}catch{}
}

function playVideoEngine(){
  if(state.engine==="native"){
    void nativePlayer.play().catch(()=>{});
    return;
  }
  try{ensureIframePlaying();}catch{}
}

function pauseVideoEngine(){
  if(state.engine==="native"){
    try{nativePlayer.pause();}catch{}
    return;
  }
  try{state.player?.pauseVideo?.();}catch{}
}

function setupMediaSession(){
  if(!("mediaSession" in navigator))return;
  const safe=(name,handler)=>{try{navigator.mediaSession.setActionHandler(name,handler);}catch{}};
  const usingAudio=()=>MediaCore.modeUsesAudio(state.mode);
  safe("play",()=>{
    if(usingAudio())void backgroundPlayer.play();
    else{
      state.intentPlay=true;
      playVideoEngine();
    }
  });
  safe("pause",()=>{
    if(usingAudio())backgroundPlayer.pause();
    else{
      state.intentPlay=false;
      state.resumeOnReturn=false;
      state.transitionUntil=0;
      pauseVideoEngine();
    }
  });
  safe("seekbackward",details=>{
    const offset=Number(details.seekOffset)||10;
    if(usingAudio())backgroundPlayer.seek(backgroundPlayer.time-offset);
    else seekVideo(getVideoTime()-offset);
  });
  safe("seekforward",details=>{
    const offset=Number(details.seekOffset)||10;
    if(usingAudio())backgroundPlayer.seek(backgroundPlayer.time+offset);
    else seekVideo(getVideoTime()+offset);
  });
  safe("seekto",details=>{
    if(!Number.isFinite(details.seekTime))return;
    if(usingAudio())backgroundPlayer.seek(details.seekTime);
    else seekVideo(details.seekTime);
  });
}

function restoreVideoAfterAudioFailure(message){
  state.audioMaster=false;
  state.mode="video";
  backgroundPlayer.stop();
  playVideoEngine();
  updateModeUi();
  statusText.textContent=message||"Chưa lấy được âm thanh nền · video tiếp tục phát";
}

function startBackgroundMode(mode){
  if(!state.currentId)return;
  const targetMode=mode==="lock"?"lock":"audio";
  const id=state.currentId;

  state.mode=targetMode;
  backgroundPlayer.select(id,{metadata:state.currentMeta||{}});
  updateModeUi();

  statusText.textContent=targetMode==="lock"
    ?"Đang chuẩn bị âm thanh khóa màn hình…"
    :"Đang yêu cầu link âm thanh nền…";

  const activate=async()=>{
    if(state.currentId!==id||state.mode!==targetMode)return;
    try{
      // Read the iframe time only when the real source is ready. The visible
      // video keeps playing while public-source resolution happens.
      await backgroundPlayer.activate(id,{
        time:getVideoTime(),
        metadata:state.currentMeta||{}
      });
    }catch{
      if(state.currentId===id&&state.mode===targetMode){
        backgroundPlayer.forget(id);
        restoreVideoAfterAudioFailure();
      }
    }
  };

  if(backgroundPlayer.hasPrepared(id)){
    void activate();
    return;
  }

  // Keep a silent HTML5 audio element user-activated for iOS while resolving.
  // Do not pause the YouTube iframe until a real audio source emits "playing".
  backgroundPlayer.arm(id,{metadata:state.currentMeta||{}});
  void backgroundPlayer.prepare(id).then(rows=>{
    if(state.currentId!==id||state.mode!==targetMode)return;
    if(!rows.length){
      restoreVideoAfterAudioFailure();
      return;
    }
    void activate();
  });
}

function returnToVideo(){
  if(!state.currentId)return;
  const time=state.audioMaster?backgroundPlayer.time:getVideoTime();
  backgroundPlayer.pause();
  state.audioMaster=false;
  state.mode="video";
  state.intentPlay=true;
  seekVideo(time);
  playVideoEngine();
  statusText.textContent="Video YouTube đang phát trực tiếp";
  updateModeUi();
}

async function playVideo(id,seedMeta={}){
  if(!id)return;

  const frame=playerSection?.querySelector(".player-frame");
  const wasFloating=!!frame?.classList.contains("floating-iframe");
  const keepScrollY=window.scrollY;
  state.keepFloating=wasFloating;

  state.currentId=id;
  state.currentMeta={...seedMeta};
  state.intentPlay=true;
  state.resumeOnReturn=false;
  state.mode="video";
  state.audioMaster=false;
  state.nativeSource="";
  state.pendingVideoId=id;
  state.videoPlaying=wasFloating;
  playerSection.hidden=false;
  if(!wasFloating)applyFloatingIframe(false);

  backgroundPlayer.pause();
  backgroundPlayer.select(id,{metadata:seedMeta});

  try{nativePlayer.pause();}catch{}
  nativePlayer.removeAttribute("src");

  updateNow(seedMeta);
  showIframePlayer();
  updateModeUi();
  statusText.textContent="Đang mở YouTube…";

  if(!wasFloating){
    try{
      playerSection.scrollIntoView({behavior:"smooth",block:"start"});
    }catch{
      playerSection.scrollIntoView();
    }
  }else{
    requestAnimationFrame(()=>{
      if(Math.abs(window.scrollY-keepScrollY)>2)window.scrollTo({top:keepScrollY,left:0,behavior:"instant"});
      applyFloatingIframe();
    });
  }

  if(state.playerReady&&state.player){
    state.pendingVideoId="";
    try{
      state.player.unMute?.();
      state.player.loadVideoById(id);
      ensureIframePlaying();
      statusText.textContent="Video YouTube đang phát";
    }catch{
      state.pendingVideoId=id;
    }
  }else{
    initYouTubePlayer();
  }

  // Metadata is optional: iframe starts immediately, while details/related
  // results are enriched in parallel without delaying playback.
  void localEngine(7000).then(async local=>{
    const detail=await local.info(id).catch(()=>({meta:{},related:[]}));
    if(state.currentId!==id)return;
    const meta={...seedMeta,...(detail?.meta||{})};
    state.currentMeta=meta;
    updateNow(meta);
    backgroundPlayer.setMetadata(meta);
    const related=Array.isArray(detail?.related)?detail.related:[];
    if(related.length&&!state.activeFeed){
      feedTitle.textContent="Gợi ý tiếp theo";
      state.feedHasMore=false;
      renderCards(related.slice(0,24));
    }
  }).catch(()=>{});
}

function forceCaptionsOff(){
  if(!state.player)return;
  try{
    state.player.setOption?.("captions","track",{});
  }catch{}
  try{
    state.player.setOption?.("cc","track",{});
  }catch{}
}

function ensureIframePlaying(){
  if(!state.player||!state.currentId||!state.intentPlay||state.mode!=="video")return;

  const attempt=()=>{
    if(!state.player||!state.currentId||!state.intentPlay||state.mode!=="video")return;
    forceCaptionsOff();
    try{
      const ps=state.player.getPlayerState?.();
      if(ps===YT.PlayerState.PLAYING||ps===YT.PlayerState.BUFFERING)return;
      state.player.playVideo?.();
    }catch{}
  };

  attempt();
  setTimeout(attempt,180);
  setTimeout(attempt,520);
}

function initYouTubePlayer(){
  if(state.player||!window.YT||typeof YT.Player!=="function")return false;

  state.player=new YT.Player("yt-player",{
    host:"https://www.youtube-nocookie.com",
    height:"100%",
    width:"100%",
    playerVars:{
      autoplay:1,
      playsinline:1,
      controls:1,
      cc_load_policy:0,
      rel:0,
      fs:1,
      modestbranding:1,
      iv_load_policy:3,
      enablejsapi:1,
      origin:location.origin
    },
    events:{
      onReady(){
        state.playerReady=true;
        forceCaptionsOff();
        const id=state.pendingVideoId||state.currentId;
        state.pendingVideoId="";
        if(id){
          try{
            state.player.unMute?.();
            state.player.loadVideoById(id);
            ensureIframePlaying();
          }catch{}
        }
      },
      onStateChange(event){
        if(event.data===YT.PlayerState.PLAYING){
          forceCaptionsOff();
          state.videoPlaying=true;
          state.intentPlay=true;
          state.resumeOnReturn=false;
          state.transitionUntil=0;
          state.keepFloating=false;
          applyFloatingIframe();
          if(state.mode==="video")statusText.textContent="Video YouTube đang phát";
          try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch{}
        }else if(event.data===YT.PlayerState.BUFFERING){
          forceCaptionsOff();
          if(state.intentPlay)ensureIframePlaying();
        }else if(event.data===YT.PlayerState.CUED){
          forceCaptionsOff();
          if(state.intentPlay)ensureIframePlaying();
        }else if(event.data===YT.PlayerState.PAUSED){
          state.videoPlaying=false;

          const lifecyclePause=
            document.visibilityState!=="visible" ||
            state.resumeOnReturn ||
            Date.now()<state.transitionUntil;

          if(lifecyclePause&&state.intentPlay){
            setTimeout(resumeVideoAfterReturn,90);
          }else{
            // Parent page is visible and stable: this came from the user's
            // YouTube controls, so keep PAUSE exactly as requested.
            state.intentPlay=false;
            state.resumeOnReturn=false;
            state.transitionUntil=0;
          }

          // Do not change floating/inline layout on PAUSE; that caused the
          // visible flash/jump on mobile.
          if(state.mode==="video"){
            try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";}catch{}
          }
        }else if(event.data===YT.PlayerState.ENDED){
          state.videoPlaying=false;
          state.intentPlay=false;
          state.resumeOnReturn=false;
          state.transitionUntil=0;
          applyFloatingIframe();
          if(state.mode==="video")statusText.textContent="Đã phát xong";
        }
      },
      onApiChange(){
        forceCaptionsOff();
      },
      onError(){
        statusText.textContent="YouTube không phát được video này";
      }
    }
  });
  return true;
}

window.onYouTubeIframeAPIReady=()=>{
  if(state.engine==="iframe")initYouTubePlayer();
};

if(!(window.YT&&typeof YT.Player==="function")){
  let ytWait=0;
  const ytTimer=setInterval(()=>{
    ytWait++;
    if(window.YT&&typeof YT.Player==="function"){
      clearInterval(ytTimer);
      if(state.engine==="iframe")initYouTubePlayer();
    }else if(ytWait>100){
      clearInterval(ytTimer);
    }
  },100);
}

async function doSearch(value){
  const q=clean(value);
  if(!q)return;
  clearSuggestions();
  setActiveChip("");
  state.feedHasMore=false;
  state.feedRows=[];

  const id=extractVideoId(q);
  if(id){
    await playVideo(id,{
      title:"Đang tải thông tin…",
      thumbnailUrl:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"
    });
    return;
  }

  feedTitle.textContent='Kết quả cho “'+q+'”';
  feed.innerHTML='<div class="loading">Đang tìm…</div>';
  feedStatus.textContent="";

  // Same fast discovery path used by Kira proof. Do not wait for the
  // heavier local YouTubeJS session before showing results on main.
  try{
    const r=await api("search",{q,filter:"videos"},10000);
    const rows=Array.isArray(r?.data?.items)?r.data.items:[];
    if(!rows.length)throw new Error("empty_search");
    renderCards(sourceAwareRows(rows,q));
    return;
  }catch(error){
    console.warn("1988 search API failed; trying local engine",error);
  }

  try{
    const local=await localEngine(9000);
    const rows=await local.search(q,{type:"video"});
    renderCards(sourceAwareRows(rows,q));
  }catch{
    feed.innerHTML='<div class="error">Không tìm được video. Thử lại.</div>';
    feedStatus.textContent="";
  }
}

searchForm.addEventListener("submit",e=>{
  e.preventDefault();
  void doSearch(queryInput.value);
  queryInput.blur();
});

let suggestTimer=0;
let suggestSeq=0;
queryInput.addEventListener("input",()=>{
  clearTimeout(suggestTimer);
  const q=clean(queryInput.value);
  if(q.length<2){
    clearSuggestions();
    return;
  }
  const seq=++suggestSeq;
  suggestTimer=setTimeout(async()=>{
    let rows=[];
    try{
      const r=await api("suggestions",{q},4000);
      rows=Array.isArray(r?.data)?r.data:[];
    }catch{}
    if(!rows.length){
      try{
        const local=await localEngine(6000);
        rows=await local.suggestions(q);
      }catch{}
    }
    if(seq!==suggestSeq||clean(queryInput.value)!==q)return;
    if(!rows.length){
      clearSuggestions();
      return;
    }
    suggestions.innerHTML=rows.slice(0,8).map(value=>
      '<button type="button" data-suggestion="'+esc(value)+'">'+esc(value)+'</button>'
    ).join("");
    suggestions.hidden=false;
  },140);
});

suggestions.addEventListener("click",e=>{
  const button=e.target.closest("[data-suggestion]");
  if(!button)return;
  queryInput.value=button.dataset.suggestion||"";
  clearSuggestions();
  void doSearch(queryInput.value);
});

document.addEventListener("click",e=>{
  if(!e.target.closest(".search-box"))clearSuggestions();
});

feed.addEventListener("click",e=>{
  const retry=e.target.closest(".retry-feed");
  if(retry){
    void loadFeedPreset(state.activeFeed||"home");
    return;
  }

  const card=e.target.closest("[data-video-id]");
  if(!card)return;
  const id=card.dataset.videoId;
  playVideo(id,rowFromCard(card));
});

shareBtn.addEventListener("click",async()=>{
  if(!state.currentId)return;
  const url="https://www.youtube.com/watch?v="+state.currentId;
  const data={title:clean(state.currentMeta?.title)||"1988",url};
  try{
    if(navigator.share){await navigator.share(data);return;}
  }catch(err){
    if(err?.name==="AbortError")return;
  }
  try{
    await navigator.clipboard.writeText(url);
    const old=shareBtn.textContent;
    shareBtn.textContent="Đã sao chép";
    setTimeout(()=>shareBtn.textContent=old,900);
  }catch{}
});

videoBtn.addEventListener("click",returnToVideo);
backgroundBtn.addEventListener("click",()=>startBackgroundMode("audio"));
lockBtn.addEventListener("click",()=>startBackgroundMode("lock"));

nativePlayer.addEventListener("playing",()=>{
  if(state.engine!=="native")return;
  if(state.mode==="video")statusText.textContent="MP4 đang phát";
  try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch{}
});
nativePlayer.addEventListener("pause",()=>{
  if(state.engine!=="native"||state.mode!=="video")return;
  try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";}catch{}
});
nativePlayer.addEventListener("ended",()=>{
  if(state.engine==="native"&&state.mode==="video")statusText.textContent="Đã phát xong";
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible"){
    markPlaybackTransition();
    return;
  }
  if(MediaCore.modeUsesAudio(state.mode)){
    updateModeUi();
    return;
  }
  if(state.mode==="video"&&state.currentId){
    updateModeUi();
    resumeVideoAfterReturn();
  }
});

function setupInstall(){
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(standalone)return;

  if(isiOS){
    installBtn.hidden=false;
    installBtn.addEventListener("click",()=>{installSheet.hidden=false;});
  }

  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    state.installPrompt=e;
    installBtn.hidden=false;
    installBtn.onclick=async()=>{
      try{
        state.installPrompt.prompt();
        await state.installPrompt.userChoice;
      }catch{}
      state.installPrompt=null;
      installBtn.hidden=true;
    };
  });

  window.addEventListener("appinstalled",()=>{
    state.installPrompt=null;
    installBtn.hidden=true;
  });
}

closeInstallSheet.addEventListener("click",()=>{installSheet.hidden=true;});
installSheet.addEventListener("click",e=>{if(e.target===installSheet)installSheet.hidden=true;});

const FEED_CACHE_PREFIX="1988-discovery-v3:";

async function pagedSearch(local,key,query,filters={},reset=false){
  try{
    const rows=await local.searchPage(key,query,{type:"video",...filters},reset);
    return Array.isArray(rows)?rows:[];
  }catch(error){
    console.warn("paged search failed",key,error);
    if(!reset)return [];
    try{
      const rows=await local.search(query,{type:"video",...filters});
      return Array.isArray(rows)?rows:[];
    }catch{
      return [];
    }
  }
}

const FEED_PRESETS={
  home:{
    title:"Gợi ý",
    newest:false,
    load:(local,reset)=>local.homePage("home",reset)
  },
  live:{
    title:"Đang live",
    newest:true,
    load:async(local,reset)=>{
      let rows=await pagedSearch(local,"live","Việt Nam",{features:["live"],sort_by:"upload_date"},reset);
      let liveRows=rows.filter(row=>row?.isLive);
      if(liveRows.length)return liveRows;
      rows=await pagedSearch(local,"live-fallback","trực tiếp Việt Nam",{sort_by:"upload_date"},reset);
      liveRows=rows.filter(row=>row?.isLive);
      return liveRows.length?liveRows:rows;
    }
  },
  today:{
    title:"Hôm nay",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"today","Việt Nam",{upload_date:"today",sort_by:"upload_date"},reset)
  },
  week:{
    title:"Tuần này",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"week","Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  popular:{
    title:"Xem nhiều",
    newest:false,
    load:(local,reset)=>pagedSearch(local,"popular","Việt Nam",{prioritize:"popularity"},reset)
  },
  news:{
    title:"Thời sự",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"news","thời sự Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  economy:{
    title:"Kinh tế",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"economy","kinh tế Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  security:{
    title:"An ninh",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"security","an ninh pháp luật Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  music:{
    title:"Nhạc",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"music","nhạc Việt Nam",{sort_by:"upload_date"},reset)
  },
  sports:{
    title:"Thể thao",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"sports","thể thao Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  entertainment:{
    title:"Giải trí",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"entertainment","giải trí Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  tech:{
    title:"Công nghệ",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"tech","công nghệ Việt Nam",{upload_date:"week",sort_by:"upload_date"},reset)
  },
  shortfilm:{
    title:"Phim ngắn",
    newest:true,
    load:(local,reset)=>pagedSearch(local,"shortfilm","phim ngắn Việt Nam",{sort_by:"upload_date"},reset)
  }
};

function readFeedCache(name){
  try{
    const row=JSON.parse(localStorage.getItem(FEED_CACHE_PREFIX+name)||"null");
    if(!row||!Array.isArray(row.items)||!row.items.length)return [];
    return row.items;
  }catch{
    return [];
  }
}

function saveFeedCache(name,rows){
  try{
    localStorage.setItem(FEED_CACHE_PREFIX+name,JSON.stringify({
      at:Date.now(),
      items:rows.slice(0,90)
    }));
  }catch{}
}

async function loadFeedPreset(name="home"){
  const preset=FEED_PRESETS[name]||FEED_PRESETS.home;
  const seq=++state.feedSeq;
  state.feedLoading=true;
  state.feedHasMore=true;
  state.feedRows=[];
  setActiveChip(name);
  feedTitle.textContent=preset.title;

  const cached=readFeedCache(name);
  if(cached.length){
    const rows=preset.newest?newestFirst(cached):cached;
    state.feedRows=rows;
    renderCards(rows);
    feedStatus.textContent="Đang cập nhật…";
  }else{
    feed.innerHTML='<div class="loading">Đang tải…</div>';
    feedStatus.textContent="";
  }

  try{
    const local=await localEngine(16000);
    const rowsRaw=await preset.load(local,true);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;
    const rows=preset.newest?newestFirst(rowsRaw):rowsRaw;
    if(!Array.isArray(rows)||!rows.length)throw new Error("empty_feed");
    state.feedRows=mergeUniqueRows([],rows);
    saveFeedCache(name,state.feedRows);
    renderCards(state.feedRows);
    state.feedHasMore=true;
    feedStatus.textContent="";
  }catch(error){
    console.warn("feed failed",name,error);
    if(!cached.length){
      feed.innerHTML='<div class="error">Chưa tải được '+esc(preset.title)+'.<br><button class="retry-feed" type="button">Tải lại</button></div>';
      feedStatus.textContent="";
      state.feedHasMore=false;
    }else{
      feedStatus.textContent="Dữ liệu gần nhất";
    }
  }finally{
    if(seq===state.feedSeq)state.feedLoading=false;
    setTimeout(maybeLoadMoreFeed,120);
  }
}

async function loadMoreFeed(){
  const name=state.activeFeed;
  const preset=FEED_PRESETS[name];
  if(!name||!preset||state.feedLoading||!state.feedHasMore)return;

  state.feedLoading=true;
  const seq=state.feedSeq;
  feedStatus.textContent="Đang tải thêm…";

  try{
    const local=await localEngine(12000);
    const raw=await preset.load(local,false);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    const rows=preset.newest?newestFirst(raw):raw;
    const before=state.feedRows.length;
    state.feedRows=mergeUniqueRows(state.feedRows,rows);
    const added=state.feedRows.slice(before);

    if(!added.length){
      state.feedHasMore=false;
      feedStatus.textContent="";
      return;
    }

    renderCards(added,{append:true});
    saveFeedCache(name,state.feedRows);
    feedStatus.textContent="";
  }catch(error){
    console.warn("load more failed",name,error);
    feedStatus.textContent="";
  }finally{
    if(seq===state.feedSeq)state.feedLoading=false;
  }
}

let feedScrollRaf=0;
function maybeLoadMoreFeed(){
  if(feedScrollRaf)return;
  feedScrollRaf=requestAnimationFrame(()=>{
    feedScrollRaf=0;
    const distance=document.documentElement.scrollHeight-(window.scrollY+window.innerHeight);
    if(distance<1100)void loadMoreFeed();
  });
}

window.addEventListener("scroll",maybeLoadMoreFeed,{passive:true});
window.addEventListener("resize",maybeLoadMoreFeed,{passive:true});

function loadInitialFeed(){
  return loadFeedPreset("home");
}

topicChips.addEventListener("click",e=>{
  const button=e.target.closest("[data-feed]");
  if(!button)return;
  queryInput.value="";
  clearSuggestions();
  void loadFeedPreset(button.dataset.feed||"home");
});

setupMediaSession();
setupInstall();
setupFloatingIframe();
setupFullscreenReturn();
updateModeUi();

const initialVideoId=extractVideoId(new URL(location.href).searchParams.get("v")||"");
if(initialVideoId){
  void playVideo(initialVideoId,{
    title:"Đang tải thông tin…",
    thumbnailUrl:"https://i.ytimg.com/vi/"+initialVideoId+"/hqdefault.jpg"
  });
}else{
  loadInitialFeed();
}
