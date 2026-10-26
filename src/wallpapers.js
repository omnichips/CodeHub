// Animated pixel-art wallpapers. Each draws on a small canvas that CSS scales up with hard edges, so one canvas
// pixel is PX screen pixels. To add a wallpaper, add an entry: init(w, h) makes its state, draw(...) paints a frame,
// an optional frameMs asks for a faster frame rate than the default ~15 fps, and an optional px for smaller pixels.
const PX = 4;
const pointer = { x: 0, y: 0, on: false }; // in canvas pixels, kept up to date by startWallpaper
const rand = (a, b) => a + Math.random() * (b - a);
const mod = (n, m) => ((n % m) + m) % m;
const many = (n, make) => Array.from({ length: Math.ceil(n) }, make);

function fillGradient(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glow(ctx, x, y, r, rgb) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function disc(ctx, cx, cy, r) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

// ---- Meadow: a summer hill under a big sky, built from code (no image). ----
// The whole frame is written into one pixel buffer: a banded sky, cloud sprites drifting at different speeds, far
// mountains, a meadow shaded per pixel every frame so gusts of wind can roll across it, then grass blades and flowers
// on little springs that the wind sways and the pointer pushes aside, and a few butterflies.

const u32 = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16); // ImageData is RGBA in memory: ABGR as a little-endian word
};
const hash = (x, y, seed) => {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2.1, y * 2.1, seed + 1) * 0.28 + noise(x * 4.3, y * 4.3, seed + 2) * 0.12;
const bell = (a, s) => Math.exp(-(a * a) / (s * s));
const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const SKY = ['#3583f4', '#3a89f4', '#4090f4', '#4696f4', '#4d9df5', '#54a5f5', '#5badf5', '#63b5f5', '#6bbef6', '#73c6f6'].map(u32);
const CLOUD = { shade: u32('#7dd1f7'), mid: u32('#a4e8f8'), light: u32('#c6f8f9') };
const MOUNTAIN = [u32('#283958'), u32('#35617f')];
// Darkest to lightest. The last one is only reached when a gust of wind catches the sunniest grass.
const GROUND = ['#224e3d', '#3a684b', '#4c9344', '#89ba40', '#ade34d', '#d1e44f', '#e8f27a'].map(u32);
const FLOWERS = [
  { P: '#f9f6e7', S: '#cdd5c5', C: '#f9cd3d' }, // daisy
  { P: '#f587b1', S: '#d96395', C: '#fbb8d0' }, // clover
  { P: '#f9cd3d', S: '#efae23', C: '#ffff5b' }, // buttercup
].map((f) => ({ P: u32(f.P), S: u32(f.S), C: u32(f.C) }));
const HEADS = [['P'], ['.P.', 'PCP'], ['.P.', 'PCP', '.S.'], ['.PP.', 'PCCP', 'PCCS', '.SS.'], ['.PPP.', 'PPPPS', 'PPCPS', 'PPPSS', '.SSS.']];
const BUTTERFLY = [u32('#f9f6e7'), u32('#ffff5b'), u32('#f587b1')];
const BIRD = u32('#2b4a78');
const STAR = [u32('#ffffff'), u32('#c9d6ff')];
const MOON = [u32('#fbf3d0'), u32('#ddd2a4')];
const FIREFLY = [u32('#f6ff9a'), u32('#4f6b3a')];
const WINGS = [[[-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1]], [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]]]; // up, down
// The meadow's light follows the real sun over Manila. Each table row is [height on screen, then how much to multiply
// and add to red, green and blue at full strength]. Golden hour: violet overhead, orange at the horizon, gold grass.
const DUSK = [
  [0, 0.55, 0.5, 0.85, 20, 0, 30],
  [0.55, 1.05, 0.72, 0.5, 70, 25, 15],
  [1, 0.75, 0.6, 0.55, 25, 5, 0],
];
const NIGHT = [
  [0, 0.14, 0.17, 0.38, 4, 6, 22],
  [0.55, 0.24, 0.28, 0.5, 10, 16, 40],
  [1, 0.16, 0.22, 0.3, 2, 6, 14],
];

