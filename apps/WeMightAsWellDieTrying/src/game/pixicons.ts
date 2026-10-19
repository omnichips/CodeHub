// Small pixel-art icons for the fight's controls, drawn from letter grids as SVG squares (crisp at any scale).
// One letter per pixel, '.' is empty; PAL gives the colours.
const PAL: Record<string, string> = {
  k: '#141516', w: '#f4efe0', v: '#c9c2ad', p: '#8a6a3a', q: '#5a4424', g: '#a9afb3', h: '#6f7579', j: '#dfe3e5', z: '#7fa05a',
  r: '#d8392b', x: '#556b3a', m: '#5a1a14', d: '#48512f', e: '#6b7a40', o: '#2f3520', s: '#a8d5a0', y: '#e8c24a',
};

/** A blank grid to paint into, then its rows. */
const grid = (w: number, h: number) => Array.from({ length: h }, () => Array<string>(w).fill('.'));
const rows = (g: string[][]) => g.map((r) => r.join(''));
const fill = (g: string[][], x: number, y: number, w: number, h: number, c: string) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = c; };
/** A box with a dark outline round `c`. */
const box = (g: string[][], x: number, y: number, w: number, h: number, c: string) => { fill(g, x, y, w, h, 'k'); fill(g, x + 1, y + 1, w - 2, h - 2, c); };

/** A cog: eight square-cut teeth, a sunken hub ring round the hole, lit from the top left. `turn` (0 to 1) turns it
 *  by that much of one tooth, so frames 0, 1/4, 2/4, 3/4 loop as a smooth spin. */
function gear(turn = 0, n = 16) {
  const g = grid(n, n), c = (n - 1) / 2, step = (Math.PI * 2) / 8;
  const solid = (x: number, y: number) => {
    const d = Math.hypot(x - c, y - c), a = Math.atan2(y - c, x - c) - turn * step;
    const into = Math.abs(((a % step) + step * 1.5) % step - step / 2); // how far round from the middle of the nearest tooth
    return d > n * 0.13 && d <= (into < step * 0.24 ? n * 0.5 : n * 0.37);
  };
  // A pixel with fewer than two solid neighbours is a speck off a tooth's tip: dropped.
  const inside = (x: number, y: number) => solid(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => solid(x + dx, y + dy)).length >= 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot(x - c, y - c), edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside(x + dx, y + dy));
      const lit = x + y < n - 4 ? 'j' : x + y > n + 2 ? 'h' : 'g';
      g[y][x] = edge ? 'k' : d < n * 0.24 ? (lit === 'j' ? 'h' : lit === 'h' ? 'j' : 'g') : lit; // the hub ring is lit the other way: sunk in
    }
  return rows(g);
}

/** A white flag on a pole, its cloth rippling: `phase` (0 to 1) moves the ripple out along it, so four frames loop. */
function flag(phase = 0) {
  const g = grid(16, 16), cloth = new Set<string>();
  for (let x = 4; x <= 14; x++) {
    const out = (x - 4) / 10, a = x * 0.9 - phase * Math.PI * 2, top = 5 + Math.round(Math.sin(a) * (0.4 + out * 1.3));
    for (let y = top; y < top + 6; y++) { cloth.add(`${x},${y}`); g[y][x] = Math.cos(a) < -0.35 ? 'v' : 'w'; } // the side of a fold turned away is in shade
  }
  for (let y = 0; y < 16; y++)
    for (let x = 3; x < 16; x++)
      if (!cloth.has(`${x},${y}`) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cloth.has(`${x + dx},${y + dy}`))) g[y][x] = 'k';
  fill(g, 1, 1, 3, 15, 'k'); fill(g, 2, 2, 1, 13, 'p'); g[14][2] = 'q'; // the pole
  fill(g, 0, 0, 5, 3, 'k'); fill(g, 1, 0, 3, 1, 'k'); fill(g, 1, 1, 3, 1, 'y'); g[1][1] = 'w'; // its gold knob, a glint on it
  g[0][0] = g[0][4] = '.';
  return rows(g);
}

/** Cross hairs in a ring: the strikes. */
function target(n = 12) {
  const g = grid(n, n), c = (n - 1) / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c);
      if (Math.abs(d - n * 0.36) < 0.75) g[y][x] = 'r';
      else if ((Math.abs(x - c) < 0.6 || Math.abs(y - c) < 0.6) && d > 1.2) g[y][x] = 'k';
    }
  return rows(g);
}

