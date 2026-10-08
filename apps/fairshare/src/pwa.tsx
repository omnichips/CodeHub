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
const isSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
const installed = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;
const HINT_KEY = 'a2hs-dismissed'; // a per-viewer convenience, not trip data

const readDismissed = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

export function InstallHint() {
  const [hidden, setHidden] = useState(readDismissed);
  if (!isSafari || installed() || hidden) return null;
  return (
    <div className="banner" role="note">
      <span>To keep your trips safe, tap Share, then Add to Home Screen.</span>
      <button
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            /* storage blocked; hide for this session only */
          }
          setHidden(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

/** Ask the browser not to evict our storage. Safari may ignore it; the backup file is the real safety net. */
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => false);
