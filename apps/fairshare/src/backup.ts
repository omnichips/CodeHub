import { db } from './db';
import { mergeSnapshots, type Snapshot, type Summary } from './sync/merge';
import { encodePayload } from './sync/payload';

/** Everything the device holds for one trip, deleted records included so a merge keeps deletions. */
export async function loadSnapshot(tripId: string): Promise<Snapshot | undefined> {
  const [trip, members, expenses, payments] = await Promise.all([
    db.trips.get(tripId),
    db.members.where('tripId').equals(tripId).toArray(),
    db.expenses.where('tripId').equals(tripId).toArray(),
    db.payments.where('tripId').equals(tripId).toArray(),
  ]);
  return trip && { trip, members, expenses, payments };
}

/** The .fairshare file and the QR frames both come from this text. */
export async function exportTrip(tripId: string) {
  const snapshot = await loadSnapshot(tripId);
  if (!snapshot) throw new Error('Trip not found');
  return encodePayload(snapshot);
}

/** Read-only: what applying this (already validated) payload would change. */
export async function previewImport(remote: Snapshot): Promise<Summary> {
  return mergeSnapshots(await loadSnapshot(remote.trip.id), remote).summary;
}

/** Merges into the device in one transaction; a trip not on the device is simply added. */
export async function applyImport(remote: Snapshot): Promise<string> {
  await db.transaction('rw', db.trips, db.members, db.expenses, db.payments, async () => {
    const { merged } = mergeSnapshots(await loadSnapshot(remote.trip.id), remote);
    await db.trips.put(merged.trip);
    await db.members.bulkPut(merged.members);
    await db.expenses.bulkPut(merged.expenses);
    await db.payments.bulkPut(merged.payments);
  });
  return remote.trip.id;
}

/** Saves data as a file. Must be called from a tap handler on iOS. */
export function downloadFile(name: string, data: BlobPart, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
