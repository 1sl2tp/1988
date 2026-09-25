import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL=String(Deno.env.get("SUPABASE_URL")||"").trim();
const SERVICE_KEY=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const ORIGIN="https://yt.taphoa.xyz";
const cors={
  "access-control-allow-origin":ORIGIN,
  "access-control-allow-headers":"authorization, apikey, x-client-info, content-type",
  "access-control-allow-methods":"POST, OPTIONS",
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
};

const clean=(value:unknown,max=240)=>String(value??"").replace(/\s+/g," ").trim().slice(0,max);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

function responseText(payload:any){
  const parts=payload?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts))return "";
  return parts.map((part:any)=>String(part?.text||"")).join("").trim();
}

function parseJson(text:string){
  const raw=String(text||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  return JSON.parse(raw);
}

async function runtimeConfig(){
  const result=await db.rpc("getlink_ai_runtime_config_gemini");
  if(result.error)throw result.error;
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    model:clean(row?.model_name,120)||"gemini-3.5-flash-lite",
    key:String(row?.gemini_api_key||"").trim(),
  };
}

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function normalizeVideos(input:any){
  const rows=Array.isArray(input)?input:[];
  const seen=new Set<string>();
  const out:any[]=[];
  for(const row of rows){
    const id=clean(row?.id,32);
    if(!/^[A-Za-z0-9_-]{11}$/.test(id)||seen.has(id))continue;
    seen.add(id);
    out.push({
      id,
      title:clean(row?.title,220),
      channel:clean(row?.channel,120),
      published:clean(row?.published,80),
      views:Number.isFinite(Number(row?.views))?Math.max(0,Math.round(Number(row.views))):0,
      duration:Number.isFinite(Number(row?.duration))?Math.max(0,Math.round(Number(row.duration))):0,
      isLive:row?.isLive===true,
      contentHash:clean(row?.contentHash,64),
      description:clean(row?.description,1800),
      howMade:clean(row?.howMade,800),
    });
    if(out.length>=120)break;
  }
  return out;
}

function normalizeSourceNames(input:any,max=24){
  const rows=Array.isArray(input)?input:[];
  const out:string[]=[];
  const seen=new Set<string>();
  for(const value of rows){
    const name=clean(value,100);
    const key=name.toLocaleLowerCase("vi-VN");
    if(!name||name.length<2||seen.has(key))continue;
    seen.add(key);
    out.push(name);
    if(out.length>=max)break;
  }
  return out;
}

function normalizeSourceCandidates(input:any){
  const rows=Array.isArray(input)?input:[];
  const out:any[]=[];
  const seen=new Set<string>();
  for(const row of rows){
    const id=clean(row?.id,64);
    const name=clean(row?.name,120);
    if(!/^UC[A-Za-z0-9_-]+$/.test(id)||!name||seen.has(id))continue;
    seen.add(id);
    const samples=(Array.isArray(row?.samples)?row.samples:[])
      .map((sample:any)=>({
        title:clean(sample?.title,220),
        published:clean(sample?.published,80),
        views:Number.isFinite(Number(sample?.views))?Math.max(0,Math.round(Number(sample.views))):0
      }))
      .filter((sample:any)=>sample.title)
      .slice(0,4);
    if(!samples.length)continue;
    out.push({id,name,samples});
    if(out.length>=48)break;
  }
  return out;
}

function validateSourceDiscoveryResult(value:any,candidates:any[]){
  const allowed=new Set(candidates.map(row=>row.id));
  return {
    acceptedSourceIds:[...new Set(
      (Array.isArray(value?.acceptedSourceIds)?value.acceptedSourceIds:[])
        .map((id:any)=>clean(id,64))
        .filter((id:string)=>allowed.has(id))
    )].slice(0,24)
  };
}
function compactCatalogLabel(value:any){
  const raw=clean(value,28).replace(/\s+/g," ").trim();
  if(!raw)return "";
  const norm=raw.toLocaleLowerCase("vi-VN");

  const canonical:[RegExp,string][]=[
    [/nhạc|âm nhạc/u,"Nhạc"],
    [/phim|điện ảnh/u,"Phim"],
    [/thời sự|tin tức/u,"Thời sự"],
    [/pháp luật|an ninh/u,"Pháp luật"],
    [/kinh tế|thị trường/u,"Kinh tế"],
    [/thể thao/u,"Thể thao"],
    [/công nghệ|khoa học/u,"Công nghệ"],
    [/giải trí|showbiz|sự kiện/u,"Giải trí"],
    [/đời sống/u,"Đời sống"],
    [/thời tiết|môi trường/u,"Thời tiết"],
  ];

  // Keep genuinely short AI names such as "Du lịch", "Game", "Xe".
  const words=raw.split(/\s+/).filter(Boolean);
  const hasJoiner=/[&/+|]|\bvà\b/iu.test(raw);
  if(!hasJoiner&&words.length<=2&&raw.length<=16)return raw;

  for(const [pattern,label] of canonical){
    if(pattern.test(norm))return label;
  }

  return words.slice(0,2).join(" ").slice(0,16);
}

function validateCatalog(value:any){
  const source=Array.isArray(value?.parents)?value.parents:Array.isArray(value?.categories)?value.categories:[];
  const parents:any[]=[];
  const seen=new Set<string>();

  for(const row of source){
    const label=compactCatalogLabel(row?.label);
    if(!label)continue;
    const norm=label.toLocaleLowerCase("vi-VN");
    if(seen.has(norm))continue;

    const queries=[...new Set(
      (Array.isArray(row?.queries)?row.queries:[])
        .map((q:any)=>clean(q,80))
        .filter((q:string)=>q.length>=2)
    )].slice(0,6);

    const hints=[...new Set(
      (Array.isArray(row?.hints)?row.hints:[])
        .map((q:any)=>clean(q,48))
        .filter((q:string)=>q.length>=2)
    )].slice(0,12);

    if(queries.length<2)continue;
    seen.add(norm);
    parents.push({label,queries,hints});
    if(parents.length>=9)break;
  }

  const ensureParent=(fallback:any)=>{
    const norm=fallback.label.toLocaleLowerCase("vi-VN");
    if(parents.some(row=>String(row.label||"").toLocaleLowerCase("vi-VN")===norm))return;
    if(parents.length>=9)parents.pop();
    parents.push(fallback);
  };

  ensureParent({
    label:"Nhạc",
    queries:["MV mới","nhạc mới","live session","nhạc tự sáng tác","cover remix"],
    hints:["MV","audio","live","phòng trà","indie","cover","remix"]
  });
  ensureParent({
    label:"Phim",
    queries:[
      "phim ngắn Trung Quốc review",
      "phim trọng sinh xuyên không hệ thống",
      "phim mắt thần thấu thị giám bảo",
      "phim long soái chiến thần thần y",
      "phim ở rể giả nghèo nữ tổng tài",
      "phim hệ thống hoàn thưởng không gian thần cấp"
    ],
    hints:[
      "phim ngắn","Trung Quốc","tổng tài","xuyên không","trọng sinh","hệ thống",
      "hoàn thưởng","mắt thần","thấu thị","giám bảo","long soái","chiến thần"
    ]
  });

  const film=parents.find(row=>String(row.label||"").toLocaleLowerCase("vi-VN")==="phim");
  if(film){
    film.queries=[...new Set([
      ...(Array.isArray(film.queries)?film.queries:[]),
      "phim ngắn Trung Quốc review",
      "phim trọng sinh xuyên không hệ thống",
      "phim mắt thần thấu thị giám bảo",
      "phim long soái chiến thần thần y",
      "phim ở rể giả nghèo nữ tổng tài",
      "phim hệ thống hoàn thưởng không gian thần cấp"
    ])].slice(0,6);
    film.hints=[...new Set([
      ...(Array.isArray(film.hints)?film.hints:[]),
      "phim ngắn","Trung Quốc","tổng tài","xuyên không","trọng sinh","hệ thống",
      "hoàn thưởng","mắt thần","thấu thị","giám bảo","long soái","chiến thần"
    ])].slice(0,12);
  }

  return {parents:parents.slice(0,9)};
}

