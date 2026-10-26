import { useEffect, useState } from 'react';
import { Client, Room } from '@colyseus/sdk';
import { Arena } from './Arena';

type Player = { id: string; nickname: string; ready: boolean; isHost: boolean; x: number; y: number; isIt: boolean; sprint: number; stun: number; pushCooldown: number; itTime: number; spearAngle: number; spearTimer: number; alive: boolean; eliminations: number; aimAngle: number; fireCooldown: number; respawn: number; kills: number; deaths: number };
type Lobby = { roomId: string; players: Player[]; phase: 'lobby' | 'countdown' | 'active' | 'results'; countdown: number; timeRemaining: number; mode: 'tag' | 'gladiator' | 'laser' };

const serverUrl = import.meta.env.VITE_GAME_SERVER_URL || 'ws://localhost:2567';

export function App() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<Room<Lobby> | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [disconnectedRoom, setDisconnectedRoom] = useState<{ client: Client; token: string } | null>(null);

  const log = (message: string) => {
    setDiagnostics((entries) => [...entries, `${new Date().toISOString()} ${message}`].slice(-20));
  };

  useEffect(() => {
    const onError = (event: ErrorEvent) => log(`Browser error: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => log(`Unhandled promise rejection: ${String(event.reason)}`);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const showError = (message: string) => {
    setError(message);
    log(message);
  };

  const copyReport = async () => {
    const report = [
      'Friend.io error report',
      `Time: ${new Date().toISOString()}`,
      `Page: ${window.location.href}`,
      `Server: ${serverUrl}`,
      `Browser: ${navigator.userAgent}`,
      `Error: ${error || 'None'}`,
      'Recent events:',
      ...(diagnostics.length ? diagnostics : ['None']),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(report);
      log('Diagnostic report copied to clipboard.');
    } catch {
      showError('Could not copy the report. Select and copy the report text manually.');
    }
  };

  const connect = async (action: 'create' | 'join') => {
    setError('');
    log(`Attempting to ${action} a room.`);
    setBusy(true);
    try {
      const name = nickname.trim();
      if (name.length < 1 || name.length > 16) throw new Error('Nickname must be 1–16 characters.');
      const client = new Client(serverUrl);
      const joined = action === 'create'
        ? await client.create<Lobby>('lobby', { nickname: name })
        : await client.joinOrCreate<Lobby>('lobby', { roomCode: roomCode.trim().toUpperCase(), nickname: name });
      setRoom(joined);
      log(`Connected to room ${joined.roomId}.`);
      joined.onStateChange((state) => setLobby({ ...state, players: [...state.players.values()] }));
      joined.onLeave(() => {
        setDisconnectedRoom({ client, token: joined.reconnectionToken });
        setRoom(null);
        setLobby(null);
        showError('Connection closed. You can try joining again.');
      });
      joined.onError((code, message) => showError(`Connection error ${code}: ${message}`));
    } catch (reason) {
      showError(reason instanceof Error ? `${reason.name}: ${reason.message}` : `Could not connect to the room server: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleReady = () => room?.send('ready');

  const reconnect = async () => {
    if (!disconnectedRoom) return;
    setBusy(true);
    setError('');
    log('Attempting to reconnect to the previous room.');
    try {
      const joined = await disconnectedRoom.client.reconnect<Lobby>(disconnectedRoom.token);
      setRoom(joined);
      setDisconnectedRoom(null);
      log(`Reconnected to room ${joined.roomId}.`);
      joined.onStateChange((state) => setLobby({ ...state, players: [...state.players.values()] }));
      joined.onLeave(() => {
        setRoom(null);
        setLobby(null);
        setDisconnectedRoom({ client: disconnectedRoom.client, token: joined.reconnectionToken });
        showError('Connection closed again.');
      });
      joined.onError((code, message) => showError(`Connection error ${code}: ${message}`));
    } catch (reason) {
      showError(reason instanceof Error ? `Reconnect failed: ${reason.message}` : `Reconnect failed: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  if (lobby?.phase === 'results') {
    return <Results state={lobby} onLeave={() => room?.leave()} />;
  }

  if (lobby && lobby.phase !== 'lobby') {
    return <Arena room={room!} state={lobby} onLeave={() => room?.leave()} />;
  }

  if (lobby) {
    const me = lobby.players.find((player) => player.id === room?.sessionId);
    return (
      <main className="screen">
        <section className="panel">
          <p className="eyebrow">ROOM CODE</p>
          <h1>{lobby.roomId}</h1>
          <p>Share this code with your friends.</p>
          <label>
            Mode
            <select disabled={!me?.isHost} value={lobby.mode} onChange={(event) => room?.send('mode', event.target.value)}>
              <option value="tag">Tag</option>
              <option value="gladiator">Gladiator</option>
              <option value="laser">Laser Shoot</option>
            </select>
          </label>
          <ul className="players">
            {lobby.players.map((player) => (
              <li key={player.id}>
                <span>{player.nickname}{player.isHost ? ' ★' : ''}</span>
                <span className={player.ready ? 'ready' : ''}>{player.ready ? 'READY' : 'NOT READY'}</span>
              </li>
            ))}
          </ul>
          <button onClick={toggleReady}>{me?.ready ? 'Cancel ready' : 'Ready up'}</button>
          {me?.isHost && (
            <button disabled={lobby.players.length < 2 || lobby.players.some((player) => !player.ready)} onClick={() => room?.send('start')}>
              Start match
            </button>
          )}
          <button className="secondary" onClick={() => room?.leave()}>Leave room</button>
          {error && <p className="error">{error}</p>}
          {error && <DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} />}
          {disconnectedRoom && <button disabled={busy} onClick={reconnect}>Reconnect</button>}
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="panel">
        <p className="eyebrow">MULTIPLAYER PIXEL ARENA</p>
        <h1>Friend.io</h1>
        <p>Make a room. Bring your friends. Try not to get tagged.</p>
        <label>
          Nickname
          <input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} placeholder="Player" />
        </label>
        <button disabled={busy} onClick={() => connect('create')}>Create room</button>
        <div className="join">
          <input value={roomCode} maxLength={6} onChange={(event) => setRoomCode(event.target.value)} placeholder="ROOM CODE" />
          <button disabled={busy} onClick={() => connect('join')}>Join</button>
        </div>
        {error && <p className="error">{error}</p>}
        {error && <DiagnosticPanel diagnostics={diagnostics} onCopy={copyReport} />}
        {disconnectedRoom && <button disabled={busy} onClick={reconnect}>Reconnect</button>}
        <p className="hint">Server: {serverUrl}</p>
      </section>
    </main>
  );
}

function DiagnosticPanel({ diagnostics, onCopy }: { diagnostics: string[]; onCopy: () => void }) {
  return (
    <details className="diagnostics">
      <summary>Show technical details</summary>
      <pre>{diagnostics.join('\n')}</pre>
      <button className="secondary" onClick={onCopy}>Copy error report</button>
    </details>
  );
}

function Results({ state, onLeave }: { state: Lobby; onLeave: () => void }) {
  const ranking = [...state.players].sort((a, b) => state.mode === 'gladiator'
    ? Number(b.alive) - Number(a.alive) || b.eliminations - a.eliminations
    : state.mode === 'laser'
      ? b.kills - a.kills || a.deaths - b.deaths
    : a.itTime - b.itTime);
  return (
    <main className="screen">
      <section className="panel">
        <p className="eyebrow">{state.mode === 'gladiator' ? 'GLADIATOR RESULTS' : state.mode === 'laser' ? 'LASER RESULTS' : 'TAG RESULTS'}</p>
        <h1>Match over</h1>
        <ol className="results">
          {ranking.map((player) => (
            <li key={player.id}>
              <span>{player.nickname}</span>
              <span>{state.mode === 'gladiator' ? `${player.eliminations} KO${player.alive ? ' · ALIVE' : ''}` : state.mode === 'laser' ? `${player.kills} K / ${player.deaths} D` : `${player.itTime.toFixed(1)}s IT`}</span>
            </li>
          ))}
        </ol>
        <button className="secondary" onClick={onLeave}>Leave room</button>
      </section>
    </main>
  );
}
