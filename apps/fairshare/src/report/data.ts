import { balances, settleUp } from '../engine/balances';
import type { Snapshot } from '../sync/merge';
import { money, signed } from '../ui';

export type ReportData = {
  tripName: string;
  heading: string[]; // lines under the trip name
  ledger: { date: string; title: string; paidBy: string; amount: string; base: string }[];
  members: { name: string; paid: string; owed: string; balance: string }[];
  settle: string[]; // "Ana pays Ben PHP 150.00"; empty when all settled
  payments: string[]; // settlements already made
  currency: string;
  /** True if some characters could not be printed (the embedded font covers Latin, Greek and Cyrillic). */
  replaced: boolean;
};

// The embedded font has no CJK, emoji, Thai, Arabic or Indic glyphs; printing them would give blank boxes.
const UNPRINTABLE = /\p{Extended_Pictographic}|[⺀-〿＀-￯]|[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/gu;

/** Everything is computed from the same engine functions the Settle up screen uses, then only formatted here. */
export function buildReport(snapshot: Snapshot, generated: string): ReportData {
  let replaced = false;
  const text = (s: string) =>
    s.replace(UNPRINTABLE, () => {
      replaced = true;
      return '?';
    });

  const cur = snapshot.trip.baseCurrency;
  const members = snapshot.members.filter((m) => !m.deleted).sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  const expenses = snapshot.expenses.filter((e) => !e.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.ver - b.ver || (a.id < b.id ? -1 : 1));
  const payments = snapshot.payments.filter((p) => !p.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.ver - b.ver);
  const name = Object.fromEntries(members.map((m) => [m.id, text(m.name)]));
  const nameOf = (id: string) => name[id] ?? 'Someone';

  const bal = balances(members.map((m) => m.id), expenses, payments);
  const paid = (id: string) => expenses.filter((e) => e.payerId === id).reduce((a, e) => a + e.baseAmountMinor, 0);
  const owed = (id: string) => expenses.flatMap((e) => e.owed).filter((o) => o.memberId === id).reduce((a, o) => a + o.amountMinor, 0);
  const total = expenses.reduce((a, e) => a + e.baseAmountMinor, 0);

  return {
    tripName: text(snapshot.trip.name),
    currency: cur,
    heading: [
      `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} · Total ${money(total, cur)}`,
      `${members.length} ${members.length === 1 ? 'member' : 'members'} · Amounts in ${cur} · ${generated}`,
    ],
    ledger: expenses.map((e) => ({
      date: e.date,
      title: text(e.title) + (e.rate ? `\n${e.rate}` : ''),
      paidBy: nameOf(e.payerId),
      amount: money(e.amountMinor, e.currency),
      base: money(e.baseAmountMinor, cur),
    })),
    members: members.map((m) => ({
      name: name[m.id] + (m.active ? '' : ' (inactive)'),
      paid: money(paid(m.id), cur),
      owed: money(owed(m.id), cur),
      balance: signed(bal[m.id], cur),
    })),
    settle: settleUp(bal).map((t) => `${nameOf(t.fromId)} pays ${nameOf(t.toId)} ${money(t.amountMinor, cur)}`),
    payments: payments.map((p) => `${nameOf(p.fromId)} paid ${nameOf(p.toId)} ${money(p.amountMinor, cur)} · ${p.date}`),
    replaced,
  };
}
