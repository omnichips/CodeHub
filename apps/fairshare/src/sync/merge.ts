import type { Expense, Member, Payment, Trip } from '../schemas';

export type Snapshot = { trip: Trip; members: Member[]; expenses: Expense[]; payments: Payment[] };
/** What applying a merge would change, as the preview screen shows it. */
export type Summary = { newTrip: boolean; added: number; updated: number; deleted: number };

type Rec = { id: string; ver: number; deviceId: string };

/** Higher logical version wins; equal versions fall back to device id so every phone picks the same record. */
const beats = (a: Rec, b: Rec) => (a.ver !== b.ver ? a.ver > b.ver : a.deviceId > b.deviceId);

function union<T extends Rec>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || beats(r, l)) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Pure and symmetric: merge(a, b) equals merge(b, a), and merging again changes nothing. */
export function mergeSnapshots(local: Snapshot | undefined, remote: Snapshot): { merged: Snapshot; summary: Summary } {
  if (local && local.trip.id !== remote.trip.id) throw new Error('These are different trips');
  const l = local ?? { trip: remote.trip, members: [], expenses: [], payments: [] };

  const expenses = union(l.expenses, remote.expenses);
  const payments = union(l.payments, remote.payments);

  // A member deleted on one phone may be used by an expense or payment made on the other. Keep them, inactive,
  // so no record points at a person who is gone. Derived from the merged set, so both phones get the same result.
  const used = new Set<string>();
  for (const e of expenses) if (!e.deleted) [e.payerId, ...e.owed.map((o) => o.memberId), ...e.splitInputs.map((s) => s.memberId)].forEach((id) => used.add(id));
  for (const p of payments) if (!p.deleted) used.add(p.fromId).add(p.toId);
  const members = union(l.members, remote.members).map((m) => (m.deleted && used.has(m.id) ? { ...m, deleted: false, active: false } : m));

  const tripWinner = local && !beats(remote.trip, local.trip) ? local.trip : remote.trip;
  const clock = Math.max(l.trip.clock, remote.trip.clock, ...[...members, ...expenses, ...payments].map((r) => r.ver));
  const merged: Snapshot = { trip: { ...tripWinner, clock }, members, expenses, payments };

  // Everything that is the other phone's record, or was repaired above, is a new object; unchanged ones keep identity.
  const summary: Summary = { newTrip: !local, added: 0, updated: 0, deleted: 0 };
  if (local && tripWinner !== local.trip) summary.updated++;
  const count = (before: (Rec & { deleted: boolean })[], after: (Rec & { deleted: boolean })[]) => {
    const old = new Map(before.map((r) => [r.id, r]));
    for (const r of after) {
      const o = old.get(r.id);
      if (!o) summary.added += r.deleted ? 0 : 1;
      else if (r !== o && !(r.deleted && o.deleted)) summary[r.deleted ? 'deleted' : 'updated']++;
    }
  };
  count(l.members, members);
  count(l.expenses, expenses);
  count(l.payments, payments);
  return { merged, summary };
}
