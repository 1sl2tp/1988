"use strict";

const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";
const AI_TOPICS_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-topics";
const SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjbm9haHFzcnF1eGt3a2pidXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY5MDEsImV4cCI6MjEwMzUyMjkwMX0.16EE_LENbAV5oD29XQGpR5c2eYXPqBSWkGTFdOqeRQE";
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
const sourcesBtn=$("#sourcesBtn");
const sourceHeaderCount=$("#sourceHeaderCount");
const sourcesSheet=$("#sourcesSheet");
const closeSourcesSheet=$("#closeSourcesSheet");
const sourceSearch=$("#sourceSearch");
const clearSourceSearch=$("#clearSourceSearch");
const sourceSearchStatus=$("#sourceSearchStatus");
const sourceBrowse=$("#sourceBrowse");
const sourceList=$("#sourceList");
const sourceSummary=$("#sourceSummary");
const sourcePreview=$("#sourcePreview");
const backSourcePreview=$("#backSourcePreview");
const sourcePreviewTitle=$("#sourcePreviewTitle");
const sourcePreviewList=$("#sourcePreviewList");
const sourceSettingsBtn=$("#sourceSettingsBtn");
const sourceVideoPopup=$("#sourceVideoPopup");
const closeSourceVideoPopup=$("#closeSourceVideoPopup");
const sourceVideoFrame=$("#sourceVideoFrame");
const sourceVideoPopupTitle=$("#sourceVideoPopupTitle");
const trendTopics=$("#trendTopics");

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
  activeFeed:"latest",
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
  parentCategories:[],
  activeParent:"",
  catalogVersion:"",
  catalogLoading:false,
  catalogSeq:0,
  trendTopics:[],
  activeTrend:"",
  trendPoolKey:"",
  trendRequestSeq:0,
  aiVideoMeta:new Map(),
  feedSeq:0,
  sourceLibraryDirty:false
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

const SOURCE_SELECTION_KEY="1988-source-selection-v1";
const SOURCE_CUSTOM_KEY="1988-source-custom-v1";
const SOURCE_HIDDEN_KEY="1988-source-hidden-v1";
const BASE_CHANNEL_LIBRARY=Array.isArray(window.CHANNEL_LIBRARY)
  ?window.CHANNEL_LIBRARY.filter(row=>row&&/^UC[A-Za-z0-9_-]+$/.test(String(row.id||""))&&row.name)
  :[];
const BASE_CHANNEL_ID_SET=new Set(BASE_CHANNEL_LIBRARY.map(row=>row.id));

function readStoredArray(key){
  try{
    const value=JSON.parse(localStorage.getItem(key)||"[]");
    return Array.isArray(value)?value:[];
  }catch{
    return [];
  }
}

let customSources=readStoredArray(SOURCE_CUSTOM_KEY)
  .filter(row=>row&&/^UC[A-Za-z0-9_-]+$/.test(String(row.id||""))&&row.name)
  .map(row=>({
    id:String(row.id),
    name:clean(row.name),
    thumbnailUrl:clean(row.thumbnailUrl||""),
    subscribers:clean(row.subscribers||"")
  }));
let hiddenSourceIds=new Set(
  readStoredArray(SOURCE_HIDDEN_KEY)
    .map(String)
    .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id))
);

function channelLibrary(){
  const out=[];
  const seen=new Set();
  for(const row of [...BASE_CHANNEL_LIBRARY,...customSources]){
    if(!row||hiddenSourceIds.has(row.id)||seen.has(row.id))continue;
    seen.add(row.id);
    out.push({
      id:row.id,
      name:clean(row.name),
      thumbnailUrl:clean(row.thumbnailUrl||""),
      subscribers:clean(row.subscribers||"")
    });
  }
  return out;
}

function libraryHas(id){
  return channelLibrary().some(row=>row.id===id);
}

function libraryRow(id){
  return channelLibrary().find(row=>row.id===id)||null;
}

function persistSourceLibrary(){
  try{
    localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));
    localStorage.setItem(SOURCE_HIDDEN_KEY,JSON.stringify([...hiddenSourceIds]));
  }catch{}
}

function readSourceSelection(){
  const allowed=new Set(channelLibrary().map(row=>row.id));
  try{
    const saved=JSON.parse(localStorage.getItem(SOURCE_SELECTION_KEY)||"null");
    if(Array.isArray(saved)){
      return new Set(saved.filter(id=>allowed.has(id)));
    }
  }catch{}

  const defaults=channelLibrary().slice(0,12).map(row=>row.id);
  try{localStorage.setItem(SOURCE_SELECTION_KEY,JSON.stringify(defaults));}catch{}
  return new Set(defaults);
}

let selectedSourceIds=readSourceSelection();
let sourceRemoteResults=[];
let sourceSearchTimer=0;
let sourceSearchSeq=0;
let sourcePreviewSeq=0;
let sourcePreviewRows=new Map();
let sourceManageMode=false;
let sourceMetaObserver=null;
const sourceMetaCache=new Map();
const sourceMetaPending=new Set();

function persistSourceSelection(){
  try{
    localStorage.setItem(SOURCE_SELECTION_KEY,JSON.stringify([...selectedSourceIds]));
  }catch{}
}

function selectedSources(){
  const rows=channelLibrary();
  const allowed=new Set(rows.map(row=>row.id));
  let changed=false;
  for(const id of [...selectedSourceIds]){
    if(!allowed.has(id)){
      selectedSourceIds.delete(id);
      changed=true;
    }
  }
  if(changed)persistSourceSelection();
  return rows.filter(row=>selectedSourceIds.has(row.id));
}

function sourceSignature(){
  return [...selectedSourceIds].sort().join("|");
}

function isSourceScopedFeed(name){
  return name==="latest"||name==="week";
}

function isAiCategoryFeed(name){
  return String(name||"").startsWith("ai:");
}

function supportsAiAnalysisFeed(name){
  return isSourceScopedFeed(name)||isAiCategoryFeed(name);
}

function aiCategoryKeyFromFeed(name){
  return isAiCategoryFeed(name)?String(name).slice(3):"";
}

function aiCategoryByKey(key=""){
  return state.parentCategories.find(item=>item.key===String(key||""))||null;
}

function safeSourceThumb(value=""){
  const raw=clean(value);
  if(raw.startsWith("//"))return "https:"+raw;
  return raw;
}

function sourceMetaFor(row){
  return {...row,...(sourceMetaCache.get(row.id)||{})};
}

function updateSourceSummary(){
  const rows=channelLibrary();
  const count=selectedSourceIds.size;
  if(sourceHeaderCount)sourceHeaderCount.textContent=String(count);
  if(sourceSummary)sourceSummary.textContent=count+" / "+rows.length;
}

function sourceAvatarHtml(row){
  const meta=sourceMetaFor(row);
  const image=safeSourceThumb(meta.thumbnailUrl);
  const initial=clean(meta.name||row.name||"?").slice(0,1).toUpperCase()||"?";
  return '<span class="source-avatar">'+
    (image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'<span>'+esc(initial)+'</span>')+
  '</span>';
}

