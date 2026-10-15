// The install icons (public/icon-192.png, icon-512.png, apple-touch-icon.png), drawn from the game's own sprites:
// a Rifleman aiming at a zombie, on asphalt. Run `npm run icons` after changing either sprite.
import { writeFileSync } from 'node:fs';
import palette from '../src/data/palette.json' with { type: 'json' };
import { png } from '../src/art/png.ts';
import { frames } from '../src/art/sprites.ts';

const GRID = 40; // the icon in art pixels, before it is scaled up
const BG = [1, 3, 5].map((i) => parseInt(palette.asphalt1.slice(i, i + 2), 16)); // the greens read on asphalt
const all = frames(), frame = (anim: string) => all.find((f) => f.anim === anim)!;
/** [sprite, left, top in art pixels, turned by (radians, clockwise)]. Sprites face east. */
const layers = [[frame('normal-walk'), 13, -4, (3 * Math.PI) / 4], [frame('rifleman-shoot-7'), -5, 13, 0]] as const;

const art = new Uint8Array(GRID * GRID * 3);
for (let k = 0; k < GRID * GRID; k++) art.set(BG, k * 3);
for (const [f, left, top, turn] of layers)
  for (let y = 0; y < f.size; y++)
    for (let x = 0; x < f.size; x++) {
      // Each pixel takes its colour from the sprite pixel that the turn brings here (nearest, so it stays crisp).
      const c = (f.size - 1) / 2, sx = Math.round(c + (x - c) * Math.cos(turn) + (y - c) * Math.sin(turn)), sy = Math.round(c - (x - c) * Math.sin(turn) + (y - c) * Math.cos(turn));
      const gx = left + x, gy = top + y, s = (sy * f.size + sx) * 4, a = f.rgba[s + 3] / 255;
      if (!a || sx < 0 || sy < 0 || sx >= f.size || sy >= f.size || gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
      for (let c = 0; c < 3; c++) art[(gy * GRID + gx) * 3 + c] = Math.round(f.rgba[s + c] * a + art[(gy * GRID + gx) * 3 + c] * (1 - a));
    }

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = (((y * GRID) / size) | 0) * GRID + (((x * GRID) / size) | 0);
      rgba.set([art[k * 3], art[k * 3 + 1], art[k * 3 + 2], 255], (y * size + x) * 4);
    }
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, size, rgba));
}
