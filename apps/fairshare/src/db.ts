import Dexie, { type EntityTable } from 'dexie';
import type { Device, Expense, Member, Payment, Trip } from './schemas';

/**
 * A trip's cover photo (JPEG bytes). Kept on this phone only: not synced and not in backups (too big for QR codes).
 * Bytes, not a Blob: WebKit's IndexedDB sometimes refuses Blobs ("Error preparing Blob/File data").
 */
export type TripPhoto = { tripId: string; jpeg: ArrayBuffer };

export class FairShareDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  members!: EntityTable<Member, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  device!: EntityTable<Device, 'deviceId'>;
  photos!: EntityTable<TripPhoto, 'tripId'>;

  constructor(name = 'fairshare') {
    super(name);
    // Booleans are not valid IndexedDB keys, so `deleted` is filtered in code, not indexed.
    this.version(1).stores({
      trips: 'id',
      members: 'id, tripId',
      expenses: 'id, tripId, date',
      payments: 'id, tripId',
      device: 'deviceId',
    });
    this.version(2).stores({ photos: 'tripId' });
  }
}

export const db = new FairShareDB();