function sourceRowHtml(row,{remote=false}={}){
  const meta=sourceMetaFor(row);
  const active=selectedSourceIds.has(row.id);
  const exists=libraryHas(row.id);
  const subscriber=clean(meta.subscribers||"");
  const sub=subscriber
    ?subscriber+" · Xem mới"
    :(remote&&!exists?"Kết quả từ YouTube":"Xem video mới");

  if(remote&&!exists){
    return '<div class="source-row remote" data-source-id="'+esc(row.id)+'">'+
      '<button class="source-main" type="button" data-source-preview="'+esc(row.id)+'">'+
        sourceAvatarHtml(row)+
        '<span class="source-row-info">'+
          '<span class="source-row-name">'+esc(meta.name||row.name)+'</span>'+
          '<span class="source-row-sub">'+esc(sub)+'</span>'+
        '</span>'+
      '</button>'+
      '<button class="source-add" type="button" data-source-add="'+esc(row.id)+'">+ Thêm</button>'+
    '</div>';
  }

  return '<div class="source-row'+(active?' active':'')+(sourceManageMode?' manage':'')+'" data-source-id="'+esc(row.id)+'">'+
    '<button class="source-main" type="button" data-source-preview="'+esc(row.id)+'">'+
      sourceAvatarHtml(row)+
      '<span class="source-row-info">'+
        '<span class="source-row-name">'+esc(meta.name||row.name)+'</span>'+
        '<span class="source-row-sub">'+esc(sub)+'</span>'+
      '</span>'+
    '</button>'+
    '<button class="source-toggle" type="button" data-source-toggle="'+esc(row.id)+'" aria-label="'+(active?'Tắt nguồn':'Bật nguồn')+'" aria-pressed="'+(active?'true':'false')+'">✓</button>'+
    (sourceManageMode?'<button class="source-delete" type="button" data-source-delete="'+esc(row.id)+'" aria-label="Xóa kênh">Xóa</button>':"")+
  '</div>';
}

function updateSourceRowMeta(id){
  if(!sourceList)return;
  const row=libraryRow(id)||sourceRemoteResults.find(item=>item.id===id);
  if(!row)return;
  const current=sourceList.querySelector('.source-row[data-source-id="'+CSS.escape(id)+'"]');
  if(!current)return;
  const remote=!libraryHas(id);
  const wrap=document.createElement("div");
  wrap.innerHTML=sourceRowHtml(row,{remote}).trim();
  const replacement=wrap.firstElementChild;
  if(replacement)current.replaceWith(replacement);
}

async function ensureSourceMeta(id){
  if(!id||sourceMetaPending.has(id)||sourceMetaCache.has(id))return;
  sourceMetaPending.add(id);
  try{
    const local=await localEngine(12000);
    const meta=await local.channelMeta(id);
    if(meta&&meta.id){
      sourceMetaCache.set(id,meta);
      updateSourceRowMeta(id);
    }
  }catch(error){
    console.warn("channel meta failed",id,error);
  }finally{
    sourceMetaPending.delete(id);
  }
}

function observeSourceRows(){
  sourceMetaObserver?.disconnect?.();
  sourceMetaObserver=null;
  if(!sourceList||!("IntersectionObserver" in window))return;

  sourceMetaObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const id=entry.target?.dataset?.sourceId||"";
      sourceMetaObserver?.unobserve?.(entry.target);
      if(id)void ensureSourceMeta(id);
    }
  },{root:sourceList,rootMargin:"180px 0px"});

  sourceList.querySelectorAll(".source-row[data-source-id]").forEach(row=>{
    const id=row.dataset.sourceId||"";
    if(id&&!sourceMetaCache.has(id))sourceMetaObserver.observe(row);
  });
}

function renderSourceLibrary(){
  if(!sourceList)return;
  const rows=channelLibrary();
  const q=normalizeSearchText(sourceSearch?.value||"");
  const localRows=q
    ?rows.filter(row=>normalizeSearchText(row.name).includes(q))
    :rows;

  const allLibraryIds=new Set(rows.map(row=>row.id));
  const remoteRows=q
    ?sourceRemoteResults.filter(row=>!allLibraryIds.has(row.id))
    :[];

  const parts=[];
  if(localRows.length){
    if(q)parts.push('<div class="source-group-label">Trong thư viện · '+localRows.length+'</div>');
    parts.push(localRows.map(row=>sourceRowHtml(row)).join(""));
  }

  if(remoteRows.length){
    parts.push('<div class="source-group-label">Tìm trên YouTube · '+remoteRows.length+'</div>');
    parts.push(remoteRows.map(row=>sourceRowHtml(row,{remote:true})).join(""));
  }

  if(!parts.length){
    parts.push('<div class="source-empty">'+(q?'Chưa thấy kênh. Đang tìm trên YouTube…':'Thư viện đang trống')+'</div>');
  }

  sourceList.innerHTML=parts.join("");
  requestAnimationFrame(observeSourceRows);
}

async function searchSourceChannels(query){
  const q=clean(query);
  const seq=++sourceSearchSeq;
  if(q.length<2){
    sourceRemoteResults=[];
    if(sourceSearchStatus)sourceSearchStatus.textContent="";
    renderSourceLibrary();
    return;
  }

  if(sourceSearchStatus)sourceSearchStatus.textContent="Đang tìm toàn bộ kênh trên YouTube…";

  try{
    const local=await localEngine(16000);
    const rows=await local.searchChannels(q);
    if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

    sourceRemoteResults=Array.isArray(rows)?rows:[];
    for(const row of sourceRemoteResults){
      if(row?.id)sourceMetaCache.set(row.id,row);
    }

    if(sourceSearchStatus){
      sourceSearchStatus.textContent=sourceRemoteResults.length
        ?"Có "+sourceRemoteResults.length+" kết quả từ YouTube"
        :"Không tìm thấy thêm kênh trên YouTube";
    }
    renderSourceLibrary();
  }catch(error){
    if(seq!==sourceSearchSeq)return;
    console.warn("channel search failed",error);
    sourceRemoteResults=[];
    if(sourceSearchStatus)sourceSearchStatus.textContent="Chưa tìm được kênh trên YouTube";
    renderSourceLibrary();
  }
}

function scheduleSourceSearch(){
  clearTimeout(sourceSearchTimer);
  sourceSearchSeq++;
  sourceRemoteResults=[];
  const q=clean(sourceSearch?.value||"");
  if(clearSourceSearch)clearSourceSearch.hidden=!q;
  if(sourceSearchStatus)sourceSearchStatus.textContent=q.length>=2?"Đang chờ tìm trên YouTube…":"";
  renderSourceLibrary();

  if(q.length<2)return;
  sourceSearchTimer=setTimeout(()=>void searchSourceChannels(q),320);
}

function addSource(row){
  if(!row||!/^UC[A-Za-z0-9_-]+$/.test(String(row.id||"")))return;

  hiddenSourceIds.delete(row.id);
  const meta=sourceMetaFor(row);
  if(!BASE_CHANNEL_ID_SET.has(row.id)){
    const existing=customSources.find(item=>item.id===row.id);
    if(existing){
      existing.name=clean(meta.name)||existing.name;
      existing.thumbnailUrl=safeSourceThumb(meta.thumbnailUrl)||existing.thumbnailUrl||"";
      existing.subscribers=clean(meta.subscribers)||existing.subscribers||"";
    }else{
      customSources.push({
        id:row.id,
        name:clean(meta.name)||"Kênh YouTube",
        thumbnailUrl:safeSourceThumb(meta.thumbnailUrl),
        subscribers:clean(meta.subscribers)
      });
    }
  }

  selectedSourceIds.add(row.id);
  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  updateSourceSummary();
  renderSourceLibrary();
}

