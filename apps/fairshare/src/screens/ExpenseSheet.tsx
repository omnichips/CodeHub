import { useState } from 'react';
import { formatAmount, parseAmount, parseUnits, RATE_RE } from '../engine/money';
import { computeExpense, itemSplit } from '../engine/split';
import { parseReceipt } from '../receipt/parse';
import { ReceiptScanner } from '../receipt/ReceiptScanner';
import type { Expense, Item, Member, SplitInput, SplitMode, Trip } from '../schemas';
import { deleteExpense, saveExpense, today, type ExpenseDraft } from '../store';
import { CurrencySelect, money } from '../ui';

const MODES: [SplitMode, string][] = [['equal', 'Equal'], ['shares', 'Shares'], ['percent', 'Percent'], ['exact', 'Exact'], ['items', 'Items']];

/** An item as typed: price is text until it parses. */
export type ItemRow = { key: string; name: string; price: string; memberIds: string[] };
const itemRow = (memberIds: string[], name = '', price = ''): ItemRow => ({ key: crypto.randomUUID(), name, price, memberIds });

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
  const used = new Set(expense ? [expense.payerId, ...expense.splitInputs.map((i) => i.memberId), ...(expense.items ?? []).flatMap((i) => i.memberIds)] : []);
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
  const [items, setItems] = useState<ItemRow[]>(() =>
    expense?.items ? expense.items.map((i) => itemRow(i.memberIds, i.name, formatAmount(i.amountMinor, expense.currency))) : [itemRow(ids)],
  );
  const setItem = (key: string, patch: Partial<ItemRow>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // Sum of the totals read from receipts so far; Amount follows it until the user types their own.
  const [scannedTotal, setScannedTotal] = useState(0);

  /** Adds the items of scanned receipts (one text per photo); returns a message when a photo gave nothing. */
  function applyReceipts(texts: string[]): string | null {
    const found = texts.map((t) => parseReceipt(t, currency));
    const rows = found.flatMap((f) => f.items.map((i) => itemRow(ids, i.name, i.price)));
    const empty = found.flatMap((f, i) => (f.items.length ? [] : [i + 1]));
    if (rows.length === 0) {
      // Show what the reader saw, so a bad photo (nothing read) can be told from a receipt layout the parser misses.
      const seen = texts.join(' ').replace(/\s+/g, ' ').trim();
      return `No prices found on that receipt. Try a sharper, flatter photo with the receipt filling the frame, or add the items by hand. Read: "${seen.slice(0, 160) || 'nothing'}"`;
    }
    // Keep items already typed; replace the empty starter row.
    setItems((prev) => [...prev.filter((i) => i.name.trim() || i.price.trim()), ...rows]);
    setMode('items');
    const totals = found.reduce((sum, f) => sum + (f.total ? parseAmount(f.total, currency) : 0), 0);
    let typed: number | null = null;
    try {
      typed = amount.trim() ? parseAmount(amount, currency) : null;
    } catch {
      /* not a number: the user's own text, leave it */
    }
    if (totals && (!amount.trim() || typed === scannedTotal)) setAmount(formatAmount(scannedTotal + totals, currency));
    setScannedTotal(scannedTotal + totals);
    return empty.length ? `No prices found on photo ${empty.join(', ')} of ${texts.length}. Its items were not added.` : null;
  }

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
  let inputs: SplitInput[] = [];
  let splitError = '';
  let total = 0;
  // Items mode: parse the rows that have anything typed in them.
  const parsedItems: Item[] = [];
  let itemsTotal = 0;
  if (mode === 'items') {
    items.forEach((row, i) => {
      if (!row.name.trim() && !row.price.trim()) return;
      const name = row.name.trim() || `Item ${i + 1}`;
      try {
        const amountMinor = parseAmount(row.price, currency);
        if (amountMinor === 0) throw new Error();
        if (row.memberIds.length === 0) splitError ||= `Choose who shared ${name}`;
        parsedItems.push({ name, amountMinor, memberIds: row.memberIds });
        itemsTotal += amountMinor;
      } catch {
        splitError ||= `Check the price of ${name}`;
      }
    });
    if (!splitError && parsedItems.length === 0) splitError = 'Add at least one item';
    if (!splitError && amountMinor) {
      try {
        inputs = itemSplit(parsedItems, amountMinor);
      } catch (e) {
        splitError = (e as Error).message;
      }
    }
  }
  for (const m of mode === 'items' ? [] : people) {
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
    const input = {
      amountMinor, currency, rate: foreign ? `1 ${currency} = ${rate.trim()} ${base}` : null, splitMode: mode, splitInputs: inputs,
      ...(mode === 'items' && { items: parsedItems }),
    };
    try {
      computeExpense({ ...input, baseCurrency: base });
      draft = { ...input, title: title.trim(), date, payerId };
    } catch (e) {
      splitError = (e as Error).message;
    }
  }
  const extra = mode === 'items' && amountMinor !== null ? amountMinor - itemsTotal : 0;
  const shareOf = Object.fromEntries(inputs.map((w) => [w.memberId, w.value]));
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
        {mode === 'items' && !amount.trim() && itemsTotal > 0 && (
          <button onClick={() => setAmount(formatAmount(itemsTotal, currency))}>Use items total: {money(itemsTotal, currency)}</button>
        )}
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

        <ReceiptScanner onRead={applyReceipts} />
        {mode === 'items' && items.length > 1 && <p className="hint">Check each line against the receipt, then tap who shared it.</p>}

        <h2>Split</h2>
        <div className="seg">
          {MODES.map(([id, label]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => pickMode(id)}>{label}</button>
          ))}
        </div>
        {mode === 'items' ? (
          <>
            <ul className="list">
              {items.map((row, i) => (
                <li key={row.key} className="card">
                  <div className="item-line">
                    <input aria-label={`Item ${i + 1} name`} placeholder={`Item ${i + 1}`} value={row.name} onChange={(e) => setItem(row.key, { name: e.target.value })} />
                    <input className="price" inputMode="decimal" aria-label={`Item ${i + 1} price`} placeholder="0.00" value={row.price} onChange={(e) => setItem(row.key, { price: e.target.value })} />
                    <button className="remove" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(items.filter((x) => x.key !== row.key))}>✕</button>
                  </div>
                  <SharedBy label={`Who shared item ${i + 1}`} people={people} chosen={row.memberIds} onChange={(memberIds) => setItem(row.key, { memberIds })} />
                </li>
              ))}
            </ul>
            <button onClick={() => setItems([...items, itemRow(ids)])}>Add item</button>
            {amountMinor !== null && itemsTotal > 0 && (
              <p role="status">
                Items {money(itemsTotal, currency)}
                {extra > 0 && ` · tax, tip and service ${money(extra, currency)}, shared by what each person had`}
                {extra < 0 && ` · discount ${money(-extra, currency)}, shared by what each person had`}
              </p>
            )}
            {inputs.length > 0 && (
              <ul className="list">
                {people.filter((m) => shareOf[m.id]).map((m) => (
                  <li key={m.id} className="row">
                    <span>{m.name}</span>
                    <strong>{money(shareOf[m.id], currency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
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
        )}
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

/**
 * Who shared an item: one compact row ("Everyone", "Ana, Ben +3") that opens a checklist. A native <details>, so it
 * needs no positioning code, works with VoiceOver, and stays one line per item however many people are on the trip.
 */
function SharedBy({ label, people, chosen, onChange }: { label: string; people: Member[]; chosen: string[]; onChange: (ids: string[]) => void }) {
  const names = people.filter((m) => chosen.includes(m.id)).map((m) => m.name);
  const summary =
    names.length === 0 ? 'Choose who shared' : names.length === people.length ? 'Everyone' : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  return (
    <details className="shared-by">
      <summary>
        <span className="muted">Shared by </span>
        <strong className={names.length === 0 ? 'error' : undefined}>{summary}</strong>
      </summary>
      <div role="group" aria-label={label}>
        <div className="two">
          <button onClick={() => onChange(people.map((m) => m.id))}>Everyone</button>
          <button onClick={() => onChange([])}>No one</button>
        </div>
        {people.map((m) => (
          <label key={m.id} className="check">
            <input
              type="checkbox"
              checked={chosen.includes(m.id)}
              onChange={(e) => onChange(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))}
            />
            {m.name}
          </label>
        ))}
      </div>
    </details>
  );
}
