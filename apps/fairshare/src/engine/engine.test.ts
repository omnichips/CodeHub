import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Expense, Payment } from '../schemas';
import { balances, canDeleteMember, settleUp } from './balances';
import { convertMinor, decimals, formatAmount, parseAmount } from './money';
import { allocate, computeExpense, type SplitMode } from './split';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('money', () => {
  it('knows currency decimals', () => {
    expect(decimals('USD')).toBe(2);
    expect(decimals('PHP')).toBe(2);
    expect(decimals('JPY')).toBe(0);
    expect(decimals('KWD')).toBe(3);
  });

  it('parses and formats without floats', () => {
    expect(parseAmount('12.5', 'USD')).toBe(1250);
    expect(parseAmount('0.07', 'USD')).toBe(7);
    expect(parseAmount('500', 'JPY')).toBe(500);
    expect(parseAmount('1.234', 'KWD')).toBe(1234);
    expect(() => parseAmount('1.5', 'JPY')).toThrow();
    expect(() => parseAmount('1.005', 'USD')).toThrow();
    expect(() => parseAmount('-1', 'USD')).toThrow();
    expect(formatAmount(1250, 'USD')).toBe('12.50');
    expect(formatAmount(7, 'USD')).toBe('0.07');
    expect(formatAmount(500, 'JPY')).toBe('500');
    expect(formatAmount(-1234, 'KWD')).toBe('-1.234');
  });

  it('converts with the typed rate, rounding half up', () => {
    expect(convertMinor(1001, '1 EUR = 65.20 PHP', 'EUR', 'PHP')).toBe(65265); // 652.652
    expect(convertMinor(1, '1 USD = 0.50 EUR', 'USD', 'EUR')).toBe(1); // 0.5 -> 1
    expect(convertMinor(3, '1 USD = 0.50 EUR', 'USD', 'EUR')).toBe(2); // 1.5 -> 2
    expect(convertMinor(100, '1 USD = 150 JPY', 'USD', 'JPY')).toBe(150); // $1.00 -> 150 yen
    expect(() => convertMinor(100, '1 USD = 0 EUR', 'USD', 'EUR')).toThrow();
    expect(() => convertMinor(100, '1 EUR = 65.20 PHP', 'USD', 'PHP')).toThrow();
    expect(() => convertMinor(100, 'nonsense', 'USD', 'PHP')).toThrow();
  });
});

describe('split', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  const eq = (ids: string[]) => ids.map((memberId) => ({ memberId, value: 1 }));

  it('equal: leftover units go to members in ID order', () => {
    const owed = computeExpense({
      amountMinor: 100, currency: 'USD', baseCurrency: 'USD', rate: null,
      splitMode: 'equal', splitInputs: eq([c, a, b]), // input order must not matter
    }).owed;
    expect(owed).toEqual([
      { memberId: a, amountMinor: 34 },
      { memberId: b, amountMinor: 33 },
      { memberId: c, amountMinor: 33 },
    ]);
  });

  it('shares and percent use largest remainder, ties by ID', () => {
    expect(allocate(100, [{ memberId: a, value: 1 }, { memberId: b, value: 2 }]).map((o) => o.amountMinor)).toEqual([33, 67]);
    const percent = computeExpense({
      amountMinor: 1000, currency: 'USD', baseCurrency: 'USD', rate: null, splitMode: 'percent',
      splitInputs: [{ memberId: a, value: 3333 }, { memberId: b, value: 3333 }, { memberId: c, value: 3334 }],
    }).owed;
    expect(percent.map((o) => o.amountMinor)).toEqual([333, 333, 334]);
  });

  it('rejects bad inputs', () => {
    const base = { amountMinor: 1000, currency: 'USD', baseCurrency: 'USD', rate: null };
    expect(() => computeExpense({ ...base, splitMode: 'percent', splitInputs: [{ memberId: a, value: 5000 }] })).toThrow();
    expect(() => computeExpense({ ...base, splitMode: 'exact', splitInputs: [{ memberId: a, value: 999 }] })).toThrow();
    expect(() => computeExpense({ ...base, splitMode: 'equal', splitInputs: [] })).toThrow();
    expect(() => computeExpense({ ...base, splitMode: 'equal', splitInputs: eq([a, a]) })).toThrow();
    expect(() => computeExpense({ ...base, currency: 'EUR', splitMode: 'equal', splitInputs: eq([a]) })).toThrow(); // rate missing
  });

  it('exact in a foreign currency scales to the base amount', () => {
    const r = computeExpense({
      amountMinor: 1000, currency: 'EUR', baseCurrency: 'PHP', rate: '1 EUR = 65.20 PHP',
      splitMode: 'exact', splitInputs: [{ memberId: a, value: 250 }, { memberId: b, value: 750 }],
    });
    expect(r.baseAmountMinor).toBe(65200);
    expect(r.owed.map((o) => o.amountMinor)).toEqual([16300, 48900]);
  });
});

