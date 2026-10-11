// Offline support: every file of the game is cached on the first visit, then served from the cache.
// The Hub build (scripts/build.mjs) fills in FILES and VERSION. A new deploy has a new VERSION, so
// the browser installs this worker again, caches the new files and drops the old ones.
// Unbuilt (served straight from the apps folder) FILES is empty and the worker does nothing.
const FILES = [/*HUB_FILES*/];
const VERSION = '/*HUB_VERSION*/';
const CACHE = `elevator-${VERSION}`;

self.addEventListener('install', (event) => {
  if (!FILES.length) return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('elevator-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (!FILES.length || event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true, cacheName: CACHE }).then((hit) => hit || fetch(event.request)));
});
