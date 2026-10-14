// Every soldier and zombie, as parts seen from straight above, facing +x (east). Units are pixels from the sprite's
// centre; +y is the soldier's right. Soldiers share one body and differ in kit; zombies each have their own shape.
import palette from '../data/palette.json' with { type: 'json' };
import units from '../data/units.json' with { type: 'json' };
import zombieData from '../data/zombies.json' with { type: 'json' };
import { rasterize, shade, type Material, type Part, type Vec } from './pixels.ts';

export const SIZE = 32;
export const BIG = 48; // bosses
export const DIRS = 8; // soldiers are drawn per facing: 0 = east, then clockwise in 45° steps

const ramp = (a: string, b: string, c: string): Material => ({ ramp: [a, b, c] });
export const MATERIALS: Record<string, Material> = {
  helmet: ramp('olive0', 'olive1', 'olive2'),
  vest: ramp('khaki0', 'khaki1', 'khaki2'),
  vestDark: ramp('olive0', 'olive1', 'olive1'),
  sleeve: ramp('olive0', 'olive0', 'olive1'),
  pack: ramp('khaki0', 'khaki0', 'khaki1'),
  boot: ramp('metal0', 'metal0', 'metal1'),
  skin: ramp('skin0', 'skin1', 'skin2'),
  metal: ramp('metal0', 'metal1', 'metal2'),
  hole: ramp('outline', 'metal0', 'metal0'),
  tube: ramp('olive0', 'olive1', 'olive2'),
  brass: ramp('khaki1', 'flash0', 'flash1'),
  lens: ramp('cloth0', 'cloth2', 'flash1'),
  ghillie: ramp('rot0', 'olive1', 'rot1'),
  mask: ramp('metal0', 'metal1', 'metal2'),
  tank: ramp('blood0', 'blood1', 'skin1'),
  riot: ramp('cloth0', 'cloth0', 'cloth1'),
  shieldPlate: ramp('metal1', 'metal2', 'cloth2'),
  medic: ramp('khaki1', 'khaki2', 'flash1'),
  cross: ramp('blood0', 'blood1', 'blood1'),
  hardhat: ramp('khaki1', 'flash0', 'flash1'),
  wood: ramp('skin0', 'skin1', 'skin2'),
  flash: { ramp: ['flash0', 'flash0', 'flash1'], glow: true },
  fire: { ramp: ['flash0', 'flash0', 'flash0'], glow: true },
  // zombies
  rot: ramp('rot0', 'rot1', 'rot2'),
  rotDark: ramp('rot0', 'rot0', 'rot1'),
  shirt: ramp('cloth0', 'cloth1', 'cloth2'),
  shirtTan: ramp('khaki0', 'khaki1', 'khaki2'),
  shirtPale: ramp('khaki1', 'khaki2', 'flash1'),
  pants: ramp('cloth0', 'cloth0', 'cloth1'),
  bile: ramp('rot1', 'rot2', 'khaki2'),
  boil: ramp('blood0', 'blood1', 'khaki2'),
  brain: ramp('blood1', 'skin1', 'skin2'),
  flesh: ramp('skin0', 'blood1', 'skin1'),
  bone: ramp('khaki1', 'khaki2', 'flash1'),
  mouth: ramp('outline', 'blood0', 'blood0'),
  shoe: ramp('asphalt0', 'asphalt0', 'asphalt2'),
  blood: ramp('blood0', 'blood1', 'blood1'),
  barrierRed: ramp('blood0', 'blood1', 'blood1'),
  barrierLight: ramp('khaki1', 'khaki2', 'flash1'),
  // structures and strikes
  sandbag: ramp('khaki0', 'khaki1', 'khaki2'),
  concrete: ramp('metal1', 'metal2', 'khaki2'),
  wreck: ramp('blood0', 'skin0', 'khaki0'),
  wreckRoof: ramp('outline', 'blood0', 'skin0'),
  plane: ramp('metal1', 'metal2', 'cloth2'),
  smoke: ramp('metal1', 'metal2', 'khaki2'),
};

