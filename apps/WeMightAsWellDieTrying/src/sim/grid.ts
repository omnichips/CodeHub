// The map as a grid of tiles, and distance fields over it. One shared field tells every zombie the way to the safe
// zone (no route finding per zombie); a soldier ordered across the map gets a small field of their own.

/** `rows` of tiles: `#` building, `.` street, `S` where the horde enters, `E` the safe zone. */
export interface MapData { name: string; tile: number; par: number; rows: string[] }

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly tile: number;
  readonly wall: Uint8Array;
  readonly goal: Uint8Array;
  readonly block: Int32Array; // id of the roadblock on the tile, 0 for none
  readonly goals: number[] = [];
  readonly spawns: number[] = [];

  constructor(map: MapData) {
    this.h = map.rows.length;
    this.w = map.rows[0].length;
    this.tile = map.tile;
    this.wall = new Uint8Array(this.w * this.h);
    this.goal = new Uint8Array(this.w * this.h);
    this.block = new Int32Array(this.w * this.h);
    map.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const i = y * this.w + x;
        if (c === '#') this.wall[i] = 1;
        if (c === 'E') { this.goal[i] = 1; this.goals.push(i); }
        if (c === 'S') this.spawns.push(i);
      }),
    );
  }

  /** The tile under a world point, or -1 off the map. */
  at(x: number, y: number) {
    const tx = Math.floor(x / this.tile), ty = Math.floor(y / this.tile);
    return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? -1 : ty * this.w + tx;
  }

  /** Nothing walks through: off the map, a building or a roadblock. */
  solid(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const i = ty * this.w + tx;
    return this.wall[i] === 1 || this.block[i] !== 0;
  }
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Binary min-heap of tiles by cost. Stale entries are left in and skipped by the caller. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p]; keys[i] = keys[p];
      i = p;
    }
    items[i] = item; keys[i] = key;
  }
  pop(): [number, number] {
    const { items, keys } = this, top: [number, number] = [items[0], keys[0]];
    const item = items.pop()!, key = keys.pop()!, n = items.length;
    if (!n) return top;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      items[i] = items[c]; keys[i] = keys[c];
      i = c;
    }
    items[i] = item; keys[i] = key;
    return top;
  }
}

/** Cost of the cheapest route from every tile to the nearest goal tile (Infinity where there is none).
 *  `cost(i)` is what crossing tile i costs: Infinity for a wall. Diagonal steps never cut a blocked corner. */
export function distanceField(g: Grid, goals: Iterable<number>, cost: (i: number) => number) {
  const { w, h } = g, dist = new Float32Array(w * h).fill(Infinity), heap = new Heap();
  for (const i of goals) { dist[i] = 0; heap.push(i, 0); }
  while (heap.size) {
    const [i, d] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx, c = cost(n);
      if (c === Infinity) continue;
      if (dx && dy && (cost(y * w + nx) === Infinity || cost(ny * w + x) === Infinity)) continue;
      const nd = d + c * (dx && dy ? Math.SQRT2 : 1);
      if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
    }
  }
  return dist;
}

/** Points `out` from (x, y) at the centre of the next tile downhill in `dist`. False at the bottom (or nowhere to go). */
export function downhill(g: Grid, dist: Float32Array, x: number, y: number, out: { x: number; y: number }) {
  const { w, h, tile } = g, tx = Math.floor(x / tile), ty = Math.floor(y / tile);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
  let best = dist[ty * w + tx], bx = 0, by = 0;
  for (const [dx, dy] of N8) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (dx && dy && (dist[ty * w + nx] === Infinity || dist[ny * w + tx] === Infinity)) continue;
    const d = dist[ny * w + nx];
    if (d < best) { best = d; bx = dx; by = dy; }
  }
  if (!bx && !by) return false;
  const cx = (tx + bx + 0.5) * tile - x, cy = (ty + by + 0.5) * tile - y, len = Math.hypot(cx, cy) || 1;
  out.x = cx / len;
  out.y = cy / len;
  return true;
}
