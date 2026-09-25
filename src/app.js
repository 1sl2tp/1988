"use strict";

const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";
const AI_TOPICS_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-topics";
const SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjbm9haHFzcnF1eGt3a2pidXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY5MDEsImV4cCI6MjEwMzUyMjkwMX0.16EE_LENbAV5oD29XQGpR5c2eYXPqBSWkGTFdOqeRQE";
const MEDIA_SERVICE="https://one988-media.onrender.com";

try{
  if("scrollRestoration" in history)history.scrollRestoration="manual";
}catch{}

const $=s=>document.querySelector(s);
const searchForm=$("#searchForm");
const queryInput=$("#queryInput");
const homeSearchToggle=$("#homeSearchToggle");
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
const feedSection=document.querySelector(".feed-section");
const appShell=document.querySelector(".app-shell");
const feedTitle=$("#feedTitle");
const feedStatus=$("#feedStatus");
const searchRefinements=$("#searchRefinements");
const seriesPanel=$("#seriesPanel");
const seriesTitle=$("#seriesTitle");
const seriesMeta=$("#seriesMeta");
const seriesAutoplay=$("#seriesAutoplay");
const seriesEpisodes=$("#seriesEpisodes");
const contextBrief=$("#contextBrief");
const contextBriefLabel=$("#contextBriefLabel");
const contextBriefAsOf=$("#contextBriefAsOf");
const contextBriefTitle=$("#contextBriefTitle");
const contextBriefLines=$("#contextBriefLines");
const contextBriefSources=$("#contextBriefSources");
const bgAudio=$("#bgAudio");
const installBtn=$("#installBtn");
const installSheet=$("#installSheet");
const closeInstallSheet=$("#closeInstallSheet");
const sourcesBtn=$("#sourcesBtn");
const sourceHeaderCount=$("#sourceHeaderCount");
const settingsAuthSheet=$("#settingsAuthSheet");
const settingsAuthForm=$("#settingsAuthForm");
const settingsAuthPin=$("#settingsAuthPin");
const settingsAuthError=$("#settingsAuthError");
const closeSettingsAuth=$("#closeSettingsAuth");
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
const sourcePreviewStatus=$("#sourcePreviewStatus");
const sourcePreviewSelect=$("#sourcePreviewSelect");
const sourcePreviewSearch=$("#sourcePreviewSearch");
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
  floatScale:1,
  floatTucked:false,
  floatPreset:"auto",
  videoAspectVerified:false,
  videoAspectPortraitLocked:false,
  fullscreenScrollY:null,
  fullscreenActive:false,
  fullscreenExitCooldownUntil:0,
  intentPlay:false,
  resumeOnReturn:false,
  transitionUntil:0,
  resumeTimer:0,
  visibilityScrollX:0,
  visibilityScrollY:null,
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
  feedTrendTopics:new Map(),
  feedSeq:0,
  searchSeq:0,
  searchQuery:"",
  searchScope:"",
  videoContextSeq:0,
  seriesQueue:[],
  seriesIndex:-1,
  seriesKey:"",
  seriesSourceName:"",
  seriesMode:"",
  playlistId:"",
  seriesDiscoverySeq:0,
  seriesAutoplay:true,
  sourceLibraryDirty:false
};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

const SOURCE_SELECTION_KEY="1988-source-selection-v1";
const SOURCE_CUSTOM_KEY="1988-source-custom-v1";
const SOURCE_HIDDEN_KEY="1988-source-hidden-v1"; // legacy: migrated to blocked
const SOURCE_BLOCKED_KEY="1988-source-blocked-v1";
const SOURCE_GROUPS_KEY="1988-source-groups-v1";
const SOURCE_SCOPED_SELECTION_KEY="1988-source-scoped-selection-v1";
const SOURCE_SCOPED_BLOCKED_KEY="1988-source-scoped-blocked-v1";
const SOURCE_SCOPED_MIGRATION_KEY="1988-source-scoped-migrated-v1";
const SOURCE_AI_SUGGESTIONS_KEY="1988-source-ai-suggestions-v1";
const SOURCE_SCOPE_ISOLATION_KEY="1988-source-scope-isolated-v1";
const SOURCE_SCOPE_ISOLATION_BACKUP_KEY="1988-source-scopes-before-isolation-v1";
const SOURCE_FILM_SNAPSHOT_RECOVERY_KEY="1988-source-film-snapshot-recovered-v4";
const SOURCE_FILM_SNAPSHOT_BACKUP_KEY="1988-source-film-before-snapshot-v4";
const SOURCE_FILM_RECOVERY_KEY="1988-source-film-recovered-v3";
const SOURCE_FILM_RECOVERY_BACKUP_KEY="1988-source-film-before-recovery-v3";
const SOURCE_FILM_LEGACY_BACKUP_KEY="1988-source-film-before-recovery-v1";
const GENERAL_SOURCE_SCOPE="general";

const SOURCE_MANAGER_GROUPS=[
  {key:"general",label:"Mới nhất/Tuần này"},
  {key:"news",label:"Thời sự"},
  {key:"economy",label:"Kinh tế"},
  {key:"law",label:"Pháp luật"},
  {key:"film",label:"Phim"},
  {key:"music",label:"Nhạc"},
  {key:"tech",label:"Công nghệ"},
  {key:"sports",label:"Thể thao"},
  {key:"entertainment",label:"Giải trí"}
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
const CONTENT_SOURCE_SCOPES=new Set(FIXED_CONTENT_CATEGORIES.map(item=>item.group));
const GENERAL_SOURCE_DISCOVERY_PARENT={
  key:"general",
  group:GENERAL_SOURCE_SCOPE,
  label:"Mới nhất/Tuần này",
  queries:[]
};

state.parentCategories=FIXED_CONTENT_CATEGORIES.map(item=>({...item}));

const BASE_CHANNEL_LIBRARY=Array.isArray(window.CHANNEL_LIBRARY)
  ?window.CHANNEL_LIBRARY.filter(row=>row&&/^UC[A-Za-z0-9_-]+$/.test(String(row.id||""))&&row.name)
  :[];
const BASE_CHANNEL_ID_SET=new Set(BASE_CHANNEL_LIBRARY.map(row=>row.id));
const BASE_CHANNEL_BY_ID=new Map(BASE_CHANNEL_LIBRARY.map(row=>[row.id,row]));

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

function readScopedSourceState(key){
  const raw=readStoredObject(key);
  const out=new Map();
  for(const scope of CONTENT_SOURCE_SCOPES){
    const ids=Array.isArray(raw[scope])?raw[scope]:[];
    out.set(scope,new Set(
      ids.map(String).filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id))
    ));
  }
  return out;
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
let scopedSelectedSourceIds=readScopedSourceState(SOURCE_SCOPED_SELECTION_KEY);
let scopedBlockedSourceIds=readScopedSourceState(SOURCE_SCOPED_BLOCKED_KEY);
let aiSuggestedSourceIds=new Map(
  [...CONTENT_SOURCE_SCOPES].map(scope=>[scope,new Set()])
);
const temporaryGeneralSourceIds=new Set();
try{localStorage.removeItem(SOURCE_AI_SUGGESTIONS_KEY);}catch{}

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
  return BASE_CHANNEL_ID_SET.has(id)||customSources.some(row=>row?.id===id);
}

function libraryRow(id){
  return BASE_CHANNEL_BY_ID.get(id)||customSources.find(row=>row?.id===id)||null;
}

function persistSuggestedSourceState(){
  // Discovery lists are temporary. Never persist AI suggestions.
  try{localStorage.removeItem(SOURCE_AI_SUGGESTIONS_KEY);}catch{}
}

function persistSourceLibrary(){
  try{
    localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));
    localStorage.setItem(SOURCE_BLOCKED_KEY,JSON.stringify([...blockedSourceIds]));
    localStorage.setItem(SOURCE_GROUPS_KEY,JSON.stringify(sourceGroupOverrides));
    localStorage.removeItem(SOURCE_HIDDEN_KEY);
    persistSuggestedSourceState();
  }catch{}
}

function persistScopedSourceState(){
  try{
    const selected={};
    const blocked={};
    for(const scope of CONTENT_SOURCE_SCOPES){
      selected[scope]=[...(scopedSelectedSourceIds.get(scope)||new Set())];
      blocked[scope]=[...(scopedBlockedSourceIds.get(scope)||new Set())];
    }
    localStorage.setItem(SOURCE_SCOPED_SELECTION_KEY,JSON.stringify(selected));
    localStorage.setItem(SOURCE_SCOPED_BLOCKED_KEY,JSON.stringify(blocked));
  }catch{}
}

function suggestedSetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(!CONTENT_SOURCE_SCOPES.has(scope))return new Set();
  if(!aiSuggestedSourceIds.has(scope))aiSuggestedSourceIds.set(scope,new Set());
  return aiSuggestedSourceIds.get(scope);
}

function assignSourceGroup(id,group){
  id=String(id||"").trim();
  group=String(group||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!CONTENT_SOURCE_SCOPES.has(group))return false;
  const suggested=suggestedSetForScope(group);
  if(suggested.has(id))return false;
  suggested.add(id);
  return true;
}

function readSourceSelection(){
  try{
    const saved=JSON.parse(localStorage.getItem(SOURCE_SELECTION_KEY)||"null");
    if(Array.isArray(saved)){
      return new Set(
        saved
          .map(String)
          .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id)&&!blockedSourceIds.has(id))
      );
    }
  }catch{}

  const defaults=channelLibrary().slice(0,12).map(row=>row.id);
  try{localStorage.setItem(SOURCE_SELECTION_KEY,JSON.stringify(defaults));}catch{}
  return new Set(defaults);
}

let selectedSourceIds=readSourceSelection();

function pruneLegacyTemporaryCustomSources(){
  const durable=new Set([...selectedSourceIds,...blockedSourceIds]);
  for(const scope of CONTENT_SOURCE_SCOPES){
    for(const id of selectedSetForScope(scope))durable.add(id);
    for(const id of blockedSetForScope(scope))durable.add(id);
  }
  const before=customSources.length;
  customSources=customSources.filter(row=>row&&durable.has(String(row.id||"")));
  if(customSources.length!==before){
    try{localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));}catch{}
  }
}
pruneLegacyTemporaryCustomSources();

let sourceRemoteResults=[];
let sourceSearchTimer=0;
let sourceSearchSeq=0;
let sourcePreviewSeq=0;
let sourcePreviewRows=new Map();
let sourcePreviewSearchRows=new Map();
let sourcePreviewSearchTimer=0;
let sourcePreviewSearchSeq=0;
let sourcePreviewSourceId="";
let sourcePreviewSourceRow=null;
let sourceManageMode=false;
let sourceManageGroup=GENERAL_SOURCE_SCOPE;
let sourceBlockedExpanded=false;
let sourceMetaObserver=null;
const sourceMetaCache=new Map();
const sourceMetaPending=new Set();

function sourceScope(scope=sourceManageGroup){
  scope=String(scope||"").trim();
  if(CONTENT_SOURCE_SCOPES.has(scope))return scope;
  if(scope==="other")return "other";
  return GENERAL_SOURCE_SCOPE;
}

function selectedSetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(scope===GENERAL_SOURCE_SCOPE)return selectedSourceIds;
  if(scope==="other")return new Set();
  if(!scopedSelectedSourceIds.has(scope))scopedSelectedSourceIds.set(scope,new Set());
  return scopedSelectedSourceIds.get(scope);
}

function blockedSetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(scope===GENERAL_SOURCE_SCOPE)return blockedSourceIds;
  if(scope==="other")return new Set();
  if(!scopedBlockedSourceIds.has(scope))scopedBlockedSourceIds.set(scope,new Set());
  return scopedBlockedSourceIds.get(scope);
}

function allManagedStateIds(){
  const ids=new Set([...selectedSourceIds,...blockedSourceIds]);
  for(const scope of CONTENT_SOURCE_SCOPES){
    for(const id of selectedSetForScope(scope))ids.add(id);
    for(const id of blockedSetForScope(scope))ids.add(id);
  }
  return ids;
}

function temporarySetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(scope===GENERAL_SOURCE_SCOPE)return temporaryGeneralSourceIds;
  if(CONTENT_SOURCE_SCOPES.has(scope))return suggestedSetForScope(scope);
  return new Set();
}

function sourceDiscoveryParentForGroup(group=sourceManageGroup){
  group=sourceScope(group);
  if(group===GENERAL_SOURCE_SCOPE)return GENERAL_SOURCE_DISCOVERY_PARENT;
  return FIXED_CONTENT_CATEGORIES.find(item=>item.group===group)||null;
}

function allTemporarySourceIds(){
  const ids=new Set(temporaryGeneralSourceIds);
  for(const scope of CONTENT_SOURCE_SCOPES){
    for(const id of suggestedSetForScope(scope))ids.add(id);
  }
  return ids;
}

function managedChannelLibrary(){
  const ids=new Set([...allManagedStateIds(),...allTemporarySourceIds()]);
  const rows=[];

  for(const id of ids){
    const stored=libraryRow(id)||{};
    const meta=sourceMetaCache.get(id)||{};
    rows.push({
      id,
      name:clean(meta.name||stored.name||id),
      thumbnailUrl:clean(meta.thumbnailUrl||stored.thumbnailUrl||""),
      subscribers:clean(meta.subscribers||stored.subscribers||""),
      groups:Array.isArray(sourceGroupOverrides[id])
        ?sourceGroupOverrides[id].map(String).filter(Boolean)
        :[]
    });
  }
  return rows;
}

function persistSourceSelection(){
  try{
    localStorage.setItem(SOURCE_SELECTION_KEY,JSON.stringify([...selectedSourceIds]));
  }catch{}
  persistScopedSourceState();
}

function sourceStatus(id,scope=sourceManageGroup){
  const blocked=blockedSetForScope(scope);
  const selected=selectedSetForScope(scope);
  if(blocked.has(id))return "blocked";
  if(selected.has(id))return "selected";
  return "normal";
}

function activeSourceScope(){
  if(state.activeParent&&CONTENT_SOURCE_SCOPES.has(state.activeParent))return state.activeParent;
  if(isSourceScopedFeed(state.activeFeed))return GENERAL_SOURCE_SCOPE;
  return "";
}

function hideBlockedSourceNow(id,scope=sourceManageGroup){
  id=String(id||"").trim();
  scope=sourceScope(scope);
  if(!id||!feed||activeSourceScope()!==scope)return;

  const source=libraryRow(id)||managedChannelLibrary().find(row=>row.id===id);
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

function stateMetadataCandidate(id){
  return sourceMetaCache.get(id)||
    libraryRow(id)||
    sourceRemoteResults.find(row=>row.id===id)||
    managedChannelLibrary().find(row=>row.id===id)||
    null;
}

function persistStateSourceMetadata(id){
  if(BASE_CHANNEL_ID_SET.has(id))return;
  const row=stateMetadataCandidate(id);
  if(!row)return;

  const meta=sourceMetaFor(row);
  const payload={
    id,
    name:clean(meta.name||row.name)||"Kênh YouTube",
    thumbnailUrl:safeSourceThumb(meta.thumbnailUrl||row.thumbnailUrl||""),
    subscribers:clean(meta.subscribers||row.subscribers||"")
  };

  const existing=customSources.find(item=>item.id===id);
  if(existing){
    existing.name=payload.name||existing.name;
    existing.thumbnailUrl=payload.thumbnailUrl||existing.thumbnailUrl||"";
    existing.subscribers=payload.subscribers||existing.subscribers||"";
  }else{
    customSources.push(payload);
  }
}

function setSourceStatus(id,status,scope=sourceManageGroup){
  scope=sourceScope(scope);
  invalidateSourceStateNameIndex();
  const selected=selectedSetForScope(scope);
  const blocked=blockedSetForScope(scope);

  const temporaryKnown=
    temporaryGeneralSourceIds.has(id)||
    suggestedSetForScope(scope).has(id);

  if(
    !libraryHas(id) &&
    !allManagedStateIds().has(id) &&
    !temporaryKnown &&
    !sourceRemoteResults.some(row=>row.id===id)
  )return;

  if(status==="selected"){
    persistStateSourceMetadata(id);
    blocked.delete(id);
    selected.add(id);
  }else if(status==="blocked"){
    persistStateSourceMetadata(id);
    selected.delete(id);
    blocked.add(id);
  }else{
    selected.delete(id);
    blocked.delete(id);
  }

  temporaryGeneralSourceIds.delete(id);
  if(CONTENT_SOURCE_SCOPES.has(scope))suggestedSetForScope(scope).delete(id);

  if(status==="blocked")hideBlockedSourceNow(id,scope);

  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  state.aiCategoryRows=new Map();
  state.aiCategoryTopics=new Map();
  sourceDiscoveryAt.delete(scope);
  clearSourceContentLearning(scope);
  refreshSourceManager();
  syncSourcePreviewHeader();
}

function selectedSources(scope=GENERAL_SOURCE_SCOPE){
  scope=sourceScope(scope);
  const selected=selectedSetForScope(scope);
  const blocked=blockedSetForScope(scope);
  const rows=channelLibrary();
  const byId=new Map(rows.map(row=>[row.id,row]));
  const out=[];

  for(const id of selected){
    if(blocked.has(id))continue;

    const row=byId.get(id);
    if(row){
      out.push(row);
      continue;
    }

    out.push({
      id,
      name:id,
      thumbnailUrl:"",
      subscribers:"",
      groups:Array.isArray(sourceGroupOverrides[id])
        ?sourceGroupOverrides[id].map(String).filter(Boolean)
        :[]
    });
  }

  return out;
}

function sourceSignature(scope=GENERAL_SOURCE_SCOPE){
  const selected=selectedSetForScope(scope);
  const blocked=blockedSetForScope(scope);
  return [...selected].filter(id=>!blocked.has(id)).sort().join("|");
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
  return {...row,...(sourceMetaCache.get(row?.id)||{})};
}

function sourceGroupsFor(row={}){
  const id=String(row?.id||row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
  const groups=[];

  if(id){
    for(const group of CONTENT_SOURCE_SCOPES){
      if(
        suggestedSetForScope(group).has(id) ||
        selectedSetForScope(group).has(id) ||
        blockedSetForScope(group).has(id)
      ){
        groups.push(group);
      }
    }
  }

  if(!groups.length)groups.push("other");
  return groups;
}

function ensureSourceScopeIsolation(){
  try{
    if(localStorage.getItem(SOURCE_SCOPE_ISOLATION_KEY)==="1")return;

    if(!localStorage.getItem(SOURCE_SCOPE_ISOLATION_BACKUP_KEY)){
      const selected={};
      const blocked={};
      for(const group of CONTENT_SOURCE_SCOPES){
        selected[group]=[...selectedSetForScope(group)];
        blocked[group]=[...blockedSetForScope(group)];
      }
      localStorage.setItem(
        SOURCE_SCOPE_ISOLATION_BACKUP_KEY,
        JSON.stringify({at:Date.now(),selected,blocked})
      );
    }

    const generalIds=new Set([...selectedSourceIds,...blockedSourceIds]);

    // Seed category suggestion pools only from the old explicit discovery map,
    // never from name/keyword inference, and never from the manual general pool.
    for(const [id,groups] of Object.entries(sourceGroupOverrides||{})){
      if(generalIds.has(id))continue;
      for(const group of Array.isArray(groups)?groups:[]){
        if(CONTENT_SOURCE_SCOPES.has(group))suggestedSetForScope(group).add(id);
      }
    }

    // Undo the v3 Film copy if its pre-copy backup exists.
    const filmBackup=readStoredObject(SOURCE_FILM_RECOVERY_BACKUP_KEY);
    if(Array.isArray(filmBackup.selected)||Array.isArray(filmBackup.blocked)){
      const filmSelected=selectedSetForScope("film");
      const filmBlocked=blockedSetForScope("film");
      filmSelected.clear();
      filmBlocked.clear();
      for(const id of Array.isArray(filmBackup.selected)?filmBackup.selected:[]){
        if(/^UC[A-Za-z0-9_-]+$/.test(String(id||"")))filmSelected.add(String(id));
      }
      for(const id of Array.isArray(filmBackup.blocked)?filmBackup.blocked:[]){
        if(/^UC[A-Za-z0-9_-]+$/.test(String(id||""))){
          filmSelected.delete(String(id));
          filmBlocked.add(String(id));
        }
      }
    }

    // The previous migration inherited global manual choices into categories.
    // Remove that inheritance once. Future overlap is allowed only when the user
    // explicitly selects it inside that category.
    for(const group of CONTENT_SOURCE_SCOPES){
      const selected=selectedSetForScope(group);
      const blocked=blockedSetForScope(group);
      for(const id of generalIds){
        selected.delete(id);
        blocked.delete(id);
      }
    }

    persistScopedSourceState();
    persistSuggestedSourceState();
    try{localStorage.setItem(SOURCE_SCOPE_ISOLATION_KEY,"1");}catch{}
  }catch(error){
    console.warn("source scope isolation failed",error);
  }
}

ensureSourceScopeIsolation();

const HISTORIC_FILM_SOURCE_IDS=[
  "UCGb92d__VZAy-WJfywGD5mQ","UCCFbvjKJoIFnOFbijZ-Ttyg","UCfrJX6Jb-jvn1sk1eOR7FsQ",
  "UCMMq5YjiOYpry6n8SEfisNg","UCR5W9zYdh5em_kF8vRXe0Uw","UC_mLtI_EeKBXkNew8QsFkYg",
  "UCpxScYvnu1OIlyT2dzP5peA","UCx3dq_csKG6aBAvNWcn8Wjg","UCrWvm9jp07uNA47l9H0TfSA",
  "UCPGIqS7eVduwHihIfCOIUTQ","UCYm0kGBrUum-mkWWbVxUB8A","UCWHGD1C9gqS-TEZ1s1bwvzg",
  "UCVODJtmxX7KhIpGcY6PCHpw","UCqCpkGcX4P2qOz-9U797zIg","UCiaWT3kJ9vIFI2NmUJgWnDw",
  "UC42rE-b40pRFJ7qPHPiCd8g","UC8VIl6n2EXoP4pq-LmgR5pw","UCjYCq9g9OSj6Bwp7TFgrnsQ",
  "UCDX1CMOIShXfn71NAY58WuA","UCvXcEeBvPJ-MK4dXIuOp2zw","UCm1JoheNwDbXgF-VaQoeTHA",
  "UCSo24KY1IsHMJMJ-5UfHYKw","UCvBmcDW_JayWWDOl0Lw_4iw","UCX8oe3DG5lg7FYWguvuGW0Q",
  "UCkSJi9XuR98Uo1d8zCkg17w","UCA_Siyk2swMZ8KnKxyDa5GQ","UCTOTCMdsOb5PWmf3T7RngaQ",
  "UChYzWcZCRvFFMDiUFUoMjBg","UCODxI12nr6sqeW0aoyZIt4w","UCDfZWSttmxqDRFdmuMVFDuQ",
  "UCnwAsbkdEC-tNkOufE7mMeQ","UClgM_p2pqb35u1eDz6Rn2nw","UCWsBDnHMiv41eLHjDy8YCtQ",
  "UCk9FTxXjcmC_hmrZDsLjVMg","UC1p7SJCZuM0J3F-UfpuDFtg","UCp2QuOikyJe92333MHdQBHQ",
  "UC4gEcnN_Pmi2KUTjF8Km46w","UCwdywr9asycqbpqkgq29jNA","UCh0Ti6JdMZFRnt_ArRZOtBA",
  "UClw-M92fmkx7c3q3KQSBBww","UCcO2KUInJzw53A5qJj9BNhg","UC8uy0231g6ai9RGKR_17JtA",
  "UCUUJKQqzLFx1BIDv9zOAvDw","UCk-eVZPHK2DiXapQ-fk3aJw","UCVSnwKuxS-olPFtmVuaEPJQ",
  "UCFPPQ1Ge5-bSfkiLE3Zh8dQ","UCPBRH7IxjnC_Wy8p91uG8sA","UCKuKC88aZlwK3oXwTWULNfg",
  "UCxLV6Wp4FmjepaL9tuXV-kQ","UCSOSn4-cRCFc1rQTv2dQAkA","UC35FlRZ0n_JasBaBfwY2fxA",
  "UCwNB5MkpvMekejLSkgv8yBQ","UCkS87_jsdjIXGCUIB9Y_khA","UCIcs5bYu_uGlY-tDkxqxOQQ",
  "UC7TOGziRAH21MXonnKeNTEQ","UCwdMkm4XdsAxwlv7aWPsfnw","UCBt6xJXXqACGF8PMZmOqFZw",
  "UCosRydm_FuZteZX4vc6arTw","UCLKdB9fmpprXsgIUt4KK-9w","UCin12P-LCUd7_Y_-vHPDtmg",
  "UCpKw9vW7rjoCBLImYh49MKg","UC97dOJp0jaZenEmozi3RLuw","UCFL9vEwRWdGBRFuvzyPAb5Q",
  "UCP-vv1ymv5JYwGbioRk_sLw","UCuSkpW4gsbqLqZKeL5DMSSQ","UCnl4-6Hsq4LigGwIfdclqbA",
  "UCcusP7uEQTF8-WXcgU4lmyA","UCj11T7bGbG5MgKKh-UdtzrA","UC5dBJofZWbwcL8EIwi5SUIA",
  "UCBPuo0rfyfc2yHFHGKEpsWg","UCJRcdO4ETMQE673v_AqV9Kg","UC8lLIt8X4nu66fA6DOXf5yw",
  "UCkaKs808Jt2Mi9F-HJ0OmuQ","UCPT76Ti5HzkP5r6-JmJAVhw"
];

const HISTORIC_FILM_UNSELECTED_IDS=new Set([
  "UCnwAsbkdEC-tNkOufE7mMeQ", // Chào/Chảo Drama
  "UCj11T7bGbG5MgKKh-UdtzrA"  // Trạm Phim 365
]);

const HISTORIC_FILM_SELECTED_ANCHORS=new Set([
  "UCMMq5YjiOYpry6n8SEfisNg", // CCAP Dramas
  "UCR5W9zYdh5em_kF8vRXe0Uw", // CCAP Phim Hay
  "UC_mLtI_EeKBXkNew8QsFkYg", // iQIYI Phim Thuyết Minh
  "UCrWvm9jp07uNA47l9H0TfSA", // Yêu Phim
  "UCVODJtmxX7KhIpGcY6PCHpw", // PHIM TRUNG TUYỂN CHỌN
  "UCiaWT3kJ9vIFI2NmUJgWnDw", // Tạp Hóa Phim Hàn
  "UC42rE-b40pRFJ7qPHPiCd8g"  // VTV PHIM HAY
]);

const HISTORIC_FILM_BLOCKED_ANCHORS=new Set([
  "UCGb92d__VZAy-WJfywGD5mQ", // HH VietSub
  "UCCFbvjKJoIFnOFbijZ-Ttyg", // Phim4U
  "UCfrJX6Jb-jvn1sk1eOR7FsQ", // Thế Vietsub
  "UCpxScYvnu1OIlyT2dzP5peA", // Phim Hay Chọn Lọc
  "UCx3dq_csKG6aBAvNWcn8Wjg", // Thế Giới Phim Việt
  "UCPGIqS7eVduwHihIfCOIUTQ", // Vở Phim Ngắn Hay
  "UCYm0kGBrUum-mkWWbVxUB8A"  // Tạp hóa MovieLab
]);

function recoverHistoricFilmManualState(){
  try{
    // Any existing recovery marker means the one-time restore already ran.
    // The marker is JSON metadata, not the literal string "1".
    if(localStorage.getItem(SOURCE_FILM_SNAPSHOT_RECOVERY_KEY))return;

    const filmSelected=selectedSetForScope("film");
    const filmBlocked=blockedSetForScope("film");

    if(!localStorage.getItem(SOURCE_FILM_SNAPSHOT_BACKUP_KEY)){
      localStorage.setItem(
        SOURCE_FILM_SNAPSHOT_BACKUP_KEY,
        JSON.stringify({at:Date.now(),selected:[...filmSelected],blocked:[...filmBlocked]})
      );
    }

    const filmIds=new Set(HISTORIC_FILM_SOURCE_IDS);
    const candidates=[];
    const validId=id=>filmIds.has(String(id||""));

    const pushCandidate=(path,value)=>{
      if(!Array.isArray(value))return;
      const ids=[...new Set(value.map(String).filter(validId))];
      if(!ids.length)return;
      const p=normalizeSearchText(path||"");
      let kind="unknown";
      if(/blocked|hidden|chan/.test(p))kind="blocked";
      else if(/selected|selection|chon/.test(p))kind="selected";
      candidates.push({path:String(path||""),kind,ids:new Set(ids)});
    };

    const walk=(value,path,depth=0)=>{
      if(depth>5||value==null)return;
      if(Array.isArray(value)){
        pushCandidate(path,value);
        for(let i=0;i<Math.min(value.length,8);i++){
          if(value[i]&&typeof value[i]==="object")walk(value[i],path+"["+i+"]",depth+1);
        }
        return;
      }
      if(typeof value!=="object")return;
      for(const [key,next] of Object.entries(value)){
        walk(next,path+"."+key,depth+1);
      }
    };

    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||key===SOURCE_FILM_SNAPSHOT_RECOVERY_KEY)continue;
      try{
        walk(JSON.parse(localStorage.getItem(key)||"null"),key,0);
      }catch{}
    }

    const selectedCandidates=candidates.filter(item=>item.kind==="selected");
    const blockedCandidates=candidates.filter(item=>item.kind==="blocked");

    let best=null;
    for(const selectedCandidate of selectedCandidates){
      for(const blockedCandidate of blockedCandidates){
        const selected=new Set([...selectedCandidate.ids].filter(id=>!HISTORIC_FILM_UNSELECTED_IDS.has(id)));
        const blocked=new Set([...blockedCandidate.ids].filter(id=>!HISTORIC_FILM_UNSELECTED_IDS.has(id)));
        for(const id of blocked)selected.delete(id);

        const overlap=[...selected].filter(id=>blocked.has(id)).length;
        let score=
          3000-
          Math.abs(selected.size-41)*80-
          Math.abs(blocked.size-31)*80-
          overlap*300;

        for(const id of HISTORIC_FILM_SELECTED_ANCHORS){
          score+=selected.has(id)?120:-120;
          if(blocked.has(id))score-=240;
        }
        for(const id of HISTORIC_FILM_BLOCKED_ANCHORS){
          score+=blocked.has(id)?120:-120;
          if(selected.has(id))score-=240;
        }
        if(selected.size===41&&blocked.size===31)score+=5000;

        if(!best||score>best.score){
          best={score,selected,blocked,selectedPath:selectedCandidate.path,blockedPath:blockedCandidate.path};
        }
      }
    }

    let restoredSelected;
    let restoredBlocked;
    let source="historic-storage";

    if(best&&best.selected.size===41&&best.blocked.size===31){
      restoredSelected=best.selected;
      restoredBlocked=best.blocked;
      source=best.selectedPath+" | "+best.blockedPath;
    }else{
      // No exact old pair survived as one value. Rebuild the historical
      // 41/31 partition from every remaining localStorage trace, with the
      // channel states visible in the old Film screenshots as hard anchors.
      const evidence=new Map(
        HISTORIC_FILM_SOURCE_IDS.map(id=>[id,0])
      );

      const weightForPath=path=>{
        const p=normalizeSearchText(path||"");
        if(/before|backup|legacy|scope/.test(p))return 6;
        if(/source-selection-v1|source-blocked-v1/.test(p))return 5;
        return 2;
      };

      for(const item of candidates){
        if(item.kind==="unknown")continue;
        const direction=item.kind==="selected"?1:-1;
        const weight=weightForPath(item.path);
        for(const id of item.ids){
          evidence.set(id,(evidence.get(id)||0)+direction*weight);
        }
      }

      for(const id of HISTORIC_FILM_SELECTED_ANCHORS)evidence.set(id,10000);
      for(const id of HISTORIC_FILM_BLOCKED_ANCHORS)evidence.set(id,-10000);
      for(const id of HISTORIC_FILM_UNSELECTED_IDS)evidence.set(id,0);

      const fallbackNameScore=id=>{
        const row=libraryRow(id);
        const name=normalizeSearchText(row?.name||"");
        let score=0;
        if(/official|iqiyi|vtv|drama|kich ngan|phim ngan|phim trung|ngon tinh|me phim|phim hay|movie/.test(name))score+=1;
        if(/review|vietsub|bao phim|kiem dinh|tap hoa movielab|phim4u/.test(name))score-=1;
        return score;
      };

      const undecided=HISTORIC_FILM_SOURCE_IDS
        .filter(id=>!HISTORIC_FILM_UNSELECTED_IDS.has(id))
        .sort((a,b)=>{
          const ea=(evidence.get(a)||0)+fallbackNameScore(a);
          const eb=(evidence.get(b)||0)+fallbackNameScore(b);
          if(eb!==ea)return eb-ea;
          return HISTORIC_FILM_SOURCE_IDS.indexOf(a)-HISTORIC_FILM_SOURCE_IDS.indexOf(b);
        });

      restoredSelected=new Set(undecided.slice(0,41));
      restoredBlocked=new Set(undecided.slice(41));

      // Screenshot anchors always win.
      for(const id of HISTORIC_FILM_SELECTED_ANCHORS){
        restoredBlocked.delete(id);
        restoredSelected.add(id);
      }
      for(const id of HISTORIC_FILM_BLOCKED_ANCHORS){
        restoredSelected.delete(id);
        restoredBlocked.add(id);
      }

      // Rebalance after enforcing anchors.
      const movable=[...HISTORIC_FILM_SOURCE_IDS].filter(id=>
        !HISTORIC_FILM_UNSELECTED_IDS.has(id)&&
        !HISTORIC_FILM_SELECTED_ANCHORS.has(id)&&
        !HISTORIC_FILM_BLOCKED_ANCHORS.has(id)
      );
      while(restoredSelected.size>41){
        const id=[...restoredSelected].reverse().find(item=>movable.includes(item));
        if(!id)break;
        restoredSelected.delete(id); restoredBlocked.add(id);
      }
      while(restoredSelected.size<41){
        const id=[...restoredBlocked].find(item=>movable.includes(item));
        if(!id)break;
        restoredBlocked.delete(id); restoredSelected.add(id);
      }
      while(restoredBlocked.size>31){
        const id=[...restoredBlocked].reverse().find(item=>movable.includes(item));
        if(!id)break;
        restoredBlocked.delete(id); restoredSelected.add(id);
      }
      while(restoredBlocked.size<31){
        const id=[...restoredSelected].find(item=>movable.includes(item));
        if(!id)break;
        restoredSelected.delete(id); restoredBlocked.add(id);
      }
      source="merged-historic-traces";
    }

    filmSelected.clear();
    filmBlocked.clear();
    for(const id of restoredSelected)filmSelected.add(id);
    for(const id of restoredBlocked){
      filmSelected.delete(id);
      filmBlocked.add(id);
    }
    for(const id of HISTORIC_FILM_UNSELECTED_IDS){
      filmSelected.delete(id);
      filmBlocked.delete(id);
    }

    persistScopedSourceState();
    localStorage.setItem(
      SOURCE_FILM_SNAPSHOT_RECOVERY_KEY,
      JSON.stringify({
        at:Date.now(),
        selectedTotal:filmSelected.size,
        blockedTotal:filmBlocked.size,
        unselectedTotal:HISTORIC_FILM_UNSELECTED_IDS.size,
        source
      })
    );
  }catch(error){
    console.warn("historic film snapshot recovery failed",error);
  }
}
recoverHistoricFilmManualState();

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
    row?.name||
    ""
  );
}

