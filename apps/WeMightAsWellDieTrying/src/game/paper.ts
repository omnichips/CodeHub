// The main menu's buttons, drawn in pixel art like the war-room board (game/board.ts) and scaled up whole: the save's
// dossier (its sheet slides up out of the folder when hovered), ring-bound folders for a new save and loading one (the
// cover swings open a little), a sticky note for the settings (its gear turns, its corner curls), and a newspaper
// clipping for the patch notes (it lifts, its corner curls). Each is a real button with the canvas inside it.
import { Pen } from '../story/draw.ts';
import { measure, wrap } from '../story/font.ts';
import { roll } from '../story/kit.ts';
import { el } from './hud.ts';

const K = 2; // screen pixels to an art pixel
const INK = '#2e2a22', RED = '#b23a30', SHADOW = '#0a0604';

interface Art { pen: Pen; w: number; h: number; draw: (p: Pen, lift: number, t: number) => void; lift: number; hover: boolean; cv: HTMLCanvasElement }
const arts = new Set<Art>();
let running = false, last = 0;
/** Every pixel button drawn each frame while any is on the page, its lift easing toward hovered or not. */
function tick(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000), t = now / 1000;
  last = now;
  for (const a of arts) {
    if (!a.cv.isConnected) { arts.delete(a); continue; }
    a.lift += ((a.hover ? 1 : 0) - a.lift) * Math.min(1, dt * 12);
    a.pen.c.clearRect(0, 0, a.w, a.h);
    a.draw(a.pen, a.lift, t);
  }
  running = arts.size > 0;
  if (running) requestAnimationFrame(tick);
}

/** A button showing `w` × `h` of pixel art, drawn by `draw` every frame (`lift` 0 to 1 as it is hovered or focused). */
export function pixelButton(label: string, w: number, h: number, draw: Art['draw'], onclick: () => void, className = '') {
  const cv = el('canvas', { width: w, height: h, ariaHidden: 'true' }), pen = new Pen(cv.getContext('2d')!);
  pen.c.imageSmoothingEnabled = false;
  cv.style.width = `${w * K}px`;
  const art: Art = { pen, w, h, draw, lift: 0, hover: false, cv };
  const b = el('button', { type: 'button', className: `px ${className}`, ariaLabel: label, title: label, onclick }, cv);
  b.onpointerenter = (e) => { if (e.pointerType !== 'touch') art.hover = true; };
  b.onpointerleave = () => { art.hover = false; };
  b.onfocus = () => { art.hover = true; };
  b.onblur = () => { art.hover = false; };
  arts.add(art);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  return b;
}

/** Lines of pencil, as on the board's papers. */
function scribble(p: Pen, x: number, y: number, w: number, lines: number, col: string, seed: number) {
  for (let l = 0; l < lines; l++)
    for (let at = 0, k = 0; at < w - (l === lines - 1 ? w / 3 : 0); k++) {
      const wl = 2 + Math.floor(roll(k + l * 31, seed) * 7);
      p.rect(x + at, y + l * 4, Math.min(wl, w - at), 1, col);
      at += wl + 2;
    }
}
/** A corner curling up, `n` pixels of it, at the bottom right (x2, y2): the page under shows, the flap folds over. */
function curl(p: Pen, x2: number, y2: number, n: number, under: string, flap: string) {
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const px = x2 - n + u, py = y2 - n + v, d = u + v;
      if (d >= n) p.px(px, py, d === n ? '#8a7f60' : under);
      else if (d >= n - 1) p.px(px, py, '#f8f3e4');
      else if (u >= 1 && v >= 1) p.px(px, py, flap);
    }
}

/** A medal: its ribbon in two colours, a disc hung from it (gold, or grey while not yet earned). 7 × 12 art pixels. */
export function medal(p: Pen, x: number, y: number, [a, b]: readonly [string, string], earned = true) {
  p.rect(x + 1, y, 5, 5, earned ? a : '#5f625e'); p.rect(x + 3, y, 1, 5, earned ? b : '#8d918b');
  const [face, dark, hi] = earned ? ['#d6a23e', '#8a6420', '#f8dc8c'] : ['#6b6a64', '#4a4a46', '#8a8a84'];
  p.rect(x + 1, y + 5, 5, 7, dark); p.rect(x, y + 6, 7, 5, dark); p.rect(x + 1, y + 6, 5, 5, face); p.px(x + 2, y + 7, hi);
}

/** The save's dossier: a manila folder, CONTINUE on its tab, the save's name, a pip for each city (red and crossed:
 *  lost; gold: the one it is on), its chips and cities, the day stamped on it, the save's medals pinned to its front.
 *  Hovered, the sheet inside slides up. */
