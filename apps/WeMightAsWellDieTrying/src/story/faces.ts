// The story's portraits: 32 × 32 pixel art, a bust with the head turned a little toward the words, a bold dark outline,
// flat shading in two or three tones, lit from the top left; in a wooden frame. Each face is a grid of whole pixels:
// a head top (cap, hair, knitted hat or helmet) over a shared head and shoulders, then the person's own touches
// (moustache, beard, stubble, glasses, a bun, an earring), then the eyes, brows and mouth of the mood being spoken in
// (the script's [tags]). The radio, JEC and the loudspeaker stay things, not faces. The squad's snapshot, shown after
// every city with an X over whoever has gone, is made of the same busts, laughing.
import { Pen } from './draw.ts';
import { idle2, roll } from './kit.ts';
import { STORY } from './storyConfig.ts';
import type { Member, Mood } from './types.ts';

type Ramp = [dark: string, base: string, light: string];
const LINE = '#1c1614', BAND = '#141516', GOLD = '#c4a058', WHITE = '#e8e4da', MOUTH = '#3a1a18', TEAR = '#9ec4e0';
const SKINS: Record<'dark' | 'mid' | 'light', Ramp> = {
  dark: ['#4e3a2c', '#6e5240', '#86654e'], mid: ['#7d5e48', '#97735a', '#ae8a6c'], light: ['#9c7a62', '#b8957a', '#cfae92'],
};
const HAIR: Record<string, Ramp> = {
  brown0: ['#22170f', '#3f2d20', '#5f4431'], brown1: ['#3f2d20', '#5f4431', '#836048'], grey: ['#5e6462', '#8a908e', '#b6bab4'],
  white: ['#8a908e', '#b6bab4', '#dcddd3'], blond: ['#5c5440', '#7f7556', '#a49873'], black: ['#0c0d0e', '#24252a', '#3e4046'],
};
const CLOTH: Record<string, Ramp> = {
  navy0: ['#11141e', '#1f2536', '#2f3a54'], navy1: ['#1f2536', '#2f3a54', '#475675'], navy2: ['#2f3a54', '#475675', '#5f6f90'],
  cloth0: ['#1f252c', '#333c47', '#4b5664'], cloth1: ['#333c47', '#4b5664', '#66717e'], maroon: ['#3d1a1f', '#5e2830', '#80404a'],
  white: ['#8a908e', '#b6bab4', '#dcddd3'], hivis: ['#7a521c', '#ad7a2a', '#d6a23e'], olive: ['#2f3520', '#48512f', '#65703f'],
  red: ['#6e2620', '#9c372c', '#c45a48'],
};

// ---- The grid, built from runs of pixels (shoulders, neck, head, then what is on the head), and a one-pixel outline
// traced round all of it. Letters: K k V hat (base, light, peak), B band, g gold; H h J hair (base, light, dark);
// s S L skin (base, shade, light); c C l coat (base, shade, light), w collar, T tie, G badge, R the radio mic ----
type Grid = string[][];
type Runs = Record<number, [number, number]>;
const run = (g: Grid, y: number, x0: number, x1: number, ch: string) => { for (let x = x0; x <= x1; x++) if (g[y]?.[x] !== undefined) g[y][x] = ch; };
const runs = (g: Grid, rows: Runs, ch: string) => { for (const [y, [a, b]] of Object.entries(rows)) run(g, +y, a, b, ch); };
const at = (g: Grid, pts: number[][], ch: string) => { for (const [x, y] of pts) run(g, y, x, x, ch); };
/** The head, turned a little to the right (its nose at x 24), row by row. */
const HEAD: Runs = { 9: [9, 23], 10: [8, 23], 11: [8, 23], 12: [8, 23], 13: [8, 24], 14: [8, 24], 15: [9, 23], 16: [9, 23], 17: [10, 23], 18: [10, 22], 19: [11, 22], 20: [12, 21], 21: [13, 20] };
const COAT: Runs = { 23: [6, 22], 24: [4, 24], 25: [3, 25], 26: [2, 26], 27: [1, 27], 28: [1, 27], 29: [1, 27], 30: [1, 27], 31: [1, 27] };
const CROWN: Runs = { 2: [12, 18], 3: [10, 20], 4: [9, 21], 5: [8, 22], 6: [8, 22], 7: [8, 22] };
const HAIR_TOP: Runs = { 2: [11, 18], 3: [9, 21], 4: [8, 22], 5: [8, 23], 6: [8, 23], 7: [8, 23], 8: [8, 23] };

