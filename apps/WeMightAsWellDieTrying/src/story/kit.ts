// The story's drawing kit: frames by the clock, people and crowds side on, vehicles, skies and skylines, and the
// shape of a backdrop. Shared by every city's pictures (art.ts, cities.ts).
import { BAYER, Pen } from './draw.ts';
import { STORY } from './storyConfig.ts';
import type { MapRow, Member, Shot } from './types.ts';

export const W = STORY.W, PIC = STORY.BAR, PH = STORY.H - 2 * STORY.BAR;

/** What a picture is drawn from, each frame. */
export interface Act {
  pen: Pen; t: number; p: number; dt: number; shot: Shot; k: number; sceneId: string; row: MapRow; still: boolean;
  line: number; // the line being said (an index into the shot's pages), or past the last once all are said
  said: boolean; // every line of the shot has been said
  flash(): void; tear(): void;
}

// ---- Motion: frames by the clock ----
export const idle2 = (t: number, phase = 0) => Math.floor(t * 2 + phase) % 2;
export const walk4 = (t: number, phase = 0) => Math.floor(t * 6 + phase) % 4;
export const loop3 = (t: number, fps = 4, phase = 0) => Math.floor(t * fps + phase) % 3;
export const ease = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 2;
/** The same roll for the same thing every time. */
export const roll = (a: number, b = 0) => (Math.imul(Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663), 2654435761) >>> 0) / 4294967296;

// ---- People, side on: 12 × 20, facing right unless `face` is -1 ----
export interface Look { skin: string; coat: string; dark: string; legs: string; hair: string; cap?: string; band?: string; mustache?: string; badge?: boolean; whistle?: boolean }
export const LOOKS: Record<string, Look> = {
  reyes: { skin: 'skin1', coat: 'navy1', dark: 'navy0', legs: 'navy0', hair: 'brown0', cap: 'navy0', band: 'outline', badge: true },
  pike: { skin: 'skin2', coat: 'navy2', dark: 'navy1', legs: 'navy0', hair: 'brown1', cap: 'navy1', band: 'outline', badge: true },
  dunne: { skin: 'skin1', coat: 'navy1', dark: 'navy0', legs: 'cloth0', hair: 'snow0', cap: 'navy0', band: 'outline', mustache: 'snow1', badge: true },
  hollis: { skin: 'skin2', coat: 'cloth1', dark: 'cloth0', legs: 'navy0', hair: 'khaki1', cap: 'cloth0', band: 'outline', badge: true },
  okoye: { skin: 'skin0', coat: 'cloth1', dark: 'cloth0', legs: 'navy0', hair: 'outline', cap: 'cloth0', band: 'outline', badge: true },
  vega: { skin: 'skin1', coat: 'cloth1', dark: 'cloth0', legs: 'navy0', hair: 'outline', badge: true },
  harbor: { skin: 'skin1', coat: 'hivis1', dark: 'hivis0', legs: 'brown0', hair: 'snow0', cap: 'red1', band: 'red0', whistle: true },
  lola: { skin: 'skin1', coat: 'maroon1', dark: 'maroon0', legs: 'maroon0', hair: 'snow1' },
  vendor: { skin: 'skin0', coat: 'snow1', dark: 'snow0', legs: 'brown0', hair: 'outline', mustache: 'outline' },
  pilot: { skin: 'skin1', coat: 'olive1', dark: 'olive0', legs: 'olive0', hair: 'brown0', cap: 'olive0', band: 'outline' },
};
export const CIVVIES = ['maroon1', 'teal1', 'khaki0', 'brown1', 'cloth1', 'rot1', 'urban1', 'desert1'];
export const CROWD_COATS = ['navy0', 'urban0', 'brown0', 'maroon0', 'teal0', 'olive0', 'cloth0', 'metal1'];
export interface Pose { frame?: number; walk?: boolean; face?: 1 | -1; posture?: number; sit?: boolean; arm?: 'down' | 'out' | 'up' | 'wave'; capInHand?: boolean; shrug?: boolean; nod?: number; up?: boolean }

