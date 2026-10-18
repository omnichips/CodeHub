// The battle with no drawing in it: zombies, soldiers, roadblocks, waves and leaks, advanced in fixed steps so a fight
// plays out the same at 1x, 2x and 3x. The game screen reads it to draw and calls it to give orders.
import economy from '../data/economy.json' with { type: 'json' };
import structures from '../data/structures.json' with { type: 'json' };
import unitData from '../data/units.json' with { type: 'json' };
import zombieData from '../data/zombies.json' with { type: 'json' };
import { Grid, distanceField, downhill, type MapData } from './grid.ts';
import { routesOf, type Routes } from './routes.ts';

export const STEP = 1 / 60;
export const DIRS = 8; // soldier sprites face 8 ways: 0 = east, then clockwise
const CAP = 4096; // most zombies alive at once
const BLOCK_LOOK = 2.5; // tiles ahead a zombie sees a roadblock and turns to go round it
const SPACE = 1.25; // zombies keep apart by their drawn size, a bit more than the body they are hit by: they touch, never stack
/** How many cells out a zombie looks for neighbours to keep apart from: a cell is a tile, and two of the common ones
 *  (radius 6) need 15 px, inside one cell; anything bigger looks two out. */
const reachOf = (r: number) => (r * SPACE > 7.5 ? 2 : 1);
const ROUTE_NEAR = 3; // tiles (times the map's scale) from its route a zombie still counts as on it
const FOLLOW = 0.8; // off its route, a zombie following one nearer the route keeps this much of that one's link
const ALONE = 0.3; // below this much link it stops following and makes for the route by itself
const MOB = 50; // a wave comes as mobs of about this many, each pouring in at one place
const SHOT_LIFE = 0.06; // seconds a tracer stays on screen
const BLAST_LIFE = 0.35;
const FIRING_LOOK = 0.3; // seconds a soldier holds the shooting pose after a shot
const DEFAULT_CONE = { widest: 40, narrowest: 2, handleMin: 24, handleMax: 120 };

export type UnitKind = keyof typeof unitData;
export type BlockKind = keyof typeof structures.roadblocks;
export type Weapon = 'bullet' | 'sniper' | 'pellets' | 'flame' | 'rocket' | 'shell' | 'heal' | 'repair';
/** Who a sniper picks out of the zombies in his cone. */
export const PRIORITIES = ['nearest', 'farthest', 'highest HP', 'fastest', 'slowest'] as const;

/** A soldier class, as in units.json. Only the fields its weapon uses are set. */
export interface UnitStats {
  name: string; hp: number; radius: number; speed: number; aimSpeed: number; weapon: Weapon; range: number;
  damage?: number; fireRate?: number; pierce?: number; pellets?: number; knockback?: number; burn?: { dps: number; time: number };
  blast?: number; projectileSpeed?: number; minRange?: number; scatter?: number; flight?: number;
  heal?: number; repair?: number; harden?: number; taunt?: number; turrets?: number; fixed?: boolean; outdoor?: boolean;
  cone?: typeof DEFAULT_CONE;
}
/** A zombie class, as in zombies.json. */
export interface ZombieStats {
  name: string; hp: number; speed: number; radius: number; leak: number; sight: number; dps: number;
  jumps?: boolean; armor?: number; smash?: number;
  scream?: { every: number; radius: number; boost: number; time: number };
  burst?: { radius: number; damage: number; boost: number; time: number };
  shield?: { radius: number; ahead: number };
  brood?: { every: number; count: number; kind: string };
}
export const UNITS = unitData as Record<UnitKind, UnitStats>;
export const ZOMBIE_KINDS = Object.keys(zombieData);
export const ZOMBIES = Object.values(zombieData) as ZombieStats[];

export type StructKind = keyof typeof structures.structures;
export type UsableKind = keyof typeof structures.usables;
/** A structure, as in structures.json. Only the fields it uses are set. */
export interface StructStats {
  name: string; length?: number; rangeBy?: number; cover?: number; radius?: number; rateBy?: number; burn?: { dps: number; time: number };
  trigger?: number; blast?: number; damage?: number; slow?: number; speed?: number; kills?: number; distance?: number;
  dps?: number; power?: number; fastBy?: number; hp?: number; wear?: number; time?: number;
}
/** A usable (a strike called in from off the map). */
export interface UsableStats {
  name: string; charges: number; cooldown: number; delay: number; blast?: number; damage?: number; length?: number; width?: number;
  speed?: number; radius?: number; time?: number; burn?: { dps: number; time: number }; slow?: number; shells?: number; spread?: number;
  sound?: number; // how long before it lands its recording starts (the missile's launch: as it is called in)
}
export const ROADBLOCKS = structures.roadblocks as Record<BlockKind, { name: string; hp: number; length: number; width?: number; detour: number; fixed?: boolean }>;
export const STRUCTS = structures.structures as Record<StructKind, StructStats>;
export const USABLES = structures.usables as Record<UsableKind, UsableStats>;
const FAST = ZOMBIE_KINDS.indexOf('fast');

/** Everything a run's balance comes from: the data files with the skill tree's upgrades applied. */
export interface Stats {
  units: Record<UnitKind, UnitStats>;
  roadblocks: typeof ROADBLOCKS;
  structs: Record<StructKind, StructStats>;
  usables: Record<UsableKind, UsableStats>;
  leakLimit: number;
  indoor: { rangeBy: number; damageBy: number };
}
/** The data files as they are, a fresh copy to change. */
export const baseStats = (): Stats =>
  structuredClone({ units: UNITS, roadblocks: ROADBLOCKS, structs: STRUCTS, usables: USABLES, leakLimit: economy.leakLimit, indoor: economy.indoor });

export interface WavePlan { gap: number; waves: { duration: number; spawn: Partial<Record<string, number>> }[] }

export interface Soldier {
  kind: UnitKind;
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  angle: number; // where the cone points
  reach: number; // how far out its handle sits: farther is narrower (for mortars: where the shells land)
  cooldown: number;
  firedAt: number;
  shot: number; // the way he last fired: at his mark, somewhere inside the cone
  walking: boolean;
  heading: number;
  facing: number; // which of the 8 drawn directions
  priority: (typeof PRIORITIES)[number];
  turrets: number; // a sentry operator's turrets still to deploy
  owner?: Soldier; // a turret's operator
  dest?: { x: number; y: number; field: Float32Array };
  // What nearby structures give him, worked out each step.
  rangeBy: number; // watchtower
  rateBy: number; // extra ammo
  incendiary: boolean;
  cover: number; // sandbag nest: share of damage he still takes
  indoor: boolean; // at a window or on a roof: cannot die, never targeted, longer range, less damage
  kills: number; // zombies he has killed this run (his shots, his shells, the fires he lit)
  leaving?: boolean; // pulled out mid-wave: walking back to the safe zone, then back in the bar
  name: string; // his surname, for his card and the memorial
}

/** Surnames for the squad, one each, none twice in a fight. */
const NAMES = ['Alvarez', 'Reyes', 'Okafor', 'Novak', 'Tanaka', 'Murphy', 'Santos', 'Kowalski', 'Haddad', 'Mendoza', 'Brennan', 'Castillo', 'Nguyen',
  'Ibarra', 'Lindqvist', 'Abara', 'Dela Cruz', 'Moreau', 'Petrov', 'Garza', 'Hale', 'Kim', 'Bautista', 'Rossi', 'Adeyemi', 'Walsh', 'Ortega', 'Fischer',
  'Silva', 'Navarro', 'Duarte', 'Yamada', "O'Neil", 'Romero', 'Quinn', 'Mercado', 'Jensen', 'Sato', 'Villanueva', 'Brooks', 'Aquino', 'Marino', 'Kaur',
  'Delgado', 'Hayes', 'Torres', 'Volkov', 'Mensah', 'Pacheco', 'Ward', 'Lim', 'Esposito', 'Cruz', 'Bishop', 'Salazar', 'Ito', 'Grady', 'Ferreira'];
/** Someone left in a building: a soldier holds its door a while (`CIVILIAN_HOLD`) to bring them out, then they are
 *  walked to the safe zone like a soldier. Zombies that reach one hurt them. */
export interface Civilian {
  id: number;
  x: number; // where they stand (in the street at the door, until brought out)
  y: number;
  door: number; // the building tile they are in (-1: hiding in an abandoned car instead, on a map with few buildings)
  state: 'inside' | 'out' | 'saved' | 'dead';
  held: number; // seconds of fight a soldier has held the door
  hp: number;
  walking: boolean;
  dest?: { x: number; y: number; field: Float32Array };
}
export const CIVILIAN_HOLD = 15; // seconds of fight a soldier must hold the door: 3 s at 1× (PACE 5)
const CIVILIAN = { hp: 60, speed: 34, radius: 4, reach: 22 }; // reach: how near the door a soldier must stand

/** Anything built that is not a roadblock: towers, ammo, mines, wire, puddles and the rest. Sits on whole tiles. */
export interface Structure {
  id: number;
  kind: StructKind;
  tx: number;
  ty: number;
  vertical: boolean; // wire and spike strips lie across a street, or along it
  angle: number; // where a rigged car will drive
  hp: number; // spike strips wear out
  x: number; // centre, in world units (a driving car moves)
  y: number;
  driving: boolean;
  kills: number; // a rigged car's kills left
  travelled: number;
}
/** A spot on the ground where something is happening for a while: fire, smoke, a lure, a live puddle. */
export interface Zone { kind: 'fire' | 'smoke' | 'lure' | 'shock'; x: number; y: number; r: number; t: number }
/** A strike on its way in. */
export interface Strike { kind: UsableKind; x: number; y: number; angle: number; t: number; hit: Set<number>; shells: { x: number; y: number; at: number }[] }
/** `tx, ty` is the middle tile; it covers `length` tiles across (or down, when vertical). */
export interface Roadblock {
  id: number; kind: BlockKind; tx: number; ty: number; vertical: boolean; hp: number;
  prop?: boolean; // already in the street when the run starts: only a soldier can move it
  haul?: { s: Soldier; tx: number; ty: number; vertical: boolean }; // a soldier on his way to move it
}
export interface Shot { x1: number; y1: number; x2: number; y2: number; age: number; heavy: boolean }
export interface Blast { x: number; y: number; r: number; age: number; bile: boolean }
export interface Scream { x: number; y: number; r: number; age: number }
/** A rocket flies straight until it hits; a shell or grenade arcs to its landing point over anything. */
export interface Projectile { by: string | Soldier; grace: number; arc: boolean; x: number; y: number; x0: number; y0: number; x1: number; y1: number; vx: number; vy: number; t: number; flight: number; blast: number; damage: number }

/** A defence laid out while planning, to put down again next time (see World.setup and World.useSetup). */
export interface Setup {
  soldiers: { kind: UnitKind; x: number; y: number; angle: number; reach: number; priority: (typeof PRIORITIES)[number]; turrets: { x: number; y: number; angle: number; reach: number }[] }[];
  blocks: { kind: BlockKind; tx: number; ty: number; vertical: boolean }[];
  props: { tx: number; ty: number; vertical: boolean }[]; // where the map's own cars and barricades were moved, in the map's order
  structures: { kind: StructKind; tx: number; ty: number; vertical: boolean; angle: number }[];
}