function grid(f: Face): Grid {
  const g: Grid = Array.from({ length: 32 }, () => Array<string>(32).fill('.'));
  // Shoulders: the coat lit on the left shoulder, shaded on the right; the collar open on the throat; tie, badge, mic.
  runs(g, COAT, 'c');
  for (const [y, [a, b]] of Object.entries(COAT)) { if (+y > 23) run(g, +y, a, a, 'l'); run(g, +y, b - 1, b, 'C'); }
  run(g, 23, 7, 9, 'l'); run(g, 24, 5, 9, 'l');
  runs(g, { 20: [11, 15], 21: [11, 15], 22: [11, 15], 23: [11, 15] }, 'S'); run(g, 24, 12, 14, 'S');
  at(g, [[10, 23], [16, 23], [10, 24], [11, 24], [15, 24], [16, 24], [11, 25], [15, 25]], 'w');
  for (let y = 24; y < 32; y++) run(g, y, 13, 13, 'T');
  at(g, [[19, 26], [20, 26], [19, 27], [20, 27]], 'G');
  at(g, [[5, 25], [6, 25], [5, 26], [6, 26]], 'R');
  // The head: skin, the back of the jaw and under the chin in shade, the ear and its hollow, the nose catching light.
  runs(g, HEAD, 's');
  for (let y = 15; y <= 21; y++) run(g, y, HEAD[y][0], HEAD[y][0], 'S');
  run(g, 21, 13, 20, 'S'); run(g, 20, 12, 14, 'S');
  at(g, [[11, 14]], 'S'); at(g, [[23, 15]], 'S'); at(g, [[24, 13]], 'L');
  // What is on the head.
  if (f.top === 'cap') {
    runs(g, CROWN, 'K'); run(g, 3, 11, 13, 'k'); run(g, 4, 10, 11, 'k'); run(g, 5, 9, 9, 'k');
    at(g, [[16, 4], [17, 4], [16, 5], [17, 5]], 'g');
    run(g, 8, 8, 22, 'B'); run(g, 9, 10, 26, 'V'); run(g, 9, 8, 9, 'J');
    run(g, 10, 8, 9, 'J'); run(g, 10, 10, 23, 'S');
    for (let y = 11; y <= 13; y++) run(g, y, 8, 9, 'J');
  } else if (f.top === 'knit') {
    runs(g, { ...CROWN, 7: [8, 23], 8: [8, 23] }, 'K'); run(g, 3, 11, 13, 'k'); run(g, 4, 10, 11, 'k');
    for (let x = 8; x <= 23; x += 2) at(g, [[x, 7], [x, 8]], 'B');
    run(g, 9, 8, 9, 'J'); run(g, 9, 10, 23, 'S');
    for (let y = 10; y <= 13; y++) run(g, y, 8, 9, 'J');
  } else if (f.top === 'helmet') {
    runs(g, { 1: [12, 19], 2: [10, 21], 3: [9, 22], 4: [8, 23], 5: [8, 23], 6: [8, 23], 7: [8, 23], 8: [8, 23] }, 'K');
    run(g, 2, 11, 13, 'k'); run(g, 3, 10, 11, 'k');
    run(g, 5, 12, 23, 'B'); run(g, 6, 12, 23, 'B'); run(g, 5, 13, 15, 'k'); // the visor, up
    run(g, 9, 8, 11, 'K'); run(g, 9, 12, 23, 'S');
    for (let y = 10; y <= 16; y++) run(g, y, 8, 11, 'K'); // the ear cup
    at(g, [[9, 11]], 'k');
  } else {
    runs(g, HAIR_TOP, 'H');
    run(g, 9, 8, f.slick || f.bun ? 10 : 13, 'H'); run(g, 10, 8, 10, 'H');
    for (let y = 5; y <= 13; y++) run(g, y, 8, 9, 'J');
    run(g, 3, 12, 15, 'h'); run(g, 4, 11, 12, 'h'); at(g, [[10, 5]], 'h');
    if (f.slick) { at(g, [[17, 3], [17, 4], [18, 5]], 'J'); run(g, 5, 13, 16, 'h'); }
    if (f.bun) { runs(g, { 0: [6, 8], 1: [5, 9], 2: [5, 9], 3: [6, 8] }, 'H'); at(g, [[6, 1], [7, 1]], 'h'); at(g, [[8, 3]], 'J'); }
  }
  return outlined(g);
}
/** The grid with its outline: every empty pixel beside a filled one. */
function outlined(g: Grid): Grid {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++)
      if (g[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? '.') !== '.')) out[y][x] = 'O';
  return out;
}

