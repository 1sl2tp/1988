'use strict';

function disableNativeHoverHints(){
  const strip=root=>{
    if(!root)return;
    if(root.nodeType===1&&root.hasAttribute?.("title"))root.removeAttribute("title");
    root.querySelectorAll?.("[title]").forEach(el=>el.removeAttribute("title"));
  };
  strip(document.documentElement);
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==="attributes"){
        const target=mutation.target;
        if(target?.hasAttribute?.("title"))target.removeAttribute("title");
        continue;
      }
      for(const node of mutation.addedNodes)strip(node);
    }
  });
  observer.observe(document.documentElement,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:["title"]
  });
}
disableNativeHoverHints();


const STATE_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-state";
const PIN="8881";
const AUTH_KEY="1988-settings-unlocked-v1";
const UI_EVENT_KEY="1988-source-ui-event-v1";
const SYSTEM_SCOPES=[
  {key:"live",label:"Live"},
  {key:"latest",label:"Ngày"},
  {key:"week",label:"Tuần"}
];

const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
const clean=s=>String(s??"").replace(/\s+/g," ").trim();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const validId=id=>/^UC[A-Za-z0-9_-]+$/.test(String(id||""));

const state={
  remote:null,
  scopes:[],
  scope:"latest",
  searchMode:"channel",
  searchRows:[],
  detail:null,
  detailVideos:[],
  keywords:[],
  editingScope:"",
  searchQuery:"",
  navStack:[],
  navSeq:0,
  activeVideoId:"",
  activeVideoRow:null
};

const el={
  scopeRow:qs("#scopeRow"),
  scopeSummary:qs("#scopeSummary"),
  suggestedList:qs("#suggestedList"),
  selectedList:qs("#selectedList"),
  blockedList:qs("#blockedList"),
  suggestedCount:qs("#suggestedCount"),
  selectedCount:qs("#selectedCount"),
  blockedCount:qs("#blockedCount"),
  searchCount:qs("#searchCount"),
  searchForm:qs("#searchForm"),
  searchInput:qs("#searchInput"),
  searchStatus:qs("#searchStatus"),
  searchList:qs("#searchList"),
  searchBack:qs("#searchBack"),
  preview:qs("#preview"),
  searchColumn:qs('.search-column'),
  inlinePlayer:qs("#inlinePlayer"),
  inlinePlayerTitle:qs("#inlinePlayerTitle"),
  inlinePlayerClose:qs("#inlinePlayerClose"),
  inlineVideoFrame:qs("#inlineVideoFrame"),
  previewAvatar:qs("#previewAvatar"),
  previewName:qs("#previewName"),
  previewMeta:qs("#previewMeta"),
  previewSelect:qs("#previewSelect"),
  previewBlock:qs("#previewBlock"),
  previewMore:qs("#previewMore"),
  previewClose:qs("#previewClose"),
  previewScopes:qs("#previewScopes"),
  videoGrid:qs("#videoGrid"),
  addSource:qs("#addSource"),
  manageSources:qs("#manageSources"),
  sourceManagerModal:qs("#sourceManagerModal"),
  sourceManagerClose:qs("#sourceManagerClose"),
  sourceManagerSearch:qs("#sourceManagerSearch"),
  sourceManagerAdd:qs("#sourceManagerAdd"),
  sourceManagerList:qs("#sourceManagerList"),
  filtersToggle:qs("#filtersToggle"),
  filtersPanel:qs("#filtersPanel"),
  filtersClose:qs("#filtersClose"),
  keywordInput:qs("#keywordInput"),
  keywordChips:qs("#keywordChips"),
  sourceEditPopover:qs("#sourceEditPopover"),
  sourceEditTitle:qs("#sourceEditTitle"),
  sourceRename:qs("#sourceRename"),
  sourceDelete:qs("#sourceDelete"),
  sourceEditClose:qs("#sourceEditClose"),
  auth:qs("#auth"),
  authForm:qs("#authForm"),
  authPin:qs("#authPin"),
  authError:qs("#authError")
};

const bc=typeof BroadcastChannel==="function"
  ?new BroadcastChannel("1988-source-ui-v1")
  :null;

function sourceLabels(){
  return Object.fromEntries(state.scopes.map(x=>[x.key,x.label]));
}

function metaMap(){
  const out=new Map();
  for(const row of state.remote?.customSources||[]){
    if(validId(row?.id))out.set(row.id,row);
  }
  return out;
}

function scopeSet(kind,scope=state.scope){
  const src=
    kind==="selected"
      ?state.remote?.scopedSelected
      :kind==="blocked"
        ?state.remote?.scopedBlocked
        :state.remote?.scopedSuggested;
  return new Set(Array.isArray(src?.[scope])?src[scope]:[]);
}

function sourceStatus(id,scope=state.scope){
  if(scopeSet("blocked",scope).has(id))return"blocked";
  if(scopeSet("selected",scope).has(id))return"selected";
  if(scopeSet("suggested",scope).has(id))return"suggested";
  return"normal";
}

function ensureArray(obj,key){
  if(!obj[key])obj[key]=[];
  return obj[key];
}

function setLocalStatus(id,status,scope){
  for(const key of ["scopedSelected","scopedBlocked","scopedSuggested"]){
    if(!state.remote[key])state.remote[key]={};
    state.remote[key][scope]=(state.remote[key][scope]||[]).filter(x=>x!==id);
  }
  if(status==="selected")ensureArray(state.remote.scopedSelected,scope).push(id);
  if(status==="blocked")ensureArray(state.remote.scopedBlocked,scope).push(id);
}

