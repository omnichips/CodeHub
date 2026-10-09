import { useEffect, useRef, useState } from 'react';
import { useTrips } from '../hooks';
import { setTripPhoto, useTripPhotos } from '../photos';
import { InstallHint } from '../pwa';
import { defaultCurrency } from '../prefs';
import { createTrip, updateTrip } from '../store';
import { BunnyLoader, CurrencySelect, EmptyState, Hare } from '../ui';
import { TripGrid } from './TripGrid';
import { ImportFileButton, Receive } from './Receive';
import { Settings } from './Settings';

export function TripList({ onOpen }: { onOpen: (id: string) => void }) {
  const trips = useTrips();
  const photos = useTripPhotos();
  const [adding, setAdding] = useState(false);
  const [receive, setReceive] = useState<{ file?: File }>();
  const [settings, setSettings] = useState(false);
  const [arranging, setArranging] = useState(false);
  if (!trips)
    return (
      <div className="app">
        <BunnyLoader label="Loading trips…" />
      </div>
    );
  const active = trips.filter((t) => !t.archived);
  const archived = trips.filter((t) => t.archived);

  return (
    <div className="app">
      <header className="bar">
        <Hare size={32} />
        <h1>Fairs<span className="hare-word">Hare</span></h1>
        {arranging ? (
          <button className="primary" onClick={() => setArranging(false)}>Done</button>
        ) : (
        <button className="icon-button" aria-label="Settings" onClick={() => setSettings(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        )}
      </header>
      <main className="screen dashboard">
        <InstallHint />
        {active.length === 0 && <EmptyState>No trips yet</EmptyState>}
        {active.length === 0 && <p className="hint center">Tap + to start one.</p>}
        {active.length > 1 && arranging && (
          <p role="status" className="hint center">Drag the trips into the order you want (or use the arrow keys), then tap Done.</p>
        )}
        <TripGrid trips={active} photos={photos} onOpen={onOpen} arranging={arranging} onArrange={() => setArranging(true)} />

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
      <button className="fab-add" aria-label="New trip" onClick={() => setAdding(true)}>
        <span aria-hidden="true">+</span>
      </button>
      {adding && (
        <NewTripSheet
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            onOpen(id);
          }}
          onReceive={(file) => {
            setAdding(false);
            setReceive({ file });
          }}
        />
      )}
      {settings && <Settings onClose={() => setSettings(false)} />}
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

function NewTripSheet(props: { onClose: () => void; onCreated: (id: string) => void; onReceive: (file?: File) => void }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!photo) return setPreview(undefined);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="New trip">
      <header className="bar">
        <button onClick={props.onClose}>Cancel</button>
        <h1>New trip</h1>
      </header>
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          const id = await createTrip(name, currency);
          if (photo) await setTripPhoto(id, photo).catch(() => undefined); // a photo that cannot be read is skipped
          props.onCreated(id);
        }}
      >
        <button type="button" className="photo-pick" onClick={() => input.current?.click()}>
          {preview ? <img src={preview} alt="" /> : <Hare size={64} />}
          <span>{preview ? 'Change photo' : 'Add a photo (optional)'}</span>
        </button>
        <input ref={input} type="file" accept="image/*" hidden aria-label="Trip photo" onChange={(e) => setPhoto(e.target.files?.[0] ?? photo)} />
        <label>
          Trip name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cebu weekend" />
        </label>
        <label>
          Base currency
          <CurrencySelect label="Base currency" value={currency} onChange={setCurrency} />
        </label>
        <button className="primary" disabled={!name.trim() || busy}>Create trip</button>

        <h2>Joining a trip from another phone?</h2>
        <div className="two">
          <button type="button" onClick={() => props.onReceive()}>Scan trip</button>
          <ImportFileButton onFile={(file) => props.onReceive(file)} />
        </div>
      </form>
    </div>
  );
}
