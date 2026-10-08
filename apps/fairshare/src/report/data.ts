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
  /** True if some characters could not be printed (the built-in font covers Latin, Greek and Cyrillic). */
  replaced: boolean;
  /** True if Japanese or Chinese characters were among them: the downloadable font would print them. */
  needsJapanese: boolean;
  /** True when built for the Japanese font, which prints those characters and everything else too. */
  japanese: boolean;
};

// The embedded font has no CJK, emoji, Thai, Arabic or Indic glyphs; printing them would give blank boxes.
const UNPRINTABLE = /\p{Extended_Pictographic}|[⺀-〿＀-￯]|[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/gu;
// With the downloaded Japanese font (kana, kanji, Latin, ₱ and the full-width forms), only the other scripts and emoji are lost.
const UNPRINTABLE_JP = /\p{Extended_Pictographic}|[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Everything is computed from the same engine functions the Settle up screen uses, then only formatted here. */
export function buildReport(snapshot: Snapshot, generated: string, japanese = false): ReportData {
  let replaced = false;
  let needsJapanese = false;
  const text = (s: string) =>
    s.replace(japanese ? UNPRINTABLE_JP : UNPRINTABLE, (c) => {
      replaced = true;
      needsJapanese ||= JAPANESE.test(c);
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
    needsJapanese,
    japanese,
  };
}