function stateFetch(method="GET",body){
  return fetch(STATE_URL,{
    method,
    cache:"no-store",
    headers:{
      "content-type":"application/json",
      ...(method==="POST"?{"x-1988-pin":PIN}:{})
    },
    body:body?JSON.stringify(body):undefined
  }).then(async r=>{
    if(!r.ok)throw new Error("state_"+r.status);
    return r.json();
  });
}

function scopeList(remote){
  const labels=remote?.sourceLabels||{};
  const hashtags=(remote?.hashtags||[])
    .filter(x=>x?.enabled!==false)
    .map(x=>({
      key:x.id,
      label:x.label||x.id,
      custom:true
    }));
  return [
    ...SYSTEM_SCOPES.map(x=>({
      key:x.key,
      label:clean(labels[x.key]||x.label),
      custom:false
    })),
    ...hashtags
  ];
}

function currentMeta(id){
  return metaMap().get(id)
    ||state.searchRows.find(x=>x.id===id)
    ||(state.detail?.id===id?state.detail:null)
    ||{id,name:id,thumbnailUrl:"",subscribers:""};
}

function avatarMarkup(row,klass="channel-avatar"){
  const name=clean(row?.name||"Kênh");
  const img=clean(row?.thumbnailUrl||"");
  return '<div class="'+klass+'">'+
    (img?'<img src="'+esc(img)+'" alt="">':esc(name.charAt(0).toUpperCase()))+
  '</div>';
}

function currentScopeLabel(){
  return sourceLabels()[state.scope]||state.scope;
}

function renderScopes(){
  el.scopeRow.innerHTML=state.scopes.map(s=>{
    const count=scopeSet("selected",s.key).size;
    return '<div class="scope-chip-wrap">'+
      '<button class="scope-chip'+(s.key===state.scope?' active':'')+'" data-scope="'+esc(s.key)+'" title="'+esc(s.label)+'">'+
        '<span class="scope-name">'+esc(s.label)+'</span><span class="scope-count">'+count+'</span>'+
      '</button>'+
    '</div>';
  }).join("");
  el.scopeSummary.textContent=currentScopeLabel()+" · "+scopeSet("selected").size+" chọn";
}

function rowsFor(kind){
  const map=metaMap();
  return [...scopeSet(kind)].map(id=>map.get(id)||{
    id,
    name:id,
    thumbnailUrl:"",
    subscribers:""
  });
}

function actionLabel(kind){
  if(kind==="selected")return"Bỏ";
  if(kind==="blocked")return"Bỏ chặn";
  return"Chọn";
}

function cardMarkup(row,kind){
  let actions="";
  if(kind==="suggested"){
    actions=
      '<button class="action-icon select" data-card-action="selected" data-id="'+esc(row.id)+'" title="Chọn" aria-label="Chọn">✓</button>'+
      '<button class="action-icon block" data-card-action="blocked" data-id="'+esc(row.id)+'" title="Chặn" aria-label="Chặn">×</button>';
  }else if(kind==="selected"){
    actions=
      '<button class="action-icon remove" data-card-action="normal" data-id="'+esc(row.id)+'" title="Bỏ khỏi nguồn" aria-label="Bỏ khỏi nguồn">×</button>';
  }else{
    actions=
      '<button class="action-icon restore" data-card-action="normal" data-id="'+esc(row.id)+'" title="Bỏ chặn" aria-label="Bỏ chặn">↺</button>';
  }

  return '<div class="channel-card" data-card-id="'+esc(row.id)+'">'+
    avatarMarkup(row)+
    '<button class="channel-copy" data-open-channel="'+esc(row.id)+'">'+
      '<strong title="'+esc(row.name||row.id)+'">'+esc(row.name||row.id)+'</strong>'+
      '<span>'+esc(row.subscribers||"")+'</span>'+
    '</button>'+
    '<div class="card-actions">'+actions+'</div>'+
  '</div>';
}

function renderColumns(){
  const suggested=rowsFor("suggested");
  const selected=rowsFor("selected");
  const blocked=rowsFor("blocked");

  el.suggestedCount.textContent=suggested.length;
  el.selectedCount.textContent=selected.length;
  el.blockedCount.textContent=blocked.length;

  el.suggestedList.innerHTML=suggested.map(r=>cardMarkup(r,"suggested")).join("")
    ||'<div class="empty">Chưa có gợi ý.</div>';
  el.selectedList.innerHTML=selected.map(r=>cardMarkup(r,"selected")).join("")
    ||'<div class="empty">Chưa chọn kênh.</div>';
  el.blockedList.innerHTML=blocked.map(r=>cardMarkup(r,"blocked")).join("")
    ||'<div class="empty">Chưa chặn kênh.</div>';
}

