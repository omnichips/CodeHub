// Draws the game's 32x32 pixel icons: one per mod (assets/mods), per status (assets/status)
// and the card-effect sprites (assets/fx). Run from the app folder: node tools/make-icons.mjs
// Every icon is built from the shapes below, outlined and shaded the same way, so they match.
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

const S = 32;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const mix = (c, t, k) => c.map((v, i) => (i === 3 ? 255 : Math.round(v + (t[i] - v) * k)));
const light = (c) => mix(c, [255, 255, 255], 0.4);
const dark = (c) => mix(c, [0, 0, 0], 0.4);
const OUTLINE = hex('#0b0f1a');

// A layer is a 32x32 grid of colours (null = empty).
function layer() {
    const g = Array.from({ length: S }, () => Array(S).fill(null));
    const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c; };
    const L = {
        g,
        px(x, y, c) { put(x, y, c); return L; },
        rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c); return L; },
        circle(cx, cy, r, c) {
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6) put(x, y, c);
            return L;
        },
        ellipse(cx, cy, rx, ry, c) {
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.05) put(x, y, c);
            return L;
        },
        ring(cx, cy, r, t, c) {
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const d = Math.hypot(x - cx, y - cy);
                if (d <= r + 0.5 && d > r - t + 0.5) put(x, y, c);
            }
            return L;
        },
        line(x0, y0, x1, y1, c, t = 1) {
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
            for (let k = 0; k <= n; k++) {
                const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
                if (t === 1) put(x, y, c);
                else for (let j = -(t - 1) / 2; j <= (t - 1) / 2; j++) for (let i = -(t - 1) / 2; i <= (t - 1) / 2; i++) put(x + i, y + j, c);
            }
            return L;
        },
        poly(pts, c) {
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
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
            for (let i = 0; i < n * 2; i++) {
                const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n;
                pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
            }
            return L.poly(pts, c);
        },
    };
    return L;
}

// Light on the top-left edges, shadow on the bottom-right edges, then a dark outline around it all.
function finish(L) {
    const g = L.g, src = g.map((r) => r.slice());
    const empty = (x, y) => x < 0 || y < 0 || x >= S || y >= S || !src[y][x];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const c = src[y][x];
        if (!c || c.flat) continue;
        if (empty(x, y - 1) || empty(x - 1, y)) g[y][x] = light(c);
        else if (empty(x, y + 1) || empty(x + 1, y)) g[y][x] = dark(c);
    }
    const out = g.map((r) => r.slice());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (g[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !empty(x + dx, y + dy))) out[y][x] = OUTLINE;
    }
    L.g.splice(0, S, ...out);
    return L;
}
// A colour that finish() leaves alone (for small details that shading would wash out).
const flat = (h) => Object.assign(hex(h), { flat: true });

