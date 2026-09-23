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
const searchButton=$<HTMLButtonElement>('searchButton');
const resultsEl=$<HTMLDivElement>('results');
const statusEl=$<HTMLDivElement>('status');
const titleEl=$<HTMLDivElement>('currentTitle');
const sourceEl=$<HTMLSpanElement>('source');
const videoElement=$<HTMLVideoElement>('video');
const videoContainer=$<HTMLDivElement>('video-container');

let innertube:Innertube;
let player:shaka.Player;
let sabrAdapter:SabrStreamingAdapter|null=null;
let clientConfigPromise:Promise<OnesieHotConfig|undefined>|null=null;
let playbackWebPoTokenContentBinding:string|undefined;
let playbackWebPoTokenCreationLock=false;
let playbackWebPoToken:string|undefined;
let coldStartToken:string|undefined;
let currentVideoId='';

Platform.shim.eval=async(data:any,env:Record<string,any>={})=>{
  const properties:string[]=[];
  if(env.n)properties.push(`n: exportedVars.nFunction("${env.n}")`);
  if(env.sig)properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code=`${data.output}\nreturn { ${properties.join(', ')} }`;
  return new Function(code)();
};

function setStatus(text:string,kind:'ok'|'bad'|'warn'='warn'){
  statusEl.textContent=text;
  statusEl.dataset.kind=kind;
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

function esc(s:any){
  return String(s??'').replace(/[&<>"']/g,(c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  } as Record<string,string>)[c]);
}

async function fetchOnesieHotConfig():Promise<OnesieHotConfig|undefined>{
  const cached=loadCachedClientConfig();
  if(cached)return cached;

  const response=await fetchFunction('https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl',{
    method:'GET',
    headers:{'User-Agent':'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version'}
  });

  const text=await response.text();
  const json=JSON.parse(text.slice(4));
  const webPlayerContextConfig=json.webPlayerContextConfig.WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH;
  const onesieHotConfig=webPlayerContextConfig.onesieHotConfig;

  const config:OnesieHotConfig={
    clientKeyData:base64ToU8(onesieHotConfig.clientKey),
    keyExpiresInSeconds:onesieHotConfig.keyExpiresInSeconds,
    encryptedClientKey:base64ToU8(onesieHotConfig.encryptedClientKey),
    onesieUstreamerConfig:base64ToU8(onesieHotConfig.onesieUstreamerConfig),
    baseUrl:onesieHotConfig.baseUrl,
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
  setStatus('Đang khởi tạo YouTube.js + Kira SABR…');
  shaka.polyfill.installAll();
  if(!shaka.Player.isBrowserSupported())throw new Error('Shaka Player không được hỗ trợ');

  innertube=await Innertube.create({
    cache:new UniversalCache(true),
    fetch:fetchFunction
  });

  void botguardService.init().then(()=>console.info('[Proof] BotGuard ready')).catch(console.error);
  void getClientConfig().catch(console.error);

  try{
    const redirect=await fetchFunction(
      'https://redirector.googlevideo.com/initplayback?source=youtube&itag=0&pvi=0&pai=0&owc=yes&cmo:sensitive_content=yes&alr=yes&id='+Math.round(Math.random()*1E5),
      {method:'GET'}
    );
    const redirectUrl=await redirect.text();
    if(redirectUrl.startsWith('https://')){
      localStorage.setItem(REDIRECTOR_STORAGE_KEY,redirectUrl);
    }
  }catch(error){
    console.warn('[Proof] redirector preload failed',error);
  }

  player=new shaka.Player();
  player.configure({
    preferredAudioLanguage:'vi',
    abr:{
      enabled:true,
      restrictions:{maxHeight:480},
      switchInterval:4,
      useNetworkInformation:false
    },
    streaming:{
      bufferingGoal:120,
      rebufferingGoal:0.01,
      bufferBehind:300,
      retryParameters:{
        maxAttempts:8,
        fuzzFactor:0.5,
        timeout:30000
      }
    }
  });

  await player.attach(videoElement);
  const ui=new shaka.ui.Overlay(player,videoContainer,videoElement);
  ui.configure({
    addBigPlayButton:false,
    overflowMenuButtons:[
      'captions','quality','language','chapter',
      'picture_in_picture','playback_rate','loop'
    ],
    customContextMenu:true
  });

  videoElement.addEventListener('playing',()=>player.configure('abr.restrictions.maxHeight',Infinity));
  player.addEventListener('buffering',()=>{
    if(player.isBuffering())setStatus('Đang nạp segment SABR…');
  });

  searchButton.disabled=false;
  setStatus('Sẵn sàng · nhập tên để tìm hoặc dán link YouTube.','ok');
}

async function searchVideos(query:string){
  const q=String(query||'').trim();
  if(!q)return;

  const directId=parseVideoId(q);
  if(directId){
    resultsEl.innerHTML='';
    await loadVideo(directId);
    return;
  }

  setStatus('Đang tìm "'+q+'"…');
  searchButton.disabled=true;
  try{
    const search=await innertube.actions.execute('/search',{query:q,parse:true});
    const rows=search.contents_memo?.getType(YTNodes.Video,YTNodes.CompactVideo)||[];

    const items=Array.from(rows).slice(0,24).map((row:any)=>({
      id:String(row.video_id||''),
      title:String(row.title?.toString?.()||'Video'),
      channel:String(row.author?.name||row.author?.toString?.()||''),
      thumbnail:String(row.thumbnails?.[0]?.url||''),
      duration:String(row.duration?.text||''),
      views:String(row.view_count?.text||'')
    })).filter((x)=>/^[A-Za-z0-9_-]{11}$/.test(x.id));

    resultsEl.innerHTML=items.map((item)=>`
      <button class="result-card" type="button" data-video-id="${esc(item.id)}">
        <div class="thumb">
          <img src="${esc(item.thumbnail)}" alt="" loading="lazy">
          ${item.duration?`<span>${esc(item.duration)}</span>`:''}
        </div>
        <div class="result-title">${esc(item.title)}</div>
        <div class="result-meta">${esc([item.channel,item.views].filter(Boolean).join(' · '))}</div>
      </button>
    `).join('');

    setStatus(items.length?('Tìm thấy '+items.length+' video · chọn một video để phát.'):'Không tìm thấy video.',items.length?'ok':'bad');
  }catch(error:any){
    console.error('[Search]',error);
    resultsEl.innerHTML='';
    setStatus('Tìm kiếm lỗi: '+String(error?.message||error),'bad');
  }finally{
    searchButton.disabled=false;
  }
}

async function fetchVideoInfo(videoId:string,reloadPlaybackContext?:any){
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
    if(!config)throw new Error('Không lấy được Onesie config');
    const response=await makePlayerRequest({
      clientConfig:config,
      innertubeRequest:{context:innertube.session.context,...requestParams}
    });
    sourceEl.textContent='Onesie';
    return response;
  }catch(error){
    console.warn('[Player] Onesie failed, Kira fallback /player',error);
    sourceEl.textContent='Kira /player fallback';
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
  }finally{
    playbackWebPoTokenCreationLock=false;
  }
}

async function loadVideo(videoId:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))return;

  currentVideoId=videoId;
  playbackWebPoToken=undefined;
  playbackWebPoTokenContentBinding=videoId;
  setStatus('Đang lấy player response…');
  titleEl.textContent='—';

  try{
    await cleanupPlayback();

    const apiResponse=await fetchVideoInfo(videoId);
    const cpn=Utils.generateRandomString(16);
    const videoInfo=new YT.VideoInfo([apiResponse],innertube.actions,cpn);

    if(videoInfo.playability_status?.status!=='OK'){
      throw new Error(videoInfo.playability_status?.reason||videoInfo.playability_status?.status||'Unplayable');
    }
    if(!videoInfo.streaming_data)throw new Error('Không có streamingData');

    titleEl.textContent=String(videoInfo.basic_info.title||'Video');

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
        else void mintContentWebPO().catch(console.error);
      }
      return playbackWebPoToken||coldStartToken||'';
    });

    sabrAdapter.onReloadPlayerResponse(async(reloadContext)=>{
      const reloaded=await fetchVideoInfo(currentVideoId,reloadContext);
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
      sabrAdapter.setUstreamerConfig(
        videoInfo.player_config?.media_common_config.media_ustreamer_request_config?.video_playback_ustreamer_config
      );
      sabrAdapter.setServerAbrFormats(
        videoInfo.streaming_data.adaptive_formats.map(buildSabrFormat)
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

    if(!manifestUri)throw new Error('Không có manifest hợp lệ');

    setStatus('Đang mở Shaka + SABR…');
    await player.load(manifestUri);
    try{await videoElement.play()}catch{}

    setStatus('ĐANG PHÁT · '+sourceEl.textContent+' · SABR/Shaka · tua theo segment.','ok');
  }catch(error:any){
    console.error('[Player]',error);
    setStatus('THẤT BẠI: '+String(error?.message||error),'bad');
  }
}

resultsEl.addEventListener('click',(event)=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-video-id]');
  if(button?.dataset.videoId)void loadVideo(button.dataset.videoId);
});
searchButton.addEventListener('click',()=>void searchVideos(searchInput.value));
searchInput.addEventListener('keydown',(event)=>{
  if(event.key==='Enter')void searchVideos(searchInput.value);
});

void init().catch((error:any)=>{
  console.error('[Init]',error);
  setStatus('KHỞI TẠO LỖI: '+String(error?.message||error),'bad');
});
