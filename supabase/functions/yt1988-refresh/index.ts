import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROFILE="owner";
const SYSTEM_SCOPES=["live","latest","week"];
const HASHTAG_ID_RE=/^hash_[a-z0-9]+$/;
const SYSTEM_SCOPE_META:any={
  live:{profile:"live",label:"Live",kind:"live"},
  latest:{profile:"day",label:"Ngày",kind:"time"},
  week:{profile:"week",label:"Tuần",kind:"time"}
};
function validScopeSyntax(value:any){
  const scope=clean(value,32);
  return SYSTEM_SCOPES.includes(scope)||HASHTAG_ID_RE.test(scope);
}
const DAY_MS=24*60*60*1000;
const CHANNEL_CACHE_MAX_AGE_MS=8*DAY_MS;
const CHANNEL_FAILURE_RETRY_MS=2*60*1000;
const MAX_CHANNEL_FETCHES_PER_RUN=12;
const MAX_SCOPES_PER_RUN=2;
const LIVE_PIPELINE_VERSION="live-v24";
const NON_LIVE_PIPELINE_VERSION="non-live-v5";
const NON_LIVE_VERIFY_BATCH=48;
const YT_WEB_PLAYER_API_KEY="AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const YT_WEB_PLAYER_CLIENT_VERSION="2.20260925.01.00";
const YT_PLAYER_CLIENTS:any[]=[
  {
    clientName:"WEB",
    clientVersion:YT_WEB_PLAYER_CLIENT_VERSION,
    userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
  },
  {
    clientName:"ANDROID",
    clientVersion:"20.10.38",
    androidSdkVersion:35,
    userAgent:"com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
  }
];
const LIVE_SELECTED_CANDIDATES_PER_SOURCE=4;
const LIVE_SELECTED_SOURCES_PER_RUN=24;
const LIVE_SEARCH_QUERIES=[
  "trực tiếp",
  "đang phát trực tiếp",
  "phát trực tiếp",
  "trực tiếp hôm nay",
  "trực tiếp tin tức",
  "trực tiếp thể thao",
  "trực tiếp âm nhạc",
  "trực tiếp game",
  "trực tiếp sự kiện",
  "livestream việt nam"
];
const DEFAULT_SYSTEM_INTERVAL_MINUTES:any={
  live:2,
  latest:2,
  week:5
};
const DEFAULT_HASHTAG_INTERVAL_MINUTES=10;
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods":"POST, OPTIONS",
  "cache-control":"no-store"
};

