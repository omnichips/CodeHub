// The skill tree's demo of a soldier: him (with your upgrades) holding a short street of his own while zombies keep
// coming, drawn by the game's own scene in a second, small Phaser game inside the tree's demo box. When he falls the
// street is cleared and he stands again. One demo game is made, and kept for the next.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { bake, load } from '../art/atlas.ts';
import { profile } from '../meta/profile.ts';
import { PACE, build } from '../meta/progress.ts';
import { Grid, type MapData } from '../sim/grid.ts';
import { STEP, World, type UnitKind, type WavePlan } from '../sim/world.ts';
import { paintMap } from './mapart.ts';
import { Game } from './scene.ts';

const W = 30, T = 16, MID = 6 * T; // tiles across; the street runs rows 3 to 8, its middle line at MID
const BUILT = ['aaaaaaaabbbbbbbbbbhhhhhhhhhhhh', 'hhhhhhhhhhoooooooooobbbbbbbbbb'];
/** A street: buildings above and below, the safe zone at the left end, the horde in at the right. */
const MAP: MapData = {
  name: 'Demo', tile: T, par: 0, slots: [], props: [],
  rows: Array.from({ length: 12 }, (_, y) => (y < 3 ? BUILT[0] : y > 8 ? BUILT[1] : `EE${'.'.repeat(W - 3)}S`)),
  decor: Array.from({ length: 4 }, (_, k) => [{ kind: 'lamp', x: (5 + k * 6.5) * T, y: 3.5 * T }, { kind: 'lamp', x: (8 + k * 6.5) * T, y: 8.5 * T }]).flat(),
};
/** How many come every 30 seconds of fight (6 on screen, at the game's 1x): more for those who mow crowds down, or who need a crowd to show what they do. */
const PRESSURE: Partial<Record<UnitKind, number>> = { machinegunner: 12, flamethrower: 10, mortar: 10, grenadier: 10, bazooka: 10, shotgunner: 9, shield: 9, medic: 10, engineer: 10 };
const plan = (unit: UnitKind): WavePlan => ({
  gap: 0.5,
  waves: Array.from({ length: 400 }, (_, k) => ({ duration: 30, spawn: { normal: PRESSURE[unit] ?? 6, fast: 1, ...(k % 3 === 2 ? { armored: 1 } : {}) } })),
});

class Demo extends Game {
  unit: UnitKind = 'rifleman';
  ending = false;

  constructor() { super('demo'); }

  init(data: { map?: string; unit?: UnitKind }) { this.unit = data.unit ?? this.unit; }

  preload() { load(this); }

  create() {
    bake(this);
    this.muted = true;
    this.mapData = MAP;
    this.add.image(0, 0, paintMap(this, MAP, new Grid(MAP), 'demo-map', profile.settings.gore !== 'none')).setOrigin(0);
    this.floor = this.add.graphics().setDepth(1);
    this.top = this.add.graphics().setDepth(10);
    this.round();
    this.entries = this.findEntries();
    const fit = () => {
      const cam = this.cameras.main, mw = W * T, mh = MAP.rows.length * T;
      cam.setZoom(Math.min(cam.width / mw, cam.height / mh)).centerOn(mw / 2, mh / 2);
    };
    fit();
    this.scale.on('resize', fit);
    this.events.once('shutdown', () => this.scale.off('resize', fit));
  }

  /** A fresh street, and the soldier (and whoever he needs to show his trade) put down and aimed up it. */
  round() {
    for (const s of this.zombies) s.destroy();
    for (const c of this.corpses) { c.body.destroy(); c.splat?.destroy(); }
    Object.assign(this, { zombies: [], corpses: [], acc: 0, ending: false });
    const stats = build(profile.save.skills).stats;
    stats.leakLimit = Infinity; // they keep coming; the ones who get past just go
    const w = (this.world = new World(MAP, plan(this.unit), (Math.random() * 1e9) | 0, stats));
    const put = (kind: UnitKind, tx: number, y = MID) => {
      const s = w.placeSoldier(kind, tx * T, y);
      if (s) w.aim(s, s.x + s.reach, y); // straight up the street, as far out as he aims by default
      return s;
    };
    if (this.unit === 'shield') { put('rifleman', 5); put('shield', 11); }
    else if (this.unit === 'medic') { put('rifleman', 8, MID - 12); put('rifleman', 8, MID + 12); put('medic', 6); }
    else if (this.unit === 'engineer') {
      put('rifleman', 7, MID - 10); put('rifleman', 7, MID + 10); put('engineer', 9);
      w.placeBlock('wood', 13, 3, true, false);
      w.placeBlock('wood', 13, 6, true, false);
    } else {
      const s = put(this.unit, 6)!;
      if (this.unit === 'operator') w.deployTurret(s, 9 * T, MID - 2 * T);
    }
    w.start();
    // A few already on their way, so it starts at once.
    for (let k = 0; k < 10; k++) w.spawn(k % 5 ? 0 : 1, (11 + k * 1.8) * T, (3.4 + w.random() * 5.2) * T);
  }

  update(_time: number, delta: number) {
    const w = this.world;
    this.acc += (Math.min(delta, 100) / 1000) * PACE; // as brisk as the game at 1x
    this.anims.globalTimeScale = PACE;
    while (this.acc >= STEP) {
      w.step(STEP);
      this.acc -= STEP;
    }
    w.sounds.length = 0;
    this.spill();
    this.drawZombies();
    this.drawSoldiers();
    this.drawBuilt();
    this.drawOverlay();
    // Everyone down (or the street done with): a short fade, and it starts again.
    if (!this.ending && (w.phase !== 'wave' || w.soldiers.every((s) => s.dead))) {
      this.ending = true;
      this.time.delayedCall(900, () => {
        this.cameras.main.fadeOut(250);
        this.cameras.main.once('camerafadeoutcomplete', () => { this.round(); this.cameras.main.fadeIn(250); });
      });
    }
  }
}

let game: Phaser.Game | undefined;
const holder = Object.assign(document.createElement('div'), { className: 'canvas' });

/** Shows `unit` fighting in `box`, until stopWatching(). */
export function watch(unit: UnitKind, box: HTMLElement) {
  box.append(holder);
  const go = () => {
    const g = game!;
    if (!holder.isConnected) return; // closed before it was ready
    g.loop.wake();
    g.scale.refresh();
    if (g.scene.getScene('demo')) g.scene.start('demo', { unit });
    else g.scene.add('demo', Demo, true, { unit });
  };
  if (game) return go();
  game = new Phaser.Game({
    type: Phaser.AUTO, parent: holder, pixelArt: true, backgroundColor: palette.asphalt0, banner: false,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    audio: { noAudio: true },
  });
  game.events.once('ready', go);
}

export function stopWatching() {
  holder.remove();
  if (!game?.isBooted) return;
  game.scene.stop('demo');
  game.loop.sleep();
}
