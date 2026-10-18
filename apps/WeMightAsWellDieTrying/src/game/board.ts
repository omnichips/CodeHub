// A save's cities as a war-room board: pixel art drawn at 540 × 360 on a canvas and scaled up, under a hanging lamp.
// The cities are photos pinned along a red string in campaign order, over a map of the world with their pins and the
// route between them. The rest is what the story left behind: Nora's words on a sticky note, the squad's snapshot with
// the gone crossed out, the day on a calendar, Reyes's notebook. What can be pressed is an invisible button over its
// drawing, so a keyboard and a screen reader find it too: each city, the menu tag, the requisitions clipboard (the
// skill tree), the notebook (the story), the field manual, the settings sticky note and the radio. Hovered, a thing lifts into the light and a
// city shows its index card; on a touch screen the first tap shows the card and the second opens the city.
import { MAPS, perSoldier, profile, unlocked } from '../meta/profile.ts';
import { BAYER, Pen } from '../story/draw.ts';
import { measure } from '../story/font.ts';
import { squadPhoto, PHOTO } from '../story/faces.ts';
import { glow, roll, skyline } from '../story/kit.ts';
import { story } from '../story/record.ts';
import { STORY } from '../story/storyConfig.ts';
import { DEPARTURES, MEMBERS, type Member } from '../story/types.ts';
import { el } from './hud.ts';
import { brickTile } from './paper.ts';
import { play } from './sound.ts';

const BW = 540, BH = 360;
const CW = 54, CH = 54; // a city's photo card
const CARD_Y = [206, 176, 200, 172, 190, 164, 150, 132, 112]; // the string rises left to right, toward the White House
const cardX = (k: number) => 14 + k * 57;
const PW = 48, PHH = 32; // the picture on a card

const INK = '#2e2a22', FADED = '#7d7461', CREAM = '#e2dccb', RED = '#b23a30', STRING = '#b8322b';
const PINS = { held: ['#c9473a', '#f08a78', '#7a2620'], current: ['#d6a23e', '#f8dc8c', '#8a6420'], locked: ['#5f625e', '#8d918b', '#353735'] } as const;

/** Where each city is on the world map (latitude, longitude). Main Street is an anywhere town in Ohio. */
const LATLON: Record<string, [number, number]> = {
  'main-street': [39.9, -82.9], chicago: [41.9, -87.6], 'new-york': [40.7, -74], manila: [14.6, 121], mexico: [19.4, -99.1],
  rome: [41.9, 12.5], tokyo: [35.7, 139.7], london: [51.5, -0.1], 'white-house': [38.9, -77],
};
/** The world in 6° cells, 60 across and 30 down from the pole: each row's runs of land (first and last column). */
const LAND: [number, number][][] = [
  [], [[13, 17], [19, 25], [32, 33], [46, 48]], [[9, 18], [19, 26], [32, 32], [39, 40], [44, 51]],
  [[2, 7], [8, 18], [19, 25], [34, 36], [37, 58]], [[1, 7], [8, 14], [16, 19], [21, 23], [26, 27], [31, 59]],
  [[5, 7], [8, 13], [15, 19], [29, 30], [31, 33], [34, 56]], [[8, 20], [28, 29], [30, 52], [53, 53]],
  [[9, 19], [29, 36], [38, 52], [53, 54]], [[9, 17], [28, 30], [32, 33], [34, 50], [51, 51], [52, 54]],
  [[10, 16], [28, 35], [36, 50], [52, 52]], [[11, 14], [16, 16], [27, 36], [37, 40], [41, 50]],
  [[12, 15], [16, 17], [27, 36], [37, 39], [42, 44], [46, 48]], [[14, 16], [27, 38], [42, 43], [46, 48], [50, 51]],
  [[16, 21], [27, 38], [43, 43], [47, 47], [51, 51]], [[17, 22], [29, 37], [46, 47], [48, 49], [50, 50]],
  [[17, 25], [31, 37], [46, 47], [48, 49], [52, 54]], [[17, 25], [32, 36], [47, 49], [52, 55]],
  [[18, 25], [32, 36], [38, 38], [52, 54]], [[19, 24], [32, 36], [38, 38], [49, 55]], [[19, 23], [32, 35], [49, 55]],
  [[19, 22], [33, 34], [49, 55]], [[19, 21], [54, 54], [58, 58]], [[19, 20], [57, 57]], [[19, 20]], [[20, 20]], [],
  [], [], [[0, 8], [16, 20], [26, 59]], [[0, 59]],
];
const MAP_X = 150, MAP_Y = 36, MAP_W = 240, MAP_H = 120;
const onMap = (id: string) => { const [lat, lon] = LATLON[id]; return [MAP_X + Math.round(((lon + 180) / 360) * MAP_W), MAP_Y + Math.round(((90 - lat) / 180) * MAP_H)]; };

export interface BoardActions {
  play(id: string): void;
  back(): void;
  tree(): void;
  story(): void;
  settings(): void;
  manual(): void; // the field manual
  /** A city's picture as the old cards had it (painted on demand: costly, so asked for one a frame). */
  thumb(id: string): HTMLCanvasElement;
}

interface Thing { id: string; label: string; x: number; y: number; w: number; h: number; draw(pen: Pen, lift: number, t: number): void; press(): void; off?: boolean }

const fmt = (n: number) => n.toLocaleString('en-US');