// ---------------------------------------------------------------------------------------------
// Motifs: each draws on a fresh layer in the middle ~24px of the icon.
// ---------------------------------------------------------------------------------------------
const C = {
    red: hex('#ef4444'), orange: hex('#f97316'), yellow: hex('#facc15'), gold: hex('#f2b233'), green: hex('#22c55e'),
    lime: hex('#a3e635'), cyan: hex('#38bdf8'), ice: hex('#bae6fd'), blue: hex('#3b82f6'), navy: hex('#1e3a8a'),
    purple: hex('#a855f7'), pink: hex('#f472b6'), white: hex('#e5e7eb'), grey: hex('#94a3b8'), steel: hex('#64748b'),
    dgrey: hex('#334155'), brown: hex('#92400e'), black: hex('#111827'), teal: hex('#14b8a6'), magenta: hex('#d946ef'),
};
const M = {
    shield: (L, c = C.blue) => L.poly([[7, 5], [25, 5], [25, 15], [16, 27], [7, 15]], c).line(16, 7, 16, 23, flat('#bfdbfe'), 1),
    heart: (L, c = C.red) => L.circle(11, 12, 5, c).circle(21, 12, 5, c).poly([[5.5, 13], [26.5, 13], [16, 26]], c).px(10, 10, flat('#ffffff')),
    sword: (L) => L.line(10, 22, 24, 8, C.white, 3).line(8, 17, 15, 24, C.gold, 2).line(5, 27, 9, 23, C.brown, 2),
    coin: (L, c = C.gold) => L.circle(16, 16, 10, c).ring(16, 16, 7, 1, flat('#b7791f')).line(16, 11, 16, 21, flat('#7c4a03'), 1).line(14, 13, 18, 13, flat('#7c4a03')).line(14, 19, 18, 19, flat('#7c4a03')),
    chip: (L, c = C.green) => {
        for (let i = 0; i < 4; i++) { L.rect(10 + i * 4, 5, 2, 3, C.grey).rect(10 + i * 4, 24, 2, 3, C.grey).rect(5, 10 + i * 4, 3, 2, C.grey).rect(24, 10 + i * 4, 3, 2, C.grey); }
        return L.rect(8, 8, 16, 16, C.dgrey).rect(12, 12, 8, 8, c);
    },
    flame: (L, c = C.orange) => L.circle(16, 20, 7, c).poly([[9, 19], [14, 9], [16, 3], [19, 10], [23, 19]], c).circle(16, 22, 4, C.yellow).poly([[12, 21], [16, 12], [20, 21]], C.yellow),
    snowflake: (L, c = C.ice) => {
        for (let a = 0; a < 3; a++) {
            const t = (a * Math.PI) / 3, dx = Math.cos(t) * 11, dy = Math.sin(t) * 11;
            L.line(16 - dx, 16 - dy, 16 + dx, 16 + dy, c, 2);
            for (const s of [-1, 1]) {
                const bx = 16 + (dx * 0.6) * s, by = 16 + (dy * 0.6) * s;
                const t1 = t + (s > 0 ? 0 : Math.PI);
                L.line(bx, by, bx + Math.cos(t1 + 0.8) * 4, by + Math.sin(t1 + 0.8) * 4, c).line(bx, by, bx + Math.cos(t1 - 0.8) * 4, by + Math.sin(t1 - 0.8) * 4, c);
            }
        }
        return L;
    },
    gear: (L, c = C.grey) => {
        L.circle(16, 16, 8, c);
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; L.line(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, c, 3); }
        return L.circle(16, 16, 3, C.dgrey);
    },
    battery: (L, c = C.green) => L.rect(13, 5, 6, 3, C.grey).rect(9, 7, 14, 21, C.dgrey).rect(11, 9, 10, 17, C.black).rect(12, 18, 8, 7, c).rect(12, 13, 8, 4, c),
    skull: (L, c = C.white) => L.circle(16, 13, 9, c).rect(11, 18, 10, 7, c).circle(12, 14, 2, flat('#111827')).circle(20, 14, 2, flat('#111827')).rect(15, 18, 2, 2, flat('#111827')).line(13, 22, 13, 24, flat('#111827')).line(16, 22, 16, 24, flat('#111827')).line(19, 22, 19, 24, flat('#111827')),
    key: (L, c = C.gold) => L.ring(11, 11, 6, 3, c).line(15, 15, 26, 26, c, 3).line(22, 22, 19, 25, c, 2).line(25, 25, 22, 28, c, 2),
    eye: (L, c = C.cyan) => L.poly([[3, 16], [9, 9], [16, 7], [23, 9], [29, 16], [23, 23], [16, 25], [9, 23]], C.white).circle(16, 16, 6, c).circle(16, 16, 3, flat('#0b0f1a')).px(14, 14, flat('#ffffff')),
    eyeShut: (L) => L.poly([[3, 15], [9, 19], [16, 21], [23, 19], [29, 15], [23, 17], [16, 18], [9, 17]], C.white).line(9, 20, 7, 24, C.white).line(16, 22, 16, 26, C.white).line(23, 20, 25, 24, C.white),
    card: (L, c = C.purple) => L.rect(9, 5, 15, 22, C.white).rect(11, 7, 11, 7, c).rect(11, 16, 11, 2, C.grey).rect(11, 20, 8, 2, C.grey),
    cards: (L, c = C.purple) => L.poly([[4, 10], [14, 6], [19, 25], [9, 29]], C.grey).rect(13, 4, 14, 21, C.white).rect(15, 6, 10, 7, c).rect(15, 15, 10, 2, C.grey).rect(15, 19, 7, 2, C.grey),
    fan: (L, c = C.cyan) => {
        L.ring(16, 16, 12, 2, C.grey);
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; L.poly([[16, 16], [16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10], [16 + Math.cos(a + 0.7) * 9, 16 + Math.sin(a + 0.7) * 9]], c); }
        return L.circle(16, 16, 2, C.dgrey);
    },
    bolt: (L, c = C.yellow) => L.poly([[19, 2], [7, 18], [15, 18], [11, 30], [25, 12], [17, 12], [22, 2]], c),
    plus: (L, c = C.green) => L.rect(13, 5, 6, 22, c).rect(5, 13, 22, 6, c),
    bomb: (L) => L.circle(14, 19, 9, C.dgrey).rect(17, 8, 5, 4, C.grey).line(21, 8, 25, 4, C.brown).star(26, 4, 4, 1.5, 4, C.yellow).px(10, 15, flat('#94a3b8')),
    crosshair: (L, c = C.red) => L.ring(16, 16, 10, 2, c).ring(16, 16, 4, 1, c).rect(15, 2, 2, 8, c).rect(15, 22, 2, 8, c).rect(2, 15, 8, 2, c).rect(22, 15, 8, 2, c),
    clock: (L, c = C.white) => L.circle(16, 16, 11, c).ring(16, 16, 11, 2, C.steel).line(16, 16, 16, 9, flat('#111827'), 2).line(16, 16, 21, 18, flat('#111827'), 2),
    thermo: (L, c = C.red) => L.rect(13, 3, 6, 19, C.white).circle(16, 24, 6, c).rect(15, 10, 2, 14, c),
    bag: (L, c = C.gold) => L.circle(16, 20, 9, c).poly([[11, 12], [21, 12], [24, 4], [8, 4]], c).rect(11, 11, 10, 2, C.brown).line(16, 15, 16, 25, flat('#7c4a03')).line(14, 17, 18, 17, flat('#7c4a03')).line(14, 23, 18, 23, flat('#7c4a03')),
    wrench: (L, c = C.grey) => L.line(8, 24, 20, 12, c, 4).ring(22, 10, 6, 3, c).poly([[22, 10], [30, 2], [30, 10]], null),
    arrowUp: (L, c = C.green) => L.poly([[16, 3], [27, 15], [20, 15], [20, 28], [12, 28], [12, 15], [5, 15]], c),
    hand: (L, c = hex('#fcd34d')) => L.rect(9, 14, 14, 13, c).rect(9, 6, 3, 10, c).rect(13, 4, 3, 12, c).rect(17, 5, 3, 11, c).rect(21, 8, 3, 9, c).line(5, 14, 9, 19, c, 3),
    drop: (L, c = C.cyan) => L.circle(16, 20, 8, c).poly([[8.5, 18], [16, 3], [23.5, 18]], c),
    sprout: (L, c = C.green) => L.line(16, 28, 16, 13, C.lime, 2).ellipse(10, 12, 6, 3.5, c).ellipse(22, 9, 6, 3.5, c),
    thorns: (L, c = C.lime) => L.star(16, 16, 13, 6, 8, c).circle(16, 16, 5, C.green),
    crown: (L, c = C.gold) => L.poly([[5, 24], [5, 9], [11, 16], [16, 6], [21, 16], [27, 9], [27, 24]], c).rect(5, 23, 23, 4, c).px(16, 18, flat('#ef4444')).px(11, 20, flat('#38bdf8')).px(21, 20, flat('#38bdf8')),
    hourglass: (L, c = C.gold) => L.rect(7, 3, 18, 3, C.brown).rect(7, 26, 18, 3, C.brown).poly([[9, 6], [23, 6], [16, 16], [23, 26], [9, 26], [16, 16]], C.ice).poly([[11, 26], [21, 26], [16, 20]], c),
    wave: (L, c = C.cyan) => { for (const y0 of [10, 17, 24]) for (let x = 4; x < 28; x++) L.rect(x, y0 + Math.round(Math.sin(x / 2.5) * 2), 1, 3, c); return L; },
    tower: (L, c = C.grey) => L.rect(7, 10, 18, 18, c).rect(7, 5, 4, 6, c).rect(14, 5, 4, 6, c).rect(21, 5, 4, 6, c).rect(14, 20, 4, 8, flat('#111827')),
    lock: (L, c = C.gold) => L.ring(16, 12, 7, 3, C.grey).rect(7, 14, 18, 14, c).rect(15, 18, 2, 5, flat('#111827')),
    feather: (L, c = C.white) => L.poly([[25, 3], [28, 7], [21, 19], [12, 25], [8, 24], [9, 20], [15, 11]], c).line(26, 5, 6, 28, C.grey).line(12, 18, 14, 21, C.grey).line(16, 13, 19, 16, C.grey),
    burst: (L, c = C.yellow) => L.star(16, 16, 14, 6, 8, C.orange).star(16, 16, 9, 4, 8, c),
    fist: (L, c = hex('#fbbf24')) => L.rect(8, 9, 17, 15, c).rect(8, 22, 12, 5, c).line(12, 9, 12, 15, flat('#92400e')).line(16, 9, 16, 15, flat('#92400e')).line(20, 9, 20, 15, flat('#92400e')).rect(5, 13, 5, 7, c),
    iceblock: (L, c = C.ice) => L.rect(5, 6, 22, 21, c).line(8, 9, 14, 9, flat('#ffffff')).line(8, 9, 8, 14, flat('#ffffff')).line(20, 22, 24, 18, flat('#7dd3fc')),
    cloud: (L, c = C.white) => L.circle(11, 18, 6, c).circle(20, 15, 8, c).circle(24, 21, 5, c).rect(9, 20, 18, 5, c),
    bubbles: (L, c = C.lime) => L.circle(11, 20, 7, c).circle(22, 13, 5, c).circle(21, 25, 3, c).px(9, 17, flat('#ffffff')).px(21, 11, flat('#ffffff')),
    campfire: (L) => L.line(6, 26, 26, 22, C.brown, 3).line(6, 22, 26, 26, C.brown, 3).circle(16, 18, 5, C.orange).poly([[11, 17], [16, 5], [21, 17]], C.orange).circle(16, 19, 3, C.yellow),
    book: (L, c = C.red) => L.rect(6, 6, 20, 21, c).rect(9, 6, 2, 21, dark(c)).rect(23, 8, 3, 17, C.white).rect(13, 11, 9, 2, flat('#fde68a')),
    void: (L) => L.circle(16, 16, 12, C.purple).ring(16, 16, 9, 2, C.magenta).circle(16, 16, 6, flat('#0b0f1a')).px(11, 9, flat('#ffffff')),
    swap: (L, c = C.cyan) => L.poly([[4, 12], [12, 5], [12, 9], [26, 9], [26, 15], [12, 15], [12, 19]], c).poly([[28, 20], [20, 13], [20, 17], [6, 17], [6, 23], [20, 23], [20, 27]], C.orange),
    altar: (L) => L.rect(5, 18, 22, 10, C.steel).rect(8, 14, 16, 4, C.grey).circle(16, 9, 4, C.yellow).poly([[13, 9], [16, 1], [19, 9]], C.orange),
    magnet: (L, c = C.red) => L.ring(16, 15, 10, 5, c).rect(4, 15, 25, 13, null).rect(6, 15, 5, 8, c).rect(21, 15, 5, 8, c).rect(6, 22, 5, 4, C.white).rect(21, 22, 5, 4, C.white),
    spiral: (L, c = C.purple) => { for (let t = 0; t < 16; t += 0.05) L.rect(16 + Math.cos(t) * t * 0.75, 16 + Math.sin(t) * t * 0.75, 2, 2, c); return L; },
    ticket: (L, c = C.pink) => L.rect(4, 9, 24, 14, c).circle(4, 16, 3, null).circle(28, 16, 3, null).line(19, 10, 19, 22, flat('#ffffff')).star(11, 16, 4, 1.8, 5, C.yellow),
    pill: (L, c = C.red) => L.circle(11, 21, 6, c).circle(21, 11, 6, C.blue).line(11, 21, 21, 11, C.white, 8).line(11, 21, 16, 16, c, 8).circle(11, 21, 6, c).circle(21, 11, 6, C.blue),
    syringe: (L, c = C.green) => L.line(8, 24, 22, 10, C.white, 6).line(10, 22, 18, 14, c, 4).line(22, 10, 27, 5, C.grey, 2).line(5, 27, 8, 24, C.grey, 3),
    glitch: (L) => L.rect(5, 7, 16, 4, C.magenta).rect(10, 12, 18, 4, C.cyan).rect(4, 17, 14, 4, C.lime).rect(12, 22, 15, 4, C.magenta),
    radar: (L, c = C.green) => L.ring(16, 16, 12, 2, c).ring(16, 16, 7, 1, c).line(16, 16, 24, 8, c, 2).px(10, 20, flat('#fef08a')),
    stop: (L, c = C.red) => L.ring(16, 16, 11, 3, c).line(9, 9, 23, 23, c, 3),
    pause: (L, c = C.cyan) => L.rect(8, 6, 6, 20, c).rect(18, 6, 6, 20, c),
    slash: (L, c = C.white) => L.line(5, 27, 27, 5, c, 3).line(9, 27, 27, 9, C.grey, 1),
    chart: (L, c = C.green) => L.rect(5, 26, 22, 2, C.grey).rect(5, 5, 2, 22, C.grey).line(8, 22, 14, 15, c, 2).line(14, 15, 18, 18, c, 2).line(18, 18, 26, 7, c, 2),
    bricks: (L, c = hex('#b45309')) => { for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) L.rect(4 + k * 10 + (r % 2) * 5, 6 + r * 6, 9, 5, c); return L; },
    stance: (L, c = C.red) => L.circle(16, 16, 11, c).circle(16, 16, 5, light(c)),
    mirror: (L) => L.ellipse(16, 13, 9, 11, C.grey).ellipse(16, 13, 7, 9, C.ice).line(16, 24, 16, 30, C.brown, 3).line(12, 10, 15, 7, flat('#ffffff')),
    satellite: (L, c = C.grey) => L.ellipse(13, 19, 9, 5, c).line(13, 19, 23, 9, C.steel, 2).circle(24, 8, 2, C.red).line(20, 25, 24, 29, C.steel, 2),
    factory: (L) => L.poly([[4, 28], [4, 16], [11, 12], [11, 16], [18, 12], [18, 16], [28, 16], [28, 28]], C.steel).rect(22, 5, 4, 12, C.grey).circle(25, 4, 3, C.white),
    trash: (L) => L.rect(7, 6, 18, 3, C.grey).rect(13, 3, 6, 3, C.grey).poly([[8, 10], [24, 10], [22, 28], [10, 28]], C.steel).line(13, 13, 13, 25, flat('#334155')).line(19, 13, 19, 25, flat('#334155')),
    muscle: (L, c = hex('#fbbf24')) => L.ellipse(14, 20, 9, 6, c).ellipse(21, 11, 5, 7, c).circle(23, 6, 4, c),
    ghost: (L, c = C.white) => L.circle(16, 13, 9, c).rect(7, 13, 19, 12, c).poly([[7, 24], [10, 29], [13, 24], [16, 29], [19, 24], [22, 29], [25, 24]], c).circle(12, 13, 2, flat('#111827')).circle(20, 13, 2, flat('#111827')),
    nut: (L, c = C.grey) => L.poly([[16, 4], [26, 10], [26, 22], [16, 28], [6, 22], [6, 10]], c).circle(16, 16, 4, flat('#334155')),
    signal: (L, c = C.cyan) => L.rect(5, 22, 4, 6, c).rect(11, 17, 4, 11, c).rect(17, 11, 4, 17, c).rect(23, 5, 4, 23, c),
    flask: (L, c = C.lime) => L.rect(13, 3, 6, 9, C.ice).poly([[13, 11], [19, 11], [27, 27], [5, 27]], C.ice).poly([[9, 19], [23, 19], [27, 27], [5, 27]], c),
    drop2: (L, c = C.red) => L.circle(16, 20, 8, c).poly([[8.5, 18], [16, 3], [23.5, 18]], c).px(13, 18, flat('#ffffff')),
    radioactive: (L, c = C.lime) => L.circle(16, 16, 12, C.yellow).poly([[16, 16], [10, 6], [22, 6]], C.black).poly([[16, 16], [27, 18], [21, 27]], C.black).poly([[16, 16], [11, 27], [5, 18]], C.black).circle(16, 16, 3, C.black).circle(16, 16, 2, C.yellow),
    nobox: (L, c = C.red) => L.ring(16, 16, 12, 3, c).rect(8, 14, 16, 4, c),
    returnArrow: (L, c = C.cyan) => L.ring(16, 17, 9, 3, c).rect(16, 6, 12, 12, null).poly([[16, 2], [23, 8], [16, 14]], c),
};

