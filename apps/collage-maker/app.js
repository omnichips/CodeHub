// Collage Maker. Everything happens on this device: photos are read into memory, drawn on one canvas, and
// exported from it. The work in progress is kept in this browser's IndexedDB so it can be continued later.
// The cover-fit maths is in cover.js (tested by the hub).
import { fit } from './cover.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = (d) => (d * Math.PI) / 180;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180; // degrees into -180..180
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const MAX_EDGE = 2400; // photos are shrunk to this on import (memory)
// ponytail: a filtered photo is drawn from a copy at most this big, so it is a little softer than an unfiltered
// one when zoomed far in. Raise it if that shows; each copy costs width*height*4 bytes.
const FILTER_EDGE = 1600;
const LIVE_EDGE = 700; // while a slider is moving
const MAX_ZOOM = 5;
const MIN_FRAME = 120; // smallest freeform frame side, canvas px
const HANDLE_HIT = 90; // how close to the resize dot a finger must land, canvas px
const SNAP = 24; // captions and stickers snap to a centre line this close, canvas px
const POP_MS = 280;
const SLIDE = 1080; // one Instagram slide is this wide
const ACCENT = '#e64980';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FONTS = [
  ['Sans', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ['Serif', 'Georgia, "Times New Roman", serif'],
  ['Mono', 'ui-monospace, Menlo, Consolas, monospace'],
  ['Rounded', 'ui-rounded, "Arial Rounded MT Bold", "Segoe UI", sans-serif'],
  ['Script', '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive'],
  ['Poster', 'Impact, Haettenschweiler, "Arial Narrow", sans-serif'],
];
const EMOJI = '😀 😂 🥰 😍 😎 🤩 🥳 😭 😅 🙌 👏 👍 🙏 💪 ✌️ 🤍 ❤️ 🧡 💛 💚 💙 💜 🖤 💕 ✨ ⭐ 🌟 🔥 🎉 🎂 🎈 🎁 🌸 🌹 🌻 🌈 ☀️ 🌙 ☁️ 🌊 🌴 🍀 🐶 🐱 🦋 🍕 🍔 🍦 ☕ 🍷 ✈️ 🏖️ 📍 📸 🎵 💯'.split(' ');
const SIZES = [
  { name: '4:5', w: 1080, h: 1350 },
  { name: '1:1', w: 1080, h: 1080 },
  { name: '9:16', w: 1080, h: 1920 },
  { name: '2 slides', w: 2 * SLIDE, h: 1350 },
  { name: '3 slides', w: 3 * SLIDE, h: 1350 },
];

// Layouts are data: cells in 0..1 of the area inside the padding. Gap and padding are applied when drawing.
const grid = (cols, rows) => Array.from({ length: cols * rows }, (_, i) => ({ x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows }));
const LAYOUTS = [
  { id: '2x2', name: '2 x 2', cells: grid(2, 2) },
  { id: '1x2', name: '2 stacked', cells: grid(1, 2) },
  { id: '2x1', name: '2 side by side', cells: grid(2, 1) },
  { id: '1x3', name: '3 stacked', cells: grid(1, 3) },
  { id: '3x1', name: '3 side by side', cells: grid(3, 1) },
  { id: '1+2', name: '1 large over 2 small', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, { x: 0, y: 0.6, w: 0.5, h: 0.4 }, { x: 0.5, y: 0.6, w: 0.5, h: 0.4 }] },
  { id: '2+1', name: '2 small over 1 large', cells: [{ x: 0, y: 0, w: 0.5, h: 0.4 }, { x: 0.5, y: 0, w: 0.5, h: 0.4 }, { x: 0, y: 0.4, w: 1, h: 0.6 }] },
  { id: '3x3', name: '3 x 3', cells: grid(3, 3) },
  { id: '1', name: '1 photo (a panorama across slides)', cells: grid(1, 1) },
];

