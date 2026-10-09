import { useState } from 'react';
import type { useTripData } from '../hooks';
import type { Expense } from '../schemas';
import { EmptyState, money } from '../ui';
import { ExpenseSheet } from './ExpenseSheet';

export type TripData = NonNullable<ReturnType<typeof useTripData>>;

export function Expenses({ data, names, goMembers }: { data: TripData; names: Record<string, string>; goMembers: () => void }) {
  const [sheet, setSheet] = useState<Expense | 'new' | null>(null);
  const { trip, members, expenses } = data;
  const hasPeople = members.some((m) => m.active);
  // Categorised expenses go in a folder per category (newest folder first); the rest are listed below them.
  const folders = new Map<string, Expense[]>();
  for (const e of expenses) if (e.category) folders.set(e.category, [...(folders.get(e.category) ?? []), e]);
  const loose = expenses.filter((e) => !e.category);
  const rows = (list: Expense[]) => (
    <ul className="list">
      {list.map((e) => (
        <li key={e.id}>
          <button className="row" onClick={() => setSheet(e)}>
            <span>
              {e.title}
              <small>
                {names[e.payerId] ?? 'Someone'} paid
                {e.currency !== trip.baseCurrency && ` ${money(e.amountMinor, e.currency)}`} · {e.date}
              </small>
            </span>
            <strong>{money(e.baseAmountMinor, trip.baseCurrency)}</strong>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {expenses.length === 0 && <EmptyState>No expenses yet</EmptyState>}
      {[...folders].map(([name, list]) => (
        <details key={name} className="folder">
          <summary>
            <span>
              {name}
              <small>{list.length} {list.length === 1 ? 'expense' : 'expenses'}</small>
            </span>
            <strong>{money(list.reduce((a, e) => a + e.baseAmountMinor, 0), trip.baseCurrency)}</strong>
          </summary>
          {rows(list)}
        </details>
      ))}
      {rows(loose)}
      {hasPeople ? (
        <button className="primary fab" onClick={() => setSheet('new')}>Add expense</button>
      ) : (
        <p className="empty">
          Add members before the first expense. <button onClick={goMembers}>Go to Members</button>
        </p>
      )}
      {sheet && (
        <ExpenseSheet
          trip={trip}
          members={members}
          expenses={expenses}
          expense={sheet === 'new' ? undefined : sheet}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