function deleteSource(id){
  if(!id)return;
  selectedSourceIds.delete(id);

  if(BASE_CHANNEL_ID_SET.has(id)){
    hiddenSourceIds.add(id);
  }else{
    customSources=customSources.filter(row=>row.id!==id);
  }

  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  updateSourceSummary();
  renderSourceLibrary();
}

function toggleSource(id){
  if(!libraryHas(id))return;
  if(selectedSourceIds.has(id))selectedSourceIds.delete(id);
  else selectedSourceIds.add(id);
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  updateSourceSummary();
  renderSourceLibrary();
}

function setSourceManageMode(enabled){
  sourceManageMode=enabled===true;
  if(sourceSettingsBtn){
    sourceSettingsBtn.classList.toggle("active",sourceManageMode);
    sourceSettingsBtn.setAttribute("aria-pressed",sourceManageMode?"true":"false");
    sourceSettingsBtn.setAttribute("aria-label",sourceManageMode?"Xong cài đặt":"Cài đặt thư viện");
  }
  renderSourceLibrary();
}

async function openSourcePreview(id,rowHint=null){
  const row=libraryRow(id)||rowHint||sourceRemoteResults.find(item=>item.id===id);
  if(!row||!sourcePreview||!sourceBrowse)return;

  const seq=++sourcePreviewSeq;
  sourceBrowse.hidden=true;
  sourcePreview.hidden=false;
  sourcePreviewTitle.textContent=sourceMetaFor(row).name||row.name;
  sourcePreviewRows=new Map();
  sourcePreviewList.innerHTML='<div class="source-empty">Đang tải video mới…</div>';

  try{
    const local=await localEngine(16000);
    const rows=await local.channelVideosPage("preview:"+id,id,true);
    if(seq!==sourcePreviewSeq)return;

    const ordered=newestFirst(Array.isArray(rows)?rows:[]).slice(0,24);
    sourcePreviewRows=new Map(ordered.map(video=>[itemVideoId(video),video]));

    if(!ordered.length){
      sourcePreviewList.innerHTML='<div class="source-empty">Kênh chưa có video để hiển thị</div>';
      return;
    }

    sourcePreviewList.innerHTML=ordered.map(video=>{
      const videoId=itemVideoId(video);
      const meta=clean(video.publishedText||publishedLabel(video));
      return '<button class="source-video-row" type="button" data-source-video-id="'+esc(videoId)+'">'+
        '<img src="'+esc(thumb(video,videoId))+'" alt="" loading="lazy">'+
        '<span class="source-video-copy">'+
          '<span class="source-video-title">'+esc(clean(video.title)||"Video")+'</span>'+
          '<span class="source-video-meta">'+esc(meta+(video.views?(" · "+fmtViews(video.views)+" lượt xem"):""))+'</span>'+
        '</span>'+
      '</button>';
    }).join("");
  }catch(error){
    if(seq!==sourcePreviewSeq)return;
    console.warn("channel preview failed",error);
    sourcePreviewList.innerHTML='<div class="source-empty">Chưa tải được video của kênh</div>';
  }
}

function openSourceVideo(id,row){
  if(!sourceVideoPopup||!sourceVideoFrame||!id)return;
  const title=clean(row?.title)||"Video";
  sourceVideoPopupTitle.textContent=title;
  sourceVideoFrame.src=
    "https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+
    "?autoplay=1&playsinline=1&rel=0&cc_load_policy=0";
  sourceVideoPopup.hidden=false;
}

function closeSourceVideo(){
  if(!sourceVideoPopup||!sourceVideoFrame)return;
  sourceVideoPopup.hidden=true;
  sourceVideoFrame.src="about:blank";
  if(sourceVideoPopupTitle)sourceVideoPopupTitle.textContent="";
}

function closeSourcePreview(){
  closeSourceVideo();
  sourcePreviewSeq++;
  sourcePreviewRows=new Map();
  if(sourcePreview)sourcePreview.hidden=true;
  if(sourceBrowse)sourceBrowse.hidden=false;
  setTimeout(()=>sourceSearch?.focus(),40);
}

function openSourceLibrary(){
  if(!sourcesSheet)return;
  sourceRemoteResults=[];
  sourcePreviewSeq++;
  closeSourceVideo();
  setSourceManageMode(false);
  if(sourcePreview)sourcePreview.hidden=true;
  if(sourceBrowse)sourceBrowse.hidden=false;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";
  updateSourceSummary();
  renderSourceLibrary();
  sourcesSheet.hidden=false;
  setTimeout(()=>sourceSearch?.focus(),80);
}

function closeSourceLibrary(){
  if(!sourcesSheet)return;
  closeSourceVideo();
  clearTimeout(sourceSearchTimer);
  sourceSearchSeq++;
  sourcePreviewSeq++;
  sourceMetaObserver?.disconnect?.();
  sourceMetaObserver=null;
  sourcesSheet.hidden=true;
  sourceSearch.value="";
  sourceRemoteResults=[];
  sourcePreviewRows=new Map();
  setSourceManageMode(false);
  if(clearSourceSearch)clearSourceSearch.hidden=true;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";
  if(sourcePreview)sourcePreview.hidden=true;
  if(sourceBrowse)sourceBrowse.hidden=false;

  if(state.sourceLibraryDirty){
    state.sourceLibraryDirty=false;
    if(isSourceScopedFeed(state.activeFeed)){
      void loadFeedPreset(state.activeFeed);
    }
  }
}

function setupSourceLibrary(){
  updateSourceSummary();

  sourcesBtn?.addEventListener("click",openSourceLibrary);
  closeSourcesSheet?.addEventListener("click",closeSourceLibrary);
  backSourcePreview?.addEventListener("click",closeSourcePreview);
  closeSourceVideoPopup?.addEventListener("click",closeSourceVideo);
  sourceSettingsBtn?.addEventListener("click",()=>setSourceManageMode(!sourceManageMode));

  sourceVideoPopup?.addEventListener("click",event=>{
    if(event.target===sourceVideoPopup)closeSourceVideo();
  });

  sourcesSheet?.addEventListener("click",event=>{
    if(event.target===sourcesSheet)closeSourceLibrary();
  });

  sourceSearch?.addEventListener("input",scheduleSourceSearch);
  clearSourceSearch?.addEventListener("click",()=>{
    sourceSearch.value="";
    scheduleSourceSearch();
    sourceSearch.focus();
  });

  sourceList?.addEventListener("click",event=>{
    const addButton=event.target.closest("[data-source-add]");
    if(addButton){
      const id=addButton.dataset.sourceAdd||"";
      const row=sourceRemoteResults.find(item=>item.id===id);
      if(row)addSource(row);
      return;
    }

    const toggleButton=event.target.closest("[data-source-toggle]");
    if(toggleButton){
      toggleSource(toggleButton.dataset.sourceToggle||"");
      return;
    }

    const deleteButton=event.target.closest("[data-source-delete]");
    if(deleteButton){
      deleteSource(deleteButton.dataset.sourceDelete||"");
      return;
    }

    const previewButton=event.target.closest("[data-source-preview]");
    if(previewButton){
      const id=previewButton.dataset.sourcePreview||"";
      const hint=sourceRemoteResults.find(item=>item.id===id)||null;
      void openSourcePreview(id,hint);
    }
  });

  sourcePreviewList?.addEventListener("click",event=>{
    const button=event.target.closest("[data-source-video-id]");
    if(!button)return;
    const id=button.dataset.sourceVideoId||"";
    const row=sourcePreviewRows.get(id);
    if(!id||!row)return;
    openSourceVideo(id,row);
  });
}

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
    const parentKey=button.dataset.aiParent||"";
    const active=parentKey
      ?parentKey===state.activeParent
      :button.dataset.feed===state.activeFeed&&!state.activeParent;
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


