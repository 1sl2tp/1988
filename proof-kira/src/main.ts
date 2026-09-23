import shaka from 'shaka-player/dist/shaka-player.ui.js';
import { Constants, Innertube, Platform, UniversalCache, Utils, YT, YTNodes } from 'youtubei.js/web';
import { SabrStreamingAdapter } from 'googlevideo/sabr-streaming-adapter';
import { base64ToU8, buildSabrFormat } from 'googlevideo/utils';
import { ShakaPlayerAdapter } from './ShakaPlayerAdapter.js';
import { botguardService } from './BotguardService.js';
import {
  CLIENT_CONFIG_STORAGE_KEY,
  REDIRECTOR_STORAGE_KEY,
  fetchFunction,
  isConfigValid,
  loadCachedClientConfig,
  type OnesieHotConfig
} from './helpers.js';
import { makePlayerRequest } from './onesie.js';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;

const searchInput=$<HTMLInputElement>('searchInput');
const clearSearch=$<HTMLDivElement>('clearSearch');
const searchLoader=$<HTMLDivElement>('searchLoader');
const searchResults=$<HTMLDivElement>('searchResults');
const emptyResults=$<HTMLDivElement>('emptyResults');
const homeButton=$<HTMLButtonElement>('homeButton');
const settingsButton=$<HTMLButtonElement>('settingsButton');

const videoElement=$<HTMLVideoElement>('video');
const videoContainer=$<HTMLDivElement>('video-container');
const loadingOverlay=$<HTMLDivElement>('loadingOverlay');

const videoInfoEl=$<HTMLDivElement>('videoInfo');
const videoTitle=$<HTMLHeadingElement>('videoTitle');
const channelAvatar=$<HTMLImageElement>('channelAvatar');
const channelName=$<HTMLHeadingElement>('channelName');
const subscriberCount=$<HTMLSpanElement>('subscriberCount');
const views=$<HTMLSpanElement>('views');
const publishDate=$<HTMLSpanElement>('publishDate');
const description=$<HTMLDivElement>('description');
const relatedVideos=$<HTMLDivElement>('relatedVideos');
const statusToast=$<HTMLDivElement>('status-toast');

type SearchItem={
  id:string;
  title:string;
  channel:string;
  thumbnail:string;
  duration:string;
  views:string;
};

let innertube:Innertube;
let player:shaka.Player;
let sabrAdapter:SabrStreamingAdapter|null=null;
let clientConfigPromise:Promise<OnesieHotConfig|undefined>|null=null;
let playbackWebPoTokenContentBinding:string|undefined;
let playbackWebPoTokenCreationLock=false;
let playbackWebPoToken:string|undefined;
let coldStartToken:string|undefined;
let currentVideoId='';
let searchItems:SearchItem[]=[];
let highlightedIndex=-1;
let searchTimer:number|undefined;
let toastTimer:number|undefined;

Platform.shim.eval=async(data:any,env:Record<string,any>={})=>{
  const properties:string[]=[];
  if(env.n)properties.push(`n: exportedVars.nFunction("${env.n}")`);
  if(env.sig)properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code=`${data.output}\nreturn { ${properties.join(', ')} }`;
  return new Function(code)();
};

