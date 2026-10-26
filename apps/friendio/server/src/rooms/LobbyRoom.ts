import { Client, Room } from 'colyseus';
import { MapSchema, Schema, type, view } from '@colyseus/schema';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COUNTDOWN_SECONDS,
  MATCH_DURATION_SECONDS,
  MAX_NICKNAME_LENGTH,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  SERVER_TICK_RATE,
  SPEAR_LENGTH,
  SPEAR_RADIUS,
  SPEAR_RECOVERY_SECONDS,
  SPEAR_THRUST_SECONDS,
  SPEAR_TURN_SPEED,
  LASER_FIRE_COOLDOWN_SECONDS,
  LASER_RANGE,
  LASER_RESPAWN_SECONDS,
  SPRINT_DRAIN_PER_SECOND,
  SPRINT_MULTIPLIER,
  SPRINT_RECHARGE_PER_SECOND,
  clampInputAxis,
  TAG_DISTANCE,
  TAG_PUSH_COOLDOWN_SECONDS,
  TAG_STUN_SECONDS,
  TAG_TRANSFER_COOLDOWN_SECONDS,
  pointInVisionCone,
  segmentIntersectsCircle,
  type GameMode,
  type MatchPhase,
  type MovementInput,
} from '../../../shared/protocol.js';

class Player extends Schema {
  @type('string') id = '';
  @type('string') nickname = '';
  @type('boolean') ready = false;
  @type('boolean') isHost = false;
  @view() @type('number') x = 0;
  @view() @type('number') y = 0;
  @type('boolean') isIt = false;
  @type('number') sprint = 100;
  @type('number') stun = 0;
  @type('number') pushCooldown = 0;
  @type('number') itTime = 0;
  @view() @type('number') spearAngle = 0;
  @type('number') spearTimer = 0;
  @type('boolean') alive = true;
  @type('number') eliminations = 0;
  @view() @type('number') aimAngle = 0;
  @type('number') fireCooldown = 0;
  @type('number') respawn = 0;
  @type('number') kills = 0;
  @type('number') deaths = 0;
}

class LobbyState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type('string') roomId = '';
  @type('string') phase: MatchPhase = 'lobby';
  @type('number') countdown = 0;
  @type('number') timeRemaining = 0;
  @type('string') mode: GameMode = 'tag';
}

const cleanNickname = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Nickname is required.');
  const nickname = value.trim().replace(/[^\p{L}\p{N} _-]/gu, '');
  if (!nickname || nickname.length > MAX_NICKNAME_LENGTH) throw new Error('Nickname must be 1–16 safe characters.');
  return nickname;
};

const makeRoomCode = () => Array.from(
  { length: ROOM_CODE_LENGTH },
  () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)],
).join('');

const spawnPosition = (index: number) => ({
  x: PLAYER_RADIUS + 80 + (index % 2) * (ARENA_WIDTH - 160),
  y: PLAYER_RADIUS + 80 + Math.floor(index / 2) * (ARENA_HEIGHT - 160),
});

export class LobbyRoom extends Room<{ state: LobbyState }> {
  maxClients = MAX_PLAYERS;
  private lastInputs = new Map<string, MovementInput>();
  private elapsed = 0;
  private transferCooldown = 0;
  private clientsBySession = new Map<string, Client>();

  onCreate(options: { roomCode?: unknown }) {
    if (options.roomCode) throw new Error('Room code not found.');
    this.setState(new LobbyState());
    this.state.roomId = makeRoomCode();
    this.setMetadata({ roomCode: this.state.roomId });
    this.onMessage('ready', (client) => this.toggleReady(client));
    this.onMessage('start', (client) => this.startMatch(client));
    this.onMessage('mode', (client, mode) => this.selectMode(client, mode));
    this.onMessage('move', (client, input) => this.receiveMovement(client, input));
    this.onMessage('push', (client) => this.action(client));
    this.onMessage('fire', (client) => this.fire(client));
    this.setSimulationInterval((deltaTime) => this.simulate(deltaTime), 1000 / SERVER_TICK_RATE);
  }

  onJoin(client: Client, options: { nickname?: unknown }) {
    if (this.state.phase !== 'lobby') throw new Error('Match already in progress.');
    this.addPlayer(client, options?.nickname);
    this.clientsBySession.set(client.sessionId, client);
    for (const player of this.state.players.values()) client.view?.add(player);
    client.view?.add(this.state.players.get(client.sessionId)!);
  }

