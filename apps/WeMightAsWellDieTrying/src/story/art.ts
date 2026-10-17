// The story's pictures, drawn by code in the game's palette (through the drain): side-on dioramas in three parallax
// layers with small figures moving slowly on them, the radio close up, the notebook, the vehicles crossing between
// cities. Anything not drawn yet shows as a labelled box, so every scene plays before its art is done.
import { INK, Pen } from './draw.ts';
import { measure } from './font.ts';
import { story } from './record.ts';
import { notebookLine } from './text.ts';
import { profile } from '../meta/profile.ts';
import { CITIES, once } from './cities.ts';
import type { Shot } from './types.ts';
import { LOOKS, PH, PIC, W, bus, crowd, ease, ferry, glow, idle2, lamp, loop3, patrolCar, person, roll, since, sky, skyline, small, steam, truck, walk4, type Act, type Backdrop } from './kit.ts';

const BACKDROPS: Record<string, Backdrop> = {
  'street-night': {
    w: 400,
    layers: [
      (pen, w) => { sky(pen, w, ['#0b0d12', '#0e1117', 'navy0', '#1a1f2c']); skyline(pen, w, 78, '#11141a', 3, 46, 0.04); pen.rect(60, 18, 12, 14, '#11141a'); pen.rect(64, 32, 2, 10, '#11141a'); },
      (pen) => {
        // Shops along the street, upper windows mostly dark, awnings over the fronts; the school at the far end.
        for (let x = 0; x < 290; ) {
          const bw = 44 + Math.floor(roll(x, 9) * 30), top = 28 + Math.floor(roll(9, x) * 20);
          pen.rect(x, top, bw, 96 - top, roll(x) < 0.5 ? 'brown0' : 'urban0'); pen.rect(x, top, bw, 2, 'outline');
          for (let wy = top + 6; wy < 72; wy += 9) for (let wx = x + 4; wx < x + bw - 6; wx += 9) (roll(wx, wy) < 0.15 ? pen.lit.bind(pen) : pen.rect.bind(pen))(wx, wy, 5, 6, roll(wx, wy) < 0.15 ? '#7a6038' : 'navy0');
          pen.rect(x + 3, 80, bw - 6, 16, 'navy0'); pen.rect(x + 3, 80, bw - 6, 1, 'metal1');
          const aw = ['red0', 'teal0', 'khaki0', 'maroon0'][Math.floor(roll(x, 2) * 4)];
          for (let k = 0; k < bw - 2; k += 4) pen.rect(x + 1 + k, 75, 2, 4, aw);
          x += bw + 2;
        }
        pen.rect(292, 34, 108, 62, 'red0'); pen.rect(292, 34, 108, 3, 'outline'); pen.rect(340, 22, 14, 14, 'red0'); pen.rect(344, 25, 6, 6, 'snow1'); // the school, its clock
        for (let wy = 42; wy < 80; wy += 10) for (let wx = 298; wx < 396; wx += 10) pen.rect(wx, wy, 6, 6, wy < 60 && wx > 330 ? '#5a4a30' : 'navy0');
        for (let k = 0; k < 3; k++) { pen.rect(300 + k * 32, 84, 28, 12, 'hivis1'); pen.rect(300 + k * 32, 84, 28, 1, 'hivis2'); pen.lit(298 + k * 32, 92, 2, 2, 'flash1'); glow(pen, 294 + k * 32, 93, 7, '#eadfae', 0.45); }
        for (const lx of [40, 140, 240]) lamp(pen, lx, 50, 96);
      },
      (pen, w) => {
        pen.rect(0, 96, w, 8, 'pave0'); for (let x = 0; x < w; x += 12) pen.rect(x, 96, 1, 8, 'pave1');
        pen.rect(0, 104, w, 1, 'snow0'); pen.rect(0, 105, w, 31, 'asphalt0');
        for (let k = 0; k < 160; k++) pen.px(Math.floor(roll(k, 1) * w), 106 + Math.floor(roll(k, 2) * 30), 'asphalt1');
        for (const lx of [40, 140, 240]) for (let y = 108; y < 134; y += 3) pen.lit(lx + 1 + ((y >> 2) & 1), y, 2, 1, '#4a4030'); // the lamps in the wet road
        for (const [px, pw] of [[96, 26], [180, 34], [270, 22]]) pen.rect(px, 120, pw, 3, 'navy1');
      },
    ],
    depth: [0.3, 0.7, 1],
  },
  'school-lot': {
    w: 320,
    layers: [
      (pen, w) => { sky(pen, w, ['#0b0d12', '#0e1117', 'navy0'], 40); skyline(pen, w, 40, '#11141a', 11, 14, 0.02); },
      (pen) => {
        pen.rect(16, 18, 288, 62, 'red0'); pen.rect(16, 18, 288, 3, 'outline'); pen.rect(16, 21, 288, 1, 'red1');
        for (let y = 24; y < 80; y += 3) for (let x = 16 + ((y / 3) & 1) * 4; x < 304; x += 8) pen.px(x, y, 'maroon0');
        for (let wy = 26; wy < 70; wy += 14) for (let wx = 24; wx < 300; wx += 14) { if (wx > 140 && wx < 180 && wy > 40) continue; const on = roll(wx, wy) < 0.25; (on ? pen.lit.bind(pen) : pen.rect.bind(pen))(wx, wy, 8, 9, on ? '#6a5634' : 'navy0'); pen.rect(wx, wy + 9, 8, 1, 'snow0'); }
        pen.rect(146, 50, 28, 30, 'outline'); pen.rect(150, 54, 9, 26, 'navy1'); pen.rect(161, 54, 9, 26, 'navy1'); pen.lit(158, 44, 4, 2, 'flash1'); glow(pen, 160, 45, 12, '#eadfae', 0.4);
        pen.rect(30, 0, 1, 80, 'metal1'); pen.rect(31, 2, 9, 6, 'navy1'); pen.rect(31, 5, 9, 1, 'red1');
      },
      (pen, w) => { pen.rect(0, 80, w, 56, 'asphalt0'); for (let x = 6; x < w; x += 26) pen.rect(x, 126, 1, 10, 'pave1'); pen.rect(0, 80, w, 1, 'snow0'); for (let k = 0; k < 120; k++) pen.px(Math.floor(roll(k, 7) * w), 82 + Math.floor(roll(k, 8) * 54), 'asphalt1'); },
    ],
    depth: [0.3, 0.7, 1],
  },
  'chicago-pier': {
    w: 480,
    layers: [
      (pen, w) => {
        sky(pen, w, ['urban1', 'urban2', '#8d8f88', 'snow0'], 62);
        skyline(pen, w, 62, 'urban0', 21, 34, 0.02);
        pen.rect(0, 62, w, 20, 'teal0'); for (let k = 0; k < 90; k++) pen.rect(Math.floor(roll(k, 3) * w), 63 + Math.floor(roll(k, 4) * 18), 4, 1, 'teal1');
        pen.rect(250, 68, 230, 2, 'pave0'); pen.rect(440, 62, 3, 6, 'snow1'); // the breakwater and its light
      },
      (pen, w) => {
        // The elevated line across the sky: a girder on legs, one car stalled on it with its doors open.
        pen.rect(0, 20, w, 6, 'metal0'); pen.rect(0, 20, w, 1, 'metal1');
        for (let x = 0; x < w; x += 6) { pen.px(x, 22, 'metal1'); pen.px(x + 3, 24, 'metal1'); }
        for (let x = 20; x < w; x += 64) pen.rect(x, 26, 3, 56, 'metal0');
        pen.rect(150, 10, 64, 10, 'metal1'); pen.rect(150, 10, 64, 1, 'metal2');
        for (let k = 0; k < 6; k++) pen.rect(154 + k * 10, 12, 6, 4, k === 2 || k === 3 ? 'outline' : 'navy1');
      },
      (pen, w) => {
        pen.rect(0, 80, w, 56, 'brown1'); pen.rect(0, 80, w, 2, 'brown0');
        for (let y = 85; y < 136; y += 5) pen.rect(0, y, w, 1, 'brown0');
        for (let x = 8; x < 340; x += 30) { pen.rect(x, 78, 4, 4, 'outline'); pen.rect(x + 1, 78, 2, 1, 'metal1'); } // bollards
        pen.rect(340, 82, w - 340, 54, 'pave0'); for (let x = 344; x < w; x += 10) pen.rect(x, 82, 1, 54, 'pave1'); // the quay
      },
    ],
    depth: [0.3, 0.6, 1],
  },
};