function json(data:any,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"content-type":"application/json; charset=utf-8"}
  });
}
function clean(value:any,max=1000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function normalizeText(value:any){
  return clean(value,600)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d").replace(/Đ/g,"D")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function fastHash(value:any){
  let hash=2166136261;
  const text=String(value??"");
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}
function videoId(row:any){
  const direct=clean(row?.id||row?.videoId||"",64);
  if(/^[A-Za-z0-9_-]{11}$/.test(direct))return direct;
  const url=clean(row?.url||row?.videoUrl||"",500);
  return url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1]||"";
}
function channelId(row:any){
  const direct=clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180);
  if(/^UC[A-Za-z0-9_-]+$/.test(direct))return direct;
  const url=clean(row?.uploaderUrl||row?.channelUrl||"",500);
  return url.match(/\/channel\/(UC[A-Za-z0-9_-]+)/i)?.[1]||"";
}
function isLive(row:any){
  return row?.isLive===true||Number(row?.duration)<0||Number(row?.uploaded)===-1;
}
function parseDurationValue(value:any){
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

function durationSeconds(row:any={}){

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

function isTooShortVideo(row:any){
  if(isLive(row))return false;

  const shortFlag=String(row?.isShort??"").toLowerCase();
  if(row?.isShort===true||shortFlag==="true"||shortFlag==="1")return true;

  const types=[row?.type,row?.rendererType,row?.videoType].map(value=>normalizeText(value||""));
  if(types.some(type=>type==="short"||type==="shorts"||type.includes("shortform")||type.includes("shorts")))return true;

  const shortUrls=[row?.url,row?.videoUrl,row?.webpageUrl,
    row?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url];
  if(shortUrls.some(url=>String(url||"").toLowerCase().includes("/shorts/")))return true;

  const shortText=clean([
    row?._displayTitle||row?.title||"",
    row?.description||row?.shortDescription||""
  ].join(" "),1600).toLowerCase();
  if(/(^|\s)#shorts?(?=\s|$|[.,!?;:()[\]{}|/\\-])/i.test(shortText))return true;

  const duration=durationSeconds(row);
  return Number.isFinite(duration)&&duration>0&&duration<=60;
}

const VI_TITLE_WORDS=new Set(
  "va voi cua cho trong tren duoi tai tu den nay hom ngay moi nhat khong co la mot nhung nguoi viet nam tin tuc nhac phim hai the thao cong nghe kinh te giai tri truc tiep du bao thoi tiet sau truoc dang da se can gia thi truong xuat khau tong bi bat cong an doi tuyen giai vo dich ban ket chung ca si bai hat lien khuc tuyen chon dem chuyen tinh mua nang mien bac trung ha noi hcm tphcm pin dep may dien thoai xe nha dat hoc sinh giao vien benh vien bo me con tre nuoc dan".split(" ")
);
const EN_TITLE_WORDS=new Set(
  "the and with from this that your you new best how what why when where who whose which for of to in on at after before official news weather forecast today full program woman man market world game match matches highlights could would should really over under into out now top first last released battery design buy buys buying comes come sell sells touring showroom roundup shocking due decline laziness goes goal goals replace candidates breaking morning night year years old young found fire killed dead injured reason using used use many sunny days storm rain president general military aid review music song video live versus vs is are was were be been being has have had do does did can will may might more most less only just all any every about around through during without within between against among than then them they their there here our we us it its he she his her him city country people police court company team player players coach final semi final".split(" ")
);

function isBlockedMusicTabVideo(meta:any={},row:any={}){
  const label=normalizeText(meta?.label||"");
  if(label!=="nhac"&&label!=="music")return false;
  const title=normalizeText(row?._displayTitle||row?.title||"");
  return /\b(?:beat|kara|karaoke)\b/.test(title);
}

function titleLooksEnglishOnly(row:any){
  const raw=clean(row?._displayTitle||row?.title||"",500);
  if(!raw)return false;

  // Any real Vietnamese diacritic is a strong signal to keep the original title.
  if(/[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/.test(raw)){
    return false;
  }

  const tokens=normalizeText(raw).split(" ").filter((token)=>token.length>1);
  if(tokens.length<3)return false;

  let vi=0,en=0;
  for(const token of tokens){
    if(VI_TITLE_WORDS.has(token))vi++;
    if(EN_TITLE_WORDS.has(token))en++;
  }
  if(vi>=2)return false;
  if(en>=3&&en>=vi+2)return true;
  if(vi===0&&en>=2&&tokens.length>=5)return true;
  return false;
}
function normalizeLiveText(value:any){
  return normalizeText(value);
}
function liveKeywordBlocked(row:any,keywords:string[]){
  if(!Array.isArray(keywords)||!keywords.length)return false;
  const haystack=normalizeLiveText([
    row?._displayTitle||row?.title||"",
    row?._sourceName||row?.uploaderName||row?.uploader||row?.channelName||""
  ].join(" "));
  if(!haystack)return false;
  return keywords.some((keyword)=> {
    const needle=normalizeLiveText(keyword);
    return !!needle&&haystack.includes(needle);
  });
}

function strongFreshLiveSignal(row:any){
  return Number(row?.duration)<0&&Number(row?.uploaded)===-1;
}
function relativeAgeMs(value:any){
  const raw=normalizeText(value);
  if(!raw)return Number.MAX_SAFE_INTEGER;
  if(/\b(vua xong|just now|moments ago|few seconds ago)\b/.test(raw))return 0;

  const match=raw.match(/(\d+)\s*(giay|phut|gio|ngay|tuan|thang|nam|second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b/);
  if(!match)return Number.MAX_SAFE_INTEGER;

  const n=Math.max(0,Number(match[1])||0);
  const unit=match[2];
  const minute=60*1000;
  if(/giay|second/.test(unit))return n*1000;
  if(/phut|minute/.test(unit))return n*minute;
  if(/gio|hour/.test(unit))return n*60*minute;
  if(/ngay|day/.test(unit))return n*24*60*minute;
  if(/tuan|week/.test(unit))return n*7*24*60*minute;
  if(/thang|month/.test(unit))return n*30*24*60*minute;
  if(/nam|year/.test(unit))return n*365*24*60*minute;
  return Number.MAX_SAFE_INTEGER;
}
function ageMs(row:any){
  if(isLive(row))return -1;
  const value=Number(row?.uploaded||row?.published||row?.publishedAt||0);
  if(Number.isFinite(value)&&value>0){
    const ms=value<1e12?value*1000:value;
    return Math.max(0,Date.now()-ms);
  }

  const raw=clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"",120);
  const relative=relativeAgeMs(raw);
  if(Number.isFinite(relative)&&relative!==Number.MAX_SAFE_INTEGER)return relative;

  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?Math.max(0,Date.now()-parsed):Number.MAX_SAFE_INTEGER;
}
function publishedText(row:any){
  return clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"",120);
}
function validChannelDisplayName(value:any){
  const name=clean(value,180);
  if(!name||/^UC[A-Za-z0-9_-]+$/.test(name))return "";
  return name;
}
function normalizeRow(row:any,source:any={}){
  const id=videoId(row);
  if(!id)return null;
  const sid=clean(source?.id||channelId(row),180);
  const sname=[
    source?.name,
    row?._sourceName,
    row?.uploaderName,
    row?.uploader,
    row?.channelName
  ].map(validChannelDisplayName).find(Boolean)||"";
  const thumb=clean(
    row?.thumbnail||
    row?.thumbnailUrl||
    row?.thumbnail_url||
    ("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg"),
    1000
  );
  const sourceThumb=clean(
    source?.thumbnailUrl||
    row?._sourceThumbnailUrl||
    row?.uploaderThumbnailUrl||
    row?.channelThumbnailUrl||
    row?.uploaderAvatar||
    row?.channelAvatar||
    "",
    1000
  );
  const live=isLive(row);
  return {
    ...row,
    id,
    videoId:id,
    title:clean(row?._displayTitle||row?.title||"",300),
    thumbnail:thumb,
    thumbnailUrl:thumb,
    uploader:sname,
    uploaderName:sname,
    channelId:sid||clean(row?.channelId||row?.uploaderId||"",180),
    _sourceId:sid,
    _sourceName:sname,
    _sourceThumbnailUrl:sourceThumb,
    isLive:live,
    publishedText:publishedText(row),
    views:Math.max(0,Number(row?.views)||Number(row?.viewCount)||0),
    duration:live?-1:durationSeconds(row)
  };
}

function dedupeRows(rows:any[]){
  const ids=new Set<string>();
  const titleHashes=new Set<string>();
  const out:any[]=[];
  for(const row of rows){
    const id=videoId(row);
    if(!id||ids.has(id))continue;
    const title=normalizeText(row?._displayTitle||row?.title||"");
    const th=title.length>=16?fastHash(title):"";
    if(th&&titleHashes.has(th))continue;
    ids.add(id);
    if(th)titleHashes.add(th);
    out.push(row);
  }
  return out;
}
function strongAd(row:any){
  const title=clean(row?._displayTitle||row?.title||"",260);
  const norm=normalizeText(title);
  const phone=/(?:^|[^\d])(?:\+?84|0)(?:3|5|7|8|9)(?:[\s.\-]?\d){8}(?:[^\d]|$)/u.test(title);
  const url=/(?:https?:\/\/|www\.|(?:^|\s)[a-z0-9-]+\.(?:com|net|org|vn|me|io|cc|xyz)(?:\s|\/|$))/iu.test(title);
  const promo=/\b(?:giftcode|coupon|voucher|ma giam gia|ma khuyen mai|nhap ma|code tan thu|code nhan qua|ma nhan qua|affiliate)\b/u.test(norm);
  const contact=/\b(?:zalo|telegram|whatsapp|hotline|lien he|inbox|ib)\b/u.test(norm);
  const handle=/(?:^|\s)@[a-z0-9_.-]{4,}/iu.test(title);
  return phone||url||promo||(contact&&handle);
}
function reviewCleanTitle(value:any){
  const original=clean(value,300);
  if(!original)return "";
  const title=original
    .replace(/https?:\/\/\S+|www\.\S+/giu," ")
    .replace(/(?:#[\p{L}\p{N}_-]+\s*)+$/gu," ")
    .replace(/^\s*(?:review\s*phim|phim\s*review|tóm\s*tắt\s*phim|tom\s*tat\s*phim|movie\s*recap)\s*[:|\-–—]*\s*/iu,"")
    .replace(/\b(?:full\s*tập|full\s*tap|trọn\s*bộ|tron\s*bo|vietsub|thuyết\s*minh|thuyet\s*minh)\b/giu," ")
    .replace(/([!?.,])\1{1,}/g,"$1")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/g,"")
    .trim();
  return title.length>=10?title:original;
}
function sourceSignature(rows:any[],scope:string){
  return rows
    .filter((r)=>r.scope===scope&&r.status==="selected")
    .map((r)=>clean(r.channel_id,180))
    .filter(Boolean)
    .sort()
    .join("|");
}
function snapshotRowsHash(rows:any[],sourceSig=""){
  const body=rows.map((row)=>[
    videoId(row),
    clean(row?._displayTitle||row?.title||"",300),
    publishedText(row),
    clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180),
    clean(row?._sourceName||row?.uploaderName||row?.uploader||"",180),
    clean(row?.thumbnailUrl||row?.thumbnail||"",1000),
    clean(row?._sourceThumbnailUrl||row?.uploaderThumbnailUrl||row?.channelThumbnailUrl||"",1000),
    String(Math.max(0,Number(row?.views)||0)),
    isLive(row)?"1":"0",
    String(durationSeconds(row)||0)
  ].join("|")).join("\n");
  return fastHash(String(sourceSig||"")+"\n"+body);
}
function sortRows(rows:any[]){
  return rows.slice().sort((a,b)=>{
    const aa=ageMs(a),bb=ageMs(b);
    if(aa!==bb)return aa-bb;
    return (Number(b?.views)||0)-(Number(a?.views)||0);
  });
}
async function fetchJson(url:string,headers:any={},timeout=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const res=await fetch(url,{headers,cache:"no-store",signal:controller.signal});
    const data=await res.json().catch(()=>null);
    if(!res.ok||data?.ok===false)throw new Error(data?.error||("HTTP "+res.status));
    return data;
  }finally{clearTimeout(timer);}
}
function channelRefreshBatch(ids:string[],checkedTime:(id:string)=>number,limit:number){
  const ordered=ids.slice().sort((a,b)=>checkedTime(a)-checkedTime(b)||a.localeCompare(b));
  return {fetch:ordered.slice(0,limit),deferred:ordered.slice(limit)};
}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>){
  const out=new Array<R>(items.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)return;
      out[i]=await fn(items[i],i);
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

function decodeJsonString(value:any){
  const raw=String(value||"");
  if(!raw)return "";
  try{return JSON.parse('"'+raw.replace(/"/g,'\\"')+'"');}catch{
    return raw
      .replace(/\\u0026/g,"&")
      .replace(/\\n/g," ")
      .replace(/\\t/g," ")
      .replace(/\\\"/g,'"')
      .replace(/\\\\/g,"\\");
  }
}

function youtubePlayerMetaFromResponse(data:any){
  let live=data?.videoDetails?.isLive===true||data?.videoDetails?.isLiveContent===true;
  const tracking=Array.isArray(data?.responseContext?.serviceTrackingParams)
    ?data.responseContext.serviceTrackingParams
    :[];
  for(const service of tracking){
    for(const param of Array.isArray(service?.params)?service.params:[]){
      if(param?.key==="is_viewed_live"&&String(param?.value||"").toLowerCase()==="true"){
        live=true;
      }
    }
  }
  const duration=parseDurationValue(data?.videoDetails?.lengthSeconds);
  return {duration:live?-1:duration,isLive:live};
}

async function youtubePlayerMetadata(id:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))return {duration:0,isLive:false};
  let fallback={duration:0,isLive:false};
  for(const profile of YT_PLAYER_CLIENTS){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),2600);
    try{
      const client:any={
        clientName:profile.clientName,
        clientVersion:profile.clientVersion,
        hl:"vi",
        gl:"VN"
      };
      if(profile.androidSdkVersion)client.androidSdkVersion=profile.androidSdkVersion;
      const res=await fetch(
        "https://www.youtube.com/youtubei/v1/player?key="+
          encodeURIComponent(YT_WEB_PLAYER_API_KEY),
        {
          method:"POST",
          signal:controller.signal,
          cache:"no-store",
          headers:{
            "content-type":"application/json",
            "user-agent":profile.userAgent
          },
          body:JSON.stringify({context:{client},videoId:id})
        }
      );
      if(!res.ok)continue;
      const data=await res.json().catch(()=>null);
      const meta=youtubePlayerMetaFromResponse(data);
      if(meta.isLive||meta.duration>0)return meta;
      fallback=meta;
    }catch{
      // Try the next lightweight player profile.
    }finally{
      clearTimeout(timer);
    }
  }
  return fallback;
}

async function youtubePlayerIsLive(id:string){
  return (await youtubePlayerMetadata(id)).isLive;
}


function exactSearchVideoMeta(data:any,id:string){
  const items=Array.isArray(data?.items)
    ?data.items
    :Array.isArray(data?.data?.items)?data.data.items:[];
  const row=items.find((item:any)=>videoId(item)===id);
  if(!row)return null;
  return {
    duration:durationSeconds(row),
    isLive:isLive(row),
    sourceName:validChannelDisplayName(row?.uploaderName||row?.uploader||row?.channelName||""),
    sourceThumbnailUrl:clean(
      row?.uploaderAvatar||row?.uploaderThumbnailUrl||row?.channelThumbnailUrl||"",
      1000
    ),
    thumbnailUrl:clean(row?.thumbnailUrl||row?.thumbnail||"",1000),
    views:Math.max(0,Number(row?.views)||Number(row?.viewCount)||0)
  };
}

async function youtubeSearchVideoMetadata(
  supabaseUrl:string,
  serviceKey:string,
  id:string
){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))return null;
  try{
    const result=await fetchJson(
      supabaseUrl+"/functions/v1/yt1988?action=search&q="+
        encodeURIComponent(id)+"&filter=videos",
      {
        "apikey":serviceKey,
        "authorization":"Bearer "+serviceKey
      },
      6000
    );
    return exactSearchVideoMeta(result?.data||result,id);
  }catch{
    return null;
  }
}


