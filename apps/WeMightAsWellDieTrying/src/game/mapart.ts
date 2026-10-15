// Paints a map once into one texture: a run-down city seen from above. Gravel roofs with pale stone rims, AC units,
// pipes and moss; brick fronts with windows on the street side; paved sidewalks with curbs; cracked asphalt with lane
// lines, crosswalks, manholes and litter. Seeded, so a map looks the same every time.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { BUILDING, type Grid, type MapData } from '../sim/grid.ts';

const P = palette;
const ROOF: Record<string, [string, string, string]> = {
  // gravel: base, dark speck, light speck
  o: ['#3b3d3f', '#2c2e30', '#4c4e50'], // offices
  b: ['#3d3634', '#2d2827', '#4d4441'], // brownstones
  h: ['#3e3b36', '#2e2c28', '#4f4b44'], // shops
  g: ['#4a4843', '#3a3935', '#5a5852'], // the garage: bare concrete
  '#': ['#3b3d3f', '#2c2e30', '#4c4e50'],
};

function rng(seed: number) {
  return () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Makes the map texture `key` (once) and returns it. `blood` is off when gore is set to none. */
export function paintMap(scene: Phaser.Scene, map: MapData, grid: Grid, key: string, blood: boolean) {
  if (scene.textures.exists(key)) return key;
  const { w, h, tile: T, wall, goal } = grid, W = w * T, H = h * T;
  const tex = scene.textures.createCanvas(key, W, H)!, c = tex.context, r = rng(1234);
  const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : map.rows[y][x]);
  const built = (x: number, y: number) => BUILDING.includes(ch(x, y));
  const rect = (col: string, x: number, y: number, ww: number, hh: number) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  const dot = (col: string, x: number, y: number, s = 1) => rect(col, Math.round(x), Math.round(y), s, s);

  // Which open tiles are sidewalk (next to a building, diagonals too) and which are roadway.
  const side = new Uint8Array(w * h), road = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ch(x, y);
      if (t === ',') side[y * w + x] = 1; // the plaza is paved like a sidewalk
      if (t !== '.' && t !== 'S') continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (built(x + dx, y + dy)) near = true;
      if (near) side[y * w + x] = 1;
      else road[y * w + x] = 1;
    }
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && road[y * w + x] === 1;
  const runX = (x: number, y: number) => { let a = x, b = x; while (isRoad(a - 1, y)) a--; while (isRoad(b + 1, y)) b++; return [a, b]; };
  const runY = (x: number, y: number) => { let a = y, b = y; while (isRoad(x, a - 1)) a--; while (isRoad(x, b + 1)) b++; return [a, b]; };

  // ---- Asphalt ----
  rect(P.asphalt1, 0, 0, W, H);
  for (let k = 0; k < 220; k++) { c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; c.beginPath(); c.ellipse(r() * W, r() * H, 8 + r() * 30, 6 + r() * 20, r() * 3, 0, 7); c.fill(); }
  for (let k = 0; k < w * h * 7; k++) dot(k % 3 ? P.asphalt0 : P.asphalt2, r() * W, r() * H);

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isRoad(x, y)) continue;
      const px = x * T, py = y * T, [ax, bx] = runX(x, y), [ay, by] = runY(x, y), wideX = bx - ax >= 7, wideY = by - ay >= 5;
      // Lane lines down the middle of a road, broken at the crossings.
      if (!wideX && bx - ax >= 1 && y % 3 !== 2 && x === Math.floor((ax + bx) / 2)) rect(P.paint, px + T - 1, py + 2, 2, T - 4);
      if (!wideY && by - ay >= 1 && x % 3 !== 2 && y === Math.floor((ay + by) / 2)) rect(P.paint, px + 2, py + T - 1, T - 4, 2);
      // Crosswalks where a road meets a crossing.
      const crossing = (xx: number, yy: number) => { if (!isRoad(xx, yy)) return false; const [a1, b1] = runX(xx, yy), [a2, b2] = runY(xx, yy); return b1 - a1 >= 7 && b2 - a2 >= 3; };
      if (!(wideX && wideY) && !crossing(x, y)) {
        if (!wideX && (crossing(x, y - 1) || crossing(x, y + 1))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 1, py + 2 + k * 5, T - 2, 2);
        else if (!wideY && (crossing(x - 1, y) || crossing(x + 1, y))) for (let k = 0; k < 3; k++) rect(P.pave1, px + 2 + k * 5, py + 1, 2, T - 2);
      }
    }
  // Cracks and potholes.
  for (let k = 0; k < (w * h) / 9; k++) {
    let x = r() * W, y = r() * H;
    const i = grid.at(x, y);
    if (i < 0 || !road[i]) continue;
    c.strokeStyle = 'rgba(15,16,17,0.75)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    for (let s = 0, a = r() * 6.3; s < 4 + r() * 8; s++) { a += (r() - 0.5) * 1.6; x += Math.cos(a) * 3; y += Math.sin(a) * 3; c.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5); }
    c.stroke();
    if (r() < 0.12) { c.fillStyle = P.outline; c.beginPath(); c.ellipse(x, y, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7); c.fill(); }
  }

  // ---- Sidewalks: paving slabs, a curb toward the road, weeds ----
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!side[y * w + x]) continue;
      const px = x * T, py = y * T;
      rect(P.pave0, px, py, T, T);
      if (ch(x, y) === ',') rect(P.pave1, px + 1, py + 1, T - 2, T - 2); // the plaza: one big stone a tile
      else { rect(P.pave1, px + 1, py + 1, 7, 7); rect(P.pave1, px + 9, py + 1, 6, 7); rect(P.pave1, px + 1, py + 9, 7, 6); rect(P.pave1, px + 9, py + 9, 6, 6); }
      for (let k = 0; k < 6; k++) dot(r() < 0.5 ? P.pave0 : P.khaki1, px + r() * T, py + r() * T);
      if (r() < 0.25) for (let k = 0; k < 2 + r() * 4; k++) dot(r() < 0.5 ? P.olive1 : P.olive2, px + r() * T, py + r() * T, r() < 0.3 ? 2 : 1);
      if (isRoad(x - 1, y)) { rect(P.asphalt0, px, py, 1, T); rect(P.cream, px + 1, py, 1, T); }
      if (isRoad(x + 1, y)) { rect(P.cream, px + T - 2, py, 1, T); rect(P.asphalt0, px + T - 1, py, 1, T); }
      if (isRoad(x, y - 1)) { rect(P.asphalt0, px, py, T, 1); rect(P.cream, px, py + 1, T, 1); }
      if (isRoad(x, y + 1)) { rect(P.cream, px, py + T - 2, T, 1); rect(P.asphalt0, px, py + T - 1, T, 1); }
    }

  // ---- Park, plaza and the evacuation point ----
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ch(x, y), px = x * T, py = y * T;
      if (t === 'p') {
        rect(P.rot0, px, py, T, T);
        for (let k = 0; k < 14; k++) dot(r() < 0.5 ? P.olive1 : P.rot1, px + r() * T, py + r() * T, r() < 0.2 ? 2 : 1);
        if ((x + y) % 9 === 0 || (x - y + 60) % 11 === 0) rect(P.pave0, px + 5, py, 6, T); // paths
      } else if (goal[y * w + x]) {
        rect(P.pave0, px, py, T, T);
        rect('#545049', px + 1, py + 1, T - 2, T - 2);
        if ((x + y) % 2) dot(P.pave1, px + 4 + r() * 8, py + 4 + r() * 8);
        if (!goal[(y - 1) * w + x]) for (let k = 0; k < 4; k++) rect(k % 2 ? P.outline : P.flash0, px + k * 4, py, 4, 3); // hazard edge
      }
    }

  // ---- Buildings ----
  const region = new Int32Array(w * h).fill(-1);
  let regions = 0;
  for (let i = 0; i < w * h; i++) {
    if (!wall[i] || region[i] >= 0) continue;
    for (const stack = [i]; stack.length; ) {
      const j = stack.pop()!, x = j % w, y = (j - x) / w;
      if (region[j] >= 0 || !wall[j]) continue;
      region[j] = regions;
      if (x > 0) stack.push(j - 1);
      if (x < w - 1) stack.push(j + 1);
      if (y > 0) stack.push(j - w);
      if (y < h - 1) stack.push(j + w);
    }
    regions++;
  }
  // Brownstones and shops come in lots a few tiles wide, each its own roof.
  const lot = (x: number, y: number) => { const t = ch(x, y); return t === 'b' || t === 'h' ? Math.floor(x / 4) * 1000 + region[y * w + x] : region[y * w + x]; };
  const same = (x: number, y: number, x2: number, y2: number) => built(x2, y2) && (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h || lot(x, y) === lot(x2, y2));

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!wall[y * w + x]) continue;
      const t = ch(x, y), [base, dark, light] = ROOF[t] ?? ROOF['#'], px = x * T, py = y * T;
      const tint = (lot(x, y) * 37) % 5; // lots differ a little
      rect(base, px, py, T, T);
      if (tint === 1) rect('rgba(90,60,50,0.12)', px, py, T, T);
      if (tint === 3) rect('rgba(0,0,0,0.1)', px, py, T, T);
      for (let k = 0; k < 20; k++) dot(r() < 0.55 ? dark : light, px + r() * T, py + r() * T);
      if (t === 'g') for (let k = 0; k < 2; k++) if ((x + k) % 3 === 0) rect(P.pave1, px + 2, py + k * 8 + 3, 1, 5); // parking bays
      // Pale stone rims where the roof ends: lit on the top and left, in shade on the bottom and right.
      const edgeN = !same(x, y, x, y - 1), edgeS = !same(x, y, x, y + 1), edgeW = !same(x, y, x - 1, y), edgeE = !same(x, y, x + 1, y);
      if (edgeN) { rect(P.cream, px, py, T, 2); rect(P.outline, px, py + 2, T, 1); }
      if (edgeW) { rect(P.cream, px, py, 2, T); rect(P.outline, px + 2, py, 1, T); }
      if (edgeS) rect(P.pave0, px, py + T - 2, T, 2);
      if (edgeE) rect(P.pave0, px + T - 2, py, 2, T);
      // The street front: brick with windows, a door now and then; awnings over shops.
      if (!built(x, y + 1) && ch(x, y + 1) !== '#') {
        rect(P.blood0, px, py + T - 6, T, 6);
        for (let k = 0; k < 4; k++) rect(P.blood1, px + k * 4 + (y % 2) * 2, py + T - 5, 3, 1);
        rect(P.outline, px + 3, py + T - 4, 3, 3);
        rect(P.outline, px + 10, py + T - 4, 3, 3);
        rect(P.cloth1, px + 3, py + T - 4, 1, 1);
        if (r() < 0.15) rect(P.metal1, px + 6, py + T - 5, 5, 5); // a door or shutter
        if (t === 'h') for (let k = 0; k < 4; k++) rect(k % 2 ? P.cream : [P.blood1, P.olive2, P.cloth1][lot(x, y) % 3], px + k * 4, py + T - 8, 4, 2);
        rect(P.outline, px, py + T - 1, T, 1);
      }
      // Clutter on the roof, away from the rims.
      if (!edgeN && !edgeS && !edgeW && !edgeE) {
        const roll = r();
        if (roll < 0.07) { rect(P.outline, px + 2, py + 3, 12, 10); rect(P.metal2, px + 2, py + 3, 11, 9); c.strokeStyle = P.metal0; c.beginPath(); c.arc(px + 5.5, py + 7.5, 2.5, 0, 7); c.arc(px + 10, py + 7.5, 2.5, 0, 7); c.stroke(); }
        else if (roll < 0.11) { rect(P.outline, px + 4, py + 4, 8, 7); rect(P.metal1, px + 4, py + 4, 7, 6); rect(P.metal2, px + 5, py + 5, 5, 1); }
        else if (roll < 0.14) { rect(P.metal2, px + 2, py + 7, 12, 2); rect(P.metal2, px + 12, py + 2, 2, 7); rect(P.outline, px + 2, py + 9, 12, 1); }
        else if (roll < 0.17) { rect(P.outline, px + 3, py + 3, 10, 10); rect(P.cloth0, px + 4, py + 4, 8, 8); rect(P.cloth1, px + 4, py + 4, 8, 2); }
        else if (roll < 0.3) for (let k = 0; k < 3 + r() * 6; k++) dot(r() < 0.6 ? P.olive1 : P.olive2, px + r() * T, py + r() * T, r() < 0.3 ? 2 : 1);
        else if (roll < 0.36) for (let k = 0; k < 4; k++) dot([P.khaki1, P.metal2, P.rust, P.cloth2][k], px + r() * T, py + r() * T, 2);
      }
    }

  // Buildings throw shade down and to the right, like the sprites.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (wall[y * w + x]) continue;
      const px = x * T, py = y * T;
      if (built(x - 1, y)) rect('rgba(0,0,0,0.3)', px, py, 5, T);
      if (built(x, y - 1)) rect('rgba(0,0,0,0.3)', px, py, T, 4);
    }

  // ---- Litter and old blood ----
  for (let k = 0; k < w * h * 0.6; k++) {
    const x = r() * W, y = r() * H, i = grid.at(x, y);
    if (i < 0 || wall[i]) continue;
    dot([P.khaki1, P.cloth2, P.paint, P.rust, P.metal2][(r() * 5) | 0], x, y, r() < 0.25 ? 2 : 1);
  }
  if (blood)
    for (let k = 0; k < 70; k++) {
      const x = r() * W, y = r() * H, i = grid.at(x, y);
      if (i < 0 || wall[i] || goal[i]) continue;
      c.fillStyle = r() < 0.5 ? P.blood0 : P.blood1;
      for (let s = 0; s < 4 + r() * 6; s++) { c.beginPath(); c.arc(x + (r() - 0.5) * 10, y + (r() - 0.5) * 8, 0.8 + r() * 2.2, 0, 7); c.fill(); }
    }

  // ---- Decor from the map: trees, lamps, manholes, rubble, burned wrecks, sandbags, the helipad ----
  // Decor is only drawn: nothing collides with it, so a wreck belongs off the street (the garage roof), not on it.
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
  for (const d of map.decor ?? []) {
    const { x, y } = d;
    if (d.kind === 'tree') {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x + 3, y + 3, 9, 0, 7); c.fill();
      for (const [dx, dy, rr, col] of [[0, 0, 9, P.olive0], [-2, -2, 7, P.olive1], [-3, -3, 4, P.olive2], [3, 2, 4, P.rot0]] as const) { c.fillStyle = col; c.beginPath(); c.arc(x + dx, y + dy, rr, 0, 7); c.fill(); }
      for (let k = 0; k < 8; k++) dot(P.rot2, x - 6 + r() * 10, y - 6 + r() * 10);
    } else if (d.kind === 'lamp') {
      rect('rgba(0,0,0,0.35)', x + 1, y - 1, 8, 2);
      rect(P.outline, x - 1, y - 1, 3, 3);
      rect(P.metal1, x, y - 7, 1, 7); rect(P.metal1, x, y - 7, 6, 1);
      rect(P.flash1, x + 5, y - 7, 2, 2);
    } else if (d.kind === 'manhole') {
      c.fillStyle = P.metal0; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
      c.strokeStyle = P.metal1; c.beginPath(); c.arc(x, y, 3, 0, 7); c.stroke();
    } else if (d.kind === 'rubble') {
      for (let k = 0; k < 9; k++) { const s = 1 + ((r() * 3) | 0); rect(P.outline, x - 6 + r() * 12, y - 4 + r() * 8 + 1, s, s); rect([P.pave1, P.khaki0, P.metal2, P.rust][k % 4], x - 6 + r() * 12, y - 4 + r() * 8, s, s); }
    } else if (d.kind === 'wreck') {
      c.fillStyle = 'rgba(10,10,10,0.5)'; c.beginPath(); c.ellipse(x, y, 22, 12, 0.3, 0, 7); c.fill(); // scorch
      stamp('car/0', x, y, r() * 0.8 - 0.4 + (r() < 0.5 ? 0 : Math.PI / 2), 0.62);
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
