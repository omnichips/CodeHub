import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const unused = fileURLToPath(new URL('./src/report/unused.ts', import.meta.url));

// The receipt reader (tesseract.js) loads language files by fixed name from a folder, so they cannot be hashed
// assets. Served in dev and emitted in the build at ocr/<code>.traineddata.gz. English is precached; the others are
// language packs the user downloads (src/receipt/packs.ts). Tagalog only exists in the larger 4.0.0 format.
const OCR_LANGS: Record<string, string> = {
  eng: '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  jpn: '@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz',
  tgl: '@tesseract.js-data/tgl/4.0.0/tgl.traineddata.gz',
};
const ocrFile = (code: string) => readFileSync(fileURLToPath(new URL(`./node_modules/${OCR_LANGS[code]}`, import.meta.url)));
const ocrData: Plugin = {
  name: 'ocr-data',
  configureServer: (server) =>
    void server.middlewares.use('/ocr/', (req, res, next) => {
      const code = /^\/(\w+)\.traineddata\.gz$/.exec(req.url ?? '')?.[1];
      if (!code || !OCR_LANGS[code]) return next();
      res.setHeader('Content-Type', 'application/octet-stream').end(ocrFile(code));
    }),
  generateBundle() {
    for (const code of Object.keys(OCR_LANGS)) this.emitFile({ type: 'asset', fileName: `ocr/${code}.traineddata.gz`, source: ocrFile(code) });
  },
};

export default defineConfig({
  resolve: { alias: { html2canvas: unused, dompurify: unused, canvg: unused } },
  plugins: [
    react(),
    ocrData,
    VitePWA({
      registerType: 'prompt', // the app shows its own "update ready" banner
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FairShare',
        short_name: 'FairShare',
        description: 'Split trip expenses. Works fully offline.',
        display: 'standalone',
        // start_url and scope are left out on purpose: the plugin sets both to the build's base path, so the same
        // app works at the site root or under a sub-path such as /fairshare/ (build with --base=/fairshare/).
        background_color: '#f7f6f1',
        theme_color: '#f7f6f1',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      // Precache the whole app; there are no runtime network calls to cache.
      // wasm is the QR scanner engine (about 1 MB); the receipt reader's English data is 3 MB and its engine a 4 MB .js
      // file, hence the higher size limit (Workbox skips files over 2 MiB by default).
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,wasm}', 'ocr/eng.traineddata.gz'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Downloaded language packs: the app puts them in this cache (src/receipt/packs.ts), the service worker serves
        // them from it, so a pack works offline once downloaded.
        runtimeCaching: [{ urlPattern: /\/ocr\/\w+\.traineddata\.gz$/, handler: 'CacheFirst', options: { cacheName: 'ocr-packs' } }],
      },
    }),
  ],
  // Libraries loaded lazily (QR scanner, PDF) are pre-bundled up front; otherwise the dev server finds them mid-session and reloads the page.
  optimizeDeps: { include: ['jspdf', 'jspdf-autotable', 'barcode-detector/ponyfill', 'tesseract.js'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
