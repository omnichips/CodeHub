// The menu's backdrop: a ruined stretch of city painted by the map painter like any map: an avenue across the middle,
// side streets, a burned park and a square, its blocks gutted, cars burned out where they stopped, shell holes in the
// road, fires still going. The menu sets the fires smoking and walks a few zombies along LANES.
import type { MapData } from '../sim/grid.ts';

const W = 88, H = 48, T = 16;
type Rect = [x: number, y: number, w: number, h: number];

/** mulberry32, so the city comes out the same every time. */
const rng = (seed: number) => () => {
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function build(): MapData {
  const r = rng(1945), g = Array.from({ length: H }, () => Array<string>(W).fill('#'));
  const fill = ([x, y, w, h]: Rect, tile: () => string) => { for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) g[ty][tx] = tile(); };
  // The blocks, each one kind of building.
  const blocks: [Rect, string][] = [
    [[0, 0, 14, 20], 'a'], [[20, 0, 46, 6], 'w'], [[72, 0, 16, 20], 'k'], [[20, 10, 24, 10], 'h'], [[46, 10, 20, 10], 'g'],
    [[0, 28, 14, 9], 'b'], [[20, 28, 20, 9], 'o'], [[59, 28, 7, 9], 'h'], [[72, 28, 16, 9], 'b'], [[0, 41, 14, 7], 'w'], [[20, 41, 46, 7], 'k'],
  ];
  for (const [rect, kind] of blocks) fill(rect, () => kind);
  // The streets, the park (burned: few trees left) and the square.
  for (const rect of [[0, 20, W, 8], [14, 0, 6, H], [66, 0, 6, H], [20, 6, 46, 4], [0, 37, W, 4], [44, 10, 2, 10]] as Rect[]) fill(rect, () => '.');
  fill([40, 28, 19, 9], () => (r() < 0.12 ? 't' : 'p'));
  fill([72, 41, 16, 7], () => ',');
  const rows = g.map((row) => row.join(''));

  // What is left in the streets. Positions in tiles, put in pixels below.
  const at = (kind: string, x: number, y: number) => ({ kind, x: Math.round(x * T), y: Math.round(y * T) });
  const decor = [
    // Burned-out cars, shell holes, soot; the fires still going on the roofs and in the street.
    ...[[7, 22.5], [30, 25], [51, 22.5], [80, 24.5], [16.5, 12], [17, 44], [68.5, 33], [36, 38.5]].map(([x, y]) => at('burnt', x, y)),
    ...[[25, 23.5], [61, 24.5], [16.5, 31], [55, 39], [68.5, 4]].map(([x, y]) => at('crater', x, y)),
    ...[[12, 24], [43, 22], [70, 25], [27, 8], [58, 7.5], [18, 18], [76, 38.5], [50, 31]].map(([x, y]) => at('scorch', x, y)),
    // (Roof ruins near the street fronts: deeper in, the painter leaves the roofs in shadow.)
    ...[[11.5, 17.5], [30, 14.5], [74, 17.5], [21.5, 30], [74, 30], [40, 42.5], [12, 42.5]].map(([x, y]) => at('collapse', x, y)),
    ...[[31, 12], [75, 12], [60, 42.5], [69, 15], [9, 24], [46, 31], [4, 29]].map(([x, y]) => at('blaze', x, y)),
    ...[[56, 14], [61, 17.5]].map(([x, y]) => at('wreck', x, y)), // on the parking deck
    // Streetlights along the avenue, a dry fountain and benches on the square.
    ...Array.from({ length: 12 }, (_, k) => at('lamp', 2.5 + k * 7, 20.5)), ...Array.from({ length: 12 }, (_, k) => at('lamp', 5.5 + k * 7, 27.5)),
    at('fountain', 80, 44.5), at('bench', 75, 42.5), at('bench', 85, 46.5),
  ];
  // Rubble, drums, litter: anywhere on the ground, by chance (the painter drops what lands where it does not belong).
  for (let k = 0; k < 70; k++) {
    const x = r() * W, y = r() * H, tile = rows[Math.floor(y)][Math.floor(x)];
    if ('.,p'.includes(tile)) decor.push(at(['rubble', 'rubble', 'rubble', 'barrel', 'trash', 'crate', 'cone', 'manhole', 'dumpster', 'hydrant'][k % 10], x, y));
  }
  return { name: 'Menu', tile: T, par: 0, rows, slots: [], props: [], decor };
}

export const MENU_CITY = build();
export const CITY_W = W * T, CITY_H = H * T;
/** Street lanes in the city's pixels, [x0, y0, x1, y1], that a zombie walks along, either way. */
export const LANES = [[-40, 344, CITY_W + 40, 352], [-40, 392, CITY_W + 40, 384], [-40, 368, CITY_W + 40, 372], [272, -40, 266, CITY_H + 40], [1104, -40, 1098, CITY_H + 40]];
