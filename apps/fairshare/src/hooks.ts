import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { orderTrips } from './store';

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
  return useLiveQuery(async () => {
    const [trips, device] = await Promise.all([db.trips.toArray(), db.device.toCollection().first()]);
    return orderTrips(trips.filter((t) => !t.deleted), device?.settings.tripOrder);
  });
}