const c = (mat: string, a: Vec, r: number, z: number, dome = 0, b?: Vec): Part => ({ mat, a, b, r, z, dome });
const muzzle = (x: number, y: number, big = 1): Part[] => [c('flash', [x, y], 1.5 * big, 10), c('flash', [x - 1.2 * big, y], 0.8 * big, 10, 0, [x + 1.2 * big, y])];
/** Both arms out to the hands, hands on top. */
const arms = (l: Vec, r: Vec, handZ = 6): Part[] => [
  c('sleeve', [1, -7], 1.3, 5, 1, l), c('sleeve', [1, 7], 1.3, 5, 1, r), c('skin', l, 1.5, handZ, 1), c('skin', r, 1.5, handZ, 1),
];

interface Pose { stride?: number; recoil?: number; flash?: boolean; breathe?: number }
/** What makes a class look like itself: headgear, vest, what is on the back, and what is in the hands. */
interface Look { helmet?: string; vest?: string; back?: Part[]; head?: Part[]; hold: (g: number, flash: boolean) => Part[] }
type SoldierKind = keyof typeof units;

const LOOKS: Record<Exclude<SoldierKind, 'turret'>, Look> = {
  rifleman: {
    hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), c('metal', [1 + g, 1], 1.1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.75, 5.5, 0.5, [13.5 + g, 1]), ...(f ? muzzle(15 + g, 1) : [])],
  },
  sniper: {
    helmet: 'ghillie',
    head: [c('ghillie', [-3, -3], 1.7, 6.5, 1), c('ghillie', [-3.5, 2.6], 1.6, 6.5, 1), c('ghillie', [1.5, -3.8], 1.3, 6.5, 1)],
    hold: (g, f) => [...arms([8 + g, -0.5], [4 + g, 2.5]), c('metal', [0 + g, 1], 1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.6, 5.5, 0, [14.5 + g, 1]), c('metal', [3 + g, 0.2], 0.9, 6.3, 0.5, [7.5 + g, 0.2]), ...(f ? muzzle(15.5 + g, 1, 0.8) : [])],
  },
  machinegunner: {
    back: [c('pack', [-5, -3.5], 2.8, 2, 2, [-5, 3.5])],
    hold: (g, f) => [...arms([8 + g, -1], [3.5 + g, 3]), c('metal', [-0.5 + g, 1.5], 1.6, 5.5, 1, [9 + g, 1.5]), c('metal', [9 + g, 1.5], 0.9, 5.5, 0.5, [13.5 + g, 1.5]), c('pack', [2 + g, 5], 1.7, 5, 1), c('brass', [2.5 + g, 3.6], 0.6, 5.7, 0, [4.5 + g, 2.5]), ...(f ? muzzle(15 + g, 1.5, 1.2) : [])],
  },
  flamethrower: {
    helmet: 'mask',
    head: [c('lens', [2.3, -1.5], 0.9, 9.4), c('lens', [2.3, 1.5], 0.9, 9.4)],
    back: [c('tank', [-5.5, -2.4], 2.4, 2.5, 2.5), c('tank', [-5.5, 2.4], 2.4, 2.5, 2.5)],
    hold: (g, f) => [
      ...arms([7 + g, -0.5], [4 + g, 2.5]), c('metal', [-4, 2.4], 0.5, 4, 0, [2 + g, 2]), c('metal', [2 + g, 1], 0.8, 5.5, 0.5, [10 + g, 1]), c('metal', [10.5 + g, 1], 1.2, 5.6, 1),
      ...(f ? [c('fire', [13.5 + g, 1], 2.4, 10, 0, [15.5 + g, 1]), c('flash', [12.5 + g, 1], 1.3, 11, 0, [14.5 + g, 1])] : []),
    ],
  },
  bazooka: {
    hold: (g, f) => [...arms([5 + g, 2.4], [1.5 + g, 6]), c('tube', [-7, 4.4], 1.9, 7, 1.5, [11 + g, 4.4]), c('hole', [11.2 + g, 4.4], 1.1, 8.6), ...(f ? [...muzzle(13.5 + g, 4.4, 1.3), c('flash', [-9, 4.4], 1.4, 10)] : [])],
  },
  shield: {
    helmet: 'riot',
    head: [c('lens', [2.9, -2.4], 0.8, 9.3, 0, [2.9, 2.4])],
    hold: (g, f) => [...arms([4.5, -3], [5 + g, 8.3]), c('shieldPlate', [6.5, -7.5], 1.7, 7, 1.2, [6.5, 7]), c('lens', [6.6, -2], 0.6, 8.9, 0, [6.6, 2]), c('metal', [5 + g, 8.6], 0.8, 6.5, 0.5, [9 + g, 8.6]), ...(f ? muzzle(10.5 + g, 8.6, 0.8) : [])],
  },
  mortar: {
    hold: (g, f) => [
      c('metal', [5, 0], 3.6, 1.5, 0.5), c('metal', [9, 0], 0.5, 3, 0, [11.5, -3.8]), c('metal', [9, 0], 0.5, 3, 0, [11.5, 3.8]), // baseplate and bipod
      ...arms([6, -2.6], [6, 2.6], 8), c('metal', [5, 0], 2.3, 5, 2, [11 + g / 2, 0]), c('hole', [11 + g / 2, 0], 1.3, 7.6), ...(f ? muzzle(12.5, 0, 1.3) : []),
    ],
  },
  medic: {
    helmet: 'medic',
    head: [c('cross', [-2, 0], 0.7, 10, 0, [2, 0]), c('cross', [0, -2], 0.7, 10, 0, [0, 2])],
    back: [c('medic', [-4.5, -2.5], 2.3, 2, 2, [-4.5, 2.5]), c('cross', [-4.5, -1.3], 0.5, 4.5, 0, [-4.5, 1.3])],
    hold: () => arms([3.5, -6.5], [3.5, 6.5]),
  },
  marksman: {
    vest: 'vestDark',
    hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), c('metal', [0 + g, 1], 1.05, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.65, 5.5, 0, [14.5 + g, 1]), c('metal', [3 + g, 0.2], 0.8, 6.3, 0.5, [6.5 + g, 0.2]), ...(f ? muzzle(15.5 + g, 1, 0.9) : [])],
  },
  shotgunner: {
    vest: 'vestDark',
    hold: (g, f) => [...arms([7.5 + g, -0.5], [3.5 + g, 2.5]), c('metal', [1 + g, 1], 1.2, 5.5, 1, [8 + g, 1]), c('metal', [8 + g, 1], 1, 5.5, 1, [12 + g, 1]), c('wood', [6 + g, 1], 1.4, 5.8, 1, [8.5 + g, 1]), ...(f ? [...muzzle(13.5 + g, 1, 1.5), c('flash', [15.5 + g, -1.8], 0.8, 10), c('flash', [15.5 + g, 3.8], 0.8, 10)] : [])],
  },
  engineer: {
    helmet: 'hardhat',
    head: [c('hardhat', [0, 0], 5, 5.5, 0.5)], // the brim
    hold: (g) => [...arms([5, -4.5], [6 + g, 3]), c('pack', [6, -5.5], 1.7, 5.5, 1), c('metal', [6 + g, 3.2], 0.7, 6.5, 0, [10 + g, 4.2]), c('metal', [10.6 + g, 4.3], 1.3, 6.6, 0.5)],
  },
  grenadier: {
    back: [c('pack', [-4.5, -3], 2.2, 2, 2, [-4.5, 3]), c('brass', [-6.5, -2], 0.9, 4.5, 0.5), c('brass', [-6.5, 0], 0.9, 4.5, 0.5), c('brass', [-6.5, 2], 0.9, 4.5, 0.5)],
    hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), c('metal', [1 + g, 1], 1.1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.75, 5.5, 0.5, [13 + g, 1]), c('metal', [4 + g, 2.6], 1.35, 5.3, 1, [10.5 + g, 2.6]), c('hole', [10.7 + g, 2.6], 0.8, 6.8), ...(f ? muzzle(12.5 + g, 2.6, 1.2) : [])],
  },
  operator: {
    vest: 'vestDark',
    head: [c('metal', [0, -4.4], 1.1, 7, 0.5), c('metal', [0, 4.4], 1.1, 7, 0.5)],
    back: [c('pack', [-4.5, -3], 2.4, 2, 2, [-4.5, 3]), c('metal', [-6, -2], 0.4, 3.5, 0, [-11, -6])],
    hold: (g, f) => [...arms([7 + g, -0.5], [4 + g, 2.5]), c('metal', [2 + g, 1], 1.1, 5.5, 1, [8 + g, 1]), c('metal', [8 + g, 1], 0.7, 5.5, 0, [10.5 + g, 1]), ...(f ? muzzle(12 + g, 1, 0.9) : [])],
  },
};

