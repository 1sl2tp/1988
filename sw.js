'use strict';

const CACHE='1988-main-watch-browse-v260';
const AVATAR_CACHE='1988-avatar-assets-v1';
const AVATAR_HOST_RE=/(^|\.)(?:yt3\.ggpht\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com)$/i;

function isAvatarRequest(req,url){
  return req.destination==='image'&&AVATAR_HOST_RE.test(url.hostname);
}

async function avatarResponse(req){
  const cache=await caches.open(AVATAR_CACHE);
  const cached=await cache.match(req,{ignoreVary:true});
  if(cached)return cached;

  const fresh=await fetch(req);
  if(fresh&&(fresh.ok||fresh.type==='opaque')){
    await cache.put(req,fresh.clone()).catch(()=>{});
  }
  return fresh;
}

async function cacheAvatarUrls(urls=[]){
  const cache=await caches.open(AVATAR_CACHE);
  for(const raw of urls){
    try{
      const url=new URL(String(raw||''));
      if(!AVATAR_HOST_RE.test(url.hostname))continue;
      const req=new Request(url.href,{
        method:'GET',
        mode:'no-cors',
        credentials:'omit',
        cache:'force-cache'
      });
      const cached=await cache.match(req,{ignoreVary:true});
      if(cached)continue;
      const res=await fetch(req);
      if(res&&(res.ok||res.type==='opaque')){
        await cache.put(req,res.clone()).catch(()=>{});
      }
    }catch{}
  }
}

const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './silent.wav',
  './src/style.css?v=watch-browse-260',
  './src/app.js?v=watch-browse-260',
  './src/media-core.js?v=2',
  './src/html5-background.js?v=9',
  './src/channel-library.js?v=sources-88',
  './src/media-meta.js?v=1',
  './src/yt-local.js?v=embed-filter-141',
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
    await Promise.all(
      keys
        .filter(k=>k.startsWith('1988-')&&k!==CACHE&&k!==AVATAR_CACHE)
        .map(k=>caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type!=='CACHE_AVATARS')return;
  const urls=Array.isArray(event.data?.urls)?event.data.urls.slice(0,240):[];
  event.waitUntil(cacheAvatarUrls(urls));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  if(isAvatarRequest(req,url)){
    event.respondWith(avatarResponse(req));
    return;
  }

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
