// Draws maps 4 to 9 from a few rectangles each (streets, the edge tiles the horde comes in at, parks, plazas, the
// safe zone, and any block that must be one kind of building), then fills in the rest: building kinds block by
// block, the windows and roofs a soldier can man, cars and barricades in the street, street clutter, and the waves.
// Every map is checked in the simulation before it is written. Run: node scripts/maps.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { World, ZOMBIE_KINDS, type BlockKind } from '../src/sim/world.ts';

type Rect = [x: number, y: number, w: number, h: number];
interface Plan {
  id: string;
  name: string;
  w: number;
  h: number;
  roads: Rect[];
  entries: Rect[]; // edge tiles of a road where the horde comes in
  parks?: Rect[]; // grass and trees, walked on
  plazas?: Rect[]; // paving, walked on
  safe: Rect;
  zones?: [...Rect, string][]; // buildings of one kind (they go over parks: a boathouse, a museum)
  water?: Rect[]; // a river, under everything else (a bridge is a road over it)
  paths?: [points: [number, number][], width: number, tile?: string][]; // roads (or a tile given) that bend and run on the slant, through these points
  ovals?: [cx: number, cy: number, rx: number, ry: number, tile: string][]; // laid after the plazas, in order
  edge?: string; // what open ground turns into at the map's edge where the horde does not come in (default buildings)
  lawn?: boolean; // the parks are mown lawn (striped), not rough grass
  trees?: number; // share of park tiles with a tree (default 0.22)
  groves?: Rect[]; // thick with trees, whatever `trees` says
  benches?: number; // share of plaza and park tiles with a bench (default 0.02)
  props?: [kind: BlockKind, tx: number, ty: number, vertical: boolean][]; // roadblocks put just here, before the random ones
  decor?: [kind: string, tx: number, ty: number][]; // things put just here: landmarks drawn whole over their tiles, fountains, flower beds
  helipad?: false; // no helipad on the safe zone (it has a landmark)
  billboards?: number; // video screens on the building fronts nearest the safe zone
  kinds: string; // building kinds to fill blocks with, more of a letter for more of that kind
  zombies: number;
  waves: number;
  mix?: Partial<Record<string, number>>; // more (or fewer) of a special kind than usual
  yards?: boolean; // crates and drums stacked on the paving (container yards), short of the safe zone
}