function youtubeShortsPageSignal(html:string,id:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)||!html)return false;
  const canonical='href="https://www.youtube.com/shorts/'+id+'"';
  return html.includes(canonical)||
    html.includes('"webPageType":"WEB_PAGE_TYPE_SHORTS"')||
    html.includes('"reelWatchEndpoint"')&&html.includes('"videoId":"'+id+'"');
}

async function youtubeShortsMembership(id:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))return false;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2600);
  try{
    const res=await fetch(
      "https://www.youtube.com/shorts/"+encodeURIComponent(id)+"?hl=vi&gl=VN",
      {
        method:"GET",
        signal:controller.signal,
        cache:"no-store",
        headers:{
          "accept":"text/html,application/xhtml+xml",
          "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
          "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
        }
      }
    );
    if(!res.ok)return false;
    const html=await res.text();
    return youtubeShortsPageSignal(html,id);
  }catch{
    return false;
  }finally{
    clearTimeout(timer);
  }
}

async function selectedSourceLiveNow(source:any,candidates:any[]=[]){
  const id=clean(source?.id,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;

  // Use the server's existing per-channel cache first. It already contains the
  // latest channel videos, including long-running live streams that /live does
  // not redirect to anymore.
  const candidateRows=dedupeRows(
    (Array.isArray(candidates)?candidates:[])
      .map((row:any)=>normalizeRow(row,source))
      .filter(Boolean)
  ).slice(0,LIVE_SELECTED_CANDIDATES_PER_SOURCE);

  for(const row of candidateRows){
    const idValue=videoId(row);
    if(!idValue)continue;
    if(!(await youtubePlayerIsLive(idValue)))continue;
    return normalizeRow({
      ...row,
      id:idValue,
      videoId:idValue,
      url:"/watch?v="+idValue,
      thumbnail:clean(row?.thumbnail||row?.thumbnailUrl||"",1000)||
        "https://i.ytimg.com/vi/"+idValue+"/hqdefault.jpg",
      thumbnailUrl:clean(row?.thumbnailUrl||row?.thumbnail||"",1000)||
        "https://i.ytimg.com/vi/"+idValue+"/hqdefault.jpg",
      uploaderName:clean(source?.name||row?.uploaderName||row?.uploader||"",180),
      uploaderUrl:"/channel/"+id,
      channelId:id,
      uploaded:-1,
      duration:-1,
      isLive:true,
      publishedText:"Đang trực tiếp"
    },source);
  }

  // Last fallback for a newly selected channel that does not yet have cache.
  // Some YouTube channels still redirect /live directly to the watch URL.
  const endpoint=
    "https://www.youtube.com/channel/"+encodeURIComponent(id)+"/live?hl=vi&gl=VN";
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2200);
  try{
    const probe=await fetch(endpoint,{
      method:"GET",
      signal:controller.signal,
      cache:"no-store",
      redirect:"follow",
      headers:{
        "accept":"text/html,application/xhtml+xml",
        "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
        "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
      }
    });
    if(!probe.ok)return null;
    const finalUrl=String(probe.url||"");
    try{await probe.body?.cancel();}catch{}
    const idValue=finalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||"";
    if(!idValue||!(await youtubePlayerIsLive(idValue)))return null;
    return normalizeRow({
      id:idValue,
      videoId:idValue,
      url:"/watch?v="+idValue,
      title:clean(source?.name||"Đang trực tiếp",300),
      thumbnail:"https://i.ytimg.com/vi/"+idValue+"/hqdefault.jpg",
      thumbnailUrl:"https://i.ytimg.com/vi/"+idValue+"/hqdefault.jpg",
      uploaderName:clean(source?.name||"",180),
      uploaderUrl:"/channel/"+id,
      channelId:id,
      uploaded:-1,
      duration:-1,
      views:0,
      isLive:true,
      publishedText:"Đang trực tiếp"
    },source);
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

async function discoverGlobalLiveCandidates(
  supabaseUrl:string,
  serviceKey:string,
  blockedSourceIds:Set<string>,
  selectedSourceIds:Set<string>,
  keywords:string[]
){
  const deadline=Date.now()+12000;
  const external:any[]=[];
  const selected:any[]=[];

  // STEP 1: one fresh page per broad LIVE query. Blocked channels disappear.
  // Selected channels are removed from "outside" and handed to STEP 2 instead.
  await mapLimit(LIVE_SEARCH_QUERIES,4,async(query)=>{
    if(Date.now()>=deadline)return false;
    try{
      const result=await fetchJson(
        supabaseUrl+"/functions/v1/yt1988?action=search&q="+
          encodeURIComponent(query)+"&filter=videos",
        {
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },
        4200
      );
      const raw=Array.isArray(result?.data?.items)?result.data.items:
        Array.isArray(result?.data)?result.data:[];

      for(const item of raw){
        const row=normalizeRow(item,{});
        if(!row||!strongFreshLiveSignal(row))continue;
        const sid=channelId(row);
        if(sid&&blockedSourceIds.has(sid))continue;
        if(sid&&selectedSourceIds.has(sid)){
          selected.push({...row,_liveOrigin:"source"});
          continue;
        }
        if(liveKeywordBlocked(row,keywords))continue;
        external.push({...row,_liveOrigin:"search"});
      }
      return true;
    }catch(error){
      console.warn("global live search failed",query,String(error));
      return false;
    }
  });

  return {
    external:dedupeRows(external),
    selected:dedupeRows(selected)
  };
}

async function claimLease(rest:string,headers:any){
  const res=await fetch(rest+"/rpc/yt1988_try_refresh_lock",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_lease_seconds:95})
  });
  if(!res.ok)return false;
  return (await res.json())===true;
}
async function queuePendingRefresh(rest:string,headers:any,scopes:string[]){
  if(!scopes.length)return;
  await fetch(rest+"/rpc/yt1988_queue_refresh",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_scopes:scopes})
  }).catch(()=>{});
}
async function finishLease(rest:string,headers:any,ok:boolean,error=""){
  try{
    const res=await fetch(rest+"/rpc/yt1988_finish_refresh_v2",{
      method:"POST",headers,
      body:JSON.stringify({p_profile_key:PROFILE,p_ok:ok,p_error:clean(error,1800)})
    });
    if(res.ok){
      const pending=await res.json().catch(()=>[]);
      return Array.isArray(pending)?pending.filter((s:any)=>validScopeSyntax(s)):[];
    }
  }catch{}

  await fetch(rest+"/rpc/yt1988_finish_refresh",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_ok:ok,p_error:clean(error,1800)})
  }).catch(()=>{});
  return [];
}
function triggerFollowupRefresh(supabaseUrl:string,serviceKey:string,scopes:string[]){
  const wanted=[...new Set(scopes.map((s)=>clean(s,32)).filter(validScopeSyntax))];
  if(!wanted.length)return;
  const task=fetch(supabaseUrl+"/functions/v1/yt1988-refresh",{
    method:"POST",
    headers:{
      "apikey":serviceKey,
      "authorization":"Bearer "+serviceKey,
      "content-type":"application/json"
    },
    body:JSON.stringify({scopes:wanted})
  }).catch((error)=>console.warn("followup refresh failed",String(error)));
  try{(globalThis as any).EdgeRuntime?.waitUntil?.(task);}catch{}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);

  // This endpoint only rebuilds server-owned read packages from authoritative
  // source state. A DB lease limits execution frequency and prevents overlap.
  const rest=supabaseUrl+"/rest/v1";
  const authHeaders={
    "apikey":serviceKey,
    "authorization":"Bearer "+serviceKey,
    "content-type":"application/json"
  };

  let body:any={};
  try{body=await req.json();}catch{}

  const hashtagRes=await fetch(
    rest+"/yt1988_hashtags?profile_key=eq."+encodeURIComponent(PROFILE)+
    "&enabled=eq.true&select=hashtag_id,label,position&order=position.asc,hashtag_id.asc",
    {headers:authHeaders}
  );
  if(!hashtagRes.ok)return json({ok:false,error:"hashtag_read_failed",detail:await hashtagRes.text()},502);
  const hashtagRaw=await hashtagRes.json();
  const hashtagRows=(Array.isArray(hashtagRaw)?hashtagRaw:[])
    .map((row:any)=>({
      id:clean(row?.hashtag_id,32),
      label:clean(row?.label,40),
      position:Number(row?.position)||0
    }))
    .filter((row:any)=>HASHTAG_ID_RE.test(row.id)&&row.label);

  const SCOPES=[
    ...SYSTEM_SCOPES,
    ...hashtagRows.map((row:any)=>row.id)
  ];
  const SCOPE_META:any={...SYSTEM_SCOPE_META};
  for(const hashtag of hashtagRows){
    SCOPE_META[hashtag.id]={
      profile:"hashtag",
      label:hashtag.label,
      kind:"content"
    };
  }
  const DEFAULT_SCOPE_INTERVAL_MINUTES:any={...DEFAULT_SYSTEM_INTERVAL_MINUTES};
  for(const hashtag of hashtagRows){
    DEFAULT_SCOPE_INTERVAL_MINUTES[hashtag.id]=DEFAULT_HASHTAG_INTERVAL_MINUTES;
  }

  const requested=new Set(
    (Array.isArray(body?.scopes)?body.scopes:[])
      .map((s:any)=>clean(s,32))
      .filter((s:string)=>SCOPES.includes(s))
  );
  let scopes=requested.size?[...requested]:SCOPES.slice();

  if(!await claimLease(rest,authHeaders)){
    await queuePendingRefresh(rest,authHeaders,scopes);
    return json({ok:true,skipped:true,queued:true,reason:"refresh_already_running",scopes});
  }

  // Keep each execution short enough for the Edge wall-clock limit. Extra
  // scopes stay server-side and are picked up by the scheduler on the next tick.
  if(scopes.length>MAX_SCOPES_PER_RUN){
    const deferredScopes=scopes.slice(MAX_SCOPES_PER_RUN);
    await queuePendingRefresh(rest,authHeaders,deferredScopes);
    scopes=scopes.slice(0,MAX_SCOPES_PER_RUN);
  }

  let ok=false;
  let failure="";
  try{
    const stateRes=await fetch(
      rest+"/yt1988_source_state?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&scope=in.("+[...SCOPES,"general"].map(encodeURIComponent).join(",")+")"+
      "&select=scope,channel_id,status,name,thumbnail_url,subscribers",
      {headers:authHeaders}
    );
    if(!stateRes.ok)throw new Error("source_state_read_failed");
    const stateRows=await stateRes.json();
    const rows=Array.isArray(stateRows)?stateRows:[];

    const packageRes=await fetch(
      rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&select=scope,hash,input_hash,source_signature,version,items,updated_at",
      {headers:authHeaders}
    );
    if(!packageRes.ok)throw new Error("package_manifest_read_failed");
    const packageRows=await packageRes.json();
    const currentByScope=new Map((Array.isArray(packageRows)?packageRows:[]).map((r:any)=>[r.scope,r]));

    // Refresh cadence is data, not code. This keeps "2/5/10 minutes" adjustable
    // without changing the worker. If config is temporarily unavailable, use
    // the safe defaults above.
    const intervalByScope=new Map<string,number>(
      SCOPES.map((scope)=>[scope,Number(DEFAULT_SCOPE_INTERVAL_MINUTES[scope])||10])
    );
    try{
      const configRes=await fetch(
        rest+"/yt1988_refresh_config?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&enabled=eq.true&select=scope,interval_minutes",
        {headers:authHeaders}
      );
      if(configRes.ok){
        const configRows=await configRes.json();
        for(const row of Array.isArray(configRows)?configRows:[]){
          const scope=clean(row?.scope,32);
          const minutes=Math.max(1,Math.min(1440,Number(row?.interval_minutes)||0));
          if(SCOPES.includes(scope)&&minutes>0)intervalByScope.set(scope,minutes);
        }
      }
    }catch{}

    const blockedByScope=new Map<string,Set<string>>();
    const selectedByScope=new Map<string,any[]>();
    const generalBlockedIds=new Set<string>();
    const channelMeta=new Map<string,any>();

    for(const scope of SCOPES){
      blockedByScope.set(scope,new Set());
      selectedByScope.set(scope,[]);
    }
    for(const row of rows){
      const scope=clean(row?.scope,32);
      const id=clean(row?.channel_id,180);
      if(!id)continue;
      if(scope==="general"){
        if(row?.status==="blocked")generalBlockedIds.add(id);
        continue;
      }
      if(!SCOPES.includes(scope))continue;
      if(row?.status==="blocked"){
        blockedByScope.get(scope)?.add(id);
      }else if(row?.status==="selected"){
        selectedByScope.get(scope)?.push({
          id,
          name:clean(row?.name,180),
          thumbnailUrl:clean(row?.thumbnail_url,1000)
        });
      }
      const previousMeta=channelMeta.get(id)||{id,name:"",thumbnailUrl:""};
      channelMeta.set(id,{
        id,
        name:validChannelDisplayName(previousMeta.name)||
          validChannelDisplayName(row?.name)||
          "",
        thumbnailUrl:clean(previousMeta.thumbnailUrl||row?.thumbnail_url||"",1000)
      });
    }

    // Only LIVE owns a blacklist. Non-live scopes are simple selected
    // channel lists; a channel is either selected in that scope or it is not.
    const liveBlockedIds=blockedByScope.get("live")||new Set<string>();
    selectedByScope.set(
      "live",
      (selectedByScope.get("live")||[]).filter((s:any)=>!liveBlockedIds.has(s.id))
    );

    let liveKeywords:string[]=[];
    let verifiedLiveRowsCache:any[]=[];

    // The LIVE blacklist applies to both LIVE sources:
    // Source 1 = external search; Source 2 = selected channels.
    const allBlockedLiveSourceIds=new Set<string>(liveBlockedIds);

    const explicitLiveSources=selectedByScope.get("live")||[];
    const explicitLiveIds=new Set(explicitLiveSources.map((source:any)=>source.id));
    const liveSourceById=new Map<string,any>();

    for(const source of SCOPES.flatMap((scope)=>selectedByScope.get(scope)||[])){
      if(!source?.id||allBlockedLiveSourceIds.has(source.id))continue;
      const current=liveSourceById.get(source.id);
      liveSourceById.set(source.id,{
        ...current,
        ...source,
        name:clean(source?.name||current?.name||"",180),
        thumbnailUrl:clean(source?.thumbnailUrl||current?.thumbnailUrl||"",1000)
      });
    }
    for(const source of explicitLiveSources){
      if(!source?.id||allBlockedLiveSourceIds.has(source.id))continue;
      const current=liveSourceById.get(source.id)||{};
      liveSourceById.set(source.id,{
        ...current,
        ...source,
        name:clean(source?.name||current?.name||"",180),
        thumbnailUrl:clean(source?.thumbnailUrl||current?.thumbnailUrl||"",1000)
      });
    }

    const selectedLiveSources=[...liveSourceById.values()];
    const inheritedLiveIds=new Set(
      selectedLiveSources
        .map((source:any)=>source.id)
        .filter((id:string)=>!explicitLiveIds.has(id))
    );

    const previousLiveItems=scopes.includes("live")&&Array.isArray(currentByScope.get("live")?.items)
      ?currentByScope.get("live").items
      :[];
    const previousLiveSourceIds=new Set(
      previousLiveItems.map((item:any)=>channelId(item)).filter(Boolean)
    );
    const liveCandidateRowsById=new Map<string,any[]>();
    if(scopes.includes("live")&&selectedLiveSources.length){
      // Reuse the existing channel cache instead of re-downloading full YouTube
      // pages for every selected source. Existing LIVE package rows are placed
      // first so active streams remain cheap to re-verify every cycle.
      for(const item of previousLiveItems){
        const sid=channelId(item);
        if(!sid||!liveSourceById.has(sid))continue;
        const list=liveCandidateRowsById.get(sid)||[];
        list.push(item);
        liveCandidateRowsById.set(sid,list);
      }

      const liveIds=selectedLiveSources.map((source:any)=>source.id).filter(Boolean);
      for(let start=0;start<liveIds.length;start+=50){
        const ids=liveIds.slice(start,start+50);
        const cacheRes=await fetch(
          rest+"/yt1988_channel_cache?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
          "&select=channel_id,items",
          {headers:authHeaders}
        );
        if(!cacheRes.ok)continue;
        const cacheRows=await cacheRes.json();
        for(const cacheRow of Array.isArray(cacheRows)?cacheRows:[]){
          const sid=clean(cacheRow?.channel_id,180);
          if(!sid)continue;
          const existing=liveCandidateRowsById.get(sid)||[];
          liveCandidateRowsById.set(
            sid,
            dedupeRows([
              ...existing,
              ...(Array.isArray(cacheRow?.items)?cacheRow.items:[])
            ])
          );
        }
      }
    }

    if(scopes.includes("live")){
      try{
        const keywordsRes=await fetch(
          rest+"/yt1988_live_keywords?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&select=keyword_display&order=keyword_display.asc",
          {headers:authHeaders}
        );
        if(keywordsRes.ok){
          const keywordRows=await keywordsRes.json();
          liveKeywords=(Array.isArray(keywordRows)?keywordRows:[])
            .map((row:any)=>clean(row?.keyword_display||"",120))
            .filter(Boolean);
        }
      }catch(error){
        console.warn("live keyword read failed",String(error));
      }

      // STEP 1 — outside LIVE: keyword filter + all blocked sources; every
      // selected channel is removed from outside and reserved for STEP 2.
      const allSelectedLiveSourceIds=new Set(
        selectedLiveSources.map((source:any)=>source.id).filter(Boolean)
      );
      const discovery=await discoverGlobalLiveCandidates(
        supabaseUrl,
        serviceKey,
        allBlockedLiveSourceIds,
        allSelectedLiveSourceIds,
        liveKeywords
      ).catch((error)=>{
        console.warn("global live discovery failed",String(error));
        return {external:[],selected:[]};
      });
      const verifiedExternalRows=(discovery.external||[])
        .map((row:any)=>({...row,_liveOrigin:"search",_interestPriority:0}));

      // STEP 2 — scan the selected library once. Fresh selected rows already
      // found by STEP 1 are reused, so only the remaining selected channels need
      // one lightweight /live HEAD check.
      const selectedFromSearch=(discovery.selected||[]).map((row:any)=>{
        const sid=channelId(row);
        return {
          ...row,
          _liveOrigin:"source",
          _interestPriority:explicitLiveIds.has(sid)
            ?2
            :inheritedLiveIds.has(sid)
              ?1
              :0
        };
      });
      const selectedSeenIds=new Set(
        selectedFromSearch.map((row:any)=>channelId(row)).filter(Boolean)
      );
      const remainingSelected=selectedLiveSources.filter(
        (source:any)=>!selectedSeenIds.has(source.id)
      );
      const activeToRecheck=remainingSelected.filter(
        (source:any)=>previousLiveSourceIds.has(source.id)
      );
      const rotationPool=remainingSelected
        .filter((source:any)=>!previousLiveSourceIds.has(source.id))
        .sort((a:any,b:any)=>String(a?.id||"").localeCompare(String(b?.id||"")));
      const rotationStart=rotationPool.length
        ?(Math.floor(Date.now()/(2*60*1000))*LIVE_SELECTED_SOURCES_PER_RUN)%rotationPool.length
        :0;
      const rotated=[
        ...rotationPool.slice(rotationStart),
        ...rotationPool.slice(0,rotationStart)
      ].slice(0,LIVE_SELECTED_SOURCES_PER_RUN);
      const selectedToCheck=[
        ...activeToRecheck,
        ...rotated
      ];

      const selectedCheckedRows=(await mapLimit(selectedToCheck,6,async(source)=>{
        try{
          const row=await selectedSourceLiveNow(
            source,
            liveCandidateRowsById.get(source.id)||[]
          );
          if(!row)return null;
          const sid=channelId(row);
          if(sid&&allBlockedLiveSourceIds.has(sid))return null;
          return {
            ...row,
            _liveOrigin:"source",
            _interestPriority:explicitLiveIds.has(sid)
              ?2
              :inheritedLiveIds.has(sid)
                ?1
                :0
          };
        }catch(error){
          console.warn("selected live check failed",source?.id,String(error));
          return null;
        }
      })).filter(Boolean);

      // STEP 3 — merge only after Source 1 and Source 2 have each been filtered.
      const selectedLiveRows=dedupeRows([
        ...selectedFromSearch,
        ...selectedCheckedRows
      ]);
      verifiedLiveRowsCache=dedupeRows([
        ...selectedLiveRows,
        ...verifiedExternalRows
      ]).sort((a:any,b:any)=>
        (Number(b?._interestPriority)||0)-(Number(a?._interestPriority)||0)
      );
    }

    const nonLiveScopes=scopes.filter((scope)=>scope!=="live");
    const neededIds=[...new Set(
      nonLiveScopes.flatMap((scope)=>selectedByScope.get(scope)||[]).map((s:any)=>s.id)
    )];
    const channelRows=new Map<string,any[]>();
    const channelFetchOk=new Set<string>();
    const cacheById=new Map<string,any>();
    const cacheWrites:any[]=[];
    const now=Date.now();

    // Load persistent per-channel snapshots. These are the server equivalent
    // of the old browser channel cache: one failed upstream request must never
    // erase a channel that was previously fetched successfully.
    for(let start=0;start<neededIds.length;start+=50){
      const ids=neededIds.slice(start,start+50);
      if(!ids.length)continue;
      const cacheRes=await fetch(
        rest+"/yt1988_channel_cache?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
        "&select=channel_id,items,hash,newest_video_id,newest_uploaded_at,source_name,thumbnail_url,checked_at,last_success_at,last_error,retry_after,version",
        {headers:authHeaders}
      );
      if(!cacheRes.ok){
        console.warn("channel cache read failed",await cacheRes.text());
        continue;
      }
      const cacheRows=await cacheRes.json();
      for(const row of Array.isArray(cacheRows)?cacheRows:[]){
        const id=clean(row?.channel_id,180);
        if(id)cacheById.set(id,row);
      }
    }

    // Existing packages are also valid reserve data during the first migration
    // run, before every selected channel has its own cache row.
    for(const pkg of Array.isArray(packageRows)?packageRows:[]){
      for(const item of Array.isArray(pkg?.items)?pkg.items:[]){
        const id=channelId(item);
        if(!id||cacheById.has(id))continue;
        const list=(cacheById.get(id)?.items)||[];
        list.push(item);
        cacheById.set(id,{
          channel_id:id,
          items:list,
          source_name:clean(item?._sourceName||item?.uploaderName||item?.uploader||"",180),
          thumbnail_url:"",
          checked_at:pkg?.updated_at||null,
          last_success_at:pkg?.updated_at||null,
          retry_after:null,
          hash:""
        });
      }
    }

    for(const id of neededIds){
      const cached=cacheById.get(id);
      const source=channelMeta.get(id)||{id,name:""};
      if(!source.name&&cached?.source_name)source.name=clean(cached.source_name,180);
      if(!source.thumbnailUrl&&cached?.thumbnail_url)source.thumbnailUrl=clean(cached.thumbnail_url,1000);
      channelMeta.set(id,source);

      const successAt=Date.parse(String(cached?.last_success_at||cached?.checked_at||""));
      const rows=dedupeRows(Array.isArray(cached?.items)?cached.items:[])
        .map((row:any)=>normalizeRow(row,source)).filter(Boolean).slice(0,30);
      if(rows.length&&Number.isFinite(successAt)&&now-successAt<=CHANNEL_CACHE_MAX_AGE_MS){
        channelRows.set(id,rows);
      }
    }

    const checkedTime=(id:string)=>{
      const value=Date.parse(String(cacheById.get(id)?.checked_at||""));
      return Number.isFinite(value)?value:0;
    };
    const channelRecheckMs=(id:string)=>{
      const minutes=scopes
        .filter((scope)=>(selectedByScope.get(scope)||[]).some((source:any)=>source.id===id))
        .map((scope)=>Number(intervalByScope.get(scope))||10);
      const fastest=minutes.length?Math.min(...minutes):10;
      return Math.max(60*1000,fastest*60*1000);
    };
    const due=neededIds.filter((id)=>{
      const cached=cacheById.get(id);
      const retry=Date.parse(String(cached?.retry_after||""));
      if(Number.isFinite(retry)&&retry>now)return false;
      const checked=checkedTime(id);
      return !checked||now-checked>=channelRecheckMs(id);
    });
    const batch=channelRefreshBatch(due,checkedTime,MAX_CHANNEL_FETCHES_PER_RUN);
    const dueIds=batch.fetch;
    const deferredIds=new Set(batch.deferred);
    const unfinishedScopes=nonLiveScopes.filter(scope=>
      (selectedByScope.get(scope)||[]).some((source:any)=>deferredIds.has(source.id))
    );
    // Continue large tabs on the next scheduler tick, not the next full interval.
    await queuePendingRefresh(rest,authHeaders,unfinishedScopes);

    // Bound both request count and concurrency. Large tabs are refreshed in
    // rotation; uncached channels get priority on the next pass.
    await mapLimit(dueIds,3,async(id,index)=>{
      const source=channelMeta.get(id)||{id,name:"",thumbnailUrl:""};
      const previous=cacheById.get(id)||{};
      const previousRows=channelRows.get(id)||[];
      const checkedAt=new Date().toISOString();

      try{
        const url=supabaseUrl+"/functions/v1/yt1988?action=channel&id="+encodeURIComponent(id);
        const result=await fetchJson(url,{
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },7500);
        const data=result?.data||{};
        const discoveredName=validChannelDisplayName(data?.name||data?.title||"");
        const discoveredAvatar=clean(
          data?.avatarUrl||data?.thumbnailUrl||data?.avatar||"",
          1000
        );
        if(discoveredName)source.name=discoveredName;
        if(discoveredAvatar)source.thumbnailUrl=discoveredAvatar;
        if(discoveredName||discoveredAvatar)channelMeta.set(id,source);

        const raw=Array.isArray(data?.relatedStreams)
          ?data.relatedStreams
          :Array.isArray(data?.items)?data.items:[];
        const previousByVideo=new Map(
          previousRows.map((row:any)=>[videoId(row),row]).filter(([id])=>!!id)
        );
        const fresh=dedupeRows(
          raw.map((row:any)=>normalizeRow(row,source)).filter(Boolean)
        ).slice(0,30).map((row:any)=>{
          const previousRow:any=previousByVideo.get(videoId(row));
          if(!previousRow)return row;
          const knownDuration=durationSeconds(row)>0
            ?durationSeconds(row)
            :durationSeconds(previousRow);
          return {
            ...row,
            duration:isLive(row)?row.duration:(knownDuration||row.duration||0),
            isShort:row?.isShort===true||previousRow?.isShort===true,
            _durationCheckedAt:Number(previousRow?._durationCheckedAt)||0,
            _shortCheckedAt:Number(previousRow?._shortCheckedAt)||0
          };
        });

        if(!fresh.length)throw new Error("empty_channel_payload");

        const sourceName=[
          source?.name,
          fresh[0]?._sourceName,
          fresh[0]?.uploaderName,
          fresh[0]?.uploader,
          previous?.source_name
        ].map(validChannelDisplayName).find(Boolean)||"";
        if(sourceName&&!source.name){
          source.name=sourceName;
          channelMeta.set(id,source);
        }

        channelRows.set(id,fresh);
        channelFetchOk.add(id);

        const newest=fresh
          .map((row:any)=>({id:videoId(row),age:ageMs(row)}))
          .filter((row:any)=>row.id&&Number.isFinite(row.age)&&row.age>=0&&row.age<Number.MAX_SAFE_INTEGER)
          .sort((a:any,b:any)=>a.age-b.age)[0]||null;

        const cacheHash=fastHash(fresh.map((row:any)=>[
          videoId(row),clean(row?.title,300),publishedText(row),String(durationSeconds(row)||0)
        ].join("|")).join("\n"));

        cacheWrites.push({
          profile_key:PROFILE,
          channel_id:id,
          items:fresh,
          hash:cacheHash,
          newest_video_id:newest?.id||"",
          newest_uploaded_at:newest?new Date(Date.now()-newest.age).toISOString():null,
          source_name:sourceName,
          thumbnail_url:clean(source?.thumbnailUrl||previous?.thumbnail_url||"",1000),
          checked_at:checkedAt,
          last_success_at:checkedAt,
          last_error:"",
          retry_after:null,
          version:Date.now()*100+index
        });
      }catch(error){
        console.warn("channel refresh failed",id,String(error));
        const message=clean(String((error as any)?.message||error||"channel_refresh_failed"),500);
        cacheWrites.push({
          profile_key:PROFILE,
          channel_id:id,
          items:previousRows,
          hash:clean(previous?.hash,100),
          newest_video_id:clean(previous?.newest_video_id,64),
          newest_uploaded_at:previous?.newest_uploaded_at||null,
          source_name:clean(source?.name||previous?.source_name||"",180),
          thumbnail_url:clean(source?.thumbnailUrl||previous?.thumbnail_url||"",1000),
          checked_at:checkedAt,
          last_success_at:previous?.last_success_at||null,
          last_error:message,
          retry_after:new Date(Date.now()+CHANNEL_FAILURE_RETRY_MS).toISOString(),
          version:Date.now()*100+index
        });
      }
      return true;
    });

    // Verify every recent non-live row on the server. Duration and YouTube's
    // Shorts surface are independent signals: either <=60 seconds OR Shorts
    // membership excludes a video from every non-live package.
    const verificationScopeChannelIds=new Set<string>();
    for(const scope of scopes){
      if(scope==="live")continue;
      for(const source of selectedByScope.get(scope)||[])verificationScopeChannelIds.add(source.id);
    }

    const currentPackageVideoIds=new Set<string>();
    for(const scope of scopes){
      if(scope==="live")continue;
      const currentItems=Array.isArray(currentByScope.get(scope)?.items)
        ?currentByScope.get(scope).items
        :[];
      for(const row of currentItems){
        const id=videoId(row);
        if(id)currentPackageVideoIds.add(id);
      }
    }

    const verificationCandidates:any[]=[];
    const verificationCandidateIds=new Set<string>();
    for(const [candidateChannelId,items] of channelRows){
      if(verificationScopeChannelIds.size&&!verificationScopeChannelIds.has(candidateChannelId))continue;
      for(const row of items){
        const id=videoId(row);
        const age=ageMs(row);
        if(
          !id||
          verificationCandidateIds.has(id)||
          isLive(row)||
          isTooShortVideo(row)||
          !Number.isFinite(age)||
          age<0||
          age>=7*DAY_MS
        )continue;

        const duration=durationSeconds(row);
        const durationCheckedAt=Number(row?._durationCheckedAt)||0;
        const shortCheckedAt=Number(row?._shortCheckedAt)||0;
        const resolverVersion=Number(row?._durationResolverVersion)||0;
        const needDuration=duration<=0&&(
          resolverVersion<3||
          !durationCheckedAt||
          now-durationCheckedAt>=15*60*1000
        );
        const needShort=!shortCheckedAt;
        if(!needDuration&&!needShort)continue;

        verificationCandidateIds.add(id);
        verificationCandidates.push({
          id,
          age,
          duration,
          needDuration,
          needShort,
          inCurrentPackage:currentPackageVideoIds.has(id)
        });
      }
    }
    verificationCandidates.sort((a,b)=>
      Number(b.inCurrentPackage)-Number(a.inCurrentPackage)||
      a.age-b.age
    );

    const verificationMeta=new Map<string,any>();
    await mapLimit(verificationCandidates.slice(0,NON_LIVE_VERIFY_BATCH),8,async(candidate)=>{
      const checkedAt=Date.now();
      const [searchMeta,isShort]=await Promise.all([
        candidate.needDuration
          ?youtubeSearchVideoMetadata(supabaseUrl,serviceKey,candidate.id)
          :Promise.resolve(null),
        candidate.needShort
          ?youtubeShortsMembership(candidate.id)
          :Promise.resolve(false)
      ]);

      // Keep the package path simple and bounded: exact video-ID search is the
      // duration source. If it cannot resolve a row, that row stays out of the
      // next package and is retried on a later scheduled refresh.
      const duration=Number(searchMeta?.duration)>0
        ?Number(searchMeta.duration)
        :candidate.duration||0;

      verificationMeta.set(candidate.id,{
        duration,
        isLive:searchMeta?.isLive===true,
        isShort:isShort===true,
        sourceName:validChannelDisplayName(searchMeta?.sourceName||""),
        sourceThumbnailUrl:clean(searchMeta?.sourceThumbnailUrl||"",1000),
        thumbnailUrl:clean(searchMeta?.thumbnailUrl||"",1000),
        views:Math.max(0,Number(searchMeta?.views)||0),
        durationCheckedAt:candidate.needDuration?checkedAt:0,
        shortCheckedAt:candidate.needShort?checkedAt:0
      });
      return true;
    });

    const verificationChangedChannels=new Set<string>();
    if(verificationMeta.size){
      for(const [channelId,items] of channelRows){
        let changed=false;
        const enriched=items.map((row:any)=>{
          const id=videoId(row);
          const meta=verificationMeta.get(id);
          if(!meta)return row;
          changed=true;
          const live=meta.isLive===true||isLive(row);
          const duration=live
            ?-1
            :(Number(meta.duration)>0?Number(meta.duration):durationSeconds(row));
          const sourceName=validChannelDisplayName(
            meta?.sourceName||row?._sourceName||row?.uploaderName||row?.uploader||""
          );
          const sourceThumbnailUrl=clean(
            meta?.sourceThumbnailUrl||row?._sourceThumbnailUrl||"",
            1000
          );
          const sourceMeta=channelMeta.get(channelId)||{id:channelId,name:"",thumbnailUrl:""};
          if(sourceName)sourceMeta.name=sourceName;
          if(sourceThumbnailUrl)sourceMeta.thumbnailUrl=sourceThumbnailUrl;
          if(sourceName||sourceThumbnailUrl)channelMeta.set(channelId,sourceMeta);

          return {
            ...row,
            duration:duration||0,
            isLive:live,
            isShort:meta.isShort===true||row?.isShort===true,
            _sourceName:sourceName||row?._sourceName||"",
            uploaderName:sourceName||row?.uploaderName||"",
            uploader:sourceName||row?.uploader||"",
            _sourceThumbnailUrl:sourceThumbnailUrl||row?._sourceThumbnailUrl||"",
            thumbnailUrl:clean(meta?.thumbnailUrl||row?.thumbnailUrl||row?.thumbnail||"",1000),
            thumbnail:clean(meta?.thumbnailUrl||row?.thumbnail||row?.thumbnailUrl||"",1000),
            views:Math.max(Number(row?.views)||0,Number(meta?.views)||0),
            _durationCheckedAt:meta.durationCheckedAt||Number(row?._durationCheckedAt)||0,
            _durationResolverVersion:meta.durationCheckedAt?3:(Number(row?._durationResolverVersion)||0),
            _shortCheckedAt:meta.shortCheckedAt||Number(row?._shortCheckedAt)||0
          };
        });
        if(changed){
          channelRows.set(channelId,enriched);
          verificationChangedChannels.add(channelId);
        }
      }
    }

    // Persist verification even for channels that were not otherwise due,
    // without changing their channel refresh cadence.
    for(const id of verificationChangedChannels){
      const items=channelRows.get(id)||[];
      const source=channelMeta.get(id)||{id,name:"",thumbnailUrl:""};
      const previous=cacheById.get(id)||{};
      const index=cacheWrites.findIndex((row:any)=>row.channel_id===id);
      const newest=items
        .map((row:any)=>({id:videoId(row),age:ageMs(row)}))
        .filter((row:any)=>row.id&&Number.isFinite(row.age)&&row.age>=0&&row.age<Number.MAX_SAFE_INTEGER)
        .sort((a:any,b:any)=>a.age-b.age)[0]||null;
      const cacheHash=fastHash(items.map((row:any)=>[
        videoId(row),
        clean(row?.title,300),
        publishedText(row),
        String(durationSeconds(row)||0),
        String(Number(row?._durationResolverVersion)||0),
        row?.isShort===true?"1":"0"
      ].join("|")).join("\n"));
      const existing=index>=0?cacheWrites[index]:null;
      const write={
        profile_key:PROFILE,
        channel_id:id,
        items,
        hash:cacheHash,
        newest_video_id:newest?.id||clean(previous?.newest_video_id,64),
        newest_uploaded_at:newest?new Date(Date.now()-newest.age).toISOString():(previous?.newest_uploaded_at||null),
        source_name:clean(source?.name||previous?.source_name||"",180),
        thumbnail_url:clean(source?.thumbnailUrl||previous?.thumbnail_url||"",1000),
        checked_at:existing?.checked_at||previous?.checked_at||new Date().toISOString(),
        last_success_at:existing?.last_success_at||previous?.last_success_at||null,
        last_error:existing?.last_error||previous?.last_error||"",
        retry_after:existing?.retry_after??previous?.retry_after??null,
        version:Date.now()*100+Math.max(0,index)
      };
      if(index>=0)cacheWrites[index]={...existing,...write};
      else cacheWrites.push(write);
    }

    const sourceMetaUpdates=[...channelMeta.values()].filter((source:any)=>
      /^UC[A-Za-z0-9_-]+$/.test(clean(source?.id,180))&&
      (validChannelDisplayName(source?.name)||clean(source?.thumbnailUrl,1000))
    );
    await mapLimit(sourceMetaUpdates,4,async(source:any)=>{
      const body:any={};
      const name=validChannelDisplayName(source?.name);
      const thumbnailUrl=clean(source?.thumbnailUrl,1000);
      if(name)body.name=name;
      if(thumbnailUrl)body.thumbnail_url=thumbnailUrl;
      if(!Object.keys(body).length)return true;
      await fetch(
        rest+"/yt1988_source_state?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&channel_id=eq."+encodeURIComponent(source.id),
        {
          method:"PATCH",
          headers:{...authHeaders,"prefer":"return=minimal"},
          body:JSON.stringify(body)
        }
      ).catch(()=>{});
      return true;
    });

    for(let start=0;start<cacheWrites.length;start+=20){
      const chunk=cacheWrites.slice(start,start+20);
      if(!chunk.length)continue;
      const writeRes=await fetch(
        rest+"/yt1988_channel_cache?on_conflict=profile_key,channel_id",
        {
          method:"POST",
          headers:{...authHeaders,"prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify(chunk)
        }
      );
      if(!writeRes.ok)console.warn("channel cache write failed",await writeRes.text());
    }

    const results:any[]=[];
    const degradedNotes:string[]=[];
    for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
      const scope=scopes[scopeIndex];
      const meta=SCOPE_META[scope]||{profile:"general",label:scope,kind:"content"};
      const selected=selectedByScope.get(scope)||[];
      const selectedIds=new Set(selected.map((s:any)=>s.id));
      const current=currentByScope.get(scope);

      if(meta.kind==="content"&&!selected.length){
        const sig="";
        const packaged:any[]=[];
        const hash=snapshotRowsHash(packaged,sig);
        const inputHash=fastHash(hash+"|"+NON_LIVE_PIPELINE_VERSION+":"+meta.kind+":no_sources");
        if(current?.hash===hash&&current?.input_hash===inputHash&&current?.source_signature===sig){
          results.push({scope,changed:false,reason:"no_selected_sources"});
          continue;
        }
        const version=Date.now()*100+scopeIndex;
        const rpc=await fetch(rest+"/rpc/yt1988_set_package",{
          method:"POST",
          headers:authHeaders,
          body:JSON.stringify({
            p_profile_key:PROFILE,
            p_scope:scope,
            p_hash:hash,
            p_input_hash:inputHash,
            p_source_signature:sig,
            p_items:packaged,
            p_version:version
          })
        });
        if(!rpc.ok)throw new Error("empty_package_write_failed:"+scope+":"+await rpc.text());
        results.push({scope,changed:true,items:0,reason:"no_selected_sources"});
        continue;
      }

      // Coverage is based on usable snapshots, not only requests from this run.
      // This is the key stale-while-revalidate guarantee: a temporary 429/503
      // reuses the previous good channel rows instead of deleting them.
      const usableChannels=selected.filter((s:any)=>(channelRows.get(s.id)||[]).length).length;
      const coverage=selected.length?usableChannels/selected.length:1;
      if(scope!=="live"&&selected.length&&coverage<.6){
        const reason="insufficient_channel_snapshots:"+usableChannels+"/"+selected.length;
        degradedNotes.push(scope+":"+reason);
        results.push({
          scope,
          changed:false,
          reason:"insufficient_channel_snapshots",
          usableChannels,
          selectedChannels:selected.length
        });
        continue;
      }

      const attempted=selected.filter((s:any)=>dueIds.includes(s.id)).length;
      const freshOk=selected.filter((s:any)=>channelFetchOk.has(s.id)).length;
      if(attempted>freshOk)degradedNotes.push(scope+":channel_errors="+(attempted-freshOk));

      let raw:any[]=[];

      for(const source of selected){
        const canonicalSource=channelMeta.get(source.id)||source;
        for(const row of channelRows.get(source.id)||[]){
          const normalized=normalizeRow(row,canonicalSource);
          if(normalized)raw.push(normalized);
        }
      }

      if(scope!=="live"){
        const relevantRows=raw.filter((r:any)=>{
          const age=ageMs(r);
          if(scope==="latest")return Number.isFinite(age)&&age>=0&&age<DAY_MS;
          if(scope==="week")return Number.isFinite(age)&&age>=DAY_MS&&age<7*DAY_MS;
          return Number.isFinite(age)&&age>=0&&age<7*DAY_MS;
        });
        const unresolved=relevantRows.filter((r:any)=>
          !isLive(r)&&
          !isTooShortVideo(r)&&
          (!Number(r?._shortCheckedAt)||durationSeconds(r)<=0)
        );
        if(unresolved.length){
          // Unknown rows are simply excluded from this package. Do not requeue
          // immediately: the normal server schedule will retry them, while the
          // last good package remains available to browsers.
          results.push({scope,verificationPending:unresolved.length});
        }

        raw=raw.filter((r:any)=>
          !isLive(r)&&
          !isTooShortVideo(r)&&
          Number(r?._shortCheckedAt)>0&&
          durationSeconds(r)>60&&
          !!validChannelDisplayName(r?._sourceName||r?.uploaderName||r?.uploader||"")&&
          !titleLooksEnglishOnly(r)
        );
      }else{
        raw=raw.filter((r:any)=>!titleLooksEnglishOnly(r));
      }
      if(meta.kind==="content")raw=raw.filter((r:any)=>!isBlockedMusicTabVideo(meta,r));

      if(scope==="live"){
        // LIVE is built only from candidates that were freshly verified above.
        // Never fall back to stale channel-cache live flags.
        raw=verifiedLiveRowsCache
          .filter((row:any)=>{
            const sid=channelId(row);
            return !sid||!allBlockedLiveSourceIds.has(sid);
          })
          .sort((a:any,b:any)=>
            (Number(b?._interestPriority)||0)-(Number(a?._interestPriority)||0)
          );
      }else if(scope==="latest"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<DAY_MS;
        });
      }else if(scope==="week"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=DAY_MS&&age<7*DAY_MS;
        });
      }else{
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<7*DAY_MS;
        });
      }

      if(meta.kind!=="live")raw=sortRows(raw);
      raw=dedupeRows(raw)
        .filter((r:any)=>meta.kind!=="content"||!strongAd(r));

      if(scope!=="live"&&selected.length&&raw.length===0&&Array.isArray(current?.items)&&current.items.length){
        degradedNotes.push(scope+":empty_candidate_kept_previous");
        results.push({scope,changed:false,reason:"empty_candidate_kept_previous",items:current.items.length});
        continue;
      }

      const sig=sourceSignature(rows,scope);
      const policyKey=(meta.kind==="live"?LIVE_PIPELINE_VERSION:NON_LIVE_PIPELINE_VERSION)+":"+meta.kind;
      const rawHash=snapshotRowsHash(raw,sig);
      const inputHash=fastHash(rawHash+"|"+policyKey);
      if(current?.input_hash===inputHash&&current?.source_signature===sig){
        await fetch(
          rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&scope=eq."+encodeURIComponent(scope),
          {
            method:"PATCH",
            headers:{...authHeaders,"prefer":"return=minimal"},
            body:JSON.stringify({updated_at:new Date().toISOString()})
          }
        ).catch(()=>{});
        results.push({scope,changed:false,checked:true,reason:"same_input"});
        continue;
      }

      // Package refresh must remain deterministic and fast. AI/topic cleanup is
      // intentionally kept out of this critical path; filtering/deduping above
      // is enough to publish fresh data without rate-limit stalls.
      let packaged=raw;

      packaged=dedupeRows(packaged);

      // Coverage above already prevents partial upstream failures from replacing
      // healthy data. Always publish the fully filtered current result so stale
      // Shorts/blocked/expired rows cannot survive indefinitely.

      const hash=snapshotRowsHash(packaged,sig);
      if(current?.hash===hash&&current?.input_hash===inputHash&&current?.source_signature===sig){
        await fetch(
          rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&scope=eq."+encodeURIComponent(scope),
          {
            method:"PATCH",
            headers:{...authHeaders,"prefer":"return=minimal"},
            body:JSON.stringify({updated_at:new Date().toISOString()})
          }
        ).catch(()=>{});
        results.push({scope,changed:false,checked:true,reason:"same_package"});
        continue;
      }

      const version=Date.now()*100+scopeIndex;
      const rpc=await fetch(rest+"/rpc/yt1988_set_package",{
        method:"POST",
        headers:authHeaders,
        body:JSON.stringify({
          p_profile_key:PROFILE,
          p_scope:scope,
          p_hash:hash,
          p_input_hash:inputHash,
          p_source_signature:sig,
          p_items:packaged,
          p_version:version
        })
      });
      if(!rpc.ok)throw new Error("package_write_failed:"+scope+":"+await rpc.text());
      results.push({scope,changed:true,items:packaged.length,hash});
    }

    const degraded=degradedNotes.length>0;
    ok=true;
    const pending=await finishLease(
      rest,
      authHeaders,
      !degraded,
      degraded?degradedNotes.slice(0,12).join(";"):""
    );
    if(pending.length)await queuePendingRefresh(rest,authHeaders,pending);
    return json({ok:true,degraded,pending_scopes:pending,scopes:results});
  }catch(error){
    failure=String((error as any)?.message||error||"refresh_failed");
    const pending=await finishLease(rest,authHeaders,false,failure);
    if(pending.length)await queuePendingRefresh(rest,authHeaders,pending);
    return json({ok:false,error:failure,pending_scopes:pending},500);
  }
});