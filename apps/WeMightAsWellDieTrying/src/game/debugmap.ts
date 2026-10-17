// The route test map, opened from Settings > Debug: the horde's routes drawn on it, every soldier, build and strike to
// hand, and a horde that keeps coming. In at the top left, the safe zone bottom left: a short way down the middle
// street, a long way round by the right, and a square off the right street with nothing in it, to lure them into.
import type { MapData } from '../sim/grid.ts';
import type { WavePlan } from '../sim/world.ts';

const W = 60, H = 44;
const open = (x: number, y: number) =>
  (y >= 2 && y <= 7 && x <= 55) || (y >= 36 && y <= 41 && x <= 55) || (x >= 50 && x <= 55 && y >= 2 && y <= 41) || // round the outside
  (x >= 22 && x <= 25 && y >= 8 && y <= 35) || // the short way
  (x >= 30 && x <= 44 && y >= 14 && y <= 28) || (x >= 45 && x <= 49 && y >= 19 && y <= 22); // the square, and its lane
const tile = (x: number, y: number) =>
  x === 0 && y >= 2 && y <= 7 ? 'S' : x <= 1 && y >= 36 && y <= 41 ? 'E' : !open(x, y) ? 'b' :
  x >= 35 && x <= 38 && y >= 19 && y <= 22 ? '~' : x >= 30 && x <= 44 && y >= 14 && y <= 28 ? ((x * 7 + y * 3) % 11 ? ',' : 't') : '.';

const data: MapData = {
  name: 'Route test', tile: 16, par: 600,
  rows: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => tile(x, y)).join('')),
  slots: [[21, 12], [26, 12], [21, 26], [26, 26], [49, 10], [56, 30], [12, 8], [12, 35]],
  decor: [
    ...[6, 16, 30, 42].map((x) => ({ kind: 'lamp', x: x * 16, y: 2.5 * 16 })),
    ...[10, 30, 44].map((y) => ({ kind: 'lamp', x: 50.5 * 16, y: y * 16 })),
    { kind: 'fountain', x: 41 * 16, y: 25 * 16 },
  ],
};

/** A horde that keeps coming, every kind in it. */
const waves: WavePlan = {
  gap: 5,
  waves: Array.from({ length: 30 }, (_, k) => ({
    duration: 40,
    spawn: { normal: 40, fast: 10, jumper: 3, armored: 4, screamer: 2, bloater: 2, intelligent: 2, ...(k % 3 === 2 ? { tanky: 2, brute: 1, hordemother: 1 } : {}) },
  })),
};

export const DEBUG_MAP = { id: 'debug', name: 'Route test', data, waves };
/** How many of every soldier, roadblock and structure the route test hands out, and uses of every strike. */
export const DEBUG_EACH = 6, DEBUG_STRIKES = 9;
/** Switched on from Settings > Debug for this session: the routes drawn on every map. */
export const debugView = { routes: false };
