// Pixel art drawn by code. A sprite is a list of parts in its own frame (facing +x). For each facing the parts are
// drawn straight onto a pixel grid, then shaded with one fixed light from the top-left, so all eight facings are lit
// the same way and no finished sprite is ever rotated (which is what makes rotated pixel art look rough).

export type Vec = readonly [number, number];
/** A capsule from a to b (a circle when b is left out). z is its height; dome makes it rounder in the shading.
 *  A `square` part has flat ends: a box from a to b, r either side of the line (car bodies, bus roofs). */
export interface Part { mat: string; a: Vec; b?: Vec; r: number; z: number; dome?: number; square?: boolean }
/** Three palette colors, dark to light. A glowing material (muzzle flash) ignores the light and gets no outline. */
export interface Material { ramp: readonly [string, string, string]; glow?: boolean }
export interface Grid { size: number; mat: (string | undefined)[]; h: Float32Array }

const LIGHT = (() => { const l = Math.hypot(1, 1, 1.6); return [-1 / l, -1 / l, 1.6 / l]; })();
const SLOPE = 0.6; // how steep a height step looks to the light
const SHADOW_ALPHA = 90;
const EDGE = 1.5; // a part this much taller than its neighbour draws a dark line along its edge

function segmentDistance2(x: number, y: number, [ax, ay]: Vec, [bx, by]: Vec, square = false) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy, along = len ? ((x - ax) * dx + (y - ay) * dy) / len : 0;
  if (square && (along < 0 || along > 1)) return Infinity; // past a flat end
  const t = Math.max(0, Math.min(1, along));
  const ex = x - ax - t * dx, ey = y - ay - t * dy;
  return ex * ex + ey * ey;
}

/** Draws the parts onto a size×size grid, turned to face `angle` (radians, clockwise from +x since y points down). */
export function rasterize(parts: readonly Part[], size: number, angle: number): Grid {
  const mat: (string | undefined)[] = new Array(size * size);
  const h = new Float32Array(size * size);
  // Rounded so a quarter turn lands exactly on pixel centres (cos 90° is 6e-17, not 0).
  const c = Math.round(Math.cos(angle) * 1e9) / 1e9, s = Math.round(Math.sin(angle) * 1e9) / 1e9;
  // Each part's box in its own frame, so most parts are skipped for most pixels.
  const boxes = parts.map(({ a, b = a, r }) => [Math.min(a[0], b[0]) - r, Math.max(a[0], b[0]) + r, Math.min(a[1], b[1]) - r, Math.max(a[1], b[1]) + r]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = x + 0.5 - size / 2, sy = y + 0.5 - size / 2;
      const lx = sx * c + sy * s, ly = -sx * s + sy * c; // back into the sprite's own frame
      let best = 0, m: string | undefined;
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k], box = boxes[k];
        if (lx < box[0] || lx > box[1] || ly < box[2] || ly > box[3]) continue;
        const d2 = segmentDistance2(lx, ly, p.a, p.b ?? p.a, p.square);
        if (d2 >= p.r * p.r) continue;
        const top = p.z + (p.dome ?? 0) * Math.sqrt(1 - d2 / (p.r * p.r));
        if (top > best) { best = top; m = p.mat; }
      }
      mat[y * size + x] = m;
      h[y * size + x] = best;
    }
  return { size, mat, h };
}

const rgbCache = new Map<string, number[]>();
const rgb = (hex: string) => rgbCache.get(hex) ?? rgbCache.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))).get(hex)!;

/** Colors a grid: lit by height, a dark outline around it, and (optionally) a soft shadow on the ground. */
export function shade(g: Grid, materials: Record<string, Material>, palette: Record<string, string>, shadow = false) {
  const { size, mat, h } = g;
  const out = new Uint8ClampedArray(size * size * 4);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;
  const height = (x: number, y: number) => (inside(x, y) ? h[y * size + x] : 0);
  const solid = (x: number, y: number) => { const m = inside(x, y) && mat[y * size + x]; return !!m && !materials[m].glow; };
  const put = (i: number, hex: string, alpha = 255) => {
    const [r, g, b] = rgb(hex);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = alpha;
  };

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x, m = mat[i];
      if (m) {
        const { ramp, glow } = materials[m];
        if (glow) { put(i, palette[ramp[2]]); continue; }
        // Slopes only fall away from a pixel: a taller neighbour casts a shadow instead of tilting this one.
        const own = h[i], low = (hn: number) => Math.min(hn, own);
        const gx = (low(height(x + 1, y)) - low(height(x - 1, y))) / 2, gy = (low(height(x, y + 1)) - low(height(x, y - 1))) / 2;
        const nx = -gx * SLOPE, ny = -gy * SLOPE, len = Math.sqrt(nx * nx + ny * ny + 1);
        const lum = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / len;
        // In the shadow of what is up-left of it, or right under the edge of a part lying on top of it.
        const over = Math.max(height(x - 1, y), height(x + 1, y), height(x, y - 1), height(x, y + 1));
        const shadowed = height(x - 1, y - 1) > own + 1 || over > own + EDGE;
        put(i, palette[ramp[shadowed || lum < 0.6 ? 0 : lum < 0.88 ? 1 : 2]]);
      } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) put(i, palette.outline);
      else if (shadow && (solid(x - 2, y - 2) || solid(x - 1, y - 2) || solid(x - 2, y - 1))) put(i, palette.outline, SHADOW_ALPHA);
    }
  return out;
}
