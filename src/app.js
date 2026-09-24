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
const pipBtn=$("#pipBtn");
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
  engine:"native",
  nativeSource:"",
  activeFeed:"home"
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
  topicChips?.querySelectorAll(".topic-chip").forEach(button=>{
    button.classList.toggle("active",button.dataset.feed===state.activeFeed);
  });
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

function renderCards(rows=[]){
  const seen=new Set();
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
    const published=publishedLabel(row)||clean(row.publishedText||"");
    const statBits=[];
    if(viewText)statBits.push(viewText);
    else if(views)statBits.push(fmtViews(views)+" lượt xem");
    if(published)statBits.push(published);
    cards.push(
      '<article class="card" data-video-id="'+esc(id)+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-view-text="'+esc(viewText)+'" data-duration="'+esc(String(duration))+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumb(row,id))+'">'+
        '<div class="thumb-wrap"><img src="'+esc(thumb(row,id))+'" alt="" loading="lazy">'+(duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+'</div>'+
        '<div class="card-copy"><div class="card-title">'+esc(title)+'</div>'+
          '<div class="card-channel">'+esc(channel)+'</div>'+
          '<div class="card-stats">'+esc(statBits.join(" · "))+'</div>'+
        '</div>'+
      '</article>'
    );
  }
  feed.innerHTML=cards.join("")||'<div class="empty">Chưa có video.</div>';
  feedStatus.textContent=cards.length?cards.length+" video":"";
}

