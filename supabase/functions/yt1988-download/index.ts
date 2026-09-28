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
const RAPIDAPI_HOST="youtube-to-mp315.p.rapidapi.com";
const RAPIDAPI_BASE="https://"+RAPIDAPI_HOST;
const RAPIDAPI_KEY=(
  Deno.env.get("RAPIDAPI_YOUTUBE_TO_MP315_KEY")||
  Deno.env.get("RAPIDAPI_KEY")||
  Deno.env.get("X_RAPIDAPI_KEY")||
  Deno.env.get("RAPIDAPI_YOUTUBE_KEY")||
  Deno.env.get("YOUTUBE_TO_MP315_KEY")||
  Deno.env.get("X-RapidAPI-Key")||
  ""
).trim();
const RAPID_READY=new Set([
  "COMPLETED","COMPLETE","DONE","READY","FINISHED","SUCCESS","CONVERTED"
]);
const RAPID_FAILED=new Set([
  "FAILED","FAILURE","ERROR","CANCELED","CANCELLED"
]);

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

function rapidHeaders(){
  return {
    "x-rapidapi-key":RAPIDAPI_KEY,
    "x-rapidapi-host":RAPIDAPI_HOST,
    "accept":"application/json",
    "content-type":"application/json"
  };
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function normalizeRapidJob(data={}){
  return {
    id:clean(data?.id||data?.jobId||data?.job_id,80),
    status:clean(data?.status||data?.state,40).toUpperCase(),
    downloadUrl:clean(
      data?.downloadUrl||
      data?.download_url||
      data?.url||
      data?.fileUrl||
      data?.file_url,
      4000
    ),
    title:clean(data?.title,240),
    raw:data
  };
}

async function rapidRequest(path,{method="GET",query={}}={}){
  const url=new URL(RAPIDAPI_BASE+path);
  for(const [key,value] of Object.entries(query||{})){
    if(value===undefined||value===null||value==="")continue;
    url.searchParams.set(key,String(value));
  }

  const response=await fetch(url,{
    method,
    headers:rapidHeaders(),
    body:method==="POST"?"{}":undefined,
    signal:AbortSignal.timeout(20000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(
      "rapidapi_http_"+response.status+":"+
      clean(data?.message||data?.error||data?.detail||"",180)
    );
  }
  return data;
}

async function resolveRapid(id,format){
  if(!RAPIDAPI_KEY)throw new Error("rapidapi_key_missing");

  const youtubeUrl="https://www.youtube.com/watch?v="+id;

  const created=normalizeRapidJob(
    await rapidRequest("/download",{
      method:"POST",
      query:{
        url:youtubeUrl,
        format,
        quality:format==="mp4"?720:undefined
      }
    })
  );

  if(!created.id){
    throw new Error("rapidapi_missing_job_id");
  }

  let latest=created;
  for(let attempt=0;attempt<30;attempt++){
    if(latest.status&&RAPID_FAILED.has(latest.status)){
      throw new Error("rapidapi_job_"+latest.status.toLowerCase());
    }
    if(
      latest.downloadUrl &&
      (!latest.status||RAPID_READY.has(latest.status))
    ){
      return {
        url:latest.downloadUrl,
        filename:fallbackFilename(id,format,latest.title),
        provider:"rapidapi",
        jobId:created.id,
        status:latest.status||"READY"
      };
    }

    await sleep(attempt<8?800:1200);

    let statusData=null;
    try{
      // Public schema names the route /status/{id}. Keep id in the query as
      // well because the generated OpenAPI marks it as a query parameter.
      statusData=await rapidRequest(
        "/status/"+encodeURIComponent(created.id),
        {query:{id:created.id}}
      );
    }catch(error){
      // Some generated RapidAPI specs have route/query mismatches. One retry
      // against /status?id=... keeps the integration tolerant.
      statusData=await rapidRequest("/status",{query:{id:created.id}});
    }
    latest=normalizeRapidJob(statusData);

    if(!latest.id)latest.id=created.id;
    if(!latest.downloadUrl)latest.downloadUrl=created.downloadUrl;
    if(!latest.title)latest.title=created.title;
  }

  throw new Error("rapidapi_timeout");
}

async function fetchDownloadSource(req,resolved,format,id,title=""){
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
    throw new Error(
      (resolved.provider||"download")+"_http_"+upstream.status
    );
  }

  const headers=new Headers(CORS);
  for(const name of [
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified"
  ]){
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
      'attachment; filename="'+
      fallbackFilename(id,format,title).replace(/"/g,"")+
      '"'
  );
  headers.set(
    "x-1988-download-provider",
    String(resolved.provider||"unknown")
  );

  if(req.method==="HEAD"){
    try{upstream.body?.cancel()}catch{}
    return new Response(null,{status:upstream.status,headers});
  }

  if(!upstream.body)throw new Error("download_empty_body");

  return new Response(upstream.body,{
    status:upstream.status,
    headers
  });
}

function fallbackFilename(id,format,title=""){
  const base=clean(title,120)
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g," ")
    .replace(/\s+/g," ")
    .trim();
  return (base||id)+"."+format;
}

async function streamDownload(req,id,format,title=""){
  const errors=[];

  if(RAPIDAPI_KEY){
    try{
      const rapid=await resolveRapid(id,format);
      return await fetchDownloadSource(req,rapid,format,id,title||rapid.filename);
    }catch(error){
      errors.push("rapidapi:"+clean(error?.message||error,240));
    }
  }

  try{
    const cobalt=await resolveCobalt(id,format);
    const resolved={
      ...cobalt,
      provider:"cobalt:"+cobalt.api
    };
    return await fetchDownloadSource(req,resolved,format,id,title||cobalt.filename);
  }catch(error){
    errors.push("cobalt:"+clean(error?.message||error,240));
  }

  throw new Error(errors.join(" | ")||"no_download_provider");
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
  const resolverErrors=[];
  if(RAPIDAPI_KEY){
    try{
      const rapid=await resolveRapid(id,format);
      return reply({
        ok:true,
        url:rapid.url,
        filename:rapid.filename,
        provider:"rapidapi",
        jobId:rapid.jobId,
        status:rapid.status,
        mode:format
      });
    }catch(error){
      resolverErrors.push("rapidapi:"+clean(error?.message||error,220));
    }
  }

  try{
    const resolved=await resolveCobalt(id,format);
    return reply({
      ok:true,
      url:resolved.url,
      filename:resolved.filename,
      provider:"cobalt",
      api:resolved.api,
      mode:format,
      fallbackReason:resolverErrors.join(" | ")
    });
  }catch(error){
    resolverErrors.push("cobalt:"+clean(error?.message||error,220));
    return reply({
      ok:false,
      error:"resolver_failed",
      detail:resolverErrors.join(" | ")
    },502);
  }
});