export function soldier(kind: SoldierKind, { stride = 0, recoil = 0, flash = false, breathe = 0 }: Pose = {}): Part[] {
  if (kind === 'turret') {
    const g = -recoil;
    return [
      c('metal', [0, 0], 0.7, 1, 0, [-6, -5]), c('metal', [0, 0], 0.7, 1, 0, [-6, 5]), c('metal', [0, 0], 0.7, 1, 0, [6, 0]),
      c('pack', [-1, 4.5], 2, 3, 1), c('metal', [-3 + g, 0], 2.6, 4, 1.5, [3 + g, 0]), c('metal', [3 + g, 0], 0.9, 5, 0.5, [13 + g, 0]),
      ...(flash ? muzzle(14.5 + g, 0) : []),
    ];
  }
  const look = LOOKS[kind];
  return [
    c('boot', [stride, -4], 1.8, 1, 1), c('boot', [-stride, 4], 1.8, 1, 1),
    ...(look.back ?? [c('pack', [-4.5, -3], 2.2 + breathe, 2, 2, [-4.5, 3])]),
    c('sleeve', [0, -5.5], 3 + breathe, 2, 2, [0, 5.5]),
    c(look.vest ?? 'vest', [-0.5, -2.5], 3.3 + breathe, 2.5, 2, [-0.5, 2.5]),
    c(look.helmet ?? 'helmet', [0, 0], 4.3, 6, 3),
    ...(look.head ?? []),
    ...look.hold(-recoil, flash),
  ];
}
/** The Phase 1 name for the Rifleman, kept for the tests. */
export const rifleman = (pose: Pose = {}) => soldier('rifleman', pose);

