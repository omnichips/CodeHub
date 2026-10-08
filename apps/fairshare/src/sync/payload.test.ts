import fc from 'fast-check';
import { deflate } from 'pako';
import { expect, it } from 'vitest';
import type { Expense } from '../schemas';
import type { Snapshot } from './merge';
import { createCollector, decodePayload, encodePayload, FRAME_CHARS, MAX_SIZE, toFrames } from './payload';

const TRIP = '00000000-0000-4000-8000-000000000001';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ANA, BEN] = [uuid(11), uuid(12)];
const sync = (ver: number) => ({ ver, deviceId: 'device-a', deleted: false, updatedAt: 1_760_000_000_000 });

/** A trip shaped like a real one: n expenses with varied titles, including non-Latin names. */
function bigTrip(n: number): Snapshot {
  const expenses: Expense[] = Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(), tripId: TRIP, title: `Expense ${i} ${['Hapunan 🍜', 'Café ☕', 'Taxi', '晚餐'][i % 4]}`, date: '2026-10-05',
    payerId: i % 2 ? ANA : BEN, amountMinor: 10_000 + i * 37, currency: 'PHP', rate: null, baseAmountMinor: 10_000 + i * 37,
    splitMode: 'equal', splitInputs: [{ memberId: ANA, value: 1 }, { memberId: BEN, value: 1 }],
    owed: [{ memberId: ANA, amountMinor: 5000 + i * 18 }, { memberId: BEN, amountMinor: 5000 + i * 19 }], ...sync(i + 2),
  }));
  return {
    trip: { id: TRIP, name: 'Cebu ✈', baseCurrency: 'PHP', clock: n + 1, archived: false, ...sync(1) },
    members: [ANA, BEN].map((id, i) => ({ id, tripId: TRIP, name: ['Ana', 'Beñat'][i], active: true, ...sync(1) })),
    expenses, payments: [],
  };
}

const shuffle = <T>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const scan = (frames: string[]) => {
  const c = createCollector();
  frames.forEach((f) => c.add(f));
  return c;
};

it('round-trips a trip through the file format', async () => {
  const snap = bigTrip(10);
  const { text } = await encodePayload(snap);
  expect(await decodePayload(text)).toEqual(snap);
});

it('accepts a version 1 backup from phase 3 (no checksum)', async () => {
  const snap = bigTrip(3);
  expect(await decodePayload(JSON.stringify({ format: 'fairshare', version: 1, ...snap }))).toEqual(snap);
});

it('a 60-expense trip fits in a modest number of frames, each about 600 bytes', async () => {
  const { text, sum } = await encodePayload(bigTrip(60));
  const frames = toFrames(text, sum);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(40);
  for (const f of frames) expect(f.length).toBeLessThanOrEqual(FRAME_CHARS + 40);
});

it('frames reassemble in any order, with repeats and stray codes mixed in', async () => {
  const snap = bigTrip(60);
  const { text, sum } = await encodePayload(snap);
  const frames = toFrames(text, sum);
  const c = createCollector();
  for (const f of shuffle([...frames, ...frames.slice(0, 3), 'https://example.com', 'FS1.garbage', ''])) c.add(f);
  expect(c.complete).toBe(true);
  expect(await decodePayload(c.text())).toEqual(snap);
});

it('any frame order works (property)', async () => {
  const { text, sum } = await encodePayload(bigTrip(25));
  const frames = toFrames(text, sum);
  await fc.assert(
    fc.asyncProperty(fc.shuffledSubarray(frames, { minLength: frames.length, maxLength: frames.length }), async (order) => {
      const c = scan(order);
      expect(c.complete).toBe(true);
      expect((await decodePayload(c.text())).expenses).toHaveLength(25);
    }),
    { numRuns: 30 },
  );
});

it('is not complete while a frame is missing, and reports progress', async () => {
  const { text, sum } = await encodePayload(bigTrip(30));
  const frames = toFrames(text, sum);
  const c = scan(frames.slice(1));
  expect(c.complete).toBe(false);
  expect([c.have, c.total]).toEqual([frames.length - 1, frames.length]);
  c.add(frames[0]);
  expect(c.complete).toBe(true);
});