/** A walkie-talkie, 16 by 16: antenna, volume knob, a little screen showing a game controller, buttons, the speaker
 *  grille, the push-to-talk on its side; the olive body lit down its left edge. */
function radio() {
  const g = grid(16, 16);
  box(g, 10, 0, 3, 5, 'h'); // antenna
  box(g, 4, 1, 3, 3, 'g'); // volume knob
  box(g, 3, 3, 10, 13, 'd'); // the body
  fill(g, 4, 4, 1, 11, 'e');
  fill(g, 11, 4, 1, 11, 'o');
  box(g, 4, 5, 8, 6, 's'); // the screen, a controller on it
  ['ssssss', 'skkkks', 'kwkkrk', 'kssssk'].forEach((r, j) => [...r].forEach((ch, i) => { g[6 + j][5 + i] = ch; }));
  g[11][5] = 'y'; g[11][7] = 'r'; g[11][9] = 'g'; // buttons
  fill(g, 5, 13, 6, 1, 'k'); // the grille
  fill(g, 2, 6, 1, 5, 'k'); // push to talk
  return rows(g);
}

/** A dark shape filled in: every outline pixel with solid on all four sides becomes `fill` (and `h` sheen becomes `j`), so it
 *  reads against dark ground. */
const shell = (r: string[], fill = 'h') => r.map((row, y) => [...row].map((c, x) => c === 'h' ? 'j' : c === 'k' && [r[y - 1]?.[x], r[y + 1]?.[x], row[x - 1], row[x + 1]].every((n) => n && n !== '.') ? fill : c).join(''));

