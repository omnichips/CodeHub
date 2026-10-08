import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { balances, settleUp } from '../engine/balances';
import { computeExpense } from '../engine/split';
import type { Expense, Member, Payment, Trip } from '../schemas';
import type { Snapshot } from '../sync/merge';
import { money, signed } from '../ui';
import { buildReport } from './data';
import { renderReport } from './pdf';

const TRIP = '00000000-0000-4000-8000-000000000001';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = (ver: number, deleted = false) => ({ ver, deviceId: 'd', deleted, updatedAt: 0 });

const NAMES = ['Ana', 'Beñat', 'Cyd', 'Ελένη', 'Борис'];
const trip = (over: Partial<Trip> = {}): Trip => ({ id: TRIP, name: 'Cebu ₱ trip', baseCurrency: 'PHP', clock: 99, archived: false, ...stamp(1), ...over });
const members: Member[] = NAMES.map((name, i) => ({ id: uuid(10 + i), tripId: TRIP, name, active: true, ...stamp(2) }));
const [ANA, BEN, CYD, ELE, BOR] = members.map((m) => m.id);

function expense(n: number, title: string, payerId: string, amountMinor: number, over: Partial<Expense> = {}, currency = 'PHP', rate: string | null = null): Expense {
  const splitInputs = members.map((m) => ({ memberId: m.id, value: 1 }));
  const priced = computeExpense({ amountMinor, currency, baseCurrency: 'PHP', rate, splitMode: 'equal', splitInputs });
  return { id: uuid(100 + n), tripId: TRIP, title, date: `2026-10-${String((n % 28) + 1).padStart(2, '0')}`, payerId, amountMinor, currency, rate, splitMode: 'equal', splitInputs, ...priced, ...stamp(3 + n), ...over };
}
const payment = (n: number, fromId: string, toId: string, amountMinor: number): Payment => ({ id: uuid(300 + n), tripId: TRIP, fromId, toId, amountMinor, date: '2026-10-20', ...stamp(50 + n) });

const scenario = (): Snapshot => ({
  trip: trip(),
  members,
  expenses: [
    expense(1, 'Hapunan at Café ₹ €', ANA, 123_457),
    expense(2, 'Taxi', BEN, 45_000),
    expense(3, 'Ferry (EUR)', CYD, 2_550, {}, 'EUR', '1 EUR = 65.20 PHP'),
    expense(4, 'Скидка и Βιβλίο', ELE, 77_777),
    expense(5, 'Cancelled', BOR, 99_999, stamp(9, true)),
  ],
  payments: [payment(1, BEN, ANA, 20_000), payment(2, BOR, ANA, 5_000)],
});

/** The PDF's text, one string per page, whitespace collapsed. */
async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return pages;
}
const render = async (s: Snapshot) => renderReport(buildReport(s, '2026-10-21'));
const textOf = async (s: Snapshot) => (await pdfPages(await render(s))).join(' ');