type ZombieKind = keyof typeof zombieData;
const feet = (s: number, x = 2.5, y = 2.5): Part[] => [c('shoe', [x * s, -y], 1.6, 1), c('shoe', [-x * s, y], 1.6, 1)];
const reach = (s: number, len = 6, r = 1.1, y = 5.5, mat = 'rot'): Part[] => [
  c(mat, [0, -y], r, 4.5, 1, [len + s, -y + 1.5]), c(mat, [0, y], r, 4.5, 1, [len - s, y - 1]), c(mat, [len + 0.5 + s, -y + 1.5], r + 0.3, 5, 1), c(mat, [len + 0.5 - s, y - 1], r + 0.3, 5, 1),
];

/** Each zombie on one walking step (s = 1 or -1). */
const ZOMBIE_LOOKS: Record<ZombieKind, (s: number) => Part[]> = {
  normal: (s) => [...feet(s, 4.5, 3), c('shirt', [-1, -5], 3, 2, 2, [-1, 5]), c('blood', [-2, 3.5], 1.6, 4.1), ...reach(s), c('rot', [1, 0], 4, 6, 3), c('blood', [2, -1.5], 1.1, 9.5)],
  fast: (s) => [
    ...feet(s, 5.5, 2.5), c('shirtTan', [-1.5, -4], 2.5, 2, 2, [-1.5, 4]),
    c('rot', [-1, -4.5], 1, 4.5, 1, [-6 - s * 2, -5.5]), c('rot', [-1, 4.5], 1, 4.5, 1, [-6 + s * 2, 5.5]), // arms flung back, running
    c('rot', [1.5, 0], 3.3, 6, 2.5), c('blood', [2.5, 1.5], 0.9, 8.6),
  ],
  jumper: (s) => [
    c('pants', [-1, -3], 1.6, 1.5, 1, [3 + s, -7.5]), c('pants', [-1, 3], 1.6, 1.5, 1, [3 - s, 7.5]), // frog legs, knees out
    c('pants', [-1.5, -3.5], 2.8, 2, 2, [-1.5, 3.5]), ...reach(s, 5, 1, 4.5), c('rot', [1, 0], 3.4, 6, 2.5), c('blood', [-1, -1], 0.9, 8.5),
  ],
  screamer: (s) => [
    ...feet(s, 3, 2.5), c('shirtPale', [-1, -4], 2.7, 2, 2, [-1, 4]),
    c('rot', [0, -4.5], 1.1, 4.5, 1, [1 + s, -10]), c('rot', [0, 4.5], 1.1, 4.5, 1, [1 - s, 10]), // arms thrown wide
    c('rot', [0.5, 0], 3.8, 6, 3), c('mouth', [2.3, 0], 1.7, 9.6), c('blood', [-1, 3], 1.1, 4.1),
  ],
  bloater: (s) => [
    ...feet(s, 3.5, 4), c('rot', [2, -7], 1.1, 4.5, 1, [5 + s, -6]), c('rot', [2, 7], 1.1, 4.5, 1, [5 - s, 6]),
    c('bile', [-0.5, 0], 7.6, 2, 4), c('boil', [-2.5, 4], 1.4, 6.1, 0.5), c('boil', [0.5, -4.2], 1.2, 6.1, 0.5), c('boil', [-4.5, -1.5], 1, 6.1, 0.5),
    c('rot', [5, 0], 2.8, 5.5, 2),
  ],
  intelligent: (s) => [
    ...feet(s, 3, 3), c('shirtPale', [-1, -4.5], 3, 2, 2, [-1, 4.5]), c('blood', [1.5, 0], 0.6, 4.2, 0, [3, 0]),
    c('rot', [0, -5], 1.1, 4.5, 1, [3 + s, -6]), c('rot', [0, 5], 1.1, 4.5, 1, [3 - s, 6]),
    c('rot', [0.5, 0], 4.6, 6, 3), c('brain', [-0.5, 0], 2.8, 9.2, 1),
  ],
  armored: (s) => [
    ...feet(s, 4, 3), c('riot', [-1, -4.5], 3.4, 2, 2, [-1, 4.5]), c('shieldPlate', [0, -5.5], 2.2, 3.6, 1.5), c('shieldPlate', [0, 5.5], 2.2, 3.6, 1.5),
    ...reach(s, 6, 1.2), c('mask', [1, 0], 4, 6, 3), c('lens', [3.6, -2], 0.8, 9.3, 0, [3.6, 2]),
  ],
  tanky: (s) => [
    ...feet(s, 4, 4), c('rotDark', [-1, -6], 4.5, 2, 3, [-1, 6]),
    c('rot', [0, -8], 2.2, 5, 1.5, [7 + s, -8]), c('rot', [0, 8], 2.2, 5, 1.5, [7 - s, 8]), c('rot', [7.5 + s, -8], 2.4, 5.5, 1.5), c('rot', [7.5 - s, 8], 2.4, 5.5, 1.5),
    c('rot', [2.5, 0], 3.6, 7.5, 2.5), c('blood', [-2, -3], 1.3, 5.1),
  ],
  brute: (s) => [
    ...feet(s, 5, 5), c('rot', [-2, -8], 6, 2, 4, [-2, 8]), c('bone', [-6, -4], 1.2, 6.2, 1), c('bone', [-7, 0], 1.2, 6.2, 1), c('bone', [-6, 4], 1.2, 6.2, 1),
    c('rotDark', [0, -11], 3.2, 5, 2, [10 + s, -10]), c('rotDark', [0, 11], 3.2, 5, 2, [10 - s, 10]), c('rotDark', [11 + s, -10], 3.6, 6, 2), c('rotDark', [11 - s, 10], 3.6, 6, 2),
    c('blood', [-1, 5], 1.6, 6.1), c('rot', [3, 0], 4, 8, 2.5), c('blood', [4, 1.5], 1, 10.6),
  ],
  hordemother: (s) => [
    ...feet(s, 4, 5), c('rot', [2, -9], 1.1, 4.5, 1, [9 + s, -8]), c('rot', [2, 9], 1.1, 4.5, 1, [9 - s, 8]),
    c('flesh', [-2, 0], 10, 2, 5),
    c('bile', [-4, 6], 3, 7.2, 1.5), c('bile', [-6, -5], 2.6, 7.2, 1.5), c('bile', [1, -7], 2.2, 7.2, 1.5), c('bile', [-9, 1], 2.4, 7.2, 1.5), c('bile', [2, 5], 1.8, 7.2, 1.5),
    c('rot', [8, 0], 3.2, 6, 2),
  ],
};

