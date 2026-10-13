// Draws the Spire pack enemy sprites at the size of the hand-drawn enemies (40px wide at most),
// straight into assets/enemies. Run from the app folder: node tools/spire-enemies.mjs
// Shapes are laid out on a 44x60 grid and scaled onto the sprite, with the same outline as the other enemies.
import fs from 'node:fs';
import { writePng } from './png.mjs';

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
        ring(cx, cy, r, t, c) {
            cx *= K; cy *= K; r *= K; t *= K;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d > r - t) put(x, y, c); }
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
    };
    return L;
}
function outlined(g) {
    const out = g.map((r) => r.slice()), dark = hex('#0b0f1a');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (g[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = dark;
    }
    return out;
}
function crop(g) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    g.forEach((row, y) => row.forEach((c, x) => { if (c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }));
    return g.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1));
}
const eyes = (L, y, x1, x2, c = '#f8fafc', p = '#0b0f1a') => L.rect(x1 - 2, y - 2, x1 + 2, y + 2, c).rect(x2 - 2, y - 2, x2 + 2, y + 2, c).rect(x1, y - 1, x1 + 1, y + 1, p).rect(x2, y - 1, x2 + 1, y + 1, p);

const ENEMIES = {
    // A squat grey cash box on legs: coin slot for a mouth, a grabbing claw, a gold coin on its head.
    COIN_SKIMMER(L) {
        L.ellipse(22, 9, 6, 6, '#f2b233').rect(21, 5, 23, 13, '#b7791f').ellipse(22, 9, 3.5, 3.5, '#fde68a');
        L.rect(8, 16, 36, 40, '#64748b').rect(10, 18, 34, 38, '#94a3b8').rect(10, 18, 34, 19, '#cbd5e1');
        eyes(L, 25, 16, 28, '#fde68a');
        L.rect(14, 32, 30, 34, '#0b0f1a').rect(16, 33, 28, 33, '#f2b233');
        L.line(36, 26, 42, 20, '#475569', 3).line(42, 20, 43, 15, '#475569', 2).line(42, 20, 38, 16, '#475569', 2);
        L.line(8, 26, 3, 32, '#475569', 3);
        L.rect(11, 41, 15, 50, '#334155').rect(29, 41, 33, 50, '#334155').rect(9, 49, 16, 51, '#1e293b').rect(28, 49, 35, 51, '#1e293b');
    },
    // An angry office printer with a crumpled sheet stuck in its mouth.
    PAPER_JAM(L) {
        L.rect(4, 14, 40, 40, '#e2e8f0').rect(4, 14, 40, 18, '#f8fafc').rect(4, 36, 40, 40, '#94a3b8');
        L.rect(8, 8, 36, 14, '#cbd5e1').rect(10, 2, 34, 8, '#f8fafc').line(13, 4, 31, 4, '#94a3b8').line(13, 6, 27, 6, '#94a3b8');
        L.line(10, 21, 17, 24, '#0b0f1a', 2).line(34, 21, 27, 24, '#0b0f1a', 2);
        L.rect(12, 25, 16, 28, '#ef4444').rect(28, 25, 32, 28, '#ef4444');
        L.rect(10, 31, 34, 33, '#0b0f1a');
        L.poly([[14, 32], [30, 32], [33, 44], [27, 41], [22, 47], [18, 42], [11, 45]], '#f8fafc').line(16, 37, 26, 40, '#94a3b8').line(19, 43, 25, 38, '#cbd5e1');
        L.rect(36, 20, 38, 22, '#22c55e').rect(36, 24, 38, 26, '#f97316');
        L.rect(6, 41, 10, 46, '#475569').rect(34, 41, 38, 46, '#475569');
    },
    // A cyan process blob already pulling apart into two lobes, a glowing fork mark in the middle.
    FORK_PROCESS(L) {
        L.ellipse(14, 30, 12, 16, '#0891b2').ellipse(30, 30, 12, 16, '#0891b2').ellipse(22, 34, 10, 12, '#0891b2');
        L.ellipse(13, 27, 9, 12, '#22d3ee').ellipse(31, 27, 9, 12, '#22d3ee');
        L.line(22, 44, 22, 34, '#ecfeff', 2).line(22, 34, 15, 26, '#ecfeff', 2).line(22, 34, 29, 26, '#ecfeff', 2);
        eyes(L, 20, 11, 33);
        L.rect(9, 44, 13, 48, '#0e7490').rect(31, 44, 35, 48, '#0e7490');
        L.px(6, 18, '#ecfeff').px(36, 17, '#ecfeff');
    },
    // A red horseshoe magnet with a face, silver tips crackling.
    STATIC_MAGNET(L) {
        L.ring(22, 22, 18, 9, '#dc2626').rect(14, 23, 30, 41, null).rect(4, 22, 13, 44, '#dc2626').rect(31, 22, 40, 44, '#dc2626');
        L.rect(4, 22, 13, 23, '#f87171').rect(31, 22, 40, 23, '#f87171');
        L.rect(4, 40, 13, 48, '#e5e7eb').rect(31, 40, 40, 48, '#e5e7eb');
        eyes(L, 11, 16, 28);
        L.rect(19, 15, 25, 16, '#0b0f1a');
        L.line(14, 50, 18, 53, '#fde047', 2).line(18, 53, 15, 56, '#fde047', 2).line(30, 50, 26, 53, '#fde047', 2).line(26, 53, 29, 56, '#fde047', 2);
    },
    // A boxy bot with a speaker for a face and sound rings coming off it.
    ECHO_BOT(L) {
        L.ring(22, 25, 16, 1.6, '#c084fc');
        L.rect(10, 12, 34, 38, '#475569').rect(12, 14, 32, 36, '#1e293b');
        L.ellipse(22, 25, 8, 8, '#94a3b8').ellipse(22, 25, 5, 5, '#334155').ellipse(22, 25, 2, 2, '#c084fc');
        L.rect(10, 12, 34, 13, '#64748b').rect(10, 12, 11, 38, '#64748b').rect(33, 12, 34, 38, '#64748b').rect(10, 37, 34, 38, '#64748b');
        L.rect(21, 4, 23, 12, '#64748b').ellipse(22, 3, 2.5, 2.5, '#c084fc');
        L.line(3, 20, 3, 30, '#c084fc', 2).line(41, 20, 41, 30, '#c084fc', 2).line(6, 17, 6, 33, '#a855f7').line(38, 17, 38, 33, '#a855f7');
        L.rect(14, 39, 18, 48, '#334155').rect(26, 39, 30, 48, '#334155');
    },
    // A dark imp held together with sticky patches, a wrench in one claw.
    PATCH_DAEMON(L) {
        L.poly([[10, 10], [14, 2], [16, 11]], '#7c3aed').poly([[34, 10], [30, 2], [28, 11]], '#7c3aed');
        L.ellipse(22, 18, 13, 11, '#4c1d95').ellipse(22, 40, 11, 14, '#4c1d95');
        eyes(L, 17, 17, 27, '#fde047', '#7f1d1d');
        L.rect(16, 23, 28, 24, '#0b0f1a').px(18, 25, '#f8fafc').px(26, 25, '#f8fafc');
        L.rect(12, 9, 19, 12, '#fcd34d').line(13, 10, 18, 11, '#b45309');
        L.rect(23, 33, 31, 37, '#fcd34d').line(24, 34, 30, 36, '#b45309').rect(13, 42, 19, 45, '#fcd34d');
        L.line(33, 34, 41, 28, '#94a3b8', 3).ellipse(42, 25, 3, 3, '#94a3b8').ellipse(43, 24, 1.4, 1.4, '#4c1d95');
        L.line(11, 34, 4, 40, '#4c1d95', 3);
        L.rect(14, 53, 19, 56, '#2e1065').rect(25, 53, 30, 56, '#2e1065');
    },
    // A padlock with a skull on its face and a credit sign hanging off the shackle.
    RANSOMWARE(L) {
        L.ring(22, 16, 12, 4, '#94a3b8').rect(8, 16, 36, 22, null);
        L.rect(10, 15, 14, 22, '#94a3b8').rect(30, 15, 34, 22, '#94a3b8');
        L.rect(5, 22, 39, 52, '#ca8a04').rect(5, 22, 39, 24, '#facc15').rect(5, 50, 39, 52, '#a16207');
        L.ellipse(22, 34, 9, 8, '#f8fafc').rect(17, 39, 27, 45, '#f8fafc');
        L.rect(16, 31, 19, 35, '#0b0f1a').rect(25, 31, 28, 35, '#0b0f1a').rect(21, 37, 23, 39, '#0b0f1a');
        L.line(19, 42, 19, 45, '#0b0f1a').line(22, 42, 22, 45, '#0b0f1a').line(25, 42, 25, 45, '#0b0f1a');
        L.ellipse(38, 10, 5, 5, '#fde047').line(38, 7, 38, 13, '#a16207').line(36, 8, 40, 8, '#a16207').line(36, 12, 40, 12, '#a16207');
    },
    // A steam valve wheel for a head over a body with a heat gauge needle pinned in the red.
    THROTTLER(L) {
        L.ring(22, 12, 11, 3, '#b91c1c').line(22, 2, 22, 22, '#b91c1c', 2).line(12, 12, 32, 12, '#b91c1c', 2).ellipse(22, 12, 3, 3, '#7f1d1d');
        L.rect(19, 22, 25, 26, '#475569');
        L.rect(6, 26, 38, 50, '#334155').rect(8, 28, 36, 48, '#475569');
        L.ellipse(22, 38, 9, 9, '#f1f5f9').rect(13, 38, 31, 47, '#475569');
        L.line(16, 37, 19, 33, '#22c55e', 2).line(20, 31, 24, 30, '#facc15', 2).line(25, 31, 29, 36, '#ef4444', 2);
        L.line(22, 38, 28, 33, '#0b0f1a', 2).ellipse(22, 38, 1.5, 1.5, '#0b0f1a');
        L.rect(1, 30, 6, 34, '#64748b').rect(38, 30, 43, 34, '#64748b');
        L.line(4, 26, 2, 20, '#e2e8f0').line(40, 26, 42, 21, '#e2e8f0');
        L.rect(9, 50, 15, 56, '#1e293b').rect(29, 50, 35, 56, '#1e293b');
    },
    // A stack of coloured disk blocks shuffling themselves, a grabbing arm on top.
    DEFRAGMENTER(L) {
        const C = ['#38bdf8', '#a855f7', '#22c55e', '#f97316', '#ef4444', '#facc15'];
        for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
            const x = 6 + k * 8 + (r % 2) * 2, y = 18 + r * 7;
            L.rect(x, y, x + 6, y + 5, C[(r * 3 + k * 2) % C.length]).rect(x, y, x + 6, y, '#f8fafc');
        }
        L.rect(4, 16, 40, 16, '#0f172a');
        L.rect(19, 8, 25, 16, '#64748b').line(22, 8, 30, 2, '#64748b', 2).line(30, 2, 36, 6, '#64748b', 2).line(36, 6, 33, 10, '#94a3b8', 2).line(36, 6, 40, 10, '#94a3b8', 2);
        eyes(L, 12, 14, 30, '#22d3ee');
        L.rect(10, 54, 16, 57, '#334155').rect(28, 54, 34, 57, '#334155');
    },
    // A walking balance scale: two pans on a beam, a shield hanging in one pan.
    LOAD_BALANCER(L) {
        L.rect(20, 10, 24, 46, '#94a3b8').ellipse(22, 7, 5, 5, '#38bdf8').ellipse(22, 7, 2, 2, '#f8fafc');
        L.line(2, 16, 42, 16, '#cbd5e1', 2);
        L.line(6, 16, 3, 30, '#94a3b8').line(6, 16, 11, 30, '#94a3b8').line(38, 16, 33, 30, '#94a3b8').line(38, 16, 41, 30, '#94a3b8');
        L.ellipse(7, 31, 6, 2.5, '#64748b').ellipse(37, 31, 6, 2.5, '#64748b');
        L.poly([[33, 21], [41, 21], [41, 26], [37, 30], [33, 26]], '#3b82f6').line(37, 22, 37, 28, '#bfdbfe');
        L.ellipse(7, 27, 3, 3, '#f97316');
        L.rect(12, 46, 32, 50, '#475569').rect(14, 50, 18, 56, '#334155').rect(26, 50, 30, 56, '#334155');
    },
};

for (const [key, draw] of Object.entries(ENEMIES)) {
    const L = canvas();
    draw(L);
    fs.writeFileSync(`assets/enemies/${key}.png`, writePng(crop(outlined(L.g))));
}
console.log(`drew ${Object.keys(ENEMIES).length} enemies`);
