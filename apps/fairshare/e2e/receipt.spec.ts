import { expect, test } from '@playwright/test';

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
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  for (const m of ['Ana', 'Ben']) {
    await page.getByLabel('Member name').fill(m);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Dinner');

  await page.getByLabel('Receipt photos').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
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
  await page.getByRole('group', { name: 'Who shared item 1' }).getByRole('button', { name: 'Ben', exact: true }).click(); // Ana only
  await expect(page.getByText('tax, tip and service PHP 52.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Ana had 320 + 60 + 40 = 420 of 520; the 52 service is shared the same way: 42 / 10.
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();
  await expect(page.getByText('+PHP 110.00', { exact: true })).toBeVisible(); // Ana paid 572, owes 462
  await expect(page.getByText('Ben pays Ana PHP 110.00')).toBeVisible();
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
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByLabel('Member name').fill('Ana');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByLabel('Name of Ana')).toBeVisible();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();

  await page.getByLabel('Receipt photos').setInputFiles([
    { name: 'taxi.png', mimeType: 'image/png', buffer: taxi },
    { name: 'cafe.png', mimeType: 'image/png', buffer: cafe },
  ]);
  await expect(page.getByLabel('Item 3 price')).toHaveValue('60.00', { timeout: 120_000 });
  await expect(page.getByLabel('Item 1 price')).toHaveValue('150.00');
  await expect(page.getByLabel('Item 2 price')).toHaveValue('95.00');
  await expect(page.getByLabel('Amount')).toHaveValue('305.00');

  await page.getByLabel('Receipt photos').setInputFiles({ name: 'store.png', mimeType: 'image/png', buffer: store });
  await expect(page.getByLabel('Item 4 price')).toHaveValue('20.00', { timeout: 120_000 });
  await expect(page.getByLabel('Amount')).toHaveValue('325.00');

  // A typed amount is the user's: further scans add items but leave it alone.
  await page.getByLabel('Amount').fill('400');
  await page.getByLabel('Receipt photos').setInputFiles({ name: 'store.png', mimeType: 'image/png', buffer: store });
  await expect(page.getByLabel('Item 5 price')).toHaveValue('20.00', { timeout: 120_000 });
  await expect(page.getByLabel('Amount')).toHaveValue('400');
});
