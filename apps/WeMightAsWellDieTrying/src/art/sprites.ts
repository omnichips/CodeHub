// Every soldier and zombie, as parts seen from straight above, facing +x (east). Units are pixels from the sprite's
// centre; +y is the soldier's right. Soldiers share one body and differ in kit; zombies each have their own shape.
import palette from '../data/palette.json' with { type: 'json' };
import units from '../data/units.json' with { type: 'json' };
import zombieData from '../data/zombies.json' with { type: 'json' };
import { rasterize, shade, type Material, type Part, type Vec } from './pixels.ts';

export const SIZE = 32;
export const BIG = 48; // bosses, cars
export const BUS = 80;
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
  // a uniform for each class, so they can be told apart at a glance
  snow: ramp('snow0', 'snow1', 'snow2'),
  ember: ramp('ember0', 'ember1', 'ember2'),
  hivis: ramp('hivis0', 'hivis1', 'hivis2'),
  navy: ramp('navy0', 'navy1', 'navy2'),
  maroon: ramp('maroon0', 'maroon1', 'maroon2'),
  desert: ramp('desert0', 'desert1', 'desert2'),
  urban: ramp('urban0', 'urban1', 'urban2'),
  black: ramp('metal0', 'metal0', 'metal1'),
  red: ramp('red0', 'red1', 'red2'),
  brown: ramp('brown0', 'brown1', 'brown2'),
  teal: ramp('teal0', 'teal1', 'teal2'),
  copper: ramp('blood1', 'rust', 'skin2'),
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
  wreck: ramp('blood0', 'rust', 'skin2'), // rusted paint
  wreckRoof: ramp('khaki0', 'khaki1', 'cream'), // a dusty roof
  taxi: ramp('skin0', 'flash0', 'cream'),
  cream: ramp('khaki1', 'cream', 'pave1'),
  police: ramp('cloth0', 'cloth1', 'cloth2'),
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
/** What makes a class look like itself: its uniform (helmet, vest, sleeves, pack), what is on its head and back, and
 *  what is in its hands. Each class wears its own colours so it can be told apart at a glance. */
interface Look { helmet?: string; vest?: string; sleeve?: string; pack?: string; back?: Part[]; head?: Part[]; hold: (g: number, flash: boolean) => Part[] }
type SoldierKind = keyof typeof units;

/** A soft hat with a brim all round (marksman, mortar). */
const boonie = (mat: string): Part[] => [c(mat, [0, 0], 5.6, 5.4, 0.4), c(mat, [-0.3, 0], 3.4, 6.6, 1.6)];
const rifle = (g: number, f: boolean): Part[] => [c('metal', [1 + g, 1], 1.1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.75, 5.5, 0.5, [13.5 + g, 1]), ...(f ? muzzle(15 + g, 1) : [])];

