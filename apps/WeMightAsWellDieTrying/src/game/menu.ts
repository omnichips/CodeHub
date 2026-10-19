// The main menu: the city the save played last is on, from above, drifting slowly under falling ash, its zombies
// walking the horde's routes, what is left of the squad at the spots soldiers hold firing down at them, now and then a
// helicopter leaving. Over it an HTML overlay: the title stamped on, then pixel-art paper (game/paper.ts): the last
// save's dossier, folders for a new save and loading one, a sticky note for settings (statistics inside), and the
// latest patch notes as a clipping. Inside a save: its cities and its skill tree.
import Phaser from 'phaser';
import { bake, load } from '../art/atlas.ts';
import { MAPS, lastPlayed, open, persist, profile, saves } from '../meta/profile.ts';
import { NODE, NODES } from '../meta/progress.ts';
import notes from '../data/patchnotes.json' with { type: 'json' };
import { Grid, type MapData } from '../sim/grid.ts';
import { DIFFICULTY, exportSave, fresh, noStats, parse, remove, type Difficulty, type Save, type Stats } from '../meta/save.ts';
import { ask } from './dialog.ts';
import { el } from './hud.ts';
import { pixIcon } from './pixicons.ts';
import { buildTag } from './build.ts';
import { loadingActive, startLoading, stopLoading, whileLoading, wipe } from './loading.ts';
import { ambience } from './ambience.ts';
import { atmosphere } from './atmosphere.ts';
import { drizzles, weatherLine, weatherOf } from '../meta/profile.ts';
import { board } from './board.ts';
import { DEBUG_MAP, debugView } from './debugmap.ts';
import { HELI_RES, mapAnims, textures } from './mapanims.ts';
import { drawn, paintMap } from './mapart.ts';
import { clipping, dossier, indexTab, manualNote, medalNote, folder, filmFrame, medal, noteTag, pixelButton, pixelCanvas, slotFolder, stickyNote } from './paper.ts';
import { MEDALS } from '../meta/medals.ts';
import { icon } from '../art/atlas.ts';
import { UNITS, ZOMBIES, ZOMBIE_KINDS } from '../sim/world.ts';
import { routesOf } from '../sim/routes.ts';
import { settingsSheet } from './settings.ts';
import { music, play, retune } from './sound.ts';
import { FONT } from '../story/font.ts';
import { roll } from '../story/kit.ts';
import { noStory, record, story } from '../story/record.ts';
import { order } from '../story/text.ts';
import { mapOf } from '../story/types.ts';

export type Screen = 'menu' | 'new' | 'load' | 'save' | 'tree' | 'stats' | 'settings' | 'debug' | 'notes' | 'story' | 'medals' | 'manual';

const SHAMBLERS = ['normal', 'normal', 'normal', 'fast', 'bloater', 'armored', 'normal', 'tanky'];
const SQUAD = ['rifleman', 'sniper', 'shotgunner', 'marksman', 'grenadier', 'medic']; // as many stand as the story has left
const STATS: [keyof Stats, string][] = [['runs', 'Runs'], ['wins', 'Wins'], ['kills', 'Kills'], ['leaks', 'Leaks'], ['chips', 'Chips earned'], ['time', 'Time fighting']];

const THUMB_W = 240, THUMB_H = 150;
const THUMBS = new Map<string, HTMLCanvasElement>(); // `${map}-${blood}`: painted once a session, or baked
/** The thumbnails baked ahead of time (scripts/thumbs.ts), loaded as the game starts so the board need not paint them.
 *  One missing (a new map, or art changed and not baked again) is painted as before. */