const IDENTIFIED_NEWS_SOURCES=[
  {
    groups:["news","economy","security"],
    aliases:["vtv24","vtv news","thoi bao vtv","vtv1","vnews","thong tan xa viet nam","vietnamplus","vtc now","vtc news"]
  },
  {
    groups:["security","news"],
    aliases:["antv","cong an nhan dan","bao cong an nhan dan","cand","quoc phong viet nam","qpvn","quan doi nhan dan"]
  },
  {
    groups:["news","economy","security"],
    aliases:["thanh nien","tuoi tre","vnexpress","dan tri","vietnamnet","lao dong","nguoi lao dong","plo","phap luat tp hcm","bao tin tuc"]
  },
  {
    groups:["economy"],
    aliases:["vtv money","vtvmoney","vneconomy","bao dau tu","dau tu online"]
  }
];

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

const AI_TREND_CACHE_PREFIX="1988-ai-trends-v5:";
const AI_CATALOG_CACHE_KEY="1988-ai-catalog-v1";
const AI_CATALOG_TTL=3*60*60*1000;

function topicInputRows(rows=[]){
  return newestFirst(Array.isArray(rows)?rows:[])
    .slice(0,120)
    .map(row=>({
      id:itemVideoId(row),
      title:clean(row?.title||""),
      channel:clean(row?.uploaderName||row?.uploader||row?.channelName||row?._sourceName||""),
      published:clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||publishedLabel(row)||""),
      views:Number(row?.views)||0,
      contentHash:contentHashForRow(row)
    }))
    .filter(row=>row.id&&row.title);
}

function fastHash(value=""){
  let hash=2166136261;
  const text=String(value||"");
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}

