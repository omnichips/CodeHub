// Draws the LLM boss sprites at the size of the hand-drawn enemies (bosses are 40px wide),
// straight into assets/enemies. Run from the app folder: node tools/llm-bosses.mjs
// Shapes below are laid out on a 44x60 grid and scaled by K onto the sprite.
import fs from 'node:fs';
import { writePng } from './png.mjs';

// 38px of drawing plus a 1px outline on each side = 40px, like the hand-drawn bosses.
const K = 38 / 44, W = 40, H = 55;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
function canvas() {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, c) => { x = Math.round(x) + 1; y = Math.round(y) + 1; if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c && hex(c); };
    const L = {
        g,
        px(x, y, c) { put(x * K, y * K, c); return L; },
        rect(x0, y0, x1, y1, c) {
            for (let y = Math.round(y0 * K); y <= Math.round(y1 * K); y++) for (let x = Math.round(x0 * K); x <= Math.round(x1 * K); x++) put(x, y, c);
            return L;
        },
        ellipse(cx, cy, rx, ry, c) {
            cx *= K; cy *= K; rx *= K; ry *= K;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) put(x, y, c);
            return L;
        },
        line(x0, y0, x1, y1, c, t = 1) {
            [x0, y0, x1, y1] = [x0, y0, x1, y1].map((v) => v * K);
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
            for (let k = 0; k <= n; k++) {
                const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
                for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) put(x + i - (t >> 1), y + j - (t >> 1), c);
            }
            return L;
        },
        poly(pts, c) {
            pts = pts.map(([x, y]) => [x * K, y * K]);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const [xi, yi] = pts[i], [xj, yj] = pts[j];
                    if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
                }
                if (inside) put(x, y, c);
            }
            return L;
        },
        star(cx, cy, r1, r2, n, c, rot = -Math.PI / 2) {
            const pts = [];
            for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } // poly scales these
            return L.poly(pts, c);
        },
    };
    return L;
}
// 1px dark outline like the hand-drawn enemies have.
function outlined(g) {
    const out = g.map((r) => r.slice()), dark = hex('#0b0f1a');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (g[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = dark;
    }
    return out;
}

// Trim empty rows/columns, like the hand-drawn sprites.
function crop(g) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    g.forEach((row, y) => row.forEach((c, x) => { if (c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
    return g.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1));
}

const BOSSES = {
    // A black oracle head with a looping six-petal emblem, a chat bubble and a terminal for a body.
    OMNI_GPT(L) {
        L.rect(13, 1, 31, 8, '#f1f5f9').rect(12, 2, 32, 7, '#f1f5f9').poly([[17, 8], [21, 8], [16, 11]], '#f1f5f9');
        [17, 22, 27].forEach((x) => L.rect(x - 1, 4, x, 5, '#334155'));
        L.rect(10, 12, 34, 30, '#1f2937').rect(11, 11, 33, 31, '#1f2937').rect(13, 14, 31, 28, '#0b0f1a');
        for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; L.ellipse(22 + Math.cos(a) * 3.6, 21 + Math.sin(a) * 3.6, 2.4, 2.4, '#e2e8f0'); }
        L.ellipse(22, 21, 1.6, 1.6, '#0b0f1a');
        L.rect(19, 31, 25, 33, '#64748b');
        L.rect(7, 34, 37, 50, '#cbd5e1').rect(10, 37, 34, 47, '#0f172a');
        L.rect(12, 39, 24, 39, '#4ade80').rect(12, 41, 29, 41, '#4ade80').rect(12, 43, 20, 43, '#4ade80').rect(22, 43, 23, 44, '#f8fafc');
        L.line(7, 36, 2, 44, '#64748b', 2).line(2, 44, 4, 50, '#64748b', 2).line(37, 36, 42, 44, '#64748b', 2).line(42, 44, 40, 50, '#64748b', 2);
        L.poly([[11, 51], [33, 51], [30, 55], [14, 55]], '#334155').rect(16, 56, 28, 57, '#38bdf8').rect(19, 58, 25, 58, '#7dd3fc');
    },
    // Two heads, one body: a blue twin and a violet twin with a four-point sparkle between them.
    GEMINI_TWINS(L) {
        L.star(22, 7, 6, 1.6, 4, '#93c5fd').star(22, 7, 3.5, 1, 4, '#f0abfc');
        L.line(10, 4, 12, 10, '#94a3b8').line(34, 4, 32, 10, '#94a3b8').px(10, 3, '#38bdf8').px(34, 3, '#e879f9');
        L.ellipse(13, 19, 8, 8, '#2563eb').rect(8, 17, 18, 21, '#0b0f1a').rect(9, 18, 17, 20, '#22d3ee');
        L.ellipse(31, 19, 8, 8, '#7c3aed').rect(26, 17, 36, 21, '#0b0f1a').rect(27, 18, 35, 20, '#f472b6');
        L.rect(11, 27, 15, 29, '#475569').rect(29, 27, 33, 29, '#475569');
        L.rect(6, 30, 21, 50, '#1e3a8a').rect(22, 30, 38, 50, '#4c1d95');
        L.star(22, 40, 7, 2, 4, '#e0f2fe').star(22, 40, 3.5, 1.2, 4, '#fbcfe8');
        L.rect(1, 32, 5, 44, '#2563eb').rect(39, 32, 43, 44, '#7c3aed').rect(1, 45, 5, 47, '#94a3b8').rect(39, 45, 43, 47, '#94a3b8');
        L.rect(10, 51, 16, 57, '#475569').rect(28, 51, 34, 57, '#475569').rect(8, 57, 18, 59, '#1f2937').rect(26, 57, 36, 59, '#1f2937');
    },
    // A cyber llama: open-weight wool, a long neck, a red visor and a server box saddle.
    LLAMA_PRIME(L) {
        L.poly([[5, 5], [7, 0], [9, 5]], '#e7d3b0').poly([[10, 5], [12, 0], [14, 5]], '#e7d3b0');
        L.rect(3, 5, 15, 13, '#e7d3b0').rect(0, 9, 4, 14, '#e7d3b0').px(1, 11, '#3f2d1d').rect(0, 14, 5, 15, '#c4a57a');
        L.rect(3, 8, 15, 9, '#ef4444').px(6, 8, '#fecaca');
        L.rect(8, 13, 15, 32, '#e7d3b0');
        for (const [x, y] of [[9, 17], [13, 21], [9, 25], [13, 29]]) L.ellipse(x, y, 2.2, 2, '#f5ead6');
        L.ellipse(27, 35, 15, 9, '#e7d3b0');
        for (let x = 15; x <= 40; x += 5) L.ellipse(x, 27, 3, 2.6, '#f5ead6');
        L.ellipse(42, 31, 2.5, 3, '#f5ead6');
        L.rect(20, 21, 34, 27, '#334155').rect(22, 23, 23, 24, '#4ade80').rect(25, 23, 26, 24, '#4ade80').rect(28, 23, 29, 24, '#facc15').rect(31, 22, 32, 25, '#64748b');
        for (const x of [15, 21, 31, 37]) L.rect(x, 43, x + 2, 55, '#94a3b8').rect(x - 1, 56, x + 3, 58, '#1f2937');
        L.rect(15, 47, 39, 47, '#64748b');
    },
    // A deep-sea mechanical whale with a searchlight eye, portholes and a steam spout.
    DEEP_SEEKER(L) {
        L.ellipse(14, 9, 2.5, 2.5, '#bae6fd').ellipse(17, 4, 2, 2, '#bae6fd').ellipse(12, 2, 1.5, 1.5, '#e0f2fe').rect(14, 12, 16, 16, '#7dd3fc');
        L.poly([[34, 26], [40, 14], [44, 10], [43, 20], [38, 30]], '#1d4ed8').poly([[38, 30], [44, 34], [43, 40], [36, 34]], '#1d4ed8');
        L.ellipse(20, 30, 19, 13, '#2563eb').ellipse(19, 36, 16, 6, '#93c5fd');
        for (let x = 8; x <= 30; x += 4) L.line(x, 33, x + 1, 40, '#60a5fa');
        L.ellipse(8, 26, 3.2, 3.2, '#1e293b').ellipse(8, 26, 2, 2, '#fde047');
        [18, 25, 32].forEach((x) => L.ellipse(x, 24, 2, 2, '#1e293b').px(x, 24, '#67e8f9').px(x - 1, 23, '#67e8f9'));
        L.poly([[18, 38], [28, 38], [24, 48], [17, 44]], '#1e40af');
        L.rect(1, 31, 5, 32, '#1e293b').rect(2, 33, 6, 33, '#e2e8f0');
        L.rect(13, 44, 31, 45, '#475569').rect(20, 46, 24, 50, '#475569').rect(17, 51, 27, 52, '#22d3ee');
    },
    // An orange block of a critter with an asterisk halo. Polite. Thorough. Still a boss.
    CLAWD(L) {
        L.star(22, 7, 7, 2.2, 8, '#f59e0b').star(22, 7, 3.5, 1.4, 8, '#fde68a');
        L.rect(7, 16, 37, 42, '#d97757');
        L.rect(14, 23, 16, 29, '#1a1410').rect(28, 23, 30, 29, '#1a1410').px(14, 23, '#fef3c7').px(28, 23, '#fef3c7');
        L.rect(19, 34, 25, 35, '#9a3412');
        L.rect(2, 27, 6, 32, '#d97757').rect(38, 27, 42, 32, '#d97757');
        for (const x of [9, 16, 26, 33]) L.rect(x, 43, x + 2, 50, '#d97757');
        L.rect(10, 18, 34, 18, '#e8957a');
    },
};

for (const [key, draw] of Object.entries(BOSSES)) {
    const L = canvas();
    draw(L);
    fs.writeFileSync(`assets/enemies/${key}.png`, writePng(crop(outlined(L.g))));
}
console.log(`drew ${Object.keys(BOSSES).length} bosses`);
