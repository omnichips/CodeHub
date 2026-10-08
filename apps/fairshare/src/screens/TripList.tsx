import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTrips } from '../hooks';
import { setTripPhoto, useTripPhotos } from '../photos';
import { InstallHint } from '../pwa';
import { createTrip, updateTrip } from '../store';
import { BunnyLoader, CurrencySelect, EmptyState, Hare } from '../ui';
import { ImportFileButton, Receive } from './Receive';

/** The cover: the trip's photo, or the hare on a soft green tile. `name` lets the photo glide into the trip's header. */
export function Cover({ url, tripId, className = 'cover' }: { url?: string; tripId: string; className?: string }) {
  const style = { viewTransitionName: `cover-${tripId}` } as CSSProperties;
  return url ? (
    <img className={className} src={url} alt="" style={style} />
  ) : (
    <span className={`${className} placeholder`} style={style}>
      <Hare size={56} />
    </span>
  );
}

export function TripList({ onOpen }: { onOpen: (id: string) => void }) {
  const trips = useTrips();
  const photos = useTripPhotos();
  const [adding, setAdding] = useState(false);
  const [receive, setReceive] = useState<{ file?: File }>();
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
        <h1>fairs<span className="hare-word">hare</span></h1>
      </header>
      <main className="screen dashboard">
        <InstallHint />
        {active.length === 0 && <EmptyState>No trips yet</EmptyState>}
        {active.length === 0 && <p className="hint center">Tap + to start one.</p>}
        <ul className="trip-grid">
          {active.map((t, i) => (
            <li key={t.id} style={{ '--i': i } as CSSProperties}>
              <button className="trip-card" onClick={() => onOpen(t.id)}>
                <Cover url={photos[t.id]} tripId={t.id} />
                <span className="trip-name">{t.name}</span>
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
  const [currency, setCurrency] = useState('PHP');
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
          if (photo) await setTripPhoto(id, photo).catch(() => undefined); // a photo that cannot be read is skipped // a photo that cannot be read is skipped
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
