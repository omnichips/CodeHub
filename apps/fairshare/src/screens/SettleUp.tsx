import { useState } from 'react';
import { balances, settleUp } from '../engine/balances';
import { addPayment, deletePayment } from '../store';
import { money, signed } from '../ui';
import type { TripData } from './Expenses';
import { Report } from './Report';

export function SettleUp({ data, names }: { data: TripData; names: Record<string, string> }) {
  const { trip, members, expenses, payments } = data;
  const cur = trip.baseCurrency;
  const bal = balances(members.map((m) => m.id), expenses, payments);
  const transfers = settleUp(bal);
  // The tapped circle turns green with its ✓ first; the payment is recorded once that has played.
  const [paying, setPaying] = useState('');

  return (
    <>
      <h2>Settle up</h2>
      {transfers.length === 0 && <p className="empty settled">All settled</p>}
      <ul className="list">
        {transfers.map((t) => (
          <li key={t.fromId + t.toId} className="row">
            <span>{names[t.fromId]} pays {names[t.toId]} {money(t.amountMinor, cur)}</span>
            <button
              className={`check-paid${paying === t.fromId + t.toId ? ' done' : ''}`}
              aria-label="Mark as paid"
              title="Mark as paid"
              disabled={paying !== ''}
              onClick={() => {
                setPaying(t.fromId + t.toId);
                setTimeout(() => addPayment(trip.id, t.fromId, t.toId, t.amountMinor).finally(() => setPaying('')), 450);
              }}
            >
              <span aria-hidden="true">✓</span>
            </button>
          </li>
        ))}
      </ul>

      <h2>Balances</h2>
      {members.length === 0 && <p className="empty">No members yet</p>}
      <ul className="list">
        {members.map((m) => (
          <li key={m.id} className="row">
            <span>{m.name}</span>
            <strong className={bal[m.id] > 0 ? 'pos' : bal[m.id] < 0 ? 'neg' : undefined}>{signed(bal[m.id], cur)}</strong>
          </li>
        ))}
      </ul>

      {payments.length > 0 && (
        <>
          <h2>Payments made</h2>
          <ul className="list">
            {payments.map((p) => (
              <li key={p.id} className="row">
                <span>{names[p.fromId]} paid {names[p.toId]} {money(p.amountMinor, cur)} <small>{p.date}</small></span>
                <button onClick={() => deletePayment(p.id)} aria-label={`Undo payment ${p.id}`}>Undo</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Report data={data} />
    </>
  );
}
