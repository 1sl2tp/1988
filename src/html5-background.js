"use strict";

(function(global){
  class HTML5BackgroundPlayer{
    constructor(options={}){
      this.audio=options.audio;
      this.sourceFor=options.sourceFor;
      this.onState=typeof options.onState==="function"?options.onState:()=>{};
      this.currentId="";
      this.meta={};
      this.pendingSeek=0;

      if(!this.audio)throw new Error("HTML5BackgroundPlayer requires an <audio> element");
      if(typeof this.sourceFor!=="function")throw new Error("HTML5BackgroundPlayer requires sourceFor(id)");

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
      this.audio.addEventListener("timeupdate",()=>this.#publishPosition());

      this.#installMediaSession();
    }

    get time(){
      return Math.max(0,Number(this.audio.currentTime)||0);
    }

    get duration(){
      return Math.max(0,Number(this.audio.duration)||0);
    }

    get playing(){
      return !this.audio.paused&&!this.audio.ended;
    }

    setMetadata(meta={}){
      this.meta={...meta};
      if(!("mediaSession" in navigator))return;
      try{
        const artwork=[];
        const src=meta.thumbnailUrl||meta.thumbnail||"";
        if(src)artwork.push({src,sizes:"512x512"});
        navigator.mediaSession.metadata=new MediaMetadata({
          title:String(meta.title||"1988"),
          artist:String(meta.uploader||meta.uploaderName||""),
          album:"1988",
          artwork
        });
      }catch{}
    }

    prepare(id){
      if(!id)return false;
      if(this.currentId===id&&this.audio.src)return true;
      this.currentId=id;
      this.pendingSeek=0;
      this.audio.pause();
      this.audio.src=this.sourceFor(id);
      this.audio.dataset.videoId=id;
      try{this.audio.load();}catch{}
      this.onState({type:"prepared",id});
      return true;
    }

    async play(id,{time=0,metadata={}}={}){
      if(!id)throw new Error("missing_video_id");
      if(this.currentId!==id||!this.audio.src)this.prepare(id);
      this.setMetadata(metadata);
      this.seek(time);

      // Must be called directly from the user's button tap on iOS.
      const result=this.audio.play();
      if(result&&typeof result.then==="function")await result;
      this.#applyPendingSeek();
      return true;
    }

    pause(){
      try{this.audio.pause();}catch{}
    }

    stop(){
      this.pause();
      this.currentId="";
      this.pendingSeek=0;
      try{
        this.audio.removeAttribute("src");
        this.audio.load();
      }catch{}
      this.#setPlaybackState("none");
    }

    seek(time){
      const t=Math.max(0,Number(time)||0);
      this.pendingSeek=t;
      this.#applyPendingSeek();
    }

    #applyPendingSeek(){
      const t=Math.max(0,Number(this.pendingSeek)||0);
      if(!Number.isFinite(t))return;
      if(this.audio.readyState<1)return;
      try{
        const duration=Number(this.audio.duration);
        const max=Number.isFinite(duration)&&duration>0?Math.max(0,duration-.15):t;
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
      const duration=this.duration;
      const position=this.time;
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
      safe("seekbackward",details=>this.seek(this.time-(Number(details.seekOffset)||10)));
      safe("seekforward",details=>this.seek(this.time+(Number(details.seekOffset)||10)));
      safe("seekto",details=>{
        if(Number.isFinite(details.seekTime))this.seek(details.seekTime);
      });
    }
  }

  global.HTML5BackgroundPlayer=HTML5BackgroundPlayer;
})(window);
