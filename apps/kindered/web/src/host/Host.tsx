import { useEffect, useReducer, useRef, useState } from 'react';
import { Engine } from '../../../shared/engine';
import { MODES } from '../../../shared/modes';
import { MAX_PLAYERS, PLAYER_COLORS } from '../../../shared/protocol';
import { CrtToggle } from '../crt/settings';
import { sfx, unlockSound } from '../crt/sound';
import { HostNet, errorReport, forgetShow, makeCode, savedShow, stayAwake } from '../net';
import { Diagnostics } from '../play/Play';
import { Avatar, Qr, useSecondsLeft } from '../ui';
import { SCENES } from './modes';

export function Host({ onBack }: { onBack: () => void }) {
  const [engine, setEngine] = useState<Engine>();
  const saved = useState(savedShow)[0];

  const begin = (e: Engine) => { unlockSound(); sfx.start(); void stayAwake(); setEngine(e); };
  if (engine) return <Show engine={engine} onQuit={() => { forgetShow(); setEngine(undefined); onBack(); }} />;

  // PRESS START: also the tap browsers require before any sound
  return <div className="bezel"><div className="screen center">
    <h1 className="logo glow">KINDERED</h1>
    <button className="btn primary press blink" onClick={() => begin(new Engine(makeCode(), Object.keys(MODES)[0]))}>PRESS START</button>
    {saved && saved.phase !== 'ended' && <button className="btn" onClick={() => begin(Engine.restore(saved, Date.now()))}>RESUME ROOM {saved.code}</button>}
    <div className="bar"><button className="chip" onClick={onBack}>◀ BACK</button><CrtToggle /></div>
  </div></div>;
}

function Show({ engine, onQuit }: { engine: Engine; onQuit: () => void }) {
  const [, render] = useReducer((n: number) => n + 1, 0);
  const net = useRef<HostNet>(undefined);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [roll, setRoll] = useState(0);

  useEffect(() => {
    const n = new HostNet(engine, render);
    net.current = n;
    return () => n.close();
  }, [engine]);

  const now = Date.now();
  const v = engine.hostView(now);
  const here = v.players.filter((p) => p.status === 'here').length;
  const [endsAt, setEndsAt] = useState<number>();
  useEffect(() => { setEndsAt(v.timeLeftMs === undefined ? undefined : performance.now() + v.timeLeftMs); }, [v.timeLeftMs === undefined, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const seconds = useSecondsLeft(endsAt);

  // sounds and the screen roll follow what changed
  const prev = useRef({ count: v.players.length, phase: v.phase });
  useEffect(() => {
    if (v.players.length > prev.current.count) sfx.join();
    if (v.players.length < prev.current.count) sfx.leave();
    if (v.phase !== prev.current.phase) { setRoll((r) => r + 1); if (v.phase === 'playing') sfx.start(); if (v.phase === 'ended') sfx.win(); }
    prev.current = { count: v.players.length, phase: v.phase };
  });
  useEffect(() => { if (seconds !== undefined && seconds <= 3 && seconds > 0) sfx.tick(); }, [seconds]);

  const joinUrl = `${location.origin}${location.pathname}?room=${v.code}`;
  const act = (fn: () => string | void) => { const err = fn(); setNotice(err ?? ''); if (err) sfx.buzz(); net.current?.update(); };
  const Scene = SCENES[engine.modeId]?.[v.scene.scene];

  return <div className="bezel"><div key={roll} className={`screen host ${roll ? 'roll' : 'power-on'}`}>
    <header className="bar">
      <span className="room-tag">ROOM <b className="glow">{v.code}</b></span>
      {seconds !== undefined && v.phase === 'playing' && <span className="countdown glow">{seconds}</span>}
      <span className="bar-actions">
        <CrtToggle />
        {document.fullscreenEnabled && <button className="chip" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}>FULLSCREEN</button>}
        <button className="chip" onClick={() => { if (confirm('End this room for everyone?')) onQuit(); }}>QUIT</button>
      </span>
    </header>

    {net.current?.status === 'failed' ? <div className="center">
      <h2 className="scene-title glow">NO SIGNAL</h2>
      <Diagnostics error={net.current.error} copied={copied} onCopy={() => { void navigator.clipboard?.writeText(errorReport()).then(() => setCopied(true)); }} />
      <button className="btn" onClick={onQuit}>NEW ROOM</button>
    </div> : v.phase === 'lobby' ? <div className="lobby">
      <section className="join-card">
        <p className="dim">{net.current?.status === 'open' ? 'JOIN ON YOUR PHONE' : 'OPENING ROOM…'}</p>
        <div className="big-code glow">{v.code}</div>
        <Qr text={joinUrl} size={200} />
        <p className="dim url">{location.host}{location.pathname}</p>
      </section>
      <section>
        <ul className="seats">{Array.from({ length: MAX_PLAYERS }, (_, i) => {
          const p = v.players[i];
          return <li key={p?.id ?? `empty-${i}`} className={p ? `seat ${p.status}` : 'seat empty'} style={p ? { ['--c' as string]: PLAYER_COLORS[p.color] } : undefined}>
            {p ? <><Avatar avatar={p.avatar} color={p.color} size={64} /><span>{p.name}</span>{p.status === 'away' && <small>AWAY</small>}</> : <span className="dim">· · ·</span>}
          </li>;
        })}</ul>
        <div className="start-row">
          <span className="dim">{v.mode}</span>
          <button className="btn primary" disabled={here < MODES[engine.modeId].minPlayers} onClick={() => act(() => engine.start(Date.now()))}>START</button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>
    </div> : <div className="stage">
      {Scene ? <Scene data={v.scene.data} players={v.players} /> : <p>Missing scene {v.scene.scene}</p>}
      {v.phase === 'ended' && <div className="start-row"><button className="btn primary" onClick={() => act(() => engine.reset())}>BACK TO LOBBY</button></div>}
      <ul className="roster">{v.players.filter((p) => p.status === 'away').map((p) => <li key={p.id} className="away">{p.name} is away</li>)}</ul>
    </div>}
  </div></div>;
}
