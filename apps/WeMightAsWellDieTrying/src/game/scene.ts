// The game screen: draws the World and turns touches and clicks into orders. All rules live in sim/.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { bake, icon, load } from '../art/atlas.ts';
import { RESCUED, VARIANTS } from '../art/sprites.ts';
import { NODE, NODES, PACE, payout, build, type Build, type Payout } from '../meta/progress.ts';
import { MAPS, blinds, drizzles, persist, profile, weatherLine, weatherOf } from '../meta/profile.ts';
import { DIFFICULTY, KEY_ACTIONS, MEMORIAL, type KeyAction } from '../meta/save.ts';
import { keyName } from './settings.ts';
import { award } from '../meta/medals.ts';
import { Grid, type MapData } from '../sim/grid.ts';
import { ambience } from './ambience.ts';
import { atmosphere, darkOut, weatherShade, type Atmosphere } from './atmosphere.ts';
import { DEBUG_EACH, DEBUG_MAP, DEBUG_STRIKES, debugView } from './debugmap.ts';
import { Flames } from './flame.ts';
import { mapAnims } from './mapanims.ts';
import { drawn, paintMap } from './mapart.ts';
import {
  CIVILIAN_HOLD, PRIORITIES, ROADBLOCKS, STEP, STRUCTS, UNITS, USABLES, World, ZOMBIE_KINDS, ZOMBIES, indirect, support,
  type BlockKind, type Civilian, type Roadblock, type Soldier, type StructKind, type Structure, type UnitKind, type UsableKind,
} from '../sim/world.ts';
import { Hud, type Group } from './hud.ts';
import { settingsSheet } from './settings.ts';
import { city, hordeLevel, music, play } from './sound.ts';
import { startLoading, stopLoading } from './loading.ts';
import type { View } from '../story/player.ts';
// The story's player and its pictures are only fetched when a scene plays (they are a good part of the game's code).
type StoryPlayer = typeof import('../story/player.ts');
const storyPlayer = () => import('../story/player.ts');
const unseen = (id: string) => !profile.save.story.seen.includes(id);
import { LOST_LINES } from '../story/storyConfig.ts';

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
/** The tip for civilians, shown once on a device (the first fight with them) until one is brought out or it is skipped. */
const CIV_TIP = 'A light by a door or a car: someone is still hiding there. Stand a soldier there for 3 seconds to bring them out, then tap or drag them to the safe zone.';
const CIV_TIP_KEY = 'dietrying.civtip';
const civTipSeen = () => { try { return localStorage.getItem(CIV_TIP_KEY) === '1'; } catch { return true; } };
const civTipDone = () => { try { localStorage.setItem(CIV_TIP_KEY, '1'); } catch { /* storage blocked: shown again next time */ } };
/** Milliseconds of fighting worked out per frame at most (5× needs 25 steps a frame at 60 fps). Past it a big fight on
 *  a slow device runs slower than the speed asked for, and still draws, rather than freezing up. */
const STEP_BUDGET = 25;
const MAX_ZOOM = 4;
const HUD_TOP = 56, HUD_BOTTOM = 104; // screen pixels the status row and the bar cover, until the HUD is there to measure
const LIFT = 36; // a finger drags things this far above itself, so it does not hide where they go
const GRAB = { touch: 34, mouse: 22 }; // how near (screen pixels) a soldier or his handle has to be to pick it up
const VEHICLES = new Set(['car', 'taxi', 'bus', 'jeepney']); // roadblocks that are vehicles: their headlights after dark
const PENCIL = 0xe8e2cc; // the soldiers' cones, sketched in pencil
const ZOMBIES_BY = Object.fromEntries(ZOMBIE_KINDS.map((k, i) => [k, ZOMBIES[i]]));
/** Each zombie kind's looks (its own, then the variants in other clothes), each a walk of two frames. */
const WALK = ZOMBIE_KINDS.map((k) => [k, ...Array.from({ length: Math.max(0, (VARIANTS[k as keyof typeof VARIANTS]?.length ?? 0) - 1) }, (_, n) => `${k}${n + 1}`)].map((a) => [`${a}-walk/0`, `${a}-walk/1`]));
/** A shade for each zombie, a little darker or not, so a crowd of one look is not one colour. */
const SHADES = [0xffffff, 0xe8e8e8, 0xd4d4d4, 0xf0e8e0, 0xdcdcd0];
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
/** A soldier's rank, by the kills he has made this fight. */
const rank = (kills: number) => (kills >= 400 ? 'Lt.' : kills >= 150 ? 'Sgt.' : kills >= 50 ? 'Cpl.' : 'Pvt.');
/** A buzz on a phone that can (a blast, a soldier falling), unless the setting is off. */
const buzz = (pattern: number | number[]) => { if (profile.settings.haptics) try { navigator.vibrate?.(pattern); } catch { /* not allowed here */ } };
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Drag =
  | { kind: 'pan'; x: number; y: number; travel: number }
  | { kind: 'pinch'; dist: number; zoom: number; x: number; y: number }
  | { kind: 'aim'; s: Soldier }
  | { kind: 'move'; s: Soldier; x: number; y: number; moved: boolean }
  | { kind: 'civ'; c: Civilian; x: number; y: number; moved: boolean }
  | { kind: 'shift'; o: Roadblock | Structure; x: number; y: number; moved: boolean }
  | { kind: 'place'; id: string }
  | { kind: 'strike' };

export class Game extends Phaser.Scene {
  world!: World;
  hud!: Hud;
  speed = 1;
  acc = 0;
  selected?: Thing;
  driving?: Soldier; // the soldier the player is playing as (WASD to walk, the mouse to aim and shoot)
  held = new Set<string>(); // WASD keys down
  drag?: Drag;
  pointer = { x: -1, y: -1 }; // screen point of the drag in progress
  dragAngle = -Math.PI / 2; // which way the finger was last moving: an A-10 flies that way
  zombies: Phaser.GameObjects.Sprite[] = [];
  soldiers = new Map<Soldier, Phaser.GameObjects.Sprite>();
  blocks = new Map<Roadblock | Structure, Phaser.GameObjects.Sprite[]>();
  flyers: Phaser.GameObjects.Sprite[] = []; // strikes in the air, and their shadows
  strikeAim?: { x: number; y: number; angle: number }; // an A-10 run put down, waiting to be dragged the way it flies
  floor!: Phaser.GameObjects.Graphics;
  /** Where the horde comes in: each run of spawn tiles at the map edge, and the way in from it. */
  entries: { tiles: number[]; x: number; y: number; dx: number; dy: number; label: Phaser.GameObjects.Text }[] = [];
  top!: Phaser.GameObjects.Graphics;
  pending?: Soldier; // a sentry operator waiting for a tap to set his turret down
  armed?: string; // a bar item tapped: the next tap on the map puts it down there
  mapId = new URLSearchParams(location.search).get('play') || MAPS[0].id; // ?play=<map id> starts there (main.ts)
  mapData!: MapData;
  build!: Build;
  loadout: Record<string, number> = {};
  ids: string[] = [];
  paid?: Payout; // the chips this run paid, once it is over
  sketch?: string; // the report's sketch of the fight, drawn once it is over
  diffChips = 0; // of which the save's difficulty added (or took off, on Easy)
  medals: string[] = []; // medals this fight earned
  civ?: Civilian; // the civilian picked (out of their building), to walk to the safe zone
  civState = new Map<Civilian, string>(); // each civilian's state last frame, to notice a change
  civSprites = new Map<Civilian, Phaser.GameObjects.Sprite>(); // each one brought out, walking
  civRoutes = new WeakMap<object, [number, number][]>(); // the way each is being walked, worked out once per order
  civChips = 0; // what the civilians saved paid
  civTip = false; // the tip for civilians is up (once a device)
  skipChips = 0; // what cutting breaks short paid
  atmos!: Atmosphere; // the weather and the light (game/atmosphere.ts)
  shade: [number, number, number] = [1, 1, 1]; // the weather's darkening, as a tint for what stands above the ground
  headlamps = false; // dark enough for headlights
  beams = new Map<Roadblock, Phaser.GameObjects.Image[]>(); // each working vehicle's headlights
  gray?: Phaser.FX.ColorMatrix; // drains the colour as leaks mount
  grayAt = 0; // how drained it is now, 0 to 1
  peak = 0; // the most soldiers standing at once this fight, for the red at the screen's edges
  lastSpeed = 1; // the speed to go back to when unpaused by key
  metAt = 0; // when the field manual last looked for anyone new
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
  inStory = false; // a scene is playing over the map: the fight keeps still and the HUD hides
  lostLine = ''; // what the Commander says on the end panel after a loss
  unlimited = false; // debug: leaks never lose the fight (kept through Play again)
  muted = false; // the skill tree's demo plays without sound
  flames = new Flames();
  picked?: Thing; // the selection last frame: a soldier newly picked says something
  debug = false; // the route test map (game/debugmap.ts): everything to hand, nothing paid or kept
  showRoutes = false; // the horde's routes drawn, each zombie coloured by how it keeps to its route
  animate = (_dt: number) => {}; // the map's lamps, water, wind and birds (game/mapanims.ts)