const LOOKS: Record<Exclude<SoldierKind, 'turret' | 'machinegunner'>, Look> = {
  rifleman: { hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), ...rifle(g, f)] },
  // Dressed for snow like Simo Häyhä: white hood, white smock, a rifle with a scope.
  sniper: {
    helmet: 'snow', vest: 'snow', sleeve: 'snow', pack: 'snow',
    head: [c('snow', [-3, -3], 1.8, 6.5, 1), c('snow', [-3.5, 2.6], 1.7, 6.5, 1), c('snow', [-4.2, 0], 1.8, 6.4, 1)],
    hold: (g, f) => [...arms([8 + g, -0.5], [4 + g, 2.5]), c('metal', [0 + g, 1], 1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.6, 5.5, 0, [16 + g, 1]), c('black', [3 + g, 0.2], 0.9, 6.3, 0.5, [7.5 + g, 0.2]), ...(f ? muzzle(17 + g, 1, 0.8) : [])],
  },
  // A fire suit and a gas mask, red tanks on the back.
  flamethrower: {
    helmet: 'mask', vest: 'ember', sleeve: 'ember',
    head: [c('lens', [2.3, -1.5], 0.9, 9.4), c('lens', [2.3, 1.5], 0.9, 9.4), c('black', [3.6, 0], 1, 8.6)],
    back: [c('red', [-5.5, -2.4], 2.4, 2.5, 2.5), c('red', [-5.5, 2.4], 2.4, 2.5, 2.5)],
    hold: (g, f) => [
      ...arms([7 + g, -0.5], [4 + g, 2.5]), c('metal', [-4, 2.4], 0.5, 4, 0, [2 + g, 2]), c('metal', [2 + g, 1], 0.8, 5.5, 0.5, [10 + g, 1]), c('metal', [10.5 + g, 1], 1.2, 5.6, 1),
      ...(f ? [c('fire', [13.5 + g, 1], 2.4, 10, 0, [15.5 + g, 1]), c('flash', [12.5 + g, 1], 1.3, 11, 0, [14.5 + g, 1])] : []),
    ],
  },
  // A maroon beret instead of a helmet, the launcher on the shoulder.
  bazooka: {
    helmet: 'maroon', vest: 'vestDark',
    head: [c('maroon', [-1.2, 1.6], 3, 6.8, 1.2)],
    back: [c('pack', [-4.5, -3], 2.2, 2, 2, [-4.5, 3]), c('red', [-6.5, -1.5], 1, 4.5, 0.5, [-6.5, 1.5])],
    hold: (g, f) => [...arms([5 + g, 2.4], [1.5 + g, 6]), c('tube', [-7, 4.4], 1.9, 7, 1.5, [11 + g, 4.4]), c('hole', [11.2 + g, 4.4], 1.1, 8.6), ...(f ? [...muzzle(13.5 + g, 4.4, 1.3), c('flash', [-9, 4.4], 1.4, 10)] : [])],
  },
  // Navy riot gear behind a big plate.
  shield: {
    helmet: 'riot', vest: 'navy', sleeve: 'navy', pack: 'navy',
    head: [c('lens', [2.9, -2.4], 0.8, 9.3, 0, [2.9, 2.4])],
    hold: (g, f) => [...arms([4.5, -3], [5 + g, 8.3]), c('shieldPlate', [6.5, -8], 1.9, 7, 1.2, [6.5, 7.5]), c('lens', [6.6, -2], 0.6, 8.9, 0, [6.6, 2]), c('metal', [5 + g, 8.6], 0.8, 6.5, 0.5, [9 + g, 8.6]), ...(f ? muzzle(10.5 + g, 8.6, 0.8) : [])],
  },
  // Desert kit and a boonie hat, crouched over the tube.
  mortar: {
    helmet: 'desert', vest: 'desert', sleeve: 'desert', pack: 'desert', head: boonie('desert'),
    hold: (g, f) => [
      c('metal', [5, 0], 3.6, 1.5, 0.5), c('metal', [9, 0], 0.5, 3, 0, [11.5, -3.8]), c('metal', [9, 0], 0.5, 3, 0, [11.5, 3.8]), // baseplate and bipod
      ...arms([6, -2.6], [6, 2.6], 8), c('metal', [5, 0], 2.3, 5, 2, [11 + g / 2, 0]), c('hole', [11 + g / 2, 0], 1.3, 7.6), ...(f ? muzzle(12.5, 0, 1.3) : []),
    ],
  },
  // A white helmet and bag with red crosses.
  medic: {
    helmet: 'snow',
    head: [c('red', [-2, 0], 0.7, 10, 0, [2, 0]), c('red', [0, -2], 0.7, 10, 0, [0, 2])],
    back: [c('snow', [-4.5, -2.5], 2.3, 2, 2, [-4.5, 2.5]), c('red', [-4.5, -1.3], 0.5, 4.5, 0, [-4.5, 1.3]), c('red', [-5.8, 0], 0.5, 4.5, 0, [-3.2, 0])],
    hold: () => arms([3.5, -6.5], [3.5, 6.5]),
  },
  // Brown hunting kit and a boonie hat; a long rifle with a scope.
  marksman: {
    helmet: 'brown', vest: 'brown', sleeve: 'brown', pack: 'brown', head: boonie('brown'),
    hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), c('metal', [0 + g, 1], 1.05, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.65, 5.5, 0, [14.5 + g, 1]), c('metal', [3 + g, 0.2], 0.8, 6.3, 0.5, [6.5 + g, 0.2]), ...(f ? muzzle(15.5 + g, 1, 0.9) : [])],
  },
  // All in black, a red headband.
  shotgunner: {
    helmet: 'black', vest: 'black', sleeve: 'black', pack: 'black',
    head: [c('red', [0.5, -4.2], 1.1, 9.2, 0, [0.5, 4.2]), c('red', [-4.2, -1], 0.9, 6.6, 0, [-6, -2.5]), c('red', [-4.2, 1], 0.9, 6.6, 0, [-6, 2.5])], // the band and its tails
    hold: (g, f) => [...arms([7.5 + g, -0.5], [3.5 + g, 2.5]), c('metal', [1 + g, 1], 1.2, 5.5, 1, [8 + g, 1]), c('metal', [8 + g, 1], 1, 5.5, 1, [12 + g, 1]), c('wood', [6 + g, 1], 1.4, 5.8, 1, [8.5 + g, 1]), ...(f ? [...muzzle(13.5 + g, 1, 1.5), c('flash', [15.5 + g, -1.8], 0.8, 10), c('flash', [15.5 + g, 3.8], 0.8, 10)] : [])],
  },
  // A hi-vis vest and a yellow hard hat.
  engineer: {
    helmet: 'hardhat', vest: 'hivis', pack: 'hivis',
    head: [c('hardhat', [0, 0], 5, 5.5, 0.5)], // the brim
    hold: (g) => [...arms([5, -4.5], [6 + g, 3]), c('pack', [6, -5.5], 1.7, 5.5, 1), c('metal', [6 + g, 3.2], 0.7, 6.5, 0, [10 + g, 4.2]), c('metal', [10.6 + g, 4.3], 1.3, 6.6, 0.5)],
  },
  // Grey urban camo, a bandolier of grenades across the chest.
  grenadier: {
    helmet: 'urban', vest: 'urban', sleeve: 'urban',
    back: [c('urban', [-4.5, -3], 2.2, 2, 2, [-4.5, 3]), c('brass', [-6.5, -2], 0.9, 4.5, 0.5), c('brass', [-6.5, 0], 0.9, 4.5, 0.5), c('brass', [-6.5, 2], 0.9, 4.5, 0.5)],
    head: [c('brass', [-3, -4.5], 0.7, 3.4, 0, [1, 4.5])],
    hold: (g, f) => [...arms([8 + g, -0.5], [4.5 + g, 2.5]), c('metal', [1 + g, 1], 1.1, 5.5, 1, [10 + g, 1]), c('metal', [10 + g, 1], 0.75, 5.5, 0.5, [13 + g, 1]), c('metal', [4 + g, 2.6], 1.35, 5.3, 1, [10.5 + g, 2.6]), c('hole', [10.7 + g, 2.6], 0.8, 6.8), ...(f ? muzzle(12.5 + g, 2.6, 1.2) : [])],
  },
  // Teal tech gear, a headset and an antenna: the man who runs the turret.
  operator: {
    helmet: 'black', vest: 'teal', sleeve: 'teal', pack: 'teal',
    head: [c('lens', [0, -4.4], 1.1, 7, 0.5), c('lens', [0, 4.4], 1.1, 7, 0.5)],
    back: [c('teal', [-4.5, -3], 2.4, 2, 2, [-4.5, 3]), c('metal', [-6, -2], 0.4, 3.5, 0, [-11, -6]), c('flash', [-11, -6], 0.7, 4)],
    hold: (g, f) => [...arms([7 + g, -0.5], [4 + g, 2.5]), c('metal', [2 + g, 1], 1.1, 5.5, 1, [8 + g, 1]), c('metal', [8 + g, 1], 0.7, 5.5, 0, [10.5 + g, 1]), ...(f ? muzzle(12 + g, 1, 0.9) : [])],
  },
};

/** The machine gun is a crew of two on a bigger sprite: the gunner lying behind the gun on its bipod, the loader
 *  kneeling beside him feeding the belt from the ammo box. */