const emptyCell = () => ({ photoId: null, transform: { scale: 1, rotate: 0, offsetX: 0, offsetY: 0, flip: false }, filters: { brightness: 1, contrast: 1, saturation: 1, bw: false } });
const NONE = { type: null, id: null };
const state = {
  canvas: { w: 1080, h: 1350 },
  layoutId: '2x2',
  style: { gap: 12, padding: 24, radius: 0, bg: { type: 'solid', c1: '#ffffff', c2: '#f783ac', angle: 135 } },
  cells: [],
  spare: [], // photos a smaller layout had no cell for; a bigger layout gets them back
  texts: [],
  stickers: [],
  free: false, // freeform: each cell has its own frame in frames[i] instead of the layout's rect
  frames: [], // { cx, cy, w, h, rotate, z } in canvas px
  photos: {}, // id -> ImageBitmap (or canvas)
  selection: NONE,
};
const blobs = {}; // id -> the picked file, kept to save the draft
let panel = null; // which sheet is open: layout | style | text | stickers | photo | export
let live = false; // a slider is being dragged: filters use a small copy
let adjust = 'frame'; // freeform: a drag moves the frame or the photo inside it
let seq = 0;
const uid = (p) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`; // unique across sessions (drafts)
const slides = () => Math.round(state.canvas.w / SLIDE);

const cv = $('#c'), view = cv.getContext('2d'), file = $('#file'), marks = $('#marks');

// ---------- saved draft (IndexedDB: 'draft' holds the snapshot, 'photos' the picked files by id) ----------
let dbp, saving = Promise.resolve(), saveFailed = false;
function store(name, mode, fn) {
  dbp ??= new Promise((ok, no) => {
    const r = indexedDB.open('collage-maker', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('photos');
      r.result.createObjectStore('draft');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp.then((db) => new Promise((ok, no) => {
    const t = db.transaction(name, mode), q = fn(t.objectStore(name));
    t.oncomplete = () => ok(q?.result);
    t.onerror = t.onabort = () => no(t.error);
  }));
}
const hasWork = () => state.cells.some((c) => c.photoId) || state.spare.length || state.texts.length || state.stickers.length;
// ponytail: an emptied collage is not saved, so removing everything and reopening brings the last one back.
function saveDraft(snapshot) {
  if (!hasWork()) return;
  const keep = new Set(Object.keys(state.photos));
  saving = saving
    .then(async () => {
      await store('draft', 'readwrite', (s) => s.put(snapshot, 'current'));
      const keys = await store('photos', 'readonly', (s) => s.getAllKeys());
      await store('photos', 'readwrite', (s) => keys.filter((k) => !keep.has(k)).forEach((k) => s.delete(k)));
      saveFailed = false;
    })
    .catch(() => (saveFailed = true));
  navigator.storage?.persist?.().catch(() => {});
}
async function resume() {
  const snapshot = await store('draft', 'readonly', (s) => s.get('current'));
  JSON.parse(snapshot).forEach((v, i) => v !== undefined && (state[KEYS[i]] = v));
  for (const id of new Set([...state.cells, ...state.spare].map((c) => c.photoId).filter(Boolean))) {
    try {
      const saved = await store('photos', 'readonly', (s) => s.get(id)), b = new Blob([saved.data], { type: saved.type });
      state.photos[id] = await loadPhoto(b);
      blobs[id] = b;
    } catch {} // a lost photo leaves its cell empty
  }
  state.cells = state.cells.map((c) => (c.photoId && !state.photos[c.photoId] ? emptyCell() : c));
  state.spare = state.spare.filter((c) => state.photos[c.photoId]);
  history = [];
  at = -1;
  state.cells.forEach((c, i) => c.photoId && pop(`cell:${c.photoId}`, i * 40));
  commit();
}

// ---------- undo / redo: snapshots of everything but the bitmaps ----------
const KEYS = ['canvas', 'layoutId', 'style', 'cells', 'spare', 'texts', 'stickers', 'free', 'frames'];
let history = [], at = -1;
function commit() {
  const s = JSON.stringify(KEYS.map((k) => state[k]));
  if (s !== history[at]) {
    history = [...history.slice(Math.max(0, at - 48), at + 1), s]; // 50 steps
    at = history.length - 1;
  }
  // free the photos no step of the history can bring back
  for (const id in state.photos) {
    if (!history.some((h) => h.includes(`"${id}"`))) {
      state.photos[id].close?.();
      delete state.photos[id];
      delete blobs[id];
    }
  }
  saveDraft(s);
  if (panel === 'export') prepare(); // the collage changed under an open export sheet
  refresh();
}
function travel(step) {
  if (!history[at + step]) return;
  at += step;
  JSON.parse(history[at]).forEach((v, i) => (state[KEYS[i]] = v));
  select(null);
  saveDraft(history[at]);
}

// ---------- geometry: a cell is a (possibly turned) rect around its centre ----------
const layout = () => LAYOUTS.find((l) => l.id === state.layoutId);
function rect(i) {
  if (state.free) return state.frames[i];
  const { w, h } = state.canvas, { gap, padding: p } = state.style, c = layout().cells[i];
  const iw = w - 2 * p, ih = h - 2 * p, half = gap / 2, e = 1e-6; // half a gap on every edge that touches another cell
  const x0 = p + c.x * iw + (c.x > e ? half : 0), x1 = p + (c.x + c.w) * iw - (c.x + c.w < 1 - e ? half : 0);
  const y0 = p + c.y * ih + (c.y > e ? half : 0), y1 = p + (c.y + c.h) * ih - (c.y + c.h < 1 - e ? half : 0);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, rotate: 0 };
}
const turn = (x, y, deg) => { const a = rad(deg); return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) }; };
const local = (r, x, y) => turn(x - r.cx, y - r.cy, -r.rotate);
const order = () => state.cells.map((_, i) => i).sort((a, b) => (state.free ? state.frames[a].z - state.frames[b].z : 0));
function cellAt(x, y) {
  const top = order().reverse().find((i) => { const r = rect(i), l = local(r, x, y); return Math.abs(l.x) <= r.w / 2 && Math.abs(l.y) <= r.h / 2; });
  return top ?? -1;
}
const placed = (i) => { const r = rect(i), img = state.photos[state.cells[i].photoId]; return { r, img, f: fit(img.width, img.height, r.w, r.h, state.cells[i].transform) }; };
// Write the pulled-back offset into the state, so a later drag starts from what is on screen.
function settle(i) {
  if (!state.cells[i]?.photoId) return;
  const { r, f } = placed(i), t = state.cells[i].transform;
  t.offsetX = f.dx / r.w;
  t.offsetY = f.dy / r.h;
}

// ---------- text and stickers ----------
const label = (it) => it.emoji ?? it.text;
const fontOf = (it) => (it.emoji ? `${it.size}px ${EMOJI_FONT}` : `600 ${it.size}px ${FONTS[it.font][1]}`);
function metrics(it) {
  view.font = fontOf(it);
  const lines = label(it).split('\n'), lh = it.size * 1.2;
  const w = Math.max(it.size * 0.6, ...lines.map((l) => view.measureText(l).width));
  return { lines, lh, w: w + it.size * 0.6, h: lines.length * lh + it.size * 0.3 };
}
function hit(x, y) {
  for (const type of ['sticker', 'text']) { // stickers are drawn on top, so they are hit first
    const list = state[`${type}s`];
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i], m = metrics(it), l = turn(x - it.x, y - it.y, -it.rotate);
      if (Math.abs(l.x) <= m.w / 2 && Math.abs(l.y) <= m.h / 2) return { type, id: it.id };
    }
  }
  const i = cellAt(x, y);
  return i < 0 ? null : { type: 'cell', id: i };
}
const selCell = () => (state.selection.type === 'cell' ? state.cells[state.selection.id] : undefined);
const itemOf = (t) => state[`${t.type}s`].find((it) => it.id === t.id);
const selItem = (type) => (state.selection.type === type ? itemOf(state.selection) : undefined);

// ---------- filters: per-pixel, because ctx.filter is unreliable on iOS Safari ----------
const filtered = new Map(), used = new Set(); // "photo|filters|live" -> canvas
function source(cell, small) {
  const img = state.photos[cell.photoId], f = cell.filters;
  if (f.brightness === 1 && f.contrast === 1 && f.saturation === 1 && !f.bw) return img;
  const key = [cell.photoId, f.brightness, f.contrast, f.saturation, f.bw, small].join('|');
  used.add(key);
  if (!filtered.has(key)) {
    const k = Math.min(1, (small ? LIVE_EDGE : FILTER_EDGE) / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const data = x.getImageData(0, 0, c.width, c.height), p = data.data, sat = f.bw ? 0 : f.saturation;
    for (let i = 0; i < p.length; i += 4) {
      const r = (p[i] * f.brightness - 128) * f.contrast + 128, g = (p[i + 1] * f.brightness - 128) * f.contrast + 128, b = (p[i + 2] * f.brightness - 128) * f.contrast + 128;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      p[i] = l + (r - l) * sat; // the array clamps to 0..255 itself
      p[i + 1] = l + (g - l) * sat;
      p[i + 2] = l + (b - l) * sat;
    }
    x.putImageData(data, 0, 0);
    filtered.set(key, c);
  }
  return filtered.get(key);
}

// ---------- pop-in motion (preview only): key -> start time ----------
const pops = new Map();
function pop(key, delay = 0, bounce = false) {
  if (!reduce.matches) pops.set(key, { t0: performance.now() + delay, bounce });
}
// How far in a pop is: { a: opacity, s: scale }, or null when nothing is popping.
function popAt(key) {
  const p = pops.get(key);
  if (!p) return null;
  const t = clamp((performance.now() - p.t0) / POP_MS, 0, 1), u = t - 1;
  if (p.bounce) return { a: Math.min(1, t * 3), s: 0.85 + 0.15 * (1 + 2.2 * u ** 3 + 1.2 * u ** 2) }; // a small overshoot
  const e = 1 - (1 - t) ** 4; // strong ease-out
  return { a: e, s: 0.94 + 0.06 * e };
}

// ---------- drawing: the preview and the export both come from here ----------
function shape(c, x, y, w, h, r) {
  c.beginPath();
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h); // ponytail: Safari before 16 gets square corners
}

function draw(c, preview) {
  const { w, h } = state.canvas, bg = state.style.bg, radius = state.style.radius;
  c.fillStyle = bg.c1;
  if (bg.type === 'gradient') {
    const dx = Math.sin(rad(bg.angle)), dy = -Math.cos(rad(bg.angle)), len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const gr = c.createLinearGradient(w / 2 - dx * len, h / 2 - dy * len, w / 2 + dx * len, h / 2 + dy * len);
    gr.addColorStop(0, bg.c1);
    gr.addColorStop(1, bg.c2);
    c.fillStyle = gr;
  }
  c.fillRect(0, 0, w, h);

  for (const i of order()) {
    const cell = state.cells[i], r = rect(i);
    if (r.w <= 0 || r.h <= 0) continue;
    if (!cell.photoId && !preview) continue;
    c.save();
    c.translate(r.cx, r.cy);
    c.rotate(rad(r.rotate));
    const p = preview && cell.photoId && popAt(`cell:${cell.photoId}`);
    if (p) {
      c.globalAlpha = p.a;
      c.scale(p.s, p.s);
    }
    if (preview && g?.swap && g.target.id === i) c.globalAlpha = 0.35; // lifted out
    shape(c, -r.w / 2, -r.h / 2, r.w, r.h, radius);
    if (!cell.photoId) { // the "+" on top is a breathing element over the canvas (#marks)
      c.fillStyle = 'rgba(127, 127, 127, 0.22)';
      c.fill();
    } else {
      const { img, f } = placed(i), t = cell.transform;
      c.clip();
      c.translate(f.dx, f.dy);
      c.rotate(rad(t.rotate));
      c.scale(t.flip ? -f.s : f.s, f.s);
      c.drawImage(source(cell, preview && live), -img.width / 2, -img.height / 2, img.width, img.height);
    }
    c.restore();
  }

  for (const it of [...state.texts, ...state.stickers]) {
    const m = metrics(it), p = preview && popAt(it.id);
    c.save();
    c.translate(it.x, it.y);
    c.rotate(rad(it.rotate));
    if (p) {
      c.globalAlpha = p.a;
      c.scale(p.s, p.s);
    }
    c.font = fontOf(it);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    if (it.look === 'box') {
      c.fillStyle = it.color2;
      shape(c, -m.w / 2, -m.h / 2, m.w, m.h, it.size * 0.25);
      c.fill();
    }
    m.lines.forEach((line, n) => {
      const y = (n - (m.lines.length - 1) / 2) * m.lh;
      if (it.look === 'outline') {
        c.strokeStyle = it.color2;
        c.lineWidth = it.size * 0.14;
        c.strokeText(line, 0, y);
      }
      if (!it.emoji) c.fillStyle = it.color;
      if (it.look === 'shadow') {
        c.shadowColor = 'rgba(0, 0, 0, 0.35)';
        c.shadowBlur = it.size * 0.12;
      }
      c.fillText(line, 0, y);
      c.shadowColor = 'transparent';
    });
    if (preview && it.id === state.selection.id) {
      c.strokeStyle = ACCENT;
      c.lineWidth = 5;
      c.setLineDash([16, 12]);
      c.strokeRect(-m.w / 2, -m.h / 2, m.w, m.h);
    }
    c.restore();
  }

  if (!preview) return;
  const line = (x0, y0, x1, y1, color, width, dash) => {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.setLineDash(dash);
    c.stroke();
    c.setLineDash([]);
  };
  for (let k = 1; k < slides(); k++) { // where the carousel will be cut
    line(k * SLIDE, 0, k * SLIDE, h, 'rgba(0, 0, 0, 0.35)', 8, []);
    line(k * SLIDE, 0, k * SLIDE, h, 'rgba(255, 255, 255, 0.95)', 4, [22, 14]);
  }
  if (g?.guideX !== undefined) line(g.guideX, 0, g.guideX, h, ACCENT, 4, [14, 10]);
  if (g?.guideY !== undefined) line(0, g.guideY, w, g.guideY, ACCENT, 4, [14, 10]);
  const mark = (i, width, handle) => {
    const r = rect(i);
    c.save();
    c.translate(r.cx, r.cy);
    c.rotate(rad(r.rotate));
    shape(c, -r.w / 2 + width / 2, -r.h / 2 + width / 2, r.w - width, r.h - width, radius - width / 2);
    c.strokeStyle = ACCENT;
    c.lineWidth = width;
    c.stroke();
    if (handle) { // freeform: drag this dot to resize
      c.beginPath();
      c.arc(r.w / 2, r.h / 2, 26, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      c.lineWidth = 8;
      c.stroke();
    }
    c.restore();
  };
  if (state.selection.type === 'cell') mark(state.selection.id, 8, state.free);
  if (g?.swap && g.over >= 0 && g.over !== g.target.id) mark(g.over, 18);
}

// The breathing "+" over each empty cell. Positions are % of the canvas, so they follow its size on screen.
function placeMarks() {
  const empty = state.cells.flatMap((c, i) => (c.photoId ? [] : [i])), { w, h } = state.canvas;
  while (marks.children.length > empty.length) marks.lastChild.remove();
  while (marks.children.length < empty.length) {
    const el = document.createElement('i');
    el.style.animationDelay = `${marks.children.length * 0.35}s`;
    marks.append(el);
  }
  empty.forEach((i, n) => {
    const r = rect(i), s = marks.children[n].style;
    s.left = `${(r.cx / w) * 100}%`;
    s.top = `${(r.cy / h) * 100}%`;
    s.width = `${((Math.min(r.w, r.h) * 0.2) / w) * 100}%`;
    s.transform = `translate(-50%, -50%) rotate(${r.rotate}deg)`;
  });
}
const fitMarks = new ResizeObserver(() => Object.assign(marks.style, { left: `${cv.offsetLeft}px`, top: `${cv.offsetTop}px`, width: `${cv.offsetWidth}px`, height: `${cv.offsetHeight}px` }));
fitMarks.observe(cv);
fitMarks.observe($('#stage')); // the canvas can move without changing size when the sheet opens

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    used.clear();
    draw(view, true);
    placeMarks();
    for (const [key, c] of filtered) {
      if (!used.has(key)) { // a filtered copy nothing draws any more
        c.width = 0;
        filtered.delete(key);
      }
    }
    const now = performance.now();
    for (const [key, p] of pops) if (now > p.t0 + POP_MS) pops.delete(key);
    if (pops.size) render();
  });
}

// ---------- controls ----------
const syncers = [];
// Ties an input to a value: moving it changes the value live, letting go makes an undo step.
function bind(id, get, put) {
  const el = $(id), key = el.type === 'checkbox' ? 'checked' : 'value';
  el.addEventListener('input', () => {
    put(el.type === 'range' ? +el.value : el[key]);
    live = el.type === 'range';
    render();
  });
  el.addEventListener('change', () => {
    live = false;
    commit();
  });
  syncers.push(() => {
    const v = get();
    if (v !== undefined && String(el[key]) !== String(v)) el[key] = v;
  });
}
const radios = (name, onPick) => $$(`[name="${name}"]`).forEach((el) => el.addEventListener('change', () => onPick(el.value)));
const check = (name, value) => $$(`[name="${name}"]`).forEach((el) => (el.checked = el.value === value));

function refresh() {
  const { w, h } = state.canvas, sel = state.selection.type, cell = selCell(), text = selItem('text');
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  document.documentElement.style.setProperty('--ratio', `${w} / ${h}`);
  $('#sheet').hidden = !panel;
  for (const p of $$('.panel')) p.hidden = p.dataset.panel !== panel;
  for (const b of $$('#tabs button')) b.setAttribute('aria-pressed', b.dataset.tab === panel);
  for (const b of $$('.thumb')) b.setAttribute('aria-pressed', !state.free && b.dataset.id === state.layoutId);
  for (const b of $$('.chip')) b.setAttribute('aria-pressed', b.textContent === SIZES.find((s) => s.w === w && s.h === h)?.name);
  for (const el of $$('.grad')) el.hidden = state.style.bg.type !== 'gradient';
  for (const el of $$('.free')) el.hidden = !state.free;
  check('bg', state.style.bg.type);
  check('adjust', adjust);
  check('look', text?.look);
  $('#free').checked = state.free;
  $('#undo').disabled = at <= 0;
  $('#redo').disabled = at >= history.length - 1;
  $('#add').hidden = state.cells.every((c) => c.photoId);
  $('#textEdit').hidden = sel !== 'text';
  $('#lookColor').hidden = !['outline', 'box'].includes(text?.look);
  $('#stickerEdit').hidden = sel !== 'sticker';
  $('#photoOnly').hidden = !cell?.photoId;
  $('#remove').hidden = !cell?.photoId;
  $('#replace').textContent = cell?.photoId ? 'Replace photo' : 'Add photo';
  $('#slidesNote').hidden = slides() < 2;
  $('#slidesNote').textContent = `Exports ${slides()} images, one per slide, in order.`;
  for (const sync of syncers) sync();
  render();
}

function select(t) {
  state.selection = t ? { ...t } : NONE;
  if (t) panel = { cell: 'photo', text: 'text', sticker: 'stickers' }[t.type];
  else if (panel === 'photo') panel = null;
  refresh();
}
function openPanel(name) {
  if (state.selection.type === 'cell') state.selection = NONE; // the photo sheet is making way
  panel = panel === name ? null : name;
  if (panel === 'export') prepare();
  refresh();
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- layouts, sizes, shuffle, freeform ----------
function setLayout(id) {
  const photos = [...state.cells.filter((c) => c.photoId), ...state.spare];
  state.layoutId = id;
  state.free = false;
  state.frames = [];
  const n = layout().cells.length;
  state.cells = Array.from({ length: n }, (_, i) => photos[i] ?? emptyCell());
  state.spare = photos.slice(n);
  state.selection = NONE;
  state.cells.forEach((c, i) => c.photoId && pop(`cell:${c.photoId}`, i * 40));
  commit();
}
function thumbs(host, onPick) {
  for (const [n, l] of LAYOUTS.entries()) {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.dataset.id = l.id;
    b.style.setProperty('--i', n);
    b.setAttribute('aria-label', l.name);
    b.innerHTML = `<span>${l.cells.map((c, k) => `<i style="--i:${k};left:${c.x * 100}%;top:${c.y * 100}%;width:${c.w * 100}%;height:${c.h * 100}%"></i>`).join('')}</span>`;
    b.addEventListener('click', () => onPick(l.id));
    host.append(b);
  }
}
function setSize(s) {
  const { w, h } = state.canvas;
  if (s.w === w && s.h === h) return;
  const sx = s.w / w, sy = s.h / h;
  for (const it of [...state.texts, ...state.stickers]) {
    it.x *= sx;
    it.y *= sy;
  }
  for (const f of state.frames) {
    f.cx *= sx;
    f.cy *= sy;
    f.w *= sx;
    f.h *= sy;
  }
  state.canvas = { w: s.w, h: s.h };
  commit();
}
for (const host of ['#pickerSizes', '#sizes']) {
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = s.name;
    b.addEventListener('click', () => setSize(s));
    $(host).append(b);
  }
}
thumbs($('#pickerLayouts'), (id) => {
  setLayout(id);
  $('#picker').hidden = true;
  $('#editor').hidden = false;
});
thumbs($('#layouts'), setLayout);

$('#shuffle').addEventListener('click', () => {
  const idx = state.cells.flatMap((c, i) => (c.photoId ? [i] : []));
  if (idx.length < 2) return toast('Add at least 2 photos to shuffle');
  const before = idx.map((i) => state.cells[i]);
  let after;
  do {
    after = [...before];
    for (let i = after.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [after[i], after[j]] = [after[j], after[i]];
    }
  } while (after.every((c, i) => c === before[i]));
  idx.forEach((ci, n) => {
    state.cells[ci] = after[n];
    pop(`cell:${after[n].photoId}`, n * 40);
  });
  state.selection = NONE;
  commit();
});

$('#free').addEventListener('change', () => {
  if (!$('#free').checked) return setLayout(state.layoutId); // back to the preset
  state.frames = state.cells.map((_, i) => ({ ...rect(i), z: i }));
  state.free = true;
  adjust = 'frame';
  commit();
  toast('Drag a frame to move it, the corner dot to resize');
});
const topZ = () => Math.max(0, ...state.frames.map((f) => f.z));
$('#addFrame').addEventListener('click', () => {
  const { w, h } = state.canvas, s = Math.min(w, h) * 0.4;
  state.cells.push(emptyCell());
  state.frames.push({ cx: w / 2, cy: h / 2, w: s, h: s * 1.25, rotate: 0, z: topZ() + 1 });
  state.selection = { type: 'cell', id: state.cells.length - 1 };
  panel = 'photo';
  commit();
});
$('#front').addEventListener('click', () => {
  state.frames[state.selection.id].z = topZ() + 1;
  commit();
});
$('#back').addEventListener('click', () => {
  state.frames[state.selection.id].z = Math.min(...state.frames.map((f) => f.z)) - 1;
  commit();
});
$('#delFrame').addEventListener('click', () => {
  state.cells.splice(state.selection.id, 1);
  state.frames.splice(state.selection.id, 1);
  state.selection = NONE;
  panel = null;
  commit();
});
radios('adjust', (v) => {
  adjust = v;
  refresh();
});

// ---------- photos in ----------
async function loadPhoto(f) {
  const img = new Image(), url = URL.createObjectURL(f);
  try {
    img.src = url;
    await img.decode(); // an <img> applies the camera's rotation for us
    const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    try {
      const bmp = await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      if (bmp.width <= w + 1) return bmp;
      bmp.close(); // an old browser ignored the resize
    } catch {}
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let pickFor = null; // a cell index when the picker is for that one cell
function pick(cell = null) {
  pickFor = cell;
  file.multiple = cell === null;
  file.click();
}
file.addEventListener('change', async () => {
  const files = [...file.files];
  file.value = '';
  if (!files.length) return;
  const slots = pickFor !== null ? [pickFor] : state.cells.flatMap((c, i) => (c.photoId ? [] : [i]));
  const cells = state.cells; // if the layout changes while photos load, they still land in these cells
  let failed = 0;
  // one at a time: decoding several big photos at once can run a phone out of memory
  for (const [n, f] of files.slice(0, slots.length).entries()) {
    try {
      const bmp = await loadPhoto(f), id = uid('p'), cell = cells[slots[n]];
      state.photos[id] = bmp;
      blobs[id] = f;
      // bytes, not the File itself: some Safari versions cannot keep a Blob in IndexedDB
      f.arrayBuffer().then((data) => store('photos', 'readwrite', (s) => s.put({ data, type: f.type }, id))).catch(() => {});
      cell.photoId = id;
      cell.transform = emptyCell().transform;
      pop(`cell:${id}`);
      render();
    } catch {
      failed++;
    }
  }
  commit();
  const extra = files.length - slots.length;
  if (failed) toast(`${failed} photo${failed === 1 ? '' : 's'} could not be opened`);
  else if (extra > 0) toast(`${extra} extra photo${extra === 1 ? '' : 's'} not used`);
});
$('#add').addEventListener('click', () => pick());

// ---------- gestures on the collage ----------
const pts = new Map(); // fingers down: pointerId -> position
let g = null; // the gesture in progress
let tapped; // set on release when the gesture was a plain tap; the click event then acts on it
let lastTap; // for double-tap
const at2 = (e) => {
  const b = cv.getBoundingClientRect();
  return { x: ((e.clientX - b.left) * state.canvas.w) / b.width, y: ((e.clientY - b.top) * state.canvas.h) / b.height, cx: e.clientX, cy: e.clientY };
};
const ghost = $('#ghost');
const moveGhost = (p) => (ghost.style.transform = `translate(${p.cx - 48}px, ${p.cy - 110}px)`);
function onHandle(p) {
  if (!state.free || state.selection.type !== 'cell') return false;
  const r = rect(state.selection.id), l = local(r, p.x, p.y);
  return Math.hypot(l.x - r.w / 2, l.y - r.h / 2) < HANDLE_HIT;
}
// Freeform resize from the corner dot: the opposite corner stays put.
function resizeFrame(i, p) {
  const f = state.frames[i], o = turn(-f.w / 2, -f.h / 2, f.rotate), ax = f.cx + o.x, ay = f.cy + o.y;
  const v = turn(p.x - ax, p.y - ay, -f.rotate);
  f.w = Math.max(MIN_FRAME, v.x);
  f.h = Math.max(MIN_FRAME, v.y);
  const c = turn(f.w / 2, f.h / 2, f.rotate);
  f.cx = ax + c.x;
  f.cy = ay + c.y;
  settle(i);
}

// Move, zoom (k) and turn (deg) whatever the gesture is on.
function apply(t, dx, dy, k, deg) {
  if (!t) return;
  const { w, h } = state.canvas;
  if (t.type === 'cell' && state.free && adjust === 'frame') {
    const f = state.frames[t.id], s = clamp(k, MIN_FRAME / Math.min(f.w, f.h), (3 * Math.max(w, h)) / Math.max(f.w, f.h));
    f.cx = clamp(f.cx + dx, 0, w);
    f.cy = clamp(f.cy + dy, 0, h);
    f.w *= s;
    f.h *= s;
    f.rotate = wrap(f.rotate + deg);
    settle(t.id);
  } else if (t.type === 'cell') {
    const cell = state.cells[t.id];
    if (!cell.photoId) return;
    const { r, f } = placed(t.id), tr = cell.transform, scale = clamp(tr.scale * k, 1, MAX_ZOOM), d = turn(dx, dy, -r.rotate);
    // zooming keeps the middle of the cell where it is
    tr.offsetX = ((f.dx * scale) / tr.scale + d.x) / r.w;
    tr.offsetY = ((f.dy * scale) / tr.scale + d.y) / r.h;
    tr.scale = scale;
    tr.rotate = wrap(tr.rotate + deg);
    settle(t.id);
  } else {
    // follow the finger exactly (raw), but show it snapped to a centre line when close to one
    const it = itemOf(t), raw = (g.raw ??= { x: it.x, y: it.y });
    raw.x = clamp(raw.x + dx, 0, w);
    raw.y = clamp(raw.y + dy, 0, h);
    const gx = [w / 2, ...Array.from({ length: slides() }, (_, i) => (i + 0.5) * SLIDE)].find((x) => Math.abs(raw.x - x) < SNAP);
    const gy = Math.abs(raw.y - h / 2) < SNAP ? h / 2 : undefined;
    if ((gx !== undefined && gx !== g.guideX) || (gy !== undefined && gy !== g.guideY)) navigator.vibrate?.(8);
    g.guideX = gx;
    g.guideY = gy;
    it.x = gx ?? raw.x;
    it.y = gy ?? raw.y;
    it.size = clamp(it.size * k, 24, 900);
    it.rotate = wrap(it.rotate + deg);
  }
}

cv.addEventListener('pointerdown', (e) => {
  if (pts.size >= 2) return;
  cv.setPointerCapture(e.pointerId);
  const p = at2(e);
  pts.set(e.pointerId, p);
  if (pts.size === 1) {
    if (onHandle(p)) {
      g = { resize: state.selection.id, moved: true };
      return;
    }
    const target = hit(p.x, p.y);
    g = { target, start: p, moved: false, multi: false, swap: false, over: -1 };
    if (target?.type === 'cell' && state.cells[target.id].photoId) {
      // held still for 350 ms: the photo lifts off, to be dropped on another cell
      g.timer = setTimeout(() => {
        const img = state.photos[state.cells[target.id].photoId], s = Math.max(192 / img.width, 192 / img.height);
        g.swap = true;
        navigator.vibrate?.(15);
        const gc = ghost.getContext('2d');
        gc.clearRect(0, 0, 192, 192);
        gc.drawImage(img, (192 - img.width * s) / 2, (192 - img.height * s) / 2, img.width * s, img.height * s);
        ghost.hidden = false;
        moveGhost(p);
        render();
      }, 350);
    }
  } else if (g && !g.swap && g.resize === undefined) {
    clearTimeout(g.timer);
    g.multi = true;
    // two fingers resize the selected caption or sticker wherever they land; otherwise what the first finger is on
    if (state.selection.type === 'text' || state.selection.type === 'sticker') {
      g.target = { ...state.selection };
      g.raw = null;
    }
  }
});

cv.addEventListener('pointermove', (e) => {
  const prev = pts.get(e.pointerId);
  if (!prev || !g) return;
  const p = at2(e);
  if (g.resize !== undefined) {
    pts.set(e.pointerId, p);
    resizeFrame(g.resize, p);
    return render();
  }
  if (!g.moved && !g.multi && Math.hypot(p.cx - g.start.cx, p.cy - g.start.cy) < 8) return; // still a tap or a long-press
  g.moved = true;
  clearTimeout(g.timer);
  if (g.swap) {
    pts.set(e.pointerId, p);
    moveGhost(p);
    g.over = cellAt(p.x, p.y);
  } else if (pts.size === 2) {
    const [a0, b0] = [...pts.values()];
    pts.set(e.pointerId, p);
    const [a1, b1] = [...pts.values()];
    const twist = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    const spread = Math.hypot(b1.x - a1.x, b1.y - a1.y) / (Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1);
    apply(g.target, (a1.x + b1.x - a0.x - b0.x) / 2, (a1.y + b1.y - a0.y - b0.y) / 2, spread, (Math.atan2(Math.sin(twist), Math.cos(twist)) * 180) / Math.PI);
  } else {
    pts.set(e.pointerId, p);
    apply(g.target, p.x - prev.x, p.y - prev.y, 1, 0);
  }
  render();
});

function release(e) {
  if (!pts.delete(e.pointerId) || !g || pts.size) return; // a finger still down carries on as a drag
  clearTimeout(g.timer);
  const { target, moved, multi, swap, over } = g;
  g = null;
  ghost.hidden = true;
  if (swap) {
    if (e.type === 'pointerup' && over >= 0 && over !== target.id) {
      [state.cells[target.id], state.cells[over]] = [state.cells[over], state.cells[target.id]];
      for (const i of [target.id, over]) if (state.cells[i].photoId) pop(`cell:${state.cells[i].photoId}`);
      state.selection = NONE;
      if (panel === 'photo') panel = null;
    }
    commit();
  } else if (moved || multi) commit();
  else if (e.type === 'pointerup') tapped = { target };
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function resetPhoto(i) {
  Object.assign(state.cells[i].transform, { scale: 1, rotate: 0, offsetX: 0, offsetY: 0 });
  pop(`cell:${state.cells[i].photoId}`);
  commit();
}
// Taps are handled on click, which every browser accepts as a reason to open the photo picker.
cv.addEventListener('click', () => {
  if (!tapped) return;
  const t = tapped.target, now = performance.now();
  tapped = undefined;
  const double = t?.type === 'cell' && lastTap?.id === t.id && now - lastTap.time < 320;
  lastTap = t?.type === 'cell' ? { id: t.id, time: now } : null;
  if (t?.type === 'cell' && !state.cells[t.id].photoId && !state.free) return pick(t.id);
  if (double && state.cells[t.id].photoId) {
    lastTap = null;
    return resetPhoto(t.id);
  }
  select(t);
});
$('#stage').addEventListener('pointerdown', (e) => {
  if (e.target === e.currentTarget) select(null); // a tap beside the collage
});

// ---------- top bar and tabs ----------
$('#undo').addEventListener('click', () => travel(-1));
$('#redo').addEventListener('click', () => travel(1));
$('#export').addEventListener('click', () => openPanel('export'));
$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('button')?.dataset.tab;
  if (tab) openPanel(tab);
});

// ---------- style ----------
bind('#gap', () => state.style.gap, (v) => (state.style.gap = v));
bind('#padding', () => state.style.padding, (v) => (state.style.padding = v));
bind('#radius', () => state.style.radius, (v) => (state.style.radius = v));
bind('#c1', () => state.style.bg.c1, (v) => (state.style.bg.c1 = v));
bind('#c2', () => state.style.bg.c2, (v) => (state.style.bg.c2 = v));
bind('#angle', () => state.style.bg.angle, (v) => (state.style.bg.angle = v));
radios('bg', (v) => {
  state.style.bg.type = v;
  commit();
});

// ---------- photo sheet ----------
bind('#zoom', () => selCell()?.transform.scale, (v) => {
  const t = selCell().transform;
  t.offsetX *= v / t.scale;
  t.offsetY *= v / t.scale;
  t.scale = v;
  settle(state.selection.id);
});
bind('#rotate', () => selCell()?.transform.rotate, (v) => {
  selCell().transform.rotate = v;
  settle(state.selection.id);
});
for (const k of ['brightness', 'contrast', 'saturation']) bind(`#${k}`, () => selCell() && Math.round(selCell().filters[k] * 100), (v) => (selCell().filters[k] = v / 100));
bind('#bw', () => selCell()?.filters.bw, (v) => (selCell().filters.bw = v));
$('#resetRotate').addEventListener('click', () => {
  selCell().transform.rotate = 0;
  settle(state.selection.id);
  commit();
});
$('#resetFilters').addEventListener('click', () => {
  selCell().filters = emptyCell().filters;
  commit();
});
$('#flip').addEventListener('click', () => {
  const t = selCell().transform;
  t.flip = !t.flip;
  commit();
});
$('#resetPhoto').addEventListener('click', () => resetPhoto(state.selection.id));
$('#replace').addEventListener('click', () => pick(state.selection.id));
$('#remove').addEventListener('click', () => {
  state.cells[state.selection.id] = emptyCell();
  if (!state.free) {
    state.selection = NONE;
    panel = null;
  }
  commit();
});
$('#closePhoto').addEventListener('click', () => select(null));