function esc(s:any){
  return String(s??'').replace(/[&<>"']/g,(c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  } as Record<string,string>)[c]);
}

function showToast(message:string,kind:'ok'|'bad'|'warn'='warn',timeout=2600){
  if(toastTimer)clearTimeout(toastTimer);
  statusToast.textContent=message;
  statusToast.className='show'+(kind==='bad'?' bad':'');
  if(timeout>0){
    toastTimer=window.setTimeout(()=>{statusToast.className=''},timeout);
  }
}

function setLoading(loading:boolean){
  loadingOverlay.classList.toggle('show',loading);
}

function parseVideoId(raw:string){
  raw=String(raw||'').trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
  try{
    const u=new URL(raw);
    const v=u.searchParams.get('v');
    if(v&&/^[A-Za-z0-9_-]{11}$/.test(v))return v;
    const parts=u.pathname.split('/').filter(Boolean);
    const candidate=u.hostname.includes('youtu.be')?parts[0]:parts.at(-1);
    return /^[A-Za-z0-9_-]{11}$/.test(candidate||'')?candidate||'':'';
  }catch{return ''}
}

function closeSearch(){
  searchResults.hidden=true;
  emptyResults.hidden=true;
  highlightedIndex=-1;
}

function clearSearchUi(){
  searchInput.value='';
  clearSearch.hidden=true;
  searchLoader.hidden=true;
  searchItems=[];
  searchResults.innerHTML='';
  closeSearch();
}

function renderSearch(){
  if(!searchItems.length){
    searchResults.hidden=true;
    emptyResults.hidden=false;
    return;
  }

  emptyResults.hidden=true;
  searchResults.hidden=false;
  searchResults.innerHTML=searchItems.map((item,index)=>`
    <div class="search-result-item${index===highlightedIndex?' highlighted':''}" data-search-index="${index}">
      <div class="search-thumbnail-container">
        <img src="${esc(item.thumbnail)}" class="search-thumbnail" alt="" loading="lazy">
        ${item.duration?`<div class="search-duration">${esc(item.duration)}</div>`:''}
      </div>
      <div class="search-video-info">
        <div class="search-title">${esc(item.title)}</div>
        <div class="search-channel">${esc(item.channel)}</div>
        ${item.views?`<div class="search-meta">${esc(item.views)}</div>`:''}
      </div>
    </div>
  `).join('');
}

async function searchVideos(raw:string){
  const q=String(raw||'').trim();
  clearSearch.hidden=!q;

  if(!q){
    searchItems=[];
    closeSearch();
    return;
  }

  const directId=parseVideoId(q);
  if(directId){
    closeSearch();
    await selectVideo(directId);
    return;
  }

  searchLoader.hidden=false;
  closeSearch();

  try{
    const search=await innertube.actions.execute('/search',{query:q,parse:true});
    const rows=search.contents_memo?.getType(YTNodes.Video,YTNodes.CompactVideo)||[];

    searchItems=Array.from(rows).slice(0,24).map((row:any)=>({
      id:String(row.video_id||''),
      title:String(row.title?.toString?.()||''),
      channel:String(row.author?.name||row.author?.toString?.()||''),
      thumbnail:String(row.thumbnails?.[0]?.url||''),
      duration:String(row.duration?.text||''),
      views:String(row.view_count?.text||'')
    })).filter((x)=>/^[A-Za-z0-9_-]{11}$/.test(x.id));

    highlightedIndex=searchItems.length?0:-1;
    renderSearch();
  }catch(error:any){
    console.error('[Search]',error);
    searchItems=[];
    emptyResults.hidden=false;
    showToast('Search failed: '+String(error?.message||error),'bad',4500);
  }finally{
    searchLoader.hidden=true;
  }
}

function scheduleSearch(){
  if(searchTimer)clearTimeout(searchTimer);
  const value=searchInput.value;
  clearSearch.hidden=!value.trim();
  if(!value.trim()){
    closeSearch();
    return;
  }
  searchTimer=window.setTimeout(()=>void searchVideos(value),300);
}

async function fetchOnesieHotConfig():Promise<OnesieHotConfig|undefined>{
  const cached=loadCachedClientConfig();
  if(cached)return cached;

  const response=await fetchFunction(
    'https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl',
    {method:'GET',headers:{'User-Agent':'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version'}}
  );

  const text=await response.text();
  const json=JSON.parse(text.slice(4));
  const context=json.webPlayerContextConfig.WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH;
  const hot=context.onesieHotConfig;

  const config:OnesieHotConfig={
    clientKeyData:base64ToU8(hot.clientKey),
    keyExpiresInSeconds:hot.keyExpiresInSeconds,
    encryptedClientKey:base64ToU8(hot.encryptedClientKey),
    onesieUstreamerConfig:base64ToU8(hot.onesieUstreamerConfig),
    baseUrl:hot.baseUrl,
    timestamp:Date.now()
  };

  localStorage.setItem(CLIENT_CONFIG_STORAGE_KEY,JSON.stringify(config));
  return config;
}

async function getClientConfig(){
  const cached=loadCachedClientConfig();
  if(cached&&isConfigValid(cached))return cached;
  if(!clientConfigPromise){
    clientConfigPromise=fetchOnesieHotConfig().finally(()=>{clientConfigPromise=null});
  }
  return clientConfigPromise;
}

async function init(){
  shaka.polyfill.installAll();
  if(!shaka.Player.isBrowserSupported())throw new Error('Shaka Player is not supported on this browser.');

  innertube=await Innertube.create({
    cache:new UniversalCache(true),
    fetch:fetchFunction
  });

  void botguardService.init()
    .then(()=>console.info('[Kira proof] BotGuard ready'))
    .catch((error)=>console.warn('[Kira proof] BotGuard init failed',error));

  void getClientConfig().catch((error)=>console.warn('[Kira proof] Onesie config preload failed',error));

  try{
    const redirect=await fetchFunction(
      'https://redirector.googlevideo.com/initplayback?source=youtube&itag=0&pvi=0&pai=0&owc=yes&cmo:sensitive_content=yes&alr=yes&id='+Math.round(Math.random()*1E5),
      {method:'GET'}
    );
    const redirectUrl=await redirect.text();
    if(redirectUrl.startsWith('https://'))localStorage.setItem(REDIRECTOR_STORAGE_KEY,redirectUrl);
  }catch(error){
    console.warn('[Kira proof] redirector preload failed',error);
  }

  player=new shaka.Player();
  player.configure({
    preferredAudioLanguage:'en-US',
    abr:{
      enabled:true,
      restrictions:{maxHeight:480},
      switchInterval:4,
      useNetworkInformation:false
    },
    streaming:{
      failureCallback:(error:any)=>{
        console.error('[Shaka] streaming failure',error);
        void player.retryStreaming(5);
      },
      bufferingGoal:120,
      rebufferingGoal:.01,
      bufferBehind:300,
      retryParameters:{maxAttempts:8,fuzzFactor:.5,timeout:30000}
    }
  });

  await player.attach(videoElement);
  const ui=new shaka.ui.Overlay(player,videoContainer,videoElement);
  ui.configure({
    addBigPlayButton:false,
    overflowMenuButtons:[
      'captions','quality','language','chapter',
      'picture_in_picture','playback_rate','loop',
      'recenter_vr','toggle_stereoscopic','save_video_frame'
    ],
    customContextMenu:true
  });

  videoElement.addEventListener('playing',()=>{
    player.configure('abr.restrictions.maxHeight',Infinity);
    setLoading(false);
  });
  player.addEventListener('buffering',()=>{
    setLoading(player.isBuffering());
  });

  showToast('Kira ready','ok',1400);
}

async function fetchPlayerResponse(videoId:string,reloadPlaybackContext?:any){
  const requestParams:any={
    videoId,
    contentCheckOk:true,
    racyCheckOk:true,
    playbackContext:{
      adPlaybackContext:{pyv:true},
      contentPlaybackContext:{
        signatureTimestamp:innertube.session.player?.signature_timestamp
      }
    }
  };

  if(reloadPlaybackContext){
    requestParams.playbackContext.reloadPlaybackContext=reloadPlaybackContext;
  }

  try{
    const config=await getClientConfig();
    if(!config)throw new Error('Onesie config unavailable');
    return await makePlayerRequest({
      clientConfig:config,
      innertubeRequest:{context:innertube.session.context,...requestParams}
    });
  }catch(error){
    console.warn('[Kira proof] Onesie failed; using Kira /player fallback',error);
    return innertube.actions.execute('/player',{...requestParams,parse:false});
  }
}

async function cleanupPlayback(){
  if(player)await player.unload();
  if(sabrAdapter){
    sabrAdapter.dispose();
    sabrAdapter=null;
  }
}

async function mintContentWebPO(){
  if(!playbackWebPoTokenContentBinding||playbackWebPoTokenCreationLock)return;
  playbackWebPoTokenCreationLock=true;
  try{
    coldStartToken=botguardService.mintColdStartToken(playbackWebPoTokenContentBinding);
    if(!botguardService.isInitialized())await botguardService.reinit();
    if(botguardService.integrityTokenBasedMinter){
      playbackWebPoToken=await botguardService.integrityTokenBasedMinter
        .mintAsWebsafeString(decodeURIComponent(playbackWebPoTokenContentBinding));
    }
  }catch(error){
    console.warn('[Kira proof] PO token mint failed',error);
  }finally{
    playbackWebPoTokenCreationLock=false;
  }
}

async function loadVideo(videoId:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))return;

  currentVideoId=videoId;
  playbackWebPoToken=undefined;
  playbackWebPoTokenContentBinding=videoId;
  setLoading(true);
  showToast('Loading video…','warn',0);

  try{
    await cleanupPlayback();

    const apiResponse=await fetchPlayerResponse(videoId);
    const cpn=Utils.generateRandomString(16);
    const videoInfo=new YT.VideoInfo([apiResponse],innertube.actions,cpn);

    if(videoInfo.playability_status?.status!=='OK'){
      throw new Error(videoInfo.playability_status?.reason||videoInfo.playability_status?.status||'Unplayable video');
    }
    if(!videoInfo.streaming_data)throw new Error('Could not find streaming data.');

    const isLive=!!videoInfo.basic_info.is_live;
    const isPostLiveDVR=!!videoInfo.basic_info.is_post_live_dvr||
      (!!videoInfo.basic_info.is_live_content&&!!(
        videoInfo.streaming_data?.dash_manifest_url||
        videoInfo.streaming_data?.hls_manifest_url
      ));

    sabrAdapter=new SabrStreamingAdapter({
      playerAdapter:new ShakaPlayerAdapter(),
      clientInfo:{
        osName:innertube.session.context.client.osName,
        osVersion:innertube.session.context.client.osVersion,
        clientName:parseInt(Constants.CLIENT_NAME_IDS[
          innertube.session.context.client.clientName as keyof typeof Constants.CLIENT_NAME_IDS
        ]),
        clientVersion:innertube.session.context.client.clientVersion
      }
    });

    sabrAdapter.onMintPoToken(async()=>{
      if(!playbackWebPoToken){
        if(isLive)await mintContentWebPO();
        else void mintContentWebPO();
      }
      return playbackWebPoToken||coldStartToken||'';
    });

    sabrAdapter.onReloadPlayerResponse(async(reloadContext)=>{
      const reloaded=await fetchPlayerResponse(currentVideoId,reloadContext);
      const parsed=new YT.VideoInfo([reloaded],innertube.actions,cpn);
      sabrAdapter?.setStreamingURL(
        await innertube.session.player!.decipher(parsed.streaming_data?.server_abr_streaming_url)
      );
      sabrAdapter?.setUstreamerConfig(
        parsed.player_config?.media_common_config.media_ustreamer_request_config?.video_playback_ustreamer_config
      );
    });

    sabrAdapter.attach(player);

    if(!isPostLiveDVR&&!isLive){
      sabrAdapter.setStreamingURL(
        await innertube.session.player!.decipher(videoInfo.streaming_data.server_abr_streaming_url)
      );
      sabrAdapter.setServerAbrFormats(videoInfo.streaming_data.adaptive_formats.map(buildSabrFormat));
      sabrAdapter.setUstreamerConfig(
        videoInfo.player_config?.media_common_config.media_ustreamer_request_config?.video_playback_ustreamer_config
      );
    }

    let manifestUri:string|undefined;
    if(isLive){
      manifestUri=videoInfo.streaming_data.dash_manifest_url
        ?videoInfo.streaming_data.dash_manifest_url+'/mpd_version/7'
        :videoInfo.streaming_data.hls_manifest_url;
    }else if(isPostLiveDVR){
      manifestUri=videoInfo.streaming_data.hls_manifest_url||
        (videoInfo.streaming_data.dash_manifest_url
          ?videoInfo.streaming_data.dash_manifest_url+'/mpd_version/7'
          :undefined);
    }else{
      manifestUri='data:application/dash+xml;base64,'+btoa(await videoInfo.toDash({
        manifest_options:{
          is_sabr:true,
          captions_format:'vtt',
          include_thumbnails:false
        }
      }));
    }

    if(!manifestUri)throw new Error('Could not find a valid manifest URI.');

    const detailsPromise=fetchWatchDetails(videoId);
    await player.load(manifestUri);
    try{await videoElement.play()}catch{}
    await detailsPromise;

    showToast('Playing with Kira SABR','ok',1800);
  }catch(error:any){
    console.error('[Player]',error);
    setLoading(false);
    showToast(String(error?.message||error),'bad',6000);
  }
}