interface Face {
  skin: keyof typeof SKINS; hair: string; top: 'cap' | 'hair' | 'knit' | 'helmet'; hat?: string; coat: string; bg: string;
  cop?: boolean; slick?: boolean; bun?: boolean; mustache?: 'thin' | 'big'; beard?: boolean; stubble?: boolean; old?: boolean;
  glasses?: boolean; freckles?: boolean; earring?: boolean; apron?: boolean; hivis?: boolean; shawl?: boolean; mic?: boolean;
}
const FACES: Record<string, Face | 'radio' | 'seal' | 'horn'> = {
  Reyes: { skin: 'mid', hair: 'brown0', top: 'cap', hat: 'navy0', coat: 'navy1', cop: true, stubble: true, bg: '#2c3846' },
  Pike: { skin: 'light', hair: 'brown1', top: 'cap', hat: 'navy1', coat: 'navy2', cop: true, freckles: true, bg: '#34404c' },
  Dunne: { skin: 'mid', hair: 'grey', top: 'cap', hat: 'navy0', coat: 'navy1', cop: true, mustache: 'big', old: true, bg: '#323844' },
  Hollis: { skin: 'light', hair: 'blond', top: 'cap', hat: 'cloth0', coat: 'cloth1', cop: true, bg: '#343b42' },
  Okoye: { skin: 'dark', hair: 'black', top: 'cap', hat: 'cloth0', coat: 'cloth1', cop: true, beard: true, bg: '#333940' },
  Vega: { skin: 'mid', hair: 'black', top: 'hair', slick: true, coat: 'cloth1', cop: true, stubble: true, earring: true, bg: '#373442' },
  Lola: { skin: 'mid', hair: 'white', top: 'hair', bun: true, coat: 'maroon', shawl: true, old: true, glasses: true, bg: '#42323a' },
  Vendor: { skin: 'dark', hair: 'black', top: 'hair', coat: 'white', apron: true, mustache: 'thin', bg: '#443a2c' },
  'Harbor master': { skin: 'mid', hair: 'white', top: 'knit', hat: 'red', coat: 'hivis', hivis: true, beard: true, old: true, bg: '#2c3a44' },
  Pilot: { skin: 'mid', hair: 'brown0', top: 'helmet', hat: 'olive', coat: 'olive', mic: true, bg: '#343a2c' },
  Nora: 'radio', Radio: 'radio', Captain: 'radio', 'South bank commander': 'radio', JEC: 'seal', Loudspeaker: 'horn',
};
const MEMBER_NAMES: Record<Member, string> = { reyes: 'Reyes', pike: 'Pike', dunne: 'Dunne', hollis: 'Hollis', okoye: 'Okoye', vega: 'Vega' };

/** How a bust is drawn this frame. */
export interface Look {
  mood: Mood; talk: boolean; t: number;
  tired?: number; // 1 to 4: Reyes's posture, the weeks under his eyes
  laugh?: boolean; // the snapshot's: eyes shut, mouth open
  signal?: number; // the radio's: 0 to 4 bars
}

/** The speaker's portrait in its wooden frame, 36 × 36 at (x, y). */
export function portrait(pen: Pen, who: string, x: number, y: number, look: Look) {
  pen.led(x, y, 36, 36, '#2a1a10');
  pen.led(x + 1, y + 1, 34, 34, '#9c6a34');
  pen.led(x + 1, y + 1, 34, 1, '#c48a48'); pen.led(x + 1, y + 1, 1, 34, '#c48a48');
  pen.led(x + 1, y + 34, 34, 1, '#6e4622'); pen.led(x + 34, y + 1, 1, 34, '#6e4622');
  const f = FACES[who] ?? 'radio';
  if (f === 'radio') return handset(pen, x + 2, y + 2, look);
  if (f === 'seal') return seal(pen, x + 2, y + 2, look);
  if (f === 'horn') return horn(pen, x + 2, y + 2, look);
  pen.rect(x + 2, y + 2, 32, 32, f.bg);
  bust(pen, f, x + 2, y + 2, look);
}

