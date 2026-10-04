const PIPED_APIS=[
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee"
];

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type",
  "access-control-max-age":"86400"
};

const cache=new Map<string,{at:number,source:string,data:any}>();
const CACHE_TTL=5*60*1000;
const EMPTY_TTL=60*1000;
const STALE_TTL=30*60*1000;
const PREFERRED_TTL=20*60*1000;
let preferredApi="";
let preferredUntil=0;
let lastErrorLogAt=0;

function json(data:any,status=200,maxAge=300){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      ...CORS,
      "content-type":"application/json; charset=utf-8",
      "cache-control":`public, max-age=${maxAge}, stale-while-revalidate=1800`
    }
  });
}

function cleanQuery(value:string){
  return String(value||"").normalize("NFC").replace(/\s+/g," ").trim().slice(0,160);
}

function allowedFilter(value:string){
  const filter=String(value||"all").toLowerCase();
  return ["all","videos","channels"].includes(filter)?filter:"all";
}

async function fetchJson(base:string,path:string,timeoutMs=1800){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(base+path,{
      signal:controller.signal,
      headers:{accept:"application/json"}
    });
    if(!res.ok)throw new Error("HTTP "+res.status);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

async function searchPiped(q:string,filter:string){
  const key=filter+"|"+q.toLowerCase();
  const row=cache.get(key);
  const age=row?Date.now()-row.at:Infinity;
  const freshTtl=Array.isArray(row?.data?.items)&&row.data.items.length?CACHE_TTL:EMPTY_TTL;
  if(row&&age<freshTtl)return {source:row.source,data:row.data,cache:"fresh"};

  const candidates:string[]=[];
  if(preferredApi&&Date.now()<preferredUntil)candidates.push(preferredApi);
  for(const base of PIPED_APIS){
    if(candidates.length>=4)break;
    if(!candidates.includes(base))candidates.push(base);
  }

  for(const base of candidates){
    try{
      const path="/search?q="+encodeURIComponent(q)+"&filter="+encodeURIComponent(filter);
      const data=await fetchJson(base,path,1800);
      preferredApi=base;
      preferredUntil=Date.now()+PREFERRED_TTL;
      cache.set(key,{at:Date.now(),source:base,data});
      if(cache.size>80)cache.delete(cache.keys().next().value);
      return {source:base,data,cache:"miss"};
    }catch{}
  }

  if(row&&age<STALE_TTL)return {source:row.source+"#stale",data:row.data,cache:"stale"};
  throw new Error("search_upstream_unavailable");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405,0);

  const url=new URL(req.url);
  const q=cleanQuery(url.searchParams.get("q")||"");
  const filter=allowedFilter(url.searchParams.get("filter")||"all");
  if(q.length<2)return json({ok:true,source:"",data:{items:[],nextpage:null}},200,60);

  try{
    const result=await searchPiped(q,filter);
    return json({ok:true,source:result.source,cache:result.cache,data:result.data},200,300);
  }catch{
    const now=Date.now();
    if(now-lastErrorLogAt>60_000){
      lastErrorLogAt=now;
      console.warn("yt1988_search_upstream_unavailable");
    }
    return json({ok:false,error:"upstream_unavailable"},503,0);
  }
});