export function dossier(name: string, pips: ('held' | 'next' | '')[], line: string, day: number, medals: readonly (readonly [string, string])[] = []) {
  const W = 196, H = 66;
  return (p: Pen, lift: number, t: number) => {
    const up = Math.round(lift * 8);
    p.dither(3, 14, W - 4, H - 14, 0.55, SHADOW);
    // The folder's back, its tab.
    p.rect(0, 10, W - 3, H - 14, '#b08d52'); p.rect(4, 2, 58, 10, '#b08d52'); p.rect(4, 2, 58, 1, '#c4a265');
    p.text('CONTINUE', 9, 4, '#6e2620');
    // The sheet inside, beside the tab, sliding up out of it: typed lines, a paperclip.
    const sy = 13 - up, sx = 70;
    p.rect(sx, sy, W - 14 - sx, 30, '#efe9d6'); p.rect(sx, sy, W - 14 - sx, 1, '#fffaea');
    scribble(p, sx + 6, sy + 3, 70, 2, '#6b6250', 4);
    p.rect(W - 34, sy - 3, 4, 12, '#9aa0a4'); p.rect(W - 33, sy - 2, 2, 10, '#5a6064');
    // The front, over it.
    const fy = 17 + Math.round(lift * 1);
    p.rect(0, fy, W - 3, H - 4 - fy, '#c9a86a'); p.rect(0, fy, W - 3, 1, '#ddbf82'); p.rect(0, H - 5, W - 3, 1, '#9c7f48');
    if (up > 0) p.rect(sx, fy - 1, W - 14 - sx, 1, '#7a6440'); // the sheet's shadow on the folder's lip
    p.text(name.length > 22 ? `${name.slice(0, 21)}…` : name, 9, fy + 4, INK);
    pips.forEach((s, k) => {
      const x = 9 + k * 11, y = fy + 15;
      p.rect(x, y, 9, 6, s === 'held' ? '#6e211b' : '#6b5530');
      p.rect(x + 1, y + 1, 7, 4, s === 'held' ? RED : s === 'next' ? (Math.sin(t * 4.5) > 0 ? '#f0c860' : '#c49a3a') : '#a8895a');
      if (s === 'held') for (let d = 0; d < 4; d++) { p.px(x + 2 + d, y + 1 + d, '#f2e6d6'); p.px(x + 5 - d, y + 1 + d, '#f2e6d6'); }
    });
    p.text(line, 9, fy + 25, '#5a4a2a');
    // The day, stamped in red ink.
    const label = `DAY ${day}`, sw = measure(label, 'person') + 8;
    p.rect(W - 12 - sw, fy + 5, sw, 13, RED); p.rect(W - 11 - sw, fy + 6, sw - 2, 11, '#c9a86a'); p.text(label, W - 8 - sw, fy + 8, RED);
    // Its medals, pinned along the bottom right (as many as fit, newest last).
    medals.slice(-7).forEach((m, k, all) => medal(p, W - 14 - (all.length - 1 - k) * 9, fy + 24, m));
  };
}

const covers = new Map<string, HTMLCanvasElement>();
/** A ring-bound folder, its card cover in `col` with a label on it, two binder rings down its spine. Hovered, the
 *  cover swings open from the spine and the lined page under it shows. */
export function folder(label: string, col: string, dark: string, seed: number) {
  const W = 96, H = 44, key = `${col}${seed}`, lw = measure(label, 'person') + 10;
  const cover = covers.get(key) ?? (() => {
    const cv = el('canvas', { width: W - 4, height: H - 4 }), q = new Pen(cv.getContext('2d')!);
    q.rect(0, 0, W - 4, H - 4, dark); q.rect(1, 1, W - 6, H - 6, col); q.rect(1, 1, W - 6, 1, 'rgba(255,255,255,0.18)');
    for (let k = 0; k < 40; k++) q.px(2 + roll(k, seed) * (W - 8), 2 + roll(seed, k) * (H - 8), dark); // the card's grain
    q.rect(0, 0, 4, H - 4, dark); // the spine
    covers.set(key, cv);
    return cv;
  })();
  return (p: Pen, lift: number) => {
    p.dither(3, 4, W - 3, H - 4, 0.55, SHADOW);
    // The page under the cover: ruled, a red margin, pencil.
    p.rect(3, 1, W - 6, H - 5, '#d8ceb2'); p.rect(3, 1, W - 7, H - 7, '#ece4cc');
    for (let y = 8; y < H - 6; y += 5) p.rect(6, y, W - 12, 1, '#b9c4cc');
    p.rect(13, 1, 1, H - 7, '#d9a0a0');
    scribble(p, 17, 7, W - 30, 5, '#5a5040', seed);
    // The cover, narrower as it swings toward you, its free edge nearer and so a little taller.
    const open = lift * 0.3, cw = Math.max(8, Math.round((W - 4) * (1 - open))), grow = Math.round(open * 6);
    [0.35, 0.2, 0.1].forEach((a, k) => { p.c.globalAlpha = a * lift; p.rect(cw + k, 1, 1, H - 6, '#1a0f08'); });
    p.c.globalAlpha = 1;
    for (let i = 0; i < cw; i++) {
      const g = Math.round((grow * i) / cw), sx = Math.min(W - 5, Math.floor((i * (W - 4)) / cw));
      p.c.drawImage(cover, sx, 0, 1, H - 4, i, -g, 1, H - 4 + g * 2);
    }
    // Its label, kept whole (squeezing pixel letters garbles them), riding where it sits on the turning cover.
    const at = Math.max(5, Math.round((cw - lw) / 2) + 2), lg = Math.round((grow * (at + lw / 2)) / cw); // centred on what shows of the cover
    p.rect(at, 13 - lg, lw, 13, '#e2dccb'); p.rect(at, 25 - lg, lw, 1, '#a59d86'); p.text(label, at + 5, 16 - lg, INK);
    if (lift > 0.02) { p.c.globalAlpha = open * 0.6; p.rect(cw - 3, -grow, 3, H - 4 + grow * 2, '#100a06'); p.c.globalAlpha = 1; } // its edge turning out of the light
    // The rings through the spine.
    for (const ry of [9, H - 15]) { p.rect(0, ry, 7, 6, '#3a3d40'); p.rect(1, ry + 1, 5, 4, '#9aa0a4'); p.rect(2, ry + 2, 3, 2, '#3a3d40'); p.px(1, ry + 1, '#dcddd3'); }
  };
}

