'use strict';

const CACHE_PREFIX='1988-shell-';
const CACHE_NAME='1988-shell-v15';
const SHELL=[
  './',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(
      keys
        .filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)
        .map(key=>caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
});

async function networkFirst(request,{navigation=false}={}){
  const cache=await caches.open(CACHE_NAME);
  const networkRequest=new Request(request,{cache:'no-store'});
  try{
    const response=await fetch(networkRequest);
    if(response?.ok){
      void cache.put(request,response.clone()).catch(()=>{});
      if(navigation)void cache.put('./',response.clone()).catch(()=>{});
    }
    return response;
  }catch(error){
    const cached=await cache.match(request);
    if(cached)return cached;
    if(navigation){
      const shell=await cache.match('./');
      if(shell)return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'||request.destination==='document'){
    event.respondWith(networkFirst(request,{navigation:true}));
    return;
  }

  event.respondWith(networkFirst(request));
});
