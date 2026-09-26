'use strict';

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
  searchQuery:""
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
  previewClose:qs("#previewClose"),
  previewScopes:qs("#previewScopes"),
  videoGrid:qs("#videoGrid"),
  addSource:qs("#addSource"),
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
      '<button class="scope-chip'+(s.key===state.scope?' active':'')+'" data-scope="'+esc(s.key)+'">'+
        esc(s.label)+' <span>'+count+'</span>'+
      '</button>'+
      '<button class="scope-edit" data-scope-edit="'+esc(s.key)+'" aria-label="Sửa '+esc(s.label)+'">⋯</button>'+
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
      '<button class="tiny primary" data-card-action="selected" data-id="'+esc(row.id)+'">Chọn</button>'+
      '<button class="tiny danger" data-card-action="blocked" data-id="'+esc(row.id)+'">Bỏ</button>';
  }else if(kind==="selected"){
    actions='<button class="tiny" data-card-action="normal" data-id="'+esc(row.id)+'">Bỏ</button>';
  }else{
    actions='<button class="tiny danger" data-card-action="normal" data-id="'+esc(row.id)+'">Bỏ chặn</button>';
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
      '<button class="tiny primary" data-search-select="'+esc(row.id)+'">'+esc(currentAction)+'</button>'+
      '<button class="tiny danger" data-search-block="'+esc(row.id)+'">'+esc(blockAction)+'</button>'+
      '<button class="tiny" data-toggle-other="'+esc(row._resultKey||row.id)+'">+#</button>'+
    '</div>'+
    '<div class="other-sources">'+otherScopes+'</div>'+
  '</div>';
}

function renderSearch(){
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
}

function playInlineVideo(id,row={}){
  if(!id||!el.inlinePlayer||!el.inlineVideoFrame)return;
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
  el.previewSelect.textContent=current==="selected"
    ?"Bỏ khỏi "+currentScopeLabel()
    :"Chọn vào "+currentScopeLabel();
  el.previewBlock.textContent=current==="blocked"?"Bỏ chặn":"Chặn";

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
  el.videoGrid.innerHTML=(rows||[]).map(v=>{
    const id=v.videoId||v.id||"";
    const thumb=v.thumbnailUrl||v.thumbnail||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
    const title=clean(v._displayTitle||v.title||"Video");
    return '<article class="video-card" data-preview-video="'+esc(id)+'">'+
      '<img class="video-thumb" src="'+esc(thumb)+'" alt="">'+
      '<div class="video-copy">'+
        '<strong>'+esc(title)+'</strong>'+
        '<span>'+esc(v.publishedText||v.published||v.uploadDate||"")+'</span>'+
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

async function openChannel(row,seedVideo=null){
  if(!row||!validId(row.id))return;

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
    state.detailVideos=merged.slice(0,30);
    renderPreview();
  }catch(error){
    console.warn("preview channel failed",error);
  }
}

async function search(q){
  q=clean(q);
  state.searchQuery=q;
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
  const edit=event.target.closest("[data-scope-edit]");
  if(edit){
    openSourceEditor(edit.dataset.scopeEdit);
    return;
  }

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
      :"Tìm video để lấy kênh";
    if(state.searchQuery)search(state.searchQuery);
  });
});

el.searchForm.addEventListener("submit",event=>{
  event.preventDefault();
  search(el.searchInput.value);
});

el.searchList.addEventListener("click",event=>{
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
  closeInlineVideo();
});

el.previewClose.addEventListener("click",()=>{
  state.detail=null;
  state.detailVideos=[];
  closeInlineVideo();
  renderPreview();
  el.searchList.hidden=false;
  el.searchStatus.hidden=false;
});

el.videoGrid.addEventListener("click",event=>{
  const card=event.target.closest("[data-preview-video]");
  if(!card)return;
  const id=card.dataset.previewVideo||"";
  if(!id)return;
  const row=state.detailVideos.find(v=>(v.videoId||v.id||"")===id)||{};
  playInlineVideo(id,row);
});



el.addSource.addEventListener("click",async()=>{
  const label=clean(prompt("Tên nguồn mới","")||"");
  if(!label)return;

  const result=await stateFetch("POST",{op:"create_hashtag",label});
  state.remote.hashtags=result.hashtags||state.remote.hashtags;
  state.scopes=scopeList(state.remote);

  const latest=state.scopes.find(s=>s.custom&&s.label===label);
  if(latest)state.scope=latest.key;

  renderScopes();
  renderColumns();
  if(state.detail)renderPreview();
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
