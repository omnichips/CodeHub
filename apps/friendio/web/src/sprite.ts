import { AVATAR_COLORS, AVATAR_SIZE } from '../../shared/protocol';

// The one player look shared by every mode: a kid seen from above, front facing up.
// The head is the player's own 12x12 drawing; shirt colour comes from their room slot.
export const SHIRTS = ['#e85d75', '#5bc0f7', '#f7c95b', '#7de2a8', '#a77de2', '#ff9a4d'];
export const SPRITE_SIZE = 20;
// world pixels per sprite pixel: the head (12px) then matches the 36px collision circle
export const SPRITE_SCALE = 3;
const INK = '#0b0914';
const SKIN = '#f2c39b';

const shade = (hex: string, amount: number) => `#${[1, 3, 5].map((index) =>
  Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(index, index + 2), 16) * amount))).toString(16).padStart(2, '0')).join('')}`;

// frame 0 stands still; frames 1 and 2 swing the hands for walking
export function paintPlayerSprite(canvas: HTMLCanvasElement, options: { color: number; avatar: string; frame: number; it?: boolean }) {
  canvas.width = canvas.height = SPRITE_SIZE;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    g.fillStyle = color;
    for (let y = 0; y < SPRITE_SIZE; y += 1) for (let x = 0; x < SPRITE_SIZE; x += 1) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g.fillRect(x, y, 1, 1);
    }
  };
  const shirt = SHIRTS[options.color % SHIRTS.length];

  // shoulders, darker towards the back
  ellipse(10, 11, 9.6, 5.6, INK);
  ellipse(10, 11, 8.7, 4.7, shirt);
  ellipse(10, 12.8, 7.4, 2.6, shade(shirt, 0.75));
  // hands: level when standing, swinging opposite ways when walking
  const [left, right] = options.frame === 1 ? [6, 13] : options.frame === 2 ? [13, 6] : [9, 9];
  for (const [x, y] of [[2, left], [18, right]]) { ellipse(x, y, 2.1, 2.1, INK); ellipse(x, y, 1.3, 1.3, SKIN); }

  // head: outline (red when IT), skin base, then the drawing or a default haircut
  const head = (x: number, y: number) => (x + 0.5 - 10) ** 2 + (y + 0.5 - 8) ** 2 <= 36;
  ellipse(10, 8, 6.9, 6.9, options.it ? '#ff3b3b' : INK);
  const drawn = /[1-8]/.test(options.avatar);
  for (let y = 0; y < AVATAR_SIZE; y += 1) for (let x = 0; x < AVATAR_SIZE; x += 1) {
    const sx = x + 4, sy = y + 2;
    if (!head(sx, sy)) continue;
    const cell = options.avatar[y * AVATAR_SIZE + x] ?? '0';
    // default hair, with a sliver of face at the front and a shine on top
    const color = drawn ? (cell === '0' ? SKIN : AVATAR_COLORS[Number(cell) - 1])
      : sy <= 3 ? SKIN : (sx === 7 || sx === 8) && sy === 5 ? '#8a5a36' : '#4a2e1a';
    g.fillStyle = color;
    g.fillRect(sx, sy, 1, 1);
  }
  return canvas;
}
