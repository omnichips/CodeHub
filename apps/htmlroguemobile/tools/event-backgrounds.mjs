// Draws the story-event floor backgrounds, the event door icon and the intro scenes (the lab, the locked
// security door, the old TV the ghost takes over) in the style of the hallway art:
// flat pixel art, ceiling lights, a wall, a checkered floor in perspective. Drawn at 448x144 and scaled
// x4 to 1792x576 like the other maps. Run from the app folder: node tools/event-backgrounds.mjs
import fs from 'node:fs';
import { writePng } from './png.mjs';

const W = 448, H = 144, S = 4, WALL_TOP = 20, FLOOR_Y = 106;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

function scene(pal) {
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = hex(c); };
    const L = {
        g,
        rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); return L; },
        frame(x0, y0, x1, y1, c) { L.rect(x0, y0, x1, y0, c).rect(x0, y1, x1, y1, c).rect(x0, y0, x0, y1, c).rect(x1, y0, x1, y1, c); return L; },
        px(x, y, c) { put(x, y, c); return L; },
        circle(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) put(cx + x, cy + y, c); return L; },
    };
    // Ceiling, wall, baseboard, perspective checker floor.
    L.rect(0, 0, W - 1, WALL_TOP - 4, pal.ceiling).rect(0, WALL_TOP - 3, W - 1, WALL_TOP - 1, pal.ceilingEdge);
    L.rect(0, WALL_TOP, W - 1, FLOOR_Y - 3, pal.wall);
    L.rect(0, FLOOR_Y - 2, W - 1, FLOOR_Y, pal.base);
    const horizon = 40, cx = W / 2;
    for (let y = FLOOR_Y + 1; y < H; y++) {
        const d = y - horizon;
        for (let x = 0; x < W; x++) {
            const u = Math.floor(((x - cx) / d) * 2.2), v = Math.floor(260 / d);
            put(x, y, (u + v) & 1 ? pal.floorA : pal.floorB);
        }
    }
    // Wall pillars like the hallway.
    (pal.pillars || [96, 308]).forEach((x) => L.rect(x, WALL_TOP, x + 19, FLOOR_Y - 3, pal.pillar));
    // Ceiling light panels (a broken one is dark).
    (pal.lights || [[54, true], [330, true]]).forEach(([x, on]) => {
        for (let i = 0; i < 4; i++) L.rect(x + i * 2, 3 + i, x + 70 - i * 2, 3 + i, on ? pal.light : '#3f3f46');
    });
    return L;
}

