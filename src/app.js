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
const sourceGroupRename=$("#sourceGroupRename");
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
const sourceVideoPopupSourceOpen=$("#sourceVideoPopupSourceOpen");
const sourceVideoPopupAvatar=$("#sourceVideoPopupAvatar");
const sourceVideoPopupSourceName=$("#sourceVideoPopupSourceName");
const sourceVideoPopupSourceTarget=$("#sourceVideoPopupSourceTarget");
const sourceVideoPopupSelect=$("#sourceVideoPopupSelect");
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
  searchResultsActive:false,
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

function normalizeCommittedSearchQuery(value=""){
  // Search commit is deterministic and local: no AI/autocomplete rewrite.
  return clean(
    String(value??"")
      .replace(/[\u200B-\u200D\uFEFF]/g,"")
      .replace(/[\r\n\t]+/g," ")
  );
}

const searchCommitState=new WeakMap();

function repairImeCommittedQuery(value,state={}){
  const current=normalizeCommittedSearchQuery(value);
  if(!current)return "";

  // Only repair a duplicated IME commit when composition happened very
  // recently. This prevents changing an intentionally typed repeated word.
  const imeRecent=
    state.pendingEnter||
    state.composing||
    (Date.now()-Number(state.lastCompositionAt||0)<1400);
  if(!imeRecent)return current;

  const history=Array.isArray(state.history)?state.history:[];
  for(let i=history.length-1;i>=0;i--){
    const previous=normalizeCommittedSearchQuery(history[i]?.value||"");
    if(!previous||previous===current)continue;
    if(Date.now()-Number(history[i]?.at||0)>1800)continue;

    const lastWord=previous.split(/\s+/).filter(Boolean).at(-1)||"";
    // Typical Vietnamese IME Enter bug:
    //   jack -> jackjack
    //   anh tho -> anh thotho
    if(lastWord.length>=3&&current===previous+lastWord)return previous;

    // Also cover a duplicated whole query without an inserted space.
    if(previous.length>=3&&current===previous+previous)return previous;
  }

  // Final conservative fallback when the duplicated token itself is exactly
  // two equal halves (jackjack, thotho). Require >=3 chars per half so common
  // short words such as "mama" are not rewritten.
  const parts=current.split(/\s+/);
  const tail=parts.at(-1)||"";
  if(tail.length>=6&&tail.length%2===0){
    const half=tail.length/2;
    const left=tail.slice(0,half);
    const right=tail.slice(half);
    if(left===right&&left.length>=3){
      parts[parts.length-1]=left;
      return parts.join(" ");
    }
  }

  return current;
}

function bindCommittedSearchInput(input,commit,{form=null}={}){
  if(!input||typeof commit!=="function"||searchCommitState.has(input))return;

  const state={
    composing:false,
    pendingEnter:false,
    enterValue:"",
    lastCompositionAt:0,
    history:[],
    imeCommitTimer:0,
    lastCommitValue:"",
    lastCommitAt:0
  };
  searchCommitState.set(input,state);

  const clearImeTimer=()=>{
    if(state.imeCommitTimer){
      clearTimeout(state.imeCommitTimer);
      state.imeCommitTimer=0;
    }
  };

  const resetPending=()=>{
    clearImeTimer();
    state.composing=false;
    state.pendingEnter=false;
    state.enterValue="";
  };

  const remember=value=>{
    const next=normalizeCommittedSearchQuery(value);
    if(!next)return;
    const last=state.history.at(-1);
    if(last?.value===next){
      last.at=Date.now();
      return;
    }
    state.history.push({value:next,at:Date.now()});
    if(state.history.length>12)state.history.splice(0,state.history.length-12);
  };

  const run=value=>{
    const q=repairImeCommittedQuery(value,state);
    if(!q){
      resetPending();
      return;
    }

    // A compositionend + submit pair may arrive in the same tick on desktop
    // Vietnamese IMEs. Commit once, but never keep state that can swallow the
    // next search.
    const now=Date.now();
    if(state.lastCommitValue===q&&now-state.lastCommitAt<160){
      resetPending();
      return;
    }

    input.value=q;
    remember(q);
    state.lastCommitValue=q;
    state.lastCommitAt=now;
    resetPending();
    commit(q);
  };

  const armImeFallback=()=>{
    clearImeTimer();
    state.imeCommitTimer=setTimeout(()=>{
      state.imeCommitTimer=0;
      if(!state.pendingEnter)return;
      // Some browser/IME combinations never deliver compositionend after
      // Enter/blur. Use the current DOM value and fully reset the IME state so
      // search #2, #3, ... cannot be blocked by stale composing/pending flags.
      const value=normalizeCommittedSearchQuery(input.value)||state.enterValue;
      state.composing=false;
      run(value);
    },120);
  };

  input.addEventListener("input",()=>{
    remember(input.value);
  });

  input.addEventListener("focus",()=>{
    // A fresh edit session must never inherit a stale composition flag from
    // the previous submitted query.
    if(!state.pendingEnter){
      clearImeTimer();
      state.composing=false;
      state.enterValue="";
    }
  });

  input.addEventListener("compositionstart",()=>{
    clearImeTimer();
    state.composing=true;
    state.pendingEnter=false;
    state.enterValue="";
    state.lastCompositionAt=Date.now();
    remember(input.value);
  });

  input.addEventListener("compositionend",()=>{
    state.composing=false;
    state.lastCompositionAt=Date.now();
    remember(input.value);
    if(!state.pendingEnter){
      clearImeTimer();
      return;
    }

    const value=normalizeCommittedSearchQuery(input.value)||state.enterValue;
    clearImeTimer();
    queueMicrotask(()=>run(value));
  });

  input.addEventListener("keydown",event=>{
    if(event.key!=="Enter")return;

    // Prevent the browser's native form-submit race in both normal and IME
    // paths. We own exactly one commit for every Enter.
    event.preventDefault();
    remember(input.value);

    if(event.isComposing||state.composing||event.keyCode===229){
      state.pendingEnter=true;
      state.enterValue=normalizeCommittedSearchQuery(input.value);
      state.lastCompositionAt=Date.now();
      armImeFallback();
      return;
    }

    run(input.value);
  });

  input.addEventListener("blur",()=>{
    if(!state.pendingEnter){
      clearImeTimer();
      state.composing=false;
      state.enterValue="";
      return;
    }

    // If blur terminates composition without compositionend, do not leave the
    // form permanently in a pending state.
    armImeFallback();
  });

  if(form){
    form.addEventListener("submit",event=>{
      event.preventDefault();

      if(state.composing){
        state.pendingEnter=true;
        state.enterValue=normalizeCommittedSearchQuery(input.value);
        armImeFallback();
        return;
      }

      // pendingEnter without active composition is stale. Always submit the
      // current input instead of returning early and blocking later searches.
      run(input.value);
    });
  }
}
function searchInputIsComposing(input){
  const row=searchCommitState.get(input);
  return !!row?.composing;
}

const SOURCE_SELECTION_KEY="1988-source-selection-v1";
const SOURCE_CUSTOM_KEY="1988-source-custom-v1";
const SOURCE_HIDDEN_KEY="1988-source-hidden-v1"; // legacy: migrated to blocked
const SOURCE_BLOCKED_KEY="1988-source-blocked-v1";
const SOURCE_GROUPS_KEY="1988-source-groups-v1";
const SOURCE_GROUP_LABELS_KEY="1988-source-group-labels-v1";
const SOURCE_AVATAR_CACHE_KEY="1988-source-avatar-cache-v1";
const VIDEO_ASPECT_HABIT_KEY="1988-video-aspect-habit-v1";
const STATE_SYNC_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-state";
const PACKAGE_SYNC_URL="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-packages";
let stateSyncReady=false;
let stateSyncApplying=false;
let stateSyncDirty=false;
let stateSyncTimer=0;
let stateSyncPushPromise=null;
let sourceWriteClock=Date.now();
const sourceWriteChains=new Map();
const pendingSourceWrites=new Map();
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
const GENERAL_SOURCE_SCOPE="general"; // legacy/search-only scope
const LIVE_SOURCE_SCOPE="live";
const LATEST_SOURCE_SCOPE="latest";
const WEEK_SOURCE_SCOPE="week";

const SOURCE_MANAGER_GROUPS=[
  {key:LIVE_SOURCE_SCOPE,label:"LIVE"},
  {key:LATEST_SOURCE_SCOPE,label:"Mới nhất"},
  {key:WEEK_SOURCE_SCOPE,label:"Tuần này"},
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
  // Labels are presentation only. Source discovery never derives meaning from
  // these names, so a tab can be renamed without changing its learned profile.
  {key:"news",group:"news",label:"Thời sự"},
  {key:"economy",group:"economy",label:"Kinh tế"},
  {key:"law",group:"law",label:"Pháp luật"},
  {key:"film",group:"film",label:"Phim"},
  {key:"music",group:"music",label:"Nhạc"},
  {key:"tech",group:"tech",label:"Công nghệ"},
  {key:"sports",group:"sports",label:"Thể thao"},
  {key:"entertainment",group:"entertainment",label:"Giải trí"}
];
const CONTENT_SOURCE_SCOPES=new Set(FIXED_CONTENT_CATEGORIES.map(item=>item.group));
const FEED_SOURCE_SCOPES=new Set([LATEST_SOURCE_SCOPE,WEEK_SOURCE_SCOPE]);
const MANAGED_SOURCE_SCOPES=new Set([
  LIVE_SOURCE_SCOPE,
  ...FEED_SOURCE_SCOPES,
  ...CONTENT_SOURCE_SCOPES
]);
const AI_SOURCE_SCOPES=new Set([
  // Every managed tab learns suggestions from its own Đã chọn list.
  ...MANAGED_SOURCE_SCOPES
]);
const FEED_SOURCE_DISCOVERY_PARENTS={
  [LATEST_SOURCE_SCOPE]:{
    key:LATEST_SOURCE_SCOPE,
    group:LATEST_SOURCE_SCOPE,
    label:"Mới nhất",
    queries:[]
  },
  [WEEK_SOURCE_SCOPE]:{
    key:WEEK_SOURCE_SCOPE,
    group:WEEK_SOURCE_SCOPE,
    label:"Tuần này",
    queries:[]
  }
};
function feedSourceScope(name=""){
  return name===WEEK_SOURCE_SCOPE?WEEK_SOURCE_SCOPE:LATEST_SOURCE_SCOPE;
}
function feedSourceParent(name=""){
  return FEED_SOURCE_DISCOVERY_PARENTS[feedSourceScope(name)]||FEED_SOURCE_DISCOVERY_PARENTS[LATEST_SOURCE_SCOPE];
}

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

let sourceAvatarCache=readStoredObject(SOURCE_AVATAR_CACHE_KEY);
let sourceGroupLabelOverrides=Object.fromEntries(
  Object.entries(readStoredObject(SOURCE_GROUP_LABELS_KEY))
    .map(([key,label])=>[String(key||"").trim(),clean(label||"").slice(0,32)])
    .filter(([key,label])=>SOURCE_MANAGER_GROUPS.some(item=>item.key===key)&&label)
);

function sourceGroupLabel(key=""){
  key=String(key||"").trim();
  const base=SOURCE_MANAGER_GROUPS.find(item=>item.key===key)?.label||key;
  return clean(sourceGroupLabelOverrides[key]||base).slice(0,32)||base;
}

function sourceCategoryRows(){
  return FIXED_CONTENT_CATEGORIES.map(item=>({
    ...item,
    label:sourceGroupLabel(item.group)
  }));
}

function readScopedSourceState(key){
  const raw=readStoredObject(key);
  const out=new Map();
  for(const scope of MANAGED_SOURCE_SCOPES){
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

let blockedSourceIds=new Set();

let sourceGroupOverrides=readStoredObject(SOURCE_GROUPS_KEY);

function emptyScopedSourceState(){
  return new Map(
    [...MANAGED_SOURCE_SCOPES].map(scope=>[scope,new Set()])
  );
}

let scopedSelectedSourceIds=emptyScopedSourceState();
let scopedBlockedSourceIds=emptyScopedSourceState();
let aiSuggestedSourceIds=new Map(
  [...AI_SOURCE_SCOPES].map(scope=>[scope,new Set()])
);
const temporaryGeneralSourceIds=new Set();
const temporaryLiveSourceIds=new Set();
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
      thumbnailUrl:clean(sourceAvatarCache[row.id]||row.thumbnailUrl||""),
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
  // Only non-authoritative metadata caches may live locally. Manual Chọn/Chặn
  // state is written immediately to Supabase by queueDirectSourceStateWrite().
  try{
    localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));
    localStorage.setItem(SOURCE_GROUPS_KEY,JSON.stringify(sourceGroupOverrides));
    localStorage.setItem(SOURCE_GROUP_LABELS_KEY,JSON.stringify(sourceGroupLabelOverrides));
    localStorage.removeItem(SOURCE_HIDDEN_KEY);
    persistSuggestedSourceState();
  }catch{}
}

function persistScopedSourceState(){
  // Authoritative Chọn/Chặn state is row-based in Supabase, never localStorage.
}

function suggestedSetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(!AI_SOURCE_SCOPES.has(scope))return new Set();
  if(!aiSuggestedSourceIds.has(scope))aiSuggestedSourceIds.set(scope,new Set());
  return aiSuggestedSourceIds.get(scope);
}

function assignSourceGroup(id,group){
  id=String(id||"").trim();
  group=String(group||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!AI_SOURCE_SCOPES.has(group))return false;
  const suggested=suggestedSetForScope(group);
  if(suggested.has(id))return false;
  suggested.add(id);
  return true;
}

let selectedSourceIds=new Set();

function pruneLegacyTemporaryCustomSources(){
  const durable=new Set([...selectedSourceIds,...blockedSourceIds]);
  for(const scope of MANAGED_SOURCE_SCOPES){
    for(const id of selectedSetForScope(scope))durable.add(id);
    for(const id of blockedSetForScope(scope))durable.add(id);
  }
  const before=customSources.length;
  customSources=customSources.filter(row=>row&&durable.has(String(row.id||"")));
  if(customSources.length!==before){
    try{localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));}catch{}
  }
}
// Server state is hydrated before the source manager/feed starts. Do not prune
// metadata against an empty pre-hydration Chọn/Chặn set.

let sourceRemoteResults=[];
let sourceSearchTimer=0;
let sourceSearchSeq=0;
let sourcePreviewSeq=0;
let sourcePreviewRows=new Map();
let sourcePreviewSearchRows=new Map();
let sourcePreviewSearchChannels=new Map();
let sourcePreviewSearchTimer=0;
let sourcePreviewSearchSeq=0;
let sourcePreviewSourceId="";
let sourcePreviewSourceRow=null;
let sourceVideoPopupSourceRow=null;
let sourcePreviewRenderSignature="";
let sourceManageMode=false;
let sourceManageGroup=GENERAL_SOURCE_SCOPE;
let sourceBlockedExpanded=false;
let sourceMetaObserver=null;
const sourceMetaCache=new Map();
const sourceMetaPending=new Set();

function sourceScope(scope=sourceManageGroup){
  scope=String(scope||"").trim();
  if(MANAGED_SOURCE_SCOPES.has(scope))return scope;
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
  for(const scope of MANAGED_SOURCE_SCOPES){
    for(const id of selectedSetForScope(scope))ids.add(id);
    for(const id of blockedSetForScope(scope))ids.add(id);
  }
  return ids;
}

function scopedStateObject(map){
  const out={};
  for(const scope of MANAGED_SOURCE_SCOPES){
    out[scope]=[...(map.get(scope)||new Set())];
  }
  return out;
}

function cleanSourceIdList(value){
  return (Array.isArray(value)?value:[])
    .map(String)
    .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id));
}

function legacyLocalSourceStateSnapshot(){
  const legacyBlocked=[
    ...readStoredArray(SOURCE_BLOCKED_KEY),
    ...readStoredArray(SOURCE_HIDDEN_KEY)
  ];
  const selected=cleanSourceIdList(readStoredArray(SOURCE_SELECTION_KEY));
  const blocked=cleanSourceIdList(legacyBlocked);
  const selectedSet=new Set(selected);
  for(const id of blocked)selectedSet.delete(id);

  const scopedSelectedRaw=readStoredObject(SOURCE_SCOPED_SELECTION_KEY);
  const scopedBlockedRaw=readStoredObject(SOURCE_SCOPED_BLOCKED_KEY);
  const scopedSelected={};
  const scopedBlocked={};
  let scopedCount=0;

  for(const scope of MANAGED_SOURCE_SCOPES){
    const legacyFeedScope=scope===LATEST_SOURCE_SCOPE||scope===WEEK_SOURCE_SCOPE;
    const blockedIds=cleanSourceIdList(
      scopedBlockedRaw?.[scope] ?? (legacyFeedScope?blocked:[])
    );
    const blockedSet=new Set(blockedIds);
    const selectedIds=cleanSourceIdList(
      scopedSelectedRaw?.[scope] ?? (legacyFeedScope?[...selectedSet]:[])
    ).filter(id=>!blockedSet.has(id));
    scopedSelected[scope]=selectedIds;
    scopedBlocked[scope]=blockedIds;
    scopedCount+=selectedIds.length+blockedIds.length;
  }

  return {
    selected:[...selectedSet],
    blocked,
    scopedSelected,
    scopedBlocked,
    hasState:selectedSet.size>0||blocked.length>0||scopedCount>0
  };
}

function clearLegacyLocalSourceState(){
  try{
    for(const key of [
      SOURCE_SELECTION_KEY,
      SOURCE_BLOCKED_KEY,
      SOURCE_HIDDEN_KEY,
      SOURCE_SCOPED_SELECTION_KEY,
      SOURCE_SCOPED_BLOCKED_KEY,
      SOURCE_SCOPED_MIGRATION_KEY,
      SOURCE_SCOPE_ISOLATION_KEY,
      SOURCE_SCOPE_ISOLATION_BACKUP_KEY,
      SOURCE_FILM_SNAPSHOT_RECOVERY_KEY,
      SOURCE_FILM_SNAPSHOT_BACKUP_KEY,
      SOURCE_FILM_RECOVERY_KEY,
      SOURCE_FILM_RECOVERY_BACKUP_KEY,
      SOURCE_FILM_LEGACY_BACKUP_KEY
    ])localStorage.removeItem(key);
  }catch{}
}

function serverStateSnapshot(){
  const durableIds=allManagedStateIds();
  return {
    sourceScopeVersion:3,
    selected:cleanSourceIdList([...selectedSourceIds]),
    blocked:cleanSourceIdList([...blockedSourceIds]),
    customSources:(Array.isArray(customSources)?customSources:[]).map(row=>({
      id:String(row?.id||""),
      name:clean(row?.name||""),
      thumbnailUrl:safeSourceThumb(row?.thumbnailUrl||""),
      subscribers:clean(row?.subscribers||"")
    })).filter(row=>
      /^UC[A-Za-z0-9_-]+$/.test(row.id) &&
      row.name &&
      durableIds.has(row.id)
    ),
    sourceGroups:{},
    sourceLabels:Object.fromEntries(
      SOURCE_MANAGER_GROUPS
        .map(item=>[item.key,sourceGroupLabelOverrides[item.key]||""])
        .filter(([,label])=>!!label)
    ),
    scopedSelected:scopedStateObject(scopedSelectedSourceIds),
    scopedBlocked:scopedStateObject(scopedBlockedSourceIds),
    avatars:{}
  };
}

function saveServerMetadataCachesLocally(){
  try{
    localStorage.setItem(SOURCE_CUSTOM_KEY,JSON.stringify(customSources));
    localStorage.setItem(SOURCE_GROUPS_KEY,JSON.stringify(sourceGroupOverrides));
    localStorage.setItem(SOURCE_GROUP_LABELS_KEY,JSON.stringify(sourceGroupLabelOverrides));
    localStorage.setItem(SOURCE_AVATAR_CACHE_KEY,JSON.stringify(sourceAvatarCache));
  }catch{}
  clearLegacyLocalSourceState();
}

function applyServerState(remote={}){
  if(!remote||typeof remote!=="object"||Array.isArray(remote))return false;

  stateSyncApplying=true;
  try{
    if(Array.isArray(remote.selected)){
      selectedSourceIds=new Set(cleanSourceIdList(remote.selected));
    }
    if(Array.isArray(remote.blocked)){
      blockedSourceIds=new Set(cleanSourceIdList(remote.blocked));
      for(const id of blockedSourceIds)selectedSourceIds.delete(id);
    }

    if(Array.isArray(remote.customSources)){
      customSources=remote.customSources
        .filter(row=>row&&/^UC[A-Za-z0-9_-]+$/.test(String(row.id||""))&&row.name)
        .map(row=>({
          id:String(row.id),
          name:clean(row.name),
          thumbnailUrl:safeSourceThumb(row.thumbnailUrl||""),
          subscribers:clean(row.subscribers||"")
        }));
    }

    if(remote.sourceGroups&&typeof remote.sourceGroups==="object"&&!Array.isArray(remote.sourceGroups)){
      sourceGroupOverrides=remote.sourceGroups;
    }

    if(remote.sourceLabels&&typeof remote.sourceLabels==="object"&&!Array.isArray(remote.sourceLabels)){
      sourceGroupLabelOverrides=Object.fromEntries(
        Object.entries(remote.sourceLabels)
          .map(([key,label])=>[String(key||"").trim(),clean(label||"").slice(0,32)])
          .filter(([key,label])=>SOURCE_MANAGER_GROUPS.some(item=>item.key===key)&&label)
      );
    }

    const scopeVersion=Number(remote.sourceScopeVersion)||0;
    const remoteScopedSelected=
      remote.scopedSelected&&typeof remote.scopedSelected==="object"
        ?remote.scopedSelected
        :{};
    const remoteScopedBlocked=
      remote.scopedBlocked&&typeof remote.scopedBlocked==="object"
        ?remote.scopedBlocked
        :{};

    const nextSelected=new Map();
    const nextBlocked=new Map();
    for(const scope of MANAGED_SOURCE_SCOPES){
      const migrateLegacyFeed=
        scopeVersion<2 &&
        (scope===LATEST_SOURCE_SCOPE||scope===WEEK_SOURCE_SCOPE) &&
        !Array.isArray(remoteScopedSelected?.[scope]) &&
        !Array.isArray(remoteScopedBlocked?.[scope]);

      const blockedIds=cleanSourceIdList(
        migrateLegacyFeed?[...blockedSourceIds]:remoteScopedBlocked?.[scope]
      );
      const blockedSet=new Set(blockedIds);
      const selectedIds=cleanSourceIdList(
        migrateLegacyFeed?[...selectedSourceIds]:remoteScopedSelected?.[scope]
      ).filter(id=>!blockedSet.has(id));

      nextSelected.set(scope,new Set(selectedIds));
      nextBlocked.set(scope,blockedSet);
    }
    scopedSelectedSourceIds=nextSelected;
    scopedBlockedSourceIds=nextBlocked;

    if(remote.avatars&&typeof remote.avatars==="object"&&!Array.isArray(remote.avatars)){
      sourceAvatarCache={...sourceAvatarCache,...remote.avatars};
      for(const [id,imageRaw] of Object.entries(sourceAvatarCache)){
        const image=safeSourceThumb(imageRaw);
        if(!image)continue;
        const base=BASE_CHANNEL_BY_ID.get(id);
        if(base)base.thumbnailUrl=image;
        const custom=customSources.find(row=>row?.id===id);
        if(custom)custom.thumbnailUrl=image;
      }
    }

    saveServerMetadataCachesLocally();
    applySourceGroupLabelsUi?.();
    stateSyncDirty=(Number(remote.sourceScopeVersion)||0)<2;
    invalidateSourceStateNameIndex?.();
    return true;
  }finally{
    stateSyncApplying=false;
  }
}

async function stateSyncFetch(method="GET",body=null,timeout=2200,{keepalive=false}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(STATE_SYNC_URL,{
      method,
      cache:"no-store",
      keepalive,
      signal:controller.signal,
      headers:{
        "content-type":"application/json",
        "x-1988-pin":SETTINGS_PIN
      },
      body:body==null?undefined:JSON.stringify(body)
    });
    if(!response.ok)throw new Error("state_sync_"+response.status);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

function nextSourceWriteVersion(){
  const now=Date.now();
  sourceWriteClock=Math.max(now,sourceWriteClock+1);
  return sourceWriteClock;
}

function directSourceWritePayload(id,status,scope){
  id=String(id||"").trim();
  scope=sourceScope(scope);
  const row=stateMetadataCandidate(id);
  const meta=row?sourceMetaFor(row):{};
  return {
    op:"set_source",
    scope,
    channel_id:id,
    status:status==="selected"||status==="blocked"?status:"normal",
    version:nextSourceWriteVersion(),
    source:{
      name:clean(meta?.name||row?.name||""),
      thumbnailUrl:safeSourceThumb(meta?.thumbnailUrl||row?.thumbnailUrl||""),
      subscribers:clean(meta?.subscribers||row?.subscribers||"")
    }
  };
}

function queueDirectSourceStateWrite(id,status,scope){
  const op=directSourceWritePayload(id,status,scope);
  if(!/^UC[A-Za-z0-9_-]+$/.test(op.channel_id))return Promise.resolve(false);
  const key=op.scope+"|"+op.channel_id;
  pendingSourceWrites.set(key,op);

  const previous=sourceWriteChains.get(key)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    const latest=pendingSourceWrites.get(key);
    if(!latest||latest.version!==op.version)return true;

    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const result=await stateSyncFetch("POST",latest,attempt===0?2600:4200);
        if(!result?.ok)throw new Error("source_state_write_failed");
        if(pendingSourceWrites.get(key)?.version===latest.version){
          pendingSourceWrites.delete(key);
        }
        return true;
      }catch(error){
        lastError=error;
        if(attempt===0)await new Promise(resolve=>setTimeout(resolve,120));
      }
    }

    stateSyncDirty=true;
    console.warn("1988 direct source state write failed",latest.scope,latest.channel_id,lastError);
    return false;
  }).finally(()=>{
    if(sourceWriteChains.get(key)===task)sourceWriteChains.delete(key);
  });

  sourceWriteChains.set(key,task);
  return task;
}

function flushPendingSourceWritesOnPageHide(){
  for(const op of pendingSourceWrites.values()){
    try{
      void fetch(STATE_SYNC_URL,{
        method:"POST",
        cache:"no-store",
        keepalive:true,
        headers:{
          "content-type":"application/json",
          "x-1988-pin":SETTINGS_PIN
        },
        body:JSON.stringify(op)
      });
    }catch{}
  }
}

window.addEventListener("pagehide",flushPendingSourceWritesOnPageHide,{capture:true});

async function pushServerStateNow({force=false}={}){
  if((!stateSyncReady&&!force)||stateSyncApplying)return false;
  if(stateSyncPushPromise)return stateSyncPushPromise;

  clearTimeout(stateSyncTimer);
  stateSyncTimer=0;

  const payload={state:serverStateSnapshot(),version:Date.now()};
  stateSyncPushPromise=stateSyncFetch("POST",payload,4200)
    .then(result=>{
      const ok=!!result?.ok;
      stateSyncDirty=!ok;
      if(ok)clearLegacyLocalSourceState();
      return ok;
    })
    .catch(error=>{
      stateSyncDirty=true;
      console.warn("1988 state push failed",error);
      return false;
    })
    .finally(()=>{stateSyncPushPromise=null;});

  return stateSyncPushPromise;
}

function scheduleServerStatePush(delay=140){
  stateSyncDirty=true;
  if(!stateSyncReady||stateSyncApplying)return;
  clearTimeout(stateSyncTimer);
  stateSyncTimer=setTimeout(
    ()=>void pushServerStateNow(),
    Math.max(80,Number(delay)||140)
  );
}

