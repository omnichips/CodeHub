// The flamethrower's flame, pixel art after Doom's fire: a grid of heat where each cell takes the heat of the one
// behind it, a little cooler and blown a little to one side, so the flame licks and flickers by itself. The grid is
// the flame's own frame (rows out from the nozzle, columns across the cone), laid onto the world as square pixels on a
// fixed grid, so it stays crisp whichever way he points it.
import type Phaser from 'phaser';

const ROWS = 48, COLS = 24, HOT = 36, TICK = 1 / 50; // the grid, the hottest heat, seconds a step
const DOOM = '070707 1f0707 2f0f07 470f07 571707 671f07 771f07 8f2707 9f2f07 af3f07 bf4707 c74707 df4f07 df5707 df5707 d75f07 d75f07 d7670f cf6f0f cf770f cf7f0f cf8717 c78717 c78f17 c7971f bf9f1f bf9f1f bfa727 bfa727 bfaf2f b7af2f b7b72f b7b737 cfcf6f dfdf9f efefc7 ffffff';
const PALETTE = DOOM.split(' ').map((c) => parseInt(c, 16)); // black through red, orange and yellow to white

/** One flame to draw: `key` is whose it is (his grid is kept between frames); `lit` while he keeps firing. */
export interface Flame { key: object; x: number; y: number; angle: number; spread: number; range: number; lit: boolean }

export class Flames {
  private grids = new Map<object, Uint8Array>();
  private acc = 0;

  /** Steps every flame `dt` seconds on and draws it. One not lit dies down, and is let go once it is out. */
  draw(g: Phaser.GameObjects.Graphics, dt: number, flames: Flame[]) {
    this.acc = Math.min(this.acc + dt, 0.25);
    const ticks = Math.floor(this.acc / TICK), live = new Set<object>();
    this.acc -= ticks * TICK;
    for (const f of flames) {
      let heat = this.grids.get(f.key);
      if (!heat && !f.lit) continue;
      if (!heat) this.grids.set(f.key, (heat = new Uint8Array(ROWS * COLS)));
      for (let k = 0; k < ticks; k++) step(heat, f.lit);
      if (!f.lit && heat.every((v) => v === 0)) continue;
      live.add(f.key);
      paint(g, heat, f);
    }
    for (const key of this.grids.keys()) if (!live.has(key)) this.grids.delete(key);
  }
}

/** The nozzle row is fed (or starved), then every row takes the row behind it as it was. */
function step(heat: Uint8Array, lit: boolean) {
  for (let r = ROWS - 1; r > 0; r--)
    for (let c = 0; c < COLS; c++) {
      const from = Math.min(COLS - 1, Math.max(0, c + ((Math.random() * 3) | 0) - 1)), edge = c === 0 || c === COLS - 1 ? 2 : 0;
      heat[r * COLS + c] = Math.max(0, heat[(r - 1) * COLS + from] - ((Math.random() * 2.6) | 0) - edge);
    }
  for (let c = 0; c < COLS; c++) heat[c] = lit ? HOT - (Math.random() < 0.25 ? (Math.random() * 8) | 0 : 0) : Math.max(0, heat[c] - 8);
}

/** Each cell where it lands in the cone: tight at the nozzle, opening out to the cone's width a third of the way. A
 *  cell is one world pixel, or as many as its share of the cone's width out where the cone is wide (so no gaps). */
function paint(g: Phaser.GameObjects.Graphics, heat: Uint8Array, f: Flame) {
  for (let r = 0; r < ROWS; r++) {
    const d = 4 + ((r + 0.5) / ROWS) * (f.range - 4), open = Math.min(1, 0.25 + r / (ROWS / 3));
    const px = Math.max(1, Math.round((2 * f.spread * open * d) / COLS), Math.round((f.range - 4) / ROWS));
    for (let c = 0; c < COLS; c++) {
      const v = heat[r * COLS + c];
      if (v < 6) continue; // cold: smoke-black, left out
      const a = f.angle + (((c + 0.5) / COLS) * 2 - 1) * f.spread * open;
      g.fillStyle(PALETTE[v], v < 12 ? 0.55 : 0.95).fillRect(Math.floor(f.x + Math.cos(a) * d), Math.floor(f.y + Math.sin(a) * d), px, px);
    }
  }
}