/** One tile of a roadblock, drawn across (east-west); a roadblock is a row of these. */
export function roadblockPiece(kind: 'plastic' | 'wood' | 'sandbags' | 'cement', n: number): Part[] {
  if (kind === 'plastic') return [c(n % 2 ? 'barrierLight' : 'barrierRed', [-4, 0], 3.8, 3, 2, [4, 0])]; // jersey barriers, red and white
  if (kind === 'sandbags')
    return [c('sandbag', [-5.5, -2.4], 2.4, 3, 2, [-1.5, -2.4]), c('sandbag', [2, -2.4], 2.4, 3, 2, [6, -2.4]), c('sandbag', [-2, 2.4], 2.4, 3.2, 2, [2.5, 2.4]), c('sandbag', [5.5, 2.4], 2.4, 3.2, 2, [8, 2.4]), c('sandbag', [-8.5, 2.4], 2.4, 3.2, 2, [-6, 2.4])];
  if (kind === 'cement') return [c('concrete', [-6.5, 0], 4.4, 3, 2.5, [6.5, 0])];
  return [c('wood', [-8, -2.5], 2, 3, 1, [8, -2.5]), c('wood', [-8, 2], 2, 3, 1, [8, 2]), c('metal', [0, -5], 1, 4.5, 0, [0, 5])];
}

