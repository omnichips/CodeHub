// Every city's dioramas after Chicago: their backdrops (three layers each) and who does what on them, shot by shot
// (`${scene}#${shot}`). Drawn with the kit (kit.ts) in the palette as it drains; art.ts puts them on screen.
import type { Pen } from './draw.ts';
import {
  CROWD_COATS, LOOKS, crowd, glow, heli, idle2, lamp, loop3, loudspeaker, person, rain, roll, since, ship, sky, skyline, small, steam, trainCar, walk4,
  type Act, type Backdrop,
} from './kit.ts';

type Actors = (a: Act, pen: Pen, cx: number, cy: number) => void;
const SKIN = ['skin0', 'skin1', 'skin2'];

/** One of the Column sitting (5 × 6), asleep with the head down, or lying (11 × 3), or looking up. */
function sitting(pen: Pen, x: number, y: number, seed: number, o: { asleep?: boolean; up?: boolean; lie?: boolean } = {}) {
  const coat = CROWD_COATS[Math.floor(roll(seed, 1) * CROWD_COATS.length)], skin = SKIN[Math.floor(roll(seed, 2) * 3)], hair = roll(seed, 3) < 0.6 ? 'outline' : 'brown0';
  if (o.lie) { pen.rect(x, y + 4, 8, 2, coat); pen.rect(x + 8, y + 3, 3, 3, skin); pen.rect(x + 10, y + 3, 1, 3, hair); return; }
  const dy = o.asleep ? 1 : o.up ? -1 : 0;
  pen.rect(x, y + 3, 5, 3, coat); pen.rect(x + 3, y + 5, 4, 1, 'outline');
  pen.rect(x + 1 + (o.asleep ? 1 : 0), y + dy, 3, 3, skin); pen.rect(x + 1 + (o.asleep ? 1 : 0), y + dy, 3, 1, hair);
}
/** Seconds since `at` the first time `at` passed in this shot: a one-off thing (a flash) fires once. */
const fired = new Set<string>();
function once(a: Act, key: string, at: number, act: () => void) {
  const k = `${a.sceneId}#${a.k}#${key}`;
  if (a.t < at) { fired.delete(k); return; }
  if (!fired.has(k)) { fired.add(k); act(); }
}

// ---- Backdrops ----
const towerFace = (pen: Pen, x0: number, x1: number, top: number, base: number, seed: number) => {
  pen.rect(x0, top, x1 - x0, base - top, 'urban0'); pen.rect(x0, top, x1 - x0, 1, 'metal1');
  for (let y = top + 4; y < base - 6; y += 7) {
    if ((y - top) % 42 < 7) { pen.rect(x0, y, x1 - x0, 2, 'metal0'); continue; } // a cornice
    for (let x = x0 + 3; x < x1 - 4; x += 6) (roll(x * seed, y) < 0.06 ? pen.lit.bind(pen) : pen.rect.bind(pen))(x, y, 3, 4, roll(x * seed, y) < 0.06 ? '#7a6038' : 'navy0');
  }
};