function searchResultMarkup(row){
  const status=sourceStatus(row.id);
  const video=row._video||null;
  const isVideo=!!video;

  let media=avatarMarkup(row);
  let copy='<button class="channel-copy" data-open-search="'+esc(row._resultKey||row.id)+'">'+
    '<strong>'+esc(row.name||row.id)+'</strong>'+
    '<span>'+esc(status==="normal"?"Ngoài nguồn":status)+'</span>'+
  '</button>';

  if(isVideo){
    const vid=video.videoId||video.id||"";
    const thumb=video.thumbnailUrl||video.thumbnail||("https://i.ytimg.com/vi/"+vid+"/hqdefault.jpg");
    media='<img class="search-thumb" src="'+esc(thumb)+'" alt="">';
    copy='<button class="channel-copy" data-open-search="'+esc(row._resultKey||row.id)+'">'+
      '<strong>'+esc(clean(video._displayTitle||video.title||"Video"))+'</strong>'+
      '<span>'+esc(row.name||"Kênh YouTube")+'</span>'+
    '</button>';
  }

  const currentAction=status==="selected"?"Bỏ":"Chọn";
  const blockAction=status==="blocked"?"Bỏ chặn":"Chặn";

  const otherScopes=state.scopes
    .filter(s=>s.key!==state.scope)
    .map(s=>{
      const st=sourceStatus(row.id,s.key);
      return '<button class="source-mini-chip'+(st==="selected"?' active':'')+'" data-other-scope="'+esc(s.key)+'" data-other-id="'+esc(row.id)+'">'+
        esc(s.label)+(st==="selected"?" ✓":" +")+
      '</button>';
    }).join("");

  return '<div class="channel-card search-result'+(isVideo?' video':'')+'" data-search-id="'+esc(row._resultKey||row.id)+'">'+
    media+
    copy+
    '<div class="card-actions">'+
      '<button class="action-icon select" data-search-select="'+esc(row.id)+'" title="'+esc(currentAction)+'" aria-label="'+esc(currentAction)+'">✓</button>'+
      '<button class="action-icon block" data-search-block="'+esc(row.id)+'" title="'+esc(blockAction)+'" aria-label="'+esc(blockAction)+'">×</button>'+
      '<button class="action-icon more" data-toggle-other="'+esc(row._resultKey||row.id)+'" title="Nguồn khác" aria-label="Nguồn khác">…</button>'+
    '</div>'+
    '<div class="other-sources">'+otherScopes+'</div>'+
  '</div>';
}

function compactViews(value=0,text=""){
  const n=Math.max(0,Number(value)||0);
  if(n>=1e9)return (Math.round(n/1e8)/10).toString().replace(".0","")+"B";
  if(n>=1e6)return (Math.round(n/1e5)/10).toString().replace(".0","")+"M";
  if(n>=1e3)return (Math.round(n/1e2)/10).toString().replace(".0","")+"K";
  if(n>0)return String(Math.round(n));
  const raw=clean(text);
  return raw.replace(/\s*(?:lượt xem|views?)\s*/giu," ").trim();
}

function sourceBadgesForChannel(id){
  const badges=[];
  for(const scope of state.scopes){
    const status=sourceStatus(id,scope.key);
    if(status==="normal")continue;
    badges.push({
      label:scope.label,
      status
    });
    if(badges.length>=3)break;
  }
  return badges;
}

function renderVideoSearchGrid(){
  const rows=state.searchRows.filter(row=>row._video);
  el.searchCount.textContent=rows.length?String(rows.length):"";
  el.searchList.classList.add("video-search-grid");
  el.searchList.innerHTML=rows.map(row=>{
    const video=row._video||{};
    const id=video.videoId||video.id||"";
    const thumb=video.thumbnailUrl||video.thumbnail||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
    const title=clean(video._displayTitle||video.title||"Video");
    const channel=clean(row.name||video.uploader||"Kênh YouTube");
    const avatar=clean(row.thumbnailUrl||video.uploaderThumbnailUrl||"");
    const views=compactViews(video.views,video.viewText);
    const published=clean(video.publishedText||video.published||video.uploadDate||"");
    const key=row._resultKey||row.id;
    const badges=sourceBadgesForChannel(row.id);
    const badgeHtml=badges.map(item=>
      '<span class="video-source-badge '+esc(item.status)+'">'+esc(item.label)+'</span>'
    ).join("");

    return '<article class="video-search-card" data-video-search-open="'+esc(key)+'">'+
      '<div class="video-search-thumb-wrap">'+
        '<img class="video-search-thumb" src="'+esc(thumb)+'" alt="">'+
      '</div>'+
      '<div class="video-search-copy">'+
        '<strong>'+esc(title)+'</strong>'+
        '<div class="video-search-channel">'+
          '<span class="video-search-avatar">'+
            (avatar?'<img src="'+esc(avatar)+'" alt="">':esc(channel.charAt(0).toUpperCase()))+
          '</span>'+
          '<span class="video-search-channel-name">'+esc(channel)+'</span>'+
        '</div>'+
        '<div class="video-search-meta">'+
          (views?'<span>'+esc(views)+' lượt xem</span>':'')+
          (published?'<span>'+esc(published)+'</span>':'')+
        '</div>'+
        (badgeHtml?'<div class="video-source-badges">'+badgeHtml+'</div>':'')+
      '</div>'+
    '</article>';
  }).join("")||'<div class="empty">Không có video phù hợp.</div>';
}

function updateSearchBack(){
  if(!el.searchBack)return;
  el.searchBack.hidden=state.navStack.length===0;
}

function snapshotSearchView(){
  return {
    kind:"search",
    searchMode:state.searchMode,
    searchQuery:state.searchQuery,
    searchRows:state.searchRows.slice(),
    searchStatus:el.searchStatus?.textContent||"",
    searchScroll:el.searchList?.scrollTop||0
  };
}

function snapshotChannelView(){
  return {
    kind:"channel",
    detail:state.detail?{...state.detail}:null,
    detailVideos:state.detailVideos.slice(),
    previewScroll:el.preview?.scrollTop||0
  };
}

