// The horde's routes: invisible lines from each way in to the safe zone that zombies keep to, so a long way round gets
// walked too, not only the shortest. Made from the map alone (buildings, not roadblocks), once per map. For each way
// in: the shortest route down the middle of the streets, then up to two more, each found with the streets near the
// routes already taken made dearer; one is kept only if it is not much longer and goes a different way for a good part.
// See World.routeWay for how a zombie follows one.
import { Grid, distanceField } from './grid.ts';

export interface Routes {
  /** Each route's tiles in order, from its way in to the safe zone, and which way in (entry) it starts at. `ahead[q]`
   *  is the farthest tile up to LOOK on from tile q that can be seen from it: where a zombie there heads, never across
   *  a building's corner. */
  list: { tiles: number[]; entry: number; ahead: number[] }[];
  /** The way in each spawn tile belongs to (-1 elsewhere). */
  entryOf: Int32Array;
  /** Tiles from the nearest route, through the streets (Infinity where none can be reached). */
  toRoute: Float32Array;
  /** The route over each tile (-1 for none; the first, where routes share it), and how far along it the tile is. */
  at: Int32Array;
  idx: Int32Array;
}

const LOOK = 3; // tiles (times the map's scale) ahead along its route a zombie heads for
const KEEP = 2; // a route at most this much longer than the shortest from its way in
const SHARED = 0.65; // and at most this share of it near routes already taken
const DEARER = 3; // added to the cost of a tile near a route already taken
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

const cache = new WeakMap<object, Routes>();

/** `scale` is the map's (a street of scale 2 is twice as many tiles wide): how far "near a route" reaches. */
export function routesOf(key: object, g: Grid, scale = 1): Routes {
  let r = cache.get(key);
  if (!r) cache.set(key, (r = findRoutes(g, scale)));
  return r;
}

export function findRoutes(g: Grid, scale = 1): Routes {
  const { w, h, wall, goal } = g, n = w * h;
  // How far each tile is from a building: the middle of a street is farthest, and cheapest to walk.
  const fromWall = distanceField(g, [...wall.keys()].filter((i) => wall[i]), () => 1);
  const base = (i: number) => (wall[i] ? Infinity : 1 + 2 / (1 + fromWall[i]));
  // The ways in: spawn tiles in touching runs (left and right only within a row).
  const entryOf = new Int32Array(n).fill(-1), entries: number[][] = [];
  for (const first of g.spawns) {
    if (entryOf[first] >= 0) continue;
    const run: number[] = [];
    for (const stack = [first]; stack.length; ) {
      const i = stack.pop()!;
      if (entryOf[i] >= 0 || !g.spawns.includes(i)) continue;
      entryOf[i] = entries.length;
      run.push(i);
      for (const j of [i % w ? i - 1 : -1, (i + 1) % w ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n) stack.push(j);
    }
    entries.push(run);
  }
  // Dearer within 2 tiles (times the scale) of a route taken; within 6 counts as the same way (a parallel lane of one
  // street is no other way).
  const list: Routes['list'] = [], dear = 2 * scale, same = 6 * scale;
  entries.forEach((run, entry) => {
    // Start from the tile of the way in nearest its middle.
    const mx = run.reduce((s, i) => s + (i % w), 0) / run.length, my = run.reduce((s, i) => s + Math.floor(i / w), 0) / run.length;
    const start = run.reduce((a, b) => ((b % w) - mx) ** 2 + (Math.floor(b / w) - my) ** 2 < ((a % w) - mx) ** 2 + (Math.floor(a / w) - my) ** 2 ? b : a);
    const taken = new Uint8Array(n); // near a route from this way in already: bit 1 the same way, bit 2 dearer
    const mark = (tiles: number[], r: number, v: number) => {
      for (const i of tiles) {
        const x = i % w, y = (i - x) / w;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) taken[(y + dy) * w + x + dx] |= v;
      }
    };
    let shortest = 0;
    // Up to 3 routes; a try that keeps to the same way (a lane over in the same street) is made dearer too, and the
    // next try goes farther afield.
    for (let k = 0, tries = 0; k < 3 && tries < 6; tries++) {
      const field = distanceField(g, g.goals, (i) => base(i) + (taken[i] & 2 ? DEARER : 0)), tiles = trace(g, field, start);
      if (!tiles || !goal[tiles.at(-1)!]) break;
      const len = length(tiles, w);
      if (k === 0) shortest = len;
      else if (len > shortest * KEEP) break; // farther afield is only longer
      else if (tiles.filter((i) => taken[i] & 1).length > tiles.length * SHARED) { mark(tiles, dear, 2); continue; }
      k++;
      list.push({ tiles, entry, ahead: tiles.map((t, q) => {
        for (let a = Math.min(tiles.length - 1, q + LOOK * scale); a > q + 1; a--) if (seen(g, t, tiles[a])) return a;
        return Math.min(tiles.length - 1, q + 1);
      }) });
      mark(tiles, same, 1);
      mark(tiles, dear, 2);
    }
  });
  const toRoute = distanceField(g, list.flatMap((r) => r.tiles), (i) => (wall[i] ? Infinity : 1));
  const at = new Int32Array(n).fill(-1), idx = new Int32Array(n);
  list.forEach((r, k) => r.tiles.forEach((t, q) => { if (at[t] < 0) { at[t] = k; idx[t] = q; } }));
  return { list, entryOf, toRoute, at, idx };
}

/** Can tile b be seen from tile a: no building on the line between their middles? */
function seen(g: Grid, a: number, b: number) {
  const ax = a % g.w, ay = Math.floor(a / g.w), bx = b % g.w, by = Math.floor(b / g.w), n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
  for (let k = 1; k < n; k++) if (g.wall[Math.floor(ay + 0.5 + ((by - ay) * k) / n) * g.w + Math.floor(ax + 0.5 + ((bx - ax) * k) / n)]) return false;
  return true;
}

/** Downhill from `start` to the bottom of `field`, a tile at a time (never across a building's corner). */
function trace(g: Grid, field: Float32Array, start: number) {
  const { w, h } = g, tiles = [start];
  if (field[start] === Infinity) return;
  for (let i = start; field[i] > 0; ) {
    const x = i % w, y = (i - x) / w;
    let best = field[i], next = -1;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || (dx && dy && (field[y * w + nx] === Infinity || field[ny * w + x] === Infinity))) continue;
      if (field[ny * w + nx] < best) { best = field[ny * w + nx]; next = ny * w + nx; }
    }
    if (next < 0) return;
    tiles.push((i = next));
  }
  return tiles;
}

const length = (tiles: number[], w: number) => tiles.reduce((s, t, k) => (k ? s + Math.hypot((t % w) - (tiles[k - 1] % w), Math.floor(t / w) - Math.floor(tiles[k - 1] / w)) : 0), 0);
