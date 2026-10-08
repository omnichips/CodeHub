// Renders public/icon.svg to the opaque PNGs the manifest and iOS need. Run: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { webkit } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');
const sizes = { 'apple-touch-icon.png': 180, 'pwa-192.png': 192, 'pwa-512.png': 512 };

const browser = await webkit.launch();
for (const [file, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: false });
  await page.close();
}
await browser.close();
