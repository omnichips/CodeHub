import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db } from './db';
import { addMember, createTrip, KEEP_DELETED_MS, orderTrips, purgeDeletedTrips, removeMember, saveExpense, setExpenseCategory, setTripOrder, updateTrip } from './store';

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

it('trips keep the order they were dragged into; new ones come first', async () => {
  const [a, b, c] = [await createTrip('A', 'PHP'), await createTrip('B', 'PHP'), await createTrip('C', 'PHP')];
  await setTripOrder([b, a, c]);
  const trips = await db.trips.where('id').anyOf(a, b, c).toArray();
  const settings = (await db.device.toCollection().first())!.settings;
  expect(orderTrips(trips, settings.tripOrder).map((t) => t.name)).toEqual(['B', 'A', 'C']);
  const d = await createTrip('D', 'PHP');
  expect(orderTrips([...trips, (await db.trips.get(d))!], settings.tripOrder).map((t) => t.name)).toEqual(['D', 'B', 'A', 'C']);
  const dated = trips.map((t) => ({ ...t, updatedAt: t.name.charCodeAt(0) })); // A oldest, C newest
  expect(orderTrips(dated, undefined).map((t) => t.name)).toEqual(['C', 'B', 'A']); // never arranged: newest first
});

it('an expense moves into a category and out again, as a new version (so the move syncs)', async () => {
  const tripId = await createTrip('Siargao', 'PHP');
  await addMember(tripId, 'Ana');
  const ana = (await db.members.where('tripId').equals(tripId).first())!;
  await saveExpense(tripId, {
    title: 'Boat', date: '2026-10-05', payerId: ana.id, amountMinor: 5000, currency: 'PHP', rate: null,
    splitMode: 'equal', splitInputs: [{ memberId: ana.id, value: 1 }],
  });
  const boat = (await db.expenses.where('tripId').equals(tripId).first())!;
  await setExpenseCategory(boat.id, 'Day 1');
  const moved = (await db.expenses.get(boat.id))!;
  expect(moved).toMatchObject({ category: 'Day 1', title: 'Boat', amountMinor: 5000 });
  expect(moved.ver).toBeGreaterThan(boat.ver);
  await setExpenseCategory(boat.id, undefined);
  expect(await db.expenses.get(boat.id)).not.toHaveProperty('category');
});