// Philippine time (UTC+8 all year) as minutes past midnight, and the day of the year. ?time=18:10 in the address pins
// the time, to preview dusk or night without waiting for it.
const pinnedTime = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time') ?? '');
function manilaClock() {
  const d = new Date(Date.now() + 8 * 3600e3);
  const day = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  if (pinnedTime) return { minutes: +pinnedTime[1] * 60 + +pinnedTime[2], day };
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, day };
}
// Sunrise and sunset in Manila (14.6° N, 121° E), in minutes past midnight, to within a few minutes.
function sunTimes(day) {
  const decl = 0.409 * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const b = (2 * Math.PI * (day - 81)) / 364, eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noon = 716 - eot, half = (Math.acos(-Math.tan(0.2548) * Math.tan(decl)) * 720) / Math.PI + 4; // + refraction
  return [noon - half, noon + half];
}
// How golden and how dark the light is right now, each 0 to 1.
function lightAt({ minutes, day }) {
  const [rise, set] = sunTimes(day), r = minutes - rise, z = minutes - set;
  return {
    warm: Math.max(smooth(-35, 0, r) * (1 - smooth(20, 70, r)), smooth(-75, -15, z) * (1 - smooth(15, 45, z))),
    night: Math.max(1 - smooth(-35, 10, r), smooth(5, 50, z)),
  };
}
// Recolours the frame through each [table, strength] stage in turn, in bands down the screen.
function tint(data, w, h, stages) {
  const bands = 24, lut = new Uint8ClampedArray(768);
  for (let band = 0; band < bands; band++) {
    const v = (band + 0.5) / bands;
    for (let n = 0; n < 256; n++) for (let c = 0; c < 3; c++) lut[c * 256 + n] = n;
    for (const [table, amount] of stages) {
      const i = v < table[1][0] ? 0 : 1, a = table[i], b = table[i + 1], k = (v - a[0]) / (b[0] - a[0]);
      for (let c = 0; c < 3; c++) {
        const mul = 1 + (a[1 + c] + (b[1 + c] - a[1 + c]) * k - 1) * amount, add = (a[4 + c] + (b[4 + c] - a[4 + c]) * k) * amount;
        for (let n = 0; n < 256; n++) lut[c * 256 + n] = lut[c * 256 + n] * mul + add;
      }
    }
    for (let p = Math.floor((band * h) / bands) * w * 4, end = Math.floor(((band + 1) * h) / bands) * w * 4; p < end; p += 4) {
      data[p] = lut[data[p]];
      data[p + 1] = lut[256 + data[p + 1]];
      data[p + 2] = lut[512 + data[p + 2]];
    }
  }
}
// One gust of wind as it passes a spot: a bright crest where the grass bends and shows its sunny side, a shallow trough.
const GUST = Float32Array.from({ length: 1024 }, (_, i) => {
  const s = Math.sin((i / 1024) * Math.PI * 2);
  return s > 0 ? s ** 4 * 1.3 : s * 0.25;
});

// The hill's top edge as a fraction of the height, at u = x / width: highest a third of the way in, falling away right.
// A tall, narrow screen gets a gentler hill, or the same rise squeezed into its width would look like a cliff.
const crestAt = (u, aspect) => 0.536 + Math.min(1, Math.sqrt(aspect / 1.78)) * (u < 0.3 ? 0.046 * ((0.3 - u) / 0.3) ** 2 : 0.156 * ((u - 0.3) / 0.7) ** 1.3);

const sprite = (w, h) => {
  const s = { w: Math.max(1, Math.ceil(w)), h: Math.max(1, Math.ceil(h)) };
  s.px = new Uint32Array(s.w * s.h);
  return s;
};
function blit(buf, w, h, s, x0, y0) {
  const xa = Math.max(0, -x0), xb = Math.min(s.w, w - x0), ya = Math.max(0, -y0), yb = Math.min(s.h, h - y0);
  for (let y = ya; y < yb; y++) {
    const row = y * s.w, out = (y + y0) * w + x0;
    for (let x = xa; x < xb; x++) if (s.px[row + x]) buf[out + x] = s.px[row + x];
  }
}

