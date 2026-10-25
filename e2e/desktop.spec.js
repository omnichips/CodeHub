import { expect, test } from '@playwright/test';

test('on a computer the cards sit side by side in a centred grid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); // the pop-in
  const box = await page.locator('.home').boundingBox();
  expect(Math.abs(box.x + box.width / 2 - page.viewportSize().width / 2)).toBeLessThan(2);
  const [first, second] = await page.locator('.home > .app').all();
  expect((await second.boundingBox()).y).toBe((await first.boundingBox()).y);
  await page.getByRole('link', { name: 'Zeta' }).click();
  await expect(page).toHaveURL('/zeta/');
});
