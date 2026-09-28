const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,HEAD,OPTIONS",
  "access-control-allow-headers":"content-type,range",
  "access-control-expose-headers":"content-type,content-length,content-range,accept-ranges,content-disposition,x-1988-download-provider",
  "cache-control":"no-store"
};

const COBALT_APIS=[
  "https://cobaltapi.cjs.nz/",
  "https://rue-cobalt.xenon.zone/"
];
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

function payloadFor(id,format){
  const youtubeUrl="https://www.youtube.com/watch?v="+id;
  return format==="mp3"
    ?{
        url:youtubeUrl,
        downloadMode:"audio",
        audioFormat:"mp3",
        audioBitrate:"128",
        filenameStyle:"pretty",
        youtubeVideoCodec:"h264",
        alwaysProxy:true
      }
    :{
        url:youtubeUrl,
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
        return {
          url,
          filename:clean(data?.filename,240),
          api,
          status:clean(data?.status,24)
        };
      }

      errors.push(
        api+":"+
        String(data?.error?.code||data?.error||response.status||"resolve_failed")
      );
    }catch(error){
      errors.push(api+":"+clean(error?.message||error,180));
    }
  }

  throw new Error(errors.join(" | ")||"no_cobalt_instance");
}

function fallbackFilename(id,format,title=""){
  const base=clean(title,120)
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g," ")
    .replace(/\s+/g," ")
    .trim();
  return (base||id)+"."+format;
}

async function streamDownload(req,id,format,title=""){
  const resolved=await resolveCobalt(id,format);

  const upstreamHeaders=new Headers();
  upstreamHeaders.set("accept","*/*");
  const range=req.headers.get("range");
  if(range)upstreamHeaders.set("range",range);

  const upstream=await fetch(resolved.url,{
    method:req.method==="HEAD"?"HEAD":"GET",
    headers:upstreamHeaders,
    redirect:"follow",
    signal:AbortSignal.timeout(30000)
  });

  if(!upstream.ok&&upstream.status!==206){
    try{upstream.body?.cancel()}catch{}
    throw new Error("cobalt_tunnel_http_"+upstream.status);
  }

  const headers=new Headers(CORS);
  const passthrough=[
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified"
  ];
  for(const name of passthrough){
    const value=upstream.headers.get(name);
    if(value)headers.set(name,value);
  }

  headers.set(
    "content-type",
    upstream.headers.get("content-type")||
      (format==="mp3"?"audio/mpeg":"video/mp4")
  );
  headers.set(
    "content-disposition",
    upstream.headers.get("content-disposition")||
      'attachment; filename="'+fallbackFilename(id,format,title).replace(/"/g,"")+'"'
  );
  headers.set("x-1988-download-provider",resolved.api);

  if(req.method==="HEAD"){
    try{upstream.body?.cancel()}catch{}
    return new Response(null,{status:upstream.status,headers});
  }

  if(!upstream.body)throw new Error("cobalt_empty_body");

  return new Response(upstream.body,{
    status:upstream.status,
    headers
  });
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(!["GET","POST","HEAD"].includes(req.method)){
    return reply({ok:false,error:"method_not_allowed"},405);
  }

  let id="";
  let format="";
  let title="";

  if(req.method==="POST"){
    let body={};
    try{body=await req.json()}catch{
      return reply({ok:false,error:"invalid_json"},400);
    }
    id=clean(body?.id,32);
    format=clean(body?.format,8).toLowerCase();
    title=clean(body?.title,180);
  }else{
    const url=new URL(req.url);
    id=clean(url.searchParams.get("id"),32);
    format=clean(url.searchParams.get("format"),8).toLowerCase();
    title=clean(url.searchParams.get("title"),180);
  }

  if(!VIDEO_ID_RE.test(id))return reply({ok:false,error:"invalid_video"},400);
  if(!["mp4","mp3"].includes(format)){
    return reply({ok:false,error:"invalid_format"},400);
  }

  // GET/HEAD are the real browser download path: one user click starts one
  // file response, preserving browser download semantics with no second click.
  if(req.method==="GET"||req.method==="HEAD"){
    try{
      return await streamDownload(req,id,format,title);
    }catch(error){
      return reply({
        ok:false,
        error:"download_stream_failed",
        detail:clean(error?.message||error,300)
      },502);
    }
  }

  // POST remains as a lightweight resolver/debug endpoint.
  try{
    const resolved=await resolveCobalt(id,format);
    return reply({
      ok:true,
      url:resolved.url,
      filename:resolved.filename,
      provider:"cobalt",
      api:resolved.api,
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