const PLANS: Plan[] = [
  {
    // An open park between two avenues: no buildings to shoot from in the middle, the horde comes through the trees.
    id: 'central-park', name: 'Central Park', w: 64, h: 80, kinds: 'aabbbo',
    parks: [[10, 6, 44, 44]],
    roads: [[4, 0, 6, 72], [54, 0, 6, 72], [29, 0, 6, 6], [10, 26, 44, 4], [4, 50, 56, 6], [29, 56, 6, 8]],
    plazas: [[14, 10, 36, 2], [14, 44, 36, 2], [14, 10, 2, 36], [48, 10, 2, 36], [31, 6, 2, 20], [4, 64, 56, 8]],
    zones: [[18, 14, 6, 4, 'h'], [38, 36, 8, 5, 'o'], [10, 0, 19, 6, 'a'], [35, 0, 19, 6, 'o'], [35, 56, 19, 8, 'm']],
    entries: [[4, 0, 6, 1], [29, 0, 6, 1], [54, 0, 6, 1]],
    safe: [4, 72, 56, 8],
    zombies: 4500, waves: 10,
  },
  {
    // A bridge over the Thames and nothing else: one long road end to end, walkways either side, two piers that
    // widen it. No windows: everyone fights in the open. Fast ones and jumpers.
    id: 'london', name: 'London', w: 40, h: 96, kinds: 'o', edge: '~',
    water: [[0, 0, 40, 96]],
    roads: [[16, 0, 8, 96]],
    plazas: [[14, 0, 2, 96], [24, 0, 2, 96], [11, 30, 18, 6], [11, 62, 18, 6]],
    entries: [[14, 0, 12, 1]],
    safe: [14, 88, 12, 8],
    zombies: 5000, waves: 10, mix: { fast: 1.3, jumper: 1.4 },
  },
  {
    // The White House on the far side of one wide mown lawn: the horde comes in off Pennsylvania Avenue, along the
    // whole north side, past the fountains, the walks, the gardens and the barricades left standing. Groves of trees
    // and the hedges down the sides; the drive curves up to the north portico. Armoured and heavy ones.
    id: 'white-house', name: 'White House', w: 64, h: 64, kinds: 'o', edge: 'f', lawn: true, trees: 0, benches: 0,
    roads: [[0, 0, 64, 4]], // Pennsylvania Avenue
    parks: [[0, 6, 64, 58]],
    groves: [[1, 7, 7, 38], [56, 7, 7, 38], [1, 45, 13, 12], [50, 45, 13, 12]],
    plazas: [[0, 4, 64, 2], [31, 6, 2, 24], [31, 36, 2, 12]], // the sidewalk; the walk down the middle
    ovals: [[32, 30, 15, 9, ','], [32, 30, 12.5, 6.5, 'l'], [32, 30, 3, 3, ','], [32, 54, 13, 6, ','], [32, 54, 10.5, 3.5, 'l']], // a ring of path round the fountain; the drive
    entries: [[0, 0, 64, 1]],
    safe: [20, 52, 24, 12],
    props: [['police', 10, 12, false], ['police', 22, 13, false], ['police', 40, 13, false], ['police', 52, 12, false], ['sandbags', 12, 44, false], ['sandbags', 49, 44, false]],
    decor: [
      ['whitehouse', 32, 57], ['fountain', 32, 30], ['helipad', 48, 21],
      ['flowers', 16, 59], ['flowers', 47, 59], ['flowers', 24, 47], ['flowers', 40, 47], // the Rose Garden, the East Garden, beds by the drive
      ...Array.from({ length: 10 }, (_, k): [string, number, number] => ['lamp', 3 + Math.round(k * 6.4), 4]),
      ['lamp', 31, 10], ['lamp', 32, 17], ['lamp', 31, 24], ['lamp', 32, 40], ['lamp', 31, 46],
      ['bench', 18, 30], ['bench', 46, 30], ['bench', 32, 22], ['bench', 32, 38],
    ],
    helipad: false,
    zombies: 5600, waves: 11, mix: { armored: 1.5, tanky: 1.4, brute: 1.4, bloater: 1.2 },
  },
  {
    // Via Labicana bent into an M: up from both feet at the bottom, over the two peaks and down into the safe zone
    // where they meet in the middle. The Colosseum and its pines sit between the peaks. Jumpers and clever ones.
    id: 'rome', name: 'Rome', w: 72, h: 64, kinds: 'bbaahh', trees: 0.3,
    paths: [[[[10, 64], [16, 9], [36, 38], [56, 9], [62, 64]], 7]],
    parks: [[22, 0, 28, 24]],
    roads: [[15, 46, 8, 3], [49, 46, 8, 3]],
    plazas: [[23, 44, 6, 7], [43, 44, 6, 7]],
    ovals: [[36, 14, 8, 6, 'r']],
    entries: [[0, 63, 72, 1]],
    safe: [32, 37, 8, 8],
    decor: [['colosseum', 36, 14]], helipad: false,
    zombies: 6200, waves: 11, mix: { jumper: 1.5, intelligent: 1.3, fast: 1.2 },
  },
  {
    // Two highways meet and run south as one wide boulevard, past car parks and a mall. Wide open; bosses.
    id: 'queens', name: 'Queens Interchange', w: 64, h: 80, kinds: 'hhggwo',
    roads: [[26, 0, 12, 68], [38, 18, 26, 10], [4, 12, 22, 4], [4, 12, 4, 56], [0, 30, 4, 4]],
    plazas: [[8, 40, 18, 14], [38, 28, 22, 16], [4, 68, 56, 4]],
    zones: [[40, 46, 20, 14, 'h'], [8, 56, 16, 8, 'g']],
    entries: [[26, 0, 12, 1], [63, 18, 1, 10], [0, 30, 1, 4]],
    safe: [4, 72, 56, 8],
    zombies: 7000, waves: 12, mix: { brute: 1.5, tanky: 1.3, fast: 1.2 },
  },
  {
    // The last stand, Shibuya: the safe zone in the middle of the scramble crossing, every road in Shibuya running
    // into it: Inokashira-dori from the north, Center Gai (on foot) and Meiji-dori on the slant, Bunkamura-dori from
    // the west, Dogenzaka up from the south-west, Miyamasuzaka from the east. Hachiko Square and the station, its
    // tracks on the roof, south of the crossing; video screens on the fronts round it. The horde from every side,
    // a long way out. Screamers and horde mothers.
    id: 'tokyo', name: 'Tokyo', w: 96, h: 96, kinds: 'hhhhoooa',
    roads: [[38, 38, 20, 20], // the scramble crossing
      [44, 0, 8, 38], [0, 44, 38, 8], [58, 44, 38, 7], [44, 68, 8, 28], // Inokashira-dori, Bunkamura-dori, Miyamasuzaka, south to Route 246
      [26, 26, 18, 3], [20, 52, 3, 18], [64, 33, 3, 11], [80, 51, 4, 45]], // back streets
    paths: [[[[38, 38], [22, 22], [16, 0]], 5, ','], [[[38, 57], [20, 70], [0, 84]], 6], [[[57, 38], [72, 26], [96, 20]], 6]], // Center Gai, Dogenzaka, Meiji-dori
    plazas: [[38, 58, 20, 10]], // Hachiko Square
    zones: [[60, 54, 18, 34, 's']], // Shibuya Station
    entries: [[0, 0, 96, 1], [0, 95, 96, 1], [0, 0, 1, 96], [95, 0, 1, 96]],
    safe: [44, 44, 8, 8],
    decor: [['scramble', 48, 48], ['rails', 68, 70], ['hachiko', 41, 63], ['tree', 39, 59], ['tree', 39, 66], ['tree', 56, 59], ['tree', 56, 66], ['tree', 47, 66]],
    billboards: 9,
    zombies: 8000, waves: 12, mix: { screamer: 1.5, hordemother: 1.5, armored: 1.2, intelligent: 1.2 },
  },
];