export function board(act: BoardActions): HTMLElement {
  const s = profile.save, rows = story.maps;
  const state = (k: number) => (s.cleared[MAPS[k].id] ? 'held' : unlocked(k) ? 'current' : 'locked');
  const current = MAPS.findIndex((_, k) => state(k) === 'current');
  const row = rows[current >= 0 ? current : rows.length - 1];
  const gone = new Set<string>(DEPARTURES.slice(0, MEMBERS.length - (row?.squad ?? MEMBERS.length)));

  const canvas = el('canvas', { width: BW, height: BH, ariaHidden: 'true' }), c = canvas.getContext('2d')!, pen = new Pen(c);
  c.imageSmoothingEnabled = false;
  const stage = el('div', { className: 'stage' }, canvas), root = el('div', { className: 'board' }, stage);
  root.style.setProperty('--brick', `url(${brickTile()})`);
  const fixed = paintFixed(), light = paintLight();
  const pics: (HTMLCanvasElement | undefined)[] = [];

  // ---- What can be pressed ----
  const things: Thing[] = MAPS.map((m, k) => ({
    id: m.id, label: `${k + 1}. ${m.name}: ${state(k) === 'held' ? 'held' : state(k) === 'current' ? 'current mission' : `locked, clear ${MAPS[k - 1]?.name} first`}`,
    x: cardX(k), y: CARD_Y[k], w: CW, h: CH, off: state(k) === 'locked',
    draw: (p, lift, t) => card(p, k, lift, t), press: () => act.play(m.id),
  }));
  things.push(
    { id: 'back', label: 'Back to the main menu', x: 14, y: 66, w: 44, h: 16, draw: backTag, press: act.back },
    { id: 'tree', label: 'Skill tree', x: 14, y: 266, w: 104, h: 84, draw: clipboard, press: act.tree },
    { id: 'story', label: 'Story', x: 126, y: 288, w: 66, h: 58, draw: notebook, press: act.story },
    { id: 'radio', label: 'Radio', x: 474, y: 258, w: 58, h: 90, draw: radio, press: () => { play('police'); setTimeout(() => play('static'), 380); } },
    { id: 'settings', label: 'Settings', x: 476, y: 194, w: 46, h: 46, draw: settingsNote, press: act.settings },
    { id: 'manual', label: 'Field manual', x: 386, y: 294, w: 38, h: 46, draw: manualBook, press: act.manual },
  );
  const lift = new Map(things.map((x) => [x.id, 0]));
  let hover: string | undefined, touch = false;
  for (const th of things) {
    const b = el('button', { type: 'button', className: 'hit', ariaLabel: th.label, title: th.label });
    if (th.off) b.setAttribute('aria-disabled', 'true');
    Object.assign(b.style, { left: `${(th.x / BW) * 100}%`, top: `${(th.y / BH) * 100}%`, width: `${(th.w / BW) * 100}%`, height: `${(th.h / BH) * 100}%` });
    b.onpointerdown = (e) => { touch = e.pointerType === 'touch'; };
    b.onpointerenter = (e) => { if (e.pointerType !== 'touch') hover = th.id; };
    b.onpointerleave = (e) => { if (e.pointerType !== 'touch' && hover === th.id) hover = undefined; };
    b.onfocus = () => { hover = th.id; };
    b.onblur = () => { if (hover === th.id) hover = undefined; };
    b.onclick = () => {
      // A city on a touch screen: the first tap shows its card, the second opens it.
      if (touch && MAPS.some((m) => m.id === th.id) && hover !== th.id) { hover = th.id; return; }
      if (!th.off) th.press();
    };
    stage.append(b);
  }

  // ---- Each frame: the board, the string, what moves; the lamp's light over it; what is lit over that ----
  const motes = Array.from({ length: 34 }, (_, k) => ({ x: roll(k, 1), y: roll(k, 2), v: 0.012 + roll(k, 3) * 0.02, ph: roll(k, 4) * 6 }));
  let last = performance.now(), flicker = 0, loaded = 0;
  const frame = (now: number) => {
    if (!root.isConnected) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000), t = now / 1000;
    last = now;
    // The pictures, one a frame.
    if (loaded < MAPS.length) { pics[loaded] = small(act.thumb(MAPS[loaded].id), state(loaded) === 'locked'); loaded++; }
    for (const [id, v] of lift) lift.set(id, v + ((hover === id ? 1 : 0) - v) * Math.min(1, dt * 14));
    if (flicker <= 0 && Math.random() < dt * 0.12) flicker = 0.05 + Math.random() * 0.15; // the bulb catches now and then
    flicker -= dt;

    c.clearRect(0, 0, BW, BH);
    c.drawImage(fixed, 0, 0);
    route(t);
    // The lamp swings a little on its cord: its pool of light (and so every shadow on the board) sways with it.
    const swing = Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.008, sway = swing * 120;
    c.drawImage(light, -LIGHT_PAD + sway, -LIGHT_PAD + Math.abs(swing) * 20);
    if (flicker > 0) pen.dither(0, 0, BW, BH, 0.25, '#060403');
    // Everything that cannot be pressed sits under a dark veil; what can be pressed is drawn over it, so it stands out.
    c.fillStyle = 'rgba(6, 4, 3, 0.2)';
    c.fillRect(0, 0, BW, BH);
    const lit = hover ? things.find((x) => x.id === hover) : undefined;
    for (const th of things) if (th !== lit) th.draw(pen, lift.get(th.id)!, t);
    strings(t);
    // Lit over the lamp's light: the current city's glow, the thing hovered, the bulb, the radio's LED, dust and a moth.
    if (current >= 0) { const y = CARD_Y[current] - Math.round(lift.get(MAPS[current].id)! * 3); glow(pen, cardX(current) + CW / 2, y + CH / 2, 40, '#f5c060', 0.28 + Math.sin(t * 2.4) * 0.06); }
    // A card drawn over the string covers where it crosses it, so the string is drawn again over it, up to its pin.
    const litCity = lit ? MAPS.findIndex((m) => m.id === lit.id) : -1;
    if (lit) { lit.draw(pen, lift.get(lit.id)!, t); if (litCity >= 0) { strings(t, litCity); indexCard(litCity); } }
    if (current >= 0 && lit?.id !== MAPS[current].id) { card(pen, current, lift.get(MAPS[current].id)!, t, true); strings(t, current); }
    c.save(); c.translate(270, 0); c.rotate(swing); c.translate(-270, 0); // swung from where its cord hangs
    lamp(flicker > 0);
    c.restore();
    if (Math.floor(t * 1.4) % 2 === 0) { pen.led(474 + 46, 262 + 9, 3, 2, '#ff3b2e'); pen.led(474 + 47, 262 + 9, 1, 1, '#ffb0a0'); }
    for (const m of motes) {
      m.y = (m.y + m.v * dt) % 1;
      const y = 16 + m.y * 200, spread = 10 + m.y * 130, x = 270 + (m.x * 2 - 1) * spread + Math.sin(t * 0.7 + m.ph) * 4;
      c.globalAlpha = 0.25 + 0.45 * (1 - m.y);
      pen.lit(x, y, 1, 1, '#f6e6b8');
    }
    c.globalAlpha = 1;
    const mx = 270 + Math.cos(t * 2.3) * 22 + Math.sin(t * 7.1) * 3, my = 28 + Math.sin(t * 3.1) * 7;
    pen.rect(mx, my, 1, 1, '#4a4033'); pen.rect(mx + (Math.floor(t * 18) % 2 ? -1 : 1), my - (Math.floor(t * 18) % 2), 1, 1, '#d8cdb0');
  };
  requestAnimationFrame(frame);
  return root;

  // ---- The city cards ----
  /** City `k`'s card: its picture, its name and number, its pin; HELD stamped on it once held. `glowing`: the current
   *  city drawn again over the light, so it reads as the one under the lamp. */
  function card(p: Pen, k: number, lift: number, t: number, glowing = false) {
    const st = state(k), x = cardX(k), up = Math.round(lift * 3), y = CARD_Y[k] - up;
    if (!glowing) p.dither(x + 2 + up, CARD_Y[k] + 3 + up, CW, CH, 0.5 + lift * 0.2, '#120a05');
    p.rect(x, y, CW, CH, st === 'locked' ? '#bdb6a2' : CREAM);
    p.rect(x, y + CH - 1, CW, 1, '#a59d86'); p.rect(x + CW - 1, y, 1, CH, '#b9b19a');
    const pic = pics[k];
    if (pic) p.c.drawImage(pic, x + 3, y + 3); else { p.rect(x + 3, y + 3, PW, PHH, '#2a2b2c'); p.dither(x + 3, y + 3, PW, PHH, 0.2 + 0.1 * Math.sin(t * 6), '#55585a'); }
    // Its number in a black box, its name on the strip.
    p.rect(x + 4, y + 4, 7, 9, '#141516'); p.text(String(k + 1), x + 5 + (k + 1 === 1 ? 1 : 0), y + 5, '#e2dccb');
    const name = MAPS[k].name, nw = measure(name, 'person');
    p.text(name, x + Math.round((CW - nw) / 2), y + 39, st === 'locked' ? FADED : INK);
    if (st === 'held') {
      for (let d = 0; d < 8; d++) { p.rect(x + 42 + d, y + 5 + d, 2, 1, RED); p.rect(x + 49 - d, y + 5 + d, 2, 1, RED); } // the red X in the corner
      p.c.globalAlpha = 0.85;
      p.rect(x + 27, y + 24, 25, 12, RED); p.rect(x + 29, y + 26, 21, 8, '#e9d6c4'); p.text('HELD', x + 30, y + 26, RED);
      p.c.globalAlpha = 1;
    }
    if (st === 'current') {
      // The note stuck on it, fluttering.
      const f = Math.sin(t * 2.2 + 1) > 0.6 ? 1 : 0;
      p.dither(x + 32, y + 7, 28, 13, 0.5, '#120a05');
      p.rect(x + 30, y + 4 - f, 28, 14 + f, '#c9b44c'); p.rect(x + 30, y + 4 - f, 28, 13, '#e0cc62'); p.text('NEXT', x + 33, y + 7 - f, '#5a4a14');
    }
    const [col, hi, dark] = PINS[st];
    pin(p, x + CW / 2, y + 1, col, hi, dark, lift);
  }

  /** The index card under (or over) a hovered city: how it stands, how heavy it is, and its page of the notebook. */
  function indexCard(k: number) {
    const m = MAPS[k], st = state(k), e = s.story.notebook[m.id];
    const lines = [
      st === 'held' ? 'Held' : st === 'current' ? 'Current mission' : 'Locked',
      st === 'locked' ? `Clear ${MAPS[k - 1].name} first` : `${perSoldier(k)} per soldier`,
      ...(e ? [`had ${fmt(e.needed)} · got ${e.got === null ? e.gotLabel ?? '?' : fmt(e.got)}`] : []),
      ...(e?.note && e.note !== 'names' ? [e.note] : []),
    ];
    const w = Math.max(...lines.map((l) => measure(l, 'person'))) + 12, h = lines.length * 10 + 8;
    const cx = Math.max(12, Math.min(BW - 12 - w, cardX(k) + CW / 2 - w / 2)), below = CARD_Y[k] + CH + 4;
    const cy = below + h < 348 ? below : CARD_Y[k] - h - 6;
    pen.dither(cx + 2, cy + 2, w, h, 0.6, '#0a0604');
    pen.rect(cx, cy, w, h, '#efe9d6');
    for (let ly = cy + 13; ly < cy + h - 2; ly += 10) pen.rect(cx + 2, ly, w - 4, 1, '#bcc9d6'); // ruled
    pen.rect(cx, cy + 3, w, 1, '#d98f86');
    lines.forEach((l, i) => pen.text(l, cx + 6, cy + 4 + i * 10, i === 0 ? (st === 'held' ? RED : st === 'current' ? '#8a5a10' : FADED) : INK));
  }

  // ---- The red string, card to card, sagging and swaying a little ----
  /** All the string, or (`only`) just the two lengths that meet at one city's pin. */
  function strings(t: number, only?: number) {
    const at = (k: number) => [cardX(k) + CW / 2, CARD_Y[k] + 1 - Math.round(lift.get(MAPS[k].id)! * 3)];
    for (let k = 0; k < MAPS.length - 1; k++) {
      if (only !== undefined && k !== only && k + 1 !== only) continue;
      const [x0, y0] = at(k), [x1, y1] = at(k + 1), sag = 5 + Math.sin(t * 0.9 + k * 1.7) * 1;
      const n = Math.ceil(Math.abs(x1 - x0) + Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + sag * 4 * u * (1 - u);
        c.globalAlpha = 0.35;
        pen.rect(x + 1, y + 2, 1, 1, '#100804');
        c.globalAlpha = 1;
        pen.rect(x, y, 1, 1, i % 5 === 0 ? '#d24a40' : STRING);
      }
    }
  }

  /** The route on the world map: done in solid red, the leg to the current city marching, the rest dotted. */
  function route(t: number) {
    for (let k = 0; k < MAPS.length - 1; k++) {
      const [x0, y0] = onMap(MAPS[k].id), [x1, y1] = onMap(MAPS[k + 1].id), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      const done = state(k + 1) === 'held', next = k + 1 === current;
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n - Math.sin((i / n) * Math.PI) * Math.min(10, n / 10);
        if (done) pen.rect(x, y, 1, 1, '#8e2a22');
        else if (next) { if ((i + Math.floor(t * 10)) % 4 < 2) pen.rect(x, y, 1, 1, '#c0392b'); }
        else if (i % 4 === 0) pen.rect(x, y, 1, 1, '#8a7b58');
      }
    }
    MAPS.forEach((m, k) => {
      const [x, y] = onMap(m.id), [col, hi] = PINS[state(k)];
      pen.rect(x, y + 1, 3, 2, '#2a1a10'); pen.rect(x - 1, y - 1, 3, 3, col); pen.px(x - 1, y - 1, hi); pen.px(x + 1, y + 1, '#2a1a10');
      if (k === current) {
        const r = 2 + ((t * 4) % 5);
        for (let a = 0; a < 16; a++) pen.px(x + Math.round(Math.cos((a / 16) * Math.PI * 2) * r), y + Math.round(Math.sin((a / 16) * Math.PI * 2) * r * 0.8), r < 5 ? '#d6a23e' : '#b08a3a');
      }
    });
  }

  // ---- The other things to press ----
  function backTag(p: Pen, lift: number) {
    const y = 66 - Math.round(lift * 2);
    p.dither(16, 68, 44, 16, 0.5, '#120a05');
    p.rect(14, y, 44, 16, '#c9a86a'); p.rect(14, y + 15, 44, 1, '#9c7f48'); p.rect(14, y, 1, 16, '#b0904e');
    for (let k = 0; k < 4; k++) p.rect(20 + k, y + 8 - k, 1, 1 + k * 2, INK); // an arrow pointing back
    p.rect(21, y + 7, 7, 1, INK);
    p.text('MENU', 30, y + 4, INK);
    pin(p, 54, y + 2, ...PINS.held, lift);
  }

  function clipboard(p: Pen, lift: number, t: number) {
    const x = 14, y = 268 - Math.round(lift * 3);
    p.dither(x + 3, 271, 104, 80, 0.55, '#120a05');
    p.rect(x, y, 104, 80, '#6b4728'); p.rect(x + 1, y + 1, 102, 78, '#7d5530'); p.rect(x, y + 79, 104, 1, '#3d2614');
    for (let k = 0; k < 9; k++) p.rect(x + 4 + roll(k, 9) * 94, y + 3 + roll(k, 8) * 74, 6 + roll(k, 7) * 10, 1, '#6d4a29'); // wood grain
    p.rect(x + 5, y + 8, 94, 69, '#ece5d0'); p.rect(x + 5, y + 76, 94, 1, '#c2b998');
    p.text('REQUISITIONS', x + 9, y + 12, INK);
    p.rect(x + 9, y + 21, 56, 1, INK);
    p.text('Skill tree', x + 9, y + 25, '#2f4a6a');
    p.text(`${fmt(s.chips)} chips`, x + 9, y + 36, RED);
    for (let k = 0; k < 3; k++) {
      p.rect(x + 9, y + 49 + k * 8, 5, 5, INK); p.rect(x + 10, y + 50 + k * 8, 3, 3, '#ece5d0');
      if (k !== 1) { p.px(x + 10, y + 51 + k * 8, '#2f4a6a'); p.px(x + 11, y + 52 + k * 8, '#2f4a6a'); p.px(x + 12, y + 51 + k * 8, '#2f4a6a'); p.px(x + 13, y + 50 + k * 8, '#2f4a6a'); }
      scribble(p, x + 17, y + 51 + k * 8, 60 - k * 9, 1, FADED, k + 40);
    }
    // The clip.
    p.rect(x + 36, y - 4, 32, 10, '#7f868a'); p.rect(x + 37, y - 3, 30, 3, '#b5bcc0'); p.rect(x + 46, y - 6, 12, 3, '#5f6669'); p.rect(x + 36, y + 5, 32, 1, '#454b4e');
    // Hovered, the sheet's bottom right corner curls up, as a hand about to turn to the next page: the page under it
    // shows, the curled flap (the sheet's back) folds over, lit along the fold.
    const n = Math.round(lift * 22 + Math.sin(t * 3) * lift * 1.5);
    if (n < 2) return;
    const x2 = x + 99, y2 = y + 77; // one past the sheet's corner
    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++) {
        const px = x2 - n + u, py = y2 - n + v, d = u + v;
        if (d >= n) p.px(px, py, d === n ? '#a99f80' : (py - y) % 5 === 0 ? '#c3ccd2' : '#e3dbc3'); // the next page, ruled
        else if (d >= n - 1) p.px(px, py, '#f8f3e4'); // the fold
        else if (u >= 1 && v >= 1) p.px(px, py, d > n * 0.6 ? '#d9d0b4' : d > n * 0.3 ? '#cfc6a8' : '#c2b996'); // the flap, darker toward its tip
      }
    for (let k = 1; k < n; k++) p.px(x2 - n + k - 1, y2 - k, '#8a7f60'); // the flap's shadow on the sheet
  }

  /** Reyes's notebook. Hovered, its cover swings open from the spine, a little: narrower as it turns toward you, its
   *  free edge nearer and so taller, the lined first page showing under it. */
  function notebook(p: Pen, lift: number) {
    const x = 126, y = 290;
    p.dither(x + 3, 293, 66, 56, 0.55, '#120a05');
    // The pages under the cover, and their edges along the right and the bottom.
    p.rect(x + 2, y + 1, 62, 53, '#d8ceb2'); p.rect(x + 2, y + 1, 61, 51, '#ece4cc');
    for (let ly = y + 9; ly < y + 50; ly += 5) p.rect(x + 6, ly, 54, 1, '#b9c4cc');
    p.rect(x + 12, y + 1, 1, 51, '#d9a0a0'); // the margin
    for (let k = 0; k < 7; k++) scribble(p, x + 16, y + 8 + k * 5, 44 - (k % 3) * 6, 1, k % 3 === 1 ? '#a0453a' : '#5a5040', 60 + k); // his pencil, page after page of it
    const open = Math.min(1, lift) * 0.28, cw = Math.max(8, Math.round(62 * (1 - open))), grow = Math.round(open * 7);
    // The cover's shadow on the page, soft.
    [0.35, 0.22, 0.12, 0.05].forEach((a, k) => { p.c.globalAlpha = a * lift; p.rect(x + cw + k, y + 1, 1, 52, '#1a0f08'); });
    p.c.globalAlpha = 1;
    for (let i = 0; i < cw; i++) {
      const g = Math.round((grow * i) / cw), sx = Math.min(61, Math.floor((i * 62) / cw));
      p.c.drawImage(cover(), sx, 0, 1, 54, x + i, y - g, 1, 54 + g * 2);
    }
    // Its label, kept whole (squeezing pixel letters garbles them), riding where it sits on the turning cover.
    const lx = x + Math.round((10 * cw) / 62), lg = Math.round((grow * (lx - x + 18)) / cw);
    p.rect(lx, y + 18 - lg, 36, 14, '#d9cfb0'); p.rect(lx, y + 31 - lg, 36, 1, '#a89c78'); p.text('STORY', lx + 5, y + 21 - lg, INK);
    if (lift > 0.02) { p.c.globalAlpha = open * 0.6; p.rect(x + cw - 3, y - grow, 3, 54 + grow * 2, '#100a06'); p.c.globalAlpha = 1; } // its edge turning out of the light
    if (lift < 0.05) p.rect(x + 52, y, 3, 54, '#16100c'); // the elastic band, slipped off when it opens
    // The pencil beside it.
    p.rect(x + 2, y - 5, 46, 3, '#d6a23e'); p.rect(x + 2, y - 5, 46, 1, '#f0c868'); p.rect(x + 48, y - 5, 4, 3, '#e8d2a8'); p.px(x + 52, y - 4, '#3a3428'); p.rect(x - 2, y - 5, 4, 3, '#c97a8a');
  }

  /** Settings: a pink sticky note with a gear drawn on it, which turns while it is hovered. */
  function settingsNote(p: Pen, lift: number, t: number) {
    gearTurn += Math.min(0.1, Math.max(0, t - gearAt)) * 2.2 * lift;
    gearAt = t;
    const x = 476, y = 196 - Math.round(lift * 2), w = 46, h = 44;
    p.dither(x + 2, 199, w, h, 0.55, '#120a05');
    p.rect(x, y, w, h, '#e59aa6'); p.rect(x, y, w, 6, '#d68794'); // the sticky strip along its top
    p.rect(x + w - 5, y + h - 5, 5, 5, '#c97a87'); p.px(x + w - 1, y + h - 1, '#5e3f24'); // a curled corner
    // The gear: eight teeth, a hub, a hole.
    const gx = x + 23, gy = y + 18;
    for (let dy = -9; dy <= 9; dy++)
      for (let dx = -9; dx <= 9; dx++) {
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + gearTurn, tooth = ((((a / (Math.PI * 2)) * 8) % 1) + 1) % 1 < 0.45;
        if (r < 2.3) continue;
        if (r <= 5.6 || (tooth && r <= 8.4)) p.px(gx + dx, gy + dy, r > 4.6 && !(tooth && r > 5.6) ? '#5a2a34' : dx + dy < 0 ? '#8a4452' : '#6e3440');
      }
    p.text('SETTINGS', x + 3, y + 31, '#4a1e28');
    pin(p, x + 23, y + 2, ...PINS.held, lift);
  }

  /** The field manual: a little spiral notepad tucked against the squad's snapshot, its kraft back showing, wire rings
   *  along the top, FIELD MANUAL pencilled on the top page. Hovered, it lifts and the top page flips up over the rings:
   *  under it, a zombie sketched and how many pages are filled in. */
  function manualBook(p: Pen, lift: number) {
    const x = 388, y = 298 - Math.round(lift * 2), w = 34, h = 40;
    p.dither(x + 3, 301, w, h, 0.55, '#120a05');
    p.rect(x + 2, y + 2, w, h, '#a8875a'); p.rect(x + 2, y + h + 1, w, 1, '#7a6040'); // the kraft back, peeking out
    const page = (top: number, hh: number) => { p.rect(x, top, w, hh, '#f6f3ea'); p.rect(x + w - 1, top, 1, hh, '#d8d2c0'); for (let ly = top + 6; ly < top + hh - 2; ly += 4) p.rect(x + 2, ly, w - 4, 1, '#c3cbd2'); };
    page(y + 3, h - 2); p.rect(x, y + h, w, 1, '#c6bfa8'); // the pages under
    // Under the top page: a zombie in pencil, arms out, and the count.
    p.rect(x + 6, y + 10, 4, 4, '#5a5040'); p.rect(x + 5, y + 15, 6, 10, '#5a5040'); p.rect(x + 11, y + 16, 6, 2, '#5a5040'); p.rect(x + 5, y + 25, 2, 7, '#5a5040'); p.rect(x + 9, y + 25, 2, 7, '#5a5040');
    const met = profile.save.met.filter((k) => k !== 'turret').length;
    p.text(String(met), x + 20, y + 22, RED);
    // The top page, flipping up from the bottom as it lifts.
    const hh = Math.max(0, Math.round((h - 2) * (1 - lift * 0.85)));
    if (hh > 0) {
      page(y + 3, hh);
      if (hh > 26) { p.text('FIELD', x + 4, y + 9, INK); p.text('MANUAL', x + 2, y + 18, INK); }
      if (hh < h - 3) p.rect(x, y + 3 + hh, w, 1, '#9a9280'); // its edge, turned up
    }
    // The wire rings along the top.
    for (let rx = x + 2; rx < x + w - 2; rx += 4) { p.rect(rx, y, 2, 1, '#1c1c1c'); p.rect(rx, y + 1, 1, 4, '#1c1c1c'); p.rect(rx + 2, y + 1, 1, 4, '#3a3a3a'); p.px(rx + 1, y + 4, '#8a8a8a'); }
  }

  function radio(p: Pen, lift: number, t: number) {
    const x = 474, y = 262, wob = lift > 0.05 ? Math.sin(t * 9) * lift * 3 : Math.sin(t * 0.8) * 0.6;
    // The antenna.
    for (let k = 0; k < 40; k++) p.px(x + 50 + Math.round((wob * k) / 40), y - k, k % 8 === 0 ? '#2a2c2a' : '#7f868a');
    p.rect(x + 49 + Math.round(wob) , y - 41, 3, 2, '#2a2c2a');
    p.dither(x + 3, y + 3, 58, 86, 0.55, '#120a05');
    p.rect(x, y, 58, 86, '#353a24'); p.rect(x + 1, y + 1, 56, 84, '#4a5032'); p.rect(x + 1, y + 1, 56, 1, '#5f6640');
    p.rect(x + 6, y - 4, 20, 5, '#2a2e1c'); p.rect(x + 9, y - 2, 14, 2, '#4a5032'); // the handle
    p.rect(x + 5, y + 6, 34, 11, '#1a1c14'); p.text('0400', x + 9, y + 8, '#d6a23e', 'jec'); // the frequency: Nora's hour
    p.rect(x + 44, y + 7, 7, 6, '#1a1c14');
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 9; gx++) p.rect(x + 7 + gx * 5, y + 24 + gy * 5, 2, 2, '#23261a'); // the speaker
    for (const [kx, ky] of [[12, 60], [32, 60]]) { p.rect(x + kx - 4, y + ky - 4, 9, 9, '#1a1c14'); p.rect(x + kx - 3, y + ky - 3, 7, 7, '#2e3220'); p.px(x + kx, y + ky - 3 + (Math.floor(t / 3) % 2), '#c9c3a6'); }
    p.text('PRC', x + 40, y + 57, '#8f9670');
    p.rect(x + 5, y + 74, 48, 6, '#2e3220'); p.text('NORA', x + 18, y + 74 - 1, '#8f9670');
  }

  // ---- The lamp over the board ----
  function lamp(dim: boolean) {
    pen.rect(269, 0, 2, 4, '#151515');
    pen.rect(264, 3, 12, 3, '#3e4441'); pen.px(265, 3, '#7d8781');
    for (let r = 0; r < 11; r++) {
      const w = 18 + r * 5;
      pen.rect(270 - w / 2, 5 + r, w, 1, r === 10 ? '#9aa29c' : r < 3 ? '#3e4441' : '#4c5450');
      pen.px(270 - w / 2, 5 + r, '#7d8781'); pen.px(270 - w / 2 + 1, 5 + r, '#646d68'); pen.px(269 + w / 2, 5 + r, '#262a28'); if (r > 2 && r < 9) pen.px(262 - r * 2, 5 + r, '#8e9893'); // the shine on its side
    }
    pen.rect(250, 16, 40, 1, dim ? '#8a7650' : '#f6dc96');
    pen.lit(263, 16, 14, 2, dim ? '#b8a070' : '#fff6d0');
    if (!dim) glow(pen, 270, 18, 26, '#ffe9a8', 0.45);
  }

  // ---- Painted once: the wall, the frame, the cork, the world map and every paper that never moves ----
  function paintFixed() {
    const cv = el('canvas', { width: BW, height: BH }), g = cv.getContext('2d')!, p = new Pen(g);
    // (The wall behind the board is the brick the page paints, index.html .board: this canvas is clear round the frame.)
    // The frame.
    p.rect(4, 10, 532, 346, '#3a2516'); p.rect(5, 11, 530, 344, '#5a3a22'); p.rect(5, 11, 530, 1, '#8a6238'); p.rect(5, 11, 1, 344, '#74502e');
    p.rect(8, 14, 524, 338, '#3a2516');
    // The cork: specks of five browns, and a few darker blotches.
    const cork = ['#8a6236', '#7a5530', '#9b7040', '#6d4a2a', '#a8804c'];
    const img = g.getImageData(10, 16, 520, 334), d = img.data;
    for (let i = 0; i < 520 * 334; i++) {
      const x = i % 520, y = (i / 520) | 0, blot = Math.sin(x * 0.031 + Math.sin(y * 0.05) * 2) * Math.cos(y * 0.027 + x * 0.004);
      let k = Math.floor(roll(x, y) * 5);
      if (blot > 0.7 && roll(y, x) < 0.5) k = 3;
      const v = cork[k];
      d[i * 4] = parseInt(v.slice(1, 3), 16); d[i * 4 + 1] = parseInt(v.slice(3, 5), 16); d[i * 4 + 2] = parseInt(v.slice(5, 7), 16); d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 10, 16);
    p.rect(10, 16, 520, 1, '#3d2716'); p.rect(10, 16, 1, 334, '#4d321d');
    // Old pin holes.
    for (let k = 0; k < 70; k++) p.px(12 + roll(k, 11) * 516, 18 + roll(k, 12) * 330, '#3a2516');

    // The world map, taped up.
    paper(p, 136, 22, 268, 146, '#cdbb8e', 3);
    p.text('THEATRE OF OPERATIONS', 150, 25, '#5a4f36');
    world(p);
    p.rect(MAP_X - 1, MAP_Y - 1, MAP_W + 2, 1, '#7a6a48'); p.rect(MAP_X - 1, MAP_Y + MAP_H, MAP_W + 2, 1, '#7a6a48');
    p.rect(MAP_X - 1, MAP_Y, 1, MAP_H, '#7a6a48'); p.rect(MAP_X + MAP_W, MAP_Y, 1, MAP_H, '#7a6a48');
    tape(p, 130, 18, 16, 8); tape(p, 394, 18, 16, 8); tape(p, 130, 160, 14, 8); tape(p, 396, 160, 14, 8);
    p.text('fig. 1', 360, 158, '#7a6a48');

    // The plaque: the operation, under the save's name.
    p.dither(17, 23, 116, 40, 0.55, '#120a05');
    p.rect(14, 20, 116, 40, '#24301f'); p.rect(15, 21, 114, 38, '#2f3a2c'); p.rect(15, 21, 114, 1, '#4a5a44'); p.rect(15, 58, 114, 1, '#1a2216');
    for (const [bx, by] of [[17, 23], [126, 23], [17, 56], [126, 56]]) { p.rect(bx, by, 2, 2, '#8a8f84'); p.px(bx, by, '#c0c4ba'); }
    skull(p, 21, 27);
    p.text('OPERATION', 40, 25, '#9aa58c');
    let name = s.name.toUpperCase();
    while (measure(name, 'person') > 84 && name.length > 1) name = name.slice(0, -1);
    p.text(name, 40, 35, '#e3dcc0');
    p.text('EYES ONLY', 40, 46, '#7d8a6c');

    // Orders, and a sticky note over its corner.
    paper(p, 14, 88, 104, 78, '#d9cfb0', 5);
    p.text('ORDERS', 20, 92, INK); p.rect(20, 100, 32, 1, INK);
    ['1. Hold the line', '2. Get them out', '3. Count them', "4. Don't look back"].forEach((l, i) => p.text(l, 20, 105 + i * 10, i === 3 ? FADED : INK));
    clip(p, 18, 84);
    sticky(p, 86, 128, 44, 34, ['Count', 'them', 'twice.'], 1);

    // The legend.
    paper(p, 406, 22, 60, 38, '#e2dccb', 7);
    (['held', 'current', 'locked'] as const).forEach((st, i) => { const [col, hi] = PINS[st]; p.rect(411, 28 + i * 10, 3, 3, col); p.px(411, 28 + i * 10, hi); p.text(['Held', 'Current', 'Locked'][i], 418, 26 + i * 10, INK); });
    pinStatic(p, 436, 23);

    // The calendar: the day of the city on now.
    paper(p, 472, 20, 54, 46, '#e9e3d0', 9);
    p.rect(472, 20, 54, 11, '#9c2f28'); p.text('DAY', 488, 22, '#f2e6d6');
    big(p, String(row?.day ?? 1), 499, 34, INK);
    for (let k = 0; k < 6; k++) p.px(476 + k * 9, 20, '#3a2516'); // the torn-off stubs

    // A photo of a skyline.
    p.dither(474, 73, 56, 40, 0.5, '#120a05');
    p.rect(471, 70, 56, 40, '#d8d2bf');
    g.save(); g.translate(474, 73); g.beginPath(); g.rect(0, 0, 50, 26); g.clip();
    p.rect(0, 0, 50, 26, '#3a4248'); p.rect(0, 0, 50, 8, '#4a545a'); skyline(p, 50, 26, '#1c2226', 21, 18, 0.12);
    g.restore();
    p.text(row?.place.slice(0, 9) ?? '', 474, 100, FADED);
    tape(p, 488, 66, 20, 6);

    // Supplies.
    paper(p, 200, 262, 62, 60, '#ddd4b8', 13);
    p.text('SUPPLY', 206, 266, INK); p.rect(206, 274, 28, 1, INK);
    [['ammo', true], ['fuel', false], ['meds', false], ['comms', true]].forEach(([l, ok], i) => {
      p.text(String(l), 206, 278 + i * 10, INK);
      const cx = 248, cy = 281 + i * 10;
      if (ok) { p.px(cx, cy + 1, '#2f6a3a'); p.px(cx + 1, cy + 2, '#2f6a3a'); p.px(cx + 2, cy + 1, '#2f6a3a'); p.px(cx + 3, cy, '#2f6a3a'); p.px(cx + 4, cy - 1, '#2f6a3a'); }
      else for (let k = 0; k < 4; k++) { p.px(cx + k, cy - 1 + k, RED); p.px(cx + 3 - k, cy - 1 + k, RED); }
    });
    pinStatic(p, 230, 263);

    // Nora's words.
    sticky(p, 268, 270, 40, 36, ['We still', 'need', 'you.'], 2);

    // The compass.
    compass(p, 286, 330);

    // The squad's snapshot, the one the story ends each city on (story/faces.ts), the gone crossed out: drawn as the
    // cutscene draws it, cut out of that picture and pinned up smaller.
    const shot = el('canvas', { width: STORY.W, height: STORY.H }), ph = PHOTO.ih + 21, sw = 98, sh = Math.round((sw * ph) / PHOTO.w);
    squadPhoto(new Pen(shot.getContext('2d')!), 99, [...gone] as Member[], []);
    p.dither(315, 262, sw, sh, 0.55, '#120a05');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(shot, PHOTO.x, STORY.TOP + 10, PHOTO.w, ph, 312, 259, sw, sh);
    g.imageSmoothingEnabled = false;
    tape(p, 352, 254, 18, 7);

    // The newspaper.
    paper(p, 414, 196, 56, 94, '#cfc6ad', 17);
    p.text('THE DAILY', 419, 199, INK); p.rect(417, 208, 50, 1, INK); p.rect(417, 210, 50, 1, INK);
    p.text('CITIES', 418, 213, INK); p.text('FALL', 418, 222, INK);
    p.rect(446, 214, 21, 18, '#6a6656'); p.dither(446, 214, 21, 18, 0.4, '#3a372e'); for (let k = 0; k < 5; k++) p.rect(448 + k * 4, 226 - (k % 3), 2, 6 + (k % 3), '#2a2822');
    for (let col = 0; col < 2; col++) scribble(p, 418 + col * 25, 236, 22, 12, '#6b6250', 30 + col);
    for (let a = 0; a < 40; a++) p.px(454 + Math.round(Math.cos((a / 40) * Math.PI * 2) * 13), 262 + Math.round(Math.sin((a / 40) * Math.PI * 2) * 9), RED); // circled in red
    pinStatic(p, 442, 197);
    return cv;
  }

  /** The world, roughened at the coasts, on map paper with its grid. */
  function world(p: Pen) {
    const cell = (cx: number, cy: number) => cy >= 0 && cy < 30 && cx >= 0 && cx < 60 && LAND[cy].some(([a, b]) => cx >= a && cx <= b);
    const land = new Uint8Array(MAP_W * MAP_H);
    for (let py = 0; py < MAP_H; py++)
      for (let px = 0; px < MAP_W; px++) {
        const cx = px >> 2, cy = py >> 2, ex = px & 3, ey = py & 3, r = roll(px, py);
        // At a cell's edge, now and then take the neighbouring cell's land or sea: coasts, not squares.
        const r2 = roll(py, px);
        let on = cell(cx, cy);
        if (ex === 0 && r < 0.35) on = cell(cx - 1, cy);
        else if (ex === 3 && r < 0.35) on = cell(cx + 1, cy);
        else if (ey === 0 && r2 < 0.35) on = cell(cx, cy - 1);
        else if (ey === 3 && r2 < 0.35) on = cell(cx, cy + 1);
        land[py * MAP_W + px] = on ? 1 : 0;
      }
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && land[y * MAP_W + x] === 1;
    for (let py = 0; py < MAP_H; py++)
      for (let px = 0; px < MAP_W; px++) {
        const on = at(px, py), edge = at(px - 1, py) !== on || at(px + 1, py) !== on || at(px, py - 1) !== on || at(px, py + 1) !== on;
        let col = on ? (roll(px >> 1, py >> 1) < 0.5 ? '#7b8450' : '#717a49') : (px % 20 === 0 || py % 20 === 0) && (px + py) % 2 === 0 ? '#ad9b6e' : '#c9b78a';
        if (on && edge) col = '#545c36';
        else if (!on && edge) col = '#b9a679';
        if (!on && BAYER[(px & 3) + (py & 3) * 4] < (py / MAP_H) * 3) col = '#c2b083'; // the paper browned toward the bottom
        p.px(MAP_X + px, MAP_Y + py, col);
      }
  }

  function paper(p: Pen, x: number, y: number, w: number, h: number, col: string, seed: number) {
    p.dither(x + 3, y + 3, w, h, 0.55, '#120a05');
    p.rect(x, y, w, h, col);
    p.rect(x, y + h - 1, w, 1, '#a3987a'); p.rect(x + w - 1, y, 1, h, '#b3a887');
    for (let k = 0; k < (w * h) / 60; k++) p.px(x + roll(k, seed) * w, y + roll(seed, k) * h, '#bfb393'); // age spots
    for (let k = 0; k < w; k += 1) if (roll(k, seed * 3) < 0.18) p.px(x + k, y, '#7a5530'); // a torn top edge
  }
  function sticky(p: Pen, x: number, y: number, w: number, h: number, lines: string[], seed: number) {
    p.dither(x + 2, y + 3, w, h, 0.55, '#120a05');
    p.rect(x, y, w, h, '#d9c55a'); p.rect(x, y, w, 5, '#cbb84e'); p.rect(x + w - 4, y + h - 4, 4, 4, '#b8a440'); p.px(x + w - 1, y + h - 1, '#7a5530');
    lines.forEach((l, i) => p.text(l, x + 4 + (i === 1 && seed === 2 ? 3 : 0), y + 7 + i * 9, '#3a3418'));
  }
  function tape(p: Pen, x: number, y: number, w: number, h: number) {
    p.c.globalAlpha = 0.6;
    p.rect(x, y, w, h, '#ddd8c0');
    p.c.globalAlpha = 1;
    for (let k = 0; k < h; k += 2) { p.px(x - 1, y + k, '#ddd8c0'); p.px(x + w, y + k + 1, '#ddd8c0'); } // torn ends
  }
  function clip(p: Pen, x: number, y: number) { p.rect(x, y, 3, 12, '#9aa0a4'); p.rect(x + 1, y + 1, 1, 10, '#5a6064'); p.rect(x + 3, y + 2, 2, 1, '#9aa0a4'); }
  function pinStatic(p: Pen, x: number, y: number) { pin(p, x, y, ...PINS.held, 0); }
  function scribble(p: Pen, x: number, y: number, w: number, lines: number, col: string, seed: number) {
    for (let l = 0; l < lines; l++)
      for (let at = 0, k = 0; at < w - (l === lines - 1 ? w / 3 : 0); k++) {
        const wl = 2 + Math.floor(roll(k + l * 31, seed) * 7);
        p.rect(x + at, y + l * 4, Math.min(wl, w - at), 1, col);
        at += wl + 2;
      }
  }
  function compass(p: Pen, x: number, y: number) {
    for (let a = 0; a < 32; a++) p.px(x + Math.round(Math.cos((a / 32) * Math.PI * 2) * 12), y + Math.round(Math.sin((a / 32) * Math.PI * 2) * 12), '#3a2516');
    for (let k = 1; k < 11; k++) { p.px(x, y - k, k > 5 ? '#3a2516' : '#5a3a22'); p.px(x, y + k, '#3a2516'); p.px(x - k, y, '#3a2516'); p.px(x + k, y, '#3a2516'); }
    p.rect(x - 1, y - 9, 3, 3, '#9c2f28');
    p.text('N', x - 1, y - 23, '#3a2516');
  }
  function skull(p: Pen, x: number, y: number) {
    const rows = ['..#####..', '.#######.', '#########', '##..#..##', '##..#..##', '#########', '.###.###.', '..#####..', '..#.#.#..'];
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') p.px(x + i, y + j + 2, '#c9c3a6'); }));
  }
  function big(p: Pen, text: string, cx: number, y: number, col: string) {
    const w = measure(text, 'person'), tmp = el('canvas', { width: w + 1, height: 10 });
    new Pen(tmp.getContext('2d')!).text(text, 0, 0, col);
    p.c.drawImage(tmp, Math.round(cx - w), y, (w + 1) * 2, 20);
  }
}

