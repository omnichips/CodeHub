import { useEffect, useState } from 'react';
import { applyCrt, CrtToggle } from './crt/settings';
import { Host } from './host/Host';
import { Play } from './play/Play';

type InstallEvent = Event & { prompt: () => Promise<void> };
const params = new URLSearchParams(location.search);
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;

export function App() {
  const [view, setView] = useState<'home' | 'host' | 'play'>(params.has('room') ? 'play' : params.has('host') ? 'host' : 'home');
  const [install, setInstall] = useState<InstallEvent>();

  useEffect(() => applyCrt(view === 'host' ? 'full' : 'light'), [view]);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    addEventListener('beforeinstallprompt', on);
    return () => removeEventListener('beforeinstallprompt', on);
  }, []);

  const go = (v: typeof view) => {
    history.replaceState(null, '', location.pathname + (v === 'host' ? '?host' : ''));
    setView(v);
  };

  return <div className="crt">
    {view === 'host' ? <Host onBack={() => go('home')} />
      : view === 'play' ? <Play initialCode={params.get('room') ?? ''} onBack={() => go('home')} />
      : <main className="phone center home">
        <h1 className="logo glow">KINDERED</h1>
        <p className="dim">Party games. One big screen, everyone plays on their phone.</p>
        <button className="btn primary" onClick={() => go('play')}>JOIN A GAME</button>
        <button className="btn" onClick={() => go('host')}>HOST ON THIS SCREEN</button>
        <p className="dim small">Host on a laptop or TV. Up to 8 phones join with the room code.</p>
        {!installed && (install
          ? <button className="chip" onClick={() => void install.prompt().then(() => setInstall(undefined))}>INSTALL APP</button>
          : isIos && <p className="dim small">To install: tap Share, then Add to Home Screen.</p>)}
        <CrtToggle />
      </main>}
  </div>;
}
