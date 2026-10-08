import { expect, test } from '@playwright/test';

test('on a computer the home screen sits inside a centred phone frame', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('.phone').boundingBox();
  const viewport = page.viewportSize();
  expect(box.width).toBe(390);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  await expect(page.locator('.status')).toBeVisible();
  await expect(page.locator('#clock')).toHaveText(/\d/);
  await page.getByRole('link', { name: 'Zeta' }).click();
  await expect(page).toHaveURL('/zeta/');
});
