import { Innertube, Platform, ProtoUtils, UniversalCache, Utils } from 'https://cdn.jsdelivr.net/npm/youtubei.js@18.1.0/bundle/browser.js';
import { BG } from 'https://cdn.jsdelivr.net/npm/bgutils-js@3.1.2/+esm';

const PROXY='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt-browser-proxy';
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

Platform.shim.eval=async (data,env={})=>{
  const names=Object.keys(env);
  const values=names.map(name=>env[name]);
  const runner=new AsyncFunction(...names,'"use strict";\n'+String(data?.output||''));
  return await runner(...values);
};

let ytPromise=null;
let searchYtPromise=null;
const videoPoCache=new Map();

function makeProxyUrl(raw,headers=new Headers()){
  const src=new URL(raw);
  const out=new URL(PROXY);
  out.searchParams.set('__host',src.host);
  out.searchParams.set('__path',src.pathname);
  for(const [k,v] of src.searchParams)out.searchParams.append(k,v);
  out.searchParams.set('__headers',JSON.stringify([...headers]));
  return out.toString();
}

async function proxyFetch(input,init={}){
  const original=input instanceof Request?input:null;
  const src=typeof input==='string'||input instanceof URL?new URL(input):new URL(input.url);
  const headers=new Headers(init.headers||(original?original.headers:undefined));
  const target=makeProxyUrl(src.toString(),headers);
  headers.delete('user-agent');

  const method=String(init.method||(original?original.method:'GET')).toUpperCase();
  let body=init.body;
  if(body===undefined&&original&&!['GET','HEAD'].includes(method)){
    try{body=await original.clone().arrayBuffer()}catch{}
  }

  return fetch(target,{
    ...init,
    method,
    headers,
    body:['GET','HEAD'].includes(method)?undefined:body,
    credentials:'omit',
    redirect:'follow'
  });
}

async function mintPoToken(identifier){
  const bgConfig={
    fetch:(input,init)=>fetch(input,init),
    globalObj:window,
    requestKey:'O43z0dpjhgX20SCx4KAo',
    identifier
  };
  const challenge=await BG.Challenge.create(bgConfig);
  if(!challenge)throw new Error('pot_challenge_failed');
  const js=challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if(js)new Function(js)();
  const result=await BG.PoToken.generate({
    program:challenge.program,
    globalName:challenge.globalName,
    bgConfig
  });
  return result.poToken;
}

async function getVideoPoToken(id){
  const cached=videoPoCache.get(id);
  if(cached && Date.now()-cached.at<10*60*1000)return cached.token;

  const token=await mintPoToken(id);
  if(!token)throw new Error('content_po_token_failed');

  videoPoCache.set(id,{token,at:Date.now()});
  return token;
}

async function getYT(){
  if(ytPromise)return ytPromise;
  ytPromise=(async()=>{
    const visitorData=ProtoUtils.encodeVisitorData(
      Utils.generateRandomString(11),
      Math.floor(Date.now()/1000)
    );
    const cold=BG.PoToken.generatePlaceholder(visitorData);
    const yt=await Innertube.create({
      po_token:cold,
      visitor_data:visitorData,
      fetch:proxyFetch,
      generate_session_locally:true,
      cache:new UniversalCache(true)
    });
    mintPoToken(visitorData).then(token=>{
      try{if(token&&yt?.session?.player)yt.session.player.po_token=token;}catch{}
    }).catch(()=>{});
    return yt;
  })();
  return ytPromise;
}

async function getSearchYT(){
  if(searchYtPromise)return searchYtPromise;
  searchYtPromise=(async()=>{
    const visitorData=ProtoUtils.encodeVisitorData(
      Utils.generateRandomString(11),
      Math.floor(Date.now()/1000)
    );
    const cold=BG.PoToken.generatePlaceholder(visitorData);

    return Innertube.create({
      po_token:cold,
      visitor_data:visitorData,
      fetch:proxyFetch,
      generate_session_locally:true,
      cache:new UniversalCache(false)
    });
  })();
  return searchYtPromise;
}

function nodeText(v){
  if(v==null)return '';
  if(typeof v==='string')return v;
  try{return String(v.toString?.()||'');}catch{return ''}
}

async function search(q){
  const yt=await getSearchYT();
  const result=await yt.search(String(q||'').trim(),{type:'video'});
  const rows=[];
  for(const node of Array.from(result?.results||[])){
    const id=String(node?.video_id||node?.videoId||node?.id||'');
    if(!VIDEO_ID_RE.test(id))continue;
    rows.push({
      videoId:id,
      title:nodeText(node?.title)||'Video'
    });
  }
  return rows;
}