const layerCache = new Map<string, HTMLCanvasElement>();
function layer(id: string, k: number, stage: number) {
  const key = `${id}|${k}|${stage}`;
  let c = layerCache.get(key);
  if (!c) {
    const b = BACKDROPS[id];
    c = document.createElement('canvas');
    c.width = b.w;
    c.height = b.h ?? PH;
    const pen = new Pen(c.getContext('2d')!);
    pen.stage = stage;
    b.layers[k](pen, b.w);
    layerCache.set(key, c);
  }
  return c;
}

// ---- Who does what in each diorama: `${scene}#${shot}` → drawn over the layers, in world pixels ----
type Actors = (a: Act, pen: Pen, cx: number, cy: number) => void;
/** Where each diorama's camera rests (its left edge in the front layer), and where a zoom closes on. */
const HOME: Record<string, { cx: number; cy?: number; focus?: [number, number] }> = {
  'opening#1': { cx: 0 },
  'before:chicago#1': { cx: 100 },
  'after:chicago#1': { cx: 0, focus: [150, 70] },
  'after:chicago#3': { cx: 150 },
};
const ACTORS: Record<string, Actors> = {
  // Pike on the patrol car's bonnet: sits, stands, sits again. The light bar colours the puddles.
  'opening#1': (a, pen, cx) => {
    const x = 70 - cx, f = patrolCar(pen, x, 100, a.t);
    for (const [px, pw] of [[96, 26], [180, 34]]) if (f < 2) pen.dither(px - cx, 120, pw, 3, 0.5, f ? '#3050d0' : '#d04030');
    const up = a.t % 4 > 2.6 && a.t % 4 < 3.6;
    person(pen, x + 36, up ? 93 : 89, LOOKS.pike, { sit: !up, frame: idle2(a.t), face: -1, capInHand: false });
  },
  // A long line at the buses; Reyes walks along it, cap in hand, Pike two steps behind; Dunne leans on a bus.
  'opening#3': (a, pen) => {
    for (let k = 0; k < 4; k++) bus(pen, 8 + k * 78, 78, a.t, 1, true);
    for (let k = 0; k < 44; k++) small(pen, 6 + k * 7 + Math.floor(roll(k) * 3), 102 + Math.floor(roll(k, 1) * 3), k, { frame: idle2(a.t, roll(k, 2)), child: roll(k, 4) < 0.15 });
    const stop = Math.floor(a.t / 2.5) % 2 === 1, walked = Math.min(150, 40 + (a.still ? 0 : a.t * 9 - (stop ? 0 : 0)));
    person(pen, walked, 112, LOOKS.reyes, { walk: !stop, frame: walk4(a.t), capInHand: true, posture: a.row.posture });
    person(pen, walked - 22, 112, LOOKS.pike, { walk: !stop, frame: walk4(a.t, 2) });
    person(pen, 252, 104, LOOKS.dunne, { posture: 4, face: -1, shrug: a.line === 2 && idle2(a.t) === 1 });
  },
  // Fourteen buses pull away one after another, off to the left. The crowd waves. Reyes stands still.
  'after:main-street#1': (a, pen) => {
    for (let k = 13; k >= 0; k--) { const x = 8 + k * 78 - 70 * Math.max(0, a.t - 0.4 * k) ** 1.15; if (x > -72 && x < W) bus(pen, x, 78, a.t, -1, true); }
    for (let k = 0; k < 40; k++) small(pen, 4 + k * 8, 104 + Math.floor(roll(k, 1) * 3), k + 50, { frame: idle2(a.t, roll(k, 2)), arm: roll(k, 3) < 0.6, child: roll(k, 4) < 0.15 });
    person(pen, 154, 114, LOOKS.reyes, { posture: a.row.posture });
    person(pen, 132, 114, LOOKS.pike, { frame: idle2(a.t) });
  },
  // Grey dawn: three ferries tied up, smoking; the crowd on the pier; the squad off the truck to the harbor master.
  'before:chicago#1': (a, pen, cx) => {
    for (const fx of [30, 120, 210]) ferry(pen, fx - cx, 80, 1, a.t + fx);
    crowd(pen, 10 - cx, 86, 322, 36, a.t, 7);
    person(pen, 300 - cx, 108, LOOKS.harbor, { face: 1, frame: idle2(a.t) });
    truck(pen, 400 - cx, 102, false);
    ['reyes', 'pike', 'dunne', 'hollis', 'okoye', 'vega'].forEach((m, k) => {
      const go = Math.max(0, a.t - 0.8 * k), x = 404 - Math.min(64, go * 10) + k * 12;
      if (go > 0) person(pen, x - cx, 110, LOOKS[m], { walk: go * 10 < 64, frame: walk4(a.t, k), face: -1, posture: m === 'reyes' ? a.row.posture : 1 });
    });
  },
  // Noon. The first ferry fills and lists, the whistle, the gate; it pulls away. The other two stop off the breakwater.
  'after:chicago#1': (a, pen, cx) => {
    const t = a.t, list = Math.min(0.06, t * 0.012), away = Math.max(0, t - 4.5), cast = Math.max(0, t - 3.5);
    crowd(pen, 10 - cx, 86, 322, 36, t, 7);
    once(a, 'whistle', 2, () => a.sound('horn')); // the harbor master's whistle
    [120, 210].forEach((fx, k) => { const s = Math.max(0.05, 1 - cast * 0.18), x = fx + cast * (60 + k * 30); ferry(pen, Math.min(x, 330 + k * 40) - cx, 80 - Math.min(14, cast * 3), cast > 4.5 ? 0.05 : s, t + fx); });
    pen.c.save();
    pen.c.translate(65 - cx + away * 20, 80 - Math.min(16, away * 3));
    pen.c.rotate(list);
    ferry(pen, -35, 0, Math.max(0.05, 1 - away * 0.2), t);
    pen.c.restore();
    person(pen, 300 - cx, 108, LOOKS.harbor, { arm: t > 2 && t < 4 ? 'out' : 'down' });
    if (t > 2 && t < 4) steam(pen, 312 - cx, 104, t, 3, '#dcddd3', 1.4); // the whistle's steam
    const shut = Math.min(1, Math.max(0, (t - 3) / 1));
    for (let k = 0; k < 6; k++) pen.rect(334 - cx - Math.floor((1 - shut) * k * 4), 92, 1, 30, 'metal0');
    pen.rect(332 - cx, 90, 2, 34, 'outline');
  },
  // The nine stay. A child holds Pike's sleeve. Hollis stops at the gate, takes his cap off, and goes into the crowd.
  'after:chicago#3': (a, pen, cx) => {
    const t = a.t;
    crowd(pen, 10 - cx, 86, 322, 36, t, 7, t > 1.5 ? [262 - cx, 96 + idle2(t)] : undefined);
    // The rubber boat Nora sent, putting out toward the ferries with two aboard, its wake behind it.
    const bx = 196 + t * 7 - cx;
    pen.rect(bx, 76, 13, 3, 'metal1'); pen.rect(bx, 76, 13, 1, 'metal2'); pen.rect(bx - 2, 77, 2, 2, 'outline');
    for (const hx of [4, 8]) { pen.rect(bx + hx, 73, 2, 3, 'hivis1'); pen.rect(bx + hx, 72, 2, 1, 'skin1'); }
    for (let k = 1; k < 5; k++) if ((Math.floor(t * 4) + k) % 2) pen.px(bx - 2 - k * 3, 78 + (k & 1), 'snow1');
    pen.rect(332 - cx, 90, 2, 34, 'outline'); for (let k = 0; k < 6; k++) pen.rect(334 - cx + k * 4, 92, 1, 30, 'metal0');
    for (let k = 0; k < 9; k++) small(pen, 418 + (k % 5) * 10 - cx, 108 + Math.floor(k / 5) * 8, 300 + k, { frame: idle2(t, roll(k)), child: k === 6 || k === 7 });
    person(pen, 376 - cx, 112, LOOKS.reyes, { face: -1, posture: a.row.posture });
    person(pen, 396 - cx, 112, LOOKS.pike, { face: -1, frame: idle2(t) });
    small(pen, 408 - cx, 124, 77, { child: true, arm: idle2(t) === 1, frame: idle2(t) }); // holding Pike's sleeve
    person(pen, 410 - cx, 112, LOOKS.dunne, { face: -1 });
    person(pen, 424 - cx, 112, LOOKS.okoye, { face: -1 });
    person(pen, 438 - cx, 112, LOOKS.vega, { face: -1 });
    // Hollis: at the gate, his cap off, then in among them once it is said.
    const go = since(a), hx = 344 - Math.min(60, go * 10);
    if (hx > 290) {
      person(pen, hx - cx, 112, LOOKS.hollis, { face: -1, capInHand: t > 1, walk: go > 0 && hx > 284, frame: walk4(t) });
      if (hx < 330) pen.dither(hx - cx - 1, 110, 14, 22, (330 - hx) / 40, '#5f4431');
    }
  },
};

