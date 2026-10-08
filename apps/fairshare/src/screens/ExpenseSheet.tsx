import { useState } from 'react';
import { formatAmount, parseAmount, parseUnits, RATE_RE } from '../engine/money';
import { computeExpense } from '../engine/split';
import type { Expense, Member, SplitInput, SplitMode, Trip } from '../schemas';
import { deleteExpense, saveExpense, today, type ExpenseDraft } from '../store';
import { CurrencySelect, money } from '../ui';

const MODES: [SplitMode, string][] = [['equal', 'Equal'], ['shares', 'Shares'], ['percent', 'Percent'], ['exact', 'Exact']];

const rateNumber = (rate: string | null) => (rate ? RATE_RE.exec(rate)![2] : '');

/** Starting values per member. Equal: '1' = included. Shares default to 1 each. */
const defaults = (mode: SplitMode, ids: string[]) => Object.fromEntries(ids.map((id) => [id, mode === 'equal' || mode === 'shares' ? '1' : '']));

function initialValues(e: Expense, ids: string[]) {
  const shown = (v: number) =>
    e.splitMode === 'percent' ? formatAmount(v, 'USD') : e.splitMode === 'exact' ? formatAmount(v, e.currency) : e.splitMode === 'equal' ? '1' : String(v);
  const byId = Object.fromEntries(e.splitInputs.map((i) => [i.memberId, shown(i.value)]));
  return Object.fromEntries(ids.map((id) => [id, byId[id] ?? '']));
}

type Props = { trip: Trip; members: Member[]; expenses: Expense[]; expense?: Expense; onClose: () => void };

export function ExpenseSheet({ trip, members, expenses, expense, onClose }: Props) {
  // Active members, plus anyone already on this expense (so editing never drops them).
  const used = new Set(expense ? [expense.payerId, ...expense.splitInputs.map((i) => i.memberId)] : []);
  const people = members.filter((m) => m.active || used.has(m.id));
  const ids = people.map((p) => p.id);
  const base = trip.baseCurrency;

  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense ? formatAmount(expense.amountMinor, expense.currency) : '');
  const [currency, setCurrency] = useState(expense?.currency ?? base);
  const [rate, setRate] = useState(rateNumber(expense?.rate ?? null));
  const [date, setDate] = useState(expense?.date ?? today());
  const [payerId, setPayerId] = useState(expense?.payerId ?? ids[0]);
  const [mode, setMode] = useState<SplitMode>(expense?.splitMode ?? 'equal');
  const [values, setValues] = useState(expense ? initialValues(expense, ids) : defaults('equal', ids));

  const foreign = currency !== base;
  const pickCurrency = (c: string) => {
    setCurrency(c);
    // A new expense in the same currency pre-fills the last rate used.
    const last = expenses.filter((e) => e.currency === c && e.rate).sort((a, b) => b.ver - a.ver)[0];
    setRate(rateNumber(last?.rate ?? null));
    setValues(defaults(mode, ids)); // exact amounts depend on the currency
  };
  const pickMode = (m: SplitMode) => {
    setMode(m);
    setValues(defaults(m, ids));
  };

  // Everything below is derived from the form on each render.
  let amountMinor: number | null = null;
  try {
    amountMinor = parseAmount(amount, currency);
  } catch {
    /* incomplete input */
  }
  const inputs: SplitInput[] = [];
  let splitError = '';
  let total = 0;
  for (const m of people) {
    const v = (values[m.id] ?? '').trim();
    if (!v) continue;
    try {
      const n = mode === 'equal' ? 1 : mode === 'shares' ? parseUnits(v, 0) : mode === 'percent' ? parseUnits(v, 2) : parseAmount(v, currency);
      total += n;
      if (n > 0) inputs.push({ memberId: m.id, value: n });
    } catch {
      splitError = `Check the value for ${m.name}`;
    }
  }
  let draft: ExpenseDraft | undefined;
  if (!splitError && amountMinor && title.trim() && payerId && (!foreign || rate.trim())) {
    const input = { amountMinor, currency, rate: foreign ? `1 ${currency} = ${rate.trim()} ${base}` : null, splitMode: mode, splitInputs: inputs };
    try {
      computeExpense({ ...input, baseCurrency: base });
      draft = { ...input, title: title.trim(), date, payerId };
    } catch (e) {
      splitError = (e as Error).message;
    }
  }
  const remaining =
    mode === 'percent' ? `${formatAmount(10000 - total, 'USD')}%` : mode === 'exact' && amountMinor !== null ? money(amountMinor - total, currency) : null;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Expense">
      <header className="bar">
        <button onClick={onClose}>Cancel</button>
        <h1>{expense ? 'Edit expense' : 'New expense'}</h1>
        <button
          className="primary"
          disabled={!draft}
          onClick={async () => {
            await saveExpense(trip.id, draft!, expense?.id);
            onClose();
          }}
        >
          Save
        </button>
      </header>
      <div className="screen">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="two">
          <label>
            Amount
            {/* decimal keypad; no pattern attribute, it would hide the decimal key on iOS */}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Currency
            <CurrencySelect label="Currency" value={currency} onChange={pickCurrency} />
          </label>
        </div>
        {foreign && (
          <label>
            Rate: 1 {currency} = ? {base}
            <input inputMode="decimal" aria-label="Rate" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        )}
        <div className="two">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Paid by
            <select aria-label="Paid by" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              {people.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>

        <h2>Split</h2>
        <div className="seg">
          {MODES.map(([id, label]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => pickMode(id)}>{label}</button>
          ))}
        </div>
        <ul className="list">
          {people.map((m) => (
            <li key={m.id} className="row">
              {mode === 'equal' ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={values[m.id] === '1'}
                    onChange={(e) => setValues({ ...values, [m.id]: e.target.checked ? '1' : '' })}
                  />
                  {m.name}
                </label>
              ) : (
                <>
                  <span>{m.name}</span>
                  <input
                    inputMode={mode === 'shares' ? 'numeric' : 'decimal'}
                    aria-label={`${m.name} ${mode}`}
                    value={values[m.id] ?? ''}
                    onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
        {remaining && <p role="status">Remaining: {remaining}</p>}
        {splitError && amountMinor !== null && <p role="alert" className="error">{splitError}</p>}

        {expense && (
          <button
            onClick={async () => {
              await deleteExpense(expense.id);
              onClose();
            }}
          >
            Delete expense
          </button>
        )}
      </div>
    </div>
  );
}
