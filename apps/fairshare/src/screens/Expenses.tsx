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

  return (
    <>
      {expenses.length === 0 && <EmptyState>No expenses yet</EmptyState>}
      <ul className="list">
        {expenses.map((e) => (
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