function validateResult(value:any,videos:any[]){
  const allowedIds=new Set(videos.map(row=>row.id));

  const parentRows=Array.isArray(value?.parents)?value.parents:[];
  const parents:any[]=[];
  const seenParent=new Set<string>();
  const parentByNorm=new Map<string,string>();

  for(const row of parentRows){
    const label=clean(row?.label,28);
    if(!label)continue;
    const norm=label.toLocaleLowerCase("vi-VN");
    if(seenParent.has(norm))continue;

    const ids=[...new Set((Array.isArray(row?.videoIds)?row.videoIds:[])
      .map((id:any)=>clean(id,32))
      .filter((id:string)=>allowedIds.has(id)))];

    if(ids.length<2)continue;
    seenParent.add(norm);
    parentByNorm.set(norm,label);
    parents.push({label,videoIds:ids});
    if(parents.length>=9)break;
  }

  const topicRows=Array.isArray(value?.topics)?value.topics:[];
  const topics:any[]=[];
  const seenLabel=new Set<string>();

  for(const row of topicRows){
    const label=clean(row?.label,48);
    if(!label)continue;
    const norm=label.toLocaleLowerCase("vi-VN");
    if(seenLabel.has(norm))continue;

    const ids=[...new Set((Array.isArray(row?.videoIds)?row.videoIds:[])
      .map((id:any)=>clean(id,32))
      .filter((id:string)=>allowedIds.has(id)))];

    if(ids.length<2)continue;
    const parentRaw=clean(row?.parent,28).toLocaleLowerCase("vi-VN");
    const parent=parentByNorm.get(parentRaw)||clean(row?.parent,28);
    seenLabel.add(norm);
    topics.push({label,parent,videoIds:ids});
    if(topics.length>=10)break;
  }

  const meta=new Map<string,any>();
  for(const row of Array.isArray(value?.cleanups)?value.cleanups:[]){
    const id=clean(row?.id,32);
    if(!allowedIds.has(id))continue;
    const displayTitle=clean(row?.displayTitle,160);
    const displaySource=clean(row?.displaySource,80);
    if(!displayTitle&&!displaySource)continue;
    meta.set(id,{id,displayTitle,displaySource,duplicateGroup:null});
  }

  let groupIndex=0;
  for(const group of Array.isArray(value?.duplicates)?value.duplicates:[]){
    const ids=[...new Set((Array.isArray(group?.videoIds)?group.videoIds:[])
      .map((id:any)=>clean(id,32))
      .filter((id:string)=>allowedIds.has(id)))];
    if(ids.length<2)continue;
    groupIndex+=1;
    const groupId="g"+groupIndex;
    for(const id of ids){
      const current=meta.get(id)||{id,displayTitle:"",displaySource:"",duplicateGroup:null};
      current.duplicateGroup=groupId;
      meta.set(id,current);
    }
  }

  // Conservative client hash: identical normalized-content hashes are exact
  // duplicate candidates even before the model notices them.
  const byHash=new Map<string,string[]>();
  for(const row of videos){
    const hash=clean(row?.contentHash,64);
    if(!hash)continue;
    const ids=byHash.get(hash)||[];
    ids.push(row.id);
    byHash.set(hash,ids);
  }
  for(const [hash,ids] of byHash){
    if(ids.length<2)continue;
    const groupId="h"+hash.slice(0,24);
    for(const id of ids){
      const current=meta.get(id)||{id,displayTitle:"",displaySource:"",duplicateGroup:null};
      current.duplicateGroup=groupId;
      meta.set(id,current);
    }
  }

  const acceptedVideoIds=[...new Set(
    (Array.isArray(value?.acceptedVideoIds)?value.acceptedVideoIds:videos.map(row=>row.id))
      .map((id:any)=>clean(id,32))
      .filter((id:string)=>allowedIds.has(id))
  )];

  const aiGeneratedLikelyIds=[...new Set(
    (Array.isArray(value?.aiGeneratedLikelyIds)?value.aiGeneratedLikelyIds:[])
      .map((id:any)=>clean(id,32))
      .filter((id:string)=>allowedIds.has(id))
  )];

  return {parents,topics,videos:[...meta.values()],acceptedVideoIds,aiGeneratedLikelyIds};
}

const SHORT_DRAMA_REFERENCE=`
MẪU NGÔN NGỮ PHIM NGẮN TRUNG QUỐC THỰC TẾ (tham chiếu từ kiểu tiêu đề phổ biến của các kênh review như Điêu Thuyền Review):
- trọng sinh / trùng sinh / kiếp trước / làm lại cuộc đời
- xuyên không / xuyên về quá khứ / dị giới / trở về cổ đại
- thức tỉnh / kích hoạt hệ thống / hệ thống tỷ phú / hệ thống hẹn hò / hệ thống bỉm sữa / hệ thống giám bảo
- hệ thống hoàn thưởng / phần thưởng / nhiệm vụ / điểm thưởng / buff năng lực
- mắt thần / thấu thị / nhìn xuyên / giám định / giám bảo / đổ thạch / cổ vật / phỉ thúy / ngọc
- không gian thần cấp / kho báu / truyền thừa / dị năng / năng lực đặc biệt
- tổng tài / nữ tổng tài / chủ tịch / tỷ phú / thiếu gia / thiên kim
- ở rể / chui gầm chạn / bị coi thường / phế vật / giả nghèo / ẩn danh / vả mặt / đổi đời
- long soái / điện chủ / chiến thần / thần y / đạo sĩ xuống núi / cao thủ ẩn danh
- nữ đế / mỹ nữ cổ đại / tu tiên / tiên hiệp / cổ trang / ngôn tình
- học đường / trùm trường / hoa khôi / sinh viên nghèo / ký túc xá
- cắm sừng / hủy hôn / bị phản bội / báo thù / nhận con thất lạc / cưới giả thành thật

Đây là CỤM MẪU MỞ, không phải từ điển đóng. Hãy học cấu trúc ngữ nghĩa của chúng để nhận ra motif mới tương tự.
Đặc biệt: "hệ thống", "AI", "công nghệ", "chip"... chỉ được xếp Công nghệ khi ngữ cảnh thật sự là kỹ thuật. Nếu "hệ thống" đi cùng trọng sinh, xuyên không, tỷ phú, tổng tài, mắt thần, hoàn thưởng, nhiệm vụ, ở rể, tu tiên... thì đó là motif phim/truyện.
`;

