"use strict";

const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";

const $=s=>document.querySelector(s);
const searchForm=$("#searchForm");
const queryInput=$("#queryInput");
const suggestions=$("#suggestions");
const playerSection=$("#playerSection");
const videoTitle=$("#videoTitle");
const videoMeta=$("#videoMeta");
const backgroundBtn=$("#backgroundBtn");
const videoBtn=$("#videoBtn");
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
  suggestToken:0,
  installPrompt:null,
  audioMaster:false
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

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

async function api(action,params={}){
  const url=new URL(BASE);
  url.searchParams.set("action",action);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined&&v!==null&&v!=="")url.searchParams.set(k,String(v));
  }
  const res=await fetch(url.toString(),{cache:"no-store"});
  const body=await res.json().catch(()=>null);
  if(!res.ok||body?.ok===false)throw new Error(body?.error||("HTTP "+res.status));
  return body;
}

async function backgroundSources(id){
  const r=await api("background",{id});
  const data=r?.data||{};
  const rows=Array.isArray(data.sources)?data.sources:[];
  return rows.filter(row=>row?.url);
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
      try{state.player?.mute?.();}catch{}
      statusText.textContent="Âm thanh HTML5 đang chạy · khóa màn hình sẽ tiếp tục";
    }

    if(event.type==="ready"&&!event.count){
      state.audioMaster=false;
      try{state.player?.unMute?.();}catch{}
      statusText.textContent="Video đang phát · chưa có audio nền";
    }

    if(event.type==="ended"){
      state.audioMaster=false;
      statusText.textContent="Đã phát xong";
    }
  }
});

let audioPrimeObserver=null;
const audioPrimeQueue=[];
const audioPrimePending=new Set();
let audioPrimeActive=0;
const AUDIO_PRIME_CONCURRENCY=2;

function pumpAudioPrime(){
  while(audioPrimeActive<AUDIO_PRIME_CONCURRENCY&&audioPrimeQueue.length){
    const id=audioPrimeQueue.shift();
    if(!id||backgroundPlayer.hasPrepared(id)){
      audioPrimePending.delete(id);
      continue;
    }
    audioPrimeActive++;
    void backgroundPlayer.prime(id).finally(()=>{
      audioPrimeActive--;
      audioPrimePending.delete(id);
      pumpAudioPrime();
    });
  }
}

function queueAudioPrime(id,urgent=false){
  if(!id||backgroundPlayer.hasPrepared(id)||audioPrimePending.has(id))return;
  audioPrimePending.add(id);
  if(urgent)audioPrimeQueue.unshift(id);
  else audioPrimeQueue.push(id);
  pumpAudioPrime();
}

function scheduleAudioPrefetch(){
  const cards=[...feed.querySelectorAll("[data-video-id]")];
  cards.slice(0,6).forEach(card=>queueAudioPrime(card.dataset.videoId||""));

  if(!("IntersectionObserver" in window))return;
  if(!audioPrimeObserver){
    audioPrimeObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const card=entry.target;
        queueAudioPrime(card.dataset.videoId||"");
        audioPrimeObserver.unobserve(card);
      }
    },{rootMargin:"700px 0px",threshold:0.01});
  }
  cards.forEach(card=>audioPrimeObserver.observe(card));
}

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
    const duration=Number(row.duration)||0;
    const published=publishedLabel(row);
    cards.push(
      '<article class="card" data-video-id="'+esc(id)+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-duration="'+esc(String(duration))+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumb(row,id))+'">'+
        '<div class="thumb-wrap"><img src="'+esc(thumb(row,id))+'" alt="" loading="lazy">'+(duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+'</div>'+
        '<div class="card-copy"><div class="card-title">'+esc(title)+'</div>'+
          '<div class="card-channel">'+esc(channel)+'</div>'+
          '<div class="card-stats">'+(views?esc(fmtViews(views))+' lượt xem':'')+(published?(views?' · ':'')+esc(published):'')+'</div>'+
        '</div>'+
      '</article>'
    );
  }
  feed.innerHTML=cards.join("")||'<div class="empty">Chưa có video.</div>';
  feedStatus.textContent=cards.length?cards.length+" video":"";
  scheduleAudioPrefetch();
}

