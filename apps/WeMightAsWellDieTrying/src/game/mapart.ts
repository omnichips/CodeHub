// Paints a map once into one texture, tile by tile. Every tile is one kind, picked from its map letter and its
// neighbours: road (with lane lines, crosswalks, manholes), sidewalk (with a curb toward the road), plaza, grass,
// a tree on grass, the safe zone, or a roof; a roof tile on the edge of its building gets a parapet, and on the
// street side the building's wall; where two kinds of open ground meet at a corner, it is rounded off (a curb's curve,
// a lawn's). Each tile is painted clipped to its own square, so nothing (a tree, a crack, a
// splat of blood) ever spills into the next one. Building kinds have their own roofs and walls. Seeded per tile, so
// a map always looks the same.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { BUILDING, SOLIDS, distanceField, type Grid, type MapData } from '../sim/grid.ts';

const P = palette;
const LANES = 10; // the most lanes a road can have; wider than that both ways is a crossing
const SHADE = { rgb: [0, 0, 0], most: 1, over: 5 }; // roofs deep inside a block darken all the way to black, over 5 tiles (times the map's scale)
/** Each shanty and each casita its own colour: tin, rust, tarp; ochre, rose, teal. */
const PATCHES = { y: ['#6a5444', '#5b6970', '#7a4a3a', '#5f6a4f', '#857f73', '#3f5a7a', '#8a6a3a'], x: ['#b0704f', '#c49a4a', '#b06a78', '#4f8a86', '#8a9a4a', '#c08a5a'] };
type Front = 'brick' | 'glass' | 'shop' | 'deck' | 'clinic' | 'metal' | 'stone' | 'shack' | 'stucco';
interface Roof { base: string; dark: string; light: string; front: Front; texture: 'gravel' | 'panels' | 'deck' | 'clean' | 'ribs' | 'tin' | 'tiles' }
/** Each kind of building: its roof and the wall it shows the street. */
const ROOFS: Record<string, Roof> = {
  b: { base: '#3d3634', dark: '#2d2827', light: '#4d4441', front: 'brick', texture: 'gravel' }, // brownstones
  a: { base: '#36332f', dark: '#282623', light: '#46423c', front: 'brick', texture: 'gravel' }, // apartments, with a water tower
  h: { base: '#3e3b36', dark: '#2e2c28', light: '#4f4b44', front: 'shop', texture: 'gravel' }, // shops
  o: { base: '#3d4042', dark: '#2e3133', light: '#55595b', front: 'glass', texture: 'panels' }, // offices
  g: { base: '#4a4843', dark: '#3a3935', light: '#5a5852', front: 'deck', texture: 'deck' }, // a parking deck
  m: { base: '#7a776e', dark: '#68655d', light: '#8d897f', front: 'clinic', texture: 'clean' }, // the hospital
  w: { base: '#474c4c', dark: '#373b3b', light: '#5d6363', front: 'metal', texture: 'ribs' }, // warehouses
  r: { base: '#7d725d', dark: '#685f4d', light: '#948870', front: 'brick', texture: 'gravel' }, // old Roman stone
  s: { base: '#55585a', dark: '#45484a', light: '#6a6e70', front: 'glass', texture: 'panels' }, // a railway station
  k: { base: '#4a4946', dark: '#393836', light: '#5c5b57', front: 'stone', texture: 'gravel' }, // Chicago greystones, two flats each
  z: { base: '#2b2e32', dark: '#212327', light: '#3c4146', front: 'glass', texture: 'panels' }, // a skyscraper
  y: { base: '#6a5444', dark: '#4e3d31', light: '#87705c', front: 'shack', texture: 'tin' }, // shanties: tin, tarps and plywood
  x: { base: '#a8664a', dark: '#8a5039', light: '#c07a5a', front: 'stucco', texture: 'clean' }, // casitas, painted every colour
  c: { base: '#6b4a40', dark: '#563a32', light: '#82594c', front: 'stone', texture: 'gravel' }, // colonial red stone (tezontle)
  '#': { base: '#3b3d3f', dark: '#2c2e30', light: '#4c4e50', front: 'brick', texture: 'gravel' },
};

/** Each city's own look (by its name): every roof one kind (keeping each building's own wall), every roof a patch of
 *  its own colour, the ground cobbled or wet, and the street things only it has (see `cityProps` in paintMap). */
const LOOKS: Record<string, { roof?: Omit<Roof, 'front'>; patchy?: boolean; ground?: 'cobbles' | 'wet' }> = {
  Rome: { roof: { base: '#a4573a', dark: '#7a3c26', light: '#c8754e', texture: 'tiles' }, ground: 'cobbles' }, // terracotta, cobblestones
  Manila: { roof: { base: '#6a5444', dark: '#4e3d31', light: '#87705c', texture: 'tin' }, patchy: true }, // tin roofs, every one its own colour
  London: { ground: 'wet' }, // rain on the asphalt
};

