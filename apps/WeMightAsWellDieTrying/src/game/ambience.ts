// A little life on a painted map, only drawn: fire flickering in burned-out cars, blazes and some oil drums, smoke
// drifting off them downwind, grey smoke off some rubble, steam from some manholes, smoke from the funnel or the
// exhausts of what waits on the safe zone. Used by the game and the menu.
import type Phaser from 'phaser';

type Decor = { kind: string; x: number; y: number };

/** Sets fire and smoke going at the decor that burns (at most `most` places), in world coordinates; `size` scales the
 *  flames and the smoke (and how fast they rise). */
export function ambience(scene: Phaser.Scene, decor: Decor[], most: number, size = 1) {
  const s = (v: number) => v * size, span = (min: number, max: number) => ({ min: min * size, max: max * size });
  if (!scene.textures.exists('fx-puff')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 0.45).fillCircle(4, 4, 4).fillStyle(0xffffff, 1).fillCircle(4, 4, 2.5).generateTexture('fx-puff', 8, 8);
    g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture('fx-spark', 2, 2);
    g.destroy();
  }
  let left = most;
  for (const [k, d] of decor.entries()) {
    // The safe zone's (never left out for `most`): a cookfire's flames, a bus's or a truck's exhaust.
    if (d.kind === 'campfire') {
      scene.add.particles(d.x, d.y, 'fx-spark', {
        lifespan: { min: 250, max: 500 }, speedY: span(-16, -6), speedX: span(-4, 4), scale: { start: s(1.5), end: s(0.2) }, alpha: { start: 0.95, end: 0 },
        tint: [0xffd060, 0xff9030, 0xff5020], blendMode: 'ADD', frequency: 70,
      }).setDepth(1.4);
      scene.add.particles(d.x, d.y - 2, 'fx-puff', { lifespan: 2500, speedY: span(-10, -5), speedX: span(2, 6), scale: { start: s(0.3), end: s(1.6) }, alpha: { start: 0.25, end: 0 }, tint: 0x3a3836, frequency: 320 }).setDepth(9);
      continue;
    }
    if (d.kind === 'funnel' || d.kind === 'exhaust') {
      const funnel = d.kind === 'funnel';
      scene.add.particles(d.x, d.y, 'fx-puff', {
        lifespan: funnel ? { min: 3500, max: 5000 } : { min: 1200, max: 1800 }, speedY: span(-10, -4), speedX: span(2, 7),
        scale: { start: s(funnel ? 0.7 : 0.25), end: s(funnel ? 3.4 : 1.1) }, alpha: { start: funnel ? 0.4 : 0.22, end: 0 },
        tint: funnel ? 0x2e2c2a : 0x9a968e, frequency: funnel ? 150 : 280,
      }).setDepth(9);
      continue;
    }
    const roll = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296; // the same few each time the map is shown
    const big = d.kind === 'blaze', fire = big || d.kind === 'wreck' || d.kind === 'burnt' || (d.kind === 'barrel' && roll < 0.3);
    const steam = d.kind === 'manhole' && roll < 0.4, smoke = fire || (d.kind === 'rubble' && roll < 0.25);
    if ((!fire && !steam && !smoke) || left-- <= 0) continue;
    if (fire) scene.add.particles(d.x, d.y, 'fx-spark', {
      lifespan: big ? { min: 450, max: 900 } : { min: 300, max: 600 }, speedY: big ? span(-34, -14) : span(-22, -8), speedX: big ? span(-9, 9) : span(-5, 5),
      scale: { start: s(big ? 2.6 : 1.6), end: s(0.2) }, alpha: { start: 0.95, end: 0 },
      tint: [0xffd060, 0xff9030, 0xff5020], blendMode: 'ADD', frequency: big ? 22 : 60, quantity: big ? 2 : 1,
    }).setDepth(1.4);
    if (smoke) scene.add.particles(d.x, d.y - 2, 'fx-puff', {
      lifespan: big ? { min: 3500, max: 5500 } : { min: 2500, max: 4000 }, speedY: span(-12, -6), speedX: span(2, 8),
      scale: { start: s(big ? 0.9 : 0.5), end: s(big ? 4 : 2.4) }, alpha: { start: big ? 0.45 : fire ? 0.35 : 0.2, end: 0 },
      tint: fire ? 0x2a2826 : 0x8a8680, frequency: big ? 110 : fire ? 220 : 500,
    }).setDepth(9);
    if (steam) scene.add.particles(d.x, d.y, 'fx-puff', {
      lifespan: 1600, speedY: span(-8, -3), speedX: span(-2, 4), scale: { start: s(0.4), end: s(1.6) }, alpha: { start: 0.18, end: 0 }, tint: 0xd8d4c8, frequency: 400,
    }).setDepth(1.4);
  }
}
