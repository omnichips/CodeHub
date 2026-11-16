// Offline support, so the game runs from the home screen without a connection: every file (the 35 MB engine
// and the game data too) is cached on the first visit, then served from the cache.
// The Hub build (scripts/build.mjs) fills in FILES and VERSION. A new deploy has a new VERSION, so the browser
// installs this worker again, caches the new files and drops the old ones; the new version shows on the next launch.
// Unbuilt (served straight from the apps folder) FILES is empty and the worker does nothing.
const FILES = [/*HUB_FILES*/];
const VERSION = '/*HUB_VERSION*/';
const CACHE = `drifters-${VERSION}`;

self.addEventListener('install', (event) => {
  if (!FILES.length) return;
  // no-store: the page downloads the same big files at the same moment on a first visit, and sharing the browser's
  // HTTP cache entry with it makes one of the two downloads fail (ERR_CACHE_WRITE_FAILURE), so the game won't start.
  const fresh = FILES.map((f) => new Request(f, { cache: 'no-store' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('drifters-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (!FILES.length || event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true, cacheName: CACHE }).then((hit) => hit || fetch(event.request)));
});
