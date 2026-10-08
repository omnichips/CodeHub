import { useRef, useState } from 'react';
import { downloadFile, exportTrip } from '../backup';
import { removeTripPhoto, setTripPhoto } from '../photos';
import { updateTrip } from '../store';
import type { TripData } from './Expenses';
import { Sync } from './Sync';

/** Sending and receiving trips, then the trip's own settings (name, photo, backup, archive) at the bottom. */
export function Others({ data, photo, onArchived }: { data: TripData; photo?: string; onArchived: () => void }) {
  const { trip } = data;
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <Sync data={data} />
      <h2>Trip</h2>
      <div className="card">
        <label>
          Trip name
          <input key={trip.ver} defaultValue={trip.name} onBlur={(e) => e.target.value.trim() && e.target.value !== trip.name && updateTrip(trip.id, { name: e.target.value })} />
        </label>
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
        <p className="hint">The trip photo stays on this phone; it is not sent when you sync.</p>
        <button onClick={async () => downloadFile(`${trip.name.replace(/[^\w-]+/g, '_')}.fairshare`, (await exportTrip(trip.id, true)).text)}>
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