export const ICONS = {
  // The dossier's numbers, 8 by 8: damage, range, fire rate, health, healing, repair.
  bullet: ['...kk...', '..kyyk..', '..kyyk..', '..kyyk..', '.kkkkkk.', '.kppppk.', '.kppppk.', '.kkkkkk.'],
  range: ['...kk...', '..kkkk..', '.kk..kk.', 'kk.rr.kk', 'kk.rr.kk', '.kk..kk.', '..kkkk..', '...kk...'],
  rate: ['...kkk..', '..kyyk..', '.kyyk...', 'kyyyyyk.', 'kkkyyk..', '...kyk..', '..kyk...', '..kk....'],
  heart: ['.kk..kk.', 'krrkkrrk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...', '........'],
  heal: ['..kkkk..', '..kzzk..', 'kkkzzkkk', 'kzzzzzzk', 'kzzzzzzk', 'kkkzzkkk', '..kzzk..', '..kkkk..'],
  repair: ['.kk..kk.', '.kg..gk.', '.kkggkk.', '..kggk..', '..kggk..', '..kggk..', '..kggk..', '...kk...'],
  clock: [
    '....kkkk....',
    '..kkwwwwkk..',
    '.kwwwwwwwwk.',
    '.kwwwwkwwwk.',
    'kwwwwwkwwwwk',
    'kwwwwwkkkwwk',
    'kwwwwwwwwwwk',
    'kwwwwwwwwwwk',
    '.kwwwwwwwwk.',
    '.kwwwwwwwwk.',
    '..kkwwwwkk..',
    '....kkkk....',
  ],
  eye: [
    '................',
    '....kkkkkkkk....',
    '..kkwwwwwwwwkk..',
    '.kwwwwkzzkwwwwk.',
    'kwwwwkzkkzkwwwwk',
    '.kwwwwkzzkwwwwk.',
    '..kkwwwwwwwwkk..',
    '....kkkkkkkk....',
    '................',
  ],
  eyeShut: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.',
    'kkkkkkkkkkkkkkkk',
    '..k..k..k..k..k.',
    '................',
    '................',
    '................',
  ],
  flag: flag(),
  gear: gear(),
  zombie: [
    '....kkkkkkkk....',
    '...kzzzzzzzzk...',
    '..kzzzzzzzzzzk..',
    '.kzzzzzzzzzzzzk.',
    '.kzzzzzzzzzzzxk.',
    'kzzkkkzzzzkkkzxk',
    'kzzkrkzzzzkrkzxk',
    'kzzkkkzzzzkkkzxk',
    'kzzzzzzkkzzzzzxk',
    'kzzzzzzzzzzzzzxk',
    '.kzzmmmmmmmmzxk.',
    '.kzzmwmwmwmmzxk.',
    '..kzzmmmmmmzxk..',
    '...kzzzzzzzxk...',
    '....kxxxxxxk....',
    '.....kkkkkk.....',
  ],
  skull: [
    '................',
    '....kkkkkkkk....',
    '...kwwwwwwwwk...',
    '..kwwwwwwwwwwk..',
    '.kwwwwwwwwwwwvk.',
    '.kwwwwwwwwwwwvk.',
    'kwwkkkwwwwkkkwvk',
    'kwwkkkwwwwkkkwvk',
    'kwwkkkwwwwkkkwvk',
    'kwwwwwwkkwwwwwvk',
    '.kwwwwwkkwwwwvk.',
    '..kvwwwwwwwwvk..',
    '...kwkwkwkwkk...',
    '...kwkwkwkwkk...',
    '....kkkkkkkk....',
    '................',
  ],
  spider: shell([
    '.k............k.',
    'k.k..........k.k',
    '...k..kkkk..k...',
    '....k.khhk.k....',
    'kk...kkkkkk...kk',
    '..kk.krkkrk.kk..',
    '....kkkkkkkk....',
    '...kkkkkkkkkk...',
    '..k.kkhhkkkk.k..',
    '.k..kkhkkkkk..k.',
    'k...kkkkkkkk...k',
    '....kkkkkkkk....',
    '...k.kkkkkk.k...',
    '..k...kkkk...k..',
    '.k............k.',
    '................',
  ]),
  radio: radio(),
  // A binder ring, seen side on: steel lit from the top left.
  ring: [
    '...kkkkkkkkkk...',
    '.kkjjjjjjjjggkk.',
    'kjjgkkkkkkkkghhk',
    'kjgk........khhk',
    'kjgk........khhk',
    'kggkkkkkkkkkkhhk',
    '.kkhhhhhhhhhhkk.',
    '...kkkkkkkkkk...',
  ],
  // The fight's folder tabs: a helmet for soldiers, a striped barricade for building, cross hairs for strikes.
  units: [
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkeeeeddkk...',
    '..keeeedddddok..',
    '.keedddddddddok.',
    '.keddddddddddok.',
    'keddddddddddddok',
    'keddddddddddddok',
    'kkkkkkkkkkkkkkkk',
    '.kooooooooooook.',
    '..k..........k..',
    '...k........k...',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
  build: [
    '................',
    '................',
    'kkkkkkkkkkkkkkkk',
    'kwwwrrrwwwrrrwwk',
    'kwwrrrwwwrrrwwwk',
    'kwrrrwwwrrrwwwrk',
    'kkkkkkkkkkkkkkkk',
    '..kpk......kpk..',
    '..kpk......kpk..',
    '.kpk........kpk.',
    '.kpk........kpk.',
    'kpk..........kpk',
    'kkk..........kkk',
    '................',
    '................',
    '................',
  ],
  strikes: target(16),
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

/** Icons that move while hovered: four frames each, looped by the CSS (index.html, .anim). */
const FRAMES = { flag: [0, 0.25, 0.5, 0.75].map(flag), gear: [0, 0.25, 0.5, 0.75].map((t) => gear(t)) };

/** An icon as an inline SVG, `scale` screen pixels to an art pixel. */
export function pixIcon(name: IconName, scale = 2): SVGSVGElement { return svgOf(ICONS[name], scale); }

/** A moving icon: its frames stacked, the first shown until the button is hovered. */
export function pixAnim(name: keyof typeof FRAMES, scale = 2): HTMLElement {
  const span = document.createElement('span');
  span.className = 'anim';
  span.append(...FRAMES[name].map((f) => svgOf(f, scale)));
  return span;
}

function svgOf(rows: string[], scale: number): SVGSVGElement {
  const w = rows[0].length, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${rows.length}`);
  svg.setAttribute('width', String(w * scale));
  svg.setAttribute('height', String(rows.length * scale));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  rows.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x];
      if (c === '.') { x++; continue; }
      let n = 1;
      while (row[x + n] === c) n++;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', String(n)); r.setAttribute('height', '1'); r.setAttribute('fill', PAL[c]);
      svg.append(r);
      x += n;
    }
  });
  return svg;
}