// Every other city's backdrops and actors (cities.ts).
Object.assign(BACKDROPS, CITIES.backdrops);
Object.assign(ACTORS, CITIES.actors);
Object.assign(HOME, CITIES.home);

/** The camera across a diorama: drifting a pixel every 0.3 s from where it rests, or holding. */
function camX(a: Act, b: Backdrop, home: number) {
  const room = b.w - W, steps = a.still || a.shot.camera === 'hold' || a.shot.camera === 'pull-back' || a.shot.camera === 'push-in' ? 0 : Math.floor(a.t / 0.3);
  const x = a.shot.camera === 'drift-left' ? home - steps : home + steps;
  return Math.max(0, Math.min(room, x));
}

let world: HTMLCanvasElement | undefined;
export function diorama(a: Act) {
  const id = a.shot.backdrop!, b = BACKDROPS[id], key = `${a.sceneId}#${a.k}`;
  if (!b) return placeholder(a.pen, id, a.shot.beats);
  world ??= Object.assign(document.createElement('canvas'), { width: W, height: PH });
  const wc = world.getContext('2d')!, pen = new Pen(wc), home = HOME[key] ?? { cx: 0 }, cx = camX(a, b, home.cx), room = (b.h ?? PH) - PH;
  // Up and down a tall backdrop: tilting up from its foot, or resting where the shot says (its foot by default).
  const cy = Math.round(a.shot.camera === 'tilt-up' ? room * (1 - (a.still ? 0 : ease(a.p))) : Math.min(room, home.cy ?? room));
  pen.stage = a.pen.stage;
  wc.imageSmoothingEnabled = false;
  wc.clearRect(0, 0, W, PH);
  b.layers.forEach((_, k) => wc.drawImage(layer(id, k, pen.stage), -Math.round(cx * (b.depth?.[k] ?? 1)), -Math.round(cy * (k ? 1 : 0.5))));
  ACTORS[key]?.(a, pen, cx, cy);
  // Into the picture: whole, or closing in or pulling back on its focus.
  const c = a.pen.c, cam = a.shot.camera;
  c.imageSmoothingEnabled = false;
  if ((cam === 'pull-back' || cam === 'push-in') && !a.still) {
    const z = cam === 'pull-back' ? 1.6 - 0.6 * ease(a.p) : 1 + 0.6 * ease(a.p), [fx, fy] = home.focus ?? [W / 2, PH / 2];
    const w = W / z, h = PH / z, sx = Math.round(Math.max(0, Math.min(W - w, fx - w / 2))), sy = Math.round(Math.max(0, Math.min(PH - h, fy - h / 2)));
    c.drawImage(world, sx, sy, w, h, 0, PIC, W, PH);
  } else c.drawImage(world, 0, PIC);
}

