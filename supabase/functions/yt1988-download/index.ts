const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"content-type",
  "cache-control":"no-store"
};

const OWN_BASE="https://one988-media.onrender.com";
const COBALT_API="https://rue-cobalt.xenon.zone/";
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;

function reply(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...CORS,"content-type":"application/json; charset=utf-8"}
  });
}

function clean(value,max=180){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}

async function ownDownloadReady(url){
  try{
    const response=await fetch(url,{
      method:"HEAD",
      redirect:"manual",
      signal:AbortSignal.timeout(2500)
    });
    return response.ok && !!response.headers.get("x-1988-download");
  }catch{
    return false;
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);

  let body={};
  try{body=await req.json()}catch{
    return reply({ok:false,error:"invalid_json"},400);
  }

  const id=clean(body?.id,32);
  const format=clean(body?.format,8).toLowerCase();
  const title=clean(body?.title,180);

  if(!VIDEO_ID_RE.test(id))return reply({ok:false,error:"invalid_video"},400);
  if(!["mp4","mp3"].includes(format)){
    return reply({ok:false,error:"invalid_format"},400);
  }

  const ownUrl=
    OWN_BASE+
    "/download?id="+encodeURIComponent(id)+
    "&format="+encodeURIComponent(format)+
    "&title="+encodeURIComponent(title||id);

  if(await ownDownloadReady(ownUrl)){
    return reply({ok:true,url:ownUrl,provider:"1988"});
  }

  const youtubeUrl="https://www.youtube.com/watch?v="+id;
  const payload=format==="mp3"
    ?{
        url:youtubeUrl,
        downloadMode:"audio",
        audioFormat:"mp3",
        audioBitrate:"128",
        filenameStyle:"pretty",
        youtubeVideoCodec:"h264"
      }
    :{
        url:youtubeUrl,
        downloadMode:"auto",
        videoQuality:"720",
        youtubeVideoCodec:"h264",
        filenameStyle:"pretty"
      };

  try{
    const response=await fetch(COBALT_API,{
      method:"POST",
      headers:{
        "accept":"application/json",
        "content-type":"application/json"
      },
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(20000)
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return reply({
        ok:false,
        error:"fallback_failed",
        status:response.status,
        detail:data?.error?.code||data?.error||"cobalt_error"
      },502);
    }

    const url=clean(data?.url,4000);
    if(!/^https:\/\//i.test(url)){
      return reply({
        ok:false,
        error:"fallback_no_url",
        status:data?.status||""
      },502);
    }

    return reply({
      ok:true,
      url,
      filename:clean(data?.filename,240),
      provider:"cobalt-fallback",
      mode:format
    });
  }catch(error){
    return reply({
      ok:false,
      error:"resolver_failed",
      detail:clean(error?.message||error,300)
    },502);
  }
});
