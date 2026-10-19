// The main menu, or the art viewer with ?art, or straight into a fight with ?play (?play=chicago for that map).
import Phaser from 'phaser';
import '@fontsource/vt323/latin-400.css';
import palette from './data/palette.json' with { type: 'json' };
import { watchForCrashes } from './game/crash.ts';
import { startLoading } from './game/loading.ts';
import { applyScale } from './game/settings.ts';
import { Menu } from './game/menu.ts';
import { Game } from './game/scene.ts';
import { View } from './viewer.ts';

startLoading();
applyScale();
const q = new URLSearchParams(location.search);
// Offline play once installed; only a built game has the worker (see vite.config.ts).
// A newer version takes over while the game is open (an installed copy stays open for days): offer a reload. The banner
// waits out a fight (CSS hides it while the HUD is up), and the first install is not an update.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js');
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadVersion) document.getElementById('update')?.classList.add('open'); });
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: palette.asphalt0,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  input: { activePointers: 2 },
  audio: { noAudio: true }, // the game makes its own sound (game/sound.ts)
  scene: q.has('art') ? View : q.has('play') ? [Game, Menu] : [Menu, Game], // the first one starts
});
watchForCrashes(game);

// An iPhone zooms the page itself on a pinch, whatever the viewport tag says, and the bottom of the game is then off the
// screen with no way back to it. The game does its own pinch, so the page's is stopped.
for (const e of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false });
document.addEventListener('touchmove', (ev) => { if (ev.touches.length > 1) ev.preventDefault(); }, { passive: false });
// It also reports the old size for a moment after the phone turns: measure again as it settles.
const settle = () => { for (const ms of [100, 400, 1000]) setTimeout(() => game.scale.refresh(), ms); };
addEventListener('orientationchange', settle);
visualViewport?.addEventListener('resize', settle);
