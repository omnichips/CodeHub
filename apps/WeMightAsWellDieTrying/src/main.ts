// The game, or the art viewer with ?art.
import Phaser from 'phaser';
import palette from './data/palette.json' with { type: 'json' };
import { Game } from './game/scene.ts';
import { View } from './viewer.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: palette.asphalt0,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  input: { activePointers: 2 },
  scene: new URLSearchParams(location.search).has('art') ? View : Game,
});
