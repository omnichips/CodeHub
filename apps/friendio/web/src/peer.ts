import Peer, { type DataConnection } from 'peerjs';
import { FriendGame, type GameSnapshot } from '../../shared/game';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, maxPlayers, type GameMode, type MovementInput } from '../../shared/protocol';

export type PeerMessage =
  | { type: 'hello'; nickname: string }
  | { type: 'snapshot'; state: GameSnapshot; seq?: number }
  | { type: 'ready' | 'start' | 'push' | 'fire' }
  | { type: 'move'; input: MovementInput }
  | { type: 'avatar'; avatar: string }
  | { type: 'info'; room: PublicRoom };

export type PublicRoom = { code: string; mode: GameMode; host: string; players: number; max: number; open: boolean };

export type Transport = {
  id: string;
  isHost: boolean;
  send: (message: PeerMessage) => void;
  onMessage: (handler: (message: PeerMessage) => void) => void;
  onState: (handler: (state: GameSnapshot) => void) => void;
  onClose: (handler: () => void) => void;
  close: () => void;
};

// No server to list rooms, so public hosts claim well-known PeerJS ids per UTC-offset "region"
// and browsers probe them. ponytail: 8 slots per region, raise if rooms fill up
const PUBLIC_SLOTS = 8;
const region = () => `${Math.round(-new Date().getTimezoneOffset() / 60)}`.replace('-', 'm');
const slotId = (slot: number) => `friendio-pub-${region()}-${slot}`;

// Movement and snapshots also go over a second, unreliable and unordered channel: a lost packet is
// simply replaced by the next one instead of holding up everything behind it.
const FAST_LABEL = 'fast';

const makeRoomId = () => Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');

class HostTransport implements Transport {
  readonly id: string;
  readonly isHost = true;
  private readonly peer?: Peer;
  private directory?: Peer;
  private readonly game: FriendGame;
  private readonly connections = new Map<string, DataConnection>();
  private readonly fast = new Map<string, DataConnection>();
  private seq = 0;
  private messageHandler = (_message: PeerMessage) => {};
  private stateHandler = (_state: GameSnapshot) => {};
  private closeHandler = () => {};
  private lastTick = performance.now();
  private timer = 0;

  constructor(nickname: string, mode: GameMode, bots = 0, options: { stationary?: boolean; isPublic?: boolean } = {}) {
    this.id = makeRoomId();
    this.game = new FriendGame(this.id);
    this.game.mode = mode;
    this.game.addPlayer(this.id, nickname);
    if (bots) {
      for (let index = 0; index < bots; index += 1) this.game.addBot(options.stationary);
      this.game.toggleReady(this.id);
      this.game.start(this.id);
      this.startTicking();
      return;
    }
    this.peer = new Peer(this.id);
    // only show the lobby once the room code is registered and joinable
    this.peer.on('open', () => { this.startTicking(); if (options.isPublic) this.listPublicly(0); });
    this.peer.on('connection', (connection) => {
      if (connection.label === FAST_LABEL) {
        connection.on('data', (data) => { if ((data as PeerMessage)?.type === 'move') this.receive(connection, data as PeerMessage); });
        connection.on('close', () => this.fast.delete(connection.peer));
        this.fast.set(connection.peer, connection);
        return;
      }
      connection.on('data', (data) => this.receive(connection, data as PeerMessage));
      connection.on('close', () => {
        this.game.removePlayer(connection.peer);
        this.connections.delete(connection.peer);
        this.fast.get(connection.peer)?.close();
        this.broadcast();
      });
      this.connections.set(connection.peer, connection);
    });
    this.peer.on('error', () => this.closeHandler());
  }

  send(message: PeerMessage) { this.receive({ peer: this.id } as DataConnection, message); }
  onMessage(handler: (message: PeerMessage) => void) { this.messageHandler = handler; }
  onState(handler: (state: GameSnapshot) => void) { this.stateHandler = handler; }
  onClose(handler: () => void) { this.closeHandler = handler; }
  close() { window.clearInterval(this.timer); this.peer?.destroy(); this.directory?.destroy(); }

  private listPublicly(slot: number) {
    if (slot >= PUBLIC_SLOTS) return;
    const directory = new Peer(slotId(slot));
    this.directory = directory;
    directory.on('error', (error) => { if (error.type === 'unavailable-id') { directory.destroy(); this.listPublicly(slot + 1); } });
    directory.on('connection', (connection) => connection.on('open', () => {
      const players = [...this.game.players.values()];
      connection.send({ type: 'info', room: { code: this.id, mode: this.game.mode, host: players.find((player) => player.isHost)?.nickname ?? '?',
        players: players.length, max: maxPlayers(this.game.mode), open: this.game.phase === 'lobby' && players.length < maxPlayers(this.game.mode) } } satisfies PeerMessage);
    }));
  }

