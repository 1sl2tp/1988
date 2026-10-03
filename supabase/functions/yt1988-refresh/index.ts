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
const CHANNEL_PROFILE_TTL_MS=7*DAY_MS;
const CHANNEL_FAILURE_RETRY_MS=2*60*1000;
const MAX_CHANNEL_FETCHES_PER_RUN=12;
const MAX_SCOPES_PER_RUN=2;
const LIVE_PIPELINE_VERSION="live-v43";
const NON_LIVE_PIPELINE_VERSION="non-live-v20";
const EMBED_CHECK_TTL_MS=6*60*60*1000;
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
const LIVE_SELECTED_CANDIDATES_PER_SOURCE=2;
const LIVE_SELECTED_SOURCES_PER_RUN=32;
const LIVE_GLOBAL_DISCOVERY_INTERVAL_MS=10*60*1000;
const LIVE_SEARCH_QUERIES=[
  "trực tiếp ca nhạc",
  "trực tiếp bolero",
  "trực tiếp radio",
  "trực tiếp thể thao",
  "trực tiếp bóng đá",
  "trực tiếp thời sự",
  "trực tiếp tin tức",
  "trực tiếp game",
  "trực tiếp sự kiện",
  "trực tiếp 24/7"
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
function normalizeAvatarUrl(value:any){
  const raw=clean(value,1000);
  if(!raw)return "";
  try{
    const url=new URL(raw);
    const host=url.hostname.replace(/^www\./i,"").toLowerCase();
    const proxiedHost=String(url.searchParams.get("host")||"").replace(/^www\./i,"").toLowerCase();
    const isYoutubeAvatar=[
      "yt3.ggpht.com",
      "yt3.googleusercontent.com"
    ].includes(host)||[
      "yt3.ggpht.com",
      "yt3.googleusercontent.com"
    ].includes(proxiedHost);
    if(!isYoutubeAvatar)return raw;

    url.pathname=url.pathname.replace(/=s(\d+)(?=[-/?]|$)/i,(_m,size)=>{
      const n=Number(size)||0;
      return "=s"+Math.max(160,n);
    });
    return url.toString();
  }catch{
    return raw;
  }
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

function rowMatchesScopeAge(scope:string,row:any){
  const age=ageMs(row);
  if(!Number.isFinite(age)||age<0)return false;
  if(scope==="latest")return age<DAY_MS;
  if(scope==="week")return age>=DAY_MS&&age<7*DAY_MS;
  if(scope==="live")return isLive(row);
  return age<7*DAY_MS;
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

const VI_TITLE_WORDS_STRONG=new Set(
  [...VI_TITLE_WORDS].filter((token)=>!EN_TITLE_WORDS.has(token))
);

function titleLooksEnglishOnly(row:any){
  const raw=clean(row?._displayTitle||row?.title||"",500);
  if(!raw)return false;

  // A real Vietnamese letter/diacritic is authoritative. The old rule stripped
  // accents first, so Vietnamese "thể" became "the" and could make an English
  // title look Vietnamese.
  if(/[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/.test(raw)){
    return false;
  }

  const tokens=normalizeText(raw).split(" ").filter((token)=>token.length>1);
  if(!tokens.length)return false;

  let vi=0,en=0;
  for(const token of tokens){
    if(VI_TITLE_WORDS_STRONG.has(token))vi++;
    if(EN_TITLE_WORDS.has(token))en++;
  }

  if(vi>=2&&vi>=en)return false;
  if(en>=2&&en>=vi+1)return true;

  // This classifier is only used by system feeds (Live/Ngày/Tuần). A title
  // with no Vietnamese signal and 3+ Latin words is treated as English.
  if(vi===0&&tokens.length>=3)return true;
  if(vi===0&&tokens.length===2&&en>=1)return true;
  return false;
}

function titleLooksBroken(row:any){
  const raw=clean(row?._displayTitle||row?.title||"",500);
  if(!raw)return true;
  const identity=normalizeText(raw).replace(/\s+/g,"");
  if(!identity||identity.length<3)return true;
  return /^\d+$/.test(identity);
}

const LEGACY_BLOCKED_KEYWORDS=[
  "xo so","gia vang","thoi tiet","hoa lan","forex",
  "phat giao","su phu","sdt","lien he","zalo","ngoai te"
];

function expandBlockedKeywordRows(values:any[]){
  const out=new Map<string,string>();
  const add=(value:any)=>{
    const display=clean(value,120);
    const norm=normalizeText(display);
    if(!norm)return;
    if(!out.has(norm))out.set(norm,display);
  };

  for(const raw of Array.isArray(values)?values:[]){
    const display=clean(raw,600);
    if(!display)continue;
    const norm=normalizeText(display);

    // Legacy UI once saved a whole space-separated blacklist as one row.
    if(
      norm.includes("xo so gia vang thoi tiet hoa lan forex")&&
      norm.includes("sdt lien he zalo")
    ){
      for(const keyword of LEGACY_BLOCKED_KEYWORDS)add(keyword);
      continue;
    }

    const parts=display.split(/[,;|\n\r]+/u).map((v)=>clean(v,120)).filter(Boolean);
    if(parts.length>1){
      for(const part of parts)add(part);
    }else{
      add(display);
    }
  }
  return [...out.values()];
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
  // YouTube search providers are not consistent: some mark a current LIVE via
  // isLive=true, some via duration=-1, and others via uploaded=-1. Requiring
  // both numeric sentinels discarded many genuine streams.
  return isLive(row);
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
  const identity=normalizeText(name).replace(/\s+/g,"");
  if(!identity||identity.length<2||/^\d+$/.test(identity))return "";
  return name;
}


function compactTitleIdentity(value:any){
  return normalizeText(value||"").replace(/\s+/g,"");
}

function sourceTitleAliases(value:any){
  const raw=clean(value,180);
  const aliases=new Set<string>();
  if(!raw)return aliases;

  const add=(candidate:any)=>{
    const id=compactTitleIdentity(candidate);
    if(id.length>=2)aliases.add(id);
  };

  add(raw);

  const dashHead=raw.split(/\s+[-–—]\s+/u)[0]||"";
  if(dashHead&&dashHead!==raw)add(dashHead);

  // Channel names often add a generic brand suffix while the video title uses
  // only the actual brand (e.g. "60 Giây Official" -> "60 Giây").
  const debranded=raw
    .replace(/\s+(?:official|official\s+channel|channel|news|television|media)\s*$/iu,"")
    .trim();
  if(debranded&&debranded!==raw)add(debranded);

  // Parenthesized acronyms are commonly repeated as a title segment:
  // "Báo Điện tử Tiếng nói Việt Nam (VOV)" -> "VOV".
  const acronym=raw.match(/\(([A-Z0-9]{2,12})\)\s*$/u)?.[1]||"";
  if(acronym)add(acronym);

  const firstToken=raw.split(/\s+/u)[0]||"";
  if(/^[A-Z0-9]{3,12}$/.test(firstToken))add(firstToken);

  return aliases;
}

function sourceTitleSegmentMatches(segment:any,sourceName:any){
  const rawSegment=clean(segment,120);
  const id=compactTitleIdentity(rawSegment);
  if(!id)return false;

  const aliases=sourceTitleAliases(sourceName);
  if(aliases.has(id))return true;

  const firstToken=clean(sourceName,180).split(/\s+/u)[0]||"";
  const brand=compactTitleIdentity(firstToken);
  const compactRaw=rawSegment.replace(/[^A-Za-z0-9]/g,"");
  return !!brand&&brand.length>=3&&id.startsWith(brand)&&id.length<=20&&
    /^[A-Z0-9]{3,20}$/.test(compactRaw);
}

function cleanSourceTitle(value:any,sourceName:any){
  const original=clean(value,300);
  if(!original)return "";

  let title=original
    .replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/gu,"")
    .trim();

  if(sourceTitleSegmentMatches(title,sourceName))return "";

  const sourceNorm=normalizeText(sourceName);
  const titleNorm=normalizeText(title);
  if(sourceNorm&&titleNorm.startsWith(sourceNorm+" ")){
    const sourceWordCount=clean(sourceName,180).split(/\s+/u).filter(Boolean).length;
    const titleWords=title.split(/\s+/u);
    if(sourceWordCount>0&&titleWords.length>sourceWordCount){
      const candidate=clean(titleWords.slice(sourceWordCount).join(" "),300)
        .replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/gu,"")
        .trim();
      if(candidate.length>=3)title=candidate;
    }
  }

  // A generic suffix in the channel label should not force that suffix into
  // the video title. Strip the shorter brand only when it is the leading title
  // phrase, so names inside the actual subject are left intact.
  const sourceRaw=clean(sourceName,180);
  const debrandedSource=sourceRaw
    .replace(/\s+(?:official|official\s+channel|channel|news|television|media)\s*$/iu,"")
    .trim();
  if(debrandedSource&&debrandedSource!==sourceRaw){
    const sourceWords=debrandedSource.split(/\s+/u).filter(Boolean);
    const titleWords=title.split(/\s+/u);
    if(titleWords.length>sourceWords.length){
      const head=titleWords.slice(0,sourceWords.length).join(" ");
      if(sourceTitleSegmentMatches(head,sourceName)){
        const candidate=clean(titleWords.slice(sourceWords.length).join(" "),300)
          .replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/gu,"")
          .trim();
        if(candidate.length>=3)title=candidate;
      }
    }
  }

  for(let i=0;i<3;i++){
    const suffix=title.match(/^(.*?)(?:\s*[|•·]\s*|\s+[-–—]\s+)([^|•·]{1,120})$/u);
    if(!suffix||!sourceTitleSegmentMatches(suffix[2],sourceName))break;
    title=clean(suffix[1],300)
      .replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/gu,"")
      .trim();
  }

  const prefix=title.match(/^([^|:;–—]{2,120})\s*(?:\||:|[-–—])\s*(.+)$/u);
  if(prefix&&sourceTitleSegmentMatches(prefix[1],sourceName)){
    title=clean(prefix[2],300)
      .replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/gu,"")
      .trim();
  }

  return sourceTitleSegmentMatches(title,sourceName)?"":title;
}

