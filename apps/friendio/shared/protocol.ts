export const MAX_PLAYERS = 4;
export const MAX_NICKNAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 540;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 220;
export const SPRINT_MULTIPLIER = 1.5;
export const SPRINT_DRAIN_PER_SECOND = 35;
export const SPRINT_RECHARGE_PER_SECOND = 20;
export const SERVER_TICK_RATE = 30;
export const COUNTDOWN_SECONDS = 3;
export const MATCH_DURATION_SECONDS = 180;
export const TAG_STUN_SECONDS = 1;
export const TAG_PUSH_COOLDOWN_SECONDS = 2;
export const TAG_TRANSFER_COOLDOWN_SECONDS = 0.75;
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
