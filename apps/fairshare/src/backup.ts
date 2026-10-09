import { db } from './db';
import { mergeSnapshots, type Snapshot, type Summary } from './sync/merge';
import { decodePayload, encodePayload } from './sync/payload';

/** Everything the device holds for one trip, deleted records included so a merge keeps deletions. */
export async function loadSnapshot(tripId: string): Promise<Snapshot | undefined> {
  const [trip, members, expenses, payments, photos] = await Promise.all([
    db.trips.get(tripId),
    db.members.where('tripId').equals(tripId).toArray(),
    db.expenses.where('tripId').equals(tripId).toArray(),
    db.payments.where('tripId').equals(tripId).toArray(),
    db.receipts.where('tripId').equals(tripId).toArray(),
  ]);
  return trip && { trip, members, expenses, payments, ...(photos.length > 0 && { photos }) };
}

/** The .fairshare file and the QR frames both come from this text. Only the file carries receipt photos: too big for QR codes. */
export async function exportTrip(tripId: string, withPhotos = false) {
  const snapshot = await loadSnapshot(tripId);
  if (!snapshot) throw new Error('Trip not found');
  return encodePayload(snapshot, withPhotos);
}

/** Read-only: what applying this (already validated) payload would change. */
export async function previewImport(remote: Snapshot): Promise<Summary> {
  return mergeSnapshots(await loadSnapshot(remote.trip.id), remote).summary;
}

/** Merges into the device in one transaction; a trip not on the device is simply added. */
export async function applyImport(remote: Snapshot): Promise<string> {
  await db.transaction('rw', db.trips, db.members, db.expenses, db.payments, db.receipts, async () => {
    const { merged } = mergeSnapshots(await loadSnapshot(remote.trip.id), remote);
    await db.trips.put(merged.trip);
    await db.members.bulkPut(merged.members);
    await db.expenses.bulkPut(merged.expenses);
    await db.payments.bulkPut(merged.payments);
    await db.receipts.bulkPut(merged.photos ?? []);
  });
  return remote.trip.id;
}

/** Every trip on this phone (deleted ones too) in one file: a list of the same texts a single-trip file holds. */
export async function exportAll(): Promise<string> {
  const ids = (await db.trips.toArray()).map((t) => t.id);
  return JSON.stringify({ format: 'fairshare-backup', trips: await Promise.all(ids.map(async (id) => (await exportTrip(id, true)).text)) });
}

/** Merges every trip of a backup file into this phone (nothing is overwritten that is newer here). Returns how many. */
export async function restoreAll(text: string): Promise<number> {
  let raw: { format?: unknown; trips?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not a FairsHare backup');
  }
  if (raw?.format !== 'fairshare-backup' || !Array.isArray(raw.trips)) throw new Error('This is not a FairsHare backup');
  const snapshots = await Promise.all(raw.trips.map((t) => decodePayload(String(t)))); // all valid before any is applied
  for (const s of snapshots) await applyImport(s);
  return snapshots.length;
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
