'use strict';

const CACHE='1988-main-pip-native-buttons-v158';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './silent.wav',
  './src/style.css?v=pip-native-buttons-158',
  './src/app.js?v=pip-safe-controls-156',
  './src/media-core.js?v=2',
  './src/html5-background.js?v=9',
  './src/channel-library.js?v=sources-88',
  './src/yt-local.js?v=pip-storyboard-auto-139',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      await cache.addAll(SHELL);
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('1988-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const fresh=await fetch(new Request(req,{cache:'no-store'}));
      if(fresh&&fresh.ok)void cache.put(req,fresh.clone()).catch(()=>{});
      return fresh;
    }catch(err){
      const cached=await cache.match(req);
      if(cached)return cached;
      if(req.mode==='navigate'){
        const shell=await cache.match('./');
        if(shell)return shell;
      }
      throw err;
    }
  })());
});
