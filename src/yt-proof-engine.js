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
      cache:new UniversalCache(false)
    });
    mintPoToken(visitorData).then(token=>{
      try{if(token&&yt?.session?.player)yt.session.player.po_token=token;}catch{}
    }).catch(()=>{});
    return yt;
  })();
  return ytPromise;
}

function nodeText(v){
  if(v==null)return '';
  if(typeof v==='string')return v;
  try{return String(v.toString?.()||'');}catch{return ''}
}

async function search(q){
  const yt=await getYT();
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

async function resolve(id,onAttempt=()=>{}){
  if(!VIDEO_ID_RE.test(String(id||'')))throw new Error('invalid_video_id');
  const yt=await getYT();
  const contentPoToken=await getVideoPoToken(id);

  try{
    if(yt?.session?.player)yt.session.player.po_token=contentPoToken;
  }catch{}

  // TV_EMBEDDED first: current YouTube.js reports this as a workaround when
  // normal WEB/ANDROID/iOS player responses are bot-gated and omit streamingData.
  const clients=[
    'TV_EMBEDDED',
    'TV',
    'TV_SIMPLY',
    'ANDROID_VR',
    'VISIONOS',
    'WEB_EMBEDDED',
    'WEB',
    'MWEB',
    'IOS',
    'ANDROID',
    'YTMUSIC',
    'YTMUSIC_ANDROID'
  ];

  const diagnostics=[];
  let firstMeta=null;
  let lastError=null;

  for(const client of clients){
    try{
      onAttempt(client,diagnostics);
      const info=await yt.getBasicInfo(id,{
        client,
        po_token:contentPoToken
      });
      if(!firstMeta&&info?.basic_info?.title){
        firstMeta={
          title:String(info.basic_info.title||''),
          author:String(info.basic_info.author||'')
        };
      }

      const playability=String(info?.playability_status?.status||'UNKNOWN');
      const reason=String(info?.playability_status?.reason||'');
      const sd=info?.streaming_data;
      const count=(sd?.formats?.length||0)+(sd?.adaptive_formats?.length||0);

      diagnostics.push({client,playability,reason,formats:count});

      if(!sd||!count)continue;

      let format=null;
      try{
        format=info.chooseFormat({
          type:'video+audio',
          quality:'best',
          format:'mp4',
          client,
          po_token:contentPoToken
        });
      }catch(error){
        lastError=error;
        continue;
      }
      if(!format)continue;

      let rawUrl='';
      try{
        rawUrl=await format.decipher(yt.session.player);
      }catch(error){
        lastError=error;
        continue;
      }
      if(!rawUrl)continue;

      const url=proxiedMediaUrl(rawUrl);
      const p=await probe(url);
      if(!p.ok){
        diagnostics[diagnostics.length-1].probe='HTTP '+p.status;
        continue;
      }

      diagnostics[diagnostics.length-1].probe='HTTP '+p.status;
      return {
        url,
        client,
        poTokenBound:true,
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
    }catch(error){
      lastError=error;
      diagnostics.push({
        client,
        playability:'ERROR',
        reason:String(error?.message||error),
        formats:0
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

export default {getYT,search,resolve};
