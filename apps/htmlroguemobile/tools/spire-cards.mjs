// Draws the Spire pack card art (70x45, like the other program images) into assets/program.
// Each card is a small pixel scene: shaded, outlined shapes over a dark backdrop tinted by card type.
// Run from the app folder: node tools/spire-cards.mjs
import fs from 'node:fs';
import { writePng } from './png.mjs';

const W = 70, H = 45;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const mix = (c, t, k) => c.map((v, i) => (i === 3 ? 255 : Math.round(v + (t[i] - v) * k)));
const OUTLINE = hex('#0b0f1a');

function layer() {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c ? (Array.isArray(c) ? c : hex(c)) : null; };
    const L = {
        g,
        px(x, y, c) { put(x, y, c); return L; },
        rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c); return L; },
        ellipse(cx, cy, rx, ry, c) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) put(x, y, c);
            return L;
        },
        ring(cx, cy, r, t, c) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r + 0.5 && d > r - t + 0.5) put(x, y, c); }
            return L;
        },
        line(x0, y0, x1, y1, c, t = 1) {
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
            for (let k = 0; k <= n; k++) {
                const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
                for (let j = -(t - 1) / 2; j <= (t - 1) / 2; j++) for (let i = -(t - 1) / 2; i <= (t - 1) / 2; i++) put(x + i, y + j, c);
            }
            return L;
        },
        poly(pts, c) {
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
            for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
            return L.poly(pts, c);
        },
        // Tiny 3x5 digits and signs for the few cards that print a number.
        text(x, y, str, c) {
            const F = { 0: '111101101101111', 2: '111001111100111', 3: '111001111001111', x: '000101010101000', '+': '000010111010000', '.': '000000000000010' };
            [...str].forEach((ch, n) => [...(F[ch] || '')].forEach((b, i) => { if (b === '1') put(x + n * 4 + (i % 3), y + Math.floor(i / 3), c); }));
            return L;
        },
    };
    return L;
}
// Light top-left edges, shadow bottom-right, dark outline (same look as the mod icons).
function finish(g) {
    const src = g.map((r) => r.slice()), empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !src[y][x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = src[y][x];
        if (!c) continue;
        if (empty(x, y - 1) || empty(x - 1, y)) g[y][x] = mix(c, [255, 255, 255], 0.35);
        else if (empty(x, y + 1) || empty(x + 1, y)) g[y][x] = mix(c, [0, 0, 0], 0.35);
    }
    const out = g.map((r) => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !empty(x + dx, y + dy))) out[y][x] = OUTLINE;
    return out;
}
// Dark backdrop with a soft glow of the card's colour, faint scanlines and a vignette.
function backdrop(tint) {
    const t = hex(tint), base = hex('#0b1020');
    return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
        const d = Math.hypot((x - W / 2) / W, (y - H / 2) / H) * 2;
        let c = mix(base, t, Math.max(0, 0.42 - d * 0.42));
        if (y % 3 === 0) c = mix(c, [0, 0, 0], 0.25);
        return mix(c, [0, 0, 0], Math.max(0, d - 0.7) * 0.8);
    }));
}
const TINT = { attack: '#ef4444', block: '#3b82f6', skill: '#22d3ee', power: '#a855f7', heat: '#f97316' };

