import shaka from 'shaka-player/dist/shaka-player.ui';

export interface OnesieHotConfig {
  clientKeyData: Uint8Array;
  encryptedClientKey: Uint8Array;
  onesieUstreamerConfig: Uint8Array;
  baseUrl: string;
  keyExpiresInSeconds: number;
  timestamp?: number;
}

export const REDIRECTOR_STORAGE_KEY='googlevideo_redirector';
export const CLIENT_CONFIG_STORAGE_KEY='yt_client_config';
const PROXY='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt-browser-proxy';

function makeProxyUrl(raw:string, headers:Headers){
  const src=new URL(raw);
  const out=new URL(PROXY);
  out.searchParams.set('__host',src.host);
  out.searchParams.set('__path',src.pathname);
  for(const [k,v] of src.searchParams) out.searchParams.append(k,v);
  out.searchParams.set('__headers',JSON.stringify([...headers]));
  return out.toString();
}

export async function fetchFunction(input:string|Request|URL, init:RequestInit={}):Promise<Response>{
  const original=input instanceof Request?input:null;
  const url=input instanceof URL?new URL(input.toString()):new URL(typeof input==='string'?input:input.url);
  const forwardHeaders=new Headers(init.headers||(original?original.headers:undefined));

  if(url.pathname.includes('v1/player')){
    url.searchParams.set('$fields','playerConfig,storyboards,captions,playabilityStatus,streamingData,responseContext.mainAppWebResponseContext.datasyncId,videoDetails.isLive,videoDetails.isLiveContent,videoDetails.title,videoDetails.author,videoDetails.thumbnail,playbackTracking');
  }

  const target=makeProxyUrl(url.toString(),forwardHeaders);
  const browserHeaders=new Headers(forwardHeaders);
  for(const h of ['user-agent','host','origin','referer','content-length']) browserHeaders.delete(h);

  const method=String(init.method||(original?original.method:'GET')).toUpperCase();
  let body=init.body;
  if(body===undefined&&original&&!['GET','HEAD'].includes(method)){
    try{body=await original.clone().arrayBuffer()}catch{}
  }

  return fetch(target,{
    ...init,
    method,
    headers:browserHeaders,
    body:['GET','HEAD'].includes(method)?undefined:body,
    credentials:'omit',
    redirect:'follow'
  });
}

export function checkExtension(){return false;}
export function getInjectedProxyFunction(){return fetchFunction;}

export function asMap<K,V>(object:Record<string,V>):Map<K,V>{
  const map=new Map<K,V>();
  for(const key of Object.keys(object)) map.set(key as K,object[key]);
  return map;
}

export function createRecoverableError(message:string,info?:Record<string,any>){
  return new shaka.util.Error(
    shaka.util.Error.Severity.RECOVERABLE,
    shaka.util.Error.Category.NETWORK,
    shaka.util.Error.Code.HTTP_ERROR,
    message,
    {info}
  );
}

export function headersToGenericObject(headers:Headers):Record<string,string>{
  const out:Record<string,string>={};
  headers.forEach((value,key)=>{out[key.trim()]=value});
  return out;
}

export function makeResponse(
  headers:Record<string,string>,
  data:BufferSource,
  status:number,
  uri:string,
  responseURL:string,
  request:shaka.extern.Request,
  requestType:shaka.net.NetworkingEngine.RequestType
):shaka.extern.Response & {originalRequest:shaka.extern.Request}{
  if(status>=200&&status<=299&&status!==202){
    return {
      uri:responseURL||uri,
      originalUri:uri,
      data,
      status,
      headers,
      originalRequest:request,
      fromCache:!!headers['x-shaka-from-cache']
    };
  }

  let responseText:string|null=null;
  try{responseText=shaka.util.StringUtils.fromBytesAutoDetect(data)}catch{}

  const severity=status===401||status===403
    ?shaka.util.Error.Severity.CRITICAL
    :shaka.util.Error.Severity.RECOVERABLE;

  throw new shaka.util.Error(
    severity,
    shaka.util.Error.Category.NETWORK,
    shaka.util.Error.Code.BAD_HTTP_STATUS,
    uri,status,responseText,headers,requestType,responseURL||uri
  );
}

export async function encryptRequest(clientKey:Uint8Array,data:Uint8Array){
  if(clientKey.length!==32) throw new Error('Invalid client key length');
  const aesKeyData=clientKey.slice(0,16);
  const hmacKeyData=clientKey.slice(16,32);
  const iv=window.crypto.getRandomValues(new Uint8Array(16));

  const aesKey=await crypto.subtle.importKey('raw',aesKeyData,{name:'AES-CTR',length:128},false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt(
    {name:'AES-CTR',counter:iv,length:128},aesKey,data
  ));

  const hmacKey=await crypto.subtle.importKey('raw',hmacKeyData,{name:'HMAC',hash:{name:'SHA-256'}},false,['sign']);
  const hmac=new Uint8Array(await crypto.subtle.sign(
    'HMAC',hmacKey,new Uint8Array([...encrypted,...iv])
  ));

  return {encrypted,hmac,iv};
}

export function isConfigValid(config:OnesieHotConfig){
  if(!config.timestamp||!config.keyExpiresInSeconds)return false;
  return Date.now()<config.timestamp+(config.keyExpiresInSeconds*1000);
}

export function loadCachedClientConfig():OnesieHotConfig|null{
  try{
    const raw=localStorage.getItem(CLIENT_CONFIG_STORAGE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!isConfigValid(parsed)){
      localStorage.removeItem(CLIENT_CONFIG_STORAGE_KEY);
      return null;
    }
    return {
      ...parsed,
      clientKeyData:new Uint8Array(Object.values(parsed.clientKeyData)),
      encryptedClientKey:new Uint8Array(Object.values(parsed.encryptedClientKey)),
      onesieUstreamerConfig:new Uint8Array(Object.values(parsed.onesieUstreamerConfig))
    } as OnesieHotConfig;
  }catch{
    return null;
  }
}
