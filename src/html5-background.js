"use strict";

(function(global){
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

      if(!this.audio)throw new Error("HTML5BackgroundPlayer requires <audio>");
      if(typeof this.sourcesFor!=="function")throw new Error("HTML5BackgroundPlayer requires sourcesFor(id)");

      this.audio.preload="metadata";
      this.audio.setAttribute("playsinline","");
      this.audio.addEventListener("loadedmetadata",()=>this.#applyPendingSeek());
      this.audio.addEventListener("play",()=>{
        this.#setPlaybackState("playing");
        this.onState({type:"play",id:this.currentId,time:this.time});
      });
      this.audio.addEventListener("pause",()=>{
        this.#setPlaybackState("paused");
        this.onState({type:"pause",id:this.currentId,time:this.time});
      });
      this.audio.addEventListener("ended",()=>{
        this.#setPlaybackState("none");
        this.onState({type:"ended",id:this.currentId,time:this.time});
      });
      this.audio.addEventListener("error",()=>this.onState({
        type:"sourceerror",
        id:this.currentId,
        index:this.sourceIndex,
        error:this.audio.error?.code||0
      }));
      this.audio.addEventListener("timeupdate",()=>this.#publishPosition());

      this.#installMediaSession();
    }

    get time(){return Math.max(0,Number(this.audio.currentTime)||0);}
    get duration(){return Math.max(0,Number(this.audio.duration)||0);}
    get playing(){return !this.audio.paused&&!this.audio.ended;}

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

    async play(id,{time=0,metadata={}}={}){
      if(!id)throw new Error("missing_video_id");
      this.currentId=id;
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
          return true;
        }catch(err){
          lastError=err;
        }
      }
      throw lastError||new Error("all_audio_sources_failed");
    }

    pause(){try{this.audio.pause();}catch{}}

    stop(){
      this.pause();
      this.currentId="";
      this.pendingSeek=0;
      this.sources=[];
      this.sourceIndex=-1;
      try{
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
        uniq.push({
          url,
          mimeType,
          bitrate:Number(row?.bitrate)||0,
          support
        });
      }

      return uniq.sort((a,b)=>{
        const score=x=>{
          const mp4=x.mimeType.includes("audio/mp4")||x.mimeType.includes("m4a")?4:
            x.mimeType.includes("mpegurl")||x.mimeType.includes("m3u8")?3:
            x.mimeType.includes("audio/webm")?2:1;
          const playable=x.support==="probably"?3:x.support==="maybe"?2:1;
          return scoreBase(score,playable,x.bitrate);
        };
        function scoreBase(type,playable,bitrate){return type*1e9+playable*1e8+Math.min(bitrate,99999999);}
        return score(b)-score(a);
      });
    }

    #playSource(index){
      return new Promise((resolve,reject)=>{
        const row=this.sources[index];
        if(!row)return reject(new Error("missing_source"));

        this.sourceIndex=index;
        this.audio.pause();
        this.audio.src=row.url;
        this.audio.dataset.videoId=this.currentId;
        this.audio.dataset.mimeType=row.mimeType||"";
        this.audio.preload="auto";

        let settled=false;
        const cleanup=()=>{
          clearTimeout(timer);
          this.audio.removeEventListener("playing",onPlaying);
          this.audio.removeEventListener("error",onError);
          this.audio.removeEventListener("stalled",onStalled);
        };
        const succeed=()=>{
          if(settled)return;
          settled=true;
          cleanup();
          this.#applyPendingSeek();
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
        const onStalled=()=>{};
        const timer=setTimeout(()=>fail("audio_start_timeout"),6500);

        this.audio.addEventListener("playing",onPlaying,{once:true});
        this.audio.addEventListener("error",onError,{once:true});
        this.audio.addEventListener("stalled",onStalled);

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
      safe("play",()=>this.audio.play().catch(()=>{}));
      safe("pause",()=>this.pause());
      safe("seekbackward",d=>this.seek(this.time-(Number(d.seekOffset)||10)));
      safe("seekforward",d=>this.seek(this.time+(Number(d.seekOffset)||10)));
      safe("seekto",d=>{if(Number.isFinite(d.seekTime))this.seek(d.seekTime);});
    }
  }

  global.HTML5BackgroundPlayer=HTML5BackgroundPlayer;
})(window);