let coverArt: HTMLCanvasElement | undefined;
/** The notebook's cover, drawn once: it is stretched column by column as it opens. */
const cover = () => (coverArt ??= (() => {
  const cv = el('canvas', { width: 62, height: 54 }), q = new Pen(cv.getContext('2d')!);
  q.rect(0, 0, 62, 54, '#3b2a1f'); q.rect(2, 2, 58, 50, '#4a3526');
  for (let k = 0; k < 56; k += 3) { q.px(3 + k, 3, '#6b5038'); q.px(3 + k, 50, '#6b5038'); } // stitching
  q.rect(0, 0, 2, 54, '#2a1d15'); // the spine
  return cv;
  })());

let gearTurn = 0, gearAt = 0; // the settings note's gear: how far it has turned, and when it was last drawn

/** A thumbtack: a round head lit from the top left, its shadow on the cork growing as it lifts. */
function pin(p: Pen, x: number, y: number, col: string, hi: string, dark: string, lift: number) {
  x = Math.round(x); y = Math.round(y);
  p.c.globalAlpha = 0.45;
  p.rect(x - 1 + Math.round(lift * 2), y + 2 + Math.round(lift * 2), 4, 2, '#0a0503');
  p.c.globalAlpha = 1;
  p.rect(x - 1, y - 1, 3, 4, dark); p.rect(x - 2, y, 5, 2, dark);
  p.rect(x - 1, y - 1, 3, 3, col); p.px(x - 1, y - 1, hi); p.px(x, y - 1, hi);
}