/** The radio close up, mounted under the dashboard: a bevelled set, its frequency glowing, a signal meter that moves
 *  while someone is talking, the LED blinking once a second (stuttering when the signal fails); the mic on its coiled
 *  cord, on its hook, or in the Opening lifted off it by Reyes's hand. */
export function closeup(a: Act) {
  const pen = a.pen, obj = a.shot.object;
  // The dashboard: dark vinyl, its grain, the lip of the dash over the set.
  pen.rect(0, PIC, W, PH, '#121315');
  for (let k = 0; k < 140; k++) pen.px(Math.floor(roll(k, 41) * W), PIC + Math.floor(roll(k, 42) * PH), '#17191c');
  pen.rect(0, PIC, W, 26, '#0c0d0e'); pen.rect(0, PIC + 26, W, 2, '#1d1f22'); pen.rect(0, PIC + 28, W, 1, 'outline');
  if (obj !== 'radio') return placeholder(pen, obj ?? 'closeup', a.shot.beats);
  const x = 116, y = PIC + 46, w = 96, h = 46, talking = !a.said, bad = !!a.shot.dropout;
  // The set: shadow, bevel (lit from above), face, a screw in each corner.
  pen.rect(x + 2, y + h, w, 3, '#08090a');
  pen.rect(x - 1, y - 1, w + 2, h + 2, 'outline');
  pen.rect(x, y, w, h, 'metal1'); pen.rect(x + 1, y + 1, w - 2, h - 2, 'metal0'); pen.rect(x, y, w, 1, 'metal2'); pen.rect(x, y, 1, h, 'metal2');
  for (const [sx, sy] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) { pen.rect(x + sx, y + sy, 2, 2, 'metal2'); pen.px(x + sx, y + sy + 1, 'outline'); }
  // The display: the channel's frequency glowing, a signal meter beside it.
  pen.rect(x + 7, y + 6, 50, 15, 'outline'); pen.rect(x + 8, y + 7, 48, 13, '#0b1513');
  pen.dither(x + 8, y + 7, 48, 13, 0.12, '#4a7e77');
  pen.text('154.650', x + 11, y + 10, '#78c0b4', 'jec');
  const level = talking ? (bad && Math.random() < 0.3 ? 0 : 2 + Math.floor((Math.sin(a.t * 17) + Math.sin(a.t * 7.3)) * 1.5 + 2)) : 0;
  for (let k = 0; k < 6; k++) pen.lit(x + 60 + k * 3, y + 18 - k * 2, 2, 2 + k * 2, k < level ? '#78c0b4' : '#1a2826');
  // The LED, top right: once a second, stuttering on a bad signal; its glow.
  const on = bad ? Math.random() < 0.55 : Math.floor(a.t) % 2 === 0;
  pen.rect(x + w - 10, y + 6, 4, 4, 'outline');
  if (on) { glow(pen, x + w - 8, y + 8, 6, '#d03a2c', 0.5); pen.led(x + w - 9, y + 7, 2, 2, '#ff5040'); } else pen.rect(x + w - 9, y + 7, 2, 2, 'maroon0');
  // Preset buttons, two knobs with their marks, the speaker's holes.
  for (let k = 0; k < 6; k++) { pen.rect(x + 8 + k * 8, y + 26, 6, 4, 'metal1'); pen.rect(x + 8 + k * 8, y + 26, 6, 1, 'metal2'); }
  for (const [kx, turn] of [[16, 0.6], [40, -0.9]] as const) {
    pen.rect(x + kx - 5, y + 33, 10, 10, 'outline'); pen.rect(x + kx - 4, y + 34, 8, 8, 'metal1'); pen.rect(x + kx - 4, y + 34, 8, 1, 'metal2');
    pen.px(x + kx + Math.round(Math.cos(turn - Math.PI / 2) * 3), y + 38 + Math.round(Math.sin(turn - Math.PI / 2) * 3), 'snow1');
  }
  for (let sy = 0; sy < 5; sy++) for (let sx = 0; sx < 8; sx++) pen.px(x + 60 + sx * 4 + (sy & 1) * 2, y + 27 + sy * 3, 'outline');
  // The hook on the set's left side, and the mic: on it, or lifted off by Reyes's hand.
  pen.rect(x - 6, y + 8, 6, 3, 'metal1'); pen.rect(x - 6, y + 8, 1, 6, 'metal1');
  const lift = a.sceneId === 'opening' ? ease(Math.min(1, (a.t - 0.5) / 3)) : 0;
  const mx = Math.round(x - 18 - lift * 30), my = Math.round(y + 2 - lift * 30 + (lift > 0.99 ? idle2(a.t) : 0));
  // The coiled cord, from under the set to the foot of the mic: loops along the way.
  const fx = x + 4, fy = y + h + 1, tx = mx + 6, ty = my + 22;
  for (let k = 0; k <= 22; k++) {
    const q = k / 22, cx = fx + (tx - fx) * q - Math.sin(q * Math.PI) * 14, cy = fy + (ty - fy) * q + Math.sin(q * Math.PI) * 10;
    pen.rect(cx, cy, 3, 3, 'outline'); pen.rect(cx, cy, 2, 2, 'metal1'); pen.px(cx + (k & 1), cy, 'metal2');
  }
  pen.rect(mx, my, 13, 22, 'outline'); pen.rect(mx + 1, my + 1, 11, 20, 'metal0'); pen.rect(mx + 1, my + 1, 11, 1, 'metal1'); pen.rect(mx + 1, my + 1, 1, 20, 'metal1');
  for (let k = 0; k < 4; k++) pen.rect(mx + 3, my + 4 + k * 3, 7, 1, 'outline');
  pen.rect(mx + 12, my + 7, 2, 6, 'metal1'); // the talk switch
  if (lift > 0) {
    // Reyes's hand round the mic, his sleeve and cuff coming in from the bottom left.
    pen.rect(mx - 3, my + 9, 8, 10, 'skin1'); pen.rect(mx - 3, my + 9, 8, 2, 'skin2'); for (let k = 0; k < 3; k++) pen.rect(mx + 5, my + 10 + k * 3, 3, 2, 'skin1');
    pen.rect(mx - 3, my + 18, 2, 1, 'skin0');
    for (let k = 0; k < 40; k++) pen.rect(mx - 6 - k, my + 16 + Math.round(k * 0.7), 6, 10, k < 3 ? 'navy2' : 'navy1');
    pen.rect(mx - 9, my + 15, 7, 3, 'navy0');
  } else pen.rect(x - 6, y + 8, 6, 3, 'metal2');
  // Rome, 02:55: Reyes from behind at the bottom of the picture, his shoulders rising a pixel in relief.
  if (a.sceneId === 'after:rome') {
    const up = a.t > 2.4 ? 1 : 0, cx = 62, top = PIC + PH - 44 - up, dark = '#08090a', rim = '#1d2026';
    // Rows from the crown of his cap down: the cap and its band, the back of his head, the neck, the shoulders sloping out.
    const rows = [16, 22, 26, 26, 20, 22, 22, 22, 21, 20, 18, 16, 14, 14, 24, 40, 52, 66, 76, 84, 88, 90, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92, 92];
    rows.forEach((w, k) => { const y = top + k; if (y >= PIC + PH) return; pen.rect(cx - w / 2, y, w, 1, k < 4 ? 'navy0' : dark); if (k === 3) pen.rect(cx - w / 2, y, w, 1, 'outline'); });
    pen.rect(cx - 6, top, 12, 1, rim); for (let k = 12; k < 20; k++) { const w = rows[k]; pen.px(cx - w / 2, top + k, rim); pen.px(cx + w / 2 - 1, top + k, rim); } // light along his outline
  }
}

