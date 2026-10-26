import { useEffect, useState } from 'react';
import { Arena } from './Arena';
import { createHost, joinHost, playSolo, type Transport } from './peer';
import type { GamePlayer, GameSnapshot } from '../../shared/game';
import type { GameMode } from '../../shared/protocol';

type Lobby = GameSnapshot;

const MODE_NAMES: Record<GameMode, string> = { tag: 'Tag', gladiator: 'Gladiator', laser: 'Laser Shoot' };
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

  const connect = (action: 'create' | 'join' | 'solo') => {
    setError('');
    setBusy(true);
    try {
      const name = nickname.trim();
      if (name.length < 1 || name.length > 16) throw new Error('Nickname must be 1–16 characters.');
      const code = roomCode.trim().toUpperCase();
      if (action === 'join' && !code) throw new Error('Enter a room code to join.');
      const next = action === 'create' ? createHost(name, mode) : action === 'solo' ? playSolo(name, mode) : joinHost(code, name);
      next.onState(setLobby);
      next.onClose(() => { setTransport(null); setLobby(null); showError('Connection closed. The host may have left or the network may block PeerJS.'); });
      setTransport(next);
      setPending(action === 'create' ? 'Creating room…' : action === 'join' ? `Joining room ${code}…` : 'Starting solo match…');
      log(action === 'create' ? `Room created: ${next.id}` : action === 'join' ? `Connecting to room ${code}.` : 'Solo match with bots.');
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

  if (transport && !lobby) return <main className="screen"><section className="panel loading" aria-live="polite">
    <p className="eyebrow">PLEASE WAIT</p><div className="loader" aria-hidden="true"><span /><span /><span /></div>
    <h1>{pending}</h1><p className="hint">Connecting peer-to-peer. This usually takes a few seconds.</p>
    <button className="secondary" onClick={leave}>Cancel</button>
  </section></main>;
  if (lobby?.phase === 'results') return <Results state={lobby} onLeave={leave} />;
  if (lobby && lobby.phase !== 'lobby') return <Arena transport={transport!} state={lobby} onLeave={leave} />;

  if (lobby && transport) {
    const me = lobby.players.find((player) => player.id === transport.id);
    return <main className="screen"><section className="panel">
      <p className="eyebrow">ROOM CODE · {MODE_NAMES[lobby.mode].toUpperCase()}</p><h1>{lobby.roomId}</h1><p>Share this code with your friends.</p>
      <ul className="players">{lobby.players.map((player) => <li key={player.id}><span>{player.nickname}{player.isHost ? ' ★' : ''}</span><span className={player.ready ? 'ready' : ''}>{player.ready ? 'READY' : 'NOT READY'}</span></li>)}</ul>
      <button onClick={() => transport.send({ type: 'ready' })}>{me?.ready ? 'Cancel ready' : 'Ready up'}</button>
      {me?.isHost && <button disabled={lobby.players.length < 2 || lobby.players.some((player) => !player.ready)} onClick={() => transport.send({ type: 'start' })}>Start match</button>}
      <button className="secondary" onClick={leave}>Leave room</button>
      {error && <p className="error">{error}</p>}{error && <DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} />}
    </section></main>;
  }

  return <main className="screen"><section className="panel">
    <p className="eyebrow">MULTIPLAYER PIXEL ARENA</p><h1>Friend.io</h1><p>Make a room. Bring your friends. Try not to get tagged.</p>
    <label>Nickname<input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} placeholder="Player" /></label>
    <label>Game mode<select value={mode} onChange={(event) => setMode(event.target.value as GameMode)}>
      {Object.entries(MODE_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className="host-actions"><button disabled={busy} onClick={() => connect('create')}>Create room</button><button disabled={busy} onClick={() => connect('solo')}>Play solo</button></div>
    <div className="join"><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" /><button disabled={busy} onClick={() => connect('join')}>Join</button></div>
    {error && <p className="error">{error}</p>}{error && <DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} />}
    <p className="hint">Peer-to-peer room. The creator's browser hosts the match.</p>
  </section></main>;
}

function DiagnosticPanel({ diagnostics, onCopy }: { diagnostics: string[]; onCopy: () => void }) {
  return <details className="diagnostics"><summary>Show technical details</summary><pre>{diagnostics.join('\n')}</pre><button className="secondary" onClick={onCopy}>Copy error report</button></details>;
}

function Results({ state, onLeave }: { state: Lobby; onLeave: () => void }) {
  const ranking = [...state.players].sort((a, b) => state.mode === 'gladiator'
    ? Number(b.alive) - Number(a.alive) || b.eliminations - a.eliminations
    : state.mode === 'laser' ? b.kills - a.kills || a.deaths - b.deaths : a.itTime - b.itTime);
  return <main className="screen"><section className="panel"><p className="eyebrow">{state.mode.toUpperCase()} RESULTS</p><h1>Match over</h1><ol className="results">
    {ranking.map((player) => <li key={player.id}><span>{player.nickname}</span><span>{resultText(state.mode, player)}</span></li>)}
  </ol><button className="secondary" onClick={onLeave}>Leave room</button></section></main>;
}

function resultText(mode: string, player: GamePlayer) {
  return mode === 'gladiator' ? `${player.eliminations} KO${player.alive ? ' · ALIVE' : ''}` : mode === 'laser' ? `${player.kills} K / ${player.deaths} D` : `${player.itTime.toFixed(1)}s IT`;
}