const scenes = {
    server_room: () => {
        const L = scene({ ceiling: '#1e293b', ceilingEdge: '#334155', wall: '#0f172a', base: '#1e293b', pillar: '#162033',
            floorA: '#0b3a44', floorB: '#0f5160', light: '#7dd3fc', pillars: [40] });
        // Rows of server racks with blinking lights.
        for (let i = 0; i < 6; i++) {
            const x = 150 + i * 46;
            L.rect(x, 30, x + 36, FLOOR_Y - 2, '#111827').frame(x, 30, x + 36, FLOOR_Y - 2, '#334155');
            for (let y = 36; y < FLOOR_Y - 8; y += 7) {
                L.rect(x + 4, y, x + 32, y + 4, '#1f2937');
                L.px(x + 6, y + 2, ['#22c55e', '#22c55e', '#38bdf8', '#ef4444'][(i * 7 + y) % 4]).px(x + 9, y + 2, (i + y) % 3 ? '#22c55e' : '#facc15');
                for (let k = x + 14; k < x + 30; k += 3) L.px(k, y + 2, '#0b1220');
            }
        }
        // Cables hanging from the ceiling.
        [[170, 26], [240, 22], [300, 27], [380, 24]].forEach(([x, len]) => {
            for (let y = WALL_TOP; y < WALL_TOP + len; y++) L.px(x + Math.round(Math.sin(y / 4) * 2), y, '#475569');
        });
        // The logged-in terminal on a desk, screen glowing.
        L.rect(70, 82, 120, 85, '#475569').rect(74, 86, 77, FLOOR_Y, '#334155').rect(113, 86, 116, FLOOR_Y, '#334155');
        L.rect(82, 60, 110, 80, '#1f2937').rect(85, 63, 107, 77, '#22d3ee').rect(87, 66, 100, 67, '#ecfeff').rect(87, 70, 95, 71, '#ecfeff').rect(87, 74, 104, 75, '#0e7490');
        L.rect(94, 80, 98, 82, '#1f2937');
        return L.g;
    },
    break_room: () => {
        const L = scene({ ceiling: '#a8a29e', ceilingEdge: '#8a837e', wall: '#d6c7a1', base: '#7c6a4f', pillar: '#c9b88e',
            floorA: '#6b4f33', floorB: '#8a6a45', light: '#fde68a', pillars: [] });
        // Vending machine: red body, glass with rows of cans, one row left.
        L.rect(250, 34, 300, FLOOR_Y - 1, '#b91c1c').frame(250, 34, 300, FLOOR_Y - 1, '#7f1d1d');
        L.rect(255, 40, 285, 92, '#1e293b');
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
            const sold = !(r === 2 && c === 1);
            L.rect(258 + c * 7, 44 + r * 10, 262 + c * 7, 50 + r * 10, sold ? '#334155' : '#38bdf8');
        }
        L.rect(289, 46, 296, 60, '#111827').px(292, 50, '#22c55e').rect(289, 66, 296, 70, '#111827').rect(256, 96, 284, 101, '#111827');
        L.rect(258, 36, 292, 38, '#fecaca');
        // Counter with the coffee machine and mugs.
        L.rect(320, 78, 430, 82, '#78716c').rect(322, 83, 428, FLOOR_Y - 1, '#a8a29e').frame(322, 83, 428, FLOOR_Y - 1, '#57534e');
        [[340, 83], [375, 83], [410, 83]].forEach(([x]) => L.rect(x, 86, x + 1, 100, '#57534e'));
        L.rect(334, 52, 362, 77, '#292524').rect(338, 56, 358, 64, '#57534e').px(341, 60, '#ef4444').rect(343, 68, 353, 77, '#44403c').rect(345, 72, 351, 77, '#fafaf9');
        L.rect(370, 70, 376, 77, '#f8fafc').px(377, 72, '#f8fafc').px(377, 74, '#f8fafc').rect(384, 72, 389, 77, '#60a5fa');
        // Steam, wall clock, notice board.
        [[347, 48], [349, 44], [346, 40]].forEach(([x, y]) => L.px(x, y, '#e7e5e4'));
        L.circle(200, 40, 8, '#f5f5f4').circle(200, 40, 6, '#fafaf9').rect(200, 34, 200, 40, '#1c1917').rect(200, 40, 204, 40, '#1c1917');
        L.rect(130, 48, 180, 78, '#a16207').rect(133, 51, 177, 75, '#d4a373');
        [[136, 54, '#fef08a'], [152, 56, '#fbcfe8'], [164, 52, '#bfdbfe'], [140, 64, '#ffffff'], [158, 66, '#fef08a']].forEach(([x, y, c]) => L.rect(x, y, x + 9, y + 7, c));
        return L.g;
    },
    maintenance: () => {
        const L = scene({ ceiling: '#52525b', ceilingEdge: '#3f3f46', wall: '#71717a', base: '#27272a', pillar: '#65656e',
            floorA: '#3f3f46', floorB: '#52525b', light: '#fef3c7', lights: [[54, true], [330, false]], pillars: [] });
        // Pipes along the top of the wall with valves.
        L.rect(0, 26, W - 1, 30, '#a16207').rect(0, 27, W - 1, 27, '#ca8a04').rect(0, 36, W - 1, 39, '#52525b').rect(0, 37, W - 1, 37, '#a1a1aa');
        [60, 200, 340].forEach((x) => L.rect(x, 24, x + 4, 32, '#78350f').circle(x + 2, 22, 3, '#dc2626'));
        [150, 260, 400].forEach((x) => L.rect(x, 39, x + 3, FLOOR_Y - 3, '#52525b').rect(x + 1, 39, x + 1, FLOOR_Y - 3, '#a1a1aa'));
        // Boiler tank with gauge.
        L.rect(300, 46, 360, FLOOR_Y - 1, '#57534e').frame(300, 46, 360, FLOOR_Y - 1, '#292524');
        L.rect(300, 52, 360, 54, '#292524').rect(300, 92, 360, 94, '#292524');
        L.circle(330, 70, 9, '#f5f5f4').circle(330, 70, 7, '#fafaf9').rect(330, 65, 330, 70, '#dc2626');
        // Hazard stripes on the baseboard and a mop bucket.
        for (let x = 0; x < W; x += 8) L.rect(x, FLOOR_Y - 6, x + 3, FLOOR_Y - 3, '#facc15').rect(x + 4, FLOOR_Y - 6, x + 7, FLOOR_Y - 3, '#18181b');
        L.rect(200, 96, 222, FLOOR_Y + 6, '#eab308').frame(200, 96, 222, FLOOR_Y + 6, '#854d0e').rect(214, 60, 215, 96, '#a8a29e').rect(208, 92, 222, 95, '#e7e5e4');
        // Tool board.
        L.rect(170, 50, 240, 80, '#3f3f46');
        for (let x = 174; x < 238; x += 6) for (let y = 54; y < 78; y += 6) L.px(x, y, '#18181b');
        L.rect(180, 56, 182, 74, '#dc2626').rect(196, 58, 206, 60, '#a1a1aa').rect(200, 60, 202, 72, '#a1a1aa').rect(220, 56, 226, 70, '#f97316');
        return L.g;
    },
    archive: () => {
        const L = scene({ ceiling: '#44403c', ceilingEdge: '#292524', wall: '#57603e', base: '#292524', pillar: '#4d5536',
            floorA: '#3a4128', floorB: '#4a5333', light: '#fef9c3', lights: [[54, false], [330, true]], pillars: [] });
        // Filing cabinets, some drawers open.
        for (let i = 0; i < 5; i++) {
            const x = 150 + i * 30;
            L.rect(x, 44, x + 26, FLOOR_Y - 1, '#a3a380').frame(x, 44, x + 26, FLOOR_Y - 1, '#5f5f45');
            for (let d = 0; d < 4; d++) {
                const y = 48 + d * 15, open = (i + d) % 5 === 2;
                L.rect(x + 3, y, x + 23, y + 11, open ? '#d6d3b0' : '#b9b993').rect(x + 10, y + 4, x + 16, y + 5, '#5f5f45');
                if (open) L.rect(x + 5, y - 3, x + 21, y, '#fafaf9');
            }
        }
        // Stacked cardboard boxes, one marked LOST & FOUND (a red label).
        [[310, 82, 350, FLOOR_Y + 2], [356, 86, 392, FLOOR_Y + 2], [318, 60, 346, 81], [398, 92, 430, FLOOR_Y + 2]].forEach(([a, b, c, d]) => {
            L.rect(a, b, c, d, '#b45309').frame(a, b, c, d, '#78350f').rect(a, b + 4, c, b + 5, '#d97706');
        });
        L.rect(324, 90, 340, 96, '#fafaf9').rect(326, 92, 338, 93, '#dc2626');
        // The shredder.
        L.rect(70, 74, 110, FLOOR_Y + 2, '#3f3f46').frame(70, 74, 110, FLOOR_Y + 2, '#18181b').rect(76, 72, 104, 74, '#18181b');
        L.px(102, 80, '#22c55e');
        for (let x = 78; x < 104; x += 3) L.rect(x, 69, x + 1, 71, '#fafaf9');
        // Light cone from the working lamp.
        for (let y = 8; y < FLOOR_Y; y++) for (let x = 365 - (y - 8) / 2; x < 365 + (y - 8) / 2; x++) if ((x + y) % 3 === 0) L.px(x, y, '#d9d28c');
        return L.g;
    },
    glitch: () => {
        const L = scene({ ceiling: '#1a1030', ceilingEdge: '#2e1065', wall: '#1e1236', base: '#0b0618', pillar: '#26174a',
            floorA: '#0b0618', floorB: '#3b0a45', light: '#e879f9', lights: [[54, false], [330, true]], pillars: [96, 308] });
        // A tall mirror showing a reflection that is a bit off.
        L.rect(200, 30, 250, FLOOR_Y - 2, '#a78bfa').rect(204, 34, 246, FLOOR_Y - 6, '#312e81');
        for (let y = 36; y < FLOOR_Y - 8; y += 4) L.rect(206, y, 244, y, '#3730a3');
        L.rect(219, 60, 231, 92, '#c4b5fd').rect(221, 50, 229, 59, '#c4b5fd').px(223, 54, '#ef4444').px(227, 54, '#ef4444');
        // Elevator with doors stuck half open, red light inside.
        L.rect(330, 34, 390, FLOOR_Y - 1, '#3f3f46').rect(334, 38, 386, FLOOR_Y - 1, '#7f1d1d').rect(334, 38, 350, FLOOR_Y - 1, '#52525b').rect(370, 38, 386, FLOOR_Y - 1, '#52525b');
        L.rect(345, 26, 375, 32, '#18181b').rect(350, 28, 370, 30, '#ef4444');
        // Glitch blocks across the scene.
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 40; i++) {
            const x = Math.floor(rnd() * W), y = Math.floor(rnd() * (H - 10)), w = 4 + Math.floor(rnd() * 30);
            L.rect(x, y, x + w, y + 1, rnd() < 0.5 ? '#22d3ee' : '#f0abfc');
        }
        return L.g;
    },
};

