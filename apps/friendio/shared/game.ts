import {
  ARENA_HEIGHT, ARENA_WIDTH, COUNTDOWN_SECONDS, LASER_FIRE_COOLDOWN_SECONDS,
  LASER_RESPAWN_SECONDS, MATCH_DURATION_SECONDS, MAX_NICKNAME_LENGTH, MAX_PLAYERS,
  PLAYER_RADIUS, PLAYER_SPEED, SERVER_TICK_RATE, SPEAR_LENGTH, SPEAR_RADIUS,
  SPEAR_RECOVERY_SECONDS, SPEAR_THRUST_SECONDS, SPEAR_TURN_SPEED, SPRINT_DRAIN_PER_SECOND,
  SPRINT_MULTIPLIER, SPRINT_RECHARGE_PER_SECOND, TAG_DISTANCE, TAG_PUSH_COOLDOWN_SECONDS,
  TAG_STUN_SECONDS, TAG_TRANSFER_COOLDOWN_SECONDS, clampInputAxis, pointInVisionCone,
  segmentIntersectsCircle, type GameMode, type MatchPhase, type MovementInput,
} from './protocol';

export type GamePlayer = {
  id: string; nickname: string; ready: boolean; isHost: boolean; x: number; y: number;
  isIt: boolean; sprint: number; stun: number; pushCooldown: number; itTime: number;
  spearAngle: number; spearTimer: number; alive: boolean; eliminations: number;
  aimAngle: number; fireCooldown: number; respawn: number; kills: number; deaths: number;
};

export type GameSnapshot = {
  roomId: string; players: GamePlayer[]; phase: MatchPhase; countdown: number;
  timeRemaining: number; mode: GameMode;
};

const BOT_NAMES = ['Pixel', 'Byte', 'Glitch'];

const spawnPosition =(index: number) => ({
  x: PLAYER_RADIUS + 80 + (index % 2) * (ARENA_WIDTH - 160),
  y: PLAYER_RADIUS + 80 + Math.floor(index / 2) * (ARENA_HEIGHT - 160),
});

const cleanNickname = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Nickname is required.');
  const nickname = value.trim().replace(/[^\p{L}\p{N} _-]/gu, '');
  if (!nickname || nickname.length > MAX_NICKNAME_LENGTH) {
    throw new Error('Nickname must be 1–16 safe characters.');
  }
  return nickname;
};

export class FriendGame {
  readonly roomId: string;
  readonly players = new Map<string, GamePlayer>();
  phase: MatchPhase = 'lobby';
  countdown = 0;
  timeRemaining = 0;
  mode: GameMode = 'tag';
  private elapsed = 0;
  private transferCooldown = 0;
  private inputs = new Map<string, MovementInput>();
  private readonly bots = new Map<string, number>();
  private botSequence = 0;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  addPlayer(id: string, nickname: unknown) {
    if (this.players.size >= MAX_PLAYERS) throw new Error('Room is full.');
    if (this.phase !== 'lobby') throw new Error('Match already in progress.');
    const player: GamePlayer = {
      id, nickname: cleanNickname(nickname), ready: false, isHost: this.players.size === 0,
      x: 0, y: 0, isIt: false, sprint: 100, stun: 0, pushCooldown: 0, itTime: 0,
      spearAngle: 0, spearTimer: 0, alive: true, eliminations: 0, aimAngle: 0,
      fireCooldown: 0, respawn: 0, kills: 0, deaths: 0,
    };
    this.players.set(id, player);
    return player;
  }

  addBot() {
    const name = BOT_NAMES[this.bots.size % BOT_NAMES.length];
    const player = this.addPlayer(`bot-${this.bots.size}`, `${name} bot`);
    player.ready = true;
    this.bots.set(player.id, Math.random() * Math.PI * 2);
    return player;
  }

  removePlayer(id: string) {
    this.bots.delete(id);
    this.inputs.delete(id);
    this.players.delete(id);
    if (this.phase === 'lobby' && this.players.size) {
      const next = this.players.values().next().value as GamePlayer;
      this.players.forEach((player) => { player.isHost = player.id === next.id; });
    }
  }

  toggleReady(id: string) {
    if (this.phase === 'lobby') {
      const player = this.players.get(id);
      if (player) player.ready = !player.ready;
    }
  }

  start(id: string) {
    const player = this.players.get(id);
    const players = [...this.players.values()];
    if (this.phase !== 'lobby' || !player?.isHost || players.length < 2 || players.some((entry) => !entry.ready)) return;
    this.elapsed = 0;
    this.transferCooldown = 0;
    players.forEach((entry, index) => {
      const position = spawnPosition(index);
      Object.assign(entry, { ...position, isIt: index === 0, sprint: 100, stun: 0, pushCooldown: 0,
        itTime: 0, spearAngle: 0, spearTimer: 0, alive: true, eliminations: 0, aimAngle: 0,
        fireCooldown: 0, respawn: 0, kills: 0, deaths: 0 });
    });
    this.countdown = COUNTDOWN_SECONDS;
    this.timeRemaining = MATCH_DURATION_SECONDS;
    this.phase = 'countdown';
  }