function rowFromCard(card){
  return {
    title:card.dataset.title||"",
    uploader:card.dataset.channel||"",
    views:Number(card.dataset.views)||0,
    viewText:card.dataset.viewText||"",
    duration:Number(card.dataset.duration)||0,
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
    [pipBtn,"pip"],
    [lockBtn,"lock"]
  ];
  rows.forEach(([button,mode])=>{
    if(!button)return;
    button.hidden=false;
    button.classList.toggle("active",active===mode);
    button.setAttribute("aria-pressed",active===mode?"true":"false");
  });
  if(pipBtn){
    const method=state.engine==="native"?MediaCore.pipMethod(nativePlayer,document):"none";
    pipBtn.disabled=method==="none";
    pipBtn.title=method==="none"?"PiP chưa khả dụng với nguồn hiện tại":"Mở Picture in Picture";
  }
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
  try{state.player?.playVideo?.();}catch{}
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
    else playVideoEngine();
  });
  safe("pause",()=>{
    if(usingAudio())backgroundPlayer.pause();
    else pauseVideoEngine();
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
  seekVideo(time);
  playVideoEngine();
  statusText.textContent="Video YouTube đang phát trực tiếp";
  updateModeUi();
}

async function enterPiP(){
  if(!state.currentId||state.engine!=="native")return;
  const method=MediaCore.pipMethod(nativePlayer,document);
  try{
    if(method==="standard"){
      await nativePlayer.requestPictureInPicture();
    }else if(method==="webkit"){
      nativePlayer.webkitSetPresentationMode("picture-in-picture");
    }else{
      statusText.textContent="PiP chưa khả dụng trên thiết bị này";
      return;
    }
    state.mode="pip";
    updateModeUi();
    statusText.textContent="PiP đang phát";
  }catch{
    statusText.textContent="Không mở được PiP";
  }
}

async function playVideo(id,seedMeta={}){
  if(!id)return;

  state.currentId=id;
  state.currentMeta={...seedMeta};
  state.mode="video";
  state.audioMaster=false;
  state.nativeSource="";
  playerSection.hidden=false;

  backgroundPlayer.pause();
  backgroundPlayer.select(id,{metadata:seedMeta});

  try{nativePlayer.pause();}catch{}
  nativePlayer.removeAttribute("src");
  nativePlayer.poster=thumb(seedMeta,id);
  nativePlayer.playsInline=true;
  nativePlayer.setAttribute("playsinline","");
  nativePlayer.setAttribute("webkit-playsinline","");
  nativePlayer.preload="auto";

  updateNow(seedMeta);
  showNativePlayer();
  updateModeUi();

  try{
    playerSection.scrollIntoView({behavior:"smooth",block:"start"});
  }catch{
    playerSection.scrollIntoView();
  }

  const directUrl=MEDIA_SERVICE+"/video?id="+encodeURIComponent(id);
  const edgeUrl=BASE+"?action=media&id="+encodeURIComponent(id)+"&kind=video";
  let fallbackStage=0;

  const useSource=(url,label)=>{
    if(state.currentId!==id||!url)return false;
    state.nativeSource=url;
    nativePlayer.src=url;
    try{nativePlayer.load();}catch{}
    statusText.textContent=label;
    try{
      const promise=nativePlayer.play();
      if(promise&&typeof promise.catch==="function"){
        promise.catch(error=>{
          if(state.currentId!==id)return;
          if(error?.name==="NotAllowedError"){
            statusText.textContent="Video đã sẵn sàng · bấm ▶ để phát";
          }
        });
      }
    }catch{}
    return true;
  };

  const tryEdgeFallback=()=>{
    if(state.currentId!==id||fallbackStage>=2)return;
    fallbackStage=2;
    useSource(edgeUrl,"Đang thử nguồn dự phòng…");
  };

  nativePlayer.onerror=()=>{
    if(state.currentId!==id)return;
    if(fallbackStage===0){
      fallbackStage=1;
      void localEngine(9000).then(async local=>{
        const media=await local.media(id,"video");
        if(state.currentId!==id)return;
        if(media?.url)useSource(media.url,"Đang mở nguồn video…");
        else tryEdgeFallback();
      }).catch(tryEdgeFallback);
    }else{
      tryEdgeFallback();
    }
  };

  // Important for iPhone/PWA: attach a real media URL and call play()
  // immediately inside the original tap task, before waiting for metadata.
  useSource(directUrl,"Đang mở video…");

  // Enrich metadata and prepare a native fallback in parallel. Do not block
  // the first frame on discovery/API work.
  try{
    const local=await localEngine(12000);
    const [detail,media]=await Promise.all([
      local.info(id).catch(()=>({meta:{},related:[]})),
      local.media(id,"video").catch(()=>null)
    ]);
    if(state.currentId!==id)return;

    const meta={...seedMeta,...(detail?.meta||{})};
    state.currentMeta=meta;
    updateNow(meta);
    backgroundPlayer.setMetadata(meta);
    nativePlayer.poster=thumb(meta,id);

    const notStarted=nativePlayer.readyState<2&&!nativePlayer.currentTime;
    if(notStarted&&media?.url&&media.url!==state.nativeSource){
      fallbackStage=1;
      useSource(media.url,"Đang mở nguồn video…");
    }

    const related=Array.isArray(detail?.related)?detail.related:[];
    if(related.length){
      feedTitle.textContent="Gợi ý tiếp theo";
      renderCards(related.slice(0,24));
    }
    updateModeUi();
  }catch(error){
    console.warn("metadata/native fallback failed",error);
    if(state.currentId!==id)return;
    // Keep the already-started Render stream. Only switch if the media element
    // has actually failed; nativePlayer.onerror handles that path.
  }
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
        const id=state.pendingVideoId||state.currentId;
        state.pendingVideoId="";
        if(id){
          try{
            state.player.unMute?.();
            state.player.loadVideoById(id);
          }catch{}
        }
      },
      onStateChange(event){
        if(event.data===YT.PlayerState.PLAYING){
          if(state.mode==="video")statusText.textContent="Video YouTube đang phát";
          try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch{}
        }else if(event.data===YT.PlayerState.PAUSED){
          if(state.mode==="video"){
            try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";}catch{}
          }
        }else if(event.data===YT.PlayerState.ENDED){
          if(state.mode==="video")statusText.textContent="Đã phát xong";
        }
      },
      onError(){
        statusText.textContent="YouTube không phát được video này";
      }
    }
  });
  return true;
}

window.onYouTubeIframeAPIReady=()=>{
  if(state.engine==="iframe"&&(state.pendingVideoId||state.currentId))initYouTubePlayer();
};

