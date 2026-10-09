import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { applyImport, exportTrip, loadSnapshot, previewImport } from './backup';
import { db } from './db';
import { addMember, createTrip, deleteExpense, saveExpense } from './store';
import { decodePayload } from './sync/payload';

async function seed() {
  const tripId = await createTrip('Cebu', 'PHP');
  await addMember(tripId, 'Ana');
  await addMember(tripId, 'Ben');
  const [ana, ben] = (await db.members.where('tripId').equals(tripId).toArray()).sort((a, b) => a.name.localeCompare(b.name));
  const draft = (title: string) => ({
    title, date: '2026-10-05', payerId: ana.id, amountMinor: 1000, currency: 'PHP', rate: null,
    splitMode: 'equal' as const, splitInputs: [ana, ben].map((m) => ({ memberId: m.id, value: 1 })),
  });
  await saveExpense(tripId, draft('Kept'));
  await saveExpense(tripId, draft('Removed'));
  const removed = (await db.expenses.toArray()).find((e) => e.title === 'Removed')!;
  await deleteExpense(removed.id);
  return { tripId, draft };
}

const wipe = () => Promise.all([db.trips, db.members, db.expenses, db.payments].map((t) => t.clear()));
beforeEach(wipe);
const counts = async () => [await db.trips.count(), await db.members.count(), await db.expenses.count(), await db.payments.count()];
const exported = async (tripId: string) => (await exportTrip(tripId)).text;

it('backs up and restores a trip onto an empty device, deleted records included', async () => {
  const { tripId } = await seed();
  const before = await loadSnapshot(tripId);
  const file = await exported(tripId);

  await wipe();
  const remote = await decodePayload(file);
  expect(await previewImport(remote)).toEqual({ newTrip: true, added: 3, updated: 0, deleted: 0 }); // 2 members + 1 live expense
  expect(await applyImport(remote)).toBe(tripId);
  expect(await loadSnapshot(tripId)).toEqual(before);
  expect((await db.expenses.toArray()).filter((e) => e.deleted)).toHaveLength(1);
});

it('importing the same trip again changes nothing', async () => {
  const { tripId } = await seed();
  const before = await loadSnapshot(tripId);
  const remote = await decodePayload(await exported(tripId));
  expect(await previewImport(remote)).toEqual({ newTrip: false, added: 0, updated: 0, deleted: 0 });
  await applyImport(remote);
  expect(await loadSnapshot(tripId)).toEqual(before);
});

it("merges the other phone's edits and keeps this phone's later writes ahead of them", async () => {
  const { tripId, draft } = await seed();
  const file = JSON.parse(await exported(tripId));
  const [kept] = (file.expenses as any[]).filter((e) => !e.deleted);
  const [ana, ben] = file.members as any[];

  // The other phone edited "Kept", added a payment, and added an expense, all with higher versions.
  const other = { ...file, trip: { ...file.trip, clock: 40, name: 'Cebu 2026' } };
  other.expenses = [
    ...file.expenses.map((e: any) => (e.id === kept.id ? { ...e, title: 'Kept (edited)', ver: 38, deviceId: 'phone-b' } : e)),
    { ...kept, id: crypto.randomUUID(), title: 'From phone B', ver: 39, deviceId: 'phone-b' },
  ];
  other.payments = [{ id: crypto.randomUUID(), tripId, fromId: ben.id, toId: ana.id, amountMinor: 500, date: '2026-10-06', ver: 40, deviceId: 'phone-b', deleted: false, updatedAt: 0 }];
  other.trip.ver = 37; other.trip.deviceId = 'phone-b';
  delete other.sum; other.version = 1; // plain file without checksum, to focus on the merge
  const remote = await decodePayload(JSON.stringify(other));

  expect(await previewImport(remote)).toEqual({ newTrip: false, added: 2, updated: 2, deleted: 0 }); // new expense + payment; edited expense + trip rename
  await applyImport(remote);
  const titles = (await db.expenses.toArray()).filter((e) => !e.deleted).map((e) => e.title).sort();
  expect(titles).toEqual(['From phone B', 'Kept (edited)']);
  expect((await db.trips.get(tripId))!.name).toBe('Cebu 2026');
  expect((await db.trips.get(tripId))!.clock).toBe(40);

  // A write made after merging must outrank everything that was just merged, or the other phone would ignore it.
  await saveExpense(tripId, draft('After merge'));
  const mine = (await db.expenses.toArray()).find((e) => e.title === 'After merge')!;
  expect(mine.ver).toBe(41);
});

it('rejects bad payloads without touching the database', async () => {
  const { tripId } = await seed();
  const good = await exported(tripId);
  const before = await counts();
  const snapshot = await loadSnapshot(tripId);

  const edited = JSON.parse(good);
  edited.expenses[0].title = 'Hacked';
  const foreign = JSON.parse(good);
  foreign.members[0].tripId = crypto.randomUUID();
  for (const text of ['not json', '{}', JSON.stringify(edited), JSON.stringify(foreign), good.slice(0, -20), good.replace('"sum":"', '"sum":"0')]) {
    await expect(decodePayload(text), text.slice(0, 30)).rejects.toThrow(/FairsHare|damaged/);
  }
  expect(await counts()).toEqual(before);
  expect(await loadSnapshot(tripId)).toEqual(snapshot);
});

it('rolls back completely if a write fails halfway', async () => {
  const other = {
    trip: { id: crypto.randomUUID(), name: 'Broken', baseCurrency: 'PHP', clock: 2, archived: false, ver: 1, deviceId: 'x', deleted: false, updatedAt: 0 },
    members: [] as any[], expenses: [], payments: [],
  };
  other.members.push({ id: crypto.randomUUID(), tripId: other.trip.id, name: 'Ana', active: true, ver: 2, deviceId: 'x', deleted: false, updatedAt: 0, boom: () => 0 });
  // A function cannot be stored, so the members write fails after the trip row was already written.
  await expect(applyImport(other as any)).rejects.toThrow();
  expect(await counts()).toEqual([0, 0, 0, 0]);
});