/** mulberry32, so a map comes out the same each run. */
const rng = (seed: number) => () => {
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seedOf = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7);
const WALK = '.,ptlSE';
const GROUND = '.,ptl'; // open ground: road, plaza, park, tree, lawn
const BUILDINGS = 'boghmwars';

function draw(p: Plan) {
  const r = rng(seedOf(p.id)), T = 16;
  const g = Array.from({ length: p.h }, () => Array<string>(p.w).fill('?'));
  const fill = ([x, y, w, h]: Rect, f: (x: number, y: number) => string) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (tx >= 0 && ty >= 0 && tx < p.w && ty < p.h) g[ty][tx] = f(tx, ty);
  };
  for (const wa of p.water ?? []) fill(wa, () => '~');
  const green = p.lawn ? 'l' : 'p';
  for (const pk of p.parks ?? []) fill(pk, () => (r() < (p.trees ?? 0.22) ? 't' : green));
  for (const gr of p.groves ?? []) fill(gr, () => (r() < 0.35 ? 't' : green));
  for (const rd of p.roads) fill(rd, () => '.');
  // A bent road: every tile whose middle is within half its width of the line through its points.
  const gap = (x: number, y: number, [ax, ay]: number[], [bx, by]: number[]) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  for (const [pts, width, tile = '.'] of p.paths ?? [])
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (pts.slice(1).some((b, k) => gap(x + 0.5, y + 0.5, pts[k], b) <= width / 2)) g[y][x] = tile;
  for (const pl of p.plazas ?? []) fill(pl, () => ',');
  for (const [cx, cy, rx, ry, tile] of p.ovals ?? [])
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g[y][x] = tile;
  for (const [x, y, w, h, kind] of p.zones ?? []) fill([x, y, w, h], () => kind);
  fill(p.safe, () => 'E');
  // Closed at the edges: ground walked on runs off the map only where the horde comes in (or into the safe zone).
  const before = g.map((row) => [...row]);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((!x || !y || x === p.w - 1 || y === p.h - 1) && GROUND.includes(g[y][x])) g[y][x] = p.edge ?? '?';
  for (const en of p.entries) fill(en, (x, y) => (GROUND.includes(before[y][x]) ? 'S' : g[y][x])); // only the ground in it

  // Each block of buildings is cut into lots of 6 to 12 tiles a side, each lot one kind.
  const seen = new Set<number>();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (g[y][x] !== '?' || seen.has(y * p.w + x)) continue;
      const tiles: number[] = [];
      for (const stack = [y * p.w + x]; stack.length; ) {
        const i = stack.pop()!, tx = i % p.w, ty = (i - tx) / p.w;
        if (tx < 0 || ty < 0 || tx >= p.w || ty >= p.h || seen.has(i) || g[ty][tx] !== '?') continue;
        seen.add(i);
        tiles.push(i);
        stack.push(i - 1, i + 1, i - p.w, i + p.w);
      }
      const xs = tiles.map((i) => i % p.w), ys = tiles.map((i) => Math.floor(i / p.w)), x0 = Math.min(...xs), y0 = Math.min(...ys);
      const cut = (from: number, span: number) => { const at = [from]; while (at.at(-1)! + 12 < from + span) at.push(at.at(-1)! + 6 + Math.floor(r() * 7)); return at; };
      const cols = cut(x0, Math.max(...xs) - x0 + 1), rows = cut(y0, Math.max(...ys) - y0 + 1), kind = new Map<string, string>();
      for (const i of tiles) {
        const tx = i % p.w, ty = (i - tx) / p.w, key = `${cols.filter((c) => c <= tx).at(-1)},${rows.filter((c) => c <= ty).at(-1)}`;
        if (!kind.has(key)) kind.set(key, p.kinds[Math.floor(r() * p.kinds.length)]);
        g[ty][tx] = kind.get(key)!;
      }
    }
  const rows = g.map((row) => row.join(''));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? '#' : rows[y][x]);
  const open = (x: number, y: number) => WALK.includes(at(x, y)) && at(x, y) !== 'S';
  const n4 = (x: number, y: number) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];

  // Windows and roofs: building tiles on a street front, a few tiles apart.
  const fronts: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (BUILDINGS.includes(at(x, y)) && n4(x, y).some(([a, b]) => open(a, b))) fronts.push([x, y]);
  for (let k = fronts.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [fronts[k], fronts[j]] = [fronts[j], fronts[k]]; }
  const slots: [number, number][] = [], most = Math.round((p.w * p.h) / 45);
  for (const [x, y] of fronts) if (slots.length < most && !slots.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) < 4)) slots.push([x, y]);

  // Cars, taxis, buses and barricades left in the street, along it, not near where the horde comes in or the safe zone.
  const map = { name: p.name, tile: T, par: 0, rows, slots, props: [] as { kind: string; tx: number; ty: number; vertical: boolean }[], decor: [] as { kind: string; x: number; y: number }[] };
  const world = new World(map, { gap: 0, waves: [] });
  const spawns = world.grid.spawns.map((i) => [i % p.w, Math.floor(i / p.w)]);
  const run = (x: number, y: number, dx: number, dy: number) => { let n = 0; while (at(x + dx * n, y + dy * n) === '.') n++; return n; };
  for (const [kind, tx, ty, vertical] of p.props ?? []) {
    if (!world.placeBlock(kind, tx, ty, vertical, false)) throw new Error(`${p.id}: no room for the ${kind} at ${tx},${ty}`);
    map.props.push({ kind, tx, ty, vertical });
  }
  const KINDS: BlockKind[] = ['car', 'car', 'car', 'car', 'taxi', 'taxi', 'taxi', 'bus', 'police', 'sandbags'];
  for (let tries = 0; tries < 2000 && map.props.length < Math.round((p.w * p.h) / 200); tries++) {
    const tx = Math.floor(r() * p.w), ty = Math.floor(r() * p.h), kind = KINDS[Math.floor(r() * KINDS.length)];
    if (at(tx, ty) !== '.' || spawns.some(([a, b]) => Math.hypot(a - tx, b - ty) < 12) || Math.hypot(tx - (p.safe[0] + p.safe[2] / 2), ty - (p.safe[1] + p.safe[3] / 2)) < Math.max(p.safe[2], p.safe[3]) / 2 + 6) continue;
    const vertical = kind === 'police' || kind === 'sandbags' ? r() < 0.5 : run(tx, ty, 0, 1) + run(tx, ty, 0, -1) > run(tx, ty, 1, 0) + run(tx, ty, -1, 0);
    const tiles = world.blockTiles(kind, tx, ty, vertical);
    if (!tiles?.every((i) => rows[Math.floor(i / p.w)][i % p.w] === '.') || map.props.some((o) => Math.hypot(o.tx - tx, o.ty - ty) < 6)) continue;
    if (!world.placeBlock(kind, tx, ty, vertical, false)) continue;
    // A crowd jams in a gap one tile wide: every way in keeps a way through two tiles wide.
    if (!wide(world)) { world.removeBlock(world.roadblocks.at(-1)!); continue; }
    map.props.push({ kind, tx, ty, vertical });
  }

  // Street clutter, each where it belongs (the painter skips anything that is not).
  const side = (x: number, y: number) => at(x, y) === '.' && n4(x, y).some(([a, b]) => BUILDINGS.includes(at(a, b)));
  const put = (kind: string, x: number, y: number, jitter = 4) => map.decor.push({ kind, x: Math.round((x + 0.5) * T + (r() - 0.5) * jitter), y: Math.round((y + 0.5) * T + (r() - 0.5) * jitter) });
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = at(x, y), q = r();
      if (side(x, y)) {
        if ((x + y) % 7 === 0 && q < 0.5) put('lamp', x, y, 0);
        else if (q < 0.015) put('hydrant', x, y);
        else if (q < 0.03) put('trash', x, y);
        else if (q < 0.038) put('dumpster', x, y, 2);
        else if (q < 0.048) put('bin', x, y);
        else if (q < 0.056) put('rubble', x, y);
      } else if (c === '.') {
        if (q < 0.01) put('manhole', x, y, 6);
        else if (q < 0.016) put('cone', x, y, 8);
        else if (q < 0.022) put('rubble', x, y, 8);
      } else if (c === 'p' && q < (0.1 * (p.trees ?? 0.22)) / 0.22) put('tree', x, y, 0);
      else if (c === ',' && y % 5 === 0 && n4(x, y).some(([a, b]) => at(a, b) === '~')) put('lamp', x, y, 0); // along a bridge
      else if ((c === ',' || c === 'p') && q < (p.benches ?? 0.02)) put('bench', x, y, 2);
      else if (c === ',' && p.yards && y < p.safe[1] - 5 && q < 0.09) put(q < 0.05 ? 'crate' : 'barrel', x, y, 6);
      else if (c === ',' && q < 0.03) put('bin', x, y);
      else if (c === 'g' && q < 0.03) put('wreck', x, y, 0);
      else if (BUILDINGS.includes(c) && n4(x, y).some(([a, b]) => open(a, b)) && q < 0.012) put(q < 0.006 ? 'barrel' : 'crate', x, y);
    }
  for (const [kind, x, y] of p.decor ?? []) put(kind, x, y, 0);
  if (p.helipad !== false) put('helipad', p.safe[0] + p.safe[2] / 2 - 0.5, p.safe[1] + p.safe[3] / 2 - 0.5, 0);
  // Video screens on the fronts nearest the safe zone, a few tiles apart.
  const mid = [p.safe[0] + p.safe[2] / 2, p.safe[1] + p.safe[3] / 2], screens: number[][] = [];
  for (const [x, y] of [...fronts].sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1])))
    if (screens.length < (p.billboards ?? 0) && !screens.some(([a, b]) => Math.hypot(a - x, b - y) < 5)) { screens.push([x, y]); put('billboard', x, y, 0); }

  // Checks: every way in leads to the safe zone, and every prop went down.
  for (const i of world.grid.spawns) if (!Number.isFinite(world.flow[i])) throw new Error(`${p.id}: no way from ${i % p.w},${Math.floor(i / p.w)} to the safe zone`);
  if (world.roadblocks.length !== map.props.length) throw new Error(`${p.id}: a prop did not fit`);
  return map;
}