let gear = 0, gearAt = 0;
/** A pink sticky note with a gear drawn on it: hovered, the gear turns and the bottom corner curls up. */
export function stickyNote() {
  const W = 57, H = 48;
  return (p: Pen, lift: number, t: number) => {
    gear += Math.min(0.1, Math.max(0, t - gearAt)) * 2.4 * lift;
    gearAt = t;
    const y = 2 - Math.round(lift * 2), w = W - 4, h = H - 6;
    p.dither(3, 5, w, h, 0.55 + lift * 0.1, SHADOW);
    p.rect(0, y, w, h, '#e59aa6'); p.rect(0, y, w, 6, '#d68794');
    const gx = 27, gy = y + 18;
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + gear, tooth = ((((a / (Math.PI * 2)) * 8) % 1) + 1) % 1 < 0.45;
        if (r < 2.3) continue;
        if (r <= 5.6 || (tooth && r <= 8.4)) p.px(gx + dx, gy + dy, r > 4.6 && !(tooth && r > 5.6) ? '#5a2a34' : dx + dy < 0 ? '#8a4452' : '#6e3440');
      }
    p.text('SETTINGS', 6, y + 31, '#4a1e28');
    const n = Math.round(4 + lift * 9);
    curl(p, w, y + h, n, '#140c0a', '#c97a87');
  };
}

/** A sticky note like the settings' with a picture drawn on it and `label` under: `col`/`top` its paper, `flap` its
 *  curling corner. Hovered, it lifts, its corner curls and `icon` (drawn round cx, cy) moves as it likes. */
function iconNote(label: string, [col, top, flap, ink]: [string, string, string, string], icon: (p: Pen, cx: number, cy: number, lift: number, t: number) => void) {
  const W = Math.max(57, measure(label, 'person') + 14), H = 48;
  return [W, H, (p: Pen, lift: number, t: number) => {
    const y = 2 - Math.round(lift * 2), w = W - 4, h = H - 6;
    p.dither(3, 5, w, h, 0.55 + lift * 0.1, SHADOW);
    p.rect(0, y, w, h, col); p.rect(0, y, w, 6, top);
    icon(p, Math.floor(w / 2), y + 18, lift, t);
    p.text(label, Math.floor((w - measure(label, 'person')) / 2), y + 31, ink);
    curl(p, w, y + h, Math.round(4 + lift * 9), '#140c0a', flap);
  }] as const;
}

/** Medals: a yellow note, a medal on it swinging from its ribbon when hovered. */
export function medalNote() {
  return iconNote('MEDALS', ['#e0cc62', '#cbb84e', '#c8b44a', '#3a3418'], (p, cx, cy, lift, t) => {
    const a = Math.sin(t * 7) * 0.45 * lift, dx = Math.round(Math.sin(a) * 6), dy = Math.round((1 - Math.cos(a)) * 3);
    for (let k = 0; k <= 6; k++) { const x = cx + Math.round((dx * k) / 6); p.rect(x - 2, cy - 9 + k, 2, 1, '#2f4a6a'); p.rect(x, cy - 9 + k, 2, 1, '#c9473a'); } // the ribbon
    const mx = cx + dx, my = cy + 2 + dy;
    for (let v = -4; v <= 4; v++) for (let u = -4; u <= 4; u++) { const r = Math.hypot(u, v); if (r <= 4.3) p.px(mx + u, my + v, r > 3.3 ? '#8a6420' : u + v < -1 ? '#f8dc8c' : '#d6a23e'); }
    p.px(mx, my - 1, '#8a6420'); p.px(mx - 1, my, '#8a6420'); p.px(mx + 1, my, '#8a6420'); p.px(mx, my + 1, '#8a6420'); // a star struck in it
    p.rect(cx - 1, cy - 11, 3, 2, '#5f625e'); // the pin it hangs from
  });
}