// A heaped cumulus cloud: rows of round lobes, each lit from the top left, on a flat base with wisps trailing off it.
function cumulus(W, H, seed) {
  const s = sprite(W, H), base = s.h - 1, r0 = Math.max(1.2, s.h * 0.22), shift = (hash(0, 0, seed) - 0.5) * 0.2;
  const lobes = [];
  for (let row = 0; row < 3; row++) {
    const span = 0.84 - row * 0.28, r = r0 * (1 - row * 0.15), n = Math.max(1, Math.round((span * s.w) / (r * 1.3)));
    for (let i = 0; i < n; i++) {
      const k = hash(i, row, seed + 1), u = 0.5 + shift * row + span * ((i + 0.5) / n - 0.5);
      lobes.push({ x: u * s.w + (k - 0.5) * r, y: base - r0 * 0.6 - row * s.h * 0.26 + (hash(i, row, seed + 2) - 0.5) * r * 0.5, r: r * (0.6 + 0.8 * k) });
    }
  }
  // Each lobe is a squashed dome; together they make a height map. Shading it with light from the top left, in three
  // tones, gives bright tops, shaded undersides and creases where the billows meet.
  const height = new Float32Array(s.w * s.h);
  for (const l of lobes)
    for (let y = Math.max(0, Math.floor(l.y - l.r)); y <= Math.min(base, l.y + l.r); y++)
      for (let x = Math.max(0, Math.floor(l.x - l.r)); x <= Math.min(s.w - 1, l.x + l.r); x++) {
        const q = 1 - ((x - l.x) / l.r) ** 2 - ((y - l.y) / (l.r * 0.8)) ** 2 + (noise(x * 0.2, y * 0.2, seed) - 0.5) * 0.25;
        if (q > 0) height[y * s.w + x] = Math.max(height[y * s.w + x], l.r * Math.sqrt(q));
      }
  const at = (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? 0 : height[y * s.w + x]);
  for (let y = 0; y <= base; y++)
    for (let x = 0; x < s.w; x++) {
      if (!at(x, y)) continue;
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2, gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      const lit = (gx * 0.45 + gy * 0.74 + 0.5) / Math.sqrt(gx * gx + gy * gy + 1);
      s.px[y * s.w + x] = y >= base - (hash(x, 0, seed) < 0.5) ? CLOUD.shade : lit > 0.62 ? CLOUD.light : lit > 0.3 ? CLOUD.mid : CLOUD.shade;
    }
  for (let i = 0; i < 4; i++) {
    const y = base - ((hash(i, 7, seed) * 3) | 0), len = s.w * (0.15 + 0.25 * hash(i, 8, seed)), left = i % 2 ? s.w * 0.02 : s.w * 0.98 - len;
    for (let x = Math.max(0, Math.round(left)); x < Math.min(s.w, left + len); x++)
      if (!s.px[y * s.w + x] || i > 1) s.px[y * s.w + x] = i > 1 ? CLOUD.shade : CLOUD.mid;
  }
  return s;
}
// A streaky cirrus: thick at the right-hand head, thinning and breaking up along a tail that rises to the left.
function wisp(W, H, seed, rise) {
  const s = sprite(W, H);
  for (let x = 0; x < s.w; x++) {
    const u = (x + 0.5) / s.w, thick = s.h * Math.min(1, 2.6 * u ** 0.8 * (1 - u) ** 0.9) * (0.75 + 0.5 * noise(x * 0.3, 0, seed));
    const cy = s.h * (0.5 + rise * (u - 0.6)), top = Math.round(cy - thick / 2), bottom = Math.round(cy + thick / 2);
    for (let y = Math.max(0, top); y <= Math.min(s.h - 1, bottom); y++) {
      if (noise(x * 0.3, y * 0.7, seed) < 0.6 * (1 - u) ** 1.5) continue; // the tail breaks into shreds
      const core = y < bottom - Math.max(1, thick * 0.35) && u > 0.15;
      s.px[y * s.w + x] = core ? CLOUD.light : y === bottom ? CLOUD.shade : CLOUD.mid;
    }
  }
  return s;
}
// [kind, left, top (fractions of the screen), width, height (at a 480 x 270 canvas), drift speed, wisp rise]. Slowest
// (farthest) first, so nearer clouds pass in front.
const SKYLINE = [
  ['cu', 0.52, 0.48, 230, 44, 0.25],
  ['wi', 0.27, 0.505, 62, 5, 0.3, 0.2],
  ['wi', 0.41, 0.525, 46, 4, 0.3, 0],
  ['wi', 0.54, 0.43, 95, 7, 0.4, -0.6],
  ['cu', 0.55, 0.2, 190, 80, 0.45],
  ['cu', 0.42, 0.27, 62, 30, 0.55],
  ['cu', 0.88, 0.1, 72, 34, 0.6],
  ['cu', 0.8, -0.03, 105, 26, 0.7],
  ['wi', 0.46, -0.02, 84, 32, 0.75, 0.8],
  ['wi', 0.05, 0.23, 95, 30, 0.65, 1.1],
  ['cu', 0.2, 0.11, 32, 14, 0.8],
  ['cu', 0.27, 0.12, 26, 16, 0.8],
  ['wi', 0.38, 0.07, 12, 4, 0.9, 0.5],
  ['wi', 0.08, 0.16, 9, 3, 0.9, 0.5],
];

