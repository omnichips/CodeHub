// Paints a map once into one texture, tile by tile. Every tile is one kind, picked from its map letter and its
// neighbours: road (with lane lines, crosswalks, manholes), sidewalk (with a curb toward the road), plaza, grass,
// a tree on grass, the safe zone, or a roof; a roof tile on the edge of its building gets a parapet, and on the
// street side the building's wall. Each tile is painted clipped to its own square, so nothing (a tree, a crack, a
// splat of blood) ever spills into the next one. Building kinds have their own roofs and walls. Seeded per tile, so
// a map always looks the same.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { BUILDING, type Grid, type MapData } from '../sim/grid.ts';

const P = palette;
const LANES = 10; // the most lanes a road can have; wider than that both ways is a crossing
const SHADE = { rgb: [0, 0, 0], most: 0.55, over: 4 }; // roofs deep inside a block darken: to black, at most 55%, over 4 tiles
type Front = 'brick' | 'glass' | 'shop' | 'deck' | 'clinic' | 'metal';
interface Roof { base: string; dark: string; light: string; front: Front; texture: 'gravel' | 'panels' | 'deck' | 'clean' | 'ribs' }
/** Each kind of building: its roof and the wall it shows the street. */
const ROOFS: Record<string, Roof> = {
  b: { base: '#3d3634', dark: '#2d2827', light: '#4d4441', front: 'brick', texture: 'gravel' }, // brownstones
  a: { base: '#36332f', dark: '#282623', light: '#46423c', front: 'brick', texture: 'gravel' }, // apartments, with a water tower
  h: { base: '#3e3b36', dark: '#2e2c28', light: '#4f4b44', front: 'shop', texture: 'gravel' }, // shops
  o: { base: '#3d4042', dark: '#2e3133', light: '#55595b', front: 'glass', texture: 'panels' }, // offices
  g: { base: '#4a4843', dark: '#3a3935', light: '#5a5852', front: 'deck', texture: 'deck' }, // a parking deck
  m: { base: '#7a776e', dark: '#68655d', light: '#8d897f', front: 'clinic', texture: 'clean' }, // the hospital
  w: { base: '#474c4c', dark: '#373b3b', light: '#5d6363', front: 'metal', texture: 'ribs' }, // warehouses
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

/** Makes the map texture `key` (once) and returns it. `blood` is off when gore is set to none. */
export function paintMap(scene: Phaser.Scene, map: MapData, grid: Grid, key: string, blood: boolean) {
  if (scene.textures.exists(key)) return key;
  const { w, h, tile: T, wall, goal } = grid, W = w * T, H = h * T;
  const tex = scene.textures.createCanvas(key, W, H)!, c = tex.context;
  const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : map.rows[y][x]);
  const built = (x: number, y: number) => BUILDING.includes(ch(x, y));
  const rect = (col: string, x: number, y: number, ww: number, hh: number) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  const dot = (col: string, x: number, y: number, s = 1) => rect(col, Math.round(x), Math.round(y), s, s);
  const disc = (col: string, x: number, y: number, rr: number) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); };

  // ---- What each open tile is ----
  // Sidewalk: open street next to a building (diagonals too). Road: the rest of the open street.
  const side = new Uint8Array(w * h), road = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ch(x, y);
      if (t !== '.' && t !== 'S') continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (built(x + dx, y + dy)) near = true;
      (near ? side : road)[y * w + x] = 1;
    }
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && road[y * w + x] === 1;
  const isGreen = (x: number, y: number) => ch(x, y) === 'p' || ch(x, y) === 't';
  const runX = (x: number, y: number) => { let a = x, b = x; while (isRoad(a - 1, y)) a--; while (isRoad(b + 1, y)) b++; return [a, b]; };
  const runY = (x: number, y: number) => { let a = y, b = y; while (isRoad(x, a - 1)) a--; while (isRoad(x, b + 1)) b++; return [a, b]; };
  /** Where two roads cross: the road runs on a long way both across and down. */
  const crossing = (x: number, y: number) => { if (!isRoad(x, y)) return false; const [a1, b1] = runX(x, y), [a2, b2] = runY(x, y); return b1 - a1 >= LANES && b2 - a2 >= LANES; };

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
  const lot = (x: number, y: number) => { const t = ch(x, y); return t === 'b' || t === 'h' ? Math.floor(x / 4) * 100000 + region[y * w + x] : region[y * w + x]; };
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
  const roofTile = (x: number, y: number, px: number, py: number, r: () => number) => {
    const t = ch(x, y), roof = ROOFS[t] ?? ROOFS['#'];
    rect(roof.base, px, py, T, T);
    if ((lot(x, y) * 37) % 5 === 1) rect('rgba(90,60,50,0.1)', px, py, T, T); // lots differ a little
    if (roof.texture === 'gravel') for (let k = 0; k < 20; k++) dot(r() < 0.55 ? roof.dark : roof.light, px + r() * T, py + r() * T);
    else if (roof.texture === 'panels') { rect(roof.dark, px, py + 7, T, 1); rect(roof.dark, px + 7, py, 1, T); rect(roof.light, px, py, T, 1); for (let k = 0; k < 6; k++) dot(roof.dark, px + r() * T, py + r() * T); }
    else if (roof.texture === 'deck') { for (let k = 0; k < 8; k++) dot(roof.dark, px + r() * T, py + r() * T); if (x % 3 === 0) rect(P.pave1, px + 1, py, 1, T); if (r() < 0.12) disc('rgba(0,0,0,0.25)', px + 4 + r() * 8, py + 4 + r() * 8, 2.5); } // bay lines, oil
    else if (roof.texture === 'clean') for (let k = 0; k < 6; k++) dot(r() < 0.6 ? roof.dark : roof.light, px + r() * T, py + r() * T);
    else for (let k = 0; k < T; k += 3) { rect(roof.light, px + k, py, 1, T); rect(roof.dark, px + k + 1, py, 1, T); } // corrugated ribs
    const edgeN = !same(x, y, x, y - 1), edgeS = !same(x, y, x, y + 1), edgeW = !same(x, y, x - 1, y), edgeE = !same(x, y, x + 1, y);
    // A parapet where the roof ends: lit on the top and left, in shade on the bottom and right.
    if (edgeN) { rect(P.cream, px, py, T, 2); rect(P.outline, px, py + 2, T, 1); }
    if (edgeW) { rect(P.cream, px, py, 2, T); rect(P.outline, px + 2, py, 1, T); }
    if (edgeS) rect(P.pave0, px, py + T - 2, T, 2);
    if (edgeE) rect(P.pave0, px + T - 2, py, 2, T);
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
      if (front === 'shop') for (let k = 0; k < 4; k++) rect(k % 2 ? P.cream : [P.red1, P.olive2, P.teal1][Math.floor(x / 4) % 3], px + k * 4, y0 - 2, 4, 2); // the awning
    } else if (front === 'glass') {
      rect(P.navy1, px, y0, T, 6); rect(P.navy2, px, y0, T, 1);
      for (let k = 0; k < T; k += 4) rect(P.metal0, px + k, y0, 1, 6); // mullions
    } else if (front === 'deck') {
      rect(P.pave0, px, y0, T, 6); rect(P.outline, px + 2, y0 + 2, 12, 2);
    } else if (front === 'clinic') {
      rect(P.snow1, px, y0, T, 6); rect(P.snow2, px, y0, T, 1);
      rect(P.cloth1, px + 3, y0 + 2, 3, 2); rect(P.cloth1, px + 10, y0 + 2, 3, 2);
      if (x % 6 === 0) { rect(P.red1, px + 7, y0 + 1, 2, 4); rect(P.red1, px + 6, y0 + 2, 4, 2); }
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
      if (wall[i]) roofTile(x, y, px, py, r);
      else if (goal[i]) {
        rect(P.pave0, px, py, T, T);
        rect('#545049', px + 1, py + 1, T - 2, T - 2);
        if ((x + y) % 2) dot(P.pave1, px + 4 + r() * 8, py + 4 + r() * 8);
        if (!goal[i - w]) for (let k = 0; k < 4; k++) rect(k % 2 ? P.outline : P.flash0, px + k * 4, py, 4, 3); // hazard edge
      } else if (t === 'p') grass(x, y, px, py, r);
      else if (t === 't') { grass(x, y, px, py, r); tree(px + T / 2, py + T / 2, 7, r); }
      else if (t === ',') { paveSlabs(px, py, r, true); curbs(x, y, px, py); }
      else if (side[i]) { paveSlabs(px, py, r, false); curbs(x, y, px, py); }
      else {
        asphalt(px, py, r);
        // A stretch of road is a tile per lane across. It shows them all: a solid line down the middle, dashes between
        // the rest; the tiles next to a crossing get a crosswalk instead, and a crossing has no lanes.
        const [ax, bx] = runX(x, y), [ay, by] = runY(x, y), across = bx - ax + 1, down = by - ay + 1;
        const vertical = across <= LANES && down > across, flat = down <= LANES && across > down;
        if (vertical && (crossing(x, y - 1) || crossing(x, y + 1))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 1, py + 2 + k * 5, T - 2, 2);
        else if (flat && (crossing(x - 1, y) || crossing(x + 1, y))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 2 + k * 5, py + 1, 2, T - 2);
        else if (vertical || flat) {
          const [a, b, k, along] = vertical ? [ax, bx, x, y] : [ay, by, y, x], n = b - a + 1, middle = n % 2 ? -1 : a + n / 2;
          // The line between lane `edge - 1` and lane `edge`, on this tile's near (0) or far (1) side.
          const line = (edge: number, far: number) => {
            const solid = edge === middle;
            if (!solid && along % 2) return; // dashes: one tile on, one off
            const col = solid ? P.paint : P.pave1, at = far ? T - 1 : 0, from = solid ? 0 : 4, len = solid ? T : 8;
            if (vertical) rect(col, px + at, py + from, 1, len);
            else rect(col, px + from, py + at, len, 1);
          };
          if (k > a) line(k, 0);
          if (k < b) line(k + 1, 1);
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
      if (!wall[y * w + x] || seen.has(lot(x, y))) continue;
      const l = lot(x, y), t = ch(x, y), r = rng(seedOf(x, y, 7));
      seen.add(l);
      const tiles: [number, number][] = [];
      for (let yy = y; yy < Math.min(h, y + 40); yy++) for (let xx = Math.max(0, x - 40); xx < Math.min(w, x + 40); xx++) if (built(xx, yy) && lot(xx, yy) === l) tiles.push([xx, yy]);
      const mid = [Math.round(tiles.reduce((n, p) => n + p[0], 0) / tiles.length), Math.round(tiles.reduce((n, p) => n + p[1], 0) / tiles.length)];
      if (t === 'm' && inside(mid[0] - 1, mid[1] - 1, mid[0] + 1, mid[1] + 1, l)) {
        // The hospital's roof: a big red cross on a white square. A landmark: painted after the fade, so it stays.
        const cx = (mid[0] + 0.5) * T, cy = (mid[1] + 0.5) * T;
        landmarks.push(() => {
          rect(P.snow1, cx - 22, cy - 22, 44, 44); rect(P.snow2, cx - 22, cy - 22, 44, 2);
          rect(P.red1, cx - 6, cy - 18, 12, 36); rect(P.red1, cx - 18, cy - 6, 36, 12); rect(P.red2, cx - 6, cy - 18, 12, 2); rect(P.red2, cx - 18, cy - 6, 2, 12);
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
    }

  // ---- Deep inside a block, the roofs fade into shadow ----
  // Only the edge that faces a street keeps its detail, which keeps a big map calm. Distance is counted in tiles from
  // the ground anyone can walk to (reached from the safe zone; a walled-in courtyard fades too). It is smoothed in 4 px
  // steps between tile centres, so it reads as a gradient, not as blocks.
  const reach = new Uint8Array(w * h), dist = new Float32Array(w * h).fill(Infinity), queue: number[] = [];
  for (const i of grid.goals) { reach[i] = 1; queue.push(i); }
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
  const fade = (x: number, y: number) => { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); return Math.max(0, Math.min(1, (dist[y * w + x] - 1) / SHADE.over)) * SHADE.most; };
  const fadeAt = (wx: number, wy: number) => fade(Math.floor(wx / T), Math.floor(wy / T));
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
  for (const draw of landmarks) draw();

  // ---- Decor from the map, each only where it belongs: nothing stands in the road but manholes ----
  const kindAt = (x: number, y: number) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), i = ty * w + tx;
    return tx < 0 || ty < 0 || tx >= w || ty >= h ? 'off' : wall[i] ? 'roof' : goal[i] ? 'safe' : isGreen(tx, ty) ? 'grass' : ch(tx, ty) === ',' ? 'plaza' : side[i] ? 'sidewalk' : 'road';
  };
  const WHERE: Record<string, string[]> = {
    tree: ['grass', 'sidewalk', 'plaza'], lamp: ['sidewalk', 'plaza'], manhole: ['road'], rubble: ['road', 'sidewalk', 'plaza'], wreck: ['roof'],
    sandbag: ['plaza', 'safe', 'sidewalk'], helipad: ['plaza', 'safe'], barrel: ['sidewalk', 'plaza', 'roof', 'safe'], crate: ['sidewalk', 'plaza', 'roof', 'safe'],
    trash: ['sidewalk'], dumpster: ['sidewalk'], hydrant: ['sidewalk'], cone: ['road'], bench: ['plaza', 'grass'], bin: ['sidewalk', 'plaza'],
  };
  /** A small box from above: outline, body, a lit top edge. */
  const box = (x: number, y: number, ww: number, hh: number, body: string, lit: string) => {
    rect('rgba(0,0,0,0.35)', x + 1, y + 1, ww + 1, hh + 1);
    rect(P.outline, x - 1, y - 1, ww + 2, hh + 2);
    rect(body, x, y, ww, hh);
    rect(lit, x, y, ww, 1);
  };
  for (const d of map.decor ?? []) {
    const { x, y } = d, r = rng(seedOf(x, y, 3));
    if (!WHERE[d.kind]?.includes(kindAt(x, y)) || fadeAt(x, y) > 0.4) continue; // nothing deep in the shadow
    if (d.kind === 'tree') {
      // A street tree in its own square of soil, its crown inside the tile.
      const px = Math.floor(x / T) * T, py = Math.floor(y / T) * T;
      rect(P.brown0, px + 4, py + 4, 8, 8);
      tree(px + T / 2, py + T / 2, 6.5, r);
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
    }
  }

  // Window and roof spots a soldier can man.
  for (const [x, y] of map.slots ?? []) {
    const px = x * T, py = y * T;
    rect(P.outline, px + 4, py + 4, 8, 8);
    rect(P.cream, px + 5, py + 5, 6, 6);
    rect(P.cloth0, px + 6, py + 6, 4, 4);
  }
  tex.refresh();
  return key;
}
