import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

const live = <T extends { deleted: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);

/** Live, non-deleted records for one trip. undefined while loading, null if the trip is gone. */
export function useTripData(tripId: string) {
  return useLiveQuery(async () => {
    const [trip, members, expenses, payments] = await Promise.all([
      db.trips.get(tripId),
      db.members.where('tripId').equals(tripId).toArray(),
      db.expenses.where('tripId').equals(tripId).toArray(),
      db.payments.where('tripId').equals(tripId).toArray(),
    ]);
    if (!trip || trip.deleted) return null;
    return {
      trip,
      members: live(members).sort((a, b) => a.name.localeCompare(b.name)),
      expenses: live(expenses).sort((a, b) => b.date.localeCompare(a.date) || b.ver - a.ver),
      payments: live(payments).sort((a, b) => b.ver - a.ver),
    };
  }, [tripId]);
}

export function useTrips() {
  return useLiveQuery(async () => (await db.trips.toArray()).filter((t) => !t.deleted).sort((a, b) => b.updatedAt - a.updatedAt));
}