export function person(pen: Pen, x: number, y: number, look: Look, o: Pose = {}) {
  const f = o.frame ?? 0, face = o.face ?? 1, post = o.posture ?? 1;
  const r = (lx: number, ly: number, w: number, h: number, col: string, part: 'head' | 'body' | 'legs') => {
    let dx = 0, dy = 0;
    if (part === 'head') { dx = [0, 0, 0, 1, 1][post] + ((o.nod ?? 0) > 1 ? 1 : 0); dy = [0, 0, 1, 2, 1][post] + (o.shrug ? 1 : 0) + (o.nod ?? 0) - (o.up ? 1 : 0); }
    if (part === 'body' && post === 3 && ly < 10) dx = 1;
    if (post === 4) dx += Math.floor((19 - ly) / 7); // leaning on something
    if (o.sit && part !== 'legs') dy += 4;
    const lx2 = face > 0 ? lx + dx : 12 - lx - w - dx;
    pen.rect(x + lx2, y + ly + dy, w, h, col);
  };
  // Legs: a stride in four frames when walking; folded when sitting.
  if (o.sit) {
    r(4, 17, 6, 2, look.legs, 'legs'); r(9, 19, 2, 1, 'outline', 'legs'); r(8, 17, 2, 3, look.legs, 'legs');
  } else {
    const stride = o.walk ? [[3, 7], [4, 6], [7, 3], [6, 4]][f] : [4, 6];
    r(stride[0], 14, 2, 5, 'outline', 'legs'); r(stride[0], 14, 2, 4, look.dark, 'legs');
    r(stride[1], 14, 2, 5, look.legs, 'legs'); r(stride[1], 19, 3, 1, 'outline', 'legs'); r(stride[0], 19, 2, 1, 'outline', 'legs');
  }
  // Body: the coat, its shaded back, a belt, a badge.
  r(3, 7, 6, 6, look.coat, 'body'); r(3, 7, 1, 6, look.dark, 'body'); r(4, 13, 4, 1, look.legs, 'body'); r(3, 12, 6, 1, 'outline', 'body');
  if (look.badge) r(7, 8, 1, 1, 'flash0', 'body');
  if (look.whistle) r(7, 9, 1, 2, 'metal2', 'body');
  // Head: face, its shade, an eye, hair or a cap.
  r(5, 6, 2, 1, look.skin === 'skin0' ? 'skin0' : 'skin0', 'head');
  r(4, 2, 4, 4, look.skin, 'head'); r(4, 2, 1, 4, 'skin0', 'head'); r(7, 3, 1, 1, 'outline', 'head'); r(3, 2, 1, 3, look.hair, 'head');
  if (look.mustache) r(6, 5, 3, 1, look.mustache, 'head');
  if (look.cap && !o.capInHand) { r(4, 0, 5, 1, look.cap, 'head'); r(3, 1, 6, 1, look.band ?? look.cap, 'head'); r(9, 1, 2, 1, 'outline', 'head'); }
  else { r(4, 1, 4, 1, look.hair, 'head'); r(3, 1, 1, 2, look.hair, 'head'); }
  // The near arm.
  const sw = o.walk ? [1, 0, -1, 0][f] : 0;
  if (o.arm === 'up' || (o.arm === 'wave' && f === 1)) { r(6, 1, 2, 6, look.dark, 'body'); r(6, 0, 2, 1, look.skin, 'body'); }
  else if (o.arm === 'wave') { r(7, 3, 2, 5, look.dark, 'body'); r(8, 2, 2, 1, look.skin, 'body'); }
  else if (o.arm === 'out') { r(6, 8, 4, 2, look.dark, 'body'); r(10, 8, 1, 2, look.skin, 'body'); }
  else { r(5 + sw, 7 + (o.shrug ? 0 : 0), 2, 6, look.dark, 'body'); r(5 + sw, 13, 2, 1, look.skin, 'body'); }
  if (o.capInHand && look.cap) { const hx = o.arm === 'out' ? 10 : 5 + sw; r(hx - 1, 13, 4, 2, look.cap, 'body'); r(hx - 1, 13, 4, 1, look.band ?? look.cap, 'body'); }
}

