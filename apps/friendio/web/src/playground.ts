import { ARENA_HEIGHT, ARENA_WIDTH } from '../../shared/protocol';
import { PLAYGROUND, type Prop } from '../../shared/obstacles';

// The Tag arena, painted in code at 1 art pixel = 4 world pixels. Props come from shared/obstacles.ts,
// so moving a prop there moves both its picture and its wall.
export const ART_SCALE = 4;
export const ART_W = ARENA_WIDTH / ART_SCALE;
export const ART_H = ARENA_HEIGHT / ART_SCALE;
const W = ART_W;
const H = ART_H;
// the layout was drawn for a 240x135 art map; these stretch it to the current size
const SX = W / 240, SY = H / 135;
export const GATE_X = Math.round(W / 2);

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// dirt is a few overlapping ellipses: [centerX, centerY, radiusX, radiusY] in art pixels
const DIRT = [[118, 64, 86, 44], [150, 18, 26, 14], [62, 92, 26, 18], [176, 100, 30, 16]].map(([cx, cy, rx, ry]) => [cx * SX, cy * SY, rx * SX, ry * SY]);
export const inDirt = (x: number, y: number, edge = 0) => DIRT.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 - edge);

const disc = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) => {
  g.fillStyle = color;
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.fillRect(x, y, 1, 1);
  }
};

// a dark outline, then leafy clumps lit from the top left
function drawTree(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, random: () => number) {
  disc(g, cx, cy, w / 2, '#163812');
  disc(g, cx, cy, w / 2 - 1, '#24521e');
  for (let clump = 0; clump < 6; clump += 1) {
    const angle = clump * 1.05 + random(), reach = w * 0.2, r = w * 0.24;
    const bx = cx + Math.cos(angle) * reach, by = cy + Math.sin(angle) * reach;
    disc(g, bx, by, r, '#2c6424'); disc(g, bx - 0.7, by - 0.7, r * 0.75, '#3a7e2e'); disc(g, bx - 1.2, by - 1.2, r * 0.35, '#5aa844');
  }
  disc(g, cx - 1, cy - 1, w * 0.18, '#3a7e2e'); disc(g, cx - 1.5, cy - 1.5, w * 0.08, '#6ab850');
}

// a canopy on its own, for the live layer that sways it over the players
export function paintTree(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  drawTree(canvas.getContext('2d')!, size / 2, size / 2, size, seeded(size));
  return canvas;
}