function pushNavSnapshot(snapshot){
  if(!snapshot)return;
  state.navStack.push(snapshot);
  if(state.navStack.length>20)state.navStack.shift();
  updateSearchBack();
}

function restoreNavSnapshot(snapshot){
  if(!snapshot)return;
  state.navSeq++;
  closeInlineVideo();
  state.activeVideoId="";
  state.activeVideoRow=null;

  if(snapshot.kind==="search"){
    state.detail=null;
    state.detailVideos=[];
    state.searchMode=snapshot.searchMode||"channel";
    state.searchQuery=clean(snapshot.searchQuery||"");
    state.searchRows=Array.isArray(snapshot.searchRows)?snapshot.searchRows.slice():[];
    if(el.searchInput)el.searchInput.value=state.searchQuery;
    document.querySelectorAll("[data-search-mode]").forEach(button=>{
      button.classList.toggle("active",button.dataset.searchMode===state.searchMode);
    });
    if(el.searchInput){
      el.searchInput.placeholder=state.searchMode==="channel"
        ?"Tìm kênh YouTube"
        :"Tìm video YouTube";
    }
    renderPreview();
    renderSearch();
    if(el.searchStatus)el.searchStatus.textContent=snapshot.searchStatus||(
      state.searchRows.length?state.searchRows.length+" kết quả":""
    );
    requestAnimationFrame(()=>{
      if(el.searchList)el.searchList.scrollTop=Number(snapshot.searchScroll)||0;
    });
    return;
  }

  if(snapshot.kind==="channel"){
    state.detail=snapshot.detail?{...snapshot.detail}:null;
    state.detailVideos=Array.isArray(snapshot.detailVideos)?snapshot.detailVideos.slice():[];
    renderPreview();
    requestAnimationFrame(()=>{
      if(el.preview)el.preview.scrollTop=Number(snapshot.previewScroll)||0;
    });
  }
}

function goBackInSearchPanel(){
  const snapshot=state.navStack.pop();
  updateSearchBack();
  if(snapshot)restoreNavSnapshot(snapshot);
}

function renderSearch(){
  if(state.searchMode==="video"){
    renderVideoSearchGrid();
    return;
  }
  el.searchList.classList.remove("video-search-grid");
  el.searchCount.textContent=state.searchRows.length?String(state.searchRows.length):"";
  el.searchList.innerHTML=state.searchRows.map(searchResultMarkup).join("")
    ||'<div class="empty">Tìm kênh hoặc video mới ở đây.</div>';
}

function renderKeywords(){
  el.keywordChips.innerHTML=state.keywords.length
    ?state.keywords.map(k=>
      '<button class="keyword-chip" data-keyword="'+esc(k)+'">'+esc(k)+' ×</button>'
    ).join("")
    :'<span class="status">Chưa có từ khóa chặn</span>';
}

function closeInlineVideo(){
  if(!el.inlinePlayer||!el.inlineVideoFrame)return;
  el.inlinePlayer.hidden=true;
  el.inlineVideoFrame.src="about:blank";
  if(el.inlinePlayerTitle)el.inlinePlayerTitle.textContent="";
  state.activeVideoId="";
  state.activeVideoRow=null;
}

function playInlineVideo(id,row={},options={}){
  if(!id||!el.inlinePlayer||!el.inlineVideoFrame)return;
  if(options.pushHistory!==false&&state.detail){
    pushNavSnapshot(snapshotChannelView());
  }
  state.activeVideoId=id;
  state.activeVideoRow=row||null;
  const title=clean(row?._displayTitle||row?.title||"Video");
  if(el.inlinePlayerTitle)el.inlinePlayerTitle.textContent=title;
  el.inlinePlayer.hidden=false;
  const origin=encodeURIComponent(location.origin);
  el.inlineVideoFrame.src=
    "https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+
    "?autoplay=1&playsinline=1&rel=0&cc_load_policy=0&enablejsapi=1&origin="+origin;
  requestAnimationFrame(()=>{
    el.inlinePlayer?.scrollIntoView?.({behavior:"smooth",block:"nearest"});
  });
}

function renderPreview(){
  const row=state.detail;
  if(!row){
    el.preview.hidden=true;
    el.searchColumn?.classList.remove("has-preview");
    el.searchList.hidden=false;
    el.searchStatus.hidden=false;
    closeInlineVideo();
    return;
  }

  el.preview.hidden=false;
  el.searchColumn?.classList.add("has-preview");
  el.searchList.hidden=true;
  el.searchStatus.hidden=true;
  el.previewAvatar.innerHTML=avatarMarkup(row,"preview-avatar-inner");
  el.previewName.textContent=row.name||row.id;
  el.previewMeta.textContent=[
    currentScopeLabel(),
    row.subscribers||""
  ].filter(Boolean).join(" · ");

  const current=sourceStatus(row.id);
  const selectActive=current==="selected";
  const blocked=current==="blocked";

  el.previewSelect.textContent=selectActive?"×":"✓";
  el.previewSelect.title=selectActive
    ?"Bỏ khỏi "+currentScopeLabel()
    :"Chọn vào "+currentScopeLabel();
  el.previewSelect.setAttribute("aria-label",el.previewSelect.title);
  el.previewSelect.classList.toggle("active",selectActive);

  el.previewBlock.textContent=blocked?"↺":"×";
  el.previewBlock.title=blocked?"Bỏ chặn":"Chặn";
  el.previewBlock.setAttribute("aria-label",el.previewBlock.title);
  el.previewBlock.classList.toggle("active",blocked);

  el.previewScopes.innerHTML=state.scopes
    .filter(s=>s.key!==state.scope)
    .map(s=>{
      const st=sourceStatus(row.id,s.key);
      return '<button class="assign-chip'+(st==="selected"?' active':'')+(st==="blocked"?' blocked':'')+'" data-preview-scope="'+esc(s.key)+'">'+
        esc(s.label)+(st==="selected"?" ✓":st==="blocked"?" ×":" +")+
      '</button>';
    }).join("");

  renderVideos(state.detailVideos);
}

