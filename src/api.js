const BASE="https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988";

async function call(action,params={},options={}){
  const url=new URL(BASE);
  url.searchParams.set("action",action);
  Object.entries(params).forEach(([key,value])=>{
    if(value!==undefined&&value!==null&&String(value)!=="")url.searchParams.set(key,String(value));
  });
  const res=await fetch(url.toString(),{signal:options.signal,cache:"no-store"});
  const body=await res.json().catch(()=>({ok:false,error:"bad_json"}));
  if(!res.ok||body.ok!==true)throw new Error(body.error||("HTTP "+res.status));
  return body;
}
export const trending=(region="VN")=>call("trending",{region});
export const search=(q,filter="all")=>call("search",{q,filter});
export const searchNext=(q,filter,nextpage)=>call("search_next",{q,filter,nextpage});
export const suggestions=async(q)=>{
  const r=await call("suggestions",{q});
  const d=r.data;
  if(Array.isArray(d)&&Array.isArray(d[1]))return d[1];
  return Array.isArray(d)?d:[];
};
export const video=(id)=>call("video",{id});
export const playlist=(id)=>call("playlist",{id});
export const playlistNext=(id,nextpage)=>call("playlist_next",{id,nextpage});
export const channel=(id)=>call("channel",{id});
export const channelNext=(id,nextpage)=>call("channel_next",{id,nextpage});
export const sponsors=(id)=>call("sponsors",{id});
export function playerUrl(id,n=0){
  const url=new URL(BASE);
  url.searchParams.set("action","player");
  url.searchParams.set("id",id);
  url.searchParams.set("n",String(n));
  url.searchParams.set("_",String(Date.now()));
  return url.toString();
}