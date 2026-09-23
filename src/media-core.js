"use strict";

(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.MediaCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const VIDEO_ID_RE=/^[A-Za-z0-9_-]{11}$/;
  const AUDIO_MODES=new Set(["audio","lock"]);
  const VIDEO_MODES=new Set(["video","pip"]);

  function buildNativeMediaUrl(base,id,kind="video"){
    if(!VIDEO_ID_RE.test(String(id||"")))throw new Error("invalid_video_id");
    if(kind!=="video"&&kind!=="audio")throw new Error("invalid_media_kind");
    const url=new URL(String(base||""));
    url.searchParams.set("action","media");
    url.searchParams.set("id",id);
    url.searchParams.set("kind",kind);
    return url.toString();
  }

  function modeUsesAudio(mode){return AUDIO_MODES.has(String(mode||""));}
  function modeUsesVideo(mode){return VIDEO_MODES.has(String(mode||""));}

  function activeTimeForMode(mode,videoTime,audioTime){
    const value=modeUsesAudio(mode)?audioTime:videoTime;
    return Math.max(0,Number(value)||0);
  }

  function pipMethod(video,doc){
    if(doc?.pictureInPictureEnabled&&typeof video?.requestPictureInPicture==="function")return "standard";
    if(typeof video?.webkitSupportsPresentationMode==="function"&&
       typeof video?.webkitSetPresentationMode==="function"&&
       video.webkitSupportsPresentationMode("picture-in-picture"))return "webkit";
    return "none";
  }

  return {buildNativeMediaUrl,modeUsesAudio,modeUsesVideo,activeTimeForMode,pipMethod};
});