const BAKED = import.meta.glob('../art/thumbs/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
if (!new URLSearchParams(location.search).has('thumbs'))
  for (const [path, url] of Object.entries(BAKED)) {
    const img = new Image();
    img.onload = () => {
      const cv = el('canvas', { width: img.width, height: img.height });
      cv.getContext('2d')!.drawImage(img, 0, 0);
      THUMBS.set(path.slice(path.lastIndexOf('/') + 1, -5), cv);
    };
    img.src = url;
  }
/** A doubled map at half size, as it was designed: it looks the same in a thumbnail, for a quarter of the painting. */
const half = (m: MapData): MapData => ((m.scale ?? 1) < 2 ? m : {
  ...m, scale: m.scale! / 2, props: [], rows: m.rows.filter((_, y) => y % 2 === 0).map((r) => [...r].filter((_, x) => x % 2 === 0).join('')),
  slots: m.slots?.map(([x, y]) => [x >> 1, y >> 1]), decor: m.decor?.map((d) => ({ ...d, x: d.x / 2, y: d.y / 2 })),
});

interface Walker { s: Phaser.GameObjects.Sprite; route: number[]; p: number; speed: number; down: number }
interface Gunner { s: Phaser.GameObjects.Sprite; kind: string; x: number; y: number; cool: number }
interface Heli { body: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; rotors: Phaser.GameObjects.Image[]; beacon: Phaser.GameObjects.Image; t: number; x: number; y: number; a: number; len: number }
interface Flake { img: Phaser.GameObjects.Image; u: number; v: number; vu: number; vv: number; size: number; ember: boolean; ph: number }

const button = (text: string, onclick: () => void, className = '') => el('button', { type: 'button', textContent: text, className, onclick });
const LEVELS = NODES.reduce((n, x) => n + x.max, 0);
const summary = (s: Save) => `${s.chips} chips · ${MAPS.filter((m) => s.cleared[m.id]).length}/${MAPS.length} cities · ${Object.values(s.skills).reduce((a, b) => a + b, 0)}/${LEVELS} skills`;
/** The newest patch notes this device has opened (their date), so the clipping can show when there are new ones. */
const SEEN = 'dietrying.notesSeen';
const seen = () => { try { return localStorage.getItem(SEEN) ?? ''; } catch { return ''; } };
const NEWEST = notes[0]?.date ?? '';
const clock = (t: number) => `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;
/** Where a save stands in the story: the city it is on (none once all are behind it), its day, its squad, and how
 *  many the notebook says were left behind (a page with no number, Rome's, counts none). */
function standing(s: Save | undefined) {
  const next = MAPS.findIndex((m) => !s?.cleared[m.id]), row = story.maps[next >= 0 ? next : story.maps.length - 1];
  const behind = Object.values(s?.story.notebook ?? {}).reduce((n, e) => n + (e.got === null ? 0 : e.needed - e.got), 0);
  return { next, day: row.day, squad: row.squad, behind };
}

/** The binder's pages, in order, and each one's index tab: its label and colours. */
const BINDER = ['settings', 'medals', 'manual'] as const;
type Page = (typeof BINDER)[number];
const BINDER_TABS: Record<Page, [string, string, string]> = { settings: ['SETTINGS', '#f2b8c2', '#d68794'], medals: ['MEDALS', '#e0cc62', '#cbb84e'], manual: ['FIELD MANUAL', '#b8d89a', '#94b878'] };

/** A post-it to press (Export, Delete, Medals and the like). */
const tagNote = (label: string, col: string, dark: string, ink: string, press: () => void) => { const [w, h, draw] = noteTag(label, col, dark, ink); return pixelButton(label, w, h, draw, press, 'tag'); };

/** What the field manual says of each zombie. */
const ZOMBIE_NOTES: Record<string, string> = {
  normal: 'Slow, and never alone. Most of every horde.',
  fast: 'Half the health, twice the speed. First to the line.',
  jumper: 'Leaps over roadblocks instead of going round or through them.',
  screamer: 'Screams every few seconds: every zombie near it speeds up.',
  bloater: 'Bursts when it dies, hurting the zombies round it. The rest lurch forward.',
  intelligent: 'Walks behind the others and steers them ahead of it, as a shield.',
  armored: 'Bullets and fire barely scratch it. Blasts and piercing rounds do.',
  tanky: 'Slow, and soaks up a magazine or three.',
  brute: 'Huge. Tears through roadblocks eight times as fast as the rest.',
  hordemother: 'Gives birth to two more every few seconds as it walks.',
  spitter: 'Spits bile from a distance, even at soldiers in windows. A soldier it hits goes for spitters first.',
  crawler: 'Drags itself under wire and over spikes. Low on the ground, bullets land 30% less.',
};

/** The city a save is on (the last one, once every city is behind it). */
const cityOf = (s: Save) => MAPS[standing(s).next >= 0 ? standing(s).next : MAPS.length - 1];

/** A line of the story's font stamped in ink: each pixel a `B`-pixel block, chipped here and there, the ink uneven,
 *  over its shadow. `seed` keeps its chips the same every time. */
function stamp(text: string, B: number, inks: string[], seed: number) {
  const w = [...text].reduce((n, ch) => n + (FONT[ch]?.w ?? 1) + 1, -1), off = Math.max(1, B >> 1);
  const cv = el('canvas', { width: w * B + off, height: 7 * B + off, ariaHidden: 'true' }), c = cv.getContext('2d')!;
  const lit: [number, number][] = [];
  let at = 0;
  for (const ch of text) { for (const [x, y] of FONT[ch]?.px ?? []) lit.push([at + x, y]); at += (FONT[ch]?.w ?? 1) + 1; }
  c.fillStyle = '#141516';
  for (const [x, y] of lit) c.fillRect(x * B + off, y * B + off, B, B);
  for (const [x, y] of lit)
    for (let v = 0; v < B; v++)
      for (let u = 0; u < B; u++) {
        const px = x * B + u, py = y * B + v, r = roll(px * 31 + seed, py * 17 + seed), chip = roll((px >> 1) + seed, (py >> 1) * 7);
        if (r < 0.06 || chip < 0.035) continue; // worn through to the paper
        c.fillStyle = inks[roll(px >> 2, (py >> 2) + seed) < 0.3 ? 1 : 0];
        c.fillRect(px, py, 1, 1);
      }
  return cv;
}

/** A speaker, crossed out while the sound is off. */
function speaker(on: boolean) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' + (on ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2"/>' : '<path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2"/>');
  return svg;
}
/** Master volume before the sound was turned off, to turn it back on to. */
const UNMUTE = 'dietrying.unmute';

export class Menu extends Phaser.Scene {
  open: Screen = 'menu';
  walkers: Walker[] = [];
  routes: number[][] = [];
  squad: Gunner[] = [];
  animate?: (dt: number) => void;
  air?: import('./atmosphere.ts').Atmosphere; // the city's weather and light
  home = { x: 0, y: 0 };
  mapW = 1;
  mapH = 1;
  tile = 16;
  gw = 1;
  heliSize = 1;
  heli?: Heli;
  ash: Flake[] = [];
  tracers!: Phaser.GameObjects.Graphics;
  shots: { x0: number; y0: number; x1: number; y1: number; t: number }[] = [];
  root!: HTMLElement;
  note = ''; // a line saying what the last cheat did
  binderFrom: Screen = 'menu'; // where the binder (settings, medals, field manual) goes back to: the main menu or a save's cities
  intro = true; // the first time the main menu shows: the title stamped on, the rest after it

  constructor() { super('menu'); }

  init(data: { open?: Screen }) { this.open = data.open ?? 'menu'; this.intro = true; this.current = undefined; }

  preload() { load(this); }

  create() {
    bake(this);
    textures(this);
    const cam = this.cameras.main.setBackgroundColor('#000000').fadeIn(400);
    const all = saves(), at = standing(all[lastPlayed(all)] ?? undefined), blood = profile.settings.gore !== 'none';
    // The city the save played last is on (the last one once every city is behind it), painted as the fight paints it
    // (the same texture, so going into the fight from here costs nothing), with its life.
    const m = MAPS[at.next >= 0 ? at.next : MAPS.length - 1], grid = new Grid(m.data), S = m.data.scale ?? 1, T = grid.tile;
    const art = paintMap(this, m.data, grid, `map-${m.id}-${blood}`, blood), decor = drawn.get(art) ?? [];
    this.add.image(0, 0, art).setOrigin(0);
    this.mapW = grid.w * T;
    this.mapH = grid.h * T;
    ambience(this, decor, 24);
    const air = atmosphere(this, weatherOf(m.id), decor, grid.w * T, grid.h * T, profile.settings.quality === 'low' ? 0.4 : 1, drizzles(m.id));
    this.air = air;
    this.animate = mapAnims(this, { ...m.data, slots: [] }, grid, decor, profile.settings.quality === 'low' ? 0.4 : 1, { scare: () => undefined, planning: () => false });
    // Where the view drifts round: halfway between the middle of the map and the safe zone, where the line is held.
    const g = grid.goals;
    this.home = {
      x: ((g.reduce((n, i) => n + (i % grid.w), 0) / g.length + 0.5) * T + this.mapW / 2) / 2,
      y: ((g.reduce((n, i) => n + Math.floor(i / grid.w), 0) / g.length + 0.5) * T + this.mapH / 2) / 2,
    };
    // The horde, along its own routes to the safe zone, each from somewhere along one.
    this.routes = routesOf(m.data, grid, S).list.map((r) => r.tiles).filter((r) => r.length > 4);
    this.tile = T;
    this.gw = grid.w;
    this.walkers = this.routes.length ? Array.from({ length: 16 }, (_, k) => {
      const route = this.routes[k % this.routes.length];
      return { s: this.add.sprite(0, 0, 'sprites').setDepth(2).play({ key: `${SHAMBLERS[k % SHAMBLERS.length]}-walk`, startFrame: k % 2 }), route, p: Math.random() * route.length, speed: (7 + Math.random() * 6) / T, down: 0 };
    }) : [];
    // What is left of the squad, at the spots soldiers hold nearest the line (or in the street there, on a map with none).
    const far = (p: number[]) => Math.hypot(p[0] - this.home.x, p[1] - this.home.y);
    const spots = (m.data.slots ?? []).map(([x, y]) => [(x + 0.5) * T, (y + 0.5) * T]).sort((p, q) => far(p) - far(q)), picked: number[][] = [];
    for (const sp of spots) if (picked.length < at.squad && picked.every((p) => Math.hypot(p[0] - sp[0], p[1] - sp[1]) > 3 * T)) picked.push(sp);
    while (picked.length < at.squad) picked.push([this.home.x + (picked.length - at.squad / 2) * 2 * T, this.home.y]);
    this.squad = picked.map(([x, y], k) => ({ s: this.add.sprite(x, y, 'sprites').setDepth(3).play({ key: `${SQUAD[k]}-idle-2`, startFrame: k % 2 }), kind: SQUAD[k], x, y, cool: 1 + Math.random() * 3 }));
    this.tracers = this.add.graphics().setDepth(2.5).setBlendMode('ADD');
    this.shots = [];
    // A helicopter going over now and then, high up, leaving.
    const img = (key: string, depth: number) => this.add.image(0, 0, key).setDepth(depth).setVisible(false);
    this.heli = { shadow: img('fx-heli', 1.45).setTint(0x000000).setAlpha(0.25), body: img('fx-heli', 11), rotors: [img('fx-rotor-blur', 11.1), img('fx-rotor-blur', 11.1)], beacon: img('fx-glow', 11.2).setBlendMode('ADD').setTint(0xff3020), t: -(8 + Math.random() * 10), x: 0, y: 0, a: 0, len: 0 };
    this.heliSize = S;
    // Ash coming down over it all, and a few embers, as many as the quality allows.
    this.ash = Array.from({ length: profile.settings.quality === 'low' ? 24 : 60 }, () => {
      const ember = Math.random() < 0.15;
      return {
        img: this.add.image(0, 0, 'fx-px').setDepth(12).setTint(ember ? 0xff8a40 : [0x8f8a82, 0x6f6b66, 0xb8b2a6][(Math.random() * 3) | 0]).setBlendMode(ember ? 'ADD' : 'NORMAL'),
        u: Math.random(), v: Math.random(), vu: 0.008 + Math.random() * 0.02, vv: 0.015 + Math.random() * 0.035, size: ember ? 1.5 + Math.random() : 1.5 + Math.random() * 2, ember, ph: Math.random() * 6.3,
      };
    });
    cam.setZoom(this.zoom());
    this.root = document.getElementById('menu')!;
    this.root.hidden = false;
    this.root.classList.remove('leaving');
    const refit = () => this.fit();
    // A phone reports its size late (on load, after a turn, as the address bar settles): measure again as each arrives.
    const later = () => { for (const ms of [100, 400, 1000]) setTimeout(refit, ms); };
    addEventListener('resize', refit);
    addEventListener('orientationchange', later);
    visualViewport?.addEventListener('resize', refit);
    document.fonts?.ready.then(refit);
    later();
    this.events.once('shutdown', () => { this.root.replaceChildren(); this.root.hidden = true; removeEventListener('resize', refit); removeEventListener('orientationchange', later); visualViewport?.removeEventListener('resize', refit); });
    this.show(this.open);
    music('menu');
    // Baking the thumbnails (scripts/thumbs.ts): every map painted, with blood and without, handed to the script.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('thumbs')) {
      const out: Record<string, string> = {};
      for (const blood of [true, false]) for (const m of MAPS) { profile.settings.gore = blood ? 'normal' : 'none'; out[`${m.id}-${blood}`] = this.thumbnail(m.id).toDataURL('image/webp', 0.9); }
      Object.assign(window, { thumbs: out });
    }
    stopLoading();
  }

  /** A little farther out than a fight starts (it shows 480 pixels of map top to bottom), never past the map's edges. */
  zoom() { const { width: W, height: H } = this.scale; return Math.max(H / 560, W / this.mapW, H / this.mapH); }

  /** The view drifts slowly round where the line is held, never off the map. */
  update(time: number, delta: number) {
    const t = time / 1000, dt = Math.min(0.1, delta / 1000), cam = this.cameras.main, z = this.zoom(), vw = this.scale.width / z, vh = this.scale.height / z;
    const fit = (c: number, view: number, size: number) => (view >= size ? size / 2 : Math.max(view / 2, Math.min(size - view / 2, c)));
    cam.setZoom(z).centerOn(fit(this.home.x + Math.sin(t / 23) * 180, vw, this.mapW), fit(this.home.y + Math.cos(t / 31) * 120, vh, this.mapH));
    this.animate?.(dt);
    this.air?.step(dt);
    const T = this.tile, w = this.gw, centre = (i: number) => [((i % w) + 0.5) * T, (Math.floor(i / w) + 0.5) * T];
    const again = (z2: Walker) => { z2.route = this.routes[(Math.random() * this.routes.length) | 0]; z2.p = 0; };
    for (const z2 of this.walkers) {
      if (z2.down > 0) {
        // Shot: lying where it fell a while, fading, then another starts down a route.
        z2.down -= dt;
        z2.s.setAlpha(Math.min(1, z2.down));
        if (z2.down <= 0) { again(z2); z2.s.setAlpha(1).clearTint().anims.resume(); }
        continue;
      }
      z2.p += z2.speed * dt;
      if (z2.p >= z2.route.length - 1) again(z2); // into the safe zone: another comes
      const r = z2.route, k = Math.floor(z2.p), u = z2.p - k, [ax, ay] = centre(r[k]), [bx, by] = centre(r[Math.min(r.length - 1, k + 1)]), [fx, fy] = centre(r[Math.min(r.length - 1, k + 3)]);
      z2.s.setPosition(ax + (bx - ax) * u, ay + (by - ay) * u).setRotation(Math.atan2(fy - ay, fx - ax) + Math.sin(t * 1.7 + z2.speed * 99) * 0.25);
    }
    this.fire(dt);
    this.fly(t, dt);
    const v = cam.worldView;
    for (const f of this.ash) {
      f.u = (f.u + f.vu * dt + 1) % 1;
      f.v += f.vv * dt;
      if (f.v > 1.02) { f.v = -0.02; f.u = Math.random(); }
      f.img.setPosition(v.x + (f.u + Math.sin(t * 0.8 + f.ph) * 0.01) * v.width, v.y + f.v * v.height).setScale(f.size / cam.zoom)
        .setAlpha(f.ember ? 0.5 + 0.4 * Math.sin(t * 7 + f.ph) : 0.55);
    }
  }

  /** The squad: each, now and then, shoots at the nearest zombie in reach; some go down. */
  fire(dt: number) {
    this.tracers.clear();
    this.shots = this.shots.filter((s) => (s.t -= dt) > 0);
    for (const s of this.shots) this.tracers.lineStyle(1.5, 0xffd890, s.t / 0.08).lineBetween(s.x0, s.y0, s.x1, s.y1);
    for (const g of this.squad) {
      if ((g.cool -= dt) > 0) continue;
      let best: Walker | undefined, near = 220;
      for (const w of this.walkers) { const d = Math.hypot(w.s.x - g.x, w.s.y - g.y); if (!w.down && d < near) { near = d; best = w; } }
      if (!best) { g.cool = 0.5; continue; }
      g.cool = 0.8 + Math.random() * 2.4;
      const target = best, d = ((Math.round(Math.atan2(target.s.y - g.y, target.s.x - g.x) / (Math.PI / 4)) % 8) + 8) % 8;
      g.s.play(`${g.kind}-shoot-${d}`);
      this.time.delayedCall(260, () => g.s.play(`${g.kind}-idle-${d}`));
      this.shots.push({ x0: g.x, y0: g.y, x1: target.s.x + (Math.random() - 0.5) * 6, y1: target.s.y + (Math.random() - 0.5) * 6, t: 0.08 });
      if (Math.random() < 0.35) {
        target.down = 3;
        target.s.anims.pause();
        target.s.setTint(0x6a6560);
        if (profile.settings.gore !== 'none') {
          const splat = this.add.image(target.s.x, target.s.y, 'sprites', `splat/${(Math.random() * 3) | 0}`).setDepth(1.5).setRotation(Math.random() * 6.3);
          this.tweens.add({ targets: splat, alpha: 0, delay: 4000, duration: 4000, onComplete: () => splat.destroy() });
        }
      }
    }
  }

  /** The helicopter: away for a while, then across the view high up and out the far side, its shadow on the city. */
  fly(t: number, dt: number) {
    const h = this.heli!, v = this.cameras.main.worldView, SIZE = 1.35 * this.heliSize, SPEED = 240; // as big as the camp's, lifted
    if ((h.t += dt) < 0) return;
    if (h.len === 0) {
      // Off it goes: in from one side of the view, out the far side, a little uphill (north, away).
      const east = Math.random() < 0.5;
      h.a = east ? -0.3 - Math.random() * 0.3 : Math.PI + 0.3 + Math.random() * 0.3;
      h.len = Math.hypot(v.width, v.height) + 400;
      h.x = v.centerX - (Math.cos(h.a) * h.len) / 2;
      h.y = v.centerY + Math.random() * v.height * 0.3 - (Math.sin(h.a) * h.len) / 2;
      play('heli', 0.35);
    }
    const along = h.t * SPEED, x = h.x + Math.cos(h.a) * along, y = h.y + Math.sin(h.a) * along;
    const parts = [h.body, h.shadow, h.beacon, ...h.rotors];
    if (along > h.len) { for (const p of parts) p.setVisible(false); h.t = -(25 + Math.random() * 30); h.len = 0; return; }
    for (const p of parts) p.setVisible(true);
    h.body.setPosition(x, y).setRotation(h.a).setScale(SIZE / HELI_RES);
    h.shadow.setPosition(x + 70, y + 44).setRotation(h.a).setScale((0.9 * this.heliSize) / HELI_RES);
    h.rotors.forEach((r, k) => { const at = (k ? -28 : 26) * SIZE; r.setPosition(x + Math.cos(h.a) * at, y + Math.sin(h.a) * at).setScale(SIZE / HELI_RES); });
    h.beacon.setPosition(x - Math.cos(h.a) * 4 * SIZE, y - Math.sin(h.a) * 4 * SIZE).setScale(SIZE * 0.45).setAlpha((t * 2.2) % 1 < 0.15 ? 0.9 : 0);
  }

  /** Changes screen: a wipe across between two different ones (not on the first, nor redrawing the same one). */
  show(screen: Screen): void {
    const was = this.current;
    this.current = screen;
    if (was && was !== screen && screen !== 'tree' && !(BINDER.includes(was as Page) && BINDER.includes(screen as Page)) && !loadingActive() && this.root.childElementCount) wipe(() => this.showNow(screen));
    else this.showNow(screen);
  }
  current?: Screen;

  showNow(screen: Screen): void {
    if (screen === 'tree') return whileLoading(async () => { const { skillWeb } = await import('./tree.ts'); if (this.current === 'tree') skillWeb(this, this.root, () => this.show('save')); }); // fetched when first opened
    if ((screen === 'new' || screen === 'load') && !loadingActive() && saves().some((s) => s && !THUMBS.has(`${cityOf(s).id}-${profile.settings.gore !== 'none'}`)))
      return whileLoading(() => this.showNow(screen));
    const panel = { menu: () => this.main(), new: () => this.slots('new'), load: () => this.slots('load'), save: () => this.save(), stats: () => this.stats(), settings: () => this.settings(), debug: () => this.debug(), notes: () => this.notes(), story: () => this.storyLog(), medals: () => this.medals(), manual: () => this.manual() }[screen]();
    this.root.replaceChildren(...[BINDER.includes(screen as Page) ? this.binder(screen as Page, panel as HTMLElement) : panel].flat()); // each panel slides in (CSS)
    this.fit();
  }

  /** The main menu scaled down whole to fit a short screen (a phone on its side), never squashed: its paper would
   *  slide under the next. */
  fit() {
    const main = this.root.querySelector<HTMLElement>('.main');
    if (!main) return;
    main.style.zoom = '';
    const cs = getComputedStyle(this.root), room = this.root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), need = main.scrollHeight;
    const base = matchMedia('(pointer: coarse)').matches ? 0.8 : 1; // a phone: a fifth smaller, the menu took too much of the screen
    const z = need * base > room ? Math.max(0.5, room / need) : base;
    if (z !== 1) main.style.zoom = String(z);
  }

  /** The binder: Settings, Medals and the Field manual as pages behind index tabs, rings down its spine. */
  binder(page: Page, inner: HTMLElement) {
    const [bw, bh, bd] = noteTag('BACK', '#c9a86a', '#9c7f48', '#2e2a22');
    const tabs = BINDER.map((p) => {
      const [label, col, dark] = BINDER_TABS[p], [w, h, d] = indexTab(label, col, dark, () => p === page), b = pixelButton(label, w, h, d, () => this.show(p), 'tab');
      b.setAttribute('aria-pressed', String(p === page));
      return b;
    });
    return el('div', { className: 'binder', ariaLabel: 'Binder' },
      el('div', { className: 'rings', ariaHidden: 'true' }, ...Array.from({ length: 5 }, () => pixIcon('ring', 2))),
      el('div', { className: 'bhead' }, pixelButton('Back', bw, bh, bd, () => this.show(this.binderFrom), 'tag'), el('div', { className: 'tabs' }, ...tabs)),
      el('div', { className: 'page' }, inner));
  }

  /** Fades the menu out and the city in. */
  play(map: string) {
    startLoading();
    this.root.classList.add('leaving');
    this.cameras.main.fadeOut(350);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('game', { map }));
  }

  head(title: string, back: Screen) {
    return el('div', { className: 'head' }, button('Back', () => this.show(back)), el('h2', {}, title));
  }

  main(): HTMLElement[] {
    const all = saves(), k = lastPlayed(all), last = all[k], unread = NEWEST > seen(), at = standing(last), intro = this.intro;
    this.intro = false;
    const panel = el('div', { className: `panel main${intro ? ' intro' : ''}` },
      el('h1', { className: 'logo', ariaLabel: 'We Might As Well Die Trying' }, stamp('WE MIGHT AS WELL', 4, ['#b9b08e', '#a39a7a'], 3), stamp('DIE TRYING', 8, ['#c9473a', '#a8352b'], 7)),
      el('p', { className: 'tagline' }, `Day ${at.day} · ${at.behind ? `${at.behind.toLocaleString('en-US')} left behind` : 'hold the line'}`),
      // Straight back into the save played last: its dossier, a pip for each city (lost, the one it is on, to come).
      ...(last ? [pixelButton(`Continue: ${last.name}, ${summary(last)}`, 196, 66,
        dossier(last.name, MAPS.map((m, i) => (last.cleared[m.id] ? 'held' : i === at.next ? 'next' : '')), `${last.chips} chips   ${MAPS.filter((m) => last.cleared[m.id]).length}/${MAPS.length} cities`, at.day,
          MEDALS.filter((m) => last.medals[m.id]).sort((a, b) => last.medals[a.id] - last.medals[b.id]).map((m) => m.ribbon)),
        () => { open(k); this.show('save'); }, 'dossier')] : []),
      el('div', { className: 'pair' },
        pixelButton('New save', 96, 44, last ? folder('NEW SAVE', '#4a5032', '#2e3220', 3) : folder('NEW SAVE', '#9c2f28', '#5e1d18', 3), () => this.show('new')),
        pixelButton('Load save', 96, 44, folder('LOAD SAVE', '#2f3a54', '#1c2333', 8), () => this.show('load'))),
      // Settings, and beside it the last save's medals and field manual as post-its.
      el('div', { className: 'tags' },
        pixelButton('Settings', 57, 48, stickyNote(), () => { this.binderFrom = 'menu'; this.show('settings'); }, 'sticky'),
        ...(last ? [
          pixelButton('Medals', ...medalNote(), () => { open(k); this.binderFrom = 'menu'; this.show('medals'); }, 'sticky'),
          pixelButton('Field manual', ...manualNote(), () => { open(k); this.binderFrom = 'menu'; this.show('manual'); }, 'sticky')] : [])),
    );
    [...panel.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    if (intro) setTimeout(() => play('thud', 0.5), 700); // the title landing
    // On the right: the latest patch notes, as a clipping.
    const [cw, ch, draw] = clipping(notes[0]?.title ?? 'Patch notes', NEWEST.slice(0, 10), unread);
    const aside = el('div', { className: `aside${intro ? ' intro' : ''}` }, pixelButton(unread ? 'Patch notes: something new' : 'Patch notes', cw, ch, draw, () => this.show('notes')));
    // The sound, on or off, and which build this is.
    const s = profile.settings, mute = el('button', { type: 'button', className: 'icon', ariaLabel: 'Sound', ariaPressed: String(s.master > 0) }, speaker(s.master > 0));
    mute.onclick = () => {
      if (s.master > 0) { try { localStorage.setItem(UNMUTE, String(s.master)); } catch { /* storage blocked: back on at 80% */ } s.master = 0; }
      else { let v = 0.8; try { v = Number(localStorage.getItem(UNMUTE)) || 0.8; } catch { /* the same */ } s.master = v; }
      persist(); retune();
      mute.ariaPressed = String(s.master > 0);
      mute.replaceChildren(speaker(s.master > 0));
    };
    return [panel, aside, el('div', { className: 'foot' }, buildTag('Build'), mute)];
  }

  /** What changed in each update, newest first. Opening them clears the icon's dot. */
  notes(): HTMLElement {
    try { localStorage.setItem(SEEN, NEWEST); } catch { /* storage blocked: the dot stays */ }
    return el('div', { className: 'panel notes book' }, this.head('Patch notes', 'menu'),
      ...notes.map((n) => el('section', {}, el('h3', {}, n.title), el('small', {}, `${n.date} PHT`), el('ul', {}, ...n.notes.map((line) => el('li', {}, line))))));
  }

  /** The slots, to start a new save in or to load one from. Loading also offers export, delete and import. */
  slots(mode: 'new' | 'load'): HTMLElement {
    const again = () => this.show(mode);
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    let into = 0;
    file.onchange = async () => {
      const text = await file.files?.[0]?.text();
      file.value = '';
      const save = text === undefined ? undefined : parse(text);
      if (!save) return ask('Not a save', 'That file is not a Die Trying save.', [{ label: 'OK', act: () => {} }]);
      open(into, save);
      again();
    };
    const pips = (s: Save) => MAPS.map((m, i) => (s.cleared[m.id] ? 'held' : i === MAPS.findIndex((x) => !s.cleared[x.id]) ? 'next' : '') as 'held' | 'next' | '');
    const line = (s: Save) => `${s.chips} chips  ${MAPS.filter((m) => s.cleared[m.id]).length}/${MAPS.length}  ${DIFFICULTY[s.difficulty].name.toUpperCase()}`;
    const photo = (s: Save) => this.thumbnail(cityOf(s).id);
    const date = (s: Save) => new Date(s.played).toISOString().slice(0, 10);
    const row = (s: Save | undefined, k: number) => {
      if (mode === 'new') {
        const b = pixelButton(s ? `Slot ${k + 1}: overwrite ${s.name}` : `Slot ${k + 1}: empty`, 214, 68, slotFolder(s
          ? { slot: k + 1, title: s.name, line: line(s), pips: pips(s), kind: 'danger', note: ['WILL BE', 'LOST!'], noteInk: '#8a2a20', photo: photo(s) }
          : { slot: k + 1, title: 'Empty', line: 'Nothing saved here', kind: 'empty', note: ['START', 'HERE'] }), () => {
          // How hard, then into the new save.
          // Then the drill at Site 9, or straight to the war board.
          const tutorial = (d: Difficulty) => ask('Play the tutorial?', 'A short drill at a military research facility: every control, one at a time, the fight paused while you read. New to the game? Play it.', [
            { label: 'Play the tutorial', go: true, act: () => { open(k, fresh(`Save ${k + 1}`, d)); this.play('drill'); } },
            { label: 'Skip it', act: () => { const s = fresh(`Save ${k + 1}`, d); s.tutorialDone = true; open(k, s); this.show('save'); } },
          ]);
          const start = () => ask('How hard?', 'Pick a difficulty for this save. It stays with the save.', [
            ...(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => ({ label: DIFFICULTY[d].name, note: DIFFICULTY[d].desc, go: d === 'normal', act: () => tutorial(d) })),
            { label: 'Cancel', act: () => {} },
          ]);
          if (!s) return start();
          ask('Start over?', `"${s.name}" (${summary(s)}) in Slot ${k + 1} will be gone. Export it first if you might want it back.`, [
            { label: 'Start over', go: true, act: start },
            { label: 'Keep it', act: () => {} },
          ]);
        });
        return el('div', { className: 'slotrow' }, b);
      }
      if (!s) {
        const b = pixelButton(`Slot ${k + 1}: empty`, 214, 68, slotFolder({ slot: k + 1, title: 'Empty', line: 'Nothing saved here', kind: 'empty', note: ['NO', 'SAVE'] }), () => {});
        b.disabled = true;
        return el('div', { className: 'slotrow' }, b, el('div', { className: 'tags' }, tagNote('IMPORT', '#9ad0e0', '#7ab4c8', '#1c3a48', () => { into = k; file.click(); })));
      }
      return el('div', { className: 'slotrow' },
        pixelButton(`${s.name}, ${summary(s)}`, 214, 68, slotFolder({ slot: k + 1, title: s.name, line: line(s), pips: pips(s), kind: 'save', note: ['PLAYED', date(s)], photo: photo(s) }), () => { open(k); this.show('save'); }),
        el('div', { className: 'tags' },
          tagNote('EXPORT', '#9ad0e0', '#7ab4c8', '#1c3a48', () => exportSave(s)),
          tagNote('DELETE', '#e59aa6', '#c97a87', '#4a1e28', () => ask('Delete this save?', `"${s.name}" (${summary(s)}). This cannot be undone.`, [
            { label: 'Delete', go: true, act: () => {
              remove(k);
              if (profile.slot === k) profile.save = fresh(`Save ${k + 1}`); // not written until played
              again();
            } },
            { label: 'Keep it', act: () => {} },
          ]))));
    };
    return el('div', { className: 'panel slots' }, this.head(mode === 'new' ? 'New save' : 'Load save', 'menu'), ...saves().map(row), file);
  }

  /** Inside a save: its cities on the war-room board (game/board.ts), with the skill tree, the story and settings on it. */
  save(): HTMLElement {
    return board({
      play: (id) => this.play(id),
      back: () => this.show('menu'),
      tree: () => this.show('tree'),
      story: () => this.show('story'),
      settings: () => { this.binderFrom = 'save'; this.show('settings'); },
      manual: () => { this.binderFrom = 'save'; this.show('manual'); },
      thumb: (id) => this.thumbnail(id),
    });
  }

  /** A small picture of a map: painted as in the game, cropped to the stretch where the line gets held, with the
   *  ways in marked red. Kept, and the full-size painting let go. */
  thumbnail(id: string) {
    const blood = profile.settings.gore !== 'none', cached = THUMBS.get(`${id}-${blood}`);
    if (cached) return cached;
    const m = MAPS.find((x) => x.id === id)!, data = half(m.data), grid = new Grid(data), key = `thumb-${id}-${blood}`;
    paintMap(this, data, grid, key, blood);
    const art = this.textures.get(key).getSourceImage() as HTMLCanvasElement, T = grid.tile, W = grid.w * T, H = grid.h * T;
    const z = Math.max(THUMB_W / W, THUMB_H / H), g = grid.goals;
    // The same spot the game opens on: halfway between the middle of the map and the safe zone.
    const gx = (g.reduce((n, i) => n + (i % grid.w), 0) / g.length + 0.5) * T, gy = (g.reduce((n, i) => n + Math.floor(i / grid.w), 0) / g.length + 0.5) * T;
    const sx = Math.max(0, Math.min(W - THUMB_W / z, (gx + W / 2) / 2 - THUMB_W / z / 2)), sy = Math.max(0, Math.min(H - THUMB_H / z, (gy + H / 2) / 2 - THUMB_H / z / 2));
    const out = el('canvas', { width: THUMB_W, height: THUMB_H }), c = out.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(art, sx, sy, THUMB_W / z, THUMB_H / z, 0, 0, THUMB_W, THUMB_H);
    c.fillStyle = 'rgba(201, 71, 58, 0.85)';
    for (const i of grid.spawns) c.fillRect(((i % grid.w) * T - sx) * z, (Math.floor(i / grid.w) * T - sy) * z, Math.ceil(T * z), Math.max(2, Math.ceil(T * z)));
    this.textures.remove(key); // only the thumbnail is kept
    THUMBS.set(`${id}-${blood}`, out);
    return out;
  }

  /** The save's medals: each pinned with its name and what earns it, grey until earned. */
  medals(): HTMLElement {
    const got = profile.save.medals;
    const rows = MEDALS.map((m) => el('div', { className: `entry${got[m.id] ? '' : ' locked'}` },
      pixelCanvas(9, 13, (p) => medal(p, 1, 0, m.ribbon, !!got[m.id])),
      el('div', {}, el('b', {}, m.name), el('p', {}, m.desc), el('small', {}, got[m.id] ? `Earned ${new Date(got[m.id]).toISOString().slice(0, 10)}` : 'Not yet'))));
    return el('div', { className: 'panel book' }, el('h2', {}, `Medals · ${Object.keys(got).length}/${MEDALS.length}`), el('div', { className: 'entries' }, ...rows));
  }

  /** The save's field manual: a page for every zombie and soldier, filled in once met in a fight. */
  manual(): HTMLElement {
    const met = new Set(profile.save.met);
    const page = (id: string, frame: string, name: string, stats: string, note: string) => el('div', { className: `entry${met.has(id) ? '' : ' locked'}` },
      met.has(id) ? el('img', { src: icon(this, frame), alt: '' }) : el('span', { className: 'unknown' }, '?'),
      el('div', {}, el('b', {}, met.has(id) ? name : 'Not met yet'), ...(met.has(id) ? [el('small', {}, stats), el('p', {}, note)] : [el('p', {}, 'Meet it in a fight to fill in this page.')])));
    const zombies = ZOMBIE_KINDS.map((k, i) => { const z = ZOMBIES[i]; return page(k, `${k}-walk/0`, z.name, `HP ${z.hp} · speed ${z.speed} · a leak costs ${z.leak}`, ZOMBIE_NOTES[k] ?? ''); });
    const soldiers = Object.entries(UNITS).filter(([k]) => k !== 'turret').map(([k, u]) => page(k, `${k}-idle-6/0`, u.name, `HP ${u.hp}${u.range ? ` · range ${u.range}` : ''}${u.damage ? ` · damage ${u.damage}` : ''}`, NODE.get(k)?.desc ?? ''));
    // The memorial: everyone lost, the latest first.
    const fallen = [...profile.save.fallen].reverse().map((f) => el('li', {}, el('b', {}, f.name), ` · ${UNITS[f.kind as keyof typeof UNITS]?.name ?? f.kind} · ${f.kills} kill${f.kills === 1 ? '' : 's'} · ${f.city}, ${new Date(f.at).toISOString().slice(0, 10)}`));
    return el('div', { className: 'panel book' }, el('h2', {}, `Field manual · ${zombies.concat(soldiers).filter((e) => !e.classList.contains('locked')).length}/${zombies.length + soldiers.length}`),
      el('h3', {}, 'The horde'), el('div', { className: 'entries' }, ...zombies), el('h3', {}, 'Your soldiers'), el('div', { className: 'entries' }, ...soldiers),
      el('h3', {}, 'The weather'), el('ul', { className: 'memorial' }, ...MAPS.map((m) => el('li', {}, el('b', {}, m.name), ` · ${weatherLine(m.id)}`))),
      el('h3', {}, `The fallen · ${profile.save.fallen.length}`), fallen.length ? el('ul', { className: 'memorial' }, ...fallen) : el('p', {}, 'Nobody yet.'));
  }

  /** Every scene of the story in order; the ones this save has seen can be played again. */
  storyLog(): HTMLElement {
    const seen = new Set(profile.save.story.seen);
    const rows = order(story).map((id) => {
      const sc = story.scenes.find((x) => x.id === id)!, city = MAPS.find((x) => x.id === mapOf(id, story).id)!.name, kind = id === 'opening' ? 'Opening' : id === 'ending' ? 'Ending' : id.startsWith('before:') ? 'Before' : 'After';
      const b = pixelButton(seen.has(id) ? `${city}, ${kind}` : 'Not seen yet: clear the city before it to see it', 96, 56, filmFrame({ city, kind, day: `Day ${sc.day}`, seen: seen.has(id) }), () => this.replay(id));
      b.disabled = !seen.has(id);
      return b;
    });
    return el('div', { className: 'panel story' }, this.head('Story', 'save'), el('div', { className: 'reel' }, ...rows));
  }

  /** Plays a scene again from the Story log, its map shots over a painting of the city (half size, as the cards). */
  async replay(id: string) {
    const { playScene, pose } = await import('../story/player.ts'); // fetched when a scene first plays
    const m = MAPS.find((x) => x.id === mapOf(id, story).id)!, blood = profile.settings.gore !== 'none', key = `story-${m.id}`;
    const needs = story.scenes.find((x) => x.id === id)!.shots.some((s) => s.type === 'map');
    let art: HTMLCanvasElement | undefined, grid: Grid | undefined;
    if (needs) { const data = half(m.data); grid = new Grid(data); paintMap(this, data, grid, key, blood); art = this.textures.get(key).getSourceImage() as HTMLCanvasElement; }
    const T = grid?.tile ?? 16, g = grid?.goals ?? [], gw = grid?.w ?? 1;
    const home = { x: ((g.reduce((n, i) => n + (i % gw), 0) / Math.max(1, g.length) + 0.5) * T + (art?.width ?? 0) / 2) / 2, y: ((g.reduce((n, i) => n + Math.floor(i / gw), 0) / Math.max(1, g.length) + 0.5) * T + (art?.height ?? 0) / 2) / 2 };
    const VIEW = 180; // map pixels the picture shows at rest: as much as the fight shows, at this half size
    this.root.hidden = true;
    playScene({
      id, mode: profile.settings.story === 'short' ? 'short' : 'full',
      view: art && {
        live: false,
        frame: () => {},
        draw: (pen, camera, p, t, still) => {
          const at = pose(camera, p, t, still, home, VIEW, art!.height), vh = VIEW / at.f, vw = (vh * 320) / 136;
          pen.rect(0, 22, 320, 136, '#000000');
          pen.c.imageSmoothingEnabled = true;
          pen.c.drawImage(art!, at.x - vw / 2, at.y - vh / 2, vw, vh, 0, 22, 320, 136);
          pen.c.imageSmoothingEnabled = false;
        },
        end: () => { if (this.textures.exists(key)) this.textures.remove(key); },
      },
      done: () => { this.root.hidden = false; music('menu'); this.show('story'); },
    });
  }

  stats(): HTMLElement {
    const all = saves().flatMap((s) => (s ? [[s.name, s.stats] as const] : [])), total = noStats(), both = all.length > 1;
    for (const [, st] of all) for (const [f] of STATS) total[f] += st[f];
    const cell = (f: keyof Stats, st: Stats) => el('td', {}, f === 'time' ? clock(st[f]) : st[f].toLocaleString());
    const table = el('table', {},
      el('tr', {}, el('th'), ...all.map(([name]) => el('th', {}, name)), ...(both ? [el('th', {}, 'All')] : [])),
      ...STATS.map(([f, label]) => el('tr', {}, el('th', {}, label), ...all.map(([, st]) => cell(f, st)), ...(both ? [cell(f, total)] : []))));
    return el('div', { className: 'panel stats book' }, this.head('Statistics', 'settings'), all.length ? table : el('p', {}, 'No saves yet: start one and fight.'));
  }

  settings(): HTMLElement {
    return settingsSheet({ back: () => this.show(this.binderFrom), again: () => this.show('settings'), tags: [['Statistics', () => this.show('stats')], ['Debug', () => { this.note = ''; this.show('debug'); }]] });
  }

  /** Cheats, for testing: they change the save in use. */
  debug(): HTMLElement {
    const s = profile.save, cheat = (label: string, done: string, act: () => void) => button(label, () => { act(); persist(); this.note = done; this.show('debug'); });
    return el('div', { className: 'panel debug book' },
      this.head('Debug', 'settings'),
      el('p', { className: 'chips' }, `Save in use: ${s.name} · ${summary(s)}`),
      cheat('+1,000 chips', 'Added 1,000 chips.', () => (s.chips += 1000)),
      cheat('Unlock every skill', 'Every skill is owned, every level.', () => (s.skills = Object.fromEntries(NODES.map((n) => [n.id, n.max])))),
      cheat('Unlock every city', 'Every city is cleared.', () => MAPS.forEach((m) => (s.cleared[m.id] = true))),
      cheat('Show the war board tour again', 'The war board will point out its buttons next time it opens.', () => (s.boardTour = false)),
      // Every scene seen (in order, so the notebook fills in as it would), all of them to replay from Story.
      cheat('Unlock every cutscene', 'Every scene can be replayed from Story (they no longer play by themselves in this save).', () => order(story).forEach((id) => record(s.story, id))),
      cheat('Replay the story from the start', 'Every scene will play again, the notebook blank.', () => (s.story = noStory())),
      // The horde's routes: a test map to watch them on, with everything to hand, or drawn on every map this session.
      button('Route test map', () => this.play(DEBUG_MAP.id), 'go'),
      el('div', { className: 'row' }, el('span', {}, 'Show routes on every map'), el('div', { className: 'seg' },
        ...[false, true].map((on) => el('button', { type: 'button', textContent: on ? 'On' : 'Off', ariaPressed: String(debugView.routes === on), onclick: () => { debugView.routes = on; this.show('debug'); } })))),
      el('p', { className: 'note' }, this.note),
    );
  }
}
