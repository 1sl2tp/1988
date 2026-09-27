import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"content-type,authorization,apikey,x-client-info",
  "cache-control":"no-store"
};

const YT_WEB_PLAYER_API_KEY="AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const YT_WEB_PLAYER_CLIENT_VERSION="2.20260925.01.00";
const CLIENTS:any[]=[
  {
    clientName:"WEB",
    clientVersion:YT_WEB_PLAYER_CLIENT_VERSION,
    userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36"
  },
  {
    clientName:"MWEB",
    clientVersion:YT_WEB_PLAYER_CLIENT_VERSION,
    userAgent:"Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/136 Mobile Safari/537.36"
  },
  {
    clientName:"ANDROID",
    clientVersion:"20.10.38",
    androidSdkVersion:35,
    userAgent:"com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
  }
];

function json(data:any,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...CORS,"content-type":"application/json; charset=utf-8"}
  });
}

function validId(value:any){
  return /^[A-Za-z0-9_-]{11}$/.test(String(value||"").trim());
}

function validAspect(value:any){
  const ratio=Number(value)||0;
  return Number.isFinite(ratio)&&ratio>=.25&&ratio<=4?ratio:0;
}

function validDimensions(width:any,height:any,source=""){
  const w=Number(width)||0;
  const h=Number(height)||0;
  if(w<=0||h<=0)return null;
  const aspectRatio=validAspect(w/h);
  if(!aspectRatio)return null;
  return {width:Math.round(w),height:Math.round(h),aspectRatio,source};
}

function storyboardCandidates(data:any){
  const out:any[]=[];
  const spec=String(data?.storyboards?.playerStoryboardSpecRenderer?.spec||"");
  if(!spec)return out;

  const segments=spec.split("|").slice(1);
  for(const segment of segments){
    const parts=segment.split("#");
    const row=validDimensions(parts[0],parts[1],"storyboard");
    if(row)out.push(row);
  }
  return out;
}

function responseCandidates(data:any){
  const out:any[]=[...storyboardCandidates(data)];
  const streaming=data?.streamingData||{};
  const formats=[
    ...(Array.isArray(streaming?.formats)?streaming.formats:[]),
    ...(Array.isArray(streaming?.adaptiveFormats)?streaming.adaptiveFormats:[])
  ];

  for(const format of formats){
    const mime=String(format?.mimeType||"").toLowerCase();
    if(mime&&!mime.includes("video/"))continue;
    const row=validDimensions(format?.width,format?.height,"stream");
    if(row)out.push(row);
  }

  const thumbs=Array.isArray(data?.videoDetails?.thumbnail?.thumbnails)
    ?data.videoDetails.thumbnail.thumbnails
    :[];
  for(const thumb of thumbs){
    const row=validDimensions(thumb?.width,thumb?.height,"video-thumbnail");
    if(row)out.push(row);
  }

  return out;
}

function pickDimensions(candidates:any[]=[]){
  const rows=candidates.filter(row=>row&&row.width>0&&row.height>0);
  if(!rows.length)return null;

  const storyboard=rows
    .filter(row=>row.source==="storyboard")
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(storyboard)return storyboard;

  const portrait=rows
    .filter(row=>row.aspectRatio<.80)
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(portrait)return portrait;

  const square=rows
    .filter(row=>row.aspectRatio>=.80&&row.aspectRatio<=1.20)
    .sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if(square)return square;

  return rows.sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
}

