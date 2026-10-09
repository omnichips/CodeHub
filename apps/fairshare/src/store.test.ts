import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db } from './db';
import { addMember, createTrip, KEEP_DELETED_MS, purgeDeletedTrips, removeMember, saveExpense, updateTrip } from './store';

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

it('deleted trips stay restorable for 7 days, then are erased with everything in them', async () => {
  const tripId = await createTrip('Bohol', 'PHP');
  await addMember(tripId, 'Ana');
  await updateTrip(tripId, { deleted: true });
  const { updatedAt } = (await db.trips.get(tripId))!;

  await purgeDeletedTrips(updatedAt + KEEP_DELETED_MS - 1);
  expect(await db.trips.get(tripId)).toMatchObject({ deleted: true });
  await updateTrip(tripId, { deleted: false });
  expect(await db.trips.get(tripId)).toMatchObject({ deleted: false });

  await updateTrip(tripId, { deleted: true });
  await purgeDeletedTrips(Date.now() + KEEP_DELETED_MS + 1);
  expect(await db.trips.get(tripId)).toBeUndefined();
  expect(await db.members.where('tripId').equals(tripId).count()).toBe(0);
});
