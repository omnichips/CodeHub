import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test, type Browser } from '@playwright/test';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

test('installable manifest and icons', async ({ page, request }) => {
  await page.goto('/');
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBeTruthy();
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/apple-touch-icon.png');

  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'FairShare', display: 'standalone', start_url: '/' });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of [...manifest.icons.map((i: { src: string }) => `/${i.src}`), '/apple-touch-icon.png']) {
    const res = await request.get(icon);
    expect(res.status(), icon).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});

// Serves dist/ from our own server so the test can really shut it down, instead of relying on a
// browser "offline" switch that WebKit handles badly with service workers.
async function serveDist() {
  const server = createServer((req, res) => {
    const path = req.url!.split('?')[0];
    try {
      const file = path === '/' ? 'index.html' : path.slice(1);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(join('dist', file)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  };
  return { origin, stop };
}

/** A receipt as a phone photo would arrive through the photo picker. */
async function receiptPhoto(browser: Browser, lines: string, font = "'Courier New',monospace") {
  const shot = await browser.newPage({ viewport: { width: 520, height: 60 + 42 * lines.split('\n').length } });
  await shot.setContent(`<pre style="font:28px/1.5 ${font};padding:30px;margin:0">${lines}</pre>`);
  const png = await shot.screenshot();
  await shot.close();
  return png;
}

test('works offline after one visit: precached, server gone, reload, add data, zero failed requests', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { origin, stop } = await serveDist();

  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.url()} ${r.status()}`));

  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Every built file is in the precache.
  const built = readdirSync('dist/assets').map((f) => `/assets/${f}`).concat(['/index.html', '/manifest.webmanifest', '/icon.svg', '/pwa-512.png', '/ocr/eng.traineddata.gz']);
  const missing = await page.evaluate(
    async (urls) => (await Promise.all(urls.map(async (u) => ((await caches.match(u, { ignoreSearch: true })) ? null : u)))).filter(Boolean),
    built,
  );
  expect(missing).toEqual([]);

  await stop();
  await page.reload();
  await expect(page.getByText('No trips yet')).toBeVisible();

  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Offline trip');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Ferry');
  await page.getByLabel('Amount').fill('120');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Ferry/ })).toContainText('₱120.00');

  // Data survives an offline reload.
  await page.reload();
  await page.getByRole('button', { name: /Offline trip/ }).click();
  await expect(page.getByRole('button', { name: /Ferry/ })).toBeVisible();

  // The PDF report works offline too: its code and font are precached, nothing is fetched.
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Offline_trip.pdf');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');

  // So does reading a receipt: the OCR engine, its worker and the English data all come from the precache.
  // (Only with npm run test:e2e:ocr; the text-reading engine is slow.)
  if (process.env.OCR) {
  const png = await receiptPhoto(browser, 'Taxi            150.00\nTOTAL           150.00');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({ name: 'taxi.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Yes, scan it' }).click();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 1 price')).toHaveValue('150.00', { timeout: 90_000 });
  await expect(page.getByLabel('Item 1 name')).toHaveValue(/taxi/i);
  }

  expect(failed).toEqual([]);
});

test('a downloaded language pack (Japanese) reads receipts offline', async ({ page, browser }) => {
  test.skip(!process.env.OCR, 'receipt reading check: run with npm run test:e2e:ocr');
  test.setTimeout(150_000);
  const { origin, stop } = await serveDist();
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Tokyo');
  await page.getByLabel('Base currency').selectOption('JPY');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();

  // The camera button: pick a photo, say yes to scanning, then choose the language. Japanese is downloaded here,
  // while online, after asking; Tagalog shows that it would need a download.
  const png = await receiptPhoto(browser, 'ラーメン        ¥980\n餃子            ¥500\n合計          ¥1,480', "'Yu Gothic','MS Gothic',sans-serif");
  const photo = { name: 'ramen.png', mimeType: 'image/png', buffer: png };
  await page.getByRole('button', { name: 'Add receipt photo' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a receipt photo' }).getByRole('button')).toHaveText(['Take a photo', 'Photo library', 'Choose files', 'Cancel']);
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(photo);
  await expect(page.getByText('may not be accurate')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, scan it' }).click();
  await expect(page.getByRole('radio', { name: /Tagalog · download 3.3 MB/ })).toBeVisible();
  await page.getByRole('radio', { name: /Japanese/ }).check();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/uses? some of your plan/)).toBeVisible(); // asks first; nothing is downloaded yet
  expect(await page.evaluate(async () => (await caches.keys()).includes('ocr-packs') && !!(await (await caches.open('ocr-packs')).keys()).length)).toBe(false);
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Crop receipt' })).toBeVisible({ timeout: 30_000 }); // downloaded, then on to cropping
  await page.getByRole('dialog', { name: 'Crop receipt' }).getByRole('button', { name: 'Cancel' }).click();

  await stop();
  await page.reload();
  await page.getByRole('button', { name: /Tokyo/ }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(photo);
  await page.getByRole('button', { name: 'Yes, scan it' }).click();
  await expect(page.getByRole('radio', { name: /Japanese/ })).toBeChecked(); // remembered on this device
  await expect(page.getByRole('radio', { name: /Japanese/ })).not.toHaveAccessibleName(/download/); // already downloaded
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 2 price')).toHaveValue('500', { timeout: 120_000 });
  await expect(page.getByLabel('Item 1 price')).toHaveValue('980');
  await expect(page.getByLabel('Item 1 name')).toHaveValue(/メン/); // OCR may misread a character (フーメン); the user fixes it
  await expect(page.getByLabel('Item 2 name')).toHaveValue('餃子');
  await expect(page.getByLabel('Amount')).toHaveValue('1480');
});

test('backup file restores a trip after the data is gone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByRole('button', { name: 'Others', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up trip' }).click()]);
  expect(download.suggestedFilename()).toBe('Cebu.fairshare');
  const file = await download.path();

  await page.evaluate(() => indexedDB.deleteDatabase('fairshare'));
  await page.reload();
  await expect(page.getByText('No trips yet')).toBeVisible();
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip file').setInputFiles(file);
  await page.getByRole('button', { name: 'Apply' }).click(); // preview first, then the trip opens
  await expect(page.getByRole('heading', { name: 'Cebu' })).toBeVisible();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.getByLabel('Name of Ana')).toBeVisible();

  // Importing the same file again is a harmless merge, not an error.
  await page.getByRole('button', { name: 'Back to trips' }).click();
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip file').setInputFiles(file);
  await expect(page.getByText('Already up to date')).toBeVisible();
});