// ---------- text ----------
for (const [i, [name]] of FONTS.entries()) $('#font').append(new Option(name, i));
bind('#textValue', () => selItem('text')?.text, (v) => (selItem('text').text = v));
bind('#font', () => selItem('text')?.font, (v) => (selItem('text').font = +v));
bind('#size', () => selItem('text') && Math.round(selItem('text').size), (v) => (selItem('text').size = v));
bind('#color', () => selItem('text')?.color, (v) => (selItem('text').color = v));
bind('#color2', () => selItem('text')?.color2, (v) => (selItem('text').color2 = v));
radios('look', (v) => {
  selItem('text').look = v;
  commit();
});
$('#addText').addEventListener('click', () => {
  const t = { id: uid('t'), text: 'Your text', font: 0, size: 96, color: '#ffffff', color2: '#000000', look: 'shadow', x: state.canvas.w / 2, y: state.canvas.h / 2, rotate: 0 };
  state.texts.push(t);
  state.selection = { type: 'text', id: t.id };
  pop(t.id, 0, true);
  commit();
  $('#textValue').select(); // typing replaces the placeholder words
});

// ---------- stickers ----------
for (const emoji of EMOJI) {
  const b = document.createElement('button');
  b.textContent = emoji;
  b.addEventListener('click', () => {
    const n = state.stickers.length % 5; // a few added in a row do not hide each other
    const s = { id: uid('s'), emoji, size: 180, x: state.canvas.w / 2 + n * 40, y: state.canvas.h / 2 + n * 40, rotate: 0 };
    state.stickers.push(s);
    state.selection = { type: 'sticker', id: s.id };
    pop(s.id, 0, true);
    commit();
  });
  $('#emoji').append(b);
}
for (const [button, type] of [['#delText', 'text'], ['#delSticker', 'sticker']]) {
  $(button).addEventListener('click', () => {
    state[`${type}s`] = state[`${type}s`].filter((it) => it.id !== state.selection.id);
    state.selection = NONE;
    commit();
  });
}