/** The field manual: a green note, a book on it whose cover swings open when hovered, showing its pages. */
export function manualNote() {
  return iconNote('FIELD MANUAL', ['#b8d89a', '#a2c484', '#94b878', '#22341a'], (p, cx, cy, lift) => {
    const x = cx - 8, y = cy - 8, W = 16, H = 15;
    p.rect(x, y + 1, W, H, '#1c2a14'); // its back
    p.rect(x + 1, y + 2, W - 2, H - 2, '#efe9d6'); // the pages
    for (let l = 0; l < 4; l++) p.rect(x + 4, y + 5 + l * 3, W - 7, 1, '#9a9280');
    const cw = Math.max(2, Math.round((W - 1) * (1 - lift * 0.75))); // the cover, narrower as it swings open toward you
    p.rect(x, y, cw, H, '#4a6a2f'); p.rect(x, y, cw, 1, '#6e8f48'); p.rect(x, y, 2, H, '#2e4420');
    if (cw > 9) { p.rect(x + 4, y + 5, cw - 7, 3, '#c4a058'); p.rect(x + 5, y + 6, cw - 9, 1, '#4a6a2f'); } // the label on it
  });
}

/** The latest patch notes as a newspaper clipping: torn top and bottom, NEWS and the date, the headline, a red
 *  NEW stamp while unread. Hovered, it lifts and its corner curls. */
export function clipping(title: string, date: string, unread: boolean, label = 'NEWS') {
  const W = 118, lines = wrap(title, 'person', W - 14).slice(0, 3), H = 40 + lines.length * 10;
  return [W, H, (p: Pen, lift: number, t: number) => {
    const y = 3 - Math.round(lift * 2), h = H - 7;
    p.dither(3, 7, W - 4, h, 0.55 + lift * 0.1, SHADOW);
    p.rect(0, y, W - 4, h, '#cfc6ad');
    for (let x = 0; x < W - 4; x++) { if (roll(x, 5) < 0.3) p.c.clearRect(x, y, 1, 1); if (roll(x, 9) < 0.3) p.c.clearRect(x, y + h - 1, 1, 1); } // torn edges
    for (let k = 0; k < 30; k++) p.px(roll(k, 21) * (W - 6), y + 2 + roll(21, k) * (h - 4), '#bfb393');
    p.text(label, 6, y + 3, INK);
    p.rect(5, y + 12, W - 14, 1, INK); p.rect(5, y + 14, W - 14, 1, INK);
    lines.forEach((l, k) => p.text(l, 6, y + 18 + k * 10, INK));
    p.text(date, 6, y + 20 + lines.length * 10, '#6b6250');
    curl(p, W - 4, y + h, Math.round(3 + lift * 8), '#140c0a', '#b8ae94');
    if (unread) {
      const flash = Math.sin(t * 3) > -0.6;
      p.rect(W - 34, y - 3, 30, 13, '#141516'); p.rect(W - 33, y - 2, 28, 11, flash ? '#c9473a' : '#a8352b'); p.text('NEW', W - 28, y, '#f2e6d6');
    }
  }] as const;
}

/** A post-it note stuck on at (x, y), `w` wide, its lines of writing, fluttering by `flutter` pixels. */
function postit(p: Pen, x: number, y: number, w: number, lines: string[], ink: string, flutter: number, col = '#e0cc62') {
  const h = 9 + lines.length * 9, f = Math.round(flutter);
  p.dither(x + 2, y + 3, w, h, 0.5, SHADOW);
  p.rect(x, y - f, w, h + f, col); p.rect(x, y - f, w, 4, '#cbb84e'); p.rect(x + w - 4, y + h - 4, 4, 4, '#b8a440');
  lines.forEach((l, k) => p.text(l, x + 4, y + 6 - f + k * 9, ink));
}

/** A save's folder for the New save and Load save screens: a manila folder (blue-grey while its slot is empty, brown
 *  while it would be written over) with its slot on the tab, the save's name, a pip for each city, a paperclipped sheet
 *  inside, a post-it on it, and a photo of the city it is on pinned to the front. Hovered, the sheet slides up out of
 *  it and the post-it flutters. */