// live: leave out the parts the arena animates (tree canopies, swing seats, the merry-go-round's bars)
export function paintPlayground(canvas: HTMLCanvasElement, live = false) {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const random = seeded(7);
  const pick = (colors: string[]) => colors[Math.floor(random() * colors.length)];
  const px = (x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const circle = (cx: number, cy: number, r: number, color: string) => disc(g, cx, cy, r, color);

  // soft light/dark patches so the grass is not flat noise
  const grass = (x: number, y: number) => {
    const patch = Math.sin(x * 0.21) + Math.sin(y * 0.17 + x * 0.05) + Math.sin((x + y) * 0.09) + random() * 1.2;
    return patch > 1.6 ? pick(['#4f9238', '#4a8a34']) : patch < -0.9 ? pick(['#2f6224', '#356a28']) : pick(['#3f7a2e', '#447f31', '#3a7029']);
  };

  // ground: grass with a dithered dirt yard
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    px(x, y, 1, 1, inDirt(x, y, random() * 0.18) ? pick(['#8a5a36', '#7d5030', '#946140', '#80532f', '#6e4428'])
      : random() < 0.005 ? pick(['#f2e6a0', '#f0a0b8', '#ffffff']) : grass(x, y));
  }
  // paved path from the gate
  for (let y = H - 23; y < H; y += 1) for (let x = GATE_X - 6; x < GATE_X + 6; x += 1) px(x, y, 1, 1, (x % 4 === 0 || y % 3 === 0) ? '#6e6e6a' : pick(['#9a9a92', '#8e8e86', '#a4a49a']));

  const box = (prop: Prop) => ({ x: prop.x / ART_SCALE, y: prop.y / ART_SCALE, w: prop.w / ART_SCALE, h: prop.h / ART_SCALE });
  const props = [...PLAYGROUND].sort((a, b) => (a.solid === false ? -1 : 0) - (b.solid === false ? -1 : 0) || a.y + a.h - (b.y + b.h));

  // shadows first so nothing casts onto a prop drawn earlier
  for (const prop of props) {
    if (prop.solid === false || prop.kind === 'pole') continue;
    const { x, y, w, h } = box(prop);
    if (prop.round) circle(x + w / 2 + 1.5, y + h / 2 + 1.5, w / 2, 'rgba(10, 20, 8, .35)');
    else px(x + 2, y + 2, w, h, 'rgba(10, 20, 8, .35)');
  }

  for (const prop of props) {
    const { x, y, w, h } = box(prop);
    const cx = x + w / 2, cy = y + h / 2;
    switch (prop.kind) {
      case 'tree':
        if (!live) drawTree(g, cx, cy, w, seeded(w));
        break;
      case 'bench':
        px(x, y, w, h, '#4a2e1a');
        for (let row = 0; row < h; row += 2) px(x, y + row, w, 1, '#7a5232');
        px(x + 1, y + h - 1, 1, 1, '#2a1a10'); px(x + w - 2, y + h - 1, 1, 1, '#2a1a10');
        break;
      case 'bin':
        px(x, y, w, h, '#3a3e44'); px(x + 1, y + 1, w - 2, h - 2, '#5a5e64'); px(x + 1, y + 1, w - 2, 1, '#7a7e84');
        break;
      case 'shelter':
        px(x, y, w, h, '#244680');
        for (let col = 0; col < w; col += 2) px(x + col, y, 1, h - 1, '#3462a8');
        px(x, y + h - 1, w, 1, '#16294c'); px(x, y, w, 1, '#4a7ac0');
        break;
      case 'tower':
        px(x, y, w, h, '#5a3a20');
        for (let row = 1; row < h; row += 2) px(x, y + row, w, 1, '#6e4a2a');
        px(x, y, w, 1, '#d8b43a'); px(x, y + h - 1, w, 1, '#d8b43a'); px(x, y, 1, h, '#d8b43a'); px(x + w - 1, y, 1, h, '#d8b43a');
        for (let post = 0; post < w; post += 5) { px(x + post, y, 1, 2, '#f0d060'); px(x + post, y + h - 2, 1, 2, '#f0d060'); }
        // red pyramid roof, lit from the top left
        { const rx = x + w * 0.3, ry = y + 2, rs = h * 0.55;
          px(rx, ry, rs, rs, '#a82824');
          for (let i = 0; i < rs / 2; i += 1) { px(rx + i, ry + i, rs - i * 2, 1, '#d8403a'); px(rx + i, ry + i, 1, rs / 2 - i, '#c8342e'); }
          px(rx + rs / 2 - 0.5, ry + rs / 2 - 0.5, 1, 1, '#f0d060'); }
        // blue climbing wall with holds
        px(x + w - 9, y + h - 9, 7, 7, '#2a54a0');
        for (let hold = 0; hold < 6; hold += 1) px(x + w - 8 + random() * 5, y + h - 8 + random() * 5, 1, 1, pick(['#f0d060', '#e85d75', '#7de2a8']));
        px(x + 2, y + h - 7, 5, 5, '#3a2414');
        break;
      case 'slide':
        for (let step = 0; step < h; step += 1) {
          const sx = x + w - 5 - (step / h) * (w - 5);
          px(sx, y + step, 5, 1, '#c8302c'); px(sx + 1, y + step, 3, 1, '#e04a40'); px(sx + 2, y + step, 1, 1, '#f07a6a');
        }
        break;
      case 'net':
        for (let row = 0; row <= h; row += 2) px(x, y + row, w, 1, '#a07a46');
        for (let col = 0; col <= w; col += 2) px(x + col, y, 1, h, '#a07a46');
        px(x, y, 1, h, '#2a4a8a'); px(x + w - 1, y, 1, h, '#2a4a8a'); px(x, y, w, 1, '#2a4a8a');
        break;
      case 'swings':
        circle(cx, cy + 2, h / 2, '#6e4428');
        px(x, y + 2, w, 1, '#2a4a8a'); px(x, y + 1, w, 1, '#3a64b0');
        px(x, y, 2, h, '#c8302c'); px(x + w - 2, y, 2, h, '#c8302c'); px(x + w / 2 - 1, y, 2, h - 4, '#c8302c');
        if (!live) for (const seat of [0.2, 0.36, 0.64, 0.8]) {
          px(x + w * seat, y + 3, 1, h / 2, '#a0a0a8'); px(x + w * seat + 2, y + 3, 1, h / 2, '#a0a0a8');
          px(x + w * seat - 0.5, y + 3 + h / 2, 4, 2, '#2a1a10');
        }
        break;
      case 'merry':
        circle(cx, cy, w / 2 + 1, '#6e4428');
        circle(cx, cy, w / 2 - 1, '#2a3450');
        circle(cx - 0.5, cy - 0.5, w / 2 - 2, '#3a4a6e');
        if (!live) {
          for (let i = -w / 2 + 3; i < w / 2 - 3; i += 1) { px(cx + i, cy, 1, 1, '#e0b83a'); px(cx, cy + i, 1, 1, '#e0b83a'); }
          circle(cx, cy, 1.5, '#c8302c');
        }
        break;
      case 'climber':
        px(x, y, w, h, '#6e4428');
        for (let col = 0; col < w; col += 3) px(x + col, y, 1, h, '#d8b43a');
        for (let row = 0; row < h; row += 4) px(x, y + row, w, 1, '#2a4a8a');
        break;
      case 'pole':
        px(x, y, w, h, '#2a4a8a'); px(x, y, 1, h, '#4a74c0');
        break;
      case 'crates':
        for (const [ox, oy] of [[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]]) {
          const s = w / 2;
          px(x + ox, y + oy, s, h / 2, '#5a3a1e'); px(x + ox + 1, y + oy + 1, s - 2, h / 2 - 2, '#8a6038');
          for (let i = 1; i < s - 1; i += 1) { px(x + ox + i, y + oy + 1 + i * (h / 2 - 2) / s, 1, 1, '#5a3a1e'); px(x + ox + s - 1 - i, y + oy + 1 + i * (h / 2 - 2) / s, 1, 1, '#5a3a1e'); }
        }
        break;
      case 'ruin':
        px(x, y, w, h, '#4a4e54');
        for (let row = 0; row < h; row += 2) for (let col = (row / 2) % 2 ? 0 : 2; col < w; col += 4) px(x + col, y + row, 3, 1, pick(['#6a6e74', '#7a7e84', '#5e6268']));
        px(x, y + h - 2, w, 2, '#2e3236');
        for (let col = 0; col < w; col += 1) if (random() < 0.35) px(x + col, y, 1, 1 + Math.floor(random() * 2), '#7d5030');
        break;
      case 'woodwall':
        px(x, y, w, h, '#5a3a1e');
        for (let row = 0; row < h; row += 2) px(x + 1, y + row, w - 2, 1, '#8a6038');
        px(x, y + h - 1, w, 1, '#3a2414');
        px(x, y, 2, h, '#6a6e74'); px(x + w - 2, y, 2, h, '#6a6e74');
        break;
      case 'aframe':
        px(x, y, w, h, '#5a3a1e');
        for (let row = 1; row < h; row += 3) px(x + 1, y + row, w - 2, 1, '#9a7040');
        px(cx - 0.5, y, 1, h, '#3a2414'); px(x, y + h - 1, w, 1, '#3a2414');
        break;
      case 'shed':
        px(x, y, w, h * 0.65, '#8a9096');
        for (let col = 0; col < w; col += 2) px(x + col, y, 1, h * 0.65, '#a8aeb4');
        px(x, y + h * 0.65, w, h * 0.35, '#6a4426');
        for (let col = 0; col < w; col += 3) px(x + col, y + h * 0.65, 1, h * 0.35, '#5a3a1e');
        px(cx - 2, y + h * 0.65 + 2, 4, 1, '#d8c8a0'); px(cx - 2, y + h * 0.65 + 1, 1, 1, '#d8c8a0'); px(cx, y + h * 0.65 + 1, 1, 1, '#d8c8a0'); px(cx + 1, y + h * 0.65 + 1, 1, 1, '#d8c8a0');
        break;
      case 'log':
        px(x, y, w, h, '#6a4426'); px(x, y, w, 1, '#9a7040'); px(x, y + h - 1, w, 1, '#4a2e1a');
        circle(x + 1.5, cy, h / 2, '#b08a5a'); circle(x + w - 1.5, cy, h / 2, '#b08a5a');
        break;
      case 'stump':
        circle(cx, cy, w / 2, '#5a3a1e'); circle(cx, cy, w / 2 - 1, '#b08a5a'); px(cx - 0.5, cy - 0.5, 1, 1, '#7a5232');
        break;
      case 'tire':
        circle(cx, cy, w / 2, '#16161a'); circle(cx - 0.5, cy - 0.5, w / 2 - 1, '#2a2a30'); circle(cx, cy, w / 4, '#0c0c0e');
        break;
      case 'sandbox':
        px(x, y, w, h, '#7a5a30'); px(x + 2, y + 2, w - 4, h - 4, '#d8c08a');
        for (let grain = 0; grain < w * h / 6; grain += 1) px(x + 2 + random() * (w - 4), y + 2 + random() * (h - 4), 1, 1, pick(['#c8ae76', '#e4d0a0']));
        px(x + 6, y + 8, 2, 2, '#3a7ac8'); px(x + 10, y + 6, 1, 3, '#c8302c');
        break;
      case 'building':
        px(x, y, w, h * 0.7, '#22262e');
        for (let col = 0; col < w; col += 6) px(x + col, y, 1, h * 0.7, '#323844');
        for (let row = 0; row < h * 0.7; row += 5) px(x, y + row, w, 1, '#323844');
        px(x, y + h * 0.7, w, h * 0.3, '#6a3024');
        for (let row = 0; row < h * 0.3; row += 2) for (let col = (row / 2) % 2 ? 0 : 2; col < w; col += 4) px(x + col, y + h * 0.7 + row, 3, 1, '#7e3c2c');
        px(cx - 2, y + h * 0.7 + 1, 4, h * 0.3 - 1, '#16161a'); px(cx - 1, y + h * 0.7, 2, 1, '#ffe08a');
        break;
      case 'dumpster':
        px(x, y, w, h, '#1e4a28'); px(x + 1, y + 1, w - 2, h / 2 - 1, '#2e6a3a'); px(x + 1, y + h / 2 + 1, w - 2, h / 2 - 2, '#2a5e34');
        break;
    }
  }

  // chain-link fence with posts, gate gap at the bottom middle
  const fence = (x: number, y: number, w: number, h: number) => { px(x, y, w, h, '#2a2e2a'); px(x + (w > h ? 0 : 0.5), y + (w > h ? 0.5 : 0), w > h ? w : 1, w > h ? 1 : h, '#8a908a'); };
  fence(0, 0, W, 2); fence(0, 0, 2, H); fence(W - 2, 0, 2, H); fence(0, H - 2, GATE_X - 8, 2); fence(GATE_X + 8, H - 2, W - GATE_X - 8, 2);
  for (let post = 0; post < W; post += 16) { px(post, 0, 2, 3, '#c9c9b8'); if (post < GATE_X - 8 || post > GATE_X + 6) px(post, H - 3, 2, 3, '#c9c9b8'); }
  for (let post = 0; post < H; post += 16) { px(0, post, 3, 2, '#c9c9b8'); px(W - 3, post, 3, 2, '#c9c9b8'); }
  px(GATE_X - 9, H - 4, 2, 4, '#d8d8c8'); px(GATE_X + 7, H - 4, 2, 4, '#d8d8c8');
  return canvas;
}
