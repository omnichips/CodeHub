import { useEffect, useRef, useState } from 'react';
import { BLANK_AVATAR, NAME_MAX, PLAYER_COLORS, ROOM_ALPHABET, ROOM_CODE_LENGTH, cleanName, isAvatar, type PhoneState } from '../../../shared/protocol';
import { CrtToggle } from '../crt/settings';
import { PhoneNet, errorReport, stayAwake } from '../net';
import { Avatar, AvatarEditor, useSecondsLeft } from '../ui';
import { Widgets } from './Widgets';

const ME_KEY = 'kindered.me';
type Me = { name: string; avatar: string };
const loadMe = (): Me => {
  try { const m = JSON.parse(localStorage.getItem(ME_KEY) ?? '{}'); return { name: cleanName(m.name), avatar: isAvatar(m.avatar) ? m.avatar : BLANK_AVATAR }; }
  catch { return { name: '', avatar: BLANK_AVATAR }; }
};
const saveMe = (me: Me) => { try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch { /* private mode */ } };
const hasSeat = (code: string) => { try { return !!localStorage.getItem(`kindered.seat.${code}`); } catch { return false; } };
const cleanCode = (v: string) => [...v.toUpperCase()].filter((c) => ROOM_ALPHABET.includes(c)).join('').slice(0, ROOM_CODE_LENGTH);

export function Play({ initialCode, onBack }: { initialCode: string; onBack: () => void }) {
  const [me, setMe] = useState(loadMe);
  const [code, setCode] = useState(cleanCode(initialCode));
  // a phone that already has a seat in this room (e.g. after a reload) goes straight back in
  const [joined, setJoined] = useState(() => code.length === ROOM_CODE_LENGTH && !!me.name && hasSeat(code));

  if (!joined) {
    const ok = code.length === ROOM_CODE_LENGTH && !!cleanName(me.name);
    return <main className="phone">
      <header className="bar"><button className="chip" onClick={onBack}>◀ BACK</button><CrtToggle /></header>
      <h1 className="title glow">JOIN</h1>
      <form className="join" onSubmit={(e) => { e.preventDefault(); if (ok) { const m = { ...me, name: cleanName(me.name) }; saveMe(m); setMe(m); setJoined(true); } }}>
        <label>ROOM CODE
          <input value={code} onChange={(e) => setCode(cleanCode(e.target.value))} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD" className="code-input" />
        </label>
        <label>NAME
          <input value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value.slice(0, NAME_MAX) })} autoComplete="nickname" placeholder="Your name" maxLength={NAME_MAX} />
        </label>
        <span className="label">FACE</span>
        <AvatarEditor value={me.avatar} onChange={(avatar) => setMe({ ...me, avatar })} />
        <button className="btn primary" disabled={!ok}>PLAY</button>
      </form>
    </main>;
  }
  return <Seat code={code} me={me} setMe={(m) => { setMe(m); saveMe(m); }} onLeave={() => setJoined(false)} />;
}

function Seat({ code, me, setMe, onLeave }: { code: string; me: Me; setMe: (m: Me) => void; onLeave: () => void }) {
  const net = useRef<PhoneNet>(undefined);
  const [state, setState] = useState<PhoneState>();
  const [endsAt, setEndsAt] = useState<number>();
  const [color, setColor] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'lost'>('connecting');
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState('');
  const [copied, setCopied] = useState(false);
  const seconds = useSecondsLeft(endsAt);

  useEffect(() => {
    const n = new PhoneNet(code, me.name, me.avatar, {
      welcome: (_id, c) => setColor(c),
      state: (s, at) => { setState(s); setEndsAt(at); },
      reject: setRejected,
      status: (s, err) => { setStatus(s); setError(err ?? ''); },
    });
    net.current = n;
    void stayAwake();
    return () => n.close();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // avatar edits in the lobby go to the host, at most a few per second
  useEffect(() => {
    const t = window.setTimeout(() => net.current?.setAvatar(me.avatar), 300);
    return () => window.clearTimeout(t);
  }, [me.avatar]);

  if (rejected) return <main className="phone center">
    <h1 className="title glow">NOPE</h1><p>{rejected}</p>
    <button className="btn primary" onClick={onLeave}>BACK</button>
  </main>;

  if (!state) return <main className="phone center">
    <h1 className="title glow blink">{status === 'lost' ? 'NO SIGNAL' : 'TUNING IN'}</h1>
    <p>Room {code}</p>
    {error && <Diagnostics error={error} copied={copied} onCopy={() => { void navigator.clipboard?.writeText(errorReport()).then(() => setCopied(true)); }} />}
    <button className="btn" onClick={onLeave}>BACK</button>
  </main>;

  const self = state.players.find((p) => p.id === state.me);
  return <main className="phone" style={{ ['--me' as string]: PLAYER_COLORS[color] }}>
    <header className="bar">
      <span className="me"><Avatar avatar={me.avatar} color={color} size={28} />{me.name}</span>
      <span className={`dot ${status}`} aria-label={status}>{status === 'connected' ? 'LIVE' : 'RECONNECTING'}</span>
    </header>
    {seconds !== undefined && state.phase === 'playing' && <div className="countdown glow" aria-live="off">{seconds}</div>}
    {state.phase === 'lobby' ? <>
      <p className="w-wait">You're in! Waiting for the host to start.</p>
      <AvatarEditor value={me.avatar} onChange={(avatar) => setMe({ ...me, avatar })} />
      <ul className="roster small">{state.players.map((p) =>
        <li key={p.id} className={p.status}><Avatar avatar={p.id === self?.id ? me.avatar : p.avatar} color={p.color} size={24} />{p.name}</li>)}</ul>
      <footer className="bar"><CrtToggle /><button className="chip" onClick={onLeave}>LEAVE</button></footer>
    </> : <Widgets widgets={state.widgets} send={(widget, value, fast) => net.current?.send({ t: 'input', widget, value }, fast)} />}
  </main>;
}

export function Diagnostics({ error, copied, onCopy }: { error: string; copied: boolean; onCopy: () => void }) {
  return <div className="diag" role="alert">
    <p>{error}</p>
    <button className="chip" onClick={onCopy}>{copied ? 'COPIED' : 'COPY ERROR REPORT'}</button>
  </div>;
}
