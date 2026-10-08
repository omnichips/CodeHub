import { expect, test, type Page } from '@playwright/test';
import type { Expense } from '../src/schemas';
import type { Snapshot } from '../src/sync/merge';
import { encodePayload } from '../src/sync/payload';

const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const heading = (page: Page, name: string) => expect(page.getByRole('heading', { name })).toBeVisible();

/** A second "phone": its own browser context, so its own IndexedDB. */
async function phone(browser: import('@playwright/test').Browser, use: object) {
  const context = await browser.newContext(use);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('No trips yet')).toBeVisible();
  return page;
}

async function addExpense(page: Page, title: string, amount: string) {
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Amount').fill(amount);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
}

async function backupFile(page: Page) {
  await tab(page, 'Others');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up trip' }).click()]);
  await tab(page, 'Expenses');
  return (await download.path())!;
}

test('two phones sync by file, both ways, with concurrent edits and a deletion', async ({ browser }, testInfo) => {
  const [a, b] = [await phone(browser, testInfo.project.use), await phone(browser, testInfo.project.use)];

  // Phone A creates the trip.
  await a.getByRole('button', { name: 'New trip' }).click();
  await a.getByLabel('Trip name').fill('Cebu');
  await a.getByRole('button', { name: 'Create trip' }).click();
  await tab(a, 'Members');
  for (const m of ['Ana', 'Ben']) {
    await a.getByRole('button', { name: 'New member' }).click();
    await a.getByLabel('Member name').fill(m);
    await a.getByRole('button', { name: 'Add member' }).click();
    await expect(a.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await tab(a, 'Expenses');
  await addExpense(a, 'Dinner', '300');

  // Phone B receives it: preview first, nothing written until Apply.
  await b.getByRole('button', { name: 'New trip' }).click();
  await b.getByLabel('Trip file').setInputFiles(await backupFile(a));
  await expect(b.getByText('This trip is not on this phone yet.')).toBeVisible();
  await expect(b.getByText('3 new', { exact: true })).toBeVisible(); // 2 members + 1 expense
  await b.getByRole('button', { name: 'Cancel' }).click();
  await expect(b.getByText('No trips yet')).toBeVisible();
  await b.getByRole('button', { name: 'New trip' }).click();
  await b.getByLabel('Trip file').setInputFiles(await backupFile(a));
  await b.getByRole('button', { name: 'Apply' }).click();
  await heading(b, 'Cebu');
  await expect(b.getByRole('button', { name: /Dinner/ })).toBeVisible();

  // Both phones now change things independently.
  await b.getByRole('button', { name: /Dinner/ }).click();
  await b.getByRole('button', { name: 'Delete expense' }).click();
  await addExpense(b, 'Taxi', '100');
  await addExpense(a, 'Snacks', '50');

  // B to A.
  await tab(a, 'Others');
  await a.getByLabel('Trip file').setInputFiles(await backupFile(b));
  await expect(a.getByText('1 new, 1 deleted', { exact: true })).toBeVisible(); // Taxi new, Dinner deleted
  await a.getByRole('button', { name: 'Apply' }).click();
  await tab(a, 'Expenses');
  await expect(a.getByRole('button', { name: /Taxi/ })).toBeVisible();
  await expect(a.getByRole('button', { name: /Snacks/ })).toBeVisible();
  await expect(a.getByRole('button', { name: /Dinner/ })).toHaveCount(0);

  // A back to B: only A's Snacks is news, and Dinner stays deleted.
  await tab(b, 'Others');
  await b.getByLabel('Trip file').setInputFiles(await backupFile(a));
  await expect(b.getByText('1 new', { exact: true })).toBeVisible();
  await b.getByRole('button', { name: 'Apply' }).click();
  await tab(b, 'Expenses');
  await expect(b.getByRole('button', { name: /Snacks/ })).toBeVisible();
  await expect(b.getByRole('button', { name: /Dinner/ })).toHaveCount(0);

  // Repeating the same import changes nothing.
  await tab(b, 'Others');
  await b.getByLabel('Trip file').setInputFiles(await backupFile(a));
  await expect(b.getByText('Already up to date')).toBeVisible();
});

test('a trip file that is damaged or from another app is refused, and nothing is added', async ({ browser }, testInfo) => {
  const page = await phone(browser, testInfo.project.use);
  const file = (text: string) => ({ name: 'x.fairshare', mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByLabel('Trip file').setInputFiles(file('{"hello":"world"}'));
  await expect(page.getByRole('alert')).toContainText('not a FairShare trip');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('No trips yet')).toBeVisible();
});

// ---- A 60-expense trip carried by real QR codes ----

const TRIP = '3f0c7d52-9a41-4b7e-8c1d-5e2a6b9f0d31';
const [ANA, BEN] = ['7a1d2c33-4e5f-4a60-9b71-8c92d3e4f5a6', '8b2e3d44-5f60-4b71-8c82-9da3e4f5a6b7'];
const stamp = (ver: number) => ({ ver, deviceId: 'phone-x', deleted: false, updatedAt: 1_760_000_000_000 });

function sixtyExpenseTrip(): Snapshot {
  const expenses: Expense[] = Array.from({ length: 60 }, (_, i) => ({
    id: crypto.randomUUID(), tripId: TRIP, title: `Expense ${i + 1} ${['Hapunan', 'Café', 'Taxi', '晚餐'][i % 4]}`, date: '2026-10-05',
    payerId: i % 2 ? ANA : BEN, amountMinor: 10_000 + i * 37, currency: 'PHP', rate: null, baseAmountMinor: 10_000 + i * 37,
    splitMode: 'equal', splitInputs: [{ memberId: ANA, value: 1 }, { memberId: BEN, value: 1 }],
    owed: [{ memberId: ANA, amountMinor: 5000 + i * 18 }, { memberId: BEN, amountMinor: 5000 + i * 19 }], ...stamp(i + 3),
  }));
  return {
    trip: { id: TRIP, name: 'Sixty', baseCurrency: 'PHP', clock: 62, archived: false, ...stamp(1) },
    members: [[ANA, 'Ana'], [BEN, 'Beñat']].map(([id, name]) => ({ id, tripId: TRIP, name, active: true, ...stamp(2) })),
    expenses, payments: [],
  };
}

test('60 expenses travel from one phone to another as QR codes', async ({ browser }, testInfo) => {
  const [a, b] = [await phone(browser, testInfo.project.use), await phone(browser, testInfo.project.use)];
  // The scanner library defaults to fetching its WASM from a CDN; nothing may leave this machine.
  const external: string[] = [];
  b.on('request', (r) => new URL(r.url()).hostname !== 'localhost' && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));

  const { text } = await encodePayload(sixtyExpenseTrip());
  await a.getByRole('button', { name: 'New trip' }).click();
  await a.getByLabel('Trip file').setInputFiles({ name: 'sixty.fairshare', mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await a.getByRole('button', { name: 'Apply' }).click();
  await heading(a, 'Sixty');

  // Phone A shows the codes; time is driven by hand so each frame can be captured.
  await tab(a, 'Others');
  await a.clock.install({ time: 0 });
  await a.clock.pauseAt(1000);
  await a.getByRole('button', { name: 'Show QR codes' }).click();
  const label = a.locator('.count');
  const total = Number((await label.textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(5);
  expect(total).toBeLessThan(40);

  const frames: Buffer[] = [];
  for (let i = 0; i < total; i++) {
    await expect(label).toHaveText(`Code ${i + 1} of ${total}`);
    frames.push(await a.locator('.qr').screenshot());
    await a.clock.runFor(300);
  }

  // Phone B reads them in a scrambled order, with some repeated.
  const order = [...frames.keys()].sort((x, y) => ((x * 7919) % 13) - ((y * 7919) % 13) || x - y);
  const files = [...order, order[0], order[1]].map((i, n) => ({ name: `code-${n}.png`, mimeType: 'image/png', buffer: frames[i] }));
  await b.getByRole('button', { name: 'New trip' }).click();
  await b.getByRole('button', { name: 'Scan trip' }).click();
  await b.getByLabel('Photos or trip file').setInputFiles(files);
  await expect(b.getByText('62 new', { exact: true })).toBeVisible({ timeout: 60_000 }); // 2 members + 60 expenses
  await b.getByRole('button', { name: 'Apply' }).click();
  await heading(b, 'Sixty');
  await expect(b.getByRole('button', { name: /Expense \d+/ })).toHaveCount(60);
  expect(external).toEqual([]);
});

test('with some codes missing the receiver waits for the rest', async ({ browser }, testInfo) => {
  const [a, b] = [await phone(browser, testInfo.project.use), await phone(browser, testInfo.project.use)];
  const { text } = await encodePayload(sixtyExpenseTrip());
  await a.getByRole('button', { name: 'New trip' }).click();
  await a.getByLabel('Trip file').setInputFiles({ name: 'sixty.fairshare', mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await a.getByRole('button', { name: 'Apply' }).click();
  await tab(a, 'Others');
  await a.clock.install({ time: 0 });
  await a.clock.pauseAt(1000);
  await a.getByRole('button', { name: 'Show QR codes' }).click();
  const shots: Buffer[] = [];
  for (let i = 0; i < 3; i++) {
    shots.push(await a.locator('.qr').screenshot());
    await a.clock.runFor(300);
  }

  await b.getByRole('button', { name: 'New trip' }).click();
  await b.getByRole('button', { name: 'Scan trip' }).click();
  await b.getByLabel('Photos or trip file').setInputFiles(shots.map((buffer, n) => ({ name: `c${n}.png`, mimeType: 'image/png', buffer })));
  await expect(b.getByRole('alert')).toContainText(/Read 3 of \d+ codes/, { timeout: 30_000 });
  await expect(b.getByText(/3 of \d+ codes read/)).toBeVisible();
  await expect(b.getByRole('button', { name: 'Apply' })).toHaveCount(0);
});

test('when the camera cannot start, the photo and file route is offered', async ({ browser }, testInfo) => {
  const page = await phone(browser, testInfo.project.use);
  await page.getByRole('button', { name: 'New trip' }).click();
  await page.getByRole('button', { name: 'Scan trip' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('alert')).toContainText(/camera/i, { timeout: 15_000 });
  await expect(page.getByLabel('Photos or trip file')).toBeVisible();
});
