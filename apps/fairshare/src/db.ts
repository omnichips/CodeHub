import Dexie, { type EntityTable } from 'dexie';
import type { Device, Expense, Member, Payment, Trip } from './schemas';

export class FairShareDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  members!: EntityTable<Member, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  device!: EntityTable<Device, 'deviceId'>;

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
  }
}

export const db = new FairShareDB();
