// Paints a map once into one texture, tile by tile. Every tile is one kind, picked from its map letter and its
// neighbours: road (with lane lines, crosswalks, manholes), sidewalk (with a curb toward the road), plaza, grass,
// a tree on grass, the safe zone, or a roof; a roof tile on the edge of its building gets a parapet, and on the
// street side the building's wall; where two kinds of open ground meet at a corner, it is rounded off (a curb's curve,
// a lawn's). Each tile is painted clipped to its own square, so nothing (a tree, a crack, a
// splat of blood) ever spills into the next one. Building kinds have their own roofs and walls. Seeded per tile, so
// a map always looks the same.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { BUILDING, type Grid, type MapData } from '../sim/grid.ts';

const P = palette;
const LANES = 10; // the most lanes a road can have; wider than that both ways is a crossing
const SHADE = { rgb: [0, 0, 0], most: 1, over: 5 }; // roofs deep inside a block darken all the way to black, over 5 tiles (times the map's scale)
/** Each shanty and each casita its own colour: tin, rust, tarp; ochre, rose, teal. */
const PATCHES = { y: ['#6a5444', '#5b6970', '#7a4a3a', '#5f6a4f', '#857f73', '#3f5a7a', '#8a6a3a'], x: ['#b0704f', '#c49a4a', '#b06a78', '#4f8a86', '#8a9a4a', '#c08a5a'] };
type Front = 'brick' | 'glass' | 'shop' | 'deck' | 'clinic' | 'metal' | 'stone' | 'shack' | 'stucco';
interface Roof { base: string; dark: string; light: string; front: Front; texture: 'gravel' | 'panels' | 'deck' | 'clean' | 'ribs' | 'tin' }
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