function contentHashForRow(row={}){
  const normalized=normalizeSearchText(row?.title||"")
    .replace(/\b(live|official|full|tin nong|moi nhat|video|clip|shorts?)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
  if(normalized.length<18)return "";
  return fastHash(normalized);
}

function aiTrendPoolKey(scope,rows=[]){
  const body=rows.map(row=>row.id+"|"+row.title+"|"+row.channel+"|"+row.published+"|"+row.contentHash).join("\n");
  return String(scope||"latest")+":"+fastHash(body);
}

function normalizeAiCatalog(payload){
  const seen=new Set();
  const out=[];
  for(const raw of Array.isArray(payload?.parents)?payload.parents:[]){
    const label=clean(raw?.label||"").replace(/^#+\s*/,"").slice(0,28);
    if(!label)continue;
    const key=normalizeSearchText(label);
    if(!key||seen.has(key))continue;

    const queries=[...new Set(
      (Array.isArray(raw?.queries)?raw.queries:[])
        .map(query=>clean(query).slice(0,80))
        .filter(query=>query.length>=2)
    )].slice(0,6);
    if(queries.length<2)continue;

    const hints=[...new Set(
      (Array.isArray(raw?.hints)?raw.hints:[])
        .map(value=>clean(value).slice(0,48))
        .filter(Boolean)
    )].slice(0,12);

    seen.add(key);
    out.push({key,label,queries,hints});
    if(out.length>=9)break;
  }
  return out;
}

function normalizeAiTrendTopics(payload,rows=[],forcedParentKey="",forcedParentLabel=""){
  const allowed=new Map(rows.map(row=>[row.id,row]));
  const seen=new Set();
  const out=[];

  for(const raw of Array.isArray(payload?.topics)?payload.topics:[]){
    const label=clean(raw?.label||"").replace(/^#+\s*/,"").slice(0,48);
    if(!label)continue;

    let key=normalizeSearchText(label);
    if(!key)key="topic-"+out.length;
    if(seen.has(key))continue;

    const ids=[...new Set(
      (Array.isArray(raw?.videoIds)?raw.videoIds:[])
        .map(id=>clean(id))
        .filter(id=>allowed.has(id))
    )];

    if(ids.length<2)continue;

    const channels=new Set(
      ids.map(id=>normalizeSearchText(allowed.get(id)?.channel||"")).filter(Boolean)
    );
    const parentLabel=forcedParentLabel||clean(raw?.parent||"").slice(0,28);
    const parentKey=forcedParentKey||normalizeSearchText(parentLabel);

    seen.add(key);
    out.push({
      key,
      label,
      parentKey,
      parentLabel,
      videoIds:new Set(ids),
      channels
    });
    if(out.length>=10)break;
  }
  return out;
}

function normalizeAiVideoMeta(payload,rows=[]){
  const allowed=new Set(rows.map(row=>row.id));
  const map=new Map();

  for(const raw of Array.isArray(payload?.videos)?payload.videos:[]){
    const id=clean(raw?.id||"");
    if(!allowed.has(id))continue;
    map.set(id,{
      displayTitle:clean(raw?.displayTitle||"").slice(0,160),
      displaySource:clean(raw?.displaySource||"").slice(0,80),
      duplicateGroup:clean(raw?.duplicateGroup||"").slice(0,64)
    });
  }
  return map;
}

function readAiCatalogCache(){
  try{
    const saved=JSON.parse(localStorage.getItem(AI_CATALOG_CACHE_KEY)||"null");
    if(!saved||!Array.isArray(saved.parents))return null;
    if(Date.now()-Number(saved.at||0)>AI_CATALOG_TTL)return null;
    const parents=normalizeAiCatalog(saved);
    if(!parents.length)return null;
    return {
      parents,
      version:clean(saved.version||"")||fastHash(JSON.stringify(parents))
    };
  }catch{
    return null;
  }
}

function saveAiCatalogCache(parents=[]){
  try{
    const version=fastHash(JSON.stringify(parents.map(parent=>({
      label:parent.label,
      queries:parent.queries,
      hints:parent.hints
    }))));
    localStorage.setItem(AI_CATALOG_CACHE_KEY,JSON.stringify({
      at:Date.now(),
      version,
      parents:parents.map(parent=>({
        label:parent.label,
        queries:parent.queries,
        hints:parent.hints
      }))
    }));
    return version;
  }catch{
    return fastHash(JSON.stringify(parents));
  }
}

function readAiTrendCache(cacheKey,rows=[],forcedParentKey="",forcedParentLabel=""){
  try{
    const saved=JSON.parse(localStorage.getItem(AI_TREND_CACHE_PREFIX+cacheKey)||"null");
    if(!saved||!Array.isArray(saved.topics))return {topics:[],videoMeta:new Map()};
    if(Date.now()-Number(saved.at||0)>30*60*1000)return {topics:[],videoMeta:new Map()};
    return {
      topics:normalizeAiTrendTopics(saved,rows,forcedParentKey,forcedParentLabel),
      videoMeta:normalizeAiVideoMeta(saved,rows)
    };
  }catch{
    return {topics:[],videoMeta:new Map()};
  }
}

function saveAiTrendCache(cacheKey,topics=[],videoMeta=new Map()){
  try{
    localStorage.setItem(
      AI_TREND_CACHE_PREFIX+cacheKey,
      JSON.stringify({
        at:Date.now(),
        topics:topics.map(topic=>({
          label:topic.label,
          parent:topic.parentLabel||"",
          videoIds:[...topic.videoIds]
        })),
        videos:[...videoMeta.entries()].map(([id,meta])=>({id,...meta}))
      })
    );
  }catch{}
}

function aiDisplayRows(rows=[]){
  const enriched=(Array.isArray(rows)?rows:[]).map(row=>{
    const id=itemVideoId(row);
    const meta=state.aiVideoMeta.get(id);
    if(!meta)return row;
    return {
      ...row,
      _displayTitle:meta.displayTitle||"",
      _displaySource:meta.displaySource||"",
      _duplicateGroup:meta.duplicateGroup||""
    };
  });

  const groups=new Map();
  for(const row of enriched){
    const group=clean(row?._duplicateGroup||"");
    if(!group)continue;
    const list=groups.get(group)||[];
    list.push(row);
    groups.set(group,list);
  }

  const representativeByGroup=new Map();
  const countById=new Map();
  for(const [group,list] of groups){
    if(list.length<2)continue;
    const sorted=[...list].sort((a,b)=>{
      const ageA=publishedAgeMs(a);
      const ageB=publishedAgeMs(b);
      if(ageA!==ageB)return ageA-ageB;
      return (Number(b?.views)||0)-(Number(a?.views)||0);
    });
    const representative=sorted[0];
    representativeByGroup.set(group,itemVideoId(representative));
    countById.set(itemVideoId(representative),list.length-1);
  }

  const out=[];
  for(const row of enriched){
    const group=clean(row?._duplicateGroup||"");
    if(group&&representativeByGroup.has(group)){
      const id=itemVideoId(row);
      if(representativeByGroup.get(group)!==id)continue;
      out.push({...row,_duplicateExtra:countById.get(id)||0});
    }else{
      out.push(row);
    }
  }
  return out;
}

function trendRows(rows=[]){
  if(!state.activeTrend)return rows;
  const topic=state.trendTopics.find(item=>item.key===state.activeTrend);
  if(!topic)return rows;
  return rows.filter(row=>topic.videoIds.has(itemVideoId(row)));
}

function renderParentCategories(){
  if(!topicChips)return;
  topicChips.querySelectorAll("[data-ai-parent]").forEach(button=>button.remove());

  if(!state.parentCategories.length){
    setActiveChip(state.activeFeed);
    return;
  }

  if(state.activeParent&&!aiCategoryByKey(state.activeParent)&&isAiCategoryFeed(state.activeFeed)){
    state.activeParent="";
  }

  for(const parent of state.parentCategories){
    const button=document.createElement("button");
    button.className="topic-chip";
    button.type="button";
    button.dataset.aiParent=parent.key;
    button.textContent=parent.label;
    button.title="AI · "+parent.queries.length+" hướng tìm kiếm";
    topicChips.appendChild(button);
  }
  setActiveChip(state.activeFeed);
}

function visibleTrendTopics(){
  return state.trendTopics;
}

function renderTrendTopics(){
  if(!trendTopics)return;

  const topics=visibleTrendTopics();
  if(!supportsAiAnalysisFeed(state.activeFeed)||!state.feedRows.length||!topics.length){
    if(!supportsAiAnalysisFeed(state.activeFeed)||!state.feedRows.length){
      state.activeTrend="";
    }
    trendTopics.hidden=true;
    trendTopics.innerHTML="";
    return;
  }

  if(state.activeTrend&&!topics.some(item=>item.key===state.activeTrend)){
    state.activeTrend="";
  }

  const buttons=[
    '<button class="trend-chip'+(!state.activeTrend?' active':'')+'" type="button" data-trend="">Tất cả</button>',
    ...topics.map(topic=>
      '<button class="trend-chip'+(state.activeTrend===topic.key?' active':'')+'" type="button" data-trend="'+esc(topic.key)+'" title="'+esc(topic.videoIds.size+" video · "+topic.channels.size+" nguồn")+'">'+esc(topic.label)+'</button>'
    )
  ];

  trendTopics.innerHTML=buttons.join("");
  trendTopics.hidden=false;
}

function renderCurrentTrendFeed(){
  renderParentCategories();
  renderTrendTopics();
  renderCards(aiDisplayRows(trendRows(state.feedRows)));
  if(supportsAiAnalysisFeed(state.activeFeed))void refreshAiTrendTopics();
}

async function refreshAiTrendTopics(){
  if(!supportsAiAnalysisFeed(state.activeFeed)||state.feedRows.length<4){
    state.trendTopics=[];
    state.activeTrend="";
    state.trendPoolKey="";
    state.aiVideoMeta=new Map();
    renderTrendTopics();
    return;
  }

  const feedName=state.activeFeed;
  const category=isAiCategoryFeed(feedName)?aiCategoryByKey(aiCategoryKeyFromFeed(feedName)):null;
  const parentKey=category?.key||"";
  const parentLabel=category?.label||"";
  const rows=topicInputRows(state.feedRows);
  if(rows.length<4)return;

  const poolKey=aiTrendPoolKey(feedName+"|"+parentLabel,rows);
  if(poolKey===state.trendPoolKey&&(state.trendTopics.length||state.aiVideoMeta.size))return;

  const cached=readAiTrendCache(poolKey,rows,parentKey,parentLabel);
  if(cached.topics.length||cached.videoMeta.size){
    state.trendPoolKey=poolKey;
    state.trendTopics=cached.topics;
    state.aiVideoMeta=cached.videoMeta;
    if(state.activeTrend&&!cached.topics.some(item=>item.key===state.activeTrend))state.activeTrend="";
    renderTrendTopics();
    renderCards(aiDisplayRows(trendRows(state.feedRows)));
  }

  const seq=++state.trendRequestSeq;

  try{
    const response=await fetch(AI_TOPICS_URL,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "apikey":SUPABASE_ANON,
        "authorization":"Bearer "+SUPABASE_ANON
      },
      body:JSON.stringify({
        mode:"classify",
        scope:feedName,
        parentLabel,
        videos:rows
      })
    });

    const payload=await response.json().catch(()=>null);
    if(seq!==state.trendRequestSeq||state.activeFeed!==feedName)return;
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));

    const topics=normalizeAiTrendTopics(payload,rows,parentKey,parentLabel);
    const videoMeta=normalizeAiVideoMeta(payload,rows);
    state.trendPoolKey=poolKey;
    state.trendTopics=topics;
    state.aiVideoMeta=videoMeta;
    if(state.activeTrend&&!topics.some(item=>item.key===state.activeTrend))state.activeTrend="";
    saveAiTrendCache(poolKey,topics,videoMeta);
    renderTrendTopics();
    renderCards(aiDisplayRows(trendRows(state.feedRows)));
  }catch(error){
    console.warn("ai topics failed",error);
    if(!cached.topics.length&&!cached.videoMeta.size){
      state.trendPoolKey=poolKey;
      state.trendTopics=[];
      state.aiVideoMeta=new Map();
      state.activeTrend="";
      renderTrendTopics();
    }
  }
}