function meadowInit(w, h) {
  const k = Math.min(h / 270, w / 360); // cloud scale: a phone's narrow canvas gets smaller clouds
  const sc = Math.max(0.45, Math.min(1.6, k)); // grass and flower scale
  const s = { img: new ImageData(w, h), sec: null, lastX: null };
  s.buf = new Uint32Array(s.img.data.buffer);

  // Sky: deepest blue at the top right, paling toward the horizon and the left, in bands with dithered seams.
  s.sky = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = Math.min(1, Math.max(0, (y / (h * 0.62)) * 0.78 + (1 - x / w) * 0.28 - 0.06));
      s.sky[y * w + x] = SKY[Math.min(SKY.length - 1, Math.floor(l * (SKY.length - 1) + 0.2 + BAYER[(y & 3) * 4 + (x & 3)] * 0.6))];
    }

  s.clouds = SKYLINE.map(([kind, x, y, cw, ch, v, rise], i) => {
    const spr = kind === 'cu' ? cumulus(cw * k, ch * k, i * 97 + 13) : wisp(cw * k, ch * k, i * 97 + 13, rise);
    return { spr, x: x * w, y: Math.round(y * h), v: v * Math.max(k, 0.3) };
  });


  // The meadow. Each pixel gets a shading value (sunny patches, a shaded fold, the dark foreground) plus a grass-stroke
  // dither, and a wind phase. Both are worked out once; each frame only adds the passing gusts.
  s.crest = Float32Array.from({ length: w }, (_, x) => h * crestAt((x + 0.5) / w, w / h));
  s.top = Int32Array.from({ length: w }, (_, x) => Math.round(s.crest[x]) - (hash(x, 0, 21) < 0.45) - (hash(x, 0, 22) < 0.12)); // grass tufts on the skyline
  s.minTop = Math.min(...s.top);

  // Far blue mountains peeking over the right end of the hill, sized to the height so a phone shows the same peaks.
  // Slopes facing the sun (the left side of each peak) are lighter.
  const foot = s.crest[w - 1] - h * 0.017;
  const mx = Math.max(0, Math.floor(w - h * 0.3)), my = Math.floor(foot - h * 0.1);
  s.mountains = sprite(w - mx, h * 0.2);
  const ridge = (x) => {
    const e = (w - x) / h;
    return foot - h * (0.055 * bell(e - 0.18, 0.062) + 0.04 * bell(e - 0.044, 0.053) + 0.02 * bell(e - 0.107, 0.107));
  };
  for (let x = mx; x < w; x++) {
    const top = Math.round(ridge(x) + hash(x, 0, 31) - 0.5), sunny = ridge(x + 1) < ridge(x);
    for (let y = Math.max(my, top); y < my + s.mountains.h; y++)
      s.mountains.px[(y - my) * s.mountains.w + x - mx] = MOUNTAIN[sunny && y < top + h * 0.03 + hash(x, y, 32) * 2 ? 1 : 0];
  }
  s.mx = mx;
  s.my = my;

  s.base = new Float32Array(w * h);
  s.value = new Float32Array(w * h);
  s.phase = new Float32Array(w * h);
  s.wx = new Float32Array(w * h); // where each pixel is on the ground, for the cloud shadows
  s.wz = new Float32Array(w * h);
  s.wob = new Float32Array(w * h); // ragged shadow edges
  for (let x = 0; x < w; x++) {
    const u = x / w, offset = Math.floor(hash(x, 0, 5) * 8);
    for (let y = s.top[x]; y < h; y++) {
      const d = Math.max(0, (y - s.crest[x]) / (h - s.crest[x])); // 0 on the skyline, 1 at the bottom of the screen
      const Z = 1 / (d + 0.12), X = ((x - w / 2) / h) * Z; // ground-plane coordinates, so patches shrink with distance
      const v =
        3.4 +
        (fbm(X * 1.1, Z * 1.6, 7) - 0.5) * 3.2 +
        1.1 * bell(u - 0.3, 0.28) * bell(d - 0.35, 0.3) + // the big sunny swathe on the left
        0.9 * bell(u - 0.82, 0.18) * bell(d - 0.72, 0.1) + // a bright band low on the right
        -1.3 * smooth(0.55, 1, u) * (1 - smooth(0, 0.4, d)) + // the far right slope turns from the sun
        -1.3 * bell(d - 0.5 - 0.08 * Math.sin(u * 5 + 1), 0.08) + // a fold in the ground
        -3.6 * smooth(0.6, 1.02, d); // deep green at your feet
      const L = 2 + Math.round(d * 4); // grass strokes, taller up close, with light tips
      const p = y * w + x;
      s.value[p] = v;
      s.base[p] = v + 0.6 * (1 - (((y + offset) % L) + 0.5) / L) + 0.4 * hash(x, y, 6);
      s.phase[p] = X * 0.4 + Z * 0.15 + 0.2 * fbm(X * 0.8, Z * 0.8, 11);
      s.wx[p] = X;
      s.wz[p] = Z;
      s.wob[p] = fbm(X * 3, Z * 2, 41) - 0.5;
    }
  }
  // Cloud shadows: big soft ovals lying on the ground, drifting the way the clouds go, wrapping round every 24 units.
  s.shadows = many(4, (_, i) => ({ x: -12 + i * 6 + rand(0, 4), z: rand(1.3, 7), r: rand(0.9, 1.7) }));

  // Where the pointer has brushed the grass, which darkens it for a moment (half resolution).
  s.gw = Math.ceil(w / 2);
  s.press = new Float32Array(s.gw * Math.ceil(h / 2));

  // Grass blades and flowers, nearest drawn last. lean is the tip's sideways bend; the wind and pointer set its target.
  const plants = [];
  const plant = (x, y, extra) => {
    const p = y * w + x, d = Math.max(0, (y - s.crest[x]) / (h - s.crest[x]));
    return { x, y, d, v: s.value[p], phase: s.phase[p], wx: s.wx[p], wz: s.wz[p], wob: s.wob[p], lean: 0.25, vel: 0, ...extra(d) };
  };
  for (let y = s.minTop; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (y <= s.crest[x]) continue;
      const d = (y - s.crest[x]) / (h - s.crest[x]);
      if (Math.random() < 0.012 + 0.11 * d * d)
        plants.push(plant(x, y, (d) => ({ len: Math.max(1, Math.round((1 + d * d * 7) * sc * rand(0.6, 1.2))), tone: [-1, 0, 0, 1][(Math.random() * 4) | 0] })));
    }
  // Flowers grow in clusters, most of them near the front.
  for (let i = Math.round((w * (h - s.minTop)) / 1100); i > 0; i--) {
    const cx = rand(0, w), depth = Math.random() ** 0.35, type = Math.random() < 0.4 ? 0 : Math.random() < 0.58 ? 1 : 2;
    const spread = (3 + depth * 14) * sc;
    for (let n = 2 + ((Math.random() * 6) | 0); n > 0; n--) {
      const x = Math.round(cx + rand(-1, 1) * spread);
      if (x < 0 || x >= w) continue;
      const y = Math.min(h - 1, Math.round(s.crest[x] + 1 + depth * (h - s.crest[x] - 2) + rand(-0.4, 0.4) * spread));
      if (y <= s.crest[x]) continue;
      plants.push(
        plant(x, y, (d) => {
          const head = Math.min(4, Math.floor(d * d * 4.6 * sc));
          return { head, colors: FLOWERS[Math.random() < 0.85 ? type : (Math.random() * 3) | 0], len: head ? head - 1 + ((Math.random() * 3) | 0) : 0, tone: 0 };
        })
      );
    }
  }
  s.plants = plants.sort((a, b) => a.y - b.y);
  s.flies = many(Math.max(1, Math.round(w / 170)), (_, i) => ({ x: rand(0, w), y: rand(h * 0.65, h * 0.9), vx: 0, vy: 0, seed: i * 7 + 3, color: BUTTERFLY[i % 3] }));
  s.seeds = many((w * h) / 6000, () => ({ x: rand(0, w), y: rand(h * 0.5, h), v: rand(2, 6) * sc, p: rand(0, 7) }));
  s.sc = sc;
  s.k = Math.max(0.4, k);
  // The night sky: stars (the brighter ones come out first), a crescent moon, and fireflies over the grass.
  s.stars = many((w * h) / 220, () => {
    const x = (Math.random() * w) | 0;
    return { p: ((Math.random() * (s.crest[x] - 3)) | 0) * w + x, bright: Math.random() < 0.25, phase: rand(0, 7) };
  });
  const mr = Math.max(2, Math.round(7 * k)), mcx = Math.round(w * 0.8), mcy = Math.round(h * 0.13);
  s.moon = [];
  for (let dy = -mr; dy <= mr; dy++)
    for (let dx = -mr; dx <= mr; dx++) {
      const inside = dx * dx + dy * dy <= mr * mr, bite = (dx - mr * 0.5) ** 2 + (dy + mr * 0.25) ** 2 <= (mr * 0.9) ** 2;
      if (inside && !bite) s.moon.push({ p: (mcy + dy) * w + mcx + dx, c: MOON[hash(dx, dy, 51) < 0.15 ? 1 : 0] });
    }
  s.fireflies = many(Math.max(4, w / 25), () => {
    const x = rand(0, w);
    return { x, y: rand(s.crest[x | 0] + 4, h - 4), phase: rand(0, 99) };
  });
  s.nextFlock = null;
  s.flock = null;
  return s;
}

