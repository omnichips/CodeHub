import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { serve } from '../scripts/serve.mjs';

test('FairShare is on the home screen and opens at /fairshare/', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('My apps');
  const link = page.getByRole('main', { name: 'Apps' }).getByRole('link', { name: 'FairShare' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL('/fairshare/');
  await expect(page.getByText('No trips yet')).toBeVisible();
});

test('/fairshare redirects to /fairshare/ so the install scope matches', async ({ page }) => {
  await page.goto('/fairshare');
  expect(new URL(page.url()).pathname).toBe('/fairshare/');
});

test('FairShare installs from its own address: manifest, icons and links are all under /fairshare/', async ({ page, request }) => {
  await page.goto('/fairshare/');
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('/fairshare/manifest.webmanifest');
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/fairshare/apple-touch-icon.png');
  const manifest = await (await request.get('/fairshare/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'FairShare', start_url: '/fairshare/', scope: '/fairshare/', display: 'standalone' });
  for (const icon of manifest.icons) expect((await request.get(`/fairshare/${icon.src}`)).status(), icon.src).toBe(200);
});

// Served from a server this test can really shut down, as in FairShare's own offline gate.
test('works offline under /fairshare/ and does not take over the rest of the site', async ({ page }) => {
  const server = await serve('dist');
  const origin = `http://localhost:${server.port}`;
  const failed = [];
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.url()} ${r.status()}`));

  await page.goto(`${origin}/fairshare/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope)).toBe(`${origin}/fairshare/`);

  const built = readdirSync('dist/fairshare/assets').map((f) => `/fairshare/assets/${f}`).concat(['/fairshare/index.html', '/fairshare/manifest.webmanifest']);
  const missing = await page.evaluate(
    async (urls) => (await Promise.all(urls.map(async (u) => ((await caches.match(u, { ignoreSearch: true })) ? null : u)))).filter(Boolean),
    built,
  );
  expect(missing).toEqual([]);

  // The home screen, and any other app on this site, must still come from the network, not from FairShare's worker.
  await page.goto(`${origin}/`);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);
  await expect(page.getByRole('link', { name: 'FairShare' })).toBeVisible();

  await page.goto(`${origin}/fairshare/`);
  await server.close();
  await page.reload();
  await expect(page.getByText('No trips yet')).toBeVisible();
  await page.getByLabel('Trip name').fill('Offline trip');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('heading', { name: 'Offline trip' })).toBeVisible();
  expect(failed).toEqual([]);
});
