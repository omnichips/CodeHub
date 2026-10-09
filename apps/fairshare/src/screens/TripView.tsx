import { useEffect, useState } from 'react';
import { useTripData } from '../hooks';
import { useTripPhotos } from '../photos';
import { BunnyLoader } from '../ui';
import { Cover } from './TripGrid';
import { Expenses } from './Expenses';
import { Members } from './Members';
import { Others } from './Others';
import { SettleUp } from './SettleUp';

const TABS = [
  ['expenses', 'Expenses'],
  ['settle', 'Settle up'],
  ['members', 'Members'],
  ['others', 'Others'],
] as const;

export function TripView({ tripId, onBack }: { tripId: string; onBack: () => void }) {
  const data = useTripData(tripId);
  const photos = useTripPhotos();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('expenses');
  const gone = data === null;
  useEffect(() => {
    if (gone) onBack();
  }, [gone, onBack]);
  if (!data)
    return (
      <div className="app">
        <header className="bar">
          <button className="back" onClick={onBack} aria-label="Back to trips">‹</button>
        </header>
        <BunnyLoader label="Opening trip…" />
      </div>
    );
  const names = Object.fromEntries(data.members.map((m) => [m.id, m.name]));

  return (
    <div className="app">
      <header className="bar trip-bar">
        <button className="back" onClick={onBack} aria-label="Back to trips">‹</button>
        <h1>{data.trip.name}</h1>
        <Cover url={photos[tripId]} tripId={tripId} className="avatar" />
      </header>
      <main className="screen" key={tab}>
        {tab === 'expenses' && <Expenses data={data} names={names} goMembers={() => setTab('members')} />}
        {tab === 'settle' && <SettleUp data={data} names={names} />}
        {tab === 'members' && <Members data={data} />}
        {tab === 'others' && <Others data={data} photo={photos[tripId]} onArchived={onBack} />}
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
