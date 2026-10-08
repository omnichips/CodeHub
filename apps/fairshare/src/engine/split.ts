import type { Item, Owed, SplitInput, SplitMode } from '../schemas';
import { convertMinor } from './money';

export type { SplitMode };

const byId = (a: { memberId: string }, b: { memberId: string }) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);

/**
 * Largest-remainder allocation of `total` by integer weights; ties go to the lower member ID.
 * Equal split is the same thing with every weight 1, so leftover units go to members in ID order.
 * Output is sorted by member ID so two phones always agree.
 */
export function allocate(total: number, weights: SplitInput[]): Owed[] {
  const sorted = [...weights].sort(byId);
  if (sorted.length === 0) throw new Error('Split needs at least one member');
  if (sorted.some((w, i) => i > 0 && w.memberId === sorted[i - 1].memberId)) throw new Error('Duplicate member in split');
  const W = BigInt(sorted.reduce((a, w) => a + w.value, 0));
  if (W === 0n) throw new Error('Split weights are all zero');
  const T = BigInt(total);
  const rows = sorted.map((w) => ({ memberId: w.memberId, base: (T * BigInt(w.value)) / W, rem: (T * BigInt(w.value)) % W }));
  let leftover = Number(T - rows.reduce((a, r) => a + r.base, 0n));
  // Stable sort keeps ID order among equal remainders.
  for (const r of [...rows].sort((a, b) => (a.rem === b.rem ? 0 : a.rem > b.rem ? -1 : 1))) {
    if (leftover-- > 0) r.base += 1n;
  }
  return rows.map((r) => ({ memberId: r.memberId, amountMinor: Number(r.base) }));
}

export interface ExpenseInput {
  amountMinor: number;
  currency: string;
  baseCurrency: string;
  rate: string | null;
  splitMode: SplitMode;
  splitInputs: SplitInput[];
  items?: Item[];
}

/**
 * Prices an expense: base-currency amount (rounded once) and the per-member split.
 * splitInputs values: equal ignored; shares = whole shares; percent = hundredths of a percent
 * (must total 10000); exact and items = minor units in the expense currency (must total amountMinor).
 */
export function computeExpense(e: ExpenseInput): { baseAmountMinor: number; owed: Owed[] } {
  let baseAmountMinor = e.amountMinor;
  if (e.currency !== e.baseCurrency) {
    if (!e.rate) throw new Error('A rate is required for a foreign-currency expense');
    baseAmountMinor = convertMinor(e.amountMinor, e.rate, e.currency, e.baseCurrency);
  } else if (e.rate) {
    throw new Error('No rate allowed when the expense is in the base currency');
  }
  const total = e.splitInputs.reduce((a, w) => a + w.value, 0);
  if (e.splitMode === 'percent' && total !== 10000) throw new Error('Percentages must total 100');
  if (e.splitMode === 'items' && !e.items?.length) throw new Error('Add at least one item');
  if ((e.splitMode === 'exact' || e.splitMode === 'items') && total !== e.amountMinor) throw new Error('Exact amounts must total the expense amount');
  const weights = e.splitMode === 'equal' ? e.splitInputs.map((w) => ({ ...w, value: 1 })) : e.splitInputs;
  return { baseAmountMinor, owed: allocate(baseAmountMinor, weights) };
}

/**
 * Per-member amounts (expense currency) for a receipt: each item is split equally among its members,
 * then the rest of the total (tax, tip, service; negative for a discount) is spread in proportion
 * to each member's item subtotal. Sums to totalMinor exactly.
 */
export function itemSplit(items: Item[], totalMinor: number): SplitInput[] {
  if (items.length === 0) throw new Error('Add at least one item');
  const sub = new Map<string, number>();
  for (const it of items) {
    for (const o of allocate(it.amountMinor, it.memberIds.map((memberId) => ({ memberId, value: 1 })))) {
      sub.set(o.memberId, (sub.get(o.memberId) ?? 0) + o.amountMinor);
    }
  }
  const itemsTotal = items.reduce((a, it) => a + it.amountMinor, 0);
  const diff = totalMinor - itemsTotal;
  if (totalMinor < 0) throw new Error('Total must not be negative');
  // Each member's item subtotal is the weight for the extra. A discount (diff < 0) never takes anyone below
  // zero: |diff| < itemsTotal, so each share of it is at most that member's subtotal.
  const weights = [...sub].map(([memberId, value]) => ({ memberId, value }));
  const extra = allocate(Math.abs(diff), weights);
  return extra.map((o) => ({ memberId: o.memberId, value: sub.get(o.memberId)! + Math.sign(diff) * o.amountMinor })).filter((w) => w.value > 0);
}