/** A city's picture cut down to fit its card; grey and dim while the city is locked. */
function small(src: HTMLCanvasElement, grey: boolean) {
  const out = el('canvas', { width: PW, height: PHH }), g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const sh = (src.width * PHH) / PW;
  g.drawImage(src, 0, (src.height - sh) / 2, src.width, sh, 0, 0, PW, PHH);
  if (grey) {
    const img = g.getImageData(0, 0, PW, PHH), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.8 + 24; d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(img, 0, 0);
  }
  return out;
}

/** The lamp's light: bright under it, falling off to the board's edges, in ordered-dither steps like the art. */
const LIGHT_PAD = 16; // the light's picture is this much bigger each way, so it can sway without its edge showing
function paintLight() {
  const LW = BW + 2 * LIGHT_PAD, LH = BH + 2 * LIGHT_PAD;
  const cv = el('canvas', { width: LW, height: LH }), g = cv.getContext('2d')!, img = g.createImageData(LW, LH), d = img.data;
  for (let y = 0; y < LH; y++)
    for (let x = 0; x < LW; x++) {
      const r = Math.hypot((x - LIGHT_PAD - 270) / 360, (y - LIGHT_PAD - 120) / 270), dark = Math.max(0, Math.min(1, (r - 0.35) / 0.8));
      const steps = 7, f = dark * steps, lo = Math.floor(f), level = (lo + (BAYER[(x & 3) + (y & 3) * 4] < (f - lo) * 16 ? 1 : 0)) / steps;
      const i = (y * LW + x) * 4;
      if (level > 0) { d[i] = 8; d[i + 1] = 5; d[i + 2] = 3; d[i + 3] = Math.round(level * 0.6 * 255); }
      else { d[i] = 255; d[i + 1] = 214; d[i + 2] = 140; d[i + 3] = Math.round(Math.max(0, 0.3 - r) * 0.5 * 255); } // warm right under the lamp
    }
  g.putImageData(img, 0, 0);
  return cv;
}