function renderVideos(rows){
  const fallbackChannel=clean(state.detail?.name||"Kênh YouTube");
  const fallbackAvatar=clean(state.detail?.thumbnailUrl||"");

  el.videoGrid.innerHTML=(rows||[]).map(v=>{
    const id=v.videoId||v.id||"";
    const thumb=v.thumbnailUrl||v.thumbnail||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
    const title=clean(v._displayTitle||v.title||"Video");
    const channel=clean(v.uploader||v._sourceName||v.channelName||fallbackChannel);
    const avatar=clean(v.uploaderThumbnailUrl||v.channelThumbnailUrl||fallbackAvatar);
    const views=compactViews(v.views,v.viewText);
    const published=clean(v.publishedText||v.published||v.uploadDate||"");

    return '<article class="video-card" data-preview-video="'+esc(id)+'">'+
      '<img class="video-thumb" src="'+esc(thumb)+'" alt="">'+
      '<div class="video-copy">'+
        '<strong>'+esc(title)+'</strong>'+
        '<div class="video-card-channel">'+
          '<span class="video-card-avatar">'+
            (avatar?'<img src="'+esc(avatar)+'" alt="">':esc(channel.charAt(0).toUpperCase()))+
          '</span>'+
          '<span class="video-card-channel-name">'+esc(channel)+'</span>'+
        '</div>'+
        '<div class="video-card-meta">'+
          (views?'<span>'+esc(views)+' lượt xem</span>':'')+
          (published?'<span>'+esc(published)+'</span>':'')+
        '</div>'+
      '</div>'+
    '</article>';
  }).join("")||'<div class="empty">Chưa có video.</div>';
}

async function waitYT(){
  if(window.YTLocal)return window.YTLocal;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("yt_timeout")),12000);
    window.addEventListener("ytlocalready",()=>{
      clearTimeout(timer);
      resolve(window.YTLocal);
    },{once:true});
  });
}

async function openChannel(row,seedVideo=null,options={}){
  if(!row||!validId(row.id))return;

  if(options.pushHistory!==false){
    pushNavSnapshot(snapshotSearchView());
  }
  const navSeq=++state.navSeq;
  state.detail={...currentMeta(row.id),...row};
  state.detailVideos=seedVideo?[seedVideo]:[];
  renderPreview();
  requestAnimationFrame(()=>{
    if(el.preview)el.preview.scrollTop=0;
  });

  try{
    const yt=await waitYT();
    const [meta,videos]=await Promise.all([
      yt.channelMeta(row.id).catch(()=>null),
      yt.channelVideosPage("manager:"+row.id,row.id,true).catch(()=>[])
    ]);

    if(navSeq!==state.navSeq)return;
    if(meta?.id)state.detail={...state.detail,...meta};

    const merged=[];
    const seen=new Set();
    for(const v of [seedVideo,...(Array.isArray(videos)?videos:[])]){
      if(!v)continue;
      const id=v.videoId||v.id||"";
      if(!id||seen.has(id))continue;
      seen.add(id);
      merged.push(v);
    }
    if(navSeq!==state.navSeq)return;
    state.detailVideos=merged.slice(0,30);
    renderPreview();
  }catch(error){
    console.warn("preview channel failed",error);
  }
}

async function search(q,options={}){
  q=clean(q);
  if(options.resetHistory!==false){
    state.navStack=[];
    updateSearchBack();
  }
  state.searchQuery=q;
  if(el.searchInput&&el.searchInput.value!==q)el.searchInput.value=q;
  if(state.detail){
    state.detail=null;
    state.detailVideos=[];
    renderPreview();
  }
  el.searchList.hidden=false;
  el.searchStatus.hidden=false;
  if(!q){
    state.searchRows=[];
    el.searchStatus.textContent="";
    renderSearch();
    return;
  }

  el.searchStatus.textContent="Đang tìm…";
  try{
    const yt=await waitYT();
    if(state.searchMode==="channel"){
      const rows=await yt.searchChannels(q);
      state.searchRows=(rows||[]).map((x,i)=>({
        id:x.id||x.channelId,
        name:x.name||x.title||"Kênh YouTube",
        thumbnailUrl:x.thumbnailUrl||x.thumbnail||"",
        subscribers:x.subscribers||"",
        _resultKey:"c:"+i+":"+(x.id||x.channelId||"")
      })).filter(x=>validId(x.id));
    }else{
      const rows=await yt.search(q,{type:"video"});
      state.searchRows=(rows||[]).map((v,i)=>{
        const id=String(v.channelId||v._sourceId||v.uploaderId||"");
        if(!validId(id))return null;
        return{
          id,
          name:clean(v.uploader||v._sourceName||v.channelName||"Kênh YouTube"),
          thumbnailUrl:v.uploaderThumbnailUrl||v.channelThumbnailUrl||"",
          subscribers:"",
          _video:v,
          _resultKey:"v:"+i+":"+(v.videoId||v.id||"")+":"+id
        };
      }).filter(Boolean).slice(0,30);
    }

    el.searchStatus.textContent=state.searchRows.length+" kết quả";
    renderSearch();
  }catch(error){
    console.warn(error);
    el.searchStatus.textContent="Không tìm được";
  }
}

