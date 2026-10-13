import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// The intro plays once on a first visit; these tests start as a returning player (one test below covers it).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('intro-test')) localStorage.setItem('elevator:intro_seen', '1'); });
});

test('the intro plays on a first visit, holding skips it, and it does not come back', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('intro-test', '1'));
  await page.goto('/elevator/');
  await page.evaluate(() => localStorage.removeItem('elevator:intro_seen'));
  await page.reload();
  const intro = page.locator('#intro');
  await expect(intro).toBeVisible();
  await page.mouse.move(300, 200);
  await page.mouse.down();
  await expect(intro).toHaveCount(0, { timeout: 5_000 });
  await page.mouse.up();
  await page.reload();
  await page.waitForTimeout(500);
  await expect(intro).toHaveCount(0);
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

test('a new deploy shows "NEW VERSION READY" on a page running the old one', async ({ page }) => {
  const site = mkdtempSync(join(tmpdir(), 'elevator-'));
  cpSync('dist', site, { recursive: true });
  const server = await serve(site);
  await page.goto(`http://localhost:${server.port}/elevator/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // running under the first version
  await expect(page.locator('#update-banner')).toBeHidden();

  const sw = join(site, 'elevator', 'sw.js');
  writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSION = '(\w+)'/, "const VERSION = '$1next'")); // the next deploy
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 10_000 });
  await server.close();
});