// Intro scenes. The intro places the ghost, the TV and the player on these by image coordinates
// (percent of 448x144), so keep the broken tube at x 208-240, the scanner at x 272-286 and the TV cart at x 328-358.
const introScenes = {
    lab: () => {
        const L = scene({ ceiling: '#0f1f1c', ceilingEdge: '#1c332e', wall: '#0b1715', base: '#1c332e', pillar: '#10211e',
            floorA: '#0d1f1b', floorB: '#163330', light: '#86efac', lights: [[54, false], [330, true]], pillars: [60, 370] });
        // Containment tubes with green fluid; the middle one is shattered and empty.
        [104, 160, 264, 320, 208].forEach((x, i) => {
            const broken = i === 4;
            L.rect(x - 2, 28, x + 34, 33, '#334155').rect(x - 2, FLOOR_Y - 6, x + 34, FLOOR_Y, '#334155');
            if (!broken) {
                L.rect(x, 34, x + 32, FLOOR_Y - 7, '#14532d').rect(x, 34, x + 32, 40, '#0f3d22');
                for (let k = 0; k < 6; k++) L.px(x + 6 + ((k * 11) % 22), 50 + ((k * 17) % 40), '#86efac');
                L.rect(x + 3, 36, x + 4, FLOOR_Y - 9, '#4ade80');
            } else {
                L.rect(x, 34, x + 32, FLOOR_Y - 7, '#06120f');
                // Jagged glass left in the frame, shards and a puddle on the floor.
                [[x, 34, x + 6, 52], [x + 26, 34, x + 32, 46], [x, 84, x + 5, FLOOR_Y - 7], [x + 25, 78, x + 32, FLOOR_Y - 7]].forEach(([a, b, c, d]) => L.rect(a, b, c, d, '#7dd3fc'));
                [[x - 14, 112], [x + 40, 116], [x + 8, 122], [x + 52, 110], [x - 24, 120]].forEach(([a, b]) => L.rect(a, b, a + 3, b + 1, '#bae6fd'));
                for (let y = 108; y < 116; y++) for (let k = x - 6; k < x + 40; k++) if (((k - x - 16) / 24) ** 2 + ((y - 112) / 4) ** 2 < 1) L.px(k, y, '#22c55e');
            }
        });
        // Warning light and a monitor showing a flatline.
        L.circle(224, 24, 3, '#ef4444');
        L.rect(30, 56, 52, 74, '#1f2937').rect(32, 58, 50, 72, '#022c22').rect(33, 65, 49, 65, '#22c55e');
        L.rect(396, 56, 418, 74, '#1f2937').rect(398, 58, 416, 72, '#022c22').rect(400, 61, 410, 61, '#ef4444').rect(400, 64, 406, 64, '#ef4444');
        return L.g;
    },
    gate: () => {
        const L = scene({ ceiling: '#18181b', ceilingEdge: '#27272a', wall: '#27272a', base: '#18181b', pillar: '#202024',
            floorA: '#1c1c20', floorB: '#2c2c32', light: '#fca5a5', lights: [[54, true], [330, false]], pillars: [] });
        // Blast door with hazard edges.
        L.rect(176, 24, 272, FLOOR_Y - 1, '#3f3f46');
        L.rect(184, 30, 264, FLOOR_Y - 1, '#52525b').rect(223, 30, 225, FLOOR_Y - 1, '#18181b');
        for (let y = 30; y < FLOOR_Y; y += 8) L.rect(184, y, 188, y + 3, '#facc15').rect(260, y + 4, 264, y + 7, '#facc15');
        [[196, 50], [236, 50], [196, 80], [236, 80]].forEach(([x, y]) => L.rect(x, y, x + 12, y + 2, '#3f3f46'));
        // Scanner panel with its red light.
        L.rect(272, 54, 286, 74, '#18181b').frame(272, 54, 286, 74, '#52525b').rect(275, 58, 283, 66, '#7f1d1d').rect(277, 60, 281, 64, '#ef4444').rect(275, 69, 283, 71, '#ef4444');
        // Storage: a shelf of junk and the cart the old TV sits on (the TV itself is a sprite).
        L.rect(328, 93, 358, 96, '#78716c').rect(330, 97, 331, FLOOR_Y + 4, '#57534e').rect(355, 97, 356, FLOOR_Y + 4, '#57534e').rect(330, FLOOR_Y + 2, 356, FLOOR_Y + 3, '#57534e');
        L.rect(370, 40, 430, 42, '#57534e').rect(370, 70, 430, 72, '#57534e').rect(372, 42, 373, FLOOR_Y, '#44403c').rect(427, 42, 428, FLOOR_Y, '#44403c');
        L.rect(378, 28, 398, 39, '#92400e').rect(402, 32, 422, 39, '#713f12').rect(380, 58, 392, 69, '#52525b').rect(396, 62, 420, 69, '#a16207').rect(384, 90, 410, FLOOR_Y, '#78350f');
        // Warning stripes on the floor in front of the door.
        for (let x = 176; x < 272; x += 10) L.rect(x, FLOOR_Y + 2, x + 4, FLOOR_Y + 4, '#facc15');
        return L.g;
    },
};
// The TV, 26x23, drawn like the player's head: round blue-grey case, antenna, knobs, a dark screen.
function tv() {
    const g = Array.from({ length: 23 }, () => Array(26).fill(null));
    const put = (x, y, c) => { if (g[y] && x >= 0 && x < 26) g[y][x] = hex(c); };
    for (let y = 4; y < 23; y++) for (let x = 0; x < 26; x++) if (((x - 12.5) / 13) ** 2 + ((y - 13.5) / 9.6) ** 2 <= 1) put(x, y, '#475569');
    for (let y = 7; y < 21; y++) for (let x = 0; x < 26; x++) if (((x - 14) / 8.5) ** 2 + ((y - 14) / 6) ** 2 <= 1) put(x, y, '#111827');
    for (let i = 0; i < 5; i++) put(5 - i, 4 - i, '#94a3b8');
    put(0, 0, '#cbd5e1');
    put(3, 11, '#ef4444'); put(3, 14, '#facc15'); put(3, 17, '#22c55e');
    put(11, 10, '#374151'); put(12, 10, '#374151');
    return g;
}