// Each scene returns [tint, draw]. Scenes may draw several layers; each is shaded and outlined on its own.
const CARDS = {
    Sledgehammer: ['attack', [(L) => L.line(18, 40, 40, 14, '#92400e', 4), (L) => L.poly([[30, 6], [44, 0], [54, 16], [40, 22]], '#94a3b8').line(33, 7, 44, 2, '#e2e8f0'),
        (L) => L.star(50, 33, 9, 3, 8, '#facc15').star(50, 33, 4, 2, 8, '#fef3c7').line(4, 43, 66, 43, '#475569', 2)]],
    ShieldBash: ['attack', [(L) => L.line(4, 12, 20, 12, '#93c5fd').line(2, 22, 18, 22, '#93c5fd').line(6, 32, 20, 32, '#93c5fd'),
        (L) => L.poly([[20, 6], [42, 6], [42, 22], [31, 38], [20, 22]], '#3b82f6').line(31, 9, 31, 33, '#bfdbfe'),
        (L) => L.star(53, 22, 13, 5, 7, '#f97316').star(53, 22, 6, 3, 7, '#fde047')]],
    Overflow: ['heat', [(L) => L.rect(28, 3, 12, 28, '#e2e8f0').ellipse(34, 34, 9, 8, '#ef4444').rect(32, 8, 4, 26, '#ef4444'),
        (L) => { for (let x = 0; x < 70; x++) L.rect(x, 38 + Math.round(Math.sin(x / 3) * 2), 1, 7, '#38bdf8'); return L; },
        (L) => L.ellipse(22, 8, 4, 3, '#38bdf8').ellipse(48, 6, 4, 3, '#38bdf8').ellipse(14, 20, 3, 2, '#7dd3fc').ellipse(56, 18, 3, 2, '#7dd3fc')]],
    PureAttack: ['attack', [(L) => L.line(10, 40, 34, 6, '#e2e8f0', 3).line(8, 30, 18, 36, '#facc15', 2),
        (L) => L.line(60, 40, 36, 6, '#e2e8f0', 3).line(62, 30, 52, 36, '#facc15', 2),
        (L) => L.line(35, 42, 35, 4, '#fca5a5', 3).line(29, 34, 41, 34, '#facc15', 2)]],
    Iterate: ['attack', [(L) => L.ring(35, 22, 17, 4, '#22c55e').rect(35, 2, 20, 12, null).poly([[35, 0], [44, 6], [35, 12]], '#22c55e'),
        (L) => L.line(26, 32, 44, 12, '#e2e8f0', 3).line(24, 28, 30, 34, '#facc15', 2),
        (L) => L.text(52, 34, '++', '#86efac')]],
    BoltArray: ['attack', [(L) => L.poly([[14, 2], [5, 22], [12, 22], [8, 42], [21, 16], [14, 16], [19, 2]], '#ef4444'),
        (L) => L.poly([[37, 2], [28, 22], [35, 22], [31, 42], [44, 16], [37, 16], [42, 2]], '#ef4444'),
        (L) => L.poly([[60, 2], [51, 22], [58, 22], [54, 42], [67, 16], [60, 16], [65, 2]], '#ef4444')]],
    Exploit: ['attack', [(L) => L.poly([[22, 6], [48, 6], [48, 24], [35, 40], [22, 24]], '#64748b').line(35, 8, 30, 18, '#0b0f1a').line(30, 18, 38, 26, '#0b0f1a').line(38, 26, 33, 36, '#0b0f1a'),
        (L) => L.ring(35, 22, 16, 2, '#f97316').rect(34, 2, 2, 9, '#f97316').rect(34, 34, 2, 9, '#f97316').rect(15, 21, 9, 2, '#f97316').rect(47, 21, 9, 2, '#f97316')]],
    Chokehold: ['attack', [(L) => L.rect(24, 6, 22, 18, '#94a3b8').rect(28, 11, 5, 4, '#38bdf8').rect(38, 11, 5, 4, '#38bdf8').rect(31, 24, 8, 14, '#64748b'),
        (L) => { for (let i = 0; i < 7; i++) L.ring(14 + i * 7, 26 + (i % 2), 4, 2, i % 2 ? '#cbd5e1' : '#94a3b8'); return L; },
        (L) => L.rect(54, 30, 12, 10, '#fbbf24').rect(52, 33, 4, 6, '#fbbf24')]],
    PurgeExe: ['heat', [(L) => L.rect(10, 12, 14, 20, '#e2e8f0').rect(28, 8, 14, 20, '#e2e8f0').rect(46, 12, 14, 20, '#e2e8f0'),
        (L) => L.ellipse(17, 36, 8, 7, '#f97316').poly([[9, 35], [17, 18], [25, 35]], '#f97316').ellipse(35, 34, 9, 9, '#ef4444').poly([[26, 33], [35, 12], [44, 33]], '#ef4444')
            .ellipse(53, 36, 8, 7, '#f97316').poly([[45, 35], [53, 18], [61, 35]], '#f97316'),
        (L) => L.ellipse(17, 38, 4, 4, '#fde047').ellipse(35, 37, 5, 5, '#fde047').ellipse(53, 38, 4, 4, '#fde047')]],
    DoubleDown: ['block', [(L) => L.poly([[10, 8], [30, 8], [30, 24], [20, 38], [10, 24]], '#1d4ed8'),
        (L) => L.poly([[24, 4], [46, 4], [46, 22], [35, 40], [24, 22]], '#3b82f6').line(35, 7, 35, 35, '#bfdbfe'),
        (L) => L.text(52, 18, 'x2', '#fde047')]],
    Triage: ['block', [(L) => L.poly([[18, 4], [52, 4], [52, 24], [35, 42], [18, 24]], '#3b82f6'),
        (L) => L.rect(31, 9, 8, 24, '#f8fafc').rect(23, 17, 24, 8, '#f8fafc'),
        (L) => L.rect(32, 10, 6, 22, '#ef4444').rect(24, 18, 22, 6, '#ef4444')]],
    PanicSwap: ['skill', [(L) => L.poly([[6, 14], [18, 6], [24, 30], [12, 38]], '#e2e8f0').poly([[46, 8], [60, 12], [54, 38], [40, 34]], '#e2e8f0'),
        (L) => L.poly([[22, 14], [32, 8], [32, 11], [44, 11], [44, 17], [32, 17], [32, 20]], '#22d3ee').poly([[48, 30], [38, 36], [38, 33], [26, 33], [26, 27], [38, 27], [38, 24]], '#f97316')]],
    Duplicate: ['skill', [(L) => L.rect(10, 6, 22, 32, '#e2e8f0').rect(13, 9, 16, 10, '#a855f7').rect(13, 22, 16, 2, '#94a3b8').rect(13, 27, 11, 2, '#94a3b8'),
        (L) => { for (let i = 0; i < 32; i += 3) { L.rect(38, 6 + i, 1, 2, '#c4b5fd').rect(59, 6 + i, 1, 2, '#c4b5fd'); } for (let i = 0; i < 22; i += 3) { L.rect(38 + i, 6, 2, 1, '#c4b5fd').rect(38 + i, 37, 2, 1, '#c4b5fd'); } return L; },
        (L) => L.poly([[30, 20], [36, 15], [36, 18], [40, 18], [40, 22], [36, 22], [36, 25]], '#22d3ee')]],
    ScrapArmor: ['power', [(L) => L.poly([[18, 6], [52, 6], [52, 24], [35, 42], [18, 24]], '#64748b'),
        (L) => L.rect(22, 9, 10, 8, '#94a3b8').rect(35, 10, 13, 7, '#78716c').rect(24, 20, 11, 8, '#a8a29e').rect(37, 20, 10, 9, '#94a3b8').rect(30, 31, 10, 6, '#78716c'),
        (L) => L.ellipse(25, 11, 1, 1, '#f8fafc').ellipse(45, 12, 1, 1, '#f8fafc').ellipse(27, 25, 1, 1, '#f8fafc').ellipse(43, 26, 1, 1, '#f8fafc')]],
    Recycler: ['power', [(L) => {
        // Three arrows chasing each other round a loop.
        L.ring(35, 22, 16, 5, '#22c55e');
        [0, 1, 2].forEach((i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3, x = 35 + Math.cos(a) * 13.5, y = 22 + Math.sin(a) * 13.5;
            L.ellipse(35 + Math.cos(a - 0.35) * 13.5, 22 + Math.sin(a - 0.35) * 13.5, 3, 3, null);
            const t = a + Math.PI / 2;
            L.poly([[x + Math.cos(t) * 7, y + Math.sin(t) * 7], [x + Math.cos(a) * 6, y + Math.sin(a) * 6], [x - Math.cos(a) * 6, y - Math.sin(a) * 6]], '#4ade80');
        });
        return L;
    }]],
    ZeroDay: ['power', [(L) => { for (let i = 0; i < 5; i++) L.rect(22 + i * 6, 3, 3, 5, '#94a3b8').rect(22 + i * 6, 37, 3, 5, '#94a3b8').rect(14, 13 + i * 5 - 3, 6, 2, '#94a3b8').rect(50, 13 + i * 5 - 3, 6, 2, '#94a3b8'); return L; },
        (L) => L.rect(19, 7, 32, 30, '#334155'),
        (L) => L.ellipse(35, 18, 8, 7, '#f8fafc').rect(30, 22, 10, 6, '#f8fafc'),
        (L) => L.rect(31, 16, 3, 3, '#ef4444').rect(37, 16, 3, 3, '#ef4444').text(30, 30, '0', '#ef4444')]],
    Papercuts: ['power', [(L) => L.poly([[8, 10], [26, 4], [32, 26], [14, 32]], '#f8fafc').poly([[36, 14], [54, 10], [58, 34], [40, 38]], '#e2e8f0'),
        (L) => L.line(4, 40, 30, 14, '#ef4444', 2).line(30, 42, 62, 8, '#ef4444', 2).line(50, 42, 66, 26, '#ef4444', 2)]],
    BurnIn: ['heat', [(L) => L.rect(14, 4, 42, 30, '#475569').rect(30, 34, 10, 4, '#334155').rect(22, 38, 26, 3, '#334155'),
        (L) => L.rect(17, 7, 36, 24, '#1e1b4b'),
        (L) => L.ellipse(35, 24, 9, 6, '#f97316').poly([[26, 23], [33, 8], [35, 13], [39, 9], [44, 23]], '#f97316').ellipse(35, 25, 5, 4, '#fde047')]],
};

for (const [file, [type, layers]] of Object.entries(CARDS)) {
    const out = backdrop(TINT[type]);
    layers.forEach((draw) => {
        const L = layer();
        draw(L);
        finish(L.g).forEach((row, y) => row.forEach((c, x) => { if (c) out[y][x] = c; }));
    });
    fs.writeFileSync(`assets/program/${file}.png`, writePng(out));
}
console.log(`drew ${Object.keys(CARDS).length} cards`);
