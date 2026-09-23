"use strict";

const express=require("express");
const {spawn,execFileSync}=require("child_process");

const app=express();
const PORT=Number(process.env.PORT)||10000;
const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;

function ytDlpVersion(){
  try{
    return execFileSync("yt-dlp",["--version"],{encoding:"utf8",timeout:5000}).trim();
  }catch{
    return "unknown";
  }
}

function cors(req,res,next){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Range,Content-Type");
  res.setHeader("Access-Control-Expose-Headers","Content-Type,X-1988-Stream,X-1988-Format");
  if(req.method==="OPTIONS")return res.sendStatus(204);
  next();
}
app.use(cors);

function videoIdFrom(req){
  return String(req.query.v||req.query.id||"").trim();
}

function youtubeUrl(id){
  return "https://www.youtube.com/watch?v="+id;
}

function spawnStream(req,res,{kind}){
  const id=videoIdFrom(req);
  if(!VIDEO_ID_RE.test(id)){
    return res.status(400).json({ok:false,error:"invalid_video"});
  }

  const isAudio=kind==="audio";
  const format=isAudio
    ?"bestaudio[ext=m4a]/bestaudio"
    :"best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]";

  const args=[
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "-f",format,
    "-o","-",
    youtubeUrl(id)
  ];

  res.status(200);
  res.setHeader("Content-Type",isAudio?"audio/mp4":"video/mp4");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Disposition","inline");
  res.setHeader("X-1988-Stream",isAudio?"audio":"video-av");
  res.setHeader("X-1988-Format",format);

  const proc=spawn("yt-dlp",args,{
    stdio:["ignore","pipe","pipe"],
    env:process.env
  });

  let stderr="";
  let started=false;
  let closed=false;

  proc.stdout.once("data",()=>{
    started=true;
  });

  proc.stderr.on("data",chunk=>{
    const text=chunk.toString();
    stderr=(stderr+text).slice(-6000);
    process.stderr.write("[yt-dlp "+id+"] "+text);
  });

  proc.on("error",err=>{
    console.error("[yt-dlp spawn]",err);
    if(!res.headersSent){
      res.status(500).json({ok:false,error:"yt_dlp_spawn_failed"});
    }else if(!res.writableEnded){
      res.destroy(err);
    }
  });

  proc.on("close",code=>{
    if(closed)return;
    closed=true;
    if(code!==0&&!started){
      console.error("[yt-dlp failed]",id,code,stderr);
      if(!res.headersSent){
        res.status(502).json({
          ok:false,
          error:"yt_dlp_failed",
          detail:stderr.slice(-1200)
        });
      }else if(!res.writableEnded){
        res.end();
      }
    }
  });

  req.on("close",()=>{
    if(!closed&&!proc.killed){
      try{proc.kill("SIGKILL");}catch{}
    }
  });

  proc.stdout.pipe(res);
}

app.get("/health",(req,res)=>{
  res.json({
    ok:true,
    service:"1988-node-stream",
    engine:"node-spawn-yt-dlp",
    version:ytDlpVersion(),
    videoMode:"muxed-av",
    audioMode:"audio-only"
  });
});

app.get("/stream",(req,res)=>spawnStream(req,res,{kind:"video"}));
app.get("/video",(req,res)=>spawnStream(req,res,{kind:"video"}));
app.get("/audio",(req,res)=>spawnStream(req,res,{kind:"audio"}));

app.listen(PORT,"0.0.0.0",()=>{
  console.log("1988 YouTube proxy listening on",PORT,"yt-dlp",ytDlpVersion());
});
