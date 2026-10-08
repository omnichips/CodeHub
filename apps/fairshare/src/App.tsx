import { useState } from 'react';
import { flushSync } from 'react-dom';
import { UpdatePrompt } from './pwa';
import { TripList } from './screens/TripList';
import { TripView } from './screens/TripView';

type Doc = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

/** Resolves once the next screen has drawn: at once, since screens show a loading screen until their data is in. */
const drawn = () =>
  new Promise<void>((done) => {
    const until = performance.now() + 400;
    const check = () => (document.querySelector('.app') || performance.now() > until ? done() : requestAnimationFrame(check));
    check();
  });

// Navigation is plain state, no URL router (avoids the iOS camera-stream bug on route change).
export function App() {
  const [tripId, setTripId] = useState<string | null>(null);
  // Opening and closing a trip is animated with a view transition (Safari 18+): the screen slides and the trip's
  // cover photo glides between its card and the trip's header. Without support, or with Reduce Motion, it just switches.
  const go = (id: string | null) => {
    const doc = document as Doc;
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return setTripId(id);
    const root = document.documentElement;
    root.dataset.nav = id ? 'forward' : 'back'; // picks the slide direction in styles.css; removed when done
    doc
      .startViewTransition(async () => {
        flushSync(() => setTripId(id));
        await drawn();
      })
      .finished.finally(() => delete root.dataset.nav);
  };
  return (
    <>
      <UpdatePrompt />
      {tripId ? <TripView tripId={tripId} onBack={() => go(null)} /> : <TripList onOpen={go} />}
    </>
  );
}