  receiveMovement(id: string, value: unknown) {
    if (this.phase !== 'countdown' && this.phase !== 'active') return;
    if (!value || typeof value !== 'object') return;
    const input = value as Partial<MovementInput>;
    if (typeof input.sequence !== 'number' || !Number.isInteger(input.sequence) || input.sequence < 0) return;
    const previous = this.inputs.get(id);
    if (previous && input.sequence <= previous.sequence) return;
    this.inputs.set(id, {
      sequence: input.sequence, x: clampInputAxis(input.x), y: clampInputAxis(input.y),
      sprint: input.sprint === true,
      aim: typeof input.aim === 'number' && Number.isFinite(input.aim) ? input.aim : undefined,
    });
  }

  action(id: string) {
    if (this.mode === 'laser') return this.fire(id);
    if (this.mode === 'gladiator') return this.thrust(id);
    if (this.phase !== 'active' || this.mode !== 'tag') return;
    const player = this.players.get(id);
    if (!player || player.stun > 0 || player.pushCooldown > 0) return;
    player.pushCooldown = TAG_PUSH_COOLDOWN_SECONDS;
    this.players.forEach((target) => {
      if (target.id !== id && target.stun === 0 && Math.hypot(target.x - player.x, target.y - player.y) <= TAG_DISTANCE * 2) {
        target.stun = TAG_STUN_SECONDS;
      }
    });
  }

  tick(deltaMs: number) {
    const seconds = Math.min(deltaMs, 100) / 1000;
    if (this.phase === 'countdown') {
      this.elapsed += seconds;
      this.countdown = Math.max(0, COUNTDOWN_SECONDS - Math.floor(this.elapsed));
      if (this.elapsed >= COUNTDOWN_SECONDS) { this.elapsed = 0; this.phase = 'active'; }
      return;
    }
    if (this.phase !== 'active') return;
    this.elapsed += seconds;
    this.timeRemaining = Math.max(0, MATCH_DURATION_SECONDS - Math.floor(this.elapsed));
    if (this.timeRemaining === 0) { this.phase = 'results'; return; }
    this.driveBots();
    this.players.forEach((player) => this.tickPlayer(player, seconds));
    if (this.mode === 'gladiator' && [...this.players.values()].filter((player) => player.alive).length <= 1) this.phase = 'results';
    if (this.mode === 'tag') {
      this.transferCooldown = Math.max(0, this.transferCooldown - seconds);
      const it = [...this.players.values()].find((player) => player.isIt);
      const target = it && this.transferCooldown === 0
        ? [...this.players.values()].find((player) => !player.isIt && player.stun === 0 && Math.hypot(player.x - it.x, player.y - it.y) <= TAG_DISTANCE)
        : undefined;
      if (it && target) { it.isIt = false; target.isIt = true; this.transferCooldown = TAG_TRANSFER_COOLDOWN_SECONDS; }
    }
  }

  snapshot(viewerId?: string): GameSnapshot {
    const viewer = viewerId ? this.players.get(viewerId) : undefined;
    const players = [...this.players.values()].filter((player) =>
      this.phase === 'lobby' || this.mode !== 'laser' || !viewer || player.id === viewer.id
      || pointInVisionCone(viewer.x, viewer.y, viewer.aimAngle, player.x, player.y),
    );
    return { roomId: this.roomId, players: players.map((player) => ({ ...player })), phase: this.phase,
      countdown: this.countdown, timeRemaining: this.timeRemaining, mode: this.mode };
  }