/** A car seen from above, nose east, three tiles long. */
const car = (body: string, roof: string, extra: Part[] = []): Part[] => [
  c('shoe', [-10, -8], 2.3, 1), c('shoe', [10, -8], 2.3, 1), c('shoe', [-10, 8], 2.3, 1), c('shoe', [10, 8], 2.3, 1),
  c(body, [-14, 0], 8, 2, 2, [14, 0]), c(roof, [-5, 0], 6, 4.5, 1.5, [4, 0]),
  c('lens', [6.5, -5], 1.1, 6.1, 0, [6.5, 5]), c('lens', [-7, -4.5], 1, 6.1, 0, [-7, 4.5]), ...extra,
];
const box = (mat: string, w = 4, h = 2.5): Part[] => [c(mat, [-w, -h], 2.6, 2, 1, [w, -h]), c(mat, [-w, h], 2.6, 2, 1, [w, h])];

/** Structures, strike icons and the A-10, each one still frame facing east. Size 48 for the big ones. */
const PROPS: Record<string, [number, Part[]]> = {
  car: [BIG, car('wreck', 'wreckRoof', [c('hole', [2, 3], 1.4, 5, 0, [9, 6])])],
  rigged: [BIG, car('tube', 'helmet', [c('tank', [-3, -2.4], 1.1, 7, 0.5, [2, -2.4]), c('tank', [-3, 0], 1.1, 7, 0.5, [2, 0]), c('tank', [-3, 2.4], 1.1, 7, 0.5, [2, 2.4]), c('brass', [2, 0], 0.4, 7.6, 0, [9, 4])])],
  watchtower: [SIZE, [
    c('wood', [-7, -7], 1.3, 1), c('wood', [7, -7], 1.3, 1), c('wood', [-7, 7], 1.3, 1), c('wood', [7, 7], 1.3, 1),
    ...[-6, -2, 2, 6].map((y) => c('wood', [-7.5, y], 2.1, 2, 0.5, [7.5, y])),
    c('pack', [-9, -9], 0.8, 3, 0, [9, -9]), c('pack', [-9, 9], 0.8, 3, 0, [9, 9]), c('pack', [9, -9], 0.8, 3, 0, [9, 9]),
  ]],
  nest: [SIZE, [-100, -60, -20, 20, 60, 100].map((d) => c('sandbag', [Math.cos((d * Math.PI) / 180) * 8.5, Math.sin((d * Math.PI) / 180) * 8.5], 2.8, 3, 2))],
  incendiary: [SIZE, [...box('tank'), c('hole', [-4, 0], 0.6, 4.7, 0, [4, 0]), c('fire', [0, 0], 1.3, 6)]],
  ammo: [SIZE, [...box('tube'), c('brass', [-3, -1.2], 0.7, 4.8, 0, [3, -1.2]), c('brass', [-3, 1.2], 0.7, 4.8, 0, [3, 1.2])]],
  mine: [SIZE, [c('metal', [0, 0], 3.6, 1, 1.5), c('cross', [0, 0], 1, 3.6)]],
  wire: [SIZE, [
    c('wood', [0, 0], 1.2, 3.5, 1),
    ...[[-8, -3, -4, 3], [-4, 3, 0, -3], [0, -3, 4, 3], [4, 3, 8, -3], [-8, 3, -4, -3], [-4, -3, 0, 3], [0, 3, 4, -3], [4, -3, 8, 3]].map(([a, b, d, e]) => c('metal', [a, b], 0.5, 2, 0, [d, e])),
  ]],
  explosives: [SIZE, [...box('wood', 3.5), ...[-2.4, 0, 2.4].map((y) => c('tank', [-3, y], 1.1, 4.6, 0.5, [3, y])), c('brass', [3, 0], 0.4, 5.4, 0, [8, 3]), c('metal', [8.5, 3.5], 1.6, 3, 1)]],
  generator: [SIZE, [...box('metal', 5, 3), c('brass', [-2, -3], 1.2, 5), c('tank', [3, -3], 1, 5), c('hole', [5, 3], 1.2, 5.4)]],
  spikes: [SIZE, [c('metal', [-8, 0], 2, 1.5, 0.5, [8, 0]), ...[-6, -2, 2, 6].flatMap((x) => [c('shieldPlate', [x, -4], 0.9, 3, 0.5, [x, -1]), c('shieldPlate', [x, 1], 0.9, 3, 0.5, [x, 4])])]],
  noise: [SIZE, [c('pack', [-4, 0], 3.8, 2, 1, [0, 0]), c('lens', [3, 0], 3.4, 4, 1), c('hole', [3, 0], 1.2, 5.5)]],
  missile: [SIZE, [c('metal', [-9, 0], 1.8, 3, 1.5, [7, 0]), c('cross', [8, 0], 1.7, 3.6, 1), c('metal', [-9, -1], 0.7, 2, 0, [-11, -4]), c('metal', [-9, 1], 0.7, 2, 0, [-11, 4])]],
  a10: [BIG, [
    c('plane', [-2, -19], 2.4, 3, 1, [-1, 19]), c('plane', [-15, -6], 1.4, 3, 1, [-15, 6]), c('plane', [-16, 0], 2.6, 4, 2, [16, 0]),
    c('metal', [-9, -4.5], 1.9, 5, 1.5, [-5, -4.5]), c('metal', [-9, 4.5], 1.9, 5, 1.5, [-5, 4.5]), c('lens', [11, 0], 1.4, 6.5, 1),
  ]],
  napalm: [SIZE, [c('tank', [-6, 0], 4, 2, 2, [5, 0]), c('metal', [-2, -4], 0.6, 4.4, 0, [-2, 4]), c('metal', [2, -4], 0.6, 4.4, 0, [2, 4]), c('fire', [9, 0], 2.2, 6), c('flash', [9.5, 0], 1, 7)]],
  smoke: [SIZE, [c('mask', [-6, 0], 3.2, 2, 2, [2, 0]), c('metal', [3.5, 0], 1.3, 3.5), c('smoke', [7, -3], 3, 4, 2), c('smoke', [9, 2.5], 2.4, 4, 2)]],
  artillery: [SIZE, [c('brass', [-9, 0], 2.6, 2, 1.5, [3, 0]), c('metal', [3, 0], 2.4, 2.2, 1.5, [8, 0]), c('metal', [9, 0], 1.4, 2.4, 1)]],
  flare: [SIZE, [c('cross', [-8, 0], 1.4, 2, 1, [3, 0]), c('fire', [6.5, 0], 2.6, 5), c('flash', [6.5, 0], 1.4, 6)]],
};

