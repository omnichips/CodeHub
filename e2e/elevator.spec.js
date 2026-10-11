import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { serve } from '../scripts/serve.mjs';

// Elevator Anomaly on a phone held sideways (iPhone 11 landscape, WebKit).

// Visible elements that reach past the screen edge. Skips anything clipped by an ancestor
// (scrolling panels, cards that cut off long text) and anything faded out.
const sticksOut = (page) =>
  page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.checkVisibility({ opacityProperty: true })) continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.opacity === '0') { clipped = true; break; }
      }
      if (clipped) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1))
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().replace(/\s+/g, '.') : ''}`);
    }
    return out;
  });

test('a run fits the screen: nothing sticks out, End Turn and MANIFEST are on screen', async ({ page }) => {
  await page.goto('/elevator/');
  await page.getByRole('button', { name: 'Play Normally' }).tap();
  await page.locator('#deck-grid > *').first().tap(); // starter mod
  const door = page.locator('#floor-options .option-card:not(.blocked-card)').first();
  await expect(door).toBeVisible();
  await page.waitForTimeout(1500); // walk-in and fade-in
  expect(await sticksOut(page)).toEqual([]);

  await door.tap(); // the first floor is always a fight
  await expect(page.locator('#hand .card').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(await sticksOut(page)).toEqual([]);
  await expect(page.locator('#btn-end-turn')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#btn-manifest')).toBeInViewport({ ratio: 1 });
});

test('installs from /elevator/: manifest and icons are all under /elevator/', async ({ page, request }) => {
  await page.goto('/elevator/');
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('manifest.webmanifest');
  expect((await request.get('/elevator/icons/apple-touch-icon.png')).status()).toBe(200);
  const manifest = await (await request.get('/elevator/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Elevator Anomaly', start_url: './', scope: './', display: 'fullscreen', orientation: 'landscape' });
  for (const icon of manifest.icons) expect((await request.get(`/elevator/${icon.src}`)).status(), icon.src).toBe(200);
});

// Served from a server this test can really shut down, as in FairShare's offline test.
test('works offline under /elevator/ after the first visit, font included', async ({ page }) => {
  const server = await serve('dist');
  const origin = `http://localhost:${server.port}`;
  await page.goto(`${origin}/elevator/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope)).toBe(`${origin}/elevator/`);

  const files = JSON.parse(readFileSync('dist/elevator/sw.js', 'utf8').match(/const FILES = (\[.*\]);/)[1]);
  const missing = await page.evaluate(
    async (urls) => (await Promise.all(urls.map(async (u) => ((await caches.match(u)) ? null : u)))).filter(Boolean),
    files.map((f) => new URL(f, `${origin}/elevator/`).href),
  );
  expect(missing).toEqual([]);

  await server.close();
  await page.reload();
  await page.getByRole('button', { name: 'Play Normally' }).tap();
  await page.locator('#deck-grid > *').first().tap();
  await expect(page.locator('#floor-options .option-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('12px "Press Start 2P"'))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Press Start 2P') && f.status === 'loaded'))).toBe(true);
});