export const CITIES: { backdrops: Record<string, Backdrop>; actors: Record<string, Actors>; home: Record<string, { cx: number; cy?: number; focus?: [number, number] }> } = {
  backdrops: {
    // A canyon of towers at night, the street at its foot; up past the roofs, a thin orange line on the horizon.
    'new-york-avenue': {
      w: 320, h: 200,
      layers: [
        (pen, w) => { sky(pen, w, ['#06070a', '#090b10', 'navy0', '#141824'], 72); pen.lit(0, 68, w, 1, '#2a1a14'); pen.lit(0, 69, w, 1, 'ember0'); pen.lit(0, 70, w, 1, 'ember1'); pen.lit(0, 71, w, 1, 'ember2'); pen.rect(0, 72, w, 128, '#0d0f14'); skyline(pen, w, 150, '#0d0f14', 5, 70, 0.04); },
        (pen) => { towerFace(pen, -4, 96, 10, 162, 3); towerFace(pen, 226, 324, 0, 162, 7); pen.rect(94, 10, 2, 152, 'outline'); pen.rect(226, 0, 2, 162, 'metal0'); },
        (pen, w) => {
          pen.rect(0, 160, w, 8, 'pave0'); for (let x = 0; x < w; x += 12) pen.rect(x, 160, 1, 8, 'pave1');
          pen.rect(0, 168, w, 1, 'snow0'); pen.rect(0, 169, w, 31, 'asphalt0'); for (let k = 0; k < 90; k++) pen.px(Math.floor(roll(k, 13) * w), 170 + Math.floor(roll(k, 14) * 30), 'asphalt1');
          pen.rect(196, 182, 14, 3, 'outline'); pen.rect(198, 183, 10, 1, 'metal0'); // the manhole
        },
      ],
      depth: [0.3, 0.8, 1],
    },
    // The harbor in grey morning: the far shore, open water, the quay with its loudspeaker.
    'new-york-harbor': {
      w: 320,
      layers: [
        (pen, w) => { sky(pen, w, ['urban2', 'snow0', '#a5a9a2'], 50); skyline(pen, w, 50, 'urban1', 17, 16, 0); pen.rect(0, 50, w, 50, 'teal0'); for (let k = 0; k < 80; k++) pen.rect(Math.floor(roll(k, 21) * w), 51 + Math.floor(roll(k, 22) * 48), 5, 1, 'teal1'); },
        (pen) => { for (const x of [240, 280]) { pen.rect(x, 18, 2, 32, 'urban0'); pen.rect(x - 14, 18, 30, 2, 'urban0'); } },
        (pen, w) => { pen.rect(0, 100, w, 36, 'pave0'); pen.rect(0, 100, w, 1, 'snow0'); for (let x = 6; x < w; x += 28) pen.rect(x, 98, 4, 3, 'outline'); for (let x = 0; x < w; x += 16) pen.rect(x, 101, 1, 35, 'pave1'); loudspeaker(pen, 20, 30); },
      ],
      depth: [0.3, 0.6, 1],
    },
    // Shanties packed roof to roof under a monsoon sky: tin, tarps, tyres; the alley's mud and puddles.
    'manila-alley': {
      w: 320,
      layers: [
        (pen, w) => { sky(pen, w, ['urban1', 'cloth1', 'cloth0'], 40); skyline(pen, w, 52, 'urban0', 31, 16, 0.02); },
        (pen, w) => {
          for (let x = -6; x < w; ) {
            const bw = 26 + Math.floor(roll(x, 3) * 22), top = 34 + Math.floor(roll(3, x) * 30);
            pen.rect(x, top, bw, 104 - top, ['brown0', 'brown1', 'teal0', 'urban0', 'maroon0'][Math.floor(roll(x, 5) * 5)]);
            pen.rect(x - 2, top - 4, bw + 4, 4, 'metal1'); for (let r = x - 2; r < x + bw + 2; r += 2) pen.px(r, top - 4, 'metal2'); // a tin roof
            if (roll(x, 6) < 0.5) pen.rect(x + 4, top - 4, 8 + Math.floor(roll(x, 7) * 10), 3, 'rust');
            if (roll(x, 8) < 0.4) { pen.rect(x + bw - 10, top - 8, 7, 4, 'outline'); pen.rect(x + bw - 8, top - 7, 3, 2, 'metal0'); } // a tyre on the roof
            if (roll(x, 9) < 0.5) pen.rect(x + 2, top + 6, bw - 4, 8, ['navy2', 'red1', 'teal1'][Math.floor(roll(x, 10) * 3)]); // a tarp
            pen.rect(x + Math.floor(bw / 2) - 3, 88, 7, 16, 'outline');
            if (roll(x, 11) < 0.5) pen.lit(x + 4, top + 18, 6, 5, '#8a6a3a');
            x += bw;
          }
        },
        (pen, w) => { pen.rect(0, 104, w, 32, 'brown0'); for (let k = 0; k < 120; k++) pen.px(Math.floor(roll(k, 31) * w), 105 + Math.floor(roll(k, 32) * 31), 'brown1'); for (const [px, pw] of [[30, 40], [150, 30], [250, 46]]) pen.rect(px, 118 + (px % 9), pw, 3, 'navy0'); },
      ],
      depth: [0.3, 0.7, 1],
    },
    // The river port at dawn, pink and grey: open water, a warehouse, the quay's edge.
    'manila-river-port': {
      w: 320,
      layers: [
        (pen, w) => { sky(pen, w, ['urban1', 'maroon1', 'maroon2', 'skin1'], 60); pen.rect(0, 58, w, 3, 'urban0'); pen.rect(0, 61, w, 39, 'urban1'); for (let k = 0; k < 70; k++) pen.rect(Math.floor(roll(k, 41) * w), 62 + Math.floor(roll(k, 42) * 37), 4, 1, 'teal0'); },
        (pen) => { pen.rect(0, 40, 70, 60, 'metal0'); pen.rect(0, 40, 70, 2, 'metal1'); for (let x = 4; x < 66; x += 8) pen.rect(x, 50, 5, 8, 'outline'); },
        (pen, w) => { pen.rect(0, 100, w, 36, 'pave0'); pen.rect(0, 100, w, 1, 'snow0'); for (let x = 10; x < w; x += 34) pen.rect(x, 98, 4, 3, 'outline'); for (let k = 0; k < 60; k++) pen.px(Math.floor(roll(k, 43) * w), 102 + Math.floor(roll(k, 44) * 34), 'pave1'); },
      ],
      depth: [0.3, 0.6, 1],
    },
    // The Zócalo in thin morning light: the cathedral's front and its towers, roofs either side, the square's stones.
    'mexico-square': {
      w: 400,
      layers: [
        (pen, w) => { sky(pen, w, ['#c9c4b0', 'khaki2', 'desert2'], 60); skyline(pen, w, 60, 'desert1', 41, 10, 0); pen.rect(0, 60, w, 40, 'desert0'); for (let x = 0; x < w; x += 16) pen.rect(x + 4, 66, 6, 10, 'brown0'); },
        (pen) => {
          pen.rect(40, 36, 320, 60, 'desert1'); pen.rect(40, 36, 320, 2, 'desert2'); pen.rect(40, 60, 320, 1, 'desert0');
          for (const tx of [60, 290]) { pen.rect(tx, 6, 50, 90, 'desert1'); pen.rect(tx, 6, 50, 2, 'desert2'); pen.rect(tx + 8, 0, 34, 6, 'desert1'); pen.rect(tx + 18, 14, 14, 18, 'outline'); pen.rect(tx + 24, -6, 2, 6, 'metal0'); pen.rect(tx + 22, -4, 6, 1, 'metal0'); }
          for (let k = 0; k < 4; k++) pen.rect(186 - k * 6, 16 + k * 5, 28 + k * 12, 5, 'desert1'); pen.rect(198, 8, 4, 8, 'desert0');
          for (let x = 124; x < 280; x += 22) { pen.rect(x, 68, 12, 28, 'outline'); pen.rect(x, 66, 12, 2, 'desert0'); }
          pen.rect(186, 64, 28, 32, 'brown0');
        },
        (pen, w) => { pen.rect(0, 96, w, 40, 'pave1'); for (let y = 100; y < 136; y += 6) pen.rect(0, y, w, 1, 'pave0'); for (let x = 0; x < w; x += 14) pen.rect(x, 96, 1, 40, 'pave0'); pen.rect(240, 8, 2, 90, 'metal1'); pen.rect(236, 94, 10, 4, 'pave0'); },
      ],
      depth: [0.3, 0.6, 1],
    },
    // Night at the Colosseum: three tiers of arches, a broken column, cobbles.
    'rome-arches': {
      w: 320,
      layers: [
        (pen, w) => sky(pen, w, ['#08090c', '#0b0d12', 'navy0'], 60),
        (pen, w) => {
          pen.rect(0, 14, w, 86, 'khaki0'); pen.rect(0, 14, w, 2, 'khaki1');
          for (let x = 0; x < w; x += 6) if (x > 250) pen.rect(x, 14, 6, (x * 7) % 19, '#0b0d12'); // the broken top
          for (let tier = 0; tier < 3; tier++) {
            const y = 26 + tier * 24;
            pen.rect(0, y - 3, w, 2, 'khaki1');
            for (let x = 4; x < w; x += 18) { pen.rect(x, y + 2, 10, 17, 'outline'); pen.rect(x + 1, y, 8, 2, 'outline'); pen.rect(x - 4, y, 3, 19, 'khaki1'); }
          }
          pen.rect(40, 66, 10, 34, 'snow0'); pen.rect(38, 66, 14, 3, 'snow1'); pen.rect(40, 70, 1, 30, 'snow1'); // the broken column
        },
        (pen, w) => { pen.rect(0, 100, w, 36, 'pave0'); for (let k = 0; k < 220; k++) pen.rect(Math.floor(roll(k, 51) * w), 102 + Math.floor(roll(k, 52) * 34), 3, 2, roll(k, 53) < 0.5 ? 'pave1' : 'asphalt2'); pen.rect(0, 100, w, 1, 'snow0'); },
      ],
      depth: [0.3, 0.7, 1],
    },
    // The depot at night: its canopy and hanging lamps, a brick wall, the platform beside the track.
    'rome-depot': {
      w: 400,
      layers: [
        (pen, w) => { sky(pen, w, ['#08090c', '#0b0d12'], 30); pen.rect(0, 20, w, 76, 'red0'); for (let x = 10; x < w; x += 40) { pen.rect(x, 34, 18, 30, 'outline'); pen.rect(x + 1, 32, 16, 2, 'outline'); } },
        (pen, w) => { pen.rect(0, 0, w, 14, 'metal0'); for (let x = 0; x < w; x += 10) { pen.px(x, 13, 'metal1'); pen.px(x + 5, 10, 'metal1'); } for (let x = 30; x < w; x += 70) { pen.rect(x, 14, 1, 10, 'metal0'); pen.lit(x - 2, 24, 5, 2, 'flash1'); glow(pen, x, 26, 10, '#eadfae', 0.4); } },
        (pen, w) => { pen.rect(0, 96, w, 4, 'outline'); pen.rect(0, 100, w, 36, 'pave0'); pen.rect(0, 100, w, 2, 'hivis0'); for (let x = 0; x < w; x += 20) pen.rect(x, 102, 1, 34, 'pave1'); },
      ],
      depth: [0.3, 0.6, 1],
    },
    // Shibuya's crossing from above, at night in the rain: towers with their screens, the stripes of the scramble.
    'tokyo-crossing': {
      w: 320,
      layers: [
        (pen, w) => { sky(pen, w, ['#06070a', '#0a0b0e'], 40); skyline(pen, w, 62, '#101216', 61, 50, 0.06); },
        (pen, w) => {
          pen.rect(0, 62, w, 74, 'asphalt0');
          for (let k = 0; k < 14; k++) { pen.rect(20 + k * 20, 70 + k * 4, 12, 2, 'asphalt2'); pen.rect(300 - k * 20, 70 + k * 4, 12, 2, 'asphalt2'); } // the X
          for (let x = 0; x < w; x += 8) { pen.rect(x, 66, 5, 3, 'asphalt2'); pen.rect(x, 126, 5, 3, 'asphalt2'); }
          pen.rect(292, 40, 28, 40, 'urban0'); pen.lit(296, 60, 20, 20, '#2a3a52'); // the station's mouth
        },
        (pen) => { pen.rect(10, 112, 28, 24, 'pave0'); pen.rect(10, 112, 28, 2, 'pave1'); pen.rect(16, 100, 14, 12, 'brown1'); pen.rect(26, 94, 7, 8, 'brown1'); pen.rect(31, 92, 2, 3, 'brown0'); pen.rect(17, 108, 3, 4, 'brown0'); pen.rect(28, 96, 1, 1, 'outline'); }, // Hachiko on his plinth
      ],
      depth: [0.3, 1, 1],
    },
    // The last train's platform: roof lights, a wall of signs, the yellow line along the edge.
    'tokyo-platform': {
      w: 400,
      layers: [
        (pen, w) => { pen.rect(0, 0, w, 74, '#0c0d10'); for (let x = 20; x < w; x += 60) { pen.rect(x, 50, 30, 8, 'navy1'); pen.rect(x + 2, 52, 26, 1, 'snow0'); } },
        (pen, w) => { pen.rect(0, 0, w, 10, 'metal0'); for (let x = 10; x < w; x += 40) pen.rect(x, 10, 24, 2, 'metal1'); pen.rect(168, 26, 50, 14, 'outline'); pen.rect(169, 27, 48, 12, '#101010'); pen.rect(192, 10, 2, 16, 'metal0'); },
        (pen, w) => { pen.rect(0, 96, w, 4, 'outline'); pen.rect(0, 100, w, 36, 'pave0'); pen.rect(0, 102, w, 2, 'hivis1'); for (let x = 0; x < w; x += 4) pen.px(x, 103, 'hivis0'); for (let x = 0; x < w; x += 24) pen.rect(x, 104, 1, 32, 'pave1'); },
      ],
      depth: [0.3, 1, 1],
    },
    // The Thames at night: the south bank far off, the river; the bridge itself is drawn by its actors (it falls).
    'london-bridge': {
      w: 480,
      layers: [
        (pen, w) => { sky(pen, w, ['#0b0c0e', '#121417', '#1a1d20'], 60); skyline(pen, w, 62, '#14171a', 71, 22, 0.03); },
        (pen, w) => { pen.rect(0, 62, w, 74, '#141c1e'); for (let k = 0; k < 140; k++) pen.rect(Math.floor(roll(k, 61) * w), 86 + Math.floor(roll(k, 62) * 50), 6, 1, 'teal0'); },
        () => {},
      ],
      depth: [0.3, 0.7, 1],
    },
    // The White House before dawn: a pale block with a few lit windows, the long lawn, roses, the helipad.
    'white-house-lawn': {
      w: 320,
      layers: [
        (pen, w) => { sky(pen, w, ['navy0', 'navy1', 'navy2', 'cloth1'], 70); skyline(pen, w, 70, '#1c2230', 81, 8, 0); },
        (pen) => {
          pen.rect(90, 36, 140, 44, 'snow1'); pen.rect(90, 36, 140, 2, 'snow2'); pen.rect(90, 78, 140, 2, 'snow0');
          for (let x = 96; x < 226; x += 12) for (const y of [44, 60]) (roll(x, y) < 0.2 ? pen.lit.bind(pen) : pen.rect.bind(pen))(x, y, 6, 9, roll(x, y) < 0.2 ? '#8a7a50' : 'navy1');
          pen.rect(138, 30, 44, 50, 'snow2'); pen.rect(136, 28, 48, 3, 'snow1'); for (let x = 140; x < 182; x += 7) pen.rect(x, 34, 3, 46, 'snow1'); // the portico
          pen.rect(159, 18, 2, 12, 'metal1'); pen.rect(161, 18, 8, 5, 'navy1'); pen.rect(161, 21, 8, 1, 'red1');
        },
        (pen, w) => {
          pen.rect(0, 80, w, 56, 'rot0'); for (let y = 80; y < 136; y += 8) pen.rect(0, y, w, 4, 'olive0');
          for (let x = 0; x < w; x += 9) { pen.rect(x, 82, 7, 4, 'olive1'); pen.px(x + 2, 82, 'red1'); pen.px(x + 5, 84, 'red2'); } // roses
          pen.rect(130, 116, 60, 2, 'snow0'); pen.rect(130, 132, 60, 2, 'snow0'); pen.rect(128, 118, 2, 14, 'snow0'); pen.rect(190, 118, 2, 14, 'snow0'); // the pad
        },
      ],
      depth: [0.3, 0.7, 1],
    },
  },

  home: {
    'after:tokyo#1': { cx: 0, focus: [176, 66] },
    'ending#1': { cx: 0, focus: [255, 72] },
    'after:london#1': { cx: 40 },
    'after:london#3': { cx: 40 },
    'before:london#1': { cx: 0 },
    'before:mexico#1': { cx: 80 },
  },

  actors: {
    // Fourteen of the Column on the kerb, one canteen going round; steam from the manhole; windows blinking slowly.
    'before:new-york#1': (a, pen, cx, cy) => {
      const y = 152 - cy;
      steam(pen, 203 - cx, 180 - cy, a.t, 5, '#8a908e', 0.35);
      pen.rect(214 - cx, 150 - cy, 40, 8, 'khaki0'); pen.rect(222 - cx, 144 - cy, 22, 7, 'khaki0'); pen.rect(224 - cx, 145 - cy, 8, 5, 'navy0'); pen.rect(234 - cx, 145 - cy, 8, 5, 'navy0'); pen.rect(216 - cx, 157 - cy, 8, 5, 'outline'); pen.rect(242 - cx, 157 - cy, 8, 5, 'outline'); // the taxi
      const hand = Math.floor(a.t * 0.8) % 14;
      for (let k = 0; k < 14; k++) { sitting(pen, 16 + k * 12 - cx, y, 400 + k); if (k === hand) pen.rect(20 + k * 12 - cx, y + 2, 2, 3, 'metal2'); }
      for (let k = 0; k < 8; k++) if (Math.floor(a.t / 1.5 + k) % 3 === 0) pen.lit((k < 4 ? 10 + k * 18 : 236 + (k - 4) * 18) - cx, 40 + k * 13 - cy, 3, 4, '#7a6038');
    },
    // Dunne takes his cap off and puts it back on. A child from the Column offers Reyes bread; he takes it, and holds it.
    'after:new-york#3': (a, pen, cx, cy) => {
      const y = 140 - cy, t = a.t, taken = t > 3;
      for (let k = 0; k < 10; k++) sitting(pen, 12 + k * 10 - cx, y + 12, 400 + k);
      person(pen, 170 - cx, y, LOOKS.dunne, { face: -1, capInHand: t > 0.8 && t < 2.6, arm: t > 0.8 && t < 2.6 ? 'out' : 'down' });
      person(pen, 140 - cx, y, LOOKS.reyes, { posture: a.row.posture, arm: taken ? 'out' : 'down' });
      small(pen, 128 - cx, y + 14, 88, { child: true, arm: t > 1.5 && !taken });
      pen.rect((taken ? 150 : 132) - cx, y + (taken ? 8 : 16), 3, 2, 'khaki2'); // the bread
    },
    // The third run's ships come in, large and slow, and mid-harbor turn round. The crowd lifts its arms, and lowers them.
    'after:new-york#1': (a, pen, cx) => {
      for (let k = 0; k < 3; k++) {
        const ph = a.t - k * 0.8, turn = 4.6 + k * 0.4;
        if (ph < 0) continue;
        const inbound = ph < turn, s = inbound ? 0.12 + ph * 0.045 : Math.max(0.05, 0.12 + turn * 0.045 - (ph - turn) * 0.05);
        const x = inbound ? 300 - ph * 16 - k * 30 : 300 - turn * 16 - k * 30 + (ph - turn) * 14;
        ship(pen, x - cx, 60 + s * 40, s, inbound ? -1 : 1, a.t + k);
      }
      crowd(pen, 36 - cx, 104, 280, 28, a.t, 19);
      if (a.t > 3 && a.t < 8) for (let x = 36; x < 316; x += 6) { const wave = (a.t - 3) * 60 - (x - 36); if (wave > 0 && wave < 160) { pen.rect(x - cx, 98, 1, 5, 'cloth1'); pen.px(x - cx, 97, 'skin1'); } }
    },
    // Rain. Lola ladles rice onto a tin plate; Pike takes it and gives half to a child. A cat is chased across.
    'before:manila#1': (a, pen, cx) => {
      const t = a.t, sway = idle2(t);
      for (let x = 0; x < 320; x += 10) { const y = 30 + Math.round(Math.sin(x / 50) * 4) + sway; pen.rect(x - cx, y, 10, 1, 'outline'); if (x % 20 === 0) pen.lit(x - cx + 4, y + 1, 2, 2, x % 40 ? '#d6a23e' : '#c45a48'); }
      for (let k = 0; k < 6; k++) pen.rect(40 + k * 14 - cx + sway, 44, 8, 9, ['cloth1', 'maroon1', 'snow1', 'teal1', 'hivis0', 'navy2'][k]); pen.rect(36 - cx, 44, 90, 1, 'outline');
      person(pen, 140 - cx, 92, LOOKS.lola, { arm: idle2(t) ? 'out' : 'down', face: 1 });
      pen.rect(152 - cx, 104, 9, 6, 'metal1'); pen.rect(152 - cx, 104, 9, 1, 'metal2'); steam(pen, 156 - cx, 102, t, 3, '#b6bab4'); // the pot, steaming
      const passed = t > 4.5;
      person(pen, 168 - cx, 92, LOOKS.pike, { face: passed ? 1 : -1, arm: 'out' });
      pen.rect((passed ? 180 : 164) - cx, 101, 4, 1, 'snow1');
      small(pen, 186 - cx, 106, 61, { child: true, arm: passed });
      person(pen, 214 - cx, 92, LOOKS.dunne, { face: -1, frame: idle2(t) });
      if (t > 6 && t < 9) { const x = (t - 6) * 140 - 20; pen.rect(x - cx, 128, 6, 3, 'outline'); pen.rect(x + 6 - cx, 127, 2, 2, 'outline'); pen.px(x - 1 - cx, 126, 'outline'); small(pen, x - 28 - cx, 122, 62, { child: true, frame: walk4(t) % 2 }); }
      rain(pen, t, 320, 136);
    },
    // The ship at the quay; the gangway lifts; the horn; it leaves. The line of people stops at the water's edge, Lola in it.
    'after:manila#1': (a, pen, cx) => {
      const t = a.t, x = 150 + Math.max(0, t - 4) * 15;
      ship(pen, x - cx, 100, 1, 1, t, 'metal1');
      if (t > 3.2 && t < 3.45) pen.lit(x + 14 - cx, 40, 8, 6, '#dcddd3'); // the horn's steam, on 3 white frames
      const lift = Math.min(1, Math.max(0, (t - 1) / 2));
      if (x < 160) for (let k = 0; k < 14; k++) pen.px(132 + k - cx, 100 - Math.round(k * (0.6 + lift * 1.4)), 'metal2');
      for (let k = 0; k < 12; k++) {
        const px = Math.min(128 - k * 9, -10 + t * 24 - k * 9);
        if (k === 3) { person(pen, px - 4 - cx, 82, LOOKS.lola, { walk: px < 128 - k * 9, frame: walk4(t) }); pen.rect(px + 6 - cx, 92, 6, 4, 'metal1'); }
        else small(pen, px - cx, 92, 500 + k, { frame: walk4(t, k) % 2, child: k === 5 });
      }
    },
    // Okoye puts his rifle down on the quay and sits beside Lola and the child. Reyes stands.
    'after:manila#3': (a, pen, cx) => {
      ship(pen, 300 - cx, 66, 0.1, 1, a.t);
      const sat = a.said || a.t > 5;
      person(pen, 112 - cx, 86, LOOKS.lola, { sit: true, face: -1 });
      small(pen, 104 - cx, 100, 61, { child: true });
      pen.rect(140 - cx, 104, 14, 2, 'metal0');
      person(pen, 126 - cx, 86, LOOKS.okoye, { sit: sat, face: -1 });
      person(pen, 190 - cx, 86, LOOKS.reyes, { face: -1, posture: a.row.posture });
      person(pen, 210 - cx, 86, LOOKS.dunne, { face: -1 });
    },
    // The giant flag rippling; the bell swinging, pigeons going up off the roofs with each swing; the square sitting in
    // blocks; the coffee vendor pouring.
    'before:mexico#1': (a, pen, cx) => {
      const t = a.t;
      flag(pen, 242 - cx, 10, t, 0);
      const swing = idle2(t * 0.5);
      pen.rect(308 + swing * 2 - cx, 22, 8, 7, 'khaki1'); pen.rect(311 + swing * 2 - cx, 29, 2, 2, 'khaki0');
      const since = (t % 2) / 2;
      for (let k = 0; k < 6; k++) pen.px(300 + k * 3 - cx + Math.round(since * k * 6), 40 - Math.round(since * 30) - (k % 3), 'snow0');
      for (const bx of [20, 140, 290]) crowd(pen, bx - cx, 108, 90, 18, t, bx);
      pen.rect(110 - cx, 104, 24, 12, 'brown0'); pen.rect(110 - cx, 104, 24, 1, 'brown1'); pen.rect(112 - cx, 116, 4, 4, 'outline'); pen.rect(128 - cx, 116, 4, 4, 'outline');
      pen.rect(114 - cx, 98, 8, 6, 'metal1'); steam(pen, 117 - cx, 96, t, 3, '#b6bab4');
      person(pen, 132 - cx, 98, LOOKS.vendor, { face: -1, arm: 'out' });
      person(pen, 96 - cx, 98, LOOKS.reyes, { posture: a.row.posture, arm: a.line >= 1 ? 'out' : 'down' });
    },
    // Six helicopters lift one by one, labouring; the fourth fails and goes down behind the cathedral; the last two
    // run out. The pilots climb down.
    'after:mexico#1': (a, pen, cx) => {
      const t = a.t;
      flag(pen, 242 - cx, 10, t, 0);
      for (let k = 0; k < 6; k++) {
        const bx = 30 + k * 58, start = 1 + k * 1.4, up = Math.max(0, t - start);
        if (k === 3) {
          if (up < 3) heli(pen, bx - up * 22 - cx, 74 - up * 8 + (idle2(t * 2) ? 2 : 0), t, 1);
          once(a, 'down', start + 3, () => a.flash());
          if (up > 3) pen.dither(70 - cx, 6 - (up - 3) * 4, 20, 16, Math.max(0, 0.5 - (up - 3) * 0.1), '#5c6064');
          continue;
        }
        if (k >= 4) { const spin = Math.max(0, 1 - Math.max(0, t - 6) / 3); heli(pen, bx - cx, 74, t, spin); if (t > 9.5) person(pen, bx + 4 - cx, 76, LOOKS.pilot, { arm: 'out', face: -1 }); continue; }
        const lurch = up > 0 && (up % 1) < 0.25 ? 2 : 0;
        heli(pen, bx - cx, 74 - up * 14 + lurch, t, 1);
      }
      for (const bx of [20, 160]) crowd(pen, bx - cx, 112, 110, 16, t, bx);
    },
    // The vendor lowers the flag by hand, folds it, and puts it in the Column's cart.
    'after:mexico#3': (a, pen, cx) => {
      const t = a.t, down = Math.min(76, t * 10);
      if (t < 8) flag(pen, 242 - cx, 10 + down, t, Math.min(1, Math.max(0, (t - 7.6) / 0.4)));
      person(pen, 226 - cx, 98, LOOKS.vendor, { face: 1, arm: t < 7.6 ? 'up' : 'out' });
      pen.rect(150 - cx, 110, 30, 10, 'brown0'); pen.rect(152 - cx, 120, 4, 4, 'outline'); pen.rect(172 - cx, 120, 4, 4, 'outline');
      if (t > 7.6) { pen.rect(156 - cx, 106, 12, 4, 'olive1'); pen.rect(160 - cx, 106, 4, 4, 'snow2'); }
      person(pen, 190 - cx, 98, LOOKS.reyes, { face: 1, posture: a.row.posture });
    },
    // Night. The arches lit by lamps flickering out of step; two cats on the broken column; the Column asleep in a cart
    // under the folded flag; Pike on guard, nodding off and jerking awake.
    'before:rome#1': (a, pen, cx) => { romeNight(a, pen, cx); const c = a.t % 3, nod = c < 2 ? Math.floor(c / 0.67) : 0; person(pen, 160 - cx, 86, LOOKS.pike, { nod, face: -1 }); person(pen, 120 - cx, 86, LOOKS.dunne, { sit: true }); },
    // Pike on the kerb.
    'after:rome#3': (a, pen, cx) => { romeNight(a, pen, cx); person(pen, 150 - cx, 86, LOOKS.pike, { sit: true, face: 1 }); person(pen, 176 - cx, 86, LOOKS.reyes, { face: -1, posture: a.row.posture }); person(pen, 198 - cx, 86, LOOKS.dunne, { face: -1 }); },
    // The train pulls out, lit, and goes. The Column waves; a boy runs beside the last car, slows, stops.
    'after:rome#1': (a, pen, cx) => {
      const t = a.t, go = Math.max(0, t - 1), x0 = 20 + go * go * 4;
      for (let k = 5; k >= 0; k--) trainCar(pen, x0 - k * 72 - cx, 72, 0, 'metal1');
      pen.rect(x0 + 72 - cx, 70, 30, 24, 'metal0'); pen.lit(x0 + 98 - cx, 82, 3, 3, 'flash1');
      for (let k = 0; k < 10; k++) small(pen, 40 + k * 14 - cx, 108, 600 + k, { arm: true, frame: idle2(t, k * 0.3), child: k === 4 });
      const last = x0 - 5 * 72, bx = t < 5.5 ? Math.max(40, last + 30) : Math.max(40, last + 30) + 0;
      small(pen, Math.min(bx, 260) - cx, 104, 77, { child: true, frame: t < 5.5 ? walk4(t) % 2 : 0 });
    },
    // Rain on the crossing. The screens loop the evacuation picture; the umbrellas stand in lines to the station.
    // Reyes takes off his cap and rubs his face.
    'before:tokyo#1': (a, pen, cx) => {
      const t = a.t, f = loop3(t, 1.5);
      for (const [sx, sy] of [[30, 16], [130, 8], [220, 20]]) {
        pen.rect(sx - cx, sy, 50, 28, 'outline');
        const col = f === 1 ? '#c08a30' : '#3a5a90';
        pen.lit(sx + 2 - cx, sy + 2, 46, 24, f === 1 ? '#2a2010' : '#101828');
        if (f === 1) { pen.lit(sx + 19 - cx, sy + 6, 12, 18, col); pen.rect(sx + 22 - cx, sy + 9, 6, 15, '#2a2010'); } // a door
        else { pen.lit(sx + 12 - cx, sy + 12, 18, 4, col); for (let k = 0; k < 6; k++) pen.lit(sx + 30 + k - cx, sy + 8 + k, 1, 12 - k * 2, col); } // an arrow
      }
      for (let line = 0; line < 6; line++) {
        const y = 74 + line * 9, sway = idle2(t, line * 0.5);
        for (let k = 0; k < 26; k++) {
          const x = 46 + k * 10 + Math.round(Math.sin(k * 0.5 + line) * 2) + sway, yy = y + Math.round(Math.sin(k * 0.4 + line * 1.3) * 3);
          pen.rect(x + 2 - cx, yy, 3, 1, 'snow1'); pen.rect(x + 1 - cx, yy + 1, 5, 1, 'snow0'); pen.rect(x - cx, yy + 2, 7, 1, 'metal2'); pen.rect(x + 3 - cx, yy + 3, 1, 3, 'metal1');
        }
      }
      person(pen, 50 - cx, 104, LOOKS.reyes, { capInHand: true, arm: idle2(t) ? 'up' : 'down', posture: a.row.posture });
      person(pen, 66 - cx, 106, LOOKS.pike, { face: -1 });
      person(pen, 82 - cx, 106, LOOKS.dunne, { face: -1 });
      person(pen, 98 - cx, 106, LOOKS.vega, { face: -1 });
      rain(pen, t, 320, 136, 0.8);
    },
    // 02:09 flips to 02:10; two notes of the chime; the doors close. Pike inside with the children, saluting badly. The
    // train goes; the lights flicker; the queue stands in its lines.
    'after:tokyo#1': (a, pen, cx) => {
      const t = a.t, flip = t < 3 ? '02:09' : t < 3.33 ? '02: ' : '02:10';
      pen.text(flip, 178 - cx, 29, '#d6a23e', 'jec');
      if (t > 3.3) note(pen, 224 - cx, 30); if (t > 3.7) note(pen, 232 - cx, 26);
      const shut = t < 4.5 ? 1 : Math.max(0, 1 - Math.floor((t - 4.5) * 3) / 4), go = Math.max(0, t - 7.5), x0 = go * go * 6;
      for (let k = 0; k < 6; k++) trainCar(pen, 10 + k * 72 + x0 - cx, 72, shut, 'snow0');
      // Pike in the door of the third car, the children at its windows; a bad salute through the glass.
      const dx = 168 + x0 - cx;
      for (const [wx, s] of [[-9, 'skin2'], [13, 'skin1'], [24, 'skin0']] as const) { pen.rect(dx + wx, 79, 3, 3, s); pen.rect(dx + wx, 79, 3, 1, 'outline'); }
      pen.rect(dx + 1, 76, 5, 1, 'navy0'); pen.rect(dx + 1, 77, 4, 3, 'skin2'); pen.rect(dx, 80, 6, 9, 'navy2');
      if (t > 5.5 && t < 6.6) { pen.rect(dx + 5, 77, 2, 4, 'navy2'); pen.px(dx + 5, 76, 'skin2'); }
      if (shut < 1) pen.dither(dx - 1, 75, 8, 17, 0.25 + (1 - shut) * 0.3, '#9aa0a4'); // the glass of the closed door
      person(pen, 140 - cx, 102, LOOKS.reyes, { face: 1, posture: a.row.posture, arm: t > 6 && t < 7 ? 'out' : 'down' });
      for (let row = 0; row < 4; row++) for (let k = 0; k < 16; k++) small(pen, 220 + k * 11 - cx, 104 + row * 7, 700 + row * 31 + k, {});
      if (go > 0.5) { const fl = loop3(t, 3); if (fl === 2) pen.dither(0, 0, 320, 12, 0.6); }
    },
    // The empty track. Dunne and Reyes.
    'after:tokyo#3': (a, pen, cx) => {
      for (let row = 0; row < 4; row++) for (let k = 0; k < 16; k++) small(pen, 220 + k * 11 - cx, 104 + row * 7, 700 + row * 31 + k, {});
      person(pen, 140 - cx, 102, LOOKS.reyes, { face: 1, posture: a.row.posture });
      person(pen, 120 - cx, 102, LOOKS.dunne, { face: 1 });
    },
    // Fog over the bridge; a stalled double-decker; the lamps' halos. The Column and the squad at the north end; the
    // convoy's headlights far across.
    'before:london#1': (a, pen, cx) => {
      bridge(a, pen, cx, false);
      for (let k = 0; k < 21; k++) small(pen, 8 + (k % 7) * 7 - cx, 52 + Math.floor(k / 7) * 3, 800 + k, { child: k % 6 === 0 });
      person(pen, 58 - cx, 46, LOOKS.dunne, {}); person(pen, 72 - cx, 46, LOOKS.reyes, { posture: a.row.posture }); person(pen, 86 - cx, 46, LOOKS.vega, { arm: 'out' });
      fog(pen, a.t);
    },
    // The crowd crossing; Vega among them counting. A red light on the middle span. A flash, and the middle is gone.
    'after:london#1': (a, pen, cx) => {
      const t = a.t, gone = t > 7.5;
      once(a, 'blast', 7.5, () => a.flash());
      bridge(a, pen, cx, gone);
      for (let k = 0; k < 90; k++) {
        const x = (k * 13 + t * 6) % 480;
        if (gone && x > 190) continue; // nobody is shown on the span
        small(pen, x - cx, 54 + (k % 3) * 2, 900 + k, { frame: walk4(t, k) % 2 });
      }
      for (let k = 0; k < 24; k++) small(pen, 4 + (k % 8) * 6 - cx, 50 + Math.floor(k / 8) * 3, 990 + k, {});
      if (!gone) person(pen, 120 + t * 10 - cx, 44, LOOKS.vega, { walk: true, frame: walk4(t), arm: 'out' });
      if (!gone && t > 5 && t < 7.5 && loop3(t, 3) === 0) pen.lit(240 - cx, 60, 2, 2, '#ff3020');
      if (gone) pen.dither(200 - cx, 40 - (t - 7.5) * 3, 90, 40, Math.max(0, 0.45 - (t - 7.5) * 0.06), '#77736a');
      fog(pen, t);
    },
    // Dunne and Reyes at the north end, at the gap. Across it Vega raises a hand, and walks off toward the convoy.
    'after:london#3': (a, pen, cx) => {
      bridge(a, pen, cx, true);
      for (let k = 0; k < 24; k++) small(pen, 4 + (k % 8) * 6 - cx, 50 + Math.floor(k / 8) * 3, 990 + k, {});
      person(pen, 160 - cx, 44, LOOKS.dunne, {}); person(pen, 176 - cx, 44, LOOKS.reyes, { posture: a.row.posture });
      const go = since(a), vx = 310 + go * 10;
      if (vx < 470) { person(pen, vx - cx, 44, LOOKS.vega, { arm: go === 0 && idle2(a.t) ? 'up' : 'down', walk: go > 0, frame: walk4(a.t), face: go > 0 ? 1 : -1 }); if (go > 0) pen.dither(vx - 1 - cx, 42, 14, 22, go / 10, '#0b0c0e'); }
      fog(pen, a.t);
    },
    // Before dawn on the lawn: sprinklers, the fountain, the pad's amber lights. The Column among the roses. Reyes
    // against a lamp post; Dunne offers the last of the peaches.
    'before:white-house#1': (a, pen, cx) => {
      lawn(a, pen, cx, false);
      lamp(pen, 222 - cx, 60, 112);
      person(pen, 210 - cx, 92, LOOKS.reyes, { posture: 4, face: 1, arm: a.line >= 3 ? 'up' : 'down' });
      person(pen, 190 - cx, 92, LOOKS.dunne, { arm: a.line < 3 ? 'out' : 'down' }); pen.rect(202 - cx, 99, 3, 3, 'metal2');
    },
    // Dawn comes in three steps; everyone looks up; the sky stays empty; the camera closes on the loudspeaker's label.
    'ending#1': (a, pen, cx) => { dawn(pen, a.t < 4 ? 0 : a.t < 8 ? 1 : 2); lawn(a, pen, cx, true); loudspeaker(pen, 252 - cx, 50); pen.rect(232 - cx, 70, 46, 21, 'snow2'); pen.rect(232 - cx, 70, 46, 1, '#efe9d6'); pen.text('RECORDED', 235 - cx, 71, '#4a4d52'); pen.text('DAY 5', 242 - cx, 81, '#4a4d52'); },
    // Dunne and Reyes on the grass, the Column asleep behind them.
    'ending#3': (_a, pen, cx) => {
      dawn(pen, 2);
      for (let k = 0; k < 30; k++) sitting(pen, 10 + (k % 15) * 20 - cx, 94 + Math.floor(k / 15) * 12 + (k % 2) * 3, 1100 + k, { lie: true });
      person(pen, 150 - cx, 100, LOOKS.dunne, { sit: true }); person(pen, 168 - cx, 100, LOOKS.reyes, { sit: true, posture: 3 });
    },
  },
};

