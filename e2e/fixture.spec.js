import { expect, test } from '@playwright/test';

const dock = (page) => page.getByRole('navigation', { name: 'Favourite apps' });
const home = (page) => page.getByRole('main', { name: 'Apps' });

test('docked apps, grid apps and folders land where the registry says', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Fixture apps');
  await expect(dock(page).getByRole('link')).toHaveCount(2);
  await expect(dock(page).getByRole('link', { name: 'Alpha' })).toBeVisible();
  await expect(dock(page).getByRole('link', { name: 'Beta' })).toBeVisible();

  // Docked apps are not repeated in the grid; the folder sits where its first app would have.
  expect(await home(page).locator('.label').allTextContents()).toEqual(['Games', 'Zeta']);
  await expect(home(page).getByRole('link', { name: 'Gamma Quest' })).toHaveCount(0);
});

test('a folder opens, lists its apps, and closes with Escape or a tap outside', async ({ page }) => {
  await page.goto('/');
  const folder = home(page).getByRole('button', { name: 'Games folder, 3 apps' });
  await folder.click();
  const dialog = page.getByRole('dialog', { name: 'Games' });
  await expect(dialog.getByRole('link')).toHaveCount(3);
  await expect(dialog.getByRole('link', { name: 'Gamma Quest' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(folder).toBeFocused();

  await folder.click();
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
});

test('tapping an app opens it at its own address; Back returns to a working home screen', async ({ page }) => {
  await page.goto('/');
  await dock(page).getByRole('link', { name: 'Beta' }).click(); // beta's entry file is beta.html, served as /beta/
  await expect(page).toHaveURL('/beta/');
  await expect(page.getByRole('heading', { name: 'Beta app' })).toBeVisible();

  await page.goBack();
  await expect(page.locator('body')).not.toHaveClass(/launching/);
  await home(page).getByRole('button', { name: 'Games folder, 3 apps' }).click();
  await page.getByRole('link', { name: 'Gamma Quest' }).click();
  await expect(page).toHaveURL('/gamma/');
  await expect(page.getByRole('heading', { name: 'Gamma app' })).toBeVisible();
});

test('an app with an icon file shows it; one without gets a lettered tile', async ({ page }) => {
  await page.goto('/');
  const img = dock(page).getByRole('link', { name: 'Alpha' }).locator('img');
  await expect(img).toHaveAttribute('src', '/_icons/alpha.svg');
  expect(await img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(dock(page).getByRole('link', { name: 'Beta' }).locator('.icon')).toHaveText('B');
});

test('every icon is a comfortable tap target', async ({ page }) => {
  await page.goto('/');
  for (const tile of await page.locator('.app').all()) {
    const box = await tile.boundingBox();
    expect(box.width, await tile.getAttribute('aria-label')).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
});

test('the hub makes no request to any other site', async ({ page }) => {
  const external = [];
  page.on('request', (r) => new URL(r.url()).hostname !== 'localhost' && external.push(r.url()));
  await page.goto('/');
  await page.getByRole('button', { name: /Games folder/ }).click();
  expect(external).toEqual([]);
});
