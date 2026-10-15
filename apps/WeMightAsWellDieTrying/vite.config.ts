import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { png } from './src/art/png.ts';
import { frames } from './src/art/sprites.ts';

const WIDTH = 1024;

/** Draws every sprite frame once, when the game is built, into one PNG atlas: `import atlas from 'virtual:atlas'`.
 *  The dev server restarts (and redraws) whenever a file under src/art changes. */
const atlas = (): Plugin => ({
  name: 'atlas',
  resolveId: (id) => (id === 'virtual:atlas' ? '\0virtual:atlas' : undefined),
  load(id) {
    if (id !== '\0virtual:atlas') return;
    const list = frames(), count: Record<string, number> = {}, anims: Record<string, { fps: number; count: number }> = {};
    let x = 0, y = 0, row = 0;
    const placed = list.map((f) => {
      if (x + f.size > WIDTH) { x = 0; y += row; row = 0; }
      const n = (count[f.anim] = (count[f.anim] ?? 0) + 1) - 1, p = { name: `${f.anim}/${n}`, x, y, size: f.size };
      if (f.fps) anims[f.anim] = { fps: f.fps, count: n + 1 };
      x += f.size;
      row = Math.max(row, f.size);
      return p;
    });
    const height = y + row, rgba = new Uint8Array(WIDTH * height * 4);
    list.forEach((f, k) => {
      for (let r = 0; r < f.size; r++) rgba.set(f.rgba.subarray(r * f.size * 4, (r + 1) * f.size * 4), ((placed[k].y + r) * WIDTH + placed[k].x) * 4);
    });
    return `export default ${JSON.stringify({ image: `data:image/png;base64,${png(WIDTH, height, rgba).toString('base64')}`, frames: placed, anims })};`;
  },
});

/** Writes sw.js into the build: it keeps the whole game (the bundle and the public files) in a cache, so it starts and
 *  plays offline once installed. Cache first; the cache is named after a hash of every file, so any change makes a new
 *  one and the old one is dropped. Every app on the hub shares the origin, so it only ever touches its own caches. */
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const hash = createHash('sha256'), pub = readdirSync('public');
    for (const f of Object.values(bundle)) hash.update(f.type === 'chunk' ? f.code : f.source);
    for (const f of pub) hash.update(f).update(readFileSync(`public/${f}`));
    const files = ['./', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...pub];
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const CACHE = 'dietrying-${hash.digest('hex').slice(0, 12)}', FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dietrying-') && k !== CACHE).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true })).then((hit) => hit || fetch(e.request)));
});
` });
  },
});

// When the game was built, for crash reports.
export default defineConfig({ plugins: [atlas(), serviceWorker()], define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) } });
