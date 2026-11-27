const CACHE_NAME = 'fit-mit-grow-v10';
const APP_PREFIX = 'fit-mit-grow-';
const CORE_FILES = ['./','./index.html','./manifest.webmanifest','./config.js','./auth.js'];
const PLANT_FILES = [
 './plants/sunflower.webp','./plants/calendula.webp','./plants/lavender.webp','./plants/rosemary.webp',
 './plants/strawberry.webp','./plants/tulip.webp','./plants/tomato.webp','./plants/apple-tree.webp',
 './plants/monstera.webp','./plants/hemp.webp','./plants/douglas-fir.webp','./plants/ginkgo.webp',
 './plants/bamboo.webp','./plants/hydrangea.webp','./plants/blueberry.webp','./plants/maple.webp',
 './plants/hibiscus.webp','./plants/olive-tree.webp','./plants/sage.webp','./plants/ginkgo-new.webp','./plants/garden-backdrop.webp',
 './plants/ornamental-grass.webp',
 './plants/rose-bush.webp', './plants/cherry-tree.webp', './plants/oak.webp', './plants/birch.webp', './plants/pine.webp', './plants/rhododendron.webp', './plants/pampas-grass.webp', './plants/fern.webp', './plants/hosta.webp', './plants/mint.webp', './plants/basil.webp', './plants/thyme.webp', './plants/coneflower.webp', './plants/raspberry.webp', './plants/blackberry.webp',
 './plants/growth/sunflower-1.webp','./plants/growth/sunflower-2.webp','./plants/growth/sunflower-3.webp',
 './plants/growth/lavender-1.webp','./plants/growth/lavender-2.webp','./plants/growth/lavender-3.webp',
 './plants/growth/strawberry-1.webp','./plants/growth/strawberry-2.webp','./plants/growth/strawberry-3.webp'
];
const OPTIONAL_FILES = ['./icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png',...PLANT_FILES];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);for(const file of CORE_FILES){try{await cache.add(file)}catch(e){console.warn('Cache core file failed:',file,e)}}for(const file of OPTIONAL_FILES){try{await cache.add(file)}catch(e){console.warn('Optional asset missing:',file)}}await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(APP_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;event.respondWith((async()=>{if(request.mode==='navigate'){try{const fresh=await fetch(request);if(fresh.ok){const c=await caches.open(CACHE_NAME);c.put('./index.html',fresh.clone())}return fresh}catch(e){return(await caches.match('./index.html'))||Response.error()}}const cached=await caches.match(request);if(cached)return cached;try{const fresh=await fetch(request);if(fresh.ok){const c=await caches.open(CACHE_NAME);c.put(request,fresh.clone())}return fresh}catch(e){return Response.error()}})())});
