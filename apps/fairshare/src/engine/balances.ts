import type { Expense, Payment } from '../schemas';

export type Transfer = { fromId: string; toId: string; amountMinor: number };

/** paid − owed + payments sent − payments received, in base-currency minor units. Deleted records are ignored. */
export function balances(memberIds: string[], expenses: Expense[], payments: Payment[]): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
  const add = (id: string, n: number) => (bal[id] = (bal[id] ?? 0) + n);
  for (const e of expenses) {
    if (e.deleted) continue;
    add(e.payerId, e.baseAmountMinor);
    for (const o of e.owed) add(o.memberId, -o.amountMinor);
  }
  for (const p of payments) {
    if (p.deleted) continue;
    add(p.fromId, p.amountMinor);
    add(p.toId, -p.amountMinor);
  }
  return bal;
}

/**
 * Greedy settle-up: repeatedly match the largest debtor with the largest creditor (ties by ID).
 * At most (people with a balance − 1) transfers; not always the absolute minimum.
 */
export function settleUp(bal: Record<string, number>): Transfer[] {
  const left = { ...bal };
  if (Object.values(left).reduce((a, b) => a + b, 0) !== 0) throw new Error('Balances do not sum to zero');
  const pick = (sign: 1 | -1) =>
    Object.entries(left)
      .filter(([, v]) => v * sign > 0)
      .sort(([ia, a], [ib, b]) => b * sign - a * sign || (ia < ib ? -1 : 1))[0];
  const out: Transfer[] = [];
  for (let c = pick(1), d = pick(-1); c && d; c = pick(1), d = pick(-1)) {
    const amountMinor = Math.min(c[1], -d[1]);
    out.push({ fromId: d[0], toId: c[0], amountMinor });
    left[c[0]] -= amountMinor;
    left[d[0]] += amountMinor;
  }
  return out;
}

/** A member referenced by any live expense or payment can only be marked inactive. */
export function canDeleteMember(memberId: string, expenses: Expense[], payments: Payment[]): boolean {
  return !(
    expenses.some((e) => !e.deleted && (e.payerId === memberId || e.owed.some((o) => o.memberId === memberId))) ||
    payments.some((p) => !p.deleted && (p.fromId === memberId || p.toId === memberId))
  );
}
