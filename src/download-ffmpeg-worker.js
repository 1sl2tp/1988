"use strict";

const CORE_BASE="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const CORE_JS=CORE_BASE+"/ffmpeg-core.js";
const CORE_WASM=CORE_BASE+"/ffmpeg-core.wasm";
const MAX_INPUT_BYTES=512*1024*1024;

let corePromise=null;

function post(type,data={}){
  self.postMessage({type,...data});
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function ensureCore(){
  if(corePromise)return corePromise;

  corePromise=(async()=>{
    post("state",{phase:"engine",message:"Đang nạp bộ xử lý…"});
    importScripts(CORE_JS);

    if(typeof self.createFFmpegCore!=="function"){
      throw new Error("ffmpeg_core_missing");
    }

    const locator=btoa(JSON.stringify({
      wasmURL:CORE_WASM,
      workerURL:""
    }));

    const core=await self.createFFmpegCore({
      mainScriptUrlOrBlob:CORE_JS+"#"+locator
    });

    core.setLogger(()=>{});
    return core;
  })();

  try{
    return await corePromise;
  }catch(error){
    corePromise=null;
    throw error;
  }
}

function normalizedExpected(response,expected){
  const header=Number(response.headers.get("content-length")||0);
  const hinted=Number(expected||0);
  return header>0?header:(hinted>0?hinted:0);
}

async function fetchInputOnce(url,expected,progressBase,progressTotal,label){
  const response=await fetch(url,{
    method:"GET",
    cache:"no-store",
    credentials:"omit",
    headers:{"accept":"*/*"}
  });

  if(!response.ok){
    throw new Error("input_http_"+response.status);
  }
  if(!response.body){
    throw new Error("input_body_missing");
  }

  const total=normalizedExpected(response,expected);
  if(total>MAX_INPUT_BYTES){
    throw new Error("input_too_large");
  }

  const reader=response.body.getReader();
  let received=0;
  let out=total>0?new Uint8Array(total):null;
  const chunks=[];

  while(true){
    const part=await reader.read();
    if(part.done)break;

    const value=part.value;
    if(!value?.byteLength)continue;

    if(received+value.byteLength>MAX_INPUT_BYTES){
      try{await reader.cancel()}catch{}
      throw new Error("input_too_large");
    }

    if(out){
      if(received+value.byteLength>out.byteLength){
        const next=new Uint8Array(Math.max(
          received+value.byteLength,
          Math.min(MAX_INPUT_BYTES,Math.max(out.byteLength*2,1024*1024))
        ));
        next.set(out.subarray(0,received),0);
        out=next;
      }
      out.set(value,received);
    }else{
      chunks.push(value);
    }

    received+=value.byteLength;

    const overall=progressTotal>0
      ?Math.min(100,((progressBase+received)/progressTotal)*100)
      :0;

    post("progress",{
      phase:"get",
      label,
      loaded:progressBase+received,
      total:progressTotal,
      percentage:overall
    });
  }

  if(received===0){
    throw new Error("input_empty");
  }

  if(total>0&&received<Math.floor(total*0.98)){
    throw new Error("input_truncated");
  }

  if(out){
    return out.byteLength===received?out:out.slice(0,received);
  }

  const merged=new Uint8Array(received);
  let offset=0;
  for(const chunk of chunks){
    merged.set(chunk,offset);
    offset+=chunk.byteLength;
  }
  return merged;
}

async function fetchInput(url,expected,progressBase,progressTotal,label){
  let lastError=null;

  for(let attempt=0;attempt<4;attempt++){
    try{
      if(attempt>0){
        post("state",{
          phase:"get",
          message:"Đang thử lại "+label+"…"
        });
        await sleep(500+attempt*500);
      }

      return await fetchInputOnce(
        url,
        expected,
        progressBase,
        progressTotal,
        label
      );
    }catch(error){
      lastError=error;
      const code=String(error?.message||error);
      if(code==="input_too_large")break;
    }
  }

  throw lastError||new Error("input_fetch_failed");
}

function cleanupFile(core,name){
  try{core.FS.unlink(name)}catch{}
}

async function processMp3(core,audio){
  const input="input-audio.m4a";
  const output="output.mp3";

  cleanupFile(core,input);
  cleanupFile(core,output);
  core.FS.writeFile(input,audio);

  const ret=core.exec(
    "-nostdin","-y",
    "-loglevel","error",
    "-i",input,
    "-map","0:a:0",
    "-vn",
    "-c:a","libmp3lame",
    "-b:a","128k",
    "-f","mp3",
    output
  );

  if(ret!==0){
    throw new Error("ffmpeg_mp3_"+ret);
  }

  const data=core.FS.readFile(output);
  if(!data?.byteLength){
    throw new Error("ffmpeg_empty_output");
  }

  const result=new Uint8Array(data);
  cleanupFile(core,input);
  cleanupFile(core,output);
  try{core.reset()}catch{}
  return result;
}

async function processMp4(core,audio,video){
  const audioName="input-audio.m4a";
  const videoName="input-video.mp4";
  const output="output.mp4";

  cleanupFile(core,audioName);
  cleanupFile(core,videoName);
  cleanupFile(core,output);

  core.FS.writeFile(audioName,audio);
  core.FS.writeFile(videoName,video);

  const ret=core.exec(
    "-nostdin","-y",
    "-loglevel","error",
    "-i",audioName,
    "-i",videoName,
    "-map","1:v:0",
    "-map","0:a:0",
    "-c:v","copy",
    "-c:a","copy",
    "-shortest",
    "-f","mp4",
    output
  );

  if(ret!==0){
    throw new Error("ffmpeg_mp4_"+ret);
  }

  const data=core.FS.readFile(output);
  if(!data?.byteLength){
    throw new Error("ffmpeg_empty_output");
  }

  const result=new Uint8Array(data);
  cleanupFile(core,audioName);
  cleanupFile(core,videoName);
  cleanupFile(core,output);
  try{core.reset()}catch{}
  return result;
}

self.onmessage=async event=>{
  const task=event.data||{};
  if(task.type!=="process")return;

  const mode=String(task.mode||"").toLowerCase();
  if(mode!=="mp3"&&mode!=="mp4"){
    post("error",{message:"invalid_mode"});
    return;
  }

  try{
    const audioInfo=task.audio||{};
    const videoInfo=task.video||{};

    const audioExpected=Number(audioInfo.contentLength||0);
    const videoExpected=mode==="mp4"?Number(videoInfo.contentLength||0):0;
    const totalExpected=audioExpected+videoExpected;

    post("state",{
      phase:"get",
      message:"Đang GET dữ liệu…"
    });

    const audio=await fetchInput(
      String(audioInfo.url||""),
      audioExpected,
      0,
      totalExpected,
      "audio"
    );

    let video=null;
    if(mode==="mp4"){
      video=await fetchInput(
        String(videoInfo.url||""),
        videoExpected,
        audio.byteLength,
        totalExpected,
        "video"
      );
    }

    post("state",{
      phase:"engine",
      message:"GET xong · đang nạp bộ xử lý…",
      loaded:audio.byteLength+(video?.byteLength||0),
      total:totalExpected
    });

    const core=await ensureCore();

    core.setProgress(data=>{
      const raw=Number(data?.progress||0);
      if(Number.isFinite(raw)){
        post("progress",{
          phase:"process",
          percentage:Math.max(0,Math.min(100,raw*100))
        });
      }
    });

    post("state",{
      phase:"process",
      message:mode==="mp3"
        ?"Đang tạo MP3…"
        :"Đang ghép MP4…"
    });

    const output=mode==="mp3"
      ?await processMp3(core,audio)
      :await processMp4(core,audio,video);

    const buffer=output.buffer.slice(
      output.byteOffset,
      output.byteOffset+output.byteLength
    );

    post("result",{
      mode,
      mime:mode==="mp3"?"audio/mpeg":"video/mp4",
      size:output.byteLength,
      buffer
    });
  }catch(error){
    post("error",{
      message:String(error?.message||error||"download_failed")
    });
  }
};
