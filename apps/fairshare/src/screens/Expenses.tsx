import { useRef, useState } from 'react';
import { useHoldDrag } from '../drag';
import type { useTripData } from '../hooks';
import type { Expense } from '../schemas';
import { setExpenseCategory } from '../store';
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

  // Hold an expense and drag it onto a folder to put it in that category, or out of its folder to take it out.
  const [lifted, setLifted] = useState<Expense | null>(null);
  const [target, setTarget] = useState<string | null>(); // a folder's name; null: out of any; undefined: neither
  const drag = useRef<{ expense: Expense; sx: number; sy: number; el: HTMLElement } | null>(null); // read by drop, not `lifted`: it may not have re-rendered yet
  const dropped = useRef(false); // the tap that ends a drag must not also open the expense
  /** What is under the finger, looking past the lifted row itself. */
  const targetAt = (x: number, y: number) => {
    const under = document.elementsFromPoint(x, y).find((el) => !drag.current?.el.contains(el));
    const folder = under?.closest<HTMLElement>('[data-folder]');
    return folder ? folder.dataset.folder! : under?.closest('[data-loose]') ? null : undefined;
  };
  const drags = useHoldDrag({
    lift(id, x, y, el) {
      const expense = expenses.find((e) => e.id === id);
      if (!expense) return;
      drag.current = { expense, sx: x, sy: y, el };
      setLifted(expense);
    },
    move(x, y, scrolled) {
      const d = drag.current;
      if (!d) return;
      d.el.style.transform = `translate(${x - d.sx}px, ${y - d.sy + scrolled}px)`;
      setTarget(targetAt(x, y));
    },
    drop(x, y) {
      const d = drag.current;
      const to = targetAt(x, y);
      drag.current = null;
      dropped.current = true;
      if (d) d.el.style.transform = '';
      if (d && to !== undefined && (to ?? undefined) !== d.expense.category) void setExpenseCategory(d.expense.id, to ?? undefined);
      setLifted(null);
      setTarget(undefined);
    },
  });
  const canDrag = folders.size > 0; // with no folder there is nowhere to drag to

  const rows = (list: Expense[], where?: string) => (
    <ul className="list drag-list" data-loose={where === undefined ? '' : undefined}>
      {list.map((e) => (
        <li key={e.id} className={lifted?.id === e.id ? 'lifted' : undefined} onPointerDownCapture={() => (dropped.current = false)} {...(canDrag && drags.bind(e.id))}>
          <button className="row" onClick={() => !dropped.current && setSheet(e)}>
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
        <details key={name} className={`folder${target === name ? ' drop-target' : ''}`} data-folder={name}>
          <summary>
            <span>
              {name}
              <small>{list.length} {list.length === 1 ? 'expense' : 'expenses'}</small>
            </span>
            <strong>{money(list.reduce((a, e) => a + e.baseAmountMinor, 0), trip.baseCurrency)}</strong>
          </summary>
          {rows(list, name)}
        </details>
      ))}
      {rows(loose)}
      {canDrag && expenses.length > 1 && !lifted && <p className="hint center">Hold an expense to drag it into or out of a folder.</p>}
      {lifted?.category && (
        <div className={`drop-out${target === null ? ' drop-target' : ''}`} data-loose="">
          Drop here to take it out of “{lifted.category}”
        </div>
      )}
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
