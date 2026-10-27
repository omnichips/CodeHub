// Walls and props. Pure data plus one collision helper, so the look can be reskinned
// (see web/src/playground.ts and web/src/obstacles.ts) without touching the game rules.
import type { GameMode } from './protocol';

// round: collides as the circle inside the box. solid: false means decoration you can walk over.
export type Prop = { kind: string; x: number; y: number; w: number; h: number; round?: boolean; solid?: boolean };

// Layouts are written for the original 960x540 map and grown to the current size, snapped to the 4px art grid.
const MAP_SCALE = 1.25;
const snap = (value: number) => Math.round(value * MAP_SCALE / 4) * 4;
const grow = (props: Prop[]) => props.map((prop) => ({ ...prop, x: snap(prop.x), y: snap(prop.y), w: snap(prop.w), h: snap(prop.h) }));

// Gladiator and Laser keep the plain block layout.
export const OBSTACLES: Prop[] = grow([
  { kind: 'block', x: 420, y: 240, w: 120, h: 60 },
  { kind: 'block', x: 180, y: 130, w: 40, h: 120 }, { kind: 'block', x: 740, y: 290, w: 40, h: 120 },
  { kind: 'block', x: 740, y: 130, w: 40, h: 120 }, { kind: 'block', x: 180, y: 290, w: 40, h: 120 },
  { kind: 'block', x: 330, y: 400, w: 60, h: 40 }, { kind: 'block', x: 570, y: 100, w: 60, h: 40 },
]);

// The Tag playground, in original-map pixels (multiples of 4 so it lines up with the 4x art pixels).
// Keep props out of the spawn points (see SPAWNS in game.ts) and leave gaps of 40px or more to run through.
export const PLAYGROUND: Prop[] = grow([
  { kind: 'swings', x: 560, y: 28, w: 128, h: 56, solid: false },
  { kind: 'sandbox', x: 620, y: 440, w: 112, h: 72, solid: false },
  { kind: 'tree', x: 16, y: 16, w: 56, h: 56, round: true },
  { kind: 'tree', x: 888, y: 16, w: 56, h: 56, round: true },
  { kind: 'tree', x: 16, y: 468, w: 56, h: 56, round: true },
  { kind: 'tree', x: 888, y: 468, w: 56, h: 56, round: true },
  { kind: 'tree', x: 220, y: 24, w: 48, h: 48, round: true },
  { kind: 'tree', x: 24, y: 316, w: 48, h: 48, round: true },
  { kind: 'tree', x: 560, y: 452, w: 48, h: 48, round: true },
  { kind: 'bin', x: 152, y: 40, w: 16, h: 16 },
  { kind: 'shelter', x: 24, y: 132, w: 88, h: 84 },
  { kind: 'bench', x: 96, y: 264, w: 48, h: 16 },
  { kind: 'net', x: 180, y: 136, w: 56, h: 56 },
  { kind: 'tower', x: 300, y: 112, w: 120, h: 96 },
  { kind: 'slide', x: 256, y: 196, w: 48, h: 64 },
  { kind: 'merry', x: 656, y: 132, w: 72, h: 72, round: true },
  { kind: 'climber', x: 792, y: 148, w: 64, h: 88 },
  { kind: 'pole', x: 616, y: 216, w: 8, h: 40 },
  { kind: 'crates', x: 452, y: 216, w: 56, h: 44 },
  { kind: 'ruin', x: 260, y: 308, w: 72, h: 32 },
  { kind: 'woodwall', x: 400, y: 316, w: 104, h: 32 },
  { kind: 'aframe', x: 600, y: 280, w: 64, h: 72 },
  { kind: 'shed', x: 872, y: 272, w: 72, h: 88 },
  { kind: 'ruin', x: 280, y: 392, w: 48, h: 40 },
  { kind: 'log', x: 360, y: 396, w: 112, h: 20 },
  { kind: 'stump', x: 352, y: 456, w: 16, h: 16, round: true },
  { kind: 'stump', x: 388, y: 460, w: 16, h: 16, round: true },
  { kind: 'tire', x: 752, y: 400, w: 32, h: 32, round: true },
  { kind: 'tire', x: 784, y: 392, w: 32, h: 32, round: true },
  { kind: 'tire', x: 768, y: 424, w: 32, h: 32, round: true },
  { kind: 'tire', x: 800, y: 424, w: 32, h: 32, round: true },
  { kind: 'building', x: 148, y: 444, w: 112, h: 80 },
  { kind: 'dumpster', x: 268, y: 488, w: 32, h: 28 },
  { kind: 'bench', x: 500, y: 504, w: 48, h: 16 },
]);

export const obstaclesFor = (mode: GameMode) => (mode === 'tag' ? PLAYGROUND : OBSTACLES).filter((prop) => prop.solid !== false);

// Moves a circle out of every obstacle it overlaps.
export const resolveObstacles = (x: number, y: number, radius: number, props: Prop[]) => {
  for (const prop of props) {
    if (prop.round) {
      const centerX = prop.x + prop.w / 2, centerY = prop.y + prop.h / 2, reach = prop.w / 2 + radius;
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance >= reach) continue;
      if (distance === 0) { y = centerY - reach; continue; }
      x = centerX + (x - centerX) / distance * reach;
      y = centerY + (y - centerY) / distance * reach;
      continue;
    }
    const nearestX = Math.max(prop.x, Math.min(prop.x + prop.w, x));
    const nearestY = Math.max(prop.y, Math.min(prop.y + prop.h, y));
    const distance = Math.hypot(x - nearestX, y - nearestY);
    if (distance >= radius) continue;
    if (distance > 0) {
      x = nearestX + (x - nearestX) / distance * radius;
      y = nearestY + (y - nearestY) / distance * radius;
      continue;
    }
    // centre is inside the rectangle: leave by the nearest edge
    const left = x - prop.x, right = prop.x + prop.w - x, top = y - prop.y, bottom = prop.y + prop.h - y;
    const nearest = Math.min(left, right, top, bottom);
    if (nearest === left) x = prop.x - radius;
    else if (nearest === right) x = prop.x + prop.w + radius;
    else if (nearest === top) y = prop.y - radius;
    else y = prop.y + prop.h + radius;
  }
  return { x, y };
};
