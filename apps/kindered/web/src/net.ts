import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { Engine, type EngineSnapshot } from '../../shared/engine';
import { PING_MS, ROOM_ALPHABET, ROOM_CODE_LENGTH, peerId, type HostMsg, type PhoneMsg, type PhoneState } from '../../shared/protocol';

// The one place to point at our own signaling server or add a TURN relay later (config: { iceServers: [...] }).
export const PEER_OPTIONS: PeerOptions = {};
const FAST = 'fast'; // second, unreliable channel per phone for fast minigame inputs: a lost packet never stalls
const CONNECT_TIMEOUT_MS = 10000;
const SAVE_KEY = 'kindered.host';
const SAVE_MAX_AGE_MS = 6 * 3600_000;

// --- diagnostics: a plain log the phone or host can copy into a bug report ---
const lines: string[] = [];
export const log = (line: string) => { lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (lines.length > 60) lines.shift(); };
export const errorReport = () => [`Kindered ${location.href}`, navigator.userAgent, ...lines].join('\n');

export function explain(type: string, code: string): string {
  if (type === 'peer-unavailable') return `There is no room ${code}. Check the code on the big screen.`;
  if (type === 'browser-incompatible') return 'This browser cannot make direct connections. Try Safari or Chrome.';
  if (type === 'webrtc' || type === 'timeout') return 'Could not connect directly. School or office Wi-Fi often blocks this: try a phone hotspot.';
  return 'Cannot reach the connection server. Check your internet and try again.';
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export function savedShow(): EngineSnapshot | null {
  try {
    const s = JSON.parse(store.get(SAVE_KEY) ?? 'null') as EngineSnapshot | null;
    return s && Date.now() - s.savedAt < SAVE_MAX_AGE_MS ? s : null;
  } catch { return null; }
}
export const forgetShow = () => store.del(SAVE_KEY);

export async function stayAwake() {
  const lock = () => (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
  await lock();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lock(); });
}

// --- host: the big screen is the server ---
export class HostNet {
  status: 'opening' | 'open' | 'failed' = 'opening';
  error = '';
  private peer?: Peer;
  private readonly conns = new Map<string, DataConnection>(); // player id -> reliable channel
  private readonly byPeer = new Map<string, string>(); // phone's PeerJS id -> player id
  private readonly sent = new Map<string, string>();
  private readonly rtt = new Map<string, number>();
  private readonly pings = new Map<number, number>();
  private n = 0;
  private lastPing = 0;
  private lastSave = 0;
  private savedPhase = '';
  private readonly timer: number;

  constructor(readonly engine: Engine, private readonly onChange: () => void) {
    this.open(0);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  // After a refresh the signaling server may still hold our id for a while, so retry with backoff.
  private open(attempt: number) {
    const peer = new Peer(peerId(this.engine.code), PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => { this.status = 'open'; log(`room ${this.engine.code} open`); this.onChange(); });
    peer.on('disconnected', () => { log('signaling lost, reconnecting'); if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      log(`host error ${err.type}`);
      if (err.type === 'unavailable-id' && attempt < 12) {
        peer.destroy();
        window.setTimeout(() => this.open(attempt + 1), Math.min(1000 * 2 ** attempt, 8000));
      } else if (this.status !== 'open' && err.type !== 'peer-unavailable') {
        this.status = 'failed';
        this.error = err.type === 'unavailable-id' ? 'This room code is still in use. Start a new room.' : explain(err.type, this.engine.code);
      }
      this.onChange();
    });
    peer.on('connection', (conn) => this.accept(conn));
  }

  private accept(conn: DataConnection) {
    if (conn.label === FAST) {
      conn.on('data', (data) => { const id = this.byPeer.get(conn.peer); if (id) this.handle(id, data as PhoneMsg); });
      return;
    }
    conn.on('data', (data) => {
      const msg = data as PhoneMsg;
      if (msg?.t !== 'join') { const id = this.byPeer.get(conn.peer); if (id && this.conns.get(id) === conn) this.handle(id, msg); return; }
      const r = this.engine.join(String(msg.name ?? ''), String(msg.avatar ?? ''), typeof msg.token === 'string' ? msg.token : undefined, Date.now());
      if (!r.ok) { conn.send({ t: 'reject', reason: r.reason } satisfies HostMsg); window.setTimeout(() => conn.close(), 500); return; }
      const old = this.conns.get(r.player.id);
      if (old && old !== conn) old.close();
      this.conns.set(r.player.id, conn);
      this.byPeer.set(conn.peer, r.player.id);
      this.sent.delete(r.player.id); // re-send the current view, e.g. after a phone unlock
      conn.send({ t: 'welcome', id: r.player.id, token: r.player.token, color: r.player.color } satisfies HostMsg);
      log(`${r.player.name} joined as ${r.player.id}`);
      this.update();
    });
    conn.on('close', () => {
      const id = this.byPeer.get(conn.peer);
      if (id && this.conns.get(id) === conn) { this.conns.delete(id); this.engine.disconnect(id); this.update(); }
    });
  }

  private handle(id: string, msg: PhoneMsg) {
    const now = Date.now();
    if (msg?.t === 'pong') {
      const at = this.pings.get(msg.n);
      if (at) this.rtt.set(id, now - at);
      this.engine.heard(id, now);
    } else if (msg?.t === 'avatar') this.engine.setAvatar(id, String(msg.avatar));
    else if (msg?.t === 'input' && typeof msg.widget === 'string') this.engine.input(id, msg.widget, msg.value, now);
    else return;
    this.update();
  }

  private tick() {
    const now = Date.now();
    this.engine.tick(now);
    if (now - this.lastPing >= PING_MS) {
      this.lastPing = now;
      this.n += 1;
      this.pings.set(this.n, now);
      this.pings.delete(this.n - 5);
      this.conns.forEach((c, id) => c.open && c.send({ t: 'ping', n: this.n, rtt: this.rtt.get(id) } satisfies HostMsg));
    }
    this.update();
  }

  // Send each phone its view only when it changed. Time left rides along; the phone counts it down itself.
  update() {
    const now = Date.now();
    this.conns.forEach((conn, id) => {
      if (!conn.open) return;
      const state: PhoneState = this.engine.view(id, now);
      const key = JSON.stringify({ ...state, timeLeftMs: state.timeLeftMs === undefined });
      if (this.sent.get(id) === key) return;
      this.sent.set(id, key);
      conn.send({ t: 'state', state, rtt: this.rtt.get(id) } satisfies HostMsg);
    });
    if (this.engine.phase !== this.savedPhase || now - this.lastSave > 1000) {
      this.savedPhase = this.engine.phase;
      this.lastSave = now;
      store.set(SAVE_KEY, JSON.stringify(this.engine.snapshot(now)));
    }
    this.onChange();
  }

  close() { window.clearInterval(this.timer); this.peer?.destroy(); }
}

// --- phone: draws what it is told, sends taps back ---
export type PhoneEvents = {
  welcome: (id: string, color: number) => void;
  state: (state: PhoneState, endsAt?: number) => void;
  reject: (reason: string) => void;
  status: (status: 'connecting' | 'connected' | 'lost', error?: string) => void;
};

export class PhoneNet {
  private peer?: Peer;
  private conn?: DataConnection;
  private fast?: DataConnection;
  private rtt = 0;
  private welcomed = false;
  private seated = false; // once seated, "no such room" means the host is refreshing: keep trying
  private closed = false;
  private retry = 0;
  private timeout = 0;
  private readonly onVisible = () => { if (document.visibilityState === 'visible' && !this.conn?.open) this.connect(); };