/** A small figure for a crowd or the Column: 5 × 9, or a child 3 × 6. */
export function small(pen: Pen, x: number, y: number, seed: number, o: { child?: boolean; frame?: number; arm?: boolean } = {}) {
  const coat = CIVVIES[Math.floor(roll(seed) * CIVVIES.length)], skin = ['skin0', 'skin1', 'skin2'][Math.floor(roll(seed, 3) * 3)], hair = ['outline', 'brown0', 'snow0', 'khaki0'][Math.floor(roll(seed, 5) * 4)];
  const s = (o.frame ?? 0) && !o.arm ? 1 : 0; // a sway: a pixel to one side
  if (o.child) {
    pen.rect(x + 1, y + 2, 1 + 1, 2, coat); pen.rect(x + 1 - 0, y + 4, 1, 2, 'outline'); pen.rect(x + 2, y + 4, 1, 2, 'outline');
    pen.rect(x + 1 + s, y, 2, 2, skin); pen.rect(x + 1 + s, y, 2, 1, hair);
    if (o.arm) pen.rect(x + 3, y + 2, 2, 1, skin);
    return;
  }
  pen.rect(x, y + 3, 5, 4, coat); pen.rect(x, y + 3, 1, 4, 'outline');
  pen.rect(x + 1, y + 7, 1, 2, 'outline'); pen.rect(x + 3, y + 7, 1, 2, 'outline');
  pen.rect(x + 1 + s, y, 3, 3, skin); pen.rect(x + 1 + s, y, 3, 1, hair);
  if (o.arm) { pen.rect(x + 4, y - 2 + (o.frame ?? 0), 1, 5, coat); pen.rect(x + 4, y - 3 + (o.frame ?? 0), 1, 1, skin); }
}

/** A field of heads seen side on, packed close: `ripple2`, every other row a pixel over in turn. */
export function crowd(pen: Pen, x0: number, y0: number, w: number, h: number, t: number, seed: number, raise?: [number, number]) {
  const f = idle2(t);
  for (let row = 0; row < h; row += 3)
    for (let col = 0; col < w; col += 3) {
      // Seen from behind: the backs of heads over dark coats, a lighter coat now and then; farther rows darker.
      const k = seed + row * 977 + col, x = x0 + col + (((row / 3) & 1) ^ f ? 1 : 0) + Math.floor(roll(k) * 2), y = y0 + row;
      pen.rect(x, y + 2, 3, 2, roll(k, 6) < 0.12 ? CIVVIES[Math.floor(roll(k, 1) * CIVVIES.length)] : CROWD_COATS[Math.floor(roll(k, 1) * CROWD_COATS.length)]);
      pen.rect(x + 1, y, 2, 2, roll(k, 2) < 0.55 ? 'outline' : roll(k, 4) < 0.6 ? 'brown0' : roll(k, 5) < 0.5 ? 'skin0' : 'snow0');
      if (row < h / 3) pen.px(x, y + 3, 'outline');
    }
  if (raise) { const [rx, ry] = raise; pen.rect(rx, ry - 4, 1, 4, 'maroon1'); pen.rect(rx, ry - 5, 1, 1, 'skin1'); } // a raised arm
}

/** One small figure in the squad row: 5 × 11. */
export function squadFigure(pen: Pen, m: Member, x: number, y: number, posture: number) {
  const l = LOOKS[m], slump = posture >= 3 ? 1 : 0;
  pen.rect(x, y + 4, 5, 4, l.coat); pen.rect(x, y + 4, 1, 4, l.dark);
  pen.rect(x + 1, y + 8, 1, 3, l.legs); pen.rect(x + 3, y + 8, 1, 3, l.legs);
  pen.rect(x + 1 + slump, y + 1 + slump, 3, 3, l.skin);
  if (l.cap) pen.rect(x + 1 + slump, y + slump, 4, 1, l.cap); else pen.rect(x + 1 + slump, y + slump, 3, 1, l.hair);
  if (posture === 4) pen.rect(x + 5, y + 2, 1, 9, 'metal1'); // leaning on something
}