function crew(g: number, f: boolean, stride: number): Part[] {
  return [
    // the gunner, lying down
    c('boot', [-17, -7 + stride / 3], 1.6, 1, 1), c('boot', [-17, -1 - stride / 3], 1.6, 1, 1),
    c('sleeve', [-15, -7 + stride / 3], 1.8, 1.5, 1, [-6, -6]), c('sleeve', [-15, -1 - stride / 3], 1.8, 1.5, 1, [-6, -2]),
    c('vest', [-7, -4], 3.4, 2.5, 2, [0, -4]), c('helmet', [3, -4], 3.6, 6, 3),
    c('sleeve', [0, -7], 1.3, 4, 1, [6, -6]), c('sleeve', [0, -1], 1.3, 4, 1, [6, -2.5]), c('skin', [6.5, -6], 1.4, 5.5, 1), c('skin', [6.5, -2.5], 1.4, 5.5, 1),
    // the gun on its bipod
    c('metal', [15 + g, -3], 0.5, 2.5, 0, [17, -7]), c('metal', [15 + g, -3], 0.5, 2.5, 0, [17, 1]),
    c('metal', [3 + g, -3], 2, 5, 1, [12 + g, -3]), c('metal', [12 + g, -3], 0.9, 5, 0.5, [20 + g, -3]),
    c('brass', [6 + g, -0.5], 0.7, 5.6, 0, [7.5, 5]), // the belt
    // the loader, kneeling with the ammo box
    c('pack', [7.5, 6.5], 2.6, 3, 1, [10, 6.5]),
    c('boot', [-8, 6 + stride / 3], 1.6, 1, 1), c('boot', [-7, 12 - stride / 3], 1.6, 1, 1), c('pack', [-6.5, 9], 2.2, 2, 2),
    c('sleeve', [-2, 4.5], 2.6, 2, 2, [-2, 12.5]), c('vest', [-2.5, 8.5], 3, 2.5, 2), c('helmet', [-1.5, 8.5], 3.6, 6, 3),
    c('sleeve', [-1, 5], 1.2, 4, 1, [4.5, 5.5]), c('skin', [5, 5.5], 1.3, 5.5, 1), c('sleeve', [-1, 12], 1.2, 4, 1, [6, 8.5]), c('skin', [6.5, 8.5], 1.3, 5.5, 1),
    ...(f ? muzzle(21.5 + g, -3, 1.3) : []),
  ];
}

