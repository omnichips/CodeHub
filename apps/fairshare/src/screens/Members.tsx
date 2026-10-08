import { useState } from 'react';
import { addMember, removeMember, renameMember, setMemberActive } from '../store';
import type { TripData } from './Expenses';

export function Members({ data }: { data: TripData }) {
  const { trip, members } = data;
  const [adding, setAdding] = useState(false);

  return (
    <>
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
      <div className="fab-space" />
      <button className="fab-add fab-member" aria-label="New member" onClick={() => setAdding(true)}>
        <span aria-hidden="true">+</span>
      </button>
      {adding && <NewMemberSheet tripId={trip.id} onClose={() => setAdding(false)} />}
    </>
  );
}

function NewMemberSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="New member">
      <header className="bar">
        <button onClick={onClose}>Cancel</button>
        <h1>New member</h1>
      </header>
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await addMember(tripId, name);
          onClose();
        }}
      >
        <label>
          Member name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <button className="primary" disabled={!name.trim()}>Add member</button>
      </form>
    </div>
  );
}
