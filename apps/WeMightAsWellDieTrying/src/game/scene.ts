// The game screen: draws the World and turns touches and clicks into orders. All rules live in sim/.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { bake, icon, load } from '../art/atlas.ts';
import { NODE, PACE, payout, build, type Build, type Payout } from '../meta/progress.ts';
import { MAPS, persist, profile } from '../meta/profile.ts';
import type { MapData } from '../sim/grid.ts';
import { ambience } from './ambience.ts';
import { drawn, paintMap } from './mapart.ts';
import {
  PRIORITIES, ROADBLOCKS, STEP, STRUCTS, UNITS, USABLES, World, ZOMBIE_KINDS, ZOMBIES, indirect, support,
  type BlockKind, type Roadblock, type Soldier, type StructKind, type Structure, type UnitKind, type UsableKind,
} from '../sim/world.ts';
import { Hud, type Group } from './hud.ts';
import { hordeLevel, music, play } from './sound.ts';

/** The order things appear in the bar. Only what the skill web has unlocked is shown. */
const ORDER = [...Object.keys(UNITS).filter((k) => k !== 'turret'), 'plastic', 'wood', 'sandbags', 'car', 'cement', ...Object.keys(STRUCTS), ...Object.keys(USABLES)];
const QUALITY = { low: { corpses: 40, particles: 0.35 }, medium: { corpses: 120, particles: 0.7 }, high: { corpses: 300, particles: 1 } };
const CORPSE_LIFE = { none: 0, some: 12 * PACE, normal: 30 * PACE }; // seconds of fight before a corpse fades (as long on screen as before PACE)
const TUTORIAL = [
  'Drag a Rifleman up from the bar onto a street, or tap him and then tap the street.',
  'Tap him, then drag the round handle to aim his cone. Pull it farther out for a narrower, longer cone.',
  'Press Start when you are ready. They come from the far end of the street.',
  'Pause any time: you can still give orders while paused.',
  'To fall back, drag a soldier to where he should go. He walks there.',
  'Hold the line. Good luck.',
];
/** Milliseconds of fighting worked out per frame at most (5× needs 25 steps a frame at 60 fps). Past it a big fight on
 *  a slow device runs slower than the speed asked for, and still draws, rather than freezing up. */
const STEP_BUDGET = 25;
const MAX_ZOOM = 4;
const HUD_TOP = 56, HUD_BOTTOM = 104; // screen pixels the status row and the bar cover, until the HUD is there to measure
const LIFT = 36; // a finger drags things this far above itself, so it does not hide where they go
const GRAB = { touch: 34, mouse: 22 }; // how near (screen pixels) a soldier or his handle has to be to pick it up
const WALK = ZOMBIE_KINDS.map((k) => [`${k}-walk/0`, `${k}-walk/1`]);
const PIECES = new Set(['plastic', 'wood', 'sandbags', 'cement', 'police', 'wire', 'spikes']); // drawn tile by tile; the rest as one sprite

type Thing = Soldier | Roadblock | Structure;
const isUnit = (id: string): id is UnitKind => id in UNITS;
const isUsable = (id: string): id is UsableKind => id in USABLES;
const isBlockKind = (id: string): id is BlockKind => id in ROADBLOCKS;
const isSoldier = (o?: Thing): o is Soldier => !!o && o.kind in UNITS;
const isBlock = (o?: Thing): o is Roadblock => !!o && o.kind in ROADBLOCKS;
const nameOf = (id: string) => (isUnit(id) ? UNITS[id] : isUsable(id) ? USABLES[id] : isBlockKind(id) ? ROADBLOCKS[id] : STRUCTS[id as StructKind]).name;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
/** What the bar and hovering say about something: the line from its skill web node. */
const describe = (id: string) => NODE.get(id)?.desc ?? (id === 'generator' ? 'Powers electric puddles nearby. Goes inside a building.' : '');
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Drag =
  | { kind: 'pan'; x: number; y: number; travel: number }
  | { kind: 'pinch'; dist: number; zoom: number; x: number; y: number }
  | { kind: 'aim'; s: Soldier }
  | { kind: 'move'; s: Soldier; x: number; y: number; moved: boolean }
  | { kind: 'shift'; o: Roadblock | Structure; x: number; y: number; moved: boolean }
  | { kind: 'place'; id: string };

export class Game extends Phaser.Scene {
  world!: World;
  hud!: Hud;
  speed = 1;
  acc = 0;
  selected?: Thing;
  drag?: Drag;
  pointer = { x: -1, y: -1 }; // screen point of the drag in progress
  dragAngle = -Math.PI / 2; // which way the finger was last moving: an A-10 flies that way
  zombies: Phaser.GameObjects.Sprite[] = [];
  soldiers = new Map<Soldier, Phaser.GameObjects.Sprite>();
  blocks = new Map<Roadblock | Structure, Phaser.GameObjects.Sprite[]>();
  planes: Phaser.GameObjects.Sprite[] = [];
  floor!: Phaser.GameObjects.Graphics;
  /** Where the horde comes in: each run of spawn tiles at the map edge, and the way in from it. */
  entries: { tiles: number[]; x: number; y: number; dx: number; dy: number; label: Phaser.GameObjects.Text }[] = [];
  top!: Phaser.GameObjects.Graphics;
  pending?: Soldier; // a sentry operator waiting for a tap to set his turret down
  armed?: string; // a bar item tapped: the next tap on the map puts it down there
  overview?: { zoom: number; x: number; y: number }; // the view to go back to from the whole map
  mapId = MAPS[0].id;
  mapData!: MapData;
  build!: Build;
  loadout: Record<string, number> = {};
  ids: string[] = [];
  paid?: Payout; // the chips this run paid, once it is over
  corpses: { body: Phaser.GameObjects.Image; splat?: Phaser.GameObjects.Image; born: number }[] = [];
  tutorial = -1; // step of the guided start, or -1
  turned = false; // roadblocks and structures dragged from the bar go down turned (R turns them)
  canTurn = false; // the selection can be turned now
  shownWave = -1; // the last wave the banner announced
  hovered?: Soldier; // under the mouse, explained in a box
  fallen = new Set<Soldier>(); // soldiers already reported down
  downs: { x: number; y: number; at: number }[] = []; // where they fell, marked on the map for a moment
  seen = 0; // zombies on screen this frame
  behind = -1e9; // when a frame last could not keep up with the speed asked for
  muted = false; // the skill tree's demo plays without sound

  constructor(key = 'game') { super(key); }

  init(data: { map?: string }) { this.mapId = data.map ?? this.mapId; }

  preload() { load(this); }