export function soldier(kind: SoldierKind, { stride = 0, recoil = 0, flash = false, breathe = 0 }: Pose = {}): Part[] {
  if (kind === 'turret') {
    const g = -recoil;
    return [
      c('metal', [0, 0], 0.7, 1, 0, [-6, -5]), c('metal', [0, 0], 0.7, 1, 0, [-6, 5]), c('metal', [0, 0], 0.7, 1, 0, [6, 0]),
      c('pack', [-1, 4.5], 2, 3, 1), c('metal', [-3 + g, 0], 2.6, 4, 1.5, [3 + g, 0]), c('metal', [3 + g, 0], 0.9, 5, 0.5, [13 + g, 0]),
      ...(flash ? muzzle(14.5 + g, 0) : []),
    ];
  }
  if (kind === 'machinegunner') return crew(-recoil, flash, stride);
  const look = LOOKS[kind];
  const parts = [
    c('boot', [stride, -4], 1.8, 1, 1), c('boot', [-stride, 4], 1.8, 1, 1),
    ...(look.back ?? [c('pack', [-4.5, -3], 2.2 + breathe, 2, 2, [-4.5, 3])]),
    c('sleeve', [0, -5.5], 3 + breathe, 2, 2, [0, 5.5]),
    c(look.vest ?? 'vest', [-0.5, -2.5], 3.3 + breathe, 2.5, 2, [-0.5, 2.5]),
    c(look.helmet ?? 'helmet', [0, 0], 4.3, 6, 3),
    ...(look.head ?? []),
    ...look.hold(-recoil, flash),
  ];
  // The uniform: sleeves and pack in the class's own colours.
  return parts.map((p) => (p.mat === 'sleeve' && look.sleeve ? { ...p, mat: look.sleeve } : p.mat === 'pack' && look.pack ? { ...p, mat: look.pack } : p));
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
export function roadblockPiece(kind: 'plastic' | 'wood' | 'sandbags' | 'cement' | 'police', n: number): Part[] {
  if (kind === 'plastic') return [c(n % 2 ? 'barrierLight' : 'barrierRed', [-4, 0], 3.8, 3, 2, [4, 0])]; // jersey barriers, red and white
  if (kind === 'police') return [c('metal', [-6, 2.5], 0.8, 2, 0, [-6, -2.5]), c('metal', [6, 2.5], 0.8, 2, 0, [6, -2.5]), c(n % 2 ? 'barrierLight' : 'police', [-8, 0], 1.6, 3.5, 1, [8, 0])];
  if (kind === 'sandbags')
    return [c('sandbag', [-5.5, -2.4], 2.4, 3, 2, [-1.5, -2.4]), c('sandbag', [2, -2.4], 2.4, 3, 2, [6, -2.4]), c('sandbag', [-2, 2.4], 2.4, 3.2, 2, [2.5, 2.4]), c('sandbag', [5.5, 2.4], 2.4, 3.2, 2, [8, 2.4]), c('sandbag', [-8.5, 2.4], 2.4, 3.2, 2, [-6, 2.4])];
  if (kind === 'cement') return [c('concrete', [-6.5, 0], 4.4, 3, 2.5, [6.5, 0])];
  return [c('wood', [-8, -2.5], 2, 3, 1, [8, -2.5]), c('wood', [-8, 2], 2, 3, 1, [8, 2]), c('metal', [0, -5], 1, 4.5, 0, [0, 5])];
}

/** A flat box with rounded corners, from x0 to x1 and `hw` either side of the middle: two boxes crossed, and a circle
 *  in each corner (a capsule would be a pill). */
const slab = (mat: string, x0: number, x1: number, hw: number, z: number, r: number, y = 0): Part[] => [
  { mat, a: [x0, y], b: [x1, y], r: hw - r, z, square: true }, { mat, a: [x0 + r, y], b: [x1 - r, y], r: hw, z, square: true },
  c(mat, [x0 + r, y - (hw - r)], r, z), c(mat, [x1 - r, y - (hw - r)], r, z), c(mat, [x0 + r, y + hw - r], r, z), c(mat, [x1 - r, y + hw - r], r, z),
];
/** A car seen from above, nose east: two tiles wide, three long. Paint, the cabin roof, and anything extra on top. */
const car = (paint: string, roof: string, extra: Part[] = []): Part[] => [
  ...([[-13, -13.5], [13, -13.5], [-13, 13.5], [13, 13.5]] as const).map((p) => c('shoe', p, 3, 1.5, 0.5)), // tyres showing at the sides
  ...slab(paint, -21.3, 21.3, 13.3, 3, 5), // edges off pixel centres, or they come out dotted
  ...slab('lens', 4, 11, 11, 4, 2.5), ...slab('lens', -14, -8, 10.5, 4, 2.5), // windscreen, rear window
  ...slab(roof, -10, 6, 11, 5.2, 3.5),
  c('lens', [-8.5, -12], 0.9, 4.4, 0, [3.5, -12]), c('lens', [-8.5, 12], 0.9, 4.4, 0, [3.5, 12]), // side windows
  c('brass', [20, -9.5], 1.6, 3.6), c('brass', [20, 9.5], 1.6, 3.6), c('red', [-20.5, -10], 1.4, 3.6), c('red', [-20.5, 10], 1.4, 3.6),
  c('black', [4.5, -14.8], 1.3, 3.5), c('black', [4.5, 14.8], 1.3, 3.5), // mirrors
  ...extra,
];
/** Wrecks in the street: three paint jobs gone to rust, smashed glass, a dent, dried blood. */
const WRECKS: [string, string][] = [['wreck', 'wreckRoof'], ['navy', 'snow'], ['snow', 'urban']];
const wreck = ([paint, roof]: [string, string], k: number): Part[] =>
  car(paint, roof, [c('hole', [8 - k * 2, -4 + k * 3], 1.6, 4.3, 0, [9.5 - k, 1 + k]), c('copper', [-15 + k * 4, 8 - k * 6], 2.4, 3.2), c('copper', [14, -6 + k * 5], 1.8, 3.2), c('blood', [-3, 9 - k * 4], 1.4, 5.4)]);
const box = (mat: string, w = 4, h = 2.5): Part[] => [c(mat, [-w, -h], 2.6, 2, 1, [w, -h]), c(mat, [-w, h], 2.6, 2, 1, [w, h])];

/** Someone who lived here, from above, built like a soldier but in their own clothes: shoes, a coat over the
 *  shoulders, arms, a head of hair (or a hat), maybe a backpack, a bag or a case in one hand, or an umbrella over it
 *  all. One walking step (s = 1 or -1). The game's civilians: CIVS normal looks, then UMBRELLAS under umbrellas. */
interface Civ { coat: string; hair: string; hat?: string; pack?: string; carry?: string; umbrella?: string }
const CIVS: Civ[] = [
  { coat: 'navy', hair: 'black', carry: 'brown' }, { coat: 'red', hair: 'brown', pack: 'teal' }, { coat: 'shirtTan', hair: 'black' },
  { coat: 'teal', hair: 'shirtPale', carry: 'black' }, { coat: 'maroon', hair: 'snow', hat: 'urban' }, { coat: 'urban', hair: 'brown', pack: 'hivis' },
  { coat: 'cream', hair: 'black', carry: 'red' },
  { coat: 'navy', hair: 'black', umbrella: 'snow' }, { coat: 'red', hair: 'brown', umbrella: 'navy' }, { coat: 'urban', hair: 'black', umbrella: 'red' },
];
function civilian(l: Civ, s: number): Part[] {
  return [
    c('shoe', [s * 2.5, -2.2], 1.5, 1), c('shoe', [-s * 2.5, 2.2], 1.5, 1),
    ...(l.pack ? [c(l.pack, [-3.6, -2], 2, 2.5, 2, [-3.6, 2])] : []),
    c(l.coat, [-0.3, -4], 2.6, 2, 2, [-0.3, 4]),
    c(l.coat, [0.3, -4.6], 1, 4, 1, [2 + s, -5]), c(l.coat, [0.3, 4.6], 1, 4, 1, [2 - s, 5]), c('skin', [2.3 + s, -5], 1.2, 4.6, 1), c('skin', [2.3 - s, 5], 1.2, 4.6, 1),
    ...(l.carry ? [c(l.carry, [1.5 - s, 6.6], 1.5, 3.6, 0.8, [4 - s, 6.6])] : []),
    c('skin', [0.6, 0], 2.9, 5.4, 2.2), c(l.hair, [-0.5, 0], 2.7, 6, 2),
    ...(l.hat ? [c(l.hat, [0, 0], 3.3, 6.6, 1.4)] : []),
    ...(l.umbrella ? [c(l.umbrella, [1, 0], 6.2, 9, 2), c('metal', [1, 0], 0.6, 11.2)] : []),
  ];
}

/** A ferry from above, bow east, 288 long and 60 across: white, a blue band round her hull; a long cabin with rows
 *  of windows, an upper deck with its benches and orange lifeboats, the wheelhouse forward, a red funnel, railings,
 *  people out on the open aft deck, the winch and bitts on the foredeck. */
function ferry(): Part[] {
  const h = (k: number, s: number) => (((Math.sin(k * 12.9898 + s * 78.233) * 43758.5453) % 1) + 1) % 1; // scattered, the same every time
  const passengers = Array.from({ length: 26 }, (_, k): Part[] => {
    const x = -134 + h(k, 1) * 46, y = -20 + h(k, 2) * 40, coat = ['navy', 'red', 'shirtTan', 'teal', 'maroon', 'urban', 'cream'][k % 7];
    return [c(coat, [x, y], 2.4, 4.5, 1.5), c('skin', [x + 0.4, y], 1.6, 6), c(k % 3 ? 'black' : 'brown', [x - 0.4, y], 1.4, 6.3)];
  }).flat();
  return [
    ...slab('navy', -144, 104, 30, 2.6, 8), ...[0, 1, 2, 3, 4, 5].map((k) => c('navy', [104 + k * 6.4, 0], 30 - k * 5.2, 2.6, 0.4)), // the hull's band
    ...slab('snow', -142, 104, 28, 3, 7), ...[0, 1, 2, 3, 4, 5].map((k) => c('snow', [104 + k * 6, 0], 28 - k * 5, 3, 0.4)),
    ...slab('smoke', -138, 104, 24, 3.4, 5), // the deck
    c('metal', [-140, -26.5], 0.5, 4.2, 0, [100, -26.5]), c('metal', [-140, 26.5], 0.5, 4.2, 0, [100, 26.5]), c('metal', [-141, -26], 0.5, 4.2, 0, [-141, 26]), // railings
    ...passengers,
    ...[-120, -104].flatMap((x) => [...slab('wood', x, x + 10, 2, 4, 1, -12), ...slab('wood', x, x + 10, 2, 4, 1, 12)]), // benches
    ...slab('snow', -82, 74, 22, 7, 3), // the cabin
    ...Array.from({ length: 19 }, (_, k): Part[] => [c('lens', [-78 + k * 8, -18.8], 1.3, 7.4, 0, [-73.5 + k * 8, -18.8]), c('lens', [-78 + k * 8, 18.8], 1.3, 7.4, 0, [-73.5 + k * 8, 18.8])]).flat(),
    ...slab('cream', -64, 48, 15, 9.5, 2), // the upper deck
    ...[-56, -12, 22].flatMap((x) => [...slab('wood', x, x + 12, 1.6, 10.2, 0.8, -9), ...slab('wood', x, x + 12, 1.6, 10.2, 0.8, 9)]),
    ...[-56, -6, 24].flatMap((x) => [...slab('hivis', x, x + 16, 3, 10.5, 2, -19), ...slab('hivis', x, x + 16, 3, 10.5, 2, 19)]), // lifeboats
    ...slab('snow', 50, 72, 17, 12, 3), ...slab('lens', 68, 73, 15, 12.4, 2), c('metal', [60, 0], 1, 14), // the wheelhouse, its windscreen, the mast
    c('red', [-34, 0], 7.5, 14, 2), c('black', [-34, 0], 4.6, 15), // the funnel
    c('metal', [118, 0], 4, 4.4, 1.5), c('black', [128, -8], 1.6, 5), c('black', [128, 8], 1.6, 5), c('black', [-134, -18], 1.6, 5), c('black', [-134, 18], 1.6, 5), // winch, bitts
    c('red', [-143, 0], 1.2, 6, 0, [-147, 0]),
  ];
}

/** A ship from above, bow east, 320 long and 64 across: a hull, the bridge and funnel aft, and on the deck what she
 *  carries. Grey with her hatches (0), a cargo ship stacked with containers (1), a white liner with two funnels (2). */
function ship(kind: number): Part[] {
  const [rim, side, deck] = [['black', 'smoke', 'concrete'], ['red', 'black', 'smoke'], ['navy', 'snow', 'cream']][kind];
  const hull = [
    ...slab(rim, -160, 112, 32, 2.6, 9), ...[0, 1, 2, 3, 4, 5, 6].map((k) => c(rim, [112 + k * 6.6, 0], 32 - k * 4.7, 2.6, 0.4)),
    ...slab(side, -158, 112, 30, 3, 8), ...[0, 1, 2, 3, 4, 5, 6].map((k) => c(side, [112 + k * 6.2, 0], 30 - k * 4.5, 3, 0.4)),
    ...slab(deck, -154, 110, 26, 3.4, 6),
    c('metal', [-156, -28.5], 0.5, 4.2, 0, [110, -28.5]), c('metal', [-156, 28.5], 0.5, 4.2, 0, [110, 28.5]),
    c('metal', [140, 0], 1.6, 14), c('metal', [128, 0], 4, 4.4, 1.5), c('black', [148, -7], 1.6, 5), c('black', [148, 7], 1.6, 5), // mast, winch, bitts
  ];
  const bridge = [...slab('snow', -150, -106, 26, 11, 3), ...slab('cream', -146, -112, 20, 13.5, 2), c('lens', [-106.5, -23], 1.2, 11.4, 0, [-106.5, 23]), c('metal', [-108, -31], 1.5, 11.2, 0, [-108, 31])];
  if (kind === 0) return [
    ...hull, ...bridge, ...[-86, -46, -6, 34, 74].flatMap((x) => [...slab('metal', x - 14, x + 14, 21, 5, 2), c('black', [x, -21], 0.5, 5.3, 0, [x, 21])]),
    c('urban', [-132, 0], 7.5, 16, 2), c('black', [-132, 0], 4.6, 17), c('red', [-132, -7.6], 1, 16.2, 0, [-132, 7.6]),
  ];
  if (kind === 1) {
    const boxes = ['navy', 'red', 'teal', 'hivis', 'urban', 'maroon', 'brown'];
    return [
      ...hull, ...bridge,
      ...Array.from({ length: 30 }, (_, k): Part[] => { const x = -92 + Math.floor(k / 5) * 34, y = -20 + (k % 5) * 10; return slab(boxes[(k * 3 + (k >> 2)) % 7], x, x + 30, 4.2, 5 + ((k * 7) % 3) * 2, 1, y); }).flat(),
      c('hivis', [-80, -27], 1.2, 13, 0, [-60, -6]), c('hivis', [40, 27], 1.2, 13, 0, [60, 6]), // cranes
      c('black', [-132, 0], 7.5, 16, 2), c('hivis', [-132, 0], 6, 16.4), c('black', [-132, 0], 4.2, 17),
    ];
  }
  return [
    ...hull, ...slab('snow', -150, 90, 26, 8, 3),
    ...Array.from({ length: 30 }, (_, k): Part[] => [c('lens', [-146 + k * 8, -23], 1.2, 8.4, 0, [-142 + k * 8, -23]), c('lens', [-146 + k * 8, 23], 1.2, 8.4, 0, [-142 + k * 8, 23])]).flat(),
    ...slab('cream', -136, 70, 20, 10.5, 2), ...slab('snow', 64, 88, 22, 13, 3), c('lens', [87.5, -20], 1.2, 13.4, 0, [87.5, 20]),
    ...[-110, -80, -40, 0, 30].flatMap((x) => [...slab('hivis', x, x + 18, 3, 11, 2, -22), ...slab('hivis', x, x + 18, 3, 11, 2, 22)]),
    ...[-60, -10].flatMap((x) => [c('red', [x, 0], 8, 16, 2), c('black', [x, 0], 5, 17)]),
  ];
}

/** A yellow school bus from above, nose east: its hood out in front, black rub rails, windows down both sides, roof
 *  hatches, the emergency door at the back. */
const schoolBus = (): Part[] => [
  ...([[-25, -13.5], [25, -13.5], [-25, 13.5], [25, 13.5]] as const).map((p) => c('shoe', p, 3, 1.5, 0.5)),
  ...slab('hivis', -38.3, 26, 13.3, 3, 4), ...slab('hivis', 24, 37.5, 10, 2.6, 3),
  c('black', [-37, -13.2], 0.7, 3.4, 0, [25, -13.2]), c('black', [-37, 13.2], 0.7, 3.4, 0, [25, 13.2]),
  ...[-33, -25, -17, -9, -1, 7, 15].flatMap((x) => [c('lens', [x, -11.4], 1, 3.8, 0, [x + 5, -11.4]), c('lens', [x, 11.4], 1, 3.8, 0, [x + 5, 11.4])]),
  ...slab('lens', 22, 25.5, 12, 3.6, 1.5), ...slab('cream', -24, -16, 6, 3.8, 1.5), ...slab('cream', 2, 10, 6, 3.8, 1.5),
  c('black', [-38, -6], 0.6, 3.6, 0, [-38, 6]), c('red', [-38, -11.5], 1.2, 3.6), c('red', [-38, 11.5], 1.2, 3.6), c('brass', [37.5, -8], 1.3, 3), c('brass', [37.5, 8], 1.3, 3),
];
/** An army truck from above, nose east: the cab, the canvas back over its hoops, a star on the cab roof. */
const armyTruck = (): Part[] => [
  ...([[-26, -13], [-16, -13], [24, -12], [-26, 13], [-16, 13], [24, 12]] as const).map((p) => c('shoe', p, 3.2, 1.5, 0.5)),
  ...slab('helmet', 18, 36, 12, 4.4, 3), ...slab('lens', 32, 35.5, 10, 4.8, 1.5), c('snow', [24, 0], 1.6, 4.6), c('brass', [36.5, -8], 1.3, 3.5), c('brass', [36.5, 8], 1.3, 3.5),
  ...slab('tube', -36, 16, 13.3, 5, 2.5), ...[-30, -21, -12, -3, 6].map((x) => c('vestDark', [x, -13], 0.7, 7.6, 0, [x, 13])),
];
/** A field tent, ridge east-west: its two slopes, the ridge, guy ropes, the flap open at the east end. */
const tent = (mat: string): Part[] => [
  ...[-17, 17].flatMap((x) => [c('metal', [x, -11], 0.4, 1, 0, [x + (x < 0 ? -4 : 4), -15]), c('metal', [x, 11], 0.4, 1, 0, [x + (x < 0 ? -4 : 4), 15])]),
  { mat, a: [-18, -6], b: [18, -6], r: 6.5, z: 3, dome: 2, square: true }, { mat, a: [-18, 6], b: [18, 6], r: 6.5, z: 3, dome: 2, square: true },
  { mat, a: [-18, 0], b: [18, 0], r: 1.4, z: 5.6, square: true }, c('black', [17, 0], 2.4, 4.6, 0, [19, 0]),
];
/** A campfire: a ring of stones, the logs crossed, the coals glowing (its flames and smoke are drawn live). */
const campfire = (): Part[] => [
  ...Array.from({ length: 9 }, (_, k) => c('concrete', [Math.cos((k * Math.PI * 2) / 9) * 6.5, Math.sin((k * Math.PI * 2) / 9) * 6.5], 1.7, 2, 1)),
  c('wood', [-4, -3], 1.1, 2.5, 1, [4, 3]), c('wood', [-4, 3], 1.1, 2.6, 1, [4, -3]), c('ember', [0, 0], 3, 2.2, 0.5), c('fire', [0.5, -0.5], 1.6, 3.4),
];
/** A sleeping bag with someone in it, head east; the bag's colour. */
const sleepingBag = (mat: string): Part[] => [c(mat, [-9, 0], 3.6, 2, 1.5, [5, 0]), c(mat, [-9, 0], 3, 2.8, 1), c('skin', [8, 0], 2.3, 3.2, 1.5), c('brown', [9, 0], 2.1, 3.5, 1)];

/** Structures, strike icons and the A-10, each one still frame facing east. Size 48 for the big ones. */
const PROPS: Record<string, [number, Part[]]> = {
  taxi: [BIG, car('taxi', 'taxi', [c('cream', [-2, -3.5], 1.6, 6.6, 0.5, [-2, 3.5]), c('copper', [12, 6], 1.8, 3.2)])], // the roof sign
  /** A city bus, two tiles wide and five long: windows down both sides, a red stripe, vents on the roof. */
  bus: [BUS, [
    ...([[-25, -13.5], [25, -13.5], [-25, 13.5], [25, 13.5]] as const).map((p) => c('shoe', p, 3, 1.5, 0.5)),
    ...slab('cream', -38.3, 38.3, 13.3, 3, 4),
    c('red', [-37, -13.3], 0.8, 3.4, 0, [37, -13.3]), c('red', [-37, 13.3], 0.8, 3.4, 0, [37, 13.3]),
    ...[-33, -24, -15, -6, 3, 12, 21].flatMap((x) => [c('lens', [x, -11.2], 1, 3.8, 0, [x + 6, -11.2]), c('lens', [x, 11.2], 1, 3.8, 0, [x + 6, 11.2])]),
    ...slab('lens', 32, 37.5, 11.5, 3.6, 2), c('brass', [37.5, -11], 1.3, 3.7), c('brass', [37.5, 11], 1.3, 3.7),
    ...slab('metal', -16, -6, 6, 4.6, 2.5), ...slab('metal', 8, 16, 5, 4.6, 2.5), ...slab('urban', -30, -24, 4, 4, 2),
    c('blood', [20, -3], 1.6, 3.7), c('copper', [-10, 9], 2.2, 3.4),
  ]],
  rigged: [BIG, car('tube', 'helmet', [c('red', [-3, -4], 1.4, 7, 0.5, [3, -4]), c('red', [-3, 0], 1.4, 7, 0.5, [3, 0]), c('red', [-3, 4], 1.4, 7, 0.5, [3, 4]), c('brass', [3, 0], 0.4, 7.6, 0, [12, 6])])],
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
  // Strikes in flight, about to scale (a car, 4.5 m long, is 48 px: about 10 px to the metre).
  /** The A-10 from above, nose east: 16 m long, 17.5 m across its straight wings; the two engines high on the back,
   *  the twin tail fins, bombs under the wings, the cannon in the nose. */
  jet: [192, [
    c('plane', [4, -86], 8, 3, 1, [4, 86]), c('plane', [6, -32], 12, 3.4, 1.2, [6, 32]), // the wings, thicker at the root
    ...[-1, 1].flatMap((s) => [c('metal', [8, s * 70], 4.5, 4.4, 0.4, [2, s * 48]), c('metal', [-3, s * 34], 4, 4.8, 0.4, [6, s * 22])]), // grey camouflage
    ...[-1, 1].map((s) => c('black', [-3, s * 84], 0.6, 4.5, 0, [-3, s * 50])), // the ailerons' seams
    c('plane', [-82, -30], 5, 3.6, 1, [-82, 30]), c('plane', [-88, -30], 2.4, 6.5, 1, [-70, -30]), c('plane', [-88, 30], 2.4, 6.5, 1, [-70, 30]), // the tail and its two fins
    c('plane', [-84, 0], 7, 4, 1.5, [76, 0]), c('plane', [76, 0], 5, 4, 1.2, [86, 0]), c('metal', [-70, 0], 1, 6, 0, [40, 0]), // the fuselage, its nose, its spine
    c('plane', [-52, -15], 6.5, 6.5, 2.5, [-24, -15]), c('plane', [-52, 15], 6.5, 6.5, 2.5, [-24, 15]), // the engines, high on the back
    c('hole', [-23, -15], 4.4, 10), c('hole', [-23, 15], 4.4, 10), c('black', [-55, -15], 4, 9.5), c('black', [-55, 15], 4, 9.5), c('metal', [-36, -8], 1.2, 6, 0, [-36, 8]), // intakes, exhausts, the pylons
    c('lens', [54, 0], 5, 6.2, 1.5, [68, 0]), c('metal', [86, 0], 1.3, 4.6, 0, [93, 0]), // the canopy, the gun
  ]],
  /** A cruise missile coming in, 4 m long: white body, red nose, fins, its motor burning. */
  'missile-fly': [BIG, [
    c('fire', [-24, 0], 2.4, 5), c('flash', [-25, 0], 1.3, 6),
    c('metal', [-18, 0], 0.9, 3, 0, [-23, -6]), c('metal', [-18, 0], 0.9, 3, 0, [-23, 6]), c('metal', [2, 0], 0.7, 3, 0, [-2, -7]), c('metal', [2, 0], 0.7, 3, 0, [-2, 7]),
    c('snow', [-20, 0], 2.7, 3.5, 1.5, [14, 0]), c('cross', [17, 0], 2.2, 3.6, 1),
  ]],
  /** A napalm canister, 3.5 m long: a fat finless tank with a cap at the nose, tumbling as it falls. */
  'napalm-can': [BIG, [c('tank', [-14, 0], 5.2, 3, 2, [11, 0]), c('metal', [13, 0], 4, 3.4, 1.5), c('metal', [-14, 0], 3.4, 3.4, 1), ...[-6, 3].map((x) => c('black', [x, -5], 0.8, 3.6, 0, [x, 5]))]],
  /** A 155 mm shell, under a metre long. */
  shell: [SIZE, [c('brass', [-5, 0], 1.7, 2, 1, [2, 0]), c('metal', [2, 0], 1.6, 2.2, 1, [5, 0]), c('metal', [6, 0], 0.9, 2.4, 1)]],
  napalm: [SIZE, [c('tank', [-6, 0], 4, 2, 2, [5, 0]), c('metal', [-2, -4], 0.6, 4.4, 0, [-2, 4]), c('metal', [2, -4], 0.6, 4.4, 0, [2, 4]), c('fire', [9, 0], 2.2, 6), c('flash', [9.5, 0], 1, 7)]],
  smoke: [SIZE, [c('mask', [-6, 0], 3.2, 2, 2, [2, 0]), c('metal', [3.5, 0], 1.3, 3.5), c('smoke', [7, -3], 3, 4, 2), c('smoke', [9, 2.5], 2.4, 4, 2)]],
  artillery: [SIZE, [c('brass', [-9, 0], 2.6, 2, 1.5, [3, 0]), c('metal', [3, 0], 2.4, 2.2, 1.5, [8, 0]), c('metal', [9, 0], 1.4, 2.4, 1)]],
  flare: [SIZE, [c('cross', [-8, 0], 1.4, 2, 1, [3, 0]), c('fire', [6.5, 0], 2.6, 5), c('flash', [6.5, 0], 1.4, 6)]],
  puddle: [SIZE, [c('police', [-6, -2], 5, 0.5, 0.3, [4, -3]), c('police', [-2, 4], 5.5, 0.5, 0.3, [6, 3]), c('lens', [-3, -1], 1.6, 1, 0, [1, 0]), c('flash', [0, -1], 0.8, 2, 0, [3, 2]), c('flash', [3, 2], 0.8, 2, 0, [1, 5])]], // water with a spark in it
  // Skill web icons, one per kind of upgrade.
  'icon-damage': [SIZE, [c('brass', [-8, 7], 3.4, 3, 1.5, [0, -1]), c('copper', [0, -1], 3.4, 3.4, 1.5, [4, -5]), c('copper', [4, -5], 2.4, 3.6, 1.2, [7, -8]), c('black', [-9.5, 8.5], 3.4, 2.6, 0.5)]], // a bullet
  'icon-rate': [SIZE, [
    c('metal', [-5, -3], 2, 4, 1, [10, -3]), c('wood', [-4, -1], 2.2, 3.5, 1, [-7, 7]), c('metal', [-1, 0], 0.7, 3, 0, [0, 3]), // a pistol
    ...[-7, -3, 1].map((y) => c('brass', [-15, y], 0.8, 2, 0, [-10, y])), // going fast
  ]],
  'icon-range': [SIZE, [
    ...Array.from({ length: 16 }, (_, k) => c('red', [Math.cos((k * Math.PI) / 8) * 8.5, Math.sin((k * Math.PI) / 8) * 8.5], 1.3, 3, 0.5)), // the ring
    c('red', [0, -14], 1, 3, 0, [0, -5]), c('red', [0, 5], 1, 3, 0, [0, 14]), c('red', [-14, 0], 1, 3, 0, [-5, 0]), c('red', [5, 0], 1, 3, 0, [14, 0]), c('red', [0, 0], 1.2, 3),
  ]], // a crosshair
  'icon-hp': [SIZE, [c('red', [-3.8, -3], 4.2, 3, 2), c('red', [3.8, -3], 4.2, 3, 2), c('red', [-4.5, 0], 3, 3, 2, [0, 7]), c('red', [4.5, 0], 3, 3, 2, [0, 7]), c('red', [0, 1], 3.5, 3, 2)]], // a heart
  'icon-power': [SIZE, [c('brass', [5, -12], 2.2, 3, 1, [-3, 0]), c('brass', [-3, 0], 2.2, 3, 1, [4, 0]), c('brass', [4, 0], 2.2, 3, 1, [-5, 12])]], // a bolt
  'icon-blast': [SIZE, [
    ...Array.from({ length: 8 }, (_, k) => c('ember', [0, 0], 1.8, 2, 0.5, [Math.cos((k * Math.PI) / 4) * 12, Math.sin((k * Math.PI) / 4) * 12])),
    c('ember', [0, 0], 6, 2.5, 1), c('fire', [0, 0], 4.5, 4), c('flash', [0, 0], 2.4, 5),
  ]], // a burst
  'icon-burn': [SIZE, [c('ember', [0, 4], 6, 2, 2), c('ember', [-1, -3], 4, 2, 2, [1, -9]), c('fire', [0, 4], 4, 3), c('fire', [-0.5, -2], 2.6, 3, 0, [0.5, -7]), c('flash', [0, 5], 2, 4)]], // a flame
  'icon-pierce': [SIZE, [c('metal', [-3, -9], 1.6, 2, 0.5, [-3, 9]), c('metal', [4, -9], 1.6, 2, 0.5, [4, 9]), c('copper', [-13, 0], 2, 4, 1, [10, 0]), c('copper', [10, 0], 1.4, 4, 1, [13, 0])]], // through and through
  'icon-pellets': [SIZE, [c('red', [-12, 0], 3.2, 3, 1.5, [-4, 0]), c('brass', [-13, 0], 3.2, 3.2, 1), ...([[3, -6], [6, -1], [4, 4], [10, -5], [11, 2], [8, 8]] as const).map((p) => c('metal', p, 1.4, 3, 1))]], // a shell and its shot
  'icon-heal': [SIZE, [c('snow', [0, 0], 10, 2, 1.5), c('red', [0, -6], 2.4, 3, 0.5, [0, 6]), c('red', [-6, 0], 2.4, 3, 0.5, [6, 0])]], // a red cross
  'icon-repair': [SIZE, [c('metal', [-9, 9], 1.9, 3, 1, [3, -3]), c('metal', [5.5, -5.5], 4, 3, 1), c('hole', [8, -8], 2, 4)]], // a wrench
  'icon-leak': [SIZE, [c('navy', [0, -4], 8.5, 3, 2), c('navy', [-5.5, -1], 4, 3, 2, [0, 10]), c('navy', [5.5, -1], 4, 3, 2, [0, 10]), c('snow', [-4, -2], 1.3, 5.5, 0, [0, 2]), c('snow', [0, 2], 1.3, 5.5, 0, [4, -2])]], // a badge
  'icon-chips': [SIZE, [c('brass', [0, 0], 10, 3, 2), c('hivis', [0, 0], 6.5, 4.5, 1), c('flash', [0, 0], 2, 5.5), ...Array.from({ length: 8 }, (_, k) => c('hivis', [Math.cos((k * Math.PI) / 4) * 8.5, Math.sin((k * Math.PI) / 4) * 8.5], 1.1, 4.2))]], // a chip
  'icon-speed': [SIZE, [c('snow', [-11, -8], 1.9, 3, 1, [-2, 0]), c('snow', [-2, 0], 1.9, 3, 1, [-11, 8]), c('snow', [-1, -8], 1.9, 3, 1, [8, 0]), c('snow', [8, 0], 1.9, 3, 1, [-1, 8])]], // fast forward
  'icon-flag': [SIZE, [c('metal', [-7, 12], 1, 3, 0.5, [-7, -12]), c('red', [-6, -10], 2.4, 4, 1, [9, -7]), c('red', [-6, -4], 2.4, 4, 1, [9, -7]), c('red', [-6, -7], 2.4, 4, 1)]], // command
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
      const size = kind === 'machinegunner' ? BIG : SIZE; // a crew of two
      for (const [anim, fps, pose] of poses) out.push({ anim: `${kind}-${anim}-${d}`, fps, size, rgba: draw(soldier(kind, pose), size, angle, true) });
    }
  }
  // Zombies face east only and are turned freely in the game, which keeps a thousand of them cheap.
  for (const kind of Object.keys(zombieData) as ZombieKind[]) {
    const size = kind === 'brute' || kind === 'hordemother' ? BIG : SIZE;
    for (const s of [1, -1]) out.push({ anim: `${kind}-walk`, fps: kind === 'fast' ? 8 : 4, size, rgba: draw(ZOMBIE_LOOKS[kind](s), size, 0, false) });
  }
  for (const n of [0, 1]) out.push({ anim: 'plastic', fps: 0, size: SIZE, rgba: draw(roadblockPiece('plastic', n), SIZE, 0, true) });
  for (const kind of ['wood', 'sandbags', 'cement'] as const) out.push({ anim: kind, fps: 0, size: SIZE, rgba: draw(roadblockPiece(kind, 0), SIZE, 0, true) });
  for (const n of [0, 1]) out.push({ anim: 'police', fps: 0, size: SIZE, rgba: draw(roadblockPiece('police', n), SIZE, 0, true) });
  // Blood splats for the gore setting: a few shapes, drawn flat with no outline shadow.
  const splats: Part[][] = [
    [c('blood', [0, 0], 4, 0.2), c('blood', [5, 2], 2, 0.2), c('blood', [-4, 4], 1.5, 0.2), c('blood', [2, -5], 1.2, 0.2)],
    [c('blood', [-3, 0], 3, 0.2, 0, [3, 1]), c('blood', [7, -2], 1.6, 0.2), c('blood', [-7, 3], 1.2, 0.2)],
    [c('blood', [0, 0], 3, 0.2), c('blood', [3, 3], 2.5, 0.2), c('blood', [-5, -2], 1.8, 0.2), c('blood', [6, -4], 1, 0.2)],
  ];
  for (const parts of splats) out.push({ anim: 'splat', fps: 0, size: SIZE, rgba: draw(parts, SIZE, 0, false) });
  for (const [name, [size, parts]] of Object.entries(PROPS)) out.push({ anim: name, fps: 0, size, rgba: draw(parts, size, 0, true) });
  WRECKS.forEach((paint, k) => out.push({ anim: 'car', fps: 0, size: BIG, rgba: draw(wreck(paint, k), BIG, 0, true) })); // car/0, car/1, car/2
  // The people in the safe zones (east only, turned freely like zombies), and what they have there.
  CIVS.forEach((l, k) => { for (const s of [1, -1]) out.push({ anim: `civ${k}-walk`, fps: 4, size: SIZE, rgba: draw(civilian(l, s), SIZE, 0, true) }); });
  const still = (anim: string, size: number, parts: Part[]) => out.push({ anim, fps: 0, size, rgba: draw(parts, size, 0, true) });
  still('ferry', 304, ferry());
  for (const k of [0, 1, 2]) still('ship', 336, ship(k)); // ship/0 grey, ship/1 cargo, ship/2 liner
  still('schoolbus', BUS, schoolBus());
  still('armytruck', BUS, armyTruck());
  for (const m of ['helmet', 'vest', 'snow', 'navy']) still('tent', BIG, tent(m));
  still('campfire', SIZE, campfire());
  for (const m of ['navy', 'red', 'tube']) still('sleepbag', SIZE, sleepingBag(m));
  for (const m of ['navy', 'helmet']) still('toilet', SIZE, [...slab(m, -6, 6, 6, 7, 1.5), c('snow', [-2, -2], 1.4, 7.6), c('metal', [6, -4], 0.5, 7.2, 0, [6, 4])]); // a portable toilet, its vent, its door
  still('table', SIZE, [...slab('wood', -10, 10, 5.5, 4, 1), c('snow', [-6, -2], 1.5, 5.2), c('snow', [-3, 2], 1.5, 5.2), ...slab('red', 2, 7, 2.5, 5.6, 1, -1), c('brass', [8, 3], 1.2, 5)]); // cups, a box, a lamp
  still('crate', SIZE, [...slab('wood', -7, 7, 7, 4.5, 1), c('brown', [-7, -3], 0.5, 4.7, 0, [7, -3]), c('brown', [-7, 3], 0.5, 4.7, 0, [7, 3])]);
  still('crate', SIZE, [...slab('wood', -9, 3, 6, 4.5, 1, -3), ...slab('tube', -3, 9, 5, 6.5, 1, 4), c('brass', [3, 4], 0.6, 6.8, 0, [8, 4])]); // two stacked, the top one ammunition green
  for (const [paint, roof] of [['red', 'cream'], ['navy', 'snow'], ['snow', 'urban'], ['teal', 'snow']]) still('sedan', BIG, car(paint, roof));
  return out;
}