async function callCatalogGemini(cfg:any,videos:any[]){
  const nowVN=new Intl.DateTimeFormat("vi-VN",{
    timeZone:"Asia/Ho_Chi_Minh",
    dateStyle:"full",
    timeStyle:"short"
  }).format(new Date());

  const instruction=`
Bạn đang xây menu khám phá video cho ứng dụng 1988 dành cho người xem Việt Nam.
Thời điểm hiện tại tại Việt Nam: ${nowVN}.

Hãy nhìn toàn bộ mẫu video YouTube hiện tại bên dưới (nếu mẫu ít thì vẫn dùng hiểu biết chung về hành vi xem video tại Việt Nam) và tự thiết kế MENU CHA + CÁCH TÌM cho nội dung mới.

${SHORT_DRAMA_REFERENCE}

YÊU CẦU MENU CHA
- Tạo 7-9 danh mục cha ngắn, tự nhiên, quen thuộc với người Việt.
- Tên cha BẮT BUỘC chỉ 1-2 từ, ưu tiên 1 từ; KHÔNG dùng "&", "/", "+", "và" để ghép hai ý. Ví dụ đúng: "Thời sự", "Pháp luật", "Kinh tế", "Thể thao", "Công nghệ", "Giải trí", "Nhạc", "Phim". Ví dụ sai: "Tin tức & Thời sự", "Kinh tế & Thị trường", "Công nghệ & Khoa học".
- "Nhạc" và "Phim" là hai hệ sinh thái lớn và BẮT BUỘC phải có thành hai cha riêng, dù mẫu video hiện tại đang thiên về tin tức. "Phim ngắn", "tổng tài", "xuyên không"... là nhánh tìm kiếm bên trong "Phim", không được làm mất cha "Phim".
- KHÔNG dùng "LIVE", "Mới nhất", "Tuần này", "Hôm nay", "Trend" làm danh mục cha vì ứng dụng đã có các chế độ đó.
- Không tạo hai danh mục đồng nghĩa hoặc quá gần nhau.
- Danh mục cha là các hệ sinh thái RỘNG để duyệt nội dung, không phải tiêu đề mô tả. Các ý hẹp như "Thị trường", "Khoa học", "Sự kiện", "Môi trường", "Phim ngắn" nên nằm trong queries/hints hoặc nhánh con thay vì kéo dài tên cha.
- Không thiên lệch chỉ sang tin tức. Mẫu hiện tại chỉ là tín hiệu để AI hiểu xu hướng, KHÔNG phải giới hạn khiến menu bỏ mất Nhạc hoặc Phim.
- Nếu đang đúng mùa/sự kiện ở Việt Nam (Tết, Noel, Trung thu, lễ lớn, giải thể thao, mùa phim...) và tín hiệu đủ mạnh thì có thể sinh một nhóm ngắn phù hợp; hết mùa thì không cần giữ.
- Sắp xếp danh mục theo mức hữu ích/độ phủ của dòng video hiện tại.

YÊU CẦU TÌM KIẾM TỰ ĐỘNG
- Mỗi danh mục trả 3-6 truy vấn tìm kiếm khác nhau để ứng dụng tự tìm video mới trên YouTube.
- Không chỉ lặp lại tên danh mục. Hãy mở rộng theo hệ sinh thái nội dung thật.
- Ví dụ với Nhạc phải biết tìm ca sĩ/label phát hành chính thức, MV/audio mới, live/phòng trà, nghệ sĩ độc lập/tự đăng, remix/cover khi phù hợp.
- Ví dụ với Phim phải biết mở rộng phim mới, phim bộ/lẻ, phim ngắn Trung Hoa, tổng tài, xuyên không, trọng sinh, cổ trang, trailer/tin phim... tùy tín hiệu hiện tại.
- Với Phim ngắn Trung Quốc, phải hiểu đây là một hệ rất rộng và tiếp tục khám phá motif mới từ kết quả, ví dụ: tổng tài, trọng sinh, xuyên không, hệ thống, hoàn thưởng, báo thù, ở rể, thần y, chiến thần, tu tiên, tận thế, thiên kim, giả nghèo, đổi thân phận, cổ trang, ngôn tình... Đây chỉ là ví dụ, KHÔNG phải danh sách đóng.
- Những từ như "hệ thống" trong ngữ cảnh cốt truyện/phim ngắn là motif PHIM, không phải Công nghệ. Query Công nghệ phải có ngữ cảnh kỹ thuật rõ như AI, điện thoại, máy tính, chip, phần mềm, robot, khoa học...
- Truy vấn phải ngắn và dùng ngôn ngữ người Việt thực sự gõ. Hệ thống YouTube đã đặt vùng Việt Nam nên KHÔNG cần nhồi chữ "Việt Nam" vào mọi truy vấn.
- Có thể trả thêm "hints" là các từ/cụm chủ đề con để hỗ trợ phân loại, tối đa 12 từ/cụm cho mỗi cha.
- Không tự bịa một tin cụ thể đang xảy ra nếu mẫu không cho thấy.

OUTPUT chỉ JSON, không Markdown:
{
  "parents":[
    {
      "label":"Nhạc",
      "queries":["MV mới","official audio","live session","nhạc tự sáng tác"],
      "hints":["MV","audio","live","cover","remix","indie"]
    }
  ]
}

MẪU VIDEO HIỆN TẠI:
${JSON.stringify(videos)}
`;

  const configuredModel=/^gemini[-_.a-z0-9]+$/i.test(String(cfg.model||""))
    ?String(cfg.model).trim()
    :"";
  const models=[configuredModel,"gemini-3.5-flash-lite","gemini-3.6-flash"]
    .filter((v:string,i:number,a:string[])=>v&&a.indexOf(v)===i);

  let lastError="ai_failed";
  for(const model of models){
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try{
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"content-type":"application/json","x-goog-api-key":cfg.key},
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text:instruction}]}],
          generationConfig:{
            temperature:0.2,
            responseMimeType:"application/json",
          },
        }),
      });
      const payload=await response.json().catch(()=>null);
      if(response.ok){
        const text=responseText(payload);
        if(!text)throw new Error("empty_ai_response");
        return {model,text};
      }
      lastError=`ai_http_${response.status}`;
      console.error("[yt1988-topics:catalog-ai]",model,response.status,String(payload?.error?.message||"request_failed").slice(0,300));
      if(response.status===401||response.status===403)break;
    }catch(error){
      lastError=String((error as any)?.message||error||"ai_network");
    }
  }
  throw new Error(lastError);
}