  create() {
    bake(this);
    const m = MAPS.find((x) => x.id === this.mapId) ?? MAPS[0], save = profile.save;
    this.mapData = m.data;
    this.build = build(save.skills);
    this.loadout = this.build.loadout;
    this.world = new World(m.data, m.waves, (Math.random() * 1e9) | 0, this.build.stats);
    Object.assign(this, { shownWave: -1, hovered: undefined, speed: 1, acc: 0, selected: undefined, drag: undefined, pending: undefined, armed: undefined, overview: undefined, zombies: [], soldiers: new Map(), blocks: new Map(), planes: [], paid: undefined, corpses: [], fallen: new Set(), downs: [] });
    this.tutorial = !save.tutorialDone && m === MAPS[0] ? 0 : -1;
    this.ids = ORDER.filter((id) => (isUsable(id) ? this.world.charges[id] : this.loadout[id] ?? 0) > 0);
    const horde = Number(new URLSearchParams(location.search).get('horde'));
    if (horde > 0) this.world.horde(Math.min(horde, 4000));
    if (import.meta.env.DEV) Object.assign(window, { game: this }); // for poking at it from the console or a test
    const blood = profile.settings.gore !== 'none';
    // Only this map's painting is kept (Play again needs no new one): at their size, all of them would fill a phone.
    for (const k of this.textures.getTextureKeys()) if (k.startsWith('map-') && k !== `map-${m.id}-${blood}`) this.textures.remove(k);
    const art = paintMap(this, m.data, this.world.grid, `map-${m.id}-${blood}`, blood);
    this.add.image(0, 0, art).setOrigin(0);
    ambience(this, drawn.get(art) ?? [], Math.round(24 * QUALITY[profile.settings.quality].particles));
    this.floor = this.add.graphics().setDepth(1);
    this.top = this.add.graphics().setDepth(10);
    this.entries = this.findEntries();
    this.setupCamera();
    this.setupInput();
    const items = this.ids.map((id) => ({
      id,
      name: nameOf(id),
      group: (isUnit(id) ? 'units' : isUsable(id) ? 'strikes' : 'build') as Group,
      icon: icon(this, isUnit(id) ? `${id}-idle-6/0` : `${id}/0`),
      desc: describe(id),
    }));
    this.hud = new Hud(document.getElementById('hud')!, items, this.build.speeds, profile.settings.lefty, {
      drag: (id, e) => this.beginPlace(id, e),
      arm: (id) => { this.armed = this.armed === id ? undefined : id; this.selected = undefined; },
      fit: () => this.fitToggle(),
      start: () => this.begin(),
      setup: () => this.useSetup(),
      speed: (n) => (this.speed = n),
      action: (a) => this.act(a),
      again: () => this.scene.restart(),
      menu: (to) => this.leave(to),
      retreat: () => this.retreat(),
      skip: () => this.endTutorial(),
    });
    this.events.once('shutdown', () => { this.hud.destroy(); hordeLevel(0); });
    this.setZoom(this.cameras.main.zoom); // again, now the bars can be measured
    music('game');
    this.input.keyboard?.on('keydown-R', () => {
      if (this.drag?.kind === 'place') this.turned = !this.turned;
      else if (this.canTurn) this.act('Turn');
    });
    this.cameras.main.setBackgroundColor('#000000').fadeIn(500); // off the map is black
    this.hud.banner(m.name, this.tutorial >= 0 ? 'Learn the ropes here' : 'Plan your defence');
  }

  /** The spawn tiles in runs along the map edge, each with its middle and the way into the map. */
  findEntries() {
    const g = this.world.grid, T = g.tile, left = new Set(g.spawns), out: Game['entries'] = [];
    for (const first of g.spawns) {
      if (!left.has(first)) continue;
      const tiles: number[] = [];
      for (const stack = [first]; stack.length; ) {
        const i = stack.pop()!;
        if (!left.delete(i)) continue;
        tiles.push(i);
        // Left and right only within the row: the last tile of one row is not beside the first of the next.
        for (const n of [i % g.w ? i - 1 : -1, (i + 1) % g.w ? i + 1 : -1, i - g.w, i + g.w]) if (left.has(n)) stack.push(n);
      }
      const xs = tiles.map((i) => i % g.w), ys = tiles.map((i) => Math.floor(i / g.w));
      const x = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * T, y = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * T;
      const [dx, dy] = Math.min(...ys) === 0 ? [0, 1] : Math.max(...ys) === g.h - 1 ? [0, -1] : Math.min(...xs) === 0 ? [1, 0] : [-1, 0];
      const label = this.add.text(x + dx * T * 6.5, y + dy * T * 6.5, 'THEY COME\nFROM HERE', { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '9px', color: palette.flash1, align: 'center', stroke: palette.outline, strokeThickness: 3 })
        .setOrigin(0.5).setDepth(10).setResolution(4);
      out.push({ tiles, x, y, dx, dy, label });
    }
    return out;
  }

  /** Start: the defence as it stands is kept for this city, to put down again next time. */
  begin() {
    const w = this.world;
    if (w.phase !== 'plan') return;
    if (w.soldiers.length || w.structures.length || w.roadblocks.some((rb) => !rb.prop)) {
      profile.save.setups[this.mapId] = w.setup();
      persist();
    }
    w.start();
  }

  /** Clears what is down and puts the kept setup back, as far as what you own now allows. */
  useSetup() {
    const kept = profile.save.setups[this.mapId];
    if (!kept) return;
    this.world.useSetup(kept, this.loadout);
    this.selected = undefined;
  }

  /** A soldier just killed: a notice to tap to look, and a mark where he fell. */
  reportFallen() {
    for (const s of this.world.soldiers) {
      if (!s.dead || this.fallen.has(s)) continue;
      this.fallen.add(s);
      this.downs.push({ x: s.x, y: s.y, at: this.time.now });
      this.hud.notice(`${this.world.stats.units[s.kind].name} down`, () => this.cameras.main.pan(s.x, s.y, 350, 'Sine.easeInOut'));
    }
  }

  /** Back to the menu (or straight to the skill web). Leaving mid-fight is a retreat, paid as a loss. */
  leave(to: 'menu' | 'tree') {
    if (this.world.phase === 'wave') return this.retreat(to);
    this.fadeTo(to);
  }

  retreat(to: 'menu' | 'tree' = 'menu') {
    if (this.world.phase === 'wave') {
      this.world.phase = 'lost';
      this.settle();
    }
    this.fadeTo(to);
  }

