'use strict';

(function(global){
  const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;
  const CHANNEL_ID_RE=/^UC[A-Za-z0-9_-]+$/;

  function clean(value){
    return String(value??'').replace(/\s+/g,' ').trim();
  }

  function pick(...values){
    for(const value of values){
      const out=clean(value);
      if(out)return out;
    }
    return '';
  }

  function extractVideoId(value=''){
    const raw=clean(value);
    if(VIDEO_ID_RE.test(raw))return raw;

    try{
      const url=new URL(raw,'https://www.youtube.com');
      const host=url.hostname.replace(/^www\./,'');
      if(host==='youtu.be'){
        const id=url.pathname.split('/').filter(Boolean)[0]||'';
        if(VIDEO_ID_RE.test(id))return id;
      }
      if(host.endsWith('youtube.com')||host.endsWith('youtube-nocookie.com')){
        const direct=url.searchParams.get('v')||'';
        if(VIDEO_ID_RE.test(direct))return direct;
        const parts=url.pathname.split('/').filter(Boolean);
        if(['shorts','embed','live'].includes(parts[0])&&VIDEO_ID_RE.test(parts[1]||'')){
          return parts[1];
        }
      }
    }catch{}

    return raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/)?.[1]||'';
  }

  function videoId(row={}){
    return extractVideoId(row?.videoId||row?.url||row?.id||'');
  }

  function sourceId(row={}){
    const direct=pick(
      row?._sourceId,
      row?.channelId,
      row?.uploaderId,
      row?.authorId,
      row?.channel_id,
      row?.author?.id
    );
    if(CHANNEL_ID_RE.test(direct))return direct;

    const link=pick(
      row?.channelUrl,
      row?.uploaderUrl,
      row?.authorUrl,
      row?.ownerUrl,
      row?.url
    );
    return link.match(/\/channel\/(UC[A-Za-z0-9_-]+)/i)?.[1]||'';
  }

  function sourceName(row={}){
    return pick(
      row?._displaySource,
      row?._sourceName,
      row?.uploaderName,
      row?.uploader,
      row?.channelName,
      row?.author?.name,
      row?.name
    );
  }

  function sourceAvatar(row={}){
    const value=pick(
      row?.thumbnailUrl && CHANNEL_ID_RE.test(String(row?.id||'')) ? row.thumbnailUrl : '',
      row?.uploaderThumbnailUrl,
      row?.channelThumbnailUrl,
      row?._sourceThumbnailUrl,
      row?.uploaderAvatar,
      row?.channelAvatar,
      row?.authorAvatar,
      row?.ownerAvatar,
      row?.avatar,
      row?.author?.thumbnails?.[0]?.url
    );
    return value.startsWith('//')?'https:'+value:value;
  }

  function title(row={}){
    return pick(row?._displayTitle,row?.title,row?.name)||'Video';
  }

  function thumbnail(row={},id=''){
    const video=extractVideoId(id)||videoId(row);
    const value=pick(
      row?.thumbnail,
      row?.thumbnailUrl,
      row?.thumbnails?.[0]?.url,
      row?.content_image?.image?.[0]?.url
    );
    if(value)return value.startsWith('//')?'https:'+value:value;
    return video?'https://i.ytimg.com/vi/'+video+'/hqdefault.jpg':'';
  }

  function parseDuration(value){
    if(value==null||value==='')return 0;
    if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);

    const raw=clean(value);
    if(!raw)return 0;
    if(/^\d+(?:\.\d+)?$/.test(raw))return Math.max(0,Number(raw)||0);

    if(/^\d{1,3}:\d{1,2}(?::\d{1,2})?$/.test(raw)){
      const parts=raw.split(':').map(Number);
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
    for(const value of [
      row?.duration,
      row?.durationSeconds,
      row?.lengthSeconds,
      row?.length,
      row?.videoDuration,
      row?.durationText,
      row?.contentDetails?.duration
    ]){
      const seconds=parseDuration(value);
      if(seconds>0)return seconds;
    }
    return 0;
  }

  function durationLabel(value){
    const sec=Math.max(0,Number(value)||0);
    const h=Math.floor(sec/3600);
    const m=Math.floor((sec%3600)/60);
    const s=Math.floor(sec%60);
    return h
      ?String(h)+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')
      :String(m)+':'+String(s).padStart(2,'0');
  }

  function parseViewCountText(value=''){
    const raw=clean(value).toLowerCase();
    if(!raw)return 0;

    const normalized=raw
      .replace(/,/g,'.')
      .replace(/\s+/g,' ')
      .replace(/lượt xem|views?|watching|đang xem/gi,'')
      .trim();

    const match=normalized.match(/([\d.]+)\s*(k|n|nghìn|nghin|m|tr|triệu|trieu|b|tỷ|ty)?/i);
    if(!match)return 0;

    let number=Number(match[1]);
    if(!Number.isFinite(number))return 0;

    const unit=String(match[2]||'').toLowerCase();
    if(unit==='k'||unit==='n'||unit==='nghìn'||unit==='nghin')number*=1e3;
    else if(unit==='m'||unit==='tr'||unit==='triệu'||unit==='trieu')number*=1e6;
    else if(unit==='b'||unit==='tỷ'||unit==='ty')number*=1e9;

    return Math.max(0,Math.round(number));
  }

  function viewCount(row={}){
    const direct=Number(row?.views??row?.viewCount??row?.view_count);
    if(Number.isFinite(direct)&&direct>0)return direct;
    return parseViewCountText(row?.viewText||row?.short_view_count||row?.view_count_text||'');
  }

  function compactNumber(value){
    const n=Math.max(0,Number(value)||0);
    if(n<1000)return Math.round(n).toLocaleString('vi-VN');

    const units=[
      [1e9,'B'],
      [1e6,'M'],
      [1e3,'K']
    ];

    for(const [size,suffix] of units){
      if(n<size)continue;
      const scaled=n/size;
      const decimals=scaled<10?1:0;
      return scaled.toFixed(decimals).replace(/\.0$/,'')+suffix;
    }
    return String(Math.round(n));
  }

  function normalizeRawViewText(raw=''){
    const value=clean(raw);
    if(!value)return '';
    const parsed=parseViewCountText(value);
    if(parsed>0)return parsed<1000?compactNumber(parsed)+' lượt xem':compactNumber(parsed);
    return value
      .replace(/\s*(?:lượt xem|views?)\s*$/i,'')
      .trim();
  }

  function viewLabel(valueOrRow,rawText=''){
    const row=valueOrRow&&typeof valueOrRow==='object'?valueOrRow:null;
    const count=row?viewCount(row):Math.max(0,Number(valueOrRow)||0);
    const fallback=row?pick(row?.viewText,row?.short_view_count):rawText;

    if(count>0){
      const compact=compactNumber(count);
      return count<1000?compact+' lượt xem':compact;
    }
    return normalizeRawViewText(fallback);
  }

  function normalizeRelativeText(value=''){
    return clean(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');
  }

  function publishedAgeMs(row={},now=Date.now()){
    if(row?.isLive)return -1;

    const unix=Number(row?.uploaded||row?.published||row?.publishedAt||0);
    if(Number.isFinite(unix)&&unix>0){
      const ms=unix<1e12?unix*1000:unix;
      return Math.max(0,now-ms);
    }

    const raw=normalizeRelativeText(
      row?.publishedText||
      row?.uploadDate||
      row?.uploadedDate||
      ''
    );
    if(!raw)return Number.MAX_SAFE_INTEGER;
    if(/vua xong|just now|moments ago/.test(raw))return 0;

    const match=raw.match(/(\d+)\s*(giay|phut|gio|ngay|tuan|thang|nam|second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)/);
    if(match){
      const n=Number(match[1])||0;
      const unit=match[2];
      const minute=60*1000;
      if(/giay|second/.test(unit))return n*1000;
      if(/phut|minute/.test(unit))return n*minute;
      if(/gio|hour/.test(unit))return n*60*minute;
      if(/ngay|day/.test(unit))return n*24*60*minute;
      if(/tuan|week/.test(unit))return n*7*24*60*minute;
      if(/thang|month/.test(unit))return n*30*24*60*minute;
      if(/nam|year/.test(unit))return n*365*24*60*minute;
    }

    const parsed=Date.parse(row?.uploadDate||row?.uploadedDate||row?.publishedText||'');
    return Number.isFinite(parsed)?Math.max(0,now-parsed):Number.MAX_SAFE_INTEGER;
  }

  function relativePublished(row={},now=Date.now()){
    const age=publishedAgeMs(row,now);
    if(!Number.isFinite(age)||age===Number.MAX_SAFE_INTEGER){
      return pick(row?.publishedText,row?.uploadDate,row?.uploadedDate);
    }
    if(age<0)return 'Đang trực tiếp';

    const seconds=Math.max(0,Math.floor(age/1000));
    if(seconds<10)return 'Vừa xong';
    if(seconds<60)return seconds+' giây trước';

    const minutes=Math.floor(seconds/60);
    if(minutes<60)return minutes+' phút trước';

    const hours=Math.floor(minutes/60);
    if(hours<24)return hours+' giờ trước';

    const days=Math.max(1,Math.floor(hours/24));
    if(days<30)return days+' ngày trước';

    const months=Math.max(1,Math.floor(days/30));
    if(days<365)return months+' tháng trước';

    const years=Math.max(1,Math.floor(days/365));
    return years+' năm trước';
  }

  function watchUrl(rowOrId){
    const id=typeof rowOrId==='object'?videoId(rowOrId):extractVideoId(rowOrId);
    return id?'https://www.youtube.com/watch?v='+id:'';
  }

  function source(row={}){
    return {
      id:sourceId(row),
      name:sourceName(row),
      avatar:sourceAvatar(row)
    };
  }

  function video(row={}){
    const id=videoId(row);
    const sourceMeta=source(row);
    const duration=durationSeconds(row);
    const views=viewCount(row);
    return {
      id,
      url:watchUrl(id),
      title:title(row),
      thumbnail:thumbnail(row,id),
      sourceId:sourceMeta.id,
      sourceName:sourceMeta.name,
      sourceAvatar:sourceMeta.avatar,
      duration,
      durationLabel:duration?durationLabel(duration):'',
      views,
      viewsLabel:viewLabel(row),
      publishedLabel:relativePublished(row),
      isLive:row?.isLive===true
    };
  }

  global.MediaMeta=Object.freeze({
    clean,
    extractVideoId,
    videoId,
    sourceId,
    sourceName,
    sourceAvatar,
    title,
    thumbnail,
    parseDuration,
    durationSeconds,
    durationLabel,
    parseViewCountText,
    viewCount,
    compactNumber,
    viewLabel,
    publishedAgeMs,
    relativePublished,
    watchUrl,
    source,
    video
  });
})(typeof window!=='undefined'?window:globalThis);