  private tickPlayer(player: GamePlayer, seconds: number) {
    if (this.mode === 'gladiator') {
      player.spearTimer = Math.max(0, player.spearTimer - seconds);
      const aim = this.inputs.get(player.id)?.aim;
      if (typeof aim === 'number' && player.spearTimer <= SPEAR_RECOVERY_SECONDS) player.spearAngle = this.rotateToward(player.spearAngle, aim, SPEAR_TURN_SPEED * seconds);
      if (!player.alive) return;
    }
    if (this.mode === 'laser') {
      player.fireCooldown = Math.max(0, player.fireCooldown - seconds);
      if (!player.alive) {
        player.respawn = Math.max(0, player.respawn - seconds);
        if (player.respawn === 0) Object.assign(player, spawnPosition([...this.players.values()].indexOf(player)), { alive: true });
        return;
      }
    }
    player.stun = Math.max(0, player.stun - seconds);
    player.pushCooldown = Math.max(0, player.pushCooldown - seconds);
    if (player.isIt) player.itTime += seconds;
    const input = this.inputs.get(player.id);
    if (!input || player.stun > 0) return;
    if (typeof input.aim === 'number') player.aimAngle = input.aim;
    const magnitude = Math.hypot(input.x, input.y);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const sprinting = this.mode === 'tag' && input.sprint && player.sprint > 0 && magnitude > 0;
    const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1);
    player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x + input.x * scale * speed * seconds));
    player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y + input.y * scale * speed * seconds));
    player.sprint = sprinting ? Math.max(0, player.sprint - seconds * SPRINT_DRAIN_PER_SECOND) : Math.min(100, player.sprint + seconds * SPRINT_RECHARGE_PER_SECOND);
  }

  private fire(id: string) {
    if (this.phase !== 'active' || this.mode !== 'laser') return;
    const shooter = this.players.get(id);
    if (!shooter?.alive || shooter.fireCooldown > 0) return;
    shooter.fireCooldown = LASER_FIRE_COOLDOWN_SECONDS;
    const target = [...this.players.values()].find((entry) => entry.id !== id && entry.alive
      && pointInVisionCone(shooter.x, shooter.y, shooter.aimAngle, entry.x, entry.y));
    if (target) { target.alive = false; target.respawn = LASER_RESPAWN_SECONDS; target.deaths += 1; shooter.kills += 1; }
  }

  private thrust(id: string) {
    if (this.phase !== 'active') return;
    const player = this.players.get(id);
    if (!player?.alive || player.spearTimer > 0) return;
    player.spearTimer = SPEAR_THRUST_SECONDS + SPEAR_RECOVERY_SECONDS;
    player.spearAngle = this.inputs.get(id)?.aim ?? player.spearAngle;
    this.players.forEach((target) => {
      if (target.id === id || !target.alive) return;
      if (segmentIntersectsCircle(player.x, player.y, player.x + Math.cos(player.spearAngle) * SPEAR_LENGTH,
        player.y + Math.sin(player.spearAngle) * SPEAR_LENGTH, target.x, target.y, PLAYER_RADIUS + SPEAR_RADIUS)) {
        target.alive = false; player.eliminations += 1;
      }
    });
  }

  // ponytail: steer straight at/away from one target with a wobble; no pathing or prediction
  private driveBots() {
    const players = [...this.players.values()];
    const it = players.find((player) => player.isIt);
    this.bots.forEach((seed, id) => {
      const bot = this.players.get(id);
      if (!bot?.alive) return;
      const distanceTo = (player: GamePlayer) => Math.hypot(player.x - bot.x, player.y - bot.y);
      const others = players.filter((player) => player.id !== id && player.alive).sort((a, b) => distanceTo(a) - distanceTo(b));
      const fleeing = this.mode === 'tag' && !bot.isIt && it !== undefined && it.id !== id;
      const target = fleeing ? it : others.find((player) => this.mode !== 'tag' || player.stun === 0) ?? others[0];
      if (!target) return;
      const distance = distanceTo(target);
      const aim = Math.atan2(target.y - bot.y, target.x - bot.x);
      const heading = (fleeing ? aim + Math.PI : aim) + Math.sin(this.elapsed * 1.7 + seed) * 0.7;
      // fleeing bots lean toward the middle so they don't pin themselves in a corner
      const pull = fleeing ? 0.8 : 0;
      const x = Math.cos(heading) + pull * (ARENA_WIDTH / 2 - bot.x) / (ARENA_WIDTH / 2);
      const y = Math.sin(heading) + pull * (ARENA_HEIGHT / 2 - bot.y) / (ARENA_HEIGHT / 2);
      const keepDistance = this.mode === 'laser' && distance < 140;
      this.receiveMovement(id, { sequence: ++this.botSequence, x: keepDistance ? 0 : x, y: keepDistance ? 0 : y,
        sprint: distance < 220, aim: aim + (Math.random() - 0.5) * 0.3 });
      // ~5% per tick gives a human-ish reaction delay before acting
      if (Math.random() > 0.05) return;
      if (this.mode === 'tag' && fleeing && distance <= TAG_DISTANCE * 2) this.action(id);
      if (this.mode === 'gladiator' && distance <= SPEAR_LENGTH) this.action(id);
      if (this.mode === 'laser' && pointInVisionCone(bot.x, bot.y, bot.aimAngle, target.x, target.y)) this.action(id);
    });
  }

  private rotateToward(current: number, target: number, maximum: number) {
    const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + Math.max(-maximum, Math.min(maximum, difference));
  }
}

export const TICK_MS = 1000 / SERVER_TICK_RATE;
