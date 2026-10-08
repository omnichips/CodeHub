import { useState } from 'react';
import { downloadFile, exportTrip } from '../backup';
import { addMember, removeMember, renameMember, setMemberActive, updateTrip } from '../store';
import type { TripData } from './Expenses';

export function Members({ data, onArchived }: { data: TripData; onArchived: () => void }) {
  const { trip, members } = data;
  const [name, setName] = useState('');

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
