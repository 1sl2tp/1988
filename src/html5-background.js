"use strict";

(function(global){
  function createSilentWavUrl(){
    return new URL("./silent.wav",global.location.href).href;
  }

  class HTML5BackgroundPlayer{
    constructor(options={}){
      this.audio=options.audio;
      this.sourcesFor=options.sourcesFor;
      this.onState=typeof options.onState==="function"?options.onState:()=>{};
      this.currentId="";
      this.meta={};
      this.pendingSeek=0;
      this.sourceCache=new Map();
      this.sourceIndex=-1;
      this.sources=[];
      this.armed=false;
      this.realSourceActive=false;
      this.silenceUrl=createSilentWavUrl();

      if(!this.audio)throw new Error("HTML5BackgroundPlayer requires <audio>");
      if(typeof this.sourcesFor!=="function")throw new Error("HTML5BackgroundPlayer requires sourcesFor(id)");

      this.audio.preload="auto";
      this.audio.setAttribute("playsinline","");
      this.audio.addEventListener("loadedmetadata",()=>this.#applyPendingSeek());
      this.audio.addEventListener("play",()=>{
        this.#setPlaybackState("playing");
        this.onState({type:"play",id:this.currentId,time:this.time,real:this.realSourceActive});
      });
      this.audio.addEventListener("pause",()=>{
        this.#setPlaybackState("paused");
        this.onState({type:"pause",id:this.currentId,time:this.time,real:this.realSourceActive});
      });
      this.audio.addEventListener("ended",()=>{
        if(!this.realSourceActive&&this.armed){
          try{this.audio.currentTime=0;void this.audio.play();}catch{}
          return;
        }
        this.#setPlaybackState("none");
        this.onState({type:"ended",id:this.currentId,time:this.time});
      });
      this.audio.addEventListener("timeupdate",()=>this.#publishPosition());
      this.#installMediaSession();
    }

    get time(){return Math.max(0,Number(this.audio.currentTime)||0);}
    get duration(){return Math.max(0,Number(this.audio.duration)||0);}
    get playing(){return !this.audio.paused&&!this.audio.ended;}
    get ready(){return this.realSourceActive&&this.playing;}

    hasPrepared(id){
      return !!id&&(this.sourceCache.get(id)||[]).length>0;
    }

    prime(id){
      if(!id)return Promise.resolve([]);
      return this.prepare(id);
    }

    setMetadata(meta={}){
      this.meta={...meta};
      if(!("mediaSession" in navigator))return;
      try{
        const src=meta.thumbnailUrl||meta.thumbnail||"";
        navigator.mediaSession.metadata=new MediaMetadata({
          title:String(meta.title||"1988"),
          artist:String(meta.uploader||meta.uploaderName||""),
          album:"1988",
          artwork:src?[{src,sizes:"512x512"}]:[]
        });
      }catch{}
    }

    arm(id,{metadata={}}={}){
      if(!id)return false;
      this.currentId=id;
      this.setMetadata(metadata);
      this.armed=true;
      this.realSourceActive=false;
      this.sources=[];
      this.sourceIndex=-1;
      this.pendingSeek=0;

      try{this.audio.pause();}catch{}
      this.audio.loop=true;
      this.audio.src=this.silenceUrl;
      this.audio.dataset.videoId=id;
      this.audio.dataset.kind="armed";
      this.audio.preload="auto";
      try{this.audio.load();}catch{}

      // This must execute synchronously inside the user's tap.
      try{
        const p=this.audio.play();
        if(p&&typeof p.catch==="function")p.catch(()=>{});
      }catch{}

      this.onState({type:"armed",id});
      return true;
    }

    async prepare(id){
      if(!id)return [];
      this.currentId=id;
      if(this.sourceCache.has(id)){
        this.sources=this.sourceCache.get(id)||[];
        return this.sources;
      }

      this.onState({type:"loading",id});
      try{
        const raw=await this.sourcesFor(id);
        const rows=this.#normalizeSources(raw);
        this.sourceCache.set(id,rows);
        if(this.currentId===id)this.sources=rows;
        this.onState({type:"ready",id,count:rows.length});
        return rows;
      }catch(err){
        this.sourceCache.set(id,[]);
        if(this.currentId===id)this.sources=[];
        this.onState({type:"prepareerror",id,error:String(err?.message||err)});
        return [];
      }
    }

    async activate(id,{time=0,metadata={}}={}){
      if(!id||id!==this.currentId)throw new Error("stale_video");
      this.setMetadata(metadata);
      let rows=this.sourceCache.get(id)||[];
      if(!rows.length)rows=await this.prepare(id);
      if(!rows.length)throw new Error("no_html5_audio_source");

      this.sources=rows;
      this.pendingSeek=Math.max(0,Number(time)||0);

      let lastError=null;
      for(let i=0;i<rows.length;i++){
        try{
          await this.#playSource(i);
          this.realSourceActive=true;
          this.armed=false;
          return true;
        }catch(err){
          lastError=err;
        }
      }
      throw lastError||new Error("all_audio_sources_failed");
    }

    async play(){
      try{
        const p=this.audio.play();
        if(p&&typeof p.then==="function")await p;
        return true;
      }catch{
        return false;
      }
    }

    pause(){try{this.audio.pause();}catch{}}

    stop(){
      this.pause();
      this.currentId="";
      this.pendingSeek=0;
      this.sources=[];
      this.sourceIndex=-1;
      this.armed=false;
      this.realSourceActive=false;
      try{
        this.audio.loop=false;
        this.audio.removeAttribute("src");
        this.audio.load();
      }catch{}
      this.#setPlaybackState("none");
    }

    seek(time){
      this.pendingSeek=Math.max(0,Number(time)||0);
      this.#applyPendingSeek();
    }

    #normalizeSources(raw){
      const rows=Array.isArray(raw)?raw:[];
      const uniq=[];
      const seen=new Set();

      for(const row of rows){
        const url=String(row?.url||"").trim();
        if(!url||seen.has(url))continue;
        seen.add(url);
        const mimeType=String(row?.mimeType||row?.type||"").toLowerCase();
        const support=mimeType?this.audio.canPlayType(mimeType):"";
        uniq.push({url,mimeType,bitrate:Number(row?.bitrate)||0,support});
      }

      const score=x=>{
        const type=x.mimeType.includes("audio/mp4")||x.mimeType.includes("m4a")?4:
          x.mimeType.includes("mpegurl")||x.mimeType.includes("m3u8")?3:
          x.mimeType.includes("audio/webm")?2:1;
        const playable=x.support==="probably"?3:x.support==="maybe"?2:1;
        return type*1e9+playable*1e8+Math.min(x.bitrate,99999999);
      };
      return uniq.sort((a,b)=>score(b)-score(a));
    }

    #playSource(index){
      return new Promise((resolve,reject)=>{
        const row=this.sources[index];
        if(!row)return reject(new Error("missing_source"));

        this.sourceIndex=index;
        this.realSourceActive=false;
        this.audio.loop=false;
        this.audio.src=row.url;
        this.audio.dataset.videoId=this.currentId;
        this.audio.dataset.kind="real";
        this.audio.dataset.mimeType=row.mimeType||"";
        this.audio.preload="auto";

        let settled=false;
        const cleanup=()=>{
          clearTimeout(timer);
          this.audio.removeEventListener("playing",onPlaying);
          this.audio.removeEventListener("error",onError);
        };
        const succeed=()=>{
          if(settled)return;
          settled=true;
          cleanup();
          this.#applyPendingSeek();
          this.realSourceActive=true;
          this.onState({type:"source",id:this.currentId,index,url:row.url,mimeType:row.mimeType});
          resolve(true);
        };
        const fail=reason=>{
          if(settled)return;
          settled=true;
          cleanup();
          reject(new Error(reason));
        };
        const onPlaying=()=>succeed();
        const onError=()=>fail("media_error_"+(this.audio.error?.code||0));
        const timer=setTimeout(()=>fail("audio_start_timeout"),6500);

        this.audio.addEventListener("playing",onPlaying,{once:true});
        this.audio.addEventListener("error",onError,{once:true});

        try{this.audio.load();}catch{}
        try{
          const p=this.audio.play();
          if(p&&typeof p.catch==="function")p.catch(err=>fail(err?.name||"play_rejected"));
        }catch(err){
          fail(err?.message||"play_throw");
        }
      });
    }

    #applyPendingSeek(){
      const t=Math.max(0,Number(this.pendingSeek)||0);
      if(this.audio.readyState<1)return;
      try{
        const d=Number(this.audio.duration);
        const max=Number.isFinite(d)&&d>0?Math.max(0,d-.15):t;
        this.audio.currentTime=Math.min(t,max);
        this.pendingSeek=0;
      }catch{}
    }

    #setPlaybackState(state){
      if(!("mediaSession" in navigator))return;
      try{navigator.mediaSession.playbackState=state;}catch{}
    }

    #publishPosition(){
      if(!this.realSourceActive)return;
      if(!("mediaSession" in navigator)||typeof navigator.mediaSession.setPositionState!=="function")return;
      const duration=this.duration,position=this.time;
      if(!duration||position>duration)return;
      try{
        navigator.mediaSession.setPositionState({
          duration,
          position,
          playbackRate:Number(this.audio.playbackRate)||1
        });
      }catch{}
    }

    #installMediaSession(){
      if(!("mediaSession" in navigator))return;
      const safe=(name,handler)=>{try{navigator.mediaSession.setActionHandler(name,handler);}catch{}};
      safe("play",()=>{void this.play();});
      safe("pause",()=>this.pause());
      safe("seekbackward",d=>this.seek(this.time-(Number(d.seekOffset)||10)));
      safe("seekforward",d=>this.seek(this.time+(Number(d.seekOffset)||10)));
      safe("seekto",d=>{if(Number.isFinite(d.seekTime))this.seek(d.seekTime);});
    }
  }

  global.HTML5BackgroundPlayer=HTML5BackgroundPlayer;
})(window);