/** The flag on its pole: green, white and red, rippling (three frames); `fold` 0 to 1 folds it up. */
function flag(pen: Pen, x: number, y: number, t: number, fold: number) {
  const w = Math.round(42 * (1 - fold * 0.8)), f = loop3(t, 4);
  for (let col = 0; col < w; col++) {
    const dy = Math.round(Math.sin(col / 6 + f * 2.1) * 1.5), c = col < w / 3 ? 'olive1' : col < (2 * w) / 3 ? 'snow2' : 'red1';
    pen.rect(x + col, y + dy, 1, 24 * (1 - fold * 0.6), c);
  }
  if (fold < 0.5) pen.rect(x + 19, y + 10, 4, 4, 'brown1');
}
/** Two notes of the chime. */
function note(pen: Pen, x: number, y: number) { pen.rect(x, y + 4, 3, 2, 'snow1'); pen.rect(x + 2, y, 1, 5, 'snow1'); pen.px(x + 3, y, 'snow1'); }
/** The Colosseum's lamps, out of step; the cats on the broken column; the cart with the Column asleep in it. */
function romeNight(a: Act, pen: Pen, cx: number) {
  for (let k = 0; k < 12; k++) if (idle2(a.t * (0.8 + roll(k) * 0.6), roll(k, 1) * 2)) { const x = 6 + k * 27, y = 30 + (k % 3) * 24; pen.lit(x - cx, y + 6, 6, 10, '#a06a30'); glow(pen, x + 3 - cx, y + 10, 11, '#c08040', 0.35); }
  for (const [kx, tail] of [[40, 0], [47, 1]]) { pen.rect(kx - cx, 60, 4, 4, 'outline'); pen.rect(kx + 1 - cx, 58, 3, 2, 'outline'); pen.px(kx - cx + (idle2(a.t, tail) ? -1 : 4), 63, 'outline'); }
  pen.rect(220 - cx, 98, 46, 12, 'brown0'); pen.rect(220 - cx, 98, 46, 1, 'brown1'); pen.rect(224 - cx, 110, 6, 6, 'outline'); pen.rect(256 - cx, 110, 6, 6, 'outline');
  for (let k = 0; k < 5; k++) pen.rect(224 + k * 8 - cx, 93, 7, 5, 'urban0');
  pen.rect(222 - cx, 92, 42, 3, 'olive1'); pen.rect(236 - cx, 92, 14, 3, 'snow2'); pen.rect(250 - cx, 92, 14, 3, 'red1'); // the folded flag over them
}
/** The bridge, side on: deck, parapet and railing, its piers, lamps with halos, the stalled bus; with its middle gone
 *  once it has been dropped. */