/** The decor each painted map shows (some is left out: deep in a roof's shade, or where it does not belong). */
export const drawn = new Map<string, { kind: string; x: number; y: number }[]>();

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
  const fires: { kind: string; x: number; y: number }[] = []; // on the roofs of buildings burning
  const extra: { kind: string; x: number; y: number }[] = []; // trees' crowns and the camp's helicopter, to move
  const runX = (x: number, y: number) => { let a = x, b = x; while (isRoad(a - 1, y)) a--; while (isRoad(b + 1, y)) b++; return [a, b]; };
  const runY = (x: number, y: number) => { let a = y, b = y; while (isRoad(x, a - 1)) a--; while (isRoad(x, b + 1)) b++; return [a, b]; };
  /** Where two roads cross: the road runs on a long way both across and down. */
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
  const patch = (x: number, y: number, list: string[]) => list[Math.abs(Math.imul(lot(x, y), 2654435761) >>> 7) % list.length];
  const same = (x: number, y: number, x2: number, y2: number) => built(x2, y2) && (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h || lot(x, y) === lot(x2, y2));

  // ---- The tiles ----
  const asphalt = (px: number, py: number, r: () => number) => {
    rect(P.asphalt1, px, py, T, T);
    if (r() < 0.35) rect('rgba(0,0,0,0.08)', px + ((r() * 6) | 0), py + ((r() * 6) | 0), 6 + ((r() * 6) | 0), 6 + ((r() * 6) | 0)); // a darker patch
    for (let k = 0; k < 14; k++) dot(k % 3 ? P.asphalt0 : P.asphalt2, px + r() * T, py + r() * T);
  };
  const paveSlabs = (px: number, py: number, r: () => number, big: boolean) => {
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
    const t = ch(x, y), roof = ROOFS[t] ?? ROOFS['#'], base = t === 'y' || t === 'x' ? patch(x, y, PATCHES[t]) : roof.base;
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
    else for (let k = 0; k < T; k += 3) { rect(roof.light, px + k, py, 1, T); rect(roof.dark, px + k + 1, py, 1, T); } // corrugated ribs
    const edgeN = !same(x, y, x, y - 1), edgeS = !same(x, y, x, y + 1), edgeW = !same(x, y, x - 1, y), edgeE = !same(x, y, x + 1, y);
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
    if (!built(x, y + 1)) wallFace(roof.front, x, px, py, r);
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
        else if ((vertical || flat) && straight && (vertical ? across : down) >= 2 * S) {
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
      // Buildings and trees throw shade down and to the right, onto the tile beside them.
      if (!wall[i]) {
        if (built(x - 1, y)) rect('rgba(0,0,0,0.3)', px, py, 5, T);
        if (built(x, y - 1)) rect('rgba(0,0,0,0.3)', px, py, T, 4);
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
  // A step of a staircase edge (a street or path on the slant, built of tiles) is cut along its own length on one side
  // only, so the steps' cuts join into one straight slant. A real corner (its edges longer than S tiles) is cut S tiles
  // back on the slant, or, a building's, rounded off (only drawn: the building still stands to its square corner). The
  // other kind fills the cut, edged with a curb or a stone rim; a sidewalk's corner at a junction gets a traffic light.
  const kindOf = (x: number, y: number) => (built(x, y) && x >= 0 && y >= 0 && x < w && y < h ? 'house' : ground(x, y));
  const RANK: Record<string, number> = { house: 0, green: 1, side: 2, plaza: 3, road: 4 }; // on a staircase the lower one gives way
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
        while (lx <= 2 * S && kindOf(x - sx * lx, y) === A && kindOf(x - sx * lx, y + sy) === B) lx++;
        while (ly <= 2 * S && kindOf(x, y - sy * ly) === A && kindOf(x + sx, y - sy * ly) === B) ly++;
        const stepX = lx <= 2 * S && kindOf(x - sx * lx, y + sy) === A, stepY = ly <= 2 * S && kindOf(x + sx, y - sy * ly) === A;
        const stair = stepX && stepY;
        if (stair && RANK[A] > RANK[B]) continue;
        // A step is cut its whole length each way, so the slant matches the staircase's slope. A lone jog (an edge that
        // shifts sideways: a short edge between two long ones) has two corners, one each way; each is cut half the
        // jog back along both edges, so the two cuts meet in one slant across the middle of the jog. Every edge of a
        // street (curb, building line) jogging together then slants across the same rows, keeping its width.
        const jog = !stair && ((stepX && ly > 2 * S) || (stepY && lx > 2 * S)), round = A === 'house' && !stair && !jog;
        if (D !== B && !jog) continue;
        if (B === 'house' && !jog) continue; // a building only gives way to the ground at a jog's other corner
        const half = (stepX ? lx : ly) / 2;
        const cx = stair ? lx : jog ? half : Math.min(lx, S), cy = stair ? ly : jog ? half : Math.min(ly, S);
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

  // ---- The safe zone's camp: tents in rows, and a pad for the helicopter (which is drawn live) ----
  /** A canvas tent from above: its shadow, the two slopes either side of the ridge, pegs, the door flap; a medical
   *  one has a red cross. */
  const tent = (x: number, y: number, tw: number, th: number, medic: boolean) => {
    rect('rgba(0,0,0,0.35)', x + 3, y + 3, tw, th);
    rect(P.outline, x - 1, y - 1, tw + 2, th + 2);
    rect(P.olive1, x, y, tw, th / 2);
    rect(P.olive0, x, y + th / 2, tw, th / 2);
    rect(P.olive2, x, y + th / 2 - 1, tw, 2); // the ridge
    for (const gx of [x - 3, x + tw + 2]) for (const gy of [y + 2, y + th - 3]) dot(P.khaki1, gx, gy);
    rect(P.outline, x + tw / 2 - 3, y + th - 2, 6, 2);
    if (medic) { rect(P.snow1, x + tw / 2 - 5, y + 2, 10, th / 2 - 3); rect(P.red1, x + tw / 2 - 1, y + 3, 2, th / 2 - 5); rect(P.red1, x + tw / 2 - 3, y + th / 4 - 1, 6, 2); }
  };
  if (!(map.decor ?? []).some((d) => d.kind === 'whitehouse')) {
    const done = new Uint8Array(w * h);
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
      if (x1 - x0 < 4 * S || y1 - y0 < 3 * S) continue; // too small for a camp
      const inZone = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && goal[y * w + x] === 1;
      // The pad: the map's own helipad if it has one here, else a new one in the middle.
      const own = (map.decor ?? []).find((d) => d.kind === 'helipad' && inZone(Math.floor(d.x / T), Math.floor(d.y / T)));
      const pad = own ? [own.x, own.y] : [((x0 + x1 + 1) / 2) * T, ((y0 + y1 + 1) / 2) * T];
      if (!own) {
        c.save(); c.translate(pad[0], pad[1]); c.scale(S, S);
        c.strokeStyle = P.flash0; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.stroke(); c.lineWidth = 1;
        rect(P.flash0, -10, -12, 4, 24); rect(P.flash0, 6, -12, 4, 24); rect(P.flash0, -6, -2, 12, 4);
        c.restore();
      }
      extra.push({ kind: 'heli', x: pad[0], y: pad[1] });
      // Tents in rows, clear of the pad and the fence.
      const tw = 2 * S, th = Math.max(2, Math.round(1.5 * S)), step = 3 * S;
      let n = 0;
      for (let ty = y0 + S; ty + th <= y1 - S + 1 && n < 10; ty += step)
        for (let tx = x0 + S; tx + tw <= x1 - S + 1 && n < 10; tx += step + S) {
          if (Math.hypot((tx + tw / 2) * T - pad[0], (ty + th / 2) * T - pad[1]) < (3.5 * S + 1) * T) continue;
          let fits = true;
          for (let y = ty - 1; y <= ty + th; y++) for (let x = tx - 1; x <= tx + tw; x++) if (!inZone(x, y)) fits = false;
          if (!fits) continue;
          tent(tx * T, ty * T, tw * T, th * T, n % 4 === 1);
          n++;
        }
    }
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
  const shown: { kind: string; x: number; y: number }[] = [];
  drawn.set(key, shown);
  /** Things drawn at a size of their own (the grounds' furniture: fountains, beds, the court, the L) grow with the map. */
  const GROWS = ['fountain', 'flowers', 'helipad', 'flag', 'court', 'laundry', 'el'];
  const one = (d: { kind: string; x: number; y: number }) => {
    const { x, y } = d, r = rng(seedOf(x, y, 3));
    // Landmarks, drawn whole wherever they are.
    if (d.kind === 'whitehouse') { whiteHouse(x, y); return; }
    if (d.kind === 'cathedral') { cathedral(x, y); return; }
    if (d.kind === 'flag') { flag(x, y); shown.push(d); return; }
    if (d.kind === 'colosseum') { colosseum(x, y); return; }
    if (d.kind === 'scramble') { scramble(x, y); return; }
    if (d.kind === 'rails') { rails(x, y); return; }
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
      disc('rgba(10,10,10,0.45)', x, y, 16);
      stamp(`car/${(x + y) % 3}`, x, y, r() * 0.8 - 0.4 + (r() < 0.5 ? 0 : Math.PI / 2), 0.66);
    } else if (d.kind === 'el') {
      // A stretch of Chicago's elevated railway over the street: its shadow, the steel deck, sleepers and rails, and a
      // pillar under every other stretch.
      const len = 2 * T;
      rect('rgba(0,0,0,0.3)', x - len / 2 + 6, y - 7, len, 22);
      rect(P.outline, x - len / 2, y - 11, len, 22); rect(P.metal0, x - len / 2, y - 10, len, 20);
      for (let k = x - len / 2; k < x + len / 2; k += 3) rect(P.brown0, k, y - 9, 2, 18);
      for (const dy of [-7, -3, 3, 7]) rect(P.metal2, x - len / 2, y + dy, len, 1);
      if (Math.round(x / len) % 2 === 0) { rect(P.outline, x - 3, y + 11, 6, 3); rect(P.metal1, x - 2, y + 11, 4, 2); }
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
  tex.refresh();
  return key;
}
