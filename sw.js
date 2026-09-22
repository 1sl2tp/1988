const CACHE="1988-shell-v14";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))));
  self.clients.claim();
});
// Intentionally no fetch handler while the app is under active development.
// This prevents stale JS/CSS/manifest from trapping installed PWAs.