function rowFromCard(card){
  return {
    title:card.dataset.title||"",
    uploader:card.dataset.channel||"",
    views:Number(card.dataset.views)||0,
    duration:Number(card.dataset.duration)||0,
    uploadDate:card.dataset.published||"",
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
  backgroundBtn.hidden=true;
  videoBtn.hidden=true;
}

function updateMediaSession(meta=state.currentMeta||{}){
  backgroundPlayer.setMetadata(meta);
}

function getVideoTime(){
  try{return Math.max(0,Number(state.player?.getCurrentTime?.())||0);}catch{return 0;}
}

function seekVideo(time){
  try{state.player?.seekTo?.(Math.max(0,Number(time)||0),true);}catch{}
}

function playVideoEngine(){
  try{state.player?.playVideo?.();}catch{}
}

function pauseVideoEngine(){
  try{state.player?.pauseVideo?.();}catch{}
}

async function playVideo(id,seedMeta={}){
  if(!id)return;

  state.currentId=id;
  state.currentMeta={...seedMeta};
  state.mode="video";
  state.audioMaster=false;
  playerSection.hidden=false;

  backgroundPlayer.select(id,{metadata:seedMeta});
  const audioPrepared=backgroundPlayer.hasPrepared(id);

  if(audioPrepared){
    // No network wait before play(): this runs inside the user's tap.
    void backgroundPlayer.activate(id,{
      time:0,
      metadata:seedMeta
    }).catch(()=>{
      if(state.currentId!==id)return;
      state.audioMaster=false;
      try{state.player?.unMute?.();}catch{}
      statusText.textContent="Video đang phát · audio nền chưa sẵn sàng";
    });
  }else{
    // Fallback for an unprimed card: keep the HTML5 element user-activated
    // while the real source is resolved.
    backgroundPlayer.arm(id,{metadata:seedMeta});
    queueAudioPrime(id,true);
    void backgroundPlayer.prepare(id).then(async rows=>{
      if(state.currentId!==id||!rows.length)return;
      try{
        await backgroundPlayer.activate(id,{
          time:getVideoTime(),
          metadata:state.currentMeta||seedMeta
        });
      }catch{
        if(state.currentId===id){
          state.audioMaster=false;
          try{state.player?.unMute?.();}catch{}
          statusText.textContent="Video đang phát · audio nền chưa sẵn sàng";
        }
      }
    });
  }

  updateNow(seedMeta);
  updateModeUi();
  statusText.textContent=audioPrepared
    ?"Đang mở video · HTML5 Audio đã sẵn sàng"
    :"Đang mở video và chuẩn bị âm thanh nền…";

  try{
    if(audioPrepared)state.player?.mute?.();
    else state.player?.unMute?.();
  }catch{}

  if(state.playerReady&&state.player){
    try{
      if(audioPrepared)state.player.mute();
      state.player.loadVideoById(id);
    }catch{
      state.pendingVideoId=id;
    }
  }else{
    state.pendingVideoId=id;
    initYouTubePlayer();
  }

  try{
    playerSection.scrollIntoView({behavior:"smooth",block:"start"});
  }catch{
    playerSection.scrollIntoView();
  }

  try{
    const r=await api("video",{id});
    if(state.currentId!==id)return;
    const meta=r?.data||{};
    state.currentMeta={...seedMeta,...meta};
    updateNow(state.currentMeta);
    backgroundPlayer.setMetadata(state.currentMeta);

    const related=Array.isArray(meta.relatedStreams)?meta.relatedStreams:[];
    if(related.length){
      feedTitle.textContent="Gợi ý liên quan";
      renderCards(related.slice(0,18));
    }
  }catch{}
}

function initYouTubePlayer(){
  if(state.player||!window.YT||typeof YT.Player!=="function")return false;

  state.player=new YT.Player("yt-player",{
    height:"100%",
    width:"100%",
    playerVars:{
      autoplay:1,
      playsinline:1,
      controls:1,
      rel:0,
      fs:1,
      iv_load_policy:3,
      enablejsapi:1,
      mute:1
    },
    events:{
      onReady(){
        state.playerReady=true;
        if(state.audioMaster||backgroundPlayer.hasPrepared(state.currentId)){
          try{state.player.mute();}catch{}
        }
        if(state.pendingVideoId){
          const id=state.pendingVideoId;
          state.pendingVideoId="";
          try{
            if(backgroundPlayer.hasPrepared(id))state.player.mute();
            state.player.loadVideoById(id);
          }catch{}
        }
      },
      onStateChange(event){
        if(event.data===YT.PlayerState.PLAYING){
          if(state.audioMaster){
            try{state.player?.mute?.();}catch{}
            if(document.visibilityState==="visible"&&!backgroundPlayer.playing){
              void backgroundPlayer.play();
            }
          }
        }else if(event.data===YT.PlayerState.PAUSED){
          // Ignore the iframe pausing because iOS hid/suspended it. The HTML5
          // audio must remain alive while the PWA is backgrounded.
          if(document.visibilityState==="visible"&&state.audioMaster){
            backgroundPlayer.pause();
            statusText.textContent="Đã tạm dừng";
          }
        }
      },
      onError(){
        statusText.textContent="YouTube không phát được video này";
      }
    }
  });
  return true;
}

window.onYouTubeIframeAPIReady=initYouTubePlayer;

// If iframe_api finished before app.js attached its callback, initialize now.
if(window.YT&&typeof YT.Player==="function"){
  initYouTubePlayer();
}else{
  let ytWait=0;
  const ytTimer=setInterval(()=>{
    ytWait++;
    if(initYouTubePlayer()||ytWait>40)clearInterval(ytTimer);
  },100);
}

async function doSearch(value){
  const q=clean(value);
  if(!q)return;
  closeSuggestions();
  const id=extractVideoId(q);
  if(id){
    await playVideo(id,{title:"Đang tải thông tin…",thumbnailUrl:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"});
    return;
  }

  feedTitle.textContent='Kết quả cho “'+q+'”';
  feed.innerHTML='<div class="loading">Đang tìm…</div>';
  feedStatus.textContent="";
  try{
    const r=await api("search",{q,filter:"videos"});
    renderCards(r?.data?.items||[]);
  }catch{
    feed.innerHTML='<div class="error">Không tìm được video. Thử lại.</div>';
  }
}

function closeSuggestions(){
  suggestions.hidden=true;
  suggestions.innerHTML="";
}

let suggestTimer=0;
queryInput.addEventListener("input",()=>{
  clearTimeout(suggestTimer);
  closeSuggestions();
  const q=clean(queryInput.value);
  if(q.length<2||extractVideoId(q))return;
  const token=++state.suggestToken;
  suggestTimer=setTimeout(async()=>{
    try{
      const rows=await api("suggestions",{q});
      if(token!==state.suggestToken)return;
      const list=Array.isArray(rows?.data)?rows.data:[];
      if(!list.length)return;
      suggestions.innerHTML=list.slice(0,8).map(x=>'<button type="button" data-suggest="'+esc(x)+'">'+esc(x)+'</button>').join("");
      suggestions.hidden=false;
    }catch{}
  },100);
});

suggestions.addEventListener("click",e=>{
  const btn=e.target.closest("[data-suggest]");
  if(!btn)return;
  queryInput.value=btn.dataset.suggest||"";
  doSearch(queryInput.value);
});

searchForm.addEventListener("submit",e=>{
  e.preventDefault();
  doSearch(queryInput.value);
  queryInput.blur();
});

feed.addEventListener("pointerdown",e=>{
  const card=e.target.closest("[data-video-id]");
  if(!card)return;
  queueAudioPrime(card.dataset.videoId||"",true);
},{passive:true});

feed.addEventListener("click",e=>{
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

function syncForegroundVideo(){
  if(!state.audioMaster||!state.currentId)return;

  const t=backgroundPlayer.time;
  seekVideo(t);
  try{state.player?.mute?.();}catch{}
  playVideoEngine();
  if(!backgroundPlayer.playing)void backgroundPlayer.play();
}

window.addEventListener("focus",syncForegroundVideo);
window.addEventListener("pageshow",syncForegroundVideo);

let lastVideoSync=0;
let lastAudioSync=0;

setInterval(()=>{
  if((document.hasFocus&& !document.hasFocus())||!state.audioMaster||!backgroundPlayer.playing)return;
  if(!state.playerReady||!state.player)return;

  const videoTime=getVideoTime();
  const audioTime=backgroundPlayer.time;
  const videoDelta=videoTime-lastVideoSync;
  const audioDelta=audioTime-lastAudioSync;
  const drift=videoTime-audioTime;

  if(Math.abs(videoDelta-audioDelta)>2.5&&Math.abs(drift)>1.5){
    // User scrubbed the visible YouTube player: move the audio once.
    backgroundPlayer.seek(videoTime);
  }else if(Math.abs(drift)>0.8){
    // Normal drift: never disturb audio. Move only the picture.
    seekVideo(audioTime);
  }

  lastVideoSync=videoTime;
  lastAudioSync=audioTime;
},750);

document.addEventListener("click",e=>{
  if(!e.target.closest(".search-box"))closeSuggestions();
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

async function loadInitialFeed(){
  try{
    const r=await api("trending",{region:"VN"});
    renderCards(Array.isArray(r?.data)?r.data:[]);
  }catch{
    try{
      const r=await api("home",{seed:"video việt nam mới nhất"});
      renderCards(r?.data?.items||r?.data||[]);
    }catch{
      feed.innerHTML='<div class="error">Chưa tải được gợi ý.</div>';
    }
  }
}

setupMediaSession();
setupInstall();
updateModeUi();
loadInitialFeed();