async function refreshAiCatalog(){
  const cached=readAiCatalogCache();
  if(cached){
    state.parentCategories=cached.parents;
    state.catalogVersion=cached.version;
    renderParentCategories();
    return;
  }

  if(state.catalogLoading)return;
  state.catalogLoading=true;
  const seq=++state.catalogSeq;

  try{
    const local=await localEngine(16000);
    const seedRows=await fetchRegionalDiscoveryPool(local,true);
    const rows=topicInputRows(seedRows);

    const response=await fetch(AI_TOPICS_URL,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "apikey":SUPABASE_ANON,
        "authorization":"Bearer "+SUPABASE_ANON
      },
      body:JSON.stringify({mode:"catalog",videos:rows})
    });

    const payload=await response.json().catch(()=>null);
    if(seq!==state.catalogSeq)return;
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));

    const parents=normalizeAiCatalog(payload);
    if(!parents.length)throw new Error("empty_ai_catalog");

    state.parentCategories=parents;
    state.catalogVersion=saveAiCatalogCache(parents);
    renderParentCategories();
  }catch(error){
    console.warn("ai catalog failed",error);
  }finally{
    if(seq===state.catalogSeq)state.catalogLoading=false;
  }
}

trendTopics?.addEventListener("click",event=>{
  const button=event.target.closest("[data-trend]");
  if(!button)return;
  state.activeTrend=button.dataset.trend||"";
  renderTrendTopics();
  renderCards(aiDisplayRows(trendRows(state.feedRows)));
});

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

  const unix=Number(row?.uploaded||row?.published||row?.publishedAt||0);
  if(Number.isFinite(unix)&&unix>0){
    const ms=unix<1e12?unix*1000:unix;
    return Math.max(0,Date.now()-ms);
  }

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


function withinHours(row,hours){
  return publishedAgeMs(row)<=Number(hours||0)*60*60*1000;
}

function identifiedSourcePriority(row={},group=""){
  if(!group)return 0;
  const channel=normalizeSearchText(row?.uploaderName||row?.uploader||row?.channelName||"");
  if(!channel)return 0;

  for(const source of IDENTIFIED_NEWS_SOURCES){
    if(!source.groups.includes(group))continue;
    if(source.aliases.some(alias=>channel.includes(normalizeSearchText(alias)))){
      return 1;
    }
  }
  return 0;
}

function newestFirst(rows=[]){
  return rows
    .map((row,index)=>({
      row,
      index,
      age:publishedAgeMs(row)
    }))
    .sort((a,b)=>
      (a.age-b.age) ||
      (a.index-b.index)
    )
    .map(item=>item.row);
}

function weekFreshViewedFirst(rows=[]){
  return rows
    .map((row,index)=>{
      const ageHours=Math.max(0,publishedAgeMs(row))/(60*60*1000);
      const views=Math.max(0,Number(row?.views)||0);
      const velocity=views/Math.max(1,ageHours);
      const score=
        Math.log10(views+10)*8+
        Math.log10(velocity+1)*12-
        ageHours/24;
      return {row,index,score,ageHours,views};
    })
    .sort((a,b)=>
      (b.score-a.score)||
      (a.ageHours-b.ageHours)||
      (b.views-a.views)||
      (a.index-b.index)
    )
    .map(item=>item.row);
}

function mostViewedFirst(rows=[]){
  return rows
    .map((row,index)=>({row,index,views:Number(row?.views)||0}))
    .sort((a,b)=>(b.views-a.views)||(a.index-b.index))
    .map(item=>item.row);
}