/** A face, 32 × 32 at (x, y), over whatever is there. */
function bust(pen: Pen, f: Face, x: number, y: number, o: Look) {
  const skin = SKINS[f.skin], hair = HAIR[f.hair], hat = CLOTH[f.hat ?? 'navy0'], coat = CLOTH[f.coat];
  // The grid (no tie, badge or mic off duty), painted a letter at a time.
  const g = grid(f);
  if (!f.cop) for (const r of g) for (let k = 0; k < 32; k++) if ('TGR'.includes(r[k])) r[k] = 'c';
  const COL: Record<string, string> = {
    L: skin[2],
    O: LINE, K: hat[1], k: hat[2], V: hat[0], B: f.top === 'helmet' ? '#1f2536' : f.top === 'knit' ? hat[0] : BAND, g: GOLD,
    H: hair[1], h: hair[2], J: hair[0], s: skin[1], S: skin[0], c: coat[1], C: coat[0], l: coat[2],
    w: f.cop ? coat[2] : f.coat === 'white' ? coat[2] : WHITE, T: BAND, G: GOLD, R: '#2a2c2e',
  };
  g.forEach((r, ly) => r.forEach((ch, lx) => { if (ch !== '.') pen.rect(x + lx, y + ly, 1, 1, COL[ch]); }));
  const P = (lx: number, ly: number, col: string) => pen.rect(x + lx, y + ly, 1, 1, col);
  const R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + lx, y + ly, w, h, col);

  // Clothes: an apron, a hi-vis stripe, a knitted shawl.
  if (f.apron) { R(7, 26, 13, 6, '#5f4431'); R(7, 26, 13, 1, '#836048'); R(9, 23, 1, 3, '#5f4431'); R(17, 23, 1, 3, '#5f4431'); }
  if (f.hivis) { R(2, 28, 25, 1, '#dcddd3'); R(2, 29, 25, 1, '#8a908e'); P(14, 25, '#dcddd3'); P(14, 26, '#8a908e'); } // and a whistle
  if (f.shawl) for (let k = 0; k < 8; k++) P(3 + k * 3, 25 + (k % 2) * 3, coat[2]);
  // The person's own: stubble, a beard, freckles, the lines of age, an earring, a boom mic.
  // Stubble: the jaw a flat shade greyer than the skin (no speckle). A beard: solid, darker along its bottom edge.
  const mix = (a: string, b: string, q: number) => '#' + [1, 3, 5].map((k) => Math.round(parseInt(a.slice(k, k + 2), 16) * (1 - q) + parseInt(b.slice(k, k + 2), 16) * q).toString(16).padStart(2, '0')).join('');
  if (f.stubble) for (let ly = 18; ly < 21; ly++) for (let lx = 14; lx < 23; lx++) if (g[ly][lx] === 's') P(lx, ly, mix(skin[1], hair[0], 0.3));
  if (f.beard) for (let ly = 17; ly < 22; ly++) for (let lx = 11; lx < 24; lx++) if (g[ly][lx] === 's' || g[ly][lx] === 'S') P(lx, ly, ly === 21 || g[ly + 1]?.[lx] === 'O' ? hair[0] : hair[1]);
  if (f.freckles) for (const [lx, ly] of [[15, 16], [17, 16], [22, 15]]) P(lx, ly, skin[0]);
  if (f.old) { P(23, 13, skin[0]); P(18, 17, skin[0]); }
  if (f.earring) P(10, 16, GOLD);
  if (f.mic) { for (const [lx, ly] of [[12, 17], [13, 18], [14, 18], [15, 19], [16, 19]]) P(lx, ly, LINE); P(17, 19, '#3a3d40'); }

  // Eyes and brows by mood. The far eye is at x 16, the near one at x 21, both on rows 13 and 14; brows on row 12.
  const brow = f.hair === 'white' || f.hair === 'grey' ? hair[1] : hair[0], eyes = LINE;
  const blink = (o.t * 1000 + roll(f.bg.length, f.coat.length) * 4000) % 4200 < 130, mood = o.mood;
  const brows: Record<Mood, [number, number][]> = {
    neutral: [[15, 12], [16, 12], [20, 12], [21, 12], [22, 12]], happy: [[15, 12], [16, 11], [20, 12], [21, 11], [22, 12]],
    sad: [[15, 12], [16, 11], [20, 11], [21, 12], [22, 12]], worried: [[15, 12], [16, 11], [20, 11], [21, 12], [22, 12]],
    angry: [[15, 11], [16, 12], [20, 12], [21, 11], [22, 11]], shocked: [[15, 11], [16, 11], [20, 11], [21, 11], [22, 11]],
    stern: [[15, 12], [16, 12], [17, 12], [20, 12], [21, 12], [22, 12]],
  };
  for (const [lx, ly] of brows[mood]) P(lx, ly, brow);
  if (f.old) for (const [lx, ly] of brows[mood]) if (lx !== 17) P(lx, ly - 1, brow); // bushy
  if (o.laugh || blink) { P(16, 14, eyes); P(21, 14, eyes); if (o.laugh) { P(15, 13, eyes); P(20, 13, eyes); P(22, 13, eyes); } }
  else if (mood === 'shocked') { R(15, 13, 2, 2, WHITE); R(21, 13, 2, 2, WHITE); P(16, 14, eyes); P(21, 14, eyes); }
  else if (mood === 'sad') { P(16, 13, skin[0]); P(21, 13, skin[0]); P(16, 14, eyes); P(21, 14, eyes); }
  else if (mood === 'angry') { P(16, 13, eyes); P(21, 13, eyes); P(16, 14, eyes); P(21, 14, eyes); P(17, 13, skin[0]); P(20, 13, skin[0]); }
  else if (mood === 'happy') { P(16, 13, eyes); P(21, 13, eyes); P(16, 14, skin[0]); P(21, 14, skin[0]); }
  else { P(16, 13, eyes); P(21, 13, eyes); P(16, 14, eyes); P(21, 14, eyes); }
  if (!o.laugh && !blink && mood !== 'shocked' && mood !== 'happy') P(22, 13, WHITE); // the near eye's white
  if (f.glasses) { const G = '#7a6a58'; R(14, 12, 4, 1, G); R(20, 12, 4, 1, G); P(14, 13, G); P(17, 13, G); P(20, 13, G); P(23, 13, G); R(14, 15, 4, 1, G); R(20, 15, 4, 1, G); R(18, 13, 2, 1, G); }
  if ((o.tired ?? 1) >= 2) { P(16, 15, skin[0]); P(21, 15, skin[0]); }
  if ((o.tired ?? 1) >= 3) { P(15, 15, skin[0]); P(22, 15, skin[0]); }
  if (mood === 'sad' && !o.laugh) pen.lit(x + 21, y + 15, 1, 2, TEAR);
  if (mood === 'worried') pen.lit(x + 23, y + 11, 1, 2, TEAR);

  // The mouth by mood, shut or open on the talking frames; a moustache over it.
  const M = MOUTH, talk = o.talk || !!o.laugh;
  const mouths: Record<Mood, [number, number, string][]> = {
    neutral: talk ? [[19, 18, M], [20, 18, M], [19, 19, M], [20, 19, M]] : [[19, 18, M], [20, 18, M]],
    happy: talk ? [[18, 17, M], [21, 17, M], [18, 18, M], [19, 18, WHITE], [20, 18, WHITE], [21, 18, M], [19, 19, M], [20, 19, M]] : [[18, 17, M], [19, 18, M], [20, 18, M], [21, 17, M]],
    sad: talk ? [[18, 19, M], [19, 18, M], [20, 18, M], [21, 19, M], [19, 19, M], [20, 19, M]] : [[18, 19, M], [19, 18, M], [20, 18, M], [21, 19, M]],
    angry: talk ? [[18, 18, M], [19, 18, WHITE], [20, 18, WHITE], [21, 18, M], [18, 19, M], [19, 19, M], [20, 19, M], [21, 19, M]] : [[18, 18, M], [19, 18, WHITE], [20, 18, WHITE], [21, 18, M]],
    worried: talk ? [[19, 18, M], [20, 18, M], [19, 19, M], [20, 19, M], [21, 18, M]] : [[18, 19, M], [19, 18, M], [20, 19, M], [21, 18, M]],
    shocked: talk ? [[19, 18, M], [20, 18, M], [19, 19, M], [20, 19, M], [19, 20, M], [20, 20, M]] : [[19, 18, M], [20, 18, M], [19, 19, M], [20, 19, M]],
    stern: talk ? [[18, 18, M], [19, 18, M], [20, 18, M], [21, 18, M], [19, 19, M], [20, 19, M]] : [[18, 18, M], [19, 18, M], [20, 18, M], [21, 18, M]],
  };
  for (const [lx, ly, col] of mouths[o.laugh ? 'happy' : mood]) P(lx, ly, col);
  if (f.mustache === 'big') { R(18, 16, 6, 1, hair[1]); P(19, 16, hair[2]); P(17, 17, hair[1]); P(18, 17, hair[0]); P(22, 17, hair[0]); P(23, 17, hair[1]); }
  if (f.mustache === 'thin') R(19, 17, 4, 1, hair[0]);
}

