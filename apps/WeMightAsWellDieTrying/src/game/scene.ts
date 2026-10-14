// The game screen: draws the World and turns touches and clicks into orders. All rules live in sim/.
import Phaser from 'phaser';
import map from '../data/maps/new-york.json' with { type: 'json' };
import palette from '../data/palette.json' with { type: 'json' };
import waves from '../data/waves.json' with { type: 'json' };
import { bake, icon, load } from '../art/atlas.ts';
import {
  PRIORITIES, ROADBLOCKS, STEP, STRUCTS, UNITS, USABLES, World, ZOMBIE_KINDS, ZOMBIES, indirect, support,
  type BlockKind, type Roadblock, type Soldier, type StructKind, type Structure, type UnitKind, type UsableKind,
} from '../sim/world.ts';
import { Hud, type Group } from './hud.ts';

// ponytail: what you own is fixed here until the skill tree (Phase 5) decides it.
// For now some of everything, so each can be tried out. Usables come with the charges in structures.json.
const LOADOUT: Record<string, number> = {
  rifleman: 4, sniper: 1, machinegunner: 1, flamethrower: 1, bazooka: 1, shield: 1, mortar: 1, medic: 1, marksman: 1, shotgunner: 1,
  engineer: 1, grenadier: 1, operator: 1,
  plastic: 3, wood: 2, sandbags: 2, car: 1, cement: 1,
  watchtower: 1, nest: 2, incendiary: 1, ammo: 1, mine: 4, wire: 2, explosives: 1, rigged: 1, puddle: 2, generator: 1, spikes: 2, noise: 1,
};
const MAX_STEPS = 8; // per frame: a very slow frame loses time rather than spiralling
const MAX_ZOOM = 4;
const WALK = ZOMBIE_KINDS.map((k) => [`${k}-walk/0`, `${k}-walk/1`]);
const PIECES = new Set(['plastic', 'wood', 'sandbags', 'cement', 'wire', 'spikes']); // drawn tile by tile; the rest as one sprite

