import Peer, { type DataConnection } from 'peerjs';
import { FriendGame, type GameSnapshot } from '../../shared/game';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, type GameMode, type MovementInput } from '../../shared/protocol';

export type PeerMessage =
  | { type: 'hello'; nickname: string }
  | { type: 'snapshot'; state: GameSnapshot }
  | { type: 'ready' | 'start' | 'push' | 'fire' }
  | { type: 'move'; input: MovementInput };

export type Transport = {
  id: string;
  isHost: boolean;
  send: (message: PeerMessage) => void;
  onMessage: (handler: (message: PeerMessage) => void) => void;
  onState: (handler: (state: GameSnapshot) => void) => void;
  onClose: (handler: () => void) => void;
  close: () => void;
};

const makeRoomId = () => Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');

class HostTransport implements Transport {
  readonly id: string;
  readonly isHost = true;
  private readonly peer?: Peer;
  private readonly game: FriendGame;
  private readonly connections = new Map<string, DataConnection>();
  private messageHandler = (_message: PeerMessage) => {};
  private stateHandler = (_state: GameSnapshot) => {};
  private closeHandler = () => {};
  private lastTick = performance.now();
  private timer = 0;

  constructor(nickname: string, mode: GameMode, bots = 0) {
    this.id = makeRoomId();
    this.game = new FriendGame(this.id);
    this.game.mode = mode;
    this.game.addPlayer(this.id, nickname);
    if (bots) {
      for (let index = 0; index < bots; index += 1) this.game.addBot();
      this.game.toggleReady(this.id);
      this.game.start(this.id);
      this.startTicking();
      return;
    }
    this.peer = new Peer(this.id);
    // only show the lobby once the room code is registered and joinable
    this.peer.on('open', () => this.startTicking());
    this.peer.on('connection', (connection) => {
      connection.on('data', (data) => this.receive(connection, data as PeerMessage));
      connection.on('close', () => { this.game.removePlayer(connection.peer); this.connections.delete(connection.peer); this.broadcast(); });
      this.connections.set(connection.peer, connection);
    });
    this.peer.on('error', () => this.closeHandler());
  }

  send(message: PeerMessage) { this.receive({ peer: this.id } as DataConnection, message); }
  onMessage(handler: (message: PeerMessage) => void) { this.messageHandler = handler; }
  onState(handler: (state: GameSnapshot) => void) { this.stateHandler = handler; }
  onClose(handler: () => void) { this.closeHandler = handler; }
  close() { window.clearInterval(this.timer); this.peer?.destroy(); }

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
    else if (message.type === 'move') this.game.receiveMovement(connection.peer, message.input);
    else if (message.type === 'push' || message.type === 'fire') this.game.action(connection.peer);
    this.messageHandler(message);
    this.broadcast();
  }

  private broadcast() {
    const hostState = this.game.snapshot(this.id);
    this.stateHandler(hostState);
    this.connections.forEach((connection) => connection.send({ type: 'snapshot', state: this.game.snapshot(connection.peer) } satisfies PeerMessage));
  }
}

class GuestTransport implements Transport {
  readonly id = crypto.randomUUID();
  readonly isHost = false;
  private readonly peer = new Peer();
  private connection!: DataConnection;
  private messageHandler = (_message: PeerMessage) => {};
  private stateHandler = (_state: GameSnapshot) => {};
  private closeHandler = () => {};

  constructor(roomId: string, nickname: string) {
    // connect() before the signalling socket is open sends no offer
    this.peer.on('open', () => {
      this.connection = this.peer.connect(roomId, { reliable: true });
      this.connection.on('open', () => this.connection.send({ type: 'hello', nickname } satisfies PeerMessage));
      this.connection.on('data', (data) => {
        const message = data as PeerMessage;
        if (message.type === 'snapshot') this.stateHandler(message.state);
        else this.messageHandler(message);
      });
      this.connection.on('close', () => this.closeHandler());
    });
    this.peer.on('error', () => this.closeHandler());
  }

  send(message: PeerMessage) { this.connection?.open && this.connection.send(message); }
  onMessage(handler: (message: PeerMessage) => void) { this.messageHandler = handler; }
  onState(handler: (state: GameSnapshot) => void) { this.stateHandler = handler; }
  onClose(handler: () => void) { this.closeHandler = handler; }
  close() { this.connection?.close(); this.peer.destroy(); }
}

export const createHost = (nickname: string, mode: GameMode) => new HostTransport(nickname, mode);
export const playSolo = (nickname: string, mode: GameMode) => new HostTransport(nickname, mode, 3);
export const joinHost = (roomId: string, nickname: string) => new GuestTransport(roomId, nickname);