export function slotFolder(o: { slot: number; title: string; line: string; pips?: ('held' | 'next' | '')[]; kind: 'save' | 'empty' | 'danger'; note: string[]; noteInk?: string; photo?: HTMLCanvasElement }) {
  const W = 214, H = 68, [back, front, edge] = { save: ['#b08d52', '#c9a86a', '#9c7f48'], empty: ['#7c8a92', '#9aa8ae', '#5e6a70'], danger: ['#8c5236', '#a96a48', '#6e3e28'] }[o.kind];
  return (p: Pen, lift: number, t: number) => {
    const up = Math.round(lift * 9);
    p.dither(3, 14, W - 4, H - 14, 0.55, SHADOW);
    p.rect(0, 10, W - 3, H - 12, back); p.rect(4, 2, 62, 10, back); p.rect(4, 2, 62, 1, front);
    p.text(`SLOT ${o.slot}`, 9, 4, o.kind === 'empty' ? '#2e363a' : '#4a2a14');
    // The sheet inside, beside the tab, rising: lines of typing, a paperclip.
    const sy = 14 - up, sx = 72;
    p.rect(sx, sy, W - 70 - sx, 34, '#efe9d6'); p.rect(sx, sy, W - 70 - sx, 1, '#fffaea');
    if (o.kind === 'empty') for (let x = sx + 4; x < W - 74; x += 6) p.rect(x, sy + 5, 3, 1, '#b9b2a0'); else scribble(p, sx + 5, sy + 4, 60, 3, '#6b6250', o.slot);
    p.rect(sx + 14, sy - 3, 4, 12, '#9aa0a4'); p.rect(sx + 15, sy - 2, 2, 10, '#5a6064');
    // The front, over it.
    const fy = 18 + Math.round(lift);
    p.rect(0, fy, W - 3, H - 4 - fy, front); p.rect(0, fy, W - 3, 1, 'rgba(255,255,255,0.25)'); p.rect(0, H - 5, W - 3, 1, edge);
    if (up > 0) p.rect(sx, fy - 1, W - 70 - sx, 1, edge);
    p.text(o.title.length > 20 ? `${o.title.slice(0, 19)}…` : o.title, 9, fy + 5, o.kind === 'empty' ? '#2e363a' : INK);
    (o.pips ?? []).forEach((s, k) => {
      const x = 9 + k * 11, y = fy + 17;
      p.rect(x, y, 9, 6, s === 'held' ? '#6e211b' : '#6b5530'); p.rect(x + 1, y + 1, 7, 4, s === 'held' ? RED : s === 'next' ? '#f0c860' : '#a8895a');
      if (s === 'held') for (let d = 0; d < 4; d++) { p.px(x + 2 + d, y + 1 + d, '#f2e6d6'); p.px(x + 5 - d, y + 1 + d, '#f2e6d6'); }
    });
    p.text(o.line, 9, fy + 27, o.kind === 'empty' ? '#3a444a' : '#5a4a2a');
    if (o.photo) {
      // The city, a little photo with a white border, pinned on.
      const x = W - 101, y = fy + 5;
      p.dither(x + 2, y + 2, 36, 27, 0.5, SHADOW);
      p.rect(x, y, 36, 27, '#efe9d6');
      p.c.imageSmoothingEnabled = true;
      p.c.drawImage(o.photo, x + 2, y + 2, 32, 20);
      p.c.imageSmoothingEnabled = false;
      p.rect(x + 16, y - 1, 3, 3, '#7a2620'); p.px(x + 17, y - 1, '#f08a78');
    }
    postit(p, W - 64, 4, 56, o.note, o.noteInk ?? '#3a3418', lift * 3 + Math.sin(t * 2.2) * 0.4 * lift);
  };
}

/** A small post-it for a button (Export, Delete, Import), in `col`; hovered, it lifts and its corner curls. */
export function noteTag(label: string, col: string, dark: string, ink: string) {
  const W = measure(label, 'person') + 14, H = 24;
  return [W, H, (p: Pen, lift: number) => {
    const y = 3 - Math.round(lift * 2);
    p.dither(2, 5, W - 3, H - 5, 0.55, SHADOW);
    p.rect(0, y, W - 2, H - 4, col); p.rect(0, y, W - 2, 4, dark);
    p.text(label, 6, y + 8, ink);
    curl(p, W - 2, y + H - 4, Math.round(3 + lift * 6), '#140c0a', dark);
  }] as const;
}

/** A scene of the Story log as a frame of film: a black strip with sprocket holes along both edges, the picture in the
 *  middle (a play triangle, the city, Before or After, the day), or a "?" while the scene is not yet seen. Hovered,
 *  the strip winds on (its holes scroll) and the picture lights up. */
