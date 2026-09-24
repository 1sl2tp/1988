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
const sourceGroupNav=$("#sourceGroupNav");
const sourceGroupTabs=$("#sourceGroupTabs");
const sourceGroupPrev=$("#sourceGroupPrev");
const sourceGroupNext=$("#sourceGroupNext");
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
  floatUserSized:false,
  videoAspect:16/9,
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
  trendTopics:[],
  activeTrend:"",
  trendPoolKey:"",
  trendRequestSeq:0,
  aiVideoMeta:new Map(),
  aiCategoryRows:new Map(),
  aiCategoryTopics:new Map(),
  aiCategoryLoading:new Set(),
  feedSeq:0,
  sourceLibraryDirty:false
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

const SOURCE_SELECTION_KEY="1988-source-selection-v1";
const SOURCE_CUSTOM_KEY="1988-source-custom-v1";
const SOURCE_HIDDEN_KEY="1988-source-hidden-v1"; // legacy: migrated to blocked
const SOURCE_BLOCKED_KEY="1988-source-blocked-v1";
const SOURCE_GROUPS_KEY="1988-source-groups-v1";

const SOURCE_MANAGER_GROUPS=[
  {key:"all",label:"Tất cả"},
  {key:"news",label:"Thời sự"},
  {key:"economy",label:"Kinh tế"},
  {key:"law",label:"Pháp luật"},
  {key:"film",label:"Phim"},
  {key:"music",label:"Nhạc"},
  {key:"tech",label:"Công nghệ"},
  {key:"sports",label:"Thể thao"},
  {key:"entertainment",label:"Giải trí"},
  {key:"other",label:"Khác"}
];

const FIXED_CONTENT_CATEGORIES=[
  {key:"news",group:"news",label:"Thời sự",queries:["thời sự mới nhất","tin tức mới nhất"]},
  {key:"economy",group:"economy",label:"Kinh tế",queries:["kinh tế mới nhất","thị trường tài chính"]},
  {key:"law",group:"law",label:"Pháp luật",queries:["pháp luật mới nhất","an ninh trật tự"]},
  {key:"film",group:"film",label:"Phim",queries:["phim mới","phim ngắn","short drama"]},
  {key:"music",group:"music",label:"Nhạc",queries:["nhạc mới","MV mới"]},
  {key:"tech",group:"tech",label:"Công nghệ",queries:["công nghệ mới","khoa học công nghệ"]},
  {key:"sports",group:"sports",label:"Thể thao",queries:["thể thao mới","bóng đá mới"]},
  {key:"entertainment",group:"entertainment",label:"Giải trí",queries:["giải trí mới","showbiz mới"]}
];

state.parentCategories=FIXED_CONTENT_CATEGORIES.map(item=>({...item}));


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

function readStoredObject(key){
  try{
    const value=JSON.parse(localStorage.getItem(key)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  }catch{
    return {};
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

const legacyHiddenSourceIds=readStoredArray(SOURCE_HIDDEN_KEY)
  .map(String)
  .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id));

let blockedSourceIds=new Set(
  [...readStoredArray(SOURCE_BLOCKED_KEY),...legacyHiddenSourceIds]
    .map(String)
    .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id))
);

let sourceGroupOverrides=readStoredObject(SOURCE_GROUPS_KEY);

