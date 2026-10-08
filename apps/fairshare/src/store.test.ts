import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db } from './db';
import { addMember, createTrip, removeMember, saveExpense } from './store';

it('versions writes with the trip clock; referenced members go inactive, others are deleted', async () => {
  const tripId = await createTrip('Cebu', 'PHP');
  await addMember(tripId, 'Ana');
  await addMember(tripId, 'Ben');
  const [ana, ben] = (await db.members.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  expect((await db.trips.get(tripId))!.clock).toBe(3);
  expect([ana.ver, ben.ver]).toEqual([2, 3]);

  await saveExpense(tripId, {
    title: 'Taxi', date: '2026-10-05', payerId: ana.id, amountMinor: 5000, currency: 'PHP', rate: null,
    splitMode: 'equal', splitInputs: [{ memberId: ana.id, value: 1 }],
  });
  await removeMember(ana.id);
  await removeMember(ben.id);
  expect(await db.members.get(ana.id)).toMatchObject({ active: false, deleted: false });
  expect(await db.members.get(ben.id)).toMatchObject({ deleted: true });
});