export function filmFrame(o: { city: string; kind: string; day: string; seen: boolean }) {
  const W = 96, H = 56;
  let scroll = 0, at = 0;
  return (p: Pen, lift: number, t: number) => {
    scroll += Math.min(0.1, Math.max(0, t - at)) * 26 * lift;
    at = t;
    p.dither(3, 4, W - 3, H - 3, 0.55, SHADOW);
    p.rect(0, 0, W - 2, H - 2, '#141516'); p.rect(0, 0, W - 2, 1, '#2c2e30');
    // The sprocket holes, scrolling along both edges when hovered.
    for (const y of [3, H - 8]) for (let x = -10 + (Math.floor(scroll) % 10); x < W - 6; x += 10) { const l = Math.max(2, x), r = Math.min(W - 4, x + 5); if (r > l) p.rect(l, y, r - l, 4, o.seen ? '#e2dccb' : '#6b6a64'); }
    // The picture.
    const lit = o.seen ? 0.25 + lift * 0.6 : 0;
    p.rect(5, 11, W - 12, 34, o.seen ? '#1d2a2e' : '#2a2b2c');
    if (o.seen) { p.rect(5, 11, W - 12, 34, '#2f4a4e'); p.dither(5, 11, W - 12, 34, 0.55 - lit * 0.5, '#0b1214'); p.rect(5, 11, W - 12, 1, '#4f7a7e'); }
    if (o.seen) {
      for (let k = 0; k < 6; k++) p.rect(12 + k * 2, 20 + k, 2, 12 - k * 2, '#efe9d6'); // the play triangle, pointing right
      p.text(o.city, 30, 16, '#efe9d6'); p.text(o.kind, 30, 26, '#8fb0b2'); p.text(o.day, 30, 35, '#d6a23e');
    } else {
      p.text('?', 45, 20, '#6b6a64'); p.text('Not seen yet', 18, 33, '#6b6a64');
    }
    if (lift > 0.05) { p.c.globalAlpha = lift * 0.5; p.rect(5, 11, W - 12, 1, '#ffffff'); p.c.globalAlpha = 1; }
  };
}

// ---- The skill tree (game/tree.ts) ----
export const CARD = { W: 100, H: 36 }; // a skill's card, in art pixels
/** A skill's card, pinned to the requisitions sheet: its name (two lines at most), what it costs or needs, a pip a
 *  level, ISSUED stamped on it once fully bought. Owned cards are worn, buyable ones bright with a gold pin, the ones
 *  you can afford with a corner folded down, locked ones grey; the one picked ringed in red marker. */
export function skillCard(p: Pen, o: { name: string; status: string; lv: number; max: number; state: 'owned' | 'open' | 'locked'; afford: boolean; picked: boolean }) {
  const { W, H } = CARD, locked = o.state === 'locked';
  p.c.clearRect(0, 0, W, H);
  p.dither(2, 3, W - 2, H - 3, 0.55, SHADOW);
  const paper = locked ? '#b3aa7e' : o.state === 'owned' ? '#d9c56a' : o.afford ? '#f4e27a' : '#e6d26c'; // yellow paper, so it stands off the white sheet
  p.rect(0, 0, W - 2, H - 2, paper); p.rect(0, H - 3, W - 2, 1, '#9a8a3a'); p.rect(W - 3, 0, 1, H - 2, '#b0a048');
  for (let k = 0; k < 14; k++) p.px(roll(k, o.name.length) * (W - 4), roll(o.name.length, k) * (H - 4), locked ? '#a39b70' : '#cbb75a'); // age spots
  p.rect(3, 7, 20, 20, locked ? '#948c64' : '#b8a448'); p.rect(4, 8, 18, 18, locked ? '#a59d72' : '#efe4b0'); // where the icon sits
  const ink = locked ? '#6b6556' : INK;
  wrap(o.name, 'person', W - 30).slice(0, 2).forEach((l, k) => p.text(l, 26, 4 + k * 9, ink));
  if (o.state !== 'owned') p.text(o.status, 26, 24, locked ? '#6b6556' : o.afford ? '#8a5a10' : '#9c4a3a');
  if (o.max > 1) for (let k = 0; k < o.max; k++) { const x = o.state === 'owned' ? 26 + k * 6 : W - 8 - (o.max - k) * 6, y = o.state === 'owned' ? 26 : 25; p.rect(x, y, 5, 4, '#2f4a6a'); if (k >= o.lv) p.rect(x + 1, y + 1, 3, 2, paper); }
  if (o.state === 'owned') { const sw = measure('ISSUED', 'person') + 6, sx = W - 6 - sw; p.rect(sx, 21, sw, 11, RED); p.rect(sx + 1, 22, sw - 2, 9, paper); p.text('ISSUED', sx + 3, 23, RED); }
  if (o.afford && o.state === 'open') { for (let k = 0; k < 7; k++) p.rect(W - 9 + k, 0, 7 - k, 1, k ? '#c9b14a' : '#8a7a2a'); for (let k = 0; k < 7; k++) p.rect(W - 9, k, 7 - k, 1, '#fbf0a8'); } // a corner folded down
  // The pin: red once owned, gold while buyable, grey while locked.
  const [pin, hi, dark] = o.state === 'owned' ? ['#c9473a', '#f08a78', '#7a2620'] : o.state === 'open' ? ['#d6a23e', '#f8dc8c', '#8a6420'] : ['#5f625e', '#8d918b', '#353735'];
  p.rect(W / 2 - 2, 0, 3, 4, dark); p.rect(W / 2 - 3, 1, 5, 2, dark); p.rect(W / 2 - 2, 0, 3, 3, pin); p.px(W / 2 - 2, 0, hi);
  if (o.picked) { for (let x = 1; x < W - 3; x += 2) { p.px(x, 1, RED); p.px(x, H - 4, RED); } for (let y = 1; y < H - 3; y += 2) { p.px(1, y, RED); p.px(W - 4, y, RED); } }
}