  constructor(key = 'game') { super(key); }

  init(data: { map?: string }) { this.mapId = data.map ?? this.mapId; }

  preload() { load(this); }

  create() {
    bake(this);
    const m = this.mapId === DEBUG_MAP.id ? DEBUG_MAP : MAPS.find((x) => x.id === this.mapId) ?? MAPS[0], save = profile.save;
    this.mapData = m.data;
    this.debug = m === DEBUG_MAP;
    this.showRoutes = this.debug || debugView.routes;
    this.build = build(this.debug ? Object.fromEntries(NODES.map((n) => [n.id, n.max])) : save.skills);
    if (this.debug) {
      // Every soldier, roadblock and structure to hand, every strike, upgraded all the way; no leak limit.
      for (const id of [...Object.keys(UNITS).filter((k) => k !== 'turret'), ...Object.keys(ROADBLOCKS), ...Object.keys(STRUCTS)]) this.build.loadout[id] = DEBUG_EACH;
      for (const u of Object.values(this.build.stats.usables)) u.charges = DEBUG_STRIKES;
      this.build.stats.leakLimit = 99999;
    }
    // The save's difficulty: fewer or more leaks allowed, zombies tougher or weaker, more or fewer of them.
    const diff = DIFFICULTY[this.debug ? 'normal' : save.difficulty];
    this.build.stats.leakLimit = Math.max(1, Math.round(this.build.stats.leakLimit * diff.leaks));
    this.loadout = this.build.loadout;
    this.world = new World(m.data, m.waves, (Math.random() * 1e9) | 0, this.build.stats);
    this.world.hpBy = diff.hp;
    this.world.countBy = diff.count;
    if (blinds(weatherOf(m.id))) this.world.sightBy = 1 - diff.weather;
    if (!this.debug) this.world.placeCivilians(3);
    this.civTip = !this.debug && this.world.civilians.length > 0 && !civTipSeen();
    if (this.unlimited) this.world.leakLimit = Infinity;
    Object.assign(this, { shownWave: -1, hovered: undefined, speed: 1, acc: 0, selected: undefined, drag: undefined, pending: undefined, armed: undefined, zombies: [], soldiers: new Map(), blocks: new Map(), flyers: [], strikeAim: undefined, paid: undefined, sketch: undefined, beams: new Map(), diffChips: 0, civ: undefined, civState: new Map(), civSprites: new Map(), civChips: 0, skipChips: 0, medals: [], metAt: 0, peak: 0, lastSpeed: 1, corpses: [], fallen: new Set(), downs: [] });
    this.tutorial = !save.tutorialDone && m === MAPS[0] ? 0 : -1;
    this.ids = ORDER.filter((id) => (isUsable(id) ? this.world.charges[id] : this.loadout[id] ?? 0) > 0);
    const horde = Number(new URLSearchParams(location.search).get('horde'));
    if (horde > 0) this.world.horde(Math.min(horde, 4000));
    if (import.meta.env.DEV) Object.assign(window, { game: this }); // for poking at it from the console or a test
    const blood = profile.settings.gore !== 'none';
    // Only this map's painting is kept (Play again needs no new one): at their size, all of them would fill a phone.
    for (const k of this.textures.getTextureKeys()) if (k.startsWith('map-') && k !== `map-${m.id}-${blood}`) this.textures.remove(k);
    const art = paintMap(this, m.data, new Grid(m.data), `map-${m.id}-${blood}`, blood); // the map as drawn: the world's own grid has the armour walled in
    this.add.image(0, 0, art).setOrigin(0);
    ambience(this, drawn.get(art) ?? [], Math.round(24 * QUALITY[profile.settings.quality].particles));
    this.animate = mapAnims(this, m.data, this.world.grid, drawn.get(art) ?? [], QUALITY[profile.settings.quality].particles, { scare: (x, y) => this.scare(x, y), planning: () => this.world.phase === 'plan' });
    this.shade = weatherShade(weatherOf(m.id));
    this.headlamps = darkOut(weatherOf(m.id));
    this.atmos = atmosphere(this, weatherOf(m.id), drawn.get(art) ?? [], this.world.grid.w * this.world.grid.tile, this.world.grid.h * this.world.grid.tile, QUALITY[profile.settings.quality].particles, drizzles(m.id));
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
      settings: () => this.openSettings(),
      routes: () => (this.showRoutes = !this.showRoutes),
      win: () => { if (this.world.phase === 'plan' || this.world.phase === 'wave') this.world.phase = 'won'; },
      leaks: () => { this.unlimited = !this.unlimited; this.world.leakLimit = this.unlimited ? Infinity : this.build.stats.leakLimit; },
      start: () => this.begin(),
      clear: () => { this.world.clearSetup(); this.selected = undefined; },
      speed: (n) => (this.speed = n),
      action: (a) => this.act(a),
      again: () => this.afterStory(() => this.scene.restart()),
      next: () => this.afterStory(() => {
        const k = MAPS.findIndex((m) => m.id === this.mapId);
        if (k >= 0 && k < MAPS.length - 1) this.scene.restart({ map: MAPS[k + 1].id });
        else this.leave('menu'); // the last city: back to the board
      }),
      menu: (to) => this.afterStory(() => this.leave(to)),
      retreat: () => this.retreat(),
      walk: (dx, dy) => { for (const [k, on] of [['a', dx < -0.35], ['d', dx > 0.35], ['w', dy < -0.35], ['s', dy > 0.35]] as const) on ? this.held.add(k) : this.held.delete(k); },
      drive: () => this.drive(),
      skip: () => { if (this.tutorial >= 0) this.endTutorial(); else { this.civTip = false; civTipDone(); } },
      nextWave: () => this.world.skipBreak(),
    });
    this.events.once('shutdown', () => { this.player?.stopScene(); this.hud.destroy(); hordeLevel(0); city(); });
    this.setZoom(this.cameras.main.zoom); // again, now the bars can be measured
    music('game');
    city(this.mapId);
    this.useSetup(); // last time's defence is already down
    // The keyboard's shortcuts (Settings, Controls), unless a scene, a question or the settings are up.
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || this.inStory || document.querySelector('.dialog') || !document.getElementById('menu')!.hidden) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key, keys = profile.settings.keys, a = (Object.keys(keys) as KeyAction[]).find((x) => keys[x] === key);
      if (this.driving && key.length === 1 && 'wasd'.includes(key)) { e.preventDefault(); return; } // walking, not the tabs
      if (!a) return;
      e.preventDefault();
      this.key(a);
    };
    addEventListener('keydown', onKey);
    // Playing as a soldier: WASD held down walks him.
    const hold = (down: boolean) => (e: KeyboardEvent) => { if ('wasd'.includes(e.key.toLowerCase()) && e.key.length === 1) down ? this.held.add(e.key.toLowerCase()) : this.held.delete(e.key.toLowerCase()); };
    const onHold = hold(true), onRelease = hold(false);
    addEventListener('keydown', onHold);
    addEventListener('keyup', onRelease);
    this.events.once('shutdown', () => { removeEventListener('keydown', onKey); removeEventListener('keydown', onHold); removeEventListener('keyup', onRelease); });
    // As the line breaks (leaks toward the limit) the colour drains out of the city.
    this.gray = this.game.renderer.type === Phaser.WEBGL ? this.cameras.main.postFX?.addColorMatrix() : undefined;
    this.grayAt = 0;
    this.cameras.main.setBackgroundColor('#000000').fadeIn(500); // off the map is black
    stopLoading();
    this.hud.banner(m.name, this.debug ? 'Lines are routes. Green: on one; yellow: following; red: making for one' : this.tutorial >= 0 ? 'Learn the ropes here' : weatherOf(m.id) === 'clear' ? '' : weatherLine(m.id));
    // The city's Before scene the first time it is opened (Main Street's is the Opening).
    const before = m === MAPS[0] ? 'opening' : `before:${m.id}`;
    if (!this.debug && unseen(before)) this.tell(before, () => {});
  }

  /** Plays a scene over the map, the HUD hidden and the fight still, then carries on. */
  tell(id: string, then: () => void) {
    const hud = document.getElementById('hud')!;
    this.inStory = true;
    hud.style.visibility = 'hidden';
    void storyPlayer().then((p) => {
      this.player = p;
      if (!this.sys.isActive()) return; // left before it came
      p.runScene(id, this.storyView(p.pose), () => {
        this.inStory = false;
        hud.style.visibility = '';
        music('game');
        then();
      });
    });
  }

  /** Leaving a won fight: the city's After scene first, the first time (the White House's is the Ending). */
  afterStory(then: () => void) {
    if (this.inStory) return;
    const id = this.mapId === MAPS.at(-1)!.id ? 'ending' : `after:${this.mapId}`;
    if (this.world.phase === 'won' && !this.debug && unseen(id)) this.tell(id, then);
    else then();
  }

  /** For a scene's map shots: the ways in, the safe zone's middle, and the way down from each way in to it (every
   *  few tiles, following the horde's distances to the safe zone). */
  storyPoints() {
    const g = this.world.grid, T = g.tile, flow = this.world.flow, at = (i: number): [number, number] => [(i % g.w + 0.5) * T, (Math.floor(i / g.w) + 0.5) * T];
    const goal = g.goals.reduce((s, i) => [s[0] + at(i)[0] / g.goals.length, s[1] + at(i)[1] / g.goals.length], [0, 0]) as [number, number];
    const paths = this.entries.map((e) => {
      let i = e.tiles[Math.floor(e.tiles.length / 2)];
      const out: [number, number][] = [];
      for (let n = 0; n < 4000 && Number.isFinite(flow[i]) && flow[i] > 0; n++) {
        if (n % 5 === 0) out.push(at(i));
        const x = i % g.w, near = [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, i - g.w, i + g.w].filter((j) => j >= 0 && j < flow.length);
        const next = near.reduce((b, j) => (flow[j] < flow[b] ? j : b), i);
        if (next === i) break;
        i = next;
      }
      return out;
    });
    return { entries: this.entries.map((e): [number, number, number, number] => [e.x, e.y, e.dx, e.dy]), goal, paths };
  }

  player?: StoryPlayer; // the story's player, once fetched

  /** The map under a scene's map shots: this camera, moved as the shot says from where it is now, and put back after. */
  storyView(pose: StoryPlayer['pose']): View {
    const cam = this.cameras.main, home = { x: cam.midPoint.x, y: cam.midPoint.y, z: cam.zoom }, now = { x: home.x, y: home.y, z: home.z };
    return {
      live: true,
      frame: (camera, p, t, still, pictureH, lift) => {
        const at = pose(camera, p, t, still, home, pictureH / home.z, this.mapH);
        const z = home.z * at.f;
        Object.assign(now, { x: at.x, y: at.y + lift / z, z }); // the shot's point in the picture's middle, not the screen's
        cam.removeBounds();
        cam.setZoom(now.z);
        cam.centerOn(now.x, now.y);
      },
      project: (x, y) => [(x - now.x) * now.z + cam.width / 2, (y - now.y) * now.z + cam.height / 2],
      points: () => this.storyPoints(),
      end: () => { this.setZoom(home.z); cam.centerOn(home.x, home.y); },
    };
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
    if (!this.debug && (w.soldiers.length || w.structures.length || w.roadblocks.some((rb) => !rb.prop))) {
      profile.save.setups[this.mapId] = w.setup();
      persist();
    }
    w.start();
  }

  /** Puts the kept setup down, as far as what you own now allows (every time a city is opened, unless it is the guided start). */
  useSetup() {
    const kept = profile.save.setups[this.mapId];
    if (!kept || this.debug || this.tutorial >= 0) return;
    this.world.useSetup(kept, this.loadout);
    this.selected = undefined;
  }

  /** A soldier just killed: a notice to tap to look, and a mark where he fell. */
  reportFallen() {
    for (const s of this.world.soldiers) {
      if (!s.dead || this.fallen.has(s)) continue;
      this.fallen.add(s);
      this.downs.push({ x: s.x, y: s.y, at: this.time.now });
      if (!this.muted) { // his cry, then the radio's beep and someone on it
        play('fallen', this.near(s.x, s.y));
        this.shake(140, 0.003);
        this.time.delayedCall(500, () => play('police'));
        this.time.delayedCall(900, () => play('say-down'));
      }
      buzz([60, 40, 60]);
      this.hud.notice(`${rank(s.kills)} ${s.name} down`, () => this.cameras.main.pan(s.x, s.y, 350, 'Sine.easeInOut'));
      if (!this.debug && !s.owner) { // on the memorial
        const f = profile.save.fallen;
        f.push({ name: s.name, kind: s.kind, kills: s.kills, city: this.mapData.name, at: Date.now() });
        if (f.length > MEMORIAL) f.splice(0, f.length - MEMORIAL);
        persist();
      }
    }
  }

  /** A civilian brought out, killed or safe: a notice (tap it to look), and the radio for one brought out. */
  watchCivilians() {
    for (const c of this.world.civilians) {
      const was = this.civState.get(c);
      this.civState.set(c, c.state);
      if (was === undefined || was === c.state) continue;
      const look = () => this.cameras.main.pan(c.x, c.y, 350, 'Sine.easeInOut');
      if (was === 'waiting' && c.state === 'inside') { this.hud.notice('Someone is still in there: hold the spot to bring them out', look); if (!this.muted) play('police'); }
      if (c.state === 'out' && this.civTip) { this.civTip = false; civTipDone(); }
      if (c.state === 'out') { this.hud.notice('A civilian is out: walk them to the safe zone', look); if (!this.muted) play('police'); this.civ = c; this.selected = undefined; }
      if (c.state === 'dead') { this.hud.notice('A civilian was killed', look); buzz(80); if (!this.muted) play('say-civ-scream', this.near(c.x, c.y)); if (this.civ === c) this.civ = undefined; }
      if (c.state === 'saved') {
        this.hud.notice(`Civilian safe: ${this.world.saved}/${this.world.civilians.length}`, look);
        if (!this.muted) { play('police'); this.time.delayedCall(400, () => play('say-saved')); }
        if (this.civ === c) this.civ = undefined;
      }
    }
  }

  /** What a shortcut does. */
  key(a: KeyAction) {
    const w = this.world, sel = this.selected;
    if (a === 'pause' && w.phase === 'wave') { if (this.speed) { this.lastSpeed = this.speed; this.speed = 0; } else this.speed = this.lastSpeed || 1; }
    if (a === 'start') { if (w.phase === 'plan') this.begin(); else w.skipBreak(); } // and between waves: the next one now
    if (a.startsWith('speed')) { const n = this.build.speeds[Number(a.slice(5)) - 1]; if (n) this.speed = this.lastSpeed = n; }
    if (a === 'units' || a === 'build' || a === 'strikes') this.hud.tab(a);
    if (a === 'turn') { if (this.drag?.kind === 'place') this.turned = !this.turned; else if (this.canTurn) this.act('Turn'); }
    if (a === 'remove' && w.phase === 'plan' && sel && !(isBlock(sel) && sel.prop)) this.act('Remove');
    if (a === 'retreat' && isSoldier(sel)) this.act(w.phase === 'plan' ? 'Remove' : 'Retreat');
    if (a === 'deselect' && this.driving) return this.stopDriving();
    if (a === 'deselect') this.selected = this.armed = this.pending = this.strikeAim = undefined;
    if (a === 'help') this.hud.toggleKeys((Object.keys(KEY_ACTIONS) as KeyAction[]).map((k) => [keyName(profile.settings.keys[k]), KEY_ACTIONS[k][1]]));
  }

  /** A jolt of the camera (a big blast, a soldier falling), unless shake is off or the device asks for less motion. */
  shake(ms: number, power: number) {
    if (profile.settings.shake && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.cameras.main.shake(ms, power);
  }

  /** Now and then: any zombie or soldier on the map not yet in the save's field manual goes in it, with a notice. */
  meet() {
    if (this.debug || this.time.now - this.metAt < 1000) return;
    this.metAt = this.time.now;
    const w = this.world, met = profile.save.met, kinds = new Set<string>(w.soldiers.filter((s) => !s.owner).map((s) => s.kind));
    for (let i = 0; i < w.n; i++) if (w.alive[i]) kinds.add(ZOMBIE_KINDS[w.zkind[i]]);
    const fresh = [...kinds].filter((k) => !met.includes(k));
    if (!fresh.length) return;
    met.push(...fresh);
    persist();
    for (const k of fresh) if (k in ZOMBIES_BY) this.hud.notice(`Field manual: ${ZOMBIES_BY[k].name} added`, () => {});
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
    startLoading();
    this.hud.destroy();
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('menu', { open: to === 'menu' ? 'save' : 'tree' }));
  }

  /** Pays the run out once, and saves. */
  settle() {
    const w = this.world, save = profile.save;
    if (this.paid || (w.phase !== 'won' && w.phase !== 'lost')) return;
    if (this.debug) { this.paid = { total: 0, base: 0, timeBonus: 0, leakBonus: 0, firstClear: 0 }; return; } // a test: nothing paid or kept
    const won = w.phase === 'won';
    this.paid = payout({ kills: w.kills, leaks: w.leaks, leakLimit: w.leakLimit, time: w.time, par: this.mapData.par, won, firstClear: won && !save.cleared[this.mapId], chipGain: this.build.chipGain, level: MAPS.findIndex((x) => x.id === this.mapId) + 1 });
    this.diffChips = Math.round(this.paid.total * (DIFFICULTY[save.difficulty].chips - 1)); // the difficulty's share, on top or taken off
    this.paid.total += this.diffChips;
    this.civChips = Math.round(this.paid.base * 0.1 * w.saved); // each civilian saved: a tenth of the kills' chips
    this.paid.total += this.civChips;
    this.skipChips = Math.round(this.paid.base * 0.02 * w.skips); // each break cut short: a fiftieth of the kills' chips
    this.paid.total += this.skipChips;
    save.chips += this.paid.total;
    if (won) save.cleared[this.mapId] = true;
    else this.lostLine = LOST_LINES[Math.floor(Math.random() * LOST_LINES.length)];
    const st = save.stats;
    Object.assign(st, { runs: st.runs + 1, wins: st.wins + (won ? 1 : 0), kills: st.kills + w.kills, leaks: st.leaks + w.leaks, chips: st.chips + this.paid.total, time: st.time + Math.round(w.time) });
    this.medals = award({
      won, map: this.mapId, last: this.mapId === MAPS.at(-1)!.id, leaks: w.leaks, leakLimit: w.leakLimit, fallen: this.fallen.size,
      best: Math.max(0, ...w.soldiers.map((s) => s.kills)), timeBonus: this.paid.timeBonus > 0, saved: w.saved, civilians: w.civilians.length,
    }, save);
    if (this.medals.length) this.time.delayedCall(600, () => play('thud', 0.5));
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

  /** Settings in a window over the fight, which is paused while it is open; Back (or a tap outside it) closes it. */
  openSettings() {
    const root = document.getElementById('menu')!, was = this.speed;
    if (this.world.phase === 'wave') this.speed = 0;
    const close = () => {
      root.hidden = true;
      root.classList.remove('ingame');
      root.onclick = null;
      root.replaceChildren();
      this.speed = was;
      document.getElementById('hud')!.classList.toggle('lefty', profile.settings.lefty);
    };
    const draw = (): void => root.replaceChildren(settingsSheet({ back: close, again: draw, note: 'Gore, quality and dead bodies change from the next fight.', small: true }));
    root.hidden = false;
    root.classList.remove('leaving'); // left on by the menu's fade into the fight
    root.classList.add('ingame');
    root.onclick = (e) => { if (e.target === root) close(); };
    draw();
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

  /** Plays as the picked soldier: only mid-wave, and not a turret, a soldier fixed in place, one indoors or one falling back. */
  canDrive(s: Thing | undefined): s is Soldier {
    const w = this.world;
    return w.phase === 'wave' && isSoldier(s) && !s.dead && !s.owner && !s.indoor && !s.leaving && !w.stats.units[s.kind].fixed && !support(w.stats.units[s.kind]);
  }

  drive() {
    if (this.driving) return this.stopDriving();
    const s = this.selected;
    if (!this.canDrive(s)) return;
    this.driving = s;
    s.dest = undefined;
    this.armed = this.pending = this.strikeAim = this.drag = undefined;
    this.world.control = { s, dx: 0, dy: 0, fire: false };
  }

  stopDriving() {
    this.driving = undefined;
    this.world.control = undefined;
    this.held.clear();
  }

  onDown(p: Phaser.Input.Pointer) {
    if (this.driving) { // the mouse is his gun: aim where it points, fire while it is down
      this.pointer = { x: p.x, y: p.y };
      if (p.leftButtonDown() && this.world.control) this.world.control.fire = true;
      return;
    }
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
    if (this.strikeAim) { // dragging out the A-10's way
      this.drag = { kind: 'strike' };
      return;
    }
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
    // A civilian out of their building: picked up to walk somewhere (the safe zone).
    const civ = this.world.civilians.find((c) => c.state === 'out' && Math.hypot(c.x - wx, c.y - wy) < grab);
    if (civ) {
      this.civ = civ;
      this.selected = undefined;
      this.drag = { kind: 'civ', c: civ, x: p.x, y: p.y, moved: false };
      return;
    }
    let s: Soldier | undefined, best = grab;
    for (const o of this.world.soldiers) {
      const d = Math.hypot(o.x - wx, o.y - wy);
      if (!o.dead && d < best) { best = d; s = o; }
    }
    if (s) {
      this.selected = s;
      this.civ = undefined;
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
    if (this.driving) { this.pointer = { x: p.x, y: p.y }; return; }
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
    else if (d.kind === 'strike') this.aimRun(p);
    else d.moved ||= Math.hypot(p.x - d.x, p.y - d.y) > 8;
  }

  onUp(p: Phaser.Input.Pointer) {
    if (this.driving) { if (this.world.control && !p.leftButtonDown()) this.world.control.fire = false; return; }
    const d = this.drag;
    if (!d || d.kind === 'place') return;
    if (d.kind === 'pinch') {
      if (!this.downPointers().length) this.drag = undefined;
      return;
    }
    this.drag = undefined;
    const [wx, wy] = this.toWorld(p.x, p.y - this.lift(p, d)), [tx, ty] = this.tileOf(wx, wy);
    if (d.kind === 'pan' && d.travel < 8) {
      // A tap on empty ground: puts down what the bar holds, sends the civilian picked there, or lets go of the selection.
      if (this.armed) this.put(this.armed, p.x, p.y);
      else if (this.civ?.state === 'out') this.world.moveCivilian(this.civ, wx, wy);
      else this.selected = this.civ = undefined;
    }
    if (d.kind === 'strike' && this.aimRun(p)) { // let go: called in, flying the way it was dragged
      this.world.callStrike('a10', this.strikeAim!.x, this.strikeAim!.y, this.strikeAim!.angle);
      this.strikeAim = undefined;
    }
    if (d.kind === 'move' && d.moved) this.world.moveSoldier(d.s, wx, wy);
    if (d.kind === 'civ' && d.moved) this.world.moveCivilian(d.c, wx, wy);
    if (d.kind === 'shift' && d.moved) {
      if (isBlock(d.o)) {
        if (d.o.prop) this.world.haulProp(d.o, tx, ty);
        else this.world.moveBlock(d.o, tx, ty);
      }
      else this.world.moveStructure(d.o, tx, ty);
    }
  }

  /** How far above a finger the thing it drags is held (none for a mouse, or for panning and aiming). */
  lift(p: Phaser.Input.Pointer, d: Drag) { return p.wasTouch && (d.kind === 'move' || d.kind === 'shift' || d.kind === 'civ') ? LIFT : 0; }

  /** Puts down (or calls in) a bar item at a point on the screen. */
  put(id: string, x: number, y: number) {
    this.armed = undefined;
    if (this.available(id) <= 0 || this.world.phase === 'won' || this.world.phase === 'lost') return;
    const [wx, wy] = this.toWorld(x, y), [tx, ty] = this.tileOf(wx, wy), w = this.world;
    // An A-10 run is put down first, then dragged the way it should fly (see onUp).
    if (id === 'a10') { if (w.strikeReady(id)) this.strikeAim = { x: wx, y: wy, angle: this.dragAngle }; return; }
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
    if (action === 'Cancel') this.pending = this.strikeAim = undefined;
    if (isSoldier(sel) && action === 'Retreat' && w.retreatSoldier(sel)) this.selected = undefined;
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

  /** Points the A-10's run from its mark toward the pointer; true once the pointer is far enough out to say which way. */
  aimRun(p: Phaser.Input.Pointer) {
    const a = this.strikeAim;
    if (!a) return false;
    const [wx, wy] = this.toWorld(p.x, p.y);
    if (Math.hypot(wx - a.x, wy - a.y) < 8) return false;
    a.angle = Math.atan2(wy - a.y, wx - a.x);
    return true;
  }

  handle(s: Soldier): [number, number] { return [s.x + Math.cos(s.angle) * s.reach, s.y + Math.sin(s.angle) * s.reach]; }

  // ---- Each frame ----

  update(_time: number, delta: number) {
    const w = this.world;
    this.drive_();
    if (w.phase === 'wave' && this.speed > 0 && !this.inStory) {
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
    this.animate(Math.min(delta, 100) / 1000);
    this.atmos.step(Math.min(delta, 100) / 1000);
    this.footprints(delta);
    if (this.strikeAim && !w.strikeReady('a10')) this.strikeAim = undefined; // cooling down after all, or the fight is over
    this.settle();
    this.spill();
    this.reportFallen();
    this.meet();
    this.watchCivilians();
    if (this.tutorial >= 0) this.stepTutorial();
    const sel = this.selected;
    if (sel && (isSoldier(sel) ? sel.dead || !w.soldiers.includes(sel) : isBlock(sel) ? !w.roadblocks.includes(sel) : !w.structures.includes(sel))) this.selected = undefined;
    if (this.selected !== this.picked) {
      this.picked = this.selected;
      if (isSoldier(this.picked) && !this.muted) play(`say-${this.picked.kind}`);
    }
    this.drawZombies();
    this.drawSoldiers();
    this.drawCivilians();
    this.drawBuilt();
    this.drawOverlay();
    this.listen(delta);
    this.updateHud();
  }

  /** Each frame while playing as a soldier: WASD to the sim, the gun at the mouse, the camera on him; and out of it when he falls or the wave ends. */
  drive_() {
    const w = this.world, s = this.driving, c = w.control;
    if (!s || !c) return;
    if (!this.canDrive(s) || !w.soldiers.includes(s)) return this.stopDriving();
    const h = this.held;
    c.dx = (h.has('d') ? 1 : 0) - (h.has('a') ? 1 : 0);
    c.dy = (h.has('s') ? 1 : 0) - (h.has('w') ? 1 : 0);
    w.aim(s, ...this.toWorld(this.pointer.x, this.pointer.y));
    const cam = this.cameras.main;
    cam.scrollX += (s.x - cam.width / 2 - cam.scrollX) * 0.12;
    cam.scrollY += (s.y - cam.height / 2 - cam.scrollY) * 0.12;
  }

  /** What would put a bird up at (x, y): a soldier firing close by, or a zombie coming near. */
  scare(x: number, y: number): [number, number] | undefined {
    const w = this.world;
    for (const s of w.soldiers) if (!s.dead && w.firing(s) && Math.hypot(s.x - x, s.y - y) < 90) return [s.x, s.y];
    for (let i = 0; i < w.n; i++) if (w.alive[i] && Math.abs(w.zx[i] - x) < 48 && Math.abs(w.zy[i] - y) < 48) return [w.zx[i], w.zy[i]];
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
    for (const s of w.sounds) {
      play(s.kind, this.near(s.x, s.y), s.size);
      // The light of it, and what it leaves on the street.
      if (s.kind in UNITS) this.atmos.flash(s.x, s.y);
      else if (s.kind === 'boom') this.atmos.scar('crater', s.x, s.y, Math.max(8, s.size));
      else if (s.kind === 'blast') this.atmos.scar('scorch', s.x, s.y, Math.max(24, s.size));
      else if (s.kind === 'broken') this.atmos.scar('debris', s.x, s.y, 14);
      if (!this.muted && (s.kind === 'blast' || s.kind === 'a10' || s.kind === 'napalm') && this.near(s.x, s.y) > 0.6) { this.shake(200, 0.005); buzz(40); }
    }
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
    const w = this.world, t = w.time, hurt = 0xff3030, burning = hex(palette.flash0), v = this.cameras.main.worldView;
    this.seen = 0;
    for (let i = 0; i < w.n; i++) {
      let s = this.zombies[i];
      if (!w.alive[i]) {
        if (s?.visible) s.setVisible(false);
        continue;
      }
      const z = ZOMBIES[w.zkind[i]], looks = WALK[w.zkind[i]], walk = looks[i % looks.length];
      s ??= this.zombies[i] = this.add.sprite(0, 0, 'sprites', walk[0]).setDepth(2);
      const vx = w.zvx[i], vy = w.zvy[i], moving = vx * vx + vy * vy > 4, rate = z.speed > 20 ? 8 : 4;
      s.setVisible(true).setPosition(w.zx[i], w.zy[i]).setFrame(walk[moving ? ((t * rate + i * 0.37) | 0) & 1 : 0]);
      if (v.contains(w.zx[i], w.zy[i])) this.seen++;
      if (moving) s.rotation = Math.atan2(vy, vx);
      // A jumper in mid-leap over a roadblock is drawn bigger, as if nearer the camera.
      const tile = w.grid.at(w.zx[i], w.zy[i]);
      s.setScale(z.jumps && tile >= 0 && w.grid.block[tile] ? 1.35 : 1);
      // Showing routes: green on its route, through yellow (following others back to it) to red (making for it alone).
      const link = w.zlink[i], route = this.showRoutes ? Phaser.Display.Color.GetColor(link < 0.5 ? 230 : Math.round(230 * (1 - link) * 2), link < 0.5 ? Math.round(80 + 300 * link) : 230, 60) : 0;
      const tint = w.zhit[i] > 0 ? hurt : w.zburn[i] > 0 && ((t * 12) | 0) % 2 ? burning : route || SHADES[i % SHADES.length];
      if (tint !== 0xffffff) s.setTint(tint);
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

  /** In the rain, footprints behind whoever walks: soldiers, civilians, and a few of the horde. */
  footprints(delta: number) {
    if (!this.atmos.wet || this.world.phase !== 'wave' || !this.speed || (this.printAt += delta) < 260) return;
    this.printAt = 0;
    const w = this.world, side = (this.printSide = -this.printSide);
    const step = (x: number, y: number, a: number) => this.atmos.print(x + Math.cos(a + Math.PI / 2) * 2 * side, y + Math.sin(a + Math.PI / 2) * 2 * side, a);
    for (const s of w.soldiers) if (!s.dead && s.walking) step(s.x, s.y, s.heading);
    for (const c of w.civilians) if (c.state === 'out' && c.walking) step(c.x, c.y, this.civSprites.get(c)?.rotation ?? 0);
    for (let k = 0, i = (Math.random() * w.n) | 0; k < 12 && w.n; k++, i = (i + 37) % w.n) if (w.alive[i]) step(w.zx[i], w.zy[i], Math.atan2(w.zvy[i], w.zvx[i]));
  }
  printAt = 0;
  printSide = 1;

  /** The civilians out of their buildings: a person each (a kid, an old man, a nurse), walking the way they head. */
  drawCivilians() {
    for (const c of this.world.civilians) {
      let sp = this.civSprites.get(c);
      if (c.state !== 'out') { sp?.setVisible(false); continue; }
      if (!sp) this.civSprites.set(c, (sp = this.add.sprite(c.x, c.y, 'sprites').setDepth(3).play(`civ${RESCUED[c.id % RESCUED.length]}-walk`)));
      const dx = c.x - sp.x, dy = c.y - sp.y;
      if (dx * dx + dy * dy > 0.01) sp.setRotation(Math.atan2(dy, dx));
      sp.setPosition(c.x, c.y).setVisible(true);
      if (c.walking) sp.anims.resume(); else sp.anims.pause();
    }
  }

  /** The tiles a civilian will walk along to where they were sent, as the sim walks them: straight where nothing is in
   *  the way, else down the distance field toward it. */
  civRoute(c: Civilian) {
    const d = c.dest!;
    let r = this.civRoutes.get(d);
    if (r) return r;
    const g = this.world.grid, T = g.tile;
    r = [];
    let i = g.at(c.x, c.y);
    for (let n = 0; n < 2000 && i >= 0 && d.field[i] > 0 && Number.isFinite(d.field[i]); n++) {
      r.push([((i % g.w) + 0.5) * T, (Math.floor(i / g.w) + 0.5) * T]);
      const x = i % g.w, next = [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, i - g.w, i + g.w].filter((j) => j >= 0 && j < d.field.length).reduce((b, j) => (d.field[j] < d.field[b] ? j : b), i);
      if (next === i) break;
      i = next;
    }
    r.push([d.x, d.y]);
    this.civRoutes.set(d, r);
    return r;
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
      // Darker as it breaks, and as dark as the weather makes the street round it (night in Tokyo).
      const [sr, sg, sb] = this.shade, c = block ? 0.5 + (0.5 * o.hp) / this.world.stats.roadblocks[o.kind].hp : 1;
      for (const sp of sprites) sp.setTint(Phaser.Display.Color.GetColor(Math.round(255 * c * sr), Math.round(255 * c * sg), Math.round(255 * c * sb)));
      // A car, taxi, bus or jeepney still in working order, after dark: its headlights on, two beams ahead of it.
      if (block && o.prop && this.headlamps && VEHICLES.has(o.kind)) {
        let beams = this.beams.get(o);
        if (!beams) this.beams.set(o, (beams = [-1, 1].map(() => this.add.image(0, 0, 'fx-light').setOrigin(0.06, 0.5).setBlendMode('ADD').setTint(0xfff0c4).setAlpha(0.32).setDepth(1.56))));
        const [cx, cy] = w.blockCentre(o), half = (this.world.stats.roadblocks[o.kind].length * T) / 2, dx = Math.cos(turn), dy = Math.sin(turn);
        beams.forEach((b, k) => b.setPosition(cx + dx * (half - 3) - dy * (k ? 7 : -7), cy + dy * (half - 3) + dx * (k ? 7 : -7)).setRotation(turn).setScale(0.75, 0.2));
      }
    }
    for (const [o, sprites] of this.blocks) if (!things.includes(o)) { sprites.forEach((sp) => sp.destroy()); this.blocks.delete(o); this.beams.get(o as Roadblock)?.forEach((b) => b.destroy()); this.beams.delete(o as Roadblock); }
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
    // Good and bad in blue and orange for colour-blind eyes, green and red otherwise.
    const cb = profile.settings.colorblind, good = cb ? 0x3b8fd9 : hex(palette.rot2);
    const paint = hex(palette.paint), light = hex(palette.flash1), bad = cb ? 0xf08a28 : hex(palette.blood1), dark = hex(palette.outline);
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

    // The horde's routes, when shown: each a line from its way in to the safe zone, arrows along it, and the band either
    // side within which a zombie counts as on it.
    if (this.showRoutes) {
      const cols = [palette.teal2, palette.flash1, palette.maroon2, palette.rot2, palette.navy2, palette.hivis1].map(hex), gw = w.grid.w;
      w.routes.list.forEach((r, k) => {
        const pts = r.tiles.map((i) => new Phaser.Math.Vector2(((i % gw) + 0.5) * T, (Math.floor(i / gw) + 0.5) * T)), col = cols[k % cols.length];
        floor.lineStyle(w.routeNear * 2, col, 0.06).strokePoints(pts);
        top.lineStyle(2 / z, col, 0.85).strokePoints(pts);
        for (let q = 6; q + 1 < pts.length; q += 10) {
          const a = Math.atan2(pts[q + 1].y - pts[q].y, pts[q + 1].x - pts[q].x), { x, y } = pts[q], s = 5 / z + 2;
          top.lineBetween(x, y, x - Math.cos(a - 0.5) * s, y - Math.sin(a - 0.5) * s).lineBetween(x, y, x - Math.cos(a + 0.5) * s, y - Math.sin(a + 0.5) * s);
        }
      });
    }

    // On the ground: each soldier's cone, a mortar's landing zone, a medic's or engineer's reach. The selected one brighter.
    const cone = (s: Soldier, alpha: number, picked: boolean) => {
      const u = this.world.stats.units[s.kind];
      if (support(u)) {
        if (picked) floor.fillStyle(hex(palette.rot2), 0.12).fillCircle(s.x, s.y, u.range);
      } else if (indirect(u)) {
        const [ax, ay] = w.aimPoint(s), R = u.scatter! + u.blast!;
        floor.fillStyle(paint, alpha * 0.7).fillCircle(ax, ay, R).lineStyle(1 / z, PENCIL, alpha * 3).strokeCircle(ax, ay, R).strokeCircle(ax + 0.6 / z, ay, R - 0.6 / z);
      } else {
        // Sketched in pencil on the tactical map: a light wash, its edges drawn twice a little apart, hatched across.
        const R = w.rangeOf(s), a0 = s.angle - w.spread(s), a1 = s.angle + w.spread(s), at = (a: number, r: number): [number, number] => [s.x + Math.cos(a) * r, s.y + Math.sin(a) * r];
        floor.fillStyle(paint, alpha * 0.7).slice(s.x, s.y, R, a0, a1, false).fillPath();
        floor.lineStyle(1 / z, PENCIL, Math.min(0.8, alpha * 3));
        for (const j of [0, 0.7 / z]) floor.beginPath().moveTo(s.x + j, s.y + j).lineTo(...at(a0, R - j)).arc(s.x + j, s.y + j, R - j, a0, a1).lineTo(s.x + j, s.y + j).strokePath();
        floor.lineStyle(1 / z, PENCIL, Math.min(0.5, alpha * 1.8));
        for (let k = 1; k < 5; k++) floor.lineBetween(...at(a0, (R * k) / 5), ...at(a1, (R * (k + 0.6)) / 5));
      }
    };
    for (const s of w.soldiers) if (!s.dead) cone(s, s === sel ? 0.18 : 0.07, s === sel);
    // A soldier being dragged from the bar: his cone where he would stand, before he is dropped.
    if (d?.kind === 'place' && isUnit(d.id) && this.pointer.x >= 0) {
      const gs = w.ghost(d.id, ...this.toWorld(this.pointer.x, this.pointer.y));
      if (gs) cone(gs, 0.14, true);
    }

    // People left in buildings: a light at the door, filling round as a soldier holds it; those brought out, small
    // figures to walk to the safe zone.
    for (const c of w.civilians) {
      if (c.state === 'inside') {
        const glow = 0.55 + 0.35 * Math.sin(this.time.now / 220 + c.id);
        top.fillStyle(hex(palette.flash1), glow).fillCircle(c.x, c.y, 3).lineStyle(1.5 / z, hex(palette.flash1), glow).strokeCircle(c.x, c.y, 9);
        if (c.held > 0) top.lineStyle(3 / z, good, 1).beginPath().arc(c.x, c.y, 9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * c.held) / CIVILIAN_HOLD).strokePath();
      } else if (c.state === 'out') {
        if (c === this.civ) top.lineStyle(1.5 / z, light, 0.9).strokeCircle(c.x, c.y, 9);
        // The way they will walk, dotted, the dots running toward where they are going.
        if (c.dest) {
          const route = this.civRoute(c), step = 0.5 + ((this.time.now / 300) % 1);
          top.fillStyle(light, 0.8);
          for (let k = 0; k + 1 < route.length; k++) for (let f = step / 2; f < 1; f += 0.5) {
            const [x0, y0] = route[k], [x1, y1] = route[k + 1], x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
            if (Math.hypot(x - c.x, y - c.y) > 6) top.fillCircle(x, y, 1.6 / Math.max(0.6, z * 0.6));
          }
          top.lineStyle(1.5 / z, light, 0.9).strokeCircle(c.dest.x, c.dest.y, 5);
        }
        if (c.hp < 60) { top.fillStyle(dark, 1).fillRect(c.x - 6, c.y - 11, 12, 2); top.fillStyle(bad, 1).fillRect(c.x - 6, c.y - 11, (12 * c.hp) / 60, 2); }
      }
      if (c.state !== 'inside' && c.state !== 'out') continue;
      // Zombies close: a red "!" over them.
      let near = false;
      for (let i = 0; i < w.n && !near; i++) if (w.alive[i] && Math.abs(w.zx[i] - c.x) < 64 && Math.abs(w.zy[i] - c.y) < 64) near = true;
      if (near && Math.floor(this.time.now / 250) % 2 === 0) {
        const s = 1 / Math.max(0.7, z * 0.7);
        top.fillStyle(dark, 1).fillRect(c.x - 4 * s, c.y - 26 * s, 8 * s, 13 * s).fillStyle(bad, 1).fillRect(c.x - 3 * s, c.y - 25 * s, 6 * s, 11 * s)
          .fillStyle(0xffffff, 1).fillRect(c.x - 1 * s, c.y - 23 * s, 2 * s, 5 * s).fillRect(c.x - 1 * s, c.y - 17 * s, 2 * s, 2 * s);
      }
      // Off the screen: an arrow at its edge pointing their way.
      const v = this.cameras.main.worldView, bars = this.bars(), x0 = v.x + 18 / z, x1 = v.right - 18 / z, y0 = v.y + (bars.top + 14) / z, y1 = v.bottom - (bars.bottom + 14) / z;
      if (!v.contains(c.x, c.y) && x1 > x0 && y1 > y0) {
        // Along the line from the middle of what shows toward them, as far as the room clear of the controls goes.
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = c.x - cx, dy = c.y - cy, a = Math.atan2(dy, dx);
        const k = Math.min(dx ? ((dx > 0 ? x1 : x0) - cx) / dx : Infinity, dy ? ((dy > 0 ? y1 : y0) - cy) / dy : Infinity);
        const ax = cx + dx * k, ay = cy + dy * k, L = 10 / z;
        top.fillStyle(near ? bad : hex(palette.flash1), 0.95).fillTriangle(ax + Math.cos(a) * L, ay + Math.sin(a) * L, ax + Math.cos(a + 2.5) * L, ay + Math.sin(a + 2.5) * L, ax + Math.cos(a - 2.5) * L, ay + Math.sin(a - 2.5) * L);
      }
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

    // Flamethrowers' fire (game/flame.ts), fed for as long as each keeps firing; still while the fight is paused.
    const flames = w.soldiers.filter((s) => w.stats.units[s.kind].weapon === 'flame').map((s) => ({
      key: s, x: s.x, y: s.y, angle: s.angle, spread: w.spread(s), range: w.rangeOf(s),
      lit: !s.dead && w.phase === 'wave' && w.time - s.firedAt < 1.2 / (w.stats.units[s.kind].fireRate! * s.rateBy),
    }));
    this.flames.draw(top, w.phase === 'wave' && !this.speed ? 0 : this.game.loop.delta / 1000, flames);
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
    // Strikes on their way, to scale and taking their time: a red mark where each will land; the missile coming in low
    // on its smoke, the A-10 flying in along its run and on out after it, a jet dropping napalm canisters that tumble
    // down, the barrage's shells dropping in. Anything in the air is drawn raised (and a little bigger) over its shadow.
    const mark = (x: number, y: number, r: number) => top.lineStyle(1.5 / z, bad, 0.8).strokeCircle(x, y, r).lineBetween(x - r - 4, y, x + r + 4, y).lineBetween(x, y - r - 4, x, y + r + 4);
    let flown = 0;
    const fly = (name: string, x: number, y: number, angle: number, height: number) => {
      const frame = `${name}/0`, shade = (this.flyers[flown++] ??= this.add.sprite(0, 0, 'sprites', frame)), body = (this.flyers[flown++] ??= this.add.sprite(0, 0, 'sprites', frame));
      shade.setFrame(frame).setVisible(true).setPosition(x + height * 0.45, y + height * 0.3).setRotation(angle).setScale(1).setTint(0x000000).setAlpha(0.3).setDepth(1.6);
      body.setFrame(frame).setVisible(true).setPosition(x, y - height).setRotation(angle).setScale(1 + height / 500).clearTint().setAlpha(1).setDepth(11);
    };
    for (const s of w.strikes) {
      const u = this.world.stats.usables[s.kind], cx = Math.cos(s.angle), cy = Math.sin(s.angle);
      if (s.kind === 'missile') {
        // In from 700 px out, coming down from 60 px up, its smoke behind it.
        mark(s.x, s.y, u.blast!);
        const left = 1 - s.t / u.delay, x = s.x - cx * 700 * left, y = s.y - cy * 700 * left, height = 60 * left;
        for (let k = 1; k <= 12; k++) top.fillStyle(smoke, 0.35 * (1 - k / 13)).fillCircle(x - cx * k * 9, y - cy * k * 9 - height - k * 0.6, 2 + k * 0.45);
        fly('missile-fly', x, y, s.angle, height);
      } else if (s.kind === 'napalm') {
        // A jet over the mark lets the canisters go 60 px short of it; they tumble down onto it over the last 1.2 s.
        mark(s.x, s.y, u.radius!);
        const fall = 1.2 * PACE, let_go = u.delay - fall, jet = ((s.t - let_go) * 500) / PACE - 60;
        if (Math.abs(jet) < 1600) fly('jet', s.x + cx * jet, s.y + cy * jet, s.angle, 90);
        if (s.t > let_go)
          for (const side of [-1, 1]) {
            const g = (s.t - let_go) / fall, back = 60 * (1 - g);
            fly('napalm-can', s.x - cx * back - cy * side * 9, s.y - cy * back + cx * side * 9, s.angle + (s.t / PACE) * 7 * side, 90 * (1 - g * g));
          }
      } else if (s.kind === 'artillery') {
        // Each shell drops in over the last 0.7 s before it lands.
        const drop = 0.7 * PACE;
        for (const sh of s.shells) {
          if (sh.at <= s.t) continue;
          mark(sh.x, sh.y, 6);
          if (sh.at - s.t < drop) fly('shell', sh.x, sh.y, s.angle, (150 * (sh.at - s.t)) / drop);
        }
      } else if (s.kind === 'a10') {
        // Its run marked until it starts; the plane on its way in, along it and out the far end.
        const [x0, y0] = [s.x - (cx * u.length!) / 2, s.y - (cy * u.length!) / 2];
        if (s.t < u.delay) top.lineStyle(u.width! / 2, bad, 0.15).lineBetween(x0, y0, x0 + cx * u.length!, y0 + cy * u.length!);
        const [px, py] = w.planeAt(s);
        if (Math.hypot(px - s.x, py - s.y) < 1800) fly('jet', px, py, s.angle, 70);
      }
    }
    for (let k = flown; k < this.flyers.length; k++) this.flyers[k].setVisible(false);
    for (const b of w.blasts) {
      const f = b.age / 0.35;
      top.fillStyle(b.bile ? hex(palette.rot2) : f < 0.3 ? light : flame, 0.75 * (1 - f)).fillCircle(b.x, b.y, b.r * (0.5 + 0.5 * f));
    }
    // Spit in the air: a green gob arcing from the spitter to the soldier it hit.
    for (const sp of w.spits) {
      const f = Math.min(1, sp.age / 0.2), x = sp.x0 + (sp.x1 - sp.x0) * f, y = sp.y0 + (sp.y1 - sp.y0) * f - Math.sin(f * Math.PI) * 14;
      top.fillStyle(hex(palette.rot2), 1 - sp.age / 0.35).fillCircle(x, y, 2.5).fillStyle(hex(palette.rot1), 0.5 * (1 - sp.age / 0.35)).fillCircle(sp.x1, sp.y1, 5 * f);
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
      top.fillStyle(frac > 0.5 ? good : bad, 1).fillRect(x - 8, y, 16 * frac, 3);
    };
    for (const s of w.soldiers) if (!s.dead && s.hp < this.world.stats.units[s.kind].hp) bar(s.x, s.y - 14, s.hp / this.world.stats.units[s.kind].hp);
    for (const rb of w.roadblocks) {
      const max = this.world.stats.roadblocks[rb.kind].hp;
      if (rb.hp < max) bar((rb.tx + 0.5) * T, rb.ty * T - (rb.vertical ? T + 5 : 5), rb.hp / max);
    }
    for (const st of w.structures) if (st.kind === 'spikes' && st.hp < this.world.stats.structs.spikes.hp!) bar(st.x, st.y - 10, st.hp / this.world.stats.structs.spikes.hp!);

    // Where a drag would put things: pale if it fits, red if not.
    // An A-10 run put down, waiting for its way: its path through the mark, an arrow at the far end.
    if (this.strikeAim) {
      const a = this.strikeAim, u = w.stats.usables.a10, cx = Math.cos(a.angle), cy = Math.sin(a.angle), L = u.length! / 2, tip = [a.x + cx * L, a.y + cy * L];
      top.lineStyle(u.width!, bad, 0.25).lineBetween(a.x - cx * L, a.y - cy * L, tip[0], tip[1]);
      top.lineStyle(2 / z, bad, 0.9).strokeCircle(a.x, a.y, 4 + 8 / z)
        .lineBetween(tip[0], tip[1], tip[0] - cx * 14 - cy * 10, tip[1] - cy * 14 + cx * 10).lineBetween(tip[0], tip[1], tip[0] - cx * 14 + cy * 10, tip[1] - cy * 14 - cx * 10);
    }
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
    if (d.kind === 'civ' && d.moved) top.lineStyle(1.5 / z, light, 0.9).lineBetween(d.c.x, d.c.y, wx, wy).strokeCircle(wx, wy, 6);
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
        top.lineStyle(1.5 / z, bad, 0.9).strokeCircle(wx, wy, u.blast ?? u.radius ?? u.width!); // the A-10's way is dragged out after
      } else ghost(w.structFits(id as StructKind, tx, ty, this.turned), w.structTiles(id as StructKind, tx, ty, this.turned));
    }
  }

  updateHud() {
    const w = this.world, sel = this.selected, planning = w.phase === 'plan', waving = w.phase === 'wave';
    // The red at the edges as the squad thins (from 60% of the most standing at once), and the colour draining as leaks mount.
    const standing = w.soldiers.filter((s) => !s.dead && !s.owner).length;
    this.peak = Math.max(this.peak, standing);
    this.hud.hurt(waving && this.peak >= 2 ? Math.max(0, Math.min(1, (0.6 - standing / this.peak) / 0.6)) : 0);
    const drain = this.debug || !Number.isFinite(w.leakLimit) ? 0 : Math.min(1, w.leaks / Math.max(1, w.leakLimit));
    if (this.gray && Math.abs(drain - this.grayAt) > 0.01) { this.grayAt = drain; this.gray.reset(); this.gray.grayscale(drain); }
    const summary = `${w.kills} kills · ${w.leaks} leaks · ${clock(w.time)}`;
    const ids = this.ids;
    let selection = '';
    if (this.armed && this.available(this.armed) <= 0) this.armed = undefined;
    if (this.strikeAim) selection = 'Drag from the mark the way the A-10 flies';
    else if (this.pending) selection = 'Tap where the turret goes';
    else if (this.armed) selection = `Tap the map: ${nameOf(this.armed)}`;
    else if (this.civ?.state === 'out') selection = `Civilian · ${Math.ceil(this.civ.hp)} HP · ${this.civ.walking ? 'on the way' : 'tap or drag to send them to the safe zone'}`;
    else if (isSoldier(sel)) selection = ''; // he has his card instead (below)
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
      status: [!planning && this.time.now - this.behind < 1500 ? 'Slowed' : '', `${w.leaks}/${Number.isFinite(w.leakLimit) ? w.leakLimit : '∞'}`, `${w.kills}`],
      warn: w.leaks >= w.leakLimit * 0.7,
      counts: Object.fromEntries(ids.map((id) => [id, this.available(id)])),
      // A strike can only be called in once the wave is on, and not again until it has cooled down.
      ready: Object.fromEntries(ids.map((id) => [id, isUsable(id) ? w.strikeReady(id) : this.available(id) > 0])),
      cool: Object.fromEntries(Object.keys(USABLES).map((id) => [id, waving ? Math.max(0, w.readyAt[id as UsableKind] - w.time) / this.world.stats.usables[id as UsableKind].cooldown : 0])),
      planning,
      placed: planning && (w.soldiers.length > 0 || w.structures.length > 0 || w.roadblocks.some((rb) => !rb.prop)),
      speed: this.speed,
      armed: this.armed ?? '',
      routes: this.showRoutes,
      unlimited: this.unlimited,
      selection,
      actions: [
        ...(isSoldier(sel) && this.world.stats.units[sel.kind].weapon === 'sniper' ? [`Target: ${sel.priority}`] : []),
        ...(this.strikeAim ? ['Cancel'] : []),
        ...(isSoldier(sel) && sel.turrets > 0 ? [this.pending ? 'Cancel' : 'Deploy turret'] : []),
        ...(waving && sel?.kind === 'explosives' ? ['Detonate'] : []),
        ...(waving && sel?.kind === 'noise' ? ['Sound off'] : []),
        ...(planning && turnable ? ['Turn'] : []),
        ...(isBlock(sel) && sel.prop ? ['Turn'] : []),
        ...(planning && sel && !isSoldier(sel) && !(isBlock(sel) && sel.prop) ? ['Remove'] : []), // a soldier's is the bookmark on his dossier
      ],
      card: isSoldier(sel) && !this.strikeAim && !this.pending && !this.armed ? { ...this.cardOf(sel), drivable: this.canDrive(sel) || this.driving === sel, driving: this.driving === sel, mark: planning ? 'Remove' : waving && !sel.owner && !this.world.stats.units[sel.kind].fixed ? (sel.leaving ? 'Retreating…' : 'Retreat') : '' } : undefined,
      end: this.paid && { title: w.phase === 'won' ? 'You held the line' : 'Overrun', detail: summary, quote: this.lostLine, chips: this.chipLines(this.paid), total: this.paid.total, killers: this.killers(), won: w.phase === 'won', medals: this.medals, sketch: (this.sketch ??= this.sketchMap()) },
      tip: this.tutorial >= 0 ? TUTORIAL[this.tutorial] : this.civTip && waving && w.civilians.some((c) => c.state === 'inside') ? CIV_TIP : '',
      breakLeft: w.breakLeft / PACE,
    });
  }

  /** The picked soldier's card: his photo, health, kills, where he stands and his class's upgrades bought. */
  cardOf(s: Soldier) {
    const w = this.world, u = w.stats.units[s.kind], n = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
    // What he does in numbers, as he stands (upgrades, a tower or ammo near him, indoors, the weather all counted).
    const stats = u.weapon === 'heal' ? [`Heals ${n(u.heal! * PACE)} HP/s`, `Reach ${n(u.range)}`]
      : u.weapon === 'repair' ? [`Repairs ${n(u.repair! * PACE)} HP/s`, `Reach ${n(u.range)}`]
      : [`Damage ${n(u.damage! * (s.indoor ? w.stats.indoor.damageBy : 1))}`, `Range ${n(indirect(u) ? u.range : w.rangeOf(s))}`, `Fire rate ${n(u.fireRate! * s.rateBy * PACE)}/s`];
    return {
      kind: s.kind, name: `${rank(s.kills)} ${s.name}`, role: u.name, icon: (this.icons[s.kind] ??= icon(this, `${s.kind}-idle-6/0`)), hp: s.indoor ? u.hp : s.hp, max: u.hp, kills: s.kills,
      where: s.leaving ? 'falling back' : s.indoor ? 'indoors, safe' : `${Math.ceil(s.hp)} HP`, stats,
    };
  }
  icons: Record<string, string> = {}; // each soldier's photo for his card, made once

  /** The report's sketch: the city in pencil on paper (buildings shaded in, the camp hatched, the ways in red), red
   *  dots where zombies got through, black crosses where soldiers fell, a ring for each civilian saved. */
  sketchMap() {
    const w = this.world, g = w.grid, T = g.tile, k = Math.min(240 / g.w, 160 / g.h), cv = document.createElement('canvas'), c = cv.getContext('2d')!;
    cv.width = Math.round(g.w * k); cv.height = Math.round(g.h * k);
    c.fillStyle = '#efe9d6'; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < g.w * g.h; i++) {
      const x = (i % g.w) * k, y = Math.floor(i / g.w) * k;
      const col = g.wall[i] === 1 ? 'rgba(46,42,34,0.55)' : g.wall[i] ? 'rgba(63,90,122,0.35)' : g.goal[i] ? ((i + Math.floor(i / g.w)) % 2 ? 'rgba(79,138,134,0.55)' : 'rgba(79,138,134,0.25)') : '';
      if (col) { c.fillStyle = col; c.fillRect(x, y, k + 0.5, k + 0.5); }
    }
    c.fillStyle = 'rgba(178,58,48,0.6)';
    for (const i of g.spawns) c.fillRect((i % g.w) * k, Math.floor(i / g.w) * k, k + 0.5, k + 0.5);
    const at = (x: number, y: number) => [(x / T) * k, (y / T) * k];
    c.fillStyle = '#b23a30';
    for (const l of w.leakAt) { const [x, y] = at(l.x, l.y); c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); }
    c.strokeStyle = '#141516'; c.lineWidth = 1.5;
    for (const s of w.soldiers) if (s.dead) { const [x, y] = at(s.x, s.y); c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); }
    c.strokeStyle = '#2f6a3a';
    for (const cv2 of w.civilians) if (cv2.state === 'saved') { const [x, y] = at(cv2.x, cv2.y); c.beginPath(); c.arc(x, y, 3, 0, 7); c.stroke(); }
    return cv.toDataURL();
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
      `Kills: ${p.base} chips`,
      ...(p.timeBonus ? [`Time bonus ${pc(p.timeBonus)}`] : []),
      ...(p.leakBonus ? [`Few leaks ${pc(p.leakBonus)}`] : []),
      ...(this.build.chipGain > 1 ? [`Chip gain ${pc(this.build.chipGain - 1)}`] : []),
      ...(p.minimum ? [`Base pay: +${p.minimum} chips`] : []),
      ...(p.firstClear ? [`First clear +${p.firstClear}`] : []),
      ...(this.skipChips ? [`Breaks skipped ${this.world.skips}: +${this.skipChips}`] : []),
      ...(this.civChips ? [`Civilians saved ${this.world.saved}: +${this.civChips}`] : []),
      ...(this.diffChips ? [`${DIFFICULTY[profile.save.difficulty].name}: ${this.diffChips > 0 ? '+' : ''}${this.diffChips}`] : []),
    ];
  }
}
