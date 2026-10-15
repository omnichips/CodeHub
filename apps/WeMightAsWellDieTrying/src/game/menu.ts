// The main menu: the city from above, drifting slowly, with a few zombies shambling along its streets, under an HTML
// overlay. Main: new save, load a save, statistics, settings. Inside a save: its cities and its skill tree.
import Phaser from 'phaser';
import { bake, load } from '../art/atlas.ts';
import { MAPS, open, perSoldier, persist, profile, saves, unlocked } from '../meta/profile.ts';
import { NODES } from '../meta/progress.ts';
import { Grid } from '../sim/grid.ts';
import { BODIES, exportSave, fresh, noStats, parse, remove, type Save, type Settings, type Stats } from '../meta/save.ts';
import { el } from './hud.ts';
import { paintMap } from './mapart.ts';
import { play } from './sound.ts';
import { skillWeb } from './tree.ts';

export type Screen = 'menu' | 'new' | 'load' | 'save' | 'tree' | 'stats' | 'settings' | 'debug';

const SHAMBLERS = ['normal', 'normal', 'normal', 'fast', 'bloater', 'armored', 'normal', 'tanky'];
/** Street lanes in the background picture's own pixels: [x0, y0, x1, y1] that a zombie walks along, either way. */
const LANES = [[-40, 330, 1450, 340], [-40, 400, 1450, 392], [-40, 365, 1450, 372], [255, -40, 245, 810], [1150, -40, 1140, 810]];
const BG_W = 1408, BG_H = 768;
const STATS: [keyof Stats, string][] = [['runs', 'Runs'], ['wins', 'Wins'], ['kills', 'Kills'], ['leaks', 'Leaks'], ['chips', 'Chips earned'], ['time', 'Time fighting']];

const THUMB_W = 240, THUMB_H = 150;
const THUMBS = new Map<string, HTMLCanvasElement>(); // `${map}-${blood}`: painted once a session

interface Walker { s: Phaser.GameObjects.Sprite; lane: number[]; t: number; speed: number; dir: 1 | -1 }

