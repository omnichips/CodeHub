import { crc32, deflateSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { frames } from './src/art/sprites.ts';

const WIDTH = 1024;

/** A plain RGBA PNG. */
function png(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc((width * 4 + 1) * height); // each row starts with filter type 0
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8), body = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head.subarray(0, 4), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Draws every sprite frame once, when the game is built, into one PNG atlas: `import atlas from 'virtual:atlas'`.
 *  The dev server restarts (and redraws) whenever a file under src/art changes. */
const atlas = (): Plugin => ({
  name: 'atlas',
  resolveId: (id) => (id === 'virtual:atlas' ? '\0virtual:atlas' : undefined),
  load(id) {
    if (id !== '\0virtual:atlas') return;
    const list = frames(), count: Record<string, number> = {}, anims: Record<string, { fps: number; count: number }> = {};
    let x = 0, y = 0, row = 0;
    const placed = list.map((f) => {
      if (x + f.size > WIDTH) { x = 0; y += row; row = 0; }
      const n = (count[f.anim] = (count[f.anim] ?? 0) + 1) - 1, p = { name: `${f.anim}/${n}`, x, y, size: f.size };
      if (f.fps) anims[f.anim] = { fps: f.fps, count: n + 1 };
      x += f.size;
      row = Math.max(row, f.size);
      return p;
    });
    const height = y + row, rgba = new Uint8Array(WIDTH * height * 4);
    list.forEach((f, k) => {
      for (let r = 0; r < f.size; r++) rgba.set(f.rgba.subarray(r * f.size * 4, (r + 1) * f.size * 4), ((placed[k].y + r) * WIDTH + placed[k].x) * 4);
    });
    return `export default ${JSON.stringify({ image: `data:image/png;base64,${png(WIDTH, height, rgba).toString('base64')}`, frames: placed, anims })};`;
  },
});

export default defineConfig({ plugins: [atlas()] });