type Thing = Soldier | Roadblock | Structure;
const isUnit = (id: string): id is UnitKind => id in UNITS;
const isUsable = (id: string): id is UsableKind => id in USABLES;
const isBlockKind = (id: string): id is BlockKind => id in ROADBLOCKS;
const isSoldier = (o?: Thing): o is Soldier => !!o && o.kind in UNITS;
const isBlock = (o?: Thing): o is Roadblock => !!o && o.kind in ROADBLOCKS;
const nameOf = (id: string) => (isUnit(id) ? UNITS[id] : isUsable(id) ? USABLES[id] : isBlockKind(id) ? ROADBLOCKS[id] : STRUCTS[id as StructKind]).name;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
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
  top!: Phaser.GameObjects.Graphics;
  pending?: Soldier; // a sentry operator waiting for a tap to set his turret down

  constructor() { super('game'); }

  preload() { load(this); }

  create() {
    bake(this);
    this.world = new World(map, waves['new-york']);
    Object.assign(this, { speed: 1, acc: 0, selected: undefined, drag: undefined, pending: undefined, zombies: [], soldiers: new Map(), blocks: new Map(), planes: [] });
    const horde = Number(new URLSearchParams(location.search).get('horde'));
    if (horde > 0) this.world.horde(Math.min(horde, 4000));
    if (import.meta.env.DEV) Object.assign(window, { game: this }); // for poking at it from the console or a test
    this.drawMap();
    this.floor = this.add.graphics().setDepth(1);
    this.top = this.add.graphics().setDepth(10);
    this.setupCamera();
    this.setupInput();
    const ids = [...Object.keys(LOADOUT), ...Object.keys(USABLES)];
    const items = ids.map((id) => ({
      id,
      name: nameOf(id),
      group: (isUnit(id) ? 'units' : isUsable(id) ? 'strikes' : 'build') as Group,
      icon: icon(this, isUnit(id) ? `${id}-idle-6/0` : `${id}/0`),
    }));
    this.hud = new Hud(document.getElementById('hud')!, items, {
      drag: (id, e) => this.beginPlace(id, e),
      start: () => this.world.start(),
      speed: (n) => (this.speed = n),
      action: (a) => this.act(a),
      again: () => this.scene.restart(),
    });
  }

  // ---- Camera: pinch or wheel to zoom, drag empty ground (or two fingers, or right-drag) to pan ----

  get mapW() { return this.world.grid.w * this.world.grid.tile; }
  get mapH() { return this.world.grid.h * this.world.grid.tile; }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.mapW, this.mapH);
    cam.setZoom(this.clampZoom(this.scale.height / 320));
    cam.centerOn(this.mapW / 2, this.mapH - 230); // the plaza and the streets leading to it
  }

  clampZoom(z: number) {
    const cam = this.cameras.main;
    return Phaser.Math.Clamp(z, Math.max(cam.width / this.mapW, cam.height / this.mapH), MAX_ZOOM);
  }

  toWorld(sx: number, sy: number): [number, number] {
    const cam = this.cameras.main;
    return [cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom, cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom];
  }

  /** Zooms keeping the world point under (sx, sy) where it is. */
  zoomAt(sx: number, sy: number, z: number) {
    const cam = this.cameras.main, [wx, wy] = this.toWorld(sx, sy);
    cam.setZoom(this.clampZoom(z));
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
    const [wx, wy] = this.toWorld(p.x, p.y), grab = Math.max(10, 22 / cam.zoom), sel = this.selected;
    if (this.pending) {
      const turret = this.world.deployTurret(this.pending, wx, wy);
      this.pending = undefined;
      if (turret) { this.selected = turret; return; }
    }
    if (isSoldier(sel) && !sel.dead && !UNITS[sel.kind].fixed && !support(UNITS[sel.kind])) {
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
    this.pointer = { x: p.x, y: p.y };
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
    const [wx, wy] = this.toWorld(p.x, p.y), [tx, ty] = this.tileOf(wx, wy);
    if (d.kind === 'pan' && d.travel < 8) this.selected = undefined; // a tap on empty ground
    if (d.kind === 'move' && d.moved) this.world.moveSoldier(d.s, wx, wy);
    if (d.kind === 'shift' && d.moved) {
      if (isBlock(d.o)) this.world.moveBlock(d.o, tx, ty);
      else this.world.moveStructure(d.o, tx, ty);
    }
  }

  /** Dragging from the bar: follows the finger anywhere on the page and drops onto the map. */
  beginPlace(id: string, e: PointerEvent) {
    if (this.available(id) <= 0 || this.world.phase === 'won' || this.world.phase === 'lost') return;
    this.drag = { kind: 'place', id };
    this.selected = undefined;
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
      const { x, y } = this.toCanvas(ev), [wx, wy] = this.toWorld(x, y), [tx, ty] = this.tileOf(wx, wy), w = this.world;
      if (isUsable(id)) w.callStrike(id, wx, wy, this.dragAngle);
      else this.selected = isUnit(id) ? w.placeSoldier(id, wx, wy) : isBlockKind(id) ? w.placeBlock(id, tx, ty, false) : w.placeStructure(id as StructKind, tx, ty);
    };
    move(e);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  toCanvas(ev: PointerEvent) {
    const r = this.game.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * this.scale.width) / r.width, y: ((ev.clientY - r.top) * this.scale.height) / r.height };
  }

  act(action: string) {
    const sel = this.selected, w = this.world;
    if (isSoldier(sel) && action.startsWith('Target')) sel.priority = PRIORITIES[(PRIORITIES.indexOf(sel.priority) + 1) % PRIORITIES.length];
    if (isSoldier(sel) && action === 'Deploy turret') this.pending = sel;
    if (action === 'Cancel') this.pending = undefined;
    if (!sel || isSoldier(sel)) {
      if (action === 'Remove' && isSoldier(sel)) w.removeSoldier(sel);
    } else if (isBlock(sel)) {
      if (action === 'Turn') w.moveBlock(sel, sel.tx, sel.ty, !sel.vertical);
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
    return LOADOUT[id] - (this.world.used[id] ?? 0);
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
      this.acc += (Math.min(delta, 100) / 1000) * this.speed;
      let n = 0;
      while (this.acc >= STEP && n++ < MAX_STEPS) {
        w.step(STEP);
        this.acc -= STEP;
      }
      if (n > MAX_STEPS) this.acc = 0;
    }
    this.anims.globalTimeScale = w.phase === 'wave' ? this.speed : 1;
    const sel = this.selected;
    if (sel && (isSoldier(sel) ? sel.dead || !w.soldiers.includes(sel) : isBlock(sel) ? !w.roadblocks.includes(sel) : !w.structures.includes(sel))) this.selected = undefined;
    this.drawZombies();
    this.drawSoldiers();
    this.drawBuilt();
    this.drawOverlay();
    this.updateHud();
  }

  drawZombies() {
    const w = this.world, t = w.time, hurt = hex(palette.blood1) | 0x404040, burning = hex(palette.flash0);
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
        const frames = pieced ? tiles.map((_, k) => (o.kind === 'plastic' ? `plastic/${k % 2}` : `${o.kind}/0`)) : [`${o.kind}/0`];
        this.blocks.set(o, (sprites = frames.map((f) => this.add.sprite(0, 0, 'sprites', f).setDepth(o.kind === 'watchtower' || o.kind === 'nest' ? 2.9 : 1.5))));
      }
      const turn = o.vertical ? Math.PI / 2 : 0;
      if (pieced) tiles.forEach((i, k) => sprites[k].setPosition(((i % gw) + 0.5) * T, (Math.floor(i / gw) + 0.5) * T).setRotation(turn));
      else if (block) sprites[0].setPosition((o.tx + 0.5) * T, (o.ty + 0.5) * T).setRotation(turn);
      else sprites[0].setPosition((o as Structure).x, (o as Structure).y).setRotation(o.kind === 'rigged' ? (o as Structure).angle : 0);
      if (block) {
        const c = Math.round(255 * (0.5 + (0.5 * o.hp) / ROADBLOCKS[o.kind].hp)); // darker as it breaks
        for (const sp of sprites) sp.setTint(Phaser.Display.Color.GetColor(c, c, c));
      }
    }
    for (const [o, sprites] of this.blocks) if (!things.includes(o)) { sprites.forEach((sp) => sp.destroy()); this.blocks.delete(o); }
  }

  drawOverlay() {
    const w = this.world, z = this.cameras.main.zoom, sel = this.selected, d = this.drag, T = w.grid.tile, t = w.time;
    const floor = this.floor.clear(), top = this.top.clear();
    const paint = hex(palette.paint), light = hex(palette.flash1), bad = hex(palette.blood1), dark = hex(palette.outline);
    const flame = hex(palette.flash0), metal = hex(palette.metal2), smoke = hex(palette.metal2), water = hex(palette.cloth1);
    const tileRect = (g: Phaser.GameObjects.Graphics, i: number) => g.strokeRect((i % w.grid.w) * T, Math.floor(i / w.grid.w) * T, T, T);

    // Electric puddles: they spark while a generator powers them.
    for (const st of w.structures) {
      if (st.kind !== 'puddle') continue;
      const r = STRUCTS.puddle.radius!, live = w.powered(st);
      floor.fillStyle(water, 0.75).fillCircle(st.x, st.y, r * 0.8).fillCircle(st.x + r * 0.35, st.y + r * 0.2, r * 0.55).fillCircle(st.x - r * 0.3, st.y - r * 0.25, r * 0.5);
      if (live) for (let k = 0; k < 4; k++) floor.fillStyle(light, 0.9).fillRect(st.x + (Math.random() - 0.5) * r * 1.4, st.y + (Math.random() - 0.5) * r * 1.4, 1.5, 1.5);
    }
    // Fire, smoke and lures on the ground.
    for (const zn of w.zones) {
      if (zn.kind === 'fire')
        for (let k = 0; k < 16; k++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * zn.r;
          floor.fillStyle(k % 4 ? flame : bad, 0.7).fillCircle(zn.x + Math.cos(a) * r, zn.y + Math.sin(a) * r, 2 + Math.random() * 3);
        }
      else if (zn.kind === 'smoke') for (let k = 0; k < 7; k++) top.fillStyle(smoke, 0.22).fillCircle(zn.x + Math.cos(k * 0.9 + t) * zn.r * 0.5, zn.y + Math.sin(k * 1.3 + t) * zn.r * 0.5, zn.r * 0.55);
      else top.lineStyle(2 / z, bad, 0.6).strokeCircle(zn.x, zn.y, zn.r * ((t * 0.8) % 1)).fillStyle(bad, 0.9).fillCircle(zn.x, zn.y, 3);
    }

    // On the ground: each soldier's cone, a mortar's landing zone, a medic's or engineer's reach. The selected one brighter.
    for (const s of w.soldiers) {
      if (s.dead) continue;
      const u = UNITS[s.kind], alpha = s === sel ? 0.18 : 0.07;
      if (support(u)) {
        if (s === sel) floor.fillStyle(hex(palette.rot2), 0.12).fillCircle(s.x, s.y, u.range);
      } else if (indirect(u)) floor.fillStyle(paint, alpha).fillCircle(...w.aimPoint(s), u.scatter! + u.blast!);
      else floor.fillStyle(paint, alpha).slice(s.x, s.y, w.rangeOf(s), s.angle - w.spread(s), s.angle + w.spread(s), false).fillPath();
    }
    if (isSoldier(sel)) {
      const u = UNITS[sel.kind];
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
      const k = STRUCTS[sel.kind];
      top.lineStyle(1.5 / z, light, 0.9);
      for (const i of w.structTiles(sel.kind, sel.tx, sel.ty, sel.vertical)!) tileRect(top, i);
      if (k.radius) top.lineStyle(1 / z, paint, 0.6).strokeCircle(sel.x, sel.y, k.radius);
      if (sel.kind === 'puddle' || sel.kind === 'generator') top.lineStyle(1 / z, paint, 0.4).strokeCircle(sel.x, sel.y, STRUCTS.puddle.power!);
      if (sel.kind === 'rigged') top.lineStyle(1.5 / z, bad, 0.7).lineBetween(sel.x, sel.y, sel.x + Math.cos(sel.angle) * k.distance!, sel.y + Math.sin(sel.angle) * k.distance!);
      if (sel.kind === 'explosives') top.lineStyle(1 / z, bad, 0.6).strokeCircle(sel.x, sel.y, k.blast!);
    }

    // Flames from a flamethrower that just fired.
    for (const s of w.soldiers) {
      const u = UNITS[s.kind];
      if (s.dead || u.weapon !== 'flame' || !w.firing(s)) continue;
      for (let k = 0; k < 12; k++) {
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
      const u = USABLES[s.kind];
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

    // Health bars, only once something is hurt.
    const bar = (x: number, y: number, frac: number) => {
      top.fillStyle(dark, 1).fillRect(x - 8, y, 16, 3);
      top.fillStyle(frac > 0.5 ? hex(palette.rot2) : bad, 1).fillRect(x - 8, y, 16 * frac, 3);
    };
    for (const s of w.soldiers) if (!s.dead && s.hp < UNITS[s.kind].hp) bar(s.x, s.y - 14, s.hp / UNITS[s.kind].hp);
    for (const rb of w.roadblocks) {
      const max = ROADBLOCKS[rb.kind].hp;
      if (rb.hp < max) bar((rb.tx + 0.5) * T, rb.ty * T - (rb.vertical ? T + 5 : 5), rb.hp / max);
    }
    for (const st of w.structures) if (st.kind === 'spikes' && st.hp < STRUCTS.spikes.hp!) bar(st.x, st.y - 10, st.hp / STRUCTS.spikes.hp!);

    // Where a drag would put things: pale if it fits, red if not.
    if (!d || this.pointer.x < 0) return;
    const [wx, wy] = this.toWorld(this.pointer.x, this.pointer.y), [tx, ty] = this.tileOf(wx, wy);
    const ghost = (fits: boolean, tiles: number[] | undefined) => {
      top.lineStyle(1.5 / z, fits ? light : bad, 0.9);
      for (const i of tiles ?? []) tileRect(top, i);
    };
    if (d.kind === 'move' && d.moved) {
      top.lineStyle(1.5 / z, w.canStand(wx, wy) ? light : bad, 0.9).lineBetween(d.s.x, d.s.y, wx, wy).strokeCircle(wx, wy, 6);
    } else if (d.kind === 'shift' && d.moved) {
      if (isBlock(d.o)) ghost(w.blockFits(d.o.kind, tx, ty, d.o.vertical, d.o), w.blockTiles(d.o.kind, tx, ty, d.o.vertical));
      else ghost(w.structFits(d.o.kind, tx, ty, d.o.vertical, d.o), w.structTiles(d.o.kind, tx, ty, d.o.vertical));
    } else if (d.kind === 'place') {
      const id = d.id;
      if (isUnit(id)) top.lineStyle(1.5 / z, w.canStand(wx, wy) ? light : bad, 0.9).strokeCircle(wx, wy, 7);
      else if (isBlockKind(id)) ghost(w.blockFits(id, tx, ty, false), w.blockTiles(id, tx, ty, false));
      else if (isUsable(id)) {
        const u = USABLES[id];
        if (id === 'a10') {
          const cx = (Math.cos(this.dragAngle) * u.length!) / 2, cy = (Math.sin(this.dragAngle) * u.length!) / 2;
          top.lineStyle(u.width!, bad, 0.25).lineBetween(wx - cx, wy - cy, wx + cx, wy + cy);
        } else top.lineStyle(1.5 / z, bad, 0.9).strokeCircle(wx, wy, u.blast ?? u.radius!);
      } else ghost(w.structFits(id as StructKind, tx, ty, false), w.structTiles(id as StructKind, tx, ty, false));
    }
  }

  updateHud() {
    const w = this.world, sel = this.selected, planning = w.phase === 'plan', waving = w.phase === 'wave';
    const summary = `${w.kills} kills · ${w.leaks} leaks · ${clock(w.time)}`;
    const ids = [...Object.keys(LOADOUT), ...Object.keys(USABLES)];
    let selection = '';
    if (this.pending) selection = 'Tap where the turret goes';
    else if (isSoldier(sel)) selection = `${UNITS[sel.kind].name} · ${Math.ceil(sel.hp)} HP`;
    else if (isBlock(sel)) selection = `${ROADBLOCKS[sel.kind].name} · ${Math.ceil(sel.hp)} HP`;
    else if (sel) selection = STRUCTS[sel.kind].name + (sel.kind === 'puddle' ? (w.powered(sel) ? ' · live' : ' · needs a generator') : '');
    const turnable = (isBlock(sel) && !ROADBLOCKS[sel.kind].fixed) || (!!sel && !isSoldier(sel) && !isBlock(sel) && (sel.kind === 'wire' || sel.kind === 'spikes' || sel.kind === 'rigged'));
    this.hud.update({
      status: [planning ? 'Plan your defence' : `Wave ${Math.min(w.wave + 1, w.waves)}/${w.waves}`, `Leaks ${w.leaks}/${w.leakLimit}`, `${w.kills} kills`],
      warn: w.leaks >= w.leakLimit * 0.7,
      counts: Object.fromEntries(ids.map((id) => [id, this.available(id)])),
      // A strike can only be called in once the wave is on, and not again until it has cooled down.
      ready: Object.fromEntries(ids.map((id) => [id, isUsable(id) ? w.strikeReady(id) : this.available(id) > 0])),
      cool: Object.fromEntries(Object.keys(USABLES).map((id) => [id, waving ? Math.max(0, w.readyAt[id as UsableKind] - w.time) / USABLES[id as UsableKind].cooldown : 0])),
      planning,
      speed: this.speed,
      selection,
      actions: [
        ...(isSoldier(sel) && UNITS[sel.kind].weapon === 'sniper' ? [`Target: ${sel.priority}`] : []),
        ...(isSoldier(sel) && sel.turrets > 0 ? [this.pending ? 'Cancel' : 'Deploy turret'] : []),
        ...(waving && sel?.kind === 'explosives' ? ['Detonate'] : []),
        ...(waving && sel?.kind === 'noise' ? ['Sound off'] : []),
        ...(planning && turnable ? ['Turn'] : []),
        ...(planning && sel ? ['Remove'] : []),
      ],
      end: w.phase === 'won' ? { title: 'You held the line', detail: summary } : w.phase === 'lost' ? { title: 'Overrun', detail: summary } : undefined,
    });
  }

  // ---- The map, drawn once into one texture ----

  drawMap() {
    if (!this.textures.exists('map')) {
      const { w, h, tile: T, wall, goal } = this.world.grid, W = w * T, H = h * T;
      const tex = this.textures.createCanvas('map', W, H)!, c = tex.context;
      const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || wall[y * w + x] === 1;
      c.fillStyle = palette.asphalt1;
      c.fillRect(0, 0, W, H);
      for (let k = 0; k < w * h * 6; k++) {
        c.fillStyle = k % 2 ? palette.asphalt0 : palette.asphalt2;
        c.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1);
      }
      // One roof colour per city block.
      const roofs = [palette.cloth1, palette.blood0, palette.khaki0, palette.metal1, palette.rot0], blockOf = new Int32Array(w * h).fill(-1);
      for (let i = 0, id = 0; i < w * h; i++) {
        if (!wall[i] || blockOf[i] >= 0) continue;
        for (const stack = [i]; stack.length; ) {
          const j = stack.pop()!, x = j % w, y = (j - x) / w;
          if (blockOf[j] >= 0 || !wall[j]) continue;
          blockOf[j] = id;
          if (x > 0) stack.push(j - 1);
          if (x < w - 1) stack.push(j + 1);
          if (y > 0) stack.push(j - w);
          if (y < h - 1) stack.push(j + w);
        }
        id++;
      }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x, px = x * T, py = y * T;
          if (goal[i]) {
            // The evacuation point: paving.
            c.fillStyle = palette.khaki0;
            c.fillRect(px, py, T, T);
            c.fillStyle = palette.asphalt2;
            c.fillRect(px, py, T, 1);
            c.fillRect(px, py, 1, T);
          } else if (!wall[i]) {
            // Buildings cast shadows down and to the right, like the sprites.
            c.fillStyle = 'rgba(0,0,0,0.28)';
            if (isWall(x - 1, y)) c.fillRect(px, py, 4, T);
            if (isWall(x, y - 1)) c.fillRect(px, py, T, 4);
          } else {
            c.fillStyle = roofs[blockOf[i] % roofs.length];
            c.fillRect(px, py, T, T);
            c.fillStyle = palette.outline;
            if (!isWall(x + 1, y)) c.fillRect(px + T - 1, py, 1, T);
            if (!isWall(x, y + 1)) c.fillRect(px, py + T - 1, T, 1);
            if (!isWall(x - 1, y)) c.fillRect(px, py, 1, T);
            if (!isWall(x, y - 1)) c.fillRect(px, py, T, 1);
            c.fillStyle = 'rgba(255,255,255,0.12)'; // the parapet catches the light
            if (!isWall(x - 1, y)) c.fillRect(px + 1, py, 1, T);
            if (!isWall(x, y - 1)) c.fillRect(px, py + 1, T, 1);
            if (Math.random() < 0.05 && isWall(x - 1, y) && isWall(x + 1, y) && isWall(x, y - 1) && isWall(x, y + 1)) {
              c.fillStyle = palette.outline; // a vent or AC unit on the roof
              c.fillRect(px + 4, py + 4, 7, 6);
              c.fillStyle = palette.metal2;
              c.fillRect(px + 4, py + 4, 6, 5);
            }
          }
        }
      tex.refresh();
    }
    this.add.image(0, 0, 'map').setOrigin(0);
  }
}
