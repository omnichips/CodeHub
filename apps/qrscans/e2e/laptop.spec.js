import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, devices } from '@playwright/test';

const base = 'http://127.0.0.1:4196';
const dir = mkdtempSync(join(tmpdir(), 'qsendr-e2e-'));
const file = (name, content) => { const p = join(dir, name); writeFileSync(p, content); return p; };

test('main screen: choose a file, a phone scans it and gets it, Close now', async ({ browser }) => {
  const laptop = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await laptop.goto(`${base}/c/SECRET/`);
  const choose = laptop.getByRole('button', { name: /Click to choose a file/ });
  await expect(choose).toBeVisible();
  const [chooser] = await Promise.all([laptop.waitForEvent('filechooser'), choose.click()]);
  await chooser.setFiles(file('Trip photos.txt', 'x'.repeat(200_000)));
  await expect(laptop.locator('#sqr svg')).toBeVisible();
  await expect(laptop.locator('#sname')).toHaveText('Trip photos.txt');
  const url = await laptop.locator('#sqr').getAttribute('title');
  const phone = await (await browser.newContext({ ...devices['iPhone 14'], acceptDownloads: true })).newPage();
  const download = phone.waitForEvent('download');
  await phone.goto(url);
  expect((await download).suggestedFilename()).toBe('Trip photos.txt'); // the scan starts the download by itself
  await expect(laptop.getByText('Downloaded once')).toBeVisible({ timeout: 5000 });
  await laptop.getByRole('button', { name: 'Close now' }).click();
  await expect(choose).toBeVisible();
  await phone.reload();
  await expect(phone.getByText('This file is no longer shared')).toBeVisible();
});

test('room: open, a phone waits at the door, is let in, sends, the laptop downloads', async ({ browser }) => {
  const laptop = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await laptop.goto(`${base}/c/SECRET/`);
  await laptop.mouse.move(300, 300);
  expect(await laptop.evaluate(() => document.documentElement.style.getPropertyValue('--mx'))).toBe('300px'); // the glow follows the pointer
  await laptop.getByRole('button', { name: 'Room', exact: true }).click();
  await laptop.getByRole('button', { name: 'Open room' }).click();
  expect(await laptop.locator('.rip').count()).toBeGreaterThan(0); // the click left a ripple
  await expect(laptop.locator('#rqr svg')).toBeVisible();
  const phone = await (await browser.newContext({ ...devices['iPhone 14'], acceptDownloads: true })).newPage();
  await phone.goto(await laptop.locator('#rqr').getAttribute('title'));
  await phone.getByLabel('Your name, as others see it').fill('Ana');
  await phone.getByRole('button', { name: 'Join' }).click();
  await expect(phone.getByText('Waiting at the door')).toBeVisible();
  await expect(laptop.locator('.seat.waiting')).toHaveCount(1, { timeout: 5000 });
  await expect(laptop.locator('#roombtn')).toHaveAttribute('aria-label', 'Room: 1 at the door');
  await laptop.getByRole('button', { name: 'Let Ana in' }).click();
  await expect(laptop.locator('.seat:not(.waiting)')).toHaveCount(1, { timeout: 5000 });
  await expect(phone.locator('#me .shape svg')).toBeVisible(); // the phone shows its own shape
  await phone.locator('#pick').setInputFiles(file('notes from Ana.txt', 'hello'));
  await expect(phone.getByText('✓ Sent notes from Ana.txt')).toBeVisible({ timeout: 10000 });
  const link = laptop.getByRole('link', { name: 'Download notes from Ana.txt to this laptop' });
  await expect(link).toBeVisible({ timeout: 5000 });
  const [saved] = await Promise.all([laptop.waitForEvent('download'), link.click()]);
  expect(saved.suggestedFilename()).toBe('notes from Ana.txt');
  await laptop.keyboard.press('Escape');
  await laptop.getByRole('button', { name: 'Settings' }).click();
  await laptop.getByText('Dark', { exact: true }).click();
  expect(await laptop.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await laptop.reload();
  expect(await laptop.evaluate(() => document.documentElement.dataset.theme)).toBe('dark'); // remembered
});