it('starts over when frames from a different trip appear', async () => {
  const framesOf = async (n: number) => {
    const { text, sum } = await encodePayload(bigTrip(n)); // random ids, so the two trips differ
    return toFrames(text, sum);
  };
  const [a, b] = [await framesOf(30), await framesOf(31)];
  const c = scan(a.slice(0, 2));
  b.forEach((f) => c.add(f));
  expect(c.complete).toBe(true);
  expect((await decodePayload(c.text())).expenses).toHaveLength(31);
});

it('rejects damaged data: edited file, flipped frame, truncated file', async () => {
  const snap = bigTrip(10);
  const { text, sum } = await encodePayload(snap);

  await expect(decodePayload(text.replace('Expense 3', 'Expense 9'))).rejects.toThrow('damaged'); // checksum
  await expect(decodePayload(text.slice(0, -30))).rejects.toThrow('not a FairShare');

  const frames = toFrames(text, sum);
  const flipped = [...frames];
  // Flip one character in the middle of the first frame. (Not the last frame: its first bytes can be unused padding bits.)
  const parts = flipped[0].split('.'); // base64 has no dots, so the chunk is the last part
  parts[4] = parts[4].slice(0, 100) + (parts[4][100] === 'A' ? 'B' : 'A') + parts[4].slice(101);
  flipped[0] = parts.join('.');
  expect(() => scan(flipped).text()).toThrow('damaged');
});

it('rejects a payload that is well formed JSON but inconsistent', async () => {
  const good = bigTrip(5);
  const cases: Record<string, (s: Snapshot) => void> = {
    'owed does not sum': (s) => void (s.expenses[0].baseAmountMinor += 1),
    'foreign trip id': (s) => void (s.members[0].tripId = uuid(99)),
    'unknown payer': (s) => void (s.expenses[0].payerId = uuid(77)),
    'unknown owed member': (s) => void (s.expenses[1].owed[0].memberId = uuid(77)),
    'duplicate ids': (s) => void s.expenses.push({ ...s.expenses[0] }),
    'negative amount': (s) => void (s.expenses[0].amountMinor = -5),
    'bad currency': (s) => void (s.trip.baseCurrency = 'php'),
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    const s = structuredClone(good);
    corrupt(s);
    // v1 has no checksum, so this isolates the schema checks from the checksum check
    await expect(decodePayload(JSON.stringify({ format: 'fairshare', version: 1, ...s })), name).rejects.toThrow('FairShare');
  }
  for (const text of ['', 'not json', '[]', '{}', '{"format":"other","version":2}', '{"format":"fairshare","version":99}', 'null']) {
    await expect(decodePayload(text), text).rejects.toThrow('FairShare');
  }
});

it('rejects oversized input before parsing it', async () => {
  await expect(decodePayload('x'.repeat(MAX_SIZE + 1))).rejects.toThrow('too large');
});

it('rejects a decompression bomb without inflating it', async () => {
  const bomb = deflate(new Uint8Array(MAX_SIZE * 20)); // tiny when compressed, huge when inflated
  expect(bomb.length).toBeLessThan(FRAME_CHARS * 400);
  let s = '';
  for (const b of bomb) s += String.fromCharCode(b);
  const b64 = btoa(s);
  const chunks = b64.match(new RegExp(`.{1,${FRAME_CHARS}}`, 'g'))!;
  const c = scan(chunks.map((ch, i) => `FS1.deadbeef.${i}.${chunks.length}.${ch}`));
  expect(c.complete).toBe(true);
  expect(() => c.text()).toThrow('too large');
});

it('ignores frames that claim an absurd frame count', () => {
  const c = scan(['FS1.deadbeef.0.1000000.AAAA', 'FS1.deadbeef.5.3.AAAA', 'FS1.deadbeef.-1.3.AAAA', 'FS1.deadbeef.0.3.@@@@']);
  expect(c.have).toBe(0);
});
