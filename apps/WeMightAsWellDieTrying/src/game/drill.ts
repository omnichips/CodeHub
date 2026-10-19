// The tutorial: a drill at Site 9, a small military research facility. One yard between the labs, the horde in through
// the gate on the right, the evac chopper on the helipad on the left. Two easy waves, the fight paused for each new
// thing with a note about it, then a third wave nobody could hold: the lesson that a line is not always held.
import type { MapData } from '../sim/grid.ts';
import type { WavePlan } from '../sim/world.ts';
import type { Game } from './scene.ts';

const W = 72, H = 32, TOP = 10, BOTTOM = 21; // the yard is rows TOP to BOTTOM
/** The buildings along the top and the bottom of the yard: [first column, kind]. */
const NORTH: [number, string][] = [[0, 'm'], [16, 'w'], [36, 'o'], [52, 'g']], SOUTH: [number, string][] = [[0, 'w'], [20, 'm'], [40, 'o'], [56, 'w']];
const kindAt = (row: [number, string][], x: number) => row.filter(([from]) => from <= x).at(-1)![1];
const tile = (x: number, y: number) =>
  y < TOP ? kindAt(NORTH, x) : y > BOTTOM ? kindAt(SOUTH, x) : x < 8 ? 'E' : x >= W - 2 ? 'S' : '.';

const T = 16, at = (tx: number, ty: number) => ({ x: tx * T, y: ty * T });
const data: MapData = {
  name: 'Site 9', tile: T, par: 300, scale: 2,
  rows: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => tile(x, y)).join('')),
  // Windows and roofs over the yard, each side.
  slots: [[20, TOP - 1], [34, TOP - 1], [48, TOP - 1], [62, TOP - 1], [26, BOTTOM + 1], [40, BOTTOM + 1], [54, BOTTOM + 1]],
  solids: [{ kind: 'apc', tx: 40, ty: TOP + 1, vertical: false }],
  decor: [
    { kind: 'helipad', ...at(4, 16) },
    ...[18, 30, 44, 58].map((x) => ({ kind: 'lamp', ...at(x, TOP + 0.4) })),
    ...[24, 38, 52, 66].map((x) => ({ kind: 'lamp', ...at(x, BOTTOM + 0.6) })),
    // The gate, smashed in: sandbags and wreckage where the guards were.
    ...[TOP + 1, TOP + 3, BOTTOM - 3, BOTTOM - 1].map((y) => ({ kind: 'sandbag', ...at(64, y) })),
    { kind: 'wreck', ...at(60, 18) }, { kind: 'crater', ...at(56, 14) }, { kind: 'rubble', ...at(66, 17) },
    // Supplies left in the yard.
    ...[[14, 12], [15, 12], [22, 20], [34, 20], [50, 12]].map(([x, y]) => ({ kind: 'crate', ...at(x, y) })),
    ...[[28, 11], [46, 20], [58, 11]].map(([x, y]) => ({ kind: 'barrel', ...at(x, y) })),
    ...[[30, 15], [30, 17]].map(([x, y]) => ({ kind: 'cone', ...at(x, y) })),
  ],
};

/** Two easy waves, then one nobody holds. */
const waves: WavePlan = {
  gap: 45,
  waves: [
    { duration: 20, spawn: { normal: 18 } },
    { duration: 25, spawn: { normal: 30, fast: 6 } },
    { duration: 40, spawn: { normal: 520, fast: 160, armored: 30, brute: 6 } },
  ],
};

export const DRILL_MAP = { id: 'drill', name: 'Site 9', data, waves };
/** What the drill hands out, whatever the save owns: soldiers and roadblocks, and uses of each strike. */
export const DRILL_LOADOUT: Record<string, number> = { rifleman: 3, sniper: 1, sandbags: 2 };
export const DRILL_STRIKES: Record<string, number> = { missile: 2 };
export const DRILL_LEAKS = 15;
/** The Commander's words on the end report. */
export const DRILL_LESSON = 'Nobody holds every line. Spend your chips at Requisitions, pick your ground, and come back stronger.';

