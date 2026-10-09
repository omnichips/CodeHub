import { db } from './db';
import { canDeleteMember } from './engine/balances';
import { computeExpense, type ExpenseInput } from './engine/split';
import { ExpenseSchema, MemberSchema, PaymentSchema, TripSchema, type ReceiptPhoto, type Trip } from './schemas';

type Stamp = { ver: number; deviceId: string; updatedAt: number };
export type ExpenseDraft = Omit<ExpenseInput, 'baseCurrency'> & { title: string; date: string; payerId: string; receipts?: string[]; category?: string };

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

async function deviceId(): Promise<string> {
  const row = await db.device.toCollection().first();
  if (row) return row.deviceId;
  const id = crypto.randomUUID();
  await db.device.add({ deviceId: id, settings: {} });
  return id;
}

/** Runs fn in one transaction, handing it the trip's next logical clock value. */
function inTrip<T>(tripId: string, fn: (s: Stamp) => Promise<T>): Promise<T> {
  return db.transaction('rw', db.tables, async () => {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new Error('Trip not found');
    const ver = trip.clock + 1;
    await db.trips.update(tripId, { clock: ver });
    return fn({ ver, deviceId: await deviceId(), updatedAt: Date.now() });
  });
}

export function createTrip(name: string, baseCurrency: string): Promise<string> {
  return db.transaction('rw', db.trips, db.device, async () => {
    const trip = TripSchema.parse({
      id: crypto.randomUUID(), name, baseCurrency, clock: 1, archived: false,
      ver: 1, deviceId: await deviceId(), deleted: false, updatedAt: Date.now(),
    });
    await db.trips.add(trip);
    return trip.id;
  });
}

/** `deleted: true` moves the trip to Recently deleted; it is erased for good after KEEP_DELETED_MS (purgeDeletedTrips). */
export function updateTrip(tripId: string, patch: Partial<Pick<Trip, 'name' | 'archived' | 'deleted'>>) {
  const name = patch.name === undefined ? undefined : TripSchema.shape.name.parse(patch.name);
  return inTrip(tripId, (s) => db.trips.update(tripId, { ...patch, ...(name && { name }), ...s }));
}

export function addMember(tripId: string, name: string) {
  return inTrip(tripId, (s) =>
    db.members.add(MemberSchema.parse({ id: crypto.randomUUID(), tripId, name, active: true, deleted: false, ...s })),
  );
}

async function tripOfMember(id: string): Promise<string> {
  const m = await db.members.get(id);
  if (!m) throw new Error('Member not found');
  return m.tripId;
}

export async function renameMember(id: string, name: string) {
  const clean = MemberSchema.shape.name.parse(name);
  return inTrip(await tripOfMember(id), (s) => db.members.update(id, { name: clean, ...s }));
}

export async function setMemberActive(id: string, active: boolean) {
  return inTrip(await tripOfMember(id), (s) => db.members.update(id, { active, ...s }));
}

/** Deletes a member nobody references; otherwise only marks them inactive. */
export async function removeMember(id: string) {
  const tripId = await tripOfMember(id);
  return inTrip(tripId, async (s) => {
    const [expenses, payments] = await Promise.all([
      db.expenses.where('tripId').equals(tripId).toArray(),
      db.payments.where('tripId').equals(tripId).toArray(),
    ]);
    return db.members.update(id, canDeleteMember(id, expenses, payments) ? { deleted: true, ...s } : { active: false, ...s });
  });
}

/** Saves an expense; `photos` are receipt photos added in this edit, stored in the same transaction. */
export function saveExpense(tripId: string, draft: ExpenseDraft, id?: string, photos: ReceiptPhoto[] = []) {
  return inTrip(tripId, async (s) => {
    await db.receipts.bulkPut(photos);
    const trip = await db.trips.get(tripId);
    const priced = computeExpense({ ...draft, baseCurrency: trip!.baseCurrency });
    await db.expenses.put(ExpenseSchema.parse({ id: id ?? crypto.randomUUID(), tripId, ...draft, ...priced, deleted: false, ...s }));
  });
}

export async function deleteExpense(id: string) {
  const e = await db.expenses.get(id);
  if (e) await inTrip(e.tripId, (s) => db.expenses.update(id, { deleted: true, ...s }));
}

export function addPayment(tripId: string, fromId: string, toId: string, amountMinor: number) {
  return inTrip(tripId, (s) =>
    db.payments.add(PaymentSchema.parse({
      id: crypto.randomUUID(), tripId, fromId, toId, amountMinor, date: today(), deleted: false, ...s,
    })),
  );
}

export async function deletePayment(id: string) {
  const p = await db.payments.get(id);
  if (p) await inTrip(p.tripId, (s) => db.payments.update(id, { deleted: true, ...s }));
}

export const KEEP_DELETED_MS = 7 * 24 * 60 * 60 * 1000;

/** Erases a trip and everything in it from this phone. Not undoable. */
export function eraseTrip(tripId: string) {
  return db.transaction('rw', [db.trips, db.members, db.expenses, db.payments, db.receipts, db.photos], async () => {
    await Promise.all([db.members, db.expenses, db.payments, db.receipts].map((t) => t.where('tripId').equals(tripId).delete()));
    await Promise.all([db.trips.delete(tripId), db.photos.delete(tripId)]);
  });
}

/** Erases trips deleted more than 7 days ago (a trip's updatedAt is when it was deleted: nothing writes to it after). */
export async function purgeDeletedTrips(now = Date.now()) {
  const old = (await db.trips.toArray()).filter((t) => t.deleted && now - t.updatedAt > KEEP_DELETED_MS);
  for (const t of old) await eraseTrip(t.id);
}

export { today };
