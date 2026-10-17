// Drawing for the story's 320 × 180 canvas: colours through the palette as it drains map by map (a swap worked out
// once per colour, not a filter), the pixel font, and the ordered dither every fade and departure is made of.
import palette from '../data/palette.json' with { type: 'json' };
import { FONT, LINE_H, advance, shown } from './font.ts';
import type { Voice } from './types.ts';

const P = palette as Record<string, string>;
/** How far colour has drained at each stage (1 to 5): 0 is the full muted palette, 1 is grey. */
const DRAIN = [0, 0, 0.25, 0.5, 0.85, 1];
/** Lights keep their colour through stage 4; at stage 5 only the radio's LED and the dawn do. */
const LIGHTS_KEEP_TO = 4;

const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const swaps = new Map<string, string>();
/** A colour (palette name or #hex) at a stage of the drain. */
export function drained(col: string, stage: number) {
  const key = `${stage}${col}`;
  let out = swaps.get(key);
  if (!out) {
    const c = rgb(P[col] ?? col), lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], f = DRAIN[stage] ?? 0;
    swaps.set(key, (out = toHex(c.map((v) => v + (lum - v) * f))));
  }
  return out;
}
export const hex = (col: string) => P[col] ?? col;

/** The text colours, one a voice; they never drain. */
export const INK: Record<Voice | 'gloss' | 'label' | 'dim', string> = {
  person: '#dcddd3', radio: '#a9b8c9', loudspeaker: '#a9b8c9', jec: '#d6a23e', gloss: '#8a908e', label: '#c4a058', dim: '#6f7471',
};

/** The ordered-dither threshold at a pixel: a 4 × 4 Bayer matrix, 0 to 15. */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const patterns = new Map<string, CanvasPattern>();
/** A pattern of `col` pixels covering `level` (0 to 1) of the area, in ordered dither. */
export function dither(c: CanvasRenderingContext2D, level: number, col = '#000000') {
  const n = Math.max(0, Math.min(16, Math.round(level * 16))), key = `${n}${col}`;
  let p = patterns.get(key);
  if (!p) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 4;
    const t = tile.getContext('2d')!;
    t.fillStyle = col;
    for (let k = 0; k < 16; k++) if (BAYER[k] < n) t.fillRect(k % 4, k >> 2, 1, 1);
    patterns.set(key, (p = c.createPattern(tile, 'repeat')!));
  }
  return p;
}

const glyphs = new Map<string, HTMLCanvasElement>();
function glyph(ch: string, col: string) {
  const key = `${ch}${col}`;
  let g = glyphs.get(key);
  if (!g) {
    const f = FONT[ch] ?? FONT['?'];
    g = document.createElement('canvas');
    g.width = f.w;
    g.height = LINE_H;
    const c = g.getContext('2d')!;
    c.fillStyle = col;
    for (const [x, y] of f.px) c.fillRect(x, y, 1, 1);
    glyphs.set(key, g);
  }
  return g;
}

/** A pen on the story canvas, drawing at one stage of the drain. */
export class Pen {
  stage = 1;
  readonly c: CanvasRenderingContext2D;
  constructor(c: CanvasRenderingContext2D) { this.c = c; }
  /** A colour as it is now. */
  col(col: string) { return drained(col, this.stage); }
  rect(x: number, y: number, w: number, h: number, col: string) { this.c.fillStyle = this.col(col); this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  px(x: number, y: number, col: string) { this.rect(x, y, 1, 1, col); }
  /** A light: keeps its colour while lights do. */
  lit(x: number, y: number, w: number, h: number, col: string) { this.c.fillStyle = this.stage > LIGHTS_KEEP_TO ? this.col(col) : hex(col); this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  /** The radio's LED and the first light of dawn: always in colour. */
  led(x: number, y: number, w: number, h: number, col: string) { this.c.fillStyle = hex(col); this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  /** Pixel text in a voice; `upto` letters of it (all by default). Returns its width. */
  text(text: string, x: number, y: number, col: string, voice: Voice = 'person', upto = Infinity) {
    let at = Math.round(x), k = 0;
    for (const ch of shown(text, voice)) {
      if (k++ >= upto) break;
      const w = advance(ch, voice), f = FONT[ch];
      if (ch !== ' ') this.c.drawImage(glyph(ch, col), voice === 'jec' && f ? at + Math.floor((w - 1 - f.w) / 2) : at, Math.round(y));
      at += w;
    }
    return at - Math.round(x) - 1;
  }
  /** Covers a box in ordered dither, `level` of its pixels. */
  dither(x: number, y: number, w: number, h: number, level: number, col = '#000000') {
    if (level <= 0) return;
    this.c.fillStyle = dither(this.c, level, col);
    this.c.fillRect(x, y, w, h);
  }
}
