import { useEffect, useState } from 'react';
import { useTripData } from '../hooks';
import { useTripPhotos } from '../photos';
import { Cover } from './TripList';
import { Expenses } from './Expenses';
import { Members } from './Members';
import { SettleUp } from './SettleUp';
import { Sync } from './Sync';

const TABS = [
  ['expenses', 'Expenses'],
  ['settle', 'Settle up'],
  ['members', 'Members'],
  ['sync', 'Sync'],
] as const;

export function TripView({ tripId, onBack }: { tripId: string; onBack: () => void }) {
  const data = useTripData(tripId);
  const photos = useTripPhotos();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('expenses');
  const gone = data === null;
  useEffect(() => {
    if (gone) onBack();
  }, [gone, onBack]);
  if (!data) return null;
  const names = Object.fromEntries(data.members.map((m) => [m.id, m.name]));

  return (
    <div className="app">
      <header className="bar">
        <button onClick={onBack} aria-label="Back to trips">‹ Trips</button>
        <Cover url={photos[tripId]} tripId={tripId} className="avatar" />
        <h1>{data.trip.name}</h1>
      </header>
      <main className="screen" key={tab}>
        {tab === 'expenses' && <Expenses data={data} names={names} goMembers={() => setTab('members')} />}
        {tab === 'settle' && <SettleUp data={data} names={names} />}
        {tab === 'members' && <Members data={data} photo={photos[tripId]} onArchived={onBack} />}
        {tab === 'sync' && <Sync data={data} />}
      </main>
      <nav className="tabbar">
        {TABS.map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <p className="saved">Saved on this device</p>
    </div>
  );
}
