import type Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, type GameMode } from '../../shared/protocol';
import { OBSTACLES } from '../../shared/obstacles';
import { paintPlayground } from './playground';

// The look of each arena lives here only; collision uses shared/obstacles.ts.
export function drawArena(scene: Phaser.Scene, mode: GameMode) {
  if (mode === 'tag') {
    if (!scene.textures.exists('playground')) scene.textures.addCanvas('playground', paintPlayground(document.createElement('canvas'), true));
    scene.add.image(0, 0, 'playground').setOrigin(0).setDisplaySize(ARENA_WIDTH, ARENA_HEIGHT);
    return;
  }
  scene.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x211c38);
  for (const { x, y, w, h } of OBSTACLES) scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x3a3157).setStrokeStyle(3, 0x8d78a8);
}