const sourceStateNameIndexCache=new Map();

function invalidateSourceStateNameIndex(){
  sourceStateNameIndexCache.clear();
}

function sourceStateNameIndex(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(sourceStateNameIndexCache.has(scope))return sourceStateNameIndexCache.get(scope);

  const blockedNames=new Map();
  const selectedNames=new Map();
  const addNames=(ids,target)=>{
    for(const id of ids){
      const meta=sourceMetaCache.get(id)||{};
      const stored=libraryRow(id)||{};
      const name=normalizeSearchText(meta.name||stored.name||"");
      if(name&&name.length>=3&&!target.has(name))target.set(name,id);
    }
  };

  addNames(blockedSetForScope(scope),blockedNames);
  addNames(selectedSetForScope(scope),selectedNames);

  const index={blockedNames,selectedNames};
  sourceStateNameIndexCache.set(scope,index);
  return index;
}

function matchSourceState(row={},scope=sourceManageGroup){
  scope=sourceScope(scope);
  const id=String(row?.id||row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
  const blocked=blockedSetForScope(scope);
  const selected=selectedSetForScope(scope);

  if(id&&blocked.has(id))return {status:"blocked",canonicalId:id};
  if(id&&selected.has(id))return {status:"selected",canonicalId:id};

  const name=sourceRowName(row);
  if(!name||name.length<3)return {status:"normal",canonicalId:""};

  const index=sourceStateNameIndex(scope);
  if(index.blockedNames.has(name)){
    return {status:"blocked",canonicalId:index.blockedNames.get(name)};
  }
  if(index.selectedNames.has(name)){
    return {status:"selected",canonicalId:index.selectedNames.get(name)};
  }
  return {status:"normal",canonicalId:""};
}

function reconcileSourceState(row={},scope=sourceManageGroup){
  scope=sourceScope(scope);
  const id=String(row?.id||row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return {status:"normal",changed:false};

  const match=matchSourceState(row,scope);
  if(match.status==="normal")return {...match,changed:false};

  const blocked=blockedSetForScope(scope);
  const selected=selectedSetForScope(scope);
  let changed=false;

  if(match.status==="blocked"){
    if(selected.delete(id))changed=true;
    if(!blocked.has(id)){blocked.add(id);changed=true;}
  }else if(match.status==="selected"){
    if(blocked.has(id)){
      return {status:"blocked",canonicalId:id,changed:false};
    }
    if(!selected.has(id)){selected.add(id);changed=true;}
  }

  return {...match,changed};
}

function persistReconciledSourceState(){
  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
}

function isBlockedSourceRow(row={},scope=GENERAL_SOURCE_SCOPE){
  return matchSourceState(row,scope).status==="blocked";
}

function updateSourceSummary(rows=managedChannelLibrary()){
  const scope=sourceScope(sourceManageGroup);
  const selected=selectedSetForScope(scope);
  const blocked=blockedSetForScope(scope);
  const selectedCount=[...selected].filter(id=>!blocked.has(id)).length;
  const blockedCount=blocked.size;
  const totalCount=scope===GENERAL_SOURCE_SCOPE
    ?rows.filter(isGeneralManagerSource).length
    :new Set([
        ...suggestedSetForScope(scope),
        ...selected,
        ...blocked
      ]).size;

  if(sourceHeaderCount)sourceHeaderCount.textContent=String(selectedCount);
  if(sourceSummary){
    sourceSummary.textContent=sourceManageMode
      ?selectedCount+" chọn · "+blockedCount+" chặn · "+totalCount+" nguồn"
      :selectedSources(activeSourceScope()||GENERAL_SOURCE_SCOPE).length+" nguồn đã chọn";
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
  const matched=remote?matchSourceState(row,sourceManageGroup):null;
  const exists=!remote||matched?.status!=="normal";
  const status=remote?(matched?.status||"normal"):sourceStatus(row.id,sourceManageGroup);
  const active=status==="selected";
  const blocked=status==="blocked";
  const subscriber=clean(meta.subscribers||"");
  const statusLabel=active?"Đã chọn":blocked?"Đã chặn":"Chưa chọn";
  const groupLabel=SOURCE_MANAGER_GROUPS.find(item=>item.key===sourceManageGroup)?.label||"";
  const subBits=[];
  if(sourceManageGroup!==GENERAL_SOURCE_SCOPE&&groupLabel)subBits.push(groupLabel);
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
  const row=libraryRow(id)||managedChannelLibrary().find(item=>item.id===id)||sourceRemoteResults.find(item=>item.id===id);
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
      invalidateSourceStateNameIndex();
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

function sourceIsSuggestedAnywhere(id){
  for(const group of CONTENT_SOURCE_SCOPES){
    if(suggestedSetForScope(group).has(id))return true;
  }
  return false;
}

function sourceHasLegacyCategoryAssignment(id){
  return (Array.isArray(sourceGroupOverrides?.[id])?sourceGroupOverrides[id]:[])
    .some(group=>CONTENT_SOURCE_SCOPES.has(String(group)));
}

function isGeneralManagerSource(row={}){
  const id=String(row?.id||"").trim();
  if(!id)return false;

  // Mới nhất/Tuần này: durable state + temporary discoveries only.
  return selectedSourceIds.has(id)||
    blockedSourceIds.has(id)||
    temporaryGeneralSourceIds.has(id);
}

function renderSourceGroupTabs(rows=managedChannelLibrary()){
  if(!sourceGroupTabs||!sourceGroupNav)return;
  sourceGroupNav.hidden=!sourceManageMode;
  if(!sourceManageMode){
    sourceGroupTabs.innerHTML="";
    return;
  }

  sourceGroupTabs.innerHTML=SOURCE_MANAGER_GROUPS.map(group=>{
    let count=0;
    if(group.key===GENERAL_SOURCE_SCOPE){
      count=rows.filter(isGeneralManagerSource).length;
    }else{
      const ids=new Set([
        ...suggestedSetForScope(group.key),
        ...selectedSetForScope(group.key),
        ...blockedSetForScope(group.key)
      ]);
      count=ids.size;
    }
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

function renderSourceLibrary(rows=managedChannelLibrary()){
  if(!sourceList)return;
  const q=normalizeSearchText(sourceSearch?.value||"");

  let reconciled=false;
  for(const row of rows){
    const result=reconcileSourceState(row,sourceManageGroup);
    if(result.changed)reconciled=true;
  }
  if(reconciled)persistReconciledSourceState();

  const scopedStateIds=new Set([
    ...selectedSetForScope(sourceManageGroup),
    ...blockedSetForScope(sourceManageGroup)
  ]);
  const scopedSuggestionIds=CONTENT_SOURCE_SCOPES.has(sourceManageGroup)
    ?suggestedSetForScope(sourceManageGroup)
    :new Set();

  const groupFilter=row=>{
    if(q||!sourceManageMode)return true;
    if(sourceManageGroup===GENERAL_SOURCE_SCOPE)return isGeneralManagerSource(row);
    return scopedStateIds.has(row.id)||scopedSuggestionIds.has(row.id);
  };

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
    const normalRows=localRows.filter(row=>sourceStatus(row.id,sourceManageGroup)==="normal");
    const selectedRows=localRows.filter(row=>sourceStatus(row.id,sourceManageGroup)==="selected");
    const blockedRows=localRows.filter(row=>sourceStatus(row.id,sourceManageGroup)==="blocked");

    let remoteChanged=false;
    for(const row of remoteRows){
      const result=reconcileSourceState(row,sourceManageGroup);
      if(result.changed)remoteChanged=true;
    }
    if(remoteChanged)persistReconciledSourceState();

    const normalRemote=remoteRows.filter(row=>matchSourceState(row,sourceManageGroup).status==="normal");
    const selectedRemote=remoteRows.filter(row=>matchSourceState(row,sourceManageGroup).status==="selected");
    const blockedRemote=remoteRows.filter(row=>matchSourceState(row,sourceManageGroup).status==="blocked");

    const unselectedHtml=[
      ...normalRemote.map(row=>sourceRowHtml(row,{remote:true})),
      ...normalRows.map(row=>sourceRowHtml(row))
    ];

    parts.push(sourceStatusSection("Chưa chọn",unselectedHtml));
    parts.push(sourceStatusSection("Đã chọn",[
      ...selectedRows.map(row=>sourceRowHtml(row)),
      ...selectedRemote.map(row=>sourceRowHtml(row,{remote:true}))
    ]));
    parts.push(sourceStatusSection("Đã chặn",[
      ...blockedRows.map(row=>sourceRowHtml(row)),
      ...blockedRemote.map(row=>sourceRowHtml(row,{remote:true}))
    ],{blocked:true}));

    if(!unselectedHtml.length&&!selectedRows.length&&!blockedRows.length){
      const message=q
        ?"Không có nguồn phù hợp"
        :sourceManageGroup!==GENERAL_SOURCE_SCOPE
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

  renderSourceGroupTabs(rows);
  sourceList.innerHTML=parts.join("");
  requestAnimationFrame(observeSourceRows);
}

function refreshSourceManager(){
  const rows=managedChannelLibrary();
  renderSourceLibrary(rows);
  updateSourceSummary(rows);
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

function sourceCandidateFromVideo(row={}){
  const id=String(row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;

  const name=clean(
    row?._sourceName||
    row?.uploaderName||
    row?.uploader||
    row?.channelName||
    row?._displaySource||
    ""
  );
  if(!name)return null;

  return {
    id,
    name,
    thumbnailUrl:safeSourceThumb(
      row?.uploaderThumbnailUrl||
      row?.channelThumbnailUrl||
      row?._sourceThumbnailUrl||
      ""
    ),
    subscribers:""
  };
}

function rememberDiscoveredSources(rows=[],groupHint=""){
  const hint=String(groupHint||"").trim();
  let stateChanged=false;
  let suggestionChanged=false;
  const seen=new Set();

  for(const row of Array.isArray(rows)?rows:[]){
    const candidate=sourceCandidateFromVideo(row);
    if(!candidate||seen.has(candidate.id))continue;
    seen.add(candidate.id);
    sourceMetaCache.set(candidate.id,{...sourceMetaCache.get(candidate.id),...candidate});

    // Durable Chọn/Chặn state is loaded before discovery.
    const reconciled=reconcileSourceState(candidate,hint||sourceManageGroup);
    if(reconciled.changed)stateChanged=true;
    if(reconciled.status!=="normal")continue;

    if(hint===GENERAL_SOURCE_SCOPE){
      if(!temporaryGeneralSourceIds.has(candidate.id)){
        temporaryGeneralSourceIds.add(candidate.id);
        suggestionChanged=true;
      }
    }else if(hint&&CONTENT_SOURCE_SCOPES.has(hint)){
      if(assignSourceGroup(candidate.id,hint))suggestionChanged=true;
    }else if(!temporaryGeneralSourceIds.has(candidate.id)){
      temporaryGeneralSourceIds.add(candidate.id);
      suggestionChanged=true;
    }
  }

  if(stateChanged)persistReconciledSourceState();
  if(stateChanged||suggestionChanged)updateSourceSummary();
}

function addSource(row){
  if(!row||!/^UC[A-Za-z0-9_-]+$/.test(String(row.id||"")))return;

  const id=String(row.id);
  const meta=sourceMetaFor(row);
  sourceMetaCache.set(id,{
    ...sourceMetaCache.get(id),
    id,
    name:clean(meta.name||row.name)||"Kênh YouTube",
    thumbnailUrl:safeSourceThumb(meta.thumbnailUrl||row.thumbnailUrl||""),
    subscribers:clean(meta.subscribers||row.subscribers||"")
  });

  const reconciled=reconcileSourceState({...row,id},sourceManageGroup);
  if(reconciled.changed)persistReconciledSourceState();

  // Mở/Lưu nguồn is temporary until the user chooses Chọn or Chặn.
  if(reconciled.status==="normal"){
    if(CONTENT_SOURCE_SCOPES.has(sourceManageGroup)){
      assignSourceGroup(id,sourceManageGroup);
    }else{
      temporaryGeneralSourceIds.add(id);
    }
  }

  state.sourceLibraryDirty=true;
  refreshSourceManager();
}

function toggleSource(id){
  if(!libraryHas(id)&&!allManagedStateIds().has(id))return;
  const status=sourceStatus(id,sourceManageGroup);
  setSourceStatus(id,status==="selected"?"normal":"selected",sourceManageGroup);
}

function setSourceManageMode(enabled,{render=true}={}){
  const next=enabled===true;
  if(next&&!sourceManageMode)sourceBlockedExpanded=false;
  sourceManageMode=next;

  if(sourceSettingsBtn){
    sourceSettingsBtn.classList.toggle("active",sourceManageMode);
    sourceSettingsBtn.setAttribute("aria-pressed",sourceManageMode?"true":"false");
    sourceSettingsBtn.setAttribute("aria-label",sourceManageMode?"Xong quản lý nguồn":"Quản lý nguồn theo nhóm");
    sourceSettingsBtn.textContent=sourceManageMode?"✓":"⚙︎";
  }

  if(sourceSearch){
    sourceSearch.placeholder=sourceManageMode?"Tìm trong quản lý nguồn":"Tìm kênh trên YouTube";
  }

  if(render)refreshSourceManager();
}


function sourcePreviewScopeLabel(){
  return SOURCE_MANAGER_GROUPS.find(item=>item.key===sourceManageGroup)?.label||"Nguồn";
}

function syncSourcePreviewHeader(){
  if(!sourcePreview)return;
  const id=sourcePreviewSourceId;
  const row=sourcePreviewSourceRow;

  if(!id||!row){
    sourcePreview.classList.add("is-empty");
    if(sourcePreviewTitle)sourcePreviewTitle.textContent="Xem nguồn";
    if(sourcePreviewStatus)sourcePreviewStatus.textContent="Chọn một kênh ở bên trái để kiểm tra trước khi thêm.";
    if(sourcePreviewSelect)sourcePreviewSelect.hidden=true;
    return;
  }

  sourcePreview.classList.remove("is-empty");
  const meta=sourceMetaFor(row);
  const exists=libraryHas(id)||allManagedStateIds().has(id);
  const status=exists?sourceStatus(id,sourceManageGroup):"normal";
  const statusText=status==="selected"?"Đã chọn":status==="blocked"?"Đã chặn":"Chưa chọn";

  if(sourcePreviewTitle)sourcePreviewTitle.textContent=meta.name||row.name||"Nguồn YouTube";
  if(sourcePreviewStatus){
    const bits=[sourcePreviewScopeLabel(),statusText];
    if(meta.subscribers)bits.push(meta.subscribers);
    sourcePreviewStatus.textContent=bits.join(" · ");
  }

  if(sourcePreviewSelect){
    sourcePreviewSelect.hidden=false;
    sourcePreviewSelect.disabled=status==="selected";
    sourcePreviewSelect.classList.toggle("active",status==="selected");
    sourcePreviewSelect.textContent=status==="selected"?"Đã chọn":"Chọn nguồn";
  }
}

function sourceRowFromVideo(video={}){
  const id=String(video?.channelId||video?._sourceId||video?.uploaderId||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;
  const name=clean(
    video?._sourceName||
    video?.uploaderName||
    video?.uploader||
    video?.channelName||
    "Kênh YouTube"
  );
  return {id,name:name||"Kênh YouTube",thumbnailUrl:"",subscribers:""};
}

function sourcePreviewVideoCard(video,{searchResult=false}={}){
  const videoId=itemVideoId(video);
  const meta=relativePublishedLabel(video);
  const source=sourceRowFromVideo(video);
  const sourceName=clean(source?.name||video?.uploader||video?._sourceName||"");
  const metaText=meta+(video.views?(" · "+fmtViews(video.views)+" lượt xem"):"");

  return '<article class="source-video-card'+(searchResult?' search-result':'')+'" data-source-video-card="'+esc(videoId)+'">'+
    '<button class="source-video-row" type="button" data-source-video-id="'+esc(videoId)+'">'+
      '<img src="'+esc(thumb(video,videoId))+'" alt="" loading="lazy">'+
      '<span class="source-video-copy">'+
        '<span class="source-video-title">'+esc(clean(video.title)||"Video")+'</span>'+
        (searchResult&&sourceName?'<span class="source-video-source">'+esc(sourceName)+'</span>':"")+
        '<span class="source-video-meta">'+esc(metaText)+'</span>'+
      '</span>'+
    '</button>'+
    (searchResult&&source
      ?'<button class="source-open-channel" type="button" data-source-open-channel="'+esc(source.id)+'" data-source-video-ref="'+esc(videoId)+'">Thêm + mở nguồn</button>'
      :"")+
  '</article>';
}

function renderSourcePreviewVideos(){
  if(!sourcePreviewList)return;
  const q=clean(sourcePreviewSearch?.value||"");
  const searching=q.length>=2;
  const all=searching?[...sourcePreviewSearchRows.values()]:[...sourcePreviewRows.values()];

  if(!all.length){
    sourcePreviewList.innerHTML='<div class="source-empty">'+
      (searching?'Không có video phù hợp trên YouTube':'Kênh chưa có video để hiển thị')+
    '</div>';
    return;
  }

  sourcePreviewList.innerHTML=all
    .map(video=>sourcePreviewVideoCard(video,{searchResult:searching}))
    .join("");
}

async function searchPreviewVideos(query){
  const q=clean(query);
  const seq=++sourcePreviewSearchSeq;
  if(q.length<2){
    sourcePreviewSearchRows=new Map();
    renderSourcePreviewVideos();
    return;
  }

  sourcePreviewList.innerHTML='<div class="source-empty">Đang tìm video trên YouTube…</div>';

  try{
    const local=await localEngine(16000);
    const rows=await local.search(q);
    if(seq!==sourcePreviewSearchSeq||sourcesSheet?.hidden)return;

    const normalized=(Array.isArray(rows)?rows:[])
      .filter(row=>itemVideoId(row))
      .slice(0,24);
    sourcePreviewSearchRows=new Map(normalized.map(video=>[itemVideoId(video),video]));
    renderSourcePreviewVideos();
  }catch(error){
    if(seq!==sourcePreviewSearchSeq)return;
    console.warn("source preview video search failed",error);
    sourcePreviewSearchRows=new Map();
    sourcePreviewList.innerHTML='<div class="source-empty">Chưa tìm được video trên YouTube</div>';
  }
}

function schedulePreviewVideoSearch(){
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchSeq++;
  sourcePreviewSearchRows=new Map();
  const q=clean(sourcePreviewSearch?.value||"");

  if(q.length<2){
    renderSourcePreviewVideos();
    return;
  }

  sourcePreviewList.innerHTML='<div class="source-empty">Đang chờ tìm video…</div>';
  sourcePreviewSearchTimer=setTimeout(()=>void searchPreviewVideos(q),280);
}

function revealAddedSource(id){
  requestAnimationFrame(()=>{
    const row=[...(sourceList?.querySelectorAll("[data-source-id]")||[])]
      .find(el=>el.dataset.sourceId===id);
    if(!row)return;
    row.scrollIntoView({block:"nearest",behavior:"smooth"});
    row.classList.add("just-added");
    setTimeout(()=>row.classList.remove("just-added"),1400);
  });
}

async function openSourceFromSearchVideo(video){
  const base=sourceRowFromVideo(video);
  if(!base)return;

  // Add to the left list immediately; do not wait for network metadata.
  addSource(base);
  revealAddedSource(base.id);

  const videoId=itemVideoId(video);
  void openSourcePreview(base.id,base);
  if(videoId)openSourceVideo(videoId,video);

  sourcePreviewSearchRows=new Map();
  if(sourcePreviewSearch)sourcePreviewSearch.value="";

  // Upgrade name/avatar/subscriber metadata in the background.
  try{
    const local=await localEngine(12000);
    const meta=await local.channelMeta(base.id);
    if(meta&&meta.id){
      const row={...base,...meta,name:clean(meta.name)||base.name};
      sourceMetaCache.set(row.id,row);

      if(
        temporaryGeneralSourceIds.has(row.id)||
        suggestedSetForScope(sourceManageGroup).has(row.id)||
        allManagedStateIds().has(row.id)
      ){
        refreshSourceManager();
        revealAddedSource(row.id);
      }

      if(sourcePreviewSourceId===row.id){
        sourcePreviewSourceRow=row;
        syncSourcePreviewHeader();
      }
    }
  }catch(error){
    console.warn("source metadata enrichment failed",base.id,error);
  }
}

async function openSourcePreview(id,rowHint=null){
  const cached=sourceMetaCache.get(id)||null;
  const row=
    libraryRow(id)||
    rowHint||
    sourceRemoteResults.find(item=>item.id===id)||
    managedChannelLibrary().find(item=>item.id===id)||
    (cached?{id,...cached}:null);
  if(!row||!sourcePreview)return;

  const seq=++sourcePreviewSeq;
  sourcePreviewSourceId=id;
  sourcePreviewSourceRow=row;
  if(sourcesSheet)sourcesSheet.dataset.previewOpen="true";
  sourcePreview.hidden=false;
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchSeq++;
  sourcePreviewSearchRows=new Map();
  if(sourcePreviewSearch)sourcePreviewSearch.value="";
  closeSourceVideo();
  syncSourcePreviewHeader();

  sourcePreviewRows=new Map();
  sourcePreviewList.innerHTML='<div class="source-empty">Đang tải video mới…</div>';

  try{
    const local=await localEngine(16000);
    let rows=[];

    try{
      rows=await local.channelVideosPage("preview:"+id,id,true);
    }catch(error){
      console.warn("channel videos tab failed",id,error);
    }

    if(seq!==sourcePreviewSeq)return;

    if(!Array.isArray(rows)||!rows.length){
      const sourceName=clean(sourceMetaFor(row).name||row.name||"");
      if(sourceName){
        try{
          const fallback=await local.search(sourceName,{sort_by:"upload_date"});
          if(seq!==sourcePreviewSeq)return;

          const normalizedName=normalizeSearchText(sourceName);
          const exact=(Array.isArray(fallback)?fallback:[]).filter(video=>{
            const channelId=String(video?.channelId||video?._sourceId||video?.uploaderId||"").trim();
            if(channelId&&channelId===id)return true;
            const uploader=normalizeSearchText(video?.uploader||video?._sourceName||"");
            return !!uploader&&uploader===normalizedName;
          });
          rows=exact;
        }catch(error){
          console.warn("channel preview fallback failed",id,error);
        }
      }
    }

    if(seq!==sourcePreviewSeq)return;

    const ordered=newestFirst(Array.isArray(rows)?rows:[])
      .slice(0,20)
      .map(video=>({
        ...video,
        _sourceId:id,
        channelId:video?.channelId||id,
        _sourceName:sourceMetaFor(row).name||row.name||video?._sourceName||video?.uploader||""
      }));
    sourcePreviewRows=new Map(ordered.map(video=>[itemVideoId(video),video]).filter(([videoId])=>videoId));
    renderSourcePreviewVideos();
  }catch(error){
    if(seq!==sourcePreviewSeq)return;
    console.warn("channel preview failed",error);
    sourcePreviewRows=new Map();
    sourcePreviewList.innerHTML='<div class="source-empty">Chưa tải được video của kênh</div>';
  }
}

function choosePreviewSource(){
  const id=sourcePreviewSourceId;
  const row=sourcePreviewSourceRow;
  if(!id||!row)return;

  if(!libraryHas(id)&&!allManagedStateIds().has(id)){
    addSource(row);
  }
  setSourceStatus(id,"selected",sourceManageGroup);
  syncSourcePreviewHeader();
}

function sourceVideoCommand(func,args=[]){
  try{
    sourceVideoFrame?.contentWindow?.postMessage(
      JSON.stringify({event:"command",func,args}),
      "https://www.youtube-nocookie.com"
    );
  }catch{}
}

function forceSourceVideoPlay(){
  sourceVideoCommand("playVideo");
}

function openSourceVideo(id,row){
  if(!sourceVideoPopup||!sourceVideoFrame||!id)return;
  const title=clean(row?.title)||"Video";
  sourceVideoPopupTitle.textContent=title;

  // Show the player before assigning src. Loading an iframe while its parent is
  // hidden can cause Chrome/Safari to ignore the autoplay request.
  sourceVideoPopup.hidden=false;

  const origin=encodeURIComponent(location.origin);
  sourceVideoFrame.onload=()=>{
    forceSourceVideoPlay();
    setTimeout(forceSourceVideoPlay,120);
    setTimeout(forceSourceVideoPlay,450);
  };
  sourceVideoFrame.src=
    "https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id)+
    "?autoplay=1&playsinline=1&rel=0&cc_load_policy=0&enablejsapi=1&origin="+origin;

  // Keep the original click gesture as close as possible to the play command.
  setTimeout(forceSourceVideoPlay,0);
}

function closeSourceVideo(){
  if(!sourceVideoPopup||!sourceVideoFrame)return;
  sourceVideoPopup.hidden=true;
  sourceVideoFrame.onload=null;
  sourceVideoFrame.src="about:blank";
  if(sourceVideoPopupTitle)sourceVideoPopupTitle.textContent="";
}

function resetSourcePreviewPane(){
  closeSourceVideo();
  sourcePreviewSeq++;
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchSeq++;
  sourcePreviewRows=new Map();
  sourcePreviewSearchRows=new Map();
  sourcePreviewSourceId="";
  sourcePreviewSourceRow=null;
  if(sourcePreviewSearch)sourcePreviewSearch.value="";
  if(sourcesSheet)delete sourcesSheet.dataset.previewOpen;
  if(sourcePreview){
    sourcePreview.hidden=false;
    sourcePreview.classList.add("is-empty");
  }
  if(sourcePreviewList){
    sourcePreviewList.innerHTML=
      '<div class="source-preview-placeholder">'+
        '<strong>Xem trước nguồn ngay tại đây</strong>'+
        '<span>Danh sách nguồn luôn giữ ở bên trái; video phát trong cửa sổ này nên không còn xung với trình phát chính.</span>'+
      '</div>';
  }
  syncSourcePreviewHeader();
}

function closeSourcePreview(){
  resetSourcePreviewPane();
  setTimeout(()=>sourceSearch?.focus(),40);
}

const SETTINGS_AUTH_KEY="1988-settings-unlocked-v1";
const SETTINGS_PIN="8881";
let pendingSettingsAction=null;

function settingsAccessSaved(){
  try{
    return localStorage.getItem(SETTINGS_AUTH_KEY)==="1";
  }catch{
    return false;
  }
}

function rememberSettingsAccess(){
  try{
    localStorage.setItem(SETTINGS_AUTH_KEY,"1");
  }catch{}
}

function closeSettingsAuthSheet(){
  if(!settingsAuthSheet)return;
  settingsAuthSheet.hidden=true;
  if(settingsAuthPin)settingsAuthPin.value="";
  if(settingsAuthError)settingsAuthError.textContent="";
  pendingSettingsAction=null;
}

function requestSettingsAccess(action){
  if(typeof action!=="function")return;

  if(settingsAccessSaved()){
    action();
    return;
  }

  pendingSettingsAction=action;
  if(settingsAuthError)settingsAuthError.textContent="";
  if(settingsAuthPin)settingsAuthPin.value="";
  if(settingsAuthSheet)settingsAuthSheet.hidden=false;

  requestAnimationFrame(()=>{
    settingsAuthPin?.focus();
  });
}

function submitSettingsAccess(){
  const value=String(settingsAuthPin?.value||"").trim();
  if(value!==SETTINGS_PIN){
    if(settingsAuthError)settingsAuthError.textContent="Mật khẩu chưa đúng";
    settingsAuthPin?.focus();
    settingsAuthPin?.select?.();
    return;
  }

  const action=pendingSettingsAction;
  rememberSettingsAccess();
  if(settingsAuthSheet)settingsAuthSheet.hidden=true;
  if(settingsAuthPin)settingsAuthPin.value="";
  if(settingsAuthError)settingsAuthError.textContent="";
  pendingSettingsAction=null;

  action?.();
}

function resetSourceManagerInstant(){
  sourceManageGroup=GENERAL_SOURCE_SCOPE;
  sourceBlockedExpanded=false;
  sourceRemoteResults=[];
  sourcePreviewRows=new Map();
  sourcePreviewSearchRows=new Map();
  sourcePreviewSourceId="";
  sourcePreviewSourceRow=null;

  if(sourceSearch)sourceSearch.value="";
  if(sourcePreviewSearch)sourcePreviewSearch.value="";
  if(clearSourceSearch)clearSourceSearch.hidden=true;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";

  const resetScroll=element=>{
    if(!element)return;
    element.scrollTop=0;
    element.scrollLeft=0;
  };

  resetScroll(sourcesSheet);
  resetScroll(sourcesSheet?.querySelector?.(".sources-sheet"));
  resetScroll(sourcesSheet?.querySelector?.(".source-workspace"));
  resetScroll(sourceBrowse);
  resetScroll(sourceList);
  resetScroll(sourcePreview);
  resetScroll(sourcePreviewList);
  resetScroll(sourceGroupTabs);
}

function pinSourceManagerTop(){
  const reset=()=>{
    hardResetDocumentTop();
    if(sourcesSheet){
      sourcesSheet.scrollTop=0;
      sourcesSheet.scrollLeft=0;
    }
    const sheet=sourcesSheet?.querySelector?.(".sources-sheet");
    if(sheet){
      sheet.scrollTop=0;
      sheet.scrollLeft=0;
    }
    const workspace=sourcesSheet?.querySelector?.(".source-workspace");
    if(workspace){
      workspace.scrollTop=0;
      workspace.scrollLeft=0;
    }
    if(sourceBrowse){
      sourceBrowse.scrollTop=0;
      sourceBrowse.scrollLeft=0;
    }
    if(sourceList){
      sourceList.scrollTop=0;
      sourceList.scrollLeft=0;
    }
    if(sourcePreview){
      sourcePreview.scrollTop=0;
      sourcePreview.scrollLeft=0;
    }
    if(sourcePreviewList){
      sourcePreviewList.scrollTop=0;
      sourcePreviewList.scrollLeft=0;
    }
    if(sourceGroupTabs)sourceGroupTabs.scrollLeft=0;
  };

  reset();
  requestAnimationFrame(()=>{
    reset();
    requestAnimationFrame(reset);
  });
  setTimeout(reset,80);
  setTimeout(reset,220);
}

function openSourceLibrary(){
  if(!sourcesSheet)return;

  resetHomeViewportInstant({resetSource:true});
  resetSourceManagerInstant();
  sourcesSheet.hidden=false;
  pinSourceManagerTop();
  sourcePreviewSeq++;
  closeSourceVideo();
  sourceManageGroup=GENERAL_SOURCE_SCOPE;

  setSourceManageMode(true,{render:false});
  resetSourcePreviewPane();
  if(sourceBrowse)sourceBrowse.hidden=false;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";
  if(sourceList)sourceList.innerHTML='<div class="source-empty">Đang mở quản lý nguồn…</div>';

  requestAnimationFrame(()=>{
    try{
      refreshSourceManager();
      pinSourceManagerTop();
    }catch(error){
      console.error("open source manager failed",error);
      if(sourceSearchStatus)sourceSearchStatus.textContent="Không tải được danh sách nguồn";
    }

    setTimeout(()=>{
      if(sourcesSheet.hidden)return;
      pinSourceManagerTop();
      const parent=sourceDiscoveryParentForGroup(sourceManageGroup);
      if(!parent)return;
      void localEngine(12000)
        .then(local=>discoverSourcesForParent(parent,local))
        .catch(()=>{});
    },120);
  });

  setTimeout(()=>{
    pinSourceManagerTop();
    sourceSearch?.blur();
  },80);
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
  sourcePreviewSourceId="";
  sourcePreviewSourceRow=null;
  if(sourcesSheet)delete sourcesSheet.dataset.previewOpen;
  setSourceManageMode(false,{render:false});
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
  // Bind the open action before doing any source-state calculations.
  // Even if old local data is malformed, the manager must still open.
  sourcesBtn?.addEventListener("click",()=>{
    resetHomeViewportInstant({resetSource:true});
    document.documentElement.classList.remove("home-header-hidden");
    requestSettingsAccess(()=>{
      resetHomeViewportInstant({resetSource:true});
      openSourceLibrary();
    });
  });
  closeSourcesSheet?.addEventListener("click",closeSourceLibrary);

  try{
    updateSourceSummary();
  }catch(error){
    console.error("source manager init failed",error);
  }
  backSourcePreview?.addEventListener("click",closeSourcePreview);
  closeSourceVideoPopup?.addEventListener("click",closeSourceVideo);
  sourcePreviewSelect?.addEventListener("click",choosePreviewSource);
  sourcePreviewSearch?.addEventListener("input",schedulePreviewVideoSearch);
  sourceSettingsBtn?.addEventListener("click",()=>{
    if(sourceManageMode){
      setSourceManageMode(false);
      return;
    }
    requestSettingsAccess(()=>setSourceManageMode(true));
  });

  sourceGroupTabs?.addEventListener("click",event=>{
    const button=event.target.closest("[data-source-group]");
    if(!button)return;

    // A source-group change is a fresh view: never preserve the old scroll.
    if(sourceList)sourceList.scrollTop=0;
    if(sourceBrowse)sourceBrowse.scrollTop=0;
    if(sourcePreviewList)sourcePreviewList.scrollTop=0;

    sourceManageGroup=button.dataset.sourceGroup||GENERAL_SOURCE_SCOPE;
    sourceBlockedExpanded=false;
    resetSourcePreviewPane();
    refreshSourceManager();

    requestAnimationFrame(()=>{
      if(sourceList)sourceList.scrollTop=0;
      if(sourceBrowse)sourceBrowse.scrollTop=0;
      if(sourcePreviewList)sourcePreviewList.scrollTop=0;
      if(sourceGroupTabs){
        const active=sourceGroupTabs.querySelector(".source-group-chip.active");
        if(active)sourceGroupTabs.scrollLeft=Math.max(0,active.offsetLeft-6);
      }
    });

    {
      const groupAtClick=sourceManageGroup;
      setTimeout(()=>{
        if(sourcesSheet.hidden||sourceManageGroup!==groupAtClick)return;
        const parent=sourceDiscoveryParentForGroup(groupAtClick);
        if(!parent)return;
        void localEngine(12000)
          .then(local=>discoverSourcesForParent(parent,local))
          .catch(()=>{});
      },120);
    }
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

  sourceSearch?.addEventListener("input",()=>{
    if(sourceBrowse)sourceBrowse.scrollTop=0;
    if(sourceList)sourceList.scrollTop=0;
    scheduleSourceSearch();
    requestAnimationFrame(()=>{
      if(sourceBrowse)sourceBrowse.scrollTop=0;
      if(sourceList)sourceList.scrollTop=0;
    });
  });
  clearSourceSearch?.addEventListener("click",()=>{
    sourceSearch.value="";
    if(sourceBrowse)sourceBrowse.scrollTop=0;
    if(sourceList)sourceList.scrollTop=0;
    scheduleSourceSearch();
    try{sourceSearch.focus({preventScroll:true});}catch{sourceSearch.focus();}
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
      const current=sourceStatus(id,sourceManageGroup);
      setSourceStatus(id,current===next?"normal":next,sourceManageGroup);
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
      const cached=sourceMetaCache.get(id)||null;
      const hint=
        sourceRemoteResults.find(item=>item.id===id)||
        managedChannelLibrary().find(item=>item.id===id)||
        (cached?{id,...cached}:null);
      void openSourcePreview(id,hint);
    }
  });

  sourcePreviewList?.addEventListener("click",event=>{
    const openSourceButton=event.target.closest("[data-source-open-channel]");
    if(openSourceButton){
      const videoId=openSourceButton.dataset.sourceVideoRef||"";
      const row=sourcePreviewSearchRows.get(videoId);
      if(row)void openSourceFromSearchVideo(row);
      return;
    }

    const button=event.target.closest("[data-source-video-id]");
    if(!button)return;
    const id=button.dataset.sourceVideoId||"";
    const row=sourcePreviewSearchRows.get(id)||sourcePreviewRows.get(id);
    if(!id||!row)return;

    // Preview inside Quản lý nguồn itself. Do not touch the main player:
    // this avoids player/floating-mode conflicts while evaluating a channel.
    sourcePreviewList.querySelectorAll(".source-video-row.playing").forEach(el=>el.classList.remove("playing"));
    button.classList.add("playing");
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

const pipAspectPrimeCache=new Map();

function validPipAspect(value){
  const ratio=Number(value)||0;
  return Number.isFinite(ratio)&&ratio>=.34&&ratio<=2.6?ratio:0;
}

function cachedPipAspect(id){
  const entry=pipAspectPrimeCache.get(String(id||"").trim());
  return validPipAspect(entry?.value);
}

function primePipAspect(id){
  id=String(id||"").trim();
  if(!id)return Promise.resolve(0);

  const cached=pipAspectPrimeCache.get(id);
  if(cached){
    if(cached.value)return Promise.resolve(cached.value);
    if(cached.promise)return cached.promise;
  }

  const task=localEngine(5000)
    .then(local=>{
      if(typeof local?.videoAspect!=="function")return 0;
      return local.videoAspect(id);
    })
    .then(dimensions=>{
      const ratio=validPipAspect(
        Number(dimensions?.aspectRatio)||
        (
          Number(dimensions?.width)>0&&Number(dimensions?.height)>0
            ?Number(dimensions.width)/Number(dimensions.height)
            :0
        )
      );
      if(ratio)pipAspectPrimeCache.set(id,{value:ratio,at:Date.now()});
      else pipAspectPrimeCache.delete(id);
      return ratio;
    })
    .catch(()=>{
      pipAspectPrimeCache.delete(id);
      return 0;
    });

  pipAspectPrimeCache.set(id,{promise:task,at:Date.now()});
  return task;
}

function syncFloatArtwork(frame=playerSection?.querySelector(".player-frame")){
  if(!frame)return;

  const id=String(state.currentId||"").trim();
  const meta=state.currentMeta||{};
  const raw=clean(
    meta.thumbnailUrl||
    meta.thumbnail||
    meta.image||
    (id?"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg":"")
  );

  if(!/^https?:\/\//i.test(raw)){
    frame.style.removeProperty("--pip-art");
    return;
  }

  const safe=raw
    .replace(/\\/g,"%5C")
    .replace(/"/g,"%22")
    .replace(/\n|\r/g,"");
  frame.style.setProperty("--pip-art",'url("'+safe+'")');
}

function updateFloatControlState(frame=playerSection?.querySelector(".player-frame")){
  if(!frame)return;
  syncFloatArtwork(frame);
  frame.classList.toggle("float-tucked",state.floatTucked);
  frame.classList.toggle("float-view-square",state.floatPreset==="square");
  frame.classList.toggle("float-view-portrait",state.floatPreset==="portrait");

  const rail=frame.querySelector(".float-mode-rail");
  rail?.querySelectorAll?.("[data-float-mode]").forEach(button=>{
    const mode=button.dataset.floatMode||"";
    const active=mode==="tuck"
      ?state.floatTucked
      :mode==="scale"
        ?false
        :!state.floatTucked&&state.floatPreset===mode;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });

  const tuckIcon=rail?.querySelector?.('[data-float-mode="tuck"] .float-mode-icon');
  if(tuckIcon)tuckIcon.textContent=state.floatDock==="left"?"‹":"›";

  const scaleButton=rail?.querySelector?.('[data-float-mode="scale"]');
  const scaleIcon=scaleButton?.querySelector?.(".float-mode-icon");
  const scaleValue=floatScaleValue();
  const scaleText=scaleValue===1.5?"1.5×":scaleValue+"×";
  if(scaleIcon)scaleIcon.textContent=scaleText;
  if(scaleButton)scaleButton.setAttribute("aria-label","Kích thước PiP "+scaleText+". Bấm để đổi 1×, 1.5×, 2×");

  frame.classList.toggle("float-scale-1",scaleValue===1);
  frame.classList.toggle("float-scale-15",scaleValue===1.5);
  frame.classList.toggle("float-scale-2",scaleValue===2);

  const edgeTab=frame.querySelector(".float-edge-tab");
  if(edgeTab){
    edgeTab.textContent="";
    edgeTab.setAttribute(
      "aria-label",
      state.floatDock==="left"?"Mở video từ mép trái":"Mở video từ mép phải"
    );
  }
}

function applyFloatPreset(frame=playerSection?.querySelector(".player-frame")){
  if(!frame||!frame.classList.contains("floating-iframe"))return;

  updateFloatControlState(frame);

  const ratio=
    state.floatPreset==="square"
      ?1
      :state.floatPreset==="portrait"
        ?9/16
        :(state.videoAspect||16/9);

  const size=scaledAutoFloatSize(frame,ratio);
  placeAutoFloatAtEdge(frame,size);
}
function setFloatPreset(mode){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame||!frame.classList.contains("floating-iframe"))return;

  if(mode==="tuck"){
    const rect=frame.getBoundingClientRect();
    state.floatBox={
      left:rect.left,
      top:rect.top,
      width:rect.width,
      height:rect.height
    };
    state.floatTucked=true;
    updateFloatControlState(frame);
    return;
  }

  // Aspect is automatic. No manual square/portrait mode is exposed.
  state.floatTucked=false;
  state.floatPreset="auto";
  state.floatUserSized=false;
  applyFloatPreset(frame);
}

function ensureFloatHandles(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame||frame.dataset.floatControlsReady==="2")return;

  // Remove the old invisible move/resize hit zones. They could overlap the
  // YouTube seek bar on Safari and made the player harder to control.
  frame.querySelectorAll(".float-dock-edge,.float-resize-zone,.float-mode-rail,.float-edge-tab").forEach(node=>node.remove());
  frame.dataset.floatControlsReady="2";

  const rail=document.createElement("div");
  rail.className="float-mode-rail";
  rail.setAttribute("role","toolbar");
  rail.setAttribute("aria-label","Kích thước video");

  const makeButton=(mode,icon,label)=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="float-mode-btn";
    button.dataset.floatMode=mode;
    button.setAttribute("aria-label",label);
    button.setAttribute("aria-pressed","false");

    const iconEl=document.createElement("span");
    iconEl.className="float-mode-icon";
    iconEl.setAttribute("aria-hidden","true");
    iconEl.textContent=icon;

    const labelEl=document.createElement("span");
    labelEl.className="float-mode-label";
    labelEl.textContent=label;

    button.append(iconEl,labelEl);
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      if(mode==="scale"){
        cycleFloatScale(frame);
        return;
      }
      setFloatPreset(mode);
    });
    return button;
  };

  rail.append(
    makeButton("scale","1×","Kích thước PiP 1×"),
    makeButton("tuck",state.floatDock==="left"?"‹":"›","Thu vào mép")
  );

  const edgeTab=document.createElement("button");
  edgeTab.type="button";
  edgeTab.className="float-edge-tab";
  edgeTab.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    state.floatTucked=false;
    applyFloatPreset(frame);
    updateFloatControlState(frame);
  });

  frame.append(rail,edgeTab);
  updateFloatControlState(frame);
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

  ratio=Number(ratio)||16/9;
  ratio=Math.max(.34,Math.min(2.6,ratio));

  // Portrait / Shorts: shrink the PiP width to the real content ratio so
  // there are no huge black side bars.
  if(ratio<.80){
    const maxHeight=Math.max(260,viewportH*(mobile?.60:.68));
    let height=Math.min(maxHeight,mobile?520:620);
    let width=height*ratio;
    const maxWidth=mobile
      ?Math.min(220,viewportW*.46)
      :Math.min(300,viewportW*.24);

    if(width>maxWidth){
      width=maxWidth;
      height=width/ratio;
    }

    const minWidth=mobile?118:140;
    if(width<minWidth){
      width=minWidth;
      height=Math.min(maxHeight,width/ratio);
    }
    return {width,height};
  }

  // Square-ish video: compact square-ish PiP.
  if(ratio<=1.20){
    const width=mobile
      ?Math.min(220,viewportW*.48)
      :Math.min(300,viewportW*.25);
    return {width,height:width/ratio};
  }

  // Landscape video: keep the existing compact horizontal PiP.
  let width=mobile
    ?Math.min(256,viewportW*.58)
    :Math.min(360,viewportW*.36);
  const maxHeight=Math.max(180,viewportH*(mobile?.52:.42));
  let height=width/ratio;

  if(height>maxHeight){
    height=maxHeight;
    width=height*ratio;
  }

  const minWidth=mobile?150:170;
  if(width<minWidth){
    width=minWidth;
    height=Math.min(maxHeight,width/ratio);
  }
  return {width,height};
}

function floatEdgeGap(){
  return window.innerWidth<=640?8:12;
}

function floatScaleValue(value=state.floatScale){
  return [1,1.5,2].includes(Number(value))?Number(value):1;
}

function scaledAutoFloatSize(frame,ratio=state.videoAspect||16/9){
  const base=autoFloatSize(frame,ratio);
  const scale=floatScaleValue();
  if(scale===1)return base;

  const gap=floatEdgeGap();
  const maxWidth=Math.max(120,window.innerWidth-gap*2);
  const maxHeight=Math.max(120,window.innerHeight-gap*2);
  let width=base.width*scale;
  let height=base.height*scale;
  const fit=Math.min(1,maxWidth/width,maxHeight/height);

  width*=fit;
  height*=fit;
  return {width,height};
}

function cycleFloatScale(frame=playerSection?.querySelector(".player-frame")){
  if(!frame||!frame.classList.contains("floating-iframe"))return;
  const steps=[1,1.5,2];
  const current=floatScaleValue();
  const index=steps.indexOf(current);
  state.floatScale=steps[(index+1)%steps.length];
  state.floatUserSized=false;
  applyAutoFloatAspect(frame,{force:true});
  updateFloatControlState(frame);
}

function placeAutoFloatAtEdge(frame,size){
  if(!frame)return;
  const gap=floatEdgeGap();
  const dockLeft=state.floatDock==="left";

  frame.style.width=size.width+"px";
  frame.style.height=size.height+"px";
  frame.style.aspectRatio="auto";
  frame.style.top="auto";
  frame.style.bottom=gap+"px";

  if(dockLeft){
    frame.style.left=gap+"px";
    frame.style.right="auto";
  }else{
    frame.style.left="auto";
    frame.style.right=gap+"px";
  }

  const left=dockLeft
    ?gap
    :Math.max(gap,window.innerWidth-size.width-gap);
  const top=Math.max(gap,window.innerHeight-size.height-gap);

  state.floatBox={
    left,
    top,
    bottom:gap,
    width:size.width,
    height:size.height
  };
}

function applyAutoFloatAspect(frame,{force=false}={}){
  if(!frame||!frame.classList.contains("floating-iframe"))return;
  if(state.floatUserSized&&!force)return;

  const ratio=state.videoAspect||16/9;
  const size=scaledAutoFloatSize(frame,ratio);
  placeAutoFloatAtEdge(frame,size);
}

function restoreFloatBox(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  frame.classList.toggle("dock-left",state.floatDock==="left");
  frame.classList.toggle("dock-right",state.floatDock!=="left");
  frame.classList.toggle("float-tucked",state.floatTucked);

  if(!state.floatUserSized){
    const ratio=state.videoAspect||16/9;
    const size=scaledAutoFloatSize(frame,ratio);
    placeAutoFloatAtEdge(frame,size);
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

function explicitVideoAspect(meta={}){
  const width=Number(meta?.videoWidth)||0;
  const height=Number(meta?.videoHeight)||0;
  let ratio=Number(meta?.aspectRatio)||0;

  if(width>0&&height>0)ratio=width/height;
  if(!Number.isFinite(ratio)||ratio<.34||ratio>2.6)return 0;
  return ratio;
}

let responsivePlayerRaf=0;

function responsivePlayerAspect(meta=state.currentMeta||{}){
  return explicitVideoAspect(meta)||
    validPipAspect(state.videoAspect)||
    16/9;
}

function applyResponsivePlayerFrame(meta=state.currentMeta||{}){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame||frame.classList.contains("floating-iframe"))return;

  // Use the video's measured/original ratio directly. Do not round it into
  // preset 16:9 / square / portrait boxes.
  let ratio=explicitVideoAspect(meta)||validPipAspect(state.videoAspect)||16/9;
  if(!Number.isFinite(ratio)||ratio<=0)ratio=16/9;

  frame.classList.remove(
    "watch-aspect-wide",
    "watch-aspect-square",
    "watch-aspect-portrait"
  );

  const aspectClass=
    ratio>=1.2
      ?"watch-aspect-wide"
      :ratio>=.8
        ?"watch-aspect-square"
        :"watch-aspect-portrait";
  frame.classList.add(aspectClass);
  frame.style.setProperty("--watch-video-aspect",String(ratio));

  const root=document.documentElement;
  root.classList.remove(
    "watch-video-wide",
    "watch-video-square",
    "watch-video-portrait"
  );

  if(root.classList.contains("watch-browse")){
    root.classList.add(
      aspectClass==="watch-aspect-wide"
        ?"watch-video-wide"
        :aspectClass==="watch-aspect-square"
          ?"watch-video-square"
          :"watch-video-portrait"
    );
  }

  if(!root.classList.contains("watch-browse")){
    frame.style.removeProperty("--watch-player-width");
    frame.style.removeProperty("--watch-player-height");
    return;
  }

  const viewportWidth=Math.max(
    280,
    Number(window.visualViewport?.width)||window.innerWidth||0
  );
  const viewportHeight=Math.max(
    320,
    Number(window.visualViewport?.height)||window.innerHeight||0
  );

  const mobile=window.innerWidth<=720;
  const desktop=window.innerWidth>=960;

  if(mobile){
    // Mobile watch has three fixed layers above the recommendation scroller.
    // Cap tall/square media to 46% of the visual viewport and publish the
    // REAL rendered stage height so the chips + scroll region start exactly
    // below the player on iOS Safari.
    const availableHeight=Math.max(140,viewportHeight*.46);
    const width=Math.min(viewportWidth,availableHeight*ratio);
    const height=width/ratio;

    frame.style.setProperty("--watch-player-width",Math.round(width)+"px");
    frame.style.setProperty("--watch-player-height",Math.round(height)+"px");
    root.style.setProperty("--watch-stage-w",Math.round(width)+"px");
    root.style.setProperty("--watch-stage-h",Math.round(height)+"px");
    root.style.setProperty("--watch-side-gap",Math.max(0,Math.round(viewportWidth-width))+"px");

    root.classList.remove("watch-tools-side","watch-tools-bottom");
    root.classList.add("watch-tools-bottom");
    return;
  }

  if(desktop){
    const sectionWidth=Math.max(
      320,
      playerSection?.getBoundingClientRect?.().width||viewportWidth*.42
    );
    const styles=getComputedStyle(root);
    const headerHeight=
      parseFloat(styles.getPropertyValue("--header-stack-h"))||100;
    const safeTop=
      parseFloat(styles.getPropertyValue("--safe-top"))||0;
    const maxHeight=Math.max(
      320,
      viewportHeight-headerHeight-safeTop-24
    );

    const width=Math.min(sectionWidth,maxHeight*ratio);
    const height=width/ratio;

    frame.style.setProperty("--watch-player-width",Math.round(width)+"px");
    frame.style.setProperty("--watch-player-height",Math.round(height)+"px");
    return;
  }

  frame.style.removeProperty("--watch-player-width");
  frame.style.removeProperty("--watch-player-height");
}

function queueResponsivePlayerFrame(){
  if(responsivePlayerRaf)return;
  responsivePlayerRaf=requestAnimationFrame(()=>{
    responsivePlayerRaf=0;
    applyResponsivePlayerFrame();
  });
}

function updateCurrentVideoAspect(meta=state.currentMeta||{}){
  const next=explicitVideoAspect(meta);
  if(!next)return;

  // width/height from the stream/native media or an explicit probe flag means
  // this is measured media shape rather than a card/thumbnail guess.
  const verified=
    (Number(meta?.videoWidth)>0&&Number(meta?.videoHeight)>0)||
    meta?._aspectVerified===true;

  // Once a real portrait stream has been found for the current video, never
  // let a later generic 16:9 metadata response undo it.
  if(
    state.videoAspectPortraitLocked &&
    state.videoAspect<.80 &&
    next>=.80
  )return;

  state.videoAspect=next;
  if(verified){
    state.videoAspectVerified=true;
    if(next<.80)state.videoAspectPortraitLocked=true;
  }

  state.floatPreset="auto";
  state.floatUserSized=false;

  applyResponsivePlayerFrame(meta);

  const frame=playerSection?.querySelector(".player-frame");
  if(frame?.classList.contains("floating-iframe")){
    state.floatBox={top:frame.getBoundingClientRect().top};
    applyAutoFloatAspect(frame,{force:true});
    updateFloatControlState(frame);
  }
}

function youtubeContentRect(player=state.player){
  const candidates=[
    player?.playerInfo?.videoContentRect,
    player?.videoContentRect,
    player?.playerInfo?.video_content_rect
  ];

  for(const rect of candidates){
    const width=Number(rect?.width)||0;
    const height=Number(rect?.height)||0;
    if(width<=0||height<=0)continue;

    const aspectRatio=width/height;
    if(!Number.isFinite(aspectRatio)||aspectRatio<.34||aspectRatio>2.6)continue;

    return {width,height,aspectRatio};
  }

  return null;
}

function syncAspectFromYoutubePlayer(player=state.player){
  if(!player||!state.currentId)return false;

  const rect=youtubeContentRect(player);
  if(!rect)return false;

  const meta={
    ...(state.currentMeta||{}),
    videoWidth:rect.width,
    videoHeight:rect.height,
    aspectRatio:rect.aspectRatio,
    _aspectVerified:true,
    _aspectSource:"iframe-content-rect"
  };

  state.currentMeta=meta;
  updateCurrentVideoAspect(meta);
  pipAspectPrimeCache.set(state.currentId,{value:rect.aspectRatio,at:Date.now()});
  return true;
}

function scheduleYoutubeContentAspect(player=state.player){
  const id=state.currentId;
  if(!id)return;

  const attempt=()=>{
    if(state.currentId!==id)return;
    syncAspectFromYoutubePlayer(player);
  };

  // videoContentRect is populated by YouTube after playback begins.
  attempt();
  setTimeout(attempt,90);
  setTimeout(attempt,260);
  setTimeout(attempt,700);
}

function finishFloatEntry(frame){
  if(!frame)return;
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>frame.classList.remove("float-entering"));
  });
}

let watchBrowseActive=false;
let watchBrowseRaf=0;
let watchBrowseMutating=false;

function watchBrowseViewportSupported(){
  const width=Math.max(0,window.innerWidth||document.documentElement.clientWidth||0);
  return width<=720||width>=960;
}

function cleanupFloatingForBrowse(){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;
  if(frame.classList.contains("floating-iframe")){
    frame.classList.remove(
      "floating-iframe","float-tucked","dock-left","dock-right",
      "float-view-square","float-view-portrait"
    );
    state.floatTucked=false;
    clearFloatBoxStyles();
    playerSection.style.removeProperty("min-height");
  }
}

function setWatchBrowseLayout(active){
  active=!!active;
  if(active===watchBrowseActive)return;

  watchBrowseMutating=true;

  // Switching browsing layout must never move the document scroll position.
  // First normalize any legacy floating-player state, then only toggle CSS.
  if(active)cleanupFloatingForBrowse();

  watchBrowseActive=active;
  document.documentElement.classList.toggle("watch-browse",active);
  applyResponsivePlayerFrame();

  if(active){
    // Enter watch mode at the top of its own recommendation scroller.
    // The search/player/source rows stay fixed by CSS.
    try{
      const scroller=document.scrollingElement||document.documentElement;
      if(scroller)scroller.scrollTop=0;
      document.documentElement.scrollTop=0;
      if(document.body)document.body.scrollTop=0;
      window.scrollTo(0,0);
    }catch{}
  }

  requestAnimationFrame(()=>{
    if(active&&feedSection){
      feedSection.scrollTop=0;
      feedSection.scrollLeft=0;
    }
    watchBrowseMutating=false;
    if(!active)queueFloatingIframe();
  });
}

function syncWatchBrowseLayout(){
  if(watchBrowseMutating)return;

  // Once a video is open, keep one stable watch+browse layout. Do not toggle
  // it from scroll position: changing the grid while scrolling makes Safari's
  // scrollbar jump and can repeatedly trigger reflow.
  const target=
    watchBrowseViewportSupported() &&
    !!state.currentId &&
    !playerSection?.hidden;

  if(target!==watchBrowseActive)setWatchBrowseLayout(target);
}

function queueWatchBrowseLayout(){
  if(watchBrowseRaf)return;
  watchBrowseRaf=requestAnimationFrame(()=>{
    watchBrowseRaf=0;
    syncWatchBrowseLayout();
  });
}

function setupWatchBrowseLayout(){
  let viewportResizeTimer=0;

  const syncViewportLayout=()=>{
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer=setTimeout(()=>{
      queueWatchBrowseLayout();
      queueResponsivePlayerFrame();
    },160);
  };

  window.addEventListener("resize",syncViewportLayout,{passive:true});
  window.addEventListener("orientationchange",()=>{
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer=setTimeout(()=>{
      queueWatchBrowseLayout();
      queueResponsivePlayerFrame();
    },80);
  },{passive:true});
  window.visualViewport?.addEventListener?.("resize",syncViewportLayout,{passive:true});
  queueWatchBrowseLayout();
  queueResponsivePlayerFrame();
}

function watchFeedCards(){
  return [...feed.querySelectorAll(":scope > [data-video-id]")];
}

function syncWatchCurrentCard({scroll=false}={}){
  const cards=watchFeedCards();
  let currentCard=null;

  for(const card of cards){
    const current=(card.dataset.videoId||"")===state.currentId;
    card.classList.toggle("is-current-video",current);
    if(current)currentCard=card;
  }

  const rail=playerSection?.querySelector(".watch-nav-rail");
  const prev=rail?.querySelector('[data-watch-nav="prev"]');
  const next=rail?.querySelector('[data-watch-nav="next"]');
  const currentIndex=currentCard?cards.indexOf(currentCard):-1;

  if(prev)prev.disabled=!cards.length||currentIndex===0;
  if(next)next.disabled=!cards.length||currentIndex===cards.length-1;

  if(scroll&&currentCard&&feed.scrollWidth>feed.clientWidth){
    const left=Math.max(
      0,
      currentCard.offsetLeft-(feed.clientWidth-currentCard.clientWidth)/2
    );
    feed.scrollTo({left,behavior:"smooth"});
  }
}

let watchRecoInfoTimer=0;

function ensureWatchRecoInfo(){
  let info=document.querySelector(".watch-reco-info");
  if(info)return info;

  info=document.createElement("div");
  info.className="watch-reco-info";
  info.hidden=true;
  info.innerHTML=
    '<div class="watch-reco-title"></div>'+
    '<div class="watch-reco-meta"></div>';
  document.body.appendChild(info);
  return info;
}

function showWatchRecoInfo(card,{autoHide=true}={}){
  if(!card||window.innerWidth>720)return;
  const info=ensureWatchRecoInfo();
  const title=card.dataset.title||"Video";
  const channel=card.dataset.channel||"";
  const views=Number(card.dataset.views)||0;
  const viewText=card.dataset.viewText||"";
  const published=card.dataset.published||"";
  const bits=[];
  if(channel)bits.push(channel);
  if(viewText)bits.push(viewText);
  else if(views)bits.push(fmtViews(views)+" lượt xem");
  if(published)bits.push(published);

  info.querySelector(".watch-reco-title").textContent=title;
  info.querySelector(".watch-reco-meta").textContent=bits.join(" · ");
  info.hidden=false;
  info.classList.add("show");

  clearTimeout(watchRecoInfoTimer);
  if(autoHide){
    watchRecoInfoTimer=setTimeout(()=>{
      info.classList.remove("show");
      setTimeout(()=>{if(!info.classList.contains("show"))info.hidden=true;},180);
    },3200);
  }
}

function hideWatchRecoInfo(){
  clearTimeout(watchRecoInfoTimer);
  const info=document.querySelector(".watch-reco-info");
  if(!info)return;
  info.classList.remove("show");
  setTimeout(()=>{if(!info.classList.contains("show"))info.hidden=true;},180);
}

function navigateWatchVideo(direction=1){
  const cards=watchFeedCards();
  if(!cards.length)return;

  let index=cards.findIndex(card=>(card.dataset.videoId||"")===state.currentId);
  if(index<0)index=direction>0?-1:cards.length;

  const targetIndex=index+(direction>0?1:-1);
  if(targetIndex<0||targetIndex>=cards.length)return;

  const card=cards[targetIndex];
  const id=card.dataset.videoId||"";
  if(!id)return;

  void primePipAspect(id);
  setSeriesContextFromCard(card);
  showWatchRecoInfo(card,{autoHide:true});
  playVideo(id,rowFromCard(card));
}

function watchActiveCategoryLabel(){
  const active=topicChips?.querySelector(".topic-chip.active");
  return clean(active?.textContent)||"Danh mục";
}

function syncWatchUtilityState(){
  const rail=playerSection?.querySelector(".watch-nav-rail");
  if(!rail)return;
  const label=rail.querySelector(".watch-category-label");
  if(label)label.textContent=watchActiveCategoryLabel();
}

function ensureWatchNavRail(){
  // Mobile watch v201: the extra floating search/grid/up/down toolbar is gone.
  // Remove a stale toolbar left in the DOM by an older cached bundle as well.
  playerSection?.querySelectorAll(".watch-nav-rail").forEach(el=>el.remove());
  document.querySelectorAll("body > .watch-reco-info").forEach(el=>el.remove());
  return;
}
function applyFloatingIframe(force){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;
  if(isPlayerFullscreen())return;

  const floating=frame.classList.contains("floating-iframe");

  if(document.documentElement.classList.contains("watch-browse")){
    cleanupFloatingForBrowse();
    return;
  }

  if(
    force===false ||
    !["iframe","native"].includes(state.engine) ||
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
  if(shouldFloat===floating){
    if(floating&&state.floatPreset!=="auto"){
      applyFloatPreset(frame);
    }else if(floating&&state.floatPreset==="auto"){
      const box=frame.getBoundingClientRect();
      const boxRatio=box.width>0&&box.height>0?box.width/box.height:0;
      const target=Number(state.videoAspect)||16/9;
      if(!boxRatio||Math.abs(boxRatio-target)>.045){
        applyAutoFloatAspect(frame,{force:true});
      }
    }
    return;
  }

  if(shouldFloat){
    playerSection.style.minHeight=Math.max(1,Math.round(frame.getBoundingClientRect().height))+"px";

    // Avoid the visible full-width -> PiP shrink. Pre-size to the FINAL PiP
    // box while transitions are disabled, then switch to fixed positioning.
    frame.classList.add("float-entering");
    const entryRatio=state.videoAspect||16/9;
    const entrySize=scaledAutoFloatSize(frame,entryRatio);
    placeAutoFloatAtEdge(frame,entrySize);

    frame.classList.add("floating-iframe");
    updateFloatingAmbient(frame);
    ensureFloatHandles();

    if(state.floatPreset==="auto"){
      restoreFloatBox();

      requestAnimationFrame(()=>{
        // We are now operating on the PiP state, not the inline state.
        syncAspectFromYoutubePlayer(state.player);
        applyAutoFloatAspect(frame,{force:true});
      });
    }else{
      applyFloatPreset(frame);
    }

    finishFloatEntry(frame);
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
    frame.classList.remove("floating-iframe","float-tucked","dock-left","dock-right","float-view-square","float-view-portrait");
    state.floatTucked=false;
    clearFloatBoxStyles();
    playerSection.style.removeProperty("min-height");
  }
}

function getFullscreenElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||null;
}

function isPlayerFullscreen(){
  const fullscreenElement=getFullscreenElement();
  if(!fullscreenElement)return false;
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return false;
  return fullscreenElement===frame||frame.contains(fullscreenElement);
}

function queueFloatingIframe(){
  const frame=playerSection?.querySelector(".player-frame");
  if(isPlayerFullscreen())return;
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
  // Safari is deliberately user-controlled here. Auto-resume after a page/
  // fullscreen lifecycle transition can cancel timeline seeking.
  const ua=navigator.userAgent||"";
  const safari=/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android/i.test(ua);
  if(safari)return;
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
    state.fullscreenActive ||
    Date.now()<state.fullscreenExitCooldownUntil ||
    state.mode!=="video" ||
    !state.currentId ||
    !state.intentPlay ||
    MediaCore.modeUsesAudio(state.mode)
  )return;

  state.resumeOnReturn=false;
  state.transitionUntil=Date.now()+1400;
  clearTimeout(state.resumeTimer);

  const attempt=()=>{
    if(
      state.fullscreenActive ||
      Date.now()<state.fullscreenExitCooldownUntil ||
      state.mode!=="video" ||
      !state.currentId ||
      !state.intentPlay
    )return;
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
  const frame=()=>playerSection?.querySelector(".player-frame");

  const remember=()=>{
    state.fullscreenActive=true;
    state.fullscreenScrollY=window.scrollY;
    state.resumeOnReturn=false;
    state.transitionUntil=0;
    clearTimeout(state.resumeTimer);
    frame()?.classList.add("fullscreen-active");
  };

  const restoreVisual=()=>{
    const y=state.fullscreenScrollY;
    requestAnimationFrame(()=>{
      if(y!==null&&y!==undefined)window.scrollTo({top:y,left:0,behavior:"instant"});
      applyFloatingIframe();
    });
  };

  const restoreFullscreen=()=>{
    state.fullscreenActive=false;
    // Give Safari time to finish handing the media controls back to the page.
    // Do not call playVideo/playVideoById here: it can cancel a seek gesture.
    state.fullscreenExitCooldownUntil=Date.now()+1800;
    state.resumeOnReturn=false;
    state.transitionUntil=0;
    clearTimeout(state.resumeTimer);
    frame()?.classList.remove("fullscreen-active");
    restoreVisual();
  };

  const syncFullscreenState=()=>{
    if(isPlayerFullscreen())remember();
    else if(state.fullscreenActive)restoreFullscreen();
  };

  document.addEventListener("fullscreenchange",syncFullscreenState);
  document.addEventListener("webkitfullscreenchange",syncFullscreenState);

  nativePlayer?.addEventListener?.("webkitbeginfullscreen",remember);
  nativePlayer?.addEventListener?.("webkitendfullscreen",restoreFullscreen);

  window.addEventListener("pagehide",()=>{
    if(state.fullscreenActive)return;
    markPlaybackTransition();
  },{passive:true});

  window.addEventListener("pageshow",()=>{
    restoreVisual();
    // Only lifecycle-resume outside the Safari fullscreen cooldown.
    if(
      state.resumeOnReturn &&
      !state.fullscreenActive &&
      Date.now()>=state.fullscreenExitCooldownUntil &&
      Date.now()<state.transitionUntil
    ){
      setTimeout(resumeVideoAfterReturn,120);
    }
  },{passive:true});
}
function nativeFallbackUrl(id){
  if(!/^[A-Za-z0-9_-]{11}$/.test(String(id||"")))return "";
  const url=new URL("/video",MEDIA_SERVICE);
  url.searchParams.set("id",String(id));
  return url.toString();
}

function fallbackIframeVideoToNative(id,errorCode=0){
  id=String(id||"").trim();
  if(!id||id!==state.currentId)return false;

  const url=nativeFallbackUrl(id);
  if(!url)return false;

  // Avoid duplicate retries from repeated iframe error callbacks.
  if(state.engine==="native"&&state.nativeSource===url)return true;

  const resumeAt=getVideoTime();

  try{state.player?.pauseVideo?.();}catch{}
  state.nativeSource=url;
  state.mode="video";
  state.intentPlay=true;

  showNativePlayer();
  nativePlayer.controls=true;
  nativePlayer.playsInline=true;
  nativePlayer.setAttribute("playsinline","");
  nativePlayer.setAttribute("webkit-playsinline","");
  nativePlayer.preload="auto";
  nativePlayer.src=url;

  const targetId=id;
  const sourceUrl=url;

  const onLoaded=()=>{
    if(state.currentId!==targetId||state.nativeSource!==sourceUrl)return;
    if(resumeAt>0){
      try{nativePlayer.currentTime=resumeAt}catch{}
    }
    void nativePlayer.play().catch(()=>{});
    applyFloatingIframe();
  };

  const onPlaying=()=>{
    if(state.currentId!==targetId||state.nativeSource!==sourceUrl)return;
    statusText.textContent="Video đang phát";
  };

  const onFailure=()=>{
    if(state.currentId!==targetId||state.nativeSource!==sourceUrl)return;
    statusText.textContent="Video này hiện chưa lấy được nguồn phát";
    console.warn("1988 native video fallback failed",{id:targetId,errorCode});
  };

  nativePlayer.addEventListener("loadedmetadata",onLoaded,{once:true});
  nativePlayer.addEventListener("playing",onPlaying,{once:true});
  nativePlayer.addEventListener("error",onFailure,{once:true});

  try{
    nativePlayer.load();
    void nativePlayer.play().catch(()=>{});
  }catch{}

  statusText.textContent="Đang mở nguồn video dự phòng…";
  return true;
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
  if(suggestions){
    suggestions.hidden=true;
    suggestions.innerHTML="";
  }
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }
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
      syncWatchUtilityState();
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

function parseDurationValue(value){
  if(value==null||value==="")return 0;
  if(typeof value==="number"&&Number.isFinite(value))return Math.max(0,value);

  const raw=String(value).trim();
  if(!raw)return 0;
  if(/^\d+(?:\.\d+)?$/.test(raw))return Math.max(0,Number(raw)||0);

  if(/^\d{1,3}:\d{1,2}(?::\d{1,2})?$/.test(raw)){
    const parts=raw.split(":").map(Number);
    if(parts.length===2)return Math.max(0,parts[0]*60+parts[1]);
    if(parts.length===3)return Math.max(0,parts[0]*3600+parts[1]*60+parts[2]);
  }

  const iso=raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if(iso)return Math.max(0,(Number(iso[1])||0)*3600+(Number(iso[2])||0)*60+(Number(iso[3])||0));

  const human=raw.match(/^(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/i);
  if(human&&(human[1]||human[2]||human[3])){
    return Math.max(0,(Number(human[1])||0)*3600+(Number(human[2])||0)*60+(Number(human[3])||0));
  }
  return 0;
}

function durationSeconds(row={}){
  const values=[
    row?.duration,
    row?.durationSeconds,
    row?.lengthSeconds,
    row?.length,
    row?.videoDuration,
    row?.durationText,
    row?.contentDetails?.duration
  ];
  for(const value of values){
    const seconds=parseDurationValue(value);
    if(seconds>0)return seconds;
  }
  return 0;
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
  if(!group)return [];
  return selectedSources(group);
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
    case GENERAL_SOURCE_SCOPE:
      return true;
    default:
      return false;
  }
}

function locallyTrustedForParent(parent,row={}){
  const group=parentSourceGroup(parent);
  if(isBlockedSourceRow(row,group))return false;
  if(row?._selectedCategorySource===true)return true;
  const source=librarySourceForVideo(row);
  if(source&&group&&sourceGroupsFor(source).includes(group))return true;
  return rowMatchesParentRule(parent,row);
}

function splitLocalCategoryRows(parent,rows=[]){
  const trusted=[];
  const ambiguous=[];
  const group=parentSourceGroup(parent);
  for(const row of rows){
    if(isBlockedSourceRow(row,group))continue;
    (locallyTrustedForParent(parent,row)?trusted:ambiguous).push(row);
  }
  return {trusted,ambiguous};
}

function filterRowsForAiParent(parent,rows=[]){
  const group=parentSourceGroup(parent);
  const base=rows.filter(row=>!isBlockedSourceRow(row,group));
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
      _displaySource:"",
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
    const titleEl=card.querySelector(".card-title");
    if(title&&titleEl){
      titleEl.textContent=title;
      card.dataset.title=title;
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
  const feedFilterMode=!state.activeParent&&isSourceScopedFeed(state.activeFeed);
  if((!state.activeParent&&!feedFilterMode)||!state.trendTopics.length){
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

const SOURCE_LEARNING_STOPWORDS=new Set([
  "official","channel","kenh","kênh","tv","media","studio","network","vietnam",
  "viet","việt","nam","vn","hd","youtube","page","online",
  "video","clip","shorts","short","moi","mới","nhat","nhất","hom","hôm","nay",
  "truc","tiếp","trực","live","tap","tập","phan","phần","so","số","full","review",
  "va","và","cua","của","cho","voi","với","tai","tại","tu","từ","la","là","co","có",
  "mot","một","nhung","những","cac","các","nay","này","do","đó","de","để","khi","sau",
  "the","thế","nao","nào","duoc","được","dang","đang","se","sẽ","tren","trên","duoi","dưới",
  "this","that","with","from","into","your","the","and","for","new","best","why","how"
]);

const SOURCE_CONTENT_LEARNING_TTL=25*60*1000;
const SOURCE_CONTENT_LEARNING_MAX_SOURCES=12;
const SOURCE_CONTENT_LEARNING_MAX_ROWS=120;
const SOURCE_CONTENT_LEARNING_KEY_PREFIX="1988-source-learning-v2:";
const sourceContentLearningMemory=new Map();

function sourceLearningNames(scope,status="selected"){
  scope=sourceScope(scope);
  const ids=status==="blocked"?blockedSetForScope(scope):selectedSetForScope(scope);
  const names=[];
  for(const id of ids){
    const meta=sourceMetaCache.get(id)||{};
    const stored=libraryRow(id)||{};
    const name=clean(meta.name||stored.name||"");
    if(name)names.push(name);
  }
  return [...new Set(names)].slice(0,24);
}

function learningSignature(scope){
  return sourceSignature(scope)+"|blocked:"+[...blockedSetForScope(scope)].sort().join("|");
}

function readSourceContentLearning(scope){
  scope=sourceScope(scope);
  const signature=learningSignature(scope);
  const memory=sourceContentLearningMemory.get(scope);
  if(memory&&memory.signature===signature&&Date.now()-Number(memory.at||0)<SOURCE_CONTENT_LEARNING_TTL)return memory;
  try{
    const row=JSON.parse(localStorage.getItem(SOURCE_CONTENT_LEARNING_KEY_PREFIX+scope)||"null");
    if(row&&row.signature===signature&&Array.isArray(row.terms)&&Date.now()-Number(row.at||0)<SOURCE_CONTENT_LEARNING_TTL){
      sourceContentLearningMemory.set(scope,row);
      return row;
    }
  }catch{}
  return null;
}

function saveSourceContentLearning(scope,row={}){
  scope=sourceScope(scope);
  const payload={
    signature:learningSignature(scope),
    at:Date.now(),
    terms:Array.isArray(row.terms)?row.terms.slice(0,12):[],
    hashtags:Array.isArray(row.hashtags)?row.hashtags.slice(0,12):[],
    rows:Number(row.rows)||0,
    sources:Number(row.sources)||0
  };
  sourceContentLearningMemory.set(scope,payload);
  try{localStorage.setItem(SOURCE_CONTENT_LEARNING_KEY_PREFIX+scope,JSON.stringify(payload));}catch{}
  return payload;
}

function clearSourceContentLearning(scope){
  scope=sourceScope(scope);
  sourceContentLearningMemory.delete(scope);
  try{localStorage.removeItem(SOURCE_CONTENT_LEARNING_KEY_PREFIX+scope);}catch{}
}

function learningTokenize(value=""){
  return clean(value)
    .replace(/#[\p{L}\p{N}_-]+/gu," ")
    .replace(/[|/\\()[\]{}:_·•—–,+!?."'“”‘’]+/g," ")
    .replace(/\s+/g," ")
    .trim()
    .split(" ")
    .map(token=>clean(token))
    .filter(Boolean);
}

function extractSourceContentTerms(parent={},rows=[]){
  const group=parentSourceGroup(parent);
  const score=new Map();
  const channelsByTerm=new Map();
  const hashtagScore=new Map();
  const blockedNames=sourceLearningNames(group,"blocked").map(normalizeSearchText);
  const blockedTokens=new Set(blockedNames.flatMap(name=>name.split(" ").filter(token=>token.length>=3)));
  const items=newestFirst(Array.isArray(rows)?rows:[])
    .filter(row=>!isBlockedSourceRow(row,group))
    .slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS);

  const addTerm=(phrase,weight,channel)=>{
    const key=normalizeSearchText(phrase);
    if(!key||key.length<3)return;
    const words=key.split(" ").filter(Boolean);
    if(!words.length)return;
    if(words.every(word=>SOURCE_LEARNING_STOPWORDS.has(word)||blockedTokens.has(word)))return;
    if(words.some(word=>/^\d+$/.test(word)&&words.length===1))return;
    score.set(phrase,(score.get(phrase)||0)+weight);
    if(!channelsByTerm.has(phrase))channelsByTerm.set(phrase,new Set());
    if(channel)channelsByTerm.get(phrase).add(channel);
  };

  for(const row of items){
    const title=clean(row?._displayTitle||row?.title||"");
    if(!title)continue;
    const sourceId=String(row?._sourceId||row?.channelId||row?.uploaderId||row?.uploader||"");
    const age=publishedAgeMs(row);
    const recencyWeight=age<DAY_MS?3:age<3*DAY_MS?2.2:age<7*DAY_MS?1.5:1;
    const views=Math.max(0,Number(row?.views)||0);
    const viewWeight=Math.min(1.7,1+Math.log10(views+10)/12);
    const weight=recencyWeight*viewWeight;

    const hashtags=[...title.matchAll(/#([\p{L}\p{N}_-]{2,48})/gu)]
      .map(match=>clean(match[1]).replace(/_/g," "))
      .filter(Boolean);
    for(const tag of hashtags){
      const key=normalizeSearchText(tag);
      if(!key||SOURCE_LEARNING_STOPWORDS.has(key))continue;
      hashtagScore.set(tag,(hashtagScore.get(tag)||0)+weight*3.2);
      addTerm(tag,weight*3.2,sourceId);
    }

    const tokens=learningTokenize(title).filter(token=>{
      const key=normalizeSearchText(token);
      return key.length>=2&&!SOURCE_LEARNING_STOPWORDS.has(key)&&!/^\d+$/.test(key);
    });

    const uniquePhrases=new Set();
    for(let size=1;size<=Math.min(3,tokens.length);size++){
      for(let i=0;i+size<=tokens.length;i++){
        const phrase=tokens.slice(i,i+size).join(" ");
        const key=normalizeSearchText(phrase);
        if(!key||key.length<3)continue;
        if(size===1&&key.length<4)continue;
        uniquePhrases.add(phrase);
      }
    }
    for(const phrase of uniquePhrases)addTerm(phrase,weight,sourceId);
  }

  const baseText=normalizeSearchText((Array.isArray(parent?.queries)?parent.queries:[]).join(" ")+" "+clean(parent?.label||""));
  const ranked=[...score.entries()]
    .map(([phrase,value])=>{
      const channelCount=channelsByTerm.get(phrase)?.size||0;
      const key=normalizeSearchText(phrase);
      const words=key.split(" ").filter(Boolean);
      const crossSourceBoost=1+Math.min(3,Math.max(0,channelCount-1))*0.8;
      const phraseBoost=1+Math.min(2,Math.max(0,words.length-1))*0.35;
      const baseBoost=baseText.includes(key)?1.18:1;
      return [phrase,value*crossSourceBoost*phraseBoost*baseBoost,channelCount];
    })
    .filter(([phrase,value])=>value>1.2&&normalizeSearchText(phrase)!==normalizeSearchText(parent?.label||""))
    .sort((a,b)=>b[1]-a[1]||b[2]-a[2]||b[0].length-a[0].length);

  const terms=[];
  for(const [phrase] of ranked){
    const normalized=normalizeSearchText(phrase);
    if(terms.some(item=>{
      const current=normalizeSearchText(item);
      return current===normalized||
        (current.includes(normalized)&&normalized.split(" ").length===1)||
        (normalized.includes(current)&&current.split(" ").length===1);
    }))continue;
    terms.push(phrase);
    if(terms.length>=10)break;
  }

  const hashtags=[...hashtagScore.entries()]
    .sort((a,b)=>b[1]-a[1])
    .map(([tag])=>tag)
    .filter(tag=>!terms.some(term=>normalizeSearchText(term)===normalizeSearchText(tag)))
    .slice(0,8);

  const sources=new Set(items.map(row=>String(row?._sourceId||row?.channelId||row?.uploaderId||"")).filter(Boolean)).size;
  return {terms,hashtags,rows:items.length,sources};
}

async function selectedLearningRows(parent={},local){
  const group=parentSourceGroup(parent);
  const sources=(group===GENERAL_SOURCE_SCOPE?selectedSources():selectedSourcesForParent(parent))
    .slice(0,SOURCE_CONTENT_LEARNING_MAX_SOURCES);
  if(!sources.length)return [];

  const selectedIds=new Set(sources.map(source=>source.id));
  let cached=[];
  if(group===GENERAL_SOURCE_SCOPE){
    cached=readSourcePoolCache().filter(row=>
      selectedIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||""))&&uploadedWithinCategoryWindow(row)
    );
  }else{
    const parentRows=categoryCacheRows(parent.key);
    cached=parentRows.filter(row=>
      selectedIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||""))&&uploadedWithinCategoryWindow(row)
    );
  }
  if(cached.length>=Math.min(20,sources.length*3))return cached;

  try{
    const fresh=await fetchSourcePool(local,sources,true,group);
    return dedupeHashedRows(
      newestFirst((Array.isArray(fresh)?fresh:[])
        .filter(uploadedWithinCategoryWindow)
        .filter(row=>!isBlockedSourceRow(row,group)))
    ).slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS);
  }catch{
    return cached;
  }
}

async function ensureSourceContentLearning(parent={},local){
  const group=parentSourceGroup(parent);
  if(!group)return {terms:[],hashtags:[],rows:0,sources:0};
  const saved=readSourceContentLearning(group);
  if(saved)return saved;
  const rows=await selectedLearningRows(parent,local);
  return saveSourceContentLearning(group,extractSourceContentTerms(parent,rows));
}

function sourceLearningProfile(parent={}){
  const group=parentSourceGroup(parent);
  if(!group)return {selectedSourceNames:[],blockedSourceNames:[],learnedQueries:[]};
  const content=readSourceContentLearning(group);
  return {
    selectedSourceNames:sourceLearningNames(group,"selected"),
    blockedSourceNames:sourceLearningNames(group,"blocked"),
    learnedQueries:[...(content?.hashtags||[]),...(content?.terms||[])].slice(0,8)
  };
}

async function adaptiveSourceQueries(parent={},local){
  const group=parentSourceGroup(parent);
  const content=await ensureSourceContentLearning(parent,local);
  const learned=[...(content?.hashtags||[]),...(content?.terms||[])].filter(Boolean);

  if(group===GENERAL_SOURCE_SCOPE){
    const selectedNames=sourceLearningNames(GENERAL_SOURCE_SCOPE,"selected").slice(0,4);
    return [...new Set([...learned.slice(0,5),...selectedNames])].slice(0,6);
  }

  const base=(Array.isArray(parent?.queries)&&parent.queries.length?parent.queries:[parent?.label]).map(clean).filter(Boolean);
  const fallback=base.find(Boolean);
  return [...new Set([...learned.slice(0,5),...(fallback?[fallback]:[])])].slice(0,6);
}

async function classifyAiParent(parent,rows=[]){
  const input=topicInputRows(rows.slice(0,48));
  const learning=sourceLearningProfile(parent);
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
      selectedSourceNames:learning.selectedSourceNames,
      blockedSourceNames:learning.blockedSourceNames,
      learnedQueries:learning.learnedQueries,
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
const SOURCE_DISCOVERY_TARGET=48;
const SOURCE_DISCOVERY_MAX_PAGES=8;
const sourceDiscoveryAt=new Map();

function sourceAlreadyKnownForDiscovery(candidate,group){
  if(!candidate)return true;

  // First load the durable group state. Chặn is the blacklist and Chọn is
  // already saved, so neither one is a new AI discovery.
  const state=matchSourceState(candidate,group).status;
  if(state==="blocked"||state==="selected")return true;

  const suggested=temporarySetForScope(group);
  if(suggested.has(candidate.id))return true;

  const name=sourceRowName(candidate);
  if(name){
    for(const id of suggested){
      const row=sourceMetaCache.get(id)||{};
      if(sourceRowName({...row,id})===name)return true;
    }
  }
  return false;
}

async function collectNewSourceDiscoveryRows(parent,local,group){
  const queries=await adaptiveSourceQueries(parent,local);
  if(!queries.length)return {rows:[],exhausted:true};

  const representatives=new Map();
  let exhausted=false;

  for(let page=0;page<SOURCE_DISCOVERY_MAX_PAGES;page++){
    const batches=await Promise.all(
      queries.map((query,index)=>
        pagedSearch(
          local,
          "source-discovery:"+group+":"+index+":"+fastHash(query),
          query,
          {upload_date:"week",sort_by:"upload_date"},
          page===0,
          group
        ).catch(()=>[])
      )
    );

    if(!batches.some(rows=>Array.isArray(rows)&&rows.length)){
      exhausted=true;
      break;
    }

    for(const row of batches.flat()){
      if(!uploadedWithinCategoryWindow(row))continue;
      const candidate=sourceCandidateFromVideo(row);
      if(!candidate)continue;

      // Blocked and already-known channels do not consume the discovery quota.
      // Continue through later YouTube pages until the NEW-channel target is filled.
      if(sourceAlreadyKnownForDiscovery(candidate,group))continue;

      const key=candidate.id;
      if(!representatives.has(key)){
        representatives.set(key,{
          ...row,
          _sourceId:candidate.id,
          _sourceName:candidate.name
        });
      }
    }

    if(representatives.size>=SOURCE_DISCOVERY_TARGET)break;
  }

  return {
    rows:[...representatives.values()].slice(0,SOURCE_DISCOVERY_TARGET),
    exhausted
  };
}

async function classifySourceDiscovery(parent,rows=[]){
  const accepted=[];
  const source=Array.isArray(rows)?rows:[];
  const batchSize=24;

  for(let offset=0;offset<source.length;offset+=batchSize){
    const batch=source.slice(offset,offset+batchSize);
    if(!batch.length)continue;

    try{
      const classified=await classifyAiParent(parent,batch);
      const acceptedIds=classified?.acceptedVideoIds instanceof Set
        ?classified.acceptedVideoIds
        :new Set();
      if(acceptedIds.size){
        accepted.push(...batch.filter(row=>acceptedIds.has(itemVideoId(row))));
      }
    }catch(error){
      console.warn("source AI classify failed",parent?.label||parent?.key,error);
      accepted.push(...batch.filter(row=>rowMatchesParentRule(parent,row)));
    }
  }

  return accepted;
}

async function discoverSourcesForParent(parent,local){
  if(document.hidden)return;
  const group=parentSourceGroup(parent);
  if(!group)return;

  const last=Number(sourceDiscoveryAt.get(group)||0);
  if(Date.now()-last<SOURCE_DISCOVERY_TTL)return;

  try{
    const discovery=await collectNewSourceDiscoveryRows(parent,local,group);
    if(!discovery.rows.length){
      sourceDiscoveryAt.set(group,Date.now());
      return;
    }

    const accepted=await classifySourceDiscovery(parent,discovery.rows);
    if(accepted.length){
      rememberDiscoveredSources(accepted,group);
      if(sourceManageMode&&!sourcesSheet?.hidden)renderSourceLibrary();
    }

    sourceDiscoveryAt.set(group,Date.now());
  }catch(error){
    console.warn("source discovery failed",parent?.label||group,error);
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
  if(document.hidden)return;
  try{
    const group=parentSourceGroup(parent);
    let progressiveRows=categoryCacheRows(parent.key);
    const raw=await fetchSourcePool(local,sources,true,group,(batch)=>{
      const ready=dedupeHashedRows(
        newestFirst(
          batch
            .filter(uploadedWithinCategoryWindow)
            .filter(row=>!isBlockedSourceRow(row,group))
            .map(row=>({...row,_selectedCategorySource:true}))
        )
      );
      if(!ready.length)return;
      progressiveRows=dedupeHashedRows(newestFirst([...progressiveRows,...ready])).slice(0,90);
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:progressiveRows});
      if(
        seq===state.feedSeq &&
        state.activeParent===parent.key &&
        window.scrollY<120
      ){
        renderCards(aiDisplayRows(progressiveRows));
        feedStatus.textContent=progressiveRows.length+" video";
      }
    });
    const rows=dedupeHashedRows(
      newestFirst(
        (Array.isArray(raw)?raw:[])
          .filter(uploadedWithinCategoryWindow)
          .filter(row=>!isBlockedSourceRow(row,group))
          .map(row=>({...row,_selectedCategorySource:true}))
      )
    ).slice(0,90);

    if(!rows.length)return;

    state.aiCategoryRows.set(parent.key,{at:Date.now(),items:rows});
    saveSourceContentLearning(group,extractSourceContentTerms(parent,rows));

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
    const group=parentSourceGroup(parent);
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
    const instantCached=dedupeHashedRows(newestFirst([
      ...categoryCacheRows(parent.key),
      ...cachedRowsForSources(sources,group),
      ...readSourcePoolCache()
        .filter(row=>sourceIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||"")))
    ]))
      .filter(uploadedWithinCategoryWindow)
      .filter(row=>{
        const id=String(row?._sourceId||row?.channelId||row?.uploaderId||"");
        return sourceIds.has(id)&&!isBlockedSourceRow(row,group);
      })
      .map(row=>({...row,_selectedCategorySource:true}))
      .slice(0,90);

    if(instantCached.length){
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:instantCached});
      state.aiCategoryTopics.set(parent.key,[]);
      state.trendTopics=[];
      renderTrendTopics();

      if(state.activeParent===parent.key){
        renderCards(aiDisplayRows(instantCached));
        feedStatus.textContent=instantCached.length+" video";
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
    let progressiveRows=[];
    const raw=await fetchSourcePool(local,sources,true,group,(batch)=>{
      const ready=dedupeHashedRows(
        newestFirst(
          batch
            .filter(uploadedWithinCategoryWindow)
            .filter(row=>!isBlockedSourceRow(row,group))
            .map(row=>({...row,_selectedCategorySource:true}))
        )
      );
      if(!ready.length)return;
      progressiveRows=dedupeHashedRows(newestFirst([...progressiveRows,...ready])).slice(0,90);
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:progressiveRows});
      if(seq===state.feedSeq&&state.activeParent===parent.key){
        renderCards(aiDisplayRows(progressiveRows));
        feedStatus.textContent=progressiveRows.length+" video";
      }
    });
    let rows=dedupeHashedRows(
      newestFirst(
        (Array.isArray(raw)?raw:[])
          .filter(uploadedWithinCategoryWindow)
          .filter(row=>!isBlockedSourceRow(row,group))
          .map(row=>({...row,_selectedCategorySource:true}))
      )
    ).slice(0,90);

    state.aiCategoryRows.set(parent.key,{at:Date.now(),items:rows});
    saveSourceContentLearning(group,extractSourceContentTerms(parent,rows));
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

function sourceAwareRows(rows=[],query="",scope=GENERAL_SOURCE_SCOPE){
  rows=rows.filter(row=>!isBlockedSourceRow(row,scope));
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
  let sorted=rows;
  if(preset.weekFreshViewed)sorted=weekFreshViewedFirst(rows);
  else if(preset.mostViewed)sorted=mostViewedFirst(rows);
  else if(preset.newest)sorted=newestFirst(rows);
  return dedupeHashedRows(sorted);
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


function searchSourceId(row={}){
  return String(row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
}

function searchChannelName(row={}){
  return clean(row?._displaySource||row?.uploaderName||row?.uploader||row?.channelName||row?._sourceName||"");
}

function searchSourceKey(row={}){
  return searchSourceId(row)||normalizeSearchText(searchChannelName(row))||("video:"+itemVideoId(row));
}

function searchEpisodeNumber(title=""){
  const text=clean(title);
  const patterns=[
    /(?:^|[\s|_[({-])(?:tập|tap|ep(?:isode)?|hồi|hoi)\s*0*(\d{1,3})(?:\s*\/\s*\d{1,3})?(?=$|[\s|_\])}.,:-])/iu,
    /(?:^|[\s|_[({-])0*(\d{1,3})\s*\/\s*\d{1,3}(?=$|[\s|_\])}.,:-])/u
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    const value=Number(match?.[1])||0;
    if(value>0&&value<1000)return value;
  }
  return 0;
}

function stripEpisodeMarkers(value=""){
  return clean(value)
    .replace(/(?:^|[\s|_[({-])(?:tập|tap|ep(?:isode)?|hồi|hoi)\s*0*\d{1,3}(?:\s*\/\s*\d{1,3})?(?=$|[\s|_\])}.,:-])/giu," ")
    .replace(/(?:^|[\s|_[({-])0*\d{1,3}\s*\/\s*\d{1,3}(?=$|[\s|_\])}.,:-])/gu," ")
    .replace(/\s+/g," ")
    .trim();
}

function searchCoreTokens(value=""){
  return normalizeSearchText(stripEpisodeMarkers(value))
    .split(" ")
    .filter(token=>token.length>=2&&!/^\d+$/.test(token))
    .slice(0,10);
}

function searchTitleMatchesCore(row={},query=""){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  const tokens=searchCoreTokens(query);
  if(!title||!tokens.length)return false;
  const hits=tokens.filter(token=>title.includes(token)).length;
  return hits>=Math.max(2,Math.ceil(tokens.length*.55));
}

function searchFilmVariant(row={},query=""){
  const title=clean(row?._displayTitle||row?.title||"");
  const norm=normalizeSearchText(title);
  const year=norm.match(/\b((?:19|20)\d{2})\b/)?.[1]||"";
  const isNewVersion=/\btan\b/.test(norm)&&!/\btan\b/.test(normalizeSearchText(query));
  const source=searchSourceKey(row);
  return {
    key:source+"|"+year+"|"+(isNewVersion?"tan":""),
    year,
    isNewVersion
  };
}

function searchResultScore(row={},query="",scope=""){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  const q=normalizeSearchText(query);
  const tokens=searchCoreTokens(query);
  let score=0;
  if(q&&title.includes(q))score+=120;
  for(const token of tokens){
    if(title.includes(token))score+=12;
  }

  const wantedEpisode=searchEpisodeNumber(query);
  const episode=searchEpisodeNumber(row?._displayTitle||row?.title||"");
  if(wantedEpisode&&episode===wantedEpisode)score+=90;
  else if(wantedEpisode&&episode)score+=Math.max(0,25-Math.abs(episode-wantedEpisode)*5);

  const wantedYear=q.match(/\b((?:19|20)\d{2})\b/)?.[1]||"";
  if(wantedYear&&title.includes(wantedYear))score+=55;

  const id=searchSourceId(row);
  if(id&&selectedSetForScope(scope||GENERAL_SOURCE_SCOPE).has(id))score+=36;
  if(searchTitleMatchesCore(row,query))score+=30;

  const views=Math.max(0,Number(row?.views)||0);
  score+=Math.min(12,Math.log10(views+10)*2);
  return score;
}

function canonicalSearchSeed(query="",scope=""){
  let value=clean(query);
  const norm=normalizeSearchText(value);
  if(scope==="music"){
    if(/\bnoell+\b/.test(norm))value=value.replace(/\bnoell+\b/ig,"Noel");
    if(/^noell?$/i.test(value))value="Noel";
  }
  return clean(value);
}

const SEARCH_REFINEMENT_SUFFIXES={
  music:["không lời","guitar","piano","acoustic","remix","jazz","live","karaoke"],
  film:["full","tập 1","thuyết minh","lồng tiếng","vietsub","bản đầy đủ"],
  tech:["review","so sánh","trải nghiệm","hướng dẫn","mới nhất"],
  sports:["highlight","toàn trận","phân tích","trực tiếp","bàn thắng"],
  news:["mới nhất","toàn cảnh","phân tích","trực tiếp"],
  economy:["mới nhất","phân tích","thị trường","giá hôm nay"],
  law:["mới nhất","toàn cảnh","phân tích"],
  entertainment:["full show","phỏng vấn","hậu trường","highlight"],
  general:["mới nhất","trực tiếp","full"]
};

function searchRefinementQueries(query="",scope="",remote=[]){
  const canonical=canonicalSearchSeed(query,scope);
  const current=normalizeSearchText(query);
  const out=[];
  const push=(label,value)=>{
    value=clean(value);
    if(!value)return;
    const key=normalizeSearchText(value);
    if(!key||key===current||out.some(item=>normalizeSearchText(item.value)===key))return;
    out.push({label:clean(label)||value,value});
  };

  if(normalizeSearchText(canonical)!==current)push(canonical,canonical);

  const suffixes=SEARCH_REFINEMENT_SUFFIXES[scope]||SEARCH_REFINEMENT_SUFFIXES.general;
  for(const suffix of suffixes){
    if(normalizeSearchText(canonical).includes(normalizeSearchText(suffix)))continue;
    push(suffix,canonical+" "+suffix);
    if(out.length>=7)break;
  }

  for(const value of Array.isArray(remote)?remote:[]){
    push(clean(value),clean(value));
    if(out.length>=10)break;
  }
  return out;
}

function renderSearchRefinements(query="",scope="",rows=[],remote=[]){
  if(!searchRefinements)return;
  const items=searchRefinementQueries(query,scope,remote);
  if(!items.length){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
    return;
  }
  const label=scope==="music"?"Bạn muốn nghe:":rows.length?"Gợi ý tìm:":"Không thấy đúng ý, thử:";
  searchRefinements.innerHTML=
    '<span class="search-refine-label">'+esc(label)+'</span>'+
    items.map(item=>
      '<button type="button" data-search-refine="'+esc(item.value)+'">'+esc(item.label)+'</button>'
    ).join("");
  searchRefinements.hidden=false;
}

async function enrichSearchRefinements(query,scope,rows,seq){
  let remote=[];
  try{
    const response=await api("suggestions",{q:canonicalSearchSeed(query,scope)},4500);
    remote=Array.isArray(response?.data)?response.data:[];
  }catch{}
  if(seq!==state.searchSeq||state.searchQuery!==query)return;
  renderSearchRefinements(query,scope,rows,remote.slice(0,4));
}

function rowAspectRatio(row={}){
  let ratio=Number(row?.aspectRatio)||0;
  const videoW=Number(row?.videoWidth)||0;
  const videoH=Number(row?.videoHeight)||0;
  const thumbW=Number(row?.thumbnailWidth)||0;
  const thumbH=Number(row?.thumbnailHeight)||0;

  if(!ratio&&videoW>0&&videoH>0)ratio=videoW/videoH;
  if(!ratio&&thumbW>0&&thumbH>0)ratio=thumbW/thumbH;
  if(row?.isShort===true&&(!ratio||ratio>.85))ratio=9/16;

  return Number.isFinite(ratio)&&ratio>=.34&&ratio<=2.6?ratio:0;
}

function searchCardHtml(row={},options={}){
  const id=itemVideoId(row);
  if(!id)return "";
  const title=clean(row._displayTitle||row.title)||"Video";
  const channel=searchChannelName(row);
  const views=Number(row.views)||0;
  const viewText=clean(row.viewText||"");
  const duration=durationSeconds(row);
  const isLive=!!row.isLive;
  const published=feedPublishedLabel(row)||publishedLabel(row)||clean(row.publishedText||"");
  const statBits=[];
  if(viewText)statBits.push(viewText);
  else if(views)statBits.push(fmtViews(views)+" lượt xem");
  if(published)statBits.push(published);
  const episode=Number(options.episode)||0;
  const seriesKey=clean(options.seriesKey||"");

  return '<article class="card search-card" data-video-id="'+esc(id)+
    '" data-source-id="'+esc(searchSourceId(row))+
    '" data-title="'+esc(title)+
    '" data-channel="'+esc(channel)+
    '" data-views="'+esc(String(views))+
    '" data-view-text="'+esc(viewText)+
    '" data-duration="'+esc(String(duration))+
    '" data-live="'+(isLive?'1':'0')+
    '" data-published="'+esc(published)+
    '" data-thumb="'+esc(thumb(row,id))+
    '" data-aspect="'+esc(String(rowAspectRatio(row)||""))+
    '" data-search-match="'+(options.match===false?'0':'1')+
    '" data-series-key="'+esc(seriesKey)+
    '" data-episode="'+esc(String(episode||""))+'">'+
      '<div class="thumb-wrap"><img src="'+esc(thumb(row,id))+'" alt="" loading="lazy">'+
        (isLive?'<span class="live-badge">LIVE</span>':duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+
        (episode?'<span class="episode-badge">Tập '+esc(String(episode))+'</span>':'')+
      '</div>'+
      '<div class="card-copy"><div class="card-title">'+esc(title)+'</div>'+
        '<div class="card-channel">'+esc(channel)+'</div>'+
        '<div class="card-stats">'+esc(statBits.join(" · "))+'</div>'+
      '</div>'+
    '</article>';
}

function searchGroupLabel(group={},query="",scope=""){
  const channel=clean(group.channel)||"Nguồn YouTube";
  if(scope!=="film")return channel;
  const base=stripEpisodeMarkers(canonicalSearchSeed(query,scope))
    .replace(/\b(?:19|20)\d{2}\b/g," ")
    .replace(/\s+/g," ")
    .trim();
  const bits=[base||"Phim"];
  if(group.variant?.year)bits.push(group.variant.year);
  if(group.variant?.isNewVersion)bits.push("Tân");
  bits.push(channel);
  return bits.join(" · ");
}

function searchSeriesKey(row={},query="",scope="",groupKey=""){
  if(scope!=="film")return "";
  const episode=searchEpisodeNumber(row?._displayTitle||row?.title||"");
  if(!episode||!searchTitleMatchesCore(row,query))return "";
  return "film:"+groupKey+":"+normalizeSearchText(stripEpisodeMarkers(canonicalSearchSeed(query,scope)));
}


const MUSIC_VARIANT_WORDS=/\b(cover|karaoke|remix|mashup|instrumental|khong loi|không lời|guitar|piano|acoustic|beat|lofi|nightcore|slowed|reverb|live)\b/i;
const MUSIC_NON_SONG_WORDS=/\b(phim|review|tin tuc|thoi su|trailer|podcast|phong van|talkshow|game|tap \d+)\b/i;

function musicQueryCore(query=""){
  return normalizeSearchText(query)
    .replace(/\b(bai hat|ca khuc|nhac|music|official|mv|video)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function musicTitleCore(row={}){
  return normalizeSearchText(row?._displayTitle||row?.title||"")
    .replace(/\b(official|music|video|mv|audio|lyrics?|lyric|hd|4k)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function musicMatchesSong(row={},query=""){
  const core=musicQueryCore(query);
  if(!core)return false;
  const title=musicTitleCore(row);
  if(!title)return false;
  const tokens=core.split(" ").filter(token=>token.length>=2);
  if(!tokens.length)return false;
  const hits=tokens.filter(token=>title.includes(token)).length;
  return hits>=Math.max(2,Math.ceil(tokens.length*.7));
}

function musicVariantType(row={}){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  if(/\b(khong loi|instrumental|guitar|piano|acoustic|beat)\b/.test(title))return "instrumental";
  if(/\bcover\b/.test(title))return "cover";
  if(/\b(karaoke|remix|mashup|lofi|nightcore|slowed|reverb)\b/.test(title))return "variant";
  return "singer";
}

function musicOriginalCandidate(rows=[],query=""){
  const ranked=(Array.isArray(rows)?rows:[])
    .filter(row=>{
      if(!musicMatchesSong(row,query))return false;
      const title=normalizeSearchText(row?._displayTitle||row?.title||"");
      if(MUSIC_NON_SONG_WORDS.test(title))return false;
      const duration=Number(row?.duration)||0;
      return !duration||(duration>=120&&duration<=900);
    })
    .map((row,index)=>{
      const type=musicVariantType(row);
      const source=searchChannelName(row);
      let score=searchResultScore(row,query,"music");
      if(type==="singer")score+=80;
      if(/\bofficial\b/i.test(source+" "+clean(row?._displayTitle||row?.title||"")))score+=35;
      if(searchSourceId(row))score+=15;
      return {row,index,score};
    })
    .sort((a,b)=>b.score-a.score||a.index-b.index);

  return ranked[0]?.row||null;
}

function isLikelyMusicSearch(rows=[],query="",scope=""){
  if(scope==="music")return true;
  const candidate=musicOriginalCandidate(rows,query);
  if(!candidate)return false;
  const title=normalizeSearchText(candidate?._displayTitle||candidate?.title||"");
  if(MUSIC_NON_SONG_WORDS.test(title))return false;
  const duration=Number(candidate?.duration)||0;
  return !duration||(duration>=120&&duration<=900);
}

function dedupeMusicRows(rows=[]){
  const seen=new Set();
  const out=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function musicSectionHtml(title,rows=[],limit=10){
  const cards=dedupeMusicRows(rows).slice(0,limit).map(row=>searchCardHtml(row,{match:true}));
  if(!cards.length)return "";
  return '<section class="search-source-row search-semantic-row">'+
    '<div class="search-source-head"><strong>'+esc(title)+'</strong>'+
      '<span>'+esc(String(cards.length))+' video</span></div>'+
    '<div class="search-source-scroll">'+cards.join("")+'</div>'+
  '</section>';
}

function renderMusicSemanticSearch(model={}){
  const html=[];
  const artist=clean(model.artist||"Ca sĩ");

  if(model.artistSongs?.length){
    html.push(musicSectionHtml(artist+" · Ca khúc khác",model.artistSongs,10));
  }
  if(model.otherSingers?.length){
    html.push(musicSectionHtml("Ca sĩ khác · "+clean(model.song||state.searchQuery),model.otherSingers,10));
  }
  if(model.covers?.length){
    html.push(musicSectionHtml("Cover",model.covers,10));
  }
  if(model.instrumentals?.length){
    html.push(musicSectionHtml("Không lời · Guitar · Piano",model.instrumentals,10));
  }
  if(model.variants?.length){
    html.push(musicSectionHtml("Karaoke · Remix · Phiên bản khác",model.variants,10));
  }

  if(!html.length)return false;
  feed.classList.add("search-grouped");
  feed.innerHTML=html.join("");
  feedStatus.textContent="Theo bài hát · "+artist;
  return true;
}

async function enrichMusicSemanticSearch(rows=[],query="",scope="",seq=0){
  const original=musicOriginalCandidate(rows,query);
  if(!original)return false;

  const artist=searchChannelName(original)||clean(original?.uploader||"");
  const sourceId=searchSourceId(original);
  const song=clean(query);
  const originalId=itemVideoId(original);
  const local=await localEngine(12000);

  const jobs=[
    local.search(song,{type:"video"}).catch(()=>[]),
    local.search(song+" cover",{type:"video"}).catch(()=>[]),
    local.search(song+" không lời guitar piano",{type:"video"}).catch(()=>[]),
    local.search(song+" karaoke remix",{type:"video"}).catch(()=>[])
  ];

  if(sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)){
    jobs.push(
      local.channelVideosPage("music-artist:"+sourceId,sourceId,true).catch(()=>[])
    );
  }else if(artist){
    jobs.push(local.search(artist,{type:"video"}).catch(()=>[]));
  }else{
    jobs.push(Promise.resolve([]));
  }

  const [sameSong,coverSearch,instrumentSearch,variantSearch,artistPool]=await Promise.all(jobs);
  if(seq!==state.searchSeq||state.searchQuery!==query)return false;

  const blocked=row=>isBlockedSourceRow(row,scope||GENERAL_SOURCE_SCOPE);
  const originalSourceKey=searchSourceKey(original);

  const artistSongs=dedupeMusicRows(
    (Array.isArray(artistPool)?artistPool:[])
      .filter(row=>!blocked(row))
      .filter(row=>itemVideoId(row)!==originalId)
      .filter(row=>searchSourceKey(row)===originalSourceKey||normalizeSearchText(searchChannelName(row))===normalizeSearchText(artist))
      .filter(row=>musicVariantType(row)==="singer")
      .filter(row=>!musicMatchesSong(row,query))
      .sort((a,b)=>publishedAgeMs(a)-publishedAgeMs(b))
  ).slice(0,12);

  const otherSingers=dedupeMusicRows([
    ...(Array.isArray(sameSong)?sameSong:[]),
    ...rows
  ])
    .filter(row=>!blocked(row))
    .filter(row=>itemVideoId(row)!==originalId)
    .filter(row=>musicMatchesSong(row,query))
    .filter(row=>searchSourceKey(row)!==originalSourceKey)
    .filter(row=>musicVariantType(row)==="singer")
    .sort((a,b)=>searchResultScore(b,query,"music")-searchResultScore(a,query,"music"))
    .slice(0,12);

  const covers=dedupeMusicRows([
    ...(Array.isArray(coverSearch)?coverSearch:[]),
    ...rows
  ])
    .filter(row=>!blocked(row))
    .filter(row=>musicMatchesSong(row,query))
    .filter(row=>musicVariantType(row)==="cover")
    .sort((a,b)=>searchResultScore(b,query,"music")-searchResultScore(a,query,"music"))
    .slice(0,12);

  const instrumentals=dedupeMusicRows([
    ...(Array.isArray(instrumentSearch)?instrumentSearch:[]),
    ...rows
  ])
    .filter(row=>!blocked(row))
    .filter(row=>musicMatchesSong(row,query))
    .filter(row=>musicVariantType(row)==="instrumental")
    .sort((a,b)=>searchResultScore(b,query,"music")-searchResultScore(a,query,"music"))
    .slice(0,12);

  const variants=dedupeMusicRows([
    ...(Array.isArray(variantSearch)?variantSearch:[]),
    ...rows
  ])
    .filter(row=>!blocked(row))
    .filter(row=>musicMatchesSong(row,query))
    .filter(row=>musicVariantType(row)==="variant")
    .sort((a,b)=>searchResultScore(b,query,"music")-searchResultScore(a,query,"music"))
    .slice(0,12);

  return renderMusicSemanticSearch({
    artist,
    song,
    artistSongs,
    otherSingers,
    covers,
    instrumentals,
    variants
  });
}

function renderDirectSearchResults(rows=[],query="",scope=""){
  const ranked=(Array.isArray(rows)?rows:[])
    .filter(row=>!isBlockedSourceRow(row,scope))
    .map((row,index)=>({row,index,score:searchResultScore(row,query,scope)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map(item=>item.row);

  state.feedRows=ranked;
  feed.classList.remove("search-grouped");
  renderCards(ranked.slice(0,30),{updateStatus:false});
  feedStatus.textContent=ranked.length?ranked.length+" kết quả":"";
  return ranked;
}

function renderSearchGroups(rows=[],query="",scope="",extrasBySource=new Map()){
  const sourceRows=(Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row,scope));
  const groups=new Map();

  for(const row of sourceRows){
    const sourceKey=searchSourceKey(row);
    const variant=scope==="film"?searchFilmVariant(row,query):{key:sourceKey,year:"",isNewVersion:false};
    const groupKey=scope==="film"?variant.key:sourceKey;
    if(!groups.has(groupKey)){
      groups.set(groupKey,{
        key:groupKey,
        sourceKey,
        sourceId:searchSourceId(row),
        channel:searchChannelName(row),
        variant,
        matches:[]
      });
    }
    groups.get(groupKey).matches.push(row);
  }

  const ordered=[...groups.values()]
    .map(group=>{
      group.matches.sort((a,b)=>searchResultScore(b,query,scope)-searchResultScore(a,query,scope));
      group.score=searchResultScore(group.matches[0]||{},query,scope);
      return group;
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,12);

  const html=[];
  let total=0;
  for(const group of ordered){
    const seen=new Set();
    const cards=[];
    const exact=group.matches.slice(0,5);

    for(const row of exact){
      const id=itemVideoId(row);
      if(!id||seen.has(id))continue;
      seen.add(id);
      const episode=searchEpisodeNumber(row?._displayTitle||row?.title||"");
      const seriesKey=searchSeriesKey(row,query,scope,group.key);
      cards.push(searchCardHtml(row,{match:true,episode,seriesKey}));
    }

    const extras=Array.isArray(extrasBySource.get(group.sourceKey))?extrasBySource.get(group.sourceKey):[];
    for(const row of extras){
      const id=itemVideoId(row);
      if(!id||seen.has(id))continue;
      seen.add(id);
      const episode=searchEpisodeNumber(row?._displayTitle||row?.title||"");
      const seriesKey=searchSeriesKey(row,query,scope,group.key);
      cards.push(searchCardHtml(row,{match:false,episode,seriesKey}));
      if(cards.length>=9)break;
    }

    if(!cards.length)continue;
    total+=cards.length;
    html.push(
      '<section class="search-source-row" data-search-source="'+esc(group.sourceKey)+'">'+
        '<div class="search-source-head"><strong>'+esc(searchGroupLabel(group,query,scope))+'</strong>'+
          '<span>'+esc(String(group.matches.length))+' khớp'+(extras.length?' · thêm trong kênh':'')+'</span></div>'+
        '<div class="search-source-scroll">'+cards.join("")+'</div>'+
      '</section>'
    );
  }

  feed.classList.add("search-grouped");
  feed.innerHTML=html.join("")||'<div class="empty">Chưa có video phù hợp.</div>';
  feedStatus.textContent=sourceRows.length?sourceRows.length+" kết quả · "+ordered.length+" nguồn":"";
}

function searchExtraRank(row={},query=""){
  let score=searchResultScore(row,query,state.searchScope||GENERAL_SOURCE_SCOPE);
  if(searchTitleMatchesCore(row,query))score+=80;
  score+=Math.max(0,10-Math.min(10,publishedAgeMs(row)/DAY_MS));
  return score;
}

async function enrichSearchGroups_UNUSED(rows=[],query="",scope="",seq=0){
  const candidates=[];
  const seen=new Set();
  for(const row of rows){
    const id=searchSourceId(row);
    if(!/^UC[A-Za-z0-9_-]+$/.test(id)||seen.has(id))continue;
    seen.add(id);
    candidates.push({id,key:searchSourceKey(row)});
    if(candidates.length>=4)break;
  }
  if(!candidates.length)return;

  try{
    const local=await localEngine(12000);
    const batches=await Promise.all(candidates.map(async source=>{
      try{
        const channelRows=await local.channelVideosPage(
          "search-related:"+fastHash(query)+":"+source.id,
          source.id,
          true
        );
        const rows=(Array.isArray(channelRows)?channelRows:[])
          .filter(row=>!isBlockedSourceRow(row,scope))
          .sort((a,b)=>searchExtraRank(b,query)-searchExtraRank(a,query))
          .slice(0,8);
        return [source.key,rows];
      }catch{
        return [source.key,[]];
      }
    }));

    if(seq!==state.searchSeq||state.searchQuery!==query)return;
    renderSearchGroups(rows,query,scope,new Map(batches));
  }catch{}
}


function normalizePlaylistInfo(playlist={}){
  const items=(Array.isArray(playlist?.items)?playlist.items:[]).filter(row=>itemVideoId(row));
  return {id:clean(playlist?.id||""),title:clean(playlist?.title||""),currentIndex:Number.isFinite(Number(playlist?.currentIndex))?Number(playlist.currentIndex):0,items};
}
function playlistOrderedNextRows(playlist={},currentId=""){
  const info=normalizePlaylistInfo(playlist);
  if(info.items.length<2)return [];
  let index=info.items.findIndex(row=>itemVideoId(row)===currentId);
  if(index<0)index=Math.max(0,Math.min(info.items.length-1,info.currentIndex));
  return [...info.items.slice(index+1),...info.items.slice(0,index)].filter(row=>itemVideoId(row)!==currentId);
}
function setPlaylistContext(playlist={},currentId=""){
  const info=normalizePlaylistInfo(playlist);
  if(info.items.length<2)return false;
  let currentIndex=info.items.findIndex(row=>itemVideoId(row)===currentId);
  if(currentIndex<0)currentIndex=Math.max(0,Math.min(info.items.length-1,info.currentIndex));
  state.seriesMode="playlist";state.playlistId=info.id;state.seriesKey="playlist:"+(info.id||fastHash(info.title||currentId));state.seriesSourceName="";
  state.seriesQueue=info.items.map((row,index)=>({id:itemVideoId(row),episode:index+1,label:String(index+1),meta:{...row,title:clean(row?._displayTitle||row?.title||""),uploader:searchChannelName(row),thumbnailUrl:thumb(row,itemVideoId(row))},seriesLabel:info.title||"Danh sách phát"}));
  state.seriesIndex=currentIndex;renderSeriesPanel();return true;
}
function playlistSuggestionHtml(playlist={},currentId=""){
  const info=normalizePlaylistInfo(playlist);const rows=playlistOrderedNextRows(info,currentId);
  if(!rows.length)return "";
  return filmSuggestionSection("Tiếp theo trong playlist · "+(info.title||"YouTube"),rows,{limit:14});
}
function prependPlaylistSuggestions(playlist={},currentId=""){
  const html=playlistSuggestionHtml(playlist,currentId);if(!html)return false;
  feed.classList.add("search-grouped");feed.insertAdjacentHTML("afterbegin",html);return true;
}

function clearSeriesContext(){
  state.seriesQueue=[];
  state.seriesIndex=-1;
  state.seriesKey="";
  state.seriesSourceName="";
  state.seriesMode="";
  state.playlistId="";
  if(seriesPanel)seriesPanel.hidden=true;
  if(seriesEpisodes)seriesEpisodes.innerHTML="";
}

function renderSeriesPanel(){
  if(!seriesPanel||!seriesEpisodes)return;
  const queue=Array.isArray(state.seriesQueue)?state.seriesQueue:[];
  if(queue.length<2){
    seriesPanel.hidden=true;
    return;
  }

  seriesPanel.hidden=false;
  const current=queue[state.seriesIndex]||queue[0];
  if(seriesTitle)seriesTitle.textContent=clean(current?.seriesLabel)||(state.seriesMode==="playlist"?"Danh sách phát":"Danh sách tập");
  if(seriesMeta){
    const source=clean(state.seriesSourceName);
    seriesMeta.textContent=state.seriesMode==="playlist"?queue.length+" video · playlist":queue.length+" tập · "+(source?source+" · ":"")+"sắp xếp theo số tập";
  }
  if(seriesAutoplay){
    seriesAutoplay.classList.toggle("active",state.seriesAutoplay);
    seriesAutoplay.setAttribute("aria-pressed",state.seriesAutoplay?"true":"false");
    seriesAutoplay.textContent=state.seriesAutoplay?"Tự phát ✓":"Tự phát";
  }

  seriesEpisodes.innerHTML=queue.map((item,index)=>
    '<button type="button" data-series-index="'+index+'" class="'+(index===state.seriesIndex?'active':'')+'">'+
      (state.seriesMode==="playlist"?esc(String(item.label||index+1)):'Tập '+esc(String(item.episode)))+
    '</button>'
  ).join("");
}

function setSeriesContextFromCard(card){
  const key=clean(card?.dataset?.seriesKey||"");
  const episode=Number(card?.dataset?.episode)||0;
  if(!key||!episode){
    clearSeriesContext();
    return;
  }

  const rows=[...feed.querySelectorAll("[data-video-id][data-series-key]")]
    .filter(item=>item.dataset.seriesKey===key&&Number(item.dataset.episode)>0);

  const byEpisode=new Map();
  for(const item of rows){
    const ep=Number(item.dataset.episode)||0;
    if(!ep||byEpisode.has(ep))continue;
    byEpisode.set(ep,{
      id:item.dataset.videoId||"",
      episode:ep,
      meta:rowFromCard(item),
      seriesLabel:stripEpisodeMarkers(item.dataset.title||state.searchQuery||"Phim")
    });
  }

  const queue=[...byEpisode.values()].sort((a,b)=>a.episode-b.episode);
  if(queue.length<2){
    clearSeriesContext();
    return;
  }

  state.seriesQueue=queue;
  state.seriesKey=key;
  state.seriesMode="episodes";
  state.playlistId="";
  state.seriesSourceName=clean(card.dataset.channel||"");
  state.seriesIndex=Math.max(0,queue.findIndex(item=>item.id===card.dataset.videoId));
  renderSeriesPanel();
}

function playSeriesIndex(index){
  const item=state.seriesQueue?.[index];
  if(!item?.id)return false;
  state.seriesIndex=index;
  renderSeriesPanel();
  void playVideo(item.id,{...item.meta,_seriesKey:state.seriesKey,_episode:item.episode});
  return true;
}

function advanceSeriesEpisode(){
  if(!state.seriesAutoplay||state.seriesQueue.length<2)return false;
  const next=state.seriesIndex+1;
  if(next<0||next>=state.seriesQueue.length)return false;
  return playSeriesIndex(next);
}


const FILM_SERIES_GENERIC_TOKENS=new Set([
  "phim","tron","trọn","bo","bộ","full","tap","tập","episode","ep","hoi","hồi",
  "thuyet","thuyết","minh","long","lồng","tieng","tiếng","vietsub","ban","bản",
  "dep","đẹp","hd","4k","2024","2025","2026","movie"
]);

function filmSeriesSeed(meta={}){
  const title=clean(meta?._displayTitle||meta?.title||"");
  const query=clean(state.searchQuery||"");
  const titleNorm=normalizeSearchText(title);
  const queryTokens=filmSeriesCoreTokens(query);
  const queryHits=queryTokens.filter(token=>titleNorm.includes(token)).length;
  const queryLooksLikeSelectedWork=
    queryTokens.length>=2&&
    queryHits>=Math.max(2,Math.ceil(queryTokens.length*.6));

  let value=queryLooksLikeSelectedWork?query:title;

  value=stripEpisodeMarkers(value)
    .replace(/\b(?:phim|trọn\s*bộ|tron\s*bo|full|bản\s*đẹp|ban\s*dep|thuyết\s*minh|thuyet\s*minh|lồng\s*tiếng|long\s*tieng|vietsub|4k|hd)\b/giu," ")
    .replace(/\s+/g," ")
    .trim();

  const tokens=value.split(" ").filter(token=>{
    const key=normalizeSearchText(token);
    return key.length>=2&&!FILM_SERIES_GENERIC_TOKENS.has(key)&&!/^\d+$/.test(key);
  });

  return clean(tokens.join(" "))||clean(stripEpisodeMarkers(meta?.title||""));
}

function filmSeriesCoreTokens(seed=""){
  return normalizeSearchText(seed)
    .split(" ")
    .filter(token=>token.length>=2&&!FILM_SERIES_GENERIC_TOKENS.has(token))
    .slice(0,8);
}

function filmSeriesTitleMatches(row={},seed=""){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  const tokens=filmSeriesCoreTokens(seed);
  if(!title||tokens.length<2)return false;
  const hits=tokens.filter(token=>title.includes(token)).length;
  return hits>=Math.max(2,Math.ceil(tokens.length*.7));
}

function filmSeriesVariant(row={},seed=""){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  const year=title.match(/\b((?:19|20)\d{2})\b/)?.[1]||"";
  const remake=/\btan\b/.test(title)&&!/\btan\b/.test(normalizeSearchText(seed));
  return {year,remake};
}

function filmSeriesGroupKey(row={},seed=""){
  const source=searchSourceKey(row);
  const variant=filmSeriesVariant(row,seed);
  return source+"|"+variant.year+"|"+(variant.remake?"tan":"");
}

function filmEpisodeSequenceScore(episodes=[]){
  const nums=[...new Set(episodes.map(Number).filter(n=>n>0))].sort((a,b)=>a-b);
  let adjacent=0;
  for(let i=1;i<nums.length;i++){
    if(nums[i]===nums[i-1]+1)adjacent++;
  }
  return {count:nums.length,adjacent,first:nums[0]||0,last:nums.at(-1)||0};
}

function buildFilmSeriesGroups(rows=[],seed="",scope="film"){
  const groups=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    if(isBlockedSourceRow(row,scope))continue;
    if(!filmSeriesTitleMatches(row,seed))continue;
    const episode=searchEpisodeNumber(row?._displayTitle||row?.title||"");
    if(!episode)continue;

    const key=filmSeriesGroupKey(row,seed);
    if(!groups.has(key)){
      groups.set(key,{
        key,
        sourceKey:searchSourceKey(row),
        sourceId:searchSourceId(row),
        channel:searchChannelName(row),
        variant:filmSeriesVariant(row,seed),
        rows:[]
      });
    }
    groups.get(key).rows.push({...row,_episode:episode});
  }

  for(const group of groups.values()){
    const bestByEpisode=new Map();
    for(const row of group.rows){
      const ep=Number(row._episode)||0;
      const prev=bestByEpisode.get(ep);
      if(!prev||searchResultScore(row,seed,"film")>searchResultScore(prev,seed,"film")){
        bestByEpisode.set(ep,row);
      }
    }
    group.rows=[...bestByEpisode.values()].sort((a,b)=>a._episode-b._episode);
    group.sequence=filmEpisodeSequenceScore(group.rows.map(row=>row._episode));
    const selected=group.sourceId&&selectedSetForScope("film").has(group.sourceId);
    group.score=
      group.sequence.count*32+
      group.sequence.adjacent*18+
      (selected?55:0)+
      Math.min(18,group.rows.reduce((sum,row)=>sum+Math.log10((Number(row.views)||0)+10),0)/3);
  }
  return [...groups.values()].sort((a,b)=>b.score-a.score);
}

async function hydrateFilmSeriesGroups(local,groups=[],seed="",scope="film"){
  const targets=groups
    .filter(group=>/^UC[A-Za-z0-9_-]+$/.test(group.sourceId||""))
    .slice(0,5);

  const hydrated=await Promise.all(targets.map(async group=>{
    try{
      const channelRows=await local.channelVideosPage(
        "film-series:"+fastHash(seed)+":"+group.sourceId,
        group.sourceId,
        true
      );
      const merged=mergeUniqueRows(group.rows,Array.isArray(channelRows)?channelRows:[]);
      const rebuilt=buildFilmSeriesGroups(merged,seed,scope)
        .find(item=>item.sourceKey===group.sourceKey&&
          item.variant.year===group.variant.year&&
          item.variant.remake===group.variant.remake);
      return {
        ...(rebuilt||group),
        channelRows:Array.isArray(channelRows)?channelRows:[]
      };
    }catch{
      return {...group,channelRows:[]};
    }
  }));

  const byKey=new Map(groups.map(group=>[group.key,group]));
  for(const group of hydrated)byKey.set(group.key,group);

  return [...byKey.values()]
    .map(group=>{
      group.sequence=filmEpisodeSequenceScore(group.rows.map(row=>row._episode));
      const selected=group.sourceId&&selectedSetForScope("film").has(group.sourceId);
      group.score=
        group.sequence.count*32+
        group.sequence.adjacent*18+
        (selected?55:0);
      return group;
    })
    .sort((a,b)=>b.score-a.score);
}

function filmVersionLabel(group={},seed=""){
  const bits=[clean(seed)||"Phim"];
  if(group.variant?.year)bits.push(group.variant.year);
  if(group.variant?.remake)bits.push("Tân");
  if(group.channel)bits.push(group.channel);
  return bits.join(" · ");
}

function setDiscoveredFilmSeries(group={},currentMeta={}){
  const rows=(Array.isArray(group?.rows)?group.rows:[])
    .filter(row=>Number(row?._episode)>0)
    .sort((a,b)=>Number(a._episode)-Number(b._episode));
  if(rows.length<2)return false;

  const queue=rows.map(row=>({
    id:itemVideoId(row),
    episode:Number(row._episode)||0,
    meta:{
      ...row,
      title:clean(row?._displayTitle||row?.title||""),
      uploader:searchChannelName(row),
      thumbnailUrl:thumb(row,itemVideoId(row))
    },
    seriesLabel:filmVersionLabel(group,filmSeriesSeed(currentMeta))
  })).filter(item=>item.id&&item.episode);

  if(queue.length<2)return false;

  const currentEpisode=searchEpisodeNumber(currentMeta?.title||state.searchQuery||"");
  state.seriesQueue=queue;
  state.seriesKey="film-discovered:"+group.key;
  state.seriesMode="episodes";
  state.playlistId="";
  state.seriesSourceName=clean(group.channel);
  state.seriesIndex=currentEpisode
    ?Math.max(0,queue.findIndex(item=>item.episode===currentEpisode))
    :0;
  renderSeriesPanel();
  return true;
}

function filmSuggestionSection(title,rows=[],options={}){
  const cards=[];
  const seen=new Set();
  for(const row of rows){
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    const episode=Number(row?._episode)||searchEpisodeNumber(row?._displayTitle||row?.title||"");
    cards.push(searchCardHtml(row,{
      match:true,
      episode,
      seriesKey:clean(options.seriesKey||"")
    }));
    if(cards.length>=Number(options.limit||10))break;
  }
  if(!cards.length)return "";
  return '<section class="search-source-row">'+
    '<div class="search-source-head"><strong>'+esc(title)+'</strong>'+
      '<span>'+esc(String(cards.length))+' video</span></div>'+
    '<div class="search-source-scroll">'+cards.join("")+'</div>'+
  '</section>';
}

function renderFilmWatchSuggestions(discovery={},related=[]){
  const canonical=discovery.canonical;
  const alternatives=Array.isArray(discovery.alternatives)?discovery.alternatives:[];
  const html=[];

  if(canonical?.rows?.length){
    html.push(filmSuggestionSection(
      "Danh sách tập · "+(canonical.channel||"nguồn có danh sách"),
      canonical.rows,
      {seriesKey:state.seriesKey,limit:14}
    ));
  }

  const canonicalVariant=canonical?.variant||{};
  const versionGroups=alternatives.filter(group=>{
    const variant=group?.variant||{};
    return (
      (variant.year&&variant.year!==canonicalVariant.year)||
      (!!variant.remake!==!!canonicalVariant.remake)
    );
  });

  const versionCards=[];
  for(const group of versionGroups.slice(0,8)){
    const representative=group.rows?.[0];
    if(!representative)continue;
    versionCards.push({...representative,_displayTitle:filmVersionLabel(group,discovery.seed)});
  }
  if(versionCards.length){
    html.push(filmSuggestionSection("Phiên bản khác",versionCards,{limit:8}));
  }

  if(!html.length)return false;

  feedTitle.textContent=clean(discovery.seed)||"Theo bộ phim này";
  feed.classList.add("search-grouped");
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }
  feed.innerHTML=html.join("");
  feedStatus.textContent=
    (canonical?.sequence?.count||0)+" tập"+
    (versionGroups.length?" · "+versionGroups.length+" phiên bản khác":"");
  return true;
}

async function discoverFilmSeriesForPlayback(local,currentId,meta={},related=[],context={}){
  const seq=++state.seriesDiscoverySeq;
  const seed=clean(context?.canonicalTitle||"")||filmSeriesSeed(meta);
  if(!seed||filmSeriesCoreTokens(seed).length<2)return false;

  try{
    const searches=await Promise.all([
      local.search(seed+" tập",{type:"video"}),
      local.search(seed,{type:"video"})
    ]);
    if(seq!==state.seriesDiscoverySeq||state.currentId!==currentId)return false;

    const combined=mergeUniqueRows([],searches.flat());
    let groups=buildFilmSeriesGroups(combined,seed,"film");
    if(!groups.length)return false;

    groups=await hydrateFilmSeriesGroups(local,groups,seed,"film");
    if(seq!==state.seriesDiscoverySeq||state.currentId!==currentId)return false;

    const viable=groups.filter(group=>
      group.sequence.count>=2&&
      (group.sequence.adjacent>=1||group.sequence.count>=4)
    );
    if(!viable.length)return false;

    const currentSource=searchSourceId(meta);
    const currentGroup=viable.find(group=>
      currentSource&&group.sourceId===currentSource
    )||null;

    // A reupload with no useful list should not own the recommendation.
    // Prefer the source that exposes the strongest ordered episode sequence.
    const canonical=[...viable].sort((a,b)=>{
      const aWeakCurrent=currentGroup&&a.key===currentGroup.key&&a.sequence.count<3?1:0;
      const bWeakCurrent=currentGroup&&b.key===currentGroup.key&&b.sequence.count<3?1:0;
      if(aWeakCurrent!==bWeakCurrent)return aWeakCurrent-bWeakCurrent;
      return b.score-a.score;
    })[0];

    if(!canonical)return false;

    const alternatives=viable.filter(group=>group.key!==canonical.key);
    setDiscoveredFilmSeries(canonical,meta);
    const discovery={seed,canonical,alternatives};
    renderFilmWatchSuggestions(discovery,related);
    return discovery;
  }catch(error){
    console.warn("film series discovery failed",seed,error);
    return false;
  }
}


function filmKnowledgeSeed(context={},meta={}){
  return clean(
    context?.work?.seriesTitle||
    context?.work?.title||
    context?.canonicalTitle||
    filmSeriesSeed(meta)||
    state.searchQuery||
    meta?.title||
    ""
  );
}

function filmKnowledgeEntities(context={}){
  const rows=[];
  const primary=context?.primaryEntity||{};
  if(primary?.name&&/actor|actress|dien vien|diễn viên/i.test(clean(primary?.type||"")+" "+clean(primary?.role||""))){
    rows.push(clean(primary.name));
  }
  for(const entity of Array.isArray(context?.secondaryEntities)?context.secondaryEntities:[]){
    if(!entity?.name)continue;
    const role=normalizeSearchText(clean(entity?.type||"")+" "+clean(entity?.role||""));
    if(/actor|actress|dien vien/.test(role))rows.push(clean(entity.name));
  }
  for(const name of Array.isArray(context?.knowledge?.cast)?context.knowledge.cast:[]){
    if(clean(name))rows.push(clean(name));
  }
  return [...new Set(rows)].slice(0,6);
}

function filmKnowledgeSummary(context={}){
  const k=context?.knowledge||{};
  const bits=[];
  if(Number(k?.year)||Number(context?.work?.year))bits.push(String(Number(k?.year)||Number(context?.work?.year)));
  if(clean(k?.genre||context?.work?.genre))bits.push(clean(k?.genre||context?.work?.genre));
  if(clean(k?.country))bits.push(clean(k.country));
  const cast=filmKnowledgeEntities(context);
  if(cast.length)bits.push("Diễn viên: "+cast.slice(0,3).join(", "));
  const summary=clean(k?.summary||context?.primaryEntity?.summary||"");
  if(summary)bits.push(summary);
  return bits.join(" · ");
}

function strictFilmKnowledgeRows(rows=[],seed="",extraTokens=[]){
  const core=filmSeriesCoreTokens(seed);
  const extra=(Array.isArray(extraTokens)?extraTokens:[])
    .flatMap(value=>normalizeSearchText(value).split(" "))
    .filter(token=>token.length>=2);
  return dedupeMusicRows(rows)
    .filter(row=>!isBlockedSourceRow(row,"film"))
    .filter(row=>{
      const title=normalizeSearchText(row?._displayTitle||row?.title||"");
      if(!title)return false;
      const coreHits=core.filter(token=>title.includes(token)).length;
      const coreOk=core.length>=2&&coreHits>=Math.max(2,Math.ceil(core.length*.65));
      const extraOk=extra.length&&extra.filter(token=>title.includes(token)).length>=Math.min(2,extra.length);
      return coreOk||extraOk;
    });
}

function appendContextSectionHtml(html){
  if(!html)return;
  feed.classList.add("search-grouped");
  feed.insertAdjacentHTML("beforeend",html);
}

async function appendFilmKnowledgeSections(local,currentId,meta={},context={}){
  const seed=filmKnowledgeSeed(context,meta);
  if(!seed||state.currentId!==currentId)return false;

  const cast=filmKnowledgeEntities(context);
  const knowledge=context?.knowledge||{};
  const reviewQueries=(Array.isArray(knowledge?.reviewQueries)?knowledge.reviewQueries:[]).map(clean).filter(Boolean);
  const infoQueries=(Array.isArray(knowledge?.infoQueries)?knowledge.infoQueries:[]).map(clean).filter(Boolean);
  const castQueries=(Array.isArray(knowledge?.castQueries)?knowledge.castQueries:[]).map(clean).filter(Boolean);

  const reviewQuery=reviewQueries[0]||seed+" review phim";
  const castQuery=castQueries[0]||seed+" diễn viên";
  const infoQuery=infoQueries[0]||seed+" thông tin phim";

  const [reviewRaw,castRaw,infoRaw]=await Promise.all([
    local.search(reviewQuery,{type:"video"}).catch(()=>[]),
    local.search(castQuery,{type:"video"}).catch(()=>[]),
    local.search(infoQuery,{type:"video"}).catch(()=>[])
  ]);
  if(state.currentId!==currentId)return false;

  const used=new Set([...feed.querySelectorAll("[data-video-id]")].map(card=>card.dataset.videoId).filter(Boolean));
  const unique=(rows,extra=[])=>strictFilmKnowledgeRows(rows,seed,extra)
    .filter(row=>{
      const id=itemVideoId(row);
      if(!id||used.has(id))return false;
      used.add(id);
      return true;
    })
    .slice(0,10);

  const reviewRows=unique(reviewRaw,["review"]);
  const castRows=unique(castRaw,cast);
  const infoRows=unique(infoRaw,["thông tin","hau truong","hậu trường"]);

  const html=[];
  if(reviewRows.length)html.push(filmSuggestionSection("Review phim",reviewRows,{limit:10}));
  if(castRows.length)html.push(filmSuggestionSection(cast.length?"Diễn viên · "+cast.slice(0,3).join(" · "):"Diễn viên",castRows,{limit:10}));
  if(infoRows.length)html.push(filmSuggestionSection("Thông tin · Hậu trường",infoRows,{limit:10}));

  if(!html.length)return false;
  appendContextSectionHtml(html.join(""));
  const summary=filmKnowledgeSummary(context);
  if(summary)feedStatus.textContent=[feedStatus.textContent,summary].filter(Boolean).join(" · ");
  return true;
}

function shouldProbeFilmSeries(meta={},related=[]){
  const duration=Number(meta?.duration)||0;
  const title=clean(meta?._displayTitle||meta?.title||"");
  const query=clean(state.searchQuery||"");
  const titleNorm=normalizeSearchText(title);
  const queryTokens=filmSeriesCoreTokens(query);
  const queryHits=queryTokens.filter(token=>titleNorm.includes(token)).length;
  const queryMatch=queryTokens.length>=2&&queryHits>=Math.max(2,Math.ceil(queryTokens.length*.6));
  const episode=searchEpisodeNumber(title);
  const relatedEpisodes=(Array.isArray(related)?related:[])
    .filter(row=>filmSeriesTitleMatches(row,query||title)&&searchEpisodeNumber(row?._displayTitle||row?.title||""))
    .length;
  return !!episode||relatedEpisodes>=2||(duration>=900&&queryMatch);
}

function contextualRelatedRows(rows=[],meta={}){
  const currentChannel=normalizeSearchText(meta?.uploaderName||meta?.uploader||"");
  const currentCore=searchCoreTokens(meta?.title||"");
  const query=state.searchQuery||meta?.title||"";
  return (Array.isArray(rows)?rows:[])
    .map((row,index)=>{
      const channel=normalizeSearchText(searchChannelName(row));
      const title=normalizeSearchText(row?._displayTitle||row?.title||"");
      let score=searchResultScore(row,query,state.searchScope||GENERAL_SOURCE_SCOPE);
      if(currentChannel&&channel===currentChannel)score+=80;
      const overlap=currentCore.filter(token=>title.includes(token)).length;
      score+=overlap*16;
      if(searchEpisodeNumber(row?._displayTitle||row?.title||"")&&overlap>=Math.max(2,Math.ceil(currentCore.length*.5)))score+=100;
      return {row,index,score};
    })
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map(item=>item.row);
}

const homeAvatarLoading=new Set();
const homeAvatarResolved=new Set();

function paintHomeChannelAvatar(sourceId,meta={}){
  const image=safeSourceThumb(meta?.thumbnailUrl||"");
  if(!image)return false;
  for(const card of feed.querySelectorAll("[data-source-id]")){
    if((card.dataset.sourceId||"")!==sourceId)continue;
    const avatar=card.querySelector(".card-avatar");
    if(avatar)avatar.innerHTML='<img src="'+esc(image)+'" alt="" loading="lazy">';
  }
  return true;
}

async function hydrateHomeChannelAvatars(){
  if(window.innerWidth>720||document.documentElement.classList.contains("watch-browse"))return;
  const ids=[];
  for(const card of feed.querySelectorAll("[data-source-id]")){
    const id=String(card.dataset.sourceId||"").trim();
    if(!/^UC[A-Za-z0-9_-]+$/.test(id)||ids.includes(id)||homeAvatarLoading.has(id)||homeAvatarResolved.has(id))continue;
    const cached=sourceMetaCache.get(id)||libraryRow(id)||null;
    if(cached&&paintHomeChannelAvatar(id,cached)){
      homeAvatarResolved.add(id);
      continue;
    }
    ids.push(id);
    if(ids.length>=8)break;
  }
  if(!ids.length)return;
  let engine;
  try{engine=await localEngine(10000);}catch{return;}
  await Promise.allSettled(ids.map(async id=>{
    homeAvatarLoading.add(id);
    try{
      const meta=await engine.channelMeta(id);
      if(meta&&meta.id){
        sourceMetaCache.set(id,{...sourceMetaCache.get(id),...meta});
        paintHomeChannelAvatar(id,meta);
      }
      homeAvatarResolved.add(id);
    }catch{}finally{
      homeAvatarLoading.delete(id);
    }
  }));
}

function queueHomeChannelAvatars(){
  if(window.innerWidth>720)return;
  requestAnimationFrame(()=>setTimeout(()=>void hydrateHomeChannelAvatars(),0));
}

function renderCards(rows=[],options={}){
  const append=options.append===true;
  if(!append)feed.classList.remove("search-grouped");
  if(!options.keepSearchRefinements&&searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }
  const seen=new Set(
    append
      ? [...feed.querySelectorAll("[data-video-id]")].map(card=>card.dataset.videoId).filter(Boolean)
      : []
  );
  const cards=[];
  const renderScope=activeSourceScope()||GENERAL_SOURCE_SCOPE;
  for(const row of rows){
    if(isBlockedSourceRow(row,renderScope))continue;
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    const title=clean(row._displayTitle||row.title)||"Video";
    const channel=clean(row._displaySource||row.uploaderName||row.uploader||row.channelName||row._sourceName||"");
    const sourceId=String(row?._sourceId||row?.channelId||row?.uploaderId||"").trim();
    const sourceMeta=(sourceId&&(sourceMetaCache.get(sourceId)||libraryRow(sourceId)))||{};
    const sourceAvatar=safeSourceThumb(
      row?.uploaderThumbnailUrl||
      row?.channelThumbnailUrl||
      row?._sourceThumbnailUrl||
      sourceMeta?.thumbnailUrl||
      ""
    );
    const sourceInitial=(channel||"1988").trim().slice(0,1).toUpperCase()||"•";
    const duplicateExtra=Math.max(0,Number(row._duplicateExtra)||0);
    const views=Number(row.views)||0;
    const viewText=clean(row.viewText||"");
    const duration=durationSeconds(row);
    const isLive=!!row.isLive;
    const published=feedPublishedLabel(row)||publishedLabel(row)||clean(row.publishedText||"");
    const statBits=[];
    if(viewText)statBits.push(viewText);
    else if(views)statBits.push(fmtViews(views)+" lượt xem");
    if(published)statBits.push(published);
    cards.push(
      '<article class="card" data-video-id="'+esc(id)+'" data-source-id="'+esc(String(row?._sourceId||row?.channelId||row?.uploaderId||""))+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-view-text="'+esc(viewText)+'" data-duration="'+esc(String(duration))+'" data-live="'+(isLive?'1':'0')+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumb(row,id))+'" data-aspect="'+esc(String(rowAspectRatio(row)||""))+'">'+
        '<div class="thumb-wrap"><img src="'+esc(thumb(row,id))+'" alt="" loading="lazy">'+(isLive?'<span class="live-badge">LIVE</span>':duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+'</div>'+
        '<div class="card-copy">'+
          '<span class="card-avatar" aria-hidden="true">'+
            (sourceAvatar?'<img src="'+esc(sourceAvatar)+'" alt="" loading="lazy">':'<span>'+esc(sourceInitial)+'</span>')+
          '</span>'+
          '<div class="card-copy-main">'+
            '<div class="card-title">'+esc(title)+'</div>'+
            '<div class="card-channel">'+esc(channel)+(duplicateExtra?' · <span class="card-related">+'+esc(String(duplicateExtra))+' nguồn khác</span>':'')+'</div>'+
            '<div class="card-stats">'+esc(statBits.join(" · "))+'</div>'+
          '</div>'+
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
  ensureWatchNavRail();
  syncWatchCurrentCard();
  queueHomeChannelAvatars();
  normalizeRenderedThumbnails();
  return cards.length;
}

function rowFromCard(card){
  return {
    title:card.dataset.title||"",
    uploader:card.dataset.channel||"",
    _sourceId:card.dataset.sourceId||"",
    channelId:card.dataset.sourceId||"",
    views:Number(card.dataset.views)||0,
    viewText:card.dataset.viewText||"",
    duration:Number(card.dataset.duration)||0,
    isLive:card.dataset.live==="1",
    uploadDate:card.dataset.published||"",
    publishedText:card.dataset.published||"",
    thumbnailUrl:card.dataset.thumb||"",
    aspectRatio:Number(card.dataset.aspect)||0
  };
}

function updateNow(meta={}){
  const title=clean(meta.title)||"Video";
  const channel=clean(meta.uploader||meta.uploaderName||"");
  const views=Number(meta.views)||0;
  const duration=durationSeconds(meta);
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


function selectedVideoAiRow(id,meta={}){
  return {
    id,
    title:clean(meta?._displayTitle||meta?.title||""),
    channel:clean(searchChannelName(meta)||meta?.uploader||""),
    published:clean(meta?.publishedText||meta?.uploadDate||meta?.uploadedDate||publishedLabel(meta)||""),
    views:Number(meta?.views)||0,
    duration:Number(meta?.duration)||0,
    isLive:meta?.isLive===true,
    contentHash:contentHashForRow(meta),
    description:clean(meta?.description||meta?.shortDescription||"").slice(0,1800)
  };
}

function selectedRelatedAiRows(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .slice(0,24)
    .map(row=>({
      id:itemVideoId(row),
      title:clean(row?._displayTitle||row?.title||""),
      channel:clean(searchChannelName(row)),
      published:clean(row?.publishedText||row?.uploadDate||publishedLabel(row)||""),
      views:Number(row?.views)||0,
      duration:Number(row?.duration)||0,
      isLive:row?.isLive===true,
      contentHash:contentHashForRow(row),
      description:clean(row?.description||"").slice(0,900)
    }))
    .filter(row=>row.id&&row.title);
}


function hideContextBrief(){
  if(!contextBrief)return;
  contextBrief.hidden=true;
  if(contextBriefTitle)contextBriefTitle.textContent="";
  if(contextBriefLines)contextBriefLines.innerHTML="";
  if(contextBriefSources){contextBriefSources.hidden=true;contextBriefSources.innerHTML="";}
  if(contextBriefAsOf)contextBriefAsOf.textContent="";
}
function safeExternalUrl(value=""){
  try{const url=new URL(String(value||""));return /^https?:$/.test(url.protocol)?url.toString():"";}catch{return "";}
}
function sourceDisplayName(source={}){
  const title=clean(source?.title||"");
  if(title)return title.replace(/^https?:\/\/(?:www\.)?/i,"").slice(0,42);
  try{return new URL(source?.uri||"").hostname.replace(/^www\./,"");}catch{return "";}
}
function fallbackBriefFromMeta(meta={}){
  const title=clean(meta?._displayTitle||meta?.title||"");
  const channel=clean(searchChannelName(meta)||meta?.uploader||"");
  const description=clean(meta?.description||meta?.shortDescription||"");
  const firstSentence=description?clean(description.split(/(?<=[.!?])\s+/)[0]||description).slice(0,210):"";
  const lines=[];
  if(firstSentence)lines.push(firstSentence);
  if(!firstSentence&&channel)lines.push("Video từ "+channel+".");
  return {title:title||"Video đang xem",lines:lines.slice(0,2),mode:"summary",asOf:""};
}
function renderContextBrief(context={},meta={}){
  if(!contextBrief)return;
  const fallback=fallbackBriefFromMeta(meta);
  const brief=context?.brief&&typeof context.brief==="object"?context.brief:{};
  const title=clean(brief.title||context?.canonicalTitle||context?.subject||fallback.title);
  const lines=(Array.isArray(brief.lines)?brief.lines:[]).map(clean).filter(Boolean).slice(0,3);
  const shownLines=lines.length?lines:fallback.lines;
  const sources=(Array.isArray(context?.groundingSources)?context.groundingSources:[])
    .filter(source=>safeExternalUrl(source?.uri)).slice(0,4);
  if(!title&&!shownLines.length&&!sources.length){hideContextBrief();return;}
  contextBrief.hidden=false;
  if(contextBriefLabel)contextBriefLabel.textContent=brief.mode==="latest"?"Mới nhất":brief.mode==="summary"?"Tóm tắt video":"Thông tin nhanh";
  if(contextBriefAsOf)contextBriefAsOf.textContent=clean(brief.asOf)||(sources.length?"Đã đối chiếu web":"");
  if(contextBriefTitle)contextBriefTitle.textContent=title;
  if(contextBriefLines)contextBriefLines.innerHTML=shownLines.map(line=>"<p>"+esc(line)+"</p>").join("");
  if(contextBriefSources){
    if(sources.length){
      contextBriefSources.innerHTML=sources.map(source=>'<a href="'+esc(safeExternalUrl(source?.uri))+'" target="_blank" rel="noopener noreferrer">'+esc(sourceDisplayName(source)||"Nguồn")+'</a>').join("");
      contextBriefSources.hidden=false;
    }else{contextBriefSources.hidden=true;contextBriefSources.innerHTML="";}
  }
}
function contextSectionIsFresh(section={}){
  const key=normalizeSearchText(section?.key||"");
  const relation=normalizeSearchText(section?.relation||"");
  const label=normalizeSearchText(section?.label||"");
  return /\b(latest|news|update|updates|moi nhat|tin moi|cap nhat)\b/.test([key,relation,label].join(" "));
}

function fallbackCreatorFromChannel(value=""){
  return clean(value)
    .replace(/\b(?:official|music|channel|youtube|records?|entertainment|studio|tv)\b/ig," ")
    .replace(/\s+/g," ")
    .trim();
}

function fallbackTopicCategory(){
  switch(state.searchScope){
    case "news": return "news";
    case "economy": return "economy";
    case "law": return "law";
    case "tech": return "technology";
    case "sports": return "sports";
    case "entertainment": return "entertainment";
    default: return "other";
  }
}

function fallbackVideoContext(meta={},related=[]){
  const rawTitle=clean(meta?._displayTitle||meta?.title||"");
  const rawChannel=clean(searchChannelName(meta)||meta?.uploader||"");
  const title=normalizeSearchText(rawTitle);
  const channel=normalizeSearchText(rawChannel);
  const description=normalizeSearchText(meta?.description||meta?.shortDescription||"");
  const relatedText=(Array.isArray(related)?related:[])
    .slice(0,12)
    .map(row=>normalizeSearchText((row?._displayTitle||row?.title||"")+" "+searchChannelName(row)))
    .join(" ");

  const duration=Number(meta?.duration)||0;
  const search=normalizeSearchText(state.searchQuery||"");
  const combined=[title,channel,description,relatedText,search].join(" ");

  const musicSignals=[
    /\bofficial music video\b/,
    /\bofficial audio\b/,
    /\blyric(s)?\b/,
    /\bkaraoke\b/,
    /\bremix\b/,
    /\bcover\b/,
    /\bmusic\b/,
    /\bca khuc\b/,
    /\bbai hat\b/,
    /\bsinger\b/,
    /\bartist\b/
  ];
  const filmSignals=[
    /\bphim\b/,
    /\bmovie\b/,
    /\bdrama\b/,
    /\btap\s*\d+\b/,
    /\bepisode\s*\d+\b/,
    /\bep\s*\d+\b/,
    /\bhoi\s*\d+\b/
  ];
  const newsSignals=[
    /\btin tuc\b/,
    /\bthoi su\b/,
    /\bban tin\b/,
    /\bnews\b/,
    /\bbao\b/,
    /\bantv\b/,
    /\bvtv24\b/
  ];

  let musicScore=0;
  for(const rule of musicSignals)if(rule.test(combined))musicScore++;
  if(duration>=120&&duration<=720)musicScore+=1;
  if(/\bofficial\b/.test(channel)&&duration>=120&&duration<=720)musicScore+=1;
  if(/\bmtp\b|\bm tp\b|\bson tung\b/.test(channel+" "+title))musicScore+=3;

  let filmScore=0;
  for(const rule of filmSignals)if(rule.test(combined))filmScore++;
  if(duration>=900)filmScore+=1;

  let newsScore=0;
  for(const rule of newsSignals)if(rule.test(combined))newsScore++;

  const base={
    category:"other",
    canonicalTitle:rawTitle,
    creator:"",
    currentChannel:rawChannel,
    channelRole:/\bofficial\b/i.test(rawChannel)?"official":"unknown",
    originalChannelHint:"",
    version:"",
    isSeries:false,
    subject:rawTitle,
    confidence:.25,
    brief:fallbackBriefFromMeta(meta),
    primaryEntity:{name:"",type:"",role:"",aliases:[],summary:""},
    secondaryEntities:[],
    work:{title:rawTitle,seriesTitle:"",episodeNumber:0,season:0,year:0,version:"",genre:"",language:"",isSeries:false},
    sections:[],
    queries:{sameWork:[],creator:[],series:[],versions:[],covers:[],instrumental:[],alternatives:[],topic:[]}
  };

  if(musicScore>=2&&musicScore>=filmScore){
    const canonical=musicCleanTitle(rawTitle||state.searchQuery||"");
    const creator=fallbackCreatorFromChannel(rawChannel);
    const sections=[
      creator?{key:"artist_catalog",label:"Ca khúc khác của "+creator,relation:"same_creator",queries:[creator],sourceMode:"creator",limit:10}:null,
      {key:"same_song",label:"Ca sĩ khác · "+canonical,relation:"same_work",queries:[canonical],sourceMode:"any",limit:10},
      {key:"cover",label:"Cover",relation:"cover",queries:[canonical+" cover"],sourceMode:"any",limit:10},
      {key:"instrumental",label:"Không lời · Guitar · Piano",relation:"instrumental",queries:[canonical+" không lời guitar piano"],sourceMode:"any",limit:10},
      {key:"alternate_versions",label:"Live · Remix · Karaoke",relation:"alternatives",queries:[canonical+" live remix karaoke"],sourceMode:"any",limit:10}
    ].filter(Boolean);

    return {
      ...base,
      kind:"music",
      category:/\blive\b/.test(title)?"live_music":/\bkaraoke\b/.test(title)?"karaoke":"music_video",
      canonicalTitle:canonical,
      creator,
      subject:canonical,
      confidence:.62,
      brief:{...fallbackBriefFromMeta(meta),title:canonical},
      primaryEntity:{name:creator,type:"artist",role:"performer",aliases:[],summary:""},
      work:{...base.work,title:canonical},
      sections,
      queries:{
        sameWork:[canonical],
        creator:creator?[creator]:[],
        series:[],versions:[],
        covers:[canonical+" cover"],
        instrumental:[canonical+" không lời guitar piano"],
        alternatives:[canonical+" live remix karaoke"],
        topic:[]
      }
    };
  }

  if(filmScore>=2&&filmScore>=newsScore){
    const episode=searchEpisodeNumber(rawTitle);
    const canonical=filmSeriesSeed(meta)||stripEpisodeMarkers(rawTitle);
    const sections=[
      {key:"review",label:"Review phim",relation:"review",queries:[canonical+" review phim"],sourceMode:"any",limit:10},
      {key:"cast",label:"Diễn viên",relation:"cast",queries:[canonical+" diễn viên"],sourceMode:"any",limit:10},
      {key:"info",label:"Thông tin phim",relation:"info",queries:[canonical+" thông tin phim"],sourceMode:"any",limit:10}
    ];
    return {
      ...base,
      kind:"film",
      category:episode?"film_series":"film_movie",
      canonicalTitle:canonical,
      subject:canonical,
      isSeries:!!episode,
      confidence:.55,
      brief:{...fallbackBriefFromMeta(meta),title:canonical},
      work:{...base.work,title:canonical,seriesTitle:episode?canonical:"",episodeNumber:episode,isSeries:!!episode},
      sections,
      queries:{
        sameWork:[],creator:[rawChannel],series:[canonical+" tập"],versions:[canonical],
        covers:[],instrumental:[],alternatives:[],topic:[]
      }
    };
  }

  const category=newsScore>=1?"news":"other";
  const subject=clean(state.searchQuery||rawTitle);
  const sections=[
    {key:"same_topic",label:"Cùng chủ đề",relation:"same_topic",queries:[subject],sourceMode:"any",limit:12},
    rawChannel?{key:"same_channel",label:"Cùng nguồn · "+rawChannel,relation:"same_creator",queries:[subject],sourceMode:"same_channel",limit:10}:null
  ].filter(Boolean);

  return {
    ...base,
    kind:"topic",
    category,
    canonicalTitle:subject,
    subject,
    confidence:.35,
    sections,
    queries:{sameWork:[],creator:rawChannel?[rawChannel]:[],series:[],versions:[],covers:[],instrumental:[],alternatives:[],topic:[subject]}
  };
}

async function resolveSelectedVideoContext(id,meta={},related=[]){
  const seq=++state.videoContextSeq;
  try{
    const response=await fetch(AI_TOPICS_URL,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "apikey":SUPABASE_ANON,
        "authorization":"Bearer "+SUPABASE_ANON
      },
      body:JSON.stringify({
        mode:"video_context",
        searchQuery:state.searchQuery||"",
        videos:[selectedVideoAiRow(id,meta)],
        related:selectedRelatedAiRows(related)
      })
    });
    const payload=await response.json().catch(()=>null);
    if(seq!==state.videoContextSeq||state.currentId!==id)return null;
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));
    return payload?.context||fallbackVideoContext(meta,related);
  }catch(error){
    console.warn("video context AI failed",error);
    if(seq!==state.videoContextSeq||state.currentId!==id)return null;
    return fallbackVideoContext(meta,related);
  }
}

function firstContextQuery(context={},key="",fallback=""){
  const rows=Array.isArray(context?.queries?.[key])?context.queries[key]:[];
  return clean(rows.find(Boolean)||fallback);
}

function contextSection(context={},keys=[]){
  const wanted=new Set((Array.isArray(keys)?keys:[keys]).map(value=>normalizeSearchText(value)));
  return (Array.isArray(context?.sections)?context.sections:[]).find(section=>{
    const key=normalizeSearchText(section?.key||"");
    const relation=normalizeSearchText(section?.relation||"");
    return wanted.has(key)||wanted.has(relation);
  })||null;
}

function contextSectionQuery(context={},keys=[],fallback=""){
  const section=contextSection(context,keys);
  const rows=Array.isArray(section?.queries)?section.queries:[];
  return clean(rows.find(Boolean)||fallback);
}

function contextSourceScope(context={}){
  if(context?.kind==="music")return "music";
  if(context?.kind==="film")return "film";
  switch(clean(context?.category)){
    case "news":
    case "current_affairs": return "news";
    case "economy": return "economy";
    case "law": return "law";
    case "technology": return "tech";
    case "sports": return "sports";
    case "entertainment":
    case "interview": return "entertainment";
    default: return GENERAL_SOURCE_SCOPE;
  }
}

function contextSummary(context={}){
  const summary=clean(context?.primaryEntity?.summary||"");
  if(summary)return summary;
  const bits=[];
  if(context?.creator)bits.push(clean(context.creator));
  if(context?.category&&context.category!=="other")bits.push(clean(context.category).replace(/_/g," "));
  if(context?.channelRole&&context.channelRole!=="unknown")bits.push("nguồn "+clean(context.channelRole));
  return bits.join(" · ");
}

function genericSectionHtml(title,rows=[],limit=10){
  const cards=[];
  const seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    cards.push(searchCardHtml(row,{match:true}));
    if(cards.length>=limit)break;
  }
  if(!cards.length)return "";
  return '<section class="search-source-row search-context-row">'+
    '<div class="search-source-head"><strong>'+esc(title)+'</strong>'+
      '<span>'+esc(String(cards.length))+' video</span></div>'+
    '<div class="search-source-scroll">'+cards.join("")+'</div>'+
  '</section>';
}


const CONTEXT_QUERY_STOPWORDS=new Set([
  "moi","nhat","latest","news","tin","tuc","cap","update","review","danh","gia",
  "thong","video","official","full","phan","tich","huong","dan","so","sanh",
  "phim","nhac","bai","hat","truc","tiep","live","today","hom","nay"
]);
function contextRelevanceTokens(value=""){
  return normalizeSearchText(value).split(" ")
    .filter(token=>token.length>=2&&!CONTEXT_QUERY_STOPWORDS.has(token)&&!/^\d+$/.test(token))
    .slice(0,10);
}
function contextRowRelevant(row={},query="",context={}){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  if(!title)return false;
  const queryTokens=contextRelevanceTokens(query);
  const subjectTokens=contextRelevanceTokens(context?.canonicalTitle||context?.subject||"");
  const tokens=queryTokens.length>=2?queryTokens:subjectTokens;
  if(!tokens.length)return true;
  const hits=tokens.filter(token=>title.includes(token)).length;
  return hits>=Math.max(1,Math.ceil(tokens.length*.5));
}

async function contextSectionRows(local,section={},meta={},related=[],context={}){
  const scope=contextSourceScope(context);
  const currentId=state.currentId;
  const sourceId=searchSourceId(meta);
  const queries=(Array.isArray(section?.queries)?section.queries:[]).map(clean).filter(Boolean).slice(0,2);
  let rows=[];

  const mode=clean(section?.sourceMode||"any");
  if(
    ["same_channel","creator"].includes(mode)&&
    sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)&&
    (
      mode==="same_channel"||
      ["official","creator","publisher"].includes(clean(context?.channelRole))
    )
  ){
    rows=await local.channelVideosPage(
      "context-section:"+fastHash(section?.key||section?.label||"")+":"+sourceId,
      sourceId,
      true
    ).catch(()=>[]);
  }else{
    const batches=await Promise.all(
      queries.map(query=>local.search(query,{type:"video"}).catch(()=>[]))
    );
    rows=batches.flat();
  }

  if(!rows.length&&queries.length){
    rows=await local.search(queries[0],{type:"video"}).catch(()=>[]);
  }

  if(mode==="same_channel"&&sourceId){
    rows=(Array.isArray(rows)?rows:[]).filter(row=>searchSourceId(row)===sourceId||searchSourceKey(row)===searchSourceKey(meta));
  }

  const query=queries[0]||context?.canonicalTitle||context?.subject||"";
  return mergeUniqueRows(rows,related)
    .filter(row=>itemVideoId(row)!==currentId)
    .filter(row=>!isBlockedSourceRow(row,scope))
    .filter(row=>mode==="same_channel"||contextRowRelevant(row,query,context))
    .map((row,index)=>({row,index,score:searchResultScore(row,query,scope)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .map(item=>item.row)
    .slice(0,Number(section?.limit)||10);
}

async function discoverGenericContextSections(local,currentId,meta={},related=[],context={},options={}){
  let sections=(Array.isArray(context?.sections)?context.sections:[]).slice(0,6);
  if(options?.onlyFresh===true)sections=sections.filter(contextSectionIsFresh);
  if(!sections.length)return false;
  const results=await Promise.all(sections.map(async section=>({section,rows:await contextSectionRows(local,section,meta,related,context)})));
  if(state.currentId!==currentId)return false;
  const used=new Set(options?.append===true?[...feed.querySelectorAll("[data-video-id]")].map(card=>card.dataset.videoId).filter(Boolean):[]);
  const html=[];
  for(const result of results){
    const unique=[];
    for(const row of result.rows){
      const id=itemVideoId(row);
      if(!id||used.has(id))continue;
      used.add(id);unique.push(row);
      if(unique.length>=Number(result.section?.limit||10))break;
    }
    if(unique.length)html.push(genericSectionHtml(clean(result.section?.label)||"Liên quan",unique,Number(result.section?.limit)||10));
  }
  if(!html.length)return false;
  feed.classList.add("search-grouped");
  if(options?.append===true)feed.insertAdjacentHTML("beforeend",html.join(""));
  else{
    feedTitle.textContent=clean(context?.canonicalTitle||context?.subject||meta?.title||"Gợi ý tiếp theo");
    feed.innerHTML=html.join("");
  }
  feedStatus.textContent=contextSummary(context);
  return true;
}


function musicCleanTitle(value=""){
  return clean(value)
    .replace(/\b(?:official\s*(?:music\s*)?video|official\s*audio|mv|lyrics?|audio|4k|hd)\b/ig," ")
    .replace(/\s*[|｜].*$/,"")
    .replace(/\s+/g," ")
    .trim();
}

function musicOriginalScore(row={},context={},currentSource=""){
  const title=normalizeSearchText(row?._displayTitle||row?.title||"");
  const channel=normalizeSearchText(searchChannelName(row));
  const creator=normalizeSearchText(context?.creator||"");
  let score=0;
  if(musicVariantType(row)==="singer")score+=60;
  if(creator&&channel.includes(creator))score+=85;
  if(/\bofficial\b/.test(channel)||/\bofficial\b/.test(title))score+=35;
  if(searchSourceKey(row)===currentSource&&["official","creator"].includes(context?.channelRole))score+=70;
  score+=Math.min(20,Math.log10((Number(row?.views)||0)+10)*3);
  return score;
}

async function discoverMusicForPlayback(local,currentId,meta={},related=[],context={}){
  const canonical=musicCleanTitle(context?.canonicalTitle||meta?.title||state.searchQuery||"");
  if(!canonical)return false;
  const creator=clean(context?.creator||"");
  const currentSource=searchSourceKey(meta);

  const sameWorkQuery=contextSectionQuery(context,["same_work","same_song","other_singers"],firstContextQuery(context,"sameWork",canonical));
  const coverQuery=contextSectionQuery(context,["cover","covers"],firstContextQuery(context,"covers",canonical+" cover"));
  const instrumentalQuery=contextSectionQuery(context,["instrumental","no_vocal"],firstContextQuery(context,"instrumental",canonical+" không lời guitar piano"));
  const alternativeQuery=contextSectionQuery(context,["alternate_versions","alternatives","live_versions"],firstContextQuery(context,"alternatives",canonical+" live remix karaoke"));

  const [sameWorkRaw,coverRaw,instrumentRaw,alternativeRaw]=await Promise.all([
    local.search(sameWorkQuery,{type:"video"}).catch(()=>[]),
    local.search(coverQuery,{type:"video"}).catch(()=>[]),
    local.search(instrumentalQuery,{type:"video"}).catch(()=>[]),
    local.search(alternativeQuery,{type:"video"}).catch(()=>[])
  ]);
  if(state.currentId!==currentId)return false;

  const sameWork=dedupeMusicRows([...(Array.isArray(sameWorkRaw)?sameWorkRaw:[]),...related])
    .filter(row=>!isBlockedSourceRow(row,"music"))
    .filter(row=>musicMatchesSong(row,canonical));

  let original=sameWork
    .map((row,index)=>({row,index,score:musicOriginalScore(row,context,currentSource)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.row||null;

  if(["official","creator"].includes(context?.channelRole)&&currentSource){
    original={...meta,_sourceId:searchSourceId(meta),channelId:searchSourceId(meta)};
  }

  const originalSource=original?searchSourceKey(original):currentSource;
  const originalSourceId=original?searchSourceId(original):searchSourceId(meta);
  const originalChannel=original?searchChannelName(original):searchChannelName(meta);

  let artistPool=[];
  if(originalSourceId&&/^UC[A-Za-z0-9_-]+$/.test(originalSourceId)){
    artistPool=await local.channelVideosPage("selected-music-artist:"+originalSourceId,originalSourceId,true).catch(()=>[]);
  }else if(creator){
    artistPool=await local.search(
      contextSectionQuery(context,["artist_catalog","creator","same_creator"],firstContextQuery(context,"creator",creator)),
      {type:"video"}
    ).catch(()=>[]);
  }
  if(state.currentId!==currentId)return false;

  const artistSongs=dedupeMusicRows(artistPool)
    .filter(row=>!isBlockedSourceRow(row,"music"))
    .filter(row=>itemVideoId(row)!==currentId)
    .filter(row=>musicVariantType(row)==="singer")
    .filter(row=>!musicMatchesSong(row,canonical))
    .slice(0,12);

  const otherSingers=sameWork
    .filter(row=>itemVideoId(row)!==currentId)
    .filter(row=>searchSourceKey(row)!==originalSource)
    .filter(row=>musicVariantType(row)==="singer")
    .slice(0,12);

  const covers=dedupeMusicRows([...(Array.isArray(coverRaw)?coverRaw:[]),...sameWork])
    .filter(row=>!isBlockedSourceRow(row,"music"))
    .filter(row=>musicMatchesSong(row,canonical))
    .filter(row=>musicVariantType(row)==="cover")
    .slice(0,12);

  const instrumentals=dedupeMusicRows([...(Array.isArray(instrumentRaw)?instrumentRaw:[]),...sameWork])
    .filter(row=>!isBlockedSourceRow(row,"music"))
    .filter(row=>musicMatchesSong(row,canonical))
    .filter(row=>musicVariantType(row)==="instrumental")
    .slice(0,12);

  const variants=dedupeMusicRows([...(Array.isArray(alternativeRaw)?alternativeRaw:[]),...sameWork])
    .filter(row=>!isBlockedSourceRow(row,"music"))
    .filter(row=>musicMatchesSong(row,canonical))
    .filter(row=>musicVariantType(row)==="variant")
    .slice(0,12);

  const html=[];
  if(artistSongs.length)html.push(musicSectionHtml((creator||originalChannel||"Nghệ sĩ")+" · Ca khúc khác",artistSongs,10));
  if(otherSingers.length)html.push(musicSectionHtml("Ca sĩ khác · "+canonical,otherSingers,10));
  if(covers.length)html.push(musicSectionHtml("Cover",covers,10));
  if(instrumentals.length)html.push(musicSectionHtml("Không lời · Guitar · Piano",instrumentals,10));
  if(variants.length)html.push(musicSectionHtml("Live · Remix · Karaoke",variants,10));

  if(!html.length)return false;

  feedTitle.textContent=canonical+(creator?" · "+creator:"");
  feed.classList.add("search-grouped");
  feed.innerHTML=html.join("");
  const sourceNote=
    context?.channelRole==="reupload"&&originalChannel
      ?"Nguồn đang xem có thể là reup · ưu tiên "+originalChannel
      :originalChannel?"Nguồn chính ưu tiên: "+originalChannel:"";
  feedStatus.textContent=[contextSummary(context),sourceNote].filter(Boolean).join(" · ");
  return true;
}

async function discoverTopicForPlayback(local,currentId,meta={},related=[],context={}){
  const planned=await discoverGenericContextSections(local,currentId,meta,related,context);
  if(planned||state.currentId!==currentId)return planned;

  const subject=clean(context?.subject||context?.canonicalTitle||meta?.title||"");
  const sourceId=searchSourceId(meta);
  const html=[];

  if(sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)){
    const channelRows=await local.channelVideosPage("selected-topic-source:"+sourceId,sourceId,true).catch(()=>[]);
    if(state.currentId!==currentId)return false;
    const sameSource=(Array.isArray(channelRows)?channelRows:[])
      .filter(row=>itemVideoId(row)!==currentId)
      .filter(row=>!isBlockedSourceRow(row,contextSourceScope(context)))
      .slice(0,10);
    if(sameSource.length){
      html.push(filmSuggestionSection("Cùng nguồn · "+(searchChannelName(meta)||"kênh này"),sameSource,{limit:10}));
    }
  }

  let topicRows=contextualRelatedRows(related,meta).slice(0,12);
  const topicQuery=firstContextQuery(context,"topic",subject);
  if(topicQuery){
    const searched=await local.search(topicQuery,{type:"video"}).catch(()=>[]);
    topicRows=mergeUniqueRows(searched,topicRows)
      .filter(row=>itemVideoId(row)!==currentId)
      .slice(0,12);
  }
  if(state.currentId!==currentId)return false;
  if(topicRows.length)html.push(filmSuggestionSection("Cùng chủ đề · "+subject,topicRows,{limit:12}));

  if(!html.length)return false;
  feedTitle.textContent=subject||"Gợi ý tiếp theo";
  feed.classList.add("search-grouped");
  feed.innerHTML=html.join("");
  feedStatus.textContent=contextSummary(context);
  return true;
}

async function buildSelectedVideoRecommendations(local,currentId,meta={},related=[],playlist=null){
  hideContextBrief();
  const hasPlaylist=setPlaylistContext(playlist,currentId);
  if(hasPlaylist){
    feedTitle.textContent="Danh sách phát";feedStatus.textContent="";feed.classList.add("search-grouped");
    feed.innerHTML=playlistSuggestionHtml(playlist,currentId)||'<div class="loading">Đang hiểu video…</div>';
  }else{
    feedTitle.textContent="Đang hiểu video…";feedStatus.textContent="";
    feed.innerHTML='<div class="loading">AI đang xác định video này là gì và chủ đề nào thực sự liên quan…</div>';
  }

  const localContext=fallbackVideoContext(meta,related);
  const aiPromise=resolveSelectedVideoContext(currentId,meta,related);

  if(shouldProbeFilmSeries(meta,related)||localContext.kind==="film"){
    const filmProbeContext={...localContext,kind:"film",canonicalTitle:filmSeriesSeed(meta)||localContext.canonicalTitle};
    const discovery=await discoverFilmSeriesForPlayback(local,currentId,meta,related,filmProbeContext);
    if(state.currentId!==currentId)return false;
    if(discovery&&hasPlaylist)prependPlaylistSuggestions(playlist,currentId);

    const context=await aiPromise;
    if(!context||state.currentId!==currentId)return !!discovery;
    renderContextBrief(context,meta);

    if(discovery){
      await appendFilmKnowledgeSections(local,currentId,meta,context.kind==="film"?context:filmProbeContext);
      return true;
    }
    if(context.kind==="film"){
      const enriched=await appendFilmKnowledgeSections(local,currentId,meta,context);
      if(enriched||state.currentId!==currentId){if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return enriched;}
      const planned=await discoverGenericContextSections(local,currentId,meta,related,{...context,sections:(context.sections||[]).filter(section=>!["series","same_series"].includes(normalizeSearchText(section?.key||section?.relation||"")))});
      if(planned||state.currentId!==currentId){if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return planned;}
    }
  }

  const context=await aiPromise;
  if(!context||state.currentId!==currentId)return false;
  renderContextBrief(context,meta);

  if(context.kind==="film"){
    const discovery=await discoverFilmSeriesForPlayback(local,currentId,meta,related,context);
    if(discovery||state.currentId!==currentId){
      if(discovery){await appendFilmKnowledgeSections(local,currentId,meta,context);if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);}
      return !!discovery;
    }
    const enriched=await appendFilmKnowledgeSections(local,currentId,meta,context);
    if(enriched||state.currentId!==currentId){if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return enriched;}
    const planned=await discoverGenericContextSections(local,currentId,meta,related,context);
    if(planned||state.currentId!==currentId){if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return planned;}
  }else if(context.kind==="music"){
    const found=await discoverMusicForPlayback(local,currentId,meta,related,context);
    if(found||state.currentId!==currentId){
      if(found){await discoverGenericContextSections(local,currentId,meta,related,context,{append:true,onlyFresh:true});if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);}
      return found;
    }
    const planned=await discoverGenericContextSections(local,currentId,meta,related,context);
    if(planned||state.currentId!==currentId){if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return planned;}
  }else{
    const found=await discoverTopicForPlayback(local,currentId,meta,related,context);
    if(found||state.currentId!==currentId){if(found&&hasPlaylist)prependPlaylistSuggestions(playlist,currentId);return found;}
  }

  const ranked=contextualRelatedRows(related,meta);
  feedTitle.textContent=context.subject||context.canonicalTitle||"Gợi ý tiếp theo";
  feedStatus.textContent=contextSummary(context);state.feedHasMore=false;renderCards(ranked.slice(0,24));
  if(hasPlaylist)prependPlaylistSuggestions(playlist,currentId);
  return false;
}

async function playVideo(id,seedMeta={}){
  if(!id)return;

  document.documentElement.classList.remove("watch-search-open","watch-categories-open");
  hideContextBrief();
  const frame=playerSection?.querySelector(".player-frame");
  const wasFloating=!!frame?.classList.contains("floating-iframe");
  const keepScrollY=window.scrollY;
  const previousAspect=validPipAspect(state.videoAspect)||16/9;
  const cachedAspect=wasFloating?cachedPipAspect(id):0;
  const seedAspect=validPipAspect(seedMeta?.aspectRatio);

  // Never block playback for aspect detection. Use only information that is
  // already available synchronously. If the next video's shape is unknown,
  // preserve the current PiP shape until the async Auto probe catches up.
  const immediateAspect=
    cachedAspect||
    (seedAspect&&seedAspect<=1.20?seedAspect:0);

  state.keepFloating=wasFloating;
  state.currentId=id;
  state.currentMeta={...seedMeta};
  state.videoAspect=immediateAspect||(
    wasFloating
      ?previousAspect
      :normalizedVideoAspect(seedMeta)
  );
  state.videoAspectVerified=!!cachedAspect;
  state.videoAspectPortraitLocked=!!cachedAspect&&cachedAspect<.80;
  state.floatPreset="auto";
  state.floatUserSized=false;
  state.floatTucked=false;

  // Warm/resolve the next aspect in parallel. This must never delay
  // loadVideoById(). If it resolves first, PiP reshapes while playback starts.
  if(wasFloating){
    void primePipAspect(id).then(ratio=>{
      if(state.currentId!==id)return;
      ratio=validPipAspect(ratio);
      if(!ratio)return;

      state.videoAspect=ratio;
      state.videoAspectVerified=true;
      state.videoAspectPortraitLocked=ratio<.80;

      const activeFrame=playerSection?.querySelector(".player-frame");
      if(activeFrame?.classList.contains("floating-iframe")){
        applyAutoFloatAspect(activeFrame,{force:true});
      }
    }).catch(()=>{});
  }

  if(wasFloating&&frame){
    const floatRect=frame.getBoundingClientRect();
    state.floatBox={top:floatRect.top};

    // Resize the existing PiP for the selected video BEFORE loadVideoById().
    applyAutoFloatAspect(frame,{force:true});
    updateFloatControlState(frame);
  }
  state.intentPlay=true;
  state.resumeOnReturn=false;
  state.mode="video";
  state.audioMaster=false;
  state.nativeSource="";
  state.pendingVideoId=id;
  state.videoPlaying=wasFloating;
  playerSection.hidden=false;
  // Activate the final watch+browse layout immediately when a video opens.
  // No scroll threshold and no scroll compensation: the scrollbar stays put.
  syncWatchBrowseLayout();
  if(!wasFloating)applyFloatingIframe(false);

  backgroundPlayer.pause();
  backgroundPlayer.select(id,{metadata:seedMeta});

  try{nativePlayer.pause();}catch{}
  nativePlayer.removeAttribute("src");

  updateNow(seedMeta);
  showIframePlayer();
  applyResponsivePlayerFrame(seedMeta);
  ensureWatchNavRail();
  syncWatchCurrentCard({scroll:true});
  updateModeUi();
  statusText.textContent="Đang mở YouTube…";

  // Keep the user's current browsing position. The sticky watch pane becomes
  // visible in-place; selecting a video must not drag the page or scrollbar.
  if(wasFloating){
    requestAnimationFrame(()=>{
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
          aspectRatio,
          _aspectVerified:true,
          _aspectSource:"videoAspect"
        };
        state.currentMeta=meta;
        updateCurrentVideoAspect(meta);
      }).catch(()=>{});
    }

    if(typeof local?.visualContentAspect==="function"){
      void local.visualContentAspect(id).then(dimensions=>{
        if(state.currentId!==id)return;

        const aspectRatio=Number(dimensions?.aspectRatio)||0;
        if(!aspectRatio||aspectRatio>=.80)return;

        const height=Number(dimensions?.height)||720;
        const width=Number(dimensions?.width)||Math.round(height*aspectRatio);
        const meta={
          ...(state.currentMeta||{}),
          videoWidth:width,
          videoHeight:height,
          aspectRatio,
          _aspectVerified:true,
          _aspectSource:String(dimensions?.source||"visual")
        };
        state.currentMeta=meta;
        updateCurrentVideoAspect(meta);
      }).catch(()=>{});
    }

    // Metadata is optional: iframe starts immediately, while details/related
    // results are enriched in parallel without delaying playback.
    void local.info(id).then(detail=>{
      if(state.currentId!==id)return;
      const detailMeta={...(detail?.meta||{})};
      const current={...(state.currentMeta||{})};

      if(
        state.videoAspectPortraitLocked &&
        state.videoAspect<.80 &&
        Number(detailMeta.aspectRatio)>=.80
      ){
        delete detailMeta.aspectRatio;
        delete detailMeta.videoWidth;
        delete detailMeta.videoHeight;
      }

      const meta={...seedMeta,...current,...detailMeta};
      state.currentMeta=meta;
      updateCurrentVideoAspect(meta);
      updateNow(meta);
      backgroundPlayer.setMetadata(meta);
      const related=Array.isArray(detail?.related)?detail.related:[];
      const playlist=detail?.playlist||null;
      if(!state.activeFeed){
        void buildSelectedVideoRecommendations(local,id,meta,related,playlist);
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
  if(
    state.fullscreenActive ||
    Date.now()<state.fullscreenExitCooldownUntil ||
    !state.player ||
    !state.currentId ||
    !state.intentPlay ||
    state.mode!=="video"
  )return;

  const attempt=()=>{
    if(
      state.fullscreenActive ||
      Date.now()<state.fullscreenExitCooldownUntil ||
      !state.player ||
      !state.currentId ||
      !state.intentPlay ||
      state.mode!=="video"
    )return;
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
        const iframe=state.player?.getIframe?.();
        if(iframe){
          iframe.setAttribute("allowfullscreen","");
          iframe.setAttribute("webkitallowfullscreen","");
          const allow=new Set((iframe.getAttribute("allow")||"").split(";").map(value=>value.trim()).filter(Boolean));
          ["autoplay","encrypted-media","picture-in-picture","fullscreen"].forEach(value=>allow.add(value));
          iframe.setAttribute("allow",Array.from(allow).join("; "));
        }
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

          // Use YouTube's own calculated video content rectangle. This is the
          // key distinction between the inline 16:9 player box and the actual
          // portrait/square video content inside it.
          scheduleYoutubeContentAspect(event.target);
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
            document.visibilityState!=="visible" &&
            state.resumeOnReturn &&
            !state.fullscreenActive &&
            Date.now()>=state.fullscreenExitCooldownUntil &&
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
          if(advanceSeriesEpisode())return;
          if(state.mode==="video")statusText.textContent="Đã phát xong";
        }
      },
      onApiChange(){
        forceCaptionsOff();
      },
      onError(event){
        const errorCode=Number(event?.data)||0;
        console.warn("1988 YouTube iframe error",{id:state.currentId,errorCode});
        if(fallbackIframeVideoToNative(state.currentId,errorCode))return;
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

  const searchScope=
    state.activeParent&&CONTENT_SOURCE_SCOPES.has(state.activeParent)
      ?state.activeParent
      :activeSourceScope()||GENERAL_SOURCE_SCOPE;
  const seq=++state.searchSeq;
  state.searchQuery=q;
  state.searchScope=searchScope;

  setActiveChip("");
  state.feedHasMore=false;
  state.feedRows=[];
  clearSeriesContext();

  const id=extractVideoId(q);
  if(id){
    if(searchRefinements)searchRefinements.hidden=true;
    await playVideo(id,{
      title:"Đang tải thông tin…",
      thumbnailUrl:"https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"
    });
    return;
  }

  feedTitle.textContent='Kết quả cho “'+q+'”';
  feed.classList.remove("search-grouped");
  feed.innerHTML='<div class="loading">Đang tìm…</div>';
  feedStatus.textContent="";
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }

  const showRows=rows=>{
    if(seq!==state.searchSeq)return false;
    const scoped=sourceAwareRows(
      (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row,searchScope)),
      q,
      searchScope
    );
    if(!scoped.length)return false;

    const ranked=renderDirectSearchResults(scoped,q,searchScope);
    rememberDiscoveredSources(ranked,searchScope===GENERAL_SOURCE_SCOPE?"":searchScope);
    return true;
  };

  try{
    const r=await api("search",{q,filter:"videos"},10000);
    const rows=Array.isArray(r?.data?.items)?r.data.items:[];
    if(showRows(rows))return;
    throw new Error("empty_search");
  }catch(error){
    console.warn("1988 search API failed; trying local engine",error);
  }

  try{
    const local=await localEngine(9000);
    let rows=await local.search(q,{type:"video"});
    if(showRows(rows))return;

    const canonical=canonicalSearchSeed(q,searchScope);
    if(normalizeSearchText(canonical)!==normalizeSearchText(q)){
      rows=await local.search(canonical,{type:"video"});
      if(showRows(rows)){
        queryInput.value=canonical;
        return;
      }
    }

    feed.classList.remove("search-grouped");
    feed.innerHTML='<div class="empty">Chưa thấy kết quả phù hợp.</div>';
    feedStatus.textContent="";
  }catch{
    feed.classList.remove("search-grouped");
    feed.innerHTML='<div class="error">Chưa tìm được video.</div>';
    feedStatus.textContent="";
  }
}

function hardResetDocumentTop(){
  const root=document.documentElement;
  const previousBehavior=root.style.scrollBehavior;
  root.style.scrollBehavior="auto";

  const apply=()=>{
    const scroller=document.scrollingElement||document.documentElement;
    if(scroller){
      scroller.scrollTop=0;
      scroller.scrollLeft=0;
    }
    document.documentElement.scrollTop=0;
    document.documentElement.scrollLeft=0;
    if(document.body){
      document.body.scrollTop=0;
      document.body.scrollLeft=0;
    }
    try{window.scrollTo(0,0);}catch{}
  };

  apply();
  requestAnimationFrame(apply);
  setTimeout(()=>{
    apply();
    root.style.scrollBehavior=previousBehavior;
  },80);
}

function resetHomeViewportInstant({resetSource=false}={}){
  const root=document.documentElement;
  root.classList.remove("home-header-hidden","home-search-open");

  hardResetDocumentTop();

  if(topicChips)topicChips.scrollLeft=0;

  if(resetSource){
    if(sourcesSheet){
      sourcesSheet.scrollTop=0;
      sourcesSheet.scrollLeft=0;
    }
    if(sourceBrowse){
      sourceBrowse.scrollTop=0;
      sourceBrowse.scrollLeft=0;
    }
    if(sourceList){
      sourceList.scrollTop=0;
      sourceList.scrollLeft=0;
    }
    if(sourceGroupTabs)sourceGroupTabs.scrollLeft=0;
    if(sourcePreviewList){
      sourcePreviewList.scrollTop=0;
      sourcePreviewList.scrollLeft=0;
    }
  }
}

let homeHeaderScrollRaf=0;

function setHomeHeaderHidden(hidden){
  const root=document.documentElement;
  if(
    root.classList.contains("watch-browse")||
    root.classList.contains("home-search-open")
  )hidden=false;
  root.classList.toggle("home-header-hidden",!!hidden);
}

function rootHomeScrollY(){
  return Math.max(
    0,
    Number(document.scrollingElement?.scrollTop)||
    Number(document.documentElement?.scrollTop)||
    Number(document.body?.scrollTop)||
    Number(window.scrollY)||
    0
  );
}

function updateHomeHeaderOnScroll(){
  homeHeaderScrollRaf=0;
  const root=document.documentElement;
  const y=rootHomeScrollY();

  if(root.classList.contains("watch-browse")){
    root.classList.remove("home-header-hidden");
    return;
  }

  if(root.classList.contains("home-search-open")){
    setHomeHeaderHidden(false);
    return;
  }

  // One deterministic rule on mobile and desktop:
  // once the page leaves the top, hide Search + Source together.
  setHomeHeaderHidden(y>32);
}

function onHomeScroll(){
  if(homeHeaderScrollRaf)return;
  homeHeaderScrollRaf=requestAnimationFrame(updateHomeHeaderOnScroll);
}

window.addEventListener("scroll",onHomeScroll,{passive:true});
document.addEventListener("scroll",event=>{
  if(event.target===document||event.target===document.scrollingElement)onHomeScroll();
},{passive:true});

let homeTouchStartY=null;
let homeTouchStartX=null;

document.addEventListener("touchstart",event=>{
  if(event.touches?.length!==1)return;
  const touch=event.touches[0];
  homeTouchStartY=touch.clientY;
  homeTouchStartX=touch.clientX;
},{passive:true});

document.addEventListener("touchmove",event=>{
  if(
    homeTouchStartY===null||
    homeTouchStartX===null||
    document.documentElement.classList.contains("watch-browse")||
    document.documentElement.classList.contains("home-search-open")||
    (sourcesSheet&&!sourcesSheet.hidden)
  )return;

  const touch=event.touches?.[0];
  if(!touch)return;
  const dy=touch.clientY-homeTouchStartY;
  const dx=touch.clientX-homeTouchStartX;
  if(Math.abs(dy)<14||Math.abs(dy)<=Math.abs(dx)*1.15)return;

  if(dy<0)setHomeHeaderHidden(true);
  else if(rootHomeScrollY()<=32)setHomeHeaderHidden(false);

  homeTouchStartY=touch.clientY;
  homeTouchStartX=touch.clientX;
},{passive:true});

document.addEventListener("touchend",()=>{
  homeTouchStartY=null;
  homeTouchStartX=null;
},{passive:true});

function homeSearchIconMarkup(open){
  return open
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"></path><path d="m11 18-6-6 6-6"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.75"></circle><path d="m16.2 16.2 4.1 4.1"></path></svg>';
}

function setHomeSearchOpen(open){
  const root=document.documentElement;
  if(root.classList.contains("watch-browse"))return;
  if(open)root.classList.remove("home-header-hidden");
  root.classList.toggle("home-search-open",!!open);
  if(homeSearchToggle){
    homeSearchToggle.innerHTML=homeSearchIconMarkup(open);
    homeSearchToggle.setAttribute("aria-label",open?"Đóng tìm kiếm":"Mở tìm kiếm");
  }
  if(open){
    requestAnimationFrame(()=>{
      queryInput?.focus?.({preventScroll:true});
      queryInput?.select?.();
    });
  }else{
    queryInput?.blur?.();
    clearSuggestions();
  }
}

homeSearchToggle?.addEventListener("click",event=>{
  event.preventDefault();
  event.stopPropagation();

  const root=document.documentElement;

  if(root.classList.contains("watch-browse")){
    // The floating watch toolbar was removed in v201, so the persistent
    // header search icon is now the single search entry point in watch mode.
    root.classList.remove("watch-categories-open");
    const open=!root.classList.contains("watch-search-open");
    root.classList.toggle("watch-search-open",open);
    if(homeSearchToggle){
      homeSearchToggle.innerHTML=homeSearchIconMarkup(open);
      homeSearchToggle.setAttribute("aria-label",open?"Đóng tìm kiếm":"Mở tìm kiếm");
    }
    if(open){
      requestAnimationFrame(()=>{
        if(feedSection){
          feedSection.scrollTop=0;
          feedSection.scrollLeft=0;
        }
        queryInput?.focus?.({preventScroll:true});
        queryInput?.select?.();
      });
    }else{
      queryInput?.blur?.();
      clearSuggestions();
    }
    return;
  }

  setHomeSearchOpen(!root.classList.contains("home-search-open"));
});

seriesAutoplay?.addEventListener("click",()=>{
  state.seriesAutoplay=!state.seriesAutoplay;
  renderSeriesPanel();
});

seriesEpisodes?.addEventListener("click",event=>{
  const button=event.target.closest("[data-series-index]");
  if(!button)return;
  const index=Number(button.dataset.seriesIndex);
  if(Number.isInteger(index))playSeriesIndex(index);
});

searchForm.addEventListener("submit",e=>{
  e.preventDefault();
  const root=document.documentElement;
  const watchSearch=root.classList.contains("watch-browse");

  // In watch mode Search is its own full-screen browsing state:
  // keep the expanded search header open while results load. The player is
  // restored only when the user goes Back or chooses a video.
  root.classList.remove("home-search-open");
  if(!watchSearch)root.classList.remove("watch-search-open");

  if(homeSearchToggle){
    homeSearchToggle.innerHTML=homeSearchIconMarkup(watchSearch);
    homeSearchToggle.setAttribute("aria-label",watchSearch?"Đóng tìm kiếm":"Mở tìm kiếm");
  }

  if(watchSearch&&feedSection){
    feedSection.scrollTop=0;
    feedSection.scrollLeft=0;
  }

  void doSearch(queryInput.value);
  queryInput.blur();
});

// Search is explicit: type, press Enter (or Tìm), then show results.
queryInput.addEventListener("input",()=>{
  clearSuggestions();
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }
});

const desktopCardColorCache=new Map();

function fallbackCardTint(card){
  const art=String(card?.dataset?.thumb||"").trim();
  if(!art)return;
  const escaped=art.replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/[\r\n]/g,"");
  card.style.setProperty("--card-art",'url("'+escaped+'")');
}

function averageThumbTint(url){
  url=String(url||"").trim();
  if(!url)return Promise.resolve("");

  const cached=desktopCardColorCache.get(url);
  if(cached)return cached;

  const task=new Promise(resolve=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.decoding="async";

    img.onload=()=>{
      try{
        const canvas=document.createElement("canvas");
        canvas.width=12;
        canvas.height=8;
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        if(!ctx){resolve("");return;}

        ctx.drawImage(img,0,0,12,8);
        const data=ctx.getImageData(0,0,12,8).data;

        let r=0,g=0,b=0,count=0;
        for(let i=0;i<data.length;i+=4){
          const alpha=data[i+3]/255;
          if(alpha<.5)continue;
          const rr=data[i],gg=data[i+1],bb=data[i+2];
          const lum=(rr+gg+bb)/3;
          // Ignore extreme black/white pixels so titles/bars do not dominate.
          if(lum<18||lum>238)continue;
          r+=rr;g+=gg;b+=bb;count++;
        }

        if(!count){resolve("");return;}

        r/=count;g/=count;b/=count;

        // Stronger YouTube-like sampled card surface: keep it dark,
        // but let the video's dominant color read clearly.
        const mix=.34;
        const base=[15,15,15];
        const out=[
          Math.round(base[0]*(1-mix)+r*mix),
          Math.round(base[1]*(1-mix)+g*mix),
          Math.round(base[2]*(1-mix)+b*mix)
        ];

        resolve("rgb("+out.join(",")+")");
      }catch{
        resolve("");
      }
    };

    img.onerror=()=>resolve("");
    img.src=url;
  });

  desktopCardColorCache.set(url,task);
  return task;
}

function ensureDesktopCardTint(card){
  if(!card||window.innerWidth<=720)return;

  const art=String(card.dataset.thumb||"").trim();
  if(!art)return;

  fallbackCardTint(card);

  if(card.dataset.tintReady==="1")return;
  card.dataset.tintReady="loading";

  void averageThumbTint(art).then(color=>{
    if(card.dataset.thumb!==art)return;
    if(color)card.style.setProperty("--card-hover-color",color);
    card.dataset.tintReady="1";
  });
}

feed.addEventListener("pointerover",event=>{
  if(window.innerWidth<=720)return;
  ensureDesktopCardTint(event.target.closest("[data-video-id]"));
},{passive:true});

function normalizeThumbnailFit(img){
  if(!img||!img.closest(".thumb-wrap"))return;

  const apply=()=>{
    const w=Number(img.naturalWidth)||0;
    const h=Number(img.naturalHeight)||0;
    if(!w||!h)return;

    const ratio=w/h;
    const target=16/9;
    const delta=Math.abs(ratio-target)/target;

    // Preserve the whole frame when a source thumbnail is not truly 16:9.
    // Normal YouTube 16:9 thumbnails keep cover for a full-bleed image.
    img.classList.toggle("thumb-fit-contain",delta>.035);
  };

  if(img.complete)apply();
  else img.addEventListener("load",apply,{once:true});
}

function normalizeRenderedThumbnails(){
  feed.querySelectorAll(".thumb-wrap img").forEach(normalizeThumbnailFit);
}

feed.addEventListener("load",event=>{
  const img=event.target;
  if(img instanceof HTMLImageElement&&img.closest(".thumb-wrap")){
    normalizeThumbnailFit(img);
  }
},true);

feed.addEventListener("pointerdown",e=>{
  const card=e.target.closest("[data-video-id]");
  const id=card?.dataset?.videoId||"";
  if(id)void primePipAspect(id);
},{passive:true});

feed.addEventListener("click",e=>{
  const retry=e.target.closest(".retry-feed");
  if(retry){
    void loadFeedPreset(state.activeFeed||"latest");
    return;
  }

  const card=e.target.closest("[data-video-id]");
  if(!card)return;
  const id=card.dataset.videoId;
  showWatchRecoInfo(card,{autoHide:true});
  setSeriesContextFromCard(card);
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
    aspectRatio:width/height,
    _aspectVerified:true,
    _aspectSource:"native"
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
    aspectRatio:nextRatio,
    _aspectVerified:true,
    _aspectSource:"native"
  };
  updateCurrentVideoAspect(state.currentMeta);
});

nativePlayer.addEventListener("playing",()=>{
  if(state.engine!=="native")return;
  state.videoPlaying=true;
  if(state.mode==="video")statusText.textContent="Video đang phát";
  applyFloatingIframe();
  try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="playing";}catch{}
});
nativePlayer.addEventListener("pause",()=>{
  if(state.engine!=="native"||state.mode!=="video")return;
  try{if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";}catch{}
});
nativePlayer.addEventListener("ended",()=>{
  if(state.engine!=="native"||state.mode!=="video")return;
  if(advanceSeriesEpisode())return;
  statusText.textContent="Đã phát xong";
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible"){
    // Preserve exactly where the user was reading/watching. iOS/Safari can
    // restore layout in two phases; keeping our own viewport avoids a later
    // jump back toward the main player.
    state.visibilityScrollX=window.scrollX||0;
    state.visibilityScrollY=window.scrollY;
    markPlaybackTransition();
    return;
  }

  const restoreViewport=()=>{
    if(!Number.isFinite(state.visibilityScrollY))return;
    const x=Number(state.visibilityScrollX)||0;
    const y=Math.max(0,Number(state.visibilityScrollY)||0);
    if(Math.abs(window.scrollY-y)>1||Math.abs(window.scrollX-x)>1){
      window.scrollTo(x,y);
    }
  };

  // Restore before playback resumes, then confirm once after layout settles.
  restoreViewport();
  requestAnimationFrame(restoreViewport);

  // Hidden Chrome tabs do no feed/AI maintenance. Resume only the active
  // source feed when the user actually returns to this app.
  if(isSourceScopedFeed(state.activeFeed)&&!state.activeParent&&state.feedRows.length){
    void enrichSourceFeedAi(state.activeFeed,state.feedRows,state.feedSeq);
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

settingsAuthForm?.addEventListener("submit",event=>{
  event.preventDefault();
  submitSettingsAccess();
});
closeSettingsAuth?.addEventListener("click",closeSettingsAuthSheet);
settingsAuthSheet?.addEventListener("click",event=>{
  if(event.target===settingsAuthSheet)closeSettingsAuthSheet();
});
settingsAuthPin?.addEventListener("input",()=>{
  if(settingsAuthError?.textContent)settingsAuthError.textContent="";
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!settingsAuthSheet?.hidden){
    closeSettingsAuthSheet();
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

async function pagedSearch(local,key,query,filters={},reset=false,scope=GENERAL_SOURCE_SCOPE){
  try{
    const rows=await local.searchPage(key,query,{type:"video",...filters},reset);
    return (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row,scope));
  }catch(error){
    console.warn("paged search failed",key,error);
    if(!reset)return [];
    try{
      const rows=await local.search(query,{type:"video",...filters});
      return (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row,scope));
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
const SOURCE_CHANNEL_CACHE_PREFIX="1988-source-channel-v1:";
const SOURCE_CHANNEL_CACHE_MAX_AGE=6*60*60*1000;
const SOURCE_CHANNEL_RECHECK_TTL=8*60*1000;

function readSourceChannelCache(sourceId){
  sourceId=String(sourceId||"").trim();
  if(!sourceId)return {items:[],checkedAt:0,at:0};
  try{
    const row=JSON.parse(localStorage.getItem(SOURCE_CHANNEL_CACHE_PREFIX+sourceId)||"null");
    if(!row||!Array.isArray(row.items))return {items:[],checkedAt:0,at:0};
    const at=Number(row.at)||0;
    const checkedAt=Number(row.checkedAt)||at;
    const items=Date.now()-at<SOURCE_CHANNEL_CACHE_MAX_AGE?row.items:[];
    return {items,checkedAt,at};
  }catch{
    return {items:[],checkedAt:0,at:0};
  }
}

function saveSourceChannelCache(source,rows=[],checkedAt=Date.now()){
  const sourceId=String(source?.id||source||"").trim();
  if(!sourceId)return [];
  const name=clean(source?.name||"");
  const old=readSourceChannelCache(sourceId);
  const incoming=(Array.isArray(rows)?rows:[])
    .filter(Boolean)
    .map(row=>({...row,_sourceId:sourceId,_sourceName:clean(row?._sourceName||name)}));
  const items=compactSourcePool(mergeUniqueRows(old.items,incoming))
    .filter(row=>String(row?._sourceId||"")===sourceId)
    .slice(0,24);
  try{
    localStorage.setItem(SOURCE_CHANNEL_CACHE_PREFIX+sourceId,JSON.stringify({
      at:items.length?Date.now():(old.at||Date.now()),
      checkedAt:Number(checkedAt)||Date.now(),
      items
    }));
  }catch{}
  return items;
}

function cachedRowsForSources(sources=[],scope=GENERAL_SOURCE_SCOPE){
  const blocked=blockedSetForScope(scope);
  const rows=[];
  for(const source of Array.isArray(sources)?sources:[]){
    if(!source?.id||blocked.has(source.id))continue;
    for(const row of readSourceChannelCache(source.id).items){
      if(row)rows.push({...row,_sourceId:source.id,_sourceName:clean(row?._sourceName||source.name)});
    }
  }
  return mergeUniqueRows([],rows);
}

function sourceNeedsRecheck(sourceId){
  const checkedAt=Number(readSourceChannelCache(sourceId).checkedAt)||0;
  return !checkedAt||Date.now()-checkedAt>=SOURCE_CHANNEL_RECHECK_TTL;
}
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

async function fetchSourcePool(local,sources,reset=true,scope=GENERAL_SOURCE_SCOPE,onBatch=null){
  const collected=[];
  let cursor=0;
  const blocked=blockedSetForScope(scope);
  const list=Array.isArray(sources)?sources:[];

  const emit=(rows,source,meta={})=>{
    const batch=(Array.isArray(rows)?rows:[])
      .filter(Boolean)
      .map(row=>({...row,_sourceId:source.id,_sourceName:clean(row?._sourceName||source.name)}));
    if(batch.length)collected.push(...batch);
    if(typeof onBatch==="function"&&batch.length){
      try{onBatch(batch,source,meta)}catch{}
    }
  };

  const worker=async()=>{
    while(cursor<list.length){
      const source=list[cursor++];
      if(!source||blocked.has(source.id))continue;

      const cached=reset?readSourceChannelCache(source.id):{items:[],checkedAt:0};
      if(reset&&cached.items.length){
        emit(cached.items,source,{cached:true});
      }

      // A recent successful check means there is no reason to hit YouTube again yet,
      // even if that check returned no new rows.
      if(reset&&!sourceNeedsRecheck(source.id))continue;

      try{
        const rows=await local.channelVideosPage(
          "library:"+source.id,
          source.id,
          reset
        );

        if(reset){
          saveSourceChannelCache(source,Array.isArray(rows)?rows:[],Date.now());
          if(Array.isArray(rows)&&rows.length)emit(rows,source,{cached:false});
        }else if(Array.isArray(rows)){
          emit(rows,source,{cached:false});
          saveSourceChannelCache(source,[
            ...readSourceChannelCache(source.id).items,
            ...rows
          ],Date.now());
        }
      }catch(error){
        console.warn("source feed failed",source.id,error);
      }
    }
  };

  const workers=Array.from(
    {length:Math.min(4,list.length)},
    ()=>worker()
  );
  await Promise.all(workers);
  return mergeUniqueRows([],collected);
}
function refreshSourcePool(local,sources){
  const signature=sourceSignature();
  if(sourcePoolRefreshPromise&&sourcePoolRefreshSignature===signature){
    return sourcePoolRefreshPromise;
  }

  sourcePoolRefreshSignature=signature;
  sourcePoolRefreshPromise=(async()=>{
    const rows=await fetchSourcePool(local,sources,true,GENERAL_SOURCE_SCOPE);
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
      if(!document.hidden)void refreshSourcePool(local,sources);
      return cached.filter(predicate);
    }

    const fresh=await refreshSourcePool(local,sources);
    return fresh.filter(predicate);
  }

  const extra=await fetchSourcePool(local,sources,false,GENERAL_SOURCE_SCOPE);
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

async function collectRecentPages(local,key,query,predicate,reset=false,filters={},maxPages=3,scope=GENERAL_SOURCE_SCOPE){
  const collected=[];
  let first=reset;

  for(let page=0;page<maxPages;page++){
    const rows=await pagedSearch(local,key,query,filters,first,scope);
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

const FEED_AI_CONTENT_TTL=30*60*1000;
const feedAiPending=new Map();

function feedAiContentKey(name,rows=[]){
  const input=topicInputRows(rows).slice(0,72);
  const body=input.map(row=>row.id+"|"+row.title+"|"+row.contentHash).join("\n");
  return String(name||"feed")+":"+fastHash(body);
}

async function enrichSourceFeedAi(name,rows=[],seq=state.feedSeq){
  if(document.hidden)return;
  if(!isSourceScopedFeed(name)||!Array.isArray(rows)||rows.length<4)return;

  const sample=dedupeHashedRows(newestFirst(rows)).slice(0,72);
  const input=topicInputRows(sample);
  if(input.length<4)return;

  const cacheKey=feedAiContentKey(name,sample);
  const feedParent={
    key:"feed-"+name,
    group:GENERAL_SOURCE_SCOPE,
    label:name==="week"?"Tuần này":"Mới nhất"
  };
  const learning=sourceLearningProfile(feedParent);
  const saved=readAiTrendCache("feed-content:"+cacheKey,input);
  if(saved.videoMeta.size||saved.topics.length){
    if(saved.videoMeta.size){
      state.aiVideoMeta=new Map([...state.aiVideoMeta,...saved.videoMeta]);
    }
    if(saved.topics.length){
      state.feedTrendTopics.set(name,saved.topics.slice(0,10));
    }

    if(seq===state.feedSeq&&state.activeFeed===name&&!state.activeParent){
      state.trendTopics=state.feedTrendTopics.get(name)||[];
      renderTrendTopics();
      if(window.scrollY<120){
        renderCurrentTrendFeed();
      }else{
        patchRenderedAiMeta(sample);
      }
    }
    return;
  }

  if(feedAiPending.has(cacheKey))return feedAiPending.get(cacheKey);

  const task=(async()=>{
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
          scope:"feed:"+name,
          parentLabel:feedParent.label,
          selectedSourceNames:learning.selectedSourceNames,
          blockedSourceNames:learning.blockedSourceNames,
          learnedQueries:learning.learnedQueries,
          videos:input
        })
      });

      const payload=await response.json().catch(()=>null);
      if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));

      const videoMeta=normalizeAiVideoMeta(payload,input);
      const topics=normalizeAiChildTopics(payload,input,feedParent).slice(0,10);
      if(!videoMeta.size&&!topics.length)return;

      if(videoMeta.size){
        state.aiVideoMeta=new Map([...state.aiVideoMeta,...videoMeta]);
      }
      if(topics.length){
        state.feedTrendTopics.set(name,topics);
      }
      saveAiTrendCache("feed-content:"+cacheKey,[],topics,videoMeta);

      if(seq===state.feedSeq&&state.activeFeed===name&&!state.activeParent){
        state.trendTopics=state.feedTrendTopics.get(name)||[];
        renderTrendTopics();

        // Filters never change the source pool or chronological ordering.
        // They only hide cards outside the selected content topic.
        if(window.scrollY<120){
          renderCurrentTrendFeed();
        }else{
          patchRenderedAiMeta(sample);
        }
      }
    }catch(error){
      console.warn("feed AI enrichment failed",name,error);
    }
  })().finally(()=>feedAiPending.delete(cacheKey));

  feedAiPending.set(cacheKey,task);
  return task;
}

async function refreshCachedSourceFeedInBackground(name,preset,seq){
  if(document.hidden)return;
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
    saveSourceContentLearning(GENERAL_SOURCE_SCOPE,extractSourceContentTerms(GENERAL_SOURCE_DISCOVERY_PARENT,rows));
    void enrichSourceFeedAi(name,rows,seq);
    void discoverSourcesForParent(GENERAL_SOURCE_DISCOVERY_PARENT,local);

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
  if(isSourceScopedFeed(name)){
    state.trendTopics=state.feedTrendTopics.get(name)||[];
    renderTrendTopics();
  }
  feedTitle.textContent=preset.title;

  const cached=readFeedCache(name);
  if(cached.length){
    const rows=sortPresetRows(cached,preset);
    state.feedRows=rows;
    renderCurrentTrendFeed();

    if(isSourceScopedFeed(name)){
      state.feedLoading=false;
      state.feedHasMore=true;
      void enrichSourceFeedAi(name,rows,seq);
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
    if(isSourceScopedFeed(name)){
      saveSourceContentLearning(GENERAL_SOURCE_SCOPE,extractSourceContentTerms(GENERAL_SOURCE_DISCOVERY_PARENT,state.feedRows));
    }
    renderCurrentTrendFeed();
    state.feedHasMore=true;
    feedStatus.textContent="";
    if(isSourceScopedFeed(name)){
      void enrichSourceFeedAi(name,state.feedRows,seq);
      void discoverSourcesForParent(GENERAL_SOURCE_DISCOVERY_PARENT,local);
    }
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
    const existingHashes=new Set(
      state.feedRows.map(contentHashForRow).filter(Boolean)
    );
    const added=[];
    for(const row of rows){
      const id=itemVideoId(row);
      const hash=contentHashForRow(row);
      if(!id||existingIds.has(id)||(hash&&existingHashes.has(hash)))continue;
      existingIds.add(id);
      if(hash)existingHashes.add(hash);
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
    if(isSourceScopedFeed(name))void enrichSourceFeedAi(name,state.feedRows,seq);
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
  const clicked=e.target.closest("[data-feed],[data-ai-parent]");
  if(clicked){
    resetHomeViewportInstant();
    document.documentElement.classList.remove("home-header-hidden");
  }

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
setupWatchBrowseLayout();
setupFullscreenReturn();
ensureWatchNavRail();
updateModeUi();
renderParentCategories();

const initialVideoId=extractVideoId(new URL(location.href).searchParams.get("v")||"");
if(initialVideoId){
  void playVideo(initialVideoId,{
    title:"Đang tải thông tin…",
    thumbnailUrl:"https://i.ytimg.com/vi/"+initialVideoId+"/hqdefault.jpg"
  });
}else{
  resetHomeViewportInstant();
  window.addEventListener("pageshow",()=>{
    if(!document.documentElement.classList.contains("watch-browse")){
      resetHomeViewportInstant();
    }
  },{passive:true});
  loadInitialFeed();
}