// Mods: [motif, colour, frame, badge]. frame colours by role, badge = small tier pips (1-3).
const F = { atk: '#ef4444', def: '#3b82f6', heat: '#38bdf8', eco: '#f2b233', draw: '#a855f7', heal: '#22c55e', ancient: '#d946ef' };
const MODS = {
    'PLATING': ['shield', C.steel, F.def, 1], 'CORE': ['chip', C.red, F.atk, 1], 'SHIELD': ['shield', C.blue, F.def, 0],
    'TURBO FAN': ['fan', C.cyan, F.heat, 0], 'RADIATOR': ['bricks', C.cyan, F.heat, 0], 'DAMPER': ['nut', C.blue, F.def, 1],
    'MEGA DAMPER': ['nut', C.cyan, F.def, 3], 'BLADE BUS': ['sword', null, F.atk, 0], 'INJECTOR': ['syringe', C.green, F.heal, 1],
    'NANOFRAME': ['syringe', C.cyan, F.heal, 3], 'THERMAL VAULT': ['thermo', C.blue, F.heat, 1], 'ARCHIVE': ['book', C.purple, F.draw, 0],
    'ELITE CACHE': ['cards', C.orange, F.draw, 2], 'BOSS VAULT': ['cards', C.red, F.draw, 3], 'SCRAPPER': ['wrench', C.grey, F.eco, 1],
    'BANKER': ['bag', C.gold, F.eco, 0], 'PATCH PANEL': ['battery', C.blue, F.def, 1], 'CITADEL': ['tower', C.grey, F.def, 0],
    'VAMP SOCKET': ['drop2', C.red, F.heal, 0], 'PACER': ['clock', C.white, F.heat, 1], 'QUANT PUMP': ['clock', C.ice, F.heat, 3],
    'DEFRAG': ['glitch', null, F.heat, 0], 'LAST RESORT': ['skull', C.white, F.atk, 0], 'EMERGENCY LOOP': ['returnArrow', C.red, F.heat, 0],
    'FAST CACHE': ['card', C.cyan, F.draw, 1], 'DEEP CACHE': ['card', C.purple, F.draw, 2], 'BULKHEAD': ['shield', C.steel, F.def, 3],
    'ULTRA CORE': ['chip', C.magenta, F.atk, 3], 'ALPHA STRIKE BUS': ['burst', C.yellow, F.atk, 0], 'VENTED ARMOR': ['cloud', C.white, F.def, 0],
    'IMPACT BAFFLE': ['nut', C.orange, F.def, 0], 'LOOP BUFFER': ['spiral', C.purple, F.draw, 0], 'PURGE NOZZLE': ['drop', C.cyan, F.heat, 0],
    'COOL CYCLE': ['snowflake', C.ice, F.heat, 0], 'PRESSURE VALVE': ['gear', C.orange, F.def, 0], 'CONDUCTIVE COIL': ['bolt', C.yellow, F.atk, 0],
    'THERMAL CAPACITOR': ['battery', C.orange, F.heat, 0], 'EXOTHERMIC PULSE': ['burst', C.orange, F.atk, 2], 'OOGWAY': ['sprout', C.green, F.def, 0],
    'AUTO-LOADER': ['bomb', null, F.atk, 0], 'AUTO-AIM': ['crosshair', C.red, F.atk, 0], 'THORNS': ['thorns', C.lime, F.def, 0],
    'VAMPIRIC LINK': ['heart', C.red, F.heal, 2], 'CAMPFIRE': ['campfire', null, F.heal, 0], 'EXTRA HAND': ['hand', undefined, F.draw, 1],
    'PRE-PROCESSOR': ['chip', C.cyan, F.draw, 0], 'BUFFER CACHE': ['hand', undefined, F.draw, 2], 'LEGACY DRIVER': ['shield', C.purple, F.def, 2],
    'SYMBIOTE': ['ghost', C.teal, F.def, 0], 'CREDIT SKIMMER': ['coin', C.gold, F.eco, 2], 'MEMBERSHIP TOKEN': ['ticket', C.pink, F.eco, 0],
    'ELEVATOR KEYCARD': ['key', C.cyan, F.eco, 0], 'DEBT COLLECTOR': ['book', C.gold, F.eco, 0], 'BLACK MARKET CHIP': ['chip', C.black, F.eco, 0],
    'INSURANCE VOUCHER': ['ticket', C.green, F.heal, 0], 'I3 CORE': ['chip', C.orange, F.atk, 2], 'SIDE HUSTLE': ['plus', C.green, F.heal, 0],
    'CORE OVERCLOCKER': ['thermo', C.orange, F.draw, 0], 'FEEDBACK LOOP': ['signal', C.orange, F.atk, 0], 'POWER SPINDLE': ['muscle', undefined, F.atk, 0],
    'BIO-REACTOR': ['flask', C.lime, F.heal, 0], 'CREDIT PERIPHERAL': ['coin', C.yellow, F.eco, 1], 'HEX CORE': ['skull', C.purple, F.atk, 0],
    'ANCIENT ALTAR': ['altar', null, F.ancient, 0], 'VOID REACTOR': ['void', null, F.ancient, 0], 'BLIND TREASURY': ['eyeShut', null, F.ancient, 0],
    'TITAN HUNGER': ['fist', undefined, F.ancient, 0], 'OBLIVION CORE': ['eye', C.magenta, F.ancient, 0], 'REVERSAL ENGINE': ['swap', null, F.ancient, 0],
    'FRACTURED LEDGER': ['book', C.magenta, F.ancient, 0],
};
const STATUS = {
    STATIC_CHARGE: ['bolt', C.yellow], HEAT_ROOM: ['flame'], JUNK_DATA: ['trash'], SYNC_STALL: ['lock', C.purple], FLUSH_DEBUFF: ['snowflake', C.cyan],
    FURNACE_PASSIVE: ['factory'], DISABLE: ['stop'], REFLECT_THORNS: ['thorns', C.orange], PLAYER_THORNS: ['thorns'], SYSTEM_LAG: ['pause'],
    HALF_LAG: ['shield', C.cyan], PACKET_NULL: ['satellite'], TARGET_LOCK: ['crosshair'], AUTO_LOADER_CD: ['hourglass'], AUTO_LOADER_READY: ['bolt', C.green],
    PLAYER_HOLLOW_P: ['shield', C.purple], PLAYER_BATTLE_TRANCE: ['flame', C.red], PLAYER_MOU_SHINDE: ['skull'], PLAYER_GOD_MODE: ['bag'],
    PLAYER_NONE_PASS: ['nobox'], PLAYER_F_COUNTER: ['returnArrow', C.orange], PLAYER_KEDAVRA: ['thermo', C.lime], MIRROR_CAST: ['mirror'],
    MIRROR_DEBUFF: ['mirror'], STRENGTH: ['muscle'], PLATING: ['nut'], EVASION: ['ghost'], TIMED_BOMB: ['bomb'], LEECH: ['drop2'],
    HEAT_SCALE: ['chart', C.orange], POWER_GROW: ['sprout'], CARD_TRIGGER: ['eye', C.red], BLOCK_TRIGGER: ['bricks'], RED_STANCE: ['stance', C.red],
    BLUE_STANCE: ['stance', C.blue], CORROSIVE_LEAK: ['radioactive'], CORRUPTION: ['skull', C.lime], BIT_ROT: ['flask', C.purple], LOGIC_BOMB: ['bomb'],
    STATIC_INTERFERENCE: ['signal', C.grey],
};
// Card-effect sprites (CardFx in index.html).
const FX = {
    freeze: ['iceblock'], snow: ['snowflake'], feather: ['feather'], flame: ['flame'], bolt: ['bolt'], burst: ['burst'], skull: ['skull'],
    bubbles: ['bubbles'], coin: ['coin'], heart: ['heart'], shield: ['shield', C.cyan], cloud: ['cloud'], cards: ['cards'], crosshair: ['crosshair'],
    clock: ['clock'], drop: ['drop'], fist: ['fist'], sword: ['sword'], glitch: ['glitch'], wave: ['wave'], star: ['burst', C.white], bomb: ['bomb'],
};