// ---------- export: one file, or one per slide for a carousel ----------
async function output() {
  const { w, h } = state.canvas, n = slides(), jpg = $('#jpg').checked, type = jpg ? 'image/jpeg' : 'image/png';
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  draw(full.getContext('2d'), false); // full size, no outlines, guides or placeholders
  const d = new Date(), p = (v) => String(v).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const files = [];
  for (let i = 0; i < n; i++) {
    let c = full;
    if (n > 1) {
      c = document.createElement('canvas');
      c.width = SLIDE;
      c.height = h;
      c.getContext('2d').drawImage(full, i * SLIDE, 0, SLIDE, h, 0, 0, SLIDE, h);
    }
    const blob = await new Promise((done) => c.toBlob(done, type, $('#quality').value / 100));
    if (c !== full) c.width = 0;
    files.push(new File([blob], `collage-${stamp}${n > 1 ? `-${i + 1}` : ''}.${jpg ? 'jpg' : 'png'}`, { type }));
  }
  full.width = 0;
  return files;
}
// The files are made when the export sheet opens (and again when the collage or format changes), so a tap on
// Share / Save to Photos opens the share menu at once: Safari refuses it if the tap was more than a moment ago.
let ready = null;
const prepare = () => (ready = output());
function download(files) {
  files.forEach((f, i) => setTimeout(() => { // spaced out: browsers drop downloads fired at the same moment
    const url = URL.createObjectURL(f);
    Object.assign(document.createElement('a'), { href: url, download: f.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, i * 400));
  toast(files.length > 1 ? `Saved ${files.length} images` : 'Saved');
}
async function share(done) {
  try {
    const files = await (ready ?? prepare());
    if (!navigator.canShare?.({ files })) return toast('Sharing did not work here.');
    await navigator.share({ files });
    toast(done);
  } catch (err) {
    if (err.name !== 'AbortError') toast('Sharing did not work here.'); // cancelling says nothing
  }
}
// iPhone: a web page cannot write to Photos itself, and a download lands in Files. The share menu's
// "Save Image" puts it straight in Photos, so there Save opens that menu.
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let canShareFiles = false;
try {
  canShareFiles = !!navigator.canShare?.({ files: [new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })] });
} catch {}
const toPhotos = ios && canShareFiles;
$('#share').hidden = !canShareFiles || toPhotos; // on iPhone the one button does both
if (toPhotos) {
  $('#save').textContent = 'Save to Photos';
  $('#save').classList.add('primary');
  $('#saveNote').hidden = false;
}
$('#save').addEventListener('click', async () => (toPhotos ? share('Saved') : download(await (ready ?? prepare()))));
$('#share').addEventListener('click', () => share('Shared'));
radios('format', () => {
  $('#qualityRow').hidden = !$('#jpg').checked;
  prepare();
});
$('#quality').addEventListener('input', () => ($('#qualityValue').textContent = $('#quality').value));
$('#quality').addEventListener('change', prepare);

// ---------- opening screen: continue the saved collage, install ----------
const openEditor = () => {
  $('#picker').hidden = true;
  $('#editor').hidden = false;
};
store('draft', 'readonly', (s) => s.get('current')).then((s) => s && ($('#resume').hidden = false)).catch(() => {});
$('#continue').addEventListener('click', async () => {
  $('#continue').disabled = true;
  try {
    await resume();
    openEditor();
  } catch {
    toast('The saved collage could not be opened');
    $('#resume').hidden = true;
  }
});
$('#startNew').addEventListener('click', () => {
  $('#resume').hidden = true;
  store('draft', 'readwrite', (s) => s.clear()).catch(() => {});
  store('photos', 'readwrite', (s) => s.clear()).catch(() => {});
});

// Add to Home Screen. Android/Chrome offers a real prompt; iPhone Safari has none, so we explain the Share menu.
(() => {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return; // already installed
  const btn = $('#install'), hint = $('#installHint');
  let prompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    btn.hidden = false;
  });
  addEventListener('appinstalled', () => (btn.hidden = hint.hidden = true));
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      prompt = null;
      btn.hidden = true;
    } else {
      hint.textContent = 'In Safari, tap the Share button, then "Add to Home Screen".';
      hint.hidden = false;
    }
  });
})();

// ---------- page ----------
addEventListener('beforeunload', (e) => {
  if (!saveFailed || !hasWork()) return; // saved work can be continued, so only warn when saving failed
  e.preventDefault();
  e.returnValue = '';
});
// iPhone: the keyboard covers the bottom of the page instead of resizing it, so keep the page as tall as what shows.
window.visualViewport?.addEventListener('resize', () => {
  document.body.style.height = `${visualViewport.height}px`;
  scrollTo(0, 0);
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

refresh();
