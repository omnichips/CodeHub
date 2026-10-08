import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const unused = fileURLToPath(new URL('./src/report/unused.ts', import.meta.url));

// The receipt reader (tesseract.js) loads its language file by a fixed name from a folder, so it cannot be a hashed
// asset. Served in dev and emitted in the build at ocr/eng.traineddata.gz; Workbox precaches it like everything else.
const ENG = fileURLToPath(new URL('./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url));
const ocrData: Plugin = {
  name: 'ocr-data',
  configureServer: (server) =>
    void server.middlewares.use('/ocr/eng.traineddata.gz', (_req, res) => res.setHeader('Content-Type', 'application/octet-stream').end(readFileSync(ENG))),
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'ocr/eng.traineddata.gz', source: readFileSync(ENG) });
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
      // wasm is the QR scanner engine (about 1 MB); gz is the receipt reader's English data (about 3 MB), and its
      // engine is a 4 MB .js file, hence the higher size limit (Workbox skips files over 2 MiB by default).
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,wasm,gz}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
    }),
  ],
  // Libraries loaded lazily (QR scanner, PDF) are pre-bundled up front; otherwise the dev server finds them mid-session and reloads the page.
  optimizeDeps: { include: ['jspdf', 'jspdf-autotable', 'barcode-detector/ponyfill', 'tesseract.js'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