/** A handset: grille, push-to-talk, the LED lit while the voice comes through, and its signal bars (fewer when the
 *  news is bad, flickering when the signal fails). */
function handset(pen: Pen, x: number, y: number, o: Look) {
  const R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + lx, y + ly, w, h, col);
  R(0, 0, 32, 32, '#1a2026');
  R(19, 0, 2, 4, LINE);
  R(9, 3, 14, 27, LINE); R(10, 4, 12, 25, 'metal1'); R(10, 4, 12, 1, 'metal2'); R(10, 4, 1, 25, 'metal2'); R(21, 5, 1, 24, 'metal0');
  R(7, 10, 2, 7, LINE); R(8, 11, 1, 5, 'metal2');
  if (o.talk && idle2(o.t * 2)) pen.led(x + 12, y + 6, 2, 2, '#ff5040'); else R(12, 6, 2, 2, 'maroon0');
  for (let k = 0; k < 4; k++) R(12, 9 + k * 2, 8, 1, LINE);
  R(12, 18, 8, 5, '#0b1513');
  const bars = Math.max(0, Math.min(4, (o.signal ?? 4) - (o.talk && Math.random() < 0.15 ? 1 : 0)));
  for (let b = 0; b < 4; b++) pen.lit(x + 13 + b * 2, y + 21 - b, 1, b + 1, b < bars ? '#78c0b4' : '#1d2a28');
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) R(12 + c * 3, 24 + r * 2, 2, 1, 'metal2');
  R(15, 30, 2, 2, LINE);
}

const STAR = ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '##.....##'];
/** The Joint Evacuation Command's seal: a gold-ringed disc, lettering round it, a star that lights as it speaks. */
function seal(pen: Pen, x: number, y: number, o: Look) {
  pen.rect(x, y, 32, 32, '#161b26');
  for (let ly = 0; ly < 32; ly++)
    for (let lx = 0; lx < 32; lx++) {
      const d = Math.hypot(lx - 15.5, ly - 15.5), a = Math.atan2(ly - 15.5, lx - 15.5);
      const col = d > 14.5 ? '' : d > 13.5 ? LINE : d > 12.5 ? GOLD : d > 9.5 ? (Math.floor((a + Math.PI) * 6) % 3 === 0 && d > 10.5 && d < 12 ? GOLD : 'navy1') : d > 8.5 ? GOLD : 'navy2';
      if (col) pen.rect(x + lx, y + ly, 1, 1, col);
    }
  const lit = o.talk && idle2(o.t * 2);
  STAR.forEach((row, ly) => [...row].forEach((c, lx) => { if (c === '#') (lit ? pen.led.bind(pen) : pen.rect.bind(pen))(x + 12 + lx, y + 12 + ly, 1, 1, lit ? '#eadfae' : 'snow1'); }));
}

/** A loudspeaker horn on its pole, a paper label on the pole, sound coming off it. */
function horn(pen: Pen, x: number, y: number, o: Look) {
  const R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(x + lx, y + ly, w, h, col);
  R(0, 0, 32, 32, '#1c2024');
  R(7, 15, 2, 17, LINE);
  R(3, 8, 7, 8, LINE); R(4, 9, 5, 6, 'metal1');
  for (let k = 0; k < 12; k++) { const h = 5 + k, ly = 12 - Math.floor(k / 2); R(10 + k, ly - 1, 1, h + 2, LINE); R(10 + k, ly, 1, h, k === 11 ? 'metal2' : 'metal1'); }
  R(5, 21, 5, 5, 'snow2'); R(6, 23, 3, 1, LINE);
  if (o.talk) for (let k = 0; k < 2; k++) if ((Math.floor(o.t * 6) + k) % 3 !== 0) R(25 + k * 3, 8 - k * 2, 1, 12 + k * 4, 'snow0');
}