  /** Fades out to the save's screen (its cities) or its skill web. */
  fadeTo(to: 'menu' | 'tree') {
    this.hud.destroy();
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('menu', { open: to === 'menu' ? 'save' : 'tree' }));
  }

  /** Pays the run out once, and saves. */
  settle() {
    const w = this.world, save = profile.save;
    if (this.paid || (w.phase !== 'won' && w.phase !== 'lost')) return;
    const won = w.phase === 'won';
    this.paid = payout({ kills: w.kills, leaks: w.leaks, leakLimit: w.leakLimit, time: w.time, par: this.mapData.par, won, firstClear: won && !save.cleared[this.mapId], chipGain: this.build.chipGain });
    save.chips += this.paid.total;
    if (won) save.cleared[this.mapId] = true;
    const st = save.stats;
    Object.assign(st, { runs: st.runs + 1, wins: st.wins + (won ? 1 : 0), kills: st.kills + w.kills, leaks: st.leaks + w.leaks, chips: st.chips + this.paid.total, time: st.time + Math.round(w.time) });
    persist();
  }

  endTutorial() {
    this.tutorial = -1;
    profile.save.tutorialDone = true;
    persist();
  }

  /** The guided start: each step waits until you have done it. */
  stepTutorial() {
    const w = this.world, s = w.soldiers[0];
    const done = [
      () => w.soldiers.length > 0,
      () => !!s && (Math.abs(s.angle + Math.PI / 2) > 0.05 || Math.abs(s.reach - (s.kind === 'rifleman' ? 72 : s.reach)) > 4),
      () => w.phase !== 'plan',
      () => this.speed === 0,
      () => w.soldiers.some((o) => o.dest),
      () => w.time > (this.tutorialAt ??= w.time) + 5,
    ][this.tutorial];
    if (done?.()) {
      this.tutorial++;
      if (this.tutorial >= TUTORIAL.length) this.endTutorial();
    }
  }
  tutorialAt?: number;

  // ---- Camera: pinch or wheel to zoom, drag empty ground (or two fingers, or right-drag) to pan ----

  get mapW() { return this.world.grid.w * this.world.grid.tile; }
  get mapH() { return this.world.grid.h * this.world.grid.tile; }

  setupCamera() {
    const cam = this.cameras.main;
    this.setZoom(this.scale.height / 480);
    const fit = () => this.setZoom(cam.zoom); // a phone turned, a window resized, or the part of the page on screen changed
    this.scale.on('resize', fit);
    visualViewport?.addEventListener('resize', fit);
    this.events.once('shutdown', () => { this.scale.off('resize', fit); visualViewport?.removeEventListener('resize', fit); });
    // Halfway between the middle of the map and the safe zone, where the line will be held: on the street nearest it,
    // not on a roof in the dark.
    const { goals: g, tile: T, w, h, wall } = this.world.grid;
    const gx = g.reduce((n, i) => n + (i % w), 0) / g.length, gy = g.reduce((n, i) => n + Math.floor(i / w), 0) / g.length;
    const mx = Math.round((gx + w / 2) / 2), my = Math.round((gy + h / 2) / 2);
    let best = my * w + mx;
    for (let i = 0, d = Infinity; i < w * h; i++) {
      const e = (i % w - mx) ** 2 + (Math.floor(i / w) - my) ** 2;
      if (!wall[i] && e < d) { d = e; best = i; }
    }
    cam.centerOn((best % w + 0.5) * T, (Math.floor(best / w) + 0.5) * T);
  }

  /** Out until the whole map fits between the status row and the bar, in to MAX_ZOOM. The map's top and bottom edges
   *  can be pulled out from under those bars; a map narrower or shorter than the room for it sits in its middle. */
  setZoom(z: number) {
    const cam = this.cameras.main, { mapW, mapH } = this, bars = this.bars(), room = Math.max(1, cam.height - bars.top - bars.bottom);
    cam.setZoom(Phaser.Math.Clamp(z, Math.min(cam.width / mapW, room / mapH), MAX_ZOOM));
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom, top = bars.top / cam.zoom, bottom = bars.bottom / cam.zoom;
    const y = mapH + top + bottom > vh ? -top : mapH / 2 - top - (vh - top - bottom) / 2;
    cam.setBounds(Math.min(0, (mapW - vw) / 2), y, Math.max(mapW, vw), Math.max(mapH + top + bottom, vh));
  }

  /** The Map button: out to the whole map, and back in to where you were. */
  fitToggle() {
    const cam = this.cameras.main;
    if (this.overview) {
      const { zoom, x, y } = this.overview;
      this.overview = undefined;
      this.setZoom(zoom);
      cam.centerOn(x, y);
      return;
    }
    this.overview = { zoom: cam.zoom, x: cam.midPoint.x, y: cam.midPoint.y };
    this.setZoom(0);
    const bars = this.bars();
    cam.centerOn(this.mapW / 2, this.mapH / 2 + (bars.bottom - bars.top) / 2 / cam.zoom);
  }

  /** How much of the screen the controls cover at the top and bottom, in screen pixels (the canvas is the page's size). */
  bars() {
    if (!this.hud) return { top: HUD_TOP, bottom: HUD_BOTTOM };
    const canvas = this.game.canvas.getBoundingClientRect(), v = visualViewport;
    return this.hud.margins(canvas, { top: Math.max(canvas.top, v?.offsetTop ?? 0), bottom: Math.min(canvas.bottom, v ? v.offsetTop + v.height : innerHeight) });
  }

  toWorld(sx: number, sy: number): [number, number] {
    const cam = this.cameras.main;
    return [cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom, cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom];
  }

  /** Zooms keeping the world point under (sx, sy) where it is. */
  zoomAt(sx: number, sy: number, z: number) {
    const cam = this.cameras.main, [wx, wy] = this.toWorld(sx, sy);
    this.setZoom(z);
    cam.scrollX = wx - cam.width / 2 - (sx - cam.width / 2) / cam.zoom;
    cam.scrollY = wy - cam.height / 2 - (sy - cam.height / 2) / cam.zoom;
  }

  // ---- Touch and mouse on the map ----

  setupInput() {
    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, this.cameras.main.zoom * (dy > 0 ? 0.88 : 1.12)));
  }

  downPointers() { return this.input.manager.pointers.filter((p) => p.isDown); }

  onDown(p: Phaser.Input.Pointer) {
    const cam = this.cameras.main, down = this.downPointers();
    if (this.drag?.kind === 'place') return;
    if (down.length >= 2) {
      // A second finger turns whatever the first was doing into a pinch.
      const [a, b] = down;
      this.drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: cam.zoom, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    this.pointer = { x: p.x, y: p.y };
    if (p.rightButtonDown() || p.middleButtonDown()) {
      this.drag = { kind: 'pan', x: p.x, y: p.y, travel: Infinity };
      return;
    }
    const [wx, wy] = this.toWorld(p.x, p.y), grab = Math.max(10, (p.wasTouch ? GRAB.touch : GRAB.mouse) / cam.zoom), sel = this.selected;
    if (this.pending) {
      const turret = this.world.deployTurret(this.pending, wx, wy);
      this.pending = undefined;
      if (turret) { this.selected = turret; return; }
    }
    if (this.armed) { // a tap puts the bar item down (a drag still pans)
      this.drag = { kind: 'pan', x: p.x, y: p.y, travel: 0 };
      return;
    }
    if (isSoldier(sel) && !sel.dead && !this.world.stats.units[sel.kind].fixed && !support(this.world.stats.units[sel.kind])) {
      const [hx, hy] = this.handle(sel);
      if (Math.hypot(hx - wx, hy - wy) < grab) { this.drag = { kind: 'aim', s: sel }; return; }
    }
    let s: Soldier | undefined, best = grab;
    for (const o of this.world.soldiers) {
      const d = Math.hypot(o.x - wx, o.y - wy);
      if (!o.dead && d < best) { best = d; s = o; }
    }
    if (s) {
      this.selected = s;
      this.drag = { kind: 'move', s, x: p.x, y: p.y, moved: false };
      return;
    }
    const o = this.world.structureAt(wx, wy) ?? this.blockAt(wx, wy);
    if (o) {
      this.selected = o;
      this.drag = { kind: 'shift', o, x: p.x, y: p.y, moved: false };
      return;
    }
    this.drag = { kind: 'pan', x: p.x, y: p.y, travel: 0 };
  }

  onMove(p: Phaser.Input.Pointer) {
    const d = this.drag, cam = this.cameras.main;
    if (!d && p.wasTouch === false) this.hover(p);
    if (!d || d.kind === 'place') return;
    if (d.kind === 'pinch') {
      const down = this.downPointers();
      if (down.length < 2) return;
      const [a, b] = down, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      this.zoomAt(x, y, (d.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / d.dist);
      cam.scrollX -= (x - d.x) / cam.zoom;
      cam.scrollY -= (y - d.y) / cam.zoom;
      d.x = x;
      d.y = y;
      return;
    }
    if (!p.isDown) return;
    this.pointer = { x: p.x, y: p.y - this.lift(p, d) };
    if (d.kind === 'pan') {
      cam.scrollX -= (p.x - d.x) / cam.zoom;
      cam.scrollY -= (p.y - d.y) / cam.zoom;
      d.travel += Math.abs(p.x - d.x) + Math.abs(p.y - d.y);
      d.x = p.x;
      d.y = p.y;
    } else if (d.kind === 'aim') this.world.aim(d.s, ...this.toWorld(p.x, p.y));
    else d.moved ||= Math.hypot(p.x - d.x, p.y - d.y) > 8;
  }

  onUp(p: Phaser.Input.Pointer) {
    const d = this.drag;
    if (!d || d.kind === 'place') return;
    if (d.kind === 'pinch') {
      if (!this.downPointers().length) this.drag = undefined;
      return;
    }
    this.drag = undefined;
    const [wx, wy] = this.toWorld(p.x, p.y - this.lift(p, d)), [tx, ty] = this.tileOf(wx, wy);
    if (d.kind === 'pan' && d.travel < 8) {
      // A tap on empty ground: puts down what the bar holds, or lets go of the selection.
      if (this.armed) this.put(this.armed, p.x, p.y);
      else this.selected = undefined;
    }
    if (d.kind === 'move' && d.moved) this.world.moveSoldier(d.s, wx, wy);
    if (d.kind === 'shift' && d.moved) {
      if (isBlock(d.o)) {
        if (d.o.prop) this.world.haulProp(d.o, tx, ty);
        else this.world.moveBlock(d.o, tx, ty);
      }
      else this.world.moveStructure(d.o, tx, ty);
    }
  }

  /** How far above a finger the thing it drags is held (none for a mouse, or for panning and aiming). */
  lift(p: Phaser.Input.Pointer, d: Drag) { return p.wasTouch && (d.kind === 'move' || d.kind === 'shift') ? LIFT : 0; }

  /** Puts down (or calls in) a bar item at a point on the screen. */
  put(id: string, x: number, y: number) {
    this.armed = undefined;
    if (this.available(id) <= 0 || this.world.phase === 'won' || this.world.phase === 'lost') return;
    const [wx, wy] = this.toWorld(x, y), [tx, ty] = this.tileOf(wx, wy), w = this.world;
    if (isUsable(id)) w.callStrike(id, wx, wy, this.dragAngle);
    else this.selected = isUnit(id) ? w.placeSoldier(id, wx, wy) : isBlockKind(id) ? w.placeBlock(id, tx, ty, this.turned) : w.placeStructure(id as StructKind, tx, ty, this.turned);
  }

  /** Dragging from the bar: follows the finger anywhere on the page and drops onto the map. */
  beginPlace(id: string, e: PointerEvent) {
    if (this.available(id) <= 0 || this.world.phase === 'won' || this.world.phase === 'lost') return;
    this.drag = { kind: 'place', id };
    this.selected = this.armed = undefined;
    let last = this.toCanvas(e);
    const move = (ev: PointerEvent) => {
      this.pointer = this.toCanvas(ev);
      if (Math.hypot(this.pointer.x - last.x, this.pointer.y - last.y) > 24) {
        this.dragAngle = Math.atan2(this.pointer.y - last.y, this.pointer.x - last.x);
        last = this.pointer;
      }
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      this.drag = undefined;
      if (ev.type !== 'pointerup' || document.elementFromPoint(ev.clientX, ev.clientY) !== this.game.canvas) return;
      const { x, y } = this.toCanvas(ev);
      this.put(id, x, y);
    };
    move(e);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  /** Where a page pointer is on the canvas; a finger's point is held LIFT above it, so the finger does not hide it. */
  toCanvas(ev: PointerEvent) {
    const r = this.game.canvas.getBoundingClientRect(), lift = ev.pointerType === 'mouse' ? 0 : LIFT;
    return { x: ((ev.clientX - r.left) * this.scale.width) / r.width, y: ((ev.clientY - r.top) * this.scale.height) / r.height - lift };
  }

  /** A mouse resting on a soldier gets a box saying who he is. */
  hover(p: Phaser.Input.Pointer) {
    const [wx, wy] = this.toWorld(p.x, p.y), cam = this.cameras.main, r = this.game.canvas.getBoundingClientRect();
    const s = this.world.soldiers.find((o) => !o.dead && Math.hypot(o.x - wx, o.y - wy) < 9);
    if (s === this.hovered) return;
    this.hovered = s;
    if (!s) return this.hud.unexplain();
    const sx = r.left + (s.x - cam.worldView.x) * cam.zoom, sy = r.top + (s.y - cam.worldView.y) * cam.zoom, half = 10 * cam.zoom;
    this.hud.explain(this.world.stats.units[s.kind].name, describe(s.kind), { left: sx - half, top: sy - half, width: half * 2, bottom: sy + half });
  }

  act(action: string) {
    const sel = this.selected, w = this.world;
    if (isSoldier(sel) && action.startsWith('Target')) sel.priority = PRIORITIES[(PRIORITIES.indexOf(sel.priority) + 1) % PRIORITIES.length];
    if (isSoldier(sel) && action === 'Deploy turret') this.pending = sel;
    if (action === 'Cancel') this.pending = undefined;
    if (!sel || isSoldier(sel)) {
      if (action === 'Remove' && isSoldier(sel)) w.removeSoldier(sel);
    } else if (isBlock(sel)) {
      if (action === 'Turn') {
        if (sel.prop) w.haulProp(sel, sel.tx, sel.ty, !sel.vertical);
        else w.moveBlock(sel, sel.tx, sel.ty, !sel.vertical);
      }
      if (action === 'Remove' && w.phase === 'plan') w.removeBlock(sel, true);
    } else {
      if (action === 'Turn') w.turnStructure(sel);
      if (action === 'Remove' && w.phase === 'plan') w.removeStructure(sel, true);
      if (action === 'Detonate') w.detonate(sel);
      if (action === 'Sound off') w.soundOff(sel);
    }
    if (action === 'Remove' || action === 'Detonate' || action === 'Sound off') this.selected = undefined;
  }

  available(id: string) {
    if (isUsable(id)) return this.world.charges[id];
    return (this.loadout[id] ?? 0) - (this.world.used[id] ?? 0);
  }

  tileOf(x: number, y: number): [number, number] {
    const T = this.world.grid.tile;
    return [Math.floor(x / T), Math.floor(y / T)];
  }

  blockAt(x: number, y: number) {
    const i = this.world.grid.at(x, y), id = i < 0 ? 0 : this.world.grid.block[i];
    return id ? this.world.roadblocks.find((b) => b.id === id) : undefined;
  }

  handle(s: Soldier): [number, number] { return [s.x + Math.cos(s.angle) * s.reach, s.y + Math.sin(s.angle) * s.reach]; }

  // ---- Each frame ----

  update(_time: number, delta: number) {
    const w = this.world;
    if (w.phase === 'wave' && this.speed > 0) {
      this.acc += (Math.min(delta, 100) / 1000) * this.speed * PACE;
      const until = performance.now() + STEP_BUDGET;
      while (this.acc >= STEP && performance.now() < until) {
        w.step(STEP);
        this.acc -= STEP;
      }
      if (this.acc >= STEP) {
        this.acc = 0; // could not keep up: that time is dropped, and the fight runs slower than asked
        this.behind = this.time.now;
      }
    }
    this.anims.globalTimeScale = w.phase === 'wave' ? this.speed * PACE : 1;
    this.settle();
    this.spill();
    this.reportFallen();
    if (this.tutorial >= 0) this.stepTutorial();
    const sel = this.selected;
    if (sel && (isSoldier(sel) ? sel.dead || !w.soldiers.includes(sel) : isBlock(sel) ? !w.roadblocks.includes(sel) : !w.structures.includes(sel))) this.selected = undefined;
    this.drawZombies();
    this.drawSoldiers();
    this.drawBuilt();
    this.drawOverlay();
    this.listen(delta);
    this.updateHud();
  }

  /** 1 on screen, less the farther off it is. */
  near(x: number, y: number) {
    const v = this.cameras.main.worldView;
    return 1 / (1 + Math.hypot(Math.max(v.x - x, 0, x - v.right), Math.max(v.y - y, 0, y - v.bottom)) / 200);
  }

  /** Plays what the world heard this frame, and the horde: a growl under it all, louder the more are on screen, and
   *  now and then one of them groans. */
  listen(delta: number) {
    const w = this.world, fighting = w.phase === 'wave';
    for (const s of w.sounds) play(s.kind, this.near(s.x, s.y), s.size);
    w.sounds.length = 0;
    hordeLevel(fighting ? this.seen / 120 : 0);
    if (fighting && this.speed && Math.random() < (delta / 1000) * Math.min(1.5, this.seen / 30)) play('groan', 0.5 + Math.random() * 0.5);
  }

  /** Corpses and blood where zombies fell, as the gore setting asks; the oldest fade out, and there is a cap. */
  spill() {
    const w = this.world, { gore, quality, bodies } = profile.settings, cap = Math.min(QUALITY[quality].corpses, bodies), life = CORPSE_LIFE[gore];
    if (!this.muted) for (const d of w.deaths) play('die', this.near(d.x, d.y));
    if (gore !== 'none' && cap > 0)
      for (const d of w.deaths) {
        if (this.corpses.length >= cap) {
          const old = this.corpses.shift()!;
          old.body.destroy();
          old.splat?.destroy();
        }
        const splat = gore === 'normal' ? this.add.image(d.x, d.y, 'sprites', `splat/${(Math.random() * 3) | 0}`).setRotation(Math.random() * 6.3).setDepth(1.2).setAlpha(0.85) : undefined;
        const body = this.add.image(d.x, d.y, 'sprites', `${ZOMBIE_KINDS[d.kind]}-walk/0`).setRotation(d.angle).setTint(0x7a5a52).setDepth(1.3);
        this.corpses.push({ body, splat, born: w.time });
      }
    w.deaths.length = 0;
    let n = 0;
    for (const c of this.corpses) {
      const fade = 1 - (w.time - c.born - life) / 3;
      if (fade <= 0) {
        c.body.destroy();
        c.splat?.destroy();
        continue;
      }
      if (fade < 1) {
        c.body.setAlpha(fade);
        c.splat?.setAlpha(0.85 * fade);
      }
      this.corpses[n++] = c;
    }
    this.corpses.length = n;
  }

  drawZombies() {
    const w = this.world, t = w.time, hurt = hex(palette.blood1) | 0x404040, burning = hex(palette.flash0), v = this.cameras.main.worldView;
    this.seen = 0;
    for (let i = 0; i < w.n; i++) {
      let s = this.zombies[i];
      if (!w.alive[i]) {
        if (s?.visible) s.setVisible(false);
        continue;
      }
      const z = ZOMBIES[w.zkind[i]], walk = WALK[w.zkind[i]];
      s ??= this.zombies[i] = this.add.sprite(0, 0, 'sprites', walk[0]).setDepth(2);
      const vx = w.zvx[i], vy = w.zvy[i], moving = vx * vx + vy * vy > 4, rate = z.speed > 20 ? 8 : 4;
      s.setVisible(true).setPosition(w.zx[i], w.zy[i]).setFrame(walk[moving ? ((t * rate + i * 0.37) | 0) & 1 : 0]);
      if (v.contains(w.zx[i], w.zy[i])) this.seen++;
      if (moving) s.rotation = Math.atan2(vy, vx);
      // A jumper in mid-leap over a roadblock is drawn bigger, as if nearer the camera.
      const tile = w.grid.at(w.zx[i], w.zy[i]);
      s.setScale(z.jumps && tile >= 0 && w.grid.block[tile] ? 1.35 : 1);
      const tint = w.zhit[i] > 0 ? hurt : w.zburn[i] > 0 && ((t * 12) | 0) % 2 ? burning : 0;
      if (tint) s.setTint(tint);
      else if (s.isTinted) s.clearTint();
    }
  }

  drawSoldiers() {
    const w = this.world;
    for (const s of w.soldiers) {
      let sp = this.soldiers.get(s);
      if (!sp) this.soldiers.set(s, (sp = this.add.sprite(s.x, s.y, 'sprites').setDepth(3)));
      sp.setPosition(s.x, s.y).setVisible(!s.dead);
      if (!s.dead) sp.play(`${s.kind}-${w.firing(s) ? 'shoot' : s.walking ? 'walk' : 'idle'}-${s.facing}`, true);
    }
    for (const [s, sp] of this.soldiers) if (!w.soldiers.includes(s)) { sp.destroy(); this.soldiers.delete(s); }
  }

  /** Roadblocks and structures. Lines of them are drawn tile by tile; the rest as one sprite. */
  drawBuilt() {
    const w = this.world, { w: gw, tile: T } = w.grid;
    const things: (Roadblock | Structure)[] = [...w.roadblocks, ...w.structures.filter((st) => st.kind !== 'puddle')];
    for (const o of things) {
      const block = isBlock(o), tiles = block ? w.blockTiles(o.kind, o.tx, o.ty, o.vertical)! : w.structTiles(o.kind as StructKind, o.tx, o.ty, o.vertical)!;
      const pieced = PIECES.has(o.kind);
      let sprites = this.blocks.get(o);
      if (!sprites) {
        const frames = pieced ? tiles.map((_, k) => (o.kind === 'plastic' ? `plastic/${k % 2}` : `${o.kind}/0`)) : [o.kind === 'car' ? `car/${o.id % 3}` : `${o.kind}/0`]; // three wrecks to tell apart
        this.blocks.set(o, (sprites = frames.map((f) => this.add.sprite(0, 0, 'sprites', f).setDepth(o.kind === 'watchtower' || o.kind === 'nest' ? 2.9 : 1.5))));
      }
      const turn = o.vertical ? Math.PI / 2 : 0;
      if (pieced) tiles.forEach((i, k) => sprites[k].setPosition(((i % gw) + 0.5) * T, (Math.floor(i / gw) + 0.5) * T).setRotation(turn));
      else if (block) sprites[0].setPosition(...w.blockCentre(o)).setRotation(turn);
      else sprites[0].setPosition((o as Structure).x, (o as Structure).y).setRotation(o.kind === 'rigged' ? (o as Structure).angle : 0);
      if (block) {
        const c = Math.round(255 * (0.5 + (0.5 * o.hp) / this.world.stats.roadblocks[o.kind].hp)); // darker as it breaks
        for (const sp of sprites) sp.setTint(Phaser.Display.Color.GetColor(c, c, c));
      }
    }
    for (const [o, sprites] of this.blocks) if (!things.includes(o)) { sprites.forEach((sp) => sp.destroy()); this.blocks.delete(o); }
  }

  drawOverlay() {
    const w = this.world, z = this.cameras.main.zoom, sel = this.selected, d = this.drag, T = w.grid.tile, t = w.time;
    const floor = this.floor.clear(), top = this.top.clear();
    // Where the horde comes in: the edge glows red, arrows run inward. Brighter while planning.
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 250), planning = w.phase === 'plan', red = hex(palette.red1);
    for (const e of this.entries) {
      floor.fillStyle(red, (planning ? 0.28 : 0.14) + 0.12 * pulse);
      for (const i of e.tiles) floor.fillRect((i % w.grid.w) * T, Math.floor(i / w.grid.w) * T, T, T);
      for (let k = 0; k < 3; k++) {
        const along = (1.4 + k * 1.1 + ((this.time.now / 600) % 1.1)) * T, cx = e.x + e.dx * along, cy = e.y + e.dy * along, s = T * 0.9;
        const nx = -e.dy, ny = e.dx; // across the way in
        floor.lineStyle(3, red, (planning ? 0.85 : 0.45) * (1 - k / 3.2));
        floor.lineBetween(cx - e.dx * s * 0.6 + nx * s, cy - e.dy * s * 0.6 + ny * s, cx, cy).lineBetween(cx, cy, cx - e.dx * s * 0.6 - nx * s, cy - e.dy * s * 0.6 - ny * s);
      }
      e.label.setVisible(planning);
    }
    const paint = hex(palette.paint), light = hex(palette.flash1), bad = hex(palette.blood1), dark = hex(palette.outline);
    const flame = hex(palette.flash0), metal = hex(palette.metal2), smoke = hex(palette.metal2), water = hex(palette.cloth1);
    const tileRect = (g: Phaser.GameObjects.Graphics, i: number) => g.strokeRect((i % w.grid.w) * T, Math.floor(i / w.grid.w) * T, T, T);

    // Electric puddles: they spark while a generator powers them.
    for (const st of w.structures) {
      if (st.kind !== 'puddle') continue;
      const r = this.world.stats.structs.puddle.radius!, live = w.powered(st);
      floor.fillStyle(water, 0.75).fillCircle(st.x, st.y, r * 0.8).fillCircle(st.x + r * 0.35, st.y + r * 0.2, r * 0.55).fillCircle(st.x - r * 0.3, st.y - r * 0.25, r * 0.5);
      if (live) for (let k = 0; k < 4; k++) floor.fillStyle(light, 0.9).fillRect(st.x + (Math.random() - 0.5) * r * 1.4, st.y + (Math.random() - 0.5) * r * 1.4, 1.5, 1.5);
    }
    // Fire, smoke and lures on the ground.
    for (const zn of w.zones) {
      if (zn.kind === 'fire')
        for (let k = 0; k < 16 * QUALITY[profile.settings.quality].particles; k++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * zn.r;
          floor.fillStyle(k % 4 ? flame : bad, 0.7).fillCircle(zn.x + Math.cos(a) * r, zn.y + Math.sin(a) * r, 2 + Math.random() * 3);
        }
      else if (zn.kind === 'smoke') for (let k = 0; k < 7; k++) top.fillStyle(smoke, 0.22).fillCircle(zn.x + Math.cos(k * 0.9 + t) * zn.r * 0.5, zn.y + Math.sin(k * 1.3 + t) * zn.r * 0.5, zn.r * 0.55);
      else top.lineStyle(2 / z, bad, 0.6).strokeCircle(zn.x, zn.y, zn.r * ((t * 0.8) % 1)).fillStyle(bad, 0.9).fillCircle(zn.x, zn.y, 3);
    }

    // On the ground: each soldier's cone, a mortar's landing zone, a medic's or engineer's reach. The selected one brighter.
    for (const s of w.soldiers) {
      if (s.dead) continue;
      const u = this.world.stats.units[s.kind], alpha = s === sel ? 0.18 : 0.07;
      if (support(u)) {
        if (s === sel) floor.fillStyle(hex(palette.rot2), 0.12).fillCircle(s.x, s.y, u.range);
      } else if (indirect(u)) floor.fillStyle(paint, alpha).fillCircle(...w.aimPoint(s), u.scatter! + u.blast!);
      else floor.fillStyle(paint, alpha).slice(s.x, s.y, w.rangeOf(s), s.angle - w.spread(s), s.angle + w.spread(s), false).fillPath();
    }
    if (isSoldier(sel)) {
      const u = this.world.stats.units[sel.kind];
      top.lineStyle(1.5 / z, light, 0.9).strokeCircle(sel.x, sel.y, u.radius + 4);
      if (indirect(u)) top.lineStyle(1 / z, paint, 0.5).strokeCircle(sel.x, sel.y, u.minRange!).strokeCircle(sel.x, sel.y, u.range);
      if (!u.fixed && !support(u)) {
        const [hx, hy] = this.handle(sel);
        top.lineStyle(1 / z, light, 0.5).lineBetween(sel.x, sel.y, hx, hy);
        top.fillStyle(light, 1).fillCircle(hx, hy, 6 / z).lineStyle(2 / z, dark, 1).strokeCircle(hx, hy, 6 / z);
      }
    } else if (isBlock(sel)) {
      top.lineStyle(1.5 / z, light, 0.9);
      for (const i of w.blockTiles(sel.kind, sel.tx, sel.ty, sel.vertical)!) tileRect(top, i);
    } else if (sel) {
      const k = this.world.stats.structs[sel.kind];
      top.lineStyle(1.5 / z, light, 0.9);
      for (const i of w.structTiles(sel.kind, sel.tx, sel.ty, sel.vertical)!) tileRect(top, i);
      if (k.radius) top.lineStyle(1 / z, paint, 0.6).strokeCircle(sel.x, sel.y, k.radius);
      if (sel.kind === 'puddle' || sel.kind === 'generator') top.lineStyle(1 / z, paint, 0.4).strokeCircle(sel.x, sel.y, this.world.stats.structs.puddle.power!);
      if (sel.kind === 'rigged') top.lineStyle(1.5 / z, bad, 0.7).lineBetween(sel.x, sel.y, sel.x + Math.cos(sel.angle) * k.distance!, sel.y + Math.sin(sel.angle) * k.distance!);
      if (sel.kind === 'explosives') top.lineStyle(1 / z, bad, 0.6).strokeCircle(sel.x, sel.y, k.blast!);
    }

    // Flames from a flamethrower that just fired.
    for (const s of w.soldiers) {
      const u = this.world.stats.units[s.kind];
      if (s.dead || u.weapon !== 'flame' || !w.firing(s)) continue;
      for (let k = 0; k < 12 * QUALITY[profile.settings.quality].particles; k++) {
        const a = s.angle + (Math.random() * 2 - 1) * w.spread(s), r = 10 + Math.random() * (w.rangeOf(s) - 10);
        top.fillStyle(k % 3 ? flame : light, 0.8).fillCircle(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 1.5 + Math.random() * 2.5);
      }
    }
    for (const s of w.shots) top.lineStyle(s.heavy ? 2 : 1, light, 1 - s.age / 0.06).lineBetween(s.x1, s.y1, s.x2, s.y2);
    // Rockets trail smoke; a shell arcs, so mid-flight it is drawn higher and bigger than its shadow.
    for (const p of w.projectiles) {
      if (p.arc) {
        const lift = Math.sin((Math.PI * p.t) / p.flight);
        top.fillStyle(dark, 0.4).fillCircle(p.x, p.y, 2);
        top.fillStyle(metal, 1).fillCircle(p.x, p.y - lift * 24, 2 + lift * 1.5);
      } else {
        top.fillStyle(paint, 0.5).fillCircle(p.x - p.vx * 0.05, p.y - p.vy * 0.05, 2.5);
        top.lineStyle(2, metal, 1).lineBetween(p.x, p.y, p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      }
    }
    // Strikes on their way: a red mark where they will land, the A-10 overhead.
    const mark = (x: number, y: number, r: number) => top.lineStyle(1.5 / z, bad, 0.8).strokeCircle(x, y, r).lineBetween(x - r - 4, y, x + r + 4, y).lineBetween(x, y - r - 4, x, y + r + 4);
    let planes = 0;
    for (const s of w.strikes) {
      const u = this.world.stats.usables[s.kind];
      if (s.kind === 'artillery') for (const sh of s.shells) if (sh.at > s.t) mark(sh.x, sh.y, 6);
      if (s.kind === 'missile' || s.kind === 'napalm') {
        mark(s.x, s.y, u.blast ?? u.radius!);
        const f = s.t / u.delay; // the bomb drops in from above
        if (f > 0.5) top.fillStyle(metal, 1).fillCircle(s.x, s.y - (1 - f) * 80, 3);
      }
      if (s.kind === 'a10') {
        const [x0, y0] = [s.x - (Math.cos(s.angle) * u.length!) / 2, s.y - (Math.sin(s.angle) * u.length!) / 2];
        if (s.t < u.delay) top.lineStyle(u.width! / 2, bad, 0.15).lineBetween(x0, y0, x0 + Math.cos(s.angle) * u.length!, y0 + Math.sin(s.angle) * u.length!);
        else {
          const [px, py] = w.planeAt(s), sp = (this.planes[planes] ??= this.add.sprite(0, 0, 'sprites', 'a10/0').setDepth(11));
          sp.setVisible(true).setPosition(px, py).setRotation(s.angle).setScale(1.5);
          planes++;
        }
      }
    }
    for (let k = planes; k < this.planes.length; k++) this.planes[k].setVisible(false);
    for (const b of w.blasts) {
      const f = b.age / 0.35;
      top.fillStyle(b.bile ? hex(palette.rot2) : f < 0.3 ? light : flame, 0.75 * (1 - f)).fillCircle(b.x, b.y, b.r * (0.5 + 0.5 * f));
    }
    for (const s of w.screams) top.lineStyle(2 / z, paint, 1 - s.age / 0.35).strokeCircle(s.x, s.y, (s.r * s.age) / 0.35);
    // Where a soldier just fell: a red ring, shrinking, for three seconds.
    this.downs = this.downs.filter((m) => this.time.now - m.at < 3000);
    for (const m of this.downs) {
      const f = (this.time.now - m.at) / 3000;
      top.lineStyle(2 / z, bad, 1 - f).strokeCircle(m.x, m.y, 10 + 22 * (1 - f));
    }

    // Health bars, only once something is hurt.
    const bar = (x: number, y: number, frac: number) => {
      top.fillStyle(dark, 1).fillRect(x - 8, y, 16, 3);
      top.fillStyle(frac > 0.5 ? hex(palette.rot2) : bad, 1).fillRect(x - 8, y, 16 * frac, 3);
    };
    for (const s of w.soldiers) if (!s.dead && s.hp < this.world.stats.units[s.kind].hp) bar(s.x, s.y - 14, s.hp / this.world.stats.units[s.kind].hp);
    for (const rb of w.roadblocks) {
      const max = this.world.stats.roadblocks[rb.kind].hp;
      if (rb.hp < max) bar((rb.tx + 0.5) * T, rb.ty * T - (rb.vertical ? T + 5 : 5), rb.hp / max);
    }
    for (const st of w.structures) if (st.kind === 'spikes' && st.hp < this.world.stats.structs.spikes.hp!) bar(st.x, st.y - 10, st.hp / this.world.stats.structs.spikes.hp!);

    // Where a drag would put things: pale if it fits, red if not.
    if (!d || this.pointer.x < 0) return;
    const [wx, wy] = this.toWorld(this.pointer.x, this.pointer.y), [tx, ty] = this.tileOf(wx, wy);
    const ghost = (fits: boolean, tiles: number[] | undefined) => {
      top.lineStyle(1.5 / z, fits ? light : bad, 0.9);
      for (const i of tiles ?? []) tileRect(top, i);
    };
    // While a soldier is being dragged, the free windows and roofs light up.
    if ((d.kind === 'move' && d.moved && (w.phase === 'plan' || !d.s.indoor)) || (d.kind === 'place' && isUnit(d.id)))
      for (const [sx, sy] of this.mapData.slots ?? []) {
        const kind = d.kind === 'move' ? d.s.kind : (d.id as UnitKind);
        if (w.spotFor(kind, (sx + 0.5) * T, (sy + 0.5) * T, d.kind === 'move' ? d.s : undefined)?.indoor && (d.kind === 'place' || w.phase === 'plan'))
          top.lineStyle(1.5 / z, light, 0.7).strokeRect(sx * T + 2, sy * T + 2, T - 4, T - 4);
      }
    if (d.kind === 'move' && d.moved) {
      top.lineStyle(1.5 / z, w.spotFor(d.s.kind, wx, wy, d.s) ? light : bad, 0.9).lineBetween(d.s.x, d.s.y, wx, wy).strokeCircle(wx, wy, 6);
    } else if (d.kind === 'shift' && d.moved) {
      if (isBlock(d.o)) ghost(w.blockFits(d.o.kind, tx, ty, d.o.vertical, d.o), w.blockTiles(d.o.kind, tx, ty, d.o.vertical));
      else ghost(w.structFits(d.o.kind, tx, ty, d.o.vertical, d.o), w.structTiles(d.o.kind, tx, ty, d.o.vertical));
    } else if (d.kind === 'place') {
      const id = d.id;
      if (isUnit(id)) top.lineStyle(1.5 / z, w.spotFor(id, wx, wy) ? light : bad, 0.9).strokeCircle(wx, wy, 7);
      else if (isBlockKind(id)) ghost(w.blockFits(id, tx, ty, this.turned), w.blockTiles(id, tx, ty, this.turned));
      else if (isUsable(id)) {
        const u = this.world.stats.usables[id];
        if (id === 'a10') {
          const cx = (Math.cos(this.dragAngle) * u.length!) / 2, cy = (Math.sin(this.dragAngle) * u.length!) / 2;
          top.lineStyle(u.width!, bad, 0.25).lineBetween(wx - cx, wy - cy, wx + cx, wy + cy);
        } else top.lineStyle(1.5 / z, bad, 0.9).strokeCircle(wx, wy, u.blast ?? u.radius!);
      } else ghost(w.structFits(id as StructKind, tx, ty, this.turned), w.structTiles(id as StructKind, tx, ty, this.turned));
    }
  }

  updateHud() {
    const w = this.world, sel = this.selected, planning = w.phase === 'plan', waving = w.phase === 'wave';
    const summary = `${w.kills} kills · ${w.leaks} leaks · ${clock(w.time)}`;
    const ids = this.ids;
    let selection = '';
    if (this.armed && this.available(this.armed) <= 0) this.armed = undefined;
    if (this.pending) selection = 'Tap where the turret goes';
    else if (this.armed) selection = `Tap the map: ${nameOf(this.armed)}`;
    else if (isSoldier(sel)) selection = `${this.world.stats.units[sel.kind].name} · ${sel.indoor ? 'indoors' : `${Math.ceil(sel.hp)} HP`}`;
    else if (isBlock(sel)) selection = `${this.world.stats.roadblocks[sel.kind].name} · ${sel.prop ? (sel.haul ? 'a soldier is on his way' : 'drag it: a soldier moves it') : `${Math.ceil(sel.hp)} HP`}`;
    else if (sel) selection = this.world.stats.structs[sel.kind].name + (sel.kind === 'puddle' ? (w.powered(sel) ? ' · live' : ' · needs a generator') : '');
    if (waving && w.wave !== this.shownWave) {
      this.shownWave = w.wave;
      this.hud.banner(`Wave ${w.wave + 1} of ${w.waves}`, w.wave ? 'More of them' : 'Here they come');
      play('alarm');
    }
    const turnable = (isBlock(sel) && !sel.prop && !this.world.stats.roadblocks[sel.kind].fixed) || (!!sel && !isSoldier(sel) && !isBlock(sel) && (sel.kind === 'wire' || sel.kind === 'spikes' || sel.kind === 'rigged'));
    this.canTurn = (planning && turnable) || (isBlock(sel) && !!sel.prop);
    this.hud.update({
      status: [planning ? 'Plan your defence' : `Wave ${Math.min(w.wave + 1, w.waves)}/${w.waves}${this.time.now - this.behind < 1500 ? ' · slowed' : ''}`, `Leaks ${w.leaks}/${w.leakLimit}`, `${w.kills} kills`],
      warn: w.leaks >= w.leakLimit * 0.7,
      counts: Object.fromEntries(ids.map((id) => [id, this.available(id)])),
      // A strike can only be called in once the wave is on, and not again until it has cooled down.
      ready: Object.fromEntries(ids.map((id) => [id, isUsable(id) ? w.strikeReady(id) : this.available(id) > 0])),
      cool: Object.fromEntries(Object.keys(USABLES).map((id) => [id, waving ? Math.max(0, w.readyAt[id as UsableKind] - w.time) / this.world.stats.usables[id as UsableKind].cooldown : 0])),
      planning,
      restore: !!profile.save.setups[this.mapId],
      speed: this.speed,
      armed: this.armed ?? '',
      overview: !!this.overview,
      selection,
      actions: [
        ...(isSoldier(sel) && this.world.stats.units[sel.kind].weapon === 'sniper' ? [`Target: ${sel.priority}`] : []),
        ...(isSoldier(sel) && sel.turrets > 0 ? [this.pending ? 'Cancel' : 'Deploy turret'] : []),
        ...(waving && sel?.kind === 'explosives' ? ['Detonate'] : []),
        ...(waving && sel?.kind === 'noise' ? ['Sound off'] : []),
        ...(planning && turnable ? ['Turn'] : []),
        ...(isBlock(sel) && sel.prop ? ['Turn'] : []),
        ...(planning && sel && !(isBlock(sel) && sel.prop) ? ['Remove'] : []),
      ],
      end: this.paid && { title: w.phase === 'won' ? 'You held the line' : 'Overrun', detail: summary, chips: this.chipLines(this.paid), total: this.paid.total, killers: this.killers() },
      tip: this.tutorial >= 0 ? TUTORIAL[this.tutorial] : '',
    });
  }

  /** Who made the kills, most first: each soldier class (how many of them), structure and strike. */
  killers() {
    const w = this.world;
    return Object.entries(w.killsBy).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => {
      const men = isUnit(id) ? w.soldiers.filter((s) => s.kind === id).length : 0;
      return `${id ? nameOf(id) : 'Other'}${men > 1 ? ` ×${men}` : ''}: ${n.toLocaleString()}`;
    });
  }

  chipLines(p: Payout) {
    const pc = (v: number) => `+${Math.round(v * 100)}%`;
    return [
      `Kills: ${p.base} chips${this.world.phase === 'lost' ? ', half kept' : ''}`,
      ...(p.timeBonus ? [`Time bonus ${pc(p.timeBonus)}`] : []),
      ...(p.leakBonus ? [`Few leaks ${pc(p.leakBonus)}`] : []),
      ...(this.build.chipGain > 1 ? [`Chip gain ${pc(this.build.chipGain - 1)}`] : []),
      ...(p.firstClear ? [`First clear +${p.firstClear}`] : []),
    ];
  }
}
