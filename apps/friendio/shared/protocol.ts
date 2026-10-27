export const MAX_PLAYERS = 4;
export const TAG_MAX_PLAYERS = 6;
export const MAX_NICKNAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 25% bigger than the original 960x540; height stays a multiple of 4 for the 4x pixel art
export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 676;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 220;
export const SPRINT_MULTIPLIER = 1.5;
export const SPRINT_DRAIN_PER_SECOND = 50;
export const SPRINT_RECHARGE_PER_SECOND = 20;
export const SERVER_TICK_RATE = 30;
export const COUNTDOWN_SECONDS = 3;
export const MATCH_DURATION_SECONDS = 180;
export const TAG_STUN_SECONDS = 1;
export const TAG_PUSH_COOLDOWN_SECONDS = 2;
export const TAG_TRANSFER_COOLDOWN_SECONDS = 1;
// scoring: +1 per second untagged, a streak bonus every 10s, and a bonus for the longest streak at the buzzer
export const TAG_STREAK_BONUS_SECONDS = 10;
export const TAG_STREAK_BONUS = 5;
export const TAG_LAST_SURVIVOR_BONUS = 10;
export const TAG_IT_SPEED_MULTIPLIER = 1.12;
export const TAG_IMMUNE_SECONDS = 1;
export const TAG_EXHAUSTED_SECONDS = 2;
export const TAG_EXHAUSTED_MULTIPLIER = 0.6;
// avatars are a square pixel grid; '0' is transparent, '1'-'8' index AVATAR_COLORS
export const AVATAR_SIZE = 12;
export const AVATAR_COLORS = ['#fff4e6', '#161429', '#e85d75', '#f7c95b', '#7de2a8', '#5bc0f7', '#a77de2', '#c47a4a'];
export const isAvatar = (value: unknown): value is string =>
  typeof value === 'string' && value.length === AVATAR_SIZE * AVATAR_SIZE && /^[0-8]+$/.test(value);
export const maxPlayers = (mode: GameMode) => mode === 'tag' ? TAG_MAX_PLAYERS : MAX_PLAYERS;
export const TAG_DISTANCE = PLAYER_RADIUS * 2.2;
export const SPEAR_LENGTH = 92;
export const SPEAR_RADIUS = 7;
export const SPEAR_THRUST_SECONDS = 0.18;
export const SPEAR_RECOVERY_SECONDS = 0.42;
export const SPEAR_TURN_SPEED = Math.PI * 5;
export const LASER_RANGE = 360;
export const LASER_CONE_RADIANS = Math.PI / 3;
export const LASER_FIRE_COOLDOWN_SECONDS = 0.6;
export const LASER_RESPAWN_SECONDS = 2;

export type MatchPhase = 'lobby' | 'countdown' | 'active' | 'results';
export type GameMode = 'tag' | 'gladiator' | 'laser';

export type MovementInput = {
  sequence: number;
  x: number;
  y: number;
  sprint: boolean;
  aim?: number;
};

export const clampInputAxis = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

export const angleDifference = (from: number, to: number) =>
  Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));

export const pointInVisionCone = (
  originX: number,
  originY: number,
  angle: number,
  targetX: number,
  targetY: number,
) => {
  const distance = Math.hypot(targetX - originX, targetY - originY);
  return distance <= LASER_RANGE
    && angleDifference(angle, Math.atan2(targetY - originY, targetX - originX)) <= LASER_CONE_RADIANS / 2;
};

export const segmentIntersectsCircle = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  centerX: number,
  centerY: number,
  radius: number,
) => {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((centerX - startX) * dx + (centerY - startY) * dy) / lengthSquared));
  const closestX = startX + projection * dx;
  const closestY = startY + projection * dy;
  return Math.hypot(centerX - closestX, centerY - closestY) <= radius;
};
