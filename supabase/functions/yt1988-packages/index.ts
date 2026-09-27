import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods":"GET, POST, OPTIONS",
  "cache-control":"no-store"
};
const PROFILE="owner";
const SYSTEM_SCOPES=new Set(["live","latest","week"]);
const HASHTAG_ID_RE=/^hash_[a-z0-9]+$/;

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"content-type":"application/json; charset=utf-8"}
  });
}
function clean(value:unknown,max=200){
  return String(value||"").replace(/\s+/g," ").trim().slice(0,max);
}

function videoId(row:any){
  const direct=clean(row?.id||row?.videoId||"",64);
  if(/^[A-Za-z0-9_-]{11}$/.test(direct))return direct;
  const url=clean(row?.url||row?.videoUrl||"",500);
  return url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1]||
    url.match(/\/shorts\/([A-Za-z0-9_-]{11})/)?.[1]||
    "";
}

async function enrichItemsWithVideoMeta(rest:string,headers:any,items:any[]){
  const rows=Array.isArray(items)?items:[];
  const ids=[...new Set(rows.map(videoId).filter(Boolean))].slice(0,80);
  if(!ids.length)return rows;

  try{
    const res=await fetch(
      rest+"/yt1988_video_meta?video_id=in.("+ids.map(encodeURIComponent).join(",")+")"+
      "&select=video_id,aspect_ratio,media_kind,width,height,source,verified,updated_at",
      {headers}
    );
    if(!res.ok)return rows;

    const metaRows=await res.json().catch(()=>[]);
    const byId=new Map(
      (Array.isArray(metaRows)?metaRows:[])
        .map((row:any)=>[clean(row?.video_id,64),row])
        .filter(([id]:any)=>!!id)
    );

    const missing=ids.filter(id=>!byId.has(id)).slice(0,24);
    if(missing.length){
      const base=rest.replace(/\/rest\/v1$/,"");
      const warm=fetch(
        base+"/functions/v1/yt1988-video-meta?ids="+
          encodeURIComponent(missing.join(","))+"&resolve=1",
        {
          headers:{
            "apikey":String(headers?.apikey||""),
            "authorization":String(headers?.authorization||"")
          }
        }
      ).catch(()=>null);
      try{(globalThis as any).EdgeRuntime?.waitUntil?.(warm)}catch{}
    }

    return rows.map((item:any)=>{
      const id=videoId(item);
      const meta:any=byId.get(id);
      if(!meta)return item;

      const ratio=Number(meta?.aspect_ratio)||0;
      if(!Number.isFinite(ratio)||ratio<=0)return item;

      return {
        ...item,
        aspectRatio:ratio,
        videoWidth:Number(meta?.width)||0,
        videoHeight:Number(meta?.height)||0,
        mediaKind:clean(meta?.media_kind,16),
        aspectSource:clean(meta?.source,80),
        _aspectVerified:meta?.verified===true,
        _aspectUpdatedAt:meta?.updated_at||null
      };
    });
  }catch{
    return rows;
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);

  const rest=supabaseUrl+"/rest/v1";
  const headers={
    "apikey":serviceKey,
    "authorization":"Bearer "+serviceKey,
    "content-type":"application/json"
  };

  if(req.method==="GET"){
    const url=new URL(req.url);
    const scope=clean(url.searchParams.get("scope"),32);

    if(scope){
      let valid=SYSTEM_SCOPES.has(scope);
      if(!valid&&HASHTAG_ID_RE.test(scope)){
        const check=await fetch(
          rest+"/yt1988_hashtags?profile_key=eq."+encodeURIComponent(PROFILE)+
          "&hashtag_id=eq."+encodeURIComponent(scope)+
          "&enabled=eq.true&select=hashtag_id&limit=1",
          {headers}
        );
        if(check.ok){
          const rows=await check.json();
          valid=Array.isArray(rows)&&rows.length>0;
        }
      }
      if(!valid)return json({ok:false,error:"bad_scope"},400);
      const res=await fetch(
        rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&scope=eq."+encodeURIComponent(scope)+
        "&select=scope,hash,input_hash,source_signature,items,version,updated_at&limit=1",
        {headers}
      );
      if(!res.ok)return json({ok:false,error:"read_failed",detail:await res.text()},502);
      const rows=await res.json();
      const row=Array.isArray(rows)?rows[0]:null;
      if(row&&Array.isArray(row.items)){
        row.items=await enrichItemsWithVideoMeta(rest,headers,row.items);
      }
      return json({ok:true,exists:!!row,package:row||null});
    }

    const res=await fetch(
      rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&select=scope,hash,input_hash,source_signature,version,updated_at&order=scope.asc",
      {headers}
    );
    if(!res.ok)return json({ok:false,error:"read_failed",detail:await res.text()},502);
    const rows=await res.json();
    const hashtagRes=await fetch(
      rest+"/yt1988_hashtags?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&enabled=eq.true&select=hashtag_id",
      {headers}
    );
    const hashtagRows=hashtagRes.ok?await hashtagRes.json():[];
    const validScopes=new Set([
      ...SYSTEM_SCOPES,
      ...(Array.isArray(hashtagRows)?hashtagRows.map((row:any)=>clean(row?.hashtag_id,32)).filter((id:string)=>HASHTAG_ID_RE.test(id)):[])
    ]);

    const manifest:any={};
    for(const row of Array.isArray(rows)?rows:[]){
      const key=clean(row?.scope,32);
      if(!validScopes.has(key))continue;
      manifest[key]={
        hash:clean(row?.hash,80),
        inputHash:clean(row?.input_hash,80),
        sourceSignature:clean(row?.source_signature,200),
        version:Number(row?.version||0),
        updatedAt:row?.updated_at||null
      };
    }
    return json({ok:true,manifest});
  }

  if(req.method==="POST"){
    return json({ok:false,error:"server_owned_packages"},405);
  }

  return json({ok:false,error:"method_not_allowed"},405);
});