  private startTicking() {
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.game.tick(now - this.lastTick);
      this.lastTick = now;
      this.broadcast();
    }, 1000 / 30);
  }

  private receive(connection: DataConnection, message: PeerMessage) {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'hello') {
      try { this.game.addPlayer(connection.peer, message.nickname); } catch { connection.close(); return; }
    } else if (message.type === 'ready') this.game.toggleReady(connection.peer);
    else if (message.type === 'start') this.game.start(connection.peer);
    else if (message.type === 'avatar') this.game.setAvatar(connection.peer, message.avatar);
    else if (message.type === 'move') this.game.receiveMovement(connection.peer, message.input);
    else if (message.type === 'push' || message.type === 'fire') this.game.action(connection.peer);
    this.messageHandler(message);
    // movement waits for the next tick's snapshot; everything else (joins, ready, pushes) goes out at once
    if (message.type !== 'move') this.broadcast();
  }

  private broadcast() {
    const hostState = this.game.snapshot(this.id);
    this.stateHandler(hostState);
    this.seq += 1;
    this.connections.forEach((connection) => {
      const fast = this.fast.get(connection.peer);
      (fast?.open ? fast : connection).send({ type: 'snapshot', state: this.game.snapshot(connection.peer), seq: this.seq } satisfies PeerMessage);
    });
  }
}

class GuestTransport implements Transport {
  readonly id = crypto.randomUUID();
  readonly isHost = false;
  private readonly peer = new Peer();
  private connection!: DataConnection;
  private fast?: DataConnection;
  private lastSeq = 0;
  private messageHandler = (_message: PeerMessage) => {};
  private stateHandler = (_state: GameSnapshot) => {};
  private closeHandler = () => {};

  constructor(roomId: string, nickname: string) {
    // connect() before the signalling socket is open sends no offer
    this.peer.on('open', () => {
      this.connection = this.peer.connect(roomId, { reliable: true });
      this.connection.on('open', () => this.connection.send({ type: 'hello', nickname } satisfies PeerMessage));
      const onData = (data: unknown) => {
        const message = data as PeerMessage;
        if (message.type !== 'snapshot') { this.messageHandler(message); return; }
        // the fast channel is unordered, so drop snapshots older than one already shown
        if ((message.seq ?? 0) <= this.lastSeq) return;
        this.lastSeq = message.seq ?? 0;
        this.stateHandler(message.state);
      };
      this.connection.on('data', onData);
      this.connection.on('close', () => this.closeHandler());
      this.fast = this.peer.connect(roomId, { reliable: false, label: FAST_LABEL });
      this.fast.on('data', onData);
    });
    this.peer.on('error', () => this.closeHandler());
  }

  send(message: PeerMessage) {
    const channel = message.type === 'move' && this.fast?.open ? this.fast : this.connection;
    if (channel?.open) channel.send(message);
  }
  onMessage(handler: (message: PeerMessage) => void) { this.messageHandler = handler; }
  onState(handler: (state: GameSnapshot) => void) { this.stateHandler = handler; }
  onClose(handler: () => void) { this.closeHandler = handler; }
  close() { this.fast?.close(); this.connection?.close(); this.peer.destroy(); }
}

export const createHost = (nickname: string, mode: GameMode, isPublic = false) => new HostTransport(nickname, mode, 0, { isPublic });
export const playSolo = (nickname: string, mode: GameMode, stationary = false) => new HostTransport(nickname, mode, 3, { stationary });

export const findPublicRooms = (waitMs = 4000) => new Promise<PublicRoom[]>((resolve) => {
  const rooms: PublicRoom[] = [];
  const peer = new Peer();
  peer.on('error', () => {}); // unclaimed slots report peer-unavailable; that is expected
  peer.on('open', () => {
    for (let slot = 0; slot < PUBLIC_SLOTS; slot += 1) {
      const connection = peer.connect(slotId(slot), { reliable: true });
      connection.on('data', (data) => {
        const message = data as PeerMessage;
        if (message.type === 'info' && message.room.open) rooms.push(message.room);
        connection.close();
      });
    }
  });
  window.setTimeout(() => { peer.destroy(); resolve(rooms); }, waitMs);
});
export const joinHost = (roomId: string, nickname: string) => new GuestTransport(roomId, nickname);