// ---- Vehicles, side on ----
export function bus(pen: Pen, x: number, y: number, t: number, face: 1 | -1 = 1, lit = true) {
  const X = (lx: number, w: number) => (face > 0 ? x + lx : x + 70 - lx - w);
  pen.rect(X(0, 70), y, 70, 20, 'hivis1'); pen.rect(X(0, 70), y, 70, 2, 'hivis2'); pen.rect(X(0, 70), y + 13, 70, 2, 'outline');
  pen.rect(X(60, 10), y + 4, 10, 9, 'hivis1'); // the bonnet
  for (let k = 0; k < 7; k++) (lit ? pen.lit.bind(pen) : pen.rect.bind(pen))(X(4 + k * 8, 6), y + 4, 6, 6, lit ? (roll(k, x) < 0.7 ? '#7a6a44' : 'navy0') : 'navy0');
  pen.rect(X(0, 70), y + 20, 70, 1, 'outline');
  for (const wx of [10, 52]) { pen.rect(X(wx, 9), y + 17, 9, 6, 'outline'); pen.rect(X(wx + 3, 3), y + 19 + (loop3(t, 6) === 1 ? 0 : 1), 3, 1, 'metal2'); }
  if (lit) { pen.lit(X(69, 1), y + 11, 2, 2, 'flash1'); glow(pen, face > 0 ? X(70, 1) + 4 : X(70, 1) - 4, y + 12, 8, '#eadfae', 0.45); }
}
export function patrolCar(pen: Pen, x: number, y: number, t: number) {
  pen.rect(x + 2, y + 6, 44, 7, 'snow1'); pen.rect(x + 12, y, 22, 7, 'snow1'); pen.rect(x + 14, y + 1, 8, 5, 'navy0'); pen.rect(x + 24, y + 1, 8, 5, 'navy0');
  pen.rect(x + 14, y + 7, 18, 5, 'navy1'); pen.rect(x + 2, y + 12, 44, 1, 'outline'); pen.rect(x + 45, y + 8, 2, 2, 'flash0');
  for (const wx of [6, 34]) { pen.rect(x + wx, y + 11, 8, 6, 'outline'); pen.rect(x + wx + 3, y + 13, 2, 2, 'metal1'); }
  // The light bar: red, blue, dark, at 3 frames a second.
  const f = loop3(t, 3);
  pen.rect(x + 18, y - 2, 10, 2, 'outline');
  if (f === 0) pen.lit(x + 18, y - 2, 5, 2, '#d04030');
  if (f === 1) pen.lit(x + 23, y - 2, 5, 2, '#3050d0');
  return f;
}
export function ferry(pen: Pen, x: number, y: number, s: number, t: number, smoke = true) {
  if (s < 0.08) { pen.rect(x, y - 1, 2, 1, 'snow1'); pen.rect(x, y, 2, 1, 'outline'); return; } // two pixels, far off
  const R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + lx * s, y + (ly - 22) * s, Math.max(1, w * s), Math.max(1, h * s), col);
  R(0, 14, 70, 8, 'outline'); R(2, 15, 66, 5, 'maroon0'); R(0, 13, 70, 1, 'snow0');
  R(8, 6, 50, 7, 'snow1'); R(14, 1, 30, 5, 'snow2');
  for (let k = 0; k < 8; k++) R(10 + k * 6, 8, 3, 2, 'navy0');
  R(30, -6, 6, 7, 'red1'); R(30, -6, 6, 2, 'outline');
  if (smoke && s > 0.4) steam(pen, x + 33 * s, y - 8 * s, t, 5 * s, '#8a908e');
}
export function truck(pen: Pen, x: number, y: number, lit: boolean, sil?: string) {
  const c = (col: string) => sil ?? col;
  pen.rect(x, y, 52, 18, c('olive1')); pen.rect(x, y, 52, 2, c('olive2')); pen.rect(x, y + 16, 52, 2, c('olive0')); // the canvas back
  for (const k of [12, 26, 40]) pen.rect(x + k, y + 1, 1, 16, c('olive0'));
  pen.rect(x + 54, y + 4, 16, 16, c('olive0')); pen.rect(x + 60, y + 6, 8, 6, c('navy0'));
  pen.rect(x, y + 18, 72, 3, c('outline'));
  for (const wx of [6, 20, 56]) pen.rect(x + wx, y + 19, 9, 6, c('outline'));
  if (lit) { pen.lit(x + 69, y + 14, 2, 2, 'flash0'); glow(pen, x + 74, y + 15, 9, '#c4a058', 0.35); }
}

