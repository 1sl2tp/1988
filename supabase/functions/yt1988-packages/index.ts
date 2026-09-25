import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type, x-1988-pin",
  "access-control-allow-methods":"GET, POST, OPTIONS",
  "cache-control":"no-store"
};
const PROFILE="owner";
const PIN_SHA256="fbdf2bdc4b2a45f3508c8ced68098f58375edbf2fe81ec8fe4b113185670939a";
const SCOPES=new Set(["live","latest","week","news","economy","law","film","music","tech","sports","entertainment"]);

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"content-type":"application/json; charset=utf-8"}
  });
}
async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function clean(value:unknown,max=200){
  return String(value||"").replace(/\s+/g," ").trim().slice(0,max);
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
      if(!SCOPES.has(scope))return json({ok:false,error:"bad_scope"},400);
      const res=await fetch(
        rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
        "&scope=eq."+encodeURIComponent(scope)+
        "&select=scope,hash,input_hash,source_signature,items,version,updated_at&limit=1",
        {headers}
      );
      if(!res.ok)return json({ok:false,error:"read_failed",detail:await res.text()},502);
      const rows=await res.json();
      const row=Array.isArray(rows)?rows[0]:null;
      return json({ok:true,exists:!!row,package:row||null});
    }

    const res=await fetch(
      rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&select=scope,hash,input_hash,source_signature,version,updated_at&order=scope.asc",
      {headers}
    );
    if(!res.ok)return json({ok:false,error:"read_failed",detail:await res.text()},502);
    const rows=await res.json();
    const manifest:any={};
    for(const row of Array.isArray(rows)?rows:[]){
      const key=clean(row?.scope,32);
      if(!SCOPES.has(key))continue;
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