describe('balances and settle-up', () => {
  it('canDeleteMember is false once a record references them', () => {
    const e = { payerId: 'a', owed: [{ memberId: 'b', amountMinor: 1 }], deleted: false } as Expense;
    expect(canDeleteMember('a', [e], [])).toBe(false);
    expect(canDeleteMember('b', [e], [])).toBe(false);
    expect(canDeleteMember('c', [e], [])).toBe(true);
    expect(canDeleteMember('c', [], [{ fromId: 'c', toId: 'a', deleted: false } as Payment])).toBe(false);
    expect(canDeleteMember('a', [{ ...e, deleted: true }], [])).toBe(true);
  });
});

// ---- property tests over random trips ----

const BASE = 'PHP';
const MODES: SplitMode[] = ['equal', 'exact', 'shares', 'percent'];
const rateText = (cur: string, k: number) => `1 ${cur} = ${Math.floor(k / 100)}.${String(k % 100).padStart(2, '0')} ${BASE}`;

const tripArb = fc.record({
  ids: fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 8 }),
  expenses: fc.array(
    fc.record({
      payer: fc.nat(), mode: fc.constantFrom(...MODES), currency: fc.constantFrom('PHP', 'USD', 'JPY', 'KWD', 'EUR'),
      amount: fc.integer({ min: 1, max: 1_000_000_000 }), rate: fc.integer({ min: 1, max: 50_000 }),
      weights: fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 8, maxLength: 8 }),
      mask: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    }),
    { maxLength: 15 },
  ),
  payments: fc.array(
    fc.record({ from: fc.nat(), to: fc.nat(), amount: fc.integer({ min: 1, max: 1_000_000 }) }),
    { maxLength: 8 },
  ),
});

function buildTrip(t: typeof tripArb extends fc.Arbitrary<infer T> ? T : never) {
  const { ids } = t;
  const expenses = t.expenses.map((x, i): Expense => {
    const members = ids.filter((_, j) => x.mask[j] || j === 0); // never empty
    const w = members.map((_, j) => x.weights[j]);
    const weights = members.map((memberId, j) => ({ memberId, value: w[j] }));
    const value =
      x.mode === 'equal' ? () => 1 :
      x.mode === 'shares' ? (j: number) => w[j] :
      x.mode === 'percent' ? ((p) => (j: number) => p[j].amountMinor)(allocate(10000, weights)) :
      ((p) => (j: number) => p[j].amountMinor)(allocate(x.amount, weights));
    const rate = x.currency === BASE ? null : rateText(x.currency, x.rate);
    const splitInputs = members.map((memberId, j) => ({ memberId, value: value(j) }));
    const priced = computeExpense({
      amountMinor: x.amount, currency: x.currency, baseCurrency: BASE, rate, splitMode: x.mode, splitInputs,
    });
    return {
      id: String(i), tripId: 't', title: 'x', date: '2026-01-01', payerId: ids[x.payer % ids.length],
      amountMinor: x.amount, currency: x.currency, rate, splitMode: x.mode, splitInputs, ...priced,
      ver: 1, deviceId: 'd', deleted: false, updatedAt: 0,
    };
  });
  const payments = t.payments
    .filter((p) => p.from % ids.length !== p.to % ids.length)
    .map((p, i): Payment => ({
      id: String(i), tripId: 't', fromId: ids[p.from % ids.length], toId: ids[p.to % ids.length],
      amountMinor: p.amount, date: '2026-01-02', ver: 1, deviceId: 'd', deleted: false, updatedAt: 0,
    }));
  return { ids, expenses, payments };
}

describe('property: random trips', () => {
  it('owed sums to base, balances sum to zero, settle-up zeroes everyone', () => {
    fc.assert(
      fc.property(tripArb, (t) => {
        const { ids, expenses, payments } = buildTrip(t);
        for (const e of expenses) {
          expect(sum(e.owed.map((o) => o.amountMinor))).toBe(e.baseAmountMinor);
        }
        const bal = balances(ids, expenses, payments);
        expect(sum(Object.values(bal))).toBe(0);

        const transfers = settleUp(bal);
        const nonzero = Object.values(bal).filter((v) => v !== 0).length;
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonzero - 1));
        const after = { ...bal };
        for (const x of transfers) {
          expect(x.amountMinor).toBeGreaterThan(0);
          after[x.fromId] += x.amountMinor;
          after[x.toId] -= x.amountMinor;
        }
        expect(Object.values(after).every((v) => v === 0)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });

  it('same inputs give the same output regardless of input order', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 }), fc.integer({ min: 0, max: 1e9 }), (ids, total) => {
        const fwd = allocate(total, ids.map((memberId) => ({ memberId, value: 1 })));
        const rev = allocate(total, [...ids].reverse().map((memberId) => ({ memberId, value: 1 })));
        expect(rev).toEqual(fwd);
      }),
    );
  });
});
