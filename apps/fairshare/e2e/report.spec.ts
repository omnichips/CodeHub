import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function tripWithExpense(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  for (const m of ['Ana', 'Beñat']) {
    await page.getByRole('button', { name: 'New member' }).click();
    await page.getByLabel('Member name').fill(m);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Dinner');
  await page.getByLabel('Amount').fill('300');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();
}

test('creates a PDF and downloads it', async ({ page }) => {
  await tripWithExpense(page);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Cebu.pdf');
  await expect(page.getByRole('button', { name: 'Share PDF' })).toHaveCount(0); // no share sheet in this browser: download only

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('Cebu.pdf');
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.subarray(-8).toString()).toContain('%%EOF');
});

test('shares the PDF through the share sheet from a tap', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: { name: string; type: string; size: number; title?: string } };
    navigator.canShare = () => true;
    navigator.share = async (data) => {
      const f = data!.files![0];
      w.shared = { name: f.name, type: f.type, size: f.size, title: data!.title };
    };
  });
  await tripWithExpense(page);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await page.getByRole('button', { name: 'Share PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: unknown }).shared)).toMatchObject({ name: 'Cebu.pdf', type: 'application/pdf', title: 'Cebu' });
  expect(await page.evaluate(() => (window as unknown as { shared: { size: number } }).shared.size)).toBeGreaterThan(5_000);
});

test('a prepared PDF is discarded when the trip changes', async ({ page }) => {
  await tripWithExpense(page);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as paid' }).first().click();
  await expect(page.getByRole('button', { name: 'Create PDF' })).toBeVisible();
});

test('Japanese names: the PDF offers the font, asks first, then prints them', async ({ page }) => {
  test.setTimeout(90_000);
  const requested: string[] = [];
  page.on('request', (r) => r.url().includes('/fonts/') && requested.push(r.url()));
  await tripWithExpense(page);
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: 'New member' }).click();
  await page.getByLabel('Member name').fill('田中 さくら');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByLabel('Name of 田中 さくら')).toBeVisible();
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();

  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByText('Japanese or Chinese characters appear as ?')).toBeVisible();
  expect(requested).toEqual([]); // nothing downloaded on its own

  await page.getByRole('button', { name: /Get the Japanese PDF font/ }).click();
  await expect(page.getByText(/uses? some of your plan/)).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  expect(requested).toEqual([]);

  await page.getByRole('button', { name: /Get the Japanese PDF font/ }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Japanese or Chinese characters appear as ?')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  expect(requested).toHaveLength(1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(20_000); // the Japanese glyphs are embedded

  // The font is kept: the next PDF is made at once, with no prompt and no second download.
  await page.getByRole('button', { name: 'Mark as paid' }).first().click();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await expect(page.getByText('Japanese or Chinese characters appear as ?')).toHaveCount(0);
  expect(requested).toHaveLength(1);
});
