import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker; returns a function that applies the update once a new version is waiting. */
function useUpdate() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    const update = registerSW({ onNeedRefresh: () => setApply(() => () => void update(true)) });
  }, []);
  return apply;
}

export function UpdatePrompt() {
  const apply = useUpdate();
  if (!apply) return null;
  return (
    <div className="banner" role="status">
      <span>A new version is ready.</span>
      <button className="primary" onClick={apply}>Reload</button>
    </div>
  );
}

// Safari only keeps script-written storage past 7 idle days once the app is on the Home Screen.
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
const installed = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
const HINT_KEY = 'a2hs-dismissed'; // a per-viewer convenience, not trip data

const readDismissed = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

// Chrome and Edge (Android, desktop) let a page offer the install dialog itself. iPhone browsers cannot: Apple gives
// pages no way to do it, so there the steps are shown instead. The event can fire before React mounts, so it is caught here.
type InstallEvent = Event & { prompt: () => Promise<void> };
let offer: InstallEvent | null = null;
const listeners = new Set<() => void>();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  offer = e as InstallEvent;
  listeners.forEach((l) => l());
});
addEventListener('appinstalled', () => {
  offer = null;
  listeners.forEach((l) => l());
});

function useOffer() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return offer;
}

/** True on a phone browser where the app is not yet on the Home Screen. */
export const canInstall = () => (isIOS || isAndroid) && !installed();

const isSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

/** The reason, plus either the one-tap Install button or the steps for this phone. */
export function InstallSteps({ onInstalled }: { onInstalled?: () => void }) {
  const event = useOffer();
  return (
    <>
      <p>
        FairsHare works best installed on your phone: it opens full screen, loads faster, works offline, and your trips are far less likely to be cleared by the browser.
      </p>
      {event ? (
        <button className="primary" onClick={() => void event.prompt().then(onInstalled)}>Install FairsHare</button>
      ) : isIOS ? (
        <ol>
          <li>
            Tap the <strong>Share</strong> button (a square with an arrow){' '}
            {isSafari ? 'at the bottom of the screen.' : 'in the address bar. (Safari works too: Share is at the bottom.)'}
          </li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Open FairsHare from its new icon.</li>
        </ol>
      ) : (
        <ol>
          <li>Tap the <strong>⋮</strong> menu at the top right of your browser.</li>
          <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
          <li>Tap <strong>Install</strong>. Open FairsHare from its new icon.</li>
        </ol>
      )}
    </>
  );
}

export function InstallHint() {
  const [hidden, setHidden] = useState(readDismissed);
  const [open, setOpen] = useState(false);
  const event = useOffer();
  if (!canInstall() || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* storage blocked; hide for this session only */
    }
    setHidden(true);
  };
  return (
    <div className="banner install" role="note">
      <strong>For a better experience, add FairsHare to your Home Screen.</strong>
      {(open || event) && <InstallSteps onInstalled={dismiss} />}
      <div className="two">
        {!event && <button className="primary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide steps' : 'Show me how'}</button>}
        <button onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}

/** Ask the browser not to evict our storage. Safari may ignore it; the backup file is the real safety net. */
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => false);