/** An index tab for a category: taller and brighter while it is the one open; hovered, it lifts. */
export function indexTab(label: string, col: string, dark: string, open: () => boolean) {
  const W = measure(label, 'person') + 16, H = 22;
  return [W, H, (p: Pen, lift: number) => {
    const on = open(), y = on ? 1 : 5 - Math.round(lift * 3);
    p.dither(2, y + 3, W - 2, H - y - 3, 0.5, SHADOW);
    const face = on ? col : dark; // the ones behind, in their own colour's shade
    p.rect(2, y, W - 6, 2, face); p.rect(0, y + 2, W - 2, H - y - 2, face); p.rect(0, y + 2, 1, H - y - 2, '#141516'); p.rect(W - 3, y + 2, 1, H - y - 2, '#141516');
    p.text(label, 8, y + 6, on ? INK : '#3a3428');
  }] as const;
}

/** A rubber stamp to press, inked like inkStamp's (a box ruled 2 pixels thick round the word, worn where the ink missed) but
 *  in `ink`: the one in use pressed hard, the others faint until hovered. */
export function stampTab(label: string, ink: string, open: () => boolean) {
  const W = measure(label, 'person') + 10, H = 15;
  return [W, H, (p: Pen, lift: number) => {
    p.c.globalAlpha = open() ? 0.95 : 0.5 + lift * 0.3;
    p.rect(0, 0, W, H, ink); p.c.clearRect(2, 2, W - 4, H - 4); p.text(label, 5, 4, ink);
    for (let k = 0; k < 18; k++) p.c.clearRect(Math.floor(roll(k, W) * W), Math.floor(roll(W, k) * H), 1, 1); // worn ink
    p.c.globalAlpha = 1;
  }] as const;
}

/** Chips as a pile of tokens, a stack for every 100 or so (the last one shorter), the count beside them. */
export function chipStack(p: Pen, chips: number) {
  p.c.clearRect(0, 0, p.c.canvas.width, p.c.canvas.height);
  const tokens = Math.min(24, Math.ceil(chips / 25)), stacks = Math.max(1, Math.ceil(tokens / 8));
  for (let s = 0; s < stacks; s++) {
    const n = Math.min(8, tokens - s * 8), x = 2 + s * 13;
    p.dither(x + 2, 19, 11, 3, 0.5, SHADOW);
    for (let k = 0; k < Math.max(0, n); k++) {
      const y = 18 - k * 2;
      p.rect(x, y, 11, 3, '#8a6420'); p.rect(x + 1, y, 9, 2, k === n - 1 ? '#f0c860' : '#d6a23e'); p.px(x + 2, y, '#f8dc8c');
    }
    if (n > 0) { p.rect(x + 3, 18 - (n - 1) * 2, 5, 1, '#ad7a2a'); }
  }
  p.text(chips.toLocaleString('en-US'), 4 + stacks * 13, 8, '#efe9d6');
  p.text('chips', 4 + stacks * 13 + measure(chips.toLocaleString('en-US'), 'person') + 4, 8, '#c4a058');
}

/** A word stamped in red ink, as a canvas `scale` times its pixels: APPROVED on a requisition. */
export function inkStamp(text: string, scale: number) {
  const w = measure(text, 'person') + 10, cv = el('canvas', { width: w, height: 15, ariaHidden: 'true' }), p = new Pen(cv.getContext('2d')!);
  p.rect(0, 0, w, 15, RED); p.c.clearRect(2, 2, w - 4, 11); p.text(text, 5, 4, RED);
  for (let k = 0; k < 18; k++) p.c.clearRect(roll(k, w) * w, roll(w, k) * 15, 1, 1); // worn ink
  cv.style.width = `${w * scale}px`;
  return cv;
}

/** Plain pixel text, as a canvas `scale` times its pixels. */
export function pixelText(text: string, col: string, scale: number) {
  const w = measure(text, 'person') + 1, cv = el('canvas', { width: w, height: 9, ariaHidden: 'true' });
  new Pen(cv.getContext('2d')!).text(text, 0, 0, col);
  cv.style.width = `${w * scale}px`;
  return cv;
}

