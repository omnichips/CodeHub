// Rebuilds every enemy sprite at 128x128 from its small source drawing (tools/enemy-src/*.png).
// Run from the app folder: node tools/remaster-enemies.mjs [NAME ...]
//
// 1. Scale2x three times (8x, smooths diagonals and curves), then sample down to fit 120px:
//    the shape is redrawn on the bigger grid instead of being blown up into blocks.
// 2. Detail pass: bevel light/shadow on every colour region, a dithered top-to-bottom light,
//    surface grit, a cool rim light from the hallway, glowing eyes and lamps, a clean outline.
// Edit a source drawing (or add a new one) and rerun; the game reads assets/enemies/<KEY>.png.
import fs from 'node:fs';
import { readPng, writePng } from './png.mjs';

const SIZE = 128, FIT = 120;
const key = (c) => (c ? `${c[0]},${c[1]},${c[2]}` : '');
const mix = (c, t, k) => [0, 1, 2].map((i) => Math.round(c[i] + (t[i] - c[i]) * k)).concat(255);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hsv = (c) => { const mx = Math.max(...c.slice(0, 3)), mn = Math.min(...c.slice(0, 3)); return { s: mx ? (mx - mn) / mx : 0, v: mx / 255 }; };
const WHITE = [255, 255, 255], BLACK = [0, 0, 0], RIM = [125, 211, 252], OUTLINE = [11, 15, 26, 255];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function scale2x(g) {
    const h = g.length, w = g[0].length, out = Array.from({ length: h * 2 }, () => Array(w * 2).fill(null));
    const at = (x, y) => g[Math.min(h - 1, Math.max(0, y))][Math.min(w - 1, Math.max(0, x))];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
        const k = key, [a, b, c, d] = [k(A), k(B), k(C), k(D)];
        out[y * 2][x * 2] = c === a && c !== d && a !== b ? A : P;
        out[y * 2][x * 2 + 1] = a === b && a !== c && b !== d ? B : P;
        out[y * 2 + 1][x * 2] = d === c && d !== b && c !== a ? C : P;
        out[y * 2 + 1][x * 2 + 1] = b === d && b !== a && d !== c ? D : P;
    }
    return out;
}

// The source outline is redrawn at the end, so the dark rim of the small drawing is dropped first.
function stripOutline(g) {
    const h = g.length, w = g[0].length;
    const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !g[y][x];
    return g.map((row, y) => row.map((c, x) => (c && lum(c) < 45 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => empty(x + dx, y + dy)) ? null : c)));
}

