import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'PressStart2P.ttf'],
      manifest: {
        name: 'Kindered',
        short_name: 'Kindered',
        description: 'Party games: one big screen, everyone plays on their phone.',
        display: 'standalone',
        // start_url and scope come from the build's base (/kindered/), as in FairsHare
        background_color: '#0d0b1e',
        theme_color: '#0d0b1e',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // the shell works offline; playing still needs PeerJS signaling
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ttf,webmanifest}'] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