export const facingOf =(angle: number) => ((Math.round(angle / ((2 * Math.PI) / DIRS)) % DIRS) + DIRS) % DIRS;
export const coneOf = (u: UnitStats) => u.cone ?? DEFAULT_CONE;
export const indirect = (u: UnitStats) => u.weapon === 'shell';
export const support = (u: UnitStats) => u.weapon === 'heal' || u.weapon === 'repair';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class World {
  readonly grid: Grid;
  readonly stats: Stats;
  leakLimit: number; // lifted by the debug switch for unlimited leaks
  hpBy = 1; // the save's difficulty: every zombie's health times this
  countBy = 1; // and every wave's numbers
  sightBy = 1; // the weather: rain and fog cut every soldier's range by a few percent
  phase: 'plan' | 'wave' | 'won' | 'lost' = 'plan';
  time = 0;
  kills = 0;
  /** Kills by who made them: a soldier class, a structure or a strike. Fire counts for whoever lit it. */
  killsBy: Record<string, number> = {};
  private by: string | Soldier = ''; // who is dealing the damage being done right now: a soldier, or what else by name
  leaks = 0;
  leakAt: { x: number; y: number }[] = []; // where they got through (the first 300), for the report's sketch
  wave = 0;
  flow!: Float32Array;
  private readonly flowFree: Float32Array; // ignores roadblocks: the way a zombie goes until one is close ahead
  /** The horde's routes (sim/routes.ts), and how near one a zombie counts as on it, in px. */
  readonly routes: Routes;
  readonly routeNear: number;

  // Zombies live in parallel arrays, one slot each; a dead zombie's slot is reused, so a big fight makes no garbage.
  n = 0;
  living = 0;
  readonly zx = new Float32Array(CAP);
  readonly zy = new Float32Array(CAP);
  readonly zvx = new Float32Array(CAP);
  readonly zvy = new Float32Array(CAP);
  readonly zdx = new Float32Array(CAP); // where it wants to go
  readonly zdy = new Float32Array(CAP);
  readonly zhp = new Float32Array(CAP);
  readonly zhit = new Float32Array(CAP); // time left on the hit flash
  readonly zburn = new Float32Array(CAP); // time left burning
  readonly zburnDps = new Float32Array(CAP);
  private readonly zburnBy: (string | Soldier)[] = []; // who set it alight
  readonly zboost = new Float32Array(CAP); // time left sped up (screams, bloater bursts)
  readonly zboostBy = new Float32Array(CAP);
  readonly zclock = new Float32Array(CAP); // countdown to a screamer's scream or a hordemother's brood
  readonly zkind = new Uint8Array(CAP);
  readonly zroute = new Int16Array(CAP); // the route it keeps to, -1 for none yet
  readonly zprog = new Int32Array(CAP); // how far along it, in its tiles
  readonly zlink = new Float32Array(CAP); // 1 on its route, less for each zombie it follows back to it, 0 making for it alone
  readonly alive = new Uint8Array(CAP);
  private free: number[] = [];

  soldiers: Soldier[] = [];
  civilians: Civilian[] = [];
  roadblocks: Roadblock[] = [];
  shots: Shot[] = [];
  blasts: Blast[] = [];
  screams: Scream[] = [];
  projectiles: Projectile[] = [];
  structures: Structure[] = [];
  zones: Zone[] = [];
  private effects: Zone[] = []; // zones plus live puddles, this step
  strikes: Strike[] = [];
  /** How many of each soldier, roadblock and structure have been put down this run (dead and used-up ones count). */
  used: Record<string, number> = {};
  charges: Record<UsableKind, number>;
  readyAt: Record<UsableKind, number>;
  /** Zombies killed since the screen last looked, for corpses and blood. */
  deaths: { x: number; y: number; kind: number; angle: number }[] = [];
  /** What made a noise since the screen last looked: a soldier's kind when he fires, 'boom' (a small blast, size = its
   *  radius), 'blast' (a big one: mines, explosives, artillery), 'missile' (called in), 'napalm', 'a10', 'scream' (a
   *  screamer), 'boss' (a brute or hordemother arriving) or 'broken' (a roadblock giving way). The screen turns these into sound and empties the list. */
  sounds: { kind: string; x: number; y: number; size: number }[] = [];
  private noise(kind: string, x: number, y: number, size = 0) { if (this.sounds.length < 512) this.sounds.push({ kind, x, y, size }); }
  private byId = new Map<number, Roadblock>();
  private structById = new Map<number, Structure>();
  private structAt: Int32Array; // structure id on each tile, 0 for none
  private nextBlock = 1;

  private waveClock = 0;
  private mobAt = 0; // the spawn tile the current mob pours in at
  private mob = -1; // which mob of the wave that is
  private mobRoute = -1; // the route that mob takes
  private queue: number[] = [];
  private spawned = 0;
  private full = 0; // seconds the current mob has found its way in full
  private readonly plan: WavePlan;
  private seed: number;

  // Spatial grid (one cell per tile): who is near whom without checking every pair.
  private readonly cell = new Int32Array(CAP);
  private readonly cellStart: Int32Array;
  private readonly cellFill: Int32Array;
  private readonly cellItems = new Int32Array(CAP);
  private readonly found: number[] = [];
  private readonly dir = { x: 0, y: 0 };
  private px = 0;
  private py = 0;
  private touch = 0;
  private tnx = 0;
  private tny = 0;

  constructor(map: MapData, plan: WavePlan, seed = 1, stats = baseStats()) {
    this.plan = plan;
    this.seed = seed;
    this.stats = stats;
    this.leakLimit = stats.leakLimit;
    this.charges = Object.fromEntries(Object.entries(stats.usables).map(([k, u]) => [k, u.charges])) as Record<UsableKind, number>;
    this.readyAt = Object.fromEntries(Object.keys(stats.usables).map((k) => [k, 0])) as Record<UsableKind, number>;
    this.grid = new Grid(map);
    this.cellStart = new Int32Array(this.grid.w * this.grid.h + 1);
    this.cellFill = new Int32Array(this.grid.w * this.grid.h);
    this.structAt = new Int32Array(this.grid.w * this.grid.h);
    const { wall } = this.grid;
    this.flowFree = distanceField(this.grid, this.grid.goals, (i) => (wall[i] ? Infinity : 1));
    this.routes = routesOf(map, this.grid, map.scale ?? 1);
    this.routeNear = ROUTE_NEAR * (map.scale ?? 1) * map.tile;
    this.reflow();
    // Cars, a bus and barricades already in the street: roadblocks you do not own, that a soldier can move.
    for (const pr of map.props ?? []) {
      const rb = this.placeBlock(pr.kind as BlockKind, pr.tx, pr.ty, pr.vertical, false);
      if (rb) rb.prop = true;
    }
  }

  /** mulberry32: the same seed plays out the same fight. */
  random() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get waves() { return this.plan.waves.length; }
  /** Zombies still to deal with: alive now, still to pour in this wave, and every wave after it. */
  get left() {
    let n = this.living + this.queue.length - this.spawned;
    for (let k = this.wave + 1; k < this.plan.waves.length; k++) n += Object.values(this.plan.waves[k].spawn).reduce((a: number, b) => a + Math.round((b ?? 0) * this.countBy), 0);
    return n;
  }
  private get spawningDone() { return this.wave >= this.plan.waves.length - 1 && this.spawned >= this.queue.length; }

  // ---- Orders ----

  start() {
    if (this.phase !== 'plan') return;
    this.phase = 'wave';
    this.startWave();
  }

  canStand(x: number, y: number) {
    const i = this.grid.at(x, y);
    return i >= 0 && !this.grid.wall[i] && !this.grid.block[i] && !this.grid.goal[i];
  }

  private count(kind: string, n: number) { this.used[kind] = (this.used[kind] ?? 0) + n; }

  /** A soldier let go next to a watchtower or sandbag nest steps into it. */
  private snap(x: number, y: number): [number, number] {
    for (const st of this.structures) if ((st.kind === 'watchtower' || st.kind === 'nest') && Math.hypot(st.x - x, st.y - y) < 12) return [st.x, st.y];
    return [x, y];
  }

  /** A free window or roof under (x, y), if this class can go indoors. */
  private freeSlot(kind: UnitKind, x: number, y: number, self?: Soldier) {
    const i = this.grid.at(x, y);
    if (i < 0 || !this.grid.slot[i] || this.stats.units[kind].outdoor) return;
    if (this.soldiers.some((o) => o !== self && !o.dead && o.indoor && this.grid.at(o.x, o.y) === i)) return;
    const T = this.grid.tile, tx = i % this.grid.w;
    return [(tx + 0.5) * T, ((i - tx) / this.grid.w + 0.5) * T] as [number, number];
  }

  /** Where a soldier let go at (x, y) would end up: a street, a free window or roof, or nowhere. */
  spotFor(kind: UnitKind, x: number, y: number, self?: Soldier): { x: number; y: number; indoor: boolean } | undefined {
    if (this.canStand(x, y)) {
      [x, y] = this.snap(x, y);
      return { x, y, indoor: false };
    }
    const slot = this.freeSlot(kind, x, y, self);
    return slot && { x: slot[0], y: slot[1], indoor: true };
  }

  placeSoldier(kind: UnitKind, x: number, y: number, owner?: Soldier): Soldier | undefined {
    const s = this.ghost(kind, x, y, owner);
    if (!s) return;
    const taken = new Set(this.soldiers.map((o) => o.name)), free = NAMES.filter((n) => !taken.has(n));
    s.name = free.length ? free[(this.random() * free.length) | 0] : NAMES[(this.random() * NAMES.length) | 0];
    this.soldiers.push(s);
    if (!owner) this.count(kind, 1);
    return s;
  }

  /** The soldier `placeSoldier` would put down at (x, y), not put down: for showing his cone before he is dropped. */
  ghost(kind: UnitKind, x: number, y: number, owner?: Soldier): Soldier | undefined {
    const spot = this.spotFor(kind, x, y);
    if (!spot) return;
    ({ x, y } = spot);
    const u = this.stats.units[kind], c = coneOf(u), north = -Math.PI / 2;
    const reach = indirect(u) ? (u.minRange! + u.range) / 2 : (c.handleMin + c.handleMax) / 2;
    const s: Soldier = {
      kind, x, y, hp: u.hp, dead: false, angle: north, reach, cooldown: 0, firedAt: -1, shot: north, walking: false, heading: north,
      facing: facingOf(north), priority: 'nearest', turrets: u.turrets ?? 0, owner, rangeBy: 1, rateBy: 1, incendiary: false, cover: 1,
      indoor: spot.indoor, kills: 0, name: '',
    };
    return s;
  }

  /** A sentry operator sets a turret down anywhere; it keeps the cone the operator had. */
  deployTurret(op: Soldier, x: number, y: number) {
    if (op.dead || op.turrets <= 0) return;
    const t = this.placeSoldier('turret', x, y, op);
    if (!t) return;
    op.turrets--;
    t.angle = op.angle;
    t.reach = op.reach;
    t.facing = facingOf(t.angle);
    return t;
  }

  /** While planning the soldier is simply put there (a window or roof too); during a wave he walks, around buildings
   *  if he has to. Mid-wave a soldier can come out of a building but not go into one. */
  moveSoldier(s: Soldier, x: number, y: number) {
    if (s.dead || this.stats.units[s.kind].fixed) return false;
    const spot = this.spotFor(s.kind, x, y, s);
    if (!spot || (spot.indoor && this.phase !== 'plan')) return false;
    ({ x, y } = spot);
    s.leaving = false;
    if (this.phase === 'plan') {
      s.x = x;
      s.y = y;
      s.indoor = spot.indoor;
      return true;
    }
    const { wall, block } = this.grid;
    s.dest = { x, y, field: distanceField(this.grid, [this.grid.at(x, y)], (i) => (wall[i] || block[i] ? Infinity : 1)) };
    return true;
  }

  /** Only while planning. A turret goes back to its operator; an operator takes his turrets with him. */
  removeSoldier(s: Soldier) {
    if (this.phase !== 'plan') return;
    if (s.owner) s.owner.turrets++;
    else this.count(s.kind, -1);
    this.soldiers = this.soldiers.filter((o) => o !== s && o.owner !== s);
  }

  /** Pulls a soldier out: while planning he is simply taken back; mid-wave he walks to the nearest safe-zone tile and,
   *  once there, is back in the bar to put down again. A turret, or anyone fixed in place, cannot be pulled out. */
  retreatSoldier(s: Soldier) {
    if (s.dead || s.owner || this.stats.units[s.kind].fixed) return false;
    if (this.phase === 'plan') { this.removeSoldier(s); return true; }
    const { goals, w, tile: T, wall, block } = this.grid, at = (i: number): [number, number] => [((i % w) + 0.5) * T, (Math.floor(i / w) + 0.5) * T];
    const far = (i: number) => Math.hypot(at(i)[0] - s.x, at(i)[1] - s.y), home = goals.reduce((b, i) => (far(i) < far(b) ? i : b), goals[0]);
    if (home === undefined) return false;
    const [x, y] = at(home);
    s.dest = { x, y, field: distanceField(this.grid, [home], (i) => (wall[i] || block[i] ? Infinity : 1)) };
    s.leaving = true;
    return true;
  }

  /** Puts `n` civilians in buildings along the streets: doors partway down the horde's way (not at its ways in nor
   *  beside the safe zone), spread apart, the same doors every time on a map. */
  placeCivilians(n: number) {
    const { w, h, wall, goal, tile: T } = this.grid, flow = this.flowFree;
    const far = Math.max(...this.grid.spawns.map((i) => flow[i]).filter(Number.isFinite));
    const spots: { street: number; door: number; k: number }[] = [];
    for (let i = 0; i < w * h; i++) {
      if (wall[i] || goal[i] || !Number.isFinite(flow[i]) || flow[i] < far * 0.3 || flow[i] > far * 0.75) continue;
      const x = i % w, door = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].find((j) => j >= 0 && j < w * h && wall[j] === 1);
      if (door !== undefined) spots.push({ street: i, door, k: Math.imul(i + 1, 2654435761) >>> 0 });
    }
    // A map with few buildings along the way (a bridge, a lawn): some hide in the abandoned cars in the street instead.
    for (const rb of this.roadblocks.filter((o) => o.prop)) {
      const [cx, cy] = this.blockCentre(rb), around = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => this.grid.at(cx + dx * T * 1.5, cy + dy * T * 1.5));
      const street = around.find((i) => i >= 0 && !wall[i] && !goal[i] && !this.grid.block[i] && Number.isFinite(flow[i]) && flow[i] > far * 0.25 && flow[i] < far * 0.8);
      if (street !== undefined) spots.push({ street, door: -1, k: Math.imul(street + 7, 2654435761) >>> 0 });
    }
    spots.sort((a, b) => (a.door < 0 ? 1 : 0) - (b.door < 0 ? 1 : 0) || a.k - b.k); // a building's door first, a car only if need be
    const picked: typeof spots = [], dist = (p: (typeof spots)[number], s: (typeof spots)[number]) => Math.hypot((p.street % w) - (s.street % w), Math.floor(p.street / w) - Math.floor(s.street / w));
    for (let apart = Math.max(w, h) / 5; apart >= 2 && picked.length < n; apart /= 2) // spread apart, closer if they will not fit
      for (const s of spots) if (picked.length < n && !picked.includes(s) && picked.every((p) => dist(p, s) > apart)) picked.push(s);
    this.civilians = picked.map((s, id) => ({ id, x: ((s.street % w) + 0.5) * T, y: (Math.floor(s.street / w) + 0.5) * T, door: s.door, state: 'inside', held: 0, hp: CIVILIAN.hp, walking: false }));
  }

  /** Walks a civilian who is out toward (x, y): anywhere open, the safe zone too. */
  moveCivilian(c: Civilian, x: number, y: number) {
    const i = this.grid.at(x, y);
    if (c.state !== 'out' || i < 0 || this.grid.wall[i] || this.grid.block[i]) return false;
    const { wall, block } = this.grid;
    c.dest = { x, y, field: distanceField(this.grid, [i], (j) => (wall[j] || block[j] ? Infinity : 1)) };
    return true;
  }

  get saved() { return this.civilians.filter((c) => c.state === 'saved').length; }

  /** Each step: a soldier standing at a door brings its civilian out; those out walk where they were sent, are hurt
   *  by zombies touching them, and are safe once in the safe zone. */
  private updateCivilians(dt: number) {
    for (const c of this.civilians) {
      if (c.state === 'inside') {
        const guard = this.soldiers.some((s) => !s.dead && !s.owner && !s.walking && Math.hypot(s.x - c.x, s.y - c.y) <= CIVILIAN.reach);
        c.held = guard ? c.held + dt : Math.max(0, c.held - dt * 2);
        if (c.held >= CIVILIAN_HOLD) c.state = 'out';
        continue;
      }
      if (c.state !== 'out') continue;
      c.walking = false;
      if (c.dest) {
        const { x, y, field } = c.dest, d = Math.hypot(x - c.x, y - c.y);
        if (d < 1) c.dest = undefined;
        else {
          let dx = (x - c.x) / d, dy = (y - c.y) / d;
          if (!this.clearLine(c.x, c.y, x, y) && downhill(this.grid, field, c.x, c.y, this.dir)) { dx = this.dir.x; dy = this.dir.y; }
          const step = Math.min(d, CIVILIAN.speed * dt);
          this.pushOut(c.x + dx * step, c.y + dy * step, CIVILIAN.radius);
          c.x = this.px;
          c.y = this.py;
          c.walking = true;
        }
      }
      for (const j of this.within(c.x, c.y, CIVILIAN.radius + 2)) c.hp -= ZOMBIES[this.zkind[j]].dps * dt;
      const i = this.grid.at(c.x, c.y);
      if (c.hp <= 0) c.state = 'dead';
      else if (i >= 0 && this.grid.goal[i]) { c.state = 'saved'; c.dest = undefined; }
    }
  }

  /** The defence as it stands while planning, to keep for next time. */
  setup(): Setup {
    return {
      soldiers: this.soldiers.filter((s) => !s.owner).map((s) => ({
        kind: s.kind, x: s.x, y: s.y, angle: s.angle, reach: s.reach, priority: s.priority,
        turrets: this.soldiers.filter((t) => t.owner === s).map((t) => ({ x: t.x, y: t.y, angle: t.angle, reach: t.reach })),
      })),
      blocks: this.roadblocks.filter((rb) => !rb.prop).map(({ kind, tx, ty, vertical }) => ({ kind, tx, ty, vertical })),
      props: this.roadblocks.filter((rb) => rb.prop).map(({ tx, ty, vertical }) => ({ tx, ty, vertical })),
      structures: this.structures.map(({ kind, tx, ty, vertical, angle }) => ({ kind, tx, ty, vertical, angle })),
    };
  }

  /** Only while planning: clears what has been put down and lays out a kept setup again, as much of it as `have` (how
   *  many of each you own) allows and as still fits. The map's own cars go back where they were moved to. */
  useSetup(p: Setup, have: Record<string, number>) {
    if (this.phase !== 'plan') return;
    for (const s of this.soldiers.filter((o) => !o.owner)) this.removeSoldier(s);
    for (const rb of this.roadblocks.filter((o) => !o.prop)) this.removeBlock(rb, true);
    for (const st of [...this.structures]) this.removeStructure(st, true);
    const props = this.roadblocks.filter((rb) => rb.prop), left = (kind: string) => (have[kind] ?? 0) - (this.used[kind] ?? 0) > 0;
    props.forEach((rb) => this.mark(rb, 0));
    props.forEach((rb, k) => {
      const to = p.props[k];
      if (to && this.blockFits(rb.kind, to.tx, to.ty, to.vertical, rb)) Object.assign(rb, { tx: to.tx, ty: to.ty, vertical: to.vertical });
      this.mark(rb, rb.id);
    });
    this.reflow();
    for (const o of p.structures) if (left(o.kind)) { const st = this.placeStructure(o.kind, o.tx, o.ty, o.vertical); if (st) st.angle = o.angle; }
    for (const o of p.blocks) if (left(o.kind)) this.placeBlock(o.kind, o.tx, o.ty, o.vertical);
    for (const o of p.soldiers) {
      const s = left(o.kind) ? this.placeSoldier(o.kind, o.x, o.y) : undefined;
      if (!s) continue;
      s.priority = o.priority;
      this.aimAs(s, o.angle, o.reach);
      for (const t of o.turrets) { const turret = this.deployTurret(s, t.x, t.y); if (turret) this.aimAs(turret, t.angle, t.reach); }
    }
  }

  private aimAs(s: Soldier, angle: number, reach: number) {
    const u = this.stats.units[s.kind], c = coneOf(u);
    s.angle = angle;
    s.reach = indirect(u) ? clamp(reach, u.minRange!, u.range) : clamp(reach, c.handleMin, c.handleMax);
    s.facing = facingOf(angle);
  }

  /** Points the cone at (x, y); the farther out, the narrower. Mortars and grenadiers aim at the spot itself. */
  aim(s: Soldier, x: number, y: number) {
    const u = this.stats.units[s.kind], c = coneOf(u);
    if (u.fixed || support(u)) return;
    s.angle = Math.atan2(y - s.y, x - s.x);
    s.reach = indirect(u) ? clamp(Math.hypot(x - s.x, y - s.y), u.minRange!, u.range) : clamp(Math.hypot(x - s.x, y - s.y), c.handleMin, c.handleMax);
    if (!s.walking) s.facing = facingOf(s.angle);
  }

  /** Half the cone's width, in radians. */
  spread(s: Soldier) {
    const c = coneOf(this.stats.units[s.kind]), t = (s.reach - c.handleMin) / (c.handleMax - c.handleMin);
    return ((c.widest + (c.narrowest - c.widest) * t) * Math.PI) / 180;
  }

  /** How far a soldier reaches, a watchtower or a window included. */
  rangeOf(s: Soldier) { return this.stats.units[s.kind].range * s.rangeBy * this.sightBy * (s.indoor ? this.stats.indoor.rangeBy : 1); }

  /** What one hit of his does: less from indoors. */
  private damageOf(s: Soldier) { return this.stats.units[s.kind].damage! * (s.indoor ? this.stats.indoor.damageBy : 1); }

  firing(s: Soldier) { return this.phase !== 'plan' && this.time - s.firedAt < FIRING_LOOK; }

  /** The tiles of a line `length` long centred on (tx, ty), across or down; undefined if it runs off the map. */
  lineTiles(length: number, tx: number, ty: number, vertical: boolean) {
    const { w, h } = this.grid, from = -((length - 1) >> 1), tiles: number[] = [];
    for (let k = from; k < from + length; k++) {
      const x = vertical ? tx : tx + k, y = vertical ? ty + k : ty;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      tiles.push(y * w + x);
    }
    return tiles;
  }

  /** A roadblock's tiles: `length` along it, centred on (tx, ty), and `width` across (a car is 2 by 3, a bus 2 by 5);
   *  a wide one reaches below (or right of) its centre line. Undefined if it runs off the map. */
  blockTiles(kind: BlockKind, tx: number, ty: number, vertical: boolean) {
    const { length, width = 1 } = this.stats.roadblocks[kind], tiles: number[] = [];
    for (let across = 0; across < width; across++) {
      const line = this.lineTiles(length, vertical ? tx + across : tx, vertical ? ty : ty + across, vertical);
      if (!line) return;
      tiles.push(...line);
    }
    return tiles;
  }
  structTiles(kind: StructKind, tx: number, ty: number, vertical: boolean) { return this.lineTiles(this.stats.structs[kind].length ?? 1, tx, ty, vertical); }

  blockFits(kind: BlockKind, tx: number, ty: number, vertical: boolean, self?: Roadblock) {
    const { wall, goal, block } = this.grid, tiles = this.blockTiles(kind, tx, ty, vertical);
    return !!tiles && tiles.every((i) => !wall[i] && !goal[i] && !this.structAt[i] && (!block[i] || block[i] === self?.id)) &&
      !this.soldiers.some((s) => !s.dead && tiles.includes(this.grid.at(s.x, s.y)));
  }

  /** `counted` is false for a roadblock that was not taken from what you own (a rigged car that came to rest). */
  placeBlock(kind: BlockKind, tx: number, ty: number, vertical: boolean, counted = true): Roadblock | undefined {
    if (!this.blockFits(kind, tx, ty, vertical)) return;
    const rb: Roadblock = { id: this.nextBlock++, kind, tx, ty, vertical, hp: this.stats.roadblocks[kind].hp };
    this.roadblocks.push(rb);
    this.byId.set(rb.id, rb);
    this.mark(rb, rb.id);
    this.reflow();
    if (counted) this.count(kind, 1);
    return rb;
  }

  /** Only while planning: once the horde is in, a roadblock stays where it is. Cement never moves; a prop needs haulProp. */
  moveBlock(rb: Roadblock, tx: number, ty: number, vertical = rb.vertical) {
    if (this.phase !== 'plan' || rb.prop || this.stats.roadblocks[rb.kind].fixed || !this.blockFits(rb.kind, tx, ty, vertical, rb)) return false;
    this.relocate(rb, tx, ty, vertical);
    return true;
  }

  private relocate(rb: Roadblock, tx: number, ty: number, vertical: boolean) {
    this.mark(rb, 0);
    Object.assign(rb, { tx, ty, vertical });
    this.mark(rb, rb.id);
    this.reflow();
  }

  /** A car, bus or barricade already in the street is moved by a soldier: while planning, any soldier out in the
   *  street does it at once; during a wave the nearest one walks over first. False if no one can, or it will not fit. */
  haulProp(rb: Roadblock, tx: number, ty: number, vertical = rb.vertical) {
    if (!rb.prop || !this.blockFits(rb.kind, tx, ty, vertical, rb)) return false;
    const T = this.grid.tile, [cx, cy] = this.blockCentre(rb);
    const crew = this.soldiers.filter((o) => !o.dead && !o.indoor && !this.stats.units[o.kind].fixed);
    if (!crew.length) return false;
    if (this.phase === 'plan') {
      this.relocate(rb, tx, ty, vertical);
      return true;
    }
    const s = crew.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
    // He goes to the open tile beside it that is nearest him.
    let best: [number, number] | undefined, bd = Infinity;
    for (const i of this.blockTiles(rb.kind, rb.tx, rb.ty, rb.vertical)!)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = ((i % this.grid.w) + dx + 0.5) * T, y = (Math.floor(i / this.grid.w) + dy + 0.5) * T, d = Math.hypot(x - s.x, y - s.y);
        if (this.canStand(x, y) && d < bd) { bd = d; best = [x, y]; }
      }
    if (!best || !this.moveSoldier(s, ...best)) return false;
    rb.haul = { s, tx, ty, vertical };
    return true;
  }

  private hauls() {
    const T = this.grid.tile;
    for (const rb of this.roadblocks) {
      const h = rb.haul;
      if (!h) continue;
      if (h.s.dead) { rb.haul = undefined; continue; }
      const near = this.blockTiles(rb.kind, rb.tx, rb.ty, rb.vertical)!.some((i) => Math.hypot(((i % this.grid.w) + 0.5) * T - h.s.x, (Math.floor(i / this.grid.w) + 0.5) * T - h.s.y) < T * 1.3);
      if (!near) continue;
      rb.haul = undefined;
      if (this.blockFits(rb.kind, h.tx, h.ty, h.vertical, rb)) this.relocate(rb, h.tx, h.ty, h.vertical);
    }
  }

  /** `refund` when the player takes it back while planning; a broken one stays used up. */
  removeBlock(rb: Roadblock, refund = false) {
    this.mark(rb, 0);
    this.roadblocks = this.roadblocks.filter((o) => o !== rb);
    this.byId.delete(rb.id);
    this.reflow();
    if (refund) this.count(rb.kind, -1);
  }

  /** The world point a roadblock is centred on. */
  blockCentre(rb: Roadblock): [number, number] {
    const half = ((this.stats.roadblocks[rb.kind].width ?? 1) - 1) / 2;
    return [(rb.tx + 0.5 + (rb.vertical ? half : 0)) * this.grid.tile, (rb.ty + 0.5 + (rb.vertical ? 0 : half)) * this.grid.tile];
  }

  private mark(rb: Roadblock, id: number) {
    for (const i of this.blockTiles(rb.kind, rb.tx, rb.ty, rb.vertical)!) this.grid.block[i] = id;
  }

  // ---- Structures ----

  /** Everything goes on open street, except a generator, which goes inside a building. */
  structFits(kind: StructKind, tx: number, ty: number, vertical: boolean, self?: Structure) {
    const { wall, goal, block } = this.grid, tiles = this.structTiles(kind, tx, ty, vertical);
    return !!tiles && tiles.every((i) => (kind === 'generator' ? wall[i] === 1 : !wall[i] && !goal[i] && !block[i]) && (!this.structAt[i] || this.structAt[i] === self?.id));
  }

  placeStructure(kind: StructKind, tx: number, ty: number, vertical = false): Structure | undefined {
    if (!this.structFits(kind, tx, ty, vertical)) return;
    const T = this.grid.tile, k = this.stats.structs[kind];
    const st: Structure = { id: this.nextBlock++, kind, tx, ty, vertical, angle: -Math.PI / 2, hp: k.hp ?? 0, x: (tx + 0.5) * T, y: (ty + 0.5) * T, driving: false, kills: k.kills ?? 0, travelled: 0 };
    this.structures.push(st);
    this.structById.set(st.id, st);
    this.markStruct(st, st.id);
    this.count(kind, 1);
    return st;
  }

  moveStructure(st: Structure, tx: number, ty: number, vertical = st.vertical) {
    if (this.phase !== 'plan' || !this.structFits(st.kind, tx, ty, vertical, st)) return false;
    const T = this.grid.tile;
    this.markStruct(st, 0);
    Object.assign(st, { tx, ty, vertical, x: (tx + 0.5) * T, y: (ty + 0.5) * T });
    this.markStruct(st, st.id);
    return true;
  }

  /** Wire and spike strips swap between across and along the street; a rigged car turns a quarter. */
  turnStructure(st: Structure) {
    if (this.phase !== 'plan') return;
    if (st.kind === 'rigged') st.angle += Math.PI / 2;
    else this.moveStructure(st, st.tx, st.ty, !st.vertical);
  }

  removeStructure(st: Structure, refund = false) {
    this.markStruct(st, 0);
    this.structures = this.structures.filter((o) => o !== st);
    this.structById.delete(st.id);
    if (refund) this.count(st.kind, -1);
  }

  private markStruct(st: Structure, id: number) {
    for (const i of this.structTiles(st.kind, st.tx, st.ty, st.vertical)!) if (this.structAt[i] === st.id || !this.structAt[i]) this.structAt[i] = id;
  }

  structureAt(x: number, y: number) {
    const i = this.grid.at(x, y);
    return i < 0 ? undefined : this.structById.get(this.structAt[i]);
  }

  /** A puddle is live while a generator is close enough. */
  powered(st: Structure) {
    const r = this.stats.structs.puddle.power!;
    return this.structures.some((g) => g.kind === 'generator' && Math.hypot(g.x - st.x, g.y - st.y) <= r);
  }

  /** Sets off explosives. Like mines, they hurt soldiers too. */
  detonate(st: Structure) {
    if (this.phase !== 'wave' || st.kind !== 'explosives') return;
    this.removeStructure(st);
    this.by = 'explosives';
    this.explode(st.x, st.y, this.stats.structs.explosives.blast!, this.stats.structs.explosives.damage!, true, 'blast');
  }

  /** A noise maker draws the zombies near it for a few seconds, then it is spent. */
  soundOff(st: Structure) {
    if (this.phase !== 'wave' || st.kind !== 'noise') return;
    this.removeStructure(st);
    this.zones.push({ kind: 'lure', x: st.x, y: st.y, r: this.stats.structs.noise.radius!, t: this.stats.structs.noise.time! });
  }

  // ---- Strikes ----

  strikeReady(kind: UsableKind) { return this.phase === 'wave' && this.charges[kind] > 0 && this.time >= this.readyAt[kind]; }

  /** Calls a strike on (x, y). An A-10 flies through (x, y) along `angle`. */
  callStrike(kind: UsableKind, x: number, y: number, angle = 0) {
    if (!this.strikeReady(kind)) return false;
    const u = this.stats.usables[kind], shells: Strike['shells'] = [];
    this.charges[kind]--;
    this.readyAt[kind] = this.time + u.cooldown;
    for (let k = 0; k < (u.shells ?? 0); k++) {
      const a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * u.radius!;
      shells.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, at: u.delay + (k * u.spread!) / u.shells! });
    }
    this.strikes.push({ kind, x, y, angle, t: 0, hit: new Set(), shells });
    return true;
  }

  /** Where an A-10 is over the ground right now. */
  planeAt(s: Strike): [number, number] {
    const u = this.stats.usables.a10, d = (s.t - u.delay) * u.speed! - u.length! / 2;
    return [s.x + Math.cos(s.angle) * d, s.y + Math.sin(s.angle) * d];
  }

  /** Zombies go round a roadblock unless the way round is longer than its `detour`; then they go through it. */
  private reflow() {
    const { wall, block } = this.grid;
    this.flow = distanceField(this.grid, this.grid.goals, (i) => (wall[i] ? Infinity : block[i] ? 1 + this.stats.roadblocks[this.byId.get(block[i])!.kind].detour : 1));
  }

  // ---- Zombies coming in ----

  spawn(kind: number, x: number, y: number) {
    const i = this.free.pop() ?? (this.n < CAP ? this.n++ : -1);
    if (i < 0) return -1;
    const z = ZOMBIES[kind];
    this.zx[i] = x;
    this.zy[i] = y;
    this.zvx[i] = this.zvy[i] = this.zdx[i] = 0;
    this.zdy[i] = 1;
    this.zhp[i] = z.hp * this.hpBy;
    this.zhit[i] = this.zburn[i] = this.zboost[i] = 0;
    this.zclock[i] = z.scream?.every ?? z.brood?.every ?? 0;
    this.zkind[i] = kind;
    this.zroute[i] = -1;
    this.zprog[i] = 0;
    this.zlink[i] = 1;
    this.alive[i] = 1;
    this.living++;
    if (z.smash || z.brood) this.noise('boss', x, y);
    return i;
  }

  private kill(i: number) {
    this.alive[i] = 0;
    this.free.push(i);
    this.living--;
  }

  /** Drops `count` zombies on streets in the north part of the map: a load test for real phones (?horde=1000). */
  horde(count: number) {
    const { w, h, tile, wall, goal } = this.grid;
    for (let k = 0; k < count; ) {
      const tx = (this.random() * w) | 0, ty = (this.random() * h * 0.6) | 0;
      if (wall[ty * w + tx] || goal[ty * w + tx]) continue;
      this.spawn(0, (tx + 0.2 + this.random() * 0.6) * tile, (ty + 0.2 + this.random() * 0.6) * tile);
      k++;
    }
  }

  private startWave() {
    const late = this.queue.slice(this.spawned); // the last wave's stragglers, still to pour in: they come first
    this.waveClock = 0;
    this.spawned = 0;
    this.mob = -1;
    const def = this.plan.waves[this.wave], fresh = def ? Object.entries(def.spawn).flatMap(([k, n]) => Array<number>(Math.round((n ?? 0) * this.countBy)).fill(ZOMBIE_KINDS.indexOf(k))) : [];
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = (this.random() * (i + 1)) | 0;
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    this.queue = [...late, ...fresh];
  }

  private spawnWaves(dt: number) {
    const def = this.plan.waves[this.wave], { spawns, w, tile } = this.grid;
    if (!def) return;
    this.waveClock += dt;
    // The wave comes as a few mobs spread over its duration; each mob arrives at once, packed, at one place.
    const mobs = Math.max(1, Math.round(this.queue.length / MOB)), size = Math.ceil(this.queue.length / mobs);
    const due = Math.min(this.queue.length, size * Math.min(mobs, Math.floor((this.waveClock * mobs) / def.duration) + 1));
    // A mob pours in as fast as there is room at its spawn point: never on top of the ones already there, or a crowd
    // with nowhere to go gets shoved into the buildings beside the street. The cells only know the zombies of the last
    // step, so the ones come in this step are checked too: else a whole mob landed at once, piled up, and jammed.
    const fresh: number[] = [];
    const taken = (x: number, y: number, r: number) =>
      this.within(x, y, r).length > 0 || fresh.some((j) => (this.zx[j] - x) ** 2 + (this.zy[j] - y) ** 2 < (r + ZOMBIES[this.zkind[j]].radius) ** 2);
    spawning: while (this.spawned < due && spawns.length) {
      if (Math.floor(this.spawned / size) !== this.mob) {
        this.mob = Math.floor(this.spawned / size);
        this.mobAt = spawns[(this.random() * spawns.length) | 0];
        this.mobRoute = this.pickRoute(this.mobAt);
      }
      const ax = this.mobAt % w, ay = (this.mobAt - ax) / w, close = spawns.filter((s) => Math.abs((s % w) - ax) <= 2 && Math.abs(Math.floor(s / w) - ay) <= 2);
      for (let tries = 0; tries < 6; tries++) {
        const s = close[(this.random() * close.length) | 0], tx = s % w, ty = (s - tx) / w;
        const x = (tx + 0.2 + this.random() * 0.6) * tile, y = (ty + 0.2 + this.random() * 0.6) * tile;
        // Someone is standing there. Bodies may overlap a little as they come in (pushed apart after), as long as each
        // one keeps 60% of its size clear: a normal one 3.6 px, a brute 7, so the big ones do not wedge at a way in.
        if (taken(x, y, ZOMBIES[this.queue[this.spawned]].radius * 0.6)) continue;
        const i = this.spawn(this.queue[this.spawned++], x, y);
        if (i >= 0) {
          fresh.push(i);
          this.zroute[i] = this.mobRoute;
        }
        this.full = 0;
        continue spawning;
      }
      // Full up: the rest of the mob comes in as the front moves off. A way in that stays full (a jam, or a roadblock
      // across it) sends the mob to another, or the wave would never finish coming.
      if ((this.full += dt) > 2) {
        this.full = 0;
        this.mobAt = spawns[(this.random() * spawns.length) | 0];
        this.mobRoute = this.pickRoute(this.mobAt);
      }
      break;
    }
    if (this.wave < this.plan.waves.length - 1 && this.waveClock >= def.duration + this.plan.gap) {
      this.wave++;
      this.startWave();
    }
  }

  // ---- One step ----

  step(dt = STEP) {
    if (this.phase !== 'wave') return;
    this.time += dt;
    this.spawnWaves(dt);
    this.buildCells();
    this.effects = [...this.zones, ...this.structures.filter((st) => st.kind === 'puddle' && this.powered(st)).map((st): Zone => ({ kind: 'shock', x: st.x, y: st.y, r: this.stats.structs.puddle.radius!, t: 1 }))];
    this.steerZombies(dt);
    this.separate();
    this.collide(dt);
    this.updateSoldiers(dt);
    this.updateCivilians(dt);
    this.hauls();
    this.updateStructures(dt);
    this.updateStrikes(dt);
    this.flyProjectiles(dt);
    this.age(dt);
    if (this.leaks >= this.leakLimit) this.phase = 'lost';
    else if (this.spawningDone && this.living === 0 && !this.civilians.some((c) => c.state === 'out' && c.dest)) this.phase = 'won'; // a civilian on the way gets there first
  }

  private age(dt: number) {
    for (const list of [this.shots, this.blasts, this.screams] as { age: number }[][]) {
      let k = 0;
      for (const e of list) if ((e.age += dt) < (list === this.shots ? SHOT_LIFE : BLAST_LIFE)) list[k++] = e;
      list.length = k;
    }
  }

  private buildCells() {
    const { w, h, tile } = this.grid, start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) { this.cell[i] = -1; continue; }
      const c = clamp(Math.floor(this.zy[i] / tile), 0, h - 1) * w + clamp(Math.floor(this.zx[i] / tile), 0, w - 1);
      this.cell[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < w * h; c++) start[c + 1] += start[c];
    this.cellFill.set(start.subarray(0, w * h));
    for (let i = 0; i < this.n; i++) if (this.cell[i] >= 0) this.cellItems[this.cellFill[this.cell[i]]++] = i;
  }

  /** Living zombies in the cells under a box. Returns one shared array: copy it if anything may call near() again. */
  private near(x0: number, y0: number, x1: number, y1: number) {
    const { w, h, tile } = this.grid, out = this.found;
    out.length = 0;
    for (let ty = clamp(Math.floor(y0 / tile), 0, h - 1); ty <= clamp(Math.floor(y1 / tile), 0, h - 1); ty++)
      for (let tx = clamp(Math.floor(x0 / tile), 0, w - 1); tx <= clamp(Math.floor(x1 / tile), 0, w - 1); tx++)
        for (let k = this.cellStart[ty * w + tx]; k < this.cellStart[ty * w + tx + 1]; k++)
          if (this.alive[this.cellItems[k]]) out.push(this.cellItems[k]);
    return out;
  }

  /** Living zombies within r of a point (a copy, safe to hold while damaging them). */
  private within(x: number, y: number, r: number) {
    return this.near(x - r, y - r, x + r, y + r).filter((j) => (this.zx[j] - x) ** 2 + (this.zy[j] - y) ** 2 <= (r + ZOMBIES[this.zkind[j]].radius) ** 2);
  }

  private boost(j: number, by: number, time: number) {
    this.zboostBy[j] = Math.max(by, this.zboost[j] > 0 ? this.zboostBy[j] : 1);
    this.zboost[j] = Math.max(this.zboost[j], time);
  }

  private steerZombies(dt: number) {
    const live = this.soldiers.filter((s) => !s.dead && !s.indoor), ease = Math.min(1, dt * 8);
    const leaders: number[] = []; // intelligent zombies, pulling others in front of themselves
    for (let i = 0; i < this.n; i++) if (this.alive[i] && ZOMBIES[this.zkind[i]].shield) leaders.push(i);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const z = ZOMBIES[this.zkind[i]], x = this.zx[i], y = this.zy[i];
      if (this.zburn[i] > 0) {
        this.zburn[i] -= dt;
        this.by = this.zburnBy[i];
        this.damage(i, this.zburnDps[i] * dt, 'fire');
        if (!this.alive[i]) continue;
      }
      if (z.scream || z.brood) this.special(i, z, dt);
      // What the ground does to it: wire and spikes underfoot, fire, smoke, a live puddle, a lure.
      let slow = 1, lure: Zone | undefined, lureD = Infinity;
      const tile = this.grid.at(x, y), st = tile >= 0 ? this.structById.get(this.structAt[tile]) : undefined;
      if (st && !z.jumps && st.kind === 'wire') slow *= this.stats.structs.wire.slow!;
      if (st && !z.jumps && st.kind === 'spikes') {
        const sp = this.stats.structs.spikes;
        this.by = 'spikes';
        this.damage(i, sp.dps! * (this.zkind[i] === FAST ? sp.fastBy! : 1) * dt, 'dot');
        st.hp -= sp.wear! * dt;
        slow *= sp.slow!;
      }
      for (const e of this.effects) {
        const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d2 > e.r * e.r) continue;
        if (e.kind === 'fire') {
          this.by = 'napalm';
          this.ignite(i, this.stats.usables.napalm.burn!);
        }
        else if (e.kind === 'smoke') slow *= this.stats.usables.smoke.slow!;
        else if (e.kind === 'shock') {
          this.by = 'puddle';
          this.damage(i, this.stats.structs.puddle.dps! * dt, 'dot');
          slow *= this.stats.structs.puddle.slow!;
        } else if (d2 < lureD) { lureD = d2; lure = e; }
      }
      if (!this.alive[i]) continue;
      // An outdoor soldier in sight is the target (a shield draws them); otherwise follow the flow to the safe zone.
      let target: Soldier | undefined, best = z.sight, dx = this.zdx[i], dy = this.zdy[i];
      for (const s of live) {
        const d = Math.hypot(s.x - x, s.y - y) - (this.stats.units[s.kind].taunt ?? 0);
        if (d < best) { best = d; target = s; }
      }
      if (target) {
        const d = Math.hypot(target.x - x, target.y - y) || 1;
        dx = (target.x - x) / d;
        dy = (target.y - y) / d;
        if (!target.dead && d < z.radius + this.stats.units[target.kind].radius + 1.5 && (target.hp -= z.dps * target.cover * dt) <= 0) {
          target.hp = 0;
          target.dead = true;
        }
      } else if (lure) {
        const d = Math.sqrt(lureD) || 1;
        dx = (lure.x - x) / d;
        dy = (lure.y - y) / d;
      } else {
        // Along its route (past its end, the way to the safe zone), as if no roadblock stood in it; only when one is
        // close ahead does a zombie take the way round it (or through it). A jumper never turns: it goes over.
        if ((this.routeWay(i, x, y) || downhill(this.grid, this.flowFree, x, y, this.dir)) && (z.jumps || !this.blockAhead(x, y, this.dir.x, this.dir.y))) {
          dx = this.dir.x;
          dy = this.dir.y;
        } else if (downhill(this.grid, this.flow, x, y, this.dir)) {
          dx = this.dir.x;
          dy = this.dir.y;
        }
        for (const m of leaders) {
          const shield = ZOMBIES[this.zkind[m]].shield!;
          if (m === i || (this.zx[m] - x) ** 2 + (this.zy[m] - y) ** 2 > shield.radius ** 2) continue;
          const ax = this.zx[m] + this.zdx[m] * shield.ahead - x, ay = this.zy[m] + this.zdy[m] * shield.ahead - y, al = Math.hypot(ax, ay) || 1;
          // Never a pull back against its own way: one already standing in front of the leader (in its path) was drawn
          // back onto the spot forever, holding the leader up, and pulls that cancelled the way left it standing.
          if (ax * dx + ay * dy <= 0) continue;
          const bx = dx + ax / al, by = dy + ay / al, bl = Math.hypot(bx, by) || 1;
          dx = bx / bl;
          dy = by / bl;
          break;
        }
      }
      this.zdx[i] = dx;
      this.zdy[i] = dy;
      let speed = z.speed * slow;
      if (this.zboost[i] > 0) {
        this.zboost[i] -= dt;
        speed *= this.zboostBy[i];
      }
      this.zvx[i] += (dx * speed - this.zvx[i]) * ease;
      this.zvy[i] += (dy * speed - this.zvy[i]) * ease;
      this.zx[i] = x + this.zvx[i] * dt;
      this.zy[i] = y + this.zvy[i] * dt;
      if (this.zhit[i] > 0) this.zhit[i] -= dt;
    }
  }

  /** A screamer's scream speeds up those near it; a hordemother drops more zombies. */
  private special(i: number, z: ZombieStats, dt: number) {
    if ((this.zclock[i] -= dt) > 0) return;
    const x = this.zx[i], y = this.zy[i];
    if (z.scream) {
      this.zclock[i] = z.scream.every;
      this.screams.push({ x, y, r: z.scream.radius, age: 0 });
      this.noise('scream', x, y);
      for (const j of this.within(x, y, z.scream.radius)) if (j !== i) this.boost(j, z.scream.boost, z.scream.time);
    } else if (z.brood) {
      this.zclock[i] = z.brood.every;
      for (let k = 0; k < z.brood.count; k++) {
        const a = this.random() * Math.PI * 2;
        const j = this.spawn(ZOMBIE_KINDS.indexOf(z.brood.kind), x + Math.cos(a) * (z.radius + 6), y + Math.sin(a) * (z.radius + 6));
        if (j >= 0) { this.zroute[j] = this.zroute[i]; this.zprog[j] = this.zprog[i]; } // her brood goes her way
      }
    }
  }

  /** The route a new mob from spawn tile `at` takes: one of those from its way in, any of them alike. */
  private pickRoute(at: number) {
    const entry = this.routes.entryOf[at], ways = this.routes.list.flatMap((r, k) => (r.entry === entry ? [k] : []));
    return ways.length ? ways[(this.random() * ways.length) | 0] : -1;
  }

  /** Points this.dir the way zombie i walks to keep to its route; false when it has none (none on this map) or has
   *  come to its end, and it goes for the safe zone. Within routeNear of its route it walks along it, drawn a little
   *  toward the line. Farther off it goes the way a zombie beside it goes, one that is nearer the route, with a bit
   *  less link than that one has; once its link is too low (or no one is there to follow) it makes for the route by
   *  itself, the shortest way, and takes up the route it comes to. */
  private routeWay(i: number, x: number, y: number): boolean {
    const { list, toRoute } = this.routes, g = this.grid, T = g.tile, w = g.w, near = this.routeNear;
    if (!list.length) return false;
    const centre = (t: number) => [((t % w) + 0.5) * T, (Math.floor(t / w) + 0.5) * T];
    for (let tries = 0; tries < 2 && this.zroute[i] >= 0; tries++) {
      const { tiles, ahead } = list[this.zroute[i]], p = this.zprog[i];
      let best = Infinity, k = p;
      for (let q = Math.max(0, p - 4); q < Math.min(tiles.length, p + 16); q++) {
        const [cx, cy] = centre(tiles[q]), d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < best) { best = d; k = q; }
      }
      if (best <= near * near) {
        this.zprog[i] = k;
        this.zlink[i] = 1;
        if (k >= tiles.length - 2) return false;
        const [ax, ay] = centre(tiles[k]), [bx, by] = centre(tiles[ahead[k]]), len = Math.hypot(bx - ax, by - ay) || 1;
        const dx = (bx - ax) / len + ((ax - x) * 0.25) / near, dy = (by - ay) / len + ((ay - y) * 0.25) / near, l = Math.hypot(dx, dy) || 1;
        this.dir.x = dx / l;
        this.dir.y = dy / l;
        return true;
      }
      if (tries || !this.adopt(i, x, y)) break; // far from where it was along its route: the nearest route tile, if near
    }
    // Off it: the zombie beside it, nearer the route, with the most link to pass on.
    const here = g.at(x, y), mine = here < 0 ? Infinity : toRoute[here];
    let lead = -1, link = ALONE / FOLLOW;
    for (const j of this.near(x - T * 1.5, y - T * 1.5, x + T * 1.5, y + T * 1.5)) {
      const t = g.at(this.zx[j], this.zy[j]);
      if (j !== i && t >= 0 && this.zlink[j] >= link && toRoute[t] < mine) { lead = j; link = this.zlink[j]; }
    }
    if (lead >= 0) {
      this.zlink[i] = link * FOLLOW;
      this.dir.x = this.zdx[lead];
      this.dir.y = this.zdy[lead];
      return true;
    }
    this.zlink[i] = 0;
    if (this.adopt(i, x, y)) return this.routeWay(i, x, y);
    return downhill(g, toRoute, x, y, this.dir);
  }

  /** Puts zombie i on the route tile nearest it, if one is within routeNear. */
  private adopt(i: number, x: number, y: number) {
    const { at, idx } = this.routes, g = this.grid, T = g.tile, reach = Math.ceil(this.routeNear / T), tx = Math.floor(x / T), ty = Math.floor(y / T);
    let best = (this.routeNear / T) ** 2, tile = -1;
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const nx = tx + dx, ny = ty + dy, d = dx * dx + dy * dy;
        if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && at[ny * g.w + nx] >= 0 && d <= best) { best = d; tile = ny * g.w + nx; }
      }
    if (tile < 0 || (at[tile] === this.zroute[i] && Math.abs(idx[tile] - this.zprog[i]) < 4)) return false;
    this.zroute[i] = at[tile];
    this.zprog[i] = idx[tile];
    return true;
  }

  /** A roadblock on the line ahead within BLOCK_LOOK, or on the tile underfoot. */
  private blockAhead(x: number, y: number, dx: number, dy: number) {
    const T = this.grid.tile;
    for (let t = 0; t <= BLOCK_LOOK * T; t += T / 2) {
      const i = this.grid.at(x + dx * t, y + dy * t);
      if (i >= 0 && this.grid.block[i]) return true;
    }
    return false;
  }

  /** Zombies never overlap: each pair closer than their drawn size (SPACE) is pushed apart, so a crowd packs shoulder to
   *  shoulder into a carpet that fills the street. */
  private separate() {
    const { w, h } = this.grid, { zx, zy, cellStart: start, cellItems: items } = this;
    for (let i = 0; i < this.n; i++) {
      const c = this.cell[i];
      if (c < 0 || !this.alive[i]) continue;
      const cx = c % w, cy = (c - cx) / w, ri = ZOMBIES[this.zkind[i]].radius, reach = reachOf(ri);
      for (let ty = Math.max(0, cy - reach); ty <= Math.min(h - 1, cy + reach); ty++)
        for (let tx = Math.max(0, cx - reach); tx <= Math.min(w - 1, cx + reach); tx++)
          for (let k = start[ty * w + tx], end = start[ty * w + tx + 1]; k < end; k++) {
            const j = items[k], rj = reachOf(ZOMBIES[this.zkind[j]].radius);
            if (j === i || !this.alive[j] || rj > reach || (rj === reach && j < i)) continue; // each pair once, by the one that looks farther
            let dx = zx[j] - zx[i], dy = zy[j] - zy[i];
            const min = (ri + ZOMBIES[this.zkind[j]].radius) * SPACE, d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            if (d2 < 1e-6) { dx = this.random() - 0.5; dy = this.random() - 0.5; }
            // The bigger one gives way less.
            const d = Math.hypot(dx, dy) || 1e-3, mi = ri * ri, mj = ZOMBIES[this.zkind[j]].radius ** 2, over = (min - d) / d;
            const pi = (over * mj) / (mi + mj), pj = (over * mi) / (mi + mj);
            zx[i] -= dx * pi;
            zy[i] -= dy * pi;
            zx[j] += dx * pj;
            zy[j] += dy * pj;
          }
    }
  }

  /** Walls, roadblocks and soldiers hold zombies back. A zombie shoving straight into a roadblock damages it. */
  private collide(dt: number) {
    const g = this.grid;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const z = ZOMBIES[this.zkind[i]];
      this.pushOut(this.zx[i], this.zy[i], z.radius, !z.jumps);
      let x = this.px, y = this.py;
      const at = g.at(x, y);
      if (at < 0 || g.wall[at]) [x, y] = this.nearestOpen(x, y);
      if (this.touch && -(this.tnx * this.zdx[i] + this.tny * this.zdy[i]) > 0.5) this.damageBlock(this.touch, z.dps * (z.smash ?? 1) * dt);
      for (const s of this.soldiers) {
        if (s.dead || s.indoor) continue;
        const ox = x - s.x, oy = y - s.y, min = z.radius + this.stats.units[s.kind].radius, d2 = ox * ox + oy * oy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        x += (ox / d) * (min - d);
        y += (oy / d) * (min - d);
      }
      this.zx[i] = x;
      this.zy[i] = y;
      const t = g.at(x, y);
      if (t >= 0 && g.goal[t]) {
        this.kill(i);
        this.leaks += z.leak;
        if (this.leakAt.length < 300) this.leakAt.push({ x, y });
      }
    }
  }

  /** The middle of the open tile nearest (x, y), for a zombie that has been shoved into a building or off the map. */
  private nearestOpen(x: number, y: number): [number, number] {
    const { w, h, tile: T, wall } = this.grid, tx = Math.floor(x / T), ty = Math.floor(y / T);
    let best: [number, number] = [x, y], bestD = Infinity;
    for (let r = 1; r <= 6 && bestD === Infinity; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || wall[ny * w + nx]) continue;
          const cx = (nx + 0.5) * T, cy = (ny + 0.5) * T, d = (cx - x) ** 2 + (cy - y) ** 2;
          if (d < bestD) { bestD = d; best = [cx, cy]; }
        }
    return best;
  }

  /** Moves a circle out of every solid tile it overlaps; the result goes in px, py, and any roadblock touched in touch. */
  private pushOut(x: number, y: number, r: number, blocks = true) {
    const g = this.grid, T = g.tile;
    this.touch = 0;
    // The tiles under where it started, fixed before any push: bounds that followed the pushes chased a body wider
    // than half a tile (a tank, a brute) from wall tile to wall tile, and past the map edge (all solid) forever.
    const tx0 = Math.floor((x - r) / T), tx1 = Math.floor((x + r) / T), ty0 = Math.floor((y - r) / T), ty1 = Math.floor((y + r) / T);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const inside = tx >= 0 && ty >= 0 && tx < g.w && ty < g.h, b = inside ? g.block[ty * g.w + tx] : 0;
        if (!g.solid(tx, ty) || (!blocks && b && !g.wall[ty * g.w + tx])) continue;
        let ox = x - clamp(x, tx * T, tx * T + T), oy = y - clamp(y, ty * T, ty * T + T);
        if (ox && oy) {
          // A corner with a solid tile beside it is no corner but a flat wall: out straight, not slantwise (a slant push
          // off it, against a body squeezed into the wall, cancelled its walking and held it there for good).
          const hard = (tx: number, ty: number) => g.solid(tx, ty) && (blocks || tx < 0 || ty < 0 || tx >= g.w || ty >= g.h || !!g.wall[ty * g.w + tx]);
          const sx = hard(tx + Math.sign(ox), ty), sy = hard(tx, ty + Math.sign(oy));
          if (sx && sy) continue;
          if (sx) ox = 0;
          else if (sy) oy = 0;
        }
        const d = Math.hypot(ox, oy);
        if (d >= r) continue;
        if (d === 0) {
          // The centre is inside the tile: out through the nearest side.
          const sides = [x - tx * T, tx * T + T - x, y - ty * T, ty * T + T - y], m = Math.min(...sides), k = sides.indexOf(m);
          ox = k === 0 ? -1 : k === 1 ? 1 : 0;
          oy = k === 2 ? -1 : k === 3 ? 1 : 0;
          x += ox * (m + r);
          y += oy * (m + r);
        } else {
          ox /= d;
          oy /= d;
          x += ox * (r - d);
          y += oy * (r - d);
        }
        if (b) { this.touch = b; this.tnx = ox; this.tny = oy; }
      }
    this.px = x;
    this.py = y;
  }

  private damageBlock(id: number, amount: number) {
    const rb = this.byId.get(id);
    if (!rb) return;
    // An engineer close by makes it tougher.
    const [x, y] = this.blockCentre(rb);
    const eng = this.soldiers.find((s) => !s.dead && this.stats.units[s.kind].harden && Math.hypot(s.x - x, s.y - y) <= this.stats.units[s.kind].range);
    if ((rb.hp -= amount * (eng ? this.stats.units[eng.kind].harden! : 1)) <= 0) {
      this.removeBlock(rb);
      this.noise('broken', x, y);
    }
  }

  /** How damage lands: armour shrugs off plain bullets and fire, but not splash or piercing rounds. */
  /** `dot` is damage over time from the ground (spikes, a live puddle): no flash, and armour does not help. */
  private damage(j: number, amount: number, how: 'bullet' | 'pierce' | 'splash' | 'fire' | 'dot') {
    const z = ZOMBIES[this.zkind[j]];
    if (z.armor && (how === 'bullet' || how === 'fire')) amount *= z.armor;
    if (how !== 'fire' && how !== 'dot') this.zhit[j] = 0.1;
    if ((this.zhp[j] -= amount) > 0) return;
    this.kill(j);
    this.kills++;
    const who = typeof this.by === 'string' ? this.by : this.by.kind;
    this.killsBy[who] = (this.killsBy[who] ?? 0) + 1;
    if (typeof this.by !== 'string') this.by.kills++;
    if (this.deaths.length < 512) this.deaths.push({ x: this.zx[j], y: this.zy[j], kind: this.zkind[j], angle: Math.atan2(this.zvy[j], this.zvx[j]) });
    if (z.burst) {
      // A bloater bursts: it hurts the zombies round it, and the ones that live through it lurch forward.
      const { radius, damage, boost, time } = z.burst;
      this.blasts.push({ x: this.zx[j], y: this.zy[j], r: radius, age: 0, bile: true });
      for (const k of this.within(this.zx[j], this.zy[j], radius)) {
        this.damage(k, damage, 'splash');
        if (this.alive[k]) this.boost(k, boost, time);
      }
    }
  }

  private ignite(j: number, burn: { dps: number; time: number }) {
    this.zburnBy[j] = this.by;
    this.zburnDps[j] = Math.max(this.zburn[j] > 0 ? this.zburnDps[j] : 0, burn.dps);
    this.zburn[j] = Math.max(this.zburn[j], burn.time);
  }

  // ---- Structures and strikes, each step ----

  private updateStructures(dt: number) {
    for (const st of [...this.structures]) {
      const k = this.stats.structs[st.kind];
      this.by = st.kind;
      if (st.kind === 'mine' && this.within(st.x, st.y, k.trigger!).length) {
        this.removeStructure(st);
        this.explode(st.x, st.y, k.blast!, k.damage!, true, 'blast');
      } else if (st.kind === 'spikes' && st.hp <= 0) this.removeStructure(st);
      else if (st.kind === 'rigged') this.drive(st, k, dt);
    }
    let n = 0;
    for (const z of this.zones) if ((z.t -= dt) > 0) this.zones[n++] = z;
    this.zones.length = n;
  }

  /** A rigged car waits until zombies are ahead of it, then rams through them until its kills run out or it hits
   *  something, and stops there as a wrecked-car roadblock. */
  private drive(st: Structure, k: StructStats, dt: number) {
    const cx = Math.cos(st.angle), cy = Math.sin(st.angle);
    if (!st.driving) {
      if (this.within(st.x + (cx * k.trigger!) / 2, st.y + (cy * k.trigger!) / 2, k.trigger! / 2).length) {
        this.markStruct(st, 0);
        st.driving = true;
      }
      return;
    }
    const step = k.speed! * dt;
    st.x += cx * step;
    st.y += cy * step;
    st.travelled += step;
    for (const j of this.within(st.x, st.y, 10)) {
      this.damage(j, k.damage!, 'splash');
      if (!this.alive[j]) st.kills--;
      else {
        this.zx[j] += cx * step * 1.5; // shoved ahead of the bumper
        this.zy[j] += cy * step * 1.5;
      }
    }
    const ahead = this.grid.at(st.x + cx * 14, st.y + cy * 14);
    if (st.kills <= 0 || st.travelled >= k.distance! || ahead < 0 || this.grid.wall[ahead] || this.grid.block[ahead]) {
      this.removeStructure(st);
      // Where it stops it stays, as a wreck; backed up a tile or two if it has no room there.
      const T = this.grid.tile, vertical = Math.abs(cy) > 0.5;
      for (let back = 0; back <= 2 * T; back += T)
        if (this.placeBlock('car', Math.floor((st.x - cx * back) / T), Math.floor((st.y - cy * back) / T), vertical, false)) break;
    }
  }

  private updateStrikes(dt: number) {
    let n = 0;
    for (const s of this.strikes) {
      const u = this.stats.usables[s.kind], was = s.t;
      s.t += dt;
      this.by = s.kind;
      if (u.sound !== undefined && was <= u.delay - u.sound && s.t > u.delay - u.sound) this.noise(s.kind, s.x, s.y); // its recording: the A-10's pass, the missile's launch
      let done = s.t >= u.delay;
      if (done && s.kind === 'missile') this.explode(s.x, s.y, u.blast!, u.damage!, false, 'blast'); // the launch was its recording; this is the landing
      else if (done && s.kind === 'napalm') {
        this.blasts.push({ x: s.x, y: s.y, r: u.radius!, age: 0, bile: false });
        this.noise('napalm', s.x, s.y, u.radius!);
        this.zones.push({ kind: 'fire', x: s.x, y: s.y, r: u.radius!, t: u.time! });
      } else if (done && s.kind === 'smoke') this.zones.push({ kind: 'smoke', x: s.x, y: s.y, r: u.radius!, t: u.time! });
      else if (done && s.kind === 'flare') this.zones.push({ kind: 'lure', x: s.x, y: s.y, r: u.radius!, t: u.time! });
      else if (s.kind === 'artillery') {
        for (const sh of s.shells) if (sh.at > was && sh.at <= s.t) this.explode(sh.x, sh.y, u.blast!, u.damage!, false, 'blast');
        done = s.shells.every((sh) => sh.at <= s.t);
      } else if (done && s.kind === 'a10') {
        // Strafing along its run: everything under the plane's path takes one heavy burst. Past the run's end it flies
        // on, out of sight, before the strike is over.
        const [px, py] = this.planeAt(s), along = (s.t - u.delay) * u.speed!;
        if (along <= u.length!) {
          for (const j of this.within(px, py, u.width! / 2))
            if (!s.hit.has(j)) {
              s.hit.add(j);
              this.damage(j, u.damage!, 'splash');
            }
          const a = this.random() * Math.PI * 2, r = this.random() * u.width!;
          this.noise('a10', px, py);
          this.shots.push({ x1: px - Math.cos(s.angle) * 40, y1: py - Math.sin(s.angle) * 40, x2: px + Math.cos(a) * r, y2: py + Math.sin(a) * r, age: 0, heavy: true });
        }
        done = along > u.length! + 1500;
      }
      if (!done) this.strikes[n++] = s;
    }
    this.strikes.length = n;
  }

  // ---- Soldiers ----

  private updateSoldiers(dt: number) {
    const gone: Soldier[] = [];
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const u = this.stats.units[s.kind];
      s.rangeBy = s.rateBy = s.cover = 1;
      s.incendiary = false;
      for (const st of this.structures) {
        const k = this.stats.structs[st.kind], d = Math.hypot(st.x - s.x, st.y - s.y);
        if (d < 6 && k.rangeBy) s.rangeBy = k.rangeBy;
        if (d < 6 && k.cover) s.cover = k.cover;
        if (k.rateBy && d <= k.radius!) s.rateBy = k.rateBy;
        if (st.kind === 'incendiary' && d <= k.radius!) s.incendiary = true;
      }
      if (u.weapon === 'heal') {
        for (const o of this.soldiers)
          if (!o.dead && Math.hypot(o.x - s.x, o.y - s.y) <= u.range) o.hp = Math.min(this.stats.units[o.kind].hp, o.hp + u.heal! * dt);
      } else if (u.weapon === 'repair') {
        for (const rb of this.roadblocks) {
          const [x, y] = this.blockCentre(rb);
          if (Math.hypot(x - s.x, y - s.y) <= u.range) rb.hp = Math.min(this.stats.roadblocks[rb.kind].hp, rb.hp + u.repair! * dt);
        }
      } else {
        s.cooldown = Math.max(0, s.cooldown - dt);
        if (s.cooldown === 0 && this.hasTarget(s, u)) {
          this.fire(s, u);
          s.cooldown = 1 / (u.fireRate! * s.rateBy);
          s.firedAt = this.time;
        }
      }
      const firing = this.firing(s);
      s.walking = false;
      if (s.dest) {
        const { x, y, field } = s.dest, d = Math.hypot(x - s.x, y - s.y);
        if (d < 1) {
          s.dest = undefined;
          if (s.leaving) { gone.push(s); this.count(s.kind, -1); } // home: back in the bar
        }
        else {
          // Straight there when nothing is in the way, otherwise along the streets. Slower while shooting.
          let dx = (x - s.x) / d, dy = (y - s.y) / d;
          if (!this.clearLine(s.x, s.y, x, y) && downhill(this.grid, field, s.x, s.y, this.dir)) { dx = this.dir.x; dy = this.dir.y; }
          const step = Math.min(d, (firing ? u.aimSpeed : u.speed) * dt);
          this.pushOut(s.x + dx * step, s.y + dy * step, u.radius);
          s.x = this.px;
          s.y = this.py;
          s.walking = true;
          s.heading = Math.atan2(dy, dx);
          if (s.indoor && !this.grid.wall[this.grid.at(s.x, s.y)]) s.indoor = false; // out in the street now
        }
      }
      s.facing = facingOf(firing ? s.shot : !s.walking ? s.angle : s.heading);
    }
    if (gone.length) this.soldiers = this.soldiers.filter((s) => !gone.includes(s));
  }

  private clearLine(x0: number, y0: number, x1: number, y1: number) {
    const T = this.grid.tile, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let k = 1; k <= n; k++) if (this.grid.solid(Math.floor((x0 + ((x1 - x0) * k) / n) / T), Math.floor((y0 + ((y1 - y0) * k) / n) / T))) return false;
    return true;
  }

  /** Where a mortar or grenadier is aimed. */
  aimPoint(s: Soldier): [number, number] { return [s.x + Math.cos(s.angle) * s.reach, s.y + Math.sin(s.angle) * s.reach]; }

  /** Zombies inside a soldier's cone, a fresh array. */
  private inCone(s: Soldier, range: number) {
    const spread = this.spread(s), out: number[] = [];
    for (const j of this.near(s.x - range, s.y - range, s.x + range, s.y + range)) {
      const dx = this.zx[j] - s.x, dy = this.zy[j] - s.y, d2 = dx * dx + dy * dy;
      if (d2 > range * range) continue;
      const d = Math.sqrt(d2);
      if (Math.abs(wrap(Math.atan2(dy, dx) - s.angle)) <= spread + Math.atan2(ZOMBIES[this.zkind[j]].radius, d)) out.push(j);
    }
    return out;
  }

  private hasTarget(s: Soldier, u: UnitStats) {
    if (indirect(u)) {
      const [x, y] = this.aimPoint(s);
      return this.within(x, y, u.scatter! + u.blast!).length > 0;
    }
    return this.inCone(s, this.rangeOf(s)).length > 0;
  }

  /** The way to his mark: inside his cone, a soldier picks the zombie his priority says (the nearest, unless told). */
  private markAngle(s: Soldier) {
    const marks = this.inCone(s, this.rangeOf(s));
    if (!marks.length) return s.angle;
    const score = (j: number) => {
      const d = Math.hypot(this.zx[j] - s.x, this.zy[j] - s.y), z = ZOMBIES[this.zkind[j]];
      return s.priority === 'nearest' ? -d : s.priority === 'farthest' ? d : s.priority === 'highest HP' ? this.zhp[j] : s.priority === 'fastest' ? z.speed : -z.speed;
    };
    const j = marks.reduce((a, b) => (score(b) > score(a) ? b : a));
    // Aimed from where the shot leaves (a window is a little off where he stands), so it flies true.
    const [ox, oy] = this.muzzleOf(s, Math.atan2(this.zy[j] - s.y, this.zx[j] - s.x));
    return Math.atan2(this.zy[j] - oy, this.zx[j] - ox);
  }

  /** Direct fire goes at his mark, a little off (pellets spread wider); mortars and grenadiers drop on the aim point. */
  private fire(s: Soldier, u: UnitStats) {
    this.by = s;
    const aim = (s.shot = indirect(u) || u.weapon === 'flame' ? s.angle : this.markAngle(s)), off = (by: number) => (this.random() * 2 - 1) * this.spread(s) * by;
    this.noise(s.kind, s.x, s.y);
    switch (u.weapon) {
      case 'bullet':
        return this.bullet(s, aim + off(0.15), this.rangeOf(s), this.damageOf(s), u.pierce ?? 1, 0);
      case 'pellets':
        for (let k = 0; k < u.pellets!; k++) this.bullet(s, aim + off(0.6), this.rangeOf(s), this.damageOf(s), 1, u.knockback ?? 0);
        return;
      case 'sniper':
        return this.bullet(s, aim, this.rangeOf(s), this.damageOf(s), u.pierce ?? 1, 0);
      case 'flame':
        for (const j of this.inCone(s, this.rangeOf(s))) {
          this.ignite(j, u.burn!);
          this.damage(j, this.damageOf(s), 'fire');
        }
        return;
      case 'rocket': {
        const a = aim + off(0.1), v = u.projectileSpeed!, [ox, oy] = this.muzzleOf(s, a);
        this.projectiles.push({ by: s, grace: s.indoor ? this.grid.tile * 1.5 : 0, arc: false, x: ox, y: oy, x0: ox, y0: oy, x1: ox, y1: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, flight: this.rangeOf(s) / v, blast: u.blast!, damage: this.damageOf(s) });
        return;
      }
      case 'shell': {
        const [ax, ay] = this.aimPoint(s), a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * u.scatter!;
        this.projectiles.push({ by: s, grace: 0, arc: true, x: s.x, y: s.y, x0: s.x, y0: s.y, x1: ax + Math.cos(a) * r, y1: ay + Math.sin(a) * r, vx: 0, vy: 0, t: 0, flight: u.flight!, blast: u.blast!, damage: this.damageOf(s) });
      }
    }
  }

  /** Where a shot starts. An indoor soldier fires out of his window (or off the roof edge): from the side of his tile
   *  that opens onto the street most in line with the shot, so the building he is in never stops it, even when he
   *  shoots down the street almost along its front. With no open side (the middle of a roof), from where he stands. */
  private muzzleOf(s: Soldier, a: number): [number, number] {
    if (!s.indoor) return [s.x, s.y];
    const { w, h, tile: T, wall } = this.grid, tx = Math.floor(s.x / T), ty = Math.floor(s.y / T);
    let best = -Infinity, out: [number, number] = [s.x, s.y];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= w || y >= h || wall[y * w + x]) continue;
        const facing = (dx * Math.cos(a) + dy * Math.sin(a)) / Math.hypot(dx, dy);
        if (facing > best) { best = facing; out = [(tx + 0.5 + dx / 2) * T, (ty + 0.5 + dy / 2) * T]; }
      }
    return out;
  }

  /** A bullet along a line: buildings stop it, roadblocks do not. It hits the first zombies on it, up to `pierce`. */
  private bullet(s: Soldier, a: number, range: number, dmg: number, pierce: number, knockback: number) {
    const T = this.grid.tile, cx = Math.cos(a), cy = Math.sin(a), [ox, oy] = this.muzzleOf(s, a);
    let reach = range, grace = s.indoor ? this.grid.tile : 0;
    for (let t = 4; t < reach; t += 4) {
      const i = this.grid.at(ox + cx * t, oy + cy * t);
      if (i < 0 || (this.grid.wall[i] && t > grace)) { reach = t; break; }
      if (!this.grid.wall[i]) grace = 0; // out of the window: from here on walls stop it
    }
    const ex = ox + cx * reach, ey = oy + cy * reach, hits: [number, number][] = [];
    for (const j of this.near(Math.min(ox, ex) - T, Math.min(oy, ey) - T, Math.max(ox, ex) + T, Math.max(oy, ey) + T)) {
      const px = this.zx[j] - ox, py = this.zy[j] - oy, along = px * cx + py * cy, r = ZOMBIES[this.zkind[j]].radius, side2 = px * px + py * py - along * along;
      if (along < 0 || side2 > r * r) continue;
      const t = along - Math.sqrt(r * r - side2);
      if (t <= reach) hits.push([t, j]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    let end = reach;
    for (const [t, j] of hits.slice(0, pierce)) {
      end = Math.max(0, t);
      if (knockback) {
        this.zx[j] += cx * knockback;
        this.zy[j] += cy * knockback;
      }
      this.damage(j, dmg, pierce > 1 ? 'pierce' : 'bullet');
      if (s.incendiary && this.alive[j]) this.ignite(j, this.stats.structs.incendiary.burn!);
    }
    const muzzle = s.indoor ? 0 : Math.min(10, end); // from a window the tracer starts at the window
    this.shots.push({ x1: ox + cx * muzzle, y1: oy + cy * muzzle, x2: ox + cx * end, y2: oy + cy * end, age: 0, heavy: pierce > 1 });
  }

  private flyProjectiles(dt: number) {
    let k = 0;
    for (const p of this.projectiles) {
      p.t += dt;
      let boom = p.t >= p.flight;
      if (p.arc) {
        const f = Math.min(1, p.t / p.flight);
        p.x = p.x0 + (p.x1 - p.x0) * f;
        p.y = p.y0 + (p.y1 - p.y0) * f;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const i = this.grid.at(p.x, p.y);
        const flown = Math.hypot(p.x - p.x0, p.y - p.y0);
        boom ||= i < 0 || (this.grid.wall[i] === 1 && flown > p.grace) || this.within(p.x, p.y, 2).length > 0;
      }
      this.by = p.by;
      if (boom) this.explode(p.x, p.y, p.blast, p.damage);
      else this.projectiles[k++] = p;
    }
    this.projectiles.length = k;
  }

  /** Splash: every zombie in the blast takes the full hit. Soldiers are hurt only by mines and explosives (`friendly`).
   *  `sound` is the noise it makes ('' when something else already makes it). */
  private explode(x: number, y: number, r: number, dmg: number, friendly = false, sound = 'boom') {
    this.blasts.push({ x, y, r, age: 0, bile: false });
    if (sound) this.noise(sound, x, y, r);
    for (const j of this.within(x, y, r)) if (this.alive[j]) this.damage(j, dmg, 'splash');
    if (friendly)
      for (const s of this.soldiers)
        if (!s.dead && !s.indoor && Math.hypot(s.x - x, s.y - y) <= r + this.stats.units[s.kind].radius && (s.hp -= dmg * s.cover) <= 0) {
          s.hp = 0;
          s.dead = true;
        }
  }
}
