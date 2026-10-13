// The phone app: sharing and rooms run in the browser, device to device (WebRTC), so these use Chromium and a signaling service.
// By default that is PeerJS's public one (needs internet). For a repeatable run, start a local one and set PEER_SERVER:
//   npx peerjs --port 9000        then        PEER_SERVER=localhost:9000 npx playwright test --project=phone
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const signal = process.env.PEER_SERVER ? `?signal=${process.env.PEER_SERVER}` : '';
const app = `http://localhost:4300/${signal}`;
// What a device that scanned a QR code opens: the same page, with the QR's #-part (and the test's choice of signaling service).
const scanned = (url) => `http://localhost:4300/${signal}${new URL(url).hash}`;

async function newPage(browser, viewport = { width: 1100, height: 800 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  return page;
}
const same = async (download, content) => Buffer.compare(await readFile(await download.path()), content) === 0;

test('share a file from a phone: a second device scans the QR and gets it, Close now ends it', async ({ browser }) => {
  const sender = await newPage(browser);
  await sender.goto(app);
  const [chooser] = await Promise.all([sender.waitForEvent('filechooser'), sender.getByRole('button', { name: /Click to choose a file/ }).click()]);
  const content = Buffer.from('hello from a phone '.repeat(20_000)); // ~380 KB, many chunks
  await chooser.setFiles({ name: 'Trip photos.txt', mimeType: 'text/plain', buffer: content });
  await expect(sender.locator('#sqr svg')).toBeVisible({ timeout: 20000 });
  await expect(sender.locator('#sname')).toHaveText('Trip photos.txt');
  const url = await sender.locator('#sqr').getAttribute('title');
  expect(url).toMatch(/#s=qs[0-9a-z]{20,}$/);

  const receiver = await newPage(browser, { width: 390, height: 800 });
  const download = receiver.waitForEvent('download', { timeout: 30000 });
  await receiver.goto(scanned(url));
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('Trip photos.txt');
  expect(await same(saved, content)).toBe(true); // arrived intact
  await expect(receiver.getByText('Trip photos.txt is ready')).toBeVisible();
  await expect(sender.getByText('Downloaded once')).toBeVisible({ timeout: 10000 }); // the receiver confirmed it

  await sender.getByRole('button', { name: 'Close now' }).click();
  await expect(sender.getByRole('button', { name: /Click to choose a file/ })).toBeVisible();
  const late = await newPage(browser, { width: 390, height: 800 });
  await late.goto(scanned(url));
  await expect(late.getByText('no longer shared')).toBeVisible({ timeout: 20000 });
});

test('a file over 100 MB is refused before anything starts', async ({ browser }) => {
  const sender = await newPage(browser);
  await sender.goto(app);
  const [chooser] = await Promise.all([sender.waitForEvent('filechooser'), sender.getByRole('button', { name: /Click to choose a file/ }).click()]);
  const dir = await mkdtemp(join(tmpdir(), 'qsendr-big-'));
  const huge = join(dir, 'huge.bin');
  await writeFile(huge, Buffer.alloc(100 * 1024 * 1024 + 1)); // one byte over
  await chooser.setFiles(huge);
  await expect(sender.locator('#notice')).toContainText('Files up to 100 MB can be shared');
  await expect(sender.locator('#sqr svg')).toBeHidden();
  await rm(dir, { recursive: true, force: true });
});

test('room on a phone: guests wait at the door, are let in, and send, receive and message each other', async ({ browser }) => {
  const host = await newPage(browser, { width: 420, height: 900 });
  await host.goto(app);
  await host.getByRole('button', { name: 'Room', exact: true }).click();
  await host.getByRole('button', { name: 'Open room' }).click();
  await expect(host.locator('#rqr svg')).toBeVisible({ timeout: 20000 });
  const url = await host.locator('#rqr').getAttribute('title');
  expect(url).toMatch(/#r=qs[0-9a-z]{20,}$/);

  const join = async (name) => {
    const page = await newPage(browser, { width: 390, height: 800 });
    await page.goto(scanned(url));
    await page.getByLabel('Your name, as others see it').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    return page;
  };
  const ana = await join('Ana');
  await expect(ana.getByText('Waiting at the door')).toBeVisible({ timeout: 30000 });
  await expect(host.locator('.seat.waiting')).toHaveCount(1, { timeout: 10000 });
  await expect(host.locator('#roombtn')).toHaveAttribute('aria-label', 'Room: 1 at the door');
  await host.getByRole('button', { name: 'Let Ana in' }).click();
  await expect(ana.locator('#gme .shape svg')).toBeVisible({ timeout: 10000 }); // she has her own shape
  await expect(host.locator('.seat:not(.waiting)')).toHaveCount(1);

  // Ana sends a file; the host sees it and downloads it.
  const content = Buffer.from('notes from Ana '.repeat(30_000));
  await ana.locator('#gpick').setInputFiles({ name: 'notes from Ana.txt', mimeType: 'text/plain', buffer: content });
  await expect(ana.getByText('✓ Sent notes from Ana.txt')).toBeVisible({ timeout: 30000 });
  const hostLink = host.getByRole('button', { name: 'Download notes from Ana.txt' });
  await expect(hostLink).toBeVisible({ timeout: 10000 });
  const [hostSaved] = await Promise.all([host.waitForEvent('download'), hostLink.click()]);
  expect(await same(hostSaved, content)).toBe(true);

  // Ben joins; he gets Ana's file through the host, and his text reaches Ana.
  const ben = await join('Ben');
  await host.getByRole('button', { name: 'Let Ben in' }).click();
  const benLink = ben.getByRole('button', { name: 'Download notes from Ana.txt' });
  await expect(benLink).toBeVisible({ timeout: 15000 });
  const [benSaved] = await Promise.all([ben.waitForEvent('download', { timeout: 30000 }), benLink.click()]);
  expect(await same(benSaved, content)).toBe(true);
  await ben.getByText('Send text or a link').click();
  await ben.locator('#gtext2').fill('see you at 6');
  await ben.getByRole('button', { name: 'Send text' }).click();
  await expect(ana.getByText('see you at 6')).toBeVisible({ timeout: 10000 });
  await expect(host.getByText('see you at 6')).toBeVisible();

  // Removing Ben cuts him off; closing the room tells Ana.
  await host.getByRole('button', { name: 'Remove Ben' }).click({ force: true });
  await expect(ben.getByText('removed you')).toBeVisible({ timeout: 10000 });
  await host.getByRole('button', { name: 'Close room' }).click();
  await expect(ana.getByText('The room has closed')).toBeVisible({ timeout: 10000 });
});

test('room: the PIN is required, and five wrong tries lock the room', async ({ browser }) => {
  const host = await newPage(browser, { width: 420, height: 900 });
  await host.goto(app);
  await host.getByRole('button', { name: 'Room', exact: true }).click();
  await host.getByRole('button', { name: 'Open room' }).click();
  await expect(host.locator('#rqr svg')).toBeVisible({ timeout: 20000 });
  await host.locator('#ropenview details summary').first().click();
  await host.locator('#ropenview').getByLabel('Phones must type a 4-digit PIN').check();
  await expect(host.locator('#rpin b')).toHaveText(/^\d{4}$/);
  const pin = await host.locator('#rpin b').textContent();
  const url = await host.locator('#rqr').getAttribute('title');
  const guest = await newPage(browser, { width: 390, height: 800 });
  await guest.goto(scanned(url));
  await expect(guest.locator('#gpinbox')).toBeVisible({ timeout: 30000 });
  const wrong = pin === '0000' ? '1111' : '0000';
  for (const left of [4, 3, 2, 1]) {
    await guest.locator('#gpin').fill(wrong);
    await guest.getByRole('button', { name: 'Join' }).click();
    await expect(guest.locator('#gerror')).toContainText(`${left} ${left === 1 ? 'try' : 'tries'} left`);
  }
  await guest.locator('#gpin').fill(wrong);
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(host.getByRole('button', { name: 'Open room' })).toBeVisible({ timeout: 10000 }); // the room closed itself
});