// ---- The squad's snapshot: the six of them in the station's pantry before any of it, fooling about; an X in red
// marker over each one gone ----
type Pose = 'wave' | 'ears' | 'mug' | 'stand' | 'belly' | 'crossed';
/** One of the squad standing, 20 × 45, facing out: cap or hair, face, uniform, arms by pose, legs, shoes. */
function figure(pen: Pen, f: Face, x: number, y: number, pose: Pose, laugh: boolean) {
  const g: Grid = Array.from({ length: 46 }, () => Array<string>(20).fill('.'));
  const skin = SKINS[f.skin], hair = HAIR[f.hair], hat = CLOTH[f.hat ?? 'navy0'], coat = CLOTH[f.coat];
  // Body: uniform shirt lit left, shaded right; collar, tie, badge, belt; trousers; shoes.
  runs(g, { 14: [5, 14], 15: [4, 15], 16: [4, 15], 17: [4, 15], 18: [4, 15], 19: [4, 15], 20: [4, 15], 21: [4, 15], 22: [4, 15], 23: [4, 15], 24: [4, 15], 25: [4, 15], 26: [4, 15], 27: [4, 15] }, 'c');
  for (let r = 15; r < 28; r++) { run(g, r, 4, 4, 'l'); run(g, r, 15, 15, 'C'); }
  run(g, 14, 8, 11, 'S'); at(g, [[7, 14], [12, 14], [8, 15], [11, 15]], 'w');
  for (let r = 15; r < 24; r++) run(g, r, 9, 10, 'T');
  at(g, [[12, 17], [13, 17]], 'G');
  run(g, 24, 4, 15, 'B'); at(g, [[9, 24], [10, 24]], 'g');
  for (let r = 28; r < 43; r++) { run(g, r, 5, 8, 'P'); run(g, r, 11, 14, 'P'); }
  run(g, 28, 9, 10, 'P'); run(g, 29, 9, 10, 'P');
  run(g, 43, 4, 8, 'B'); run(g, 44, 4, 8, 'B'); run(g, 43, 11, 15, 'B'); run(g, 44, 11, 15, 'B');
  // Arms by pose.
  const arm = (side: 'l' | 'r', down: boolean) => {
    const [a, b] = side === 'l' ? [2, 3] : [16, 17];
    if (down) { for (let r = 15; r < 26; r++) run(g, r, a, b, 'c'); run(g, 26, a, b, 's'); run(g, 27, a, b, 's'); }
  };
  if (pose === 'wave') { for (let r = 4; r < 16; r++) run(g, r, 2, 3, 'c'); run(g, 2, 2, 3, 's'); run(g, 3, 2, 3, 's'); arm('r', true); }
  else if (pose === 'ears') arm('l', true); // the right arm is up behind Dunne (drawn with him)
  else if (pose === 'mug') { arm('l', true); for (let r = 15; r < 21; r++) run(g, r, 16, 17, 'c'); run(g, 20, 12, 17, 'c'); run(g, 21, 12, 17, 'c'); run(g, 19, 12, 13, 's'); }
  else if (pose === 'belly') { for (let r = 15; r < 22; r++) { run(g, r, 2, 3, 'c'); run(g, r, 16, 17, 'c'); } run(g, 21, 4, 8, 'c'); run(g, 22, 4, 8, 'c'); run(g, 21, 11, 15, 'c'); run(g, 22, 11, 15, 'c'); run(g, 21, 8, 11, 's'); run(g, 22, 8, 11, 's'); }
  else if (pose === 'crossed') { for (let r = 15; r < 20; r++) { run(g, r, 2, 3, 'c'); run(g, r, 16, 17, 'c'); } for (let r = 18; r < 21; r++) run(g, r, 2, 17, 'c'); at(g, [[4, 19], [15, 18]], 's'); run(g, 18, 3, 16, 'C'); }
  else { arm('l', true); arm('r', true); }
  // Head: face, ears, neck; a cap or hair.
  runs(g, { 6: [6, 13], 7: [6, 13], 8: [6, 13], 9: [6, 13], 10: [6, 13], 11: [7, 12], 12: [8, 11] }, 's');
  for (let r = 7; r < 12; r++) run(g, r, 13, 13, 'S');
  at(g, [[5, 8], [14, 8], [5, 9], [14, 9]], 's'); run(g, 13, 8, 11, 'S');
  if (f.top === 'cap') {
    runs(g, { 0: [7, 12], 1: [6, 13], 2: [5, 14], 3: [5, 14] }, 'K'); at(g, [[6, 1], [7, 1], [6, 2]], 'k'); at(g, [[9, 1], [10, 1], [9, 2], [10, 2]], 'g');
    run(g, 4, 5, 14, 'B'); run(g, 5, 4, 15, 'V'); run(g, 6, 6, 13, 'S'); at(g, [[5, 6], [5, 7], [14, 6], [14, 7]], 'H');
  } else { runs(g, { 1: [7, 12], 2: [6, 13], 3: [5, 14], 4: [5, 14], 5: [5, 14] }, 'H'); at(g, [[5, 6], [5, 7], [14, 6], [14, 7]], 'H'); run(g, 2, 7, 9, 'h'); if (f.slick) at(g, [[11, 2], [11, 3]], 'J'); }
  const out = outlined(g);
  const COL: Record<string, string> = {
    O: LINE, K: hat[1], k: hat[2], V: hat[0], B: BAND, g: GOLD, H: hair[1], h: hair[2], J: hair[0], s: skin[1], S: skin[0],
    c: coat[1], C: coat[0], l: coat[2], w: coat[2], T: BAND, G: GOLD, P: CLOTH.navy0[1],
  };
  out.forEach((r, ly) => r.forEach((ch, lx) => { if (ch !== '.') pen.rect(x + lx, y + ly, 1, 1, COL[ch]); }));
  // The face: stubble or a beard, a moustache, eyes (screwed up laughing), a grin.
  const P = (lx: number, ly: number, col: string) => pen.rect(x + lx, y + ly, 1, 1, col);
  if (f.stubble) for (const [lx, ly] of [[7, 10], [8, 11], [11, 11], [12, 10], [9, 12], [10, 12]]) P(lx, ly, skin[0]);
  if (f.beard) { for (const [r, a, b] of [[10, 6, 13], [11, 7, 12], [12, 8, 11]]) for (let lx = a; lx <= b; lx++) P(lx, r, hair[1]); }
  if (laugh) { P(7, 8, LINE); P(8, 8, LINE); P(11, 8, LINE); P(12, 8, LINE); } else { P(8, 8, LINE); P(11, 8, LINE); }
  if (laugh) { for (const lx of [8, 9, 10, 11]) P(lx, 10, MOUTH); P(9, 11, MOUTH); P(10, 11, MOUTH); P(9, 10, WHITE); P(10, 10, WHITE); }
  else { P(8, 10, MOUTH); P(9, 11, MOUTH); P(10, 11, MOUTH); P(11, 10, MOUTH); }
  if (f.mustache === 'big') { for (let lx = 7; lx <= 12; lx++) P(lx, 9, hair[1]); P(7, 10, hair[1]); P(12, 10, hair[1]); }
}