/** Whether every way in still reaches the safe zone through ground two tiles wide, roadblocks counted as walls: walks
 *  the 2 by 2 squares of open ground out from the safe zone and checks each entry tile lies in one reached. */
function wide(world: World) {
  const { w, h, wall, block, goal, spawns } = world.grid, open = (i: number) => !wall[i] && !block[i];
  const sq = (x: number, y: number) => x >= 0 && y >= 0 && x < w - 1 && y < h - 1 && open(y * w + x) && open(y * w + x + 1) && open((y + 1) * w + x) && open((y + 1) * w + x + 1);
  const seen = new Uint8Array(w * h), queue: number[] = [];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) if (sq(x, y) && goal[y * w + x]) { seen[y * w + x] = 1; queue.push(y * w + x); }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (sq(nx, ny) && !seen[ny * w + nx]) { seen[ny * w + nx] = 1; queue.push(ny * w + nx); }
  }
  // A tile is in a reached square if any of the up to four squares holding it was reached.
  return spawns.every((i) => { const x = i % w, y = (i - x) / w; return [[x, y], [x - 1, y], [x, y - 1], [x - 1, y - 1]].some(([a, b]) => a >= 0 && b >= 0 && seen[b * w + a]); });
}

/** The waves: more each time, specials coming in one by one and growing, bosses in the second half. */
function waves(p: Plan) {
  const SPECIALS: [kind: string, from: number, share: number][] = [
    ['fast', 0, 0.14], ['jumper', 0.1, 0.05], ['armored', 0.2, 0.07], ['bloater', 0.2, 0.05], ['screamer', 0.3, 0.03], ['intelligent', 0.4, 0.04], ['tanky', 0.4, 0.05],
  ];
  const n = p.waves, weight = (k: number) => 0.6 + (0.8 * k) / (n - 1), sum = Array.from({ length: n }, (_, k) => weight(k)).reduce((a, b) => a + b);
  const out = [];
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1), total = Math.round((p.zombies * weight(k)) / sum), spawn: Record<string, number> = {};
    for (const [kind, from, share] of SPECIALS) if (f >= from) spawn[kind] = Math.round(total * share * (0.4 + 0.6 * f) * (p.mix?.[kind] ?? 1));
    if (f >= 0.5) spawn.hordemother = Math.round((2 + 3 * f) * (p.mix?.hordemother ?? 1));
    if (f >= 0.6) spawn.brute = Math.round((k === n - 1 ? 8 : 2 + 4 * f) * (p.mix?.brute ?? 1));
    spawn.normal = total - Object.values(spawn).reduce((a, b) => a + b, 0);
    out.push({ duration: Math.round(34 + 24 * f), spawn: Object.fromEntries(['normal', ...Object.keys(spawn).filter((z) => z !== 'normal')].map((z) => [z, spawn[z]])) });
  }
  return { gap: 8, waves: out };
}