async function probe(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const res=await fetch(url,{
      method:'GET',
      headers:{Range:'bytes=0-1023'},
      cache:'no-store',
      signal:controller.signal
    });
    const type=res.headers.get('content-type')||'';
    const range=res.headers.get('content-range')||'';
    try{await res.body?.cancel()}catch{}
    return {
      ok:(res.status===200||res.status===206)&&
        !/text\/html|application\/json|text\/plain/i.test(type),
      status:res.status,
      type,
      range
    };
  }finally{
    clearTimeout(timer);
  }
}

function proxiedMediaUrl(raw){
  return makeProxyUrl(raw,new Headers({Accept:'*/*'}));
}

function xmlEscape(value){
  return String(value||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

function codecOf(format){
  const match=String(format?.mime_type||'').match(/codecs="([^"]+)"/i);
  return match?match[1]:'';
}

function mimeBase(format){
  return String(format?.mime_type||'').split(';')[0]||'';
}

async function buildManualDash(info,player,poToken=''){
  const formats=Array.from(info?.streaming_data?.adaptive_formats||[]);

  const videos=formats
    .filter(f=>f?.has_video&&!f?.has_audio&&f?.init_range&&f?.index_range&&/video\/mp4/i.test(f?.mime_type||''))
    .sort((a,b)=>{
      const aa=/avc1/i.test(a?.mime_type||'')?1:0;
      const bb=/avc1/i.test(b?.mime_type||'')?1:0;
      if(aa!==bb)return bb-aa;
      return (Number(b?.height)||0)-(Number(a?.height)||0);
    });

  const audios=formats
    .filter(f=>f?.has_audio&&!f?.has_video&&f?.init_range&&f?.index_range&&/audio\/mp4/i.test(f?.mime_type||''))
    .sort((a,b)=>{
      const aa=/mp4a/i.test(a?.mime_type||'')?1:0;
      const bb=/mp4a/i.test(b?.mime_type||'')?1:0;
      if(aa!==bb)return bb-aa;
      const ad=a?.is_drc?0:1;
      const bd=b?.is_drc?0:1;
      if(ad!==bd)return bd-ad;
      return (Number(b?.bitrate)||0)-(Number(a?.bitrate)||0);
    });

  if(!videos.length||!audios.length){
    throw new Error('adaptive_mp4_pair_not_found');
  }

  if(player)player.po_token=poToken||undefined;

  let lastError=null;
  for(const videoFmt of videos.slice(0,6)){
    for(const audioFmt of audios.slice(0,4)){
      try{
        const [videoRaw,audioRaw]=await Promise.all([
          videoFmt.decipher(player),
          audioFmt.decipher(player)
        ]);
        if(!videoRaw||!audioRaw)continue;

        const videoUrl=proxiedMediaUrl(videoRaw);
        const audioUrl=proxiedMediaUrl(audioRaw);

        const [vp,ap]=await Promise.all([probe(videoUrl),probe(audioUrl)]);
        if(!vp.ok||!ap.ok){
          lastError=new Error('adaptive_probe_video_'+vp.status+'_audio_'+ap.status);
          continue;
        }

        const durationSec=Math.max(
          1,
          Math.round((Number(videoFmt.approx_duration_ms)||Number(audioFmt.approx_duration_ms)||0)/1000)
        );

        const videoMime=mimeBase(videoFmt)||'video/mp4';
        const audioMime=mimeBase(audioFmt)||'audio/mp4';
        const videoCodec=codecOf(videoFmt);
        const audioCodec=codecOf(audioFmt);

        const manifest=
'<?xml version="1.0" encoding="UTF-8"?>'+
'<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" minBufferTime="PT1.5S" mediaPresentationDuration="PT'+durationSec+'S" profiles="urn:mpeg:dash:profile:isoff-main:2011">'+
  '<Period start="PT0S">'+
    '<AdaptationSet id="1" contentType="video" mimeType="'+xmlEscape(videoMime)+'" codecs="'+xmlEscape(videoCodec)+'" segmentAlignment="true" startWithSAP="1">'+
      '<Representation id="'+videoFmt.itag+'" bandwidth="'+(Number(videoFmt.bitrate)||1)+'" width="'+(Number(videoFmt.width)||0)+'" height="'+(Number(videoFmt.height)||0)+'" frameRate="'+(Number(videoFmt.fps)||30)+'">'+
        '<BaseURL>'+xmlEscape(videoUrl)+'</BaseURL>'+
        '<SegmentBase indexRange="'+videoFmt.index_range.start+'-'+videoFmt.index_range.end+'">'+
          '<Initialization range="'+videoFmt.init_range.start+'-'+videoFmt.init_range.end+'"/>'+
        '</SegmentBase>'+
      '</Representation>'+
    '</AdaptationSet>'+
    '<AdaptationSet id="2" contentType="audio" mimeType="'+xmlEscape(audioMime)+'" codecs="'+xmlEscape(audioCodec)+'" segmentAlignment="true" startWithSAP="1">'+
      '<Representation id="'+audioFmt.itag+'" bandwidth="'+(Number(audioFmt.bitrate)||1)+'" audioSamplingRate="'+(Number(audioFmt.audio_sample_rate)||48000)+'">'+
        '<BaseURL>'+xmlEscape(audioUrl)+'</BaseURL>'+
        '<SegmentBase indexRange="'+audioFmt.index_range.start+'-'+audioFmt.index_range.end+'">'+
          '<Initialization range="'+audioFmt.init_range.start+'-'+audioFmt.init_range.end+'"/>'+
        '</SegmentBase>'+
      '</Representation>'+
    '</AdaptationSet>'+
  '</Period>'+
'</MPD>';

        return {
          manifest,
          videoItag:videoFmt.itag,
          audioItag:audioFmt.itag,
          videoProbe:vp,
          audioProbe:ap,
          videoQuality:String(videoFmt.quality_label||videoFmt.quality||''),
          videoCodec,
          audioCodec
        };
      }catch(error){
        lastError=error;
      }
    }
  }

  throw lastError||new Error('adaptive_pair_unavailable');
}

async function resolve(id,onAttempt=()=>{}){
  if(!VIDEO_ID_RE.test(String(id||'')))throw new Error('invalid_video_id');

  const yt=await getYT();
  const loggedIn=!!yt?.session?.logged_in;
  const contentPoToken=await getVideoPoToken(id).catch(()=>'');

  // The authenticated TV client is the path that already proved it can return
  // playable formats. Try it without a content PoToken first; OAuth TV does
  // not require us to force a video-bound token into every player request.
  const attempts=[
    ...(loggedIn?[
      {label:'TV-auth',client:'TV',poToken:''},
      {label:'TV_SIMPLY-auth',client:'TV_SIMPLY',poToken:''},
      {label:'TV-pot',client:'TV',poToken:contentPoToken}
    ]:[]),
    {label:'TV_EMBEDDED',client:'TV_EMBEDDED',poToken:contentPoToken},
    {label:'ANDROID_VR',client:'ANDROID_VR',poToken:contentPoToken},
    {label:'VISIONOS',client:'VISIONOS',poToken:contentPoToken},
    {label:'WEB_EMBEDDED',client:'WEB_EMBEDDED',poToken:contentPoToken},
    {label:'WEB',client:'WEB',poToken:contentPoToken},
    {label:'MWEB',client:'MWEB',poToken:contentPoToken},
    {label:'IOS',client:'IOS',poToken:contentPoToken},
    {label:'ANDROID',client:'ANDROID',poToken:contentPoToken}
  ];

  const diagnostics=[];
  let firstMeta=null;
  let lastError=null;

  for(const attempt of attempts){
    try{
      onAttempt(attempt.label,diagnostics);

      const options={client:attempt.client};
      if(attempt.poToken)options.po_token=attempt.poToken;

      const info=await yt.getBasicInfo(id,options);

      if(!firstMeta&&info?.basic_info?.title){
        firstMeta={
          title:String(info.basic_info.title||''),
          author:String(info.basic_info.author||'')
        };
      }

      const playability=String(info?.playability_status?.status||'UNKNOWN');
      const reason=String(info?.playability_status?.reason||'');
      const sd=info?.streaming_data;
      const muxedCount=sd?.formats?.length||0;
      const adaptiveCount=sd?.adaptive_formats?.length||0;
      const count=muxedCount+adaptiveCount;

      const diag={
        client:attempt.label,
        playability,
        reason,
        formats:count,
        muxed:muxedCount,
        adaptive:adaptiveCount
      };
      diagnostics.push(diag);

      if(!sd||!count)continue;

      // Keep media URL signing aligned with the client request.
      // Authenticated TV already has OAuth; forcing a content-bound PoToken
      // onto those media URLs can turn an otherwise valid URL into HTTP 403.
      try{
        if(yt?.session?.player){
          yt.session.player.po_token=attempt.poToken||undefined;
        }
      }catch{}

      // 1) Fast path: a progressive MP4 containing both video and audio.
      if(muxedCount){
        try{
          const format=info.chooseFormat({
            type:'video+audio',
            quality:'best',
            format:'mp4'
          });

          if(format){
            const rawUrl=await format.decipher(yt.session.player);
            if(rawUrl){
              const url=proxiedMediaUrl(rawUrl);
              const p=await probe(url);
              diag.probe='HTTP '+p.status;
              if(p.ok){
                return {
                  mode:'progressive',
                  url,
                  client:attempt.label,
                  poTokenBound:!!contentPoToken,
                  itag:format.itag,
                  mimeType:String(format.mime_type||format.mimeType||'video/mp4'),
                  quality:String(format.quality_label||format.quality||''),
                  hasAudio:format.has_audio!==false,
                  probe:p,
                  meta:firstMeta||{
                    title:String(info?.basic_info?.title||''),
                    author:String(info?.basic_info?.author||'')
                  },
                  diagnostics
                };
              }
            }
          }
        }catch(error){
          lastError=error;
          diag.progressiveError=String(error?.message||error);
        }
      }

      // 2) Adaptive path: use TV-auth's separate video/audio streams directly.
      // Try without a media PoToken first, then retry with the content-bound
      // PoToken. Only return when BOTH video and audio answer with media bytes.
      if(adaptiveCount){
        const tokenModes=attempt.label.startsWith('TV-auth')
          ?['',contentPoToken]
          :[attempt.poToken||contentPoToken,''];

        for(const mediaPoToken of tokenModes){
          try{
            const dash=await buildManualDash(info,yt.session.player,mediaPoToken);
            diag.dash='ready';
            diag.videoProbe='HTTP '+dash.videoProbe.status;
            diag.audioProbe='HTTP '+dash.audioProbe.status;
            diag.videoItag=dash.videoItag;
            diag.audioItag=dash.audioItag;

            return {
              mode:'dash',
              manifest:dash.manifest,
              client:attempt.label,
              poTokenBound:!!mediaPoToken,
              mimeType:'application/dash+xml',
              quality:dash.videoQuality||'adaptive',
              hasAudio:true,
              videoItag:dash.videoItag,
              audioItag:dash.audioItag,
              probe:{
                ok:true,
                status:206,
                type:'video+audio adaptive',
                range:'video '+dash.videoProbe.status+' / audio '+dash.audioProbe.status
              },
              meta:firstMeta||{
                title:String(info?.basic_info?.title||''),
                author:String(info?.basic_info?.author||'')
              },
              diagnostics
            };
          }catch(error){
            lastError=error;
            diag.dashError=String(error?.message||error);
          }
        }

        // If authenticated TV already returned real formats, don't hide the
        // media failure by falling through to unrelated Android client errors.
        if(attempt.label.startsWith('TV-auth')){
          const error=new Error(diag.dashError||diag.progressiveError||'TV adaptive streams unavailable');
          error.diagnostics=diagnostics;
          throw error;
        }
      }
    }catch(error){
      // If authenticated TV already returned real formats and we explicitly
      // failed while resolving/probing those media URLs, stop here. Do not
      // hide the real TV media error behind unrelated Android 400 responses.
      if(attempt.label.startsWith('TV-auth') && Array.isArray(error?.diagnostics)){
        throw error;
      }

      lastError=error;
      diagnostics.push({
        client:attempt.label,
        playability:'ERROR',
        reason:String(error?.message||error),
        formats:0,
        muxed:0,
        adaptive:0
      });
    }
  }

  const error=new Error(
    lastError?.message||
    diagnostics.map(x=>x.client+':'+x.playability).join(' | ')||
    'no_working_client'
  );
  error.diagnostics=diagnostics;
  throw error;
}

async function authState(){
  const yt=await getYT();
  return {
    loggedIn:!!yt?.session?.logged_in
  };
}

async function signIn(onPending=()=>{}){
  const yt=await getYT();
  if(yt?.session?.logged_in){
    return {loggedIn:true};
  }

  const pending=(data)=>{
    try{onPending(data);}catch{}
  };

  yt.session.on('auth-pending',pending);

  const updated=async()=>{
    try{await yt.session.oauth.cacheCredentials();}catch{}
  };
  yt.session.on('update-credentials',updated);

  try{
    await yt.session.signIn();
    try{await yt.session.oauth.cacheCredentials();}catch{}
    return {loggedIn:true};
  }finally{
    try{yt.session.off('auth-pending',pending);}catch{}
  }
}

async function signOut(){
  const yt=await getYT();
  if(!yt?.session?.logged_in){
    try{await yt?.session?.oauth?.removeCache?.();}catch{}
    return {loggedIn:false};
  }
  await yt.session.signOut();
  try{await yt.session.oauth.removeCache();}catch{}
  return {loggedIn:false};
}

export default {getYT,getSearchYT,search,resolve,authState,signIn,signOut};