function draw(motif, color) {
    const L = layer();
    if (!M[motif]) throw new Error(`no motif ${motif}`);
    M[motif](L, color ?? undefined);
    return finish(L);
}
// Dark rounded tile with a coloured rim, a soft inner glow and optional tier pips.
function framed(motif, color, rim, pips) {
    const out = Array.from({ length: S }, () => Array(S).fill(null));
    const r = hex(rim), bg = hex('#0f172a');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const corner = (x < 2 || x > 29) && (y < 2 || y > 29) && !((x === 1 || x === 30) && (y === 1 || y === 30));
        if ((x === 0 || x === 31) && (y === 0 || y === 31)) continue;
        if (corner) continue;
        const edge = x === 0 || y === 0 || x === 31 || y === 31 || ((x === 1 || x === 30) && (y === 1 || y === 30));
        const d = Math.hypot(x - 15.5, y - 15.5) / 22;
        out[y][x] = edge ? r : (x === 1 || y === 1 ? dark(r) : mix(mix(bg, r, 0.28 * (1 - d)), bg, 0));
    }
    const m = draw(motif, color).g;
    // Shrink the motif slightly (28px) so the rim stays visible.
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
        const c = m[Math.floor((y * 32) / 28)][Math.floor((x * 32) / 28)];
        if (c) out[y + 2][x + 2] = c;
    }
    for (let i = 0; i < pips; i++) { out[27][26 - i * 3] = hex('#fde68a'); out[27][27 - i * 3] = hex('#fde68a'); out[28][26 - i * 3] = hex('#b45309'); out[28][27 - i * 3] = hex('#b45309'); }
    return out;
}