async function fetchWatchDetails(videoId:string){
  relatedVideos.innerHTML='';
  try{
    const nextResponse=await innertube.actions.execute('/next',{videoId,parse:true});
    const primary=nextResponse.contents_memo?.getType(YTNodes.VideoPrimaryInfo).first();
    const secondary=nextResponse.contents_memo?.getType(YTNodes.VideoSecondaryInfo).first();
    const twoColumn=nextResponse.contents?.item().as(YTNodes.TwoColumnWatchNextResults);
    const secondaryResults=twoColumn?.secondary_results;

    const title=primary?.title?.toString?.()||'';
    videoTitle.textContent=title;
    videoTitle.title=title;
    document.title=title?title+' - Kira':'Kira';

    channelName.textContent=secondary?.owner?.author?.name||'';
    const avatar=secondary?.owner?.author?.best_thumbnail?.url||'';
    channelAvatar.src=avatar;
    channelAvatar.hidden=!avatar;
    subscriberCount.textContent=secondary?.owner?.subscriber_count?.toString?.()||'0 subscribers';

    const viewText=primary?.view_count?.short_view_count?.isEmpty?.()
      ?primary?.view_count?.view_count?.toString?.()
      :primary?.view_count?.short_view_count?.toString?.();
    views.textContent=viewText||'';
    views.hidden=!viewText;

    const dateText=primary?.relative_date?.isEmpty?.()
      ?''
      :primary?.relative_date?.toString?.()||'';
    publishDate.textContent=dateText;
    publishDate.hidden=!dateText;

    description.textContent=secondary?.description?.toString?.()||'';
    description.hidden=!description.textContent;
    videoInfoEl.hidden=false;

    if(secondaryResults){
      const rows:string[]=[];
      for(const item of secondaryResults){
        if(!item.is(YTNodes.LockupView)||item.content_type!=='VIDEO')continue;

        const metadata=item.metadata;
        const contentImage=item.content_image;
        if(!metadata||!contentImage?.is(YTNodes.ThumbnailView))continue;

        const durationOverlay=contentImage.overlays?.find(
          (overlay:any)=>overlay.is(YTNodes.ThumbnailOverlayBadgeView)&&
            overlay.position==='THUMBNAIL_OVERLAY_BADGE_POSITION_BOTTOM_END'
        )?.as(YTNodes.ThumbnailOverlayBadgeView);

        const metaRows=metadata.metadata?.metadata_rows.map((row:any)=>
          row.metadata_parts?.map((part:any)=>part.text?.toString()).join(metadata.metadata?.delimiter)||''
        )||[];

        const thumb=contentImage.image?.[0];
        const width=Number(thumb?.width)||168;
        const height=Number(thumb?.height)||94;
        const titleText=metadata.title?.toString?.()||'';

        rows.push(`
          <a class="related-video-item" href="#" data-related-id="${esc(item.content_id)}">
            <div class="related-thumbnail-container">
              <img src="${esc(thumb?.url||'')}" alt="Video thumbnail" loading="lazy"
                   class="related-thumbnail" width="${width}" height="${height}">
              ${durationOverlay?.badges?.[0]?.text
                ?`<span class="related-duration">${esc(durationOverlay.badges[0].text)}</span>`
                :''}
            </div>
            <div class="related-video-details">
              <h4 class="related-title" title="${esc(titleText)}">${esc(titleText)}</h4>
              ${metaRows.map((m:string)=>`<p class="related-metadata">${esc(m)}</p>`).join('')}
            </div>
          </a>
        `);
      }
      relatedVideos.innerHTML=rows.join('');
    }
  }catch(error){
    console.warn('[Watch details]',error);
  }
}

