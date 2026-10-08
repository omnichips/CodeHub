import { useState } from 'react';
import { useTrips } from '../hooks';
import { InstallHint } from '../pwa';
import { createTrip, updateTrip } from '../store';
import { CurrencySelect, EmptyState, Hare } from '../ui';
import { ImportFileButton, Receive } from './Receive';

export function TripList({ onOpen }: { onOpen: (id: string) => void }) {
  const trips = useTrips();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('PHP');
  const [receive, setReceive] = useState<{ file?: File }>();
  if (!trips) return null;
  const active = trips.filter((t) => !t.archived);
  const archived = trips.filter((t) => t.archived);

  return (
    <div className="app">
      <header className="bar">
        <Hare size={32} />
        <h1>fairs<span className="hare-word">hare</span></h1>
      </header>
      <main className="screen">
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = await createTrip(name, currency);
            setName('');
            onOpen(id);
          }}
        >
          <h2>New trip</h2>
          <label>
            Trip name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cebu weekend" />
          </label>
          <label>
            Base currency
            <CurrencySelect label="Base currency" value={currency} onChange={setCurrency} />
          </label>
          <button className="primary" disabled={!name.trim()}>Create trip</button>
        </form>

        <InstallHint />
        <div className="two">
          <button onClick={() => setReceive({})}>Scan trip</button>
          <ImportFileButton onFile={(file) => setReceive({ file })} />
        </div>

        {active.length === 0 && <EmptyState>No trips yet</EmptyState>}
        <ul className="list">
          {active.map((t) => (
            <li key={t.id}>
              <button className="row" onClick={() => onOpen(t.id)}>
                <span>{t.name}</span>
                <small>{t.baseCurrency}</small>
              </button>
            </li>
          ))}
        </ul>

        {archived.length > 0 && (
          <>
            <h2>Archived</h2>
            <ul className="list">
              {archived.map((t) => (
                <li key={t.id} className="row">
                  <button className="row-main" onClick={() => onOpen(t.id)}>{t.name}</button>
                  <button onClick={() => updateTrip(t.id, { archived: false })} aria-label={`Restore ${t.name}`}>Restore</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      {receive && (
        <Receive
          file={receive.file}
          onClose={() => setReceive(undefined)}
          onDone={(id) => {
            setReceive(undefined);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}