async function hydrateServerState(){
  let lastError=null;

  for(let attempt=0;attempt<2;attempt++){
    try{
      const result=await stateSyncFetch("GET",null,attempt===0?3200:4600);
      if(result?.ok&&result?.exists&&result.state){
        applyServerState(result.state);
        stateSyncReady=true;
        if(stateSyncDirty){
          await pushServerStateNow({force:true});
        }
        clearLegacyLocalSourceState();
        return true;
      }

      if(result?.ok&&!result?.exists){
        // One-time migration path only. After this write Chọn/Chặn is server-only.
        const legacy=legacyLocalSourceStateSnapshot();
        if(legacy.hasState){
          selectedSourceIds=new Set(legacy.selected);
          blockedSourceIds=new Set(legacy.blocked);
          scopedSelectedSourceIds=new Map(
            [...MANAGED_SOURCE_SCOPES].map(scope=>[
              scope,
              new Set(cleanSourceIdList(legacy.scopedSelected?.[scope]))
            ])
          );
          scopedBlockedSourceIds=new Map(
            [...MANAGED_SOURCE_SCOPES].map(scope=>[
              scope,
              new Set(cleanSourceIdList(legacy.scopedBlocked?.[scope]))
            ])
          );
        }else{
          selectedSourceIds=new Set(channelLibrary().slice(0,12).map(row=>row.id));
          blockedSourceIds=new Set();
          scopedSelectedSourceIds=emptyScopedSourceState();
          scopedBlockedSourceIds=emptyScopedSourceState();
        }

        for(const id of blockedSourceIds)selectedSourceIds.delete(id);
        for(const scope of MANAGED_SOURCE_SCOPES){
          const selected=scopedSelectedSourceIds.get(scope)||new Set();
          for(const id of scopedBlockedSourceIds.get(scope)||[])selected.delete(id);
        }

        stateSyncReady=true;
        stateSyncDirty=true;
        const saved=await pushServerStateNow({force:true});
        if(saved){
          clearLegacyLocalSourceState();
          return true;
        }
        stateSyncReady=false;
        return false;
      }
    }catch(error){
      lastError=error;
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,220));
    }
  }

  stateSyncReady=false;
  console.warn("1988 state pull failed; refusing local Chọn/Chặn fallback",lastError);
  return false;
}

let lastServerStateRefreshAt=0;

async function refreshServerStateOnResume(){
  if(stateSyncApplying||stateSyncPushPromise)return;
  if(Date.now()-lastServerStateRefreshAt<15000)return;
  lastServerStateRefreshAt=Date.now();

  if(stateSyncDirty&&stateSyncReady){
    const saved=await pushServerStateNow();
    if(saved)return;
  }

  try{
    const result=await stateSyncFetch("GET",null,3200);
    if(result?.ok&&result?.exists&&result.state){
      applyServerState(result.state);
      stateSyncReady=true;
      if(stateSyncDirty)await pushServerStateNow({force:true});
      if(sourcesBtn){
        sourcesBtn.disabled=false;
        sourcesBtn.removeAttribute("title");
      }
      await warmSelectedAvatarImages(500);
      renderParentCategories();
      if(!document.documentElement.classList.contains("watch-browse")){
        const active=state.activeFeed||"latest";
        void loadFeedPreset(active);
        // Returning to the app should also check for newly uploaded videos,
        // not merely repaint the last cached package.
        setTimeout(()=>{
          if(isSourceScopedFeed(active)){
            void refreshCachedSourceFeedInBackground(
              active,
              FEED_PRESETS[active],
              state.feedSeq
            );
          }else if(active===LIVE_SOURCE_SCOPE){
            void refreshLiveSnapshotInBackground();
          }
        },120);
      }
    }
  }catch{}
}

window.addEventListener("pageshow",()=>void refreshServerStateOnResume(),{passive:true});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")void refreshServerStateOnResume();
},{passive:true});


function temporarySetForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  if(AI_SOURCE_SCOPES.has(scope))return suggestedSetForScope(scope);
  if(scope===GENERAL_SOURCE_SCOPE)return temporaryGeneralSourceIds;
  return new Set();
}

function sourceDiscoveryParentForGroup(group=sourceManageGroup){
  group=sourceScope(group);
  if(!MANAGED_SOURCE_SCOPES.has(group))return null;
  const tab=SOURCE_MANAGER_GROUPS.find(item=>item.key===group);
  return {
    key:group,
    group,
    // Label is UI only; the source learner uses scope + selected content.
    label:sourceGroupLabel(group)||tab?.label||group,
    queries:[]
  };
}

function unselectedSourceIdsForScope(scope=sourceManageGroup){
  scope=sourceScope(scope);
  // LIVE needs a broad bootstrap only until the first explicit choice.
  // After that, "Chưa chọn" means learned suggestions just like every tab.
  if(scope===LIVE_SOURCE_SCOPE&&!selectedSetForScope(scope).size){
    return temporaryLiveSourceIds;
  }
  return suggestedSetForScope(scope);
}

function allTemporarySourceIds(){
  const ids=new Set([...temporaryGeneralSourceIds,...temporaryLiveSourceIds]);
  for(const scope of AI_SOURCE_SCOPES){
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
  if(state.activeFeed===LIVE_SOURCE_SCOPE)return LIVE_SOURCE_SCOPE;
  if(state.activeParent&&CONTENT_SOURCE_SCOPES.has(state.activeParent))return state.activeParent;
  if(isSourceScopedFeed(state.activeFeed))return feedSourceScope(state.activeFeed);
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
  const requestedScope=String(scope||"").trim();
  scope=sourceScope(scope);
  id=String(id||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return;

  invalidateSourceStateNameIndex();
  const selected=selectedSetForScope(scope);
  const blocked=blockedSetForScope(scope);
  const beforeSelected=new Set(selected);
  const beforeBlocked=new Set(blocked);

  const temporaryKnown=
    temporaryGeneralSourceIds.has(id)||
    temporaryLiveSourceIds.has(id)||
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
    void ensureSourceMeta(id);
    void prewarmSelectedSourceAvatars();
  }else if(status==="blocked"){
    persistStateSourceMetadata(id);
    selected.delete(id);
    blocked.add(id);
  }else{
    selected.delete(id);
    blocked.delete(id);
  }

  temporaryGeneralSourceIds.delete(id);
  if(scope!==LIVE_SOURCE_SCOPE)temporaryLiveSourceIds.delete(id);
  if(AI_SOURCE_SCOPES.has(scope))suggestedSetForScope(scope).delete(id);

  if(status==="blocked")hideBlockedSourceNow(id,scope);

  // One user action may change durable state for this channel ID only.
  const changedSelected=[...new Set([...beforeSelected,...selected])].filter(
    sourceId=>beforeSelected.has(sourceId)!==selected.has(sourceId)
  );
  const changedBlocked=[...new Set([...beforeBlocked,...blocked])].filter(
    sourceId=>beforeBlocked.has(sourceId)!==blocked.has(sourceId)
  );
  if(
    changedSelected.some(sourceId=>sourceId!==id)||
    changedBlocked.some(sourceId=>sourceId!==id)
  ){
    console.error("source state integrity violation",{
      id,scope,status,changedSelected,changedBlocked
    });
    selected.clear();
    blocked.clear();
    for(const sourceId of beforeSelected)selected.add(sourceId);
    for(const sourceId of beforeBlocked)blocked.add(sourceId);

    if(status==="selected"){
      blocked.delete(id);
      selected.add(id);
    }else if(status==="blocked"){
      selected.delete(id);
      blocked.add(id);
    }else{
      selected.delete(id);
      blocked.delete(id);
    }
  }

  void queueDirectSourceStateWrite(id,status,scope);
  persistSourceLibrary();
  persistSourceSelection();
  state.sourceLibraryDirty=true;
  state.aiCategoryRows=new Map();
  state.aiCategoryTopics=new Map();
  sourceDiscoveryAt.delete(scope);
  clearSourceContentLearning(scope);
  refreshSourceManager();
  syncSourcePreviewHeader();
  syncSourceVideoPopupSource();

  // Relearn the "Chưa chọn" suggestions immediately from the new Đã chọn
  // state while the manager is open. The same path is used for every tab.
  if(sourceManageMode&&!sourcesSheet?.hidden){
    const parent=sourceDiscoveryParentForGroup(scope);
    if(parent){
      setTimeout(()=>{
        if(sourcesSheet.hidden||sourceScope(sourceManageGroup)!==scope)return;
        void localEngine(12000)
          .then(local=>discoverSourcesForParent(parent,local))
          .catch(()=>{});
      },80);
    }
  }
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

function sourceAvatarCached(id=""){
  id=String(id||"").trim();
  if(!id)return "";
  return safeSourceThumb(
    sourceAvatarCache[id]||
    libraryRow(id)?.thumbnailUrl||
    ""
  );
}

function rememberSourceAvatar(id="",image=""){
  id=String(id||"").trim();
  image=safeSourceThumb(image);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!image)return "";

  if(sourceAvatarCache[id]!==image){
    sourceAvatarCache[id]=image;
    try{localStorage.setItem(SOURCE_AVATAR_CACHE_KEY,JSON.stringify(sourceAvatarCache));}catch{}
  }
  queueAvatarRuntimeCache(image);
  void warmAvatarImage(image);

  const base=BASE_CHANNEL_BY_ID.get(id);
  if(base)base.thumbnailUrl=image;

  const custom=customSources.find(row=>row?.id===id);
  if(custom)custom.thumbnailUrl=image;

  const cached=sourceMetaCache.get(id);
  if(cached&&!safeSourceThumb(cached.thumbnailUrl||"")){
    sourceMetaCache.set(id,{...cached,thumbnailUrl:image});
  }

  return image;
}

function canonicalSourceId(row={},channel=""){
  const direct=String(
    row?._sourceId||
    row?.channelId||
    row?.uploaderId||
    row?.authorId||
    ""
  ).trim();
  if(/^UC[A-Za-z0-9_-]+$/.test(direct))return direct;

  const sourceUrl=clean(
    row?.channelUrl||
    row?.uploaderUrl||
    row?.authorUrl||
    row?.ownerUrl||
    row?.url||
    ""
  );
  const urlId=sourceUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/i)?.[1]||"";
  if(/^UC[A-Za-z0-9_-]+$/.test(urlId))return urlId;

  const target=normalizeSearchText(channel||row?._displaySource||row?.uploaderName||row?.uploader||row?.channelName||row?._sourceName||"");
  if(!target)return "";

  const match=channelLibrary().find(source=>
    normalizeSearchText(source.name||"")===target
  );
  return String(match?.id||"").trim();
}

const avatarImageWarmCache=new Map();
const avatarImageWarmReady=new Set();
const avatarImageWarmFailedAt=new Map();
const avatarRuntimeCacheQueued=new Set();
let avatarRuntimeCacheTimer=0;

function flushAvatarRuntimeCache(){
  avatarRuntimeCacheTimer=0;
  if(!avatarRuntimeCacheQueued.size)return;
  const urls=[...avatarRuntimeCacheQueued];
  avatarRuntimeCacheQueued.clear();
  try{
    navigator.serviceWorker?.controller?.postMessage?.({
      type:"CACHE_AVATARS",
      urls
    });
  }catch{}
}

function queueAvatarRuntimeCache(url=""){
  url=safeSourceThumb(url);
  if(!url)return;
  avatarRuntimeCacheQueued.add(url);
  if(avatarRuntimeCacheTimer)return;
  avatarRuntimeCacheTimer=setTimeout(flushAvatarRuntimeCache,40);
}

function avatarImageReady(url=""){
  url=safeSourceThumb(url);
  return !!url&&avatarImageWarmReady.has(url);
}

function warmAvatarImage(url=""){
  url=safeSourceThumb(url);
  if(!url)return Promise.resolve(false);
  queueAvatarRuntimeCache(url);
  if(avatarImageWarmReady.has(url))return Promise.resolve(true);
  if(Date.now()-(avatarImageWarmFailedAt.get(url)||0)<5*60*1000)return Promise.resolve(false);
  const cached=avatarImageWarmCache.get(url);
  if(cached)return cached;

  const task=new Promise(resolve=>{
    const img=new Image();
    img.decoding="async";
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      if(value){
        avatarImageWarmReady.add(url);
        avatarImageWarmFailedAt.delete(url);
      }else{
        avatarImageWarmFailedAt.set(url,Date.now());
        avatarImageWarmCache.delete(url);
      }
      resolve(value);
    };
    img.onload=async()=>{
      try{await img.decode?.();}catch{}
      finish(img.naturalWidth>0);
    };
    img.onerror=()=>finish(false);
    img.src=url;
    if(img.complete){
      if(img.naturalWidth){
        Promise.resolve(img.decode?.()).catch(()=>{}).finally(()=>finish(true));
      }else{
        finish(false);
      }
    }
  });

  avatarImageWarmCache.set(url,task);
  return task;
}

async function warmSelectedAvatarImages(maxWait=900){
  const ids=new Set([...selectedSourceIds]);
  for(const scope of MANAGED_SOURCE_SCOPES){
    for(const id of selectedSetForScope(scope))ids.add(id);
  }

  const urls=[...ids].map(id=>sourceAvatarCached(id)).filter(Boolean);
  urls.forEach(queueAvatarRuntimeCache);
  if(!urls.length)return;

  await Promise.race([
    Promise.allSettled(urls.map(warmAvatarImage)),
    new Promise(resolve=>setTimeout(resolve,Math.max(200,Number(maxWait)||900)))
  ]);
}

async function warmManagedAvatarImages(maxWait=900){
  const ids=new Set([...allManagedStateIds()]);
  for(const id of allTemporarySourceIds())ids.add(id);

  const urls=[...ids].map(id=>sourceAvatarCached(id)).filter(Boolean);
  urls.forEach(queueAvatarRuntimeCache);
  if(!urls.length)return;

  await Promise.race([
    Promise.allSettled(urls.map(warmAvatarImage)),
    new Promise(resolve=>setTimeout(resolve,Math.max(180,Number(maxWait)||900)))
  ]);
}

function sourceAvatarForRow(row={},sourceId="",channel=""){
  sourceId=String(sourceId||canonicalSourceId(row,channel)||"").trim();

  const direct=safeSourceThumb(
    row?.uploaderThumbnailUrl||
    row?.channelThumbnailUrl||
    row?._sourceThumbnailUrl||
    row?.uploaderAvatar||
    row?.channelAvatar||
    row?.authorAvatar||
    row?.ownerAvatar||
    row?.avatar||
    ""
  );
  if(direct&&sourceId)return rememberSourceAvatar(sourceId,direct);
  if(direct)return direct;

  const meta=sourceId?sourceMetaCache.get(sourceId):null;
  const cached=safeSourceThumb(
    meta?.thumbnailUrl||
    sourceAvatarCached(sourceId)||
    ""
  );
  if(cached&&sourceId)return rememberSourceAvatar(sourceId,cached);
  return cached;
}


function sourceMetaFor(row={}){
  const normalized=window.MediaMeta?.source?.(row)||{};
  const id=String(row?.id||normalized.id||"").trim();
  const remote=sourceMetaCache.get(id)||{};
  const thumbnailUrl=safeSourceThumb(
    remote?.thumbnailUrl||
    sourceAvatarCached(id)||
    normalized.avatar||
    row?.thumbnailUrl||
    ""
  );
  const name=clean(
    remote?.name||
    row?.name||
    normalized.name||
    ""
  );
  if(id&&thumbnailUrl)rememberSourceAvatar(id,thumbnailUrl);
  return {...row,...normalized,...remote,id,name,thumbnailUrl};
}

function sourceMetaComplete(id,row=null){
  id=String(id||row?.id||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return false;
  const meta=sourceMetaFor(row||{id});
  return !!clean(meta.name)&&!!safeSourceThumb(meta.thumbnailUrl||"");
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

// Legacy local scope migration is intentionally disabled. Server state is authoritative.

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
// Historic Film recovery is intentionally disabled after server-state migration.

function sourceGroupLabels(row={}){
  return sourceGroupsFor(row)
    .filter(key=>key!=="other")
    .slice(0,2)
    .map(key=>sourceGroupLabel(key))
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
  const id=String(
    row?.id||
    row?._sourceId||
    row?.channelId||
    row?.uploaderId||
    ""
  ).trim();

  if(!/^UC[A-Za-z0-9_-]+$/.test(id)){
    return {status:"normal",canonicalId:""};
  }

  const blocked=blockedSetForScope(scope);
  const selected=selectedSetForScope(scope);

  if(blocked.has(id))return {status:"blocked",canonicalId:id};
  if(selected.has(id))return {status:"selected",canonicalId:id};
  return {status:"normal",canonicalId:id};
}

function reconcileSourceState(row={},scope=sourceManageGroup){
  const match=matchSourceState(row,scope);
  return {...match,changed:false};
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
  const totalIds=new Set([
    ...unselectedSourceIdsForScope(scope),
    ...selected,
    ...blocked
  ]);
  const selectedCount=[...selected].filter(id=>!blocked.has(id)).length;
  const blockedCount=blocked.size;
  const totalCount=totalIds.size;

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
  const fallback=(clean(meta.name||row?.name||"?").charAt(0)||"?").toUpperCase();

  if(image&&!avatarImageReady(image)&&row?.id){
    void warmAvatarImage(image).then(ok=>{
      if(ok)updateSourceRowMeta(String(row.id||""));
    });
  }

  return '<span class="source-avatar">'+
    (image&&avatarImageReady(image)
      ?'<img src="'+esc(image)+'" alt="" width="36" height="36" decoding="async">'
      :'<span class="source-avatar-fallback" aria-hidden="true">'+esc(fallback)+'</span>')+
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
  const groupLabel=sourceGroupLabel(sourceManageGroup);
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
  if(!replacement)return;

  const currentAction=current.querySelector(".source-add,.source-toggle,.source-state-actions");
  const nextAction=replacement.querySelector(".source-add,.source-toggle,.source-state-actions");
  if((currentAction?.className||"")!==(nextAction?.className||"")){
    current.replaceWith(replacement);
    return;
  }

  const currentAvatar=current.querySelector(".source-avatar");
  const nextAvatar=replacement.querySelector(".source-avatar");
  if(currentAvatar&&nextAvatar)currentAvatar.replaceChildren(...[...nextAvatar.childNodes].map(node=>node.cloneNode(true)));

  const currentName=current.querySelector(".source-row-name");
  const nextName=replacement.querySelector(".source-row-name");
  if(currentName&&nextName)currentName.textContent=nextName.textContent||"";

  const currentSub=current.querySelector(".source-row-sub");
  const nextSub=replacement.querySelector(".source-row-sub");
  if(currentSub&&nextSub)currentSub.textContent=nextSub.textContent||"";
}

async function ensureSourceMeta(id,{engine=null}={}){
  id=String(id||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||sourceMetaPending.has(id)||sourceMetaComplete(id))return;

  sourceMetaPending.add(id);
  try{
    const local=engine||await localEngine(12000);
    const meta=await local.channelMeta(id);
    if(meta&&meta.id){
      sourceMetaCache.set(id,{...sourceMetaCache.get(id),...meta});
      const image=rememberSourceAvatar(id,meta.thumbnailUrl||"");
      if(image)await warmAvatarImage(image);
      invalidateSourceStateNameIndex();
      updateSourceRowMeta(id);
    }
  }catch(error){
    console.warn("channel meta failed",id,error);
  }finally{
    sourceMetaPending.delete(id);
  }
}

async function prewarmSourceSearchMetadata(rows=[],engine=null,maxWait=1200){
  const ids=[...new Set(
    (Array.isArray(rows)?rows:[])
      .map(row=>String(row?.id||"").trim())
      .filter(id=>/^UC[A-Za-z0-9_-]+$/.test(id)&&!sourceMetaComplete(id))
  )];
  if(!ids.length)return;

  const local=engine||await localEngine(12000);
  const queue=ids.slice();
  const workers=Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length){
      const id=queue.shift();
      if(id)await ensureSourceMeta(id,{engine:local});
    }
  });
  const work=Promise.allSettled(workers);

  await Promise.race([
    work,
    new Promise(resolve=>setTimeout(resolve,Math.max(300,Number(maxWait)||1200)))
  ]);
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
    if(id&&!sourceMetaComplete(id))sourceMetaObserver.observe(row);
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
  for(const group of AI_SOURCE_SCOPES){
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
    const ids=new Set([
      ...unselectedSourceIdsForScope(group.key),
      ...selectedSetForScope(group.key),
      ...blockedSetForScope(group.key)
    ]);
    const count=ids.size;
    return '<button class="source-group-chip'+(sourceManageGroup===group.key?' active':'')+'" type="button" data-source-group="'+esc(group.key)+'">'+
      esc(sourceGroupLabel(group.key))+' <span>'+count+'</span>'+
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

  const scopedStateIds=new Set([
    ...selectedSetForScope(sourceManageGroup),
    ...blockedSetForScope(sourceManageGroup)
  ]);
  const scopedSuggestionIds=sourceManageMode
    ?unselectedSourceIdsForScope(sourceManageGroup)
    :new Set();

  const groupFilter=row=>{
    if(q||!sourceManageMode)return true;
    return scopedStateIds.has(row.id)||scopedSuggestionIds.has(row.id);
  };

  const remoteMatchIds=new Set(
    q
      ?sourceRemoteResults.map(row=>String(row?.id||"").trim()).filter(Boolean)
      :[]
  );

  const localRows=rows.filter(row=>
    groupFilter(row)&&
    (
      !q||
      normalizeSearchText(sourceMetaFor(row).name||row.name).includes(q)||
      remoteMatchIds.has(String(row?.id||"").trim())
    )
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

    if(
      !unselectedHtml.length&&
      !selectedRows.length&&!selectedRemote.length&&
      !blockedRows.length&&!blockedRemote.length
    ){
      const message=q
        ?"Không có nguồn phù hợp"
        :sourceManageGroup===LIVE_SOURCE_SCOPE
          ?"Chưa có nguồn LIVE đang phát"
          :"Chưa có nguồn trong tab này";
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

function applySourceGroupLabelsUi(){
  const latestButton=topicChips?.querySelector('[data-feed="'+LATEST_SOURCE_SCOPE+'"]');
  const weekButton=topicChips?.querySelector('[data-feed="'+WEEK_SOURCE_SCOPE+'"]');
  const liveButton=topicChips?.querySelector('[data-feed="'+LIVE_SOURCE_SCOPE+'"]');

  if(latestButton)latestButton.textContent=sourceGroupLabel(LATEST_SOURCE_SCOPE);
  if(weekButton)weekButton.textContent=sourceGroupLabel(WEEK_SOURCE_SCOPE);
  if(liveButton){
    liveButton.setAttribute("aria-label",sourceGroupLabel(LIVE_SOURCE_SCOPE));
    liveButton.setAttribute("title",sourceGroupLabel(LIVE_SOURCE_SCOPE));
  }

  renderParentCategories();

  if(!state.searchResultsActive){
    if(state.activeParent){
      feedTitle.textContent=sourceGroupLabel(state.activeParent);
    }else if(MANAGED_SOURCE_SCOPES.has(sourceScope(state.activeFeed))){
      feedTitle.textContent=sourceGroupLabel(state.activeFeed);
    }
  }
}

function renameSourceGroup(group=sourceManageGroup){
  group=sourceScope(group);
  if(!sourceManageMode||!MANAGED_SOURCE_SCOPES.has(group))return false;

  const current=sourceGroupLabel(group);
  const entered=window.prompt("Đổi tên nguồn",current);
  if(entered===null)return false;

  const next=clean(entered).slice(0,32);
  if(!next||next===current)return false;

  sourceGroupLabelOverrides[group]=next;
  try{
    localStorage.setItem(SOURCE_GROUP_LABELS_KEY,JSON.stringify(sourceGroupLabelOverrides));
  }catch{}

  scheduleServerStatePush(80);
  applySourceGroupLabelsUi();
  refreshSourceManager();
  return true;
}

function refreshSourceManager(){
  const rows=managedChannelLibrary();
  renderSourceLibrary(rows);
  updateSourceSummary(rows);
}

function rememberSearchedSourceCandidates(rows=[]){
  for(const row of Array.isArray(rows)?rows:[]){
    const id=String(row?.id||"").trim();
    if(!/^UC[A-Za-z0-9_-]+$/.test(id))continue;

    const next={...sourceMetaCache.get(id),...row};
    sourceMetaCache.set(id,next);

    const image=safeSourceThumb(next.thumbnailUrl||row?.thumbnailUrl||"");
    if(image)rememberSourceAvatar(id,image);
  }
}



async function sourceSearchAlternates(query){
  const q=normalizeCommittedSearchQuery(query);
  if(q.length<2)return [];

  const out=[];
  const seen=new Set([normalizeSearchText(q)]);
  const push=value=>{
    value=normalizeCommittedSearchQuery(value);
    const norm=normalizeSearchText(value);
    if(!norm||seen.has(norm))return;
    seen.add(norm);
    out.push(value);
  };

  try{
    const response=await api("suggestions",{q},1200);
    const rows=Array.isArray(response?.data)?response.data:[];
    for(const value of rows){
      const norm=normalizeSearchText(value);
      if(!norm.includes(normalizeSearchText(q)))continue;
      push(value);
      if(out.length>=3)break;
    }
  }catch{}

  if(out.length<2)push(q+" official");
  if(out.length<3)push(q+" channel");

  return out.slice(0,3);
}



async function searchSourceChannels(query){
  const q=normalizeCommittedSearchQuery(query);
  const seq=++sourceSearchSeq;
  if(q.length<2){
    sourceRemoteResults=[];
    if(sourceSearchStatus)sourceSearchStatus.textContent="";
    renderSourceLibrary();
    return;
  }

  if(sourceSearch)sourceSearch.value=q;
  if(sourceSearchStatus)sourceSearchStatus.textContent="Đang tìm kênh…";

  const byId=new Map();
  const stats=new Map();
  const qNorm=normalizeSearchText(q);

  const addCandidate=(row,via="channel")=>{
    if(!row)return false;
    const candidate=/^UC[A-Za-z0-9_-]+$/.test(String(row?.id||""))
      ?sourceMetaFor(row)
      :sourceCandidateFromVideo(row);
    const id=String(candidate?.id||"").trim();
    if(!candidate||!/^UC[A-Za-z0-9_-]+$/.test(id))return false;

    if(!byId.has(id)){
      byId.set(id,candidate);
    }else{
      const current=byId.get(id)||{};
      byId.set(id,{
        ...current,
        ...candidate,
        thumbnailUrl:candidate.thumbnailUrl||current.thumbnailUrl||"",
        subscribers:candidate.subscribers||current.subscribers||""
      });
    }

    const nameNorm=normalizeSearchText(candidate.name||"");
    let score=0;
    if(nameNorm===qNorm)score+=90;
    else if(nameNorm.startsWith(qNorm))score+=60;
    else if(nameNorm.includes(qNorm))score+=40;

    if(via==="video")score+=75;
    else if(via==="expanded-video")score+=65;
    else if(via==="preview")score+=55;
    else if(via==="channel")score+=30;
    else score+=20;

    const prev=stats.get(id)||{score:0,hits:0};
    stats.set(id,{
      score:prev.score+score+(prev.hits?10:0),
      hits:prev.hits+1
    });
    return true;
  };

  const rankedCandidates=()=>[...byId.values()]
    .sort((a,b)=>{
      const bs=stats.get(String(b?.id||""))?.score||0;
      const as=stats.get(String(a?.id||""))?.score||0;
      if(bs!==as)return bs-as;
      return clean(a?.name||"").localeCompare(clean(b?.name||""),"vi");
    })
    .slice(0,24);

  const publish=()=>{
    if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return false;
    sourceRemoteResults=rankedCandidates();
    rememberSearchedSourceCandidates(sourceRemoteResults);
    if(sourceSearchStatus){
      sourceSearchStatus.textContent=sourceRemoteResults.length
        ?"Có "+sourceRemoteResults.length+" kênh phù hợp"
        :"Đang tìm kênh…";
    }
    renderSourceLibrary();
    return !!sourceRemoteResults.length;
  };

  const consume=(rows,via)=>{
    if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;
    for(const row of Array.isArray(rows)?rows:[])addCandidate(row,via);
    if(byId.size)publish();
  };

  // If the right-side global search already resolved the same query, reuse its
  // channels immediately so the two panes can never disagree about "no result".
  if(
    normalizeSearchText(sourcePreviewSearch?.value||"")===qNorm
  ){
    for(const row of sourcePreviewSearchChannels.values())addCandidate(row,"preview");
    for(const row of sourcePreviewSearchRows.values())addCandidate(row,"preview");
    if(byId.size)publish();
  }

  // Same stateless/fresh path as main search and the right preview pane.
  const fresh=Date.now();
  const videoJob=api("search",{
    q,
    filter:"videos",
    _fresh:fresh
  },4200).then(response=>consume(response?.data?.items,"video")).catch(()=>{});

  const channelJob=api("search",{
    q,
    filter:"channels",
    _fresh:fresh+1
  },3400).then(response=>consume(response?.data?.items,"channel")).catch(()=>{});

  await Promise.allSettled([videoJob,channelJob]);
  if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

  // Mixed search is the first fallback. It often contains the right uploader
  // even when a direct channel-name lookup does not (e.g. artist alias cases).
  if(!byId.size){
    try{
      const response=await api("search",{
        q,
        filter:"all",
        _fresh:Date.now()
      },3800);
      consume(response?.data?.items,"video");
    }catch{}
  }

  if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

  // "Kiểu 2": broaden only when direct discovery is still weak.
  if(!byId.size){
    const alternates=await sourceSearchAlternates(q);
    if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

    for(const alt of alternates.slice(0,2)){
      try{
        const response=await api("search",{
          q:alt,
          filter:"videos",
          _fresh:Date.now()
        },3600);
        consume(response?.data?.items,"expanded-video");
      }catch{}
      if(byId.size>=12)break;
    }
  }

  if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

  // youtubei.js is last-resort only; never make the source list depend on it.
  if(!byId.size){
    try{
      const local=await localEngine(1200);
      const [videos,channels]=await Promise.allSettled([
        Promise.race([
          local.search(q,{type:"video"}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("source_video_timeout")),1800))
        ]),
        Promise.race([
          local.searchChannels(q,{includeVideos:false}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("source_channel_timeout")),1800))
        ])
      ]);

      if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;
      if(videos.status==="fulfilled")consume(videos.value,"video");
      if(channels.status==="fulfilled")consume(channels.value,"channel");
    }catch{}
  }

  if(seq!==sourceSearchSeq||sourcesSheet?.hidden)return;

  if(byId.size){
    publish();
    return;
  }

  sourceRemoteResults=[];
  const localMatches=managedChannelLibrary().filter(row=>
    normalizeSearchText(sourceMetaFor(row).name||row.name).includes(qNorm)
  );

  if(sourceSearchStatus){
    sourceSearchStatus.textContent=localMatches.length
      ?"Có "+localMatches.length+" kênh trong thư viện"
      :"Không tìm thấy kênh phù hợp";
  }
  renderSourceLibrary();
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
  sourceSearchTimer=setTimeout(()=>void searchSourceChannels(q),120);
}