function cleanLiveTitle(value:any){
  const original=clean(value,300);
  if(!original)return "";

  let title=original;
  // Strip only a leading LIVE/TRỰC TIẾP marker plus its surrounding decoration.
  // Do not remove emoji/symbols elsewhere in the actual title.
  const marker=/^(?:[^A-Za-zÀ-ỹ0-9]*)(?:(?:trực\s*tiếp)|(?:live\s*stream)|livestream|live)\b(?:[^A-Za-zÀ-ỹ0-9]*)/iu;
  for(let i=0;i<3;i++){
    const next=title.replace(marker,"").trim();
    if(!next||next===title)break;
    title=next;
  }

  return title||original;
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
  const sourceThumb=normalizeAvatarUrl(clean(
    source?.thumbnailUrl||
    row?._sourceThumbnailUrl||
    row?.uploaderThumbnailUrl||
    row?.channelThumbnailUrl||
    row?.uploaderAvatar||
    row?.channelAvatar||
    "",
    1000
  ));
  const live=isLive(row);
  const rawTitle=clean(row?._displayTitle||row?.title||"",300);
  const sourceCleanTitle=cleanSourceTitle(rawTitle,sname);
  const normalizedTitle=live?cleanLiveTitle(sourceCleanTitle):sourceCleanTitle;
  return {
    ...row,
    id,
    videoId:id,
    title:normalizedTitle,
    _displayTitle:normalizedTitle,
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
    const th=title.length>=8?fastHash(title):"";
    if(th&&titleHashes.has(th))continue;
    ids.add(id);
    if(th)titleHashes.add(th);
    out.push(row);
  }
  return out;
}

const PACKAGE_DEDUPE_STOPWORDS=new Set(
  "official video clip full news tin tuc moi nhat review phim movie recap trailer vietsub thuyet minh".split(" ")
);

function packageEpisodeKey(value:any){
  const text=normalizeText(value||"");
  const match=text.match(/\b(?:tap|ep|episode|phan|part)\s*0*(\d{1,4})\b/);
  return match?String(Number(match[1])):"";
}

function packageMetadataSegment(value:any){
  const norm=normalizeText(value||"");
  if(!norm)return true;
  return /^(?:ban tin|tin tuc|tin quoc te|cum tin|an ninh toan canh|cu dan mang|hanh trinh pha an|tieu diem|cap nhat nong|net zero|sao 24h)(?:\b|$)/.test(norm)||
    /^(?:phan|tap|ep|episode|part)\s*\d{1,4}\b/.test(norm);
}

