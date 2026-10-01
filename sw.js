'use strict';

const CACHE='1988-simple-media-v35';
const AVATAR_CACHE='1988-avatar-assets-v1';
const TIKTOK_IMAGE_CACHE='1988-tiktok-image-assets-v1';
const TIKTOK_IMAGE_CACHE_MAX=480;
const AVATAR_CACHE_MAX=480;
const SUPABASE_STORAGE_HOST_RE=/^[a-z0-9]+\.supabase\.co$/i;
const AVATAR_HOST_RE=/(^|\.)(?:yt3\.ggpht\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com)$/i;

function isAvatarRequest(req,url){
  return req.destination==='image'&&AVATAR_HOST_RE.test(url.hostname);
}

function isTikTokOriginalImage(req,url){
  return req.destination==='image'&&
    SUPABASE_STORAGE_HOST_RE.test(url.hostname)&&
    url.pathname.startsWith('/storage/v1/object/public/tiktok-originals/');
}

async function trimTikTokImageCache(cache){
  const keys=await cache.keys();
  const extra=keys.length-TIKTOK_IMAGE_CACHE_MAX;
  if(extra<=0)return;
  await Promise.all(keys.slice(0,extra).map(req=>cache.delete(req)));
}

async function tikTokImageResponse(req){
  const cache=await caches.open(TIKTOK_IMAGE_CACHE);
  const cached=await cache.match(req,{ignoreVary:true});
  if(cached)return cached;

  const fresh=await fetch(req);
  if(fresh&&(fresh.ok||fresh.type==='opaque')){
    await cache.put(req,fresh.clone()).catch(()=>{});
    void trimTikTokImageCache(cache).catch(()=>{});
  }
  return fresh;
}

async function trimAvatarCache(cache){
  const keys=await cache.keys();
  const extra=keys.length-AVATAR_CACHE_MAX;
  if(extra<=0)return;
  await Promise.all(keys.slice(0,extra).map(req=>cache.delete(req)));
}

async function avatarResponse(req){
  const cache=await caches.open(AVATAR_CACHE);
  const cached=await cache.match(req,{ignoreVary:true});
  if(cached)return cached;

  const fresh=await fetch(req);
  if(fresh&&(fresh.ok||fresh.type==='opaque')){
    await cache.put(req,fresh.clone()).catch(()=>{});
    void trimAvatarCache(cache).catch(()=>{});
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
        void trimAvatarCache(cache).catch(()=>{});
      }
    }catch{}
  }
}

const SHELL=[
  './',
  './index.html',
  './pip-simple-proof.html',
  './manifest.webmanifest',
  './src/api.js',
  './src/media-meta.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
]

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
        .filter(k=>k.startsWith('1988-')&&k!==CACHE&&k!==AVATAR_CACHE&&k!==TIKTOK_IMAGE_CACHE)
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

  if(isTikTokOriginalImage(req,url)){
    event.respondWith(tikTokImageResponse(req));
    return;
  }

  if(url.origin!==self.location.origin)return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const isSources=url.pathname==='/sources'||url.pathname.startsWith('/sources/');

    try{
      const fresh=await fetch(new Request(req,{cache:'no-store'}));
      if(fresh&&fresh.ok)void cache.put(req,fresh.clone()).catch(()=>{});
      return fresh;
    }catch(err){
      const cached=await cache.match(req,{ignoreSearch:isSources});
      if(cached)return cached;

      // Never answer /sources/ with the main app shell. Doing that leaves the
      // address at /sources/?scope=... while the DOM is actually the player,
      // which looks blank and none of the source-manager controls work.
      if(isSources&&req.mode==='navigate'){
        const sourcesShell=
          await cache.match('./sources/index.html')||
          await cache.match('./sources/');
        if(sourcesShell)return sourcesShell;
      }

      if(req.mode==='navigate'){
        const shell=await cache.match('./');
        if(shell)return shell;
      }
      throw err;
    }
  })());
});