function sourceCandidateFromVideo(row={}){
  const normalized=window.MediaMeta?.source?.(row)||{};
  const name=clean(normalized.name||
    row?._sourceName||
    row?.uploaderName||
    row?.uploader||
    row?.channelName||
    row?.name||
    row?._displaySource||
    ""
  );
  const id=canonicalSourceId(row,name)||String(normalized.id||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!name)return null;

  return {
    id,
    name,
    thumbnailUrl:safeSourceThumb(
      normalized.avatar||
      row?.uploaderThumbnailUrl||
      row?.channelThumbnailUrl||
      row?._sourceThumbnailUrl||
      row?.uploaderAvatar||
      row?.channelAvatar||
      row?.authorAvatar||
      ""
    ),
    subscribers:clean(row?.subscribers||"")
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

    if(hint&&AI_SOURCE_SCOPES.has(hint)){
      if(assignSourceGroup(candidate.id,hint))suggestionChanged=true;
    }else if(hint===LIVE_SOURCE_SCOPE){
      if(!temporaryLiveSourceIds.has(candidate.id)){
        temporaryLiveSourceIds.add(candidate.id);
        suggestionChanged=true;
      }
    }else if(hint===GENERAL_SOURCE_SCOPE){
      if(!temporaryGeneralSourceIds.has(candidate.id)){
        temporaryGeneralSourceIds.add(candidate.id);
        suggestionChanged=true;
      }
    }else if(!temporaryGeneralSourceIds.has(candidate.id)){
      temporaryGeneralSourceIds.add(candidate.id);
      suggestionChanged=true;
    }
  }

  if(stateChanged)persistReconciledSourceState();
  if(stateChanged||suggestionChanged)updateSourceSummary();
}

let liveSourceCandidateRefreshPromise=null;

// Strong recurring negatives learned from the user's LIVE block history.
// Keep this conservative: only channel-name signals that repeatedly appeared
// in Đã chặn (plus explicit Forex/Gold/Trading terms requested by the user).
// LIVE blocked state is manual/personal only. Discovery may read the exact
// blocked channel IDs as exclusions, but code/AI never invents new blocked rows.

function rememberLiveSourceCandidates(rows=[],{replace=false}={}){
  const liveRows=(Array.isArray(rows)?rows:[])
    .filter(row=>row?.isLive);

  if(replace)temporaryLiveSourceIds.clear();

  const accepted=[];
  for(const row of liveRows){
    const candidate=sourceCandidateFromVideo(row);
    if(!candidate)continue;

    sourceMetaCache.set(candidate.id,{
      ...sourceMetaCache.get(candidate.id),
      ...candidate
    });

    reconcileSourceState(candidate,LIVE_SOURCE_SCOPE);
    if(isBlockedSourceRow(row,LIVE_SOURCE_SCOPE))continue;

    temporaryLiveSourceIds.add(candidate.id);
    accepted.push(row);
  }

  if(liveRows.length||replace)updateSourceSummary();
  return accepted;
}

function seedLiveSourceCandidatesFromCache(){
  try{
    const rows=readFeedCache(LIVE_SOURCE_SCOPE);
    if(rows.length)rememberLiveSourceCandidates(rows,{replace:true});
  }catch{}
}

async function refreshLiveSourceCandidatesInBackground(){
  if(liveSourceCandidateRefreshPromise)return liveSourceCandidateRefreshPromise;

  liveSourceCandidateRefreshPromise=(async()=>{
    try{
      const local=await localEngine(12000);
      let rows=[];
      const liveSourceIds=new Set();

      try{
        let first=true;
        for(let page=0;page<3&&liveSourceIds.size<24;page++){
          const batch=await pagedSearch(
            local,
            "live-source-manager",
            "trực tiếp",
            {features:["live"],sort_by:"upload_date"},
            first,
            LIVE_SOURCE_SCOPE
          );
          first=false;
          if(!Array.isArray(batch)||!batch.length)break;

          for(const row of batch){
            if(row?.isLive!==true)continue;
            if(isBlockedSourceRow(row,LIVE_SOURCE_SCOPE))continue;
            rows.push(row);
            const candidate=sourceCandidateFromVideo(row);
            if(candidate)liveSourceIds.add(candidate.id);
          }
        }
      }catch{}

      rows=mergeUniqueRows([],rows).filter(row=>row?.isLive===true);
      if(!rows.length){
        try{
          rows=(await local.homePage("live-source-manager",true))
            .filter(row=>row?.isLive)
            .filter(row=>!isBlockedSourceRow(row,LIVE_SOURCE_SCOPE));
        }catch{}
      }

      if(rows.length&&typeof local?.filterEmbeddableRows==="function"){
        rows=await local.filterEmbeddableRows(rows,{
          concurrency:4,
          requirePlayable:false
        });
      }

      const liveRows=rememberLiveSourceCandidates(rows,{replace:true});
      if(!sourcesSheet?.hidden&&sourceManageGroup===LIVE_SOURCE_SCOPE){
        refreshSourceManager();
      }
      return liveRows;
    }catch(error){
      console.warn("live source refresh failed",error);
      return [];
    }finally{
      liveSourceCandidateRefreshPromise=null;
    }
  })();

  return liveSourceCandidateRefreshPromise;
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

  const currentStatus=sourceStatus(id,sourceManageGroup);

  // Mở/Lưu nguồn is temporary until the user explicitly chooses Chọn/Chặn.
  // Only the clicked channel ID is added; all sibling search results stay ephemeral.
  if(currentStatus==="normal"){
    if(sourceManageGroup===LIVE_SOURCE_SCOPE){
      temporaryLiveSourceIds.add(id);
    }else if(AI_SOURCE_SCOPES.has(sourceManageGroup)){
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
    sourceSearch.placeholder=sourceManageMode
      ?"Tìm nguồn hoặc kênh YouTube"
      :"Tìm kênh trên YouTube";
  }

  if(render)refreshSourceManager();
}


function sourcePreviewScopeLabel(){
  if(sourceManageGroup===GENERAL_SOURCE_SCOPE)return "Nguồn";
  return sourceGroupLabel(sourceManageGroup)||"Nguồn";
}

function syncSourcePreviewHeader(){
  if(!sourcePreview)return;
  const id=sourcePreviewSourceId;
  const row=sourcePreviewSourceRow;

  // The right search is global YouTube search, not "search inside this source".
  // It stays available even when no channel is currently selected.
  if(sourcePreviewSearch){
    sourcePreviewSearch.disabled=false;
    sourcePreviewSearch.placeholder="Tìm kênh hoặc video YouTube";
  }

  if(!id||!row){
    sourcePreview.classList.add("is-empty");
    if(sourcePreviewTitle)sourcePreviewTitle.textContent="Xem nguồn";
    if(sourcePreviewStatus)sourcePreviewStatus.textContent="Tìm kênh/video hoặc chọn một kênh bên trái để xem.";
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
  const thumbnailUrl=sourceAvatarForRow(video,id,name);
  return {
    id,
    name:name||"Kênh YouTube",
    thumbnailUrl,
    subscribers:clean(video?.subscribers||"")
  };
}

function sourceResultRow(rowOrVideo={}){
  const base=/^UC[A-Za-z0-9_-]+$/.test(String(rowOrVideo?.id||""))
    ?rowOrVideo
    :sourceRowFromVideo(rowOrVideo);
  const id=String(base?.id||"").trim();
  if(!id)return null;

  return sourcePreviewSearchChannels.get(id)||
    sourceMetaCache.get(id)||
    libraryRow(id)||
    managedChannelLibrary().find(item=>item.id===id)||
    base;
}

function sourceResultAvatarHtml(row={}){
  const meta=sourceMetaFor(row);
  const image=safeSourceThumb(meta.thumbnailUrl||"");
  const fallback=(clean(meta.name||row?.name||"?").charAt(0)||"?").toUpperCase();
  return '<span class="source-avatar source-result-avatar">'+
    (image
      ?'<img src="'+esc(image)+'" alt="" width="40" height="40" loading="lazy" decoding="async">'
      :'<span class="source-avatar-fallback" aria-hidden="true">'+esc(fallback)+'</span>')+
  '</span>';
}

function sourceQuickAddLabel(row={}){
  const id=String(row?.id||"").trim();
  const status=id?sourceStatus(id,sourceManageGroup):"normal";
  if(status==="selected")return "✓ Đã chọn";
  return "+ "+sourcePreviewScopeLabel();
}

function quickSelectSource(row={}){
  const id=String(row?.id||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return false;

  const meta=sourceMetaFor(row);
  const candidate={
    id,
    name:clean(meta.name||row?.name)||"Kênh YouTube",
    thumbnailUrl:safeSourceThumb(meta.thumbnailUrl||row?.thumbnailUrl||""),
    subscribers:clean(meta.subscribers||row?.subscribers||"")
  };

  sourceMetaCache.set(id,{...sourceMetaCache.get(id),...candidate});
  if(candidate.thumbnailUrl)rememberSourceAvatar(id,candidate.thumbnailUrl);

  if(!libraryHas(id)&&!allManagedStateIds().has(id)){
    addSource(candidate);
  }
  setSourceStatus(id,"selected",sourceManageGroup);

  sourcePreviewRenderSignature="";
  renderSourcePreviewVideos({force:true});
  syncSourceVideoPopupSource();
  return true;
}

function sourcePreviewVideoCard(video,{searchResult=false}={}){
  const media=videoUiMeta(video);
  const videoId=media.id;
  const source=sourceResultRow(video);
  const sourceName=clean(source?.name||media.channel);
  const metaText=[media.published,media.viewsLabel].filter(Boolean).join(" · ");
  const sourceId=String(source?.id||"").trim();

  return '<article class="source-video-card'+(searchResult?' search-result':'')+'" data-source-video-card="'+esc(videoId)+'">'+
    '<button class="source-video-row" type="button" data-source-video-id="'+esc(videoId)+'">'+
      '<img src="'+esc(media.thumbnail)+'" alt="" loading="lazy">'+
      '<span class="source-video-copy">'+
        '<span class="source-video-title">'+esc(media.title)+'</span>'+
        (searchResult&&sourceName?'<span class="source-video-source">'+esc(sourceName)+'</span>':"")+
        '<span class="source-video-meta">'+esc(metaText)+'</span>'+
      '</span>'+
    '</button>'+
    (searchResult&&sourceId
      ?'<div class="source-card-source-bar">'+
          '<button class="source-card-source-main" type="button" data-source-open-channel="'+esc(sourceId)+'" data-source-video-ref="'+esc(videoId)+'">'+
            sourceResultAvatarHtml(source)+
            '<span><strong>'+esc(sourceName||"Kênh YouTube")+'</strong><small>Mở nguồn</small></span>'+
          '</button>'+
          '<button class="source-quick-add" type="button" data-source-quick-select="'+esc(sourceId)+'" data-source-video-ref="'+esc(videoId)+'">'+
            esc(sourceQuickAddLabel(source))+
          '</button>'+
        '</div>'
      :"")+
  '</article>';
}

function sourcePreviewSearchChannelCard(row={}){
  const meta=sourceMetaFor(row);
  const status=matchSourceState(row,sourceManageGroup).status;
  const statusText=status==="selected"?"Đã chọn":status==="blocked"?"Đã chặn":"Kênh YouTube";
  return '<article class="source-video-card search-result source-channel-result" data-source-search-channel-card="'+esc(row.id)+'">'+
    '<button class="source-video-row" type="button" data-source-search-channel="'+esc(row.id)+'">'+
      sourceResultAvatarHtml(row)+
      '<span class="source-video-copy">'+
        '<span class="source-video-title">'+esc(meta.name||row.name||"Kênh YouTube")+'</span>'+
        '<span class="source-video-meta">'+esc([statusText,meta.subscribers].filter(Boolean).join(" · "))+'</span>'+
      '</span>'+
    '</button>'+
    '<button class="source-quick-add" type="button" data-source-quick-select="'+esc(row.id)+'">'+
      esc(sourceQuickAddLabel(row))+
    '</button>'+
  '</article>';
}

function sourcePreviewRowsNormalized(rows=[],id=sourcePreviewSourceId,row=sourcePreviewSourceRow){
  const sourceName=clean(sourceMetaFor(row||{}).name||row?.name||"");
  return newestFirst(Array.isArray(rows)?rows:[])
    .filter(video=>itemVideoId(video))
    .slice(0,24)
    .map(video=>({
      ...video,
      _sourceId:id||video?._sourceId||video?.channelId||"",
      channelId:video?.channelId||id||"",
      _sourceName:sourceName||video?._sourceName||video?.uploader||""
    }));
}

function sourcePreviewSignature(rows=[],searching=false){
  return [
    sourcePreviewSourceId,
    searching?"search":"channel",
    ...rows.map(video=>itemVideoId(video))
  ].join("|");
}

function renderSourcePreviewLoading(){
  if(!sourcePreviewList)return;
  const signature="loading|"+sourcePreviewSourceId;
  if(sourcePreviewRenderSignature===signature)return;
  sourcePreviewRenderSignature=signature;
  sourcePreviewList.innerHTML=
    '<div class="source-preview-loading" aria-label="Đang tải video">'+
      '<span></span><span></span><span></span>'+
    '</div>';
}

function renderSourcePreviewVideos({force=false}={}){
  if(!sourcePreviewList)return;
  const q=clean(sourcePreviewSearch?.value||"");
  const searching=q.length>=2;

  if(searching){
    const channels=[...sourcePreviewSearchChannels.values()];
    const videos=[...sourcePreviewSearchRows.values()];
    const signature=[
      "global-search",
      q,
      ...channels.map(row=>row.id),
      ...videos.map(itemVideoId)
    ].join("|");
    if(!force&&signature===sourcePreviewRenderSignature)return;
    sourcePreviewRenderSignature=signature;

    if(!channels.length&&!videos.length){
      sourcePreviewList.innerHTML='<div class="source-empty">Không có kết quả phù hợp</div>';
      return;
    }

    const parts=[];
    if(channels.length){
      parts.push('<div class="source-group-label">Kênh · '+channels.length+'</div>');
      parts.push(channels.map(sourcePreviewSearchChannelCard).join(""));
    }
    if(videos.length){
      parts.push('<div class="source-group-label">Video · '+videos.length+'</div>');
      parts.push(videos.map(video=>sourcePreviewVideoCard(video,{searchResult:true})).join(""));
    }
    sourcePreviewList.innerHTML=parts.join("");
    return;
  }

  const all=[...sourcePreviewRows.values()];
  const signature=sourcePreviewSignature(all,false);
  if(!force&&signature===sourcePreviewRenderSignature)return;
  sourcePreviewRenderSignature=signature;

  if(!all.length){
    sourcePreviewList.innerHTML=
      '<div class="source-preview-placeholder">'+
        '<strong>Xem trước nguồn ngay tại đây</strong>'+
        '<span>Tìm kênh/video ở ô trên hoặc chọn một kênh bên trái.</span>'+
      '</div>';
    return;
  }

  sourcePreviewList.innerHTML=all
    .map(video=>sourcePreviewVideoCard(video,{searchResult:false}))
    .join("");
}



async function searchPreviewVideos(query){
  const q=normalizeCommittedSearchQuery(query);
  const seq=++sourcePreviewSearchSeq;

  if(q.length<2){
    sourcePreviewSearchRows=new Map();
    sourcePreviewSearchChannels=new Map();
    sourcePreviewRenderSignature="";
    renderSourcePreviewVideos({force:true});
    return;
  }

  if(sourcePreviewSearch)sourcePreviewSearch.value=q;

  const channelMap=new Map();
  const videoMap=new Map();

  const addChannel=row=>{
    if(!row)return false;
    const candidate=/^UC[A-Za-z0-9_-]+$/.test(String(row?.id||""))
      ?sourceMetaFor(row)
      :sourceCandidateFromVideo(row);
    const id=String(candidate?.id||"").trim();
    if(!candidate||!/^UC[A-Za-z0-9_-]+$/.test(id))return false;

    if(!channelMap.has(id)){
      channelMap.set(id,candidate);
    }else{
      const current=channelMap.get(id)||{};
      channelMap.set(id,{
        ...current,
        ...candidate,
        thumbnailUrl:candidate.thumbnailUrl||current.thumbnailUrl||"",
        subscribers:candidate.subscribers||current.subscribers||""
      });
    }
    return true;
  };

  const addVideos=rows=>{
    let added=0;
    for(const video of Array.isArray(rows)?rows:[]){
      const id=itemVideoId(video);
      if(!id||videoMap.has(id))continue;
      videoMap.set(id,video);
      addChannel(video);
      added++;
      if(videoMap.size>=24)break;
    }
    return added;
  };

  const addMixedRows=rows=>{
    for(const row of Array.isArray(rows)?rows:[])addChannel(row);
    addVideos(rows);
  };

  const publish=()=>{
    if(seq!==sourcePreviewSearchSeq||sourcesSheet?.hidden)return false;

    sourcePreviewSearchChannels=new Map(
      [...channelMap.values()].slice(0,12).map(row=>[row.id,row])
    );
    sourcePreviewSearchRows=new Map(
      [...videoMap.values()].slice(0,24).map(video=>[itemVideoId(video),video])
    );
    rememberSearchedSourceCandidates([...sourcePreviewSearchChannels.values()]);

    // Keep the left source pane in sync when both boxes contain the same query.
    // The right pane has already proved these channel IDs are valid results.
    if(
      normalizeSearchText(sourceSearch?.value||"")===normalizeSearchText(q) &&
      sourcePreviewSearchChannels.size
    ){
      const merged=new Map(
        sourceRemoteResults.map(row=>[String(row?.id||"").trim(),row])
      );
      for(const row of sourcePreviewSearchChannels.values()){
        const id=String(row?.id||"").trim();
        if(id)merged.set(id,row);
      }
      sourceRemoteResults=[...merged.values()].slice(0,24);
      rememberSearchedSourceCandidates(sourceRemoteResults);
      if(sourceSearchStatus){
        sourceSearchStatus.textContent="Có "+sourceRemoteResults.length+" kênh phù hợp";
      }
      renderSourceLibrary();
    }

    sourcePreviewRenderSignature="";
    renderSourcePreviewVideos({force:true});
    return !!(sourcePreviewSearchChannels.size||sourcePreviewSearchRows.size);
  };

  const stillCurrent=()=>seq===sourcePreviewSearchSeq&&!sourcesSheet?.hidden;

  // Use the same proven path as the main/Kira search: every submit gets fresh,
  // stateless backend requests. youtubei.js is not allowed to race or suppress
  // these results.
  const fresh=Date.now();

  const videoJob=api("search",{
    q,
    filter:"videos",
    _fresh:fresh
  },4200).then(response=>{
    if(!stillCurrent())return;
    addVideos(response?.data?.items);
    if(videoMap.size||channelMap.size)publish();
  }).catch(()=>{});

  const channelJob=api("search",{
    q,
    filter:"channels",
    _fresh:fresh+1
  },3400).then(response=>{
    if(!stillCurrent())return;
    for(const row of Array.isArray(response?.data?.items)?response.data.items:[]){
      addChannel(row);
      if(channelMap.size>=12)break;
    }
    if(videoMap.size||channelMap.size)publish();
  }).catch(()=>{});

  await Promise.allSettled([videoJob,channelJob]);
  if(!stillCurrent())return;

  // If one backend surface is temporarily empty, retry through YouTube's mixed
  // search surface before ever showing "Không có kết quả phù hợp".
  if(!videoMap.size&&!channelMap.size){
    try{
      const response=await api("search",{
        q,
        filter:"all",
        _fresh:Date.now()
      },3800);
      if(!stillCurrent())return;
      addMixedRows(response?.data?.items);
      if(videoMap.size||channelMap.size)publish();
    }catch{}
  }

  if(!stillCurrent())return;

  // Last-resort only: local youtubei.js may recover an upstream backend miss,
  // but it never delays or replaces the normal direct search.
  if(!videoMap.size&&!channelMap.size){
    try{
      const local=await localEngine(1200);
      const [videos,channels]=await Promise.allSettled([
        Promise.race([
          local.search(q,{type:"video"}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("preview_video_timeout")),1800))
        ]),
        Promise.race([
          local.searchChannels(q,{includeVideos:false}),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("preview_channel_timeout")),1800))
        ])
      ]);

      if(!stillCurrent())return;

      if(videos.status==="fulfilled")addVideos(videos.value);
      if(channels.status==="fulfilled"){
        for(const row of Array.isArray(channels.value)?channels.value:[])addChannel(row);
      }
      if(videoMap.size||channelMap.size)publish();
    }catch{}
  }

  if(!stillCurrent())return;

  if(!videoMap.size&&!channelMap.size){
    sourcePreviewSearchRows=new Map();
    sourcePreviewSearchChannels=new Map();
    sourcePreviewRenderSignature="";
    renderSourcePreviewVideos({force:true});
    return;
  }

  publish();

  // Results stay instant, then missing channel avatars/names are enriched in
  // place so the user can recognize and add a source without opening it first.
  const missingMeta=[...channelMap.values()].filter(row=>!sourceMetaComplete(row.id,row));
  if(missingMeta.length){
    void prewarmSourceSearchMetadata(missingMeta,null,1200).then(()=>{
      if(!stillCurrent())return;
      for(const [id,row] of channelMap){
        const enriched=sourceMetaCache.get(id);
        if(enriched)channelMap.set(id,{...row,...enriched});
      }
      publish();
    }).catch(()=>{});
  }
}
function schedulePreviewVideoSearch(){
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchTimer=0;
  sourcePreviewSearchSeq++;

  const q=clean(sourcePreviewSearch?.value||"");

  if(q.length<2){
    sourcePreviewSearchRows=new Map();
    sourcePreviewSearchChannels=new Map();
    sourcePreviewRenderSignature="";
    renderSourcePreviewVideos({force:true});
    return;
  }

  // Right-side search is global YouTube search. Never prepend the selected
  // channel name and never restrict results to the currently previewed source.
  sourcePreviewSearchRows=new Map();
  sourcePreviewSearchChannels=new Map();
  sourcePreviewRenderSignature="";
  if(sourcePreviewList){
    sourcePreviewList.innerHTML='<div class="source-empty">Đang tìm kênh và video…</div>';
  }
  sourcePreviewSearchTimer=setTimeout(()=>void searchPreviewVideos(q),120);
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

  // Search results only navigate to the channel preview. They never add/select
  // a source implicitly; Chọn/Chặn remains an explicit user action.
  sourceMetaCache.set(base.id,{...sourceMetaCache.get(base.id),...base});
  sourcePreviewSearchRows=new Map();
  sourcePreviewSearchChannels=new Map();
  if(sourcePreviewSearch)sourcePreviewSearch.value="";
  void openSourcePreview(base.id,base);

  try{
    const local=await localEngine(8000);
    const meta=await local.channelMeta(base.id);
    if(meta&&meta.id){
      const row={...base,...meta,name:clean(meta.name)||base.name};
      sourceMetaCache.set(row.id,row);
      if(sourcePreviewSourceId===row.id){
        sourcePreviewSourceRow=row;
        syncSourcePreviewHeader();
      }
    }
  }catch{}
}