// ---- Backdrops: three layers each, drawn once per stage of the drain ----
export type Paint = (pen: Pen, w: number) => void;
/** A backdrop: three layers (far, middle, near), each moving with the camera by its depth. A tall one (h) is for a
 *  camera tilting up. */
export interface Backdrop { w: number; h?: number; layers: [Paint, Paint, Paint]; depth?: [number, number, number] }
export const sky = (pen: Pen, w: number, bands: string[], h = 70) => bands.forEach((col, k) => pen.rect(0, Math.floor((k * h) / bands.length), w, Math.ceil(h / bands.length) + 1, col));
export const skyline = (pen: Pen, w: number, base: number, col: string, seed: number, tall = 40, lit = 0.06) => {
  for (let x = 0; x < w; ) {
    const bw = 10 + Math.floor(roll(seed, x) * 22), bh = 8 + Math.floor(roll(x, seed) * tall);
    pen.rect(x, base - bh, bw, bh, col);
    for (let wy = base - bh + 3; wy < base - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (roll(wx * 7, wy) < lit) pen.lit(wx, wy, 1, 2, '#8a6a3a');
    x += bw + (roll(x) < 0.3 ? 2 : 0);
  }
};
export function lamp(pen: Pen, x: number, top: number, base: number) {
  pen.rect(x, top, 2, base - top, 'metal0'); pen.rect(x - 1, top, 6, 2, 'metal0');
  glow(pen, x + 3, top + 3, 9, '#eadfae', 0.45); pen.lit(x + 2, top + 2, 3, 1, 'flash1');
}


export const saidAt = new Map<string, number>();
/** Seconds since every line of the shot was said (0 until then). */
export function since(a: Act) {
  const key = `${a.sceneId}#${a.k}`;
  if (a.t < 0.1 || !a.said) { if (!a.said) saidAt.delete(key); return 0; }
  if (!saidAt.has(key)) saidAt.set(key, a.t);
  return a.t - saidAt.get(key)!;
}


// ---- More of the world: rain, ships, helicopters, a train car, a loudspeaker ----
/** Rain in three layers of 1-pixel streaks on the slant, at 12 frames a second. */
export function rain(pen: Pen, t: number, w: number, h: number, heavy = 1) {
  const f = Math.floor(t * 12);
  for (const [n, len, col, speed] of [[70, 3, '#5c6268', 5], [50, 4, '#7a8086', 8], [26, 6, '#9aa0a4', 12]] as const)
    for (let k = 0; k < n * heavy; k++) {
      const x = (roll(k, n) * (w + 40) + f * speed * 0.6) % (w + 40) - 20, y = (roll(n, k) * h + f * speed) % h;
      for (let s = 0; s < len; s++) pen.px(x - s * 0.5, y - s, col);
    }
}
/** A cargo ship side on, `face` the way its bow points: hull, superstructure aft, a funnel. */
export function ship(pen: Pen, x: number, y: number, s: number, face: 1 | -1, t: number, hull = 'metal1') {
  if (s < 0.06) { pen.rect(x, y - 1, 3, 1, hull); return; }
  const R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + (face > 0 ? lx : 120 - lx - w) * s, y + (ly - 30) * s, Math.max(1, w * s), Math.max(1, h * s), col);
  R(0, 16, 120, 14, 'outline'); R(2, 17, 116, 6, hull); R(2, 23, 116, 5, 'maroon0'); R(110, 12, 10, 6, hull); R(0, 14, 6, 4, hull);
  R(6, 2, 26, 15, 'snow0'); R(8, 4, 22, 2, 'navy0'); R(8, 9, 22, 2, 'navy0'); R(14, -8, 8, 10, 'metal0'); R(14, -8, 8, 2, 'red0');
  for (let k = 0; k < 4; k++) R(40 + k * 18, 8, 14, 9, ['rust', 'teal0', 'navy1', 'brown1'][k]);
  if (s > 0.4) steam(pen, x + (face > 0 ? 18 : 102) * s, y - 40 * s, t, 6 * s, '#8a908e');
}
/** A helicopter side on, `spin` 0 (stopped) to 1 (a blur), facing right. */
export function heli(pen: Pen, x: number, y: number, t: number, spin: number, body = 'olive1') {
  pen.rect(x, y + 4, 26, 10, 'outline'); pen.rect(x + 1, y + 5, 24, 8, body); pen.rect(x + 18, y + 5, 6, 5, 'navy0'); // the cabin, its glass
  pen.rect(x - 22, y + 6, 23, 3, body); pen.rect(x - 24, y + 2, 3, 8, body); // the tail
  pen.rect(x + 2, y + 15, 22, 1, 'outline'); pen.rect(x + 5, y + 13, 1, 2, 'outline'); pen.rect(x + 20, y + 13, 1, 2, 'outline');
  pen.rect(x + 11, y + 1, 4, 3, 'outline');
  if (spin > 0.6) { pen.dither(x - 16, y, 58, 2, 0.5, '#1a1c1e'); if (idle2(t * 3)) pen.rect(x - 16, y, 58, 1, 'outline'); }
  else { const a = t * spin * 20; pen.rect(x + 13 - Math.abs(Math.cos(a)) * 28, y, Math.abs(Math.cos(a)) * 56 + 1, 1, 'outline'); }
}
/** One car of a train, side on, its windows lit. */
export function trainCar(pen: Pen, x: number, y: number, open = 0, body = 'metal1', w = 70) {
  pen.rect(x, y, w, 22, 'outline'); pen.rect(x + 1, y + 1, w - 2, 20, body); pen.rect(x + 1, y + 1, w - 2, 1, 'metal2'); pen.rect(x + 1, y + 15, w - 2, 2, 'red0');
  for (let k = 0; k < 6; k++) pen.lit(x + 5 + k * 11, y + 4, 7, 7, '#8a7a50');
  for (const dx of [w * 0.25, w * 0.7]) { pen.rect(x + dx - 4, y + 3, 8, 17, 'outline'); if (open > 0) pen.lit(x + dx - 4 + (1 - open) * 4, y + 3, open * 8, 17, '#a08a58'); }
  pen.rect(x + 6, y + 22, 8, 3, 'outline'); pen.rect(x + w - 14, y + 22, 8, 3, 'outline');
}
/** A loudspeaker horn on a pole, a paper label on the pole (readable close up). */
export function loudspeaker(pen: Pen, x: number, y: number, label?: string) {
  pen.rect(x, y, 2, 70, 'metal0');
  pen.rect(x - 2, y + 2, 6, 6, 'metal1'); pen.rect(x + 4, y, 8, 10, 'metal1'); pen.rect(x + 12, y - 2, 2, 14, 'metal2');
  if (label) { pen.rect(x - 1, y + 20, 4, 6, 'snow2'); pen.px(x, y + 22, 'outline'); pen.px(x + 1, y + 24, 'outline'); }
}