async function writeStatus(id,status,scope=state.scope){
  const row=currentMeta(id);
  setLocalStatus(id,status,scope);

  renderScopes();
  renderColumns();
  renderSearch();
  renderSourceManagerList(el.sourceManagerSearch?.value||"");
  if(state.detail?.id===id)renderPreview();

  const event={
    type:"source-state",
    id,
    status,
    scope,
    name:row.name||"",
    at:Date.now()
  };

  try{bc?.postMessage(event)}catch{}
  try{localStorage.setItem(UI_EVENT_KEY,JSON.stringify(event))}catch{}

  try{
    await stateFetch("POST",{
      op:"set_source",
      scope,
      channel_id:id,
      status,
      version:Date.now(),
      source:{
        name:row.name||"",
        thumbnailUrl:row.thumbnailUrl||"",
        subscribers:row.subscribers||""
      }
    });
  }catch(error){
    console.warn("save source status failed",error);
  }
}

async function savePresentationState(){
  if(!state.remote)return false;

  const next={
    ...state.remote,
    sourceLabels:{...(state.remote.sourceLabels||{})}
  };

  if(state.keywords.length)next.sourceLabels.__live_keywords=state.keywords.join("\n");
  else delete next.sourceLabels.__live_keywords;

  try{
    const result=await stateFetch("POST",{state:next,version:Date.now()});
    if(result?.ok){
      state.remote=next;
      return true;
    }
  }catch(error){
    console.warn(error);
  }
  return false;
}

async function loadState(){
  const result=await stateFetch();
  state.remote=result.state||{};
  state.scopes=scopeList(state.remote);
  state.keywords=clean(state.remote?.sourceLabels?.__live_keywords||"")
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const wanted=new URL(location.href).searchParams.get("scope")||"latest";
  state.scope=state.scopes.some(s=>s.key===wanted)
    ?wanted
    :(state.scopes[0]?.key||"latest");

  renderScopes();
  renderColumns();
  renderSearch();
  renderKeywords();
  updateSearchBack();
}

function renderSourceManagerList(query=""){
  if(!el.sourceManagerList)return;
  const needle=clean(query).toLocaleLowerCase("vi-VN");
  const rows=state.scopes.filter(scope=>{
    if(!needle)return true;
    return clean(scope.label||scope.key).toLocaleLowerCase("vi-VN").includes(needle);
  });

  el.sourceManagerList.innerHTML=rows.map(scope=>{
    const selected=scopeSet("selected",scope.key).size;
    const suggested=scopeSet("suggested",scope.key).size;
    const blocked=scopeSet("blocked",scope.key).size;
    return '<div class="source-manager-row">'+
      '<button class="source-manager-name" type="button" data-manager-open="'+esc(scope.key)+'">'+
        '<strong title="'+esc(scope.label||scope.key)+'">'+esc(scope.label||scope.key)+'</strong>'+
        '<span>'+(scope.custom?'Nguồn tùy chỉnh':'Nguồn hệ thống')+'</span>'+
      '</button>'+
      '<span class="source-manager-stat">'+selected+'</span>'+
      '<span class="source-manager-stat">'+suggested+'</span>'+
      '<span class="source-manager-stat">'+blocked+'</span>'+
      '<div class="source-manager-actions">'+
        '<button class="secondary" type="button" data-manager-rename="'+esc(scope.key)+'">Đổi tên</button>'+
        (scope.custom?'<button class="danger" type="button" data-manager-delete="'+esc(scope.key)+'">Xóa</button>':'')+
      '</div>'+
    '</div>';
  }).join("")||'<div class="empty">Không có nguồn phù hợp.</div>';
}

function openSourceManager(){
  if(!el.sourceManagerModal)return;
  el.sourceManagerModal.hidden=false;
  if(el.sourceManagerSearch)el.sourceManagerSearch.value="";
  renderSourceManagerList();
  requestAnimationFrame(()=>el.sourceManagerSearch?.focus());
}

function closeSourceManager(){
  if(el.sourceManagerModal)el.sourceManagerModal.hidden=true;
}

async function createSource(){
  const label=clean(prompt("Tên nguồn mới","")||"");
  if(!label)return null;

  const result=await stateFetch("POST",{op:"create_hashtag",label});
  state.remote.hashtags=result.hashtags||state.remote.hashtags;
  state.scopes=scopeList(state.remote);

  const latest=[...state.scopes].reverse().find(s=>s.custom&&s.label===label);
  if(latest)state.scope=latest.key;

  renderScopes();
  renderColumns();
  renderSourceManagerList(el.sourceManagerSearch?.value||"");
  if(state.detail)renderPreview();
  return latest||null;
}

function openSourceEditor(scope){
  const row=state.scopes.find(x=>x.key===scope);
  if(!row)return;
  state.editingScope=scope;
  el.sourceEditTitle.textContent=row.label||scope;
  el.sourceDelete.hidden=!row.custom;
  el.sourceEditPopover.hidden=false;
}

