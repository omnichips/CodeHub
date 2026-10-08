import type { Owed, SplitInput, SplitMode } from '../schemas';
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
}

/**
 * Prices an expense: base-currency amount (rounded once) and the per-member split.
 * splitInputs values: equal ignored; shares = whole shares; percent = hundredths of a percent
 * (must total 10000); exact = minor units in the expense currency (must total amountMinor).
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
  if (e.splitMode === 'exact' && total !== e.amountMinor) throw new Error('Exact amounts must total the expense amount');
  const weights = e.splitMode === 'equal' ? e.splitInputs.map((w) => ({ ...w, value: 1 })) : e.splitInputs;
  return { baseAmountMinor, owed: allocate(baseAmountMinor, weights) };
}
