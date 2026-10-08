import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Gate: no critical or serious automated accessibility findings on each main screen.
async function check(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(bad.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
}

test('no critical accessibility findings', async ({ page }) => {
  await page.goto('/');
  await check(page, 'trip list');
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await check(page, 'expenses (empty)');
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  for (const m of ['Ana', 'Ben']) {
    await page.getByLabel('Member name').fill(m);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await check(page, 'members');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Dinner');
  await page.getByLabel('Amount').fill('300');
  await check(page, 'expense sheet');
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 300;
    c.getContext('2d')!.fillRect(20, 20, 160, 260);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Receipt photos').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
  await expect(page.getByTestId('crop-box')).toBeVisible();
  await check(page, 'crop screen');
  await page.getByRole('dialog', { name: 'Crop receipt' }).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await check(page, 'expenses');
  await page.getByRole('button', { name: 'Settle up', exact: true }).click();
  await check(page, 'settle up');
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await check(page, 'sync');
});
