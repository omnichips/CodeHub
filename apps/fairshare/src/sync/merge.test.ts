import fc from 'fast-check';
import { expect, it } from 'vitest';
import type { Expense, Member, Payment, Trip } from '../schemas';
import { mergeSnapshots, type Snapshot } from './merge';

const TRIP = '00000000-0000-4000-8000-000000000001';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ANA, BEN, CY] = [uuid(11), uuid(12), uuid(13)];
const A = 'device-a';
const B = 'device-b';

const sync = (ver: number, deviceId = A, deleted = false) => ({ ver, deviceId, deleted, updatedAt: 0 });
const trip = (ver = 1, clock = ver, over: Partial<Trip> = {}): Trip => ({
  id: TRIP, name: 'Cebu', baseCurrency: 'PHP', clock, archived: false, ...sync(ver), ...over,
});
const member = (id: string, name: string, ver = 1, over: Partial<Member> = {}): Member => ({
  id, tripId: TRIP, name, active: true, ...sync(ver), ...over,
});
const expense = (n: number, ver: number, over: Partial<Expense> = {}): Expense => ({
  id: uuid(100 + n), tripId: TRIP, title: `E${n}`, date: '2026-10-05', payerId: ANA, amountMinor: 1000, currency: 'PHP', rate: null,
  baseAmountMinor: 1000, splitMode: 'equal', splitInputs: [{ memberId: ANA, value: 1 }, { memberId: BEN, value: 1 }],
  owed: [{ memberId: ANA, amountMinor: 500 }, { memberId: BEN, amountMinor: 500 }], ...sync(ver), ...over,
});
const payment = (n: number, ver: number, over: Partial<Payment> = {}): Payment => ({
  id: uuid(200 + n), tripId: TRIP, fromId: BEN, toId: ANA, amountMinor: 500, date: '2026-10-06', ...sync(ver), ...over,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  trip: trip(), members: [member(ANA, 'Ana'), member(BEN, 'Ben')], expenses: [], payments: [], ...over,
});

const merge = (l: Snapshot | undefined, r: Snapshot) => mergeSnapshots(l, r).merged;

it('adds, updates and deletes, and counts each', () => {
  const local = snap({ expenses: [expense(1, 2), expense(2, 3), expense(3, 4)], trip: trip(1, 4) });
  const remote = snap({
    expenses: [
      expense(1, 2), // same
      expense(2, 7, { title: 'Edited', ...sync(7, B) }), // updated
      expense(3, 8, sync(8, B, true)), // deleted
      expense(4, 5, sync(5, B)), // new
      expense(5, 6, sync(6, B)), // new
      expense(6, 9, sync(9, B, true)), // new but already deleted: invisible
    ],
    trip: trip(1, 9),
  });
  const { merged, summary } = mergeSnapshots(local, remote);
  expect(summary).toEqual({ newTrip: false, added: 2, updated: 1, deleted: 1 });
  expect(merged.expenses).toHaveLength(6);
  expect(merged.expenses.find((e) => e.title === 'Edited')).toBeDefined();
  expect(merged.trip.clock).toBe(9); // later local writes must outrank everything just merged
});

it('a new trip counts as one trip plus its records', () => {
  const remote = snap({ expenses: [expense(1, 2)], trip: trip(1, 2) });
  const { merged, summary } = mergeSnapshots(undefined, remote);
  expect(merged).toEqual(remote);
  expect(summary).toEqual({ newTrip: true, added: 3, updated: 0, deleted: 0 }); // 2 members + 1 expense
});

it('higher version wins; equal versions fall back to device id, so both phones agree', () => {
  const a = snap({ expenses: [expense(1, 5, { title: 'from A', ...sync(5, A) })] });
  const b = snap({ expenses: [expense(1, 5, { title: 'from B', ...sync(5, B) })] });
  expect(merge(a, b).expenses[0].title).toBe('from B');
  expect(merge(b, a).expenses[0].title).toBe('from B');
  const c = snap({ expenses: [expense(1, 6, { title: 'newer', ...sync(6, A) })] });
  expect(merge(c, b).expenses[0].title).toBe('newer');
});

it('wall-clock time never decides a conflict', () => {
  const old = snap({ expenses: [expense(1, 9, { title: 'high ver, old clock', updatedAt: 1 })] });
  const fresh = snap({ expenses: [expense(1, 3, { title: 'low ver, fresh clock', updatedAt: 9e12 })] });
  expect(merge(fresh, old).expenses[0].title).toBe('high ver, old clock');
});

it('a deletion stays deleted when the other phone still has the old copy', () => {
  const deleted = snap({ expenses: [expense(1, 6, sync(6, A, true))] });
  const stale = snap({ expenses: [expense(1, 2)] });
  expect(merge(deleted, stale).expenses[0].deleted).toBe(true);
  expect(merge(stale, deleted).expenses[0].deleted).toBe(true);
  const again = merge(merge(stale, deleted), stale);
  expect(again.expenses[0].deleted).toBe(true);
});

