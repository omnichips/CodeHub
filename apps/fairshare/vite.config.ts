import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const unused = fileURLToPath(new URL('./src/report/unused.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { html2canvas: unused, dompurify: unused, canvg: unused } },
  plugins: [
    react(),
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
      // wasm is the QR scanner engine (about 1 MB).
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,wasm}'] },
    }),
  ],
  // Libraries loaded lazily (QR scanner, PDF) are pre-bundled up front; otherwise the dev server finds them mid-session and reloads the page.
  optimizeDeps: { include: ['jspdf', 'jspdf-autotable', 'barcode-detector/ponyfill'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
