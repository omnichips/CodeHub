// The main menu, or the art viewer with ?art, or straight into New York with ?play.
import Phaser from 'phaser';
import palette from './data/palette.json' with { type: 'json' };
import { Menu } from './game/menu.ts';
import { Game } from './game/scene.ts';
import { View } from './viewer.ts';

const q = new URLSearchParams(location.search);
// Offline play once installed; only a built game has the worker (see vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: palette.asphalt0,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  input: { activePointers: 2 },
  scene: q.has('art') ? View : q.has('play') ? [Game, Menu] : [Menu, Game], // the first one starts
});
