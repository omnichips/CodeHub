import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

test('with motion on: opening and closing a trip animates, and the app is usable when it ends', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.fab-add')).toHaveCSS('animation-name', 'pop');
  await page.getByRole('button', { name: 'New trip' }).click();
  await expect(page.getByRole('dialog', { name: 'New trip' })).toHaveCSS('animation-name', 'sheet-up');
  await page.getByLabel('Trip name').fill('Cebu');
  await page.getByRole('button', { name: 'Create trip' }).click();

  // A view transition runs (Safari 18 / WebKit), marked by data-nav on <html> until it ends.
  await expect(page.locator('html')).toHaveAttribute('data-nav', 'forward');
  await expect(page.locator('html')).not.toHaveAttribute('data-nav', /./);
  await expect(page.getByRole('heading', { name: 'Cebu' })).toBeVisible();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.getByLabel('Member name')).toBeVisible();

  await page.getByRole('button', { name: 'Back to trips' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-nav', 'back');
  await expect(page.locator('html')).not.toHaveAttribute('data-nav', /./);
  await expect(page.locator('.trip-card')).toHaveCount(1);
});

test('Reduce Motion: no animations at all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.fab-add')).toHaveCSS('animation-name', 'none');
});