/** The notebook: a page of it, the pencil writing at 8 strokes a second. New York's pencil hovers before its number;
 *  London's page done, he turns back to Tokyo's and adds a question mark; the last page closes the notebook. */
export function notebook(a: Act, instant: boolean) {
  const pen = a.pen, x0 = 44, y0 = PIC + 6, ink = '#4a4d52';
  pen.rect(0, PIC, W, PH, '#141414');
  let strokes = instant ? Infinity : Math.max(0, Math.floor((a.t - 0.6) * 8));
  // London: its own page, then (a second after it is written) Tokyo's again, a question mark added.
  const page = a.shot.page!, edit = a.shot.edit, ownLength = pageLength(page);
  if (page === 'new-york' && !instant) { const at = notebookLine(story.maps.find((m) => m.id === page)!).indexOf('got ') + 4 + 5; if (strokes > at) strokes = Math.max(at, strokes - 16); } // two seconds' hover
  pen.rect(x0, y0, 232, 124, '#d8d2bf'); pen.rect(x0, y0, 232, 1, '#efe9d6');
  for (let y = y0 + 22; y < y0 + 124; y += 11) pen.rect(x0, y, 232, 1, '#b9bcc4');
  pen.rect(x0 + 24, y0, 1, 124, '#c45a48');
  for (let k = 0; k < 18; k++) { pen.rect(x0 + 6 + k * 13, y0 - 3, 4, 6, 'metal1'); pen.rect(x0 + 7 + k * 13, y0 - 2, 2, 4, 'outline'); }
  blood(pen, x0, y0, page);
  let used = 0, px = 0, py = 0;
  /** Writes a line in pencil as far as the strokes have got; returns whether all of it is written. */
  const write = (text: string, x: number, y: number) => {
    const n = Math.max(0, Math.min(text.length, strokes - used));
    pen.text(text, x, y, ink, 'person', n);
    if (n > 0) { px = x + measure(text.slice(0, n), 'person') + 1; py = y; }
    used += text.length;
    return n === text.length;
  };
  if (page === 'names') {
    ['Hollis.', 'Okoye.', 'Pike.', 'Vega.', 'Dunne.', 'Reyes.'].forEach((n, k) => write(n, x0 + 32, y0 + 13 + k * 11));
  } else {
    // Every city so far, a line each: the ones before already written (with any mark added since), this one in pencil
    // now, its note under it. London's page done, the pencil goes back up to Tokyo's line and adds a question mark.
    const k = story.maps.findIndex((m) => m.id === page), row = story.maps[k];
    const marks = new Map<string, string>(); // marks added to earlier lines by pages before this one
    for (const sc of story.scenes) for (const s of sc.shots) if (s.edit && s.page && story.maps.findIndex((m) => m.id === s.page) < k) marks.set(s.edit.page, s.edit.add);
    const done = new Map<string, number>(); // where each line ends, for a mark added after it
    const line = (r: typeof row, y: number, live: boolean) => {
      const text = notebookLine(r), x = x0 + 32, put = (t: string, tx: number) => (live ? write(t, tx, y) : (pen.text(t, tx, y, ink), true));
      if (r.got === null) { // Rome: "got" written, crossed out, "alive?" after it
        const head = text.slice(0, text.lastIndexOf(' got') + 4);
        if (put(head, x)) { const gx = x + measure(head.slice(0, -3), 'person') + 1; pen.rect(gx, y + 3, measure('got', 'person') + 1, 1, ink); put(r.gotLabel!, gx + measure('got', 'person') + 5); }
        done.set(r.id, x + measure(head, 'person') + measure(r.gotLabel!, 'person') + 5);
      } else {
        const all = put(text, x);
        if (r.id === 'main-street' && (all || !live)) { const gx = x + measure(text.slice(0, text.indexOf('212')), 'person'); pen.rect(gx, y + 8, 14, 1, ink); pen.rect(gx, y + 10, 14, 1, ink); }
        done.set(r.id, x + measure(text, 'person') + 3);
      }
      if (!live && marks.has(r.id)) pen.text(marks.get(r.id)!, done.get(r.id)!, y, ink);
    };
    write(`Day ${row.day}`, x0 + 184, y0 + 2);
    story.maps.slice(0, k).forEach((r, j) => line(r, y0 + 13 + j * 11, false));
    const y = y0 + 13 + k * 11;
    line(row, y, true);
    if (row.note && row.note !== 'names') write(row.note, x0 + 40, y + 11);
    if (edit && !instant ? strokes > ownLength + 8 : !!edit) { const j = story.maps.findIndex((m) => m.id === edit!.page); write(edit!.add, done.get(edit!.page)!, y0 + 13 + j * 11); }
  }
  if (!instant && strokes < used) { pen.rect(px, py - 6, 2, 8, 'hivis2'); pen.rect(px, py + 2, 2, 1, 'khaki2'); pen.px(px, py + 3, 'outline'); } // the pencil
  // The last page: he reads it, and the cover comes down over it in two frames.
  if (page === 'names' && !instant && a.p > 0.86) { const half = a.p < 0.9; pen.rect(half ? x0 + 116 : x0 - 2, y0 - 4, half ? 118 : 236, 130, 'navy1'); pen.rect(half ? x0 + 116 : x0 - 2, y0 - 4, 2, 130, 'navy0'); }
}
/** The page's blood, more each city (the names page most): dried drops and splashes, a smear where a hand dragged,
 *  a thumbprint, a stain soaked in from the corner. The same every time for the same page; less with Gore on Some, none
 *  with it off. Blood keeps its colour as the rest drains. */
