import type Phaser from 'phaser';
import { PLAYGROUND } from '../../shared/obstacles';
import { ART_H, ART_SCALE, ART_W, GATE_X, inDirt, paintTree } from './playground';

// The living parts of the Tag playground: grass that sways and gets trampled, swings and a merry-go-round
// that players set moving, dust kicked up on the dirt, tree canopies over the players, and butterflies.
// Purely visual: nothing here changes the game rules.

type Point = { x: number; y: number };
export type Walker = { id: string; position: Point; sprinting: boolean; isLocal: boolean };

const SEATS = [0.2, 0.36, 0.64, 0.8];
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const blocked = (x: number, y: number) => x < 4 || y < 4 || x > ART_W - 5 || y > ART_H - 5 || inDirt(x, y, -0.08)
  || (Math.abs(x - GATE_X) < 8 && y > ART_H - 25)
  || PLAYGROUND.some((prop) => x > prop.x / ART_SCALE - 2 && x < (prop.x + prop.w) / ART_SCALE + 3 && y > prop.y / ART_SCALE - 2 && y < (prop.y + prop.h) / ART_SCALE + 3);

export function createAmbience() {
  const random = seeded(42);
  const tufts: Point[] = [];
  while (tufts.length < 170) {
    const x = Math.floor(random() * ART_W), y = Math.floor(random() * ART_H);
    if (!blocked(x, y)) tufts.push({ x, y });
  }
  const swings = PLAYGROUND.find((prop) => prop.kind === 'swings');
  const merry = PLAYGROUND.find((prop) => prop.kind === 'merry');
  const trees = PLAYGROUND.filter((prop) => prop.kind === 'tree');
  const seatSwing = SEATS.map(() => 0.6);
  let merryAngle = 0, merrySpin = 0.4;
  const dust: { x: number; y: number; born: number }[] = [];
  const last = new Map<string, Point>();

  // 1 art pixel = 4 world pixels, so everything here snaps to that grid
  const pixel = (g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha = 1, w = 1, h = 1) =>
    g.fillStyle(color, alpha).fillRect(Math.round(x) * ART_SCALE, Math.round(y) * ART_SCALE, w * ART_SCALE, h * ART_SCALE);
  const near = (walkers: Walker[], x: number, y: number, reach: number) => walkers.find(({ position }) => Math.hypot(position.x - x, position.y - y) < reach);

  return {
    // drawn on the ground, under the players
    under(scene: Phaser.Scene, time: number, delta: number, walkers: Walker[]) {
      const g = scene.add.graphics();
      const seconds = Math.min(delta, 100) / 1000;

      // grass: wind gusts roll across the field; a player nearby flattens it away from them
      for (const tuft of tufts) {
        const wx = tuft.x * ART_SCALE, wy = tuft.y * ART_SCALE;
        const walker = near(walkers, wx, wy, 26);
        const gust = Math.sin(time / 900 - tuft.x * 0.12 + tuft.y * 0.05);
        const lean = walker ? Math.sign(wx - walker.position.x) || 1 : gust > 0.55 ? 1 : gust < -0.75 ? -1 : 0;
        pixel(g, tuft.x, tuft.y, 0x2f6224);
        pixel(g, tuft.x + 1, tuft.y, 0x2f6224);
        if (walker) { pixel(g, tuft.x + lean, tuft.y, 0x5aa844); continue; }
        pixel(g, tuft.x + lean, tuft.y - 1, 0x5aa844);
        pixel(g, tuft.x + 1 + lean, tuft.y - 1, 0x4a8a34);
      }

      // swings: a breeze keeps them moving a little; running past gives them a push
      if (swings) {
        const top = swings.y / ART_SCALE + 3;
        SEATS.forEach((seat, index) => {
          const x = (swings.x + swings.w * seat) / ART_SCALE;
          const restY = top + swings.h / ART_SCALE / 2;
          if (near(walkers, x * ART_SCALE, restY * ART_SCALE, 34)) seatSwing[index] = Math.min(5, seatSwing[index] + seconds * 6);
          seatSwing[index] = Math.max(0.6, seatSwing[index] - seconds * 0.8);
          const y = restY + Math.sin(time / 420 + index * 1.7) * seatSwing[index];
          for (let chain = top; chain < y; chain += 1) { pixel(g, x, chain, 0xa0a0a8); pixel(g, x + 2, chain, 0xa0a0a8); }
          pixel(g, x - 0.5, y, 0x2a1a10, 1, 4, 2);
        });
      }

      // merry-go-round: idles slowly; touch it while moving to spin it up
      if (merry) {
        const cx = (merry.x + merry.w / 2) / ART_SCALE, cy = (merry.y + merry.h / 2) / ART_SCALE, reach = merry.w / ART_SCALE / 2 - 3;
        const pusher = near(walkers, cx * ART_SCALE, cy * ART_SCALE, merry.w / 2 + 26);
        const moved = pusher && Math.hypot(pusher.position.x - (last.get(pusher.id)?.x ?? pusher.position.x), pusher.position.y - (last.get(pusher.id)?.y ?? pusher.position.y)) > 0.5;
        merrySpin = moved ? Math.min(7, merrySpin + seconds * 8) : Math.max(0.4, merrySpin - seconds * 1.2);
        merryAngle += merrySpin * seconds;
        for (const offset of [0, Math.PI / 2]) {
          for (let step = -reach; step <= reach; step += 0.5) pixel(g, cx - 0.5 + Math.cos(merryAngle + offset) * step, cy - 0.5 + Math.sin(merryAngle + offset) * step, 0xe0b83a);
        }
        pixel(g, cx - 1, cy - 1, 0xc8302c, 1, 2, 2);
      }

      // dust: feet on dirt kick up little puffs, more when sprinting
      for (const walker of walkers) {
        const before = last.get(walker.id);
        const speed = before ? Math.hypot(walker.position.x - before.x, walker.position.y - before.y) : 0;
        if (speed > 1.5 && inDirt(walker.position.x / ART_SCALE, walker.position.y / ART_SCALE) && random() < (walker.sprinting ? 0.6 : 0.2)) {
          dust.push({ x: walker.position.x / ART_SCALE + (random() - 0.5) * 3, y: walker.position.y / ART_SCALE + 3, born: time });
        }
      }
      while (dust.length && time - dust[0].born > 500) dust.shift();
      for (const puff of dust) {
        const age = (time - puff.born) / 500;
        const size = age < 0.4 ? 1 : 2;
        pixel(g, puff.x - size / 2, puff.y - age * 2, 0xb08a5a, 0.55 * (1 - age), size, size);
      }
    },

    // drawn over the players: tree canopies (see-through over you, so you can hide from others) and butterflies
    over(scene: Phaser.Scene, time: number, walkers: Walker[]) {
      for (const tree of trees) {
        const key = `tree-${tree.w}`;
        const size = tree.w / ART_SCALE;
        if (!scene.textures.exists(key)) scene.textures.addCanvas(key, paintTree(size));
        const cx = tree.x + tree.w / 2, cy = tree.y + tree.h / 2;
        // a slow one-pixel sway; whole art pixels keep it crisp
        const sway = Math.round(Math.sin(time / 1300 + tree.x * 0.01)) * ART_SCALE;
        const under = walkers.some(({ position, isLocal }) => isLocal && Math.hypot(position.x - cx, position.y - cy) < tree.w / 2 + 8);
        scene.add.image(cx + sway, cy, key).setDisplaySize(tree.w, tree.h).setAlpha(under ? 0.45 : 1);
      }
      const g = scene.add.graphics();
      [[0xfff4e6, 0], [0xf7c95b, 2.1], [0xf0a0b8, 4.2]].forEach(([color, phase], index) => {
        let x = ART_W * (0.2 + 0.3 * index) + Math.sin(time / 2300 + phase) * 30 + Math.sin(time / 700 + phase) * 4;
        let y = ART_H * 0.8 - index * 30 + Math.cos(time / 1900 + phase) * 14;
        // butterflies flutter away from anyone who comes close
        const walker = near(walkers, x * ART_SCALE, y * ART_SCALE, 70);
        if (walker) { x += Math.sign(x * ART_SCALE - walker.position.x) * 6; y -= 6; }
        const open = Math.floor(time / 110 + index) % 2 === 0;
        pixel(g, x, y, 0x2b2a3a);
        pixel(g, x - 1, y - (open ? 0 : 1), color);
        pixel(g, x + 1, y - (open ? 0 : 1), color);
      });
      for (const walker of walkers) last.set(walker.id, { ...walker.position });
    },
  };
}