async function callGemini(cfg:any,scope:string,videos:any[],parentLabel="",learning:any={selectedSourceNames:[],blockedSourceNames:[],learnedQueries:[]},filterToParent=true){
  const instruction=`
Bạn đang xử lý một batch video YouTube mới của ứng dụng 1988. Hãy làm BỐN việc trong CÙNG một lần. Chỉ dựa trên metadata đầu vào, không bịa thêm sự kiện.

${SHORT_DRAMA_REFERENCE}
${parentLabel?`${filterToParent?"NHÓM CHA ĐANG XỬ LÝ":"NGỮ CẢNH TAB"}: "${parentLabel}". ${filterToParent?"Giữ đúng tên cha này, chỉ chia nhánh con bên trong và loại video lệch chủ đề nếu có.":"Không dùng tên tab để loại video; chỉ làm sạch, phân loại, nhận diện trùng và chuẩn hóa metadata."}`:""}
${parentLabel&&learning.selectedSourceNames.length?`TÍN HIỆU HỌC TỪ NGUỒN ĐÃ CHỌN (ví dụ DƯƠNG):
- ${learning.selectedSourceNames.join("\n- ")}
Hãy học KIỂU nội dung, cụm thể loại và phong cách chủ đề chung từ các tên nguồn này để nhận diện nguồn/video tương tự tốt hơn. Đây KHÔNG phải whitelist; đừng ưu tiên chính kênh cũ chỉ vì tên giống.`:""}
${parentLabel&&learning.blockedSourceNames.length?`NGUỒN ĐÃ CHẶN (ví dụ ÂM):
- ${learning.blockedSourceNames.join("\n- ")}
Không dùng các nguồn bị chặn làm mẫu dương. Nếu ứng viên có branding/nội dung rất gần ví dụ âm và không có bằng chứng rõ phù hợp nhóm thì loại.`:""}
${parentLabel&&learning.learnedQueries.length?`CỤM TÌM KIẾM ĐÃ HỌC TỪ LỰA CHỌN: ${learning.learnedQueries.join(" | ")}. Dùng như tín hiệu ngữ nghĩa bổ sung, không phải luật cứng.`:""}
${parentLabel&&filterToParent?`QUAN TRỌNG KHI LỌC NHÓM "${parentLabel}":
- Trả "acceptedVideoIds" gồm CHỈ các video thực sự thuộc nhóm cha này. Video lệch nhóm phải loại khỏi acceptedVideoIds, dù nó được tìm thấy do từ khóa mơ hồ.
- Phân loại theo NGỮ CẢNH cả tiêu đề, không theo một từ đơn lẻ.
- Nếu nhóm là "Công nghệ": các motif truyện/phim như "trọng sinh", "xuyên không", "kiếp này", "hệ thống", "hoàn thưởng", "tổng tài", "ở rể", "tu tiên", "thần y", "chiến thần", "thiên kim", "báo thù" KHÔNG phải công nghệ khi tiêu đề mang ngữ cảnh phim/cốt truyện.
- Nếu nhóm là "Phim": hãy nhận diện rộng phim ngắn Trung Quốc và các motif kể chuyện như tổng tài, trọng sinh, xuyên không, hệ thống, hoàn thưởng, báo thù, ở rể, tu tiên, thần y, chiến thần, tận thế, thiên kim, giả nghèo, đổi thân phận, cổ trang, ngôn tình... và tự phát hiện thêm motif mới từ batch.
- Chỉ loại khi thật sự lệch cha; đừng làm nghèo nội dung chỉ vì tên thể loại lạ.
- Nếu nhóm là "Phim", "Phim ngắn" hoặc "Nhạc": ngoài acceptedVideoIds, trả "aiGeneratedLikelyIds" cho video mà BẢN THÂN tác phẩm có tín hiệu mạnh là do AI tạo nhưng YouTube chưa gắn nhãn.
- Chỉ đánh dấu khi bằng chứng metadata đủ mạnh, dựa trên tổ hợp title + channel + description + howMade. Ví dụ: mô tả/kênh nêu rõ AI film, AI short film, AI animation, AI music, generated with AI, Suno, Udio, Veo, Sora, Kling, Runway, Hailuo, Pika, Luma, Midjourney hoặc quy trình tạo tác phẩm tương đương.
- KHÔNG đánh dấu chỉ vì video nói về AI, review công cụ AI, có chữ "AI" trong chủ đề, hoặc chỉ dùng AI cho script/thumbnail/phụ đề/chỉnh sửa nhỏ.
- Nếu không đủ chắc chắn thì KHÔNG đưa vào aiGeneratedLikelyIds.`:`AI 1 KHÔNG được loại video theo tên tab trong lượt này. acceptedVideoIds phải giữ toàn bộ video hợp lệ đầu vào; nhiệm vụ chính là làm sạch tiêu đề/tên nguồn, phân loại chủ đề và nhận diện nội dung trùng.`}

1) PHÂN LOẠI NỘI BỘ — KHÔNG QUYẾT ĐỊNH TAB
- Các tab LIVE / Mới nhất / Tuần này / Thời sự / Kinh tế / Pháp luật / Phim / Nhạc / Công nghệ / Thể thao / Giải trí là CỐ ĐỊNH do ứng dụng quản lý.
- AI 1 không được tạo, xóa, đổi tên hoặc chuyển tab. Trường "parents" chỉ là nhãn phân loại nội bộ nếu hữu ích cho chủ đề con.
- Tên phân loại phải rất ngắn, tự nhiên, quen với người Việt, thường 1-3 từ.
- Không tạo nhóm theo mốc thời gian như "Mới nhất", "Tuần này", "Hôm nay", "LIVE", và không dùng "Trend" làm loại nội dung.
- Một video có thể thuộc tối đa 2 nhãn nội bộ khi thật sự giao nhau, nhưng ưu tiên 1 nhãn rõ nhất.

2) CHỦ ĐỀ / NHÁNH CON
- Tạo tối đa 5-10 chủ đề con hoặc sự kiện đang nổi, mỗi chủ đề gắn với đúng một cha đã tạo ở trên.
- Chủ đề con phải có nghĩa và cụ thể hơn cha, ví dụ "Giá vàng", "U23 Việt Nam", "Phim tổng tài", "Nhạc Tết", "iPhone mới", "Khởi tố".
- Không trả từ rời/tên người/quốc gia/tổ chức đơn độc kiểu "Quốc", "Trung", "Đội", "Trump", "Nga", "Nước".
- Nếu tên người/quốc gia là trọng tâm, đặt thành sự kiện có nghĩa, ví dụ "Trump và Ukraine", "Mỹ - Iran".
- Không đánh giá độ tin cậy, không kết luận cáo buộc là đúng. Chỉ phân nhóm theo nội dung tiêu đề.
- Một video có thể thuộc tối đa 2 chủ đề.
- Chỉ dùng videoId có trong đầu vào.

3) LÀM SẠCH TIÊU ĐỀ / TÊN NGUỒN
- Chỉ đưa video vào "cleanups" khi thực sự cần sửa cách HIỂN THỊ.
- displayTitle phải ngắn, rõ nghĩa hơn nhưng KHÔNG được thêm sự kiện, suy đoán, đánh giá hay thay đổi mức độ chắc chắn của tiêu đề gốc.
- Giữ nguyên tên người, địa danh, số liệu, mốc thời gian và tình trạng pháp lý như "bị khởi tố", "tạm giam", "nghi", "cáo buộc" nếu tiêu đề gốc có.
- Chỉ bỏ rác trình bày: hashtag cuối câu, tên kênh chen lặp vào tiêu đề, ALL CAPS không cần thiết, dấu câu lặp, cụm quảng bá kiểu "TIN NÓNG", "MỚI NHẤT" khi không mang nội dung.
- Có thể sửa lỗi chính tả/viết hoa rõ ràng khi chắc chắn, nhưng không được đổi tên riêng, số liệu, thuật ngữ hoặc ý nghĩa.
- Không biến câu hỏi thành khẳng định; không biến cáo buộc thành sự thật.
- displaySource chỉ rút gọn BRANDING, không đổi danh tính nguồn. Ví dụ "VTV Nam Bộ - Tin Tức Tổng Hợp" -> "VTV Nam Bộ". Không đổi "VTV24" thành "VTV", không đổi một kênh thành cơ quan khác.
- Nếu title/source đã sạch thì KHÔNG cần trả cleanup cho video đó.

4) LỌC VIDEO TRÙNG
- Trả "duplicates" là các nhóm video thật sự cùng MỘT bản tin/sự kiện và nội dung gần như trùng nhau.
- Chỉ gộp khi xem một video là đã nắm gần như cùng thông tin với video kia.
- KHÔNG gộp chỉ vì cùng chủ đề.
- KHÔNG gộp bản cập nhật mới nếu có thông tin mới đáng kể, diễn biến mới, số liệu mới, quyết định mới hoặc phát ngôn mới.
- Không cần chọn video đại diện; ứng dụng tự chọn video đăng mới hơn, rồi mới xét view.

PHẠM VI: ${scope==="discovery"?"video mới trong tối đa 7 ngày, gồm cả hôm nay":scope==="latest"?"video dưới 24 giờ":"video trong tối đa 7 ngày"}.

OUTPUT chỉ JSON, không Markdown:
{
  "acceptedVideoIds":["id1","id2"],
  "aiGeneratedLikelyIds":["id3"],
  "parents":[
    {"label":"Công nghệ","videoIds":["id1","id2"]}
  ],
  "topics":[
    {"label":"iPhone mới","parent":"Công nghệ","videoIds":["id1","id2"]}
  ],
  "cleanups":[
    {"id":"id1","displayTitle":"Tiêu đề đã làm sạch","displaySource":"Tên nguồn gọn"}
  ],
  "duplicates":[
    {"videoIds":["id1","id2"]}
  ]
}

DỮ LIỆU VIDEO:
${JSON.stringify(videos)}
`

  const configuredModel=/^gemini[-_.a-z0-9]+$/i.test(String(cfg.model||""))
    ?String(cfg.model).trim()
    :"";
  const models=[configuredModel,"gemini-3.5-flash-lite","gemini-3.6-flash"]
    .filter((v:string,i:number,a:string[])=>v&&a.indexOf(v)===i);

  let lastError="ai_failed";
  for(const model of models){
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try{
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"content-type":"application/json","x-goog-api-key":cfg.key},
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text:instruction}]}],
          generationConfig:{
            temperature:0.15,
            responseMimeType:"application/json",
          },
        }),
      });
      const payload=await response.json().catch(()=>null);
      if(response.ok){
        const text=responseText(payload);
        if(!text)throw new Error("empty_ai_response");
        return {model,text};
      }
      lastError=`ai_http_${response.status}`;
      console.error("[yt1988-topics:ai]",model,response.status,String(payload?.error?.message||"request_failed").slice(0,300));
      if(response.status===401||response.status===403)break;
    }catch(error){
      lastError=String((error as any)?.message||error||"ai_network");
    }
  }
  throw new Error(lastError);
}