// Scale up by S like the other maps.
const upscale = (g) => g.flatMap((row) => Array(S).fill(row.flatMap((c) => Array(S).fill(c))));
fs.mkdirSync('assets/maps/events', { recursive: true });
for (const [name, draw] of Object.entries(scenes)) fs.writeFileSync(`assets/maps/events/${name}.png`, writePng(upscale(draw())));
fs.mkdirSync('assets/maps/intro', { recursive: true });
for (const [name, draw] of Object.entries(introScenes)) fs.writeFileSync(`assets/maps/intro/${name}.png`, writePng(upscale(draw())));
fs.writeFileSync('assets/maps/intro/tv.png', writePng(upscale(tv())));

// Event door icon: a speech bubble with "!" (16x16, shown at 48px).
const icon = [
    '................',
    '..############..',
    '.#oooooooooooo#.',
    '#oooooo##oooooo#',
    '#oooooo##oooooo#',
    '#oooooo##oooooo#',
    '#oooooo##oooooo#',
    '#oooooo##oooooo#',
    '#oooooooooooooo#',
    '#oooooo##oooooo#',
    '.#oooooooooooo#.',
    '..#####oo#####..',
    '......#oo#......',
    '.....#oo#.......',
    '.....###........',
    '................',
];
const ICON = { '#': hex('#0b0f1a'), o: hex('#facc15') };
fs.writeFileSync('assets/misc/event.png', writePng(icon.map((row) => [...row].map((ch) => ICON[ch] || null))));
