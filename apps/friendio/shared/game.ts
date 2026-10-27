import {
  ARENA_HEIGHT, ARENA_WIDTH, COUNTDOWN_SECONDS, LASER_FIRE_COOLDOWN_SECONDS,
  LASER_RESPAWN_SECONDS, MATCH_DURATION_SECONDS, MAX_NICKNAME_LENGTH, maxPlayers, isAvatar,
  PLAYER_RADIUS, PLAYER_SPEED, SERVER_TICK_RATE, SPEAR_LENGTH, SPEAR_RADIUS,
  SPEAR_RECOVERY_SECONDS, SPEAR_THRUST_SECONDS, SPEAR_TURN_SPEED, SPRINT_DRAIN_PER_SECOND,
  SPRINT_MULTIPLIER, SPRINT_RECHARGE_PER_SECOND, TAG_DISTANCE, TAG_EXHAUSTED_MULTIPLIER,
  TAG_EXHAUSTED_SECONDS, TAG_IMMUNE_SECONDS, TAG_IT_SPEED_MULTIPLIER, TAG_LAST_SURVIVOR_BONUS,
  TAG_STREAK_BONUS, TAG_STREAK_BONUS_SECONDS, TAG_PUSH_COOLDOWN_SECONDS,
  TAG_STUN_SECONDS, TAG_TRANSFER_COOLDOWN_SECONDS, clampInputAxis, pointInVisionCone,
  segmentIntersectsCircle, type GameMode, type MatchPhase, type MovementInput,
} from './protocol';
import { obstaclesFor, resolveObstacles } from './obstacles';

export type GamePlayer = {
  id: string; nickname: string; ready: boolean; isHost: boolean; x: number; y: number;
  isIt: boolean; sprint: number; stun: number; pushCooldown: number; itTime: number;
  spearAngle: number; spearTimer: number; alive: boolean; eliminations: number;
  aimAngle: number; fireCooldown: number; respawn: number; kills: number; deaths: number;
  facing: number; sprinting: boolean; exhausted: number; immune: number; avatar: string;
  score: number; streak: number;
  // shirt colour slot, kept for the whole room so a player looks the same in every mode
  color: number;
};

export type GameSnapshot = {
  roomId: string; players: GamePlayer[]; phase: MatchPhase; countdown: number;
  timeRemaining: number; mode: GameMode;
  // ack: the viewer's last input sequence the host has applied; itBoost: whether IT currently gets its speed bonus
  ack: number; itBoost: boolean;
};

// One movement step. The host runs it every tick and guests run the same code to predict their own player.
export function stepMovement(player: GamePlayer, input: MovementInput | undefined, seconds: number, mode: GameMode, itBoost: boolean) {
  player.sprinting = false;
  if (!input || player.stun > 0) return;
  if (typeof input.aim === 'number') player.aimAngle = input.aim;
  const magnitude = Math.hypot(input.x, input.y);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  const tag = mode === 'tag';
  const sprinting = tag && input.sprint && player.sprint > 0 && magnitude > 0 && player.exhausted === 0;
  const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1) * (tag && player.isIt && itBoost ? TAG_IT_SPEED_MULTIPLIER : 1)
    * (player.exhausted > 0 ? TAG_EXHAUSTED_MULTIPLIER : 1);
  if (magnitude > 0) player.facing = Math.atan2(input.y, input.x);
  player.sprinting = sprinting;
  player.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, player.x + input.x * scale * speed * seconds));
  player.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, player.y + input.y * scale * speed * seconds));
  Object.assign(player, resolveObstacles(player.x, player.y, PLAYER_RADIUS, obstaclesFor(mode)));
  player.sprint = sprinting ? Math.max(0, player.sprint - seconds * SPRINT_DRAIN_PER_SECOND) : Math.min(100, player.sprint + seconds * SPRINT_RECHARGE_PER_SECOND);
  // running the bar dry leaves you winded for a moment
  if (sprinting && player.sprint === 0) player.exhausted = TAG_EXHAUSTED_SECONDS;
}

const BOT_NAMES = ['Pixel', 'Byte', 'Glitch'];
const MATCH_RESET = { sprint: 100, stun: 0, pushCooldown: 0, itTime: 0, spearAngle: 0, spearTimer: 0, alive: true,
  eliminations: 0, aimAngle: 0, fireCooldown: 0, respawn: 0, kills: 0, deaths: 0, facing: 0, sprinting: false, exhausted: 0, immune: 0, score: 0, streak: 0 };

// six spots: the four corners, then top and bottom middle
const SPAWNS = [[98, 98], [ARENA_WIDTH - 98, ARENA_HEIGHT - 98], [ARENA_WIDTH - 98, 98], [98, ARENA_HEIGHT - 98],
  [ARENA_WIDTH / 2, 98], [ARENA_WIDTH / 2, ARENA_HEIGHT - 98]];
