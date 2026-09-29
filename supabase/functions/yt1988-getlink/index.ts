
const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type",
  "cache-control":"no-store"
};
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...CORS,"content-type":"application/json; charset=utf-8"}
  });
}
function clean(v,n=5000){
  return String(v??"").trim().slice(0,n);
}
function qualityNumber(label){
  const m=String(label||"").match(/(\d{3,4})/);
  return m?Number(m[1]):0;
}
function pickFormat(formats,kind){
  const rows=Array.isArray(formats)?formats.filter(x=>x&&/^https:\/\//i.test(clean(x.url))):[];
  if(kind==="audio"){
    return rows.find(x=>String(x.type||"").toLowerCase()==="audio")
      || rows.find(x=>/mp3|m4a|audio/i.test(String(x.ext||"")+" "+String(x.label||"")));
  }
  const videos=rows.filter(x=>String(x.type||"").toLowerCase()==="video");
  return videos.find(x=>qualityNumber(x.label)===720)
    || videos.filter(x=>qualityNumber(x.label)>0&&qualityNumber(x.label)<=1080)
      .sort((a,b)=>qualityNumber(b.label)-qualityNumber(a.label))[0]
    || videos[0];
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);

  const u=new URL(req.url);
  const id=clean(u.searchParams.get("id"),32);
  const kind=clean(u.searchParams.get("kind"),12).toLowerCase();
  if(!VIDEO_ID_RE.test(id))return json({ok:false,error:"invalid_video"},400);
  if(kind!=="audio"&&kind!=="video")return json({ok:false,error:"invalid_kind"},400);

  const youtubeUrl="https://www.youtube.com/watch?v="+id;
  try{
    const r=await fetch("https://gendownload.com/api/extract",{
      method:"POST",
      headers:{
        "content-type":"application/json",
        "accept":"application/json"
      },
      body:JSON.stringify({url:youtubeUrl}),
      signal:AbortSignal.timeout(30000)
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data)return json({ok:false,error:"extract_failed",status:r.status},502);

    const picked=pickFormat(data.formats,kind);
    if(!picked)return json({ok:false,error:"format_not_found"},404);

    const mediaUrl=clean(picked.url,5000);
    const asJson=String(u.searchParams.get("json")||"")==="1";
    if(!asJson){
      return new Response(null,{
        status:302,
        headers:{
          ...CORS,
          "location":mediaUrl,
          "x-1988-download-provider":"gendownload"
        }
      });
    }

    return json({
      ok:true,
      provider:"gendownload",
      id,
      youtubeUrl,
      title:clean(data.title,300),
      kind,
      label:clean(picked.label,80),
      ext:clean(picked.ext,16),
      url:mediaUrl,
      filesize:Number(picked.filesize)||null
    });
  }catch(error){
    return json({ok:false,error:"extract_unavailable",detail:clean(error?.message||error,240)},502);
  }
});