// The main menu: a ruined city from above (game/menucity.ts), burning and drifting slowly, a few zombies shambling along its streets, under an HTML
// overlay. Main: continue the last save, new save or load a save, settings (statistics inside). Inside a save: its cities and its skill tree.
import Phaser from 'phaser';
import { bake, load } from '../art/atlas.ts';
import { MAPS, lastPlayed, open, persist, profile, saves } from '../meta/profile.ts';
import { NODES } from '../meta/progress.ts';
import notes from '../data/patchnotes.json' with { type: 'json' };
import { Grid, type MapData } from '../sim/grid.ts';
import { exportSave, fresh, noStats, parse, remove, type Save, type Stats } from '../meta/save.ts';
import { el } from './hud.ts';
import { ambience } from './ambience.ts';
import { board } from './board.ts';
import { DEBUG_MAP, debugView } from './debugmap.ts';
import { drawn, paintMap } from './mapart.ts';
import { CITY_H, CITY_W, LANES, MENU_CITY } from './menucity.ts';
import { settingRows } from './settings.ts';
import { music } from './sound.ts';
import { skillWeb } from './tree.ts';
import { noStory, record, story } from '../story/record.ts';
import { playScene, pose } from '../story/player.ts';
import { order } from '../story/text.ts';
import { mapOf } from '../story/types.ts';

export type Screen = 'menu' | 'new' | 'load' | 'save' | 'tree' | 'stats' | 'settings' | 'debug' | 'notes' | 'story';

const SHAMBLERS = ['normal', 'normal', 'normal', 'fast', 'bloater', 'armored', 'normal', 'tanky'];
const STATS: [keyof Stats, string][] = [['runs', 'Runs'], ['wins', 'Wins'], ['kills', 'Kills'], ['leaks', 'Leaks'], ['chips', 'Chips earned'], ['time', 'Time fighting']];

const THUMB_W = 240, THUMB_H = 150;
const THUMBS = new Map<string, HTMLCanvasElement>(); // `${map}-${blood}`: painted once a session
/** A doubled map at half size, as it was designed: it looks the same in a thumbnail, for a quarter of the painting. */
const half = (m: MapData): MapData => ((m.scale ?? 1) < 2 ? m : {
  ...m, scale: m.scale! / 2, props: [], rows: m.rows.filter((_, y) => y % 2 === 0).map((r) => [...r].filter((_, x) => x % 2 === 0).join('')),
  slots: m.slots?.map(([x, y]) => [x >> 1, y >> 1]), decor: m.decor?.map((d) => ({ ...d, x: d.x / 2, y: d.y / 2 })),
});

interface Walker { s: Phaser.GameObjects.Sprite; lane: number[]; t: number; speed: number; dir: 1 | -1 }