async function callSourceDiscoveryGemini(cfg:any,candidates:any[],parentLabel="",learning:any={selectedSourceNames:[],blockedSourceNames:[],learnedQueries:[]}){
  const instruction=[
    "Bạn là AI 2 của ứng dụng 1988. Nhiệm vụ DUY NHẤT: tìm/duyệt KÊNH MỚI có nội dung tương tự các nguồn người dùng đã chọn.",
    "Không làm sạch tiêu đề, không gộp video trùng, không tạo menu và không tự thêm kênh.",
    "Danh sách Chặn là ví dụ ÂM tuyệt đối: không chọn lại kênh bị chặn và không dùng chúng làm mẫu dương.",
    "Danh sách Chọn + cụm nội dung đã học là ví dụ DƯƠNG. Hãy so nội dung thực tế của các video mẫu, không so tên kênh đơn thuần.",
    "Ưu tiên kênh đang hoạt động gần đây. Mẫu ứng viên đã được client khoanh vùng thời gian trước khi gửi để giảm tải.",
    "Nếu nhóm là một chủ đề cố định như Thời sự/Kinh tế/Pháp luật/Phim/Nhạc/Công nghệ/Thể thao/Giải trí thì chỉ nhận kênh có phần lớn mẫu phù hợp nhóm đó.",
    "Nếu nhóm là Mới nhất/Tuần này thì học kiểu nội dung tổng hợp từ các nguồn đã chọn, không ép vào một chủ đề duy nhất.",
    "Không chọn chỉ vì một video tình cờ trùng từ khóa. Cần dấu hiệu tương đồng đủ rõ qua các mẫu của kênh.",
    "OUTPUT chỉ JSON: {\"acceptedSourceIds\":[\"UC...\"]}",
    "NHÓM: "+clean(parentLabel,80),
    "NGUỒN ĐÃ CHỌN (DƯƠNG): "+JSON.stringify(learning.selectedSourceNames||[]),
    "NGUỒN ĐÃ CHẶN (ÂM): "+JSON.stringify(learning.blockedSourceNames||[]),
    "CỤM NỘI DUNG ĐÃ HỌC: "+JSON.stringify(learning.learnedQueries||[]),
    "ỨNG VIÊN KÊNH: "+JSON.stringify(candidates)
  ].join("\n");

  const configuredModel=/^gemini[-_.a-z0-9]+$/i.test(String(cfg.model||""))?String(cfg.model).trim():"";
  const models=[configuredModel,"gemini-3.5-flash-lite","gemini-3.6-flash"]
    .filter((v:string,i:number,a:string[])=>v&&a.indexOf(v)===i);

  let lastError="ai_failed";
  for(const model of models){
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try{
      const response=await fetch(endpoint,{
        method:"POST",
        headers:{"content-type":"application/json","x-goog-api-key":cfg.key},
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text:instruction}]}],
          generationConfig:{temperature:0.08,responseMimeType:"application/json"}
        })
      });
      const payload=await response.json().catch(()=>null);
      if(response.ok){
        const text=responseText(payload);
        if(!text)throw new Error("empty_ai_response");
        return {model,text};
      }
      lastError=`ai_http_${response.status}`;
      if(response.status===401||response.status===403)break;
    }catch(error){
      lastError=String((error as any)?.message||error||"ai_network");
    }
  }
  throw new Error(lastError);
}

