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
      contentHash:clean(row?.contentHash,64),
      description:clean(row?.description,1800),
      howMade:clean(row?.howMade,800),
    });
    if(out.length>=120)break;
  }
  return out;
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

async function callGemini(cfg:any,scope:string,videos:any[],parentLabel=""){
  const instruction=`
Bạn đang xử lý một batch video YouTube mới của ứng dụng 1988. Hãy làm BỐN việc trong CÙNG một lần. Chỉ dựa trên metadata đầu vào, không bịa thêm sự kiện.

${SHORT_DRAMA_REFERENCE}
${parentLabel?`NHÓM CHA ĐANG XỬ LÝ: "${parentLabel}". Giữ đúng tên cha này, chỉ chia nhánh con bên trong và loại video lệch chủ đề nếu có.`:""}
${parentLabel?`QUAN TRỌNG KHI LỌC NHÓM "${parentLabel}":
- Trả "acceptedVideoIds" gồm CHỈ các video thực sự thuộc nhóm cha này. Video lệch nhóm phải loại khỏi acceptedVideoIds, dù nó được tìm thấy do từ khóa mơ hồ.
- Phân loại theo NGỮ CẢNH cả tiêu đề, không theo một từ đơn lẻ.
- Nếu nhóm là "Công nghệ": các motif truyện/phim như "trọng sinh", "xuyên không", "kiếp này", "hệ thống", "hoàn thưởng", "tổng tài", "ở rể", "tu tiên", "thần y", "chiến thần", "thiên kim", "báo thù" KHÔNG phải công nghệ khi tiêu đề mang ngữ cảnh phim/cốt truyện.
- Nếu nhóm là "Phim": hãy nhận diện rộng phim ngắn Trung Quốc và các motif kể chuyện như tổng tài, trọng sinh, xuyên không, hệ thống, hoàn thưởng, báo thù, ở rể, tu tiên, thần y, chiến thần, tận thế, thiên kim, giả nghèo, đổi thân phận, cổ trang, ngôn tình... và tự phát hiện thêm motif mới từ batch.
- Chỉ loại khi thật sự lệch cha; đừng làm nghèo nội dung chỉ vì tên thể loại lạ.
- Nếu nhóm là "Phim", "Phim ngắn" hoặc "Nhạc": ngoài acceptedVideoIds, trả "aiGeneratedLikelyIds" cho video mà BẢN THÂN tác phẩm có tín hiệu mạnh là do AI tạo nhưng YouTube chưa gắn nhãn.
- Chỉ đánh dấu khi bằng chứng metadata đủ mạnh, dựa trên tổ hợp title + channel + description + howMade. Ví dụ: mô tả/kênh nêu rõ AI film, AI short film, AI animation, AI music, generated with AI, Suno, Udio, Veo, Sora, Kling, Runway, Hailuo, Pika, Luma, Midjourney hoặc quy trình tạo tác phẩm tương đương.
- KHÔNG đánh dấu chỉ vì video nói về AI, review công cụ AI, có chữ "AI" trong chủ đề, hoặc chỉ dùng AI cho script/thumbnail/phụ đề/chỉnh sửa nhỏ.
- Nếu không đủ chắc chắn thì KHÔNG đưa vào aiGeneratedLikelyIds.`:""}

1) MENU CHA TỰ ĐỘNG
- Tự nhìn toàn bộ batch và tạo tối đa 5-9 nhóm CHA phù hợp nhất với nội dung thực tế đang có.
- Tên cha phải rất ngắn, tự nhiên, quen với người Việt, thường 1-3 từ. Ví dụ chỉ để hiểu cấp độ: "Thời sự", "An ninh", "Kinh tế", "Công nghệ", "Thể thao", "Giải trí", "Nhạc", "Phim", "Phim ngắn", "Đời sống". Đây KHÔNG phải danh sách bắt buộc.
- Không tạo cha theo mốc thời gian như "Mới nhất", "Tuần này", "Hôm nay", "LIVE", và không dùng "Trend" làm loại nội dung.
- Không tạo hai cha đồng nghĩa hoặc quá gần nhau. Nếu "Phim ngắn" đủ lớn và khác rõ "Phim" thì có thể tách riêng; nếu không thì gộp hợp lý.
- Một video có thể thuộc tối đa 2 cha khi thật sự giao nhau, nhưng ưu tiên 1 cha rõ nhất.
- Chỉ tạo cha có ít nhất 2 video trong batch. Không cố tạo đủ số lượng nếu dữ liệu không có.

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

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  try{
    const body=await req.json().catch(()=>({}));
    const mode=body?.mode==="catalog"?"catalog":"classify";
    const videos=normalizeVideos(body?.videos);
    const cfg=await runtimeConfig();
    if(!cfg.key)return json({ok:false,error:"ai_not_configured"},503);

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
    const scope=rawScope==="week"?"week":rawScope==="latest"?"latest":rawScope.startsWith("ai:")?rawScope:"latest";
    const parentLabel=clean(body?.parentLabel,28);
    if(videos.length<4)return json({ok:true,parents:[],topics:[],videos:[],acceptedVideoIds:videos.map(row=>row.id),aiGeneratedLikelyIds:[],cached:false,reason:"not_enough_videos"});

    const canonical=videos
      .map(row=>[
        row.id,row.title,row.channel,row.published,row.views,row.contentHash,
        row.description,row.howMade
      ].join("\t"))
      .sort()
      .join("\n");
    const fingerprint=await sha256(scope+"\n"+parentLabel+"\n"+canonical);
    const cacheKey="v8:classify:"+scope+":"+fingerprint;

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

    const ai=await callGemini(cfg,scope,videos,parentLabel);
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