function blood(pen: Pen, x0: number, y0: number, page: string) {
  const gore = profile.settings.gore, k = page === 'names' ? story.maps.length : story.maps.findIndex((m) => m.id === page) + 1;
  const level = gore === 'none' ? 0 : gore === 'some' ? Math.ceil(k / 2) : k, seed = [...page].reduce((n, c) => n * 31 + c.charCodeAt(0), 7);
  if (!level) return;
  const r = (n: number, m = 0) => roll(seed + n * 97, m), fresh = '#6e332d', dried = '#4a2321', dark = '#3a1a18';
  const at = (n: number) => [x0 + 30 + Math.floor(r(n, 1) * 196), y0 + 8 + Math.floor(r(n, 2) * 108)];
  // A stain soaked in from a corner, on the last pages.
  if (level >= 7) for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) if (Math.hypot(x, y * 1.4) < 34 + r(x, y) * 10 && r(x * 3, y) < 0.85) pen.led(x0 + 232 - 1 - x, y0 + 124 - 1 - y, 1, 1, (x + y) % 7 ? dried : dark);
  // A smear: a hand dragged across, thinning as it goes.
  for (let s = 0; s < Math.floor(level / 2); s++) {
    const [sx, sy] = at(40 + s), dir = r(s, 9) < 0.5 ? 1 : -1, len = 30 + r(s, 8) * 40;
    for (let i = 0; i < len; i++) for (let w = 0; w < 4; w++) if (r(i * 5 + w, s) < 0.9 - i / len) pen.led(sx + i * dir, sy + w + Math.round(Math.sin(i / 9) * 2), 1, 1, i < 6 ? fresh : dried);
  }
  // Drops and splashes, with droplets thrown round them.
  for (let s = 0; s < level * 2; s++) {
    const [cx, cy] = at(s), rad = 1 + Math.floor(r(s, 3) * (2 + level / 2)), col = r(s, 4) < 0.5 ? fresh : dried;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (Math.hypot(dx, dy) <= rad * (0.75 + r(dx * 13 + s, dy) * 0.4)) pen.led(cx + dx, cy + dy, 1, 1, col);
    for (let d = 0; d < 2 + rad; d++) { const a = r(s, 20 + d) * 6.28, dist = rad + 2 + r(s, 30 + d) * rad * 2; pen.led(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 1, 1, col); }
  }
  // A thumbprint: rings of a whorl, broken.
  if (level >= 4) {
    const [fx, fy] = at(77);
    for (let ring = 2; ring < 7; ring += 1.5) for (let a = 0; a < 6.28; a += 0.25) if (r(Math.floor(a * 10), ring * 10) < 0.7) pen.led(fx + Math.cos(a) * ring, fy + Math.sin(a) * ring * 1.3, 1, 1, dried);
  }
}

