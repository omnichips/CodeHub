// Bakes the board's map thumbnails, so the board shows them at once instead of painting each map as it opens. Starts
// the dev server, opens the game with ?thumbs in a headless browser (the menu paints every map, with blood and
// without), and writes them to src/art/thumbs. Run it again after a map or the map art changes:
//   node scripts/thumbs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5199/?thumbs');
  const thumbs = (await page.waitForFunction(() => (window as unknown as { thumbs?: Record<string, string> }).thumbs, undefined, { timeout: 120000 }).then((h) => h.jsonValue())) as Record<string, string>;
  mkdirSync('src/art/thumbs', { recursive: true });
  for (const [key, url] of Object.entries(thumbs)) writeFileSync(`src/art/thumbs/${key}.webp`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`Baked ${Object.keys(thumbs).length} thumbnails into src/art/thumbs.`);
} finally {
  await browser.close();
  await server.close();
}