const button = (text: string, onclick: () => void, className = '') => el('button', { type: 'button', textContent: text, className, onclick });
const LEVELS = NODES.reduce((n, x) => n + x.max, 0);
const summary = (s: Save) => `${s.chips} chips · ${MAPS.filter((m) => s.cleared[m.id]).length}/${MAPS.length} cities · ${Object.values(s.skills).reduce((a, b) => a + b, 0)}/${LEVELS} skills`;
const clock = (t: number) => `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;

export class Menu extends Phaser.Scene {
  open: Screen = 'menu';
  bg!: Phaser.GameObjects.Image;
  walkers: Walker[] = [];
  root!: HTMLElement;
  note = ''; // a line saying what the last cheat did

  constructor() { super('menu'); }

  init(data: { open?: Screen }) { this.open = data.open ?? 'menu'; }

  preload() {
    load(this);
    if (!this.textures.exists('menu-bg')) this.load.image('menu-bg', 'menu-bg.jpg');
  }

  create() {
    bake(this);
    this.cameras.main.fadeIn(400);
    this.bg = this.add.image(0, 0, 'menu-bg');
    this.walkers = SHAMBLERS.map((kind, k) => ({
      s: this.add.sprite(0, 0, 'sprites').play({ key: `${kind}-walk`, startFrame: k % 2 }),
      lane: LANES[k % LANES.length], t: Math.random(), speed: 7 + Math.random() * 6, dir: k % 2 ? 1 : -1,
    }));
    this.root = document.getElementById('menu')!;
    this.root.hidden = false;
    this.root.classList.remove('leaving');
    this.events.once('shutdown', () => { this.root.replaceChildren(); this.root.hidden = true; });
    this.show(this.open);
  }

  /** The picture covers the screen with room to spare, and drifts across that spare room; the zombies ride along. */
  update(time: number, delta: number) {
    const { width: W, height: H } = this.scale, z = Math.max(W / BG_W, H / BG_H) * 1.12;
    const t = time / 1000, x = W / 2 + Math.sin(t / 23) * (BG_W * z - W) / 2, y = H / 2 + Math.cos(t / 31) * (BG_H * z - H) / 2;
    this.bg.setScale(z).setPosition(x, y);
    for (const w of this.walkers) {
      const [x0, y0, x1, y1] = w.lane, len = Math.hypot(x1 - x0, y1 - y0);
      w.t += (w.dir * w.speed * delta) / 1000 / len;
      if (w.t > 1 || w.t < 0) w.t = w.dir > 0 ? 0 : 1; // off the edge: back in at the other end
      const wobble = Math.sin(t * 1.7 + w.speed) * 0.25, ang = Math.atan2(y1 - y0, x1 - x0) + (w.dir > 0 ? 0 : Math.PI) + wobble;
      const px = x0 + (x1 - x0) * w.t, py = y0 + (y1 - y0) * w.t;
      w.s.setPosition(x + (px - BG_W / 2) * z, y + (py - BG_H / 2) * z).setRotation(ang).setScale(z * 1.7);
    }
  }

  show(screen: Screen): void {
    if (screen === 'tree') return skillWeb(this, this.root, () => this.show('save'));
    const panel = { menu: () => this.main(), new: () => this.slots('new'), load: () => this.slots('load'), save: () => this.save(), stats: () => this.stats(), settings: () => this.settings(), debug: () => this.debug() }[screen]();
    this.root.replaceChildren(...[panel].flat()); // each panel slides in (CSS)
  }

  /** Fades the menu out and the city in. */
  play(map: string) {
    this.root.classList.add('leaving');
    this.cameras.main.fadeOut(350);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('game', { map }));
  }

  head(title: string, back: Screen) {
    return el('div', { className: 'head' }, button('Back', () => this.show(back)), el('h2', {}, title));
  }

  main(): HTMLElement {
    return el('div', { className: 'panel main' },
      el('h1', {}, 'We Might As Well', el('br'), el('span', {}, 'Die Trying')),
      button('New save', () => this.show('new'), 'go'),
      button('Load save', () => this.show('load')),
      button('Statistics', () => this.show('stats')),
      button('Settings', () => this.show('settings')),
    );
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
      if (!save) return alert('That file is not a Die Trying save.');
      open(into, save);
      again();
    };
    const row = (s: Save | undefined, k: number) => {
      if (mode === 'new') return el('button', { type: 'button', className: 'slot', onclick: () => {
        if (s && !confirm(`Start over in this slot? "${s.name}" (${summary(s)}) will be gone. Export it first if you might want it back.`)) return;
        open(k, fresh(`Save ${k + 1}`));
        this.show('save');
      } }, s ? `Slot ${k + 1}: overwrite ${s.name}` : `Slot ${k + 1}: empty`, el('small', {}, s ? summary(s) : 'Start here'));
      if (!s) return el('div', { className: 'slotrow' }, el('button', { type: 'button', className: 'slot', disabled: true }, `Slot ${k + 1}: empty`, el('small', {}, 'Nothing saved here')),
        button('Import', () => { into = k; file.click(); }));
      return el('div', { className: 'slotrow' },
        el('button', { type: 'button', className: 'slot', onclick: () => { open(k); this.show('save'); } }, s.name, el('small', {}, `${summary(s)} · ${new Date(s.played).toLocaleDateString()}`)),
        button('Export', () => exportSave(s)),
        button('Delete', () => {
          if (!confirm(`Delete "${s.name}" (${summary(s)})? This cannot be undone.`)) return;
          remove(k);
          if (profile.slot === k) profile.save = fresh(`Save ${k + 1}`); // not written until played
          again();
        }, 'danger'));
    };
    return el('div', { className: 'panel slots' }, this.head(mode === 'new' ? 'New save' : 'Load save', 'menu'), ...saves().map(row), file);
  }

  /** Inside a save: its cities as a grid of cards, each with a picture of the map and how many zombies it sends per
   *  soldier you have; the skill tree in the top right corner. */
  save(): HTMLElement[] {
    const s = profile.save, thumbs: [string, HTMLCanvasElement][] = [];
    const cards = MAPS.map((m, k) => {
      const open = unlocked(k), thumb = el('canvas', { className: 'thumb', width: THUMB_W, height: THUMB_H });
      thumbs.push([m.id, thumb]);
      return el('button', { type: 'button', className: `map${s.cleared[m.id] ? ' cleared' : ''}`, disabled: !open, onclick: () => this.play(m.id) },
        thumb, el('i', { className: 'num' }, String(k + 1)),
        el('b', {}, m.name),
        el('small', {}, open ? `${s.cleared[m.id] ? 'Cleared' : 'Not cleared yet'} · ~${perSoldier(k)} per soldier` : `Clear ${MAPS[k - 1].name} to unlock`));
    });
    // The pictures are painted one a frame, so the screen shows at once and fills in.
    const next = () => {
      const [id, cv] = thumbs.shift() ?? [];
      if (!id || !cv!.isConnected) return;
      cv!.getContext('2d')!.drawImage(this.thumbnail(id), 0, 0);
      cv!.classList.add('ready');
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
    return [
      el('div', { className: 'panel maps' }, this.head(s.name, 'menu'), el('p', { className: 'chips' }, `${s.chips} chips`), el('div', { className: 'grid' }, ...cards)),
      button('Skill tree', () => this.show('tree'), 'go corner'),
    ];
  }

  /** A small picture of a map: painted as in the game, cropped to the stretch where the line gets held, with the
   *  ways in marked red. Kept, and the full-size painting let go. */
  thumbnail(id: string) {
    const blood = profile.settings.gore !== 'none', cached = THUMBS.get(`${id}-${blood}`);
    if (cached) return cached;
    const m = MAPS.find((x) => x.id === id)!, grid = new Grid(m.data), key = `map-${id}-${blood}`, had = this.textures.exists(key);
    paintMap(this, m.data, grid, key, blood);
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
    if (!had) this.textures.remove(key); // a big canvas: the game paints it again when it is played
    THUMBS.set(`${id}-${blood}`, out);
    return out;
  }

  stats(): HTMLElement {
    const all = saves().flatMap((s) => (s ? [[s.name, s.stats] as const] : [])), total = noStats(), both = all.length > 1;
    for (const [, st] of all) for (const [f] of STATS) total[f] += st[f];
    const cell = (f: keyof Stats, st: Stats) => el('td', {}, f === 'time' ? clock(st[f]) : st[f].toLocaleString());
    const table = el('table', {},
      el('tr', {}, el('th'), ...all.map(([name]) => el('th', {}, name)), ...(both ? [el('th', {}, 'All')] : [])),
      ...STATS.map(([f, label]) => el('tr', {}, el('th', {}, label), ...all.map(([, st]) => cell(f, st)), ...(both ? [cell(f, total)] : []))));
    return el('div', { className: 'panel stats' }, this.head('Statistics', 'menu'), all.length ? table : el('p', {}, 'No saves yet: start one and fight.'));
  }

  settings(): HTMLElement {
    const s = profile.settings, again = () => this.show('settings');
    const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { s[k] = v; persist(); again(); };
    const choice = (label: string, k: 'gore' | 'quality', options: string[]) =>
      el('div', { className: 'row' }, el('span', {}, label), el('div', { className: 'seg' },
        ...options.map((o) => el('button', { type: 'button', textContent: o[0].toUpperCase() + o.slice(1), ariaPressed: String(s[k] === o), onclick: () => set(k, o as never) }))));
    const volume = (label: string, k: 'master' | 'sfx') => {
      const input = el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(s[k] * 100)), ariaLabel: label });
      input.onchange = () => { s[k] = Number(input.value) / 100; persist(); play('rifleman'); }; // a shot to hear the level by
      return el('div', { className: 'row' }, el('span', {}, label), input);
    };
    return el('div', { className: 'panel settings' },
      this.head('Settings', 'menu'),
      choice('Gore', 'gore', ['none', 'some', 'normal']),
      choice('Quality', 'quality', ['low', 'medium', 'high']),
      // Fewer bodies lying about is lighter on a slow device.
      el('div', { className: 'row' }, el('span', {}, 'Dead bodies'), el('div', { className: 'seg' },
        ...BODIES.map((n) => el('button', { type: 'button', textContent: n ? String(n) : 'None', ariaPressed: String(s.bodies === n), onclick: () => set('bodies', n) })))),
      el('div', { className: 'row' }, el('span', {}, 'Left-handed'), el('div', { className: 'seg' },
        el('button', { type: 'button', textContent: 'Off', ariaPressed: String(!s.lefty), onclick: () => set('lefty', false) }),
        el('button', { type: 'button', textContent: 'On', ariaPressed: String(s.lefty), onclick: () => set('lefty', true) }))),
      volume('Master volume', 'master'),
      volume('Effects volume', 'sfx'),
      el('div', { className: 'row' }, el('span', {}, 'Cheats for testing'), el('div', { className: 'seg' }, button('Debug', () => { this.note = ''; this.show('debug'); }))),
    );
  }

  /** Cheats, for testing: they change the save in use. */
  debug(): HTMLElement {
    const s = profile.save, cheat = (label: string, done: string, act: () => void) => button(label, () => { act(); persist(); this.note = done; this.show('debug'); });
    return el('div', { className: 'panel settings' },
      this.head('Debug', 'settings'),
      el('p', { className: 'chips' }, `Save in use: ${s.name} · ${summary(s)}`),
      cheat('+1,000 chips', 'Added 1,000 chips.', () => (s.chips += 1000)),
      cheat('Unlock every skill', 'Every skill is owned, every level.', () => (s.skills = Object.fromEntries(NODES.map((n) => [n.id, n.max])))),
      cheat('Unlock every city', 'Every city is cleared.', () => MAPS.forEach((m) => (s.cleared[m.id] = true))),
      cheat('Replay the guided start', 'The guided start will run again on Main Street.', () => (s.tutorialDone = false)),
      el('p', { className: 'note' }, this.note),
    );
  }
}