async function fetchPlayer(id:string,profile:any){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2800);
  try{
    const client:any={
      clientName:profile.clientName,
      clientVersion:profile.clientVersion,
      hl:"vi",
      gl:"VN"
    };
    if(profile.androidSdkVersion)client.androidSdkVersion=profile.androidSdkVersion;

    const res=await fetch(
      "https://www.youtube.com/youtubei/v1/player?key="+encodeURIComponent(YT_WEB_PLAYER_API_KEY),
      {
        method:"POST",
        signal:controller.signal,
        cache:"no-store",
        headers:{
          "content-type":"application/json",
          "user-agent":profile.userAgent
        },
        body:JSON.stringify({
          context:{client},
          videoId:id,
          contentCheckOk:true,
          racyCheckOk:true
        })
      }
    );
    if(!res.ok)return null;
    return await res.json().catch(()=>null);
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

async function resolveAspect(id:string){
  const candidates:any[]=[];

  for(const profile of CLIENTS){
    const data=await fetchPlayer(id,profile);
    if(!data)continue;

    const rows=responseCandidates(data);
    candidates.push(...rows);

    const best=pickDimensions(rows);
    if(best?.source==="storyboard"||best?.aspectRatio<.80){
      return {
        video_id:id,
        aspect_ratio:best.aspectRatio,
        width:best.width,
        height:best.height,
        source:best.source+":"+String(profile.clientName||"").toLowerCase(),
        verified:false,
        updated_at:new Date().toISOString()
      };
    }
  }

  const best=pickDimensions(candidates);
  if(!best)return null;

  return {
    video_id:id,
    aspect_ratio:best.aspectRatio,
    width:best.width,
    height:best.height,
    source:best.source||"youtube-player",
    verified:false,
    updated_at:new Date().toISOString()
  };
}

async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>){
  const out=new Array<R>(items.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)return;
      out[i]=await fn(items[i]);
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

function db(){
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  return {
    rest:url?url+"/rest/v1":"",
    headers:{
      "apikey":key,
      "authorization":"Bearer "+key,
      "content-type":"application/json"
    }
  };
}

async function readRows(ids:string[]){
  if(!ids.length)return [];
  const {rest,headers}=db();
  if(!rest)return [];
  const query=ids.map(encodeURIComponent).join(",");
  const res=await fetch(
    rest+"/yt1988_video_meta?video_id=in.("+query+")"+
    "&select=video_id,aspect_ratio,media_kind,width,height,source,verified,updated_at",
    {headers}
  );
  if(!res.ok)return [];
  const rows=await res.json().catch(()=>[]);
  return Array.isArray(rows)?rows:[];
}

async function upsertRow(row:any,{force=false}={}){
  const {rest,headers}=db();
  if(!rest)return null;

  if(!force){
    const existing=await readRows([row.video_id]);
    if(existing[0]?.verified===true)return existing[0];
  }

  const res=await fetch(
    rest+"/yt1988_video_meta?on_conflict=video_id",
    {
      method:"POST",
      headers:{
        ...headers,
        "prefer":"resolution=merge-duplicates,return=representation"
      },
      body:JSON.stringify(row)
    }
  );
  if(!res.ok)return null;
  const rows=await res.json().catch(()=>[]);
  return Array.isArray(rows)?rows[0]||null:null;
}

function publicRow(row:any){
  if(!row)return null;
  const ratio=validAspect(row.aspect_ratio);
  if(!ratio)return null;
  return {
    videoId:String(row.video_id||""),
    aspectRatio:ratio,
    mediaKind:String(row.media_kind||(ratio<1?"portrait":"landscape")),
    videoWidth:Number(row.width)||0,
    videoHeight:Number(row.height)||0,
    aspectSource:String(row.source||""),
    aspectVerified:row.verified===true,
    updatedAt:row.updated_at||null
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});

  if(req.method==="POST"){
    const body=await req.json().catch(()=>null);
    const videoId=String(body?.videoId||body?.id||"").trim();
    const aspectRatio=validAspect(body?.aspectRatio);
    const width=Math.round(Number(body?.width)||0);
    const height=Math.round(Number(body?.height)||0);

    if(!validId(videoId)||!aspectRatio){
      return json({ok:false,error:"invalid_aspect"},400);
    }

    const row=await upsertRow({
      video_id:videoId,
      aspect_ratio:aspectRatio,
      width:width>0?width:null,
      height:height>0?height:null,
      source:"iframe-content-rect",
      verified:true,
      updated_at:new Date().toISOString()
    },{force:true});

    return json({ok:!!row,data:publicRow(row)});
  }

  if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);

  const url=new URL(req.url);
  const ids=[...new Set(
    String(url.searchParams.get("ids")||"")
      .split(",")
      .map(value=>value.trim())
      .filter(validId)
  )].slice(0,24);

  if(!ids.length)return json({ok:true,data:{}});

  let rows=await readRows(ids);
  const byId=new Map(rows.map((row:any)=>[String(row.video_id||""),row]));

  if(url.searchParams.get("resolve")==="1"){
    const missing=ids.filter(id=>!byId.has(id));
    if(missing.length){
      const resolved=await mapLimit(missing,5,resolveAspect);
      for(const row of resolved){
        if(!row)continue;
        const stored=await upsertRow(row);
        if(stored)byId.set(row.video_id,stored);
      }
    }
  }

  const data:any={};
  for(const id of ids){
    const row=publicRow(byId.get(id));
    if(row)data[id]=row;
  }
  return json({ok:true,data});
});
