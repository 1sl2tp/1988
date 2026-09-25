import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROFILE="owner";
const SCOPES=[
  "live","latest","week","news","economy","law",
  "film","music","tech","sports","entertainment"
];
const SCOPE_META:any={
  live:{profile:"live",label:"Live",kind:"live"},
  latest:{profile:"day",label:"Ngày",kind:"time"},
  week:{profile:"week",label:"Tuần",kind:"time"},
  news:{profile:"explore",label:"Khám phá",kind:"content"},
  economy:{profile:"review",label:"Review",kind:"content"},
  law:{profile:"comedy",label:"Hài",kind:"content"},
  film:{profile:"short_film",label:"Phim ngắn",kind:"content"},
  music:{profile:"music",label:"Nhạc",kind:"content"},
  tech:{profile:"technology",label:"Công nghệ",kind:"content"},
  sports:{profile:"sports",label:"Thể thao",kind:"content"},
  entertainment:{profile:"showbiz",label:"Showbiz",kind:"content"}
};
const CONTENT_SCOPES=new Set(SCOPES.filter((s)=>SCOPE_META[s]?.kind==="content"));
const DAY_MS=24*60*60*1000;
const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods":"POST, OPTIONS",
  "cache-control":"no-store"
};

function json(data:any,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"content-type":"application/json; charset=utf-8"}
  });
}
function clean(value:any,max=1000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function normalizeText(value:any){
  return clean(value,600)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d").replace(/Đ/g,"D")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function fastHash(value:any){
  let hash=2166136261;
  const text=String(value??"");
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}
function videoId(row:any){
  const direct=clean(row?.id||row?.videoId||"",64);
  if(/^[A-Za-z0-9_-]{11}$/.test(direct))return direct;
  const url=clean(row?.url||row?.videoUrl||"",500);
  return url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1]||"";
}
function channelId(row:any){
  const direct=clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180);
  if(/^UC[A-Za-z0-9_-]+$/.test(direct))return direct;
  const url=clean(row?.uploaderUrl||row?.channelUrl||"",500);
  return url.match(/\/channel\/(UC[A-Za-z0-9_-]+)/i)?.[1]||"";
}
function isLive(row:any){
  return row?.isLive===true||Number(row?.duration)<0||Number(row?.uploaded)===-1;
}
function ageMs(row:any){
  if(isLive(row))return -1;
  const value=Number(row?.uploaded||row?.published||row?.publishedAt||0);
  if(Number.isFinite(value)&&value>0){
    const ms=value<1e12?value*1000:value;
    return Math.max(0,Date.now()-ms);
  }
  const parsed=Date.parse(clean(row?.uploadDate||row?.uploadedDate||row?.publishedText||"",100));
  return Number.isFinite(parsed)?Math.max(0,Date.now()-parsed):Number.MAX_SAFE_INTEGER;
}
function publishedText(row:any){
  return clean(row?.publishedText||row?.uploadDate||row?.uploadedDate||"",120);
}
function normalizeRow(row:any,source:any={}){
  const id=videoId(row);
  if(!id)return null;
  const sid=clean(source?.id||channelId(row),180);
  const sname=clean(source?.name||row?.uploaderName||row?.uploader||row?.channelName||"",180);
  return {
    ...row,
    id,
    videoId:id,
    title:clean(row?.title||"",300),
    thumbnail:clean(row?.thumbnail||row?.thumbnailUrl||row?.thumbnail_url||"",1000),
    thumbnailUrl:clean(row?.thumbnailUrl||row?.thumbnail||row?.thumbnail_url||"",1000),
    uploader:clean(row?.uploader||row?.uploaderName||sname,180),
    uploaderName:clean(row?.uploaderName||row?.uploader||sname,180),
    channelId:sid||clean(row?.channelId||row?.uploaderId||"",180),
    _sourceId:sid,
    _sourceName:sname,
    isLive:isLive(row),
    publishedText:publishedText(row),
    views:Number(row?.views)||0,
    duration:Number(row?.duration)||0
  };
}
function dedupeRows(rows:any[]){
  const ids=new Set<string>();
  const titleHashes=new Set<string>();
  const out:any[]=[];
  for(const row of rows){
    const id=videoId(row);
    if(!id||ids.has(id))continue;
    const title=normalizeText(row?._displayTitle||row?.title||"");
    const th=title.length>=16?fastHash(title):"";
    if(th&&titleHashes.has(th))continue;
    ids.add(id);
    if(th)titleHashes.add(th);
    out.push(row);
  }
  return out;
}
function strongAd(row:any){
  const title=clean(row?._displayTitle||row?.title||"",260);
  const norm=normalizeText(title);
  const phone=/(?:^|[^\d])(?:\+?84|0)(?:3|5|7|8|9)(?:[\s.\-]?\d){8}(?:[^\d]|$)/u.test(title);
  const url=/(?:https?:\/\/|www\.|(?:^|\s)[a-z0-9-]+\.(?:com|net|org|vn|me|io|cc|xyz)(?:\s|\/|$))/iu.test(title);
  const promo=/\b(?:giftcode|coupon|voucher|ma giam gia|ma khuyen mai|nhap ma|code tan thu|code nhan qua|ma nhan qua|affiliate)\b/u.test(norm);
  const contact=/\b(?:zalo|telegram|whatsapp|hotline|lien he|inbox|ib)\b/u.test(norm);
  const handle=/(?:^|\s)@[a-z0-9_.-]{4,}/iu.test(title);
  return phone||url||promo||(contact&&handle);
}
function reviewCleanTitle(value:any){
  const original=clean(value,300);
  if(!original)return "";
  const title=original
    .replace(/https?:\/\/\S+|www\.\S+/giu," ")
    .replace(/(?:#[\p{L}\p{N}_-]+\s*)+$/gu," ")
    .replace(/^\s*(?:review\s*phim|phim\s*review|tóm\s*tắt\s*phim|tom\s*tat\s*phim|movie\s*recap)\s*[:|\-–—]*\s*/iu,"")
    .replace(/\b(?:full\s*tập|full\s*tap|trọn\s*bộ|tron\s*bo|vietsub|thuyết\s*minh|thuyet\s*minh)\b/giu," ")
    .replace(/([!?.,])\1{1,}/g,"$1")
    .replace(/\s{2,}/g," ")
    .replace(/^[\s|:;\-–—]+|[\s|:;\-–—]+$/g,"")
    .trim();
  return title.length>=10?title:original;
}
function sourceSignature(rows:any[],scope:string){
  return rows
    .filter((r)=>r.scope===scope&&r.status==="selected")
    .map((r)=>clean(r.channel_id,180))
    .filter(Boolean)
    .filter((id)=>!rows.some((b)=>b.scope===scope&&b.channel_id===id&&b.status==="blocked"))
    .sort()
    .join("|");
}
function snapshotRowsHash(rows:any[],sourceSig=""){
  const body=rows.slice(0,90).map((row)=>[
    videoId(row),
    clean(row?._displayTitle||row?.title||"",300),
    publishedText(row),
    clean(row?._sourceId||row?.channelId||row?.uploaderId||"",180),
    isLive(row)?"1":"0"
  ].join("|")).join("\n");
  return fastHash(String(sourceSig||"")+"\n"+body);
}
function sortRows(rows:any[]){
  return rows.slice().sort((a,b)=>{
    const aa=ageMs(a),bb=ageMs(b);
    if(aa!==bb)return aa-bb;
    return (Number(b?.views)||0)-(Number(a?.views)||0);
  });
}
async function fetchJson(url:string,headers:any={},timeout=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const res=await fetch(url,{headers,cache:"no-store",signal:controller.signal});
    const data=await res.json().catch(()=>null);
    if(!res.ok||data?.ok===false)throw new Error(data?.error||("HTTP "+res.status));
    return data;
  }finally{clearTimeout(timer);}
}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>){
  const out=new Array<R>(items.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)return;
      out[i]=await fn(items[i],i);
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

async function claimLease(rest:string,headers:any){
  const res=await fetch(rest+"/rpc/yt1988_try_refresh_lock",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_lease_seconds:110})
  });
  if(!res.ok)return false;
  return (await res.json())===true;
}
async function finishLease(rest:string,headers:any,ok:boolean,error=""){
  await fetch(rest+"/rpc/yt1988_finish_refresh",{
    method:"POST",headers,
    body:JSON.stringify({p_profile_key:PROFILE,p_ok:ok,p_error:clean(error,1000)})
  }).catch(()=>{});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);

  const rest=supabaseUrl+"/rest/v1";
  const authHeaders={
    "apikey":serviceKey,
    "authorization":"Bearer "+serviceKey,
    "content-type":"application/json"
  };

  let body:any={};
  try{body=await req.json();}catch{}
  const requested=new Set(
    (Array.isArray(body?.scopes)?body.scopes:[])
      .map((s:any)=>clean(s,32))
      .filter((s:string)=>SCOPES.includes(s))
  );
  const scopes=requested.size?[...requested]:SCOPES.slice();

  if(!await claimLease(rest,authHeaders)){
    return json({ok:true,skipped:true,reason:"refresh_already_running"});
  }

  let ok=false;
  let failure="";
  try{
    const stateRes=await fetch(
      rest+"/yt1988_source_state?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&scope=in.("+SCOPES.map(encodeURIComponent).join(",")+")"+
      "&select=scope,channel_id,status,name,thumbnail_url,subscribers",
      {headers:authHeaders}
    );
    if(!stateRes.ok)throw new Error("source_state_read_failed");
    const stateRows=await stateRes.json();
    const rows=Array.isArray(stateRows)?stateRows:[];

    const packageRes=await fetch(
      rest+"/yt1988_packages?profile_key=eq."+encodeURIComponent(PROFILE)+
      "&select=scope,hash,input_hash,source_signature,version",
      {headers:authHeaders}
    );
    if(!packageRes.ok)throw new Error("package_manifest_read_failed");
    const packageRows=await packageRes.json();
    const currentByScope=new Map((Array.isArray(packageRows)?packageRows:[]).map((r:any)=>[r.scope,r]));

    const blockedByScope=new Map<string,Set<string>>();
    const selectedByScope=new Map<string,any[]>();
    const channelMeta=new Map<string,any>();

    for(const scope of SCOPES){
      blockedByScope.set(scope,new Set());
      selectedByScope.set(scope,[]);
    }
    for(const row of rows){
      const scope=clean(row?.scope,32);
      const id=clean(row?.channel_id,180);
      if(!SCOPES.includes(scope)||!id)continue;
      if(row?.status==="blocked"){
        blockedByScope.get(scope)?.add(id);
      }else if(row?.status==="selected"){
        selectedByScope.get(scope)?.push({
          id,
          name:clean(row?.name,180)||id,
          thumbnailUrl:clean(row?.thumbnail_url,1000)
        });
      }
      if(!channelMeta.has(id)){
        channelMeta.set(id,{
          id,
          name:clean(row?.name,180)||id,
          thumbnailUrl:clean(row?.thumbnail_url,1000)
        });
      }
    }

    for(const scope of SCOPES){
      const blocked=blockedByScope.get(scope)||new Set();
      selectedByScope.set(
        scope,
        (selectedByScope.get(scope)||[]).filter((s:any)=>!blocked.has(s.id))
      );
    }

    const neededIds=[...new Set(
      scopes.flatMap((scope)=>selectedByScope.get(scope)||[]).map((s:any)=>s.id)
    )];
    const channelRows=new Map<string,any[]>();
    const channelFetchOk=new Set<string>();

    await mapLimit(neededIds,10,async(id)=>{
      const source=channelMeta.get(id)||{id,name:id};
      try{
        const url=supabaseUrl+"/functions/v1/yt1988?action=channel&id="+encodeURIComponent(id);
        const result=await fetchJson(url,{
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },6500);
        const data=result?.data||{};
        const raw=Array.isArray(data?.relatedStreams)
          ?data.relatedStreams
          :Array.isArray(data?.items)?data.items:[];
        channelRows.set(
          id,
          raw.map((row:any)=>normalizeRow(row,source)).filter(Boolean).slice(0,30)
        );
        channelFetchOk.add(id);
      }catch(error){
        console.warn("channel refresh failed",id,String(error));
        channelRows.set(id,[]);
      }
      return true;
    });

    let globalLive:any[]=[];
    if(scopes.includes("live")){
      try{
        const url=supabaseUrl+"/functions/v1/yt1988?action=search&q="+
          encodeURIComponent("trực tiếp")+"&filter=videos";
        const result=await fetchJson(url,{
          "apikey":serviceKey,
          "authorization":"Bearer "+serviceKey
        },7000);
        const raw=Array.isArray(result?.data?.items)?result.data.items:
          Array.isArray(result?.data)?result.data:[];
        globalLive=raw.map((r:any)=>normalizeRow(r,{})).filter((r:any)=>r&&isLive(r));
      }catch{}
    }

    const results:any[]=[];
    for(let scopeIndex=0;scopeIndex<scopes.length;scopeIndex++){
      const scope=scopes[scopeIndex];
      const meta=SCOPE_META[scope]||{profile:"general",label:scope,kind:"content"};
      const selected=selectedByScope.get(scope)||[];
      const blocked=blockedByScope.get(scope)||new Set<string>();
      const selectedIds=new Set(selected.map((s:any)=>s.id));

      // Never replace a healthy shared package with a partial outage. A scope
      // refresh needs a majority of its selected channels to have answered.
      if(selected.length){
        const okCount=selected.filter((s:any)=>channelFetchOk.has(s.id)).length;
        const minOk=Math.max(1,Math.ceil(selected.length*.6));
        if(okCount<minOk){
          results.push({
            scope,
            changed:false,
            reason:"insufficient_channel_refresh",
            okChannels:okCount,
            selectedChannels:selected.length
          });
          continue;
        }
      }

      let raw:any[]=[];

      for(const source of selected){
        for(const row of channelRows.get(source.id)||[]){
          if(blocked.has(source.id))continue;
          raw.push(row);
        }
      }

      if(scope==="live"){
        const selectedLive=raw.filter(isLive);
        const global=globalLive.filter((row:any)=>{
          const sid=channelId(row);
          return !sid||!blocked.has(sid);
        });
        raw=[
          ...selectedLive.map((r:any)=>({...r,_interestPriority:selectedIds.has(channelId(r))?1:0})),
          ...global
        ];
        raw=dedupeRows(raw).sort((a:any,b:any)=>
          (Number(b?._interestPriority)||0)-(Number(a?._interestPriority)||0)
        );
      }else if(scope==="latest"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<DAY_MS;
        });
      }else if(scope==="week"){
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=DAY_MS&&age<7*DAY_MS;
        });
      }else{
        raw=raw.filter((r:any)=>{
          const age=ageMs(r);
          return !isLive(r)&&Number.isFinite(age)&&age>=0&&age<7*DAY_MS;
        });
      }

      if(meta.kind!=="live")raw=sortRows(raw);
      raw=dedupeRows(raw)
        .filter((r:any)=>meta.kind!=="content"||!strongAd(r))
        .slice(0,90);

      if(meta.profile==="review"){
        raw=raw.map((r:any)=>{
          const title=reviewCleanTitle(r?._displayTitle||r?.title||"");
          return title&&title!==r?.title?{...r,_displayTitle:title}:r;
        });
      }

      const sig=sourceSignature(rows,scope);
      const policyKey="server-scope-policy-v4:"+meta.profile;
      const rawHash=snapshotRowsHash(raw,sig);
      const inputHash=fastHash(rawHash+"|"+policyKey);
      const current=currentByScope.get(scope);

      if(current?.input_hash===inputHash&&current?.source_signature===sig){
        results.push({scope,changed:false,reason:"same_input"});
        continue;
      }

      let packaged=raw;
      if(raw.length>=4){
        try{
          const aiRes=await fetch(supabaseUrl+"/functions/v1/yt1988-topics",{
            method:"POST",
            headers:{
              ...authHeaders,
              "content-type":"application/json"
            },
            body:JSON.stringify({
              mode:"dedupe",
              scope,
              parentLabel:meta.label,
              contentProfile:meta.profile,
              reviewMode:meta.profile==="review",
              videos:raw.slice(0,120).map((r:any)=>({
                id:videoId(r),
                title:clean(r?.title,300),
                channel:clean(r?.uploaderName||r?.uploader||r?._sourceName,180),
                published:publishedText(r),
                views:Number(r?.views)||0,
                duration:Number(r?.duration)||0,
                description:clean(r?.description||r?.shortDescription||"",1200),
                contentHash:fastHash(normalizeText(r?._displayTitle||r?.title||""))
              }))
            })
          });
          const payload=await aiRes.json().catch(()=>null);
          if(aiRes.ok&&payload?.ok!==false){
            const allowed=new Set(raw.map(videoId));
            const keep=new Set(
              (Array.isArray(payload?.keepVideoIds)?payload.keepVideoIds:[])
                .map((id:any)=>clean(id,32)).filter((id:string)=>allowed.has(id))
            );
            const cleanup=new Map(
              (Array.isArray(payload?.cleanups)?payload.cleanups:[])
                .map((x:any)=>[clean(x?.id,32),clean(x?.displayTitle,180)])
                .filter(([id,title]:any)=>allowed.has(id)&&title.length>=8)
            );
            if(keep.size)packaged=raw.filter((r:any)=>keep.has(videoId(r)));
            packaged=packaged.map((r:any)=>{
              const title=cleanup.get(videoId(r));
              return title?{...r,_displayTitle:title}:r;
            });
          }
        }catch(error){
          console.warn("ai package failed",scope,String(error));
        }
      }

      packaged=dedupeRows(packaged).slice(0,90);
      if(!packaged.length){
        results.push({scope,changed:false,reason:"empty_after_filter"});
        continue;
      }

      const hash=snapshotRowsHash(packaged,sig);
      if(current?.hash===hash&&current?.input_hash===inputHash&&current?.source_signature===sig){
        results.push({scope,changed:false,reason:"same_package"});
        continue;
      }

      const version=Date.now()*100+scopeIndex;
      const rpc=await fetch(rest+"/rpc/yt1988_set_package",{
        method:"POST",
        headers:authHeaders,
        body:JSON.stringify({
          p_profile_key:PROFILE,
          p_scope:scope,
          p_hash:hash,
          p_input_hash:inputHash,
          p_source_signature:sig,
          p_items:packaged,
          p_version:version
        })
      });
      if(!rpc.ok)throw new Error("package_write_failed:"+scope+":"+await rpc.text());
      results.push({scope,changed:true,items:packaged.length,hash});
    }

    ok=true;
    await finishLease(rest,authHeaders,true,"");
    return json({ok:true,scopes:results});
  }catch(error){
    failure=String((error as any)?.message||error||"refresh_failed");
    await finishLease(rest,authHeaders,false,failure);
    return json({ok:false,error:failure},500);
  }
});