describe('PDF report', () => {
  it('is a valid PDF file', async () => {
    const bytes = await render(scenario());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder().decode(bytes.slice(-8))).toContain('%%EOF');
    expect(await pdfPages(bytes)).toHaveLength(1);
    expect(bytes.length).toBeLessThan(2_000_000);
  });

  it('shows names, titles and symbols in Latin, Cyrillic and Greek', async () => {
    const text = await textOf(scenario());
    for (const s of ['Cebu ₱ trip', 'Beñat', 'Ελένη', 'Борис', 'Hapunan at Café ₹ €', 'Скидка и Βιβλίο', 'fairshare', '2026-10-21']) {
      expect(text, s).toContain(s);
    }
  });

  it('totals, per-member figures, balances and settle-up match the engine', async () => {
    const s = scenario();
    const text = await textOf(s);
    const live = s.expenses.filter((e) => !e.deleted);
    const ids = members.map((m) => m.id);
    const bal = balances(ids, live, s.payments);
    expect(Object.values(bal).reduce((a, b) => a + b, 0)).toBe(0);

    // header total = every live expense in the base currency, and not the cancelled one
    expect(text).toContain(`Total ${money(live.reduce((a, e) => a + e.baseAmountMinor, 0), 'PHP')}`);
    expect(text).not.toContain('Cancelled');

    members.forEach((m) => {
      const paid = live.filter((e) => e.payerId === m.id).reduce((a, e) => a + e.baseAmountMinor, 0);
      const owed = live.flatMap((e) => e.owed).filter((o) => o.memberId === m.id).reduce((a, o) => a + o.amountMinor, 0);
      // one table row: name, paid, owed, balance
      expect(text, m.name).toContain(`${m.name} ${money(paid, 'PHP')} ${money(owed, 'PHP')} ${signed(bal[m.id], 'PHP')}`);
    });

    const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
    for (const t of settleUp(bal)) expect(text).toContain(`${nameOf[t.fromId]} pays ${nameOf[t.toId]} ${money(t.amountMinor, 'PHP')}`);
    for (const p of s.payments) expect(text).toContain(`${nameOf[p.fromId]} paid ${nameOf[p.toId]} ${money(p.amountMinor, 'PHP')}`);

    // a foreign expense shows its own currency, the rate typed, and the converted amount
    const ferry = live.find((e) => e.title === 'Ferry (EUR)')!;
    for (const v of [money(ferry.amountMinor, 'EUR'), money(ferry.baseAmountMinor, 'PHP'), '1 EUR = 65.20 PHP']) expect(text, v).toContain(v);
  });

  it('says so when everything is settled', async () => {
    const s = scenario();
    const bal = balances(members.map((m) => m.id), s.expenses, s.payments);
    const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const settling = settleUp(bal).map((t, i) => payment(10 + i, t.fromId, t.toId, t.amountMinor));
    expect(await textOf({ ...s, payments: [...s.payments, ...settling] })).toContain('All settled');
    expect(nameOf[ANA]).toBe('Ana');
  });

  it('replaces characters the font cannot print and reports it', async () => {
    const s = scenario();
    s.expenses[1].title = 'Taxi 晚餐 🍜';
    const report = buildReport(s, '2026-10-21');
    expect(report.replaced).toBe(true);
    expect(report.ledger.some((r) => r.title === 'Taxi ?? ?')).toBe(true);
    expect(await pdfPages(renderReport(report))).toHaveLength(1);
    expect(buildReport(scenario(), '2026-10-21').replaced).toBe(false);
  });

  it('paginates a long ledger and keeps every row and the totals', async () => {
    const s = scenario();
    s.expenses = Array.from({ length: 150 }, (_, i) => expense(i + 1, `Long item ${i + 1}`, members[i % 5].id, 1_000 + i * 13));
    const pages = await pdfPages(await render(s));
    expect(pages.length).toBeGreaterThan(2);
    const text = pages.join(' ');
    for (let i = 1; i <= 150; i++) expect(text).toContain(`Long item ${i} `);
    const bal = balances(members.map((m) => m.id), s.expenses, s.payments);
    expect(text).toContain(`Total ${money(s.expenses.reduce((a, e) => a + e.baseAmountMinor, 0), 'PHP')}`);
    for (const t of settleUp(bal)) expect(text).toContain(money(t.amountMinor, 'PHP'));
    expect(pages.at(-1)).toMatch(/Page \d+ of \d+/);
  });

  it('works for a trip with no expenses, no members, and a zero-decimal currency', async () => {
    const empty: Snapshot = { trip: trip({ baseCurrency: 'JPY', name: 'Tokyo' }), members: [], expenses: [], payments: [] };
    expect(await textOf(empty)).toContain('Tokyo');
    const yen: Snapshot = { ...empty, members: members.slice(0, 2) };
    yen.expenses = [{ ...expense(1, 'Ramen', ANA, 1_001), ...computeExpense({ amountMinor: 1_001, currency: 'JPY', baseCurrency: 'JPY', rate: null, splitMode: 'equal', splitInputs: yen.members.map((m) => ({ memberId: m.id, value: 1 })) }), currency: 'JPY', splitInputs: yen.members.map((m) => ({ memberId: m.id, value: 1 })) }];
    expect(await textOf(yen)).toContain(`Total ${money(1_001, 'JPY')}`);
  });
});
