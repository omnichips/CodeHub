import { useState } from 'react';
import { UpdatePrompt } from './pwa';
import { TripList } from './screens/TripList';
import { TripView } from './screens/TripView';

// Navigation is plain state, no URL router (avoids the iOS camera-stream bug on route change).
export function App() {
  const [tripId, setTripId] = useState<string | null>(null);
  return (
    <>
      <UpdatePrompt />
      {tripId ? <TripView tripId={tripId} onBack={() => setTripId(null)} /> : <TripList onOpen={setTripId} />}
    </>
  );
}
