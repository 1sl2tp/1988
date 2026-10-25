'use strict';
// YT-251: read-only public source health probe. Never requests a refresh,
// accesses credentials, or mutates channel/source preferences.
const BASE='https://mstltsunsawqomzniqok.supabase.co/functions/v1/';
async function getJson(path,ms=12000){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),ms);
  try{
    const res=await fetch(BASE+path,{method:'GET',headers:{accept:'application/json'},signal:controller.signal,cache:'no-store'});
    if(!res.ok)throw new Error('HTTP_'+res.status);
    const out=await res.json();
    if(out?.ok===false)throw new Error(String(out.error||'not_ok'));
    return out;
  }finally{clearTimeout(timeout);}
}
function ageHours(date){
  const at=Date.parse(String(date||''));
  return Number.isFinite(at)?Math.round((Date.now()-at)/3600000*10)/10:null;
}
async function run(){
  const status={};
  let lite=null,packages=null;
  try{
    const [state,manifest]=await Promise.all([
      getJson('yt1988-state?view=lite'),
      getJson('yt1988-packages')
    ]);
    lite=state?.state||state;
    packages=manifest?.manifest||{};
    const enabled=(Array.isArray(lite?.hashtags)?lite.hashtags:[])
       .filter(row=>row?.enabled!==false)
       .map(row=>({key:String(row.id||row.hashtag_id||''),label:String(row.label||row.id||'')}));
    const scopes=[{key:'live',label:'Trực tiếp'},{key:'latest',label:'Ngày'},
      {key:'week',label:'Tuần'},...enabled];
    console.log('PUBLIC_SOURCE_HEALTH',JSON.stringify({
      runAt:new Date().toISOString(),
      enabledScopes:scopes.length,customScopes:enabled.length,
      manifestScopes:Object.keys(packages).length
    }));
    for(const entry of scopes){
      const m=packages[entry.key]||null;
      status[entry.key]={label:entry.label,published:!!m?.hash,
        packageAgeHours:ageHours(m?.updatedAt),version:m?.version||0,
        packageCount:null,error:''};
    }
    // Probe in bounded batches, pure GET. Each response is an already stored
    // package; no YouTube scraping or wake action.
    for(let i=0;i<scopes.length;i+=3){
      await Promise.all(scopes.slice(i,i+3).map(async scope=>{
        try{
          const response=await getJson('yt1988-packages?scope='+encodeURIComponent(scope.key));
          const items=response?.package?.items;
          status[scope.key].packageCount=Array.isArray(items)?items.length:
            Array.isArray(items?.items)?items.items.length:null;
          status[scope.key].exists=response.exists===true;
        }catch(e){status[scope.key].error=String(e.message||e).slice(0,110);}
      }));
    }
    try{
      const livePackage=await getJson('yt1988-packages?scope=live');
      const liveItems=Array.isArray(livePackage?.package?.items)?livePackage.package.items:[];
      const liveResponse=await fetch('https://1988-youtube-live-state.taphoa-4ab8161d.workers.dev/youtube/live-now',{method:'GET',cache:'no-store'});
      if(!liveResponse.ok)throw new Error('HTTP_'+liveResponse.status);
      const edge=await liveResponse.json();
      const checked=Number(edge?.checkedAt)||0;
      const edgeItems=Array.isArray(edge.items)?edge.items:[];
      const packageIds=liveItems.map(x=>String(x.id||x.videoId||'')).filter(Boolean);
      const edgeIds=edgeItems.map(x=>String(x.videoId||x.id||'')).filter(Boolean);
      const edgeSet=new Set(edgeIds);
      const packageSet=new Set(packageIds);
      console.log('LIVE_DISCOVERY',JSON.stringify({
        edgeReachable:edge?.ok===true,
        selected:Number(edge?.selected)||0,
        checked:Number(edge?.checked)||0,
        discovered:Number(edge?.discovered)||0,
        live:Number(edge?.live)||0,
        lastCheckedHours:checked>0?Math.round((Date.now()-checked)/3600000*10)/10:null,
        edgeVerified:edgeItems.filter(x=>x.verifiedLive===true&&x.verifiedOwner===true).length,
        packageLive:packageIds.length,
        inBoth:packageIds.filter(id=>edgeSet.has(id)).length,
        edgeOnly:edgeIds.filter(id=>!packageSet.has(id)).length,
        packageOnly:packageIds.filter(id=>!edgeSet.has(id)).length
      }));
      console.log('LIVE_DIAGNOSTIC',JSON.stringify({
        edgeExamples:edgeItems.slice(0,4).map(x=>({id:x.videoId||x.id,
          verifiedLive:x.verifiedLive,verifiedOwner:x.verifiedOwner})),
        packageExamples:liveItems.slice(0,4).map(x=>({id:x.id||x.videoId,
          title:String(x.title||'').slice(0,90)}))
      }));
    }catch(error){console.log('LIVE_DISCOVERY_UNAVAILABLE',String(error?.message||error).slice(0,120));}
    const entries=Object.entries(status).map(([key,value])=>({key,...value}));
    console.log('SOURCE_ROWS',JSON.stringify(entries));
    const missing=entries.filter(x=>!x.published||x.exists===false||x.packageCount===0||x.error);
    console.log('SUMMARY',JSON.stringify({total:entries.length,available:entries.length-missing.length,
      missing:missing.map(x=>({key:x.key,error:x.error,count:x.packageCount,published:x.published})),
      notRefreshedWithinDay:entries.filter(x=>x.packageAgeHours!=null&&x.packageAgeHours>24).map(x=>x.key)}));
  }catch(error){
    console.log('SOURCE_PROBE_UNAVAILABLE',String(error?.message||error).slice(0,150));
    process.exitCode=2;
  }
}
run();