/** How long a notebook shot needs: the page written at 8 strokes a second after a beat, New York's pencil hovering,
 *  London's turn back to Tokyo's page, and a moment to read it. A shot is never cut off mid-page. */
export function notebookMs(s: Shot) {
  const strokes = pageLength(s.page!) + (s.page === 'new-york' ? 16 : 0) + (s.edit ? 8 + 10 + s.edit.add.length : 0);
  return 600 + strokes * 125 + 1600;
}

/** Strokes a page takes to write. */
function pageLength(page: string) {
  if (page === 'names') return 'Hollis.Okoye.Pike.Vega.Dunne.Reyes.'.length;
  const row = story.maps.find((m) => m.id === page)!;
  return `Day ${row.day}`.length + notebookLine(row).length + (row.got === null ? row.gotLabel!.length : 0) + (row.note && row.note !== 'names' ? row.note.length : 0);
}

/** Between cities: the day counting up while a vehicle crosses the bottom of the screen against the sky. */
export function travel(a: Act) {
  const pen = a.pen, s = a.shot;
  const SKY: Record<string, string[]> = { night: ['#07080b', '#0b0d12', 'navy0'], dawn: ['urban0', 'maroon1', 'khaki0'], grey: ['urban1', 'urban2', 'snow0'], pink: ['maroon1', 'maroon2', 'skin1'], noon: ['khaki1', 'khaki2', 'desert2'], dark: ['#050506', '#08090a', '#0b0c0e'] };
  sky(pen, W, SKY[s.sky ?? 'night'] ?? SKY.night, PH);
  pen.c.save(); pen.c.translate(0, PIC); // into the picture
  pen.rect(0, 112, W, 24, s.sky === 'night' || s.sky === 'dark' ? '#050506' : 'urban0');
  const x = -110 + (W + 140) * Math.min(1, a.p), dark = '#0a0b0c';
  if (s.vehicle === 'army-truck') truck(pen, x, 92, true, dark);
  else if (s.vehicle === 'freight-train') {
    pen.rect(x - 70, 98, 60, 14, dark); pen.rect(x - 60, 90, 20, 8, dark); pen.rect(x - 6, 104, 74, 4, dark); // the engine, a flatcar
    for (let k = 0; k < 9; k++) { pen.rect(x + 2 + k * 7, 99, 4, 5, dark); pen.rect(x + 3 + k * 7, 96, 2, 3, dark); }
    pen.rect(x - 150, 96, 74, 16, dark);
    for (let k = 0; k < 12; k++) pen.rect(x - 146 + k * 18, 110, 5, 4, dark);
  } else if (s.vehicle === 'cargo-plane') {
    const y = 40;
    pen.rect(x, y, 80, 8, dark); pen.rect(x + 78, y + 2, 6, 4, dark); pen.rect(x, y - 8, 10, 8, dark); pen.rect(x + 28, y + 2, 26, 3, dark);
    for (const ex of [32, 44]) pen.rect(x + ex, y + 5, 6, 3, dark);
  } else if (s.vehicle === 'cargo-helicopter') {
    const y = 60;
    pen.rect(x, y, 64, 12, dark); pen.rect(x + 2, y - 6, 12, 6, dark); pen.rect(x + 50, y - 2, 10, 4, dark);
    const f = loop3(a.t, 9);
    for (const rx of [8, 56]) pen.rect(x + rx - 26 + f * 2, y - 7, 52 - f * 4, 1, dark);
  } else placeholder(pen, s.vehicle ?? 'vehicle', undefined, x, 80, 96, 32);
  pen.c.restore();
  const day = Math.round(s.from! + (s.to! - s.from!) * Math.min(1, a.p * 1.2));
  const text = `DAY ${day}`;
  pen.text(text, Math.round((W - measure(text, 'person')) / 2), PIC + 16, INK.person);
}

/** Art not drawn yet: a labelled box, so the scene still plays. */
function placeholder(pen: Pen, id: string, beats?: string, x = 0, y: number = PIC, w: number = W, h: number = PH) {
  pen.rect(x, y, w, h, 'asphalt0');
  pen.rect(x + 4, y + 4, w - 8, 1, 'metal1'); pen.rect(x + 4, y + h - 5, w - 8, 1, 'metal1');
  pen.text(`[ ${id} ]`, x + Math.round((w - measure(`[ ${id} ]`, 'person')) / 2), y + Math.round(h / 2) - 12, INK.label);
  if (beats) pen.text('art to come', x + Math.round((w - measure('art to come', 'person')) / 2), y + Math.round(h / 2) + 2, INK.dim);
}