  constructor(readonly code: string, private name: string, private avatar: string, private readonly on: PhoneEvents) {
    document.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  private get tokenKey() { return `kindered.seat.${this.code}`; }

  private connect() {
    if (this.closed) return;
    window.clearTimeout(this.retry);
    window.clearTimeout(this.timeout);
    const [conn, fast] = [this.conn, this.fast];
    this.conn = this.fast = undefined;
    conn?.close();
    fast?.close();
    this.welcomed = false;
    this.on.status('connecting');
    this.timeout = window.setTimeout(() => { if (!this.welcomed) this.fail('timeout'); }, CONNECT_TIMEOUT_MS);
    if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
      this.peer?.destroy();
      const peer = new Peer(PEER_OPTIONS);
      this.peer = peer;
      peer.on('open', () => this.dial());
      peer.on('error', (err) => { log(`phone error ${err.type}`); this.fail(err.type); });
    } else this.dial();
  }

  private dial() {
    const conn = this.peer!.connect(peerId(this.code), { reliable: true });
    this.conn = conn;
    conn.on('open', () => conn.send({ t: 'join', name: this.name, avatar: this.avatar, token: store.get(this.tokenKey) ?? undefined } satisfies PhoneMsg));
    conn.on('data', (data) => this.receive(data as HostMsg));
    conn.on('close', () => { if (this.conn === conn && !this.closed) { this.on.status('lost'); this.retry = window.setTimeout(() => this.connect(), 2000); } });
    this.fast = this.peer!.connect(peerId(this.code), { reliable: false, label: FAST });
  }

  private fail(type: string) {
    if (this.closed) return;
    window.clearTimeout(this.timeout);
    this.on.status('lost', explain(type, this.code));
    if (type !== 'peer-unavailable' || this.seated) this.retry = window.setTimeout(() => this.connect(), 4000);
  }

  private receive(msg: HostMsg) {
    if (msg.t === 'welcome') {
      this.welcomed = this.seated = true;
      window.clearTimeout(this.timeout);
      store.set(this.tokenKey, msg.token);
      this.on.status('connected');
      this.on.welcome(msg.id, msg.color);
    } else if (msg.t === 'reject') { this.closed = true; this.on.reject(msg.reason); }
    else if (msg.t === 'ping') { if (msg.rtt) this.rtt = msg.rtt; this.conn?.send({ t: 'pong', n: msg.n } satisfies PhoneMsg); }
    else if (msg.t === 'state') {
      if (msg.rtt) this.rtt = msg.rtt;
      this.on.state(msg.state, msg.state.timeLeftMs === undefined ? undefined : performance.now() + msg.state.timeLeftMs - this.rtt / 2);
    }
  }

  send(msg: PhoneMsg, fast = false) {
    const ch = fast && this.fast?.open ? this.fast : this.conn;
    if (ch?.open) ch.send(msg);
  }

  setAvatar(avatar: string) { this.avatar = avatar; this.send({ t: 'avatar', avatar }); }

  close() {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.clearTimeout(this.retry);
    window.clearTimeout(this.timeout);
    this.peer?.destroy();
  }
}

export const makeCode = () => Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