async function renameScope(scope){
  const row=state.scopes.find(x=>x.key===scope);
  if(!row)return;

  const label=clean(prompt("Đổi tên nguồn",row.label||"")||"");
  if(!label)return;

  if(row.custom){
    const result=await stateFetch("POST",{
      op:"rename_hashtag",
      hashtag_id:scope,
      label
    });
    state.remote.hashtags=result.hashtags||state.remote.hashtags;
  }else{
    state.remote.sourceLabels={
      ...(state.remote.sourceLabels||{}),
      [scope]:label
    };
    await savePresentationState();
  }

  state.scopes=scopeList(state.remote);
  renderScopes();
  renderSourceManagerList(el.sourceManagerSearch?.value||"");
  if(state.detail)renderPreview();
}

async function deleteScope(scope){
  const row=state.scopes.find(x=>x.key===scope);
  if(!row?.custom)return;
  if(!confirm('Xóa nguồn "'+(row.label||scope)+'"?'))return;

  const result=await stateFetch("POST",{
    op:"set_hashtag_enabled",
    hashtag_id:scope,
    enabled:false
  });

  state.remote.hashtags=result.hashtags||state.remote.hashtags;
  state.scopes=scopeList(state.remote);

  if(state.scope===scope){
    state.scope=state.scopes[0]?.key||"latest";
  }

  renderScopes();
  renderColumns();
  renderSourceManagerList(el.sourceManagerSearch?.value||"");
  if(state.detail)renderPreview();
}

function applyExternalUiEvent(data={}){
  if(data?.type!=="source-state")return;
  const id=String(data.id||"").trim();
  const scope=String(data.scope||"").trim();
  const status=String(data.status||"normal");
  if(!validId(id)||!state.scopes.some(s=>s.key===scope))return;

  setLocalStatus(id,status,scope);
  renderScopes();
  renderColumns();
  renderSearch();
  if(state.detail?.id===id)renderPreview();
}

function requireAuth(){
  if(localStorage.getItem(AUTH_KEY)==="1")return Promise.resolve(true);

  el.auth.hidden=false;
  return new Promise(resolve=>{
    el.authForm.onsubmit=e=>{
      e.preventDefault();
      if(clean(el.authPin.value)!==PIN){
        el.authError.textContent="Mã chưa đúng";
        return;
      }
      localStorage.setItem(AUTH_KEY,"1");
      el.auth.hidden=true;
      resolve(true);
    };
  });
}

el.scopeRow.addEventListener("click",event=>{
  const button=event.target.closest("[data-scope]");
  if(!button)return;

  state.scope=button.dataset.scope;
  history.replaceState(null,"","?scope="+encodeURIComponent(state.scope));
  renderScopes();
  renderColumns();
  renderSearch();
  if(state.detail)renderPreview();
});

for(const [list,kind] of [
  [el.suggestedList,"suggested"],
  [el.selectedList,"selected"],
  [el.blockedList,"blocked"]
]){
  list.addEventListener("click",event=>{
    const open=event.target.closest("[data-open-channel]");
    if(open){
      openChannel(currentMeta(open.dataset.openChannel));
      return;
    }

    const action=event.target.closest("[data-card-action]");
    if(!action)return;

    const id=action.dataset.id;
    const status=action.dataset.cardAction||"normal";
    writeStatus(id,status);
  });
}

qsa(".search-mode-btn").forEach(button=>{
  button.addEventListener("click",()=>{
    state.searchMode=button.dataset.searchMode;
    qsa(".search-mode-btn").forEach(x=>x.classList.toggle("active",x===button));
    el.searchInput.placeholder=state.searchMode==="channel"
      ?"Tìm kênh YouTube"
      :"Tìm video YouTube";
    const keptQuery=clean(el.searchInput.value||state.searchQuery||"");
    state.searchQuery=keptQuery;
    state.searchRows=[];
    el.searchStatus.textContent="";
    renderSearch();
    if(keptQuery)search(keptQuery,{resetHistory:true});
    requestAnimationFrame(()=>el.searchInput.focus());
  });
});

el.el.searchBack?.addEventListener("click",goBackInSearchPanel);

searchForm.addEventListener("submit",event=>{
  event.preventDefault();
  search(el.searchInput.value,{resetHistory:true});
});

el.searchList.addEventListener("click",event=>{
  const videoCard=event.target.closest("[data-video-search-open]");
  if(videoCard){
    const key=videoCard.dataset.videoSearchOpen;
    const row=state.searchRows.find(x=>x._resultKey===key);
    if(row)openChannel(row,row._video||null);
    return;
  }
  const toggle=event.target.closest("[data-toggle-other]");
  if(toggle){
    const card=toggle.closest(".channel-card");
    card?.classList.toggle("show-other");
    return;
  }

  const other=event.target.closest("[data-other-scope]");
  if(other){
    const id=other.dataset.otherId;
    const scope=other.dataset.otherScope;
    const st=sourceStatus(id,scope);
    writeStatus(id,st==="selected"?"normal":"selected",scope);
    return;
  }

  const select=event.target.closest("[data-search-select]");
  if(select){
    const id=select.dataset.searchSelect;
    const st=sourceStatus(id);
    writeStatus(id,st==="selected"?"normal":"selected");
    return;
  }

  const block=event.target.closest("[data-search-block]");
  if(block){
    const id=block.dataset.searchBlock;
    const st=sourceStatus(id);
    writeStatus(id,st==="blocked"?"normal":"blocked");
    return;
  }

  const open=event.target.closest("[data-open-search]");
  if(open){
    const key=open.dataset.openSearch;
    const row=state.searchRows.find(x=>x._resultKey===key);
    if(row)openChannel(row,row._video||null);
  }
});

