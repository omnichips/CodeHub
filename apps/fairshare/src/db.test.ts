import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { FairShareDB } from './db';
import { allocate } from './engine/split';
import { ExpenseSchema, TripSchema } from './schemas';

const sync = { ver: 1, deviceId: 'dev', deleted: false, updatedAt: 0 };

it('round-trips records through Dexie and Zod', async () => {
  const db = new FairShareDB('test');
  const tripId = crypto.randomUUID();
  const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
  await db.trips.add(TripSchema.parse({ id: tripId, name: 'Cebu', baseCurrency: 'PHP', clock: 1, archived: false, ...sync }));
  const expense = ExpenseSchema.parse({
    id: crypto.randomUUID(), tripId, title: 'Dinner', date: '2026-10-05', payerId: a, amountMinor: 1001, currency: 'PHP', rate: null,
    baseAmountMinor: 1001, splitMode: 'equal', splitInputs: [a, b].map((memberId) => ({ memberId, value: 1 })),
    owed: allocate(1001, [a, b].map((memberId) => ({ memberId, value: 1 }))), ...sync,
  });
  await db.expenses.add(expense);
  const [saved] = await db.expenses.where('tripId').equals(tripId).toArray();
  expect(ExpenseSchema.parse(saved)).toEqual(expense);
});

it('schemas reject an expense whose owed does not sum to base', () => {
  const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
  const bad = {
    id: crypto.randomUUID(), tripId: crypto.randomUUID(), title: 'x', date: '2026-10-05', payerId: a, amountMinor: 100, currency: 'PHP',
    rate: null, baseAmountMinor: 100, splitMode: 'equal', splitInputs: [{ memberId: a, value: 1 }],
    owed: [{ memberId: a, amountMinor: 50 }, { memberId: b, amountMinor: 49 }], ...sync,
  };
  expect(ExpenseSchema.safeParse(bad).success).toBe(false);
  expect(ExpenseSchema.safeParse({ ...bad, owed: [{ memberId: a, amountMinor: 100 }] }).success).toBe(true);
  expect(ExpenseSchema.safeParse({ ...bad, owed: [{ memberId: a, amountMinor: 100 }], rate: 'bogus' }).success).toBe(false);
});