const plans = JSON.parse(readFileSync('src/data/waves.json', 'utf8'));
for (const p of PLANS) {
  const map = draw(p), plan = waves(p), fight = plan.waves.reduce((t, w) => t + w.duration, 0) + plan.gap * (plan.waves.length - 1);
  if (plan.waves.some((w) => Object.keys(w.spawn).some((z) => !ZOMBIE_KINDS.includes(z)))) throw new Error('unknown zombie');
  map.par = Math.round((fight * 1.35) / 30) * 30;
  plans[p.id] = plan;
  writeFileSync(`src/data/maps/${p.id}.json`, JSON.stringify(map));
  console.log(`${p.id}: ${p.w}x${p.h}, ${map.slots.length} windows, ${map.props.length} props, ${map.decor.length} decor, ${p.zombies} zombies in ${p.waves} waves, par ${map.par}`);
}
// Written as before: a wave per line.
const line = (v: unknown) => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\}/g, ' }');
const blocks = Object.entries(plans as Record<string, { gap: number; waves: unknown[] }>).map(([id, pl]) =>
  `  "${id}": {\n    "gap": ${pl.gap},\n    "waves": [\n${pl.waves.map((w) => `      ${line(w)}`).join(',\n')}\n    ]\n  }`);
writeFileSync('src/data/waves.json', `{\n${blocks.join(',\n')}\n}\n`);
