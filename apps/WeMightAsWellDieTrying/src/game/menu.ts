// The main menu: the city from above, drifting slowly, with a few zombies shambling along its streets, under an HTML
// overlay: Play (pick a map), the skill web and settings.
import Phaser from 'phaser';
import { bake, load } from '../art/atlas.ts';
import { MAPS, persist, profile, unlocked } from '../meta/profile.ts';
import { NODES } from '../meta/progress.ts';
import { exportSave, fresh, parse, type Settings } from '../meta/save.ts';
import { el } from './hud.ts';
import { skillWeb } from './tree.ts';

export type Screen = 'menu' | 'maps' | 'tree' | 'settings';

/** Cities planned after the ones in MAPS, shown locked so the road ahead is visible. */
const COMING = ['Tokyo Shinjuku'];
const SHAMBLERS = ['normal', 'normal', 'normal', 'fast', 'bloater', 'armored', 'normal', 'tanky'];
/** Street lanes in the background picture's own pixels: [x0, y0, x1, y1] that a zombie walks along, either way. */
const LANES = [[-40, 330, 1450, 340], [-40, 400, 1450, 392], [-40, 365, 1450, 372], [255, -40, 245, 810], [1150, -40, 1140, 810]];
const BG_W = 1408, BG_H = 768;

interface Walker { s: Phaser.GameObjects.Sprite; lane: number[]; t: number; speed: number; dir: 1 | -1 }

export class Menu extends Phaser.Scene {
  open: Screen = 'menu';
  bg!: Phaser.GameObjects.Image;
  walkers: Walker[] = [];
  root!: HTMLElement;

  constructor() { super('menu'); }

  init(data: { open?: Screen }) { this.open = data.open ?? 'menu'; }

  preload() {
    load(this);
    if (!this.textures.exists('menu-bg')) this.load.image('menu-bg', 'menu-bg.jpg');
  }

  create() {
    bake(this);
    this.bg = this.add.image(0, 0, 'menu-bg');
    this.walkers = SHAMBLERS.map((kind, k) => ({
      s: this.add.sprite(0, 0, 'sprites').play({ key: `${kind}-walk`, startFrame: k % 2 }),
      lane: LANES[k % LANES.length], t: Math.random(), speed: 7 + Math.random() * 6, dir: k % 2 ? 1 : -1,
    }));
    this.root = document.getElementById('menu')!;
    this.root.hidden = false;
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
    const back = () => this.show('menu');
    if (screen === 'tree') return skillWeb(this, this.root, back);
    this.root.replaceChildren(screen === 'maps' ? this.maps(back) : screen === 'settings' ? this.settings(back) : this.main());
  }

  main(): HTMLElement {
    return el('div', { className: 'panel main' },
      el('h1', {}, 'We Might As Well', el('br'), el('span', {}, 'Die Trying')),
      el('p', { className: 'chips' }, `${profile.save.chips} chips`),
      el('button', { type: 'button', className: 'go', textContent: 'Play', onclick: () => this.show('maps') }),
      el('button', { type: 'button', textContent: 'Skill web', onclick: () => this.show('tree') }),
      el('button', { type: 'button', textContent: 'Settings', onclick: () => this.show('settings') }),
    );
  }

  maps(back: () => void): HTMLElement {
    const cleared = profile.save.cleared;
    return el('div', { className: 'panel maps' },
      el('h2', {}, 'Pick a city'),
      ...MAPS.map((m, k) => unlocked(k)
        ? el('button', { type: 'button', className: 'map', onclick: () => this.scene.start('game', { map: m.id }) }, m.name, el('small', {}, cleared[m.id] ? 'Cleared' : 'Not cleared yet'))
        : el('button', { type: 'button', className: 'map', disabled: true }, m.name, el('small', {}, `Clear ${MAPS[k - 1].name} to unlock`))),
      ...COMING.map((name) => el('button', { type: 'button', className: 'map', disabled: true }, name, el('small', {}, 'Coming later'))),
      el('button', { type: 'button', textContent: 'Back', onclick: back }),
    );
  }

  settings(back: () => void): HTMLElement {
    const s = profile.save.settings, again = () => this.show('settings');
    const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { s[k] = v; persist(); again(); };
    const choice = (label: string, k: 'gore' | 'quality', options: string[]) =>
      el('div', { className: 'row' }, el('span', {}, label), el('div', { className: 'seg' },
        ...options.map((o) => el('button', { type: 'button', textContent: o[0].toUpperCase() + o.slice(1), ariaPressed: String(s[k] === o), onclick: () => set(k, o as never) }))));
    const volume = (label: string, k: 'master' | 'sfx') => {
      const input = el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(s[k] * 100)), ariaLabel: label });
      input.onchange = () => { s[k] = Number(input.value) / 100; persist(); };
      return el('div', { className: 'row' }, el('span', {}, label), input);
    };
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.onchange = async () => {
      const text = await file.files?.[0]?.text();
      file.value = '';
      const save = text === undefined ? undefined : parse(text);
      if (!save) return alert('That file is not a Die Trying save.');
      const now = profile.save;
      if (!confirm(`Replace this progress (${now.chips} chips, ${now.owned.length} of ${NODES.length} skills) with the file's (${save.chips} chips, ${save.owned.length} skills)?`)) return;
      profile.save = save;
      persist();
      again();
    };
    const reset = () => {
      if (!confirm('Erase all progress: chips, skills and cleared cities? Export first if you might want it back.')) return;
      profile.save = fresh();
      persist();
      again();
    };
    return el('div', { className: 'panel settings' },
      el('div', { className: 'head' }, el('button', { type: 'button', textContent: 'Back', onclick: back }), el('h2', {}, 'Settings')),
      choice('Gore', 'gore', ['none', 'some', 'normal']),
      choice('Quality', 'quality', ['low', 'medium', 'high']),
      el('div', { className: 'row' }, el('span', {}, 'Left-handed'), el('div', { className: 'seg' },
        el('button', { type: 'button', textContent: 'Off', ariaPressed: String(!s.lefty), onclick: () => set('lefty', false) }),
        el('button', { type: 'button', textContent: 'On', ariaPressed: String(s.lefty), onclick: () => set('lefty', true) }))),
      volume('Master volume', 'master'),
      volume('Effects volume', 'sfx'),
      el('div', { className: 'row' }, el('span', {}, 'Progress'), el('div', { className: 'seg' },
        el('button', { type: 'button', textContent: 'Export', onclick: () => exportSave(profile.save) }),
        el('button', { type: 'button', textContent: 'Import', onclick: () => file.click() }),
        el('button', { type: 'button', className: 'danger', textContent: 'Reset', onclick: reset }))),
      file,
    );
  }
}
