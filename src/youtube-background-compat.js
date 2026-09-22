"use strict";

(function(){
  const block=(event)=>{
    try{event.stopImmediatePropagation();}catch{}
  };

  try{
    Object.defineProperty(document,"hidden",{
      value:false,
      writable:true,
      configurable:true
    });
  }catch{}

  try{
    Object.defineProperty(document,"visibilityState",{
      value:"visible",
      writable:true,
      configurable:true
    });
  }catch{}

  window.addEventListener("visibilitychange",block,true);
  window.addEventListener("blur",block,true);
})();
