import { expect, test } from '@playwright/test';

// These run the image-text-reading engine, which is slow and heavy. Skipped unless asked: npm run test:e2e:ocr
test.skip(!process.env.OCR, 'receipt reading checks: run with npm run test:e2e:ocr');

// A plain printed receipt, rendered to a PNG the way a phone photo would arrive through the photo picker.
const RECEIPT = `<body style="margin:0;background:#fff"><pre style="font:28px/1.5 'Courier New',monospace;padding:40px;color:#111">
   CEBU GRILL HOUSE
   Table 7     08/10/2026

Pork Sisig          320.00
Garlic Rice         120.00
Iced Tea             80.00
SUBTOTAL            520.00
Service Charge       52.00
TOTAL               572.00
CASH              1,000.00
CHANGE              428.00
</pre></body>`;

test('scan a receipt photo: items listed offline, editable, split by item', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const shot = await browser.newPage({ viewport: { width: 560, height: 620 } });
  await shot.setContent(RECEIPT);
  const png = await shot.screenshot();
  await shot.close();

  const outside: string[] = [];
  page.on('request', (r) => {
    if (!new URL(r.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) outside.push(r.url());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  for (const m of ['Ana', 'Ben']) {
    await page.getByRole('button', { name: 'New member' }).click();
    await page.getByLabel('Member name').fill(m);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Dinner');

  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 3 price')).toBeVisible({ timeout: 90_000 });

  // OCR is best effort, so assert what a clean print must give, then edit as a person would.
  await expect(page.getByRole('button', { name: 'Items', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Item 1 price')).toHaveValue('320.00');
  await expect(page.getByLabel('Item 2 price')).toHaveValue('120.00');
  await expect(page.getByLabel('Item 3 price')).toHaveValue('80.00');
  await expect(page.getByLabel('Item 4 name')).toHaveCount(0); // subtotal, service, total, cash, change are not items
  await expect(page.getByLabel('Amount')).toHaveValue('572.00');
  await expect(page.getByLabel('Item 1 name')).toHaveValue(/sisig/i);

  await page.getByLabel('Item 1 name').fill('Pork sisig');
  await page.locator('details.shared-by').first().locator('summary').click();
  await page.getByRole('group', { name: 'Who shared item 1' }).getByRole('checkbox', { name: 'Ben', exact: true }).uncheck(); // Ana only
  await expect(page.getByText('tax, tip and service ₱52.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Ana had 320 + 60 + 40 = 420 of 520; the 52 service is shared the same way: 42 / 10.
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();
  await expect(page.getByText('+₱110.00', { exact: true })).toBeVisible(); // Ana paid 572, owes 462
  await expect(page.getByText('Ben pays Ana ₱110.00')).toBeVisible();
  expect(outside).toEqual([]);
});

test('several receipts at once, then one more: all items listed, totals added up', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const photo = async (lines: string) => {
    const shot = await browser.newPage({ viewport: { width: 520, height: 60 + 42 * lines.split('\n').length } });
    await shot.setContent(`<pre style="font:28px/1.5 'Courier New',monospace;padding:30px;margin:0">${lines}</pre>`);
    const png = await shot.screenshot();
    await shot.close();
    return png;
  };
  const taxi = await photo('Taxi            150.00\nTOTAL           150.00');
  const cafe = await photo('Coffee           95.00\nBread            60.00\nTOTAL           155.00');
  const store = await photo('Water            20.00\nTOTAL            20.00');

  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByLabel('Name of Ana')).toBeVisible();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();

  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles([
    { name: 'taxi.png', mimeType: 'image/png', buffer: taxi },
    { name: 'cafe.png', mimeType: 'image/png', buffer: cafe },
  ]);
  await expect(page.getByRole('heading', { name: 'Crop receipt · 1 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByRole('heading', { name: 'Crop receipt · 2 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 3 price')).toHaveValue('60.00', { timeout: 120_000 });
  await expect(page.getByLabel('Item 1 price')).toHaveValue('150.00');
  await expect(page.getByLabel('Item 2 price')).toHaveValue('95.00');
  await expect(page.getByLabel('Amount')).toHaveValue('305.00');

  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({ name: 'store.png', mimeType: 'image/png', buffer: store });
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 4 price')).toHaveValue('20.00', { timeout: 120_000 });
  await expect(page.getByLabel('Amount')).toHaveValue('325.00');

  // A typed amount is the user's: further scans add items but leave it alone.
  await page.getByLabel('Amount').fill('400');
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({ name: 'store.png', mimeType: 'image/png', buffer: store });
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 5 price')).toHaveValue('20.00', { timeout: 120_000 });
  await expect(page.getByLabel('Amount')).toHaveValue('400');
});

test('crop: drag a corner to leave out what is not the receipt; rotate; use whole photo', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // A "table" line with a price at the top, a gap, then the receipt.
  const shot = await browser.newPage({ viewport: { width: 520, height: 420 } });
  await shot.setContent(`<pre style="font:28px/1.5 'Courier New',monospace;padding:30px;margin:0">Window seat     999.00



Noodles         120.00
Tea              40.00
TOTAL           160.00</pre>`);
  const png = await shot.screenshot();
  await shot.close();

  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByLabel('Name of Ana')).toBeVisible();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();

  const photo = { name: 'r.png', mimeType: 'image/png', buffer: png };
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('dialog', { name: 'Crop receipt' })).toBeVisible();

  // Rotating four times comes back to the same photo; then drag the top-left corner down past the junk line.
  const box = page.getByTestId('crop-box');
  const aspect = async () => { const r = await box.boundingBox(); return r ? r.width / r.height : 0; };
  // Four quarter-turns end where they began. Wait for each turn to be drawn (portrait, landscape, ...), or a late
  // turn would reset the crop box after the drag below.
  for (let i = 1; i <= 4; i++) {
    await page.getByRole('button', { name: 'Rotate' }).click();
    if (i % 2) await expect.poll(aspect).toBeLessThan(1);
    else await expect.poll(aspect).toBeGreaterThan(1);
  }
  const before = (await box.boundingBox())!;
  const grip = (await page.locator('[data-grip="nw"]').boundingBox())!;
  const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 4, y + before.height * 0.22, { steps: 5 });
  await page.mouse.up();
  // The last drag steps may not be drawn yet on a busy machine: wait for the box to settle.
  await expect.poll(async () => (await box.boundingBox())!.height).toBeLessThan(before.height * 0.85);
  expect((await box.boundingBox())!.y).toBeGreaterThan(before.y + before.height * 0.15);

  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 1 price')).toHaveValue('120.00', { timeout: 90_000 });
  await expect(page.getByLabel('Item 2 price')).toHaveValue('40.00');
  await expect(page.getByLabel('Item 3 price')).toHaveCount(0); // the 999.00 line was cropped out
  await expect(page.getByLabel('Amount')).toHaveValue('160.00');

  // Cancel leaves everything as it was; "Use whole photo" reads the lot.
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(photo);
  await page.getByRole('dialog', { name: 'Crop receipt' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Crop receipt' })).toHaveCount(0);
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles(photo);
  await page.getByRole('button', { name: 'Use whole photo' }).click();
  await expect(page.getByLabel('Item 3 price')).toHaveValue('999.00', { timeout: 90_000 });
});

test('the scanned photo is kept with the expense, and travels in a backup file to another phone', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const shot = await browser.newPage({ viewport: { width: 520, height: 200 } });
  await shot.setContent(`<pre style="font:28px/1.5 'Courier New',monospace;padding:30px;margin:0">Taxi            150.00\nTOTAL           150.00</pre>`);
  const png = await shot.screenshot();
  await shot.close();

  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByLabel('Name of Ana')).toBeVisible();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Taxi');
  await page.getByLabel('Receipt photos', { exact: true }).setInputFiles({ name: 'taxi.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.getByLabel('Item 1 price')).toHaveValue('150.00', { timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'View receipt photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Kept with the expense: open it again and see the photo, full size on tap.
  await page.getByRole('button', { name: /Taxi/ }).click();
  await page.getByRole('button', { name: 'View receipt photo 1' }).click();
  await expect(page.getByRole('img', { name: 'Receipt' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // A backup file carries it: wipe this phone, restore the file, the photo is back.
  await page.getByRole('button', { name: 'Others', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up trip' }).click()]);
  const file = (await download.path())!;
  await page.evaluate(() => indexedDB.deleteDatabase('fairshare'));
  await page.reload();
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip file').setInputFiles(file);
  await expect(page.getByText('Includes 1 receipt photo.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: /Taxi/ }).click();
  await expect(page.getByRole('button', { name: 'View receipt photo 1' })).toBeVisible();
});