function packageCoreTitle(row:any){
  let raw=clean(row?._displayTitle||row?.title||"",500)
    .replace(/(?:#[\p{L}\p{N}_-]+\s*)+$/gu," ");

  const parts=raw
    .split(/\s*[|•▪►▶◆◇]\s*/u)
    .map((part)=>clean(part,300))
    .filter(Boolean);

  if(parts.length>1){
    const kept=parts.filter((part,index)=>index===0||!packageMetadataSegment(part));
    if(kept.length)raw=kept.join(" ");
  }

  raw=raw
    .replace(/\b(?:ngày\s+)?\d{1,2}\s*[-–—]\s*\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/giu," ")
    .replace(/\b(?:ngày|sáng|trưa|chiều|tối)?\s*\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/giu," ")
    .replace(/\b(?:hôm nay|ngày mai|sáng nay|trưa nay|chiều nay|tối nay)\b/giu," ")
    .replace(/[“”"…]+/gu," ");

  return normalizeText(raw);
}

function packageSemanticTokens(row:any){
  const raw=clean(row?._displayTitle||row?.title||"",500);
  const core=packageCoreTitle(row);
  const tokens=core
    .split(" ")
    .filter((token)=>token.length>=2&&!PACKAGE_DEDUPE_STOPWORDS.has(token));
  return {
    core,
    source:channelId(row),
    episode:packageEpisodeKey(raw),
    tokens:[...new Set(tokens)]
  };
}

function packageTokenOverlap(a:string[],b:string[]){
  if(!a.length||!b.length)return {common:0,maxRatio:0,minRatio:0};
  const bSet=new Set(b);
  let common=0;
  for(const token of a)if(bSet.has(token))common++;
  return {
    common,
    maxRatio:common/Math.max(a.length,b.length),
    minRatio:common/Math.min(a.length,b.length)
  };
}

function dedupePackageRows(rows:any[]){
  const exact=dedupeRows(rows);
  const out:any[]=[];
  const signatures:any[]=[];

  for(const row of exact){
    const sig=packageSemanticTokens(row);
    let duplicate=false;

    if(sig.tokens.length>=2){
      for(const prior of signatures){
        if(sig.episode&&prior.episode&&sig.episode!==prior.episode)continue;
        if((sig.episode&&!prior.episode)||(!sig.episode&&prior.episode))continue;

        const sameSource=!!sig.source&&sig.source===prior.source;
        if(sig.core&&sig.core===prior.core){
          if(
            (sameSource&&sig.tokens.length>=2&&prior.tokens.length>=2)||
            (sig.tokens.length>=4&&prior.tokens.length>=4)
          ){
            duplicate=true;
            break;
          }
        }

        if(sig.tokens.length>=4&&prior.tokens.length>=4){
          const overlap=packageTokenOverlap(sig.tokens,prior.tokens);
          if(
            sameSource&&
            overlap.common>=3&&
            overlap.maxRatio>=.72&&
            overlap.minRatio>=.82
          ){
            duplicate=true;
            break;
          }
          if(
            overlap.common>=5&&
            overlap.maxRatio>=.78&&
            overlap.minRatio>=.86
          ){
            duplicate=true;
            break;
          }
        }
      }
    }

    if(duplicate)continue;
    out.push(row);
    signatures.push(sig);
  }
  return out;
}
function obviousNonNewsForNewsScope(row:any){
  const raw=clean(row?._displayTitle||row?.title||"",400);
  const norm=normalizeText(raw);
  if(!norm)return true;

  if(/\b(?:karaoke|kara|beat|official audio|lyric video|music video|mv official|trailer|teaser|full phim|review phim|tom tat phim|gameplay)\b/.test(norm))return true;
  if(/\b(?:mon ngon|my vi viet nam)\b/.test(norm))return true;

  return /\b(?:truc tiep|live|livestream)\b/.test(norm)&&
    /\b(?:concert|dai nhac hoi|ca nhac|bai ca|liveshow)\b/.test(norm);
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

  // In the Review tab the category is already known, so repeated labels such
  // as "Review" / "[Review Phim]" add no information to the card title.
  const title=original
    .replace(/https?:\/\/\S+|www\.\S+/giu," ")
    .replace(/(?:#[\p{L}\p{N}_-]+\s*)+$/gu," ")
    .replace(/[\[(]?\s*(?:review\s*phim|phim\s*review|review)\s*[\])]?\s*[:|\-–—]*\s*/giu," ")
    .replace(/([!?.,])\1{1,}/g,"$1")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/g,"")
    .trim();

  return title.length>=6?title:original;
}

function kidCleanTitle(value:any){
  const original=clean(value,300);
  if(!original)return "";

  // "Phim hoạt hình HAY NHẤT 2026" is a repeated channel template, not the
  // episode/story name. Keep the actual story title that follows it.
  const title=original
    .replace(
      /^\s*phim\s*hoạt\s*hình\s*hay\s*nhất(?:\s*\d{4})?\s*[:|\-–—]*\s*/iu,
      ""
    )
    .replace(/\s{2,}/g," ")
    .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/g,"")
    .trim();

  return title.length>=6?title:original;
}

function staticContentDisplayTitle(value:any,meta:any={}){
  const original=clean(value,300);
  if(!original)return "";
  const label=normalizeText(meta?.label||"");
  if(label==="review")return reviewCleanTitle(original);
  if(label==="kid")return kidCleanTitle(original);
  return original;
}

function withStaticContentDisplayTitle(row:any,meta:any={}){
  const current=clean(row?._displayTitle||row?.title||"",300);
  const displayTitle=staticContentDisplayTitle(current,meta);
  return displayTitle&&displayTitle!==current
    ?{...row,_displayTitle:displayTitle}
    :row;
}

function displayTitleSegments(value:any){
  const title=clean(value,300);
  if(!title)return [];
  return title
    .split(/\s+(?:[-–—|•▪►▶◆◇])\s+/u)
    .map((part)=>clean(part,140)
      .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/gu,"")
      .trim())
    .filter(Boolean);
}

function displayBoilerplateKey(value:any){
  return normalizeText(value)
    .replace(/\b(?:19|20)\d{2}\b/g,"year")
    .replace(/\s+/g," ")
    .trim();
}

function displaySegmentProtected(value:any){
  const raw=clean(value,140);
  const norm=normalizeText(raw);
  if(!norm)return true;

  // Episode/season numbers are discriminative data, not decoration.
  if(/\b(?:tap|ep|episode|phan|part|mua|season)\s*\d{1,4}\b/.test(norm))return true;
  if(/(?:^|\s)#\s*\d{1,4}(?:\s|$)/u.test(raw))return true;

  // A segment that is only a date should never be learned as boilerplate.
  if(/^\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?$/.test(raw))return true;
  return false;
}

function displaySegmentLooksGeneric(value:any){
  const norm=normalizeText(value);
  if(!norm)return false;
  return (
    /\b(?:review|tom tat phim|movie recap|phim hoat hinh|hoat hinh long tieng)\b/.test(norm)||
    /\b(?:phim hai|hai tet|sitcom hai|phim hay|hay nhat|moi nhat)\b/.test(norm)||
    /\b(?:tin giai tri|tinh huong hai huoc|truc tiep)\b/.test(norm)||
    /\b(?:official visualizer|official music video|official audio|official beat)\b/.test(norm)||
    /\b(?:gap nhau cuoi tuan|truyen co tich viet nam)\b/.test(norm)||
    /^hai\s+.+\syear$/.test(displayBoilerplateKey(value))
  );
}

function displaySegmentLooksLikeSource(value:any,sourceName:any){
  const segment=clean(value,140);
  const source=clean(sourceName,180);
  if(!segment||!source)return false;
  if(sourceTitleSegmentMatches(segment,source))return true;

  const seg=normalizeText(segment);
  const src=normalizeText(source)
    .replace(/\b(?:official|channel|news|television|media)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
  if(!seg||!src)return false;
  const words=seg.split(" ").filter(Boolean);
  if(words.length<2||seg.length<5)return false;
  return seg===src||src.startsWith(seg+" ")||seg.startsWith(src+" ");
}

function meaningfulDisplayRemainder(value:any){
  const norm=normalizeText(value);
  if(norm.length<4)return false;
  if(/^(?:tap|ep|episode|phan|part|mua|season)\s*\d{1,4}$/.test(norm))return false;
  return /[a-z0-9]/.test(norm);
}

function inferDisplayBoilerplate(referenceRows:any[],meta:any={}){
  const bySource=new Map<string,any>();

  for(const sourceRow of Array.isArray(referenceRows)?referenceRows:[]){
    const row=withStaticContentDisplayTitle(sourceRow,meta);
    const sid=channelId(row);
    const title=clean(row?._displayTitle||row?.title||"",300);
    if(!sid||!title)continue;

    let group=bySource.get(sid);
    if(!group){
      group={
        total:0,
        sourceName:clean(row?._sourceName||row?.uploaderName||row?.uploader||"",180),
        counts:new Map<string,any>()
      };
      bySource.set(sid,group);
    }
    group.total++;

    const segments=displayTitleSegments(title);
    if(segments.length<2)continue;

    const seen=new Set<string>();
    for(const segment of segments){
      if(displaySegmentProtected(segment))continue;
      const key=displayBoilerplateKey(segment);
      if(!key||seen.has(key))continue;
      seen.add(key);

      const stat=group.counts.get(key)||{hits:0,sample:segment};
      stat.hits++;
      group.counts.set(key,stat);
    }
  }

  const learned=new Map<string,Set<string>>();
  for(const [sid,group] of bySource){
    const rules=new Set<string>();
    const total=Math.max(1,Number(group.total)||0);
    for(const [key,stat] of group.counts){
      const hits=Number(stat?.hits)||0;
      const ratio=hits/total;
      const sample=clean(stat?.sample||"",140);
      const words=key.split(" ").filter((word:string)=>word&&word!=="year");

      const sourceLike=displaySegmentLooksLikeSource(sample,group.sourceName);
      const generic=displaySegmentLooksGeneric(sample);
      const statisticallyStrong=hits>=5&&ratio>=.85&&words.length>=3;

      if(
        (sourceLike&&hits>=2&&ratio>=.15)||
        (generic&&hits>=3&&ratio>=.30)||
        statisticallyStrong
      ){
        rules.add(key);
      }
    }
    if(rules.size)learned.set(sid,rules);
  }
  return learned;
}

function cleanRepeatedDisplayBoilerplate(rows:any[],referenceRows:any[],meta:any={}){
  const learned=inferDisplayBoilerplate(referenceRows,meta);
  if(!learned.size)return (Array.isArray(rows)?rows:[]).map((row:any)=>
    withStaticContentDisplayTitle(row,meta)
  );

  return (Array.isArray(rows)?rows:[]).map((sourceRow:any)=>{
    const row=withStaticContentDisplayTitle(sourceRow,meta);
    const sid=channelId(row);
    const rules=learned.get(sid);
    if(!rules?.size)return row;

    const current=clean(row?._displayTitle||row?.title||"",300);
    const segments=displayTitleSegments(current);
    if(segments.length<2)return row;

    const kept:string[]=[];
    let removed=0;
    for(const segment of segments){
      const key=displayBoilerplateKey(segment);
      if(rules.has(key)&&!displaySegmentProtected(segment)){
        removed++;
        continue;
      }
      kept.push(segment);
    }

    if(!removed||!kept.length)return row;
    const next=clean(kept.join(" - "),300);
    if(!meaningfulDisplayRemainder(next))return row;

    // Display cleanup never changes the underlying title/video identity.
    return {...row,_displayTitle:next};
  });
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
    String(durationSeconds(row)||0),
    String(Number(row?.aspectRatio)||0),
    clean(row?.mediaKind||"",24),
    String(Number(row?.videoWidth)||0),
    String(Number(row?.videoHeight)||0),
    row?._aspectVerified===true?"1":"0"
  ].join("|")).join("\n");
  return fastHash(String(sourceSig||"")+"\n"+body);
}

function snapshotRowsIdentityHash(rows:any[],sourceSig=""){
  // Identity drives whether a new package is necessary. Views and relative
  // published labels are intentionally excluded because they change naturally
  // without representing new content.
  const body=rows.map((row)=>[
    videoId(row),
    clean(row?._displayTitle||row?.title||"",300),
    clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180),
    clean(row?._sourceName||row?.uploaderName||row?.uploader||"",180),
    clean(row?.thumbnailUrl||row?.thumbnail||"",1000),
    clean(row?._sourceThumbnailUrl||row?.uploaderThumbnailUrl||row?.channelThumbnailUrl||"",1000),
    isLive(row)?"1":"0",
    String(durationSeconds(row)||0),
    String(Number(row?.aspectRatio)||0),
    clean(row?.mediaKind||"",24),
    String(Number(row?.videoWidth)||0),
    String(Number(row?.videoHeight)||0),
    row?._aspectVerified===true?"1":"0"
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
async function enrichRowsWithStoredVideoMeta(
  rest:string,
  authHeaders:any,
  rows:any[]
){
  const input=Array.isArray(rows)?rows:[];
  const ids=[...new Set(
    input.map((row:any)=>videoId(row))
      .filter((id:string)=>/^[A-Za-z0-9_-]{11}$/.test(id))
  )];
  if(!ids.length)return input;

  const metaById=new Map<string,any>();

  for(let start=0;start<ids.length;start+=80){
    const batch=ids.slice(start,start+80);
    const res=await fetch(
      rest+"/yt1988_video_meta?verified=eq.true&video_id=in.("+
        batch.map(encodeURIComponent).join(",")+
        ")&select=video_id,aspect_ratio,media_kind,width,height,source,verified",
      {headers:authHeaders}
    ).catch(()=>null);

    if(!res||!res.ok)continue;
    const values=await res.json().catch(()=>[]);
    for(const meta of Array.isArray(values)?values:[]){
      const id=clean(meta?.video_id,32);
      const ratio=Number(meta?.aspect_ratio)||0;
      if(
        !/^[A-Za-z0-9_-]{11}$/.test(id)||
        !Number.isFinite(ratio)||
        ratio<.34||
        ratio>2.6
      )continue;
      metaById.set(id,meta);
    }
  }

  if(!metaById.size)return input;

  return input.map((row:any)=>{
    const meta=metaById.get(videoId(row));
    if(!meta)return row;

    const ratio=Number(meta?.aspect_ratio)||0;
    const width=Math.max(0,Math.round(Number(meta?.width)||0));
    const height=Math.max(0,Math.round(Number(meta?.height)||0));
    const kind=clean(meta?.media_kind,24)||
      (ratio<1?"portrait":"landscape");

    return {
      ...row,
      aspectRatio:ratio,
      mediaKind:kind,
      videoWidth:width,
      videoHeight:height,
      _aspectVerified:true,
      _aspectSource:clean(meta?.source||"server-video-meta",80)
    };
  });
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

function nonLiveSuggestionAgeAllowed(scope:string,row:any){
  const age=ageMs(row);
  if(!Number.isFinite(age)||age<0||age===Number.MAX_SAFE_INTEGER)return false;
  if(scope==="latest")return age<DAY_MS;
  if(scope==="week")return age>=DAY_MS&&age<7*DAY_MS;
  return age<7*DAY_MS;
}

function nonLiveSuggestionBaseAllowed(scope:string,meta:any,row:any){
  if(!row||isLive(row)||isTooShortVideo(row))return false;
  if(!nonLiveSuggestionAgeAllowed(scope,row))return false;
  if(strongAd(row))return false;
  if(isBlockedMusicTabVideo(meta,row))return false;
  return true;
}

function sourceSuggestionCandidate(row:any){
  const id=channelId(row);
  const name=[
    row?._sourceName,
    row?.uploaderName,
    row?.uploader,
    row?.channelName,
    row?.name
  ].map(validChannelDisplayName).find(Boolean)||"";
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!name)return null;
  return {
    id,
    name,
    thumbnailUrl:clean(
      row?._sourceThumbnailUrl||
      row?.uploaderThumbnailUrl||
      row?.channelThumbnailUrl||
      row?.uploaderAvatar||
      row?.channelAvatar||
      row?.thumbnailUrl||
      row?.thumbnail||
      "",
      1000
    )
  };
}

async function storeServerSourceSuggestions(
  rest:string,
  authHeaders:any,
  scope:string,
  candidates:any[]
){
  if(!validScopeSyntax(scope))return 0;

  const byId=new Map<string,any>();
  for(const row of candidates){
    const candidate=sourceSuggestionCandidate(row);
    if(!candidate||byId.has(candidate.id))continue;
    byId.set(candidate.id,candidate);
    if(byId.size>=16)break;
  }

  // Suggestions are now a server-owned snapshot, not rolling browser/server
  // history. Manual selected/blocked rows are untouched.
  const clearRes=await fetch(
    rest+"/yt1988_source_state?profile_key=eq."+encodeURIComponent(PROFILE)+
    "&scope=eq."+encodeURIComponent(scope)+
    "&status=eq.normal",
    {method:"DELETE",headers:authHeaders}
  ).catch(()=>null);
  if(clearRes&&!clearRes.ok){
    console.warn("source suggestion clear failed",scope,await clearRes.text());
    return 0;
  }

  if(!byId.size)return 0;

  const nowIso=new Date().toISOString();
  const payload=[...byId.values()].map((candidate,index)=>({
    profile_key:PROFILE,
    scope,
    channel_id:candidate.id,
    status:"normal",
    name:candidate.name,
    thumbnail_url:candidate.thumbnailUrl,
    subscribers:"",
    version:Date.now()*100+index,
    updated_at:nowIso
  }));

  const writeRes=await fetch(
    rest+"/yt1988_source_state?on_conflict=profile_key,scope,channel_id",
    {
      method:"POST",
      headers:{...authHeaders,"prefer":"resolution=ignore-duplicates,return=minimal"},
      body:JSON.stringify(payload)
    }
  );
  if(!writeRes.ok){
    console.warn("source suggestion write failed",scope,await writeRes.text());
    return 0;
  }
  return payload.length;
}

async function discoverServerSourceSuggestions(
  supabaseUrl:string,
  serviceKey:string,
  rest:string,
  authHeaders:any,
  scope:string,
  meta:any,
  seedRows:any[],
  excludedSourceIds:Set<string>
){
  const seeds=dedupeRows(seedRows)
    .filter((row:any)=>nonLiveSuggestionBaseAllowed(scope,meta,row))
    .sort((a:any,b:any)=>ageMs(a)-ageMs(b))
    .slice(0,3);

  // No valid seed means there is no new trustworthy suggestion snapshot.
  if(!seeds.length)return 0;

  const rawCandidates:any[]=[];
  await mapLimit(seeds,3,async(seed:any)=>{
    const query=clean(seed?._displayTitle||seed?.title||"",140);
    if(!query)return false;

    try{
      const result=await fetchJson(
        supabaseUrl+"/functions/v1/yt1988?action=search&q="+
          encodeURIComponent(query)+"&filter=videos",
        {
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },
        5000
      );

      for(const item of Array.isArray(result?.data?.items)?result.data.items:[]){
        const row=normalizeRow(item,{});
        if(!row||!nonLiveSuggestionBaseAllowed(scope,meta,row))continue;

        const candidate=sourceSuggestionCandidate(row);
        if(!candidate||excludedSourceIds.has(candidate.id))continue;

        rawCandidates.push(row);
        if(rawCandidates.length>=24)break;
      }
    }catch(error){
      console.warn("source suggestion search failed",scope,String(error));
    }
    return true;
  });

  const deduped=dedupeRows(rawCandidates).slice(0,18);
  const verified:any[]=[];

  // Search rows can omit duration / Shorts metadata. Verify every candidate
  // video before its channel is allowed into a non-live suggestion snapshot.
  await mapLimit(deduped,5,async(row:any)=>{
    const id=videoId(row);
    if(!id)return false;

    let duration=durationSeconds(row);
    let live=isLive(row);

    const [player,embed]=await Promise.all([
      duration<=0
        ?youtubePlayerMetadata(id).catch(()=>({duration:0,isLive:false}))
        :Promise.resolve(null),
      youtubeEmbedPlayback(id).catch(()=>({playable:null,definitive:false,status:"PROBE_ERROR",reason:""}))
    ]);

    if(duration<=0){
      duration=Number(player?.duration)||0;
      live=player?.isLive===true;
    }
    if(live||duration<=60||embed?.playable!==true)return false;

    const short=await youtubeShortsMembership(id).catch(()=>false);
    if(short)return false;

    const checked={
      ...row,
      duration,
      isLive:false,
      isShort:false
    };
    if(!nonLiveSuggestionBaseAllowed(scope,meta,checked))return false;

    const candidate=sourceSuggestionCandidate(checked);
    if(!candidate||excludedSourceIds.has(candidate.id))return false;

    verified.push(checked);
    return true;
  });

  // Prefer newest videos, then higher-viewed evidence, and only one row/channel.
  verified.sort((a,b)=>{
    const aa=ageMs(a),bb=ageMs(b);
    if(aa!==bb)return aa-bb;
    return (Number(b?.views)||0)-(Number(a?.views)||0);
  });

  const channelSeen=new Set<string>();
  const finalRows=verified.filter((row:any)=>{
    const sid=channelId(row);
    if(!sid||channelSeen.has(sid))return false;
    channelSeen.add(sid);
    return true;
  }).slice(0,16);

  return await storeServerSourceSuggestions(
    rest,
    authHeaders,
    scope,
    finalRows
  );
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
  const details=data?.videoDetails||{};
  const liveDetails=data?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails||{};
  const isLiveContent=details?.isLiveContent===true||!!liveDetails?.startTimestamp;
  const ended=!!liveDetails?.endTimestamp&&liveDetails?.isLiveNow!==true;

  // isLiveContent stays true on archived/ended livestreams. Only current-live
  // signals may keep a row in the LIVE package.
  let live=details?.isLive===true||liveDetails?.isLiveNow===true;

  // Some player clients omit isLive/isLiveNow but expose the current viewing
  // mode in service tracking. Never use this fallback after an end timestamp.
  if(!live&&!ended){
    const tracking=Array.isArray(data?.responseContext?.serviceTrackingParams)
      ?data.responseContext.serviceTrackingParams
      :[];
    for(const service of tracking){
      for(const param of Array.isArray(service?.params)?service.params:[]){
        if(param?.key==="is_viewed_live"&&String(param?.value||"").toLowerCase()==="true"){
          live=true;
          break;
        }
      }
      if(live)break;
    }
  }

  const duration=parseDurationValue(details?.lengthSeconds);
  return {
    duration:live?-1:duration,
    isLive:live,
    isLiveContent,
    ended
  };
}

function youtubePlayerReasonText(value:any):string{
  if(value==null)return "";
  if(typeof value==="string"||typeof value==="number")return clean(value,500);
  if(Array.isArray(value))return clean(value.map(youtubePlayerReasonText).filter(Boolean).join(" "),500);
  if(typeof value==="object"){
    const direct=clean(value?.simpleText||value?.text||"",500);
    if(direct)return direct;
    if(Array.isArray(value?.runs)){
      return clean(value.runs.map((run:any)=>run?.text||"").join(" "),500);
    }
  }
  return "";
}

function youtubeEmbedPlaybackFromResponse(data:any){
  const play=data?.playabilityStatus||{};
  const details=data?.videoDetails||{};
  const micro=data?.microformat?.playerMicroformatRenderer||{};
  const status=clean(play?.status||"",80).toUpperCase();
  const reason=clean([
    youtubePlayerReasonText(play?.reason),
    youtubePlayerReasonText(play?.messages),
    youtubePlayerReasonText(play?.errorScreen?.playerErrorMessageRenderer?.reason),
    youtubePlayerReasonText(play?.errorScreen?.playerErrorMessageRenderer?.subreason)
  ].filter(Boolean).join(" · "),900);
  const reasonNorm=reason.toLowerCase();

  const booleans=[
    play?.embeddable,
    play?.playableInEmbed,
    details?.isEmbeddable,
    details?.is_embeddable,
    micro?.isEmbeddable,
    micro?.is_embeddable
  ].filter((value:any)=>typeof value==="boolean");
  const embeddable=booleans.length?booleans[0]:null;

  if(embeddable===false){
    return {playable:false,definitive:true,status:status||"UNPLAYABLE",reason:reason||"embed_disabled"};
  }

  if(
    /other\s+(?:web)?sites?|embedding|embed(?:ding)?\s+(?:has\s+been\s+)?disabled|playback\s+on\s+other|watch\s+(?:this\s+)?video\s+on\s+youtube|xem\s+trên\s+youtube/i.test(reason)
  ){
    return {playable:false,definitive:true,status:status||"UNPLAYABLE",reason};
  }

  if(
    /private\s+video|video\s+is\s+private|video\s+unavailable|not\s+available|has\s+been\s+removed|deleted\s+video|members?[- ]only|video\s+riêng\s+tư|video\s+không\s+khả\s+dụng|đã\s+bị\s+xóa|không\s+có\s+sẵn/i.test(reason)
  ){
    return {playable:false,definitive:true,status:status||"UNPLAYABLE",reason};
  }

  if(status==="OK"){
    return {playable:true,definitive:true,status,reason};
  }

  if(/bot|confirm\s+you(?:'re| are)\s+not/i.test(reasonNorm)){
    return {playable:null,definitive:false,status,reason};
  }

  if([
    "UNPLAYABLE","ERROR","AGE_CHECK_REQUIRED","CONTENT_CHECK_REQUIRED",
    "LOGIN_REQUIRED","LIVE_STREAM_OFFLINE"
  ].includes(status)){
    return {playable:false,definitive:true,status,reason};
  }

  return {playable:null,definitive:false,status,reason};
}

async function youtubeOEmbedPlayback(id:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)){
    return {playable:null,definitive:false,status:"INVALID_ID",reason:""};
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3200);
  try{
    const url=new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url","https://www.youtube.com/watch?v="+id);
    url.searchParams.set("format","json");

    const res=await fetch(url.toString(),{
      method:"GET",
      signal:controller.signal,
      cache:"no-store",
      headers:{
        "accept":"application/json,text/plain,*/*",
        "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
      }
    });

    if(res.ok){
      try{await res.body?.cancel()}catch{}
      return {playable:true,definitive:true,status:"OEMBED_OK",reason:""};
    }

    // YouTube returns 401 for the observed "owner disabled playback on other
    // websites" case, and 404 for removed/unavailable IDs.
    if(res.status===401||res.status===404){
      return {
        playable:false,
        definitive:true,
        status:"OEMBED_"+res.status,
        reason:""
      };
    }

    return {
      playable:null,
      definitive:false,
      status:"OEMBED_HTTP_"+res.status,
      reason:""
    };
  }catch(error){
    return {
      playable:null,
      definitive:false,
      status:"OEMBED_ERROR",
      reason:clean((error as any)?.message||error||"",500)
    };
  }finally{
    clearTimeout(timer);
  }
}

async function youtubeEmbedPlayback(id:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)){
    return {playable:null,definitive:false,status:"INVALID_ID",reason:""};
  }

  // Prefer the simple public oEmbed check. It is much cheaper and has proven
  // reliable for the blocked row seen in the feed.
  const oembed=await youtubeOEmbedPlayback(id);
  if(oembed?.definitive===true)return oembed;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3200);
  try{
    const client:any={
      clientName:"WEB_EMBEDDED_PLAYER",
      clientVersion:YT_WEB_PLAYER_CLIENT_VERSION,
      clientScreen:"EMBED",
      hl:"vi",
      gl:"VN"
    };
    const res=await fetch(
      "https://www.youtube.com/youtubei/v1/player?key="+
        encodeURIComponent(YT_WEB_PLAYER_API_KEY),
      {
        method:"POST",
        signal:controller.signal,
        cache:"no-store",
        headers:{
          "content-type":"application/json",
          "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36",
          "origin":"https://www.youtube.com",
          "referer":"https://www.youtube.com/"
        },
        body:JSON.stringify({
          context:{
            client,
            thirdParty:{embedUrl:"https://yt.taphoa.xyz/"}
          },
          videoId:id
        })
      }
    );
    if(!res.ok){
      return {
        playable:null,
        definitive:false,
        status:"HTTP_"+res.status,
        reason:""
      };
    }
    const data=await res.json().catch(()=>null);
    const parsed=youtubeEmbedPlaybackFromResponse(data);
    if(parsed?.definitive===true)return parsed;

    // Do not turn an infrastructure/probe failure into "video blocked".
    return {
      playable:null,
      definitive:false,
      status:clean(parsed?.status||oembed?.status||"PROBE_UNKNOWN",80),
      reason:clean(parsed?.reason||oembed?.reason||"",500)
    };
  }catch(error){
    return {
      playable:null,
      definitive:false,
      status:"PROBE_ERROR",
      reason:clean((error as any)?.message||error||"",500)
    };
  }finally{
    clearTimeout(timer);
  }
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

async function youtubeChannelLiveVideoId(channel:string,timeout=3200){
  const id=clean(channel,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return "";

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const probe=await fetch(
      "https://www.youtube.com/channel/"+encodeURIComponent(id)+"/live?hl=vi&gl=VN",
      {
        method:"GET",
        signal:controller.signal,
        cache:"no-store",
        redirect:"follow",
        headers:{
          "accept":"text/html,application/xhtml+xml",
          "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
          "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
        }
      }
    );
    if(!probe.ok)return "";
    const finalUrl=String(probe.url||"");
    try{await probe.body?.cancel();}catch{}
    return finalUrl.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||"";
  }catch{
    return "";
  }finally{
    clearTimeout(timer);
  }
}

async function verifyCurrentLiveRows(rows:any[],limit=36){
  const list=dedupeRows(Array.isArray(rows)?rows:[]).slice(0,Math.max(1,limit));
  if(!list.length)return [];

  const checked=await mapLimit(list,8,async(row)=>{
    const id=videoId(row);
    const sid=channelId(row);
    if(!id||!sid)return null;

    // The canonical channel /live redirect must point at this exact video.
    // Search/provider "isLive" flags are only discovery hints.
    const currentId=await youtubeChannelLiveVideoId(sid,3200);
    if(currentId!==id)return null;

    // LIVE uses the same single YouTube embed engine as every other feed.
    // If YouTube does not confirm embedded playback, do not publish it.
    const embed=await youtubeEmbedPlayback(id);
    if(embed?.playable!==true)return null;

    return normalizeRow({
      ...row,
      id,
      videoId:id,
      isLive:true,
      duration:-1,
      uploaded:-1,
      publishedText:"Đang trực tiếp",
      _liveVerified:"channel_live_redirect"
    },{});
  });

  return checked.filter(Boolean);
}

async function verifyCurrentLiveFingerprintRows(rows:any[],limit=24){
  const list=dedupeRows(Array.isArray(rows)?rows:[]).slice(0,Math.max(1,limit));
  if(!list.length)return [];

  const checked=await mapLimit(list,6,async(row)=>{
    const id=videoId(row);
    const sid=channelId(row);
    if(!id||!sid)return null;
    const currentId=await youtubeChannelLiveVideoId(sid,2800);
    if(currentId!==id)return null;
    return normalizeRow({
      ...row,
      id,
      videoId:id,
      isLive:true,
      duration:-1,
      uploaded:-1,
      publishedText:"Đang trực tiếp",
      _liveVerified:"channel_live_fingerprint"
    },{});
  });
  return checked.filter(Boolean);
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
    sourceThumbnailUrl:normalizeAvatarUrl(clean(
      row?.uploaderAvatar||row?.uploaderThumbnailUrl||row?.channelThumbnailUrl||"",
      1000
    )),
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

async function youtubeChannelVideoFingerprint(channelId:string){
  const id=clean(channelId,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id)){
    return {known:false,videoId:"",publishedAt:"",source:"invalid-channel"};
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const res=await fetch(
      "https://www.youtube.com/feeds/videos.xml?channel_id="+encodeURIComponent(id),
      {
        method:"GET",
        signal:controller.signal,
        cache:"no-store",
        headers:{
          "accept":"application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.1",
          "accept-language":"vi-VN,vi;q=0.9,en;q=0.5",
          "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
        }
      }
    );
    if(!res.ok)return {known:false,videoId:"",publishedAt:"",source:"rss-http-"+res.status};
    const xml=await res.text();
    const entry=xml.match(/<entry\b[\s\S]*?<\/entry>/i)?.[0]||"";
    const videoId=clean(entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1]||"",64);
    const publishedAt=clean(entry.match(/<published>([^<]+)<\/published>/i)?.[1]||"",80);
    if(!videoId)return {known:true,videoId:"",publishedAt:"",source:"youtube-rss-empty"};
    return {known:true,videoId,publishedAt,source:"youtube-rss"};
  }catch(error){
    return {
      known:false,videoId:"",publishedAt:"",
      source:"rss-error:"+clean(String((error as any)?.message||error),80)
    };
  }finally{
    clearTimeout(timer);
  }
}

async function selectedSourceLiveNow(source:any,candidates:any[]=[]){
  const id=clean(source?.id,180);
  if(!/^UC[A-Za-z0-9_-]+$/.test(id))return null;

  // The channel's canonical /live redirect is the strongest cheap current-live
  // signal. If it points to a video, preserve richer metadata for that exact id.
  const currentId=await youtubeChannelLiveVideoId(id,3200);
  if(currentId){
    const matching=(Array.isArray(candidates)?candidates:[])
      .map((row:any)=>normalizeRow(row,source))
      .find((row:any)=>videoId(row)===currentId);

    if(matching){
      return normalizeRow({
        ...matching,
        id:currentId,
        videoId:currentId,
        url:"/watch?v="+currentId,
        uploaded:-1,
        duration:-1,
        isLive:true,
        publishedText:"Đang trực tiếp",
        _liveVerified:"channel_live_redirect"
      },source);
    }

    return normalizeRow({
      id:currentId,
      videoId:currentId,
      url:"/watch?v="+currentId,
      title:clean(source?.name||"Đang trực tiếp",300),
      thumbnail:"https://i.ytimg.com/vi/"+currentId+"/hqdefault.jpg",
      thumbnailUrl:"https://i.ytimg.com/vi/"+currentId+"/hqdefault.jpg",
      uploaderName:clean(source?.name||"",180),
      uploaderUrl:"/channel/"+id,
      channelId:id,
      uploaded:-1,
      duration:-1,
      views:0,
      isLive:true,
      publishedText:"Đang trực tiếp",
      _liveVerified:"channel_live_redirect"
    },source);
  }

  if(!currentId)return null;
  return null;
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

  const accept=(item:any,origin:string)=>{
    const row=normalizeRow(item,{});
    if(!row||!strongFreshLiveSignal(row))return;
    const sid=channelId(row);
    if(sid&&blockedSourceIds.has(sid))return;
    if(liveKeywordBlocked(row,keywords))return;
    if(sid&&selectedSourceIds.has(sid)){
      selected.push({...row,_liveOrigin:"source",_liveDiscoveryOrigin:origin});
      return;
    }
    external.push({...row,_liveOrigin:"search",_liveDiscoveryOrigin:origin});
  };

  // SOURCE 1 — reference YouTube's own regional VN surface first.
  // This is not keyword discovery: Piped /trending mirrors YouTube's regional
  // ranking and currently exposes the same kind of "what is live now" pool
  // shown by YouTube's Trực tiếp surface.
  try{
    const result=await fetchJson(
      supabaseUrl+"/functions/v1/yt1988?action=trending&region=VN",
      {
        "apikey":serviceKey,
        "authorization":"Bearer "+serviceKey
      },
      4200
    );
    const raw=Array.isArray(result?.data)?result.data:
      Array.isArray(result?.data?.items)?result.data.items:[];
    for(const item of raw)accept(item,"youtube_regional");
  }catch(error){
    console.warn("youtube regional live reference failed",String(error));
  }

  // SOURCE 3 — keyword search is supplemental only. It expands categories that
  // may not be present on the current YouTube regional surface.
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

      for(const item of raw)accept(item,"keyword");
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
async function triggerFollowupRefresh(rest:string,headers:any,scopes:string[]){
  const wanted=[...new Set(scopes.map((s)=>clean(s,32)).filter(validScopeSyntax))];
  if(!wanted.length)return;
  // Persist pending work before chaining. The follow-up carries the server
  // service-role Authorization so it is not mistaken for a new browser check
  // and therefore is not blocked by the user-facing cooldown.
  await queuePendingRefresh(rest,headers,wanted);
  const supabaseUrl=rest.replace(/\/rest\/v1$/,"");
  const task=fetch(supabaseUrl+"/functions/v1/yt1988-refresh",{
    method:"POST",
    headers:{
      "apikey":headers.apikey,
      "authorization":headers.authorization,
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
  const authorization=clean(req.headers.get("authorization")||"",300);
  const internalRequest=authorization===("Bearer "+serviceKey);
  const clientCheck=!internalRequest||body?.client_check===true;

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
  let scopes=requested.size?[...requested]:(clientCheck?["latest"]:SCOPES.slice());

  // YouTube LIVE fast discovery is owned exclusively by the demand-only
  // Cloudflare worker. This legacy refresh function must never do LIVE work,
  // even if an old scheduler, trigger, PWA or manual request still asks for it.
  const requestedLive=scopes.includes("live");
  scopes=scopes.filter((scope)=>scope!=="live");
  if(!scopes.length&&requestedLive){
    return json({
      ok:true,
      skipped:true,
      reason:"live_owned_by_cloudflare",
      owner:"1988-youtube-live-state"
    });
  }

  if(clientCheck){
    const configRes=await fetch(
      rest+"/yt1988_refresh_config?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&scope=in.("+scopes.map(encodeURIComponent).join(",")+")"+
      "&select=scope,interval_minutes,enabled,last_enqueued_at",
      {headers:authHeaders}
    ).catch(()=>null);
    const configRows=configRes?.ok?await configRes.json().catch(()=>[]):[];
    const configByScope=new Map(
      (Array.isArray(configRows)?configRows:[]).map((row:any)=>[clean(row?.scope,32),row])
    );
    const now=Date.now();
    scopes=scopes.filter((scope)=>{
      const row:any=configByScope.get(scope);
      if(row?.enabled===false)return false;
      const minutes=Math.max(
        1,
        Math.min(
          1440,
          Number(row?.interval_minutes)||Number(DEFAULT_SCOPE_INTERVAL_MINUTES[scope])||10
        )
      );
      const last=Date.parse(String(row?.last_enqueued_at||""));
      return !Number.isFinite(last)||now-last>=minutes*60*1000;
    });
    if(!scopes.length){
      return json({ok:true,skipped:true,reason:"not_due"});
    }
  }

  if(!await claimLease(rest,authHeaders)){
    // Browser checks must never create duplicate work. Internal follow-ups are
    // persisted to pending_scopes before they are invoked, so re-queueing here
    // would make the same scope perpetually schedule itself while another run
    // owns the lease.
    return json({
      ok:true,
      skipped:true,
      queued:false,
      reason:"refresh_already_running",
      scopes
    });
  }

  // This run now owns these scopes. Remove them from pending before doing
  // any work; only genuinely deferred work may add them back later.
  await fetch(rest+"/rpc/yt1988_consume_pending_refresh",{
    method:"POST",
    headers:authHeaders,
    body:JSON.stringify({p_profile_key:PROFILE,p_scopes:scopes})
  }).catch(()=>{});

  if(clientCheck&&scopes.length){
    const nowIso=new Date().toISOString();
    await fetch(
      rest+"/yt1988_refresh_config?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&scope=in.("+scopes.map(encodeURIComponent).join(",")+")",
      {
        method:"PATCH",
        headers:{...authHeaders,"prefer":"return=minimal"},
        // last_enqueued_at is scheduler bookkeeping only. Do not churn
        // updated_at for a no-op client check; package/source timestamps should
        // move only when their actual durable data changes.
        body:JSON.stringify({last_enqueued_at:nowIso})
      }
    ).catch(()=>{});
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
    const storedSourceMeta=new Map<string,any>();

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
      const storedName=validChannelDisplayName(row?.name)||"";
      const storedThumb=normalizeAvatarUrl(clean(row?.thumbnail_url||"",1000));
      const existingStored=storedSourceMeta.get(id)||{name:"",thumbnailUrl:""};
      storedSourceMeta.set(id,{
        name:validChannelDisplayName(existingStored.name)||storedName,
        thumbnailUrl:normalizeAvatarUrl(existingStored.thumbnailUrl)||storedThumb
      });
      channelMeta.set(id,{
        id,
        name:validChannelDisplayName(previousMeta.name)||storedName,
        thumbnailUrl:clean(previousMeta.thumbnailUrl||storedThumb||"",1000)
      });
    }

    // LIVE has special blacklist behavior in its discovery pipeline.
    // Non-live blocked rows are still authoritative for source suggestions
    // and are excluded from every non-live suggestion snapshot.
    const liveBlockedIds=blockedByScope.get("live")||new Set<string>();
    selectedByScope.set(
      "live",
      (selectedByScope.get("live")||[]).filter((s:any)=>!liveBlockedIds.has(s.id))
    );

    let liveKeywords:string[]=[];
    let verifiedLiveRowsCache:any[]=[];

    // The LIVE blacklist applies to both LIVE sources:
    // Source 1 = external search; Source 2 = selected channels.
    const allBlockedLiveSourceIds=new Set<string>([
      ...generalBlockedIds,
      ...liveBlockedIds
    ]);

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
        list.push({
          ...item,
          _liveCandidateOrigin:"previous_package",
          _liveCacheCheckedAt:currentByScope.get("live")?.updated_at||""
        });
        liveCandidateRowsById.set(sid,list);
      }

      const liveIds=selectedLiveSources.map((source:any)=>source.id).filter(Boolean);
      for(let start=0;start<liveIds.length;start+=50){
        const ids=liveIds.slice(start,start+50);
        const cacheRes=await fetch(
          rest+"/yt1988_channel_cache?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
          "&select=channel_id,items,checked_at,last_success_at",
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
              ...(Array.isArray(cacheRow?.items)
                ?cacheRow.items.map((item:any)=>({
                    ...item,
                    _liveCandidateOrigin:"channel_cache",
                    _liveCacheCheckedAt:cacheRow?.checked_at||cacheRow?.last_success_at||""
                  }))
                :[])
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
          liveKeywords=expandBlockedKeywordRows(
            (Array.isArray(keywordRows)?keywordRows:[])
              .map((row:any)=>row?.keyword_display||"")
          );
        }
      }catch(error){
        console.warn("live keyword read failed",String(error));
      }

      // STEP 1 — selected-channel LIVE is checked on every fast refresh via
      // /channel/<id>/live. Global discovery is separate and slower: trending
      // plus keyword search runs at most once every 10 minutes.
      const allSelectedLiveSourceIds=new Set(
        selectedLiveSources.map((source:any)=>source.id).filter(Boolean)
      );

      let discoveryDue=true;
      try{
        const stateRes=await fetch(
          rest+"/yt1988_discovery_state?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&discovery_key=eq.live_global&select=checked_at&limit=1",
          {headers:authHeaders}
        );
        if(stateRes.ok){
          const stateRows=await stateRes.json();
          const checked=Date.parse(String(stateRows?.[0]?.checked_at||""));
          discoveryDue=!Number.isFinite(checked)||Date.now()-checked>=LIVE_GLOBAL_DISCOVERY_INTERVAL_MS;
        }
      }catch{}

      let verifiedExternalRows:any[]=[];
      let selectedFromSearch:any[]=[];
      let verifiedSelectedFromSearch:any[]=[];

      if(discoveryDue){
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

        const discoveredExternal=(discovery.external||[]).map((row:any)=>({
          ...row,
          _liveOrigin:"search",
          _liveCandidateOrigin:"live_search",
          _liveCacheCheckedAt:new Date().toISOString(),
          _interestPriority:0
        }));
        verifiedExternalRows=await verifyCurrentLiveFingerprintRows(discoveredExternal,24);

        const searchCheckedAt=new Date().toISOString();
        selectedFromSearch=(discovery.selected||[]).map((row:any)=>{
          const sid=channelId(row);
          return {
            ...row,
            _liveOrigin:"source",
            _liveCandidateOrigin:"live_search",
            _liveCacheCheckedAt:searchCheckedAt,
            _interestPriority:explicitLiveIds.has(sid)
              ?2
              :inheritedLiveIds.has(sid)
                ?1
                :0
          };
        });
        verifiedSelectedFromSearch=await verifyCurrentLiveFingerprintRows(
          selectedFromSearch,
          Math.max(24,selectedFromSearch.length)
        );

        await storeServerSourceSuggestions(
          rest,
          authHeaders,
          "live",
          verifiedExternalRows
        ).catch(()=>0);

        await fetch(
          rest+"/yt1988_discovery_state?on_conflict=profile_key,discovery_key",
          {
            method:"POST",
            headers:{...authHeaders,"prefer":"resolution=merge-duplicates,return=minimal"},
            body:JSON.stringify([{
              profile_key:PROFILE,
              discovery_key:"live_global",
              checked_at:new Date().toISOString(),
              updated_at:new Date().toISOString()
            }])
          }
        ).catch(()=>{});
      }else{
        const priorExternal=previousLiveItems.filter((row:any)=>{
          const sid=channelId(row);
          if(!sid||allSelectedLiveSourceIds.has(sid))return false;
          return row?._liveOrigin==="search"||row?._liveCandidateOrigin==="live_search";
        });
        verifiedExternalRows=await verifyCurrentLiveFingerprintRows(priorExternal,24);
      }

      for(const row of selectedFromSearch){
        const sid=channelId(row);
        if(!sid||!liveSourceById.has(sid))continue;
        const list=liveCandidateRowsById.get(sid)||[];
        liveCandidateRowsById.set(sid,dedupeRows([...list,row]));
      }

      const remainingSelected=selectedLiveSources;

      // Explicit LIVE selections are authoritative: check every one on every
      // LIVE refresh. Inherited selections from other tabs are rotated so the
      // worker still stays bounded.
      const explicitRemaining=remainingSelected.filter(
        (source:any)=>explicitLiveIds.has(source.id)
      );
      const inheritedRemaining=remainingSelected.filter(
        (source:any)=>!explicitLiveIds.has(source.id)
      );
      const activeInherited=inheritedRemaining.filter(
        (source:any)=>previousLiveSourceIds.has(source.id)
      );
      const rotationPool=inheritedRemaining
        .filter((source:any)=>!previousLiveSourceIds.has(source.id))
        .sort((a:any,b:any)=>String(a?.id||"").localeCompare(String(b?.id||"")));
      const rotationStart=rotationPool.length
        ?(Math.floor(Date.now()/(2*60*1000))*LIVE_SELECTED_SOURCES_PER_RUN)%rotationPool.length
        :0;
      const rotated=[
        ...rotationPool.slice(rotationStart),
        ...rotationPool.slice(0,rotationStart)
      ].slice(0,LIVE_SELECTED_SOURCES_PER_RUN);

      const selectedToCheck=[...new Map(
        [...explicitRemaining,...activeInherited,...rotated]
          .map((source:any)=>[source.id,source])
      ).values()];

      const selectedCheckedRows=(await mapLimit(selectedToCheck,6,async(source)=>{
        try{
          const row=await selectedSourceLiveNow(
            source,
            liveCandidateRowsById.get(source.id)||[]
          );
          if(!row)return null;
          const sid=channelId(row);
          if(sid&&allBlockedLiveSourceIds.has(sid))return null;
          if(liveKeywordBlocked(row,liveKeywords))return null;
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
        ...verifiedSelectedFromSearch,
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
    const newlyDiscoveredRowsByChannel=new Map<string,any[]>();
    const cacheById=new Map<string,any>();
    const cacheWrites:any[]=[];
    const channelProfileCheckedAt=new Map<string,number>();
    const channelDirectoryWrites:any[]=[];
    const fingerprintTouchIds:string[]=[];
    const now=Date.now();

    // Profile freshness shares the same bounded refresh rotation. A stale
    // profile makes the existing channel request run even when the newest
    // video fingerprint is unchanged, so we enrich the canonical library
    // without introducing another crawler or fan-out loop.
    for(let start=0;start<neededIds.length;start+=50){
      const ids=neededIds.slice(start,start+50);
      if(!ids.length)continue;
      const profileRes=await fetch(
        rest+"/yt1988_channel_directory?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
        "&select=channel_id,profile_checked_at",
        {headers:authHeaders}
      ).catch(()=>null);
      if(!profileRes||!profileRes.ok)continue;
      const profileRows=await profileRes.json().catch(()=>[]);
      for(const row of Array.isArray(profileRows)?profileRows:[]){
        const id=clean(row?.channel_id,180);
        const checked=Date.parse(String(row?.profile_checked_at||""));
        if(id&&Number.isFinite(checked))channelProfileCheckedAt.set(id,checked);
      }
    }

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
        const fingerprint=await youtubeChannelVideoFingerprint(id);
        const cachedLatest=clean(previous?.newest_video_id,64);

        // Fingerprint path: one tiny RSS response is enough to prove the channel
        // has no new upload. Reuse the complete cached snapshot and do not call
        // the heavier channel resolver, metadata endpoints or verification fanout.
        const profileCheckedAt=channelProfileCheckedAt.get(id)||0;
        const profileStale=
          !profileCheckedAt||
          now-profileCheckedAt>=CHANNEL_PROFILE_TTL_MS;

        if(
          fingerprint.known&&
          cachedLatest&&
          fingerprint.videoId===cachedLatest&&
          previousRows.length&&
          !profileStale
        ){
          channelRows.set(id,previousRows);
          channelFetchOk.add(id);
          fingerprintTouchIds.push(id);
          return true;
        }

        const url=supabaseUrl+"/functions/v1/yt1988?action=channel&id="+encodeURIComponent(id);
        const result=await fetchJson(url,{
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },7500);
        const data=result?.data||{};
        const discoveredName=validChannelDisplayName(data?.name||data?.title||"");
        const discoveredAvatar=normalizeAvatarUrl(clean(
          data?.avatarUrl||data?.thumbnailUrl||data?.avatar||"",
          1000
        ));
        const subscriberCount=Math.max(
          0,
          Math.round(Number(data?.subscriberCount||data?.subscribers||0)||0)
        );
        const subscriberText=clean(
          data?.subscriberText||
          (subscriberCount>0?String(subscriberCount):"")||
          data?.subscribers||
          "",
          120
        );
        const channelHandle=clean(
          data?.handle||data?.vanityUrl||data?.customUrl||"",
          120
        )
          .replace(/^https?:\/\/www\.youtube\.com\//i,"")
          .replace(/^@/,"");
        const channelDescription=clean(data?.description||data?.bio||"",2000);
        const channelViewCount=Math.max(
          0,
          Math.round(Number(data?.viewCount||data?.views||0)||0)
        );
        const channelVideoCount=Math.max(
          0,
          Math.round(Number(data?.videoCount||data?.videosCount||0)||0)
        );

        if(discoveredName)source.name=discoveredName;
        if(discoveredAvatar)source.thumbnailUrl=discoveredAvatar;
        if(discoveredName||discoveredAvatar)channelMeta.set(id,source);

        channelDirectoryWrites.push({
          channel_id:id,
          name:discoveredName,
          thumbnail_url:discoveredAvatar,
          subscribers:subscriberText,
          handle:channelHandle,
          description:channelDescription,
          verified:data?.verified===true,
          subscriber_count:subscriberCount,
          view_count:channelViewCount,
          video_count:channelVideoCount,
          profile_url:"https://www.youtube.com/channel/"+id,
          profile_checked_at:checkedAt,
          source:"server-channel-refresh"
        });
        channelProfileCheckedAt.set(id,Date.parse(checkedAt));

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
            _shortCheckedAt:Number(previousRow?._shortCheckedAt)||0,
            // Embed verification is server state. Never drop it when a fresh
            // channel snapshot replaces the display fields for the same video.
            _embedCheckedAt:typeof previousRow?._embedPlayable==="boolean"
              ?Number(previousRow?._embedCheckedAt)||0
              :0,
            _embedPlayable:typeof previousRow?._embedPlayable==="boolean"
              ?previousRow._embedPlayable
              :undefined,
            _embedStatus:clean(previousRow?._embedStatus||"",80)
          };
        });

        if(!fresh.length)throw new Error("empty_channel_payload");

        const previousIds=new Set(
          (Array.isArray(previous?.items)?previous.items:previousRows)
            .map((row:any)=>videoId(row))
            .filter(Boolean)
        );
        const newlyFound=fresh.filter((row:any)=>{
          const id=videoId(row);
          return !!id&&!previousIds.has(id);
        });
        if(newlyFound.length)newlyDiscoveredRowsByChannel.set(id,newlyFound);

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
          thumbnail_url:normalizeAvatarUrl(source?.thumbnailUrl||previous?.thumbnail_url||""),
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
          thumbnail_url:normalizeAvatarUrl(source?.thumbnailUrl||previous?.thumbnail_url||""),
          checked_at:checkedAt,
          last_success_at:previous?.last_success_at||null,
          last_error:message,
          retry_after:new Date(Date.now()+CHANNEL_FAILURE_RETRY_MS).toISOString(),
          version:Date.now()*100+index
        });
      }
      return true;
    });

    if(fingerprintTouchIds.length){
      const touchedAt=new Date().toISOString();
      for(let start=0;start<fingerprintTouchIds.length;start+=50){
        const ids=fingerprintTouchIds.slice(start,start+50);
        await fetch(
          rest+"/yt1988_channel_cache?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&channel_id=in.("+ids.map(encodeURIComponent).join(",")+")",
          {
            method:"PATCH",
            headers:{...authHeaders,"prefer":"return=minimal"},
            body:JSON.stringify({
              checked_at:touchedAt,
              last_success_at:touchedAt,
              last_error:"",
              retry_after:null
            })
          }
        ).catch(()=>{});
      }
    }

    // Verify every recent non-live row on the server. Duration and YouTube's
    // Shorts surface are independent signals: either <=60 seconds OR Shorts
    // membership excludes a video from every non-live package.
    const verificationScopeChannelIds=new Set<string>();
    const verificationScopesByChannel=new Map<string,Set<string>>();
    for(const scope of nonLiveScopes){
      for(const source of selectedByScope.get(scope)||[]){
        verificationScopeChannelIds.add(source.id);
        if(!verificationScopesByChannel.has(source.id)){
          verificationScopesByChannel.set(source.id,new Set());
        }
        verificationScopesByChannel.get(source.id)?.add(scope);
      }
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
        const embedCheckedAt=Number(row?._embedCheckedAt)||0;
        const embedStatus=clean(row?._embedStatus||"",80);
        const embedKnown=typeof row?._embedPlayable==="boolean"&&
          !["PROBE_ERROR","OEMBED_ERROR"].includes(embedStatus)&&
          !/^HTTP_|^OEMBED_HTTP_/.test(embedStatus);
        const resolverVersion=Number(row?._durationResolverVersion)||0;
        const needDuration=duration<=0&&(
          resolverVersion<3||
          !durationCheckedAt||
          now-durationCheckedAt>=15*60*1000
        );
        const needShort=!shortCheckedAt;
        const needEmbed=
          !embedKnown||
          !embedCheckedAt||
          now-embedCheckedAt>=EMBED_CHECK_TTL_MS;
        if(!needDuration&&!needShort&&!needEmbed)continue;

        verificationCandidateIds.add(id);
        verificationCandidates.push({
          id,
          age,
          duration,
          needDuration,
          needShort,
          needEmbed,
          inCurrentPackage:currentPackageVideoIds.has(id)
        });
      }
    }
    const preferOlderVerification=
      scopes.includes("week")&&!scopes.includes("latest");
    verificationCandidates.sort((a,b)=>
      Number(b.inCurrentPackage)-Number(a.inCurrentPackage)||
      (preferOlderVerification?b.age-a.age:a.age-b.age)
    );

    const verificationMeta=new Map<string,any>();
    await mapLimit(verificationCandidates.slice(0,NON_LIVE_VERIFY_BATCH),8,async(candidate)=>{
      const checkedAt=Date.now();
      const [searchMeta,isShort,embed]=await Promise.all([
        candidate.needDuration
          ?youtubeSearchVideoMetadata(supabaseUrl,serviceKey,candidate.id)
          :Promise.resolve(null),
        candidate.needShort
          ?youtubeShortsMembership(candidate.id)
          :Promise.resolve(false),
        candidate.needEmbed
          ?youtubeEmbedPlayback(candidate.id)
          :Promise.resolve(null)
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
        shortCheckedAt:candidate.needShort?checkedAt:0,
        embedCheckedAt:candidate.needEmbed&&embed?.definitive===true
          ?checkedAt
          :0,
        embedPlayable:candidate.needEmbed&&embed?.definitive===true
          ?embed?.playable===true
          :undefined,
        embedStatus:candidate.needEmbed
          ?clean(embed?.status||"",80)
          :""
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
          const sourceThumbnailUrl=normalizeAvatarUrl(clean(
            meta?.sourceThumbnailUrl||row?._sourceThumbnailUrl||"",
            1000
          ));
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
            _shortCheckedAt:meta.shortCheckedAt||Number(row?._shortCheckedAt)||0,
            _embedCheckedAt:meta.embedCheckedAt||
              (typeof row?._embedPlayable==="boolean"?Number(row?._embedCheckedAt)||0:0),
            _embedPlayable:meta.embedCheckedAt
              ?meta.embedPlayable===true
              :(typeof row?._embedPlayable==="boolean"?row._embedPlayable:undefined),
            _embedStatus:meta.embedStatus||
              clean(row?._embedStatus||"",80)
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
        row?.isShort===true?"1":"0",
        row?._embedPlayable===true?"1":"0",
        String(Number(row?._embedCheckedAt)||0)
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
        thumbnail_url:normalizeAvatarUrl(source?.thumbnailUrl||previous?.thumbnail_url||""),
        checked_at:existing?.checked_at||previous?.checked_at||new Date().toISOString(),
        last_success_at:existing?.last_success_at||previous?.last_success_at||null,
        last_error:existing?.last_error||previous?.last_error||"",
        retry_after:existing?.retry_after??previous?.retry_after??null,
        version:Date.now()*100+Math.max(0,index)
      };
      if(index>=0)cacheWrites[index]={...existing,...write};
      else cacheWrites.push(write);
    }

    // Persist canonical profile fields in one batched RPC. This reuses the
    // same channel fetches that produced video snapshots; no extra upstream
    // channel request is made for library maintenance.
    for(let start=0;start<channelDirectoryWrites.length;start+=40){
      const chunk=channelDirectoryWrites.slice(start,start+40);
      if(!chunk.length)continue;
      const directoryWrite=await fetch(
        rest+"/rpc/yt1988_upsert_channel_directory",
        {
          method:"POST",
          headers:authHeaders,
          body:JSON.stringify({
            p_profile_key:PROFILE,
            p_channels:chunk
          })
        }
      ).catch(()=>null);
      if(!directoryWrite||!directoryWrite.ok){
        console.warn(
          "channel directory write failed",
          directoryWrite?await directoryWrite.text():"request_failed"
        );
      }
    }

    const sourceMetaUpdates=[...channelMeta.values()].filter((source:any)=>{
      const id=clean(source?.id,180);
      if(!/^UC[A-Za-z0-9_-]+$/.test(id))return false;
      const stored=storedSourceMeta.get(id)||{};
      const name=validChannelDisplayName(source?.name);
      const thumbnailUrl=normalizeAvatarUrl(source?.thumbnailUrl);
      return (!!name&&name!==validChannelDisplayName(stored?.name))||
        (!!thumbnailUrl&&thumbnailUrl!==normalizeAvatarUrl(stored?.thumbnailUrl));
    });
    await mapLimit(sourceMetaUpdates,4,async(source:any)=>{
      const body:any={};
      const stored=storedSourceMeta.get(clean(source?.id,180))||{};
      const name=validChannelDisplayName(source?.name);
      const thumbnailUrl=normalizeAvatarUrl(source?.thumbnailUrl);
      if(name&&name!==validChannelDisplayName(stored?.name))body.name=name;
      if(thumbnailUrl&&thumbnailUrl!==normalizeAvatarUrl(stored?.thumbnailUrl)){
        body.thumbnail_url=thumbnailUrl;
      }
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

    // Source suggestion discovery is intentionally outside the package refresh
    // critical path. Search/verification fan-out can hit upstream rate limits
    // and must never prevent Live/Ngay/Tuan packages from completing.

    const results:any[]=[];
    const degradedNotes:string[]=[];
    for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
      const scope=scopes[scopeIndex];
      const meta=SCOPE_META[scope]||{profile:"general",label:scope,kind:"content"};
      const scopeBlocked=blockedByScope.get(scope)||new Set<string>();
      const selected=(selectedByScope.get(scope)||[]).filter(
        (source:any)=>source?.id&&!generalBlockedIds.has(source.id)&&!scopeBlocked.has(source.id)
      );
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

      // Keep the full channel sample for display-title boilerplate learning.
      // The package itself is still filtered by age/Short/duration below.
      const displayPatternReference=meta.kind==="content"?raw.slice():[];

      if(scope!=="live"){
        // NON-LIVE packages contain only rows the server has already resolved.
        // Unknown rows are omitted and retried by the normal server schedule.
        raw=raw.filter((r:any)=>
          !isLive(r)&&
          !isTooShortVideo(r)&&
          Number(r?._shortCheckedAt)>0&&
          durationSeconds(r)>60&&
          Number(r?._embedCheckedAt)>0&&
          r?._embedPlayable===true&&
          !!validChannelDisplayName(r?._sourceName||r?.uploaderName||r?.uploader||"")&&
          !!clean(r?._displayTitle||r?.title||"",300)
        );
      }else{
        raw=raw.filter((r:any)=>!!r);
      }
      if(meta.kind==="content")raw=raw.filter((r:any)=>!isBlockedMusicTabVideo(meta,r));

      if(scope==="live"){
        // LIVE is built only from candidates that were freshly verified above.
        // Never fall back to stale channel-cache live flags.
        raw=verifiedLiveRowsCache
          .filter((row:any)=>{
            const sid=channelId(row);
            return (!sid||!allBlockedLiveSourceIds.has(sid));
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

      if(scope==="latest"||scope==="week"){
        raw=raw.filter((r:any)=>!obviousNonNewsForNewsScope(r));
      }

      if(meta.kind==="content"){
        // Learn repeated edge/column text from the channel's cached titles and
        // remove it only from _displayTitle. The video and row.title stay intact.
        raw=cleanRepeatedDisplayBoilerplate(raw,displayPatternReference,meta);
      }

      // Final deterministic package policy shared by every source.
      raw=raw.filter((r:any)=>{
        const sid=channelId(r);
        if(sid&&(generalBlockedIds.has(sid)||scopeBlocked.has(sid)))return false;
        if(!validChannelDisplayName(
          r?._sourceName||r?.uploaderName||r?.uploader||r?.channelName||""
        ))return false;
        if(titleLooksBroken(r))return false;
        if(scope==="live"&&liveKeywordBlocked(r,liveKeywords))return false;
        if(SYSTEM_SCOPES.includes(scope)&&titleLooksEnglishOnly(r))return false;
        return true;
      });

      if(meta.kind!=="live")raw=sortRows(raw);
      raw=(meta.kind==="live"?dedupeRows(raw):dedupePackageRows(raw))
        .filter((r:any)=>meta.kind!=="content"||!strongAd(r));

      if(scope!=="live"&&selected.length&&raw.length===0&&Array.isArray(current?.items)&&current.items.length){
        const previousItems=Array.isArray(current.items)?current.items:[];
        degradedNotes.push(scope+":empty_candidate_kept_previous");
        await queuePendingRefresh(rest,authHeaders,[scope]);
        results.push({
          scope,
          changed:false,
          reason:"empty_candidate_kept_previous",
          items:previousItems.length
        });
        continue;
      }

      // Rotation/shape is server data too. Merge only metadata that the player
      // already verified and stored; the browser does not resolve it per card.
      raw=await enrichRowsWithStoredVideoMeta(rest,authHeaders,raw);

      const sig=sourceSignature(rows,scope);
      const policyKey=(meta.kind==="live"?LIVE_PIPELINE_VERSION:NON_LIVE_PIPELINE_VERSION)+":"+meta.kind;
      const identityHash=snapshotRowsIdentityHash(raw,sig);
      const inputHash=fastHash(identityHash+"|"+policyKey);
      if(current?.input_hash===inputHash&&current?.source_signature===sig){
        results.push({scope,changed:false,checked:true,reason:"same_input"});
        continue;
      }

      // Package refresh must remain deterministic and fast. AI/topic cleanup is
      // intentionally kept out of this critical path; filtering/deduping above
      // is enough to publish fresh data without rate-limit stalls.
      let packaged=raw;

      packaged=meta.kind==="live"
        ?dedupeRows(packaged)
        :dedupePackageRows(packaged);

      // Coverage above already prevents partial upstream failures from replacing
      // healthy data. Always publish the fully filtered current result so stale
      // Shorts/blocked/expired rows cannot survive indefinitely.

      const hash=snapshotRowsHash(packaged,sig);
      if(current?.hash===hash&&current?.input_hash===inputHash&&current?.source_signature===sig){
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
    if(pending.length)await triggerFollowupRefresh(rest,authHeaders,pending);
    return json({ok:true,degraded,pending_scopes:pending,scopes:results});
  }catch(error){
    failure=String((error as any)?.message||error||"refresh_failed");
    const pending=await finishLease(rest,authHeaders,false,failure);
    if(pending.length)await triggerFollowupRefresh(rest,authHeaders,pending);
    return json({ok:false,error:failure,pending_scopes:pending},500);
  }
});