function bridge(a: Act, pen: Pen, cx: number, gone: boolean) {
  for (const px of [100, 240, 380]) if (!gone || px !== 240) pen.rect(px - 8 - cx, 66, 16, 70, 'pave0');
  const span = (x0: number, x1: number) => { pen.rect(x0 - cx, 62, x1 - x0, 8, 'pave0'); pen.rect(x0 - cx, 62, x1 - x0, 1, 'pave1'); pen.rect(x0 - cx, 70, x1 - x0, 2, 'outline'); for (let x = x0; x < x1; x += 4) pen.rect(x - cx, 54, 1, 8, 'metal0'); pen.rect(x0 - cx, 54, x1 - x0, 1, 'metal0'); };
  if (gone) { span(0, 196); span(292, 480); for (let k = 0; k < 6; k++) { pen.rect(196 + k - cx, 62 + k * 2, 2, 2, 'pave0'); pen.rect(291 - k - cx, 62 + k * 2, 2, 2, 'pave0'); } }
  else span(0, 480);
  for (let x = 30; x < 480; x += 60) {
    if (gone && x > 196 && x < 292) continue;
    pen.rect(x - cx, 36, 1, 18, 'metal0');
    if (loop3(a.t, 3, x) !== 2) { pen.lit(x - 1 - cx, 35, 3, 2, 'flash1'); glow(pen, x - cx, 36, 10, '#eadfae', 0.4); }
  }
  if (!gone) { pen.rect(200 - cx, 40, 36, 22, 'red1'); pen.rect(200 - cx, 40, 36, 1, 'red2'); for (let k = 0; k < 5; k++) { pen.rect(203 + k * 7 - cx, 43, 5, 5, 'navy0'); pen.rect(203 + k * 7 - cx, 52, 5, 4, 'navy0'); } }
  for (let k = 0; k < 4; k++) pen.lit(440 + k * 8 - cx, 60, 2, 1, '#d6a23e'); // the convoy, far across
}
/** Fog: loose drifting specks in four bands, each band at its own pace, thinner at its edges. */
function fog(pen: Pen, t: number) {
  for (let k = 0; k < 4; k++)
    for (let i = 0; i < 110; i++) {
      const v = roll(k, i), x = ((roll(i, k) * 440 + t * (3 + k * 2)) % 440) - 60, y = 18 + k * 28 + Math.round((v - 0.5) * (v - 0.5) * 60 * (i % 2 ? 1 : -1));
      pen.px(x, y, i % 5 ? '#6f7471' : '#9aa0a4');
    }
}
/** The lawn's life: sprinklers' arcs (four frames), the fountain, the pad's amber lights, the Column among the roses
 *  (looking up at the sky, in the Ending). */