const button = (text: string, onclick: () => void, className = '') => el('button', { type: 'button', textContent: text, className, onclick });
const LEVELS = NODES.reduce((n, x) => n + x.max, 0);
const summary = (s: Save) => `${s.chips} chips · ${MAPS.filter((m) => s.cleared[m.id]).length}/${MAPS.length} cities · ${Object.values(s.skills).reduce((a, b) => a + b, 0)}/${LEVELS} skills`;
/** The newest patch notes this device has opened (their date), so the icon can show when there are new ones. */
const SEEN = 'dietrying.notesSeen';
const seen = () => { try { return localStorage.getItem(SEEN) ?? ''; } catch { return ''; } };
const NEWEST = notes[0]?.date ?? '';
/** A page of notes, drawn in the text colour. */
function notesIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = '<path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h5" fill="none" stroke="currentColor" stroke-width="2"/>';
  return svg;
}
const clock = (t: number) => `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;

export class Menu extends Phaser.Scene {
  open: Screen = 'menu';
  walkers: Walker[] = [];
  root!: HTMLElement;
  note = ''; // a line saying what the last cheat did
  settingsFrom: Screen = 'menu'; // where Settings goes back to: the main menu or a save's cities

  constructor() { super('menu'); }

  init(data: { open?: Screen }) { this.open = data.open ?? 'menu'; }

  preload() { load(this); }

  create() {
    bake(this);
    this.cameras.main.fadeIn(400);
    const city = paintMap(this, MENU_CITY, new Grid(MENU_CITY), `menu-city-${profile.settings.gore !== 'none'}`, profile.settings.gore !== 'none');
    this.add.image(0, 0, city).setOrigin(0);
    ambience(this, drawn.get(city) ?? [], 40, 2); // bigger: the menu shows the city from farther off
    this.walkers = SHAMBLERS.map((kind, k) => ({
      s: this.add.sprite(0, 0, 'sprites').setDepth(2).setScale(1.7).play({ key: `${kind}-walk`, startFrame: k % 2 }),
      lane: LANES[k % LANES.length], t: Math.random(), speed: 7 + Math.random() * 6, dir: k % 2 ? 1 : -1,
    }));
    this.root = document.getElementById('menu')!;
    this.root.hidden = false;
    this.root.classList.remove('leaving');
    this.events.once('shutdown', () => { this.root.replaceChildren(); this.root.hidden = true; });
    this.show(this.open);
    music('menu');
  }

  /** The city covers the screen with room to spare, and the view drifts across that spare room. */
  update(time: number, delta: number) {
    const { width: W, height: H } = this.scale, z = Math.max(W / CITY_W, H / CITY_H) * 1.12, t = time / 1000;
    this.cameras.main.setZoom(z).centerOn(CITY_W / 2 - (Math.sin(t / 23) * (CITY_W * z - W)) / 2 / z, CITY_H / 2 - (Math.cos(t / 31) * (CITY_H * z - H)) / 2 / z);
    for (const w of this.walkers) {
      const [x0, y0, x1, y1] = w.lane, len = Math.hypot(x1 - x0, y1 - y0);
      w.t += (w.dir * w.speed * delta) / 1000 / len;
      if (w.t > 1 || w.t < 0) w.t = w.dir > 0 ? 0 : 1; // off the edge: back in at the other end
      const wobble = Math.sin(t * 1.7 + w.speed) * 0.25, ang = Math.atan2(y1 - y0, x1 - x0) + (w.dir > 0 ? 0 : Math.PI) + wobble;
      const px = x0 + (x1 - x0) * w.t, py = y0 + (y1 - y0) * w.t;
      w.s.setPosition(px, py).setRotation(ang);
    }
  }

  show(screen: Screen): void {
    if (screen === 'tree') return skillWeb(this, this.root, () => this.show('save'));
    const panel = { menu: () => this.main(), new: () => this.slots('new'), load: () => this.slots('load'), save: () => this.save(), stats: () => this.stats(), settings: () => this.settings(), debug: () => this.debug(), notes: () => this.notes(), story: () => this.storyLog() }[screen]();
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

  main(): HTMLElement[] {
    const all = saves(), k = lastPlayed(all), last = all[k], unread = NEWEST > seen();
    const icon = el('button', { type: 'button', className: 'icon', title: 'Patch notes', ariaLabel: unread ? 'Patch notes: something new' : 'Patch notes', onclick: () => this.show('notes') }, notesIcon());
    if (unread) icon.append(el('i', { className: 'dot' }));
    return [el('div', { className: 'corner' }, icon), el('div', { className: 'panel main' },
      el('h1', {}, 'We Might As Well', el('br'), el('span', {}, 'Die Trying')),
      // Straight back into the save played last.
      ...(last ? [el('button', { type: 'button', className: 'slot go', onclick: () => { open(k); this.show('save'); } }, `Continue: ${last.name}`, el('small', {}, summary(last)))] : []),
      el('div', { className: 'pair' }, button('New save', () => this.show('new'), last ? '' : 'go'), button('Load save', () => this.show('load'))),
      button('Settings', () => { this.settingsFrom = 'menu'; this.show('settings'); }),
    )];
  }

  /** What changed in each update, newest first. Opening them clears the icon's dot. */
  notes(): HTMLElement {
    try { localStorage.setItem(SEEN, NEWEST); } catch { /* storage blocked: the dot stays */ }
    return el('div', { className: 'panel notes' }, this.head('Patch notes', 'menu'),
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

  /** Inside a save: its cities on the war-room board (game/board.ts), with the skill tree, the story and settings on it. */
  save(): HTMLElement {
    return board({
      play: (id) => this.play(id),
      back: () => this.show('menu'),
      tree: () => this.show('tree'),
      story: () => this.show('story'),
      settings: () => { this.settingsFrom = 'save'; this.show('settings'); },
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

  /** Every scene of the story in order; the ones this save has seen can be played again. */
  storyLog(): HTMLElement {
    const seen = new Set(profile.save.story.seen);
    const name = (id: string) => {
      const m = MAPS.find((x) => x.id === mapOf(id, story).id)!;
      return id === 'opening' ? `Opening · ${m.name}` : id === 'ending' ? `Ending · ${m.name}` : `${m.name} · ${id.startsWith('before:') ? 'Before' : 'After'}`;
    };
    const rows = order(story).map((id) => {
      const sc = story.scenes.find((x) => x.id === id)!;
      return el('button', { type: 'button', className: 'slot', disabled: !seen.has(id), onclick: () => this.replay(id) },
        seen.has(id) ? name(id) : 'Not seen yet', el('small', {}, seen.has(id) ? `Day ${sc.day} · ${sc.time}` : 'Clear the city before it to see it'));
    });
    return el('div', { className: 'panel story' }, this.head('Story', 'save'), el('div', { className: 'list' }, ...rows));
  }

  /** Plays a scene again from the Story log, its map shots over a painting of the city (half size, as the cards). */
  replay(id: string) {
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
    return el('div', { className: 'panel stats' }, this.head('Statistics', 'settings'), all.length ? table : el('p', {}, 'No saves yet: start one and fight.'));
  }

  settings(): HTMLElement {
    return el('div', { className: 'panel settings' },
      this.head('Settings', this.settingsFrom),
      ...settingRows(() => this.show('settings')),
      el('div', { className: 'row' }, el('span', {}, 'Every save, side by side'), el('div', { className: 'seg' }, button('Statistics', () => this.show('stats')))),
      el('div', { className: 'row' }, el('span', {}, 'Cheats for testing'), el('div', { className: 'seg' }, button('Debug', () => { this.note = ''; this.show('debug'); }))),
      el('p', { className: 'note' }, `Build ${__BUILD__}`), // which version this device is running
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