function crop(g) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    g.forEach((r, y) => r.forEach((c, x) => { if (c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
    return g.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

function resample(g) {
    const h = g.length, w = g[0].length, s = FIT / Math.max(w, h);
    let big = g, f = 1;
    while (f < s && f < 8) { big = scale2x(big); f *= 2; }
    const W = Math.round(w * s), H = Math.round(h * s), out = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    const ox = Math.floor((SIZE - W) / 2), oy = SIZE - 2 - H; // centred, standing 2px above the bottom
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        out[oy + y][ox + x] = big[Math.floor(((y + 0.5) * big.length) / H)][Math.floor(((x + 0.5) * big[0].length) / W)];
    }
    return { g: out, top: oy, bottom: oy + H };
}

function detail({ g, top, bottom }) {
    const N = SIZE, base = g, out = g.map((r) => r.slice());
    const empty = (x, y) => x < 0 || y < 0 || x >= N || y >= N || !base[y][x];
    const same = (x, y, k) => !empty(x, y) && key(base[y][x]) === k;
    // Distance (1-4) to the edge of each pixel's colour region, and the size of that region.
    const dist = base.map((row, y) => row.map((c, x) => {
        if (!c) return 0;
        const k = key(c);
        for (let d = 1; d <= 4; d++) for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) {
            if ((Math.abs(i) === d || Math.abs(j) === d) && !same(x + i, y + j, k)) return d;
        }
        return 5;
    }));
    const area = base.map((r) => r.map(() => 0));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!base[y][x] || area[y][x]) continue;
        const k = key(base[y][x]), stack = [[x, y]], cells = [];
        area[y][x] = -1;
        while (stack.length) {
            const [cx, cy] = stack.pop(); cells.push([cx, cy]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (same(nx, ny, k) && !area[ny][nx]) { area[ny][nx] = -1; stack.push([nx, ny]); }
            }
        }
        cells.forEach(([cx, cy]) => { area[cy][cx] = cells.length; });
    }
    const emissive = (c) => { const { s, v } = hsv(c); return (s > 0.55 && v > 0.85) || lum(c) > 235; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = base[y][x];
        if (!c) continue;
        const k = key(c);
        let shade = 0;
        // Light from above, stepped with ordered dither so it stays pixel art.
        const t = (y - top) / Math.max(1, bottom - top);
        const grad = 0.1 - 0.24 * t + (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.06;
        shade += Math.round(grad / 0.1) * 0.1;
        // Bevel: lit top-left edge, shadowed bottom-right edge of every colour region (not on 1-2px details).
        const thinV = !same(x, y - 1, k) && !same(x, y + 1, k), thinH = !same(x - 1, y, k) && !same(x + 1, y, k);
        if (!thinV && !same(x, y - 1, k)) shade += 0.28;
        else if (!thinH && !same(x - 1, y, k)) shade += 0.18;
        if (!thinV && !same(x, y + 1, k)) shade -= 0.26;
        else if (!thinH && !same(x + 1, y, k)) shade -= 0.16;
        // Second shadow row under a region edge gives the parts some thickness.
        if (same(x, y + 1, k) && !same(x, y + 2, k) && !thinV) shade -= 0.1;
        // Big metal plates get an inset seam and a row of rivets along it.
        if (area[y][x] > 260 && hsv(c).s < 0.3 && !emissive(c)) {
            if (dist[y][x] === 2) shade -= 0.14;
            if (dist[y][x] === 3 && dist[y - 1]?.[x] === 2 && (x % 9 === 4)) shade += 0.4;
            if (dist[y][x] === 3 && dist[y][x - 1] === 2 && (y % 9 === 4)) shade += 0.4;
        }
        // Grit on the inside of big surfaces.
        if (same(x - 1, y, k) && same(x + 1, y, k) && same(x, y - 1, k) && same(x, y + 1, k) && hash(x, y) < 0.025) shade -= 0.08;
        let col = emissive(c) ? mix(c, WHITE, Math.max(0, shade) * 0.6) : shade >= 0 ? mix(c, WHITE, Math.min(0.5, shade)) : mix(c, BLACK, Math.min(0.5, -shade));
        // Glow spill from lamps and eyes onto neighbouring parts.
        if (!emissive(c)) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const n = !empty(x + dx, y + dy) && base[y + dy][x + dx];
                if (n && emissive(n)) { col = mix(col, n, 0.35); break; }
            }
        }
        // Cool rim light from the hallway lights on the right and top edges of the silhouette.
        if (empty(x + 1, y) || empty(x + 2, y)) col = mix(col, RIM, empty(x + 1, y) ? 0.38 : 0.18);
        else if (empty(x, y - 1)) col = mix(col, WHITE, 0.18);
        out[y][x] = col;
    }
    // Soft halo (translucent) around lamps that sit on the silhouette edge.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (base[y][x]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => !empty(x + dx, y + dy) && base[y + dy][x + dx]).find((n) => n && emissive(n));
        if (near) out[y][x] = [near[0], near[1], near[2], 110];
    }
    // Clean 1px outline.
    const final = out.map((r) => r.slice());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (base[y][x] || out[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !empty(x + dx, y + dy))) final[y][x] = OUTLINE;
    }
    return final;
}

const only = new Set(process.argv.slice(2));
const files = fs.readdirSync('tools/enemy-src').filter((f) => f.endsWith('.png') && (!only.size || only.has(f.replace('.png', ''))));
for (const f of files) {
    const src = readPng(fs.readFileSync(`tools/enemy-src/${f}`));
    fs.writeFileSync(`assets/enemies/${f}`, writePng(detail(resample(crop(src)))));
}
console.log(`remastered ${files.length} enemies`);