async function openSourcePreview(id,rowHint=null){
  const cachedMeta=sourceMetaCache.get(id)||null;
  const row=
    libraryRow(id)||
    rowHint||
    sourceRemoteResults.find(item=>item.id===id)||
    managedChannelLibrary().find(item=>item.id===id)||
    (cachedMeta?{id,...cachedMeta}:null);
  if(!row||!sourcePreview)return;

  const seq=++sourcePreviewSeq;
  sourcePreviewSourceId=id;
  sourcePreviewSourceRow=row;
  sourcePreviewRenderSignature="";
  sourcePreview.hidden=false;
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchSeq++;
  sourcePreviewSearchRows=new Map();
  sourcePreviewSearchChannels=new Map();
  if(sourcePreviewSearch)sourcePreviewSearch.value="";
  closeSourceVideo();
  syncSourcePreviewHeader();

  // Prepare the destination pane while the source list is still visible.
  // Cached channel rows prevent the browse -> blank -> content flash.
  const cachedRows=sourcePreviewRowsNormalized(readSourceChannelCache(id).items,id,row);
  sourcePreviewRows=new Map(
    cachedRows.map(video=>[itemVideoId(video),video]).filter(([videoId])=>videoId)
  );
  if(cachedRows.length)renderSourcePreviewVideos({force:true});
  else renderSourcePreviewLoading();

  // Switch the parent pane only after the preview has real/stable geometry.
  if(sourcesSheet)sourcesSheet.dataset.previewOpen="true";

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
          rows=(Array.isArray(fallback)?fallback:[]).filter(video=>{
            const channelId=String(video?.channelId||video?._sourceId||video?.uploaderId||"").trim();
            if(channelId&&channelId===id)return true;
            const uploader=normalizeSearchText(video?.uploader||video?._sourceName||"");
            return !!uploader&&uploader===normalizedName;
          });
        }catch(error){
          console.warn("channel preview fallback failed",id,error);
        }
      }
    }

    if(seq!==sourcePreviewSeq)return;

    const ordered=sourcePreviewRowsNormalized(rows,id,row).slice(0,20);
    if(ordered.length){
      saveSourceChannelCache(
        {id,name:clean(sourceMetaFor(row).name||row.name||"")},
        ordered,
        Date.now()
      );
      sourcePreviewRows=new Map(
        ordered.map(video=>[itemVideoId(video),video]).filter(([videoId])=>videoId)
      );
      renderSourcePreviewVideos();
    }else if(!cachedRows.length){
      sourcePreviewRows=new Map();
      sourcePreviewRenderSignature="";
      renderSourcePreviewVideos({force:true});
    }
  }catch(error){
    if(seq!==sourcePreviewSeq)return;
    console.warn("channel preview failed",error);
    if(!sourcePreviewRows.size){
      sourcePreviewRenderSignature="error|"+id;
      sourcePreviewList.innerHTML='<div class="source-empty">Chưa tải được video của kênh</div>';
    }
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

function syncSourceVideoPopupSource(row=sourceVideoPopupSourceRow){
  if(!sourceVideoPopupSourceName||!sourceVideoPopupSelect)return;

  const resolved=row?sourceResultRow(row):null;
  sourceVideoPopupSourceRow=resolved;

  if(!resolved){
    if(sourceVideoPopupSourceName)sourceVideoPopupSourceName.textContent="Nguồn YouTube";
    if(sourceVideoPopupSourceTarget)sourceVideoPopupSourceTarget.textContent=sourcePreviewScopeLabel();
    if(sourceVideoPopupAvatar)sourceVideoPopupAvatar.innerHTML="";
    sourceVideoPopupSelect.hidden=true;
    return;
  }

  const meta=sourceMetaFor(resolved);
  if(sourceVideoPopupSourceName){
    sourceVideoPopupSourceName.textContent=meta.name||resolved.name||"Nguồn YouTube";
  }
  if(sourceVideoPopupSourceTarget){
    sourceVideoPopupSourceTarget.textContent="Thêm vào "+sourcePreviewScopeLabel();
  }
  if(sourceVideoPopupAvatar){
    sourceVideoPopupAvatar.innerHTML=sourceResultAvatarHtml(resolved);
  }

  const selected=sourceStatus(resolved.id,sourceManageGroup)==="selected";
  sourceVideoPopupSelect.hidden=false;
  sourceVideoPopupSelect.disabled=selected;
  sourceVideoPopupSelect.classList.toggle("active",selected);
  sourceVideoPopupSelect.textContent=selected
    ?"✓ Đã chọn"
    :"+ "+sourcePreviewScopeLabel();
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
  sourceVideoPopupSourceRow=sourceResultRow(row);
  syncSourceVideoPopupSource();

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
  sourceVideoPopupSourceRow=null;
  if(sourceVideoPopupTitle)sourceVideoPopupTitle.textContent="";
  syncSourceVideoPopupSource();
}

function resetSourcePreviewPane(){
  closeSourceVideo();
  sourcePreviewSeq++;
  clearTimeout(sourcePreviewSearchTimer);
  sourcePreviewSearchSeq++;
  sourcePreviewRows=new Map();
  sourcePreviewSearchRows=new Map();
  sourcePreviewSearchChannels=new Map();
  sourcePreviewSourceId="";
  sourcePreviewSourceRow=null;
  sourcePreviewRenderSignature="";
  if(sourcePreviewSearch){
    sourcePreviewSearch.value="";
    sourcePreviewSearch.disabled=false;
    sourcePreviewSearch.placeholder="Tìm kênh hoặc video YouTube";
  }
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

function cardMoreButtonHtml(){
  return '<button class="card-more-btn" type="button" data-card-more aria-label="Tùy chọn video" title="Tùy chọn">'+
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="12" cy="19" r="1.7"></circle></svg>'+
  '</button>';
}

let activeCardActionCard=null;
let activeCardActionButton=null;

function ensureCardActionMenu(){
  let menu=document.getElementById("cardActionMenu");
  if(menu)return menu;

  menu=document.createElement("div");
  menu.id="cardActionMenu";
  menu.className="card-action-menu";
  menu.hidden=true;
  menu.setAttribute("role","menu");
  document.body.appendChild(menu);
  return menu;
}

function closeCardActionMenu(){
  const menu=document.getElementById("cardActionMenu");
  if(menu){
    menu.hidden=true;
    menu.innerHTML="";
  }
  activeCardActionButton?.setAttribute("aria-expanded","false");
  activeCardActionCard=null;
  activeCardActionButton=null;
}

function cardActionScope(){
  // Only a real source/feed tab gives an implicit destination. Search,
  // recommendations and other neutral views must ask which tab to use.
  return activeSourceScope()||"";
}

function cardActionIcon(name=""){
  const common='viewBox="0 0 24 24" aria-hidden="true"';
  if(name==="interested"){
    return '<svg '+common+'><path d="M12 20.4 4.2 13.1A5.2 5.2 0 0 1 11.5 5.7l.5.5.5-.5a5.2 5.2 0 0 1 7.3 7.4L12 20.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }
  if(name==="not-interested"){
    return '<svg '+common+'><circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m6.2 6.2 11.6 11.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  if(name==="share"){
    return '<svg '+common+'><circle cx="18" cy="5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="19" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 10.9 7.9-4.6M8 13.1l7.9 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  return '<svg '+common+'><rect x="4" y="4" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="4" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="4" y="14" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="14" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
}

function cardActionItemHtml(action,label,{danger=false,active=false,disabled=false}={}){
  return '<button type="button" class="card-action-item'+
    (danger?' danger':'')+
    (active?' active':'')+
    '" data-card-action="'+esc(action)+'"'+
    (disabled?' disabled':'')+'>'+
      '<span class="card-action-icon">'+cardActionIcon(action)+'</span>'+
      '<span class="card-action-label">'+esc(label)+'</span>'+
    '</button>';
}

function showCardActionScopePicker(action){
  const card=activeCardActionCard;
  const button=activeCardActionButton;
  const source=cardActionSourceRow(card);
  if(!card||!button||!source)return;

  const menu=ensureCardActionMenu();
  const interested=action==="interested";
  const title=interested?"Quan tâm ở nguồn nào?":"Không quan tâm ở nguồn nào?";

  const rows=SOURCE_MANAGER_GROUPS.map(group=>{
    const status=matchSourceState(source,group.key).status;
    const target=interested?"selected":"blocked";
    const already=status===target;
    const suffix=status==="selected"
      ?"Đã quan tâm"
      :status==="blocked"
        ?"Đã chặn"
        :"";

    return '<button type="button" class="card-action-scope'+
      (already?' active':'')+
      '" data-card-scope="'+esc(group.key)+'" data-card-scope-action="'+esc(action)+'"'+
      (already?' disabled':'')+'>'+
        '<span>'+esc(group.label)+'</span>'+
        (suffix?'<small>'+esc(suffix)+'</small>':'')+
      '</button>';
  }).join("");

  menu.innerHTML=
    '<div class="card-action-picker-head">'+
      '<button type="button" class="card-action-back" data-card-action-back aria-label="Quay lại">‹</button>'+
      '<strong>'+esc(title)+'</strong>'+
    '</div>'+
    '<div class="card-action-scope-list">'+rows+'</div>';

  positionCardActionMenu(button,menu);
}

function applyCardSourceAction(action,scope){
  const card=activeCardActionCard;
  if(!card||!scope)return false;

  const source=ensureCardActionSource(card,scope);
  if(!source)return false;

  if(action==="interested"){
    setSourceStatus(source.id,"selected",scope);
    closeCardActionMenu();
    return true;
  }

  if(action==="not-interested"){
    setSourceStatus(source.id,"blocked",scope);

    // Remove immediately only when the card is being viewed inside the same
    // source tab. Search/neutral views stay intact after a scoped preference.
    if(activeSourceScope()===scope){
      removeBlockedSourceFromVisibleFeed(card,scope);
    }
    closeCardActionMenu();
    return true;
  }

  return false;
}

function cardActionSourceRow(card){
  if(!card)return null;
  const id=String(card.dataset.sourceId||"").trim();
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;

  return {
    id,
    name:clean(card.dataset.channel||"")||id,
    thumbnailUrl:sourceAvatarCached(id)||"",
    subscribers:""
  };
}

function ensureCardActionSource(card,scope){
  const row=cardActionSourceRow(card);
  if(!row)return null;

  sourceMetaCache.set(row.id,{...sourceMetaCache.get(row.id),...row});

  if(
    !libraryHas(row.id)&&
    !allManagedStateIds().has(row.id)
  ){
    temporarySetForScope(scope).add(row.id);
  }
  return row;
}

function cardActionStatus(card,scope=cardActionScope()){
  const row=cardActionSourceRow(card);
  if(!row)return "normal";
  return matchSourceState(row,scope).status;
}

function publicCardVideoUrl(card){
  const id=String(card?.dataset?.videoId||"").trim();
  if(!id)return "";
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set("v",id);
  url.hash="";
  return url.toString();
}

async function shareCardVideo(card,button=null){
  const url=publicCardVideoUrl(card);
  if(!url)return false;
  const data={
    title:clean(card?.dataset?.title)||"1988",
    url
  };

  try{
    if(navigator.share){
      await navigator.share(data);
      closeCardActionMenu();
      return true;
    }
  }catch(error){
    if(error?.name==="AbortError")return false;
  }

  try{
    await navigator.clipboard.writeText(url);
    if(button){
      const label=button.querySelector?.(".card-action-label");
      const old=label?.textContent||button.textContent;
      if(label)label.textContent="Đã sao chép link";
      else button.textContent="Đã sao chép link";
      setTimeout(()=>{
        if(button.isConnected){
          if(label)label.textContent=old;
          else button.textContent=old;
        }
        closeCardActionMenu();
      },650);
    }else{
      closeCardActionMenu();
    }
    return true;
  }catch{
    return false;
  }
}

function removeBlockedSourceFromVisibleFeed(card,scope){
  const row=cardActionSourceRow(card);
  if(!row)return;

  state.feedRows=(Array.isArray(state.feedRows)?state.feedRows:[])
    .filter(item=>!isBlockedSourceRow(item,scope));

  for(const item of [...feed.querySelectorAll(".card[data-video-id]")]){
    const sameId=String(item.dataset.sourceId||"")===row.id;
    const sameName=normalizeSearchText(item.dataset.channel||"")===normalizeSearchText(row.name||"");
    if(sameId||sameName)item.remove();
  }

  const total=feed.querySelectorAll(".card[data-video-id]").length;
  feedStatus.textContent=total?total+" video":"";
}

function positionCardActionMenu(button,menu){
  const rect=button.getBoundingClientRect();
  const viewport=window.visualViewport;
  const leftEdge=Math.max(8,Number(viewport?.offsetLeft)||0);
  const topEdge=Math.max(8,Number(viewport?.offsetTop)||0);
  const width=Math.max(280,Number(viewport?.width)||window.innerWidth||0);
  const height=Math.max(240,Number(viewport?.height)||window.innerHeight||0);
  const rightEdge=leftEdge+width-8;
  const bottomEdge=topEdge+height-8;

  menu.style.left="-9999px";
  menu.style.top="-9999px";
  menu.hidden=false;

  const menuRect=menu.getBoundingClientRect();
  const menuWidth=Math.max(180,menuRect.width||0);
  const menuHeight=Math.max(44,menuRect.height||0);

  let left=Math.min(rightEdge-menuWidth,Math.max(leftEdge,rect.right-menuWidth));
  let top=rect.bottom+6;
  if(top+menuHeight>bottomEdge)top=Math.max(topEdge,rect.top-menuHeight-6);

  menu.style.left=Math.round(left)+"px";
  menu.style.top=Math.round(top)+"px";
}

function openCardActionMenu(card,button){
  if(!card||!button)return;
  if(activeCardActionCard===card&&!ensureCardActionMenu().hidden){
    closeCardActionMenu();
    return;
  }

  closeCardActionMenu();
  const menu=ensureCardActionMenu();
  const unlocked=settingsAccessSaved();
  const implicitScope=cardActionScope();
  const source=cardActionSourceRow(card);
  const status=source&&implicitScope
    ?cardActionStatus(card,implicitScope)
    :"normal";

  const actions=[];
  if(unlocked&&source){
    actions.push(
      cardActionItemHtml(
        "interested",
        status==="selected"&&implicitScope?"Đã quan tâm":"Quan tâm",
        {active:status==="selected"&&!!implicitScope,disabled:status==="selected"&&!!implicitScope}
      )
    );
    actions.push(
      cardActionItemHtml(
        "not-interested",
        status==="blocked"&&implicitScope?"Đã chặn":"Không quan tâm",
        {danger:true,active:status==="blocked"&&!!implicitScope,disabled:status==="blocked"&&!!implicitScope}
      )
    );
  }
  actions.push(cardActionItemHtml("share","Chia sẻ link"));

  menu.innerHTML=actions.join("");
  activeCardActionCard=card;
  activeCardActionButton=button;
  button.setAttribute("aria-expanded","true");
  positionCardActionMenu(button,menu);
}

async function handleCardAction(action,button){
  const card=activeCardActionCard;
  if(!card)return;

  if(action==="share"){
    await shareCardVideo(card,button);
    return;
  }

  if(!settingsAccessSaved())return;
  if(action!=="interested"&&action!=="not-interested")return;

  const implicitScope=cardActionScope();

  // Inside LIVE/Mới nhất/Tuần này/Thời sự… the current source tab is already
  // unambiguous, so apply immediately without asking.
  if(implicitScope){
    applyCardSourceAction(action,implicitScope);
    return;
  }

  // Search and other neutral views have no source context. Ask which source
  // tab this preference belongs to.
  showCardActionScopePicker(action);
}

function restoreCardActionRootMenu(){
  const card=activeCardActionCard;
  const button=activeCardActionButton;
  if(!card||!button)return;
  activeCardActionCard=null;
  openCardActionMenu(card,button);
}

document.addEventListener("click",event=>{
  const menu=document.getElementById("cardActionMenu");
  if(!menu||menu.hidden)return;
  if(menu.contains(event.target)||event.target.closest?.("[data-card-more]"))return;
  closeCardActionMenu();
});

document.addEventListener("keydown",event=>{
  if(event.key==="Escape")closeCardActionMenu();
});

window.addEventListener("resize",closeCardActionMenu,{passive:true});
window.visualViewport?.addEventListener?.("resize",closeCardActionMenu,{passive:true});
window.visualViewport?.addEventListener?.("scroll",closeCardActionMenu,{passive:true});

function resetSourceManagerInstant(){
  sourceManageGroup=LIVE_SOURCE_SCOPE;
  sourceBlockedExpanded=false;
  sourceRemoteResults=[];
  sourcePreviewRows=new Map();
  sourcePreviewSearchRows=new Map();
  sourcePreviewSearchChannels=new Map();
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
  sourceManageGroup=LIVE_SOURCE_SCOPE;

  setSourceManageMode(true,{render:false});
  resetSourcePreviewPane();
  if(sourceBrowse)sourceBrowse.hidden=false;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";

  try{
    seedLiveSourceCandidatesFromCache();
    refreshSourceManager();
    pinSourceManagerTop();
  }catch(error){
    console.error("open source manager failed",error);
    if(sourceSearchStatus)sourceSearchStatus.textContent="Không tải được danh sách nguồn";
  }

  void refreshLiveSourceCandidatesInBackground();

  setTimeout(()=>{
    if(sourcesSheet.hidden)return;
    pinSourceManagerTop();
    const parent=sourceDiscoveryParentForGroup(sourceManageGroup);
    if(!parent)return;
    void localEngine(12000)
      .then(local=>discoverSourcesForParent(parent,local))
      .catch(()=>{});
  },120);

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
  sourcePreviewRenderSignature="";
  if(sourcesSheet)delete sourcesSheet.dataset.previewOpen;
  setSourceManageMode(false,{render:false});
  if(clearSourceSearch)clearSourceSearch.hidden=true;
  if(sourceSearchStatus)sourceSearchStatus.textContent="";
  if(sourcePreview)sourcePreview.hidden=true;
  if(sourceBrowse)sourceBrowse.hidden=false;

  if(stateSyncDirty&&stateSyncReady)void pushServerStateNow();

  if(state.sourceLibraryDirty){
    state.sourceLibraryDirty=false;
    if(state.activeParent){
      const parent=state.parentCategories.find(item=>item.key===state.activeParent);
      if(parent){
        feed.innerHTML='<div class="loading">Đang cập nhật nguồn…</div>';
        void loadAiParentDiscovery(parent);
      }
    }else if(state.activeFeed==="live"||isSourceScopedFeed(state.activeFeed)){
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
  sourceVideoPopupSelect?.addEventListener("click",()=>{
    if(sourceVideoPopupSourceRow)quickSelectSource(sourceVideoPopupSourceRow);
  });
  sourceVideoPopupSourceOpen?.addEventListener("click",()=>{
    const row=sourceVideoPopupSourceRow;
    const id=String(row?.id||"").trim();
    if(id&&row)void openSourcePreview(id,row);
  });
  sourcePreviewSelect?.addEventListener("click",choosePreviewSource);
  sourcePreviewSearch?.addEventListener("input",event=>{
    if(event.isComposing||searchInputIsComposing(sourcePreviewSearch))return;
    schedulePreviewVideoSearch();
  });
  bindCommittedSearchInput(sourcePreviewSearch,q=>{
    clearTimeout(sourcePreviewSearchTimer);
    sourcePreviewSearchTimer=0;
    void searchPreviewVideos(q);
    sourcePreviewSearch.blur();
  });
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
        if(groupAtClick===LIVE_SOURCE_SCOPE){
          seedLiveSourceCandidatesFromCache();
          refreshSourceManager();
          void refreshLiveSourceCandidatesInBackground();
        }
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
  sourceGroupRename?.addEventListener("click",()=>{
    renameSourceGroup(sourceManageGroup);
  });
  window.addEventListener("resize",()=>requestAnimationFrame(updateSourceGroupArrows),{passive:true});

  sourceVideoPopup?.addEventListener("click",event=>{
    if(event.target===sourceVideoPopup)closeSourceVideo();
  });

  sourcesSheet?.addEventListener("click",event=>{
    if(event.target===sourcesSheet)closeSourceLibrary();
  });

  sourceSearch?.addEventListener("input",event=>{
    if(event.isComposing||searchInputIsComposing(sourceSearch))return;
    if(sourceBrowse)sourceBrowse.scrollTop=0;
    if(sourceList)sourceList.scrollTop=0;
    scheduleSourceSearch();
    requestAnimationFrame(()=>{
      if(sourceBrowse)sourceBrowse.scrollTop=0;
      if(sourceList)sourceList.scrollTop=0;
    });
  });
  bindCommittedSearchInput(sourceSearch,q=>{
    clearTimeout(sourceSearchTimer);
    sourceSearchTimer=0;
    void searchSourceChannels(q);
    sourceSearch.blur();
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
    const quickButton=event.target.closest("[data-source-quick-select]");
    if(quickButton){
      event.preventDefault();
      event.stopPropagation();
      const id=quickButton.dataset.sourceQuickSelect||"";
      const videoId=quickButton.dataset.sourceVideoRef||"";
      const video=
        sourcePreviewSearchRows.get(videoId)||
        sourcePreviewRows.get(videoId)||
        null;
      const row=
        sourcePreviewSearchChannels.get(id)||
        sourceMetaCache.get(id)||
        libraryRow(id)||
        (video?sourceRowFromVideo(video):null);
      if(row)quickSelectSource(row);
      return;
    }

    const channelButton=event.target.closest("[data-source-search-channel]");
    if(channelButton){
      const id=channelButton.dataset.sourceSearchChannel||"";
      const row=sourcePreviewSearchChannels.get(id)||sourceMetaCache.get(id)||null;
      if(id&&row){
        sourcePreviewSearchRows=new Map();
        sourcePreviewSearchChannels=new Map();
        if(sourcePreviewSearch)sourcePreviewSearch.value="";
        void openSourcePreview(id,row);
      }
      return;
    }

    const openSourceButton=event.target.closest("[data-source-open-channel]");
    if(openSourceButton){
      const videoId=openSourceButton.dataset.sourceVideoRef||"";
      const row=sourcePreviewSearchRows.get(videoId)||sourcePreviewRows.get(videoId);
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

function readVideoAspectHabits(){
  try{
    const raw=JSON.parse(localStorage.getItem(VIDEO_ASPECT_HABIT_KEY)||"{}");
    return raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  }catch{
    return {};
  }
}

const videoAspectHabits=readVideoAspectHabits();

function videoAspectHabitScope(meta={}){
  const explicit=String(meta?._watchScope||"").trim();
  if(explicit==="search")return "search";
  if(MANAGED_SOURCE_SCOPES.has(explicit))return explicit;
  if(state.activeParent&&CONTENT_SOURCE_SCOPES.has(state.activeParent))return state.activeParent;
  if(state.activeFeed===LIVE_SOURCE_SCOPE)return LIVE_SOURCE_SCOPE;
  if(isSourceScopedFeed(state.activeFeed))return feedSourceScope(state.activeFeed);
  if(state.searchQuery)return "search";
  return "";
}

function canonicalHabitAspect(ratio){
  ratio=validPipAspect(ratio);
  if(!ratio)return 0;
  if(ratio<.80)return 9/16;
  if(ratio<=1.20)return 1;
  return 16/9;
}

function rememberedVideoAspect(meta={}){
  const scope=videoAspectHabitScope(meta);
  const scoped=scope?validPipAspect(videoAspectHabits?.[scope]?.ratio):0;
  if(scoped)return scoped;

  // A video opened from Search/direct link may not have a tab identity yet.
  // Fall back to the last verified viewing shape instead of flashing 16:9.
  return validPipAspect(videoAspectHabits?.global?.ratio);
}

function rememberVideoAspectHabit(meta={},ratio=0){
  const scope=videoAspectHabitScope(meta);
  const canonical=canonicalHabitAspect(ratio);
  if(!canonical)return;

  const orientation=canonical<.80?"portrait":canonical>1.20?"landscape":"square";
  const next={ratio:canonical,orientation,at:Date.now()};
  let changed=false;

  if(validPipAspect(videoAspectHabits?.global?.ratio)!==canonical){
    videoAspectHabits.global=next;
    changed=true;
  }
  if(scope&&validPipAspect(videoAspectHabits?.[scope]?.ratio)!==canonical){
    videoAspectHabits[scope]=next;
    changed=true;
  }

  if(!changed)return;
  try{
    localStorage.setItem(VIDEO_ASPECT_HABIT_KEY,JSON.stringify(videoAspectHabits));
  }catch{}
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
  // Auto mode is horizontal by default. Once a verified portrait video turns
  // the player vertical, keep that portrait lock authoritative for the rest of
  // the same viewing flow instead of letting card/thumbnail metadata flip it
  // back to 16:9.
  const locked=validPipAspect(state.videoAspect);
  if(state.videoAspectPortraitLocked&&locked&&locked<.80)return locked;

  return explicitVideoAspect(meta)||
    locked||
    16/9;
}

function applyResponsivePlayerFrame(meta=state.currentMeta||{}){
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  // A stale v235 fake-PiP class must never own geometry again.
  if(frame.classList.contains("floating-iframe"))applyFloatingIframe();

  let ratio=responsivePlayerAspect(meta);
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
    "watch-film-default",
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

  const clearWatchGeometry=()=>{
    frame.style.removeProperty("--watch-player-width");
    frame.style.removeProperty("--watch-player-height");
    root.style.removeProperty("--watch-stage-w");
    root.style.removeProperty("--watch-stage-h");
    root.style.removeProperty("--watch-side-gap");
    root.style.removeProperty("--watch-player-column-w");
    root.style.removeProperty("--watch-feed-column-w");
    root.style.removeProperty("--watch-feed-content-w");
    root.style.removeProperty("--watch-scroll-gutter");
    root.style.removeProperty("--watch-grid-gap");
    root.style.removeProperty("--watch-feed-cols");
    root.style.removeProperty("--watch-player-top-offset");
    root.style.removeProperty("--watch-card-unit");
  };

  if(!root.classList.contains("watch-browse")){
    clearWatchGeometry();
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
    const styles=getComputedStyle(root);
    const topRow=parseFloat(styles.getPropertyValue("--watch-top-row-h"))||52;
    const sourceRow=parseFloat(styles.getPropertyValue("--watch-source-row-h"))||48;
    const maxWidth=viewportWidth;

    let width=maxWidth;
    let height=width/ratio;

    if(ratio>=.8){
      const feedPeek=Math.max(44,Math.min(72,viewportHeight*.08));
      const maxHeight=Math.max(
        140,
        viewportHeight-topRow-sourceRow-feedPeek
      );
      width=Math.min(maxWidth,maxHeight*ratio);
      height=width/ratio;
      if(height>maxHeight){
        height=maxHeight;
        width=height*ratio;
      }
      width=Math.max(1,Math.min(maxWidth,width));
      height=Math.max(1,Math.min(maxHeight,height));
    }else{
      // Portrait/long video keeps its natural full-width height. The browser
      // page owns vertical scrolling, so one upward swipe continues directly
      // to Sources and the next cards.
      width=Math.max(1,maxWidth);
      height=Math.max(1,width/ratio);
    }

    frame.style.setProperty("--watch-player-width",Math.round(width)+"px");
    frame.style.setProperty("--watch-player-height",Math.round(height)+"px");
    root.style.setProperty("--watch-stage-w",Math.round(width)+"px");
    root.style.setProperty("--watch-stage-h",Math.round(height)+"px");
    root.style.setProperty("--watch-side-gap",Math.max(0,Math.round(viewportWidth-width))+"px");
    root.style.removeProperty("--watch-player-column-w");
    root.style.removeProperty("--watch-feed-column-w");
    root.style.removeProperty("--watch-feed-content-w");
    root.style.removeProperty("--watch-scroll-gutter");
    root.style.removeProperty("--watch-grid-gap");
    root.style.removeProperty("--watch-feed-cols");
    root.style.removeProperty("--watch-player-top-offset");
    root.style.removeProperty("--watch-card-unit");

    root.classList.remove("watch-tools-side","watch-tools-bottom");
    root.classList.add("watch-tools-bottom");
    return;
  }

  if(desktop){
    // Desktop Watch has one geometry solver. Orientation chooses the primary
    // constraint: portrait is height-first; landscape/square is width-first.
    // After the player is solved, the remaining width determines whole 16:9
    // recommendation columns. CSS only renders these solved dimensions.
    const shellRect=appShell?.getBoundingClientRect?.();
    const shellStyle=appShell?getComputedStyle(appShell):null;
    const feedStyle=feed?getComputedStyle(feed):null;

    const shellPadding=
      (parseFloat(shellStyle?.paddingLeft)||0)+
      (parseFloat(shellStyle?.paddingRight)||0);
    const innerWidth=Math.max(
      1,
      (shellRect?.width||viewportWidth)-shellPadding
    );
    const gridGap=14;
    const scrollGutter=10;
    const portrait=ratio<.8;
    const wide=ratio>=1.2;

    const sectionRect=playerSection?.getBoundingClientRect?.();
    const feedRect=feed?.getBoundingClientRect?.();
    const feedSectionRect=feedSection?.getBoundingClientRect?.();
    const sectionTop=Math.max(0,sectionRect?.top||0);
    const feedTop=Math.max(sectionTop,feedRect?.top||sectionTop);
    const playerTopOffset=Math.max(0,Math.min(56,feedTop-sectionTop));

    // One owner for vertical geometry:
    // - portrait uses the ENTIRE visible height of the left scroll pane.
    // - landscape/square may reserve a bottom control-safe inset.
    // CSS must not subtract a second bottom padding or max-height later.
    const controlSafeInset=8;
    const bottomEdge=gridGap+controlSafeInset;
    const feedBottom=Math.min(
      viewportHeight,
      feedSectionRect?.bottom||viewportHeight
    );
    const fullPaneHeight=Math.max(
      1,
      feedBottom-feedTop
    );
    const safePaneHeight=Math.max(
      1,
      fullPaneHeight-bottomEdge
    );

    let feedColumns=2;
    let playerWidth=1;
    let playerHeight=1;
    let unit=1;

    if(portrait){
      // 1) Full usable height first.
      playerHeight=fullPaneHeight;
      // 2) Natural width follows from the portrait ratio.
      playerWidth=Math.max(1,playerHeight*ratio);

      // 3) Only after the player is fixed do we divide the remaining width
      // into whole 16:9 cards. Prefer each card to share the same width as
      // the portrait player; if even one card cannot fit, only the card shrinks.
      const feedRoom=Math.max(
        1,
        innerWidth-playerWidth-gridGap-scrollGutter
      );
      const preferredUnit=playerWidth;

      feedColumns=Math.max(
        1,
        Math.min(
          4,
          Math.floor((feedRoom+gridGap)/(preferredUnit+gridGap))
        )
      );

      const maxUnitForFeed=Math.max(
        1,
        (feedRoom-Math.max(0,feedColumns-1)*gridGap)/feedColumns
      );
      unit=Math.max(1,Math.min(preferredUnit,maxUnitForFeed));
    }else{
      // Landscape/square keeps the four-unit width geometry.
      feedColumns=wide?2:3;
      const playerSpan=wide?2:1;
      const widthUnit=Math.max(
        1,
        (innerWidth-(gridGap*3)-scrollGutter)/4
      );
      const heightUnit=playerSpan===2
        ?Math.max(1,(safePaneHeight*ratio-gridGap)/2)
        :Math.max(1,safePaneHeight*ratio);

      unit=Math.max(1,Math.min(widthUnit,heightUnit));
      playerWidth=playerSpan===2
        ?(2*unit+gridGap)
        :unit;
      playerHeight=playerWidth/ratio;
    }

    const feedContentWidth=
      feedColumns*unit+
      Math.max(0,feedColumns-1)*gridGap;
    const feedColumnWidth=feedContentWidth+scrollGutter;

    root.style.setProperty("--watch-card-unit",Math.round(unit*100)/100+"px");
    root.style.setProperty("--watch-grid-gap",gridGap+"px");
    root.style.setProperty("--watch-feed-cols",String(feedColumns));
    root.style.setProperty("--watch-feed-content-w",Math.round(feedContentWidth*100)/100+"px");
    root.style.setProperty("--watch-feed-column-w",Math.round(feedColumnWidth*100)/100+"px");
    root.style.setProperty("--watch-scroll-gutter",scrollGutter+"px");
    root.style.setProperty("--watch-player-column-w",Math.round(playerWidth*100)/100+"px");
    root.style.setProperty("--watch-player-top-offset",Math.round(playerTopOffset)+"px");

    frame.style.setProperty("--watch-player-width",Math.round(playerWidth)+"px");
    frame.style.setProperty("--watch-player-height",Math.round(playerHeight)+"px");
    root.style.removeProperty("--watch-stage-w");
    root.style.removeProperty("--watch-stage-h");
    root.style.removeProperty("--watch-side-gap");
    return;
  }

  // 721–959px keeps the normal inline layout, but never PiP.
  frame.style.removeProperty("--watch-player-width");
  frame.style.removeProperty("--watch-player-height");
  root.style.removeProperty("--watch-player-column-w");
  root.style.removeProperty("--watch-feed-column-w");
  root.style.removeProperty("--watch-feed-content-w");
  root.style.removeProperty("--watch-scroll-gutter");
  root.style.removeProperty("--watch-grid-gap");
  root.style.removeProperty("--watch-feed-cols");
  root.style.removeProperty("--watch-player-top-offset");
  root.style.removeProperty("--watch-card-unit");
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
    rememberVideoAspectHabit(meta,next);
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
  if(!active){
    document.documentElement.classList.remove("watch-search-open","watch-search-results");
    setSearchEntryIcon(false);
  }
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
    if(!active){
      queueFloatingIframe();
      queueHomeChromeTintFromFeed(true);
    }
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
  const viewsLabel=fmtViewLabel(views,viewText);
  if(viewsLabel)bits.push(viewsLabel);
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
function applyFloatingIframe(){
  // v236: playback has one canonical place only. Clean up any stale floating
  // class left by an older cached bundle, then keep the real player inline.
  const frame=playerSection?.querySelector(".player-frame");
  if(!frame)return;

  if(frame.classList.contains("floating-iframe")){
    frame.classList.remove(
      "floating-iframe","float-tucked","dock-left","dock-right",
      "float-view-square","float-view-portrait","float-entering"
    );
  }
  state.floatTucked=false;
  state.floatUserSized=false;
  state.floatPreset="auto";
  clearFloatBoxStyles();
  playerSection.style.removeProperty("min-height");
  queueResponsivePlayerFrame();
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
  // Kept as a compatibility no-op for older call sites.
  applyFloatingIframe();
}

function setupFloatingIframe(){
  // Fake PiP was removed in v236. Responsive sizing is handled by the single
  // inline player and setupWatchBrowseLayout()/visualViewport listeners.
  applyFloatingIframe();
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

let suggestionLayoutRaf=0;
let normalSuggestionTimer=0;
let normalSuggestionSeq=0;
let normalSuggestionArmed=false;

function clearSuggestionLayout(){
  if(suggestionLayoutRaf){
    cancelAnimationFrame(suggestionLayoutRaf);
    suggestionLayoutRaf=0;
  }
  const root=document.documentElement;
  root.classList.remove("search-suggestions-open");
  for(const name of [
    "--search-suggestions-top",
    "--search-suggestions-left",
    "--search-suggestions-width",
    "--search-suggestions-max-h"
  ])root.style.removeProperty(name);
}

function syncSuggestionLayout(){
  if(!suggestions||suggestions.hidden||!suggestions.childElementCount){
    clearSuggestionLayout();
    return;
  }
  if(suggestionLayoutRaf)return;

  suggestionLayoutRaf=requestAnimationFrame(()=>{
    suggestionLayoutRaf=0;
    if(!suggestions||suggestions.hidden||!suggestions.childElementCount){
      clearSuggestionLayout();
      return;
    }

    const root=document.documentElement;
    const formRect=searchForm?.getBoundingClientRect?.();
    const navRect=document.querySelector(".header-nav")?.getBoundingClientRect?.();
    const innerRect=document.querySelector(".header-inner")?.getBoundingClientRect?.();
    const viewport=window.visualViewport;
    const viewportLeft=Math.max(0,Number(viewport?.offsetLeft)||0);
    const viewportTop=Math.max(0,Number(viewport?.offsetTop)||0);
    const viewportWidth=Math.max(280,Number(viewport?.width)||window.innerWidth||0);
    const viewportHeight=Math.max(240,Number(viewport?.height)||window.innerHeight||0);
    const viewportRight=viewportLeft+viewportWidth;
    const viewportBottom=viewportTop+viewportHeight;

    const formLeft=Number(formRect?.left)||viewportLeft+8;
    const formWidth=Number(formRect?.width)||Math.max(200,viewportWidth-16);
    const left=Math.max(viewportLeft+8,formLeft);
    const width=Math.max(
      200,
      Math.min(formWidth,viewportRight-left-8)
    );

    const visibleBottoms=[
      Number(formRect?.bottom)||0,
      Number(innerRect?.bottom)||0,
      Number(navRect?.bottom)||0
    ].filter(value=>Number.isFinite(value)&&value>0);
    const top=Math.min(
      viewportBottom-96,
      Math.max(viewportTop+8,...visibleBottoms)+4
    );
    const maxHeight=Math.max(
      88,
      Math.min(360,viewportBottom-top-8)
    );

    root.style.setProperty("--search-suggestions-top",Math.round(top)+"px");
    root.style.setProperty("--search-suggestions-left",Math.round(left)+"px");
    root.style.setProperty("--search-suggestions-width",Math.round(width)+"px");
    root.style.setProperty("--search-suggestions-max-h",Math.round(maxHeight)+"px");
    // Floating overlay only: opening suggestions must not change app-shell
    // geometry or trigger a second layout pass.
    root.classList.add("search-suggestions-open");
  });
}

function clearSearchSuggestionPanel({invalidate=true}={}){
  if(invalidate){
    clearTimeout(normalSuggestionTimer);
    normalSuggestionTimer=0;
    normalSuggestionSeq++;
    normalSuggestionArmed=false;
  }

  if(suggestions){
    suggestions.hidden=true;
    suggestions.innerHTML="";
  }
  queryInput?.setAttribute?.("aria-expanded","false");
  clearSuggestionLayout();
}

function clearSearchRefinements(){
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }
}

function clearSuggestions(){
  clearSearchSuggestionPanel();
  clearSearchRefinements();
}

window.addEventListener("resize",syncSuggestionLayout,{passive:true});
window.visualViewport?.addEventListener?.("resize",syncSuggestionLayout,{passive:true});
window.visualViewport?.addEventListener?.("scroll",syncSuggestionLayout,{passive:true});

function renderNormalSuggestions(items=[]){
  if(!suggestions)return;

  // Suggestions only exist while the user is actively editing the query.
  // A completed search must never be able to reopen the panel from a stale
  // async suggestions response.
  if(!normalSuggestionArmed||document.activeElement!==queryInput){
    clearSearchSuggestionPanel({invalidate:false});
    return;
  }
  const values=[...new Set(
    (Array.isArray(items)?items:[])
      .map(value=>clean(typeof value==="string"?value:(value?.text||value?.query||value?.title||"")))
      .filter(Boolean)
  )].slice(0,8);

  if(!values.length){
    clearSearchSuggestionPanel({invalidate:false});
    return;
  }

  suggestions.innerHTML=values.map(value=>
    '<button type="button" data-search-suggestion="'+esc(value)+'">'+esc(value)+'</button>'
  ).join("");
  suggestions.hidden=false;
  queryInput?.setAttribute?.("aria-expanded","true");
  syncSuggestionLayout();
}

async function loadNormalSuggestions(value){
  const q=clean(value);
  const seq=++normalSuggestionSeq;

  if(!normalSuggestionArmed||document.activeElement!==queryInput){
    return;
  }

  if(q.length<2){
    renderNormalSuggestions([]);
    return;
  }

  try{
    const response=await api("suggestions",{q},4200);
    if(
      seq!==normalSuggestionSeq||
      !normalSuggestionArmed||
      document.activeElement!==queryInput||
      clean(queryInput?.value)!==q
    )return;

    renderNormalSuggestions(Array.isArray(response?.data)?response.data:[]);
  }catch{
    if(
      seq===normalSuggestionSeq&&
      normalSuggestionArmed&&
      document.activeElement===queryInput
    ){
      renderNormalSuggestions([]);
    }
  }
}

function scheduleNormalSuggestions(){
  clearTimeout(normalSuggestionTimer);
  normalSuggestionTimer=0;

  if(!normalSuggestionArmed||document.activeElement!==queryInput)return;

  normalSuggestionTimer=setTimeout(()=>{
    normalSuggestionTimer=0;
    void loadNormalSuggestions(queryInput?.value||"");
  },160);
}


function revealTopicChip(button,{behavior="smooth"}={}){
  if(!button||!topicChips)return;

  const rail=topicChips;
  const maxScroll=Math.max(0,rail.scrollWidth-rail.clientWidth);
  if(maxScroll<=1)return;

  const safeEdge=10;
  const railRect=rail.getBoundingClientRect();
  const buttonRect=button.getBoundingClientRect();
  const safeLeft=railRect.left+safeEdge;
  const safeRight=railRect.right-safeEdge;

  let delta=0;
  if(buttonRect.left<safeLeft){
    delta=buttonRect.left-safeLeft;
  }else if(buttonRect.right>safeRight){
    delta=buttonRect.right-safeRight;
  }

  if(Math.abs(delta)<1)return;

  const left=Math.max(0,Math.min(maxScroll,rail.scrollLeft+delta));
  rail.scrollTo({left,behavior});
}

function setActiveChip(name,{behavior="smooth"}={}){
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
      // Move only enough to expose the whole selected tab. Do not re-center
      // the strip or reset it to the first item; that was the cause of the
      // clipped/jumping tab seen on mobile.
      revealTopicChip(activeButton,{behavior});
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
  return window.MediaMeta?.videoId?.(row)||
    extractVideoId(row.videoId||row.url||row.id||"");
}

function thumb(row={},id=""){
  return window.MediaMeta?.thumbnail?.(row,id)||
    row.thumbnail||
    row.thumbnailUrl||
    row.thumbnails?.[0]?.url||
    ("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg");
}

function fmtViews(n){
  if(window.MediaMeta?.compactNumber)return window.MediaMeta.compactNumber(n);
  n=Number(n)||0;
  if(n>=1e9)return (n/1e9).toFixed(1).replace(".0","")+"B";
  if(n>=1e6)return (n/1e6).toFixed(1).replace(".0","")+"M";
  if(n>=1e3)return (n/1e3).toFixed(1).replace(".0","")+"K";
  return n.toLocaleString("vi-VN");
}

function fmtViewLabel(n,rawText=""){
  if(window.MediaMeta?.viewLabel)return window.MediaMeta.viewLabel(n,rawText);
  const count=Number(n)||0;
  if(count>0)return count<1000?fmtViews(count)+" lượt xem":fmtViews(count);
  return clean(rawText).replace(/\s*(?:lượt xem|views?)\s*$/i,"");
}

function fmtDuration(sec){
  if(window.MediaMeta?.durationLabel)return window.MediaMeta.durationLabel(sec);
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
  if(window.MediaMeta?.durationSeconds){
    const seconds=window.MediaMeta.durationSeconds(row);
    if(seconds>0)return seconds;
  }

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
  // Scope identity is explicit and stable. Never infer a source tab from its
  // display label; renaming "Thời sự", "Phim", etc. must not change behavior.
  const explicit=String(parent?.group||parent?.key||"").trim();
  if(explicit===GENERAL_SOURCE_SCOPE)return GENERAL_SOURCE_SCOPE;
  if(MANAGED_SOURCE_SCOPES.has(explicit))return explicit;
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
    case LATEST_SOURCE_SCOPE:
    case WEEK_SOURCE_SCOPE:
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
  // UI reads only the packaged snapshot produced by code. AI is never allowed
  // to rewrite titles, source names, groups or visible ordering.
  return Array.isArray(rows)?rows:[];
}

function patchRenderedAiMeta(){
  // Intentionally disabled: AI may not patch an already-rendered UI.
}

function categoryCacheRows(parentKey=""){
  const cached=state.aiCategoryRows.get(parentKey);
  if(cached&&Array.isArray(cached.items)&&cached.items.length)return cached.items;

  const stored=readAtomicSnapshot("category:"+parentKey);
  if(!stored||!Array.isArray(stored.items)||!stored.items.length)return [];

  const parent=FIXED_CONTENT_CATEGORIES.find(item=>item.key===parentKey);
  const group=parentSourceGroup(parent||{key:parentKey,group:parentKey});
  const selectedIds=new Set(selectedSources(group).map(source=>source.id));
  const blocked=blockedSetForScope(group);
  const items=stored.items.filter(row=>{
    const sourceId=String(row?._sourceId||row?.channelId||row?.uploaderId||"");
    if(sourceId&&!selectedIds.has(sourceId))return false;
    return !blocked.has(sourceId)&&!isBlockedSourceRow(row,group);
  });

  if(items.length)state.aiCategoryRows.set(parentKey,{at:Number(stored.at)||Date.now(),items});
  return items;
}

function instantCategoryRows(parent={}){
  const group=parentSourceGroup(parent);
  const sources=selectedSourcesForParent(parent);
  if(!sources.length)return [];

  const sourceIds=new Set(sources.map(source=>source.id));
  return dedupeHashedRows(newestFirst([
    ...categoryCacheRows(parent.key),
    ...cachedRowsForSources(sources,group)
  ]))
    .filter(uploadedWithinCategoryWindow)
    .filter(row=>{
      const id=String(row?._sourceId||row?.channelId||row?.uploaderId||"");
      return sourceIds.has(id)&&!isBlockedSourceRow(row,group);
    })
    .map(row=>({...row,_selectedCategorySource:true}))
    .slice(0,90);
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

  state.parentCategories=sourceCategoryRows();

  if(state.activeParent&&!state.parentCategories.some(parent=>parent.key===state.activeParent)){
    state.activeParent="";
  }

  for(const parent of state.parentCategories){
    const button=document.createElement("button");
    button.className="topic-chip topic-subject";
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
// Network warm-up is capped, but learning itself uses cached rows from ALL
// currently selected sources in the scope.
const SOURCE_CONTENT_LEARNING_FETCH_MAX_SOURCES=20;
const SOURCE_CONTENT_LEARNING_MAX_ROWS=120;
const SOURCE_CONTENT_LEARNING_KEY_PREFIX="1988-source-learning-v4:";
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

function balancedSourceLearningRows(rows=[],scope=GENERAL_SOURCE_SCOPE,maxRows=SOURCE_CONTENT_LEARNING_MAX_ROWS){
  const buckets=new Map();
  for(const row of newestFirst(Array.isArray(rows)?rows:[])){
    if(isBlockedSourceRow(row,scope))continue;
    const sourceKey=
      String(row?._sourceId||row?.channelId||row?.uploaderId||"").trim()||
      normalizeSearchText(row?._sourceName||row?.uploaderName||row?.uploader||row?.channelName||"")||
      "unknown";
    if(!buckets.has(sourceKey))buckets.set(sourceKey,[]);
    buckets.get(sourceKey).push(row);
  }

  const queues=[...buckets.values()];
  const out=[];
  let depth=0;
  while(out.length<maxRows){
    let added=false;
    for(const queue of queues){
      if(depth<queue.length){
        out.push(queue[depth]);
        added=true;
        if(out.length>=maxRows)break;
      }
    }
    if(!added)break;
    depth++;
  }
  return out;
}

function extractSourceContentTerms(parent={},rows=[]){
  const group=parentSourceGroup(parent);
  const score=new Map();
  const channelsByTerm=new Map();
  const hashtagScore=new Map();
  const items=balancedSourceLearningRows(rows,group,SOURCE_CONTENT_LEARNING_MAX_ROWS);

  const addTerm=(phrase,weight,channel)=>{
    const key=normalizeSearchText(phrase);
    if(!key||key.length<3)return;
    const words=key.split(" ").filter(Boolean);
    if(!words.length)return;
    if(words.every(word=>SOURCE_LEARNING_STOPWORDS.has(word)))return;
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

  const ranked=[...score.entries()]
    .map(([phrase,value])=>{
      const channelCount=channelsByTerm.get(phrase)?.size||0;
      const key=normalizeSearchText(phrase);
      const words=key.split(" ").filter(Boolean);
      const crossSourceBoost=1+Math.min(3,Math.max(0,channelCount-1))*0.8;
      const phraseBoost=1+Math.min(2,Math.max(0,words.length-1))*0.35;
      return [phrase,value*crossSourceBoost*phraseBoost,channelCount];
    })
    .filter(([,value])=>value>1.2)
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
  const allSources=group===GENERAL_SOURCE_SCOPE
    ?selectedSources()
    :selectedSources(group);
  if(!allSources.length)return [];

  const selectedIds=new Set(allSources.map(source=>source.id));
  let cached=[];
  if(group===GENERAL_SOURCE_SCOPE||FEED_SOURCE_SCOPES.has(group)){
    cached=(FEED_SOURCE_SCOPES.has(group)?readSourcePoolCache(group):[])
      .filter(row=>
        selectedIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||""))&&
        uploadedWithinCategoryWindow(row)&&
        !isBlockedSourceRow(row,group)
      );
  }else{
    const parentRows=categoryCacheRows(parent.key);
    cached=parentRows.filter(row=>
      selectedIds.has(String(row?._sourceId||row?.channelId||row?.uploaderId||""))&&
      uploadedWithinCategoryWindow(row)&&
      !isBlockedSourceRow(row,group)
    );
  }

  // If cached category/feed rows already cover enough of the current selected
  // set, learn from those ALL-source rows instead of arbitrarily taking the
  // first N selected channels.
  const cachedSourceCount=new Set(
    cached.map(row=>String(row?._sourceId||row?.channelId||row?.uploaderId||"")).filter(Boolean)
  ).size;
  if(
    cached.length>=Math.min(24,allSources.length*2)&&
    cachedSourceCount>=Math.min(allSources.length,8)
  ){
    return dedupeHashedRows(newestFirst(cached)).slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS*2);
  }

  const fetchSources=allSources.length<=SOURCE_CONTENT_LEARNING_FETCH_MAX_SOURCES
    ?allSources
    :Array.from({length:SOURCE_CONTENT_LEARNING_FETCH_MAX_SOURCES},(_,index)=>
        allSources[Math.min(
          allSources.length-1,
          Math.floor(index*allSources.length/SOURCE_CONTENT_LEARNING_FETCH_MAX_SOURCES)
        )]
      ).filter((source,index,list)=>source&&list.findIndex(item=>item?.id===source.id)===index);

  try{
    const fresh=await fetchSourcePool(local,fetchSources,true,group);
    return dedupeHashedRows(
      newestFirst([
        ...cached,
        ...(Array.isArray(fresh)?fresh:[])
      ])
        .filter(uploadedWithinCategoryWindow)
        .filter(row=>!isBlockedSourceRow(row,group))
    ).slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS*2);
  }catch{
    return dedupeHashedRows(newestFirst(cached)).slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS*2);
  }
}

async function cleanSelectedRowsForLearning(parent={},rows=[]){
  const group=parentSourceGroup(parent);
  if(!group)return [];

  const source=dedupeHashedRows(newestFirst(Array.isArray(rows)?rows:[]))
    .filter(row=>!isBlockedSourceRow(row,group))
    .slice(0,SOURCE_CONTENT_LEARNING_MAX_ROWS*2);
  if(!source.length)return [];

  const accepted=[];
  for(let offset=0;offset<source.length;offset+=48){
    const batch=source.slice(offset,offset+48);
    try{
      const classified=await classifyAiParent(parent,batch,{
        filterToParent:CONTENT_SOURCE_SCOPES.has(group)
      });
      if(classified?.videoMeta instanceof Map&&classified.videoMeta.size){
        state.aiVideoMeta=new Map([...state.aiVideoMeta,...classified.videoMeta]);
      }
      const acceptedIds=classified?.acceptedVideoIds instanceof Set
        ?classified.acceptedVideoIds
        :new Set(batch.map(itemVideoId).filter(Boolean));
      const kept=CONTENT_SOURCE_SCOPES.has(group)
        ?batch.filter(row=>acceptedIds.has(itemVideoId(row)))
        :batch;
      accepted.push(...kept);
    }catch(error){
      console.warn("AI 1 learning cleanup failed",parent?.label||group,error);
      // Fail closed for AI 2: dirty/unclassified rows must not become
      // positive training examples when AI 1 is unavailable.
      return [];
    }
  }

  // AI 2 learns only from AI 1-cleaned, deduplicated selected-source content.
  return aiDisplayRows(dedupeHashedRows(newestFirst(accepted)));
}

async function ensureSourceContentLearning(parent={},local){
  const group=parentSourceGroup(parent);
  if(!group)return {terms:[],hashtags:[],rows:0,sources:0};
  const saved=readSourceContentLearning(group);
  if(saved)return saved;

  // Learn directly from the current selected channels. Do not run a second AI
  // pass that tries to decide what the tab name means; this keeps all tabs
  // identical and removes the category-name dependency/jitter.
  const rows=await selectedLearningRows(parent,local);
  return saveSourceContentLearning(
    group,
    extractSourceContentTerms(parent,aiDisplayRows(rows))
  );
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

function sourceContextRows(scope,status="selected",limit=48){
  scope=sourceScope(scope);
  const ids=status==="blocked"
    ?blockedSetForScope(scope)
    :status==="suggested"
      ?suggestedSetForScope(scope)
      :selectedSetForScope(scope);
  const out=[];
  for(const id of ids){
    const meta=sourceMetaCache.get(id)||libraryRow(id)||{};
    out.push({
      id:String(id||""),
      name:clean(meta?.name||"")
    });
    if(out.length>=limit)break;
  }
  return out.filter(row=>/^UC[A-Za-z0-9_-]+$/.test(row.id));
}

async function adaptiveSourceQueries(parent={},local){
  const group=parentSourceGroup(parent);
  if(!group)return [];

  // Build one balanced sample from the latest selected-source package.
  // Around 100 videos / up to 20 selected channels is enough context for AI
  // to suggest useful search phrases without letting AI touch search itself.
  const learningRows=await selectedLearningRows(parent,local);
  const sample=balancedSourceLearningRows(
    learningRows,
    group,
    100
  );
  if(!sample.length)return [];

  const localTerms=extractSourceContentTerms(parent,sample);
  const fallbackQueries=[
    ...(localTerms?.hashtags||[]),
    ...(localTerms?.terms||[])
  ].filter(Boolean).slice(0,8);

  try{
    const response=await fetch(AI_TOPICS_URL,{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "apikey":SUPABASE_ANON,
        "authorization":"Bearer "+SUPABASE_ANON
      },
      body:JSON.stringify({
        mode:"source_discovery",
        phase:"queries",
        scope:"source:"+group,
        videos:topicInputRows(sample).slice(0,100),
        selectedSources:sourceContextRows(group,"selected",48),
        blockedSources:sourceContextRows(group,"blocked",48),
        suggestedSources:sourceContextRows(group,"suggested",48),
        fallbackQueries
      })
    });

    const payload=await response.json().catch(()=>null);
    if(!response.ok||payload?.ok===false)throw new Error(payload?.error||("HTTP "+response.status));

    const queries=[...new Set(
      (Array.isArray(payload?.queries)?payload.queries:[])
        .map(value=>clean(value))
        .filter(value=>value.length>=2)
    )].slice(0,8);

    return queries.length?queries:fallbackQueries;
  }catch(error){
    console.warn("source query helper failed",group,error);
    return fallbackQueries;
  }
}

async function classifyAiParent(parent,rows=[]){
  const input=Array.isArray(rows)?rows:[];
  return {
    topics:[],
    videoMeta:new Map(),
    acceptedVideoIds:new Set(input.map(itemVideoId).filter(Boolean))
  };
}

const SOURCE_DISCOVERY_TTL=12*60*1000;
const SOURCE_DISCOVERY_TARGET=32;
const SOURCE_DISCOVERY_WINDOWS=[
  // Fast pass: recent activity first. Broaden to the last year only when the
  // recent pool cannot provide enough new channels.
  {key:"recent",uploadDate:"month",maxAgeMs:90*24*60*60*1000,maxPages:3},
  {key:"year",uploadDate:"year",maxAgeMs:365*24*60*60*1000,maxPages:3}
];
const sourceDiscoveryAt=new Map();

function sourceAlreadyKnownForDiscovery(candidate,group){
  if(!candidate)return true;

  // Exact selected/blocked/current-suggestion IDs are the only exclusions.
  // Blocked is a personal filter, not an AI learning signal.
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
  if(!queries.length)return {rows:[],sourceCandidates:[],exhausted:true};

  const representatives=new Map();
  let exhausted=false;
  const discoveryWindows=group===LIVE_SOURCE_SCOPE
    ?[{key:"live",uploadDate:"",maxAgeMs:Number.MAX_SAFE_INTEGER,maxPages:3}]
    :SOURCE_DISCOVERY_WINDOWS;

  for(const windowDef of discoveryWindows){
    for(let page=0;page<windowDef.maxPages;page++){
      const filters=group===LIVE_SOURCE_SCOPE
        ?{features:["live"],sort_by:"upload_date"}
        :{upload_date:windowDef.uploadDate,sort_by:"upload_date"};
      const batches=await Promise.all(
        queries.map((query,index)=>
          pagedSearch(
            local,
            "source-discovery:"+group+":"+windowDef.key+":"+index+":"+fastHash(query),
            query,
            filters,
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
        if(isBlockedSourceRow(row,group))continue;
        if(group===LIVE_SOURCE_SCOPE){
          if(row?.isLive!==true)continue;
        }else if(!uploadedWithin(row,windowDef.maxAgeMs)){
          continue;
        }

        const candidate=sourceCandidateFromVideo(row);
        if(!candidate||sourceAlreadyKnownForDiscovery(candidate,group))continue;

        let entry=representatives.get(candidate.id);
        if(!entry){
          entry={candidate,rows:[],videoIds:new Set()};
          representatives.set(candidate.id,entry);
        }
        const videoId=itemVideoId(row);
        if(videoId&&!entry.videoIds.has(videoId)&&entry.rows.length<3){
          entry.videoIds.add(videoId);
          entry.rows.push({
            ...row,
            _sourceId:candidate.id,
            _sourceName:candidate.name
          });
        }
      }

      if(representatives.size>=SOURCE_DISCOVERY_TARGET)break;
    }
    if(representatives.size>=SOURCE_DISCOVERY_TARGET)break;
  }

  const entries=[...representatives.values()]
    .filter(entry=>entry.rows.length)
    .slice(0,SOURCE_DISCOVERY_TARGET);

  return {
    rows:entries.map(entry=>entry.rows[0]),
    sourceCandidates:entries.map(entry=>({
      id:entry.candidate.id,
      name:entry.candidate.name,
      samples:entry.rows.map(row=>({
        title:clean(row?._displayTitle||row?.title||""),
        published:clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||publishedLabel(row)||""),
        views:Number(row?.views)||0
      }))
    })),
    exhausted
  };
}

async function classifySourceDiscovery(parent,discovery={}){
  const group=parentSourceGroup(parent);
  return (Array.isArray(discovery?.rows)?discovery.rows:[])
    .filter(row=>{
      const candidate=sourceCandidateFromVideo(row);
      return candidate&&!sourceAlreadyKnownForDiscovery(candidate,group);
    });
}

async function discoverSourcesForParent(parent,local){
  if(document.hidden)return;
  const group=parentSourceGroup(parent);
  if(!group)return;

  const positiveSources=group===GENERAL_SOURCE_SCOPE
    ?selectedSources()
    :selectedSources(group);
  if(!positiveSources.length)return;

  const last=Number(sourceDiscoveryAt.get(group)||0);
  if(Date.now()-last<SOURCE_DISCOVERY_TTL)return;

  try{
    // AI only supplies search phrases from selected-video context. YouTube
    // search itself is always the local engine. Exact selected/blocked/current
    // suggestion IDs are filtered by code before a channel can be suggested.
    const discovery=await collectNewSourceDiscoveryRows(parent,local,group);
    if(discovery.rows.length){
      rememberDiscoveredSources(discovery.rows,group);
      if(sourceManageMode&&!sourcesSheet?.hidden)renderSourceLibrary();
    }

    sourceDiscoveryAt.set(group,Date.now());
  }catch(error){
    console.warn("source discovery failed",parent?.label||group,error);
  }
}

async function enrichSelectedCategoryInBackground(parent,rows=[]){
  const group=parentSourceGroup(parent);
  const source=dedupeHashedRows(newestFirst(Array.isArray(rows)?rows:[]))
    .filter(row=>!isBlockedSourceRow(row,group));
  if(!source.length)return [];

  saveSourceContentLearning(
    group,
    extractSourceContentTerms(parent,source)
  );
  return source;
}

async function buildCategorySourceSnapshot(parent,local=null){
  const group=parentSourceGroup(parent);
  if(!group)return [];
  const sources=selectedSourcesForParent(parent);
  if(!sources.length){
    state.aiCategoryRows.set(parent.key,{at:Date.now(),items:[]});
    return [];
  }

  local=local||await localEngine(12000);
  const raw=await fetchSourcePool(local,sources,true,group);
  const rows=dedupeHashedRows(
    newestFirst(
      (Array.isArray(raw)?raw:[])
        .filter(uploadedWithinCategoryWindow)
        .filter(row=>!isBlockedSourceRow(row,group))
        .map(row=>({...row,_selectedCategorySource:true}))
    )
  ).slice(0,90);

  if(!rows.length)return [];

  const packaged=await packageRowsWithAi("category:"+parent.key,rows,{
    sourceSignature:sourceSignature(group),
    maxRows:90
  });

  state.aiCategoryRows.set(parent.key,{at:Date.now(),items:packaged});
  saveSourceContentLearning(
    group,
    extractSourceContentTerms(parent,packaged)
  );
  return packaged;
}

async function refreshSelectedCategoryInBackground(parent,local,sources,seq){
  if(document.hidden)return;
  try{
    const rows=await buildCategorySourceSnapshot(parent,local);
    if(!rows.length)return;

    // Suggestions are learned after the complete snapshot is packaged. Never
    // mutate/reorder the visible category while the user is reading it.
    void discoverSourcesForParent(parent,local).catch(()=>{});
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
      return;
    }

    // Reserve snapshot first: this package is persistent and has no TTL.
    // It is shown immediately while the replacement package is built silently.
    const reserve=instantCategoryRows(parent);
    if(reserve.length){
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:reserve});
      state.aiCategoryTopics.set(parent.key,[]);
      state.trendTopics=[];
      renderTrendTopics();

      if(state.activeParent===parent.key){
        const visible=reserve;
        await prewarmRowSourceAvatars(visible.slice(0,36),260);
        if(seq!==state.feedSeq||state.activeParent!==parent.key)return;
        renderCards(visible);
        feedStatus.textContent=visible.length?visible.length+" video":"";
      }

      void localEngine(12000)
        .then(local=>refreshSelectedCategoryInBackground(parent,local,sources,seq))
        .catch(()=>{});
      return;
    }

    // First-ever package only. Do not show a timeout/retry state; build one
    // complete sorted snapshot and paint it once.
    const local=await localEngine(12000);
    const rows=await buildCategorySourceSnapshot(parent,local);
    if(seq!==state.feedSeq||state.activeParent!==parent.key)return;

    state.aiCategoryTopics.set(parent.key,[]);
    state.trendTopics=[];
    renderTrendTopics();

    if(rows.length){
      const visible=rows;
      await prewarmRowSourceAvatars(visible.slice(0,36),320);
      if(seq!==state.feedSeq||state.activeParent!==parent.key)return;
      renderCards(visible);
      feedStatus.textContent=visible.length?visible.length+" video":"";
      void discoverSourcesForParent(parent,local).catch(()=>{});
    }else{
      feed.innerHTML='<div class="empty">Chưa có video mới từ nguồn đã chọn.</div>';
      feedStatus.textContent="";
    }
  }catch(error){
    console.warn("selected category snapshot failed",parent?.label||parent?.key,error);
    if(state.activeParent===parent?.key&&!instantCategoryRows(parent).length){
      feed.innerHTML='<div class="empty">Chưa có gói dữ liệu dự trữ cho tab này.</div>';
      feedStatus.textContent="";
    }
  }finally{
    state.aiCategoryLoading.delete(parent.key);
  }
}

function renderCurrentTrendFeed(){
  renderParentCategories();
  state.activeTrend="";
  state.trendTopics=[];
  renderTrendTopics();
  renderCards(state.feedRows);
}

async function refreshAiTrendTopics(){
  state.parentCategories=sourceCategoryRows();
  renderParentCategories();
}

trendTopics?.addEventListener("click",event=>{
  const button=event.target.closest("[data-trend]");
  if(!button)return;
  state.activeTrend="";
  state.trendTopics=[];
  renderTrendTopics();
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
  if(window.MediaMeta?.relativePublished){
    const label=window.MediaMeta.relativePublished(row);
    if(label)return label;
  }

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
  if(days<30)return days+" ngày trước";
  if(days<365)return Math.max(1,Math.floor(days/30))+" tháng trước";
  return Math.max(1,Math.floor(days/365))+" năm trước";
}

function feedPublishedLabel(row={}){
  return relativePublishedLabel(row);
}

function videoUiMeta(row={}){
  const base=window.MediaMeta?.video?.(row)||{};
  const channel=clean(
    base.sourceName||
    row?._displaySource||
    row?.uploaderName||
    row?.uploader||
    row?.channelName||
    row?._sourceName||
    ""
  );
  const sourceId=canonicalSourceId(row,channel)||String(base.sourceId||"").trim();
  const sourceAvatar=sourceAvatarForRow(row,sourceId,channel)||safeSourceThumb(base.sourceAvatar||"");
  const views=Number(base.views)||Number(row?.views)||0;
  const rawViewText=clean(row?.viewText||"");

  return {
    id:base.id||itemVideoId(row),
    url:base.url||"",
    title:clean(base.title||row?._displayTitle||row?.title)||"Video",
    thumbnail:base.thumbnail||thumb(row,itemVideoId(row)),
    channel,
    sourceId,
    sourceAvatar,
    duration:Number(base.duration)||durationSeconds(row),
    views,
    viewsLabel:base.viewsLabel||fmtViewLabel(views,rawViewText),
    published:base.publishedLabel||relativePublishedLabel(row)||publishedLabel(row),
    isLive:base.isLive===true||row?.isLive===true
  };
}

function publishedAgeMs(row={}){
  if(window.MediaMeta?.publishedAgeMs){
    const age=window.MediaMeta.publishedAgeMs(row);
    if(Number.isFinite(age))return age;
  }

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
  const media=videoUiMeta(row);
  const title=media.title;
  const channel=media.channel||searchChannelName(row);
  const sourceId=media.sourceId||searchSourceId(row);
  const sourceAvatar=media.sourceAvatar;
  const views=media.views;
  const viewText=media.viewsLabel;
  const duration=media.duration;
  const isLive=media.isLive;
  const published=media.published;
  const statBits=[];
  if(viewText)statBits.push(viewText);
  if(published)statBits.push(published);
  const episode=Number(options.episode)||0;
  const seriesKey=clean(options.seriesKey||"");

  return '<article class="card search-card" data-video-id="'+esc(id)+
    '" data-source-id="'+esc(sourceId)+
    '" data-title="'+esc(title)+
    '" data-channel="'+esc(channel)+
    '" data-views="'+esc(String(views))+
    '" data-view-text="'+esc(viewText)+
    '" data-duration="'+esc(String(duration))+
    '" data-live="'+(isLive?'1':'0')+
    '" data-published="'+esc(published)+
    '" data-thumb="'+esc(media.thumbnail)+
    '" data-aspect="'+esc(String(rowAspectRatio(row)||""))+
    '" data-search-match="'+(options.match===false?'0':'1')+
    '" data-series-key="'+esc(seriesKey)+
    '" data-episode="'+esc(String(episode||""))+'">'+
      '<div class="thumb-wrap"><img src="'+esc(media.thumbnail)+'" alt="" loading="lazy">'+
        (isLive?'<span class="live-badge">LIVE</span>':duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+
        (episode?'<span class="episode-badge">Tập '+esc(String(episode))+'</span>':'')+
      '</div>'+
      '<div class="card-copy">'+
        '<span class="card-avatar" aria-hidden="true">'+
          (sourceAvatar?'<img src="'+esc(sourceAvatar)+'" alt="" loading="eager">':'')+
        '</span>'+
        '<div class="card-copy-main">'+
          '<div class="card-title-row">'+
            '<div class="card-title">'+esc(title)+'</div>'+
            cardMoreButtonHtml()+
          '</div>'+
          '<div class="card-meta-line">'+
            '<span class="card-channel">'+esc(channel)+'</span>'+
            (statBits.length?'<span class="card-meta-sep"> · </span><span class="card-stats">'+esc(statBits.join(" · "))+'</span>':'')+
          '</div>'+
        '</div>'+
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
  const scope=sourceScope(
    options.scope||
    state.currentMeta?._watchScope||
    activeSourceScope()||
    GENERAL_SOURCE_SCOPE
  );
  for(const row of rows){
    if(isBlockedSourceRow(row,scope))continue;
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
const homeAvatarFailedAt=new Map();
let homeAvatarQueueTimer=0;

function paintCardChannelAvatar(card,image=""){
  image=safeSourceThumb(image);
  if(!card||!image)return false;
  const avatar=card.querySelector(".card-avatar");
  if(!avatar)return false;

  if(!avatarImageReady(image)){
    void warmAvatarImage(image).then(ok=>{
      if(ok&&card.isConnected)paintCardChannelAvatar(card,image);
    });
    return true;
  }

  const img=document.createElement("img");
  img.src=image;
  img.alt="";
  img.width=36;
  img.height=36;
  img.decoding="async";
  avatar.replaceChildren(img);
  return true;
}

function paintHomeChannelAvatar(sourceId,meta={}){
  const image=rememberSourceAvatar(sourceId,meta?.thumbnailUrl||"");
  if(!image)return false;
  let painted=false;
  for(const card of feed.querySelectorAll("[data-source-id]")){
    if((card.dataset.sourceId||"")!==sourceId)continue;
    painted=paintCardChannelAvatar(card,image)||painted;
  }
  return painted;
}

function sourceCandidateForCard(card){
  if(!card)return null;
  const direct=String(card.dataset.sourceId||"").trim();
  if(/^UC[A-Za-z0-9_-]+$/.test(direct)){
    return {id:direct,meta:sourceMetaCache.get(direct)||libraryRow(direct)||null};
  }

  const channel=normalizeSearchText(card.dataset.channel||"");
  if(!channel)return null;
  const candidate=managedChannelLibrary().find(row=>
    normalizeSearchText(sourceMetaFor(row).name||row.name||"")===channel
  );
  if(!candidate?.id)return null;

  card.dataset.sourceId=candidate.id;
  return {
    id:candidate.id,
    meta:sourceMetaCache.get(candidate.id)||libraryRow(candidate.id)||candidate
  };
}

async function hydrateHomeChannelAvatars(){
  const ids=[];
  const now=Date.now();

  for(const card of feed.querySelectorAll(".card[data-video-id]")){
    if(card.querySelector(".card-avatar img"))continue;

    const candidate=sourceCandidateForCard(card);
    if(!candidate?.id)continue;

    const id=candidate.id;
    const cached=candidate.meta;
    const cachedImage=safeSourceThumb(cached?.thumbnailUrl||sourceAvatarCached(id)||"");
    if(cachedImage&&await warmAvatarImage(cachedImage)){
      paintCardChannelAvatar(card,cachedImage);
      homeAvatarResolved.add(id);
      continue;
    }

    if(
      ids.includes(id)||
      homeAvatarLoading.has(id)||
      homeAvatarResolved.has(id)||
      now-(homeAvatarFailedAt.get(id)||0)<5*60*1000
    )continue;

    ids.push(id);
    if(ids.length>=16)break;
  }

  if(!ids.length)return;

  let engine;
  try{engine=await localEngine(10000);}catch{return;}

  await Promise.allSettled(ids.map(async id=>{
    homeAvatarLoading.add(id);
    try{
      const meta=await engine.channelMeta(id);
      const image=safeSourceThumb(meta?.thumbnailUrl||"");
      if(meta&&meta.id&&image){
        sourceMetaCache.set(id,{...sourceMetaCache.get(id),...meta});
        rememberSourceAvatar(id,image);
        if(await warmAvatarImage(image)&&paintHomeChannelAvatar(id,meta)){
          homeAvatarResolved.add(id);
          homeAvatarFailedAt.delete(id);
          return;
        }
      }
      homeAvatarFailedAt.set(id,Date.now());
    }catch{
      homeAvatarFailedAt.set(id,Date.now());
    }finally{
      homeAvatarLoading.delete(id);
    }
  }));

  const pending=[...feed.querySelectorAll(".card[data-video-id]")].some(card=>{
    if(card.querySelector(".card-avatar img"))return false;
    const candidate=sourceCandidateForCard(card);
    if(!candidate?.id)return false;
    return !homeAvatarResolved.has(candidate.id)&&
      !homeAvatarLoading.has(candidate.id)&&
      Date.now()-(homeAvatarFailedAt.get(candidate.id)||0)>=5*60*1000;
  });

  if(pending)queueHomeChannelAvatars();
}

function queueHomeChannelAvatars(){
  clearTimeout(homeAvatarQueueTimer);
  homeAvatarQueueTimer=setTimeout(()=>void hydrateHomeChannelAvatars(),40);
}

let selectedAvatarPrewarmPromise=null;

async function prewarmSelectedSourceAvatars(){
  if(selectedAvatarPrewarmPromise)return selectedAvatarPrewarmPromise;

  const ids=new Set([...allManagedStateIds()]);
  for(const id of allTemporarySourceIds())ids.add(id);

  const missing=[...ids].filter(id=>
    /^UC[A-Za-z0-9_-]+$/.test(id)&&!sourceAvatarCached(id)
  );

  if(!missing.length)return;

  selectedAvatarPrewarmPromise=(async()=>{
    let engine;
    try{engine=await localEngine(12000);}catch{return;}

    const queue=[...missing];
    const workers=Array.from({length:Math.min(6,queue.length)},async()=>{
      while(queue.length){
        const id=queue.shift();
        if(!id)continue;
        try{
          const meta=await engine.channelMeta(id);
          if(meta&&meta.id){
            sourceMetaCache.set(id,{...sourceMetaCache.get(id),...meta});
            rememberSourceAvatar(id,meta.thumbnailUrl||"");
          }
        }catch{}
      }
    });

    await Promise.allSettled(workers);
    await warmManagedAvatarImages(850);
  })().finally(()=>{
    selectedAvatarPrewarmPromise=null;
  });

  return selectedAvatarPrewarmPromise;
}

async function prewarmRowSourceAvatars(rows=[],maxWait=520){
  const missing=new Set();
  const warmUrls=new Set();

  for(const row of Array.isArray(rows)?rows:[]){
    const channel=clean(
      row?._displaySource||
      row?.uploaderName||
      row?.uploader||
      row?.channelName||
      row?._sourceName||
      row?.name||
      ""
    );
    const id=canonicalSourceId(row,channel)||
      (/^UC[A-Za-z0-9_-]+$/.test(String(row?.id||""))?String(row.id):"");
    if(!id)continue;

    const image=sourceAvatarForRow(row,id,channel)||sourceAvatarCached(id);
    if(image){
      warmUrls.add(image);
      continue;
    }

    missing.add(id);
  }

  const work=(async()=>{
    if(missing.size){
      let engine;
      try{engine=await localEngine(10000);}catch{engine=null;}

      if(engine){
        const queue=[...missing];
        const workers=Array.from({length:Math.min(6,queue.length)},async()=>{
          while(queue.length){
            const id=queue.shift();
            if(!id)continue;
            try{
              const meta=await engine.channelMeta(id);
              if(meta&&meta.id){
                sourceMetaCache.set(id,{...sourceMetaCache.get(id),...meta});
                const image=rememberSourceAvatar(id,meta.thumbnailUrl||"");
                if(image)warmUrls.add(image);
              }
            }catch{}
          }
        });
        await Promise.allSettled(workers);
      }
    }

    if(warmUrls.size){
      await Promise.allSettled([...warmUrls].map(warmAvatarImage));
    }

    for(const id of missing){
      const image=sourceAvatarCached(id);
      if(image&&avatarImageReady(image))paintHomeChannelAvatar(id,{thumbnailUrl:image});
    }
  })();

  await Promise.race([
    work,
    new Promise(resolve=>setTimeout(resolve,Math.max(160,Number(maxWait)||520)))
  ]);
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
  const avatarPaintJobs=[];
  const renderScope=activeSourceScope()||GENERAL_SOURCE_SCOPE;
  for(const row of rows){
    if(isBlockedSourceRow(row,renderScope))continue;
    const id=itemVideoId(row);
    if(!id||seen.has(id))continue;
    seen.add(id);
    const media=videoUiMeta(row);
    const title=media.title;
    const channel=media.channel;
    const sourceId=media.sourceId;
    const sourceAvatar=media.sourceAvatar;
    const avatarFallback=(channel.charAt(0)||"?").toUpperCase();
    if(sourceAvatar&&!avatarImageReady(sourceAvatar)){
      avatarPaintJobs.push({id,sourceId,image:sourceAvatar});
    }
    const duplicateExtra=Math.max(0,Number(row._duplicateExtra)||0);
    const views=media.views;
    const viewText=media.viewsLabel;
    const duration=media.duration;
    const isLive=media.isLive;
    const published=media.published;
    const statBits=[];
    if(viewText)statBits.push(viewText);
    if(published)statBits.push(published);
    const thumbUrl=media.thumbnail;
    const eager=cards.length<12;
    cards.push({
      id,
      html:
        '<article class="card" data-video-id="'+esc(id)+'" data-source-id="'+esc(sourceId)+'" data-title="'+esc(title)+'" data-channel="'+esc(channel)+'" data-views="'+esc(String(views))+'" data-view-text="'+esc(viewText)+'" data-duration="'+esc(String(duration))+'" data-live="'+(isLive?'1':'0')+'" data-published="'+esc(published)+'" data-thumb="'+esc(thumbUrl)+'" data-aspect="'+esc(String(rowAspectRatio(row)||""))+'">'+
          '<div class="thumb-wrap"><img src="'+esc(thumbUrl)+'" alt="" loading="'+(eager?'eager':'lazy')+'" decoding="async">'+(isLive?'<span class="live-badge">LIVE</span>':duration?'<span class="duration">'+esc(fmtDuration(duration))+'</span>':'')+'</div>'+
          '<div class="card-copy">'+
            '<span class="card-avatar" aria-hidden="true">'+
              (sourceAvatar&&avatarImageReady(sourceAvatar)
                ?'<img src="'+esc(sourceAvatar)+'" alt="" width="36" height="36" decoding="async">'
                :'<span class="card-avatar-fallback">'+esc(avatarFallback)+'</span>')+
            '</span>'+
            '<div class="card-copy-main">'+
              '<div class="card-title-row">'+
                '<div class="card-title">'+esc(title)+'</div>'+
                cardMoreButtonHtml()+
              '</div>'+
              '<div class="card-meta-line">'+
                '<span class="card-channel">'+esc(channel)+(duplicateExtra?' · <span class="card-related">+'+esc(String(duplicateExtra))+' nguồn khác</span>':'')+'</span>'+
                (statBits.length?'<span class="card-meta-sep"> · </span><span class="card-stats">'+esc(statBits.join(" · "))+'</span>':'')+
              '</div>'+
            '</div>'+
          '</div>'+
        '</article>'
    });
  }

  if(append){
    if(cards.length)feed.insertAdjacentHTML("beforeend",cards.map(card=>card.html).join(""));
  }else if(cards.length){
    const existing=new Map(
      [...feed.querySelectorAll(":scope > .card[data-video-id]")]
        .map(card=>[card.dataset.videoId,card])
        .filter(([id])=>!!id)
    );
    const template=document.createElement("template");
    const fragment=document.createDocumentFragment();

    for(const item of cards){
      let node=existing.get(item.id)||null;
      if(node){
        existing.delete(item.id);
      }else{
        template.innerHTML=item.html.trim();
        node=template.content.firstElementChild;
      }
      if(node)fragment.appendChild(node);
    }
    feed.replaceChildren(fragment);
  }else{
    feed.innerHTML='<div class="empty">Chưa có video.</div>';
  }

  if(options.updateStatus!==false){
    const total=feed.querySelectorAll("[data-video-id]").length;
    feedStatus.textContent=total?total+" video":"";
  }

  for(const job of avatarPaintJobs){
    const card=feed.querySelector('.card[data-video-id="'+CSS.escape(job.id)+'"]');
    if(card)paintCardChannelAvatar(card,job.image);
  }
  queueHomeChannelAvatars();

  ensureWatchNavRail();
  syncWatchCurrentCard();
  normalizeRenderedThumbnails();

  // Home chrome follows the top video once per stable feed/category paint.
  // No scroll/pointer sampling is reintroduced.
  if(!append&&!watchPlaybackVisible()){
    queueHomeChromeTintFromFeed();
  }

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
  const media=videoUiMeta(meta);
  const views=media.views;
  const duration=media.duration;
  const published=media.published;
  videoTitle.textContent=title;
  const bits=[];
  if(channel)bits.push(channel);
  if(media.viewsLabel)bits.push(media.viewsLabel);
  if(published)bits.push(published);
  if(duration)bits.push(fmtDuration(duration));
  videoMeta.textContent=bits.join(" · ");
  document.title=title+" · 1988";
  updateMediaSession(meta);

  const currentCard=[...feed.querySelectorAll("[data-video-id]")]
    .find(card=>card.dataset.videoId===state.currentId);
  const art=clean(
    meta.thumbnailUrl||
    meta.thumbnail||
    meta.poster||
    currentCard?.dataset?.thumb||
    ""
  );
  if(art)applyChromeTintFromArt(art,"watch",state.currentId);
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
  const context=fallbackVideoContext(meta,related);
  if(seq!==state.videoContextSeq||state.currentId!==id)return null;
  return context;
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
  const currentSourceBlocked=
    sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)
      ?isBlockedSourceRow({...meta,_sourceId:sourceId,channelId:sourceId},scope)
      :false;

  if(mode==="same_channel"&&currentSourceBlocked)return [];

  if(
    ["same_channel","creator"].includes(mode)&&
    !currentSourceBlocked&&
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
  const originalSourceBlocked=
    originalSourceId&&/^UC[A-Za-z0-9_-]+$/.test(originalSourceId)
      ?isBlockedSourceRow({id:originalSourceId,_sourceId:originalSourceId,name:originalChannel},"music")
      :false;
  if(originalSourceId&&/^UC[A-Za-z0-9_-]+$/.test(originalSourceId)&&!originalSourceBlocked){
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

  const topicScope=contextSourceScope(context);
  const currentTopicSourceBlocked=
    sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)
      ?isBlockedSourceRow({...meta,_sourceId:sourceId,channelId:sourceId},topicScope)
      :false;

  if(sourceId&&/^UC[A-Za-z0-9_-]+$/.test(sourceId)&&!currentTopicSourceBlocked){
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
      .filter(row=>!isBlockedSourceRow(row,topicScope))
      .slice(0,12);
  }else{
    topicRows=topicRows.filter(row=>!isBlockedSourceRow(row,topicScope));
  }
  if(state.currentId!==currentId)return false;
  if(topicRows.length)html.push(filmSuggestionSection("Cùng chủ đề · "+subject,topicRows,{limit:12,scope:topicScope}));

  if(!html.length)return false;
  feedTitle.textContent=subject||"Gợi ý tiếp theo";
  feed.classList.add("search-grouped");
  feed.innerHTML=html.join("");
  feedStatus.textContent=contextSummary(context);
  return true;
}

async function buildSelectedVideoRecommendations(local,currentId,meta={},related=[],playlist=null){
  // Search results own the feed until the user explicitly opens a video.
  // A late watch-next response from the previously playing video must never
  // overwrite a newly committed search.
  const recommendationStillCurrent=()=>
    state.currentId===currentId&&!state.searchResultsActive;
  if(!recommendationStillCurrent())return false;

  hideContextBrief();

  // Invalidate any old AI/context request started by an earlier build.
  state.videoContextSeq++;
  state.feedHasMore=false;

  const hasPlaylist=setPlaylistContext(playlist,currentId);
  if(hasPlaylist){
    const playlistHtml=playlistSuggestionHtml(playlist,currentId);
    if(playlistHtml){
      feedTitle.textContent="Danh sách phát";
      feedStatus.textContent="";
      feed.classList.add("search-grouped");
      feed.innerHTML=playlistHtml;
      return true;
    }
  }

  const rows=mergeUniqueRows([],Array.isArray(related)?related:[])
    .filter(row=>itemVideoId(row)&&itemVideoId(row)!==currentId)
    .filter(row=>!isBlockedSourceRow(row,activeSourceScope()||GENERAL_SOURCE_SCOPE))
    .slice(0,30);

  feedTitle.textContent="Gợi ý tiếp theo";
  feedStatus.textContent="";
  feed.classList.remove("search-grouped");

  if(rows.length){
    await prewarmRowSourceAvatars(rows.slice(0,24),420);
    if(!recommendationStillCurrent())return false;
    renderCards(rows,{updateStatus:false});
    return true;
  }

  // Last-resort non-AI fallback: a plain YouTube search using the current title.
  const q=clean(meta?._displayTitle||meta?.title||"");
  if(q&&local){
    try{
      const fallback=await local.search(q,{type:"video"});
      if(!recommendationStillCurrent())return false;
      const plain=mergeUniqueRows([],Array.isArray(fallback)?fallback:[])
        .filter(row=>itemVideoId(row)&&itemVideoId(row)!==currentId)
        .filter(row=>!isBlockedSourceRow(row,activeSourceScope()||GENERAL_SOURCE_SCOPE))
        .slice(0,24);
      if(plain.length){
        await prewarmRowSourceAvatars(plain,420);
        if(!recommendationStillCurrent())return false;
        renderCards(plain,{updateStatus:false});
        return true;
      }
    }catch{}
  }

  feed.innerHTML='<div class="empty">Chưa có gợi ý xem tiếp.</div>';
  return false;
}

async function playVideo(id,seedMeta={}){
  if(!id)return;

  // Keep the currently displayed shape before switching videos. The next
  // item should open in the same shape immediately, then correct itself only
  // when exact per-video dimensions are known.
  const previousPlaybackMeta=state.currentMeta||{};
  const previousDisplayedAspect=validPipAspect(state.videoAspect);
  const previousPlaybackScope=videoAspectHabitScope(previousPlaybackMeta);
  const previousPortraitLocked=
    state.videoAspectPortraitLocked===true&&
    previousDisplayedAspect>0&&
    previousDisplayedAspect<.80;

  // Preserve where the click came from before Search hands off to Watch.
  // This is needed for the remembered portrait/landscape habit on Search.
  const enteredFromSearch=state.searchResultsActive===true;

  // Opening a video is the explicit hand-off from Search results to Watch.
  // From this point recommendations may replace the result list.
  state.searchResultsActive=false;
  state.videoContextSeq++;

  document.documentElement.classList.remove("watch-search-open","watch-search-results","watch-categories-open");
  hideContextBrief();
  const frame=playerSection?.querySelector(".player-frame");
  const wasFloating=!!frame?.classList.contains("floating-iframe");
  const keepScrollY=window.scrollY;
  const previousAspect=validPipAspect(state.videoAspect)||16/9;
  const cachedAspect=cachedPipAspect(id);

  const currentPlaybackScope=
    enteredFromSearch
      ?"search"
      :(state.activeParent&&CONTENT_SOURCE_SCOPES.has(state.activeParent))
        ?state.activeParent
        :(state.searchScope&&CONTENT_SOURCE_SCOPES.has(state.searchScope))
          ?state.searchScope
          :activeSourceScope()||"";
  const playbackMeta={
    ...seedMeta,
    _watchScope:clean(seedMeta?._watchScope||currentPlaybackScope)
  };
  const targetPlaybackScope=videoAspectHabitScope(playbackMeta);
  const samePlaybackScope=
    !!previousDisplayedAspect&&(
      !previousPlaybackScope||
      !targetPlaybackScope||
      previousPlaybackScope===targetPlaybackScope
    );
  const carryPortraitLock=samePlaybackScope&&previousPortraitLocked;

  // Keep this state machine intentionally simple:
  // 1) auto/default = horizontal 16:9;
  // 2) if the real video is verified portrait, lock portrait;
  // 3) while continuing in the same viewing flow, keep portrait locked until
  //    the user leaves that flow. Do not let card/thumbnail metadata re-enable
  //    horizontal auto sizing.
  const immediateAspect=carryPortraitLock
    ?9/16
    :(cachedAspect||16/9);

  state.keepFloating=wasFloating;
  state.currentId=id;
  state.currentMeta=playbackMeta;
  state.videoAspect=immediateAspect;
  state.videoAspectVerified=!!cachedAspect||carryPortraitLock;
  state.videoAspectPortraitLocked=
    carryPortraitLock||
    (!!cachedAspect&&cachedAspect<.80);
  state.floatPreset="auto";
  state.floatUserSized=false;
  state.floatTucked=false;

  // Warm/resolve the real media shape for BOTH inline watch and fake PiP.
  // Playback starts immediately; geometry is corrected as soon as the probe
  // resolves, so portrait/square videos never stay trapped in a 16:9 shell.
  void primePipAspect(id).then(ratio=>{
    if(state.currentId!==id)return;
    ratio=validPipAspect(ratio);
    if(!ratio)return;

    const meta={
      ...(state.currentMeta||{}),
      aspectRatio:ratio,
      _aspectVerified:true,
      _aspectSource:"aspect-prime"
    };
    state.currentMeta=meta;
    updateCurrentVideoAspect(meta);
  }).catch(()=>{});

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
  applyResponsivePlayerFrame(state.currentMeta);
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
      if(!state.activeFeed&&!state.searchResultsActive){
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

        if(errorCode===101||errorCode===150){
          try{window.YTLocal?.markEmbedUnplayable?.(state.currentId,"iframe_error_"+errorCode)}catch{}
        }

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
  const q=normalizeCommittedSearchQuery(value);
  if(!q)return;

  clearSuggestions();
  clearSeriesContext();

  const seq=++state.searchSeq;
  state.videoContextSeq++;
  hideContextBrief();
  state.searchQuery=q;
  state.searchScope=GENERAL_SOURCE_SCOPE;
  state.searchResultsActive=true;
  state.activeParent="";
  state.activeTrend="";
  state.trendTopics=[];
  renderTrendTopics();
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

  feedTitle.textContent="Kết quả tìm kiếm";
  feed.classList.remove("search-grouped");
  feed.innerHTML='<div class="loading">Đang tìm…</div>';
  feedStatus.textContent="";
  if(searchRefinements){
    searchRefinements.hidden=true;
    searchRefinements.innerHTML="";
  }

  const usableRows=rows=>mergeUniqueRows(
    [],
    (Array.isArray(rows)?rows:[])
      .filter(row=>itemVideoId(row))
      .filter(row=>!isBlockedSourceRow(row,GENERAL_SOURCE_SCOPE))
  ).slice(0,60);

  const paintRows=rows=>{
    if(seq!==state.searchSeq||state.searchQuery!==q)return false;
    const cleanRows=usableRows(rows);
    if(!cleanRows.length)return false;

    state.feedRows=cleanRows;
    renderCards(cleanRows);
    rememberDiscoveredSources(cleanRows,"");
    feedStatus.textContent=cleanRows.length+" video";
    void prewarmRowSourceAvatars(cleanRows.slice(0,24),420).catch(()=>{});
    return true;
  };

  const requireRows=(rows,label)=>{
    const cleanRows=usableRows(rows);
    if(!cleanRows.length)throw new Error("empty_"+label);
    return cleanRows;
  };

  // Match the working Kira proof exactly: direct Innertube /search is the
  // primary path. Backend search runs in parallel only as a fallback, and an
  // empty backend response can never beat a valid direct YouTube result.
  const kiraTask=localEngine(1800)
    .then(local=>Promise.race([
      (typeof local.searchDirect==="function"
        ?local.searchDirect(q)
        :local.search(q,{type:"video"})),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("kira_search_timeout")),3200))
    ]))
    .then(rows=>requireRows(rows,"kira"));

  const backendTask=api("search",{
    q,
    filter:"videos",
    _fresh:Date.now()
  },4200).then(response=>requireRows(response?.data?.items,"backend"));

  let first=[];
  try{
    first=await Promise.any([kiraTask,backendTask]);
  }catch{}

  if(seq!==state.searchSeq)return;
  if(paintRows(first)){
    void Promise.allSettled([kiraTask,backendTask]).then(results=>{
      if(seq!==state.searchSeq||state.searchQuery!==q)return;
      const merged=[...state.feedRows];
      for(const result of results){
        if(result.status==="fulfilled")merged.push(...result.value);
      }
      const rows=usableRows(merged);
      if(rows.length<=state.feedRows.length)return;
      state.feedRows=rows;
      renderCards(rows);
      rememberDiscoveredSources(rows,"");
      feedStatus.textContent=rows.length+" video";
    });
    return;
  }

  if(seq!==state.searchSeq)return;

  // Mixed backend search is only a secondary fallback.
  try{
    const response=await api("search",{
      q,
      filter:"all",
      _fresh:Date.now()
    },3600);
    if(seq!==state.searchSeq)return;
    if(paintRows(response?.data?.items))return;
  }catch{}

  if(seq!==state.searchSeq)return;
  feed.innerHTML='<div class="empty">Chưa thấy kết quả phù hợp.</div>';
  feedStatus.textContent="";
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

function resetHomeViewportInstant({resetSource=false,resetTopics=true}={}){
  const root=document.documentElement;
  root.classList.remove("home-header-hidden","home-search-open");

  hardResetDocumentTop();

  if(resetTopics&&topicChips)topicChips.scrollLeft=0;

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

function focusSearchInputForEditing(){
  if(!queryInput)return;

  // Keep focus inside the original user gesture so mobile browsers reliably
  // open the software keyboard.
  try{queryInput.focus({preventScroll:true});}
  catch{queryInput.focus?.();}

  const end=String(queryInput.value||"").length;
  try{queryInput.setSelectionRange(end,end);}catch{}
}

function setSearchEntryIcon(open){
  if(!homeSearchToggle)return;
  homeSearchToggle.innerHTML=homeSearchIconMarkup(!!open);
  homeSearchToggle.setAttribute("aria-label",open?"Đóng tìm kiếm":"Mở tìm kiếm");
}

function setHomeSearchOpen(open){
  const root=document.documentElement;
  if(root.classList.contains("watch-browse"))return;
  if(open)root.classList.remove("home-header-hidden");
  root.classList.toggle("home-search-open",!!open);
  setSearchEntryIcon(open);

  if(open){
    focusSearchInputForEditing();
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
    setSearchEntryIcon(open);

    if(open){
      if(feedSection){
        feedSection.scrollTop=0;
        feedSection.scrollLeft=0;
      }
      focusSearchInputForEditing();
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

function commitSearch(value){
  const q=clean(value);
  if(!q)return;

  const root=document.documentElement;
  const fromWatch=root.classList.contains("watch-browse");

  clearSuggestions();
  queryInput?.blur?.();

  // Search editing is finished as soon as the user commits. The back arrow
  // therefore disappears immediately, while results keep their own view state.
  root.classList.remove("home-search-open","watch-search-open");
  root.classList.toggle("watch-search-results",fromWatch);
  setSearchEntryIcon(false);

  if(fromWatch&&feedSection){
    feedSection.scrollTop=0;
    feedSection.scrollLeft=0;
  }

  void doSearch(q);
}

// Main search uses the same simple submit path as the working Kira proof.
// Do not keep a custom IME/pending state here: the browser owns composition,
// and every form submit reads the current input and starts a fresh search.
searchForm?.addEventListener("submit",event=>{
  event.preventDefault();
  const q=normalizeCommittedSearchQuery(queryInput?.value||"");
  if(!q)return;
  queryInput.value=q;
  commitSearch(q);
});

// Normal YouTube-like suggestions while typing; search runs only on submit/click.
queryInput.addEventListener("input",()=>{
  normalSuggestionArmed=true;
  clearSearchRefinements();
  scheduleNormalSuggestions();
});

queryInput.addEventListener("focus",()=>{
  normalSuggestionArmed=true;
  if(clean(queryInput.value).length>=2)scheduleNormalSuggestions();
});

document.addEventListener("pointerdown",event=>{
  const target=event.target;
  if(searchForm?.contains(target)||suggestions?.contains(target))return;
  clearSearchSuggestionPanel();
},{passive:true});

suggestions?.addEventListener("click",event=>{
  const button=event.target.closest("[data-search-suggestion]");
  if(!button)return;
  const value=clean(button.dataset.searchSuggestion||button.textContent||"");
  if(!value)return;
  queryInput.value=value;
  commitSearch(value);
});

queryInput.addEventListener("blur",()=>{
  requestAnimationFrame(()=>{
    if(document.activeElement&&suggestions?.contains(document.activeElement))return;
    clearSearchSuggestionPanel();
  });
});

const desktopCardColorCache=new Map();

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
          if(lum<18||lum>238)continue;
          r+=rr;g+=gg;b+=bb;count++;
        }

        if(!count){resolve("");return;}

        r/=count;g/=count;b/=count;
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

function applyPageChromeTint(color,scope="watch"){
  const root=document.documentElement;
  const match=String(color||"").match(/\d+(?:\.\d+)?/g);
  if(!match||match.length<3)return;

  const r=Math.max(0,Math.min(255,Math.round(Number(match[0])||0)));
  const g=Math.max(0,Math.min(255,Math.round(Number(match[1])||0)));
  const b=Math.max(0,Math.min(255,Math.round(Number(match[2])||0)));

  root.style.setProperty("--page-chrome-tint",`rgb(${r},${g},${b})`);
  root.style.setProperty("--page-chrome-glow",`rgba(${r},${g},${b},.52)`);
  root.style.setProperty("--page-chrome-soft",`rgba(${r},${g},${b},.26)`);
  root.style.setProperty("--page-chrome-faint",`rgba(${r},${g},${b},.12)`);
  root.dataset.chromeTintScope=scope;
}

let pageChromeTintSeq=0;
let homeChromeTintThumb="";
let homeChromeTintRaf=0;

function watchPlaybackVisible(){
  return !!state.currentId&&!playerSection?.hidden;
}

function applyChromeTintFromArt(art,scope="watch",guardId=""){
  art=String(art||"").trim();
  if(!art)return;

  const requestSeq=++pageChromeTintSeq;
  const expectedVideoId=String(guardId||"").trim();

  void averageThumbTint(art).then(color=>{
    if(requestSeq!==pageChromeTintSeq||!color)return;

    if(scope==="home"&&watchPlaybackVisible())return;
    if(
      scope==="watch"&&
      expectedVideoId&&
      String(state.currentId||"")!==expectedVideoId
    )return;

    applyPageChromeTint(color,scope);
  });
}

function syncHomeChromeTintFromFeed(force=false){
  if(watchPlaybackVisible())return;

  const card=feed.querySelector(":scope > .card[data-video-id]");
  const art=String(card?.dataset?.thumb||"").trim();
  if(!art)return;

  if(!force&&art===homeChromeTintThumb)return;
  homeChromeTintThumb=art;
  applyChromeTintFromArt(art,"home");
}

function queueHomeChromeTintFromFeed(force=false){
  if(force)homeChromeTintThumb="";
  if(homeChromeTintRaf)return;

  homeChromeTintRaf=requestAnimationFrame(()=>{
    homeChromeTintRaf=0;
    syncHomeChromeTintFromFeed(force);
  });
}

function normalizeThumbnailFit(img){
  if(!img||!img.closest(".thumb-wrap"))return;

  const apply=()=>{
    // v206: always preserve the full source thumbnail. Do not use aspect-ratio
    // heuristics that can switch a 16:9 thumbnail back to cover and shave off
    // artwork, logos or embedded borders at the left/right edges.
    img.classList.add("thumb-fit-contain");
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
  if(e.target.closest("[data-card-more]"))return;
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

  const more=e.target.closest("[data-card-more]");
  if(more){
    e.preventDefault();
    e.stopPropagation();
    const card=more.closest("[data-video-id]");
    openCardActionMenu(card,more);
    return;
  }

  const card=e.target.closest("[data-video-id]");
  if(!card)return;
  const id=card.dataset.videoId;
  showWatchRecoInfo(card,{autoHide:true});
  setSeriesContextFromCard(card);
  playVideo(id,rowFromCard(card));
});

document.addEventListener("click",event=>{
  const scopeButton=event.target.closest?.("[data-card-scope]");
  if(scopeButton){
    event.preventDefault();
    event.stopPropagation();
    const scope=scopeButton.dataset.cardScope||"";
    const action=scopeButton.dataset.cardScopeAction||"";
    applyCardSourceAction(action,scope);
    return;
  }

  const backButton=event.target.closest?.("[data-card-action-back]");
  if(backButton){
    event.preventDefault();
    event.stopPropagation();
    restoreCardActionRootMenu();
    return;
  }

  const actionButton=event.target.closest?.("[data-card-action]");
  if(!actionButton)return;
  event.preventDefault();
  event.stopPropagation();
  void handleCardAction(actionButton.dataset.cardAction||"",actionButton);
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

  // When the app becomes visible again, refresh complete snapshots for all
  // tabs in the background. The currently visible list is never reordered.
  void refreshAllSourceSnapshotsInBackground();

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

const FEED_CACHE_PREFIX="1988-discovery-v23:";
const TAB_SNAPSHOT_PREFIX="1988-tab-snapshot-v1:";

function snapshotKey(name="",suffix=""){
  return TAB_SNAPSHOT_PREFIX+String(name||"")+":"+suffix;
}

function snapshotRowsHash(rows=[],sourceSig=""){
  const body=(Array.isArray(rows)?rows:[]).slice(0,90).map(row=>[
    itemVideoId(row),
    clean(row?._displayTitle||row?.title||""),
    clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||""),
    String(row?._sourceId||row?.channelId||row?.uploaderId||""),
    row?.isLive===true?"1":"0"
  ].join("|")).join("\n");
  return fastHash(String(sourceSig||"")+"\n"+body);
}

function readAtomicSnapshot(name=""){
  try{
    const pointer=JSON.parse(localStorage.getItem(snapshotKey(name,"ptr"))||"null");
    const preferred=pointer?.slot==="b"?"b":"a";
    const slots=[preferred,preferred==="a"?"b":"a"];

    for(const slot of slots){
      const raw=localStorage.getItem(snapshotKey(name,slot));
      if(!raw)continue;
      const row=JSON.parse(raw);
      if(!row||!Array.isArray(row.items)||!row.items.length)continue;
      const actual=snapshotRowsHash(row.items,row.sourceSignature||"");
      if(!row.hash||row.hash!==actual)continue;
      return row;
    }
  }catch{}
  return null;
}

function commitAtomicSnapshot(name="",rows=[],{sourceSignature:sourceSig="",inputHash=""}={}){
  const items=(Array.isArray(rows)?rows:[]).slice(0,90);
  if(!items.length)return {changed:false,hash:"",inputHash:"",items:[]};

  const hash=snapshotRowsHash(items,sourceSig);
  const current=readAtomicSnapshot(name);
  if(current?.hash===hash&&(!inputHash||current?.inputHash===inputHash)){
    try{
      localStorage.setItem(snapshotKey(name,"ptr"),JSON.stringify({
        slot:current.slot||"a",
        hash,
        inputHash:inputHash||current?.inputHash||"",
        checkedAt:Date.now()
      }));
    }catch{}
    return {changed:false,hash,inputHash:inputHash||current?.inputHash||"",items:current.items};
  }

  try{
    const pointer=JSON.parse(localStorage.getItem(snapshotKey(name,"ptr"))||"null");
    const oldSlot=pointer?.slot==="b"?"b":"a";
    const nextSlot=oldSlot==="a"?"b":"a";
    const payload={
      slot:nextSlot,
      hash,
      inputHash:String(inputHash||""),
      at:Date.now(),
      sourceSignature:String(sourceSig||""),
      items
    };

    // Double-buffer commit: write + verify the new package first, then move
    // the pointer, and only after that delete the old package.
    localStorage.setItem(snapshotKey(name,nextSlot),JSON.stringify(payload));
    const verify=JSON.parse(localStorage.getItem(snapshotKey(name,nextSlot))||"null");
    if(!verify||verify.hash!==hash||snapshotRowsHash(verify.items,verify.sourceSignature||"")!==hash){
      localStorage.removeItem(snapshotKey(name,nextSlot));
      return {changed:false,hash:current?.hash||"",items:current?.items||[]};
    }

    localStorage.setItem(snapshotKey(name,"ptr"),JSON.stringify({
      slot:nextSlot,
      hash,
      inputHash:String(inputHash||""),
      checkedAt:Date.now()
    }));
    localStorage.removeItem(snapshotKey(name,oldSlot));
    return {changed:true,hash,inputHash:String(inputHash||""),items};
  }catch(error){
    console.warn("snapshot commit failed",name,error);
    return {
      changed:false,
      hash:current?.hash||"",
      inputHash:current?.inputHash||"",
      items:current?.items||[]
    };
  }
}

function clearAtomicSnapshot(name=""){
  try{
    localStorage.removeItem(snapshotKey(name,"a"));
    localStorage.removeItem(snapshotKey(name,"b"));
    localStorage.removeItem(snapshotKey(name,"ptr"));
  }catch{}
}

function readNewestLegacyFeedCache(name=""){
  let best=null;
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      if(!key.startsWith("1988-discovery-")||!key.endsWith(":"+name))continue;
      const row=JSON.parse(localStorage.getItem(key)||"null");
      if(!row||!Array.isArray(row.items)||!row.items.length)continue;
      if(!best||Number(row.at||0)>Number(best.at||0))best=row;
    }
  }catch{}
  return best;
}

function cleanupLegacyFeedCaches(name=""){
  try{
    const remove=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||"";
      if(key.startsWith("1988-discovery-")&&key.endsWith(":"+name))remove.push(key);
    }
    for(const key of remove)localStorage.removeItem(key);
  }catch{}
}

let packageSyncApplying=false;
let packageManifestLastAt=0;
let packageWriteClock=Date.now();
const packageUploadChains=new Map();
const pendingPackageUploads=new Map();

function packageSnapshotName(scope=""){
  scope=String(scope||"").trim();
  if(scope===LIVE_SOURCE_SCOPE||scope===LATEST_SOURCE_SCOPE||scope===WEEK_SOURCE_SCOPE){
    return "feed:"+scope;
  }
  if(CONTENT_SOURCE_SCOPES.has(scope))return "category:"+scope;
  return "";
}

function packageScopeFromSnapshotName(name=""){
  name=String(name||"").trim();
  if(name.startsWith("feed:")){
    const scope=name.slice(5);
    return [LIVE_SOURCE_SCOPE,LATEST_SOURCE_SCOPE,WEEK_SOURCE_SCOPE].includes(scope)?scope:"";
  }
  if(name.startsWith("category:")){
    const scope=name.slice(9);
    return CONTENT_SOURCE_SCOPES.has(scope)?scope:"";
  }
  return "";
}

async function packageSyncFetch(method="GET",scope="",body=null,timeout=5200){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const url=scope
      ?PACKAGE_SYNC_URL+"?scope="+encodeURIComponent(scope)
      :PACKAGE_SYNC_URL;
    const response=await fetch(url,{
      method,
      cache:"no-store",
      signal:controller.signal,
      headers:{
        "content-type":"application/json",
        "x-1988-pin":SETTINGS_PIN
      },
      body:body==null?undefined:JSON.stringify(body)
    });
    if(!response.ok)throw new Error("package_sync_"+response.status);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

function nextPackageWriteVersion(){
  const now=Date.now();
  packageWriteClock=Math.max(now,packageWriteClock+1);
  return packageWriteClock;
}

function queuePackageUpload(snapshotName=""){
  if(packageSyncApplying)return Promise.resolve(false);
  const scope=packageScopeFromSnapshotName(snapshotName);
  const row=readAtomicSnapshot(snapshotName);
  if(!scope||!row?.hash||!Array.isArray(row.items)||!row.items.length){
    return Promise.resolve(false);
  }

  const payload={
    scope,
    hash:row.hash,
    inputHash:clean(row.inputHash||""),
    sourceSignature:clean(row.sourceSignature||""),
    items:row.items,
    version:nextPackageWriteVersion()
  };
  pendingPackageUploads.set(scope,payload);

  const previous=packageUploadChains.get(scope)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    const latest=pendingPackageUploads.get(scope);
    if(!latest||latest.hash!==payload.hash||latest.version!==payload.version)return true;

    try{
      const result=await packageSyncFetch("POST","",latest,7000);
      if(!result?.ok)throw new Error("package_write_failed");
      if(pendingPackageUploads.get(scope)?.version===latest.version){
        pendingPackageUploads.delete(scope);
      }
      return true;
    }catch(error){
      console.warn("package upload failed",scope,error);
      return false;
    }
  }).finally(()=>{
    if(packageUploadChains.get(scope)===task)packageUploadChains.delete(scope);
  });

  packageUploadChains.set(scope,task);
  return task;
}

function applyServerPackage(scope,pkg={}){
  const snapshotName=packageSnapshotName(scope);
  const items=Array.isArray(pkg?.items)?pkg.items:[];
  const sourceSig=clean(pkg?.source_signature||pkg?.sourceSignature||"");
  const expectedHash=clean(pkg?.hash||"");
  if(!snapshotName||!items.length||!expectedHash)return false;

  const actualHash=snapshotRowsHash(items,sourceSig);
  if(actualHash!==expectedHash){
    console.warn("server package hash mismatch",scope,expectedHash,actualHash);
    return false;
  }

  packageSyncApplying=true;
  try{
    commitAtomicSnapshot(snapshotName,items,{
      sourceSignature:sourceSig,
      inputHash:clean(pkg?.input_hash||pkg?.inputHash||"")
    });
    if(CONTENT_SOURCE_SCOPES.has(scope)){
      state.aiCategoryRows.set(scope,{at:Date.now(),items});
    }
  }finally{
    packageSyncApplying=false;
  }
  return true;
}

async function hydrateServerPackages({force=false}={}){
  if(!force&&Date.now()-packageManifestLastAt<60*1000)return true;

  try{
    const result=await packageSyncFetch("GET","",null,5200);
    if(!result?.ok)throw new Error("package_manifest_failed");
    const manifest=result.manifest&&typeof result.manifest==="object"?result.manifest:{};

    const downloads=[];
    for(const group of SOURCE_MANAGER_GROUPS){
      const scope=group.key;
      const snapshotName=packageSnapshotName(scope);
      if(!snapshotName)continue;

      const local=readAtomicSnapshot(snapshotName);
      const remote=manifest[scope];

      if(remote?.hash&&remote.hash!==local?.hash){
        downloads.push(
          packageSyncFetch("GET",scope,null,7000)
            .then(pkgResult=>{
              if(pkgResult?.ok&&pkgResult?.exists&&pkgResult.package){
                applyServerPackage(scope,pkgResult.package);
              }
            })
            .catch(error=>console.warn("package download failed",scope,error))
        );
      }else if(!remote?.hash&&local?.hash){
        // First server migration: publish this device's complete package.
        void queuePackageUpload(snapshotName);
      }
    }

    if(downloads.length)await Promise.all(downloads);
    packageManifestLastAt=Date.now();
    return true;
  }catch(error){
    console.warn("package manifest sync failed",error);
    return false;
  }
}

const SEARCH_VISIBLE_TARGET=36;
// Block-heavy tabs may need to pass many continuation pages before enough
// usable rows remain. Keep scanning until the visible target is refilled or
// YouTube is exhausted; this is only a hard failsafe against pathological loops.
const SEARCH_REFILL_MAX_PAGES=20;

async function pagedSearch(local,key,query,filters={},reset=false,scope=GENERAL_SOURCE_SCOPE){
  // A blocked result must not consume one of the visible result slots.
  // Continue through YouTube continuations until we have a normal page worth
  // of usable rows (or the upstream search is exhausted). This applies to
  // LIVE, category discovery and every other scoped source search.
  const visible=[];
  let first=reset;
  let fetchedAny=false;
  let lastError=null;

  for(let page=0;page<SEARCH_REFILL_MAX_PAGES;page++){
    let rows=[];
    try{
      rows=await local.searchPage(key,query,{type:"video",...filters},first);
    }catch(error){
      lastError=error;
      break;
    }
    first=false;

    if(!Array.isArray(rows)||!rows.length)break;
    fetchedAny=true;

    for(const row of rows){
      if(isBlockedSourceRow(row,scope))continue;
      visible.push(row);
    }

    if(mergeUniqueRows([],visible).length>=SEARCH_VISIBLE_TARGET)break;
  }

  if(fetchedAny){
    return mergeUniqueRows([],visible);
  }

  if(lastError)console.warn("paged search failed",key,lastError);
  if(!reset)return [];

  try{
    const rows=await local.search(query,{type:"video",...filters});
    return mergeUniqueRows(
      [],
      (Array.isArray(rows)?rows:[]).filter(row=>!isBlockedSourceRow(row,scope))
    );
  }catch{
    return [];
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

const SOURCE_POOL_KEY_PREFIX="1988-source-pool-v4:";
const SOURCE_POOL_TTL=5*60*1000;
const SOURCE_CHANNEL_CACHE_PREFIX="1988-source-channel-v2:";
const SOURCE_CHANNEL_CACHE_MAX_AGE=2*60*60*1000;
const SOURCE_CHANNEL_RECHECK_TTL=60*1000;
const SOURCE_ACTIVE_FEED_REFRESH_MS=60*1000;
const SOURCE_FEED_AUTO_REFRESH_MS=2*60*1000;
const SOURCE_FIRST_PAINT_ROWS=8;
let sourceFeedPendingRenderName="";

function sourceFeedRowsSignature(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .map(itemVideoId)
    .filter(Boolean)
    .join("|");
}

function freshSnapshotRowsForFeed(name){
  const preset=FEED_PRESETS[name];
  if(!preset)return [];

  const scoped=isSourceScopedFeed(name);
  const scope=scoped
    ?feedSourceScope(name)
    :name===LIVE_SOURCE_SCOPE
      ?LIVE_SOURCE_SCOPE
      :GENERAL_SOURCE_SCOPE;

  return sortPresetRows(readFeedCache(name),preset)
    .filter(row=>!MANAGED_SOURCE_SCOPES.has(scope)||!isBlockedSourceRow(row,scope));
}

function applyActiveFeedSnapshot(name,{force=false}={}){
  if(
    state.searchResultsActive||
    document.documentElement.classList.contains("watch-browse")||
    state.activeFeed!==name||
    state.activeParent||
    state.activeTrend
  )return false;

  const fresh=freshSnapshotRowsForFeed(name);
  if(!fresh.length)return false;

  const currentSig=sourceFeedRowsSignature(state.feedRows);
  const freshSig=sourceFeedRowsSignature(fresh);
  if(currentSig===freshSig){
    if(sourceFeedPendingRenderName===name)sourceFeedPendingRenderName="";
    return false;
  }

  // Never jump a user who is already reading lower in the list. The fresh
  // package is already stored; apply it as soon as they return to the top.
  if(!force&&window.scrollY>=120){
    sourceFeedPendingRenderName=name;
    return false;
  }

  state.feedRows=mergeUniqueRows([],fresh);
  state.feedHasMore=true;
  sourceFeedPendingRenderName="";
  renderCards(state.feedRows);
  feedStatus.textContent=state.feedRows.length?state.feedRows.length+" video":"";
  void prewarmRowSourceAvatars(state.feedRows.slice(0,24),320).catch(()=>{});
  return true;
}

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

function saveSourceChannelCache(source,rows=[],checkedAt=Date.now(),options={}){
  const sourceId=String(source?.id||source||"").trim();
  if(!sourceId)return [];
  const name=clean(source?.name||"");
  const old=readSourceChannelCache(sourceId);
  const incoming=(Array.isArray(rows)?rows:[])
    .filter(Boolean)
    .map(row=>({...row,_sourceId:sourceId,_sourceName:clean(row?._sourceName||name)}));
  const base=options?.replace===true
    ?incoming
    :mergeUniqueRows(incoming,old.items);
  const items=compactSourcePool(base)
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

const sourcePoolMemory=new Map();
const sourcePoolRefreshes=new Map();

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

function sourcePoolStorageKey(scope){
  return SOURCE_POOL_KEY_PREFIX+sourceScope(scope);
}

try{localStorage.removeItem("1988-source-pool-v3");}catch{}

function readSourcePoolCache(scope=LATEST_SOURCE_SCOPE){
  scope=sourceScope(scope);
  const signature=sourceSignature(scope);
  const memory=sourcePoolMemory.get(scope);
  if(
    memory?.signature===signature &&
    Array.isArray(memory.items) &&
    memory.items.length &&
    Date.now()-memory.at<SOURCE_POOL_TTL
  ){
    return memory.items;
  }

  try{
    const row=JSON.parse(localStorage.getItem(sourcePoolStorageKey(scope))||"null");
    if(
      row &&
      row.signature===signature &&
      Array.isArray(row.items) &&
      row.items.length &&
      Date.now()-Number(row.at||0)<SOURCE_POOL_TTL
    ){
      sourcePoolMemory.set(scope,{
        signature,
        at:Number(row.at)||Date.now(),
        items:row.items
      });
      return row.items;
    }
  }catch{}

  return [];
}

function saveSourcePoolCache(rows=[],scope=LATEST_SOURCE_SCOPE){
  scope=sourceScope(scope);
  const signature=sourceSignature(scope);
  const items=compactSourcePool(rows);
  const row={signature,at:Date.now(),items};
  sourcePoolMemory.set(scope,row);
  try{localStorage.setItem(sourcePoolStorageKey(scope),JSON.stringify(row));}catch{}
  return items;
}

function primeSourceFeedCache(){
  // Source-pool cache is raw transport data only. Final feed snapshots are
  // committed exclusively by packageRowsWithAi(), never by per-channel refresh.
}

function replaceSourceInPoolCache(source,rows=[],scope=LATEST_SOURCE_SCOPE){
  scope=sourceScope(scope);
  if(!FEED_SOURCE_SCOPES.has(scope))return [];
  const sourceId=String(source?.id||source||"").trim();
  if(!sourceId)return [];
  const sourceName=clean(source?.name||"");
  const current=readSourcePoolCache(scope);
  const keep=current.filter(row=>String(row?._sourceId||"")!==sourceId);
  const incoming=(Array.isArray(rows)?rows:[])
    .filter(Boolean)
    .map(row=>({
      ...row,
      _sourceId:sourceId,
      _sourceName:clean(row?._sourceName||sourceName)
    }));
  const saved=saveSourcePoolCache([...incoming,...keep],scope);
  primeSourceFeedCache(saved,scope);
  return saved;
}

async function fetchSourcePool(local,sources,reset=true,scope=GENERAL_SOURCE_SCOPE,onBatch=null){
  const collected=[];
  const collectedIndex=new Map();
  let cursor=0;
  const blocked=blockedSetForScope(scope);
  const list=Array.isArray(sources)?sources:[];

  const emit=(rows,source,meta={})=>{
    const batch=(Array.isArray(rows)?rows:[])
      .filter(Boolean)
      .map(row=>({...row,_sourceId:source.id,_sourceName:clean(row?._sourceName||source.name)}));

    if(meta.replaceSource===true){
      const keep=collected.filter(row=>String(row?._sourceId||"")!==source.id);
      collected.length=0;
      collectedIndex.clear();
      for(const row of keep){
        const id=itemVideoId(row);
        if(!id)continue;
        collectedIndex.set(id,collected.length);
        collected.push(row);
      }
    }

    if(meta.transient!==true){
      for(const row of batch){
        const id=itemVideoId(row);
        if(!id)continue;
        const existing=collectedIndex.get(id);
        if(existing===undefined){
          collectedIndex.set(id,collected.length);
          collected.push(row);
        }else if(meta.cached!==true){
          collected[existing]={...collected[existing],...row};
        }
      }
    }

    if(typeof onBatch==="function"&&(batch.length||meta.replaceSource===true)){
      try{onBatch(batch,source,meta)}catch{}
    }
  };

  const quickVisibleRows=rows=>(Array.isArray(rows)?rows:[])
    .filter(row=>{
      const id=itemVideoId(row);
      const title=clean(row?.title||row?._displayTitle||"");
      if(!id)return false;
      return !/^(?:\[?private video\]?|\[?deleted video\]?|video unavailable|video riêng tư|video không khả dụng|video đã bị xóa)$/i.test(title);
    });

  const worker=async()=>{
    while(cursor<list.length){
      const source=list[cursor++];
      if(!source||blocked.has(source.id))continue;

      const cached=reset?readSourceChannelCache(source.id):{items:[],checkedAt:0};
      if(reset&&cached.items.length){
        emit(cached.items,source,{cached:true});
      }

      if(reset&&!sourceNeedsRecheck(source.id))continue;

      try{
        const fetchedRows=await local.channelVideosPage(
          "library:"+scope+":"+source.id,
          source.id,
          reset
        );
        let rows=quickVisibleRows(Array.isArray(fetchedRows)?fetchedRows:[]);

        if(reset&&rows.length){
          saveSourceChannelCache(source,rows,Date.now(),{replace:true});
          emit(rows,source,{
            cached:false,
            preview:true,
            replaceSource:true
          });
        }

        // Feed refresh only needs the channel's newest upload list. Do not run
        // per-video /player embeddability probes here: they create hundreds of
        // slow 403 requests and do not affect whether a fresh card can be shown.
        // Playback validation remains lazy when the user actually opens a video.

        if(!reset&&rows.length){
          emit(rows,source,{cached:false});
          saveSourceChannelCache(source,[
            ...rows,
            ...readSourceChannelCache(source.id).items
          ],Date.now());
        }
      }catch(error){
        console.warn("source feed failed",scope,source.id,error);
      }
    }
  };

  const workers=Array.from(
    {length:Math.min(3,list.length)},
    ()=>worker()
  );
  await Promise.all(workers);
  return mergeUniqueRows([],collected);
}

function refreshSourcePool(local,sources,scope=LATEST_SOURCE_SCOPE,onBatch=null){
  scope=sourceScope(scope);
  const signature=scope+"|"+sourceSignature(scope);
  const current=sourcePoolRefreshes.get(scope);
  if(current?.signature===signature)return current.promise;

  const promise=(async()=>{
    const rows=await fetchSourcePool(
      local,
      sources,
      true,
      scope,
      onBatch
    );
    if(signature!==scope+"|"+sourceSignature(scope))return [];
    const saved=saveSourcePoolCache(rows,scope);
    primeSourceFeedCache(saved,scope);
    return saved;
  })().finally(()=>{
    const active=sourcePoolRefreshes.get(scope);
    if(active?.signature===signature)sourcePoolRefreshes.delete(scope);
  });

  sourcePoolRefreshes.set(scope,{signature,promise});
  return promise;
}

async function selectedSourceFeed(local,predicate,reset=false,onBatch=null,scope=LATEST_SOURCE_SCOPE){
  scope=sourceScope(scope);
  const sources=selectedSources(scope);
  if(!sources.length)return [];

  if(reset){
    const cached=readSourcePoolCache(scope);
    if(cached.length){
      if(!document.hidden)void refreshSourcePool(local,sources,scope,onBatch);
      return cached.filter(predicate);
    }

    const channelCached=cachedRowsForSources(sources,scope);
    if(channelCached.length){
      if(!document.hidden)void refreshSourcePool(local,sources,scope,onBatch);
      return channelCached.filter(predicate);
    }

    const fresh=await refreshSourcePool(local,sources,scope,onBatch);
    return fresh.filter(predicate);
  }

  const extra=await fetchSourcePool(local,sources,false,scope);
  const previous=readSourcePoolCache(scope);
  const merged=saveSourcePoolCache([...extra,...previous],scope);
  primeSourceFeedCache(merged,scope);
  return extra.filter(predicate);
}

const REGIONAL_DISCOVERY_TTL=10*60*1000;
let regionalDiscoveryMemory={at:0,items:[],aiSeed:[]};
let regionalDiscoveryRefreshPromise=null;

function regionalAiPool(){
  const seed=Array.isArray(regionalDiscoveryMemory.aiSeed)?regionalDiscoveryMemory.aiSeed:[];
  const rows=seed.length?seed:(Array.isArray(regionalDiscoveryMemory.items)?regionalDiscoveryMemory.items:[]);
  return rows
    .filter(uploadedWithinWeek)
    .filter(row=>!isBlockedSourceRow(row,GENERAL_SOURCE_SCOPE));
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

  if(selectedSetForScope(LATEST_SOURCE_SCOPE).size){
    tasks.push(
      selectedSourceFeed(
        local,
        uploadedWithinWeek,
        reset,
        null,
        LATEST_SOURCE_SCOPE
      ).catch(()=>[])
    );
  }

  const batches=await Promise.all(tasks);
  const incoming=mergeUniqueRows([],batches.flat())
    .filter(uploadedWithinWeek)
    .filter(row=>!isBlockedSourceRow(row,GENERAL_SOURCE_SCOPE));

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
      // LIVE remains a global livestream discovery feed. The LIVE Chọn/Chặn
      // state only filters/prioritizes this LIVE feed and never supplies
      // Mới nhất/Tuần này.
      let rows=[];
      try{
        rows=await pagedSearch(
          local,
          "live",
          "trực tiếp",
          {features:["live"],sort_by:"upload_date"},
          reset,
          LIVE_SOURCE_SCOPE
        );
      }catch{}

      let liveRows=rememberLiveSourceCandidates(rows,{replace:reset});
      if(!liveRows.length){
        try{
          const fallback=await local.homePage("live-regional",reset);
          liveRows=rememberLiveSourceCandidates(fallback,{replace:reset});
        }catch{}
      }

      const selected=selectedSetForScope(LIVE_SOURCE_SCOPE);
      return liveRows
        .filter(row=>!isBlockedSourceRow(row,LIVE_SOURCE_SCOPE))
        .map((row,index)=>({
          row,
          index,
          interested:selected.has(String(
            row?._sourceId||row?.channelId||row?.uploaderId||""
          ))?1:0
        }))
        .sort((a,b)=>b.interested-a.interested||a.index-b.index)
        .map(item=>item.row);
    }
  },
  latest:{
    title:"Mới nhất",
    newest:true,
    load:(local,reset,onBatch=null)=>selectedSourceFeed(
      local,
      uploadedWithinLatest,
      reset,
      onBatch,
      LATEST_SOURCE_SCOPE
    )
  },
  week:{
    title:"Tuần này",
    weekFreshViewed:true,
    load:(local,reset,onBatch=null)=>selectedSourceFeed(
      local,
      uploadedWithinWeek,
      reset,
      onBatch,
      WEEK_SOURCE_SCOPE
    )
  }
};

function readFeedCache(name){
  try{
    const scope=isSourceScopedFeed(name)
      ?feedSourceScope(name)
      :name===LIVE_SOURCE_SCOPE
        ?LIVE_SOURCE_SCOPE
        :GENERAL_SOURCE_SCOPE;
    const currentSignature=MANAGED_SOURCE_SCOPES.has(scope)?sourceSignature(scope):"";

    let row=readAtomicSnapshot("feed:"+name);

    if(!row){
      const legacy=
        JSON.parse(localStorage.getItem(FEED_CACHE_PREFIX+name)||"null")||
        readNewestLegacyFeedCache(name);
      if(legacy&&Array.isArray(legacy.items)&&legacy.items.length){
        commitAtomicSnapshot("feed:"+name,legacy.items,{
          sourceSignature:legacy.sourceSignature||currentSignature
        });
        row=readAtomicSnapshot("feed:"+name)||legacy;
      }
    }

    if(!row||!Array.isArray(row.items)||!row.items.length)return [];

    const blocked=blockedSetForScope(scope);
    let items=row.items.filter(item=>!isBlockedSourceRow(item,scope));

    // A source-list change never discards the reserve package. Filter the old
    // package to the still-selected channels, then let background refresh
    // atomically replace it with the new version.
    if(isSourceScopedFeed(name)&&row.sourceSignature!==currentSignature){
      const selectedIds=new Set(selectedSources(scope).map(source=>source.id));
      items=items.filter(item=>{
        const sourceId=String(item?._sourceId||item?.channelId||item?.uploaderId||"");
        return sourceId?selectedIds.has(sourceId)&&!blocked.has(sourceId):true;
      });
    }

    return items;
  }catch{
    return [];
  }
}

function saveFeedCache(name,rows){
  const scope=isSourceScopedFeed(name)
    ?feedSourceScope(name)
    :name===LIVE_SOURCE_SCOPE
      ?LIVE_SOURCE_SCOPE
      :GENERAL_SOURCE_SCOPE;
  const signature=MANAGED_SOURCE_SCOPES.has(scope)?sourceSignature(scope):"";
  const result=commitAtomicSnapshot("feed:"+name,rows,{sourceSignature:signature});

  // Remove the old single-slot cache only after a valid atomic package exists.
  if(result.hash)cleanupLegacyFeedCaches(name);
  return result;
}

const snapshotPackagePending=new Map();

async function packageRowsWithAi(snapshotName,rows=[],{
  sourceSignature:sourceSig="",
  maxRows=90
}={}){
  const base=dedupeHashedRows(Array.isArray(rows)?rows:[])
    .slice(0,Math.max(1,Number(maxRows)||90));
  if(!base.length)return [];

  const inputHash=snapshotRowsHash(base,sourceSig);
  const current=readAtomicSnapshot(snapshotName);

  // Same raw package => zero AI calls, zero cache churn.
  if(
    current?.inputHash===inputHash &&
    Array.isArray(current.items) &&
    current.items.length
  ){
    return current.items;
  }

  const commitLocal=()=>{
    commitAtomicSnapshot(snapshotName,base,{
      sourceSignature:sourceSig,
      inputHash
    });
    void queuePackageUpload(snapshotName);
    return base;
  };

  if(base.length<4)return commitLocal();

  const pendingKey=snapshotName+"|"+inputHash;
  if(snapshotPackagePending.has(pendingKey)){
    return snapshotPackagePending.get(pendingKey);
  }

  const task=(async()=>{
    try{
      const input=topicInputRows(base).slice(0,120);
      if(input.length<4)return commitLocal();

      const response=await fetch(AI_TOPICS_URL,{
        method:"POST",
        headers:{
          "content-type":"application/json",
          "apikey":SUPABASE_ANON,
          "authorization":"Bearer "+SUPABASE_ANON
        },
        body:JSON.stringify({
          mode:"dedupe",
          videos:input
        })
      });

      const payload=await response.json().catch(()=>null);
      if(!response.ok||payload?.ok===false){
        throw new Error(payload?.error||("HTTP "+response.status));
      }

      const allowed=new Set(base.map(itemVideoId).filter(Boolean));
      const keepIds=[...new Set(
        (Array.isArray(payload?.keepVideoIds)?payload.keepVideoIds:[])
          .map(id=>clean(id))
          .filter(id=>allowed.has(id))
      )];
      const keepSet=new Set(keepIds);

      // AI can only remove duplicates. Code owns the existing deterministic
      // order and never accepts AI-created IDs or UI metadata.
      const packaged=keepSet.size
        ?base.filter(row=>keepSet.has(itemVideoId(row)))
        :base;

      commitAtomicSnapshot(snapshotName,packaged,{
        sourceSignature:sourceSig,
        inputHash
      });
      void queuePackageUpload(snapshotName);
      return packaged;
    }catch(error){
      console.warn("AI dedupe package failed",snapshotName,error);
      return commitLocal();
    }
  })().finally(()=>snapshotPackagePending.delete(pendingKey));

  snapshotPackagePending.set(pendingKey,task);
  return task;
}

async function buildSourceFeedSnapshot(name,preset,local=null){
  if(!isSourceScopedFeed(name))return [];
  local=local||await localEngine(16000);

  const scope=feedSourceScope(name);
  const sources=selectedSources(scope);
  if(!sources.length)return [];

  const pool=await refreshSourcePool(local,sources,scope);
  const predicate=name==="latest"?uploadedWithinLatest:uploadedWithinWeek;
  const rows=sortPresetRows(
    (Array.isArray(pool)?pool:[])
      .filter(predicate)
      .filter(row=>!isBlockedSourceRow(row,scope)),
    preset
  );

  const packaged=await packageRowsWithAi("feed:"+name,rows,{
    sourceSignature:sourceSignature(scope),
    maxRows:90
  });

  if(packaged.length){
    saveSourceContentLearning(
      scope,
      extractSourceContentTerms(feedSourceParent(name),packaged)
    );
  }

  // Separate maintenance job: AI supplies search phrases only; code searches.
  void discoverSourcesForParent(feedSourceParent(name),local).catch(()=>{});
  cleanupLegacyFeedCaches(name);
  return packaged;
}

async function refreshLiveSnapshotInBackground(local=null){
  local=local||await localEngine(12000);
  try{
    const rows=sortPresetRows(
      await FEED_PRESETS.live.load(local,true),
      FEED_PRESETS.live
    );
    const packaged=await packageRowsWithAi("feed:"+LIVE_SOURCE_SCOPE,rows,{
      sourceSignature:sourceSignature(LIVE_SOURCE_SCOPE),
      maxRows:90
    });
    cleanupLegacyFeedCaches(LIVE_SOURCE_SCOPE);
    if(packaged.length)applyActiveFeedSnapshot(LIVE_SOURCE_SCOPE);
    return packaged;
  }catch(error){
    console.warn("LIVE snapshot refresh failed",error);
    return [];
  }
}

async function refreshCachedSourceFeedInBackground(name,preset,seq,local=null){
  if(document.hidden)return [];
  try{
    const rows=await buildSourceFeedSnapshot(name,preset,local);
    if(
      rows.length&&
      (seq===undefined||seq===null||seq===state.feedSeq)&&
      state.activeFeed===name
    ){
      applyActiveFeedSnapshot(name);
    }
    return rows;
  }catch(error){
    console.warn("background source snapshot failed",name,error);
    return [];
  }
}

async function refreshActiveSourceFeedIfDue(){
  if(document.hidden)return;
  const name=state.activeFeed;
  if(
    !isSourceScopedFeed(name)||
    state.activeParent||
    state.activeTrend||
    !state.feedRows.length
  )return;

  const preset=FEED_PRESETS[name];
  if(!preset)return;
  await refreshCachedSourceFeedInBackground(name,preset,state.feedSeq);
}

let allSourceSnapshotRefreshPromise=null;
let allSourceSnapshotLastAt=0;

async function refreshAllSourceSnapshotsInBackground({force=false}={}){
  if(document.hidden)return false;
  if(allSourceSnapshotRefreshPromise)return allSourceSnapshotRefreshPromise;
  if(!force&&Date.now()-allSourceSnapshotLastAt<60*1000)return false;

  allSourceSnapshotRefreshPromise=(async()=>{
    try{
      // One small manifest check first; only changed tab packages are fetched.
      await hydrateServerPackages({force});
      const local=await localEngine(16000);

      // Package LIVE + Mới nhất + Tuần này first, because these are the first
      // tabs the user normally reaches. None of these calls repaint the DOM.
      await refreshLiveSnapshotInBackground(local);

      for(const name of [LATEST_SOURCE_SCOPE,WEEK_SOURCE_SCOPE]){
        const scope=feedSourceScope(name);
        if(!selectedSetForScope(scope).size)continue;
        const packaged=await buildSourceFeedSnapshot(name,FEED_PRESETS[name],local);
        if(packaged.length)applyActiveFeedSnapshot(name);
      }

      // Pre-build every category snapshot from its selected channels. Opening
      // a category then becomes a cache read + one paint, not fetch -> reorder.
      for(const parent of FIXED_CONTENT_CATEGORIES){
        if(!selectedSourcesForParent(parent).length)continue;
        try{
          await buildCategorySourceSnapshot(parent,local);
        }catch(error){
          console.warn("category snapshot package failed",parent?.key,error);
        }
      }

      allSourceSnapshotLastAt=Date.now();
      return true;
    }catch(error){
      console.warn("all source snapshot refresh failed",error);
      return false;
    }finally{
      allSourceSnapshotRefreshPromise=null;
    }
  })();

  return allSourceSnapshotRefreshPromise;
}

async function loadFeedPreset(name="latest"){
  state.searchResultsActive=false;
  const preset=FEED_PRESETS[name]||FEED_PRESETS.latest;
  const seq=++state.feedSeq;
  const feedChanged=state.activeFeed!==name;

  if(feedChanged){
    state.activeTrend="";
    state.activeParent="";
    state.trendTopics=[];
  }

  const scoped=isSourceScopedFeed(name);
  const activeFeedScope=scoped?feedSourceScope(name):"";

  if(scoped&&!selectedSetForScope(activeFeedScope).size){
    state.feedLoading=false;
    state.feedHasMore=false;
    state.feedRows=[];
    state.activeParent="";
    state.activeTrend="";
    state.trendTopics=[];
    setActiveChip(name);
    renderTrendTopics();
    feedTitle.textContent=sourceGroupLabel(name);
    feedStatus.textContent="";
    feed.innerHTML='<div class="empty">Chưa chọn nguồn. Mở “Nguồn” để thêm kênh.</div>';
    return;
  }

  state.feedLoading=true;
  state.feedHasMore=true;
  state.feedRows=[];
  if(!scoped){
    state.activeParent="";
    state.activeTrend="";
    state.trendTopics=[];
  }

  setActiveChip(name);
  feedTitle.textContent=sourceGroupLabel(name);

  let reserve=readFeedCache(name);
  if(!reserve.length&&scoped){
    const predicate=name==="latest"?uploadedWithinLatest:uploadedWithinWeek;
    const perSourceCached=cachedRowsForSources(
      selectedSources(activeFeedScope),
      activeFeedScope
    ).filter(predicate);
    if(perSourceCached.length){
      const rawReserve=sortPresetRows(perSourceCached,preset);
      reserve=await packageRowsWithAi("feed:"+name,rawReserve,{
        sourceSignature:sourceSignature(activeFeedScope),
        maxRows:90
      });
      cleanupLegacyFeedCaches(name);
    }
  }

  // Stale-while-revalidate: always paint the last complete package first.
  // No AI/network work is allowed to delay or reorder this paint.
  if(reserve.length){
    const rows=sortPresetRows(reserve,preset)
      .filter(row=>!scoped||!isBlockedSourceRow(row,activeFeedScope));

    state.feedRows=mergeUniqueRows([],rows);
    state.activeTrend="";
    state.trendTopics=[];
    renderTrendTopics();

    const visible=state.feedRows;
    await prewarmRowSourceAvatars(visible.slice(0,36),260);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    renderCards(visible);
    feedStatus.textContent=visible.length?visible.length+" video":"";
    state.feedLoading=false;
    state.feedHasMore=true;

    // Build a replacement package silently. Atomic commit + hash comparison
    // means unchanged data performs no swap and no duplicate AI request.
    if(scoped){
      void refreshCachedSourceFeedInBackground(name,preset,seq);
    }else if(name===LIVE_SOURCE_SCOPE){
      void refreshLiveSnapshotInBackground();
    }
    return;
  }

  // Only a brand-new browser/profile can reach this branch. Keep it visual and
  // quiet: no "source slow", no timeout, no retry churn.
  feed.innerHTML=
    '<div class="feed-loading-grid" aria-label="Đang chuẩn bị dữ liệu">'+
      '<span></span><span></span><span></span><span></span>'+
    '</div>';
  feedStatus.textContent="";

  try{
    const local=await localEngine(16000);
    const rowsRaw=await preset.load(local,true,null);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    const rows=sortPresetRows(
      (Array.isArray(rowsRaw)?rowsRaw:[])
        .filter(row=>!scoped||!isBlockedSourceRow(row,activeFeedScope)),
      preset
    );

    if(!rows.length){
      state.feedRows=[];
      state.feedHasMore=false;
      state.trendTopics=[];
      renderTrendTopics();
      feed.innerHTML='<div class="empty">Chưa có video phù hợp.</div>';
      feedStatus.textContent="";
      return;
    }

    const packageName="feed:"+name;
    const packageSignature=scoped
      ?sourceSignature(activeFeedScope)
      :name===LIVE_SOURCE_SCOPE
        ?sourceSignature(LIVE_SOURCE_SCOPE)
        :"";
    state.feedRows=await packageRowsWithAi(packageName,rows,{
      sourceSignature:packageSignature,
      maxRows:90
    });
    if(name)cleanupLegacyFeedCaches(name);
    state.activeTrend="";
    state.trendTopics=[];
    renderTrendTopics();

    const visible=state.feedRows;
    await prewarmRowSourceAvatars(visible.slice(0,36),320);
    if(seq!==state.feedSeq||state.activeFeed!==name)return;

    renderCards(visible);
    feedStatus.textContent=visible.length?visible.length+" video":"";
    state.feedHasMore=true;

    // Source discovery is a separate maintenance job. AI only proposes
    // search phrases; it cannot touch this packaged UI snapshot.
    if(scoped){
      void discoverSourcesForParent(feedSourceParent(name),local).catch(()=>{});
    }
  }catch(error){
    console.warn("first source package failed",name,error);
    if(seq===state.feedSeq&&state.activeFeed===name){
      const fallback=readFeedCache(name);
      if(fallback.length){
        state.feedRows=sortPresetRows(fallback,preset);
        renderCards(state.feedRows);
        feedStatus.textContent=state.feedRows.length+" video";
      }else{
        feed.innerHTML='<div class="empty">Chưa có gói dữ liệu dự trữ.</div>';
        feedStatus.textContent="";
      }
      state.feedHasMore=false;
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
    if(added.length){
      await prewarmRowSourceAvatars(added,420);
      if(seq!==state.feedSeq||state.activeFeed!==name)return;
      renderCards(added,{append:true,updateStatus:false});
    }
    feedStatus.textContent=state.feedRows.length?state.feedRows.length+" video":"";

    if(isSourceScopedFeed(name)){
      void refreshCachedSourceFeedInBackground(name,preset,seq);
    }else if(name===LIVE_SOURCE_SCOPE){
      void refreshLiveSnapshotInBackground();
    }
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

    if(
      sourceFeedPendingRenderName &&
      sourceFeedPendingRenderName===state.activeFeed &&
      !state.activeParent &&
      !state.activeTrend &&
      window.scrollY<120
    ){
      applyActiveFeedSnapshot(state.activeFeed,{force:true});
    }

    const distance=document.documentElement.scrollHeight-(window.scrollY+window.innerHeight);
    if(distance<1100)void loadMoreFeed();
  });
}

window.addEventListener("scroll",maybeLoadMoreFeed,{passive:true});
window.addEventListener("resize",maybeLoadMoreFeed,{passive:true});
setInterval(()=>{
  if(document.hidden||state.searchResultsActive)return;
  const active=state.activeFeed||LATEST_SOURCE_SCOPE;

  if(isSourceScopedFeed(active)){
    void refreshCachedSourceFeedInBackground(
      active,
      FEED_PRESETS[active],
      state.feedSeq
    );
  }else if(active===LIVE_SOURCE_SCOPE){
    void refreshLiveSnapshotInBackground();
  }
},SOURCE_ACTIVE_FEED_REFRESH_MS);

setInterval(()=>{
  void refreshAllSourceSnapshotsInBackground();
},SOURCE_FEED_AUTO_REFRESH_MS);

async function loadInitialFeed(){
  await prewarmRowSourceAvatars(selectedSources(LATEST_SOURCE_SCOPE),900);
  const result=await loadFeedPreset("latest");
  setTimeout(()=>void refreshAllSourceSnapshotsInBackground(),500);
  return result;
}

topicChips.addEventListener("click",async e=>{
  const clicked=e.target.closest("[data-feed],[data-ai-parent]");
  if(clicked){
    state.searchResultsActive=false;
    document.documentElement.classList.remove("watch-search-open","watch-search-results");
    setSearchEntryIcon(false);

    // Keep the horizontal tab rail where the user was browsing. The selected
    // tab will then be revealed by the parent-level setActiveChip() logic.
    resetHomeViewportInstant({resetTopics:false});
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

    const instant=instantCategoryRows(parent);
    if(instant.length){
      state.aiCategoryRows.set(parent.key,{at:Date.now(),items:instant});
      const visible=instant;
      renderCards(visible);
      feedStatus.textContent=visible.length?visible.length+" video":"";
      void prewarmRowSourceAvatars(visible,480);
    }else{
      feed.innerHTML=
        '<div class="feed-loading-grid" aria-label="Đang tải '+esc(parent.label)+'">'+
          '<span></span><span></span><span></span><span></span>'+
        '</div>';
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
  setActiveChip(button.dataset.feed||"latest");
  void loadFeedPreset(button.dataset.feed||"latest");
});

async function bootstrap1988(){
  const sourceStateLoaded=await hydrateServerState();

  setupMediaSession();
  setupInstall();
  setupSourceLibrary();
  applySourceGroupLabelsUi();
  applyFloatingIframe();
  setupWatchBrowseLayout();
  setupFullscreenReturn();
  ensureWatchNavRail();
  updateModeUi();
  renderParentCategories();

  if(!sourceStateLoaded){
    if(sourcesBtn){
      sourcesBtn.disabled=true;
      sourcesBtn.title="Chưa tải được dữ liệu nguồn từ máy chủ";
    }
    setActiveChip("latest");
    feedTitle.textContent="Mới nhất";
    feedStatus.textContent="";
    feed.innerHTML='<div class="error">Không tải được dữ liệu nguồn từ máy chủ. Hãy thử tải lại trang.</div>';
    return;
  }

  if(sourcesBtn){
    sourcesBtn.disabled=false;
    sourcesBtn.removeAttribute("title");
  }

  // New browsers first hydrate the shared package manifest. This lets them use
  // ready-made tab packages instead of rebuilding all 11 tabs locally.
  await hydrateServerPackages({force:true});

  await warmManagedAvatarImages(900);
  void prewarmSelectedSourceAvatars();

  const initialVideoId=extractVideoId(new URL(location.href).searchParams.get("v")||"");
  if(initialVideoId){
    void playVideo(initialVideoId,{
      title:"Đang tải thông tin…",
      thumbnailUrl:"https://i.ytimg.com/vi/"+initialVideoId+"/hqdefault.jpg"
    });
    return;
  }

  resetHomeViewportInstant();
  window.addEventListener("pageshow",()=>{
    if(!document.documentElement.classList.contains("watch-browse")){
      resetHomeViewportInstant();
    }
  },{passive:true});
  await loadInitialFeed();
}

void bootstrap1988();