function meadowDraw(ctx, w, h, t, s) {
  const sec = t / 1000, dt = s.sec === null ? 0 : Math.min(0.1, Math.max(0, sec - s.sec));
  s.sec = sec;
  const buf = s.buf, put = (x, y, c) => x >= 0 && x < w && y >= 0 && y < h && (buf[y * w + x] = c);
  const shade = (i) => GROUND[i < 0 ? 0 : i > 6 ? 6 : i];
  const gust = (phase) => GUST[((phase - sec * 0.09) * 1024) & 1023];
  const drift = sec * 0.025;
  const shadow = (X, Z, wob) => {
    let a = 0;
    for (const c of s.shadows) {
      let dx = X - c.x - drift;
      dx = (dx - 24 * Math.round(dx / 24)) / c.r;
      const dz = (Z - c.z) / (c.r * 1.3), q = dx * dx + dz * dz;
      if (q < 1.4) a = Math.max(a, Math.min(1, (1.1 + 0.6 * wob - q) * 3));
    }
    return a;
  };

  buf.set(s.sky);
  for (const c of s.clouds) blit(buf, w, h, c.spr, Math.round(mod(c.x + c.spr.w + sec * c.v, w + c.spr.w) - c.spr.w), c.y);

  // Now and then a small flock of birds crosses the sky in a loose V, flapping out of step.
  if (s.nextFlock === null) s.nextFlock = sec + rand(3, 10);
  const light = lightAt(manilaClock());
  if (!s.flock && sec >= s.nextFlock && light.night < 0.3) {
    const dir = Math.random() < 0.7 ? 1 : -1;
    s.flock = {
      t0: sec, dir, y: rand(0.1, 0.36) * h, v: rand(16, 24) * s.k,
      birds: many(2 + ((Math.random() * 4) | 0), (_, i) => ({ dx: -dir * Math.ceil(i / 2) * 6 * s.sc, dy: (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 3 * s.sc, p: rand(0, 7) })),
    };
  }
  if (s.flock) {
    const f = s.flock, travelled = (sec - f.t0) * f.v, lead = f.dir > 0 ? travelled - 10 : w + 10 - travelled;
    for (const b of f.birds) {
      const x = Math.round(lead + b.dx), y = Math.round(f.y + b.dy + Math.sin(sec * 1.3 + b.p) * 1.5);
      for (const [dx, dy] of WINGS[Math.sin(sec * 11 + b.p) > 0 ? 0 : 1]) put(x + dx, y + dy, BIRD);
    }
    if (travelled > w + 80 * s.sc) {
      s.flock = null;
      s.nextFlock = sec + rand(15, 35);
    }
  }

  blit(buf, w, h, s.mountains, s.mx, s.my);

  // The pointer, and how fast it is moving (canvas pixels a second), which flicks the grass the way it goes.
  const on = pointer.on && dt > 0;
  const pvx = on && s.lastX !== null ? Math.max(-300, Math.min(300, (pointer.x - s.lastX) / dt)) : 0;
  s.lastX = on ? pointer.x : null;

  const press = s.press, gw = s.gw;
  const fade = Math.exp(-dt * 1.6);
  for (let i = 0; i < press.length; i++) press[i] *= fade;
  if (on) {
    const R = 9 * s.sc, strength = 0.45 + Math.min(0.55, Math.abs(pvx) / 120);
    for (let gy = Math.max(0, Math.floor((pointer.y - R) / 2)); gy <= Math.min(press.length / gw - 1, (pointer.y + R) / 2); gy++)
      for (let gx = Math.max(0, Math.floor((pointer.x - R) / 2)); gx <= Math.min(gw - 1, (pointer.x + R) / 2); gx++) {
        const f = 1 - Math.hypot(gx * 2 + 1 - pointer.x, gy * 2 + 1 - pointer.y) / R;
        if (f > 0) press[gy * gw + gx] = Math.max(press[gy * gw + gx], f * strength);
      }
  }

  for (let y = s.minTop; y < h; y++)
    for (let x = 0, p = y * w; x < w; x++, p++)
      if (y >= s.top[x])
        buf[p] = shade(Math.floor(s.base[p] + gust(s.phase[p]) - press[(y >> 1) * gw + (x >> 1)] * 1.3 - shadow(s.wx[p], s.wz[p], s.wob[p]) * 1.1));

  const R = 16 * s.sc;
  for (const b of s.plants) {
    const g = gust(b.phase);
    let target = 0.25 + 0.18 * Math.sin(sec * 1.7 + b.x * 0.11 + b.y * 0.07) + g * 0.9;
    if (on) {
      const dx = b.x - pointer.x, dist = Math.hypot(dx, (b.y - b.len * 0.5 - pointer.y) * 1.5);
      if (dist < R) {
        const f = (1 - dist / R) ** 2;
        target += (dx >= 0 ? 2.6 : -2.6) * f + pvx * 0.012 * f; // part around the pointer, flick along with it
      }
    }
    target = Math.max(-2.4, Math.min(2.4, target));
    const stiff = 90 / Math.sqrt(b.len + 1);
    b.vel += ((target - b.lean) * stiff - b.vel * 7) * dt;
    b.lean += b.vel * dt;

    const gi = Math.floor(b.v + g - shadow(b.wx, b.wz, b.wob) * 1.1) + b.tone, bend = Math.min(1, Math.abs(b.lean) * 0.6);
    let lastX = b.x, tipX = b.x, tipY = b.y;
    for (let i = 0; i <= b.len; i++) {
      const f = b.len ? i / b.len : 0;
      tipX = Math.round(b.x + b.lean * b.len * 0.7 * f * f);
      tipY = b.y - Math.round(i * (1 - 0.3 * bend));
      const c = b.head !== undefined ? shade(gi - 1 + (i > 0)) : shade(gi - 1 + (f > 0.45) + (i === b.len && b.len > 2));
      if (Math.abs(tipX - lastX) > 1) put((tipX + lastX) >> 1, tipY, c); // keep a sharply bent blade joined up
      put(tipX, tipY, c);
      lastX = tipX;
    }
    if (b.head !== undefined) {
      const rows = HEADS[b.head], left = tipX - (rows[0].length >> 1), top = tipY - rows.length + 1;
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) if (row[rx] !== '.') put(left + rx, top + ry, b.colors[row[rx]]);
      });
    }
  }

  // Dandelion seeds riding the breeze.
  const seedColor = FLOWERS[0].P;
  for (const d of s.seeds) put(Math.floor(mod(d.x + sec * d.v, w)), Math.floor(d.y + Math.sin(sec * 0.9 + d.p) * 3 * s.sc), seedColor);

  // Butterflies wander over the grass and flutter away from the pointer.
  for (const f of light.night < 0.5 ? s.flies : []) {
    const a = noise(sec * 0.25, 0, f.seed) * Math.PI * 4;
    let tx = Math.cos(a) * 10 * s.sc, ty = Math.sin(a) * 5 * s.sc;
    const ground = s.crest[Math.floor(mod(f.x, w))];
    if (f.y < ground - 20 * s.sc) ty += 8 * s.sc;
    if (f.y > h - 6) ty -= 8 * s.sc;
    if (on) {
      const dx = f.x - pointer.x, dy = f.y - pointer.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 30 * s.sc) {
        tx += (dx / dist) * 45 * s.sc;
        ty += (dy / dist) * 45 * s.sc;
      }
    }
    f.vx += (tx - f.vx) * Math.min(1, dt * 2);
    f.vy += (ty - f.vy) * Math.min(1, dt * 2);
    f.x = mod(f.x + f.vx * dt, w);
    f.y += f.vy * dt;
    const x = Math.round(f.x), y = Math.round(f.y + Math.sin(sec * 7 + f.seed) * 0.6), open = Math.sin(sec * 19 + f.seed) > 0;
    put(x, y, GROUND[0]);
    for (const [dx, dy] of open ? [[-1, -1], [1, -1], [-1, 0], [1, 0]] : [[0, -1], [0, -2]]) put(x + dx, y + dy, f.color);
  }

  // Light the scene for the time of day. Stars and the moon are only drawn where no cloud covers them, and go on after
  // the darkening so they stay bright.
  if (light.night > 0.1) {
    const shown = light.night * 1.4;
    s.litStars = s.stars.filter((st) => buf[st.p] === s.sky[st.p] && (st.bright || shown > 1) && Math.sin(sec * 3 + st.phase) < 0.9);
    s.litMoon = s.moon.filter((m) => buf[m.p] === s.sky[m.p]);
  }
  if (light.warm > 0.005 || light.night > 0.005) tint(s.img.data, w, h, [[DUSK, light.warm], [NIGHT, light.night]]);
  if (light.night > 0.1) {
    for (const st of s.litStars) buf[st.p] = STAR[st.bright ? 0 : 1];
    for (const m of s.litMoon) buf[m.p] = m.c;
  }
  if (light.night > 0.4)
    for (const f of s.fireflies) {
      if (Math.sin(sec * 2 + f.phase * 3) < 0.2) continue; // blinking
      const x = Math.round(f.x + Math.sin(sec * 0.3 + f.phase) * 8 * s.sc), y = Math.round(f.y + Math.sin(sec * 0.5 + f.phase * 1.7) * 5 * s.sc);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(x + dx, y + dy, FIREFLY[1]);
      put(x, y, FIREFLY[0]);
    }
  ctx.putImageData(s.img, 0, 0);
}