function sortPresetRows(rows=[],preset={}){
  if(preset.weekFreshViewed)return weekFreshViewedFirst(rows);
  if(preset.mostViewed)return mostViewedFirst(rows);
  if(preset.newest)return newestFirst(rows);
  return rows;
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
    const title=clean(row._displayTitle||row.title)||"Video";
    const channel=clean(row._displaySource||row.uploaderName||row.uploader||row.channelName||row._sourceName||"");
    const duplicateExtra=Math.max(0,Number(row._duplicateExtra)||0);
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
          '<div class="card-channel">'+esc(channel)+(duplicateExtra?' · <span class="card-related">+'+esc(String(duplicateExtra))+' nguồn khác</span>':'')+'</div>'+
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

  if(options.updateStatus!==false){
    const total=feed.querySelectorAll("[data-video-id]").length;
    feedStatus.textContent=total?total+" video":"";
  }
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
    void loadFeedPreset(state.activeFeed||"latest");
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

const FEED_CACHE_PREFIX="1988-discovery-v21:";

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


const DAY_MS=24*60*60*1000;

function uploadedWithin(row,maxAgeMs){
  if(row?.isLive)return false;
  const age=publishedAgeMs(row);
  return Number.isFinite(age)&&age>=0&&age<maxAgeMs;
}

function uploadedWithinLatest(row){
  if(row?.isLive)return false;

  // If YouTube already labels an item as "1 day ago" (or older),
  // it should not appear under "Mới nhất", even when relative-time
  // parsing rounds that text to exactly 24 hours.
  const label=normalizeSearchText(
    row?.publishedText||
    row?.uploadDate||
    row?.uploadedDate||
    ""
  );
  if(/\b(ngay|tuan|thang|nam|day|days|week|weeks|month|months|year|years)\b/.test(label)){
    return false;
  }

  return uploadedWithin(row,DAY_MS);
}

function uploadedWithinWeek(row){
  if(row?.isLive)return false;
  const age=publishedAgeMs(row);
  return Number.isFinite(age)&&age>=0&&age<7*DAY_MS;
}

async function normalizeRegionalRow(row={}){
  const duration=Number(row?.duration);
  const uploaded=Number(row?.uploaded);
  const uploadedDate=clean(row?.uploadedDate||row?.publishedText||"");
  const isLive=
    row?.isLive===true ||
    duration<0 ||
    uploaded===-1;

  return {
    ...row,
    isLive,
    publishedText:clean(row?.publishedText||uploadedDate),
    uploader:clean(row?.uploader||row?.uploaderName||row?.channelName||"")
  };
}

async function recentSearch(local,key,query,maxAgeMs,reset=false,filters={}){
  const rows=await pagedSearch(
    local,
    key,
    query,
    {upload_date:"week",sort_by:"upload_date",...filters},
    reset
  );
  return rows.filter(row=>uploadedWithin(row,maxAgeMs));
}

const SOURCE_POOL_KEY="1988-source-pool-v2";
const SOURCE_POOL_TTL=30*60*1000;
let sourcePoolMemory={signature:"",at:0,items:[]};
let sourcePoolRefreshPromise=null;
let sourcePoolRefreshSignature="";

function compactSourcePool(rows=[]){
  const perSource=new Map();
  for(const row of newestFirst(mergeUniqueRows([],rows))){
    const sourceId=String(row?._sourceId||"");
    if(!sourceId)continue;
    const list=perSource.get(sourceId)||[];
    if(list.length>=18)continue;
    list.push(row);
    perSource.set(sourceId,list);
  }
  return [...perSource.values()].flat();
}

function readSourcePoolCache(){
  const signature=sourceSignature();
  if(
    sourcePoolMemory.signature===signature &&
    Array.isArray(sourcePoolMemory.items) &&
    sourcePoolMemory.items.length &&
    Date.now()-sourcePoolMemory.at<SOURCE_POOL_TTL
  ){
    return sourcePoolMemory.items;
  }

  try{
    const row=JSON.parse(localStorage.getItem(SOURCE_POOL_KEY)||"null");
    if(
      row &&
      row.signature===signature &&
      Array.isArray(row.items) &&
      row.items.length &&
      Date.now()-Number(row.at||0)<SOURCE_POOL_TTL
    ){
      sourcePoolMemory={
        signature,
        at:Number(row.at)||Date.now(),
        items:row.items
      };
      return row.items;
    }
  }catch{}

  return [];
}

function saveSourcePoolCache(rows=[]){
  const signature=sourceSignature();
  const items=compactSourcePool(rows);
  const row={signature,at:Date.now(),items};
  sourcePoolMemory=row;
  try{localStorage.setItem(SOURCE_POOL_KEY,JSON.stringify(row));}catch{}
  return items;
}

function primeSourceFeedCaches(rows=[]){
  const latest=sortPresetRows(rows.filter(uploadedWithinLatest),FEED_PRESETS.latest);
  const week=sortPresetRows(rows.filter(uploadedWithinWeek),FEED_PRESETS.week);
  saveFeedCache("latest",latest);
  saveFeedCache("week",week);
}

async function fetchSourcePool(local,sources,reset=true){
  const collected=[];
  let cursor=0;

  const worker=async()=>{
    while(cursor<sources.length){
      const source=sources[cursor++];
      try{
        const rows=await local.channelVideosPage(
          "library:"+source.id,
          source.id,
          reset
        );
        if(Array.isArray(rows)){
          for(const row of rows){
            if(row)collected.push({...row,_sourceId:source.id,_sourceName:source.name});
          }
        }
      }catch(error){
        console.warn("source feed failed",source.id,error);
      }
    }
  };

  const workers=Array.from(
    {length:Math.min(8,sources.length)},
    ()=>worker()
  );
  await Promise.all(workers);
  return collected;
}

function refreshSourcePool(local,sources){
  const signature=sourceSignature();
  if(sourcePoolRefreshPromise&&sourcePoolRefreshSignature===signature){
    return sourcePoolRefreshPromise;
  }

  sourcePoolRefreshSignature=signature;
  sourcePoolRefreshPromise=(async()=>{
    const rows=await fetchSourcePool(local,sources,true);
    if(signature!==sourceSignature())return [];
    const saved=saveSourcePoolCache(rows);
    primeSourceFeedCaches(saved);
    return saved;
  })().finally(()=>{
    if(sourcePoolRefreshSignature===signature){
      sourcePoolRefreshPromise=null;
      sourcePoolRefreshSignature="";
    }
  });

  return sourcePoolRefreshPromise;
}

async function selectedSourceFeed(local,predicate,reset=false){
  const sources=selectedSources();
  if(!sources.length)return [];

  if(reset){
    const cached=readSourcePoolCache();
    if(cached.length){
      void refreshSourcePool(local,sources);
      return cached.filter(predicate);
    }

    const fresh=await refreshSourcePool(local,sources);
    return fresh.filter(predicate);
  }

  const extra=await fetchSourcePool(local,sources,false);
  const previous=readSourcePoolCache();
  const merged=saveSourcePoolCache([...previous,...extra]);
  primeSourceFeedCaches(merged);
  return extra.filter(predicate);
}

const REGIONAL_DISCOVERY_TTL=10*60*1000;
let regionalDiscoveryMemory={at:0,items:[],aiSeed:[]};
let regionalDiscoveryRefreshPromise=null;

function regionalAiPool(){
  const seed=Array.isArray(regionalDiscoveryMemory.aiSeed)?regionalDiscoveryMemory.aiSeed:[];
  const rows=seed.length?seed:(Array.isArray(regionalDiscoveryMemory.items)?regionalDiscoveryMemory.items:[]);
  return rows.filter(uploadedWithinWeek);
}

async function fetchRegionalDiscoveryPool(local,reset=false){
  const cached=regionalAiPool();
  if(reset&&cached.length&&Date.now()-regionalDiscoveryMemory.at<REGIONAL_DISCOVERY_TTL){
    return cached;
  }

  const tasks=[
    local.homePage("regional-discovery",reset).catch(()=>[])
  ];

  if(reset){
    tasks.push(local.hypeFeed().catch(()=>[]));
  }

  if(selectedSourceIds.size){
    tasks.push(selectedSourceFeed(local,uploadedWithinWeek,reset).catch(()=>[]));
  }

  const batches=await Promise.all(tasks);
  const incoming=mergeUniqueRows([],batches.flat()).filter(uploadedWithinWeek);

  if(reset){
    regionalDiscoveryMemory={
      at:Date.now(),
      items:incoming,
      aiSeed:newestFirst(incoming).slice(0,120)
    };
  }else if(incoming.length){
    regionalDiscoveryMemory={
      at:Date.now(),
      items:mergeUniqueRows(regionalDiscoveryMemory.items,incoming).filter(uploadedWithinWeek),
      aiSeed:regionalDiscoveryMemory.aiSeed||[]
    };
  }

  return reset?regionalDiscoveryMemory.items:incoming;
}

async function regionalDiscoveryFeed(local,predicate,reset=false){
  const rows=await fetchRegionalDiscoveryPool(local,reset);
  return rows.filter(predicate);
}

async function collectRecentPages(local,key,query,predicate,reset=false,filters={},maxPages=3){
  const collected=[];
  let first=reset;

  for(let page=0;page<maxPages;page++){
    const rows=await pagedSearch(local,key,query,filters,first);
    first=false;
    if(!Array.isArray(rows)||!rows.length)break;

    for(const row of rows){
      if(predicate(row))collected.push(row);
    }

    // Enough for a full desktop/mobile screen; don't fetch extra unnecessarily.
    if(collected.length>=36)break;
  }

  return mergeUniqueRows([],collected);
}

function mergeContentHashedRows(rows=[]){
  const ranked=weekFreshViewedFirst(
    mergeUniqueRows([],Array.isArray(rows)?rows:[]).filter(uploadedWithinWeek)
  );
  const seenHash=new Set();
  const out=[];

  for(const row of ranked){
    const hash=contentHashForRow(row);
    if(hash&&seenHash.has(hash))continue;
    if(hash)seenHash.add(hash);
    out.push(row);
  }
  return out;
}

async function aiCategoryFeed(local,category,reset=false){
  if(!category)return [];
  const queries=(Array.isArray(category.queries)?category.queries:[]).slice(0,5);
  if(!queries.length)return [];

  const batches=await Promise.all(
    queries.map((query,index)=>
      pagedSearch(
        local,
        "ai-category:"+category.key+":"+index+":"+fastHash(query),
        query,
        {upload_date:"week",sort_by:"upload_date"},
        reset
      ).catch(()=>[])
    )
  );

  return mergeContentHashedRows(batches.flat());
}

const FEED_PRESETS={
  live:{
    title:"LIVE",
    newest:true,
    load:async(local,reset)=>{
      let rows=[];
      try{
        rows=await pagedSearch(local,"live","trực tiếp",{features:["live"],sort_by:"upload_date"},reset);
      }catch{}
      const liveRows=rows.filter(row=>row?.isLive);
      if(liveRows.length)return liveRows;
      try{
        return await local.homePage("live-regional",reset).then(items=>items.filter(row=>row?.isLive));
      }catch{
        return rows;
      }
    }
  },
  latest:{
    title:"Mới nhất",
    newest:true,
    load:(local,reset)=>selectedSourceFeed(local,uploadedWithinLatest,reset)
  },
  week:{
    title:"Tuần này",
    weekFreshViewed:true,
    load:(local,reset)=>selectedSourceFeed(local,uploadedWithinWeek,reset)
  }
};

function feedPresetFor(name="latest"){
  if(isAiCategoryFeed(name)){
    const category=aiCategoryByKey(aiCategoryKeyFromFeed(name));
    if(category){
      return {
        title:category.label,
        weekFreshViewed:true,
        aiCategory:true,
        load:(local,reset)=>aiCategoryFeed(local,category,reset)
      };
    }
  }
  return FEED_PRESETS[name]||FEED_PRESETS.latest;
}

function feedCacheStorageKey(name){
  const suffix=isAiCategoryFeed(name)?":"+String(state.catalogVersion||"catalog"):"";
  return FEED_CACHE_PREFIX+name+suffix;
}

function readFeedCache(name){
  try{
    const row=JSON.parse(localStorage.getItem(feedCacheStorageKey(name))||"null");
    if(!row||!Array.isArray(row.items)||!row.items.length)return [];
    if(isSourceScopedFeed(name)&&row.sourceSignature!==sourceSignature())return [];
    if(isAiCategoryFeed(name)&&Date.now()-Number(row.at||0)>30*60*1000)return [];
    return row.items;
  }catch{
    return [];
  }
}

function saveFeedCache(name,rows){
  try{
    localStorage.setItem(feedCacheStorageKey(name),JSON.stringify({
      at:Date.now(),
      sourceSignature:isSourceScopedFeed(name)?sourceSignature():"",
      items:rows.slice(0,isAiCategoryFeed(name)?120:90)
    }));
  }catch{}
}

async function loadFeedPreset(name="latest"){
  const categoryKey=aiCategoryKeyFromFeed(name);
  const category=categoryKey?aiCategoryByKey(categoryKey):null;
  if(isAiCategoryFeed(name)&&!category)return;

  const preset=feedPresetFor(name);
  const seq=++state.feedSeq;

  state.activeParent=categoryKey;
  state.activeTrend="";
  state.trendTopics=[];
  state.aiVideoMeta=new Map();
  state.trendPoolKey="";
  renderParentCategories();
  renderTrendTopics();

  if(isSourceScopedFeed(name)&&!selectedSourceIds.size){
    state.feedLoading=false;
    state.feedHasMore=false;
    state.feedRows=[];
    setActiveChip(name);
    feedTitle.textContent=preset.title;
    feedStatus.textContent="";
    feed.innerHTML='<div class="empty">Chưa chọn nguồn. Mở “Nguồn” để thêm kênh.</div>';
    return;
  }

  state.feedLoading=true;
  state.feedHasMore=true;
  state.feedRows=[];
  setActiveChip(name);
  feedTitle.textContent=preset.title;

  const cached=readFeedCache(name);
  if(cached.length){
    const rows=sortPresetRows(cached,preset);
    state.feedRows=rows;
    renderCurrentTrendFeed();
    feedStatus.textContent="Đang cập nhật…";
  }else{
    feed.innerHTML='<div class="loading">Đang tải…</div>';
    feedStatus.textContent="";
  }

  try{
    const local=await localEngine(16000);
    const rowsRaw=await preset.load(local,true);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;
    const rows=sortPresetRows(rowsRaw,preset);

    if(!Array.isArray(rows)||!rows.length){
      state.feedRows=[];
      state.feedHasMore=false;
      state.trendTopics=[];
      state.activeTrend="";
      state.aiVideoMeta=new Map();
      state.trendPoolKey="";
      renderTrendTopics();
      saveFeedCache(name,[]);

      if(isSourceScopedFeed(name)){
        feed.innerHTML='<div class="empty">Chưa có video phù hợp từ các nguồn đã chọn.</div>';
      }else if(isAiCategoryFeed(name)){
        feed.innerHTML='<div class="empty">Chưa có video mới trong '+esc(preset.title)+'.</div>';
      }else{
        feed.innerHTML='<div class="empty">Chưa có video phù hợp.</div>';
      }
      feedStatus.textContent="";
      return;
    }

    state.feedRows=mergeUniqueRows([],rows);
    saveFeedCache(name,state.feedRows);
    renderCurrentTrendFeed();
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
  const preset=feedPresetFor(name);
  if(!name||!preset||state.feedLoading||!state.feedHasMore)return;
  if(state.activeTrend)return;

  state.feedLoading=true;
  const seq=state.feedSeq;

  try{
    const local=await localEngine(12000);
    const raw=await preset.load(local,false);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    // Once the user is scrolling, continuation pages are only appended.
    // Never rebuild or re-sort the already visible region.
    const rows=sortPresetRows(raw,preset);
    const existingIds=new Set(state.feedRows.map(itemVideoId));
    const existingHashes=isAiCategoryFeed(name)
      ?new Set(state.feedRows.map(contentHashForRow).filter(Boolean))
      :new Set();
    const added=[];

    for(const row of rows){
      const id=itemVideoId(row);
      if(!id||existingIds.has(id))continue;
      const hash=isAiCategoryFeed(name)?contentHashForRow(row):"";
      if(hash&&existingHashes.has(hash))continue;
      existingIds.add(id);
      if(hash)existingHashes.add(hash);
      added.push(row);
    }

    if(!added.length){
      state.feedHasMore=false;
      return;
    }

    state.feedRows.push(...added);
    if(supportsAiAnalysisFeed(name))void refreshAiTrendTopics();

    const visibleAdded=aiDisplayRows(added);
    if(visibleAdded.length)renderCards(visibleAdded,{append:true,updateStatus:false});
    const visibleTotal=aiDisplayRows(state.feedRows).length;
    feedStatus.textContent=visibleTotal?visibleTotal+" video":"";
    saveFeedCache(name,state.feedRows);
  }catch(error){
    console.warn("load more failed",name,error);
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
  return loadFeedPreset("latest");
}

topicChips.addEventListener("click",e=>{
  const parentButton=e.target.closest("[data-ai-parent]");
  if(parentButton){
    const key=parentButton.dataset.aiParent||"";
    const parent=aiCategoryByKey(key);
    if(!parent)return;
    queryInput.value="";
    clearSuggestions();
    state.activeParent=key;
    void loadFeedPreset("ai:"+key);
    return;
  }

  const button=e.target.closest("[data-feed]");
  if(!button)return;
  state.activeParent="";
  queryInput.value="";
  clearSuggestions();
  void loadFeedPreset(button.dataset.feed||"latest");
});

setupMediaSession();
setupInstall();
setupSourceLibrary();
setupFloatingIframe();
setupFullscreenReturn();
updateModeUi();
void refreshAiCatalog();

const initialVideoId=extractVideoId(new URL(location.href).searchParams.get("v")||"");
if(initialVideoId){
  void playVideo(initialVideoId,{
    title:"Đang tải thông tin…",
    thumbnailUrl:"https://i.ytimg.com/vi/"+initialVideoId+"/hqdefault.jpg"
  });
}else{
  loadInitialFeed();
}