function lawn(a: Act, pen: Pen, cx: number, lookUp: boolean) {
  const t = a.t, f = Math.floor(t * 4) % 4;
  for (const sx of [70, 260]) for (let k = 0; k < 8; k++) { const q = k / 8, x = sx + (f - 1.5) * 10 * q, y = 100 - Math.sin(q * Math.PI) * 14 - q * 2; pen.px(x - cx, y, 'snow1'); }
  pen.rect(30 - cx, 106, 16, 4, 'snow0'); for (let k = 0; k < 3; k++) pen.px(36 + k * 2 - cx, 100 - ((loop3(t, 4) + k) % 3) * 2, 'snow2');
  if (idle2(t)) for (const [lx, ly] of [[130, 116], [190, 116], [130, 133], [190, 133]]) pen.lit(lx - cx, ly, 2, 2, 'hivis2');
  for (let k = 0; k < 40; k++) {
    const x = 6 + ((k * 37) % 300), y = 90 + ((k * 23) % 36);
    if (x > 124 && x < 196 && y > 110) continue;
    sitting(pen, x - cx, y, 1000 + k, { up: lookUp, lie: !lookUp && k % 4 === 0 });
  }
}
/** The sky as dawn comes, in three steps (only its light keeps its colour at the end). */
function dawn(pen: Pen, step: number) {
  const bands = [['navy0', 'navy1', 'navy2', 'cloth1'], ['navy1', 'cloth1', 'maroon1', '#6a4a50'], ['cloth1', 'maroon2', '#a06a50', '#d09060']][step];
  bands.forEach((col, k) => { for (const [x, w] of [[0, 90], [230, 90]]) pen.led(x, k * 9, w, 9, col.startsWith('#') ? col : pen.col(col)); pen.led(90, k * 9, 140, Math.max(0, Math.min(9, 28 - k * 9)), col.startsWith('#') ? col : pen.col(col)); });
  if (step) pen.led(0, 34, 90, 2, step === 1 ? '#8a5a40' : '#e0a070');
}