function png(grid) {
    const raw = Buffer.alloc((S * 4 + 1) * S);
    grid.forEach((row, y) => row.forEach((c, x) => { if (c) raw.set(c.slice(0, 4), y * (S * 4 + 1) + 1 + x * 4); }));
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The mod list and image paths come from gameData.js, so a renamed or new mod fails loudly here.
const ctx = {};
vm.runInNewContext(`${fs.readFileSync('gameData.js', 'utf8')}\nthis.MODS = MODS; this.STATUS_DEFS = STATUS_DEFS;`, ctx);
for (const dir of ['assets/mods', 'assets/status', 'assets/fx']) fs.mkdirSync(dir, { recursive: true });
let n = 0;
for (const mod of ctx.MODS) {
    const spec = MODS[mod.name];
    if (!spec) throw new Error(`no icon spec for mod ${mod.name}`);
    fs.writeFileSync(mod.img, png(framed(...spec))); n++;
}
for (const id of Object.keys(ctx.STATUS_DEFS)) {
    const spec = STATUS[id];
    if (!spec) throw new Error(`no icon spec for status ${id}`);
    fs.writeFileSync(`assets/status/${id.toLowerCase()}.png`, png(draw(...spec).g)); n++;
}
for (const [name, spec] of Object.entries(FX)) { fs.writeFileSync(`assets/fx/${name}.png`, png(draw(...spec).g)); n++; }
console.log(`wrote ${n} icons`);