/** One note of the drill. `when`: it waits for this before showing (and pauses the fight when it shows). `done`:
 *  what the player has to do to move on; without it there is a Next button. `spot`: the control it points at. */
export interface DrillStep { text: string; spot?: string; slots?: boolean; focus?: boolean; /* focus: the screen goes dark but for a circle round the first soldier and his cone */ when?: (g: Game) => boolean; done?: (g: Game) => boolean }

const aimed = new WeakMap<object, string>(); // each soldier's cone as first put down
/** Fight seconds run PACE (5) to a real second: the waits below are in fight seconds. */
export const DRILL: DrillStep[] = [
  { text: 'This is Site 9. Zombies come in from the right. Keep them away from the helipad on the left.' },
  { text: 'These are your soldiers. Drag a Rifleman onto the road.', spot: '.dock', done: (g) => g.world.soldiers.length > 0 },
  { text: 'Tap your soldier. Drag the round handle to aim. He shoots anything inside the cone.', focus: true,
    done: (g) => g.world.soldiers.some((s) => { const k = `${s.angle.toFixed(2)} ${Math.round(s.reach)}`; if (!aimed.has(s)) aimed.set(s, k); return aimed.get(s) !== k; }) },
  { text: 'Drag the Sniper onto a window (the marked spots on the buildings). Nothing can hurt him up there.',
    spot: '.dock', slots: true, done: (g) => g.world.soldiers.some((s) => s.indoor) },
  { text: 'Tap Build, then drag Sandbags onto the road. Zombies must break them to get past.',
    spot: '.dock', done: (g) => g.world.roadblocks.some((rb) => !rb.prop) },
  { text: 'Tap the sandbags. You can turn them with R, or the Turn button.', spot: '.actions button' },
  { text: 'This is the menu. It takes you back to the main menu. Do not press it yet if you want to finish the tutorial.', spot: '.status button[title="Menu"]' },
  { text: 'This is Settings: sound, controls and text size.', spot: '.status button[title="Settings"]' },
  { text: 'This counts zombies that got past you. If it fills up, you lose.', spot: '.status .stat[title^="Leaks"]' },
  { text: 'This counts how many zombies you have killed.', spot: '.status .stat[title="Kills"]' },
  { text: 'This eye hides the controls at the bottom so you can see the street. Press it again to bring them back.', spot: '.peek' },
  { text: 'This is Clear. It picks up everything you have put down. Do not press it now, or you will have to place everything again.', spot: '.time button[title^="Take back"]' },
  { text: 'Ready? Press Start.', spot: '.time > .go:not(.next)', done: (g) => g.world.phase !== 'plan' },
  { text: 'Here they come! Your soldiers shoot by themselves.', when: (g) => g.world.time > 20 },
  { text: 'Pause stops the game. The clock lets you pick how fast it goes. Pick a speed to keep going.',
    spot: '.speeds', when: (g) => g.world.time > 40, done: (g) => g.speed > 0 },
  { text: 'Drag a soldier on the road to move him. Try it now.',
    when: (g) => g.world.time > 70, done: (g) => g.world.soldiers.some((s) => !!s.dest) },
  { text: 'Wave cleared! Get ready for the next one. Press this to start it early and earn a few more chips.',
    spot: '.time > .next', when: (g) => g.world.breakLeft > 0 },
  { text: 'Tap Strikes, then drag the missile onto a big group of zombies.',
    spot: '.dock', when: (g) => g.world.wave >= 1 && g.world.breakLeft === 0,
    done: (g) => g.world.charges.missile < DRILL_STRIKES.missile || g.world.breakLeft > 0 || g.world.phase !== 'wave' },
  { text: 'Well done! Now a much bigger horde is coming. Hold on as long as you can.',
    when: (g) => (g.world.wave === 1 && g.world.breakLeft > 0) || g.world.wave >= 2 },
];