it('an edit on one phone and a new expense on the other both survive', () => {
  const a = snap({ expenses: [expense(1, 2, { title: 'edited on A', ...sync(4, A) })], trip: trip(1, 4) });
  const b = snap({ expenses: [expense(1, 2), expense(2, 3, sync(3, B))], trip: trip(1, 3) });
  const m = merge(a, b);
  expect(m.expenses.map((e) => e.title)).toEqual(['edited on A', 'E2']);
});

it('keeps a member that was deleted on one phone but used by an expense on the other', () => {
  const a = snap({ members: [member(ANA, 'Ana'), member(BEN, 'Ben'), member(CY, 'Cy', 5, sync(5, A, true))] });
  const b = snap({
    members: [member(ANA, 'Ana'), member(BEN, 'Ben'), member(CY, 'Cy', 2)],
    expenses: [expense(1, 3, { payerId: CY, owed: [{ memberId: CY, amountMinor: 1000 }], splitInputs: [{ memberId: CY, value: 1 }] })],
  });
  for (const m of [merge(a, b), merge(b, a)]) {
    const cy = m.members.find((x) => x.id === CY)!;
    expect(cy).toMatchObject({ deleted: false, active: false });
  }
  expect(merge(a, b)).toEqual(merge(b, a));
});

it('refuses to merge two different trips', () => {
  expect(() => mergeSnapshots(snap(), snap({ trip: trip(1, 1, { id: uuid(99) }) }))).toThrow('different trips');
});

// ---- property tests: random edits on two phones, merged in every order ----

const recs = fc.array(
  fc.record({ n: fc.integer({ min: 1, max: 6 }), ver: fc.integer({ min: 1, max: 5 }), dev: fc.constantFrom(A, B, 'device-c'), del: fc.boolean(), t: fc.string({ maxLength: 4 }) }),
  { maxLength: 8 },
);
type Recs = { n: number; ver: number; dev: string; del: boolean; t: string }[];
const toSnap = (rs: Recs, tripVer: number): Snapshot => {
  const seen = new Map(rs.map((r) => [r.n, r])); // one record per id, like a real table
  return snap({
    trip: trip(tripVer, 5, { name: `T${tripVer}` }),
    expenses: [...seen.values()].map((r) => expense(r.n, r.ver, { title: r.t || 'x', ...sync(r.ver, r.dev, r.del) })),
    payments: [...seen.values()].filter((r) => r.n % 2).map((r) => payment(r.n, r.ver, sync(r.ver, r.dev, r.del))),
  });
};
// Records that share an id and version but come from the same device are the same write, so the generator avoids
// giving two phones different content under an identical (ver, deviceId).
const distinct = (a: Snapshot, b: Snapshot) =>
  [...a.expenses, ...a.payments].every((x) => ![...b.expenses, ...b.payments].some((y) => x.id === y.id && x.ver === y.ver && x.deviceId === y.deviceId && JSON.stringify(x) !== JSON.stringify(y)));

it('merge is the same in either direction and when repeated (property)', () => {
  fc.assert(
    fc.property(recs, recs, fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }), (ra, rb, ta, tb) => {
      const a = toSnap(ra, ta);
      const b = toSnap(rb, tb);
      fc.pre(distinct(a, b));
      const ab = merge(a, b);
      expect(merge(b, a)).toEqual(ab); // either direction
      expect(merge(ab, b)).toEqual(ab); // repeated
      expect(merge(ab, a)).toEqual(ab);
      expect(merge(ab, ab)).toEqual(ab);
    }),
    { numRuns: 500 },
  );
});

it('merge is order-independent across three phones (property)', () => {
  fc.assert(
    fc.property(recs, recs, recs, (ra, rb, rc) => {
      const [a, b, c] = [toSnap(ra, 1), toSnap(rb, 1), toSnap(rc, 1)];
      fc.pre(distinct(a, b) && distinct(b, c) && distinct(a, c));
      expect(merge(merge(a, b), c)).toEqual(merge(a, merge(b, c)));
      expect(merge(merge(a, b), c)).toEqual(merge(merge(c, a), b));
    }),
    { numRuns: 500 },
  );
});

it('a deletion never comes back, whatever order phones sync in (property)', () => {
  fc.assert(
    fc.property(recs, recs, (ra, rb) => {
      const a = toSnap(ra, 1);
      const b = toSnap(rb, 1);
      fc.pre(distinct(a, b));
      const m = merge(a, b);
      // any record deleted at its highest version anywhere must be deleted in the result
      for (const e of [...a.expenses, ...b.expenses]) {
        const rivals = [...a.expenses, ...b.expenses].filter((x) => x.id === e.id);
        const top = rivals.reduce((p, q) => (q.ver > p.ver || (q.ver === p.ver && q.deviceId > p.deviceId) ? q : p));
        expect(m.expenses.find((x) => x.id === e.id)!.deleted).toBe(top.deleted);
      }
    }),
    { numRuns: 300 },
  );
});