function channelLibrary(){
  const out=[];
  const seen=new Set();
  for(const row of [...BASE_CHANNEL_LIBRARY,...customSources]){
    if(!row||seen.has(row.id))continue;
    seen.add(row.id);
    out.push({
      id:row.id,
      name:clean(row.name),
      thumbnailUrl:clean(row.thumbnailUrl||""),
      subscribers:clean(row.subscribers||""),
      groups:Array.isArray(sourceGroupOverrides[row.id])
        ?sourceGroupOverrides[row.id].map(String).filter(Boolean)
        :[]
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
    localStorage.setItem(SOURCE_BLOCKED_KEY,JSON.stringify([...blockedSourceIds]));
    localStorage.setItem(SOURCE_GROUPS_KEY,JSON.stringify(sourceGroupOverrides));
    localStorage.removeItem(SOURCE_HIDDEN_KEY);
  }catch{}
}

function assignSourceGroup(id,group){
  id=String(id||"").trim();
  group=String(group||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!group||group==="all"||group==="other")return false;
  const current=Array.isArray(sourceGroupOverrides[id])
    ?sourceGroupOverrides[id].map(String).filter(Boolean)
    :[];
  if(current.includes(group))return false;
  sourceGroupOverrides[id]=[...current,group].slice(0,4);
  return true;
}

function readSourceSelection(){
  const allowed=new Set(channelLibrary().map(row=>row.id));
  try{
    const saved=JSON.parse(localStorage.getItem(SOURCE_SELECTION_KEY)||"null");
    if(Array.isArray(saved)){
      return new Set(saved.filter(id=>allowed.has(id)&&!blockedSourceIds.has(id)));
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
let sourceManageGroup="all";
let sourceBlockedExpanded=false;
let sourceMetaObserver=null;
const sourceMetaCache=new Map();
const sourceMetaPending=new Set();

function persistSourceSelection(){
  try{
    localStorage.setItem(SOURCE_SELECTION_KEY,JSON.stringify([...selectedSourceIds]));
  }catch{}
}

function sourceStatus(id){
  if(blockedSourceIds.has(id))return "blocked";
  if(selectedSourceIds.has(id))return "selected";
  return "normal";
}

function hideBlockedSourceNow(id){
  id=String(id||"").trim();
  if(!id||!feed)return;

  const source=libraryRow(id);
  const blockedName=normalizeSearchText(sourceMetaFor(source||{}).name||source?.name||"");
  let removed=0;

  for(const card of [...feed.querySelectorAll("[data-video-id]")]){
    const cardSourceId=String(card.dataset.sourceId||"").trim();
    const cardChannel=normalizeSearchText(card.dataset.channel||"");
    if(
      (cardSourceId&&cardSourceId===id) ||
      (blockedName&&cardChannel===blockedName)
    ){
      card.remove();
      removed++;
    }
  }

  if(removed){
    const total=feed.querySelectorAll("[data-video-id]").length;
    feedStatus.textContent=total?total+" video":"";
  }
}

function setSourceStatus(id,status){
  if(!libraryHas(id))return;

  const learnedGroup=sourceManageMode&&sourceManageGroup!=="all"?sourceManageGroup:"";
  if(learnedGroup)assignSourceGroup(id,learnedGroup);

  if(status==="selected"){
    blockedSourceIds.delete(id);
    selectedSourceIds.add(id);
  }else if(status==="blocked"){
    selectedSourceIds.delete(id);
    blockedSourceIds.add(id);
  }else{
    selectedSourceIds.delete(id);
    blockedSourceIds.delete(id);
  }

  if(status==="blocked")hideBlockedSourceNow(id);

  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  state.aiCategoryRows=new Map();
  state.aiCategoryTopics=new Map();
  updateSourceSummary();
  renderSourceLibrary();
}

function selectedSources(){
  const rows=channelLibrary();
  const allowed=new Set(rows.map(row=>row.id));
  let changed=false;

  for(const id of [...selectedSourceIds]){
    if(!allowed.has(id)||blockedSourceIds.has(id)){
      selectedSourceIds.delete(id);
      changed=true;
    }
  }

  if(changed)persistSourceSelection();
  return rows.filter(row=>selectedSourceIds.has(row.id)&&!blockedSourceIds.has(row.id));
}

function sourceSignature(){
  return [...selectedSourceIds].filter(id=>!blockedSourceIds.has(id)).sort().join("|");
}

function isSourceScopedFeed(name){
  return name==="latest"||name==="week";
}

function safeSourceThumb(value=""){
  const raw=clean(value);
  if(raw.startsWith("//"))return "https:"+raw;
  return raw;
}

function sourceMetaFor(row){
  return {...row,...(sourceMetaCache.get(row.id)||{})};
}

function sourceGroupsFor(row={}){
  const meta=sourceMetaFor(row);
  const text=normalizeSearchText(meta.name||row.name||"");
  const groups=new Set([
    ...(Array.isArray(row?.groups)?row.groups:[]),
    ...(Array.isArray(meta?.groups)?meta.groups:[]),
    ...(Array.isArray(sourceGroupOverrides[row?.id])?sourceGroupOverrides[row.id]:[])
  ].map(String).filter(Boolean));

  const has=(pattern)=>pattern.test(text);

  if(has(/phim|movie|drama|vietsub|rap ngon tinh|review phim|me phim|phim hay|phim hoa|phim han|phim trung|kich ngan/))groups.add("film");
  if(has(/nhac|music|ca si|karaoke|bolero|audio|studio|musician/))groups.add("music");
  if(has(/kinh te|tai chinh|chung khoan|stock|dau tu|thi truong|tien te|kinh doanh|thue|broker|invest/))groups.add("economy");
  if(has(/phap luat|cong an|an ninh|luat|ky an|vu an|dieu tra|phap ly|canh sat/))groups.add("law");
  if(has(/cong nghe|technology|tech|vat vo|dien thoai|may tinh|xe may|oto|o to|tipcar|gia xe/))groups.add("tech");
  if(has(/the thao|bong da|football|sport|blv|quan su mo/))groups.add("sports");
  if(has(/giai tri|showbiz|ngoi sao|vie channel|ccap say hi|gameshow|show/))groups.add("entertainment");

  if(has(/bao|news|tin tuc|thoi su|vtv|vov|htv|truyen hinh|phat thanh|todaytv|thong tin chinh phu/)){
    groups.add("news");
  }

  if(!groups.size)groups.add("other");
  return [...groups];
}

function sourceGroupLabels(row={}){
  const map=new Map(SOURCE_MANAGER_GROUPS.map(item=>[item.key,item.label]));
  return sourceGroupsFor(row)
    .filter(key=>key!=="other")
    .slice(0,2)
    .map(key=>map.get(key))
    .filter(Boolean);
}

function sourceRowName(row={}){
  return normalizeSearchText(
    row?._displaySource||
    row?.uploaderName||
    row?.uploader||
    row?.channelName||
    row?._sourceName||
    ""
  );
}

function isBlockedSourceRow(row={}){
  const sourceId=String(row?._sourceId||row?.channelId||row?.uploaderId||"");
  if(sourceId&&blockedSourceIds.has(sourceId))return true;

  const name=sourceRowName(row);
  if(!name)return false;
  for(const id of blockedSourceIds){
    const source=libraryRow(id);
    if(!source)continue;
    const blockedName=normalizeSearchText(sourceMetaFor(source).name||source.name||"");
    if(blockedName&&name===blockedName)return true;
  }
  return false;
}

function updateSourceSummary(){
  const rows=channelLibrary();
  const selected=rows.filter(row=>selectedSourceIds.has(row.id)&&!blockedSourceIds.has(row.id)).length;
  const blocked=rows.filter(row=>blockedSourceIds.has(row.id)).length;
  if(sourceHeaderCount)sourceHeaderCount.textContent=String(selected);
  if(sourceSummary){
    sourceSummary.textContent=sourceManageMode
      ?selected+" chọn · "+blocked+" chặn · "+rows.length+" nguồn"
      :selected+" nguồn đã chọn";
  }
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
  const exists=libraryHas(row.id);
  const status=exists?sourceStatus(row.id):"normal";
  const active=status==="selected";
  const blocked=status==="blocked";
  const subscriber=clean(meta.subscribers||"");
  const groups=sourceGroupLabels(row);
  const statusLabel=active?"Đã chọn":blocked?"Đã chặn":"Chưa chọn";
  const subBits=[];
  if(groups.length)subBits.push(groups.join(" · "));
  if(subscriber)subBits.push(subscriber);
  if(exists)subBits.push(statusLabel);
  else subBits.push("Kết quả từ YouTube");
  const sub=subBits.join(" · ");

  if(remote&&!exists){
    return '<div class="source-row remote" data-source-id="'+esc(row.id)+'">'+
      '<button class="source-main" type="button" data-source-preview="'+esc(row.id)+'">'+
        sourceAvatarHtml(row)+
        '<span class="source-row-info">'+
          '<span class="source-row-name">'+esc(meta.name||row.name)+'</span>'+
          '<span class="source-row-sub">'+esc(sub)+'</span>'+
        '</span>'+
      '</button>'+
      '<button class="source-add" type="button" data-source-add="'+esc(row.id)+'">+ Lưu</button>'+
    '</div>';
  }

  const normalToggle=
    '<button class="source-toggle" type="button" data-source-toggle="'+esc(row.id)+'" '+
      'aria-label="'+(active?'Bỏ chọn nguồn':blocked?'Bỏ chặn và chọn nguồn':'Chọn nguồn')+'" '+
      'aria-pressed="'+(active?'true':'false')+'">'+(blocked?'×':'✓')+'</button>';

  const manageControls=
    '<div class="source-state-actions">'+
      '<button class="source-state-btn select'+(active?' active':'')+'" type="button" data-source-state="selected" data-source-id="'+esc(row.id)+'">Chọn</button>'+
      '<button class="source-state-btn block'+(blocked?' active':'')+'" type="button" data-source-state="blocked" data-source-id="'+esc(row.id)+'">Chặn</button>'+
    '</div>';

  return '<div class="source-row'+(active?' active':'')+(blocked?' blocked':'')+(sourceManageMode?' manage':'')+'" data-source-id="'+esc(row.id)+'">'+
    '<button class="source-main" type="button" data-source-preview="'+esc(row.id)+'">'+
      sourceAvatarHtml(row)+
      '<span class="source-row-info">'+
        '<span class="source-row-name">'+esc(meta.name||row.name)+'</span>'+
        '<span class="source-row-sub">'+esc(sub)+'</span>'+
      '</span>'+
    '</button>'+
    (sourceManageMode?manageControls:normalToggle)+
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

function updateSourceGroupArrows(){
  if(!sourceGroupNav||!sourceGroupTabs)return;
  const maxScroll=Math.max(0,sourceGroupTabs.scrollWidth-sourceGroupTabs.clientWidth);
  const canScroll=maxScroll>4;
  sourceGroupPrev.hidden=!canScroll||sourceGroupTabs.scrollLeft<=3;
  sourceGroupNext.hidden=!canScroll||sourceGroupTabs.scrollLeft>=maxScroll-3;
}

function renderSourceGroupTabs(){
  if(!sourceGroupTabs||!sourceGroupNav)return;
  sourceGroupNav.hidden=!sourceManageMode;
  if(!sourceManageMode){
    sourceGroupTabs.innerHTML="";
    return;
  }

  const rows=channelLibrary();
  sourceGroupTabs.innerHTML=SOURCE_MANAGER_GROUPS.map(group=>{
    const count=group.key==="all"
      ?rows.length
      :rows.filter(row=>sourceGroupsFor(row).includes(group.key)).length;
    return '<button class="source-group-chip'+(sourceManageGroup===group.key?' active':'')+'" type="button" data-source-group="'+esc(group.key)+'">'+
      esc(group.label)+' <span>'+count+'</span>'+
    '</button>';
  }).join("");

  requestAnimationFrame(updateSourceGroupArrows);
}

function sourceStatusSection(label,rows=[],options={}){
  const count=rows.length;
  const blocked=options.blocked===true;
  const collapsed=blocked&&!sourceBlockedExpanded;
  const toggle=blocked
    ?'<button class="source-section-toggle" type="button" data-source-section-toggle="blocked" aria-expanded="'+(!collapsed?'true':'false')+'">'+
        '<span>'+esc(label)+' <b>'+count+'</b></span><span class="source-section-chevron">'+(collapsed?'›':'⌄')+'</span>'+
      '</button>'
    :'<div class="source-section-title">'+esc(label)+' <b>'+count+'</b></div>';

  return '<section class="source-status-section'+(blocked?' blocked-section':'')+(collapsed?' collapsed':'')+'">'+
    toggle+
    (!collapsed&&count?'<div class="source-status-rows">'+rows.join("")+'</div>':"")+
  '</section>';
}

function renderSourceLibrary(){
  if(!sourceList)return;
  const rows=channelLibrary();
  const q=normalizeSearchText(sourceSearch?.value||"");

  const groupFilter=row=>
    !!q||
    !sourceManageMode||
    sourceManageGroup==="all"||
    sourceGroupsFor(row).includes(sourceManageGroup);

  const localRows=rows.filter(row=>
    groupFilter(row)&&
    (!q||normalizeSearchText(sourceMetaFor(row).name||row.name).includes(q))
  );

  const allLibraryIds=new Set(rows.map(row=>row.id));
  const remoteRows=q
    ?sourceRemoteResults.filter(row=>!allLibraryIds.has(row.id))
    :[];

  const parts=[];

  if(sourceManageMode){
    const normalRows=localRows.filter(row=>sourceStatus(row.id)==="normal");
    const selectedRows=localRows.filter(row=>sourceStatus(row.id)==="selected");
    const blockedRows=localRows.filter(row=>sourceStatus(row.id)==="blocked");

    // New YouTube results belong to the "Chưa chọn" area until saved/selected.
    const unselectedHtml=[
      ...remoteRows.map(row=>sourceRowHtml(row,{remote:true})),
      ...normalRows.map(row=>sourceRowHtml(row))
    ];

    parts.push(sourceStatusSection("Chưa chọn",unselectedHtml));
    parts.push(sourceStatusSection("Đã chọn",selectedRows.map(row=>sourceRowHtml(row))));
    parts.push(sourceStatusSection("Đã chặn",blockedRows.map(row=>sourceRowHtml(row)),{blocked:true}));

    if(!unselectedHtml.length&&!selectedRows.length&&!blockedRows.length){
      const message=q
        ?"Không có nguồn phù hợp"
        :sourceManageGroup!=="all"
          ?"Chưa có nguồn trong nhóm này"
          :"Thư viện đang trống";
      parts.push('<div class="source-empty">'+message+'</div>');
    }
  }else{
    if(localRows.length){
      if(q)parts.push('<div class="source-group-label">Trong thư viện · '+localRows.length+'</div>');
      parts.push(localRows.map(row=>sourceRowHtml(row)).join(""));
    }

    if(remoteRows.length){
      parts.push('<div class="source-group-label">Tìm trên YouTube · '+remoteRows.length+'</div>');
      parts.push(remoteRows.map(row=>sourceRowHtml(row,{remote:true})).join(""));
    }

    if(!parts.length){
      parts.push('<div class="source-empty">'+(q?"Không có nguồn phù hợp":"Thư viện đang trống")+'</div>');
    }
  }

  renderSourceGroupTabs();
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

function rememberDiscoveredSources(rows=[],groupHint=""){
  const hint=String(groupHint||"").trim();
  let changed=false;

  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
    if(!/^UC[A-Za-z0-9_-]+$/.test(id))continue;

    const name=clean(
      row?._sourceName||
      row?.uploaderName||
      row?.uploader||
      row?.channelName||
      row?._displaySource||
      ""
    );
    if(!name)continue;

    if(!libraryHas(id)){
      customSources.push({
        id,
        name,
        thumbnailUrl:"",
        subscribers:""
      });
      changed=true;
    }

    if(hint&&assignSourceGroup(id,hint))changed=true;
  }

  if(changed){
    persistSourceLibrary();
    updateSourceSummary();
  }
}

function addSource(row){
  if(!row||!/^UC[A-Za-z0-9_-]+$/.test(String(row.id||"")))return;

  const meta=sourceMetaFor(row);
  if(sourceManageMode&&sourceManageGroup!=="all"){
    assignSourceGroup(row.id,sourceManageGroup);
  }
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

  // Saving a source does not automatically select it.
  blockedSourceIds.delete(row.id);
  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  state.aiCategoryRows=new Map();
  state.aiCategoryTopics=new Map();
  updateSourceSummary();
  renderSourceLibrary();
}

function toggleSource(id){
  if(!libraryHas(id))return;
  const status=sourceStatus(id);
  setSourceStatus(id,status==="selected"?"normal":"selected");
}

function setSourceManageMode(enabled){
  const next=enabled===true;
  if(next&&!sourceManageMode)sourceBlockedExpanded=false;
  sourceManageMode=next;
  if(!sourceManageMode)sourceManageGroup="all";

  if(sourceSettingsBtn){
    sourceSettingsBtn.classList.toggle("active",sourceManageMode);
    sourceSettingsBtn.setAttribute("aria-pressed",sourceManageMode?"true":"false");
    sourceSettingsBtn.setAttribute("aria-label",sourceManageMode?"Xong quản lý nguồn":"Quản lý nguồn theo nhóm");
    sourceSettingsBtn.textContent=sourceManageMode?"✓":"⚙︎";
  }

  if(sourceSearch){
    sourceSearch.placeholder=sourceManageMode?"Tìm trong quản lý nguồn":"Tìm kênh trên YouTube";
  }

  updateSourceSummary();
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

    const ordered=newestFirst(Array.isArray(rows)?rows:[])
      .slice(0,24)
      .map(video=>({
        ...video,
        _sourceId:id,
        channelId:video?.channelId||id,
        _sourceName:sourceMetaFor(row).name||row.name||video?._sourceName||video?.uploader||""
      }));
    sourcePreviewRows=new Map(ordered.map(video=>[itemVideoId(video),video]));

    if(!ordered.length){
      sourcePreviewList.innerHTML='<div class="source-empty">Kênh chưa có video để hiển thị</div>';
      return;
    }

    sourcePreviewList.innerHTML=ordered.map(video=>{
      const videoId=itemVideoId(video);
      const meta=relativePublishedLabel(video);
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
    if(state.activeParent){
      const parent=state.parentCategories.find(item=>item.key===state.activeParent);
      if(parent){
        feed.innerHTML='<div class="loading">Đang cập nhật nguồn…</div>';
        void loadAiParentDiscovery(parent);
      }
    }else if(isSourceScopedFeed(state.activeFeed)){
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

  sourceGroupTabs?.addEventListener("click",event=>{
    const button=event.target.closest("[data-source-group]");
    if(!button)return;
    sourceManageGroup=button.dataset.sourceGroup||"all";
    renderSourceLibrary();
  });

  sourceGroupTabs?.addEventListener("scroll",updateSourceGroupArrows,{passive:true});
  sourceGroupPrev?.addEventListener("click",()=>{
    sourceGroupTabs?.scrollBy({left:-Math.max(180,(sourceGroupTabs?.clientWidth||240)*.72),behavior:"smooth"});
  });
  sourceGroupNext?.addEventListener("click",()=>{
    sourceGroupTabs?.scrollBy({left:Math.max(180,(sourceGroupTabs?.clientWidth||240)*.72),behavior:"smooth"});
  });
  window.addEventListener("resize",()=>requestAnimationFrame(updateSourceGroupArrows),{passive:true});

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
    const sectionToggle=event.target.closest("[data-source-section-toggle]");
    if(sectionToggle){
      if(sectionToggle.dataset.sourceSectionToggle==="blocked"){
        sourceBlockedExpanded=!sourceBlockedExpanded;
        renderSourceLibrary();
      }
      return;
    }

    const addButton=event.target.closest("[data-source-add]");
    if(addButton){
      const id=addButton.dataset.sourceAdd||"";
      const row=sourceRemoteResults.find(item=>item.id===id);
      if(row)addSource(row);
      return;
    }

    const stateButton=event.target.closest("[data-source-state]");
    if(stateButton){
      const id=stateButton.dataset.sourceId||"";
      const next=stateButton.dataset.sourceState||"normal";
      const current=sourceStatus(id);
      setSourceStatus(id,current===next?"normal":next);
      return;
    }

    const toggleButton=event.target.closest("[data-source-toggle]");
    if(toggleButton){
      toggleSource(toggleButton.dataset.sourceToggle||"");
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

    // Keep Quản lý nguồn exactly where it is. Only switch the main media
    // player to the chosen video so the user can continue browsing the source.
    sourcePreviewList.querySelectorAll(".source-video-row.playing").forEach(el=>el.classList.remove("playing"));
    button.classList.add("playing");
    void playVideo(id,{...row,_keepSourceManagerOpen:true});
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
  if(!frame||frame.dataset.floatControlsReady==="1")return;
  frame.dataset.floatControlsReady="1";

  const dock=document.createElement("div");
  dock.className="float-dock-edge";
  dock.setAttribute("aria-label","Di chuyển hoặc thu gọn video");

  const directions=["n","e","s","w","ne","nw","se","sw"];
  const resizeHandles=directions.map(dir=>{
    const handle=document.createElement("div");
    handle.className="float-resize-zone float-resize-"+dir;
    handle.dataset.floatResize=dir;
    handle.setAttribute("aria-label","Kéo để đổi kích thước video");
    return handle;
  });

  frame.append(dock,...resizeHandles);

  const startGesture=(mode,event,dir="")=>{
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
      dir,
      startX:event.clientX,
      startY:event.clientY,
      left:rect.left,
      top:rect.top,
      width:rect.width,
      height:rect.height,
      moved:false
    };

    frame.style.left=rect.left+"px";
    frame.style.top=rect.top+"px";
    frame.style.right="auto";
    frame.style.bottom="auto";
    frame.style.width=rect.width+"px";
    frame.style.height=rect.height+"px";
    frame.style.aspectRatio="auto";

    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  };

  dock.addEventListener("pointerdown",event=>startGesture("move",event));
  resizeHandles.forEach(handle=>{
    handle.addEventListener("pointerdown",event=>startGesture("resize",event,handle.dataset.floatResize||""));
  });

  const onMove=event=>{
    const g=state.floatGesture;
    if(!g||g.id!==event.pointerId||!frame.classList.contains("floating-iframe"))return;
    event.preventDefault();

    const dx=event.clientX-g.startX;
    const dy=event.clientY-g.startY;
    if(Math.abs(dx)+Math.abs(dy)>6)g.moved=true;

    const viewportW=Math.max(240,window.innerWidth);
    const viewportH=Math.max(180,window.innerHeight);
    const minWidth=Math.min(220,Math.max(170,viewportW*.42));
    const minHeight=Math.max(112,Math.min(150,viewportH*.28));
    const maxWidth=Math.max(minWidth,viewportW-16);
    const maxHeight=Math.max(minHeight,viewportH-16);

    if(g.mode==="resize"){
      let left=g.left;
      let top=g.top;
      let width=g.width;
      let height=g.height;
      const dir=g.dir||"";

      if(dir.includes("e"))width=g.width+dx;
      if(dir.includes("s"))height=g.height+dy;
      if(dir.includes("w")){
        width=g.width-dx;
        left=g.left+dx;
      }
      if(dir.includes("n")){
        height=g.height-dy;
        top=g.top+dy;
      }

      if(width<minWidth){
        if(dir.includes("w"))left-=minWidth-width;
        width=minWidth;
      }
      if(height<minHeight){
        if(dir.includes("n"))top-=minHeight-height;
        height=minHeight;
      }

      if(width>maxWidth){
        if(dir.includes("w"))left+=width-maxWidth;
        width=maxWidth;
      }

      // Side-edge resizing behaves like the YouTube mini player:
      // widening/narrowing also changes the height and grows upward.
      if(dir==="e"||dir==="w"){
        const ratio=Math.max(.42,Math.min(1.8,g.height/Math.max(1,g.width)));
        height=Math.max(minHeight,Math.min(maxHeight,width*ratio));
        top=g.top+g.height-height;
      }

      if(height>maxHeight){
        if(dir.includes("n"))top+=height-maxHeight;
        height=maxHeight;
      }

      left=Math.max(8,Math.min(viewportW-width-8,left));
      top=Math.max(8,Math.min(viewportH-height-8,top));

      frame.style.left=left+"px";
      frame.style.top=top+"px";
      frame.style.width=width+"px";
      frame.style.height=height+"px";
      return;
    }

    const rect=frame.getBoundingClientRect();
    const left=Math.max(8,Math.min(viewportW-rect.width-8,g.left+dx));
    const top=Math.max(8,Math.min(viewportH-rect.height-8,g.top+dy));
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
    if(g.mode==="resize")state.floatUserSized=true;
    state.floatBox={
      left:Number.parseFloat(frame.style.left)||finalRect.left,
      top:Number.parseFloat(frame.style.top)||finalRect.top,
      width:finalRect.width,
      height:finalRect.height
    };
    state.floatGesture=null;
  };

  const pointerTargets=[dock,...resizeHandles];
  pointerTargets.forEach(target=>{
    target.addEventListener("pointermove",onMove);
    target.addEventListener("pointerup",stop);
    target.addEventListener("pointercancel",stop);
  });
}

function normalizedVideoAspect(meta=state.currentMeta||{}){
  const width=Number(meta?.videoWidth)||0;
  const height=Number(meta?.videoHeight)||0;
  let ratio=Number(meta?.aspectRatio)||0;
  if(!ratio&&width>0&&height>0)ratio=width/height;
  if(!Number.isFinite(ratio)||ratio<.34||ratio>2.6)ratio=16/9;
  return ratio;
}

function autoFloatSize(frame,ratio=state.videoAspect||16/9){
  const viewportW=Math.max(240,window.innerWidth);
  const viewportH=Math.max(180,window.innerHeight);
  const mobile=viewportW<=640;
  const cssWidth=frame?.getBoundingClientRect?.().width||0;
  let width=cssWidth>0?cssWidth:(mobile?Math.min(256,viewportW*.58):Math.min(360,viewportW*.36));

  // Vertical/square videos may grow high, but should not cover the full screen.
  const maxHeight=Math.max(180,viewportH*(mobile?.68:.74));
  let height=width/ratio;
  if(height>maxHeight){
    height=maxHeight;
    width=height*ratio;
  }

  const minWidth=mobile?150:170;
  if(width<minWidth){
    width=minWidth;
    height=width/ratio;
    if(height>maxHeight){
      height=maxHeight;
      width=height*ratio;
    }
  }

  return {width,height};
}

function applyAutoFloatAspect(frame,{force=false}={}){
  if(!frame||!frame.classList.contains("floating-iframe"))return;
  if(state.floatUserSized&&!force)return;

  const ratio=state.videoAspect||16/9;
  const old=frame.getBoundingClientRect();
  const size=autoFloatSize(frame,ratio);
  const dockLeft=state.floatDock==="left";
  const left=dockLeft
    ?8
    :Math.max(8,window.innerWidth-size.width-8);
  const top=Math.max(8,Math.min(window.innerHeight-size.height-8,old.top||8));

  frame.style.width=size.width+"px";
  frame.style.height=size.height+"px";
  frame.style.aspectRatio="auto";
  frame.style.left=left+"px";
  frame.style.top=top+"px";
  frame.style.right="auto";
  frame.style.bottom="auto";

  state.floatBox={
    left,
    top,
    width:size.width,
    height:size.height
  };
}

function restoreFloatBox(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  frame.classList.toggle("dock-left",state.floatDock==="left");
  frame.classList.toggle("dock-right",state.floatDock!=="left");
  frame.classList.toggle("float-tucked",state.floatTucked);

  if(!state.floatUserSized){
    const ratio=state.videoAspect||16/9;
    const size=autoFloatSize(frame,ratio);
    const box=state.floatBox;
    const left=state.floatDock==="left"
      ?8
      :Math.max(8,window.innerWidth-size.width-8);
    const top=Math.max(8,Math.min(
      window.innerHeight-size.height-8,
      Number(box?.top)||Math.max(8,frame.getBoundingClientRect().top||8)
    ));

    frame.style.width=size.width+"px";
    frame.style.height=size.height+"px";
    frame.style.aspectRatio="auto";
    frame.style.left=left+"px";
    frame.style.top=top+"px";
    frame.style.right="auto";
    frame.style.bottom="auto";
    state.floatBox={left,top,width:size.width,height:size.height};
    return;
  }

  const box=state.floatBox;
  if(!box){
    state.floatUserSized=false;
    restoreFloatBox();
    return;
  }

  const width=Math.max(150,Math.min(Number(box.width)||240,window.innerWidth-16));
  const height=Math.max(112,Math.min(Number(box.height)||width/(state.videoAspect||16/9),window.innerHeight-16));
  const left=Math.max(8,Math.min(window.innerWidth-width-8,box.left));
  const top=Math.max(8,Math.min(window.innerHeight-height-8,box.top));
  frame.style.width=width+"px";
  frame.style.height=height+"px";
  frame.style.aspectRatio="auto";
  frame.style.left=left+"px";
  frame.style.top=top+"px";
  frame.style.right="auto";
  frame.style.bottom="auto";
}

function clearFloatBoxStyles(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;
  for(const prop of ["left","top","right","bottom","width","height","aspect-ratio","--float-ambient-image"])frame.style.removeProperty(prop);
}

function updateFloatingAmbient(frame){
  if(!frame)return;
  const ambientUrl=clean(state.currentMeta?.thumbnailUrl||state.currentMeta?.thumbnail||"")||
    (state.currentId?"https://i.ytimg.com/vi/"+state.currentId+"/hqdefault.jpg":"");
  if(!ambientUrl){
    frame.style.removeProperty("--float-ambient-image");
    return;
  }
  const safeAmbient=ambientUrl.replace(/["'\\\n\r]/g,"");
  frame.style.setProperty("--float-ambient-image",'url("'+safeAmbient+'")');
}

function updateCurrentVideoAspect(meta=state.currentMeta||{}){
  state.videoAspect=normalizedVideoAspect(meta);
  const frame=playerSection?.querySelector(".player-frame");
  if(frame?.classList.contains("floating-iframe")&&!state.floatUserSized){
    applyAutoFloatAspect(frame,{force:true});
  }
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
        state.floatBox={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
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

  if(shouldFloat||floating)updateFloatingAmbient(frame);
  if(shouldFloat===floating)return;

  if(shouldFloat){
    playerSection.style.minHeight=Math.max(1,Math.round(frame.getBoundingClientRect().height))+"px";
    frame.classList.add("floating-iframe");
    updateFloatingAmbient(frame);
    ensureFloatHandles();
    restoreFloatBox();
  }else{
    if(floating){
      const rect=frame.getBoundingClientRect();
      if(rect.width>0){
        state.floatBox={
          left:rect.left,
          top:rect.top,
          width:rect.width,
          height:rect.height
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

const AI_TREND_CACHE_PREFIX="1988-ai-trends-v4:";

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
  const title=normalizeSearchText(clean(row?._displayTitle||row?.title||""));
  if(title.length<16)return "";
  return fastHash(title);
}

function normalizeAiCatalogParents(payload){
  const seen=new Set();
  const out=[];
  for(const raw of Array.isArray(payload?.parents)?payload.parents:[]){
    let label=clean(raw?.label||"").replace(/^#+\s*/,"").slice(0,28);
    if(!label)continue;
    if(/[&/+|]|\bvà\b/iu.test(label)||label.split(/\s+/).length>2||label.length>16){
      const norm=normalizeSearchText(label);
      if(/nhac|am nhac/.test(norm))label="Nhạc";
      else if(/phim|dien anh/.test(norm))label="Phim";
      else if(/thoi su|tin tuc/.test(norm))label="Thời sự";
      else if(/phap luat|an ninh/.test(norm))label="Pháp luật";
      else if(/kinh te|thi truong/.test(norm))label="Kinh tế";
      else if(/the thao/.test(norm))label="Thể thao";
      else if(/cong nghe|khoa hoc/.test(norm))label="Công nghệ";
      else if(/giai tri|showbiz|su kien/.test(norm))label="Giải trí";
      else if(/doi song/.test(norm))label="Đời sống";
      else if(/thoi tiet|moi truong/.test(norm))label="Thời tiết";
      else label=label.split(/\s+/).slice(0,2).join(" ").slice(0,16);
    }
    const key=normalizeSearchText(label)||("parent-"+out.length);
    if(seen.has(key))continue;

    const queries=[...new Set(
      (Array.isArray(raw?.queries)?raw.queries:[])
        .map(value=>clean(value).slice(0,80))
        .filter(Boolean)
    )].slice(0,6);
    const hints=[...new Set(
      (Array.isArray(raw?.hints)?raw.hints:[])
        .map(value=>clean(value).slice(0,48))
        .filter(Boolean)
    )].slice(0,12);

    if(queries.length<2)continue;
    seen.add(key);
    out.push({key,label,queries,hints});
    if(out.length>=9)break;
  }
  return out;
}

function normalizeAiChildTopics(payload,rows=[],parent=null){
  if(!parent)return [];
  const allowed=new Map(rows.map(row=>[itemVideoId(row),row]).filter(([id])=>id));
  const seen=new Set();
  const out=[];

  for(const raw of Array.isArray(payload?.topics)?payload.topics:[]){
    const label=clean(raw?.label||"").replace(/^#+\s*/,"").slice(0,48);
    if(!label)continue;
    const key=normalizeSearchText(label)||("topic-"+out.length);
    if(seen.has(key))continue;

    const ids=[...new Set(
      (Array.isArray(raw?.videoIds)?raw.videoIds:[])
        .map(id=>clean(id))
        .filter(id=>allowed.has(id))
    )];
    if(ids.length<2)continue;

    const channels=new Set(
      ids.map(id=>{
        const row=allowed.get(id);
        return normalizeSearchText(row?.uploaderName||row?.uploader||row?.channelName||row?._sourceName||"");
      }).filter(Boolean)
    );

    seen.add(key);
    out.push({
      key,
      label,
      parentKey:parent.key,
      parentLabel:parent.label,
      videoIds:new Set(ids),
      channels
    });
    if(out.length>=10)break;
  }
  return out;
}

function readAiCatalogCache(cacheKey){
  try{
    const saved=JSON.parse(localStorage.getItem("1988-ai-catalog-v4:"+cacheKey)||"null");
    if(!saved||Date.now()-Number(saved.at||0)>3*60*60*1000)return [];
    return normalizeAiCatalogParents(saved);
  }catch{
    return [];
  }
}

function saveAiCatalogCache(cacheKey,parents=[]){
  try{
    localStorage.setItem("1988-ai-catalog-v4:"+cacheKey,JSON.stringify({
      at:Date.now(),
      parents:parents.map(parent=>({
        label:parent.label,
        queries:parent.queries,
        hints:parent.hints
      }))
    }));
  }catch{}
}

function isShortDramaStoryTitle(row={}){
  const text=normalizeSearchText(clean(row?._displayTitle||row?.title||""));
  if(!text)return false;

  const strong=[
    "trong sinh","trung sinh","xuyen khong","tong tai","nu tong tai",
    "mat than","thau thi","giam bao","do thach","long soai","dien chu",
    "chien than","than y","o re","chui gam chan","phe vat","va mat",
    "nu de","tu tien","tien hiep","khong gian than cap","truyen thua",
    "thien kim","gia ngheo","an danh","dao si xuong nui"
  ];
  if(strong.some(token=>text.includes(token)))return true;

  // "Hệ thống" alone can be technical. It becomes a film signal only
  // when paired with story/reward/power-fantasy vocabulary.
  if(text.includes("he thong")){
    const story=[
      "hoan thuong","ty phu","nhiem vu","phan thuong","hen ho",
      "bim sua","lam giau","doi doi","co dai","my nu","hoa khoi",
      "than hao","bat nang luc","thuc tinh","kich hoat"
    ];
    if(story.some(token=>text.includes(token)))return true;
  }
  return false;
}

function parentSourceGroup(parent={}){
  if(parent?.group)return String(parent.group);
  const key=normalizeSearchText(parent?.label||parent?.key||"");
  if(/thoi su|tin tuc/.test(key))return "news";
  if(/kinh te|thi truong|tai chinh/.test(key))return "economy";
  if(/phap luat|an ninh/.test(key))return "law";
  if(/phim/.test(key))return "film";
  if(/nhac|am nhac/.test(key))return "music";
  if(/cong nghe|khoa hoc/.test(key))return "tech";
  if(/the thao/.test(key))return "sports";
  if(/giai tri/.test(key))return "entertainment";
  return "";
}

function selectedSourcesForParent(parent={}){
  const group=parentSourceGroup(parent);
  const selected=selectedSources();
  if(!group)return selected;
  return selected.filter(source=>sourceGroupsFor(source).includes(group));
}

function librarySourceForVideo(row={}){
  const id=String(row?.channelId||row?._sourceId||row?.uploaderId||"").trim();
  if(id&&libraryHas(id))return libraryRow(id);

  const name=sourceRowName(row);
  if(!name)return null;
  for(const source of channelLibrary()){
    const sourceName=normalizeSearchText(sourceMetaFor(source).name||source.name||"");
    if(sourceName&&sourceName===name)return source;
  }
  return null;
}

function rowMatchesParentRule(parent,row={}){
  const group=parentSourceGroup(parent);
  const text=normalizeSearchText(
    [row?.title,row?._displayTitle,row?.uploader,row?.uploaderName,row?.channelName]
      .map(clean)
      .filter(Boolean)
      .join(" ")
  );
  if(!text)return false;

  switch(group){
    case "film":
      return /\bphim\b|vietsub|thuyet minh|review phim|phim ngan|tong tai|trong sinh|trung sinh|xuyen khong|hoan thuong|chien than|than y|o re|thien kim|nu de|tu tien|co trang|ngon tinh|giam bao|thau thi|long soai|dien chu/.test(text)||
        isShortDramaStoryTitle(row);
    case "music":
      return /\bnhac\b|\bmv\b|official audio|lyric|lyrics|ca khuc|bai hat|ca si|live session|acoustic|cover|remix|karaoke|bolero|vpop|rap viet/.test(text);
    case "economy":
      return /kinh te|tai chinh|thi truong|chung khoan|co phieu|dau tu|gia vang|ty gia|lai suat|ngan hang|doanh nghiep|bitcoin|bat dong san/.test(text);
    case "law":
      return /phap luat|an ninh|cong an|canh sat|vu an|khoi to|bat giu|truy na|dieu tra|xet xu|toi pham|ma tuy|lua dao/.test(text);
    case "tech":
      return /cong nghe|smartphone|iphone|android|chip|phan mem|may tinh|laptop|robot|tri tue nhan tao|artificial intelligence|openai|google ai|samsung|apple/.test(text)&&!isShortDramaStoryTitle(row);
    case "sports":
      return /the thao|bong da|cau thu|tran dau|ban thang|v league|premier league|champions league|world cup|aff cup|tennis|pickleball|formula 1|f1/.test(text);
    case "entertainment":
      return /giai tri|showbiz|gameshow|hau truong|nghe si|dien vien|hoa hau|concert|truyen hinh thuc te|reality show/.test(text);
    case "news":
      return /thoi su|tin tuc|ban tin|tin nong|truc tiep|quoc te|chinh phu|hoi nghi|du bao thoi tiet/.test(text);
    default:
      return false;
  }
}

function locallyTrustedForParent(parent,row={}){
  if(isBlockedSourceRow(row))return false;
  if(row?._selectedCategorySource===true)return true;
  const group=parentSourceGroup(parent);
  const source=librarySourceForVideo(row);
  if(source&&group&&sourceGroupsFor(source).includes(group))return true;
  return rowMatchesParentRule(parent,row);
}

function splitLocalCategoryRows(parent,rows=[]){
  const trusted=[];
  const ambiguous=[];
  for(const row of rows){
    if(isBlockedSourceRow(row))continue;
    (locallyTrustedForParent(parent,row)?trusted:ambiguous).push(row);
  }
  return {trusted,ambiguous};
}

function filterRowsForAiParent(parent,rows=[]){
  const base=rows.filter(row=>!isBlockedSourceRow(row));
  const key=normalizeSearchText(parent?.label||"");
  if(key==="cong nghe"){
    return base.filter(row=>!isShortDramaStoryTitle(row));
  }
  return base;
}

function aiDisclosureRequired(parent){
  const key=normalizeSearchText(parent?.label||"");
  return key==="phim"||key==="phim ngan"||key==="nhac";
}

async function filterNativeAiGeneratedRows(local,parent,rows=[]){
  if(!aiDisclosureRequired(parent)||typeof local?.aiDisclosure!=="function")return rows;

  const source=Array.isArray(rows)?rows:[];
  const keep=new Array(source.length).fill(true);
  let cursor=0;
  const workerCount=Math.min(8,source.length);

  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=source.length)return;
      const id=itemVideoId(source[index]);
      if(!id)continue;
      try{
        const disclosure=await local.aiDisclosure(id);
        if(disclosure?.checked&&disclosure?.madeWithAi)keep[index]=false;
      }catch{}
    }
  };

  await Promise.all(Array.from({length:workerCount},worker));
  return source.filter((row,index)=>keep[index]);
}

function dedupeHashedRows(rows=[]){
  const seenIds=new Set();
  const seenHashes=new Set();
  const out=[];
  for(const row of rows){
    const id=itemVideoId(row);
    if(!id||seenIds.has(id))continue;
    const hash=contentHashForRow(row);
    if(hash&&seenHashes.has(hash))continue;
    seenIds.add(id);
    if(hash)seenHashes.add(hash);
    out.push(row);
  }
  return out;
}

function aiTrendPoolKey(scope,rows=[]){
  const body=rows.map(row=>row.id+"|"+row.title+"|"+row.channel+"|"+row.published).join("\n");
  return String(scope||"latest")+":"+fastHash(body);
}

function normalizeAiParents(payload,rows=[]){
  const allowed=new Map(rows.map(row=>[row.id,row]));
  const seen=new Set();
  const out=[];

  for(const raw of Array.isArray(payload?.parents)?payload.parents:[]){
    const label=clean(raw?.label||"").replace(/^#+\s*/,"").slice(0,28);
    if(!label)continue;

    let key=normalizeSearchText(label);
    if(!key)key="parent-"+out.length;
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

    seen.add(key);
    out.push({
      key,
      label,
      videoIds:new Set(ids),
      channels
    });
    if(out.length>=9)break;
  }
  return out;
}

function normalizeAiTrendTopics(payload,rows=[]){
  const allowed=new Map(rows.map(row=>[row.id,row]));
  const parentKeys=new Map(
    normalizeAiParents(payload,rows).map(parent=>[normalizeSearchText(parent.label),parent.key])
  );
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
    const parentLabel=clean(raw?.parent||"").slice(0,28);
    const parentKey=parentKeys.get(normalizeSearchText(parentLabel))||"";

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

function readAiTrendCache(cacheKey,rows=[]){
  try{
    const saved=JSON.parse(localStorage.getItem(AI_TREND_CACHE_PREFIX+cacheKey)||"null");
    if(!saved||!Array.isArray(saved.topics))return {parents:[],topics:[],videoMeta:new Map()};
    if(Date.now()-Number(saved.at||0)>30*60*1000)return {parents:[],topics:[],videoMeta:new Map()};
    return {
      parents:normalizeAiParents(saved,rows),
      topics:normalizeAiTrendTopics(saved,rows),
      videoMeta:normalizeAiVideoMeta(saved,rows)
    };
  }catch{
    return {parents:[],topics:[],videoMeta:new Map()};
  }
}

function saveAiTrendCache(cacheKey,parents=[],topics=[],videoMeta=new Map()){
  try{
    localStorage.setItem(
      AI_TREND_CACHE_PREFIX+cacheKey,
      JSON.stringify({
        at:Date.now(),
        parents:parents.map(parent=>({
          label:parent.label,
          videoIds:[...parent.videoIds]
        })),
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

function patchRenderedAiMeta(rows=[]){
  for(const row of Array.isArray(rows)?rows:[]){
    const id=itemVideoId(row);
    if(!id)continue;
    const meta=state.aiVideoMeta.get(id);
    if(!meta)continue;
    const card=feed?.querySelector?.('[data-video-id="'+CSS.escape(id)+'"]');
    if(!card)continue;

    const title=clean(meta.displayTitle||row?._displayTitle||row?.title||"");
    const source=clean(meta.displaySource||row?._displaySource||row?.uploaderName||row?.uploader||row?.channelName||row?._sourceName||"");
    const titleEl=card.querySelector(".card-title");
    const sourceEl=card.querySelector(".card-channel");

    if(title&&titleEl){
      titleEl.textContent=title;
      card.dataset.title=title;
    }
    if(source&&sourceEl){
      const duplicate=sourceEl.querySelector(".card-related")?.textContent||"";
      sourceEl.textContent=source;
      if(duplicate){
        const span=document.createElement("span");
        span.className="card-related";
        span.textContent=" · "+duplicate.replace(/^\s*·\s*/,"");
        sourceEl.appendChild(span);
      }
      card.dataset.channel=source;
    }
  }
}

function categoryCacheRows(parentKey=""){
  const cached=state.aiCategoryRows.get(parentKey);
  if(!cached||!Array.isArray(cached.items))return [];
  if(Date.now()-Number(cached.at||0)>15*60*1000)return [];
  return cached.items;
}

function parentRows(rows=[]){
  if(!state.activeParent)return rows;
  return categoryCacheRows(state.activeParent);
}

function trendRows(rows=[]){
  const withinParent=parentRows(rows);
  if(!state.activeTrend)return withinParent;
  const topic=state.trendTopics.find(item=>item.key===state.activeTrend);
  if(!topic)return withinParent;
  return withinParent.filter(row=>topic.videoIds.has(itemVideoId(row)));
}

function renderParentCategories(){
  if(!topicChips)return;
  topicChips.querySelectorAll("[data-ai-parent]").forEach(button=>button.remove());

  state.parentCategories=FIXED_CONTENT_CATEGORIES.map(item=>({...item}));

  if(state.activeParent&&!state.parentCategories.some(parent=>parent.key===state.activeParent)){
    state.activeParent="";
  }

  for(const parent of state.parentCategories){
    const button=document.createElement("button");
    button.className="topic-chip";
    button.type="button";
    button.dataset.aiParent=parent.key;
    button.textContent=parent.label;
    const count=selectedSourcesForParent(parent).length;
    button.title=count+" nguồn đã chọn";
    topicChips.appendChild(button);
  }
  setActiveChip(state.activeFeed);
}

function renderTrendTopics(){
  if(!trendTopics)return;
  if(!state.activeParent||!state.trendTopics.length){
    state.activeTrend="";
    trendTopics.hidden=true;
    trendTopics.innerHTML="";
    return;
  }

  if(state.activeTrend&&!state.trendTopics.some(item=>item.key===state.activeTrend)){
    state.activeTrend="";
  }

  const buttons=[
    '<button class="trend-chip'+(!state.activeTrend?' active':'')+'" type="button" data-trend="">Tất cả</button>',
    ...state.trendTopics.map(topic=>
      '<button class="trend-chip'+(state.activeTrend===topic.key?' active':'')+'" type="button" data-trend="'+esc(topic.key)+'" title="'+esc(topic.videoIds.size+" video · "+topic.channels.size+" nguồn")+'">'+esc(topic.label)+'</button>'
    )
  ];

  trendTopics.innerHTML=buttons.join("");
  trendTopics.hidden=false;
}

async function classifyAiParent(parent,rows=[]){
  const input=topicInputRows(rows.slice(0,48));
  if(input.length<4){
    return {
      topics:[],
      videoMeta:new Map(),
      acceptedVideoIds:new Set(input.map(row=>row.id).filter(Boolean))
    };
  }

  const response=await fetch(AI_TOPICS_URL,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "apikey":SUPABASE_ANON,
      "authorization":"Bearer "+SUPABASE_ANON
    },
    body:JSON.stringify({
      mode:"classify",
      scope:"ai:"+parent.key,
      parentLabel:parent.label,
      videos:input
    })
  });

  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));
  const acceptedVideoIds=new Set(
    (Array.isArray(payload?.acceptedVideoIds)?payload.acceptedVideoIds:input.map(row=>row.id))
      .map(id=>clean(id))
      .filter(Boolean)
  );

  return {
    topics:normalizeAiChildTopics(payload,rows,parent),
    videoMeta:normalizeAiVideoMeta(payload,input),
    acceptedVideoIds
  };
}

const SOURCE_DISCOVERY_TTL=12*60*1000;
const sourceDiscoveryAt=new Map();

async function discoverSourcesForParent(parent,local){
  const group=parentSourceGroup(parent);
  if(!group)return;

  const last=Number(sourceDiscoveryAt.get(group)||0);
  if(Date.now()-last<SOURCE_DISCOVERY_TTL)return;
  sourceDiscoveryAt.set(group,Date.now());

  const queries=[...new Set(
    (Array.isArray(parent?.queries)&&parent.queries.length?parent.queries:[parent?.label])
      .map(clean)
      .filter(Boolean)
  )].slice(0,3);

  const batches=await Promise.all(
    queries.map((query,index)=>
      collectRecentPages(
        local,
        "source-discovery:"+group+":"+index+":"+fastHash(query),
        query,
        uploadedWithinCategoryWindow,
        true,
        {upload_date:"week",sort_by:"upload_date"},
        1
      ).catch(()=>[])
    )
  );

  const discovered=mergeUniqueRows([],batches.flat())
    .filter(uploadedWithinCategoryWindow)
    .filter(row=>!isBlockedSourceRow(row));

  if(discovered.length){
    rememberDiscoveredSources(discovered,group);
    if(sourceManageMode&&!sourcesSheet?.hidden)renderSourceLibrary();
  }
}

async function enrichSelectedCategoryInBackground(parent,rows=[]){
  const sample=(Array.isArray(rows)?rows:[]).slice(0,48);
  if(sample.length<4)return;

  try{
    const classified=await classifyAiParent(parent,sample);
    state.aiVideoMeta=new Map([...state.aiVideoMeta,...classified.videoMeta]);

    const visibleIds=new Set(rows.map(itemVideoId).filter(Boolean));
    const topics=(classified.topics||[])
      .map(topic=>({
        ...topic,
        videoIds:new Set([...topic.videoIds].filter(id=>visibleIds.has(id)))
      }))
      .filter(topic=>topic.videoIds.size>=2)
      .slice(0,10);

    state.aiCategoryTopics.set(parent.key,topics);

    if(state.activeParent===parent.key){
      state.trendTopics=topics;
      renderTrendTopics();
      patchRenderedAiMeta(rows);
    }
  }catch(error){
    console.warn("category enrichment failed",parent?.label||parent?.key,error);
  }
}

async function refreshSelectedCategoryInBackground(parent,local,sources,seq){
  try{
    const raw=await fetchSourcePool(local,sources,true);
    const rows=dedupeHashedRows(
      newestFirst(
        (Array.isArray(raw)?raw:[])
          .filter(uploadedWithinCategoryWindow)
          .filter(row=>!isBlockedSourceRow(row))
          .map(row=>({...row,_selectedCategorySource:true}))
      )
    ).slice(0,90);

    if(!rows.length)return;

    state.aiCategoryRows.set(parent.key,{at:Date.now(),items:rows});

    if(
      seq===state.feedSeq &&
      state.activeParent===parent.key &&
      window.scrollY<120
    ){
      renderCards(aiDisplayRows(rows));
      feedStatus.textContent=rows.length+" video";
    }

    void filterNativeAiGeneratedRows(local,parent,rows).then(safeRows=>{
      if(safeRows.length!==rows.length){
        state.aiCategoryRows.set(parent.key,{at:Date.now(),items:safeRows});
        if(seq===state.feedSeq&&state.activeParent===parent.key){
          renderCards(aiDisplayRows(safeRows));
          feedStatus.textContent=safeRows.length?safeRows.length+" video":"";
        }
      }
      void enrichSelectedCategoryInBackground(parent,safeRows);
    }).catch(()=>{});

    void discoverSourcesForParent(parent,local);
  }catch(error){
    console.warn("category source refresh failed",parent?.label||parent?.key,error);
  }
}

async function loadAiParentDiscovery(parent){
  if(!parent||!parent.key||state.aiCategoryLoading.has(parent.key))return;

  state.aiCategoryLoading.add(parent.key);
  const seq=state.feedSeq;

  try{
    const sources=selectedSourcesForParent(parent);

    if(!sources.length){
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:[]});
      state.aiCategoryTopics.set(parent.key,[]);
      state.trendTopics=[];
      renderTrendTopics();

      if(state.activeParent===parent.key){
        feed.innerHTML='<div class="empty">Chưa chọn nguồn '+esc(parent.label)+'. Mở “Nguồn” để chọn kênh.</div>';
        feedStatus.textContent="";
      }

      void localEngine(12000).then(local=>discoverSourcesForParent(parent,local)).catch(()=>{});
      return;
    }

    const sourceIds=new Set(sources.map(source=>source.id));
    const cachedRows=categoryCacheRows(parent.key);
    if(cachedRows.length){
      const safeCached=cachedRows.filter(row=>{
        const id=String(row?._sourceId||row?.channelId||row?.uploaderId||"");
        return sourceIds.has(id)&&!isBlockedSourceRow(row);
      });

      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:safeCached});

      if(state.activeParent===parent.key){
        renderCards(aiDisplayRows(safeCached));
        feedStatus.textContent=safeCached.length?safeCached.length+" video":"";
      }

      void localEngine(12000).then(local=>
        refreshSelectedCategoryInBackground(parent,local,sources,seq)
      ).catch(()=>{});
      return;
    }

    const sourcePool=readSourcePoolCache()
      .filter(row=>sourceIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||"")))
      .filter(uploadedWithinCategoryWindow)
      .filter(row=>!isBlockedSourceRow(row));

    if(sourcePool.length){
      const rows=dedupeHashedRows(newestFirst(sourcePool))
        .map(row=>({...row,_selectedCategorySource:true}))
        .slice(0,90);

      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:rows});
      state.aiCategoryTopics.set(parent.key,[]);
      state.trendTopics=[];
      renderTrendTopics();

      if(state.activeParent===parent.key){
        renderCards(aiDisplayRows(rows));
        feedStatus.textContent=rows.length?rows.length+" video":"";
      }

      void localEngine(12000).then(local=>
        refreshSelectedCategoryInBackground(parent,local,sources,seq)
      ).catch(()=>{});
      return;
    }

    if(state.activeParent===parent.key){
      feed.innerHTML='<div class="loading">Đang tải '+esc(parent.label)+' từ nguồn đã chọn…</div>';
      feedStatus.textContent="";
    }

    const local=await localEngine(12000);
    const raw=await fetchSourcePool(local,sources,true);
    let rows=dedupeHashedRows(
      newestFirst(
        (Array.isArray(raw)?raw:[])
          .filter(uploadedWithinCategoryWindow)
          .filter(row=>!isBlockedSourceRow(row))
          .map(row=>({...row,_selectedCategorySource:true}))
      )
    ).slice(0,90);

    state.aiCategoryRows.set(parent.key,{at:Date.now(),items:rows});
    state.aiCategoryTopics.set(parent.key,[]);
    state.trendTopics=[];
    renderTrendTopics();

    if(state.activeParent===parent.key){
      if(rows.length){
        renderCards(aiDisplayRows(rows));
        feedStatus.textContent=rows.length+" video";
      }else{
        feed.innerHTML='<div class="empty">Chưa có video mới từ nguồn đã chọn.</div>';
        feedStatus.textContent="";
      }
    }

    // Native YouTube AI disclosure is checked after first paint so Film/Music
    // are not held hostage by dozens of getInfo() requests.
    void filterNativeAiGeneratedRows(local,parent,rows).then(safeRows=>{
      if(safeRows.length!==rows.length){
        state.aiCategoryRows.set(parent.key,{at:Date.now(),items:safeRows});
        if(state.activeParent===parent.key){
          renderCards(aiDisplayRows(safeRows));
          feedStatus.textContent=safeRows.length?safeRows.length+" video":"";
        }
      }
      void enrichSelectedCategoryInBackground(parent,safeRows);
    }).catch(()=>{
      void enrichSelectedCategoryInBackground(parent,rows);
    });

    void discoverSourcesForParent(parent,local);
  }catch(error){
    console.warn("selected category failed",parent?.label||parent?.key,error);
    if(state.activeParent===parent?.key){
      feedStatus.textContent="Chưa tải đủ nội dung";
    }
  }finally{
    state.aiCategoryLoading.delete(parent.key);
  }
}

function renderCurrentTrendFeed(){
  renderParentCategories();
  renderTrendTopics();
  renderCards(aiDisplayRows(trendRows(state.feedRows)));
}

async function refreshAiTrendTopics(){
  state.parentCategories=FIXED_CONTENT_CATEGORIES.map(item=>({...item}));
  renderParentCategories();
}

trendTopics?.addEventListener("click",event=>{
  const button=event.target.closest("[data-trend]");
  if(!button)return;
  state.activeTrend=button.dataset.trend||"";
  renderTrendTopics();
  const visible=aiDisplayRows(trendRows(state.feedRows));
  renderCards(visible);
  feedStatus.textContent=visible.length?visible.length+" video":"";
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
  rows=rows.filter(row=>!isBlockedSourceRow(row));
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

function relativePublishedLabel(row={}){
  const age=publishedAgeMs(row);
  if(!Number.isFinite(age)||age===Number.MAX_SAFE_INTEGER){
    return clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"")||publishedLabel(row);
  }

  const seconds=Math.max(0,Math.floor(age/1000));
  if(seconds<10)return "Vừa xong";
  if(seconds<60)return seconds+" giây trước";

  const minutes=Math.floor(seconds/60);
  if(minutes<60)return minutes+" phút trước";

  const hours=Math.floor(minutes/60);
  if(hours<24)return hours+" giờ trước";

  const days=Math.max(1,Math.floor(hours/24));
  return days+" ngày trước";
}

function feedPublishedLabel(row={}){
  return relativePublishedLabel(row);
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
  return newestFirst(rows);
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
    if(isBlockedSourceRow(row))continue;
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
    const published=feedPublishedLabel(row)||publishedLabel(row)||clean(row.publishedText||"");
    const statBits=[];
    if(viewText)statBits.push(viewText);
    else if(views)statBits.push(fmtViews(views)+" lượt xem");
    if(published)statBits.push(published);
    cards.push(
      '<article class="card" data-video-id="'+esc(id)+'" data-source-id="'+esc(String(row?._sourceId||row?.channelId||row?.uploaderId||""))+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-view-text="'+esc(viewText)+'" data-duration="'+esc(String(duration))+'" data-live="'+(isLive?'1':'0')+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumb(row,id))+'">'+
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
  state.videoAspect=normalizedVideoAspect(seedMeta);
  state.floatUserSized=false;
  if(wasFloating&&frame){
    const floatRect=frame.getBoundingClientRect();
    state.floatBox={
      left:floatRect.left,
      top:floatRect.top,
      width:floatRect.width,
      height:floatRect.height
    };
  }
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

  const keepSourceManagerOpen=seedMeta?._keepSourceManagerOpen===true&&!sourcesSheet?.hidden;

  if(!wasFloating&&!keepSourceManagerOpen){
    try{
      playerSection.scrollIntoView({behavior:"smooth",block:"start"});
    }catch{
      playerSection.scrollIntoView();
    }
  }else if(wasFloating){
    requestAnimationFrame(()=>{
      if(Math.abs(window.scrollY-keepScrollY)>2)window.scrollTo({top:keepScrollY,left:0,behavior:"instant"});
      applyFloatingIframe();
      applyAutoFloatAspect(frame,{force:true});
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

  // Resolve the real video shape first. Full info/watch-next can be much
  // slower, so the floating player must not wait for it before becoming tall.
  void localEngine(7000).then(local=>{
    if(typeof local?.videoAspect==="function"){
      void local.videoAspect(id).then(dimensions=>{
        if(state.currentId!==id)return;
        const width=Number(dimensions?.width)||0;
        const height=Number(dimensions?.height)||0;
        const aspectRatio=Number(dimensions?.aspectRatio)||(
          width>0&&height>0?width/height:0
        );
        if(!aspectRatio)return;

        const meta={
          ...(state.currentMeta||{}),
          videoWidth:width,
          videoHeight:height,
          aspectRatio
        };
        state.currentMeta=meta;
        updateCurrentVideoAspect(meta);
      }).catch(()=>{});
    }

    // Metadata is optional: iframe starts immediately, while details/related
    // results are enriched in parallel without delaying playback.
    void local.info(id).then(detail=>{
      if(state.currentId!==id)return;
      const meta={...seedMeta,...(state.currentMeta||{}),...(detail?.meta||{})};
      state.currentMeta=meta;
      updateCurrentVideoAspect(meta);
      updateNow(meta);
      backgroundPlayer.setMetadata(meta);
      const related=Array.isArray(detail?.related)?detail.related:[];
      if(related.length&&!state.activeFeed){
        feedTitle.textContent="Gợi ý tiếp theo";
        state.feedHasMore=false;
        renderCards(related.slice(0,24));
      }
    }).catch(()=>{});
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
    const rows=(Array.isArray(r?.data?.items)?r.data.items:[])
      .filter(row=>!isBlockedSourceRow(row));
    if(!rows.length)throw new Error("empty_search");
    rememberDiscoveredSources(rows,"");
    renderCards(sourceAwareRows(rows,q));
    return;
  }catch(error){
    console.warn("1988 search API failed; trying local engine",error);
  }

  try{
    const local=await localEngine(9000);
    const rows=(await local.search(q,{type:"video"}))
      .filter(row=>!isBlockedSourceRow(row));
    rememberDiscoveredSources(rows,"");
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

nativePlayer.addEventListener("loadedmetadata",()=>{
  const width=Number(nativePlayer.videoWidth)||0;
  const height=Number(nativePlayer.videoHeight)||0;
  if(width<=0||height<=0)return;

  state.currentMeta={
    ...(state.currentMeta||{}),
    videoWidth:width,
    videoHeight:height,
    aspectRatio:width/height
  };
  updateCurrentVideoAspect(state.currentMeta);
});

nativePlayer.addEventListener("resize",()=>{
  const width=Number(nativePlayer.videoWidth)||0;
  const height=Number(nativePlayer.videoHeight)||0;
  if(width<=0||height<=0)return;
  const nextRatio=width/height;
  if(Math.abs(nextRatio-(state.videoAspect||0))<.015)return;

  state.currentMeta={
    ...(state.currentMeta||{}),
    videoWidth:width,
    videoHeight:height,
    aspectRatio:nextRatio
  };
  updateCurrentVideoAspect(state.currentMeta);
});

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
    return (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row));
  }catch(error){
    console.warn("paged search failed",key,error);
    if(!reset)return [];
    try{
      const rows=await local.search(query,{type:"video",...filters});
      return (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row));
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
  return Number.isFinite(age)&&age>=DAY_MS&&age<7*DAY_MS;
}

function uploadedWithinCategoryWindow(row){
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
      if(!source||blockedSourceIds.has(source.id))continue;
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

function readFeedCache(name){
  try{
    const row=JSON.parse(localStorage.getItem(FEED_CACHE_PREFIX+name)||"null");
    if(!row||!Array.isArray(row.items)||!row.items.length)return [];

    if(isSourceScopedFeed(name)&&row.sourceSignature!==sourceSignature()){
      const selectedIds=new Set(selectedSources().map(source=>source.id));
      return row.items.filter(item=>{
        const sourceId=String(item?._sourceId||item?.channelId||item?.uploaderId||"");
        if(sourceId)return selectedIds.has(sourceId)&&!blockedSourceIds.has(sourceId);
        return !isBlockedSourceRow(item);
      });
    }

    return row.items.filter(item=>!isBlockedSourceRow(item));
  }catch{
    return [];
  }
}

function saveFeedCache(name,rows){
  try{
    localStorage.setItem(FEED_CACHE_PREFIX+name,JSON.stringify({
      at:Date.now(),
      sourceSignature:isSourceScopedFeed(name)?sourceSignature():"",
      items:rows.slice(0,90)
    }));
  }catch{}
}

async function refreshCachedSourceFeedInBackground(name,preset,seq){
  try{
    const local=await localEngine(16000);
    const sources=selectedSources();
    if(!sources.length)return;

    const pool=await refreshSourcePool(local,sources);
    const predicate=name==="latest"?uploadedWithinLatest:uploadedWithinWeek;
    const rows=sortPresetRows(
      (Array.isArray(pool)?pool:[]).filter(predicate),
      preset
    );

    if(!rows.length)return;
    saveFeedCache(name,rows);

    // Never disturb the user's current reading position. If they are still
    // at the top, replace the cached snapshot with the newly refreshed one.
    if(
      seq===state.feedSeq &&
      state.activeFeed===name &&
      !state.activeParent &&
      !state.activeTrend &&
      window.scrollY<120
    ){
      state.feedRows=mergeUniqueRows([],rows);
      renderCurrentTrendFeed();
    }
  }catch(error){
    console.warn("background source refresh failed",name,error);
  }
}

async function loadFeedPreset(name="latest"){
  const preset=FEED_PRESETS[name]||FEED_PRESETS.latest;
  const seq=++state.feedSeq;
  const feedChanged=state.activeFeed!==name;
  if(feedChanged){
    state.activeTrend="";
    state.activeParent="";
    state.trendTopics=[];
    renderTrendTopics();
  }

  if(isSourceScopedFeed(name)&&!selectedSourceIds.size){
    state.feedLoading=false;
    state.feedHasMore=false;
    state.feedRows=[];
    state.activeParent="";
    state.activeTrend="";
    state.trendTopics=[];
    setActiveChip(name);
    renderTrendTopics();
    feedTitle.textContent=preset.title;
    feedStatus.textContent="";
    feed.innerHTML='<div class="empty">Chưa chọn nguồn. Mở “Nguồn” để thêm kênh.</div>';
    void refreshAiTrendTopics();
    return;
  }

  state.feedLoading=true;
  state.feedHasMore=true;
  state.feedRows=[];
  if(!isSourceScopedFeed(name)){
    state.activeParent="";
    state.activeTrend="";
    state.trendTopics=[];
    renderTrendTopics();
  }
  setActiveChip(name);
  feedTitle.textContent=preset.title;

  const cached=readFeedCache(name);
  if(cached.length){
    const rows=sortPresetRows(cached,preset);
    state.feedRows=rows;
    renderCurrentTrendFeed();

    if(isSourceScopedFeed(name)){
      state.feedLoading=false;
      state.feedHasMore=true;
      void refreshCachedSourceFeedInBackground(name,preset,seq);
      void refreshAiTrendTopics();
      return;
    }

    feedStatus.textContent="Đang cập nhật…";
  }else{
    feed.innerHTML='<div class="loading">Đang tải…</div>';
    feedStatus.textContent="";
  }

  try{
    let local=null;
    local=await localEngine(16000);
    const rowsRaw=await preset.load(local,true);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;
    const rows=sortPresetRows(rowsRaw,preset);
    if(!Array.isArray(rows)||!rows.length){
      if(isSourceScopedFeed(name)){
        state.feedRows=[];
        state.feedHasMore=false;
        state.activeParent="";
        state.activeTrend="";
        state.trendTopics=[];
        renderTrendTopics();
        saveFeedCache(name,[]);
        feed.innerHTML='<div class="empty">Chưa có video phù hợp.</div>';
        feedStatus.textContent="";
        return;
      }
      throw new Error("empty_feed");
    }
    state.feedRows=mergeUniqueRows([],rows);
    saveFeedCache(name,state.feedRows);
    renderCurrentTrendFeed();
    state.feedHasMore=true;
    feedStatus.textContent="";
    void refreshAiTrendTopics();
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
  if(state.activeParent||state.activeTrend)return;

  state.feedLoading=true;
  const seq=state.feedSeq;

  try{
    let local=null;
    local=await localEngine(12000);
    const raw=await preset.load(local,false);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    // Important UX rule: once the user is scrolling, never rebuild or
    // re-sort the visible feed. The first page is already sorted correctly.
    // Continuation pages are only deduplicated and appended at the bottom.
    const rows=sortPresetRows(raw,preset);
    const existingIds=new Set(state.feedRows.map(itemVideoId));
    const added=[];
    for(const row of rows){
      const id=itemVideoId(row);
      if(!id||existingIds.has(id))continue;
      existingIds.add(id);
      added.push(row);
    }

    if(!added.length){
      state.feedHasMore=false;
      return;
    }

    state.feedRows.push(...added);
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
    const parent=state.parentCategories.find(item=>item.key===key);
    if(!parent)return;
    state.activeParent=key;
    state.activeTrend="";
    state.trendTopics=state.aiCategoryTopics.get(key)||[];
    setActiveChip(state.activeFeed);
    feedTitle.textContent=parent.label;
    renderTrendTopics();

    const cached=categoryCacheRows(key);
    if(cached.length){
      const visible=aiDisplayRows(trendRows(state.feedRows));
      renderCards(visible);
      feedStatus.textContent=visible.length?visible.length+" video":"";
    }else{
      feed.innerHTML='<div class="loading">Đang tải '+esc(parent.label)+' từ nguồn đã chọn…</div>';
      feedStatus.textContent="";
    }

    void loadAiParentDiscovery(parent);
    return;
  }

  const button=e.target.closest("[data-feed]");
  if(!button)return;
  state.activeParent="";
  state.activeTrend="";
  state.trendTopics=[];
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
renderParentCategories();

const initialVideoId=extractVideoId(new URL(location.href).searchParams.get("v")||"");
if(initialVideoId){
  void playVideo(initialVideoId,{
    title:"Đang tải thông tin…",
    thumbnailUrl:"https://i.ytimg.com/vi/"+initialVideoId+"/hqdefault.jpg"
  });
}else{
  loadInitialFeed();
}
