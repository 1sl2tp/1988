const CACHE="1988-shell-v12";
const SHELL=["/","/index.html","/src/style.css?v=1988-12","/src/api.js?v=1988-12","/src/app.js?v=1988-12"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname==="/manifest.webmanifest"||url.pathname.startsWith("/icons/")){
    event.respondWith(fetch(req,{cache:"no-store"}).catch(()=>caches.match(req)));
    return;
  }
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(res=>{
      const clone=res.clone();
      caches.open(CACHE).then(c=>c.put("/index.html",clone));
      return res;
    }).catch(()=>caches.match("/index.html")));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
    if(res.ok){
      const clone=res.clone();
      caches.open(CACHE).then(c=>c.put(req,clone));
    }
    return res;
  })));
});