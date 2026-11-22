const CACHE_NAME = 'fit-mit-grow-v3';
const APP_PREFIX = 'fit-mit-grow-';
const CORE_FILES = ['./', './index.html', './manifest.webmanifest'];
const OPTIONAL_FILES = ['./icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png'];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const file of CORE_FILES) { try { await cache.add(file); } catch (error) { console.warn('Cache file failed:', file, error); } }
    for (const file of OPTIONAL_FILES) { try { await cache.add(file); } catch (error) { console.warn('Optional icon missing:', file); } }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(APP_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (request.mode === 'navigate') {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (error) { return (await caches.match('./index.html')) || Response.error(); }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh.ok) { const cache = await caches.open(CACHE_NAME); cache.put(request, fresh.clone()); }
      return fresh;
    } catch (error) { return Response.error(); }
  })());
});
