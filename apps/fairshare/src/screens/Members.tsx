import { useRef, useState } from 'react';
import { downloadFile, exportTrip } from '../backup';
import { removeTripPhoto, setTripPhoto } from '../photos';
import { addMember, removeMember, renameMember, setMemberActive, updateTrip } from '../store';
import type { TripData } from './Expenses';

export function Members({ data, photo, onArchived }: { data: TripData; photo?: string; onArchived: () => void }) {
  const { trip, members } = data;
  const [name, setName] = useState('');
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await addMember(trip.id, name);
          setName('');
        }}
      >
        <label>
          Member name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary" disabled={!name.trim()}>Add member</button>
      </form>

      {members.length === 0 && <p className="empty">No members yet</p>}
      <ul className="list">
        {members.map((m) => (
          <li key={`${m.id}-${m.ver}`} className="row">
            <input
              aria-label={`Name of ${m.name}`}
              defaultValue={m.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && renameMember(m.id, e.target.value)}
            />
            {m.active ? (
              <button onClick={() => removeMember(m.id)} aria-label={`Remove ${m.name}`}>Remove</button>
            ) : (
              <button onClick={() => setMemberActive(m.id, true)} aria-label={`Reactivate ${m.name}`}>Inactive · Reactivate</button>
            )}
          </li>
        ))}
      </ul>

      <h2>Trip</h2>
      <div className="card">
        <div className="photo-row">
          {photo && <img className="thumb" src={photo} alt="Trip photo" />}
          <button onClick={() => photoInput.current?.click()}>{photo ? 'Change photo' : 'Add trip photo'}</button>
          {photo && <button onClick={() => removeTripPhoto(trip.id)}>Remove photo</button>}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="Trip photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              setPhotoError('');
              if (file) setTripPhoto(trip.id, file).catch(() => setPhotoError('Could not use that photo. Try another one.'));
            }}
          />
        </div>
        {photoError && <p role="alert" className="error">{photoError}</p>}
        <p className="hint">The photo stays on this phone; it is not sent when you sync.</p>
        <label>
          Trip name
          <input key={trip.ver} defaultValue={trip.name} onBlur={(e) => e.target.value.trim() && e.target.value !== trip.name && updateTrip(trip.id, { name: e.target.value })} />
        </label>
        <button
          onClick={async () => downloadFile(`${trip.name.replace(/[^\w-]+/g, '_')}.fairshare`, (await exportTrip(trip.id)).text)}
        >
          Back up trip
        </button>
        <button
          onClick={async () => {
            await updateTrip(trip.id, { archived: true });
            onArchived();
          }}
        >
          Archive trip
        </button>
      </div>
    </>
  );
}