const WALLPAPERS = [
  { id: 'meadow', name: 'Meadow', frameMs: 33, px: 4 * 0.67, init: meadowInit, draw: meadowDraw }, // px: as it looks at 67% browser zoom
  {
    id: 'aurora',
    name: 'Aurora',
    init: (w, h) => ({ dust: many((w * h) / 400, () => ({ x: rand(0, w), y: rand(0, h), v: rand(1, 4) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      const r = Math.max(w, h);
      fillGradient(ctx, w, h, '#1a2547', '#121428');
      glow(ctx, w * (0.1 + 0.1 * Math.sin(sec / 9)), 0, r * 0.8, '59,122,87');
      glow(ctx, w * (1 - 0.1 * Math.sin(sec / 11)), h, r * 0.75, '108,75,209');
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const d of s.dust) ctx.fillRect(mod(d.x + Math.sin(sec + d.y) * 2, w) | 0, mod(d.y - sec * d.v, h) | 0, 1, 1);
    },
  },
  {
    id: 'stars',
    name: 'Starfield',
    init: (w, h) => ({ stars: many((w * h) / 50, () => ({ x: rand(0, w), y: rand(0, h) | 0, z: 1 + ((Math.random() * 3) | 0), p: rand(0, 7) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      ctx.fillStyle = '#060818';
      ctx.fillRect(0, 0, w, h);
      ['#2c3566', '#7484c4', '#ffffff'].forEach((color, i) => {
        ctx.fillStyle = color;
        for (const star of s.stars) {
          if (star.z !== i + 1) continue;
          const x = mod(star.x - sec * star.z * 3, w) | 0; // nearer stars drift faster
          if (star.z === 3 && Math.sin(sec * 2 + star.p) > 0.85) {
            ctx.fillRect(x - 1, star.y, 3, 1);
            ctx.fillRect(x, star.y - 1, 1, 3);
          } else ctx.fillRect(x, star.y, 1, 1);
        }
      });
    },
  },
  {
    id: 'city',
    name: 'Rainy city',
    init(w, h) {
      const buildings = [];
      for (let x = 0; x < w; ) {
        const bw = rand(6, 16) | 0;
        const bh = rand(h * 0.12, h * 0.42) | 0;
        const windows = [];
        for (let wy = h - bh + 2; wy < h - 2; wy += 3)
          for (let wx = x + 2; wx < x + bw - 2; wx += 3) windows.push({ x: wx, y: wy, p: Math.random(), on: Math.random() < 0.5 });
        buildings.push({ x, w: bw, h: bh, windows });
        x += bw + ((Math.random() * 2) | 0);
      }
      return { buildings, rain: many((w * h) / 80, () => ({ x: rand(0, w), y: rand(0, h), v: rand(50, 80) })) };
    },
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      fillGradient(ctx, w, h, '#0d0b24', '#3b1d5e');
      ctx.fillStyle = '#f5f0ff';
      disc(ctx, (w * 0.78) | 0, (h * 0.18) | 0, 5);
      ctx.fillStyle = '#0a0918';
      for (const b of s.buildings) ctx.fillRect(b.x, h - b.h, b.w, b.h);
      ctx.fillStyle = '#fbbf24';
      for (const b of s.buildings)
        for (const win of b.windows) if (win.on !== mod(sec / 6 + win.p, 1) < 0.08) ctx.fillRect(win.x, win.y, 1, 1); // now and then a light flips
      ctx.fillStyle = 'rgba(150,170,255,0.45)';
      for (const d of s.rain) ctx.fillRect(mod(d.x - sec * d.v * 0.25, w) | 0, mod(d.y + sec * d.v, h) | 0, 1, 2);
    },
  },
  {
    id: 'embers',
    name: 'Embers',
    init: (w, h) => ({ sparks: many((w * h) / 90, () => ({ x: rand(0, w), y: rand(0, h), v: rand(4, 14), p: rand(0, 7) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      fillGradient(ctx, w, h, '#0c0606', '#3a1206');
      const colors = ['#9a3412', '#f97316', '#fde047']; // cooler as they rise
      const buckets = colors.map(() => []);
      for (const p of s.sparks) {
        const y = mod(p.y - sec * p.v, h);
        buckets[Math.min(2, ((y / h) * 3) | 0)].push(mod(p.x + Math.sin(sec * 0.8 + p.p) * 3, w) | 0, y | 0);
      }
      buckets.forEach((xy, i) => {
        ctx.fillStyle = colors[i];
        for (let j = 0; j < xy.length; j += 2) ctx.fillRect(xy[j], xy[j + 1], 1, 1);
      });
    },
  },
];

// Runs a wallpaper on the canvas at ~15 fps (plenty for pixel art, easy on phones) unless it asks for more. Returns
// set(id), which switches wallpaper (an unknown id gets the first) and returns the id in use. With reduced motion it
// paints one still frame.
function startWallpaper(canvas) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let wp, state, w, h, last = 0;
  const paint = () => wp.draw(ctx, w, h, still ? 4000 : performance.now(), state);
  const size = () => {
    w = canvas.width = Math.ceil(canvas.clientWidth / (wp.px ?? PX));
    h = canvas.height = Math.ceil(canvas.clientHeight / (wp.px ?? PX));
    state = wp.init(w, h);
  };
  const set = (next) => {
    wp = WALLPAPERS.find((x) => x.id === next) ?? WALLPAPERS[0];
    size();
    paint();
    return wp.id;
  };
  // The canvas is sized in lvh, so the phone's address bar showing and hiding does not reshuffle it.
  addEventListener('resize', () => {
    if (Math.ceil(canvas.clientWidth / (wp.px ?? PX)) === w && Math.ceil(canvas.clientHeight / (wp.px ?? PX)) === h) return;
    size();
    paint();
  });
  // The pointer is tracked over the whole page (the cards sit on top of the canvas). A finger counts only while down.
  const point = (e) => Object.assign(pointer, { x: (e.clientX * w) / canvas.clientWidth, y: (e.clientY * h) / canvas.clientHeight, on: true });
  addEventListener('pointermove', point, { passive: true });
  addEventListener('pointerdown', point, { passive: true });
  addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && (pointer.on = false));
  addEventListener('pointercancel', () => (pointer.on = false));
  document.documentElement.addEventListener('pointerleave', () => (pointer.on = false));
  const frame = (t) => {
    if (t - last >= (wp.frameMs ?? 66)) {
      last = t;
      paint();
    }
    requestAnimationFrame(frame); // the browser pauses this while the tab is hidden
  };
  if (!still) requestAnimationFrame(frame); // set() runs before the first frame
  return set;
}

function drawThumb(canvas, wp) {
  wp.draw(canvas.getContext('2d'), canvas.width, canvas.height, 4000, wp.init(canvas.width, canvas.height));
}
