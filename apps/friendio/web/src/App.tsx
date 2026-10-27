import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Arena } from './Arena';
import { TitleBackdrop } from './TitleBackdrop';
import { LoadingKid } from './LoadingKid';
import { paintPlayerSprite } from './sprite';
import { createHost, findPublicRooms, joinHost, playSolo, type PublicRoom, type Transport } from './peer';
import { BLANK_AVATAR, inAvatarCircle, paintAvatar } from './avatar';
import type { GameSnapshot } from '../../shared/game';
import { rank, resultText } from './scoring';
import { AVATAR_COLORS, AVATAR_SIZE, maxPlayers, type GameMode } from '../../shared/protocol';

type Lobby = GameSnapshot;
type Screen = 'title' | 'modes' | 'create' | 'public';

const MODE_NAMES: Record<GameMode, string> = { tag: 'Tag', gladiator: 'Gladiator', laser: 'Laser Shoot' };
const MODE_BLURBS: Record<GameMode, string> = {
  tag: 'Green is IT. Tag someone to pass it on. IT runs a bit faster; sprint too long and you get winded. Dodge around the walls. Points for every second untagged, streak bonuses and a last-survivor bonus.',
  gladiator: 'Aim your spear and thrust. One hit knocks a player out. Last one standing wins.',
  laser: 'You only see what is in your cone. Aim, fire, respawn. Most kills wins.',
};
const MODE_MECHANICS: Record<GameMode, string[]> = {
  tag: ['WASD to move, mouse to look. On a phone, use the stick.', 'IT glows red and is a little faster. Touch someone to pass IT on.', 'Whoever just passed it glows blue and is safe for 1s.', 'SHIFT or SPRINT lasts 2s. Run the bar dry and you are slowed.', 'Walls block you. Click or SPACE pushes nearby players.', 'Score: +1 per second untagged, +5 per 10s streak, +10 for the longest streak at the end.'],
  gladiator: ['WASD to move, mouse to aim.', 'Click or SPACE thrusts your spear.', 'One hit knocks a player out.', 'Walls block movement, not spears. Last one standing wins.'],
  laser: ['WASD to move, mouse to aim.', 'You only see players inside your cone.', 'Click to fire. A hit takes a player out for 2s.', 'Most kills wins.'],
};
const CONNECT_TIMEOUT_MS = 20000;