const spawnPosition = (index: number) => ({ x: SPAWNS[index % SPAWNS.length][0], y: SPAWNS[index % SPAWNS.length][1] });

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
  private lastIt = '';
  private readonly botStuck = new Map<string, { x: number; y: number; check: number; detour: number }>();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  addPlayer(id: string, nickname: unknown) {
    if (this.players.size >= maxPlayers(this.mode)) throw new Error('Room is full.');
    if (this.phase !== 'lobby') throw new Error('Match already in progress.');
    const player: GamePlayer = {
      id, nickname: cleanNickname(nickname), ready: false, isHost: this.players.size === 0,
      x: 0, y: 0, isIt: false, avatar: '', ...MATCH_RESET,
      color: [0, 1, 2, 3, 4, 5].find((slot) => ![...this.players.values()].some((other) => other.color === slot)) ?? 0,
    };
    this.players.set(id, player);
    return player;
  }

  // stationary dummies are never driven, so they just stand there as targets
  addBot(stationary = false) {
    const name = BOT_NAMES[this.bots.size % BOT_NAMES.length];
    const player = stationary
      ? this.addPlayer(`dummy-${this.players.size}`, `Dummy ${this.players.size}`)
      : this.addPlayer(`bot-${this.bots.size}`, `${name} bot`);
    player.ready = true;
    if (!stationary) this.bots.set(player.id, Math.random() * Math.PI * 2);
    return player;
  }

  setAvatar(id: string, avatar: unknown) {
    const player = this.players.get(id);
    if (this.phase === 'lobby' && player && isAvatar(avatar)) player.avatar = avatar;
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
      Object.assign(entry, { ...position, ...MATCH_RESET, isIt: index === 0 });
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
      if (target.id !== id && target.stun === 0 && target.immune === 0 && Math.hypot(target.x - player.x, target.y - player.y) <= TAG_DISTANCE * 2) {
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
    if (this.timeRemaining === 0) { this.awardLastSurvivor(); this.phase = 'results'; return; }
    this.driveBots(seconds);
    this.players.forEach((player) => this.tickPlayer(player, seconds));
    if (this.mode === 'gladiator' && [...this.players.values()].filter((player) => player.alive).length <= 1) this.phase = 'results';
    if (this.mode === 'tag') {
      this.transferCooldown = Math.max(0, this.transferCooldown - seconds);
      const it = [...this.players.values()].find((player) => player.isIt);
      const target = it && this.transferCooldown === 0
        ? [...this.players.values()].find((player) => !player.isIt && player.stun === 0 && Math.hypot(player.x - it.x, player.y - it.y) <= TAG_DISTANCE)
        : undefined;
      if (it && target) { this.lastIt = it.id; it.isIt = false; target.isIt = true; it.immune = TAG_IMMUNE_SECONDS; this.transferCooldown = TAG_TRANSFER_COOLDOWN_SECONDS; }
    }
  }

  snapshot(viewerId?: string): GameSnapshot {
    const viewer = viewerId ? this.players.get(viewerId) : undefined;
    const players = [...this.players.values()].filter((player) =>
      this.phase === 'lobby' || this.mode !== 'laser' || !viewer || player.id === viewer.id
      || pointInVisionCone(viewer.x, viewer.y, viewer.aimAngle, player.x, player.y),
    );
    return { roomId: this.roomId, players: players.map((player) => ({ ...player })), phase: this.phase,
      countdown: this.countdown, timeRemaining: this.timeRemaining, mode: this.mode,
      ack: (viewerId ? this.inputs.get(viewerId)?.sequence : undefined) ?? -1, itBoost: this.transferCooldown === 0 };
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
    player.immune = Math.max(0, player.immune - seconds);
    player.exhausted = Math.max(0, player.exhausted - seconds);
    if (player.isIt) { player.itTime += seconds; player.streak = 0; }
    else if (this.mode === 'tag') {
      const before = player.streak;
      player.streak += seconds;
      const bonus = Math.floor(player.streak / TAG_STREAK_BONUS_SECONDS) > Math.floor(before / TAG_STREAK_BONUS_SECONDS) ? TAG_STREAK_BONUS : 0;
      player.score += seconds + bonus;
    }
    stepMovement(player, this.inputs.get(player.id), seconds, this.mode, this.transferCooldown === 0);
  }

  private awardLastSurvivor() {
    if (this.mode !== 'tag') return;
    const best = [...this.players.values()].sort((a, b) => b.streak - a.streak)[0];
    if (best) best.score += TAG_LAST_SURVIVOR_BONUS;
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

  // ponytail: steer straight at/away from one target with a wobble; no pathing or prediction, so bots slide along walls
  private driveBots(seconds: number) {
    const players = [...this.players.values()];
    const it = players.find((player) => player.isIt);
    this.bots.forEach((seed, id) => {
      const bot = this.players.get(id);
      if (!bot?.alive) return;
      const distanceTo = (player: GamePlayer) => Math.hypot(player.x - bot.x, player.y - bot.y);
      const others = players.filter((player) => player.id !== id && player.alive).sort((a, b) => distanceTo(a) - distanceTo(b));
      const fleeing = this.mode === 'tag' && !bot.isIt && it !== undefined && it.id !== id;
      // an IT bot leaves whoever just tagged it alone, otherwise two bots tag each other back forever
      const target = fleeing ? it : others.find((player) => this.mode !== 'tag' || (player.stun === 0 && player.id !== this.lastIt)) ?? others[0];
      if (!target) return;
      const distance = distanceTo(target);
      const aim = Math.atan2(target.y - bot.y, target.x - bot.x);
      // a bot that barely moved in half a second is pinned on a wall: sidestep for a moment
      const stuck = this.botStuck.get(id) ?? { x: bot.x, y: bot.y, check: 0, detour: 0 };
      this.botStuck.set(id, stuck);
      stuck.check += seconds;
      stuck.detour = Math.max(0, stuck.detour - seconds);
      if (stuck.check >= 0.5) {
        if (Math.hypot(bot.x - stuck.x, bot.y - stuck.y) < 15) stuck.detour = 0.8;
        Object.assign(stuck, { x: bot.x, y: bot.y, check: 0 });
      }
      const heading = (fleeing ? aim + Math.PI : aim) + Math.sin(this.elapsed * 1.7 + seed) * 0.7
        + (stuck.detour > 0 ? (seed > Math.PI ? 1 : -1) * Math.PI / 2 : 0);
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