el.previewSelect.addEventListener("click",()=>{
  if(!state.detail)return;
  const st=sourceStatus(state.detail.id);
  writeStatus(state.detail.id,st==="selected"?"normal":"selected");
});

el.previewBlock.addEventListener("click",()=>{
  if(!state.detail)return;
  const st=sourceStatus(state.detail.id);
  writeStatus(state.detail.id,st==="blocked"?"normal":"blocked");
});

el.previewScopes.addEventListener("click",event=>{
  const button=event.target.closest("[data-preview-scope]");
  if(!button||!state.detail)return;
  const scope=button.dataset.previewScope;
  const st=sourceStatus(state.detail.id,scope);
  writeStatus(state.detail.id,st==="selected"?"normal":"selected",scope);
});

el.inlinePlayerClose?.addEventListener("click",()=>{
  if(state.navStack.length&&state.navStack[state.navStack.length-1]?.kind==="channel"){
    goBackInSearchPanel();
    return;
  }
  closeInlineVideo();
});

el.previewClose.addEventListener("click",()=>{
  if(state.navStack.length){
    goBackInSearchPanel();
    return;
  }
  state.navSeq++;
  state.detail=null;
  state.detailVideos=[];
  closeInlineVideo();
  renderPreview();
  el.searchList.hidden=false;
  el.searchStatus.hidden=false;
  updateSearchBack();
});

el.videoGrid.addEventListener("click",event=>{
  const card=event.target.closest("[data-preview-video]");
  if(!card)return;
  const id=card.dataset.previewVideo||"";
  if(!id)return;
  const row=state.detailVideos.find(v=>(v.videoId||v.id||"")===id)||{};
  playInlineVideo(id,row);
});



el.addSource.addEventListener("click",()=>{
  void createSource();
});

el.manageSources?.addEventListener("click",openSourceManager);
el.sourceManagerClose?.addEventListener("click",closeSourceManager);
el.sourceManagerAdd?.addEventListener("click",()=>{ void createSource(); });
el.sourceManagerSearch?.addEventListener("input",()=>{
  renderSourceManagerList(el.sourceManagerSearch.value);
});
el.sourceManagerModal?.addEventListener("click",event=>{
  if(event.target===el.sourceManagerModal)closeSourceManager();
});
el.sourceManagerList?.addEventListener("click",async event=>{
  const open=event.target.closest("[data-manager-open]");
  if(open){
    state.scope=open.dataset.managerOpen;
    history.replaceState(null,"","?scope="+encodeURIComponent(state.scope));
    closeSourceManager();
    renderScopes();
    renderColumns();
    renderSearch();
    if(state.detail)renderPreview();
    return;
  }

  const rename=event.target.closest("[data-manager-rename]");
  if(rename){
    await renameScope(rename.dataset.managerRename);
    renderSourceManagerList(el.sourceManagerSearch?.value||"");
    return;
  }

  const del=event.target.closest("[data-manager-delete]");
  if(del){
    await deleteScope(del.dataset.managerDelete);
    renderSourceManagerList(el.sourceManagerSearch?.value||"");
  }
});

el.sourceRename.addEventListener("click",async()=>{
  const scope=state.editingScope;
  el.sourceEditPopover.hidden=true;
  await renameScope(scope);
});

el.sourceDelete.addEventListener("click",async()=>{
  const scope=state.editingScope;
  el.sourceEditPopover.hidden=true;
  await deleteScope(scope);
});

el.sourceEditClose.addEventListener("click",()=>{
  el.sourceEditPopover.hidden=true;
});

el.filtersToggle.addEventListener("click",()=>{
  el.filtersPanel.hidden=false;
});

el.filtersClose.addEventListener("click",()=>{
  el.filtersPanel.hidden=true;
});

qs("#keywordAdd").addEventListener("click",()=>{
  const value=clean(el.keywordInput.value);
  if(!value||state.keywords.includes(value))return;
  state.keywords.push(value);
  el.keywordInput.value="";
  renderKeywords();
  void savePresentationState();
});

el.keywordChips.addEventListener("click",event=>{
  const button=event.target.closest("[data-keyword]");
  if(!button)return;
  state.keywords=state.keywords.filter(x=>x!==button.dataset.keyword);
  renderKeywords();
  void savePresentationState();
});

qs("#resetLocal").addEventListener("click",async()=>{
  if(!confirm("Dọn dữ liệu cục bộ và tải lại?"))return;

  for(let i=localStorage.length-1;i>=0;i--){
    const key=localStorage.key(i)||"";
    if(key.startsWith("1988-")&&key!==AUTH_KEY)localStorage.removeItem(key);
  }

  if("caches"in window){
    for(const key of await caches.keys()){
      if(key.startsWith("1988-"))await caches.delete(key);
    }
  }

  location.reload();
});

qs("#closePage").addEventListener("click",()=>{
  try{window.close()}catch{}
  setTimeout(()=>{
    if(!window.closed)location.href="../";
  },60);
});

bc?.addEventListener?.("message",event=>{
  applyExternalUiEvent(event?.data||{});
});

window.addEventListener("storage",event=>{
  if(event.key!==UI_EVENT_KEY||!event.newValue)return;
  try{applyExternalUiEvent(JSON.parse(event.newValue));}catch{}
});

(async()=>{
  await requireAuth();
  await loadState();
})().catch(error=>{
  console.error(error);
  el.searchStatus.textContent="Không tải được dữ liệu nguồn";
});