export function App() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [transport, setTransport] = useState<Transport | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<GameMode>('tag');
  const [pending, setPending] = useState('');
  const [screen, setScreen] = useState<Screen>('title');
  const [isPublic, setIsPublic] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [multi, setMulti] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[] | null>(null);

  const log = (message: string) => setDiagnostics((entries) => [...entries, `${new Date().toISOString()} ${message}`].slice(-20));
  const showError = (message: string) => { setError(message); log(message); };

  useEffect(() => {
    const onError = (event: ErrorEvent) => log(`Browser error: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => log(`Unhandled promise rejection: ${String(event.reason)}`);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);

  const copyReport = async () => {
    const report = ['Friend.io error report', `Time: ${new Date().toISOString()}`, `Page: ${window.location.href}`,
      `Browser: ${navigator.userAgent}`, `Error: ${error || 'None'}`, 'Recent events:', ...diagnostics].join('\n');
    try { await navigator.clipboard.writeText(report); log('Diagnostic report copied to clipboard.'); }
    catch { showError('Could not copy the report. Select and copy the report text manually.'); }
  };

  const connect = (action: 'create' | 'join' | 'solo' | 'dummies', joinCode = roomCode) => {
    setError('');
    setBusy(true);
    try {
      const name = nickname.trim() || (action === 'dummies' ? 'Player' : '');
      if (name.length < 1 || name.length > 16) throw new Error('Nickname must be 1–16 characters.');
      const code = joinCode.trim().toUpperCase();
      if (action === 'join' && !code) throw new Error('Enter a room code to join.');
      const next = action === 'create' ? createHost(name, mode, isPublic) : action === 'solo' ? playSolo(name, mode)
        : action === 'dummies' ? playSolo(name, mode, true) : joinHost(code, name);
      next.onState(setLobby);
      next.onClose(() => { setTransport(null); setLobby(null); showError('Connection closed. The host may have left or the network may block PeerJS.'); });
      setTransport(next);
      setMulti(false);
      setPending(action === 'create' ? 'Creating room…' : action === 'join' ? `Joining room ${code}…` : 'Starting solo match…');
      log(action === 'create' ? `Room created: ${next.id}` : action === 'join' ? `Connecting to room ${code}.` : `Solo match with ${action === 'dummies' ? 'dummies' : 'bots'}.`);
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const leave = () => { transport?.onClose(() => {}); transport?.close(); setTransport(null); setLobby(null); };

  useEffect(() => {
    if (!transport || lobby) return;
    const timeout = window.setTimeout(() => {
      leave();
      showError(transport.isHost ? 'Could not reach the matchmaking server. Check your connection and try again.' : 'Could not reach that room. Check the code and make sure the host is still in the lobby.');
    }, CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [transport, lobby]);

  const scanRooms = () => {
    setPublicRooms(null);
    findPublicRooms().then(setPublicRooms);
  };
  useEffect(() => { if (screen === 'public' && !transport) scanRooms(); }, [screen, transport]);

  if (transport && !lobby) return <main className="screen sketch"><section className="panel loading" aria-live="polite">
    <h1 className="crayon-title">{pending}</h1><LoadingKid />
    <p className="hint">Connecting peer-to-peer. This usually takes a few seconds.</p>
    <button className="secondary" onClick={leave}>Cancel</button>
  </section></main>;
  if (lobby?.phase === 'results') return <Results state={lobby} onLeave={leave} />;
  if (lobby && lobby.phase !== 'lobby') return <Arena transport={transport!} state={lobby} onLeave={leave} />;

  if (lobby && transport) {
    const me = lobby.players.find((player) => player.id === transport.id);
    return <main className="screen"><section className="panel">
      <p className="eyebrow">ROOM CODE · {MODE_NAMES[lobby.mode].toUpperCase()} · {lobby.players.length}/{maxPlayers(lobby.mode)}</p><h1>{lobby.roomId}</h1><p>Share this code with your friends.</p>
      <AvatarEditor initial={me?.avatar || BLANK_AVATAR} onChange={(avatar) => transport.send({ type: 'avatar', avatar })} />
      <ul className="players">{lobby.players.map((player) => <li key={player.id}><span className="who"><AvatarPreview avatar={player.avatar} color={player.color} />{player.nickname}{player.isHost ? ' ★' : ''}</span><span className={player.ready ? 'ready' : ''}>{player.ready ? 'READY' : 'NOT READY'}</span></li>)}</ul>
      <button onClick={() => transport.send({ type: 'ready' })}>{me?.ready ? 'Cancel ready' : 'Ready up'}</button>
      {me?.isHost && <button disabled={lobby.players.length < 2 || lobby.players.some((player) => !player.ready)} onClick={() => transport.send({ type: 'start' })}>Start match</button>}
      <button className="secondary" onClick={leave}>Leave room</button>
      {error && <p className="error">{error}</p>}{error && <DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} />}
    </section></main>;
  }

  const errorBlock = error && <><p className="error">{error}</p><DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} /></>;
  const nicknameField = <label>Nickname<input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} placeholder="Player" /></label>;
  // hidden practice option: stationary dummies in the selected mode
  const dummies = <button className="dummy-link" disabled={busy} aria-label="Practice against stationary dummies" onClick={() => connect('dummies')}>dummies</button>;

  if (screen === 'title') return <main className="screen title-screen"><TitleBackdrop /><section className="title-block">
    <p className="eyebrow">MULTIPLAYER PIXEL ARENA</p><h1 className="title">Friend.io</h1>
    <button className="start" onClick={() => setScreen('modes')}>START</button>
  </section>{dummies}</main>;

  if (screen === 'modes') return <main className="screen sketch"><section className="panel wide">
    <p className="eyebrow">CHOOSE A GAME MODE</p><h1>Pick a game</h1>
    <div className="mode-grid">{(Object.keys(MODE_NAMES) as GameMode[]).map((value) =>
      <button key={value} className="mode-card" onClick={() => { setMode(value); setFlipped(false); setScreen('create'); }}>
        <ModeArt mode={value} /><strong>{MODE_NAMES[value]}</strong><span>{MODE_BLURBS[value]}</span><em>Up to {maxPlayers(value)} players</em>
      </button>)}</div>
    <button className="secondary" onClick={() => setScreen('public')}>Public rooms near you</button>
    <button className="secondary" onClick={() => setScreen('title')}>Back</button>
    {errorBlock}
  </section>{dummies}</main>;

  if (screen === 'public') return <main className="screen sketch"><section className="panel">
    <p className="eyebrow">SAME TIME ZONE AS YOU</p><h1>Public rooms</h1>
    {nicknameField}
    {publicRooms === null ? <div className="loader" aria-label="Searching for rooms"><span /><span /><span /></div>
      : publicRooms.length === 0 ? <p className="hint">No open rooms nearby right now. Make one and set it to public.</p>
      : <ul className="players">{publicRooms.map((room) => <li key={room.code}>
        <span>{MODE_NAMES[room.mode]} · {room.host}<br />{room.players}/{room.max} players</span>
        <button className="join-room" disabled={busy} onClick={() => connect('join', room.code)}>Join</button>
      </li>)}</ul>}
    <button className="secondary" disabled={publicRooms === null} onClick={scanRooms}>Refresh</button>
    <button className="secondary" onClick={() => setScreen('modes')}>Back</button>
    {errorBlock}
  </section>{dummies}</main>;

  return <main className="screen sketch"><section className="panel">
    <h1 className="crayon-title">{MODE_NAMES[mode]}</h1>
    <button className={`flip${flipped ? ' flipped' : ''}`} aria-pressed={flipped} aria-label="Show how this mode works" onClick={() => setFlipped(!flipped)}>
      <span className="flip-inner">
        <span className="flip-face flip-front"><ModeArt mode={mode} /><em>TAP FOR HOW TO PLAY</em></span>
        <span className="flip-face flip-back"><ul>{MODE_MECHANICS[mode].map((line) => <li key={line}>{line}</li>)}</ul></span>
      </span>
    </button>
    {nicknameField}
    <div className="mode-actions"><button disabled={busy} onClick={() => connect('solo')}>Play solo</button><button disabled={busy} onClick={() => setMulti(true)}>Multiplayer</button></div>
    <button className="secondary" onClick={() => setScreen('modes')}>Back</button>
    {!multi && errorBlock}
    {multi && <div className="modal-backdrop" onClick={() => setMulti(false)}><div className="modal" role="dialog" aria-label="Multiplayer" onClick={(event) => event.stopPropagation()}>
      <h2>Multiplayer</h2>
      <button disabled={busy} onClick={() => connect('create')}>Create a room</button>
      <label className="check"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />Public: show in nearby rooms</label>
      <p className="hint">or join with a code</p>
      <div className="code-field"><input value={roomCode} autoFocus onChange={(event) => setRoomCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter' && roomCode.trim()) connect('join'); }} placeholder="ROOM CODE" />
        {roomCode.trim() && <button disabled={busy} onClick={() => connect('join')}>Join</button>}</div>
      <button className="secondary" onClick={() => setMulti(false)}>Close</button>
      {errorBlock}
      <p className="hint">Peer-to-peer. The creator's browser hosts the match.</p>
    </div></div>}
  </section>{dummies}</main>;
}

// wobbly closed shape, like a circle drawn by hand
const wobble = (cx: number, cy: number, r: number, seed: number) => Array.from({ length: 14 }, (_, index) => {
  const angle = index / 14 * Math.PI * 2, reach = r * (1 + 0.1 * Math.sin(index * 2.7 + seed));
  return `${(cx + Math.cos(angle) * reach).toFixed(1)},${(cy + Math.sin(angle) * reach).toFixed(1)}`;
}).join(' ');

// Crayon doodles on paper: hatched fills, double-traced outlines, crisp (pixelated) edges.
function ModeArt({ mode }: { mode: GameMode }) {
  const crayon = { fill: 'none', strokeWidth: 1.4, strokeLinejoin: 'round' as const };
  const kid = (cx: number, cy: number, color: string, hatch: string, seed: number) => <>
    <polygon points={wobble(cx, cy, 8, seed)} {...crayon} fill={`url(#${hatch})`} stroke={color} />
    <polygon points={wobble(cx + 0.6, cy - 0.4, 8.4, seed + 1)} stroke={color} {...crayon} strokeWidth={0.8} />
    <rect x={cx - 3} y={cy - 2} width="1.6" height="1.6" fill="#2b2a3a" /><rect x={cx + 1.6} y={cy - 2} width="1.6" height="1.6" fill="#2b2a3a" />
  </>;
  return <svg className="mode-art" viewBox="0 0 120 64" aria-hidden="true" shapeRendering="crispEdges">
    <defs>
      {[['red', '#d8403a'], ['blue', '#3a5aa8'], ['yellow', '#e0a020'], ['green', '#3a8a3a'], ['brown', '#8a5a30'], ['sky', '#5bb0e0']].map(([name, color]) =>
        <pattern key={name} id={`hatch-${name}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.4" height="3" fill={color} /></pattern>)}
    </defs>
    <rect width="120" height="64" fill="#fffaf0" />
    {mode === 'tag' && <>
      <polygon points="8,40 12,22 14,38 22,30 20,44" {...crayon} fill="url(#hatch-green)" stroke="#3a8a3a" />
      <rect x="88" y="38" width="22" height="12" {...crayon} fill="url(#hatch-brown)" stroke="#8a5a30" />
      <polygon points={wobble(40, 36, 14, 3)} stroke="#d8403a" {...crayon} strokeDasharray="3 2" />
      {kid(40, 36, '#d8403a', 'hatch-red', 1)}
      <path d="M53 33 L57 36 L53 39 M60 33 L64 36 L60 39" stroke="#8a8a96" {...crayon} />
      {kid(80, 26, '#3a5aa8', 'hatch-blue', 5)}
      <path d="M94 22 L104 22 M95 27 L106 27 M94 32 L102 32" stroke="#3a5aa8" {...crayon} />
      <text x="26" y="16" fontSize="7" fill="#d8403a" transform="rotate(-8 26 16)">TAG!</text>
    </>}
    {mode === 'gladiator' && <>
      {kid(32, 34, '#e0a020', 'hatch-yellow', 2)}
      <path d="M41 33 L74 30 M70 26 L78 30 L71 34" stroke="#8a5a30" {...crayon} strokeWidth={1.8} />
      {kid(88, 34, '#d8403a', 'hatch-red', 6)}
      <path d="M84 30 L87 33 M87 30 L84 33 M89 30 L92 33 M92 30 L89 33" stroke="#2b2a3a" {...crayon} />
      <path d="M80 18 L82 22 M86 14 L86 19 M92 18 L90 22" stroke="#e0a020" {...crayon} />
      <text x="70" y="58" fontSize="6" fill="#d8403a" transform="rotate(4 70 58)">BONK</text>
    </>}
    {mode === 'laser' && <>
      <polygon points="30,32 108,10 108,54" {...crayon} fill="url(#hatch-sky)" stroke="#5bb0e0" strokeDasharray="4 2" />
      {kid(26, 32, '#e0a020', 'hatch-yellow', 4)}
      <path d="M36 32 L46 29 L54 34 L64 30 L72 33 L82 31" stroke="#d8403a" {...crayon} strokeWidth={1.6} />
      {kid(92, 32, '#d8403a', 'hatch-red', 8)}
      <text x="78" y="16" fontSize="6" fill="#3a5aa8" transform="rotate(-6 78 16)">ZAP</text>
    </>}
  </svg>;
}

function AvatarPreview({ avatar, color }: { avatar: string; color: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (canvas.current) paintPlayerSprite(canvas.current, { color, avatar, frame: 0 }); }, [avatar, color]);
  return <canvas className="avatar-preview" ref={canvas} aria-hidden="true" />;
}

function AvatarEditor({ initial, onChange }: { initial: string; onChange: (avatar: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [avatar, setAvatar] = useState(initial);
  const [color, setColor] = useState(3);
  const painting = useRef(false);
  const latest = useRef(avatar);
  latest.current = avatar;
  useEffect(() => { if (canvas.current) paintAvatar(canvas.current, avatar, '#3a3157'); }, [avatar]);
  const paint = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - box.left) / box.width * AVATAR_SIZE);
    const y = Math.floor((event.clientY - box.top) / box.height * AVATAR_SIZE);
    const index = y * AVATAR_SIZE + x;
    if (x < 0 || y < 0 || x >= AVATAR_SIZE || y >= AVATAR_SIZE || !inAvatarCircle(index)) return;
    latest.current = latest.current.slice(0, index) + color + latest.current.slice(index + 1);
    setAvatar(latest.current);
  };
  const finish = () => { if (painting.current) { painting.current = false; onChange(latest.current); } };
  return <div className="avatar-editor">
    <canvas ref={canvas} className="avatar-canvas" aria-label="Draw your avatar, seen from above"
      onPointerDown={(event) => { painting.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event); }}
      onPointerMove={paint} onPointerUp={finish} onPointerCancel={finish} />
    <div className="palette">
      {AVATAR_COLORS.map((swatch, index) => <button key={swatch} aria-label={`Colour ${index + 1}`} className={color === index + 1 ? 'picked' : ''}
        style={{ background: swatch }} onClick={() => setColor(index + 1)} />)}
      <button className={color === 0 ? 'picked eraser' : 'eraser'} onClick={() => setColor(0)}>ERASE</button>
      <button className="eraser" onClick={() => { setAvatar(BLANK_AVATAR); onChange(BLANK_AVATAR); }}>CLEAR</button>
    </div>
    <p className="hint">Draw your head from above, the way it shows in game. The top is the way you face.</p>
  </div>;
}

function DiagnosticPanel({ diagnostics, onCopy }: { diagnostics: string[]; onCopy: () => void }) {
  return <details className="diagnostics"><summary>Show technical details</summary><pre>{diagnostics.join('\n')}</pre><button className="secondary" onClick={onCopy}>Copy error report</button></details>;
}

function Results({ state, onLeave }: { state: Lobby; onLeave: () => void }) {
  return <main className="screen"><section className="panel"><p className="eyebrow">{state.mode.toUpperCase()} RESULTS</p><h1>Match over</h1><ol className="results">
    {rank(state).map((player) => <li key={player.id}><span>{player.nickname}</span><span>{resultText(state.mode, player)}</span></li>)}
  </ol><button className="secondary" onClick={onLeave}>Leave room</button></section></main>;
}