const CREW: [Member, number, Pose, boolean][] = [
  ['hollis', 10, 'wave', true], ['pike', 40, 'ears', true], ['dunne', 70, 'mug', false],
  ['reyes', 100, 'stand', false], ['okoye', 130, 'belly', true], ['vega', 164, 'crossed', false],
];
const FEET = 44; // where they stand in the photo, from its top (their tops; the floor is under their shoes)
/** When each new X starts being drawn, seconds into the shot (one after another). */
export const xAt = (k: number) => 1.4 + k * 1.1;
/** Where the snapshot lies in the shot, and its picture inside its border (the war-room board pins up the same one). */
export const PHOTO = { x: 53, w: 214, iw: 204, ih: 92 };

export function squadPhoto(pen: Pen, t: number, gone: Member[], fresh: Member[]) {
  const top = STORY.TOP, ph = STORY.H - STORY.TOP - STORY.BAR, stage = pen.stage;
  // The desk it lies on.
  pen.rect(0, top, STORY.W, ph, '#2a1f17');
  for (let k = 0; k < 26; k++) pen.rect(0, top + Math.floor(roll(k, 7) * ph), STORY.W, 1, roll(k, 8) < 0.5 ? '#241a13' : '#31251b');
  const px = PHOTO.x, py = top + 10, ix = px + 5, iy = py + 5, R = (lx: number, ly: number, w: number, h: number, col: string) => pen.rect(ix + lx, iy + ly, w, h, col);
  pen.rect(px + 3, py + 3, PHOTO.w, PHOTO.ih + 21, '#120d09');
  pen.stage = 1; // the snapshot keeps its colour: it is from before
  pen.rect(px, py, PHOTO.w, PHOTO.ih + 21, '#e4dfd2');
  // The pantry: a pale green wall, cupboards over a counter (the coffee machine, a microwave, the mugs), a window with
  // the blinds half down, the fridge, a strip light, the lino floor in squares.
  R(0, 0, PHOTO.iw, PHOTO.ih, '#7d8f86'); R(0, 0, PHOTO.iw, 2, '#6a7a72');
  R(40, 1, 60, 2, '#eef0e6');
  R(2, 6, 116, 22, '#2a1e14'); for (let k = 0; k < 4; k++) { R(3 + k * 29, 7, 27, 20, '#8a6440'); R(3 + k * 29, 7, 27, 1, '#a07a50'); R(26 + k * 29, 16, 2, 3, GOLD); }
  R(2, 50, 118, 2, '#2a1e14'); R(2, 52, 118, 26, '#6a4a32'); R(2, 48, 118, 3, '#b6bab4'); R(2, 48, 118, 1, '#dcddd3');
  for (let k = 0; k < 4; k++) { R(4 + k * 29, 55, 26, 20, '#7a5a3a'); R(4 + k * 29 + 12, 63, 2, 3, GOLD); }
  R(14, 34, 14, 14, '#24252a'); R(16, 36, 10, 5, '#3a3d40'); R(24, 37, 1, 1, '#ff5040'); R(17, 42, 8, 6, '#5f4431'); R(17, 42, 8, 1, '#8a7a6a'); // the coffee machine
  R(70, 38, 22, 10, '#c8ccc8'); R(72, 40, 13, 6, '#24252a'); R(87, 41, 3, 1, '#3a3d40'); // the microwave
  for (const [mx, col] of [[40, '#c45a48'], [47, '#dcddd3'], [54, '#475675']] as const) { R(mx, 43, 5, 5, col); R(mx + 5, 44, 1, 2, col); }
  R(126, 8, 38, 30, '#2a3330'); R(128, 10, 34, 26, '#cfd8d2'); for (let k = 0; k < 6; k++) R(128, 10 + k * 3, 34, 2, '#a8a490');
  R(176, 6, 26, 72, '#2a2c2e'); R(177, 7, 24, 70, '#d8dcd6'); R(177, 30, 24, 1, '#a8aca6'); R(197, 14, 2, 10, '#8a908e'); R(197, 34, 2, 14, '#8a908e');
  R(180, 12, 6, 7, '#e6d27a'); R(188, 40, 7, 5, '#c45a48'); // notes stuck to the fridge
  for (let fy = 78; fy < PHOTO.ih; fy += 5) for (let fx = 0; fx < PHOTO.iw; fx += 5) R(fx, fy, 5, 5, (fx / 5 + (fy - 78) / 5) % 2 ? '#8a8270' : '#a49a84');
  R(0, 77, PHOTO.iw, 1, '#4a4436');
  // The six of them. Pike's arm goes up behind Dunne, his two fingers over Dunne's cap.
  const face = (m: Member) => FACES[MEMBER_NAMES[m]] as Face, pike = face('pike');
  const [, pkx] = CREW[1], [, dnx] = CREW[2];
  // His sleeve from his shoulder up to just over Dunne's cap (outlined in one pass, filled in the next), then Dunne in
  // front of it, then the hand and two fingers in a V over the cap.
  const hx = dnx + 11, hy = FEET - 2, sx0 = pkx + 16, sy0 = FEET + 15, steps = hx - sx0;
  const sleeve = (k: number) => [sx0 + k, sy0 + Math.round(((hy - sy0) * k) / steps)];
  for (let k = 0; k <= steps; k++) { const [ax, ay] = sleeve(k); R(ax - 1, ay - 1, 4, 4, LINE); }
  for (let k = 0; k <= steps; k++) { const [ax, ay] = sleeve(k); R(ax, ay, 2, 2, CLOTH[pike.coat][1]); }
  for (const [m, fx, pose, laugh] of CREW) figure(pen, face(m), ix + fx, iy + FEET, pose, laugh);
  R(hx - 1, hy - 1, 5, 4, LINE); R(hx, hy, 3, 2, SKINS.light[1]);
  for (const [fx, lean] of [[0, -1], [2, 1]]) for (let k = 1; k <= 4; k++) { const ex = hx + fx + (k > 2 ? lean : 0); R(ex - 1, hy - k - 1, 3, 3, LINE); }
  for (const [fx, lean] of [[0, -1], [2, 1]]) for (let k = 0; k <= 4; k++) R(hx + fx + (k > 2 ? lean : 0), hy - k, 1, 1, SKINS.light[1]);
  // Dunne's mug, steaming.
  R(dnx + 11, FEET + 15, 5, 6, LINE); R(dnx + 12, FEET + 16, 3, 4, '#dcddd3'); R(dnx + 12, FEET + 16, 3, 1, '#5f4431'); R(dnx + 15, FEET + 17, 1, 2, '#dcddd3');
  for (const [sx, sy] of [[13, 13], [12, 11], [13, 9]]) R(dnx + sx, FEET + sy, 1, 1, '#eef0e6');
  // The white border under the picture, the caption on it.
  pen.rect(px, iy + PHOTO.ih, PHOTO.w, 16, '#e4dfd2');
  pen.text('main st. pd, before.', px + 8, iy + PHOTO.ih + 4, '#4a4640');
  pen.stage = stage;
  // The Xs: the ones already gone drawn; the ones gone in this city drawn now, a stroke at a time.
  for (const m of gone) {
    const k = fresh.indexOf(m), q = k < 0 ? 1 : Math.max(0, Math.min(1, (t - xAt(k)) / 0.7));
    if (q <= 0) continue;
    const [, fx] = CREW.find(([who]) => who === m)!, cx = ix + fx + 10, cy = iy + FEET + 20;
    stroke(pen, cx - 15, cy - 20, 1, Math.min(1, q * 2));
    if (q > 0.5) stroke(pen, cx + 15, cy - 20, -1, (q - 0.5) * 2);
  }
}
/** A marker stroke down and across (30 across, 40 down), `q` of the way along, a little shaky. */
function stroke(pen: Pen, x: number, y: number, dir: 1 | -1, q: number) {
  for (let k = 0; k < 40 * q; k++) pen.led(x + dir * Math.round(k * 0.75) + Math.round(roll(k, x) - 0.5), y + k, 2, 2, '#c4362c');
}