/** A tile of cork for behind the requisitions sheet, as an image URL. */
export function corkTile() {
  const S = 64, cv = el('canvas', { width: S, height: S }), g = cv.getContext('2d')!, img = g.createImageData(S, S), cork = [[138, 98, 54], [122, 85, 48], [155, 112, 64], [109, 74, 42], [168, 128, 76]];
  for (let i = 0; i < S * S; i++) { const [r, gg, b] = cork[Math.floor(roll(i % S, (i / S) | 0) * 5)]; img.data.set([r * 0.55, gg * 0.55, b * 0.55, 255], i * 4); }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

/** A tile of the requisitions sheet: off-white, ruled, flecked. */
export function sheetTile() {
  const S = 32, cv = el('canvas', { width: S, height: S }), p = new Pen(cv.getContext('2d')!);
  p.rect(0, 0, S, S, '#e9e2cc'); p.rect(0, S - 1, S, 1, '#c6ccd0');
  for (let k = 0; k < 6; k++) p.px(roll(k, 3) * S, roll(3, k) * S, '#d6cdb2');
  return cv.toDataURL();
}

// ---- Settings (game/settings.ts) ----
/** A canvas of `w` × `h` art pixels drawn every frame by `draw`, like the buttons but not one (a preview, a gauge). */
export function pixelCanvas(w: number, h: number, draw: (p: Pen, t: number) => void) {
  const cv = el('canvas', { width: w, height: h, ariaHidden: 'true' }), pen = new Pen(cv.getContext('2d')!);
  cv.style.width = `${w * K}px`;
  arts.add({ pen, w, h, draw: (p, _lift, t) => draw(p, t), lift: 0, hover: false, cv });
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  return cv;
}

/** A box to tick and its label, for one choice of a setting: ticked in blue pen while it is the one chosen. Hovered,
 *  the box darkens. */
export function checkBox(label: string, on: () => boolean, ink = INK) {
  const W = measure(label, 'person') + 18, H = 13;
  return [W, H, (p: Pen, lift: number) => {
    p.rect(1, 2, 9, 9, ink); p.rect(2, 3, 7, 7, lift > 0.3 ? '#d8cbb0' : '#f2ead2');
    if (on()) for (const [x, y] of [[3, 6], [4, 7], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4], [10, 3], [11, 2]]) { p.rect(x, y, 1, 2, '#2f4a6a'); } // the tick, over the box's edge
    p.text(label, 14, 3, ink);
  }] as const;
}

/** A fader like the radio's: a slot with its marks, a knob at `value` (0 to 1), the level on an amber display. */
export function faderArt(p: Pen, value: number, focused: boolean, shown = value * 100) {
  const W = 124, H = 18, x0 = 4, x1 = 88, at = Math.round(x0 + (x1 - x0) * value);
  p.c.clearRect(0, 0, W, H);
  p.rect(x0 - 2, 7, x1 - x0 + 4, 5, '#141516'); p.rect(x0, 9, at - x0, 1, '#c4a058'); // the slot, lit up to the knob
  for (let k = 0; k <= 10; k++) p.rect(x0 + Math.round(((x1 - x0) * k) / 10), k % 5 ? 14 : 13, 1, k % 5 ? 2 : 3, '#5a3a40');
  p.rect(at - 3, 2, 7, 13, '#141516'); p.rect(at - 2, 3, 5, 11, focused ? '#dcddd3' : '#9aa0a4'); p.rect(at - 2, 3, 5, 1, '#f2f2ea'); p.rect(at - 2, 8, 5, 1, '#3a3d40'); // the knob
  p.rect(94, 2, 28, 14, '#1a1c14'); p.text(String(Math.round(shown)).padStart(3, '0'), 97, 5, '#d6a23e', 'jec');
}

/** Parched paper, as a tile: mottled tan, darker blotches where it has browned, fibres. */
export function parchment() {
  const S = 96, cv = el('canvas', { width: S, height: S }), g = cv.getContext('2d')!, img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const blot = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * Math.cos(y * 0.09 + x * 0.03), grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
      const k = 1 - Math.max(0, blot) * 0.1 - grain * 0.06;
      img.data.set([228 * k, 204 * k, 152 * k, 255], (y * S + x) * 4);
    }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

/** A tile of concrete brick wall, as an image URL: grey bricks in running bond, mortar between, flecked and stained. */
export function brickTile() {
  const W = 64, H = 32, cv = el('canvas', { width: W, height: H }), p = new Pen(cv.getContext('2d')!), tones = ['#7a786f', '#6d6b63', '#85837a', '#74726a'];
  p.rect(0, 0, W, H, '#2a2927'); // the mortar
  for (let row = 0; row < 4; row++)
    for (let k = -1; k < 5; k++) {
      const x = k * 16 + (row % 2 ? 8 : 0), y = row * 8, tone = tones[Math.floor(roll(k + row * 7, row) * 4)];
      p.rect(x + 1, y + 1, 15, 7, tone); p.rect(x + 1, y + 1, 15, 1, '#97958b'); p.rect(x + 1, y + 7, 15, 1, '#4f4d48'); // lit on top, shaded under
      for (let s = 0; s < 5; s++) p.px(x + 2 + roll(s, k + row * 11) * 13, y + 2 + roll(k + row * 11, s) * 5, s % 2 ? '#57554f' : '#9a988e'); // flecks
    }
  for (const [x, y] of [[0, 0], [W - 1, H - 1]]) p.px(x, y, '#2a2927');
  return cv.toDataURL();
}