function validateVideoContext(value:any){
  const kindRaw=clean(value?.kind,24).toLocaleLowerCase("vi-VN");
  const kind=["music","film","topic","other"].includes(kindRaw)?kindRaw:"other";
  const categoryRaw=clean(value?.category,32).toLocaleLowerCase("vi-VN").replace(/\s+/g,"_");
  const allowedCategories=new Set(["song","music_video","live_music","concert","karaoke","film_movie","film_series","short_film","animation","news","current_affairs","entertainment","sports","technology","economy","law","education","documentary","gaming","lifestyle","interview","podcast","other"]);
  const category=allowedCategories.has(categoryRaw)?categoryRaw:"other";
  const channelRoleRaw=clean(value?.channelRole||value?.source?.role,24).toLocaleLowerCase("vi-VN");
  const channelRole=["official","creator","publisher","reupload","fan","aggregator","unknown"].includes(channelRoleRaw)?channelRoleRaw:"unknown";

  const queries=value?.queries&&typeof value.queries==="object"?value.queries:{};
  const outQueries:any={};
  for(const key of ["sameWork","creator","series","versions","covers","instrumental","alternatives","topic"]){
    const values=Array.isArray(queries?.[key])?queries[key]:[];
    outQueries[key]=[...new Set(values.map((q:any)=>clean(q,100)).filter(Boolean))].slice(0,6);
  }

  const entity=value?.primaryEntity&&typeof value.primaryEntity==="object"?value.primaryEntity:{};
  const primaryEntity={
    name:clean(entity?.name,100),
    type:clean(entity?.type,40),
    role:clean(entity?.role,80),
    aliases:[...new Set((Array.isArray(entity?.aliases)?entity.aliases:[]).map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,6),
    summary:clean(entity?.summary,260)
  };

  const secondaryEntities=(Array.isArray(value?.secondaryEntities)?value.secondaryEntities:[])
    .map((row:any)=>({name:clean(row?.name,100),type:clean(row?.type,40),role:clean(row?.role,80)}))
    .filter((row:any)=>row.name)
    .slice(0,6);

  const work=value?.work&&typeof value.work==="object"?value.work:{};
  const normalizedWork={
    title:clean(work?.title||value?.canonicalTitle,140),
    seriesTitle:clean(work?.seriesTitle,140),
    episodeNumber:Number.isFinite(Number(work?.episodeNumber))?Math.max(0,Math.round(Number(work.episodeNumber))):0,
    season:Number.isFinite(Number(work?.season))?Math.max(0,Math.round(Number(work.season))):0,
    year:Number.isFinite(Number(work?.year))?Math.max(0,Math.round(Number(work.year))):0,
    version:clean(work?.version||value?.version,80),
    genre:clean(work?.genre,80),
    language:clean(work?.language,60),
    isSeries:work?.isSeries===true||value?.isSeries===true
  };

  const briefRaw=value?.brief&&typeof value.brief==="object"?value.brief:{};
  const brief={
    title:clean(briefRaw?.title,120),
    lines:[...new Set((Array.isArray(briefRaw?.lines)?briefRaw.lines:[]).map((x:any)=>clean(x,220)).filter(Boolean))].slice(0,3),
    asOf:clean(briefRaw?.asOf,40),
    mode:["latest","context","summary"].includes(clean(briefRaw?.mode,20))?clean(briefRaw?.mode,20):"context"
  };

  const knowledgeRaw=value?.knowledge&&typeof value.knowledge==="object"?value.knowledge:{};
  const knowledge={
    summary:clean(knowledgeRaw?.summary,420),
    director:clean(knowledgeRaw?.director,100),
    cast:[...new Set((Array.isArray(knowledgeRaw?.cast)?knowledgeRaw.cast:[]).map((x:any)=>clean(x,100)).filter(Boolean))].slice(0,8),
    year:Number.isFinite(Number(knowledgeRaw?.year))?Math.max(0,Math.round(Number(knowledgeRaw.year))):0,
    country:clean(knowledgeRaw?.country,80),
    genre:clean(knowledgeRaw?.genre,100),
    reviewQueries:[...new Set((Array.isArray(knowledgeRaw?.reviewQueries)?knowledgeRaw.reviewQueries:[]).map((x:any)=>clean(x,110)).filter(Boolean))].slice(0,4),
    castQueries:[...new Set((Array.isArray(knowledgeRaw?.castQueries)?knowledgeRaw.castQueries:[]).map((x:any)=>clean(x,110)).filter(Boolean))].slice(0,4),
    infoQueries:[...new Set((Array.isArray(knowledgeRaw?.infoQueries)?knowledgeRaw.infoQueries:[]).map((x:any)=>clean(x,110)).filter(Boolean))].slice(0,4),
    versionQueries:[...new Set((Array.isArray(knowledgeRaw?.versionQueries)?knowledgeRaw.versionQueries:[]).map((x:any)=>clean(x,110)).filter(Boolean))].slice(0,4)
  };

  const sections=[];
  const allowedSourceModes=new Set(["any","same_channel","creator","official","series_source"]);
  for(const row of Array.isArray(value?.sections)?value.sections:[]){
    const label=clean(row?.label,100);
    const sectionQueries=[...new Set((Array.isArray(row?.queries)?row.queries:[]).map((q:any)=>clean(q,110)).filter(Boolean))].slice(0,3);
    if(!label||!sectionQueries.length)continue;
    const sourceModeRaw=clean(row?.sourceMode,24);
    sections.push({
      key:clean(row?.key,40)||("section_"+sections.length),
      label,
      relation:clean(row?.relation,60),
      queries:sectionQueries,
      sourceMode:allowedSourceModes.has(sourceModeRaw)?sourceModeRaw:"any",
      limit:Math.max(4,Math.min(12,Math.round(Number(row?.limit)||10)))
    });
    if(sections.length>=6)break;
  }

  return {
    kind,category,
    canonicalTitle:clean(value?.canonicalTitle,140),
    creator:clean(value?.creator||primaryEntity.name,100),
    currentChannel:clean(value?.currentChannel||value?.source?.currentChannel,120),
    channelRole,
    originalChannelHint:clean(value?.originalChannelHint||value?.source?.originalChannelHint,120),
    version:clean(value?.version||normalizedWork.version,80),
    isSeries:normalizedWork.isSeries,
    subject:clean(value?.subject,140),
    confidence:Math.max(0,Math.min(1,Number(value?.confidence)||0)),
    primaryEntity,
    secondaryEntities,
    work:normalizedWork,
    brief,
    knowledge,
    sections,
    queries:outQueries
  };
}

async function callVideoContextGemini(cfg:any,video:any,related:any[],searchQuery=""){
  const instruction=[
    "Bạn là bộ não NGỮ CẢNH SAU KHI NGƯỜI DÙNG ĐÃ BẤM CHỌN MỘT VIDEO trong ứng dụng 1988.",
    "Ô tìm kiếm chỉ tìm bình thường. CHỈ SAU KHI người dùng chọn video này mới được phân tích và dựng gợi ý.",
    "Hãy dùng MỘT lần gọi AI này để trả đủ dữ liệu cho mọi trường hợp, không bắt client phải gọi AI lần nữa.",
    "Bạn có Google Search grounding. Với nội dung có thể thay đổi theo thời gian (sản phẩm/công nghệ, người nổi tiếng, thể thao, thời sự, kinh tế, pháp luật, giá cả, nhân vật công chúng), hãy dùng Search để lấy thông tin mới nhất trước khi trả lời.",
    "",
    "A. PHÂN LOẠI 2 TẦNG",
    "- kind chỉ là họ lớn: music | film | topic | other.",
    "- category chi tiết phải chọn một trong: song, music_video, live_music, concert, karaoke, film_movie, film_series, short_film, animation, news, current_affairs, entertainment, sports, technology, economy, law, education, documentary, gaming, lifestyle, interview, podcast, other.",
    "- Thời sự/bản tin/sự kiện xã hội => kind=topic, category=news hoặc current_affairs.",
    "- Giải trí/showbiz/nghệ sĩ/phỏng vấn => kind=topic, category=entertainment hoặc interview.",
    "- Phim ngắn tổng tài/xuyên không/trọng sinh/hệ thống... => kind=film, category=short_film.",
    "",
    "B. NHẬN DẠNG TÁC PHẨM / NGƯỜI / CHỦ ĐỀ",
    "- canonicalTitle: tên bài hát, tên phim, tên chương trình hoặc tên chủ đề gọn nhất.",
    "- creator: nghệ sĩ/ca sĩ/ban nhạc/đạo diễn/đơn vị sáng tạo chính nếu đủ rõ.",
    "- primaryEntity: người/nhóm/đội/sản phẩm/sự kiện quan trọng nhất; type, role, aliases, summary.",
    "- summary chỉ 1 câu ngắn. Với nghệ sĩ/người nổi tiếng có thể dùng kiến thức ổn định, phổ biến nếu rất chắc. Với thời sự/chính trị/pháp luật chỉ được mô tả trung tính và dựa trên metadata đầu vào; không suy đoán động cơ, không đánh giá.",
    "- secondaryEntities: tối đa vài thực thể phụ thật sự liên quan.",
    "- work: title, seriesTitle, episodeNumber, season, year, version, genre, language, isSeries.",
    "",
    "C. ĐÁNH GIÁ NGUỒN",
    "- channelRole: official/creator/publisher/reupload/fan/aggregator/unknown.",
    "- originalChannelHint chỉ ghi khi có bằng chứng khá rõ; không bịa kênh gốc.",
    "- Nếu video đang xem là reup, kế hoạch gợi ý phải ưu tiên tìm bản gốc/nguồn chính trước.",
    "",
    "D. THẺ THÔNG TIN NGẮN DƯỚI VIDEO",
    "- brief.title: tiêu đề ngắn, ví dụ iPhone 18 Pro Max, Sơn Tùng M-TP, Thiên Long Bát Bộ.",
    "- brief.lines: tối đa 3 câu ngắn, dễ đọc.",
    "- Nếu có cập nhật mới đáng tin cậy: mode=latest và nêu 1-3 thông tin mới có liên quan trực tiếp.",
    "- Nếu là tác phẩm ổn định như phim/bài hát: mode=context và nêu thông tin hữu ích về tác phẩm/người liên quan.",
    "- Nếu không có dữ liệu mới đủ chắc: mode=summary và chỉ tóm tắt video từ metadata được cung cấp, không bịa.",
    "- Với chính trị/thời sự/pháp luật: trung tính, mô tả sự kiện/quan hệ có căn cứ; không đánh giá, không suy đoán động cơ, sức khỏe hay năng lực.",
    "",
    "E. TẠO KẾ HOẠCH GỢI Ý VIDEO THEO ĐÚNG LOẠI NỘI DUNG",
    "AI chỉ trả NGỮ NGHĨA + thông tin ngắn + từ khóa/truy vấn. Client mới là nơi gọi tìm kiếm YouTube và kiểm tra video nào thực sự phù hợp.",
    "Trả sections theo ĐÚNG THỨ TỰ nên hiển thị. Mỗi section có key,label,relation,queries,sourceMode,limit.",
    "sourceMode: any | same_channel | creator | official | series_source.",
    "",
    "NHẠC:",
    "1) Nếu đang ở bản reup: Bản gốc / nguồn chính.",
    "2) Ca khúc khác của nghệ sĩ chính.",
    "3) Cùng bài do ca sĩ/nghệ sĩ khác thể hiện.",
    "4) Cover.",
    "5) Không lời / Guitar / Piano.",
    "6) Live / Remix / Karaoke / phiên bản khác.",
    "7) Nếu nghệ sĩ còn hoạt động và có cập nhật mới đáng chú ý, thêm section Mới nhất về {nghệ sĩ}.",
    "Ví dụ: NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP => kind=music, category=music_video, canonicalTitle=Nơi Này Có Anh, creator=Sơn Tùng M-TP; không được xếp thành chủ đề chung.",
    "",
    "PHIM / PHIM BỘ:",
    "Ứng dụng TỰ tìm và sắp xếp danh sách tập bằng code; AI KHÔNG được tạo danh sách tập hay gán video ngẫu nhiên vào 'cùng bộ'.",
    "Việc của AI là HIỂU tác phẩm: tên phim chuẩn, năm/phiên bản, phim lẻ hay phim bộ, thể loại, quốc gia, đạo diễn, diễn viên chính, mô tả ngắn và các truy vấn YouTube để tìm review/thông tin/diễn viên/phiên bản khác.",
    "Với phim, sections chỉ nên là review, cast, info, versions nếu có ích; KHÔNG tạo section same_series/series.",
    "knowledge.reviewQueries phải chứa tên phim + review; castQueries chứa tên phim + diễn viên hoặc tên diễn viên; infoQueries chứa tên phim + thông tin/hậu trường; versionQueries dùng tên phim + năm/remake khi có.",
    "Ví dụ: Thiên Long Bát Bộ 2003 Tập 1 => film_series; work.seriesTitle=Thiên Long Bát Bộ; year/version=2003; knowledge nêu thể loại/diễn viên nếu đủ chắc. Danh sách Tập 1→2→3 do client tự tìm.",
    "",
    "PHIM NGẮN:",
    "Ưu tiên cùng câu chuyện/phần tiếp theo, cùng kênh, cùng motif; không trộn thành phim bộ cổ điển nếu metadata không cho thấy.",
    "",
    "THỜI SỰ / CURRENT AFFAIRS / KINH TẾ / PHÁP LUẬT:",
    "Section đầu tiên nên là Mới nhất về {sự kiện/người/vấn đề}; sau đó nguồn gốc/chính thức nếu có, bối cảnh/giải thích và sự kiện liên quan. Giữ mô tả trung tính.",
    "",
    "GIẢI TRÍ:",
    "Nếu là nghệ sĩ/người nổi tiếng, section đầu tiên nên là Mới nhất về {tên}; sau đó cùng nghệ sĩ/chương trình/sự kiện, phỏng vấn, biểu diễn/hậu trường liên quan.",
    "",
    "THỂ THAO:",
    "Nếu sự kiện/đội/cầu thủ đang hoạt động, section đầu tiên nên là Mới nhất về ...; sau đó đúng trận/giải, highlight, full match nếu hợp lệ, phân tích và video cùng nguồn.",
    "",
    "CÔNG NGHỆ:",
    "Section đầu tiên phải là Mới nhất về {sản phẩm/chủ đề} khi phù hợp (ví dụ iPhone 18), rồi nguồn chính thức, review/đánh giá khác, so sánh, hướng dẫn và cập nhật liên quan.",
    "",
    "GIÁO DỤC / DOCUMENTARY / GAMING / LIFESTYLE / PODCAST:",
    "Tạo sections tự nhiên theo nội dung: cùng series/chủ đề, cùng người/kênh, phần tiếp theo, nội dung liên quan gần.",
    "",
    "F. TRƯỜNG queries CŨ VẪN PHẢI ĐIỀN để client tương thích:",
    "sameWork, creator, series, versions, covers, instrumental, alternatives, topic.",
    "Các query phải ngắn, giống người dùng thật gõ trên YouTube, không nhồi quá nhiều từ.",
    "",
    "OUTPUT chỉ JSON, không Markdown:",
    JSON.stringify({
      kind:"music|film|topic|other",
      category:"music_video",
      canonicalTitle:"",creator:"",currentChannel:"",
      channelRole:"official|creator|publisher|reupload|fan|aggregator|unknown",
      originalChannelHint:"",version:"",isSeries:false,subject:"",confidence:0,
      primaryEntity:{name:"",type:"",role:"",aliases:[],summary:""},
      secondaryEntities:[{name:"",type:"",role:""}],
      brief:{title:"",lines:[""],asOf:"",mode:"latest|context|summary"},
      work:{title:"",seriesTitle:"",episodeNumber:0,season:0,year:0,version:"",genre:"",language:"",isSeries:false},
      knowledge:{summary:"",director:"",cast:[],year:0,country:"",genre:"",reviewQueries:[],castQueries:[],infoQueries:[],versionQueries:[]},
      sections:[{key:"artist_catalog",label:"Ca khúc khác của nghệ sĩ",relation:"same_creator",queries:[""],sourceMode:"creator",limit:10}],
      queries:{sameWork:[],creator:[],series:[],versions:[],covers:[],instrumental:[],alternatives:[],topic:[]}
    }),
    "",
    "TRUY VẤN NGƯỜI DÙNG ĐÃ GÕ (chỉ là ngữ cảnh): "+clean(searchQuery,160),
    "VIDEO ĐANG XEM:",JSON.stringify(video),
    "VIDEO LIÊN QUAN YOUTUBE:",JSON.stringify(related.slice(0,20))
  ].join("\n");

  const configuredModel=/^gemini[-_.a-z0-9]+$/i.test(String(cfg.model||""))?String(cfg.model).trim():"";
  const models=[configuredModel,"gemini-3.5-flash-lite","gemini-3.6-flash"].filter((v:string,i:number,a:string[])=>v&&a.indexOf(v)===i);
  const sourceRows=(payload:any)=>{
    const chunks=payload?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const out:any[]=[];
    const seen=new Set<string>();
    for(const chunk of Array.isArray(chunks)?chunks:[]){
      const web=chunk?.web;
      const uri=clean(web?.uri,500);
      const title=clean(web?.title,160);
      if(!uri||seen.has(uri))continue;
      seen.add(uri);
      out.push({title,uri});
      if(out.length>=6)break;
    }
    return out;
  };

  let lastError="ai_failed";
  for(const model of models){
    const endpoint="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent";
    for(const grounded of [true,false]){
      try{
        const body:any={
          contents:[{role:"user",parts:[{text:instruction}]}],
          generationConfig:{temperature:0.08,responseMimeType:"application/json"}
        };
        if(grounded)body.tools=[{google_search:{}}];
        const response=await fetch(endpoint,{
          method:"POST",
          headers:{"content-type":"application/json","x-goog-api-key":cfg.key},
          body:JSON.stringify(body)
        });
        const payload=await response.json().catch(()=>null);
        if(response.ok){
          const text=responseText(payload);
          if(!text)throw new Error("empty_ai_response");
          return {
            model,text,grounded,
            sources:sourceRows(payload),
            webSearchQueries:(Array.isArray(payload?.candidates?.[0]?.groundingMetadata?.webSearchQueries)?payload.candidates[0].groundingMetadata.webSearchQueries:[])
              .map((q:any)=>clean(q,140)).filter(Boolean).slice(0,6)
          };
        }
        lastError="ai_http_"+response.status;
        if(response.status!==400||!grounded)break;
      }catch(error){
        lastError=String((error as any)?.message||error||"ai_network");
        if(!grounded)break;
      }
    }
    if(lastError==="ai_http_401"||lastError==="ai_http_403")break;
  }
  throw new Error(lastError);
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  try{
    const body=await req.json().catch(()=>({}));
    const mode=
      body?.mode==="catalog"?"catalog":
      body?.mode==="video_context"?"video_context":
      body?.mode==="source_discovery"?"source_discovery":
      "classify";
    const videos=normalizeVideos(body?.videos);
    const cfg=await runtimeConfig();
    if(!cfg.key)return json({ok:false,error:"ai_not_configured"},503);

    if(mode==="source_discovery"){
      const candidates=normalizeSourceCandidates(body?.sourceCandidates);
      if(!candidates.length)return json({ok:true,acceptedSourceIds:[],cached:false,reason:"no_candidates"});
      const parentLabel=clean(body?.parentLabel,80);
      const learning={
        selectedSourceNames:normalizeSourceNames(body?.selectedSourceNames,24),
        blockedSourceNames:normalizeSourceNames(body?.blockedSourceNames,24),
        learnedQueries:normalizeSourceNames(body?.learnedQueries,12)
      };
      const canonical=candidates
        .map(row=>[row.id,row.name,...row.samples.map((sample:any)=>[sample.title,sample.published,sample.views].join("|"))].join("\t"))
        .sort()
        .join("\n");
      const learningCanonical=[
        ...learning.selectedSourceNames.map((name:string)=>"+"+name),
        ...learning.blockedSourceNames.map((name:string)=>"-"+name),
        ...learning.learnedQueries.map((name:string)=>"?"+name)
      ].sort().join("\n");
      const fingerprint=await sha256("source_discovery\n"+parentLabel+"\n"+learningCanonical+"\n"+canonical);
      const freshnessBucket=Math.floor(Date.now()/(6*60*60*1000));
      const cacheKey="v1:source_discovery:"+freshnessBucket+":"+fingerprint;
      const cached=await db.from("yt1988_ai_topic_cache")
        .select("result,model,created_at")
        .eq("cache_key",cacheKey)
        .maybeSingle();
      if(!cached.error&&cached.data?.result){
        return json({ok:true,...cached.data.result,model:cached.data.model||null,fingerprint,cached:true});
      }
      const ai=await callSourceDiscoveryGemini(cfg,candidates,parentLabel,learning);
      const result=validateSourceDiscoveryResult(parseJson(ai.text),candidates);
      await db.from("yt1988_ai_topic_cache").upsert({
        cache_key:cacheKey,
        scope:"source_discovery",
        fingerprint,
        model:ai.model,
        video_count:candidates.reduce((sum:number,row:any)=>sum+row.samples.length,0),
        result,
        created_at:new Date().toISOString()
      },{onConflict:"cache_key"});
      return json({ok:true,...result,model:ai.model,fingerprint,cached:false});
    }

    if(mode==="video_context"){
      const video=videos[0]||null;
      if(!video)return json({ok:false,error:"video_required"},400);
      const related=normalizeVideos(body?.related).slice(0,24);
      const searchQuery=clean(body?.searchQuery,160);
      const canonical=[video.id,video.title,video.channel,video.description,searchQuery,...related.map(row=>[row.id,row.title,row.channel].join("|"))].join("\n");
      const freshnessBucket=Math.floor(Date.now()/(6*60*60*1000));
      const fingerprint=await sha256("video_context\n"+canonical);
      const cacheKey="v4:video_context:"+freshnessBucket+":"+fingerprint;
      const cached=await db.from("yt1988_ai_topic_cache").select("result,model,created_at").eq("cache_key",cacheKey).maybeSingle();
      if(!cached.error&&cached.data?.result){
        return json({ok:true,context:cached.data.result,model:cached.data.model||null,fingerprint,cached:true});
      }
      const ai=await callVideoContextGemini(cfg,video,related,searchQuery);
      const context={
        ...validateVideoContext(parseJson(ai.text)),
        groundingSources:Array.isArray(ai.sources)?ai.sources:[],
        webSearchQueries:Array.isArray(ai.webSearchQueries)?ai.webSearchQueries:[]
      };
      await db.from("yt1988_ai_topic_cache").upsert({cache_key:cacheKey,scope:"video_context",fingerprint,model:ai.model,video_count:1,result:context,created_at:new Date().toISOString()},{onConflict:"cache_key"});
      return json({ok:true,context,model:ai.model,fingerprint,cached:false,grounded:ai.grounded===true});
    }

    if(mode==="catalog"){
      const bucketMs=3*60*60*1000;
      const bucket=Math.floor(Date.now()/bucketMs);
      const canonical=videos
        .map(row=>[row.id,row.title,row.channel,row.published,row.views,row.contentHash].join("\t"))
        .sort()
        .join("\n");
      const fingerprint=await sha256("catalog\n"+canonical);
      const cacheKey="v8:catalog:"+bucket;

      const cached=await db.from("yt1988_ai_topic_cache")
        .select("result,model,created_at")
        .eq("cache_key",cacheKey)
        .maybeSingle();

      if(!cached.error&&cached.data?.result){
        return json({
          ok:true,
          ...cached.data.result,
          model:cached.data.model||null,
          fingerprint,
          cached:true,
        });
      }

      const ai=await callCatalogGemini(cfg,videos);
      const parsed=parseJson(ai.text);
      const result=validateCatalog(parsed);

      await db.from("yt1988_ai_topic_cache").upsert({
        cache_key:cacheKey,
        scope:"catalog",
        fingerprint,
        model:ai.model,
        video_count:videos.length,
        result,
        created_at:new Date().toISOString(),
      },{onConflict:"cache_key"});

      void db.from("yt1988_ai_topic_cache")
        .delete()
        .lt("created_at",new Date(Date.now()-7*24*60*60*1000).toISOString());

      return json({
        ok:true,
        ...result,
        model:ai.model,
        fingerprint,
        cached:false,
      });
    }

    const rawScope=clean(body?.scope,80);
    const scope=
      rawScope==="week"||rawScope==="feed:week"?"week":
      rawScope==="latest"||rawScope==="feed:latest"?"latest":
      rawScope.startsWith("ai:")?rawScope:
      "latest";
    const parentLabel=clean(body?.parentLabel,28);
    const filterToParent=body?.filterToParent!==false;
    const learning={
      selectedSourceNames:normalizeSourceNames(body?.selectedSourceNames,24),
      blockedSourceNames:normalizeSourceNames(body?.blockedSourceNames,24),
      learnedQueries:normalizeSourceNames(body?.learnedQueries,8)
    };
    if(videos.length<4)return json({ok:true,parents:[],topics:[],videos:[],acceptedVideoIds:videos.map(row=>row.id),aiGeneratedLikelyIds:[],cached:false,reason:"not_enough_videos"});

    const canonical=videos
      .map(row=>[
        row.id,row.title,row.channel,row.published,row.views,row.contentHash,
        row.description,row.howMade
      ].join("\t"))
      .sort()
      .join("\n");
    const learningCanonical=[
      ...learning.selectedSourceNames.map((name:string)=>"+"+name),
      ...learning.blockedSourceNames.map((name:string)=>"-"+name),
      ...learning.learnedQueries.map((name:string)=>"?"+name)
    ].sort().join("\n");
    const fingerprint=await sha256(scope+"\n"+parentLabel+"\nfilterToParent="+String(filterToParent)+"\n"+learningCanonical+"\n"+canonical);
    const cacheKey="v10:classify:"+scope+":"+fingerprint;

    const cached=await db.from("yt1988_ai_topic_cache")
      .select("result,model,created_at")
      .eq("cache_key",cacheKey)
      .maybeSingle();

    if(!cached.error&&cached.data?.result){
      return json({
        ok:true,
        ...cached.data.result,
        model:cached.data.model||null,
        fingerprint,
        cached:true,
      });
    }

    const ai=await callGemini(cfg,scope,videos,parentLabel,learning,filterToParent);
    const parsed=parseJson(ai.text);
    const result=validateResult(parsed,videos);

    await db.from("yt1988_ai_topic_cache").upsert({
      cache_key:cacheKey,
      scope,
      fingerprint,
      model:ai.model,
      video_count:videos.length,
      result,
      created_at:new Date().toISOString(),
    },{onConflict:"cache_key"});

    void db.from("yt1988_ai_topic_cache")
      .delete()
      .lt("created_at",new Date(Date.now()-7*24*60*60*1000).toISOString());

    return json({
      ok:true,
      ...result,
      model:ai.model,
      fingerprint,
      cached:false,
    });
  }catch(error){
    console.error("[yt1988-topics]",String((error as any)?.message||error||"internal_error"));
    return json({ok:false,error:"ai_topics_failed"},500);
  }
});