/** Light falling off round a point in ordered dither, thinning with distance: a lamp's halo, a headlight. */
export function glow(pen: Pen, x: number, y: number, r: number, col: string, strength = 0.5) {
  x = Math.round(x); y = Math.round(y);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy * 1.2);
      if (d <= r && BAYER[((x + dx) & 3) + ((y + dy) & 3) * 4] < (1 - d / r) * strength * 16) pen.lit(x + dx, y + dy, 1, 1, col);
    }
}
/** Steam or smoke going up from a point: three puffs rising, spreading and thinning, round and loose. */
export function steam(pen: Pen, x: number, y: number, t: number, size = 4, col = '#9aa0a4', speed = 0.5) {
  for (let k = 0; k < 3; k++) {
    const q = (t * speed + k / 3) % 1, cx = x + Math.sin(q * 5 + k) * 2 + q * size * 0.6, cy = y - q * size * 3, r = 1 + q * size * 0.7;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r && roll(Math.floor(cx + dx) * 7 + k, Math.floor(cy + dy) + Math.floor(t * 4)) < 0.75 * (1 - q)) pen.px(cx + dx, cy + dy, col);
  }
}

// ---- Portraits: who is speaking, a 24 × 24 bust in a frame, the mouth moving while they talk ----
interface Face { skin: string; hair: string; coat: string; cap?: string; band?: string; knit?: string; helmet?: string; badge?: boolean; mustache?: string; beard?: string; stubble?: boolean; old?: boolean; bun?: boolean }
const FACES: Record<string, Face | 'radio' | 'seal' | 'horn'> = {
  Reyes: { skin: 'skin1', hair: 'brown0', coat: 'navy1', cap: 'navy0', band: 'outline', badge: true, stubble: true },
  Pike: { skin: 'skin2', hair: 'brown1', coat: 'navy2', cap: 'navy1', band: 'outline', badge: true },
  Dunne: { skin: 'skin1', hair: 'snow0', coat: 'navy1', cap: 'navy0', band: 'outline', badge: true, mustache: 'snow1', old: true },
  Hollis: { skin: 'skin2', hair: 'khaki1', coat: 'cloth1', cap: 'cloth0', band: 'outline', badge: true },
  Okoye: { skin: 'skin0', hair: 'outline', coat: 'cloth1', cap: 'cloth0', band: 'outline', badge: true },
  Vega: { skin: 'skin1', hair: 'outline', coat: 'cloth1', badge: true, stubble: true },
  Lola: { skin: 'skin1', hair: 'snow1', coat: 'maroon1', old: true, bun: true },
  Vendor: { skin: 'skin0', hair: 'outline', coat: 'snow1', mustache: 'outline' },
  'Harbor master': { skin: 'skin1', hair: 'snow0', coat: 'hivis1', knit: 'red1', beard: 'snow0', old: true },
  Pilot: { skin: 'skin1', hair: 'brown0', coat: 'olive1', helmet: 'olive0' },
  Nora: 'radio', Radio: 'radio', Captain: 'radio', 'South bank commander': 'radio', JEC: 'seal', Loudspeaker: 'horn',
};
/** The speaker's portrait at (x, y): `talk` opens the mouth (or lights the radio), `tired` 1 to 4 (Reyes's posture). */
export function portrait(pen: Pen, who: string, x: number, y: number, talk: boolean, t: number, tired = 1) {
  const f = FACES[who] ?? 'radio', P = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + 1 + lx, y + 1 + ly, w, h, col);
  pen.rect(x, y, 24, 24, 'outline'); pen.rect(x, y, 24, 1, 'metal2'); pen.rect(x, y, 1, 24, 'metal2');
  P(0, 0, 22, 22, typeof f === 'string' ? '#141a1e' : '#1b1d20');
  if (f === 'radio') { // a handset: grille, talk switch, the LED lit while the voice comes through
    P(7, 2, 9, 17, 'outline'); P(8, 3, 7, 15, 'metal0'); P(8, 3, 7, 1, 'metal1');
    for (let k = 0; k < 4; k++) P(9, 6 + k * 2, 5, 1, 'outline');
    P(16, 7, 1, 5, 'metal1');
    if (talk && idle2(t * 2)) pen.led(x + 13, y + 4, 2, 2, '#ff5040'); else P(12, 3, 2, 2, 'maroon0');
    for (let k = 0; k < 4; k++) P(10 + (k & 1), 19 + (k >> 1), 2, 1, 'metal1');
    return;
  }
  if (f === 'seal') { // the Joint Evacuation Command's seal: a ring, a star
    for (let ly = 0; ly < 18; ly++) { const w = Math.round(2 * Math.sqrt(81 - (ly - 8.5) ** 2)); P(11 - w / 2, 2 + ly, w, 1, ly === 0 || ly === 17 ? 'flash0' : 'navy1'); }
    P(3, 9, 16, 1, 'navy2');
    for (const [sx, sy, w] of [[10, 6, 2], [9, 8, 4], [7, 9, 8], [9, 10, 4], [8, 12, 2], [12, 12, 2]]) P(sx, sy, w, 2, talk && idle2(t * 2) ? 'flash1' : 'snow1');
    return;
  }
  if (f === 'horn') { // a loudspeaker horn, sound coming off it
    P(3, 8, 4, 6, 'metal1');
    for (let k = 0; k < 9; k++) P(7 + k, 8 - Math.floor(k / 2), 1, 6 + Math.floor(k / 2) * 2, k === 8 ? 'metal2' : 'metal1');
    if (talk) for (let k = 0; k < 3; k++) if ((Math.floor(t * 6) + k) % 3 !== 0) P(18 + k, 7 - k, 1, 8 + k * 2, 'snow0');
    return;
  }
  // A face: shoulders, neck, head, then hair or a cap, eyes, brows, nose, mouth.
  P(2, 17, 18, 5, f.coat); P(2, 17, 18, 1, f.coat === 'snow1' ? 'snow2' : 'metal2');
  if (f.badge) P(14, 19, 2, 2, 'flash0');
  P(9, 15, 4, 2, 'skin0');
  [8, 10, 12, 12, 12, 12, 12, 12, 12, 10, 10, 8].forEach((w, k) => { P(11 - w / 2, 4 + k, w, 1, f.skin); P(11 - w / 2, 4 + k, 1, 1, 'skin0'); });
  P(4, 9, 1, 3, f.skin); P(17, 9, 1, 3, f.skin);
  if (f.cap) { P(4, 1, 14, 4, f.cap); P(4, 4, 14, 1, f.band ?? f.cap); P(5, 5, 12, 1, 'outline'); if (f.badge) P(10, 2, 2, 2, 'flash0'); P(5, 6, 1, 2, f.hair); P(16, 6, 1, 2, f.hair); }
  else if (f.knit) { P(5, 1, 12, 5, f.knit); for (let k = 0; k < 6; k++) P(6 + k * 2, 2, 1, 4, 'red0'); }
  else if (f.helmet) { P(4, 1, 14, 6, f.helmet); P(5, 6, 12, 2, 'navy0'); P(6, 6, 4, 1, 'navy2'); }
  else { P(5, 2, 12, 3, f.hair); P(5, 5, 1, 4, f.hair); P(16, 5, 1, 4, f.hair); if (f.bun) P(8, 0, 6, 3, f.hair); }
  const brow = f.old ? 'snow1' : f.hair === 'outline' ? 'outline' : f.hair;
  if (!f.helmet) { P(7, 8, 2, 1, brow); P(13, 8, 2, 1, brow); }
  P(7, 9, 2, 1, 'outline'); P(13, 9, 2, 1, 'outline');
  if (tired >= 2) { P(7, 10, 2, 1, 'skin0'); P(13, 10, 2, 1, 'skin0'); } // the weeks under his eyes
  if (f.old) { P(6, 7, 1, 1, 'skin0'); P(15, 7, 1, 1, 'skin0'); P(7, 12, 1, 1, 'skin0'); P(14, 12, 1, 1, 'skin0'); }
  P(10, 11, 2, 1, 'skin0');
  if (f.beard) P(6, 13, 10, 3, f.beard);
  if (f.stubble) for (const [sx, sy] of [[7, 14], [9, 15], [12, 15], [14, 14], [8, 13], [13, 13]]) P(sx, sy, 1, 1, 'skin0');
  if (f.mustache) P(8, 12, 6, 1, f.mustache);
  if (talk) P(9, 13, 4, 2, 'maroon0'); else P(9, 13, 4, 1, 'maroon0');
}