async function selectVideo(id:string){
  clearSearchUi();
  await loadVideo(id);
}

searchInput.addEventListener('input',scheduleSearch);
searchInput.addEventListener('keydown',(event)=>{
  if(event.key==='ArrowDown'&&searchItems.length){
    event.preventDefault();
    highlightedIndex=(highlightedIndex+1)%searchItems.length;
    renderSearch();
  }else if(event.key==='ArrowUp'&&searchItems.length){
    event.preventDefault();
    highlightedIndex=highlightedIndex<=0?searchItems.length-1:highlightedIndex-1;
    renderSearch();
  }else if(event.key==='Enter'){
    event.preventDefault();
    const direct=parseVideoId(searchInput.value);
    if(direct)void selectVideo(direct);
    else if(highlightedIndex>=0&&searchItems[highlightedIndex]){
      void selectVideo(searchItems[highlightedIndex].id);
    }else{
      void searchVideos(searchInput.value);
    }
  }else if(event.key==='Escape'){
    closeSearch();
  }
});

clearSearch.addEventListener('click',()=>{
  clearSearchUi();
  searchInput.focus();
});

searchResults.addEventListener('click',(event)=>{
  const row=(event.target as HTMLElement).closest<HTMLElement>('[data-search-index]');
  if(!row)return;
  const index=Number(row.dataset.searchIndex);
  const item=searchItems[index];
  if(item)void selectVideo(item.id);
});

relatedVideos.addEventListener('click',(event)=>{
  const row=(event.target as HTMLElement).closest<HTMLElement>('[data-related-id]');
  if(!row)return;
  event.preventDefault();
  const id=row.dataset.relatedId;
  if(id)void selectVideo(id);
});

homeButton.addEventListener('click',()=>{
  clearSearchUi();
  window.scrollTo({top:0,behavior:'smooth'});
  searchInput.focus();
});

settingsButton.addEventListener('click',()=>{
  showToast('Proxy: yt-browser-proxy v9 · Kira SABR proof','ok',2200);
});

document.addEventListener('click',(event)=>{
  if(!(event.target as HTMLElement).closest('.search-container'))closeSearch();
});

void init().catch((error:any)=>{
  console.error('[Init]',error);
  setLoading(false);
  showToast('Initialization failed: '+String(error?.message||error),'bad',0);
});