export interface Frame { anim: string; fps: number; size: number; rgba: Uint8ClampedArray<ArrayBuffer> }

/** Every frame as RGBA pixels, ready to pack into one atlas: `<kind>-<idle|walk|shoot>-<dir>`, `<zombie>-walk`. */
export function frames() {
  const out: Frame[] = [];
  const draw = (parts: Part[], size: number, angle: number, shadow: boolean) => shade(rasterize(parts, size, angle), MATERIALS, palette, shadow);
  for (const kind of Object.keys(units) as SoldierKind[]) {
    const still = kind === 'turret';
    for (let d = 0; d < DIRS; d++) {
      const angle = (d * 2 * Math.PI) / DIRS;
      const poses: [string, number, Pose][] = [
        ['idle', 2, {}], ['idle', 2, { breathe: 0.3 }],
        ['walk', 8, { stride: still ? 0 : 6 }], ['walk', 8, {}], ['walk', 8, { stride: still ? 0 : -6 }], ['walk', 8, {}],
        ['shoot', 10, { recoil: 1, flash: true }], ['shoot', 10, {}],
      ];
      for (const [anim, fps, pose] of poses) out.push({ anim: `${kind}-${anim}-${d}`, fps, size: SIZE, rgba: draw(soldier(kind, pose), SIZE, angle, true) });
    }
  }
  // Zombies face east only and are turned freely in the game, which keeps a thousand of them cheap.
  for (const kind of Object.keys(zombieData) as ZombieKind[]) {
    const size = kind === 'brute' || kind === 'hordemother' ? BIG : SIZE;
    for (const s of [1, -1]) out.push({ anim: `${kind}-walk`, fps: kind === 'fast' ? 8 : 4, size, rgba: draw(ZOMBIE_LOOKS[kind](s), size, 0, false) });
  }
  for (const n of [0, 1]) out.push({ anim: 'plastic', fps: 0, size: SIZE, rgba: draw(roadblockPiece('plastic', n), SIZE, 0, true) });
  for (const kind of ['wood', 'sandbags', 'cement'] as const) out.push({ anim: kind, fps: 0, size: SIZE, rgba: draw(roadblockPiece(kind, 0), SIZE, 0, true) });
  for (const [name, [size, parts]] of Object.entries(PROPS)) out.push({ anim: name, fps: 0, size, rgba: draw(parts, size, 0, true) });
  return out;
}
