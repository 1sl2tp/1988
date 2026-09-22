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
const trending=(region="VN")=>call("trending",{region});
const search=(q,filter="all")=>call("search",{q,filter});
const searchNext=(q,filter,nextpage)=>call("search_next",{q,filter,nextpage});
const suggestions=async(q)=>{
  const r=await call("suggestions",{q});
  const d=r.data;
  if(Array.isArray(d)&&Array.isArray(d[1]))return d[1];
  return Array.isArray(d)?d:[];
};
const video=(id)=>call("video",{id});
const playlist=(id)=>call("playlist",{id});
const playlistNext=(id,nextpage)=>call("playlist_next",{id,nextpage});
const channel=(id)=>call("channel",{id});
const channelNext=(id,nextpage)=>call("channel_next",{id,nextpage});
const sponsors=(id)=>call("sponsors",{id});
function playerUrl(id){
  const url=new URL("https://www.youtube-nocookie.com/embed/"+encodeURIComponent(id));
  url.searchParams.set("autoplay","1");
  url.searchParams.set("playsinline","1");
  url.searchParams.set("rel","0");
  url.searchParams.set("modestbranding","1");
  url.searchParams.set("iv_load_policy","3");
  url.searchParams.set("enablejsapi","1");
  url.searchParams.set("origin",location.origin);
  return url.toString();
}
function playlistPlayerUrl(id){
  const url=new URL("https://www.youtube-nocookie.com/embed/videoseries");
  url.searchParams.set("list",id);
  url.searchParams.set("autoplay","1");
  url.searchParams.set("playsinline","1");
  url.searchParams.set("rel","0");
  url.searchParams.set("modestbranding","1");
  url.searchParams.set("enablejsapi","1");
  url.searchParams.set("origin",location.origin);
  return url.toString();
}
window.YT1988_API={trending,search,searchNext,suggestions,video,playlist,playlistNext,channel,channelNext,sponsors,playerUrl,playlistPlayerUrl};
