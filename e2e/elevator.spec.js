import { expect, test } from '@playwright/test';

// Elevator Anomaly on a phone held sideways (iPhone 11 landscape, WebKit).

// Visible elements that reach past the screen edge. Skips anything clipped by an ancestor
// (scrolling panels, cards that cut off long text) and anything faded out.
const sticksOut = (page) =>
  page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.checkVisibility({ opacityProperty: true })) continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.opacity === '0') { clipped = true; break; }
      }
      if (clipped) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1))
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().replace(/\s+/g, '.') : ''}`);
    }
    return out;
  });

test('a run fits the screen: nothing sticks out, End Turn and MANIFEST are on screen', async ({ page }) => {
  await page.goto('/elevator/');
  await page.getByRole('button', { name: 'Play Normally' }).tap();
  await page.locator('#deck-grid > *').first().tap(); // starter mod
  const door = page.locator('#floor-options .option-card:not(.blocked-card)').first();
  await expect(door).toBeVisible();
  await page.waitForTimeout(1500); // walk-in and fade-in
  expect(await sticksOut(page)).toEqual([]);

  await door.tap(); // the first floor is always a fight
  await expect(page.locator('#hand .card').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  expect(await sticksOut(page)).toEqual([]);
  await expect(page.locator('#btn-end-turn')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#btn-manifest')).toBeInViewport({ ratio: 1 });
});