/** A random stream seeded by a tile, so each tile looks the same every time it is painted. */
function rng(seed: number) {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (x: number, y: number, salt = 0) => Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ salt;

/** Something drawn on a map that the game brings to life (game/mapanims.ts, game/ambience.ts): where, and for some of
 *  them a sprite frame and its angle, where it heads (`to`, then on along `a` for `len`), how many go. */
export interface Drawn { kind: string; x: number; y: number; frame?: string; a?: number; to?: number[]; len?: number; n?: number }
/** The decor each painted map shows (some is left out: deep in a roof's shade, or where it does not belong). */
export const drawn = new Map<string, Drawn[]>();

/** Makes the map texture `key` (once) and returns it. `blood` is off when gore is set to none. */
export function paintMap(scene: Phaser.Scene, map: MapData, grid: Grid, key: string, blood: boolean) {
  if (scene.textures.exists(key)) return key;
  const { w, h, tile: T, wall, goal } = grid, W = w * T, H = h * T, S = map.scale ?? 1; // S tiles to one tile of the design
  const tex = scene.textures.createCanvas(key, W, H)!, c = tex.context;
  const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : map.rows[y][x]);
  const built = (x: number, y: number) => BUILDING.includes(ch(x, y));
  /** Is building tile (bx, by)'s corner toward (sx, sy) a lone jog in its front (the front steps back, then runs on
   *  straight), not a corner on the street nor a step of a staircase (a front on the slant)? */
  const loneJog = (bx: number, by: number, sx: number, sy: number) => {
    for (const [ax, ay, cx, cy] of [[-sx, 0, 0, sy], [0, -sy, sx, 0]]) { // the front stepping back along x, or along y
      let j = 1;
      while (j <= S && !built(bx + ax * j + cx, by + ay * j + cy)) j++;
      if (j > S) continue;
      const fx = bx + ax * j, fy = by + ay * j; // the building tile the front steps back to
      let straight = true;
      for (let m = 1; m <= 2 * S && straight; m++) if (!built(fx + cx * m, fy + cy * m) || built(fx + cx * m - ax, fy + cy * m - ay)) straight = false;
      if (straight) return true;
    }
    return false;
  };
  const rect = (col: string, x: number, y: number, ww: number, hh: number) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  const dot = (col: string, x: number, y: number, s = 1) => rect(col, Math.round(x), Math.round(y), s, s);
  const disc = (col: string, x: number, y: number, rr: number) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); };

  // ---- What each open tile is ----
  // Sidewalk: open street within S tiles of a building (diagonals too). Road: the rest of the open street.
  const side = new Uint8Array(w * h), road = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ch(x, y);
      if (t !== '.' && t !== 'S') continue;
      // Reaching a building on the slant counts only at its corner on the street (the sidewalk wraps round it), not at a
      // jog in its front: there the sidewalk jogs on the same row as the building does, so the two slant together.
      let near = false;
      for (let dy = -S; dy <= S && !near; dy++)
        for (let dx = -S; dx <= S && !near; dx++) {
          const bx = x + dx, by = y + dy, sx = -Math.sign(dx), sy = -Math.sign(dy); // (sx, sy): from the building toward here
          if (!built(bx, by)) continue;
          if (dx && dy && (built(bx + sx, by) || built(bx, by + sy))) continue; // not its corner: a closer tile of it counts
          near = !dx || !dy || !loneJog(bx, by, sx, sy);
        }
      (near ? side : road)[y * w + x] = 1;
    }
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && road[y * w + x] === 1;
  const isGreen = (x: number, y: number) => 'ptl'.includes(ch(x, y));
  /** The kinds of open ground whose corners round off where they meet ('' for the rest: buildings, water, the safe zone). */
  const ground = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || wall[y * w + x] || goal[y * w + x]) return '';
    return isGreen(x, y) ? 'green' : ch(x, y) === ',' ? 'plaza' : side[y * w + x] ? 'side' : road[y * w + x] ? 'road' : '';
  };
  const signals: { kind: string; x: number; y: number }[] = []; // traffic lights, at the corners of junctions
  const fires: Drawn[] = []; // on the roofs of buildings burning
  const extra: Drawn[] = []; // trees' crowns, the camp's helicopter or what waits there instead, to move
  const runX = (x: number, y: number) => { let a = x, b = x; while (isRoad(a - 1, y)) a--; while (isRoad(b + 1, y)) b++; return [a, b]; };
  const runY = (x: number, y: number) => { let a = y, b = y; while (isRoad(x, a - 1)) a--; while (isRoad(x, b + 1)) b++; return [a, b]; };
  /** Where two roads cross: the road runs on a long way both across and down. */
  /** Which way the road at tile (x, y) runs, for something parked along it: 0 east-west, π/2 north-south; undefined
   *  on a crossing (it runs both ways) or off the road. */
  const roadAngle = (x: number, y: number) => {
    if (!isRoad(x, y) || crossing(x, y)) return undefined;
    const [a1, b1] = runX(x, y), [a2, b2] = runY(x, y);
    return b2 - a2 > b1 - a1 ? Math.PI / 2 : 0;
  };
  /** How many tiles in a row (this one among them) the road at (x, y) runs on the same width: lane lines only on a
   *  stretch long enough to need them, not a stub of a few tiles where a lane opens out. */
  const evenFor = (x: number, y: number, vertical: boolean, ax: number, bx: number, ay: number, by: number) => {
    let n = 1;
    for (const d of [-1, 1])
      for (let k = 1; k <= 6 * S; k++) {
        const xx = vertical ? x : x + d * k, yy = vertical ? y + d * k : y;
        if (!isRoad(xx, yy) || (vertical ? runX(xx, yy).join() !== [ax, bx].join() : runY(xx, yy).join() !== [ay, by].join())) break;
        n++;
      }
    return n;
  };
  const crossing = (x: number, y: number) => { if (!isRoad(x, y)) return false; const [a1, b1] = runX(x, y), [a2, b2] = runY(x, y); return b1 - a1 >= LANES * S && b2 - a2 >= LANES * S; };

  // ---- Buildings: each connected block, and brownstones and shops cut into lots a few tiles wide ----
  const region = new Int32Array(w * h).fill(-1);
  let regions = 0;
  for (let i = 0; i < w * h; i++) {
    if (!wall[i] || region[i] >= 0) continue;
    for (const stack = [i]; stack.length; ) {
      const j = stack.pop()!, x = j % w, y = (j - x) / w;
      if (region[j] >= 0 || !wall[j] || ch(x, y) !== ch(i % w, Math.floor(i / w))) continue; // one kind of building per block
      region[j] = regions;
      if (x > 0) stack.push(j - 1);
      if (x < w - 1) stack.push(j + 1);
      if (y > 0) stack.push(j - w);
      if (y < h - 1) stack.push(j + w);
    }
    regions++;
  }
  const lot = (x: number, y: number) => {
    const t = ch(x, y), r = region[y * w + x];
    if (t === 'y') {
      // Shanties in rows, each row cut into roofs of its own width (2 to 4 tiles of the design) and offset: no grid.
      const row = Math.floor(y / (2 * S)), hash = Math.imul(row + 1, 2654435761) >>> 0, width = S * (2 + (hash % 3)), shift = (hash >>> 8) % width;
      return r * 1e6 + row * 1000 + Math.floor((x + shift) / width);
    }
    return t === 'b' || t === 'h' || t === 'k' ? Math.floor(x / (4 * S)) * 100000 + r : t === 'x' ? Math.floor(x / (3 * S)) * 100000 + r : r;
  };
  /** Whether the building's outside wall on side (dx, dy) of tile (x, y) runs on for only a step (4S tiles or less):
   *  part of a staircase on the slant, not a wall. */
  const shortWall = (x: number, y: number, dx: number, dy: number) => {
    // How far the wall runs on each way along that side, and what is past its end.
    const along = (d: number) => { let k = 1; while (k <= 4 * S) { const xx = x + (dy ? d * k : 0), yy = y + (dx ? d * k : 0); if (!built(xx, yy) || built(xx + dx, yy + dy)) break; k++; } return k; };
    const a = along(-1), b = along(1);
    if (a + b - 1 > 4 * S) return false;
    // A step: past an end the building carries on, stepped out (or the ground steps in), rather than turning a corner.
    const past = (d: number, k: number) => { const xx = x + (dy ? d * k : 0), yy = y + (dx ? d * k : 0); return built(xx + dx, yy + dy); };
    return past(-1, a) || past(1, b);
  };
  const patch = (x: number, y: number, list: string[]) => list[Math.abs(Math.imul(lot(x, y), 2654435761) >>> 7) % list.length];
  const same = (x: number, y: number, x2: number, y2: number) => built(x2, y2) && (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h || lot(x, y) === lot(x2, y2));

  // ---- The tiles ----
  const look = LOOKS[map.name] ?? {};
  /** Cobblestones: rounded setts in offset rows, worn lighter on top. */
  const cobbles = (px: number, py: number, r: () => number, tone: string, dark: string) => {
    rect(dark, px, py, T, T);
    for (let k = 0; k < T; k += 4) for (let j = (((py + k) / 4) % 2) * 2 - 2; j < T; j += 4) {
      rect(tone, px + j, py + k, 3, 3);
      if (r() < 0.5) dot('rgba(255,240,220,0.12)', px + j, py + k);
    }
  };
  const asphalt = (px: number, py: number, r: () => number) => {
    if (look.ground === 'cobbles') return cobbles(px, py, r, '#5a5650', '#3a3834');
    if (look.ground === 'wet') {
      // Wet asphalt: darker and blue, the sky in long streaks on it, now and then a puddle with a bright edge.
      rect('#262b31', px, py, T, T);
      for (let k = 0; k < 10; k++) dot(k % 2 ? '#1d2126' : '#30363d', px + r() * T, py + r() * T);
      if (r() < 0.5) rect('rgba(150,175,200,0.13)', px + ((r() * 14) | 0), py + ((r() * 6) | 0), 1, 6 + ((r() * 8) | 0));
      if (r() < 0.02) { disc('rgba(120,150,180,0.14)', px + 8, py + 8, 4 + r() * 2); rect('rgba(220,235,245,0.3)', px + 5, py + 5, 4, 1); }
      return;
    }
    rect(P.asphalt1, px, py, T, T);
    if (r() < 0.35) rect('rgba(0,0,0,0.08)', px + ((r() * 6) | 0), py + ((r() * 6) | 0), 6 + ((r() * 6) | 0), 6 + ((r() * 6) | 0)); // a darker patch
    for (let k = 0; k < 14; k++) dot(k % 3 ? P.asphalt0 : P.asphalt2, px + r() * T, py + r() * T);
  };
  const paveSlabs = (px: number, py: number, r: () => number, big: boolean) => {
    if (look.ground === 'cobbles' && big) return cobbles(px, py, r, '#8a7f6c', '#5e5648'); // Rome's piazze
    if (look.ground === 'wet') { rect(P.pave0, px, py, T, T); rect('#5c5f60', px + 1, py + 1, T - 2, T - 2); if (r() < 0.2) rect('rgba(150,175,200,0.15)', px + 3, py + 3, 6, 1); return; } // wet slabs
    rect(P.pave0, px, py, T, T);
    if (big) rect(P.pave1, px + 1, py + 1, T - 2, T - 2);
    else { rect(P.pave1, px + 1, py + 1, 7, 7); rect(P.pave1, px + 9, py + 1, 6, 7); rect(P.pave1, px + 1, py + 9, 7, 6); rect(P.pave1, px + 9, py + 9, 6, 6); }
    for (let k = 0; k < 6; k++) dot(r() < 0.5 ? P.pave0 : P.khaki1, px + r() * T, py + r() * T);
    if (r() < 0.2) for (let k = 0; k < 2 + r() * 3; k++) dot(r() < 0.5 ? P.olive1 : P.olive2, px + r() * T, py + r() * T, r() < 0.3 ? 2 : 1); // weeds
  };
  /** A curb on each side that meets the road: dark gutter, pale stone. */
  const curbs = (x: number, y: number, px: number, py: number) => {
    if (isRoad(x - 1, y)) { rect(P.asphalt0, px, py, 1, T); rect(P.cream, px + 1, py, 1, T); }
    if (isRoad(x + 1, y)) { rect(P.cream, px + T - 2, py, 1, T); rect(P.asphalt0, px + T - 1, py, 1, T); }
    if (isRoad(x, y - 1)) { rect(P.asphalt0, px, py, T, 1); rect(P.cream, px, py + 1, T, 1); }
    if (isRoad(x, y + 1)) { rect(P.cream, px, py + T - 2, T, 1); rect(P.asphalt0, px, py + T - 1, T, 1); }
  };
  const grass = (x: number, y: number, px: number, py: number, r: () => number) => {
    rect(P.olive0, px, py, T, T);
    for (let k = 0; k < 16; k++) dot(r() < 0.45 ? P.olive1 : r() < 0.6 ? P.rot0 : P.olive2, px + r() * T, py + r() * T, r() < 0.15 ? 2 : 1);
    // A stone edge where the grass meets anything that is not grass.
    if (!isGreen(x - 1, y) && !built(x - 1, y)) rect(P.pave1, px, py, 1, T);
    if (!isGreen(x + 1, y) && !built(x + 1, y)) rect(P.pave0, px + T - 1, py, 1, T);
    if (!isGreen(x, y - 1) && !built(x, y - 1)) rect(P.pave1, px, py, T, 1);
    if (!isGreen(x, y + 1) && !built(x, y + 1)) rect(P.pave0, px, py + T - 1, T, 1);
  };
  /** A tree's crown, inside one tile: a shadow, then rounded leaf clumps lit from the top-left. */
  const tree = (cx: number, cy: number, size: number, r: () => number) => {
    disc('rgba(0,0,0,0.35)', cx + 1.5, cy + 1.5, size);
    disc(P.olive0, cx, cy, size);
    disc(P.olive1, cx - size * 0.2, cy - size * 0.2, size * 0.75);
    disc(P.olive2, cx - size * 0.35, cy - size * 0.35, size * 0.4);
    disc(P.rot0, cx + size * 0.35, cy + size * 0.3, size * 0.35);
    for (let k = 0; k < 5; k++) dot(P.rot2, cx - size * 0.6 + r() * size, cy - size * 0.6 + r() * size);
  };
  /** A river: dark water with ripples drifting the same way, in the shadow of whatever stands beside it. */
  const water = (x: number, y: number, px: number, py: number, r: () => number) => {
    rect(P.teal0, px, py, T, T);
    for (let k = 0; k < 3; k++) if (r() < 0.6) rect(r() < 0.7 ? P.teal1 : P.teal2, px + ((r() * 10) | 0), py + ((r() * 15) | 0), 3 + ((r() * 4) | 0), 1);
    if (r() < 0.25) dot(P.navy0, px + r() * T, py + r() * T, 2);
    if (ch(x - 1, y) !== '~') rect('rgba(0,0,0,0.35)', px, py, 5, T);
    if (ch(x, y - 1) !== '~') rect('rgba(0,0,0,0.3)', px, py, T, 4);
  };
  /** A clipped hedge on a lawn's edge, one tile of it: rounded, lit from the top-left. */
  const hedge = (x: number, y: number, px: number, py: number, r: () => number) => {
    const h = (a: number, b: number) => ch(a, b) === 'f';
    rect('rgba(0,0,0,0.35)', px + 2, py + 2, T - 1, T - 1);
    rect(P.olive0, px + (h(x - 1, y) ? 0 : 2), py + (h(x, y - 1) ? 0 : 2), T - (h(x - 1, y) ? 0 : 2) - (h(x + 1, y) ? 0 : 2), T - (h(x, y - 1) ? 0 : 2) - (h(x, y + 1) ? 0 : 2));
    for (let k = 0; k < 14; k++) dot(r() < 0.5 ? P.olive1 : P.rot0, px + 2 + r() * (T - 4), py + 2 + r() * (T - 4), r() < 0.3 ? 2 : 1);
    for (let k = 0; k < 3; k++) dot(P.olive2, px + 2 + r() * (T - 4), py + 2 + r() * 5);
  };
  const roofTile = (x: number, y: number, px: number, py: number, r: () => number) => {
    const t = ch(x, y), own = ROOFS[t] ?? ROOFS['#'], roof: Roof = look.roof ? { ...look.roof, front: own.front } : own;
    const base = t === 'y' || t === 'x' ? patch(x, y, PATCHES[t]) : look.patchy ? patch(x, y, PATCHES.y) : roof.base;
    rect(base, px, py, T, T);
    if ((lot(x, y) * 37) % 5 === 1) rect('rgba(90,60,50,0.1)', px, py, T, T); // lots differ a little
    if (roof.texture === 'gravel') for (let k = 0; k < 20; k++) dot(r() < 0.55 ? roof.dark : roof.light, px + r() * T, py + r() * T);
    else if (roof.texture === 'panels') { rect(roof.dark, px, py + 7, T, 1); rect(roof.dark, px + 7, py, 1, T); rect(roof.light, px, py, T, 1); for (let k = 0; k < 6; k++) dot(roof.dark, px + r() * T, py + r() * T); }
    else if (roof.texture === 'deck') { for (let k = 0; k < 8; k++) dot(roof.dark, px + r() * T, py + r() * T); if (x % 3 === 0) rect(P.pave1, px + 1, py, 1, T); if (r() < 0.12) disc('rgba(0,0,0,0.25)', px + 4 + r() * 8, py + 4 + r() * 8, 2.5); } // bay lines, oil
    else if (roof.texture === 'clean') for (let k = 0; k < 6; k++) dot(r() < 0.6 ? roof.dark : roof.light, px + r() * T, py + r() * T);
    else if (roof.texture === 'tin') {
      const across = lot(x, y) % 2 === 0;
      for (let k = 0; k < T; k += 2) rect('rgba(0,0,0,0.18)', across ? px + k : px, across ? py : py + k, across ? 1 : T, across ? T : 1);
      if (r() < 0.25) disc('rgba(90,40,20,0.35)', px + r() * T, py + r() * T, 2 + r() * 3); // rust
      if (r() < 0.08) { disc(P.outline, px + 4 + r() * 8, py + 4 + r() * 8, 3); } // a tyre holding it down
      else if (r() < 0.1) dot(P.pave1, px + 3 + r() * 10, py + 3 + r() * 10, 2); // a stone
      if (r() < 0.06) rect([P.navy1, P.teal1, P.red1, P.flash1][(r() * 4) | 0], px + r() * 6, py + r() * 6, 6 + r() * 6, 5 + r() * 6); // a tarp
    }
    else if (roof.texture === 'tiles') {
      // Terracotta: rows of curved tiles, each row's lip in shadow, the joints offset row to row.
      for (let k = 0; k < T; k += 4) {
        rect(roof.dark, px, py + k + 3, T, 1);
        for (let j = ((y * T + k) / 4) % 2 ? 0 : 2; j < T; j += 4) { rect(roof.light, px + j, py + k, 1, 3); rect(roof.dark, px + j + 3, py + k + 1, 1, 2); }
      }
      if (r() < 0.06) rect('rgba(60,40,30,0.3)', px + r() * 10, py + r() * 10, 4, 3); // a tile cracked or slipped
    }
    else for (let k = 0; k < T; k += 3) { rect(roof.light, px + k, py, 1, T); rect(roof.dark, px + k + 1, py, 1, T); } // corrugated ribs
    // An edge that is one step of a staircase (the building on the slant) gets no parapet or wall of its own: the slant
    // cut across its steps draws its edge (see the corners below), and the steps' own would show as teeth.
    const step = (dx: number, dy: number) => !built(x + dx, y + dy) && shortWall(x, y, dx, dy);
    const edgeN = !same(x, y, x, y - 1) && !step(0, -1), edgeS = !same(x, y, x, y + 1) && !step(0, 1), edgeW = !same(x, y, x - 1, y) && !step(-1, 0), edgeE = !same(x, y, x + 1, y) && !step(1, 0);
    // A parapet where the roof ends: lit on the top and left, in shade on the bottom and right. Shanties have none,
    // only a dark seam where one tin roof meets the next.
    if (t === 'y') {
      if (edgeN) rect('rgba(0,0,0,0.45)', px, py, T, 1);
      if (edgeW) rect('rgba(0,0,0,0.45)', px, py, 1, T);
    } else {
      if (edgeN) { rect(P.cream, px, py, T, 2); rect(P.outline, px, py + 2, T, 1); }
      if (edgeW) { rect(P.cream, px, py, 2, T); rect(P.outline, px + 2, py, 1, T); }
      if (edgeS) rect(P.pave0, px, py + T - 2, T, 2);
      if (edgeE) rect(P.pave0, px + T - 2, py, 2, T);
    }
    if (!built(x, y + 1) && !step(0, 1)) wallFace(roof.front, x, px, py, r);
    else if (!edgeN && !edgeS && !edgeW && !edgeE && roof.texture !== 'deck') clutter(px, py, r);
    if (roof.texture === 'ribs' && !edgeN && !edgeS && (x + y * 3) % 7 === 0) { rect(P.outline, px + 3, py + 4, 10, 8); rect(P.cloth1, px + 4, py + 5, 8, 6); rect(P.cloth2, px + 4, py + 5, 8, 1); } // a skylight
  };
  /** The building's wall on the street side, seen just below its roof edge. */
  const wallFace = (front: Front, x: number, px: number, py: number, r: () => number) => {
    const y0 = py + T - 6;
    if (front === 'brick' || front === 'shop') {
      rect(P.blood0, px, y0, T, 6);
      for (let k = 0; k < 4; k++) rect(P.blood1, px + k * 4 + (x % 2) * 2, y0 + 1, 3, 1);
      rect(P.outline, px + 3, y0 + 2, 3, 3); rect(P.outline, px + 10, y0 + 2, 3, 3); rect(P.cloth1, px + 3, y0 + 2, 1, 1);
      if (r() < 0.15) rect(P.metal1, px + 6, y0 + 1, 5, 5); // a door or shutter
      if (front === 'shop') for (let k = 0; k < 4; k++) rect(k % 2 ? P.cream : [P.red1, P.olive2, P.teal1][Math.floor(x / (4 * S)) % 3], px + k * 4, y0 - 2, 4, 2); // the awning
    } else if (front === 'glass') {
      rect(P.navy1, px, y0, T, 6); rect(P.navy2, px, y0, T, 1);
      for (let k = 0; k < T; k += 4) rect(P.metal0, px + k, y0, 1, 6); // mullions
    } else if (front === 'deck') {
      rect(P.pave0, px, y0, T, 6); rect(P.outline, px + 2, y0 + 2, 12, 2);
    } else if (front === 'clinic') {
      rect(P.snow1, px, y0, T, 6); rect(P.snow2, px, y0, T, 1);
      rect(P.cloth1, px + 3, y0 + 2, 3, 2); rect(P.cloth1, px + 10, y0 + 2, 3, 2);
      if (x % (6 * S) === 0) { rect(P.red1, px + 7, y0 + 1, 2, 4); rect(P.red1, px + 6, y0 + 2, 4, 2); }
    } else if (front === 'stone') {
      // Dressed stone, a tall window in each bay.
      rect(P.pave0, px, y0, T, 6); rect(P.pave1, px, y0, T, 1);
      for (let k = 0; k < T; k += 4) rect('rgba(0,0,0,0.15)', px + k, y0 + 3, 1, 3);
      rect(P.outline, px + 4, y0 + 1, 2, 4); rect(P.outline, px + 11, y0 + 1, 2, 4);
    } else if (front === 'shack') {
      // Plywood and tin nailed up: no two boards alike, a curtain for a door.
      for (let k = 0; k < T; k += 4) rect([P.brown0, P.brown1, P.metal1, P.rust, P.khaki0][(r() * 5) | 0], px + k, y0, 4, 6);
      if (r() < 0.3) rect([P.red1, P.teal1, P.flash1][(r() * 3) | 0], px + 5, y0 + 1, 5, 5);
    } else if (front === 'stucco') {
      // Painted plaster, a dark window and a door.
      rect(patch(x, py / T, PATCHES.x), px, y0, T, 6); rect('rgba(255,255,255,0.12)', px, y0, T, 1);
      rect(P.outline, px + 3, y0 + 2, 3, 2); if (x % 3 === 1) rect(P.brown0, px + 9, y0 + 1, 4, 5);
    } else {
      rect(P.urban0, px, y0, T, 6);
      for (let k = 0; k < T; k += 2) rect(P.urban1, px + k, y0, 1, 6);
      if (x % 5 === 0) { rect(P.metal1, px + 2, y0 + 1, 12, 5); for (let k = 0; k < 5; k += 2) rect(P.metal0, px + 2, y0 + 1 + k, 12, 1); } // a roller door
    }
    rect(P.outline, px, py + T - 1, T, 1);
  };
  /** Things on a roof, away from its rims: AC units, vents, pipes, tar patches, moss. */
  const clutter = (px: number, py: number, r: () => number) => {
    const roll = r();
    if (roll < 0.07) { rect(P.outline, px + 2, py + 3, 12, 10); rect(P.metal2, px + 2, py + 3, 11, 9); c.strokeStyle = P.metal0; c.beginPath(); c.arc(px + 5.5, py + 7.5, 2.5, 0, 7); c.arc(px + 10, py + 7.5, 2.5, 0, 7); c.stroke(); }
    else if (roll < 0.11) { rect(P.outline, px + 4, py + 4, 8, 7); rect(P.metal1, px + 4, py + 4, 7, 6); rect(P.metal2, px + 5, py + 5, 5, 1); }
    else if (roll < 0.14) { rect(P.metal2, px + 2, py + 7, 12, 2); rect(P.outline, px + 2, py + 9, 12, 1); }
    else if (roll < 0.17) { rect(P.outline, px + 3, py + 3, 10, 10); rect(P.cloth0, px + 4, py + 4, 8, 8); rect(P.cloth1, px + 4, py + 4, 8, 2); }
    else if (roll < 0.3) for (let k = 0; k < 3 + r() * 6; k++) dot(r() < 0.6 ? P.olive1 : P.olive2, px + 1 + r() * (T - 2), py + 1 + r() * (T - 2), r() < 0.3 ? 2 : 1);
  };

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ch(x, y), i = y * w + x, px = x * T, py = y * T, r = rng(seedOf(x, y));
      c.save();
      c.beginPath();
      c.rect(px, py, T, T);
      c.clip(); // this tile only
      if (t === '~') water(x, y, px, py, r);
      else if (t === 'f') { grass(x, y, px, py, r); hedge(x, y, px, py, r); }
      else if (wall[i]) roofTile(x, y, px, py, r);
      else if (goal[i]) {
        rect(P.pave0, px, py, T, T);
        rect('#545049', px + 1, py + 1, T - 2, T - 2);
        if ((x + y) % 2) dot(P.pave1, px + 4 + r() * 8, py + 4 + r() * 8);
        // A chain-link fence round the camp wherever it meets the street: posts, a rail, the mesh.
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || goal[ny * w + nx] || wall[ny * w + nx]) continue;
          const fx = dx > 0 ? px + T - 3 : px, fy = dy > 0 ? py + T - 3 : py, across = dy !== 0;
          rect('rgba(150,156,154,0.28)', fx, fy, across ? T : 3, across ? 3 : T);
          rect(P.metal2, fx + (across ? 0 : 1), fy + (across ? 1 : 0), across ? T : 1, across ? 1 : T);
          for (let k = 0; k < T; k += 8) rect(P.outline, across ? px + k : fx, across ? fy : py + k, across ? 2 : 3, across ? 3 : 2);
        }
      } else if (t === 'p') grass(x, y, px, py, r);
      else if (t === 'l') { grass(x, y, px, py, r); rect(Math.floor(x / (2 * S)) % 2 ? 'rgba(234,223,174,0.05)' : 'rgba(0,0,0,0.08)', px, py, T, T); } // mown in stripes
      else if (t === 't') grass(x, y, px, py, r); // its tree is drawn after the tiles, two tiles across
      else if (t === ',') { paveSlabs(px, py, r, true); curbs(x, y, px, py); }
      else if (side[i]) { paveSlabs(px, py, r, false); curbs(x, y, px, py); }
      else {
        asphalt(px, py, r);
        // A stretch of road is S tiles per lane across. It shows them all: a solid line down the middle, dashes between
        // the rest; the S tiles next to a crossing get a crosswalk instead, and a crossing has no lanes.
        const [ax, bx] = runX(x, y), [ay, by] = runY(x, y), across = bx - ax + 1, down = by - ay + 1;
        const vertical = across <= LANES * S && down > across, flat = down <= LANES * S && across > down;
        const near = (f: (d: number) => boolean) => { for (let d = 1; d <= S; d++) if (f(d)) return true; return false; };
        // (A road on the slant, its edges stepping, is left unmarked.)
        const straight = vertical ? [y - S, y + S].every((yy) => !isRoad(x, yy) || runX(x, yy).join() === [ax, bx].join()) : [x - S, x + S].every((xx) => !isRoad(xx, y) || runY(xx, y).join() === [ay, by].join());
        // A crosswalk only where the road runs straight on, away from the crossing (not in a wide bend on the slant, whose
        // stepping rows count as crossing one row and not the next).
        // (Checked 4S tiles on: a slant's steps can run that long.)
        const into = (dx: number, dy: number) => near((d) => crossing(x + dx * d, y + dy * d)) && [S, 2 * S, 3 * S, 4 * S].every((k) => isRoad(x - dx * k, y - dy * k) && !crossing(x - dx * k, y - dy * k) &&
          (dx ? runY(x - dx * k, y).join() === [ay, by].join() : runX(x, y - dy * k).join() === [ax, bx].join()));
        if (vertical && (into(0, -1) || into(0, 1))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 1, py + 2 + k * 5, T - 2, 2);
        else if (flat && (into(-1, 0) || into(1, 0))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 2 + k * 5, py + 1, 2, T - 2);
        else if ((vertical || flat) && straight && (vertical ? across : down) >= 2 * S && evenFor(x, y, vertical, ax, bx, ay, by) >= 6 * S) {
          // Marked as a two-way road: an even number of lanes about S tiles wide each, a double yellow line down the very
          // middle, white dashes between the lanes each way. An alley narrower than two lanes has none.
          const [a, b, along] = vertical ? [ax, bx, y] : [ay, by, x], width = (b - a + 1) * T, lanes = Math.max(2, Math.round((b - a + 1) / S / 2) * 2);
          const mark = (pos: number, col: string, dashed: boolean) => {
            const o = Math.floor(pos) - (vertical ? px : py);
            if (o < 0 || o >= T) return; // not on this tile
            let from = 0, to = T;
            if (dashed) { // half a stretch of 2S tiles on, the rest off
              if (Math.floor(along / S) % 2) return;
              const p0 = (along % S) * T;
              from = Math.max(0, 4 * S - p0);
              to = Math.min(T, 12 * S - p0);
              if (to <= from) return;
            }
            if (vertical) rect(col, px + o, py + from, 1, to - from);
            else rect(col, px + from, py + o, to - from, 1);
          };
          const mid = a * T + width / 2;
          mark(mid - 2, P.flash0, false);
          mark(mid + 1, P.flash0, false);
          for (let k = 1; k < lanes; k++) if (k !== lanes / 2) mark(a * T + (k * width) / lanes, P.snow1, true);
        }
        if (r() < 0.12) { // a crack, kept inside the tile
          c.strokeStyle = 'rgba(15,16,17,0.75)';
          c.beginPath();
          let cx = px + 3 + r() * 10, cy = py + 3 + r() * 10;
          c.moveTo(cx, cy);
          for (let s = 0, a = r() * 6.3; s < 5; s++) { a += (r() - 0.5) * 1.6; cx += Math.cos(a) * 2.5; cy += Math.sin(a) * 2.5; c.lineTo(Math.round(cx) + 0.5, Math.round(cy) + 0.5); }
          c.stroke();
        }
      }
      // A stone parapet where a bridge or a quay meets the water.
      if (!wall[i]) {
        if (ch(x - 1, y) === '~') { rect(P.outline, px, py, 3, T); rect(P.cream, px, py, 2, T); }
        if (ch(x + 1, y) === '~') { rect(P.outline, px + T - 3, py, 3, T); rect(P.pave1, px + T - 2, py, 2, T); }
        if (ch(x, y - 1) === '~') { rect(P.outline, px, py, T, 3); rect(P.cream, px, py, T, 2); }
        if (ch(x, y + 1) === '~') { rect(P.outline, px, py + T - 3, T, 3); rect(P.pave1, px, py + T - 2, T, 2); }
      }
      // Buildings and trees throw shade down and to the right, onto the tile beside them: dark close by, softer out.
      if (!wall[i]) {
        if (built(x - 1, y)) { rect('rgba(0,0,0,0.32)', px, py, 6, T); rect('rgba(0,0,0,0.14)', px + 6, py, 5, T); }
        if (built(x, y - 1)) { rect('rgba(0,0,0,0.32)', px, py, T, 5); rect('rgba(0,0,0,0.14)', px, py + 5, T, 4); }
        if (ch(x - 1, y) === 't' && t !== 't') rect('rgba(0,0,0,0.18)', px, py + 4, 2, 9);
      }
      // Litter, and old blood if gore is on.
      if (!wall[i] && !goal[i]) {
        for (let k = 0; k < 2; k++) if (r() < 0.3) dot([P.khaki1, P.cloth2, P.paint, P.rust, P.metal2][(r() * 5) | 0], px + r() * T, py + r() * T, r() < 0.25 ? 2 : 1);
        if (blood && r() < 0.025) for (let s = 0; s < 4 + r() * 5; s++) disc(r() < 0.5 ? P.blood0 : P.blood1, px + 3 + r() * 10, py + 3 + r() * 10, 0.8 + r() * 2);
      }
      c.restore();
    }

  // ---- Corners, where two kinds of ground meet (buildings counting as one), so they join up and do not look tiled ----
  // A staircase edge (a street or path on the slant, built of tiles) has every step's corner cut from halfway along one
  // edge to halfway along the other, on both kinds' corners: the cuts meet at each edge's middle, so they join into one
  // slant whatever the steps' lengths (a slope that is not 45° steps 2, 1, 2...). A real corner (its edges longer than S tiles) is cut S tiles
  // back on the slant, or, a building's, rounded off (only drawn: the building still stands to its square corner). The
  // other kind fills the cut, edged with a curb or a stone rim; a sidewalk's corner at a junction gets a traffic light.
  const kindOf = (x: number, y: number) => (built(x, y) && x >= 0 && y >= 0 && x < w && y < h ? 'house' : ground(x, y));
  /** Tile (tx, ty) painted as kind B, as its neighbour (bx, by), of map letter `cc`, is (a lawn keeps its mown stripes,
   *  a roof its building's look). */
  const fill = (cc: string, B: string, tx: number, ty: number, r: () => number, bx: number, by: number) => {
    const qx = tx * T, qy = ty * T;
    if (B === 'house') roofTile(bx, by, qx, qy, r);
    else if (B === 'road') asphalt(qx, qy, r);
    else if (B === 'green') {
      grass(tx, ty, qx, qy, r);
      if (cc === 'l') rect(Math.floor(tx / (2 * S)) % 2 ? 'rgba(234,223,174,0.05)' : 'rgba(0,0,0,0.08)', qx, qy, T, T);
    } else paveSlabs(qx, qy, r, B === 'plaza');
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const A = kindOf(x, y);
      if (!A || ch(x, y) === 't') continue;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const B = kindOf(x + sx, y);
        // B on both sides of the corner, and past it on the slant (a jog's corner may have a building there instead).
        const D = kindOf(x + sx, y + sy);
        if (!B || B === A || kindOf(x, y + sy) !== B || D === A) continue;
        if ((A === 'side' && B === 'plaza') || (A === 'plaza' && B === 'side')) continue; // one paving
        // How far each edge runs back from the corner with B beside it, and whether it then steps out (a staircase).
        let lx = 0, ly = 0;
        // (A step runs up to STEP tiles; a building's, on a gentle slope, up to twice that.)
        const STEP = A === 'house' || B === 'house' ? 4 * S : 2 * S;
        while (lx <= STEP && kindOf(x - sx * lx, y) === A && kindOf(x - sx * lx, y + sy) === B) lx++;
        while (ly <= STEP && kindOf(x, y - sy * ly) === A && kindOf(x + sx, y - sy * ly) === B) ly++;
        const stepX = lx <= STEP && kindOf(x - sx * lx, y + sy) === A, stepY = ly <= STEP && kindOf(x + sx, y - sy * ly) === A;
        const stair = stepX && stepY;
        // A step is cut its whole length each way, so the slant matches the staircase's slope. A lone jog (an edge that
        // shifts sideways: a short edge between two long ones) has two corners, one each way; each is cut half the
        // jog back along both edges, so the two cuts meet in one slant across the middle of the jog. Every edge of a
        // street (curb, building line) jogging together then slants across the same rows, keeping its width.
        const jog = !stair && ((stepX && ly > STEP) || (stepY && lx > STEP)), round = A === 'house' && !stair && !jog;
        if (D !== B && !jog) continue;
        if (B === 'house' && !jog && !stair) continue; // a building only gives way to the ground at a jog's other corner, or on a slant
        const half = (stepX ? lx : ly) / 2;
        const cx = stair ? lx / 2 : jog ? half : Math.min(lx, S), cy = stair ? ly / 2 : jog ? half : Math.min(ly, S);
        const px = (sx > 0 ? x + 1 : x) * T, py = (sy > 0 ? y + 1 : y) * T; // the corner point
        const ax = px - sx * cx * T, by = py - sy * cy * T; // the cut's ends, back along each edge
        const R = S * T, ox = px - sx * R, oy = py - sy * R; // a rounded corner's centre
        // B painted over each tile the cut reaches, clipped to the cut.
        // (A slant's cut also reaches 3 px past its old edges into B's tiles, over the curb or parapet B drew along them.)
        for (let ky = round ? 0 : -1; ky < (round ? S : cy); ky++)
          for (let kx = round ? 0 : -1; kx < (round ? S : cx); kx++) {
            const tx = x - sx * kx, ty = y - sy * ky, r = rng(seedOf(tx, ty, 29));
            c.save();
            c.beginPath();
            c.rect(tx * T, ty * T, T, T);
            c.clip();
            c.beginPath();
            if (round) { c.rect(Math.min(px, ox), Math.min(py, oy), R, R); c.arc(ox, oy, R, 0, Math.PI * 2); c.clip('evenodd'); }
            else { c.moveTo(ax, py); c.lineTo(ax, py + sy * 3); c.lineTo(px + sx * 3, py + sy * 3); c.lineTo(px + sx * 3, by); c.lineTo(px, by); c.closePath(); c.clip(); }
            fill(ch(x + sx, y), B, tx, ty, r, x + sx, y);
            c.restore();
          }
        c.lineWidth = 1;
        if (round) {
          // The parapet round the curve: dark outside, its stone inside.
          c.save();
          c.beginPath();
          c.rect(Math.min(px, ox), Math.min(py, oy), R, R);
          c.clip();
          for (const [rr, col] of [[R - 0.5, P.outline], [R - 2, P.cream], [R - 3, P.outline]] as const) { c.strokeStyle = col; c.beginPath(); c.arc(ox, oy, rr, 0, Math.PI * 2); c.stroke(); }
          c.restore();
          continue;
        }
        // Along the slant: the outline of a building's edge, or a curb's gutter and stone, or a stone rim.
        const len = Math.hypot(ax - px, by - py), nx = (sx * cy) / Math.hypot(cx, cy), ny = (sy * cx) / Math.hypot(cx, cy); // the way to B
        const edge = (off: number, col: string) => { c.strokeStyle = col; c.beginPath(); c.moveTo(ax + nx * off, py + ny * off); c.lineTo(px + nx * off, by + ny * off); c.stroke(); };
        if (len < 1) continue;
        if (A === 'house') { edge(-0.5, P.outline); edge(-2, P.cream); }
        else if (B === 'house') { edge(0.5, P.outline); edge(2, P.cream); }
        else if (A === 'road' || B === 'road') { edge(A === 'road' ? -0.7 : 0.7, P.asphalt0); edge(A === 'road' ? 0.7 : -0.7, P.cream); }
        else edge(0, P.pave1);
        if (A === 'side' && B === 'road' && !stair && crossing(x + sx, y + sy)) signals.push({ kind: sx === sy ? 'signal' : 'signal2', x: px - sx * R * 0.75 - 1, y: py - sy * R * 0.75 });
      }
    }

  // ---- Whole-building features, each placed inside one building ----
  const atlas = scene.textures.get('sprites').getSourceImage() as HTMLImageElement;
  const stamp = (frame: string, x: number, y: number, angle: number, darken: number) => {
    const f = scene.textures.getFrame('sprites', frame), tmp = document.createElement('canvas');
    tmp.width = f.width;
    tmp.height = f.height;
    const t = tmp.getContext('2d')!;
    t.drawImage(atlas, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);
    if (darken) { t.globalCompositeOperation = 'source-atop'; t.fillStyle = `rgba(18,16,15,${darken})`; t.fillRect(0, 0, f.width, f.height); }
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.drawImage(tmp, -f.width / 2, -f.height / 2);
    c.restore();
  };
  /** Is every tile in the box, plus a tile all round it, roof of this same building? */
  const inside = (x0: number, y0: number, x1: number, y1: number, l: number) => {
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (!built(x, y) || lot(x, y) !== l) return false;
    return true;
  };
  const seen = new Set<number>(), landmarks: (() => void)[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!built(x, y) || seen.has(lot(x, y))) continue;
      const l = lot(x, y), t = ch(x, y), r = rng(seedOf(x, y, 7));
      seen.add(l);
      const tiles: [number, number][] = [];
      for (let yy = y; yy < Math.min(h, y + 40); yy++) for (let xx = Math.max(0, x - 40); xx < Math.min(w, x + 40); xx++) if (built(xx, yy) && lot(xx, yy) === l) tiles.push([xx, yy]);
      const mid = [Math.round(tiles.reduce((n, p) => n + p[0], 0) / tiles.length), Math.round(tiles.reduce((n, p) => n + p[1], 0) / tiles.length)];
      if (t === 'm' && inside(mid[0] - S, mid[1] - S, mid[0] + S, mid[1] + S, l)) {
        // The hospital's roof: a big red cross on a white square. A landmark: painted whole, over the roof.
        const cx = (mid[0] + 0.5) * T, cy = (mid[1] + 0.5) * T, u = S;
        landmarks.push(() => {
          rect(P.snow1, cx - 22 * u, cy - 22 * u, 44 * u, 44 * u); rect(P.snow2, cx - 22 * u, cy - 22 * u, 44 * u, 2 * u);
          rect(P.red1, cx - 6 * u, cy - 18 * u, 12 * u, 36 * u); rect(P.red1, cx - 18 * u, cy - 6 * u, 36 * u, 12 * u); rect(P.red2, cx - 6 * u, cy - 18 * u, 12 * u, 2 * u); rect(P.red2, cx - 18 * u, cy - 6 * u, 2 * u, 12 * u);
        });
      } else if (t === 'z' && tiles.length > 30) {
        // A tower's top: its plant room on the roof and two masts.
        const xs = tiles.map((p) => p[0]), ys = tiles.map((p) => p[1]), L = Math.min(...xs) * T, R = (Math.max(...xs) + 1) * T, Tp = Math.min(...ys) * T, B = (Math.max(...ys) + 1) * T;
        landmarks.push(() => {
          rect(P.outline, L + 3, Tp + 3, R - L - 6, B - Tp - 9); rect(ROOFS.z.light, L + 4, Tp + 4, R - L - 8, B - Tp - 11);
          rect(ROOFS.z.base, L + 10, Tp + 10, R - L - 20, B - Tp - 23);
          for (let k = L + 14; k < R - 14; k += 8) rect(ROOFS.z.dark, k, Tp + 12, 4, B - Tp - 27); // panels
          const cx = (L + R) / 2, cy = (Tp + B) / 2 - 3;
          rect(P.outline, cx - 15, cy - 11, 30, 22); rect(P.metal1, cx - 14, cy - 10, 28, 20); rect(P.metal2, cx - 14, cy - 10, 28, 2); // the plant room
          for (const dx of [-8, 8]) { disc('rgba(0,0,0,0.4)', cx + dx + 2, cy + 2, 3); disc(P.snow2, cx + dx, cy, 2.5); dot(P.red2, cx + dx, cy - 1, 1); } // the masts, lit red
        });
      } else if (t === 'a') {
        // A water tower on its legs, somewhere well inside the roof.
        const spot = tiles.find(([xx, yy]) => inside(xx, yy, xx, yy, l) && r() < 0.3);
        if (spot) {
          const cx = (spot[0] + 0.5) * T, cy = (spot[1] + 0.5) * T;
          disc('rgba(0,0,0,0.35)', cx + 3, cy + 3, 9);
          disc(P.brown0, cx, cy, 9); disc(P.brown1, cx - 1, cy - 1, 7.5); disc(P.brown2, cx - 3, cy - 3, 3);
          c.strokeStyle = P.metal1; c.beginPath(); c.arc(cx, cy, 5, 0, 7); c.stroke();
        }
      } else if (t === 'g') {
        // Cars left on the deck, side by side in its bays; a few burned out.
        const deck = (xx: number, yy: number) => { for (let y2 = yy; y2 <= yy + 2; y2++) for (let x2 = xx; x2 <= xx + 1; x2++) if (!built(x2, y2) || lot(x2, y2) !== l) return false; return true; };
        for (const [xx, yy] of tiles) if (xx % 2 === 1 && yy % 4 === 1 && deck(xx, yy) && r() < 0.7) stamp(`car/${(xx + yy) % 3}`, (xx + 1) * T, (yy + 1.5) * T, Math.PI / 2, r() < 0.25 ? 0.6 : 0.12);
      }
      // Some buildings have burned out, and some are burning still (their fire and smoke are drawn live).
      const fate = rng(seedOf(x, y, 11))();
      if (!'mzsrc'.includes(t) && tiles.length >= 4 && fate < 0.12) {
        const burning = fate < 0.05;
        let lit = 0;
        for (const [xx, yy] of tiles) {
          const q = rng(seedOf(xx, yy, 13)), qx = xx * T, qy = yy * T, deep = inside(xx, yy, xx, yy, l);
          rect(burning ? 'rgba(24,14,9,0.45)' : 'rgba(12,10,9,0.6)', qx, qy, T, T);
          for (let k = 0; k < 4; k++) disc(q() < 0.6 ? 'rgba(5,5,5,0.45)' : 'rgba(110,104,96,0.3)', qx + 3 + q() * (T - 6), qy + 3 + q() * (T - 6), 1 + q() * 2.5); // soot and ash
          if (deep && q() < 0.1) { // the roof fallen in
            disc(P.outline, qx + T / 2, qy + T / 2, 6);
            disc('#0c0b0b', qx + T / 2 + 1, qy + T / 2 + 1, 4.5);
            rect(P.brown0, qx + 3, qy + T / 2 - 1, T - 6, 2);
          }
          if (q() < (burning ? 0.2 : 0.05)) dot(burning ? P.ember2 : P.ember0, qx + q() * T, qy + q() * T, q() < 0.3 ? 2 : 1); // embers
          if (burning && deep && lit < 3 && q() < 0.12) { lit++; fires.push({ kind: 'blaze', x: qx + T / 2, y: qy + T / 2 }); }
        }
      }
    }

  // ---- Trees: a crown two tiles across over each 2 by 2 of tree tiles (a lone one over its own tile) ----
  const planted = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (ch(x, y) !== 't' || planted[y * w + x]) continue;
      const big = [[1, 0], [0, 1], [1, 1]].every(([dx, dy]) => ch(x + dx, y + dy) === 't' && !planted[(y + dy) * w + x + dx]);
      for (const [dx, dy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) planted[(y + dy) * w + x + dx] = 1;
      const cx = (x + (big ? 1 : 0.5)) * T, cy = (y + (big ? 1 : 0.5)) * T;
      tree(cx, cy, big ? 14 : 11, rng(seedOf(x, y, 5)));
      extra.push({ kind: big ? 'crown' : 'crown-small', x: cx, y: cy });
    }

  // ---- The safe zone: how its people are to get out (a pad for the helicopter, which is drawn live; or what the
  // city's story has waiting there: map.evac), the camp round it (tents, people, cookfires, tables, toilets, cars), and
  // junk piled along where it meets the streets (only drawn: the horde walks through it) ----
  /** The zone's people are sprites (art/sprites.ts): CIVS everyday looks, then UMBRELLAS more under umbrellas. */
  const CIVS = 7, UMBRELLAS = 3;
  const civ = (k: number) => `civ${k}-walk/0`;
  /** How the people in the zone (x0, y0)-(x1, y1) get out, drawn on it; returns the boxes it takes, in pixels. Drawn
   *  in a frame of its own, in the design's pixels: x along the zone's way out (the map's edge it lies on; for the
   *  queue the side facing the station, for stairs the south), y negative going in from it. Boats lie along that side
   *  (live: they bob); buses and trucks face out through it; stairs go down toward it. What moves is pushed to `extra`
   *  for the game to animate: boats, smoke, headlights, lamps, water lapping at a hull, people going down the stairs. */
  const evacuation = (kind: NonNullable<MapData['evac']>, x0: number, y0: number, x1: number, y1: number) => {
    const L = x0 * T, R = (x1 + 1) * T, Tp = y0 * T, B = (y1 + 1) * T;
    let edge = y1 === h - 1 ? 'S' : x0 === 0 ? 'W' : x1 === w - 1 ? 'E' : y0 === 0 ? 'N' : 'S';
    if (kind === 'stairs') edge = 'S';
    if (kind === 'queue') {
      // Toward the station.
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ch(x, y) === 's') { sx += x; sy += y; n++; }
      const dx = n ? sx / n - (x0 + x1) / 2 : 0, dy = n ? sy / n - (y0 + y1) / 2 : 1;
      edge = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
    }
    const [ox, oy, a] = ({ S: [L, B, 0], W: [L, Tp, Math.PI / 2], N: [R, Tp, Math.PI], E: [R, B, -Math.PI / 2] } as Record<string, number[]>)[edge];
    const across = edge === 'S' || edge === 'N', len = (across ? R - L : B - Tp) / S, deep = (across ? B - Tp : R - L) / S, px = 1 / S; // px: a sprite pixel here
    const at = (x: number, y: number): [number, number] => [ox + Math.round(Math.cos(a)) * x * S - Math.round(Math.sin(a)) * y * S, oy + Math.round(Math.sin(a)) * x * S + Math.round(Math.cos(a)) * y * S];
    const live = (k: string, x: number, y: number, more: Partial<Drawn> = {}) => { const [wx, wy] = at(x, y); extra.push({ kind: k, x: wx, y: wy, ...more }); };
    // Sprites go on once the frame is put away (they are drawn at their own size, not the design's).
    const later: (() => void)[] = [], put = (frame: string, x: number, y: number, turn = 0) => later.push(() => stamp(frame, ...at(x, y), a + turn, 0));
    const q = rng(seedOf(x0, y0, 41)), boxes: number[][] = [];
    /** Someone queueing or waiting, facing the way out (+y), a little this way or that. */
    const waiting = (x: number, y: number, umbrella = false) => put(civ(umbrella ? CIVS + ((q() * UMBRELLAS) | 0) : (q() * CIVS) | 0), x, y, Math.PI / 2 + (q() - 0.5) * 0.9);
    c.save();
    c.translate(ox, oy);
    c.rotate(a);
    c.scale(S, S);

    /** The bottom `d` of the frame made a harbour: water, the quay's edge along it, bollards. */
    const harbour = (d: number) => {
      rect(P.teal0, 0, -d, len, d);
      for (let k = 0; k < (len * d) / 50; k++) rect(q() < 0.7 ? P.teal1 : P.teal2, q() * len, -d + 4 + q() * (d - 5), 3 + q() * 4, 1);
      rect('rgba(0,0,0,0.3)', 0, -d, len, 4); // the quay's shadow on the water
      rect(P.outline, 0, -d - 3, len, 3); rect(P.cream, 0, -d - 3, len, 2);
      for (let x = 10; x < len - 4; x += 26) { disc(P.outline, x, -d - 6, 2.2); disc(P.metal1, x, -d - 6, 1.5); }
    };
    /** Stairs going down from `top` toward the way out, `half` either side of `cx`, darker step by step into the dark:
     *  in a stone surround with a wall at the far end, or (makeshift) between plywood and sandbags. */
    const stairs = (cx: number, top: number, bottom: number, half: number, makeshift: boolean) => {
      const n = Math.max(4, Math.floor((bottom - top) / 4)), step = (bottom - top) / n;
      rect('rgba(0,0,0,0.35)', cx - half - 2, top + 2, half * 2 + 7, bottom - top + 3);
      for (let i = 0; i < n; i++) {
        const f = i / n, col = `rgb(${Math.round(119 - f * 108)},${Math.round(115 - f * 105)},${Math.round(106 - f * 96)})`;
        rect(col, cx - half, top + i * step, half * 2, step);
        rect(`rgba(234,223,174,${(0.3 * (1 - f)).toFixed(2)})`, cx - half, top + i * step, half * 2, 0.5); // each step's lit edge
      }
      rect('#060606', cx - half, bottom - 3, half * 2, 3);
      for (const side of [-1, 1]) {
        const wx = side < 0 ? cx - half - 4 : cx + half;
        if (makeshift) for (let y = top - 1; y < bottom + 3; y += 3) { rect(P.outline, wx, y, 4, 3); rect([P.brown1, P.brown2, P.khaki0][Math.abs(Math.round(y)) % 3], wx + 0.5, y + 0.5, 3, 2); }
        else { rect(P.outline, wx, top - 1, 4, bottom - top + 5); rect(P.cream, wx + 0.5, top - 0.5, 3, bottom - top + 4); }
        rect(P.metal2, side < 0 ? cx - half + 1 : cx + half - 1.5, top, 0.5, bottom - top - 2); // the handrails
      }
      if (half > 14) rect(P.metal2, cx - 0.25, top + 2, 0.5, bottom - top - 5);
      if (!makeshift) { rect(P.outline, cx - half - 4, bottom, half * 2 + 8, 4); rect(P.cream, cx - half - 3.5, bottom + 0.5, half * 2 + 7, 3); }
      else for (const side of [-1, 1]) for (let y = top + 4; y < bottom; y += 18 * px) put('sandbags/0', cx + side * (half + 9), y, Math.PI / 2);
    };
    /** People going down the stairs whose top is at (tx, top), coming from (fx, fy). */
    const flow = (fx: number, fy: number, tx: number, top: number, down: number, n: number, umbrella = false) =>
      live('flow', fx, fy, { to: at(tx, top), a: a + Math.PI / 2, len: down * S, n, frame: umbrella ? 'umbrella' : '' });

    if (kind === 'ferry' || kind === 'ship') {
      // Moored along the quay, each with a gangway down to it and a crowd on the quay at its foot.
      const ship = kind === 'ship', long = (ship ? 320 : 288) * px, beam = (ship ? 64 : 60) * px, d = beam + 14, cy = -d / 2 - 1;
      const n = ship ? Math.max(1, Math.min(3, Math.floor(len / (long + 16)))) : 1, gap = len / n;
      harbour(d);
      for (let k = 0; k < n; k++) {
        const cx = n === 1 ? Math.max(long / 2 + 6, Math.min(len - long / 2 - 6, len * 0.5)) : gap * (k + 0.5), flip = ship && k % 2 === 1;
        live('boat', cx, cy, { frame: ship ? `ship/${(k + x0) % 3}` : 'ferry/0', a: a + (flip ? Math.PI : 0) });
        for (let x = cx - long / 2 + 6; x < cx + long / 2 - 10; x += 14) { live('foam', x, cy - beam / 2 - 2); live('foam', x + 7, cy + beam / 2 + 2); }
        const gx = cx + (flip ? -1 : 1) * long * (ship ? 0.08 : -0.22), foot = cy - beam / 2;
        rect(P.outline, gx - 1, -d - 1, 5, foot + d + 1); rect(P.khaki1, gx, -d - 1, 3, foot + d + 1);
        for (let y = -d; y < foot; y += 2) rect(P.khaki0, gx, y, 3, 1);
        for (let j = 0; j < 16; j++) waiting(gx + 1 + (q() - 0.5) * 40, -d - 7 - q() * 14);
      }
      boxes.push([0, -d - 24, len, 0]);
    } else if (kind === 'bus' || kind === 'trucks') {
      // Lined up facing out, engines running.
      const long = 78 * px, wide = 28 * px;
      const vehicle = (frame: string, cx: number, front: number) => {
        put(frame, cx, front - long / 2, Math.PI / 2);
        live('headlight', cx - wide * 0.3, front + 1); live('headlight', cx + wide * 0.3, front + 1); live('exhaust', cx + wide * 0.3, front - long - 1);
      };
      if (kind === 'bus') {
        const n = Math.max(1, Math.min(3, Math.floor(len / (wide + 12)))), gap = len / n;
        for (let k = 0; k < n; k++) vehicle('schoolbus/0', gap * (k + 0.5), -3);
        boxes.push([gap / 2 - wide, -long - 6, gap * (n - 0.5) + wide, 0]);
      } else {
        const rows = Math.max(1, Math.min(3, Math.floor((deep - 6) / (long + 8))));
        for (const cx of [len / 2 - wide / 2 - 4, len / 2 + wide / 2 + 4]) for (let k = 0; k < rows; k++) vehicle('armytruck/0', cx, -3 - k * (long + 8));
        boxes.push([len / 2 - wide - 8, -6 - rows * (long + 8), len / 2 + wide + 8, 0]);
      }
    } else if (kind === 'stairs') {
      // Down into the metro, its red M on a post; people walking in from across the zone and going down, on and on.
      const cx = len / 2, half = 18, top = -deep * 0.72, bottom = -deep * 0.26;
      stairs(cx, top, bottom, half, false);
      rect(P.outline, cx + half + 7, top - 14, 2, 14); rect(P.outline, cx + half + 3, top - 25, 11, 11); rect(P.red1, cx + half + 4, top - 24, 9, 9);
      for (const [mx, my, mw, mh] of [[5, 2, 1, 5], [9, 2, 1, 5], [6, 3, 1, 1], [8, 3, 1, 1], [7, 4, 1, 1]]) rect(P.snow2, cx + half + 1 + mx, top - 24 + my, mw, mh); // the M
      for (const lane of [-1, 0, 1]) flow(cx + lane * 34, -deep + 6, cx + lane * 9, top, bottom - top, 5);
      boxes.push([cx - half - 8, -deep, cx + half + 16, bottom + 6]);
    } else {
      // The queue for the station: lanes between barriers, the checkpoint, and the makeshift stairs down into the
      // subway. The middle lanes keep moving and go down; the rest stand and wait under their umbrellas.
      const lanes = Math.max(2, Math.floor((len - 8) / 14)), lx = (len - lanes * 14) / 2, cx = len / 2, half = Math.min(28, lanes * 7 - 7), top = -30, bottom = -4;
      for (let k = 0; k <= lanes; k++) { const x = lx + k * 14; rect(P.metal2, x, -deep + 6, 1, deep - 44); for (let y = -deep + 6; y < -38; y += 10) rect(P.outline, x - 1, y, 3, 2); }
      rect(P.outline, lx - 2, -38, lanes * 14 + 5, 5); rect(P.flash0, lx - 1, -37, lanes * 14 + 3, 3);
      for (let k = 0; k < lanes; k++) rect(P.pave0, lx + k * 14 + 4, -38, 6, 5); // a gate in each lane
      live('beacon', lx - 2, -36); live('beacon', lx + lanes * 14 + 3, -36);
      stairs(cx, top, bottom, half, true);
      live('window', cx - half - 6, top - 2); live('window', cx + half + 6, top - 2); // work lamps
      for (let k = 0; k < lanes; k++) {
        const mx = lx + k * 14 + 7;
        if (Math.abs(mx - cx) < half) flow(mx, -deep + 8, mx, top, bottom - top, 6, true);
        else for (let y = -44; y > -deep + 10; y -= 8) waiting(mx + (q() - 0.5) * 2, y + (q() - 0.5) * 2, true);
      }
      boxes.push([0, -deep, len, 0]);
    }
    c.restore();
    for (const f of later) f();
    return boxes.map(([bx0, by0, bx1, by1]) => { const [ax, ay] = at(bx0, by0), [bx, by] = at(bx1, by1); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]; });
  };

  /** The camp, wherever in zone (x0, y0)-(x1, y1) is not kept clear: tents, cookfires with people round them and
   *  their sleeping bags, aid tables, a row of portable toilets, cars left there, crates, and a crowd. As much of it as
   *  the zone has room for. */
  const dress = (inZone: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number, tiles: number, keeps: number[][]) => {
    const q = rng(seedOf(x0, y0, 51)), taken: number[][] = [], L = x0 * T, Tp = y0 * T, R = (x1 + 1) * T, B = (y1 + 1) * T;
    const free = (x: number, y: number, r: number) =>
      [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].every(([dx, dy]) => inZone(Math.floor((x + dx) / T), Math.floor((y + dy) / T))) &&
      !keeps.some(([l, t, rr, b]) => x + r > l && x - r < rr && y + r > t && y - r < b) && taken.every(([tx, ty, tr]) => Math.hypot(tx - x, ty - y) >= tr + r);
    const spot = (r: number) => {
      for (let k = 0; k < 40; k++) { const x = L + r + q() * (R - L - 2 * r), y = Tp + r + q() * (B - Tp - 2 * r); if (free(x, y, r)) { taken.push([x, y, r]); return [x, y]; } }
    };
    const room = tiles / (S * S); // in the design's tiles
    const many = (n: number, most: number, r: number, place: (x: number, y: number) => void) => { for (let k = 0; k < Math.min(most, Math.floor(n)); k++) { const p = spot(r); if (p) place(p[0], p[1]); } };
    const turn = () => q() * Math.PI * 2;
    many(room / 10, 12, 24, (x, y) => stamp(`tent/${(q() * 4) | 0}`, x, y, q() < 0.5 ? 0 : Math.PI, 0));
    many(room / 30, 6, 30, (x, y) => { // a cookfire, people round it, their sleeping bags further out
      stamp('campfire/0', x, y, 0, 0);
      extra.push({ kind: 'campfire', x, y });
      const sit = 3 + ((q() * 3) | 0);
      for (let k = 0; k < sit; k++) { const b = (k / sit) * Math.PI * 2 + q() * 0.4; stamp(civ((q() * CIVS) | 0), x + Math.cos(b) * 13, y + Math.sin(b) * 13, b + Math.PI, 0); }
      for (let k = 0; k < 2; k++) { const b = q() * Math.PI * 2; stamp(`sleepbag/${(q() * 3) | 0}`, x + Math.cos(b) * 23, y + Math.sin(b) * 23, b, 0); }
    });
    many(room / 45, 4, 20, (x, y) => { // an aid table, people at it, crates behind
      stamp('table/0', x, y, 0, 0);
      for (let k = 0; k < 3; k++) stamp(civ((q() * CIVS) | 0), x - 8 + k * 8, y + 11, -Math.PI / 2 + (q() - 0.5) * 0.5, 0);
      stamp(`crate/${(q() * 2) | 0}`, x + (q() - 0.5) * 16, y - 13, 0, 0);
    });
    if (room > 30) { const p = spot(28); if (p) for (let k = 0; k < 4; k++) stamp(`toilet/${k % 2 ? 0 : (q() * 2) | 0}`, p[0] - 21 + k * 14, p[1], 0, 0); }
    many(room / 35, 4, 27, (x, y) => stamp(`sedan/${(q() * 4) | 0}`, x, y, (q() < 0.5 ? 0 : Math.PI / 2) + (q() - 0.5) * 0.5, 0));
    many(room / 12, 10, 9, (x, y) => stamp(`crate/${(q() * 2) | 0}`, x, y, (q() - 0.5) * 0.6, 0));
    many(room / 8, 16, 11, (x, y) => stamp(`sleepbag/${(q() * 3) | 0}`, x, y, turn(), 0));
    many(room, 140, 5, (x, y) => {
      const a = turn();
      stamp(civ((q() * CIVS) | 0), x, y, a, 0);
      if (q() < 0.3) { const fx = x + Math.cos(a) * 9, fy = y + Math.sin(a) * 9; if (free(fx, fy, 4)) { taken.push([fx, fy, 4]); stamp(civ((q() * CIVS) | 0), fx, fy, a + Math.PI, 0); } } // two talking
    });
  };

  /** Junk piled along where the zone meets the street, a stretch of each kind at a time, an opening now and then:
   *  sandbags, concrete, plastic and police barriers, timber, crates. */
  const blockade = (zone: number[]) => {
    const KINDS = ['sandbags/0', 'cement/0', 'plastic/0', 'police/0', 'wood/0', 'crate/0', 'plastic/1', 'police/1', 'crate/1'];
    for (const i of zone) {
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || goal[ny * w + nx] || wall[ny * w + nx]) continue;
        const along = dy ? x : y, k = along % (12 * S);
        if (k >= 8 * S && k < 9 * S) continue; // an opening
        stamp(KINDS[(Math.floor(along / (3 * S)) * 4 + (dx + 1) * 3 + dy + 1) % KINDS.length], (x + 0.5) * T + dx * (T / 2 - 5), (y + 0.5) * T + dy * (T / 2 - 5), dy ? 0 : Math.PI / 2, 0);
      }
    }
  };

  const white = (map.decor ?? []).some((d) => d.kind === 'whitehouse'), done = new Uint8Array(w * h);
  for (const first of grid.goals) {
    if (done[first]) continue;
    const zone: number[] = [];
    for (const stack = [first]; stack.length; ) {
      const i = stack.pop()!;
      if (done[i] || !goal[i]) continue;
      done[i] = 1;
      zone.push(i);
      if (i % w > 0) stack.push(i - 1);
      if (i % w < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i + w < w * h) stack.push(i + w);
    }
    const xs = zone.map((i) => i % w), ys = zone.map((i) => Math.floor(i / w)), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inZone = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && goal[y * w + x] === 1;
    const keeps: number[][] = [];
    if (map.evac) keeps.push(...evacuation(map.evac, x0, y0, x1, y1));
    else if (white) keeps.push([x0 * T, y0 * T + (y1 - y0) * T * 0.12, (x1 + 1) * T, y0 * T + (y1 - y0) * T * 0.82]); // the White House stands on it
    else if (x1 - x0 >= 4 * S && y1 - y0 >= 3 * S) {
      // The pad: the map's own helipad if it has one here, else a new one in the middle.
      const own = (map.decor ?? []).find((d) => d.kind === 'helipad' && inZone(Math.floor(d.x / T), Math.floor(d.y / T)));
      const pad = own ? [own.x, own.y] : [((x0 + x1 + 1) / 2) * T, ((y0 + y1 + 1) / 2) * T], r = (3.5 * S + 1) * T;
      if (!own) {
        c.save(); c.translate(pad[0], pad[1]); c.scale(S, S);
        c.strokeStyle = P.flash0; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.stroke(); c.lineWidth = 1;
        rect(P.flash0, -10, -12, 4, 24); rect(P.flash0, 6, -12, 4, 24); rect(P.flash0, -6, -2, 12, 4);
        c.restore();
      }
      extra.push({ kind: 'heli', x: pad[0], y: pad[1] });
      keeps.push([pad[0] - r, pad[1] - r, pad[0] + r, pad[1] + r]);
    }
    dress(inZone, x0, y0, x1, y1, zone.length, keeps);
    blockade(zone);
  }

  /** Someone lying dead, two tiles long, head toward `a`: one of ours (uniform, vest, helmet, his rifle beside him) or
   *  someone who lived here. Each part outlined, then filled. */
  const corpse = (x: number, y: number, a: number, soldier: boolean, q: () => number) => {
    const shirt = soldier ? P.olive1 : [P.navy1, P.red0, P.khaki1, P.cloth1, P.snow0, P.maroon1, P.teal1][(q() * 7) | 0];
    const legs = soldier ? P.olive0 : [P.navy0, P.brown0, P.khaki0, P.metal1][(q() * 4) | 0], skin = [P.skin0, P.skin1, P.skin2][(q() * 3) | 0];
    const part = (col: string, x0: number, y0: number, ww: number, hh: number) => { rect(P.outline, x0 - 1, y0 - 1, ww + 2, hh + 2); rect(col, x0, y0, ww, hh); };
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.rotate(a);
    if (soldier) part(P.metal1, -6, 9, 20, 2); // the rifle, dropped beside him
    part(legs, -17, -4, 12, 3); part(legs, -17, 1, 12, 3); // legs, one bent a little
    rect(soldier ? P.metal0 : P.brown0, -18, -4, 3, 3); rect(soldier ? P.metal0 : P.brown0, -18, 1, 3, 3); // boots or shoes
    part(shirt, -6, -6, 12, 12); // the body
    if (soldier) { rect(P.khaki0, -4, -5, 8, 10); rect(P.metal0, -6, -1, 1, 2); } // the vest, its belt
    part(shirt, -1, -12, 4, 6); rect(skin, -1, -14, 4, 2); // an arm flung out
    part(shirt, 0, 6, 7, 3); rect(skin, 7, 6, 2, 3); // the other along his side
    disc(P.outline, 10, 0, 4.6); // the head
    if (soldier) { disc(P.olive0, 10, 0, 3.8); rect(P.olive1, 9, -2, 3, 2); } // under his helmet
    else { disc(skin, 10, 0, 3.6); disc([P.outline, P.brown0, P.khaki1][(q() * 3) | 0], 11.2, 0, 2.8); } // the back of the head
    c.restore();
  };

  // ---- A few of the dead from before the horde got here, lying where they fell (only with gore on; never cleared) ----
  if (blood) {
    const q = rng(seedOf(w, h, 23)), open: number[] = [];
    for (let i = 0; i < w * h; i++) if (ground(i % w, Math.floor(i / w))) open.push(i);
    for (let k = 0, n = Math.max(2, Math.round(open.length / 900)); k < n && open.length; k++) {
      const i = open[(q() * open.length) | 0], x = ((i % w) + 0.2 + q() * 0.6) * T, y = (Math.floor(i / w) + 0.2 + q() * 0.6) * T, a = q() * 6.3;
      for (let s = 0; s < 7; s++) disc(s % 2 ? P.blood0 : P.blood1, x + (q() - 0.5) * 18, y + (q() - 0.5) * 18, 4 + q() * 6); // the pool
      corpse(x, y, a, q() < 0.4, q);
    }
  }
  for (const draw of landmarks) draw(); // before the fade below: deep in a block, they are in its shadow too

  // ---- Deep inside a block, the roofs fade into shadow ----
  // Only the edge that faces a street keeps its detail, which keeps a big map calm. Distance is counted in tiles from
  // the ground anyone can walk to (reached from the safe zone; a walled-in courtyard fades too). It is smoothed in 4 px
  // steps between tile centres, so it reads as a gradient, not as blocks.
  const reach = new Uint8Array(w * h), dist = new Float32Array(w * h).fill(Infinity), queue: number[] = [];
  // (A city with no safe zone, the menu's, counts from all its open ground.)
  for (const i of grid.goals.length ? grid.goals : [...wall.keys()].filter((j) => !wall[j])) { reach[i] = 1; queue.push(i); }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !reach[j] && !wall[j]) { reach[j] = 1; queue.push(j); }
  }
  const near: number[] = [];
  for (let i = 0; i < w * h; i++) if (reach[i]) { dist[i] = 0; near.push(i); }
  for (let k = 0; k < near.length; k++) {
    const i = near[k], x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[j] <= dist[i] + 1) continue;
      dist[j] = dist[i] + 1;
      near.push(j);
    }
  }
  const fade = (x: number, y: number) => { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); return Math.max(0, Math.min(1, (dist[y * w + x] - S) / (SHADE.over * S))) * SHADE.most; };
  const fadeAt = (wx: number, wy: number) => fade(Math.floor(wx / T), Math.floor(wy / T));
  // Laid over everything painted so far, once the map's big landmarks are down too (see below).
  const shadeRoofs = () => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (fade(x, y) === 0 && fade(x - 1, y) === 0 && fade(x + 1, y) === 0 && fade(x, y - 1) === 0 && fade(x, y + 1) === 0) continue;
        for (let by = 0; by < 4; by++)
          for (let bx = 0; bx < 4; bx++) {
            const gx = x + (bx + 0.5) / 4 - 0.5, gy = y + (by + 0.5) / 4 - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), u = gx - x0, v = gy - y0;
            const f = (fade(x0, y0) * (1 - u) + fade(x0 + 1, y0) * u) * (1 - v) + (fade(x0, y0 + 1) * (1 - u) + fade(x0 + 1, y0 + 1) * u) * v;
            if (f > 0.01) rect(`rgba(${SHADE.rgb.join(",")},${f.toFixed(3)})`, x * T + bx * 4, y * T + by * 4, 4, 4);
          }
      }
  };
  // ---- Decor from the map, each only where it belongs: nothing stands in the road but manholes ----
  const kindAt = (x: number, y: number) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), i = ty * w + tx;
    return tx < 0 || ty < 0 || tx >= w || ty >= h ? 'off' : wall[i] ? 'roof' : goal[i] ? 'safe' : isGreen(tx, ty) ? 'grass' : ch(tx, ty) === ',' ? 'plaza' : side[i] ? 'sidewalk' : 'road';
  };
  const WHERE: Record<string, string[]> = {
    tree: ['grass', 'sidewalk', 'plaza'], lamp: ['sidewalk', 'plaza'], manhole: ['road'], rubble: ['road', 'sidewalk', 'plaza'], wreck: ['roof'],
    sandbag: ['plaza', 'safe', 'sidewalk'], helipad: ['plaza', 'safe', 'grass'], fountain: ['plaza', 'grass'], flowers: ['grass'], hachiko: ['plaza'], billboard: ['roof'], barrel: ['sidewalk', 'plaza', 'roof', 'safe'], crate: ['sidewalk', 'plaza', 'roof', 'safe'],
    trash: ['sidewalk'], dumpster: ['sidewalk'], hydrant: ['sidewalk'], cone: ['road'], bench: ['plaza', 'grass'], bin: ['sidewalk', 'plaza'],
    el: ['road', 'sidewalk', 'plaza'], laundry: ['road', 'sidewalk'], court: ['plaza'],
    crater: ['road', 'sidewalk', 'plaza'], scorch: ['road', 'sidewalk', 'plaza', 'roof', 'grass'], collapse: ['roof'], burnt: ['road', 'sidewalk', 'plaza'], blaze: ['road', 'sidewalk', 'plaza', 'roof', 'grass'],
  };
  /** A small box from above: outline, body, a lit top edge. */
  const box = (x: number, y: number, ww: number, hh: number, body: string, lit: string) => {
    rect('rgba(0,0,0,0.35)', x + 1, y + 1, ww + 1, hh + 1);
    rect(P.outline, x - 1, y - 1, ww + 2, hh + 2);
    rect(body, x, y, ww, hh);
    rect(lit, x, y, ww, 1);
  };
  /** The tiles around (x, y) that `fits`, joined up: a landmark's box. */
  const extent = (x: number, y: number, fits: (i: number) => boolean) => {
    const box = [w, h, -1, -1], seen = new Set<number>();
    for (const stack = [Math.floor(y / T) * w + Math.floor(x / T)]; stack.length; ) {
      const i = stack.pop()!, tx = i % w, ty = (i - tx) / w;
      if (seen.has(i) || !fits(i)) continue;
      seen.add(i);
      box[0] = Math.min(box[0], tx); box[1] = Math.min(box[1], ty); box[2] = Math.max(box[2], tx); box[3] = Math.max(box[3], ty);
      if (tx > 0) stack.push(i - 1);
      if (tx < w - 1) stack.push(i + 1);
      if (ty > 0) stack.push(i - w);
      if (ty < h - 1) stack.push(i + w);
    }
    return box;
  };
  const oval = (col: string, cx: number, cy: number, rx: number, ry: number) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fill(); };
  /** The White House on the safe zone, seen from above: the residence, its two porticoes and the long low wings. */
  const whiteHouse = (x: number, y: number) => {
    const [x0, y0, x1, y1] = extent(x, y, (i) => goal[i] === 1), L = x0 * T, R = (x1 + 1) * T, top = (y0 + 1) * T, bottom = (y1 + 1) * T - 4;
    const cx = (L + R) / 2, W = R - L, Hh = bottom - top, bw = W * 0.6, bh = Hh * 0.56, by = top + Hh * 0.2, u = S;
    rect('rgba(0,0,0,0.35)', L + 6 + 3, by + bh * 0.3 + 3, W - 12, bh * 0.42); // wings' shadow
    rect(P.outline, L + 5, by + bh * 0.3 - 1, W - 10, bh * 0.42 + 2);
    rect(P.snow1, L + 6, by + bh * 0.3, W - 12, bh * 0.42);
    rect(P.snow2, L + 6, by + bh * 0.3, W - 12, 2);
    for (let k = L + 10; k < R - 10; k += 6) if (Math.abs(k - cx) > bw / 2 + 4) rect(P.snow0, k, by + bh * 0.3 + bh * 0.42 - 3, 2, 2); // colonnade
    rect('rgba(0,0,0,0.4)', cx - bw / 2 + 4, by + 4, bw, bh); // the residence
    rect(P.outline, cx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
    rect(P.snow2, cx - bw / 2, by, bw, bh);
    rect(P.snow1, cx - bw / 2 + 4, by + 4, bw - 8, bh - 8); // the roof inside its balustrade
    rect(P.metal2, cx - bw / 2 + 8, by + bh / 2 - 1, bw - 16, 2); // the ridge
    for (let k = 0; k < 6; k++) rect(P.snow0, cx - bw / 2 + 10 * u + k * ((bw - 24 * u) / 5), by + 6 * u, 4 * u, 3 * u); // chimneys
    rect(P.outline, cx - 13 * u, by - 9 * u, 26 * u, 10 * u); rect(P.snow2, cx - 12 * u, by - 8 * u, 24 * u, 9 * u); // the north portico
    for (let k = 0; k < 4; k++) rect(P.snow0, cx - 10 * u + k * 6 * u, by - 7 * u, 2 * u, 2 * u);
    disc(P.outline, cx, by + bh, 15 * u); disc(P.snow2, cx, by + bh, 14 * u); disc(P.snow1, cx, by + bh, 10 * u); // the south portico
    rect(P.snow2, cx - 15 * u, by + bh - 15 * u, 30 * u, 14 * u);
    for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6); dot(P.snow0, cx + Math.cos(a) * 12 * u - 1, by + bh + Math.sin(a) * 12 * u - 1, 2 * u); }
    rect(P.metal1, cx, by - 2 * u, u, 10 * u); rect(P.red1, cx + u, by - 2 * u, 6 * u, 2 * u); rect(P.snow2, cx + u, by, 6 * u, u); rect(P.navy2, cx + u, by - 2 * u, 3 * u, 2 * u); // the flag
  };
  /** The Colosseum over its block of old stone: the outer ring of arches, the tiers of seats, the arena floor gone,
   *  so the passages under it show. */
  const colosseum = (x: number, y: number) => {
    const [x0, y0, x1, y1] = extent(x, y, (i) => map.rows[Math.floor(i / w)][i % w] === 'r'), cx = ((x0 + x1 + 1) / 2) * T, cy = ((y0 + y1 + 1) / 2) * T;
    const rx = ((x1 - x0 + 1) / 2) * T - 2, ry = ((y1 - y0 + 1) / 2) * T - 2;
    oval('rgba(0,0,0,0.4)', cx + 4, cy + 4, rx, ry);
    oval(P.outline, cx, cy, rx + 1, ry + 1);
    oval(P.cream, cx, cy, rx, ry);
    for (let k = 0; k < 80; k++) { const a = (k / 80) * Math.PI * 2; rect(P.khaki0, cx + Math.cos(a) * rx * 0.94 - 1, cy + Math.sin(a) * ry * 0.94 - 1, 2, 2); } // the arches
    oval(P.khaki2, cx, cy, rx * 0.86, ry * 0.86);
    for (const f of [0.8, 0.74, 0.68, 0.62]) { c.strokeStyle = P.khaki1; c.beginPath(); c.ellipse(cx, cy, rx * f, ry * f, 0, 0, 7); c.stroke(); } // the seats
    oval(P.outline, cx, cy, rx * 0.56, ry * 0.56);
    oval(P.desert0, cx, cy, rx * 0.54, ry * 0.54);
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx * 0.54, ry * 0.54, 0, 0, 7); c.clip();
    for (let k = -ry; k < ry; k += 5) rect(P.desert1, cx - rx, cy + k, rx * 2, 3); // the passages under the floor
    rect(P.outline, cx - rx, cy - 1, rx * 2, 2);
    rect(P.brown1, cx + rx * 0.2, cy - ry, rx, ry * 2); rect(P.brown2, cx + rx * 0.2, cy - ry, 2, ry * 2); // a stretch of floor put back
    c.restore();
    // A bite out of the outer ring, where it fell in an earthquake.
    c.save();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, 7, 0, true); c.clip();
    oval(P.khaki2, cx - rx * 0.1, cy + ry * 1.05, rx * 0.6, ry * 0.32);
    c.restore();
  };
  /** The scramble crossing round the safe zone (which sits in its middle, 6 tiles of road all round): a zebra
   *  crossing from each corner of the junction in to the safe zone, on the slant. */
  const scramble = (x: number, y: number) => {
    const [x0, y0, x1, y1] = extent(x, y, (i) => goal[i] === 1), M = 6 * S;
    const corners = [[x0, y0, -1, -1], [x1 + 1, y0, 1, -1], [x0, y1 + 1, -1, 1], [x1 + 1, y1 + 1, 1, 1]];
    c.save();
    c.strokeStyle = 'rgba(220, 221, 211, 0.8)';
    c.lineWidth = 2;
    for (const [cx, cy, dx, dy] of corners) {
      const ax = (cx + dx * M) * T, ay = (cy + dy * M) * T, bx = cx * T - dx * 2, by = cy * T - dy * 2, len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(ax + nx * k * 4, ay + ny * k * 4); c.lineTo(bx + nx * k * 4, by + ny * k * 4); c.stroke(); }
    }
    c.restore();
  };
  /** The station roof: platforms and tracks running its length, a Yamanote train in at one of them. */
  const rails = (x: number, y: number) => {
    const [x0, y0, x1, y1] = extent(x, y, (i) => map.rows[Math.floor(i / w)][i % w] === 's'), L = x0 * T + 4, R = (x1 + 1) * T - 4, top = y0 * T + 2, bottom = (y1 + 1) * T - 8;
    rect(P.metal1, L, top, R - L, bottom - top);
    let k = 0;
    for (let px = L + 2; px + 36 <= R; px += 38, k++) {
      rect(P.pave1, px, top, 12, bottom - top); rect(P.flash0, px, top, 1, bottom - top); rect(P.flash0, px + 11, top, 1, bottom - top); // a platform, yellow at its edges
      for (const tx of [px + 13, px + 25]) {
        for (let ty = top; ty < bottom; ty += 4) rect(P.brown0, tx, ty, 11, 2); // sleepers
        rect(P.metal2, tx + 2, top, 1, bottom - top); rect(P.metal2, tx + 8, top, 1, bottom - top);
      }
      if (k === 1) for (let cy = top + 30; cy + 34 < bottom - 20; cy += 37) { // the train, car after car
        rect(P.outline, px + 13, cy - 1, 11, 36);
        rect(P.snow1, px + 14, cy, 9, 34); rect('#7fa83a', px + 14, cy + 3, 9, 3); rect(P.metal1, px + 16, cy + 8, 5, 20);
      }
    }
  };
  /** Mexico City's cathedral over its block of red stone, seen from above: a Latin cross of nave and transepts under
   *  a dome, the two bell towers at its front (the south, on the square), chapels down both sides. */
  const cathedral = (x: number, y: number) => {
    const [x0, y0, x1, y1] = extent(x, y, (i) => map.rows[Math.floor(i / w)][i % w] === 'c'), L = x0 * T + 3, R = (x1 + 1) * T - 3, Tp = y0 * T + 3, B = (y1 + 1) * T - 6;
    const W = R - L, Hh = B - Tp, cx = (L + R) / 2, nave = W * 0.34, arm = Hh * 0.22, cy = Tp + Hh * 0.42;
    rect('rgba(0,0,0,0.4)', L + 4, Tp + 4, W, Hh);
    rect(P.outline, L - 1, Tp - 1, W + 2, Hh + 2); rect(ROOFS.c.base, L, Tp, W, Hh); // the chapels round it, flat roofed
    for (let k = L + 6; k < R - 6; k += 10) { rect(ROOFS.c.dark, k, Tp + 4, 6, Hh - 8); }
    rect(P.outline, cx - nave / 2 - 1, Tp + 2, nave + 2, Hh - 4); rect(P.khaki1, cx - nave / 2, Tp + 3, nave, Hh - 6); // the nave
    rect(P.outline, L + 4, cy - arm / 2 - 1, W - 8, arm + 2); rect(P.khaki1, L + 5, cy - arm / 2, W - 10, arm); // the transepts
    rect(P.khaki0, cx - 1, Tp + 3, 2, Hh - 6); rect(P.khaki0, L + 5, cy - 1, W - 10, 2); // the ridges
    disc(P.outline, cx, cy, arm * 0.62); disc(P.flash0, cx, cy, arm * 0.56); disc(P.khaki2, cx, cy, arm * 0.4); // the dome, its lantern
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; rect(P.brown0, cx + Math.cos(a) * arm * 0.48 - 1, cy + Math.sin(a) * arm * 0.48 - 1, 2, 2); }
    const tw = Math.max(18, W * 0.17);
    for (const tx of [L + 4, R - 4 - tw]) { // the bell towers
      rect('rgba(0,0,0,0.4)', tx + 5, B - tw - 2 + 5, tw, tw);
      rect(P.outline, tx - 1, B - tw - 3, tw + 2, tw + 2); rect(P.cream, tx, B - tw - 2, tw, tw); rect(P.khaki2, tx + 3, B - tw + 1, tw - 6, tw - 6);
      disc(P.khaki0, tx + tw / 2, B - tw / 2 - 2, tw * 0.28); disc(P.flash0, tx + tw / 2 - 1, B - tw / 2 - 3, tw * 0.12);
    }
    rect(P.cream, L + 4 + tw, B - 6, W - 8 - 2 * tw, 4); // the facade between them
  };
  /** A giant flag on the square: its plinth and pole. The flag itself flies over it (game/mapanims.ts). */
  const flag = (x: number, y: number) => {
    disc('rgba(0,0,0,0.35)', x + 3, y + 3, 16); disc(P.outline, x, y, 16); disc(P.pave1, x, y, 15); disc(P.pave0, x, y, 10);
    disc(P.metal2, x, y, 2.5);
  };
  const shown: Drawn[] = [];
  /** Vehicles standing in the street (the ones to be moved, then each burned one drawn), a circle each: where no other
   *  burned one is put. */
  const parked: [number, number, number][] = (map.props ?? []).filter((p) => p.kind === 'car' || p.kind === 'taxi' || p.kind === 'bus' || p.kind === 'jeepney').map((p) => {
    const len = p.kind === 'bus' ? 5 : 3; // its tile is the middle of its length, the second tile across it (World.blockCentre)
    return [(p.tx + (p.vertical ? 1 : 0.5)) * T, (p.ty + (p.vertical ? 0.5 : 1)) * T, len * T * 0.5];
  });
  drawn.set(key, shown);
  /** Things drawn at a size of their own (the grounds' furniture: fountains, beds, the court) grow with the map. */
  const GROWS = ['fountain', 'flowers', 'helipad', 'flag', 'court', 'laundry'];
  const one = (d: { kind: string; x: number; y: number }) => {
    const { x, y } = d, r = rng(seedOf(x, y, 3));
    // Landmarks, drawn whole wherever they are.
    if (d.kind === 'whitehouse') { whiteHouse(x, y); return; }
    if (d.kind === 'cathedral') { cathedral(x, y); return; }
    if (d.kind === 'flag') { flag(x, y); shown.push(d); return; }
    if (d.kind === 'colosseum') { colosseum(x, y); return; }
    if (d.kind === 'scramble') { scramble(x, y); return; }
    if (d.kind === 'rails') { rails(x, y); return; }
    if (map.evac && kindAt(x, y) === 'safe') return; // the safe zone is taken by what waits there (no crates in the harbour)

    if (!WHERE[d.kind]?.includes(kindAt(x, y)) || fadeAt(x, y) > 0.4) return; // nothing deep in the shadow
    shown.push(d);
    if (d.kind === 'tree') {
      // A street tree in its own square of soil, its crown spreading two tiles across.
      const px = Math.floor(x / T) * T, py = Math.floor(y / T) * T;
      rect(P.brown0, px + 2, py + 2, 12, 12);
      tree(px + T / 2, py + T / 2, 12, r);
    } else if (d.kind === 'lamp') {
      rect('rgba(0,0,0,0.35)', x + 1, y - 1, 8, 2);
      rect(P.outline, x - 1, y - 1, 3, 3);
      rect(P.metal1, x, y - 7, 1, 7); rect(P.metal1, x, y - 7, 6, 1);
      rect(P.flash1, x + 5, y - 7, 2, 2);
    } else if (d.kind === 'manhole') {
      disc(P.metal0, x, y, 4);
      c.strokeStyle = P.metal1; c.beginPath(); c.arc(x, y, 3, 0, 7); c.stroke();
    } else if (d.kind === 'rubble') {
      for (let k = 0; k < 9; k++) { const s = 1 + ((r() * 3) | 0); rect(P.outline, x - 5 + r() * 10, y - 4 + r() * 8 + 1, s, s); rect([P.pave1, P.khaki0, P.metal2, P.rust][k % 4], x - 5 + r() * 10, y - 4 + r() * 8, s, s); }
    } else if (d.kind === 'wreck') {
      disc('rgba(10,10,10,0.45)', x, y, 16); // scorch
      stamp(`car/${(x + y) % 3}`, x, y, r() * 0.6 - 0.3 + (r() < 0.5 ? 0 : Math.PI / 2), 0.62);
    } else if (d.kind === 'barrel') {
      // An oil drum or three: rust, blue or olive, rims showing.
      for (let k = 0; k < 1 + ((r() * 3) | 0); k++) {
        const bx = x + (k ? (r() - 0.5) * 9 : 0), by = y + (k ? (r() - 0.5) * 9 : 0), col = [P.rust, P.navy1, P.olive1][(r() * 3) | 0];
        disc('rgba(0,0,0,0.35)', bx + 1.5, by + 1.5, 3.5);
        disc(P.outline, bx, by, 3.8); disc(col, bx, by, 3); disc(P.metal2, bx - 1, by - 1, 1);
        c.strokeStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(bx, by, 2, 0, 7); c.stroke();
      }
    } else if (d.kind === 'crate') {
      box(x - 4, y - 4, 8, 8, P.skin0, P.skin1);
      rect(P.brown0, x - 4, y - 1, 8, 1); rect(P.brown0, x - 1, y - 4, 1, 8);
      if (r() < 0.5) box(x + 3, y - 7, 6, 6, P.skin1, P.skin2);
    } else if (d.kind === 'trash') {
      for (let k = 0; k < 3 + ((r() * 3) | 0); k++) { const bx = x + (r() - 0.5) * 10, by = y + (r() - 0.5) * 6; disc(P.outline, bx, by, 2.8); disc(P.metal0, bx, by, 2.2); dot(P.metal2, bx - 1, by - 1); }
    } else if (d.kind === 'dumpster') {
      box(x - 7, y - 4, 14, 8, P.olive0, P.olive1);
      rect(P.olive1, x - 7, y - 1, 14, 1); rect(P.metal1, x - 5, y - 4, 1, 8); rect(P.metal1, x + 4, y - 4, 1, 8);
    } else if (d.kind === 'hydrant') {
      disc('rgba(0,0,0,0.35)', x + 1.5, y + 1.5, 2.5); disc(P.outline, x, y, 3); disc(P.red1, x, y, 2.2); dot(P.red2, x - 1, y - 1);
      rect(P.red0, x - 3, y - 0.5, 6, 1);
    } else if (d.kind === 'cone') {
      disc(P.outline, x, y, 3); disc(P.hivis1, x, y, 2.3); disc(P.snow2, x, y, 1.2); dot(P.hivis2, x - 1, y - 1);
    } else if (d.kind === 'bench') {
      box(x - 7, y - 2, 14, 4, P.brown1, P.brown2);
      rect(P.brown0, x - 7, y, 14, 1); rect(P.metal0, x - 6, y + 2, 1, 1); rect(P.metal0, x + 5, y + 2, 1, 1);
    } else if (d.kind === 'bin') {
      disc(P.outline, x, y, 3.2); disc(P.metal1, x, y, 2.5); disc(P.metal0, x, y, 1.4);
    } else if (d.kind === 'sandbag') for (let k = -1; k <= 1; k++) stamp('sandbags/0', x + k * T, y, 0, 0);
    else if (d.kind === 'helipad') {
      c.strokeStyle = P.flash0; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 30, 0, 7); c.stroke();
      c.lineWidth = 1;
      rect(P.flash0, x - 10, y - 12, 4, 24); rect(P.flash0, x + 6, y - 12, 4, 24); rect(P.flash0, x - 6, y - 2, 12, 4);
    } else if (d.kind === 'fountain') {
      // A round stone basin, water in it, a jet in the middle.
      disc('rgba(0,0,0,0.35)', x + 2, y + 2, 20);
      disc(P.outline, x, y, 20); disc(P.cream, x, y, 19); disc(P.pave1, x, y, 16);
      disc(P.teal0, x, y, 14); disc(P.teal1, x - 2, y - 2, 11);
      c.strokeStyle = P.teal2; c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke();
      disc(P.cream, x, y, 4); disc(P.snow2, x, y, 2);
      for (let k = 0; k < 12; k++) { const a = r() * 7, rr = 5 + r() * 4; dot(P.snow2, x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    } else if (d.kind === 'flowers') {
      // A bed of flowers in a stone edge: roses, tulips, white ones.
      box(x - 22, y - 12, 44, 24, P.brown0, P.cream);
      for (let k = 0; k < 90; k++) dot(r() < 0.3 ? P.olive2 : [P.red1, P.red2, P.flash1, P.maroon2, P.snow2][(r() * 5) | 0], x - 21 + r() * 42, y - 11 + r() * 22, r() < 0.4 ? 2 : 1);
    } else if (d.kind === 'hachiko') {
      // Hachiko on his plinth, waiting.
      box(x - 6, y - 6, 12, 12, P.pave0, P.pave1);
      rect(P.brown0, x - 4, y - 1, 7, 3); rect(P.brown0, x + 2, y - 3, 3, 3); rect(P.brown1, x + 3, y - 3, 1, 1); rect(P.brown0, x - 5, y - 2, 1, 2); // body, head, ear, tail
    } else if (d.kind === 'scorch' || d.kind === 'blaze') {
      // Soot blown out round where something burned; a blaze has its heap of burning wreckage and a glow on it.
      for (let k = 0; k < 6; k++) disc('rgba(8,8,8,0.16)', x + (r() - 0.5) * 14, y + (r() - 0.5) * 10, 6 + r() * 9);
      if (d.kind === 'blaze') {
        for (let k = 0; k < 14; k++) { const s = 2 + ((r() * 3) | 0); rect(P.outline, x - 8 + r() * 16, y - 6 + r() * 12 + 1, s, s); rect([P.brown0, P.metal0, P.rust, P.khaki0][k % 4], x - 8 + r() * 16, y - 6 + r() * 12, s, s); }
        disc('rgba(255,150,60,0.16)', x, y, 16); disc('rgba(255,190,90,0.18)', x, y, 8);
      }
    } else if (d.kind === 'crater') {
      // A shell hole: a ragged ring of thrown-up asphalt, dark inside, chunks round it.
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r(); disc(P.pave1, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 7 + r() * 4); }
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r(); disc(P.asphalt0, x + Math.cos(a) * 3, y + Math.sin(a) * 3, 6 + r() * 3); }
      for (let k = 0; k < 4; k++) disc(P.outline, x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 3 + r() * 3);
      for (let k = 0; k < 12; k++) { const a = r() * 7, rr = 13 + r() * 9; dot([P.asphalt2, P.pave1, P.outline][k % 3], x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1 + ((r() * 2) | 0)); }
    } else if (d.kind === 'collapse') {
      // A roof fallen in: a black hole, the joists showing across it, rubble heaped at its edge.
      disc(P.outline, x, y, 13); disc('#0c0b0b', x + 1, y + 1, 10);
      c.save(); c.translate(x, y); c.rotate(r() * 3);
      for (let k = -9; k <= 9; k += 6) { rect(P.brown0, k - 1, -12, 3, 24); rect(P.brown1, k - 1, -12, 1, 24); }
      c.restore();
      for (let k = 0; k < 16; k++) { const a = r() * 7, rr = 9 + r() * 6, s = 1 + ((r() * 3) | 0); rect([P.pave1, P.khaki0, P.brown0, P.metal1][k % 4], x + Math.cos(a) * rr, y + Math.sin(a) * rr, s, s); }
    } else if (d.kind === 'burnt') {
      // A car burned out where it stopped in the street.
      const along = roadAngle(Math.floor(x / T), Math.floor(y / T));
      burntCar(x, y, along === undefined ? r() * 0.8 - 0.4 + (r() < 0.5 ? 0 : Math.PI / 2) : along + (r() - 0.5) * 0.25 + (r() < 0.5 ? 0 : Math.PI), r, false, undefined, true); // where the map put it
    } else if (d.kind === 'laundry') {
      // Washing hung on a line across an alley.
      rect('rgba(0,0,0,0.25)', x - 14, y + 2, 30, 1); rect(P.metal2, x - 15, y, 30, 1);
      for (let k = -13; k < 14; k += 4 + ((r() * 2) | 0)) rect([P.snow1, P.red1, P.navy2, P.flash1, P.teal1, P.maroon2][(r() * 6) | 0], x + k, y + 1, 3, 3 + ((r() * 3) | 0));
    } else if (d.kind === 'court') {
      // A barangay basketball court: its lines, a hoop at each end.
      rect('#5a6b5e', x - 30, y - 18, 60, 36); rect(P.cream, x - 30, y - 18, 60, 1); rect(P.cream, x - 30, y + 17, 60, 1);
      rect(P.cream, x - 30, y - 18, 1, 36); rect(P.cream, x + 29, y - 18, 1, 36); rect(P.cream, x, y - 18, 1, 36);
      c.strokeStyle = P.cream; c.beginPath(); c.arc(x, y, 6, 0, 7); c.stroke();
      for (const hx of [x - 27, x + 27]) { rect(P.outline, hx - 1, y - 4, 3, 8); disc(P.hivis1, hx + (hx < x ? 3 : -3), y, 2); }
    } else if (d.kind === 'billboard') {
      // A video screen on the front, lit up, its glow on the roof round it.
      const px = Math.floor(x / T) * T, py = Math.floor(y / T) * T, col = [P.navy2, P.teal2, P.red2, P.flash1, P.maroon2][(r() * 5) | 0];
      rect('rgba(234, 223, 174, 0.12)', px - 2, py - 2, T + 4, T + 4);
      rect(P.outline, px + 1, py + 2, T - 2, T - 5);
      rect(col, px + 2, py + 3, T - 4, T - 7);
      for (let k = py + 4; k < py + T - 4; k += 2) rect('rgba(0,0,0,0.18)', px + 2, k, T - 4, 1);
      rect(P.flash1, px + 3 + ((r() * 6) | 0), py + 5, 3, 2);
    }
  };
  // The map's landmarks first, so the shade deep in a block falls over them too (a station's roof in the middle of a
  // block is as dark as the rest); then everything else, only where it is not in the shade.
  const LANDMARKS = ['whitehouse', 'cathedral', 'flag', 'colosseum', 'scramble', 'rails'];
  for (const first of [true, false]) {
    if (!first) shadeRoofs();
    for (const d of map.decor ?? []) {
      if (LANDMARKS.includes(d.kind) !== first) continue;
      const grow = S > 1 && GROWS.includes(d.kind);
      if (grow) { c.save(); c.translate(d.x, d.y); c.scale(S, S); c.translate(-d.x, -d.y); }
      one(d);
      if (grow) c.restore();
    }
  }

  cityProps();
  storytelling();
  // Abandoned armour where the map has it: a tank or an APC, dust kicked up round it, parked along its length.
  for (const s of map.solids ?? []) {
    const [len, across] = SOLIDS[s.kind], [sw, sh] = s.vertical ? [across, len] : [len, across], x = (s.tx + sw / 2) * T, y = (s.ty + sh / 2) * T, r = rng(seedOf(s.tx, s.ty, 57));
    disc('rgba(40,34,24,0.35)', x + 3, y + 3, Math.max(sw, sh) * T * 0.55); // churned-up ground, its shadow
    stamp(`${s.kind}/0`, x, y, (s.vertical ? Math.PI / 2 : 0) + (r() < 0.5 ? 0 : Math.PI), 0.12);
  }

  // Traffic lights at the junctions' corners: a dark three-light head on its post (lit by game/mapanims.ts).
  for (const s of signals) {
    if (fadeAt(s.x, s.y) > 0.4) continue;
    rect('rgba(0,0,0,0.35)', s.x - 1, s.y - 4, 6, 11);
    rect(P.outline, s.x - 2, s.y - 5, 6, 11);
    rect('#15161a', s.x - 1, s.y - 4, 4, 9);
    shown.push(s);
  }
  shown.push(...extra, ...fires.filter((f) => fadeAt(f.x, f.y) < 0.4));

  // Window and roof spots a soldier can man: a faint ring (in a fight an amber reticle pulses over it: game/mapanims.ts).
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(196,160,88,0.55)';
  for (const [x, y] of map.slots ?? []) { c.beginPath(); c.arc((x + 0.5) * T, (y + 0.5) * T, 5.5, 0, 7); c.stroke(); }
  // The city goes on past the map's edges: they fade into the dark rather than stop.
  const edge = 3 * T * S;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, edge, 0, 0, 0, edge, H], [W, 0, W - edge, 0, W - edge, 0, edge, H], [0, 0, 0, edge, 0, 0, W, edge], [0, H, 0, H - edge, 0, H - edge, W, edge]]) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(6,7,8,0.85)');
    g.addColorStop(1, 'rgba(6,7,8,0)');
    c.fillStyle = g;
    c.fillRect(rx, ry, rw, rh);
  }
  tex.refresh();
  return key;

  /** What only this city has in its streets: Tokyo's vending machines and neon signs, London's red phone boxes,
   *  Manila's jeepneys, Mexico City's papel picado over the Zocalo. Placed by the tile, the same every time. */
  function cityProps() {
    const city = map.name, open = (x: number, y: number) => fade(x, y) < 0.4;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, r = rng(seedOf(x, y, 77)), px = x * T, py = y * T;
        if (!open(x, y)) continue;
        // Against a building's wall, on the sidewalk below it.
        const underWall = side[i] && built(x, y - 1);
        if (city === 'Tokyo' && underWall && r() < 0.05) {
          const col = ['#c9473a', '#e2dccb', '#3f5a7a', '#4f8a86'][(r() * 4) | 0];
          box(px + 3, py + 1, 9, 6, col, '#f2f2ea'); rect('#9ad0e0', px + 4, py + 2, 7, 2); for (let k = 0; k < 4; k++) dot(['#f0c860', '#c9473a', '#4f8a86', '#e2dccb'][k], px + 4 + k * 2, py + 5);
        }
        if (city === 'London' && underWall && r() < 0.025) {
          box(px + 5, py + 1, 6, 6, '#b8322b', '#e05a4c'); rect('#7a2620', px + 6, py + 3, 4, 1); rect('#e2dccb', px + 6, py + 5, 4, 1);
        }
        // On a building's front, facing the street: a sign lit up in neon.
        if (city === 'Tokyo' && wall[i] && !built(x, y + 1) && r() < 0.1) {
          const col = ['#ff4fa0', '#4fe0ff', '#ffd040', '#a060ff', '#60ff90'][(r() * 5) | 0];
          rect(P.outline, px + 2, py + T - 9, 12, 4); rect(col, px + 3, py + T - 8, 10, 2);
          shown.push({ kind: 'neon', x: px + 8, y: py + T - 7, n: parseInt(col.slice(1), 16) });
        }
        // In the road, along it: a jeepney burned out where it stopped.
        if (city === 'Manila' && road[i] && r() < 0.006) {
          // (The ones that can still be moved are props in the map: these burned where they stopped.)
          const along = roadAngle(x, y);
          if (along !== undefined) burntCar(px + T / 2, py + T / 2, along + (r() < 0.5 ? 0 : Math.PI), r, false, 'jeepney/0');
        }
      }
    // Main Street: a diner with its chrome and neon, a gas station's pumps under their canopy. New York: yellow cabs, steam
    // pouring from orange-and-white stacks over the vents. The White House: floodlights on the lawn, the Secret Service's
    // black cars at the gate. (Each the first few places that fit, by the tile.)
    let diner = 0, gas = 0, flood = 0, service = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, r = rng(seedOf(x, y, 131)), px = x * T, py = y * T, cx = px + T / 2, cy = py + T / 2;
        if (!open(x, y)) continue;
        if (city === 'Main Street' && wall[i] && !built(x, y + 1) && diner < 3 && r() < 0.03 && built(x + 1, y) && built(x - 1, y)) {
          diner++;
          rect('#c9473a', px - T, py + T - 10, 3 * T, 3); for (let k = px - T; k < px + 2 * T; k += 4) rect('#e2dccb', k, py + T - 10, 2, 3); // a striped awning
          rect('#9aa0a4', px - T, py + T - 7, 3 * T, 1); // chrome
          rect(P.outline, px + 1, py + T - 16, 14, 5); rect('#ff4fa0', px + 2, py + T - 15, 12, 3);
          shown.push({ kind: 'neon', x: px + 8, y: py + T - 14, n: 0xff4fa0 });
        }
        if (city === 'Main Street' && side[i] && isRoad(x, y + 1) && !built(x, y - 1) && gas < 2 && r() < 0.01) {
          gas++;
          rect('rgba(0,0,0,0.3)', px - 6 + 3, py - 10 + 3, 3 * T, 12); rect(P.outline, px - 7, py - 11, 3 * T + 2, 14); rect('#e2dccb', px - 6, py - 10, 3 * T, 12); rect('#c9473a', px - 6, py - 10, 3 * T, 3); // the canopy
          for (const k of [0, 1, 2]) box(px - 2 + k * 15, py + 6, 5, 7, ['#c9473a', '#3f5a7a', '#4f8a86'][k], '#f2f2ea'); // the pumps
        }
        // New York: more of its cabs, burned where they stopped (the ones still whole are props in the map, to be moved).
        if (city === 'New York' && roadAngle(x, y) !== undefined && r() < 0.005) burntCar(cx, cy, roadAngle(x, y)! + (r() < 0.5 ? 0 : Math.PI), r, false, 'taxi/0');
        if (city === 'New York' && road[i] && r() < 0.0025) {
          // A Con Ed stack: orange and white, steam pouring off it.
          disc('rgba(0,0,0,0.35)', cx + 2, cy + 2, 4); disc(P.outline, cx, cy, 4); disc('#f08a28', cx, cy, 3.2); rect('#f2f2ea', cx - 3, cy - 1, 6, 2);
          shown.push({ kind: 'vent', x: cx, y: cy });
        }
        if (city === 'White House' && (side[i] || ch(x, y) === ',' || isGreen(x, y)) && flood < 6 && r() < 0.004) {
          flood++;
          rect('rgba(0,0,0,0.35)', cx + 1, cy - 1, 3, 12); rect(P.metal1, cx - 1, cy - 10, 2, 12); box(cx - 4, cy - 13, 8, 4, P.metal1, '#f2f2ea');
          shown.push({ kind: 'flood', x: cx, y: cy });
        }
        if (city === 'White House' && roadAngle(x, y) !== undefined && service < 4 && r() < 0.006) { service++; suv(cx, cy, roadAngle(x, y)! + (r() < 0.5 ? 0 : Math.PI)); }
      }
    // Mexico City: strings of papel picado across the Zocalo, every few rows of it.
    if (city === 'Mexico City')
      for (let y = 2; y < h - 2; y += 5 * S)
        for (let x = 0; x < w; x++) {
          if (ch(x, y) !== ',' || ch(x - 1, y) === ',' || !open(x, y)) continue;
          let e = x;
          while (ch(e + 1, y) === ',') e++;
          if (e - x < 4) continue;
          const y0 = y * T + T / 2, x0 = x * T, x1 = (e + 1) * T, F = 3 * S; // each paper flag F pixels across
          rect(P.metal2, x0, y0, x1 - x0, 1);
          for (let k = x0 + 2, n = 0; k < x1 - F; k += F + 2, n++) {
            const col = ['#e05a8a', '#f0c860', '#4fb0e0', '#60c070', '#f08a40', '#a060d0'][n % 6];
            rect('rgba(0,0,0,0.22)', k + 2, y0 + 4, F, F); // its shadow on the paving
            rect(col, k, y0 + 1, F, F); rect(col, k + 1, y0 + 1 + F, F - 2, 1); rect(col, k + 2, y0 + 2 + F, F - 4, 1); // cut to a point
            rect('rgba(255,255,255,0.45)', k + 1, y0 + 3, F - 2, 1); dot('rgba(0,0,0,0.25)', k + F / 2, y0 + 2 + F / 2, 1); // cut-outs
          }
          x = e;
        }
  }

  /** A Secret Service car from above: black, tinted glass, red and blue lights in the grille. */
  function suv(x: number, y: number, a: number) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(S, S);
    rect('rgba(0,0,0,0.4)', -10, -4, 23, 11); rect(P.outline, -12, -6, 24, 12); rect('#1c1e22', -11, -5, 22, 10);
    rect('#3a4048', -5, -4, 11, 8); rect('#2a2e34', -3, -4, 6, 8);
    rect('#ff3b2e', 10, -3, 1, 2); rect('#3b7bff', 10, 1, 1, 2);
    c.restore();
  }


  /** A car burned out where it stopped, along the street (`a`): a scorch under it, the shell blackened, rust and ash
   *  on it, glass gone; `door`: one door hanging open, charred. Only drawn: it is not a car that can be moved. */
  function burntCar(x: number, y: number, a: number, r: () => number, door: boolean, model?: string, force = false) {
    // Not on top of another vehicle: one already burned here, or one standing in the street to be moved.
    if (!force && parked.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + 26)) return false;
    parked.push([x, y, 26]);
    // Whatever it was before it burned: one of the wrecks, a taxi, a sedan (in Manila a jeepney too). A taxi's or a
    // jeepney's paint still shows through the soot.
    const MODELS = ['car/0', 'car/1', 'car/2', 'taxi/0', 'sedan/0', 'sedan/1', 'sedan/3', ...(map.name === 'Manila' ? ['jeepney/0', 'jeepney/0'] : [])];
    const pick = model ?? MODELS[Math.floor(r() * MODELS.length)], soot = pick === 'taxi/0' || pick === 'jeepney/0' ? 0.45 + r() * 0.1 : 0.7 + r() * 0.12;
    disc('rgba(10,10,10,0.45)', x, y, 9 * S);
    for (let k = 0; k < 10; k++) dot('rgba(20,18,16,0.5)', x + (r() - 0.5) * 22 * S, y + (r() - 0.5) * 22 * S, 1 + r() * 2); // soot round it
    stamp(pick, x, y, a, soot);
    c.save(); c.translate(x, y); c.rotate(a);
    for (let k = 0; k < 14; k++) dot(r() < 0.5 ? '#6a3a22' : r() < 0.5 ? '#3a3632' : '#8a6a4a', (r() - 0.5) * 34, (r() - 0.5) * 18, r() < 0.3 ? 2 : 1); // rust and ash
    rect('#141210', 3, -9, 6, 18); rect('#141210', -13, -8, 5, 16); // the glass gone, black holes
    if (door) { rect(P.outline, -2, 13, 10, 4); rect('#2a2624', -1, 14, 8, 2); } // a door hanging open
    c.restore();
    // A quarter of them still burning, a quarter smoking, the rest gone cold (game/ambience.ts sets them going).
    const left = rng(seedOf(Math.round(x), Math.round(y), 17))();
    if (left < 0.5) shown.push({ kind: left < 0.25 ? 'carfire' : 'carsmoke', x, y });
    return true;
  }

  /** What people left as they ran: cars with their doors hanging open, suitcases dropped short of the camp, chalk
   *  arrows pointing the way to it, and (with gore on) blood trailing off the map. */
  function storytelling() {
    const way = distanceField(grid, grid.goals, (i) => (wall[i] ? Infinity : 1));
    const next = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].reduce((b, [dx, dy]) => (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && way[(y + dy) * w + x + dx] < way[(y + b[1]) * w + x + b[0]] ? [dx, dy] : b), [0, 0]);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, r = rng(seedOf(x, y, 91)), px = x * T, py = y * T, cx = px + T / 2, cy = py + T / 2;
        if (wall[i] || goal[i] || fade(x, y) > 0.4 || !Number.isFinite(way[i])) continue;
        // A car left in the road, a door open, something spilled from it.
        const along = roadAngle(x, y);
        if (along !== undefined && r() < 0.0025 && burntCar(cx, cy, along + (r() - 0.5) * 0.2 + (r() < 0.5 ? 0 : Math.PI), r, true)) {
          dot(P.cloth2, cx + 7, cy + 7, 2); dot(P.khaki1, cx + 9, cy + 5); // something spilled from it
        }
        // Suitcases dropped a few tiles short of the camp.
        if (way[i] > 2 && way[i] < 6 * S && r() < 0.035) {
          const col = [P.navy1, P.brown1, P.maroon2, P.olive1][(r() * 4) | 0], sx = px + 2 + r() * 8, sy = py + 2 + r() * 8;
          box(sx, sy, 6, 4, col, 'rgba(255,255,255,0.25)'); rect(P.outline, sx + 2, sy - 1, 2, 1);
        }
        // A chalk arrow on the road, the way to the camp.
        if (road[i] && way[i] > 8 * S && r() < 0.004) {
          const [dx, dy] = next(x, y), ang = Math.atan2(dy, dx);
          c.save(); c.translate(cx, cy); c.rotate(ang);
          rect('rgba(234,232,220,0.7)', -6, -1, 10, 2); for (let k = 0; k < 4; k++) { rect('rgba(234,232,220,0.7)', 4 - k, -1 - k, 1, 1); rect('rgba(234,232,220,0.7)', 4 - k, k, 1, 1); }
          c.restore();
        }
      }
    // Blood trailing off the edge of the map, where someone was dragged away.
    if (blood)
      for (let k = 0; k < 4; k++) {
        const r = rng(seedOf(k, w, 13)), along = (0.15 + r() * 0.7), side4 = k % 4;
        let x = side4 < 2 ? along * W : side4 === 2 ? 4 * T : W - 4 * T, y = side4 >= 2 ? along * H : side4 === 0 ? 4 * T : H - 4 * T;
        const [dx, dy] = [[0, -1], [0, 1], [-1, 0], [1, 0]][side4], tx = Math.floor(x / T), ty = Math.floor(y / T);
        if (tx < 0 || ty < 0 || tx >= w || ty >= h || wall[ty * w + tx] || goal[ty * w + tx]) continue;
        for (let s = 0; s < 18; s++) { disc(r() < 0.5 ? P.blood0 : P.blood1, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, 0.8 + r() * 1.4); x += dx * 3.5 + (r() - 0.5) * 2; y += dy * 3.5 + (r() - 0.5) * 2; }
      }
  }
}
