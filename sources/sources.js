'use strict';
const STATE_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-state";
const PIN="8881";
const AUTH_KEY="1988-settings-unlocked-v1";
const UI_EVENT_KEY="1988-source-ui-event-v1";
const SYSTEM_SCOPES=[{key:"live",label:"Live"},{key:"latest",label:"Ngày"},{key:"week",label:"Tuần"}];
const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
const clean=s=>String(s??"").replace(/\s+/g," ").trim();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validId=id=>/^UC[A-Za-z0-9_-]+$/.test(String(id||""));
const state={remote:null,scopes:[],scope:"latest",mainTab:"channels",stateTab:"suggested",searchMode:"channel",searchRows:[],detail:null,detailVideos:[],version:Date.now(),keywords:[]};
const el={
 scopeRow:qs("#scopeRow"),scopeSummary:qs("#scopeSummary"),sourceList:qs("#sourceList"),sourceListStatus:qs("#sourceListStatus"),
 suggestedCount:qs("#suggestedCount"),selectedCount:qs("#selectedCount"),blockedCount:qs("#blockedCount"),searchForm:qs("#searchForm"),searchInput:qs("#searchInput"),
 detailEmpty:qs("#detailEmpty"),detailContent:qs("#detailContent"),detailAvatar:qs("#detailAvatar"),detailName:qs("#detailName"),detailMeta:qs("#detailMeta"),
 detailSelect:qs("#detailSelect"),detailBlock:qs("#detailBlock"),assignScopes:qs("#assignScopes"),videoGrid:qs("#videoGrid"),detailSearchForm:qs("#detailSearchForm"),detailSearchInput:qs("#detailSearchInput"),
 labelsList:qs("#labelsList"),keywordInput:qs("#keywordInput"),keywordChips:qs("#keywordChips"),auth:qs("#auth"),authForm:qs("#authForm"),authPin:qs("#authPin"),authError:qs("#authError")
};
const bc=typeof BroadcastChannel==="function"?new BroadcastChannel("1988-source-ui-v1"):null;
function sourceLabels(){return Object.fromEntries(state.scopes.map(x=>[x.key,x.label]))}
function metaMap(){const out=new Map();for(const row of state.remote?.customSources||[])if(validId(row?.id))out.set(row.id,row);return out}
function scopeSet(kind,scope=state.scope){const src=kind==="selected"?state.remote?.scopedSelected:kind==="blocked"?state.remote?.scopedBlocked:state.remote?.scopedSuggested;return new Set(Array.isArray(src?.[scope])?src[scope]:[])}
function sourceStatus(id,scope=state.scope){if(scopeSet("blocked",scope).has(id))return"blocked";if(scopeSet("selected",scope).has(id))return"selected";if(scopeSet("suggested",scope).has(id))return"suggested";return"normal"}
function ensureArray(obj,key){if(!obj[key])obj[key]=[];return obj[key]}
function setLocalStatus(id,status,scope){for(const key of ["scopedSelected","scopedBlocked","scopedSuggested"])if(!state.remote[key])state.remote[key]={};for(const key of ["scopedSelected","scopedBlocked","scopedSuggested"]){state.remote[key][scope]=(state.remote[key][scope]||[]).filter(x=>x!==id)}
 if(status==="selected")ensureArray(state.remote.scopedSelected,scope).push(id);
 else if(status==="blocked")ensureArray(state.remote.scopedBlocked,scope).push(id);
 else if(status==="normal"&&state.detail?.id===id){}
}
function stateFetch(method="GET",body){return fetch(STATE_URL,{method,cache:"no-store",headers:{"content-type":"application/json",...(method==="POST"?{"x-1988-pin":PIN}:{})},body:body?JSON.stringify(body):undefined}).then(async r=>{if(!r.ok)throw new Error("state_"+r.status);return r.json()})}
function scopeList(remote){const labels=remote?.sourceLabels||{};const hashtags=(remote?.hashtags||[]).filter(x=>x?.enabled!==false).map(x=>({key:x.id,label:x.label||x.id,custom:true}));return [...SYSTEM_SCOPES.map(x=>({key:x.key,label:clean(labels[x.key]||x.label)})),...hashtags]}
function currentMeta(id){return metaMap().get(id)||state.searchRows.find(x=>x.id===id)||state.detail||{id,name:id,thumbnailUrl:"",subscribers:""}}
function avatarHtml(row){const name=clean(row?.name||"Kênh YouTube");const img=clean(row?.thumbnailUrl||"");return '<div class="avatar">'+(img?'<img src="'+esc(img)+'" alt="">':esc(name.charAt(0).toUpperCase()))+'</div>'}
function renderScopes(){const labels=sourceLabels();el.scopeRow.innerHTML=state.scopes.map(s=>{const n=scopeSet("selected",s.key).size;return '<button class="scope-chip'+(s.key===state.scope?' active':'')+'" data-scope="'+esc(s.key)+'">'+esc(s.label)+' <span>'+n+'</span></button>'}).join("");el.scopeSummary.textContent=(labels[state.scope]||state.scope)+" · "+scopeSet("selected").size+" chọn"}
function renderCounts(){el.suggestedCount.textContent=scopeSet("suggested").size;el.selectedCount.textContent=scopeSet("selected").size;el.blockedCount.textContent=scopeSet("blocked").size}
function baseRows(){const map=metaMap();const ids=[...scopeSet(state.stateTab==="suggested"?"suggested":state.stateTab==="selected"?"selected":"blocked")];return ids.map(id=>map.get(id)||{id,name:id,thumbnailUrl:"",subscribers:""})}
function statusLabel(status){
  return status==="selected"?"Đã chọn":status==="blocked"?"Đã chặn":status==="suggested"?"Gợi ý":"Ngoài nguồn";
}
function renderSourceList(rows=baseRows()){
  renderCounts();
  el.sourceList.innerHTML=rows.map(row=>{
    const status=sourceStatus(row.id);
    const action=status==="selected"?"Bỏ":status==="blocked"?"Bỏ chặn":"Chọn";
    const video=row._video||null;
    if(video){
      const vid=video.videoId||video.id||"";
      const thumb=video.thumbnailUrl||video.thumbnail||("https://i.ytimg.com/vi/"+vid+"/hqdefault.jpg");
      const title=clean(video._displayTitle||video.title||"Video");
      return '<div class="source-row video-result-row" data-source="'+esc(row.id)+'">'+
        '<img class="video-result-thumb" src="'+esc(thumb)+'" alt="">'+
        '<button class="source-copy video-result-copy" data-open-video-source="'+esc(row.id)+'" style="border:0;background:transparent;color:inherit;text-align:left;padding:0">'+
          '<strong>'+esc(title)+'</strong><span>'+esc(row.name||"Kênh YouTube")+'</span>'+
        '</button>'+
        '<span class="source-status-cell '+esc(status)+'">'+esc(statusLabel(status))+'</span>'+
        '<button class="mini-action '+(status==="suggested"?"primary":"")+'" data-quick="'+esc(row.id)+'">'+esc(action)+'</button>'+
      '</div>';
    }
    return '<div class="source-row" data-source="'+esc(row.id)+'">'+
      avatarHtml(row)+
      '<button class="source-copy" data-open-source="'+esc(row.id)+'" style="border:0;background:transparent;color:inherit;text-align:left;padding:0">'+
        '<strong>'+esc(row.name||row.id)+'</strong><span>'+esc(row.subscribers||"Kênh YouTube")+'</span>'+
      '</button>'+
      '<span class="source-status-cell '+esc(status)+'">'+esc(statusLabel(status))+'</span>'+
      '<button class="mini-action '+(status==="suggested"?"primary":"")+'" data-quick="'+esc(row.id)+'">'+esc(action)+'</button>'+
    '</div>';
  }).join("")||'<div class="status">Chưa có kênh trong mục này.</div>';
}
function renderLabels(){
  el.labelsList.innerHTML=state.scopes.map(s=>{
    const selected=scopeSet("selected",s.key).size;
    const suggested=scopeSet("suggested",s.key).size;
    const blocked=scopeSet("blocked",s.key).size;
    return '<div class="label-row">'+
      '<button data-label-open="'+esc(s.key)+'" style="border:0;background:transparent;color:inherit;text-align:left">'+
        '<strong>'+esc(s.label)+'</strong><span>'+esc(s.custom?"Nguồn tùy chỉnh":"Nguồn hệ thống")+'</span>'+
      '</button>'+
      '<span class="label-stat">'+selected+'</span>'+
      '<span class="label-stat muted">'+suggested+'</span>'+
      '<span class="label-stat'+(blocked?'':' muted')+'">'+blocked+'</span>'+
      '<div class="label-actions">'+
        '<button class="secondary" data-label-rename="'+esc(s.key)+'">Đổi tên</button>'+
        (s.custom?'<button class="danger" data-label-delete="'+esc(s.key)+'">Xóa</button>':'')+
      '</div>'+
    '</div>';
  }).join("");
}
function renderKeywords(){el.keywordChips.innerHTML=state.keywords.length?state.keywords.map(k=>'<button class="keyword-chip" data-keyword="'+esc(k)+'">'+esc(k)+' ×</button>').join(""):'<span class="status">Chưa có từ khóa chặn</span>'}
function renderDetail(){const row=state.detail;if(!row){el.detailEmpty.hidden=false;el.detailContent.hidden=true;return}el.detailEmpty.hidden=true;el.detailContent.hidden=false;el.detailName.textContent=row.name||row.id;el.detailMeta.textContent=[sourceLabels()[state.scope],row.subscribers||""].filter(Boolean).join(" · ");el.detailAvatar.innerHTML=avatarHtml(row);const st=sourceStatus(row.id);el.detailSelect.textContent=st==="selected"?"Bỏ chọn":"Chọn vào "+(sourceLabels()[state.scope]||state.scope);el.detailBlock.textContent=st==="blocked"?"Bỏ chặn":"Chặn";el.assignScopes.innerHTML=state.scopes.map(s=>{const x=sourceStatus(row.id,s.key);return '<button class="assign-chip'+(x==="selected"?' active':'')+(x==="blocked"?' blocked':'')+'" data-assign="'+esc(s.key)+'">'+esc(s.label)+(x==="selected"?" ✓":x==="blocked"?" ×":" +")+'</button>'}).join("");renderVideos(state.detailVideos)}
function renderVideos(rows){el.videoGrid.innerHTML=(rows||[]).map(v=>{const id=v.videoId||v.id||"";const thumb=v.thumbnailUrl||v.thumbnail||("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");const title=clean(v._displayTitle||v.title||"Video");return '<article class="video-card" data-preview-video="'+esc(id)+'" title="Mở video"><img class="video-thumb" src="'+esc(thumb)+'" alt=""><div class="video-copy"><strong>'+esc(title)+'</strong><span>'+esc(v.publishedText||v.published||v.uploadDate||"")+'</span></div></article>'}).join("")||'<div class="status">Chưa có video.</div>'}
async function waitYT(){if(window.YTLocal)return window.YTLocal;return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error("yt_timeout")),12000);window.addEventListener("ytlocalready",()=>{clearTimeout(t);res(window.YTLocal)},{once:true})})}
async function openSource(row,seedVideo=null){
  if(!row||!validId(row.id))return;
  state.detail={...currentMeta(row.id),...row};
  state.detailVideos=seedVideo?[seedVideo]:[];
  renderDetail();
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
      seen.add(id);merged.push(v);
    }
    state.detailVideos=merged.slice(0,24);
    renderDetail();
  }catch(e){console.warn(e)}
}
async function search(q){
  q=clean(q);
  if(!q){state.searchRows=[];renderSourceList();return}
  el.sourceListStatus.textContent="Đang tìm…";
  try{
    const yt=await waitYT();
    if(state.searchMode==="channel"){
      const rows=await yt.searchChannels(q);
      state.searchRows=(rows||[]).map(x=>({
        id:x.id||x.channelId,
        name:x.name||x.title||"Kênh YouTube",
        thumbnailUrl:x.thumbnailUrl||x.thumbnail||"",
        subscribers:x.subscribers||""
      })).filter(x=>validId(x.id));
    }else{
      const videos=await yt.search(q,{type:"video"});
      state.searchRows=(videos||[]).map(v=>{
        const id=String(v.channelId||v._sourceId||v.uploaderId||"");
        if(!validId(id))return null;
        return {
          id,
          name:clean(v.uploader||v._sourceName||v.channelName||"Kênh YouTube"),
          thumbnailUrl:v.uploaderThumbnailUrl||v.channelThumbnailUrl||"",
          subscribers:"",
          _video:v
        };
      }).filter(Boolean).slice(0,30);
    }
    renderSourceList(state.searchRows);
    el.sourceListStatus.textContent=state.searchRows.length+" kết quả";
  }catch(e){
    el.sourceListStatus.textContent="Không tìm được";
    console.warn(e);
  }
}
async function writeStatus(id,status,scope=state.scope){const row=currentMeta(id);setLocalStatus(id,status,scope);renderScopes();renderSourceList(state.searchRows.length?state.searchRows:undefined);renderLabels();if(state.detail?.id===id)renderDetail();const event={type:"source-state",id,status,scope,name:row.name||"",at:Date.now()};try{bc?.postMessage(event)}catch{}try{localStorage.setItem(UI_EVENT_KEY,JSON.stringify(event))}catch{}try{await stateFetch("POST",{op:"set_source",scope,channel_id:id,status,version:Date.now(),source:{name:row.name||"",thumbnailUrl:row.thumbnailUrl||"",subscribers:row.subscribers||""}})}catch(e){console.warn(e)}}
async function savePresentationState(){
  if(!state.remote)return false;
  const next={...state.remote,sourceLabels:{...(state.remote.sourceLabels||{})}};
  if(state.keywords.length)next.sourceLabels.__live_keywords=state.keywords.join("\n");
  else delete next.sourceLabels.__live_keywords;
  try{
    const result=await stateFetch("POST",{state:next,version:Date.now()});
    if(result?.ok){
      state.remote=next;
      return true;
    }
  }catch(e){console.warn(e)}
  return false;
}
async function loadState(){const result=await stateFetch();state.remote=result.state||{};state.scopes=scopeList(state.remote);state.keywords=clean(state.remote?.sourceLabels?.__live_keywords||"").split(/\r?\n/).map(clean).filter(Boolean);const wanted=new URL(location.href).searchParams.get("scope")||"latest";state.scope=state.scopes.some(s=>s.key===wanted)?wanted:(state.scopes[0]?.key||"latest");renderScopes();renderSourceList();renderLabels();renderKeywords()}
function showTab(tab){
  state.mainTab=tab;
  qsa(".main-tab").forEach(b=>b.classList.toggle("active",b.dataset.mainTab===tab));
  qs("#channelsTab").hidden=tab!=="channels";
  qs("#sourcesTab").hidden=tab!=="sources";
  qs("#filtersTab").hidden=tab!=="filters";
  if(tab==="sources")renderLabels();
  if(tab==="channels"){renderScopes();renderSourceList();if(state.detail)renderDetail()}
  if(tab==="filters")renderKeywords();
}
function requireAuth(){if(localStorage.getItem(AUTH_KEY)==="1")return Promise.resolve(true);el.auth.hidden=false;return new Promise(resolve=>{el.authForm.onsubmit=e=>{e.preventDefault();if(clean(el.authPin.value)!==PIN){el.authError.textContent="Mã chưa đúng";return}localStorage.setItem(AUTH_KEY,"1");el.auth.hidden=true;resolve(true)}})}
qsa(".main-tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.mainTab)));
el.scopeRow.addEventListener("click",e=>{const b=e.target.closest("[data-scope]");if(!b)return;state.scope=b.dataset.scope;state.searchRows=[];state.stateTab="suggested";qsa(".state-tab").forEach(x=>x.classList.toggle("active",x.dataset.stateTab==="suggested"));history.replaceState(null,"","?scope="+encodeURIComponent(state.scope));renderScopes();renderSourceList();if(state.detail)renderDetail()});
qsa(".state-tab").forEach(b=>b.addEventListener("click",()=>{state.stateTab=b.dataset.stateTab;qsa(".state-tab").forEach(x=>x.classList.toggle("active",x===b));state.searchRows=[];renderSourceList()}));
qsa(".search-mode-btn").forEach(b=>b.addEventListener("click",()=>{state.searchMode=b.dataset.searchMode;qsa(".search-mode-btn").forEach(x=>x.classList.toggle("active",x===b));el.searchInput.placeholder=state.searchMode==="channel"?"Tìm kênh YouTube":"Tìm video để lấy nguồn"}));
el.searchForm.addEventListener("submit",e=>{e.preventDefault();search(el.searchInput.value)});
el.sourceList.addEventListener("click",e=>{
  const v=e.target.closest("[data-open-video-source]");
  if(v){
    const id=v.dataset.openVideoSource;
    const row=state.searchRows.find(x=>x.id===id&&x._video)||currentMeta(id);
    openSource(row,row?._video||null);
    return;
  }
  const o=e.target.closest("[data-open-source]");
  if(o){
    const id=o.dataset.openSource;
    const row=state.searchRows.find(x=>x.id===id)||currentMeta(id);
    openSource(row);
    return;
  }
  const q=e.target.closest("[data-quick]");
  if(q){
    const id=q.dataset.quick;
    const st=sourceStatus(id);
    writeStatus(id,st==="selected"||st==="blocked"?"normal":"selected");
  }
});
el.detailSelect.addEventListener("click",()=>{if(!state.detail)return;const st=sourceStatus(state.detail.id);writeStatus(state.detail.id,st==="selected"?"normal":"selected")});
el.detailBlock.addEventListener("click",()=>{if(!state.detail)return;const st=sourceStatus(state.detail.id);writeStatus(state.detail.id,st==="blocked"?"normal":"blocked")});
el.assignScopes.addEventListener("click",e=>{const b=e.target.closest("[data-assign]");if(!b||!state.detail)return;const scope=b.dataset.assign;const st=sourceStatus(state.detail.id,scope);writeStatus(state.detail.id,st==="selected"?"normal":"selected",scope)});
el.videoGrid.addEventListener("click",e=>{
  const card=e.target.closest("[data-preview-video]");
  if(!card)return;
  const id=card.dataset.previewVideo||"";
  if(!id)return;
  window.open("../?v="+encodeURIComponent(id),"_blank","noopener");
});
el.detailSearchForm.addEventListener("submit",async e=>{e.preventDefault();const q=clean(el.detailSearchInput.value);if(!q||!state.detail)return;try{const yt=await waitYT();const rows=await yt.search(q,{type:"video"});state.detailVideos=(rows||[]).filter(v=>String(v.channelId||v._sourceId||v.uploaderId||"")===state.detail.id).slice(0,24);renderVideos(state.detailVideos)}catch{}});
el.labelsList.addEventListener("click",async e=>{
  const open=e.target.closest("[data-label-open]");
  if(open){
    state.scope=open.dataset.labelOpen;
    state.searchRows=[];
    state.stateTab="selected";
    qsa(".state-tab").forEach(x=>x.classList.toggle("active",x.dataset.stateTab==="selected"));
    history.replaceState(null,"","?scope="+encodeURIComponent(state.scope));
    showTab("channels");
    return;
  }

  const rename=e.target.closest("[data-label-rename]");
  if(rename){
    const scope=rename.dataset.labelRename;
    const row=state.scopes.find(x=>x.key===scope);
    const label=clean(prompt("Đổi tên nguồn",row?.label||"")||"");
    if(!label)return;
    if(row?.custom){
      const result=await stateFetch("POST",{op:"rename_hashtag",hashtag_id:scope,label});
      state.remote.hashtags=result.hashtags||state.remote.hashtags;
    }else{
      state.remote.sourceLabels={...(state.remote.sourceLabels||{}),[scope]:label};
      await savePresentationState();
    }
    state.scopes=scopeList(state.remote);
    renderLabels();renderScopes();
    return;
  }

  const del=e.target.closest("[data-label-delete]");
  if(del){
    const scope=del.dataset.labelDelete;
    const row=state.scopes.find(x=>x.key===scope);
    if(!row?.custom)return;
    if(!confirm('Xóa nguồn "'+(row.label||scope)+'"?'))return;
    const result=await stateFetch("POST",{op:"set_hashtag_enabled",hashtag_id:scope,enabled:false});
    state.remote.hashtags=result.hashtags||state.remote.hashtags;
    state.scopes=scopeList(state.remote);
    if(state.scope===scope)state.scope=state.scopes[0]?.key||"latest";
    renderLabels();renderScopes();
  }
});
qs("#addLabel").addEventListener("click",async()=>{const label=prompt("Tên nguồn mới","");if(!clean(label))return;const result=await stateFetch("POST",{op:"create_hashtag",label:clean(label)});state.remote.hashtags=result.hashtags||state.remote.hashtags;state.scopes=scopeList(state.remote);renderLabels();renderScopes()});
qs("#keywordAdd").addEventListener("click",()=>{const v=clean(el.keywordInput.value);if(!v||state.keywords.includes(v))return;state.keywords.push(v);el.keywordInput.value="";renderKeywords();void savePresentationState()});
el.keywordChips.addEventListener("click",e=>{const b=e.target.closest("[data-keyword]");if(!b)return;state.keywords=state.keywords.filter(x=>x!==b.dataset.keyword);renderKeywords();void savePresentationState()});
qs("#resetLocal").addEventListener("click",async()=>{if(!confirm("Dọn dữ liệu cục bộ và tải lại?"))return;for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i)||"";if(k.startsWith("1988-")&&k!==AUTH_KEY)localStorage.removeItem(k)}if("caches"in window){for(const k of await caches.keys())if(k.startsWith("1988-"))await caches.delete(k)}location.reload()});
qs("#closePage").addEventListener("click",()=>{try{window.close()}catch{}setTimeout(()=>{if(!window.closed)location.href="../"},50)});
(async()=>{await requireAuth();await loadState();showTab("channels")})().catch(e=>{console.error(e);el.sourceListStatus.textContent="Không tải được dữ liệu nguồn"});
