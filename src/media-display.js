(()=>{"use strict";

  const clean=value=>String(value??"").replace(/\s+/g," ").trim();
  const number=value=>{
    const n=Number(value);
    return Number.isFinite(n)?Math.max(0,n):0;
  };
  const compact=value=>{
    const n=number(value);
    const unit=n>=1e9?["B",1e9]:n>=1e6?["M",1e6]:n>=1e3?["K",1e3]:null;
    if(!unit)return Math.round(n).toLocaleString("vi-VN");
    const scaled=n/unit[1];
    const digits=scaled<10&&Math.abs(scaled-Math.round(scaled))>.049?1:0;
    return scaled.toFixed(digits).replace(/\.0$/,"")+unit[0];
  };

  function views(value,{word=true}={}){
    const n=number(value);
    if(!n)return "";
    const short=compact(n);
    // 100 -> "100 lượt xem"; 1.000 -> "1K"; 10.000 -> "10K";
    // 1.000.000 -> "1M"; 1.000.000.000 -> "1B".
    return word&&n<1000?short+" lượt xem":short;
  }

  function viewsText(raw="",value=0){
    const n=number(value);
    if(n)return views(n,{word:true});

    let text=clean(raw);
    if(!text)return "";

    // When YouTube already supplies a localized view string, keep it but drop
    // the long noun on compact counts so narrow cards do not waste a line.
    if(text.length>10){
      text=text.replace(/\s*(?:lượt\s*xem|views?)\s*$/i,"").trim();
    }
    return text;
  }

  function duration(value){
    let sec=Math.max(0,Math.floor(number(value)));
    const h=Math.floor(sec/3600);
    const m=Math.floor((sec%3600)/60);
    const s=sec%60;
    return h
      ?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")
      :m+":"+String(s).padStart(2,"0");
  }

  function relativeAge(ageMs){
    const age=number(ageMs);
    const seconds=Math.floor(age/1000);
    if(seconds<10)return "Vừa xong";
    if(seconds<60)return seconds+" giây trước";

    const minutes=Math.floor(seconds/60);
    if(minutes<60)return minutes+" phút trước";

    const hours=Math.floor(minutes/60);
    if(hours<24)return hours+" giờ trước";

    const days=Math.floor(hours/24);
    if(days<30)return Math.max(1,days)+" ngày trước";

    const months=Math.floor(days/30);
    if(days<365)return Math.max(1,months)+" tháng trước";

    const years=Math.floor(days/365);
    return Math.max(1,years)+" năm trước";
  }

  function source(row={}){
    const id=clean(
      row._sourceId||
      row.channelId||
      row.uploaderId||
      row.channel_id||
      (String(row.id||"").startsWith("UC")?row.id:"")
    );
    const name=clean(
      row._sourceName||
      row.uploaderName||
      row.uploader||
      row.channelName||
      row.author?.name||
      row.name
    );
    const icon=clean(
      row.uploaderThumbnailUrl||
      row.channelThumbnailUrl||
      row._sourceThumbnailUrl||
      row.uploaderAvatar||
      row.channelAvatar||
      row.authorAvatar||
      row.ownerAvatar||
      row.avatar||
      row.thumbnailUrl||
      ""
    );
    return {id,name,icon};
  }

  function video(row={}){
    const src=source(row);
    const id=clean(row.videoId||row.id||"");
    return {
      id,
      title:clean(row._displayTitle||row.title)||"Video",
      sourceId:src.id,
      sourceName:src.name,
      sourceIcon:src.icon,
      thumbnail:clean(row.thumbnail||row.thumbnailUrl||row.thumbnails?.[0]?.url),
      views:number(row.views||row.viewCount),
      duration:number(row.duration||row.durationSeconds||row.lengthSeconds),
      publishedText:clean(row.publishedText||row.uploadDate||row.uploadedDate)
    };
  }

  window.MediaDisplay=Object.freeze({
    clean,
    number,
    compact,
    views,
    viewsText,
    duration,
    relativeAge,
    source,
    video
  });
})();