if(!(window.YT&&typeof YT.Player==="function")){
  let ytWait=0;
  const ytTimer=setInterval(()=>{
    ytWait++;
    if(window.YT&&typeof YT.Player==="function"){
      clearInterval(ytTimer);
      if(state.engine==="iframe"&&(state.pendingVideoId||state.currentId))initYouTubePlayer();
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
  try{
    const local=await localEngine(16000);
    const rows=await local.search(q,{type:"video"});
    renderCards(rows);
  }catch(error){
    console.warn("local search failed",error);
    try{
      const r=await api("search",{q,filter:"videos"});
      renderCards(r?.data?.items||[]);
    }catch{
      feed.innerHTML='<div class="error">Không tìm được video. Thử lại.</div>';
    }
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
    try{
      const local=await localEngine(12000);
      const rows=await local.suggestions(q);
      if(seq!==suggestSeq||clean(queryInput.value)!==q)return;
      if(!rows.length){
        clearSuggestions();
        return;
      }
      suggestions.innerHTML=rows.map(value=>
        '<button type="button" data-suggestion="'+esc(value)+'">'+esc(value)+'</button>'
      ).join("");
      suggestions.hidden=false;
    }catch{
      clearSuggestions();
    }
  },180);
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
pipBtn.addEventListener("click",()=>{void enterPiP();});

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
nativePlayer.addEventListener("enterpictureinpicture",()=>{
  state.mode="pip";
  updateModeUi();
});
nativePlayer.addEventListener("leavepictureinpicture",()=>{
  if(state.mode==="pip")state.mode="video";
  updateModeUi();
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible")return;
  if(MediaCore.modeUsesAudio(state.mode)){
    updateModeUi();
    return;
  }
  if(state.mode==="video"&&state.currentId){
    updateModeUi();
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

const FEED_CACHE_PREFIX="1988-discovery-v2:";

const FEED_PRESETS={
  home:{
    title:"Gợi ý",
    load:local=>local.home()
  },
  today:{
    title:"Top hôm nay",
    load:local=>local.search("Việt Nam",{type:"video",upload_date:"today",prioritize:"popularity"})
  },
  week:{
    title:"Top tuần",
    load:local=>local.search("Việt Nam",{type:"video",upload_date:"week",prioritize:"popularity"})
  },
  popular:{
    title:"Xem nhiều",
    load:local=>local.search("Việt Nam",{type:"video",prioritize:"popularity"})
  },
  music:{
    title:"Nhạc",
    load:local=>local.search("nhạc Việt",{type:"video",prioritize:"popularity"})
  },
  news:{
    title:"Tin tức",
    load:local=>local.search("tin tức Việt Nam",{type:"video",upload_date:"today",prioritize:"popularity"})
  },
  sports:{
    title:"Thể thao",
    load:local=>local.search("thể thao Việt Nam",{type:"video",upload_date:"week",prioritize:"popularity"})
  },
  entertainment:{
    title:"Giải trí",
    load:local=>local.search("giải trí Việt Nam",{type:"video",prioritize:"popularity"})
  },
  tech:{
    title:"Công nghệ",
    load:local=>local.search("công nghệ",{type:"video",upload_date:"week",prioritize:"popularity"})
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
      items:rows.slice(0,30)
    }));
  }catch{}
}

async function loadFeedPreset(name="home"){
  const preset=FEED_PRESETS[name]||FEED_PRESETS.home;
  setActiveChip(name);
  feedTitle.textContent=preset.title;

  const cached=readFeedCache(name);
  if(cached.length){
    renderCards(cached);
    feedStatus.textContent="Đang cập nhật…";
  }else{
    feed.innerHTML='<div class="loading">Đang tải…</div>';
    feedStatus.textContent="";
  }

  try{
    const local=await localEngine(16000);
    const rows=await preset.load(local);
    if(!Array.isArray(rows)||!rows.length)throw new Error("empty_feed");
    saveFeedCache(name,rows);
    renderCards(rows);
    feedStatus.textContent="";
  }catch(error){
    console.warn("feed failed",name,error);
    if(cached.length){
      feedStatus.textContent="Dữ liệu gần nhất";
      return;
    }
    feed.innerHTML='<div class="error">Chưa tải được '+esc(preset.title)+'.<br><button class="retry-feed" type="button">Tải lại</button></div>';
    feedStatus.textContent="";
  }
}

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