  onLeave(client: Client) {
    this.lastInputs.delete(client.sessionId);
    this.clientsBySession.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.phase === 'lobby') {
      const nextHost = this.state.players.values().next().value as Player | undefined;
      if (nextHost) nextHost.isHost = true;
    }
    if (this.state.players.size === 0) this.disconnect();
    else this.refreshViews();
  }

  private toggleReady(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (this.state.phase === 'lobby' && player) player.ready = !player.ready;
  }

  private startMatch(client: Client) {
    const player = this.state.players.get(client.sessionId);
    const players = [...this.state.players.values()];
    if (this.state.phase !== 'lobby' || !player?.isHost) return;
    if (players.length < 2 || players.some((entry) => !entry.ready)) return;
    players.forEach((entry, index) => {
      const position = spawnPosition(index);
      entry.x = position.x;
      entry.y = position.y;
    });
    this.elapsed = 0;
    this.transferCooldown = 0;
    players.forEach((entry) => {
      entry.isIt = false;
      entry.sprint = 100;
      entry.stun = 0;
      entry.pushCooldown = 0;
      entry.itTime = 0;
      entry.spearAngle = 0;
      entry.spearTimer = 0;
      entry.alive = true;
      entry.eliminations = 0;
      entry.aimAngle = 0;
      entry.fireCooldown = 0;
      entry.respawn = 0;
      entry.kills = 0;
      entry.deaths = 0;
    });
    players[0].isIt = true;
    this.state.countdown = COUNTDOWN_SECONDS;
    this.state.timeRemaining = MATCH_DURATION_SECONDS;
    this.state.phase = 'countdown';
    this.refreshViews();
  }

  private receiveMovement(client: Client, value: unknown) {
    if (this.state.phase !== 'countdown' && this.state.phase !== 'active') return;
    if (!value || typeof value !== 'object') return;
    const input = value as Partial<MovementInput>;
    const sequence = input.sequence;
    if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) return;
    const previous = this.lastInputs.get(client.sessionId);
    if (previous && sequence <= previous.sequence) return;
    this.lastInputs.set(client.sessionId, {
      sequence,
      x: clampInputAxis(input.x),
      y: clampInputAxis(input.y),
      sprint: input.sprint === true,
      aim: typeof input.aim === 'number' && Number.isFinite(input.aim) ? input.aim : undefined,
    });
  }

  private selectMode(client: Client, mode: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (this.state.phase !== 'lobby' || !player?.isHost || (mode !== 'tag' && mode !== 'gladiator' && mode !== 'laser')) return;
    this.state.mode = mode;
    this.refreshViews();
  }

  private action(client: Client) {
    if (this.state.mode === 'laser') {
      this.fire(client);
      return;
    }
    if (this.state.mode === 'gladiator') {
      this.thrust(client);
      return;
    }

    if (this.state.phase !== 'active' || this.state.mode !== 'tag') return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.stun > 0 || player.pushCooldown > 0) return;
    player.pushCooldown = TAG_PUSH_COOLDOWN_SECONDS;
    for (const target of this.state.players.values()) {
      if (target.id === player.id || target.stun > 0) continue;
      if (Math.hypot(target.x - player.x, target.y - player.y) <= TAG_DISTANCE * 2) {
        target.stun = TAG_STUN_SECONDS;
      }
    }
  }

  private fire(client: Client) {
    if (this.state.phase !== 'active' || this.state.mode !== 'laser') return;
    const shooter = this.state.players.get(client.sessionId);
    if (!shooter?.alive || shooter.fireCooldown > 0) return;
    shooter.fireCooldown = LASER_FIRE_COOLDOWN_SECONDS;
    for (const target of this.state.players.values()) {
      if (target.id === shooter.id || !target.alive) continue;
      if (pointInVisionCone(shooter.x, shooter.y, shooter.aimAngle, target.x, target.y)) {
        target.alive = false;
        target.respawn = LASER_RESPAWN_SECONDS;
        target.deaths += 1;
        shooter.kills += 1;
        break;
      }
    }
  }

  private thrust(client: Client) {
    if (this.state.phase !== 'active') return;
    const player = this.state.players.get(client.sessionId);
    if (!player?.alive || player.spearTimer > 0) return;
    player.spearTimer = SPEAR_THRUST_SECONDS + SPEAR_RECOVERY_SECONDS;
    player.spearAngle = this.lastInputs.get(client.sessionId)?.aim ?? player.spearAngle;
    for (const target of this.state.players.values()) {
      if (target.id === player.id || !target.alive) continue;
      if (this.segmentHitsPlayer(player, target)) {
        target.alive = false;
        player.eliminations += 1;
      }
    }
  }

  private simulate(deltaTime: number) {
    const seconds = Math.min(deltaTime, 100) / 1000;
    if (this.state.phase === 'countdown') {
      this.elapsed += seconds;
      this.state.countdown = Math.max(0, COUNTDOWN_SECONDS - Math.floor(this.elapsed));
      if (this.elapsed >= COUNTDOWN_SECONDS) {
        this.elapsed = 0;
        this.state.phase = 'active';
      }
      return;
    }
    if (this.state.phase !== 'active') return;
    this.elapsed += seconds;
    this.state.timeRemaining = Math.max(0, MATCH_DURATION_SECONDS - Math.floor(this.elapsed));
    if (this.state.timeRemaining === 0) {
      this.state.phase = 'results';
      this.refreshViews();
      return;
    }
    for (const player of this.state.players.values()) {
      if (this.state.mode === 'gladiator') {
        player.spearTimer = Math.max(0, player.spearTimer - seconds);
        const aim = this.lastInputs.get(player.id)?.aim;
        if (typeof aim === 'number' && player.spearTimer <= SPEAR_RECOVERY_SECONDS) {
          player.spearAngle = this.rotateToward(player.spearAngle, aim, SPEAR_TURN_SPEED * seconds);
        }
        if (!player.alive) continue;
      }
      if (this.state.mode === 'laser') {
        player.fireCooldown = Math.max(0, player.fireCooldown - seconds);
        if (!player.alive) {
          player.respawn = Math.max(0, player.respawn - seconds);
          if (player.respawn === 0) {
            const position = spawnPosition([...this.state.players.values()].indexOf(player));
            player.x = position.x;
            player.y = position.y;
            player.alive = true;
          }
          continue;
        }
      }
      player.stun = Math.max(0, player.stun - seconds);
      player.pushCooldown = Math.max(0, player.pushCooldown - seconds);
      if (player.isIt) player.itTime += seconds;
      const input = this.lastInputs.get(player.id);
      if (!input || player.stun > 0) continue;
      if (typeof input.aim === 'number') player.aimAngle = input.aim;
      const magnitude = Math.hypot(input.x, input.y);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      const sprinting = this.state.mode === 'tag' && input.sprint && player.sprint > 0 && magnitude > 0;
      const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
      player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x + input.x * scale * speed * seconds));
      player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y + input.y * scale * speed * seconds));
      player.sprint = sprinting
        ? Math.max(0, player.sprint - seconds * SPRINT_DRAIN_PER_SECOND)
        : Math.min(100, player.sprint + seconds * SPRINT_RECHARGE_PER_SECOND);
    }
    if (this.state.mode === 'gladiator' && [...this.state.players.values()].filter((player) => player.alive).length <= 1) {
      this.state.phase = 'results';
      this.refreshViews();
      return;
    }
    if (this.state.mode === 'tag') {
      this.transferCooldown = Math.max(0, this.transferCooldown - seconds);
      const it = [...this.state.players.values()].find((player) => player.isIt);
      if (it && this.transferCooldown === 0) {
        const target = [...this.state.players.values()].find((player) =>
          !player.isIt && Math.hypot(player.x - it.x, player.y - it.y) <= TAG_DISTANCE && player.stun === 0);
        if (target) {
          it.isIt = false;
          target.isIt = true;
          this.transferCooldown = TAG_TRANSFER_COOLDOWN_SECONDS;
        }
      }
    }
    this.refreshViews();
  }

  private refreshViews() {
    for (const [sessionId, client] of this.clientsBySession) {
      if (!client.view) continue;
      const viewer = this.state.players.get(sessionId);
      if (!viewer) continue;
      for (const player of this.state.players.values()) {
        const visible = this.state.mode !== 'laser'
          || player.id === viewer.id
          || pointInVisionCone(viewer.x, viewer.y, viewer.aimAngle, player.x, player.y);
        if (visible) client.view.add(player);
        else client.view.remove(player);
      }
    }
  }

  private rotateToward(current: number, target: number, maximum: number) {
    const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + Math.max(-maximum, Math.min(maximum, difference));
  }

  private segmentHitsPlayer(attacker: Player, target: Player) {
    return segmentIntersectsCircle(
      attacker.x,
      attacker.y,
      attacker.x + Math.cos(attacker.spearAngle) * SPEAR_LENGTH,
      attacker.y + Math.sin(attacker.spearAngle) * SPEAR_LENGTH,
      target.x,
      target.y,
      PLAYER_RADIUS + SPEAR_RADIUS,
    );
  }

  private addPlayer(client: Client, nicknameValue: unknown) {
    if (this.state.players.has(client.sessionId)) return;
    const player = new Player();
    player.id = client.sessionId;
    player.nickname = cleanNickname(nicknameValue);
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
  }
}
