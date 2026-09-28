const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,HEAD,OPTIONS",
  "access-control-allow-headers":"content-type,range",
  "access-control-expose-headers":"location,x-1988-download-provider",
  "cache-control":"no-store"
};

const COBALT_APIS=[
  "https://cobaltapi.cjs.nz/",
  "https://rue-cobalt.xenon.zone/"
];
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;

function clean(value,max=180){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}

function reply(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...CORS,"content-type":"application/json; charset=utf-8"}
  });
}

function payloadFor(id,format){
  const url="https://www.youtube.com/watch?v="+id;
  return format==="mp3"
    ?{
        url,
        downloadMode:"audio",
        audioFormat:"mp3",
        audioBitrate:"128",
        filenameStyle:"pretty",
        youtubeVideoCodec:"h264",
        alwaysProxy:true
      }
    :{
        url,
        downloadMode:"auto",
        videoQuality:"720",
        youtubeVideoCodec:"h264",
        youtubeVideoContainer:"mp4",
        filenameStyle:"pretty",
        alwaysProxy:true
      };
}

async function resolveCobalt(id,format){
  const payload=payloadFor(id,format);
  const errors=[];

  for(const api of COBALT_APIS){
    try{
      const response=await fetch(api,{
        method:"POST",
        headers:{
          "accept":"application/json",
          "content-type":"application/json"
        },
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(20000)
      });

      const data=await response.json().catch(()=>({}));
      const url=clean(data?.url,4000);

      if(response.ok&&/^https:\/\//i.test(url)){
        return {url,api};
      }

      errors.push(
        api+":"+
        clean(data?.error?.code||data?.error||response.status||"resolve_failed",180)
      );
    }catch(error){
      errors.push(api+":"+clean(error?.message||error,180));
    }
  }

  throw new Error(errors.join(" | ")||"no_cobalt_instance");
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:CORS});
  }
  if(req.method!=="GET"&&req.method!=="HEAD"){
    return reply({ok:false,error:"method_not_allowed"},405);
  }

  const requestUrl=new URL(req.url);
  const id=clean(requestUrl.searchParams.get("id"),32);
  const format=clean(requestUrl.searchParams.get("format"),8).toLowerCase();

  if(!VIDEO_ID_RE.test(id)){
    return reply({ok:false,error:"invalid_video"},400);
  }
  if(format!=="mp3"&&format!=="mp4"){
    return reply({ok:false,error:"invalid_format"},400);
  }

  try{
    const resolved=await resolveCobalt(id,format);

    // One browser GET stays one browser navigation. Redirect straight to
    // Cobalt's attachment tunnel so Chrome/Safari creates a native download
    // without opening the Cobalt UI and without proxying the file through
    // Supabase.
    return new Response(null,{
      status:302,
      headers:{
        ...CORS,
        "location":resolved.url,
        "x-1988-download-provider":"cobalt:"+resolved.api
      }
    });
  }catch(error){
    return reply({
      ok:false,
      error:"download_resolve_failed",
      detail:clean(error?.message||error,300)
    },502);
  }
});
