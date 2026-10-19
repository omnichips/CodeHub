// The skill tree, as requisitions: one category at a time, a sheet clipped to a board on the cork wall, its skills
// pixel-art cards pinned to it left to right as a tree: Command on the left, each node's upgrades in the column after
// it, joined by red string (solid once bought, dotted while it can be, faint while locked). Drag to look around, pinch
// or scroll to zoom, tap a card to see it on the note at the bottom and buy its next level (most take up to 3): the
// note is stamped APPROVED. Some also need other cards fully bought first (a new soldier only his parent). A soldier's
// card has an eye: a demo of him fighting. The chips are a pile of tokens up top, counting down as they are spent.
import type Phaser from 'phaser';
import { icon } from '../art/atlas.ts';
import { persist, profile } from '../meta/profile.ts';
import { NODE, NODES, level, missing, nextCost, state, type Category, type Node } from '../meta/progress.ts';
import { UNITS, type UnitKind } from '../sim/world.ts';
import { Pen } from '../story/draw.ts';
import { stopWatching, watch } from './demo.ts';
import { el } from './hud.ts';
import { CARD, chipStack, corkTile, indexTab, inkStamp, noteTag, pixelButton, pixelText, sheetTile, skillCard } from './paper.ts';
import { play } from './sound.ts';

const CATS: [Category, string, string, string][] = [['soldiers', 'Soldiers', '#d9c55a', '#b8a440'], ['structures', 'Build', '#9ad0e0', '#7ab4c8'], ['usables', 'Strikes', '#e59aa6', '#c97a87'], ['base', 'Base', '#b8d89a', '#94b878']];
const ROOT = 'command'; // every category hangs off it, so it shows in all of them
const CARD_W = CARD.W * 2, CARD_H = CARD.H * 2, COL = CARD_W + 52, ROW = CARD_H + 14, PAD = 40; // px on the plane (a card's art at 2×)
const HEAD = 72; // px of the sheet over the first row: its heading
const TAP = 8; // px a pointer may wander and still count as a tap
const TOP = 70, BOTTOM = 96; // px the bar and the note cover
const READABLE = 0.85; // the smallest zoom the tree opens at: the names on the cards still read
const SVG = 'http://www.w3.org/2000/svg';
let cat: Category = 'soldiers'; // the tab last looked at, kept while the game runs

/** The soldier a node gives (its unlock, or one more of him), if it gives one. */
const soldierOf = (n: Node) => n.effects.map((e) => e.unlock ?? e.add).find((id): id is UnitKind => !!id && id in UNITS && id !== 'turret');

/** Where each card of a category goes: its depth is the column, and a parent sits level with the middle of its
 *  children, so no two lines cross. */
function layout(c: Category) {
  const kids = new Map<string, Node[]>(), at = new Map<string, { x: number; y: number }>();
  for (const n of NODES) if (n.parent && n.cat === c) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  let row = 0;
  const place = (id: string, col: number): number => {
    const ks = kids.get(id) ?? [], rows = ks.map((k) => place(k.id, col + 1));
    const r = rows.length ? (rows[0] + rows.at(-1)!) / 2 : row++;
    at.set(id, { x: PAD + col * COL, y: PAD + r * ROW });
    return r;
  };
  place(ROOT, 0);
  return { at, kids, w: Math.max(...[...at.values()].map((p) => p.x)) + CARD_W + PAD, h: Math.max(...[...at.values()].map((p) => p.y)) + CARD_H + PAD };
}

export function skillWeb(scene: Phaser.Scene, root: HTMLElement, back: () => void) {
  const save = profile.save, icons = new Map<string, string>();
  const pic = (frame: string) => icons.get(frame) ?? icons.set(frame, icon(scene, frame)).get(frame)!;
  let selected: Node | undefined, shape = layout(cat);

  // The chips, a pile of tokens; spent, the count runs down to what is left.
  const pile = el('canvas', { width: 150, height: 24, ariaHidden: 'true' }), pilePen = new Pen(pile.getContext('2d')!);
  const chips = el('span', { className: 'chips', role: 'status' }, pile);
  let shown = save.chips, counting = 0;
  const count = () => {
    cancelAnimationFrame(counting);
    const from = shown, to = save.chips, t0 = performance.now();
    chips.ariaLabel = `${to} chips`;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 600);
      shown = Math.round(from + (to - from) * (1 - (1 - u) ** 3));
      chipStack(pilePen, shown);
      if (u < 1 && pile.isConnected) counting = requestAnimationFrame(step);
    };
    if (from === to) chipStack(pilePen, to); else counting = requestAnimationFrame(step);
  };
  const tabs = CATS.map(([c, label, col, dark]) => { const [w, h, d] = indexTab(label.toUpperCase(), col, dark, () => cat === c); const b = pixelButton(label, w, h, d, () => { if (c === cat) return; cat = c; selected = undefined; draw(); fit(); }, 'tab'); return b; });
  const [bw, bh, bd] = noteTag('BACK', '#c9a86a', '#9c7f48', '#2e2a22');
  const svg = document.createElementNS(SVG, 'svg');
  const sheet = el('div', { className: 'sheet' }), heading = el('div', { className: 'heading' }), halo = el('div', { className: 'halo' });
  const plane = el('div', { className: 'plane' });
  const view = el('div', { className: 'view' }, plane);
  halo.style.setProperty('--cork', `url(${corkTile()})`);
  sheet.style.backgroundImage = `url(${sheetTile()})`;
  const info = el('div', { className: 'info' });
  info.style.setProperty('--torn', `url(${tornEdge()})`);
  const demo = el('div', { className: 'demo', hidden: true });
  const close = () => { demo.hidden = true; stopWatching(); scene.game.loop.wake(); }; // the menu's own game rests while a demo runs, and wakes after
  root.replaceChildren(el('div', { className: 'web' },
    el('div', { className: 'top' }, pixelButton('Back', bw, bh, bd, () => { close(); back(); }, 'tag'), chips, el('div', { className: 'tabs' }, ...tabs)), view, info, demo));
  addEventListener('keydown', function esc(e) {
    if (!root.contains(demo)) return removeEventListener('keydown', esc);
    if (e.key === 'Escape' && !demo.hidden) close();
  });

  const lines = new Map<string, SVGPathElement>(), cards = new Map<string, HTMLButtonElement>(), pens = new Map<string, Pen>();
  /** Red string from one card's right side to another's left, sagging between them. */
  const string = (x1: number, y1: number, x2: number, y2: number) => {
    const path = document.createElementNS(SVG, 'path'), gap = (x2 - x1) / 2, sag = 8 + Math.abs(y2 - y1) * 0.06;
    path.setAttribute('d', `M${x1} ${y1}C${x1 + gap} ${y1 + sag} ${x2 - gap} ${y2 + sag} ${x2} ${y2}`);
    return path;
  };
  /** The cards and strings of the category on show, on its requisitions sheet. */
  function draw() {
    shape = layout(cat);
    lines.clear();
    cards.clear();
    pens.clear();
    svg.replaceChildren();
    svg.setAttribute('width', String(shape.w));
    svg.setAttribute('height', String(shape.h));
    plane.style.width = `${shape.w}px`;
    plane.style.height = `${shape.h}px`;
    // The sheet the cards are pinned to, clipped to its board: the form's heading over them.
    Object.assign(sheet.style, { left: '0px', top: `${-HEAD}px`, width: `${shape.w}px`, height: `${shape.h + HEAD}px` });
    // The cork wall round it, going to black away from it (index.html, .halo).
    Object.assign(halo.style, { left: `${-shape.w / 2}px`, top: `${-HEAD - (shape.h + HEAD) / 2}px`, width: `${shape.w * 2}px`, height: `${(shape.h + HEAD) * 2}px` });
    heading.replaceChildren(pixelText('REQUISITIONS', '#2e2a22', 4), pixelText(`Form 27 · ${CATS.find(([c]) => c === cat)![1]}`, '#7a6a48', 2));
    heading.style.top = `${-HEAD + 26}px`;
    for (const [id, p] of shape.at) {
      const n = NODE.get(id)!, parent = n.parent && shape.at.get(n.parent);
      if (parent) {
        // Out of the parent's right side, across the gap between the columns, into the child's left side.
        const path = string(parent.x + CARD_W - 6, parent.y + CARD_H / 2, p.x + 4, p.y + CARD_H / 2);
        svg.append(path);
        lines.set(id, path);
      }
      const cv = el('canvas', { width: CARD.W, height: CARD.H, ariaHidden: 'true' });
      pens.set(id, new Pen(cv.getContext('2d')!));
      const b = el('button', { type: 'button', className: 'node', ariaLabel: n.name }, cv, el('img', { src: pic(n.icon), alt: '' }));
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      b.onclick = (e) => {
        if (e.detail !== 0 && travel > TAP) return; // the end of a drag, not a tap
        ripple(b, e);
        selected = n;
        refresh();
      };
      // A mouse resting on a card lights the way back to Command.
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') trail(n, true); };
      b.onpointerleave = () => trail(n, false);
      cards.set(id, b);
    }
    // A card it needs besides its parent, in an earlier column, joins the same way (into the line from its parent). One
    // in the same or a later column is only named on the card.
    joins.length = 0;
    for (const [id, p] of shape.at)
      for (const from of NODE.get(id)!.needs ?? []) {
        const q = shape.at.get(from);
        if (!q || from === NODE.get(id)!.parent || q.x + CARD_W > p.x) continue;
        const path = string(q.x + CARD_W - 6, q.y + CARD_H / 2, p.x + 4, p.y + CARD_H / 2);
        svg.prepend(path);
        joins.push({ to: id, path });
      }
    plane.replaceChildren(halo, sheet, heading, svg, ...cards.values());
    refresh();
  }
  const joins: { to: string; path: SVGPathElement }[] = [];

  function trail(n: Node, on: boolean) {
    for (const k of n.needs ?? []) cards.get(k)?.classList.toggle('trail', on); // what it needs, wherever it is
    for (const j of joins) if (j.to === n.id) j.path.classList.toggle('trail', on);
    for (let k: Node | undefined = n; k; k = k.parent ? NODE.get(k.parent) : undefined) {
      cards.get(k.id)?.classList.toggle('trail', on && k !== n);
      lines.get(k.id)?.classList.toggle('trail', on);
    }
  }

  /** A ring spreading out from where the card was pressed. */
  function ripple(b: HTMLElement, e: MouseEvent) {
    const r = b.getBoundingClientRect(), dot = el('i', { className: 'ripple' }), z = r.width / CARD_W || 1;
    dot.style.left = `${e.detail ? (e.clientX - r.left) / z : CARD_W / 2}px`;
    dot.style.top = `${e.detail ? (e.clientY - r.top) / z : CARD_H / 2}px`;
    dot.onanimationend = () => dot.remove();
    b.append(dot);
  }

  function refresh() {
    const owned = save.skills;
    count();
    tabs.forEach((t, k) => t.setAttribute('aria-pressed', String(CATS[k][0] === cat)));
    for (const [id, b] of cards) {
      const n = NODE.get(id)!, s = state(owned, id), lv = level(owned, id), cost = nextCost(owned, id), afford = s === 'open' && save.chips >= cost;
      b.classList.remove('owned', 'open', 'locked');
      b.classList.add(s);
      b.classList.toggle('picked', n === selected);
      const status = s === 'locked' ? (n.parent && level(owned, n.parent) > 0 ? `needs ${missing(owned, id).length} more` : 'locked') : `${cost} chips`;
      b.ariaLabel = `${n.name}: ${s === 'owned' ? 'owned' : status}`;
      skillCard(pens.get(id)!, { name: n.name, status, lv, max: n.max, state: s, afford, picked: n === selected });
      lines.get(id)?.setAttribute('class', `${s}${lines.get(id)!.classList.contains('trail') ? ' trail' : ''}`);
    }
    for (const j of joins) j.path.setAttribute('class', `${state(owned, j.to)}${j.path.classList.contains('trail') ? ' trail' : ''}`);
    const n = selected;
    if (!n) return info.replaceChildren(el('p', {}, 'Tap a skill to see it. Drag to look around; pinch or scroll to zoom.'));
    const s = state(owned, n.id), lv = level(owned, n.id), cost = nextCost(owned, n.id), short = cost - save.chips, next = n.max > 1 ? `level ${lv + 1}` : 'it';
    // What it takes, on a post-it: yellow to press, grey while it cannot be bought.
    const can = s === 'open' && short <= 0;
    const label = s === 'owned' ? (n.max > 1 ? 'ALL LEVELS ISSUED' : 'ISSUED') : s === 'locked' ? `NEEDS ${list([...(level(owned, n.parent!) ? [] : [n.parent!]), ...missing(owned, n.id)]).toUpperCase()}`
      : short > 0 ? `${cost} CHIPS (${short} SHORT)` : `SPEND ${cost} CHIPS`;
    const [tw, th, td] = can ? noteTag(label, '#e0cc62', '#cbb84e', '#2e2a22') : noteTag(label, '#b8b3a4', '#9c9787', '#4a463b');
    const buy = pixelButton(can ? `Buy ${next}: ${cost} chips` : label.toLowerCase(), tw, th, td, () => {
      if (state(save.skills, n.id) !== 'open' || save.chips < cost) return;
      save.chips -= cost;
      save.skills[n.id] = lv + 1;
      persist();
      refresh();
      bought(n, cost);
    }, 'buy');
    buy.disabled = !can;
    const levels = (n.max > 1 ? ` Level ${lv} of ${n.max}.` : '') + (n.needs ? ` Needs ${list(n.needs)} fully bought.` : '');
    const unit = soldierOf(n);
    const eye = unit && el('button', { type: 'button', className: 'eye', title: `Watch a ${UNITS[unit].name} fight`, ariaLabel: `Watch a ${UNITS[unit].name} fight`, onclick: () => show(unit) }, eyeIcon());
    const x = el('button', { type: 'button', className: 'x', textContent: '✕', title: 'Close', ariaLabel: 'Close', onclick: deselect });
    info.replaceChildren(el('img', { src: pic(n.icon), alt: '' }), ...(eye ? [eye] : []), el('div', {}, el('b', {}, n.name), el('p', {}, n.desc + levels)), buy, x);
  }

  function deselect() { if (!selected) return; selected = undefined; refresh(); }

  /** Just bought: APPROVED stamped on the note with a thud, the card pops, the chips spent float up off it, the strings
   *  to what it opened draw in. */
  function bought(n: Node, cost: number) {
    const ok = inkStamp('APPROVED', 3);
    ok.classList.add('approved');
    info.append(ok);
    play('thud', 0.6);
    const b = cards.get(n.id)!;
    b.classList.remove('bought');
    void b.offsetWidth; // restarts the animation
    b.classList.add('bought');
    const spent = el('i', { className: 'spent', textContent: `-${cost}` }), p = shape.at.get(n.id)!;
    spent.style.left = `${p.x + CARD_W - 34}px`;
    spent.style.top = `${p.y - 6}px`;
    spent.onanimationend = () => spent.remove();
    plane.append(spent);
    chips.classList.remove('spend');
    void chips.offsetWidth;
    chips.classList.add('spend');
    for (const k of shape.kids.get(n.id) ?? []) lines.get(k.id)?.classList.add('drawn');
  }

  /** The soldier fighting on a little street of his own, round after round, until closed. */
  function show(unit: UnitKind) {
    const screen = el('div', { className: 'screen' });
    demo.replaceChildren(el('div', { className: 'box', role: 'dialog', ariaLabel: `${UNITS[unit].name} demo` },
      el('div', { className: 'bar' }, el('b', {}, UNITS[unit].name), el('span', {}, 'Watching him hold a street'), el('button', { type: 'button', textContent: 'Close', onclick: close })),
      screen, el('p', {}, NODE.get(unit)?.desc ?? '')));
    demo.onclick = (e) => { if (e.target === demo) close(); };
    demo.hidden = false;
    scene.game.loop.sleep(); // two games drawing at once on a phone is a lot of memory and heat: the one behind the tree waits
    watch(unit, screen);
  }

  // ---- Pan and zoom: the plane is moved with one CSS transform ----
  const v = { x: 0, y: 0, z: 1 };
  const apply = () => {
    clamp();
    plane.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
      };
  /** No farther out than the whole board fits the screen (between the bar and the note), no farther in than 2.5×. */
  const minZoom = () => Math.min(READABLE, (view.clientWidth - 24) / (shape.w + 28), (view.clientHeight - TOP - BOTTOM) / (shape.h + HEAD + 40));
  /** The board never leaves the screen: smaller than the room, it stays inside it; bigger, its edges cannot be pulled in
   *  past the room's (on a phone too, where the room is small). */
  function clamp() {
    const w = view.clientWidth, h = view.clientHeight, l = -14 * v.z, r = (shape.w + 14) * v.z, t = (-HEAD - 30) * v.z, b = (shape.h + 14) * v.z;
    const fit = (at: number, lo: number, hi: number, min: number, max: number) => (hi - lo <= max - min ? Math.max(min - lo, Math.min(max - hi, at)) : Math.min(min - lo, Math.max(max - hi, at)));
    v.x = fit(v.x, l, r, 12, w - 12);
    v.y = fit(v.y, t, b, TOP, h - BOTTOM);
  }
  const zoomAt = (sx: number, sy: number, z: number) => {
    z = Math.max(minZoom(), Math.min(2.5, z));
    v.x = sx - ((sx - v.x) / v.z) * z;
    v.y = sy - ((sy - v.y) / v.z) * z;
    v.z = z;
    apply();
  };
  /** Frames the whole tree of the tab if it fits big enough to read; else the cards you can buy next, at a size you
   *  can read, from their first column (or their top) when even they do not fit. */
  function fit() {
    const w = view.clientWidth, h = view.clientHeight - TOP - BOTTOM, owned = save.skills, all = [...shape.at.keys()];
    const box = (ids: string[]) => {
      const ps = ids.map((id) => shape.at.get(id)!);
      return [Math.min(...ps.map((p) => p.x)), Math.max(...ps.map((p) => p.x)) + CARD_W, Math.min(...ps.map((p) => p.y)), Math.max(...ps.map((p) => p.y)) + CARD_H];
    };
    const zoom = ([x0, x1, y0, y1]: number[]) => Math.min(w / (x1 - x0 + 40), h / (y1 - y0 + 40));
    const open = all.filter((id) => state(owned, id) === 'open');
    const [x0, x1, y0, y1] = zoom(box(all)) >= READABLE || !open.length ? box(all) : box(open);
    v.z = Math.max(READABLE, Math.min(1.2, zoom([x0, x1, y0, y1])));
    v.x = (x1 - x0 + 40) * v.z <= w ? w / 2 - ((x0 + x1) / 2) * v.z : 20 - x0 * v.z;
    v.y = (y1 - y0 + 40) * v.z <= h ? TOP + h / 2 - ((y0 + y1) / 2) * v.z : TOP + 20 - y0 * v.z;
    apply();
  }

  const pts = new Map<number, { x: number; y: number }>();
  let travel = 0;
  view.addEventListener('pointerdown', (e) => {
    if (!pts.size) travel = 0;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  view.addEventListener('pointermove', (e) => {
    const was = pts.get(e.pointerId);
    if (!was) return;
    const r = view.getBoundingClientRect(), now = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      v.x += now.x - was.x;
      v.y += now.y - was.y;
      travel += Math.abs(now.x - was.x) + Math.abs(now.y - was.y);
      apply();
    } else {
      const other = [...pts].find(([id]) => id !== e.pointerId)![1], d0 = Math.hypot(was.x - other.x, was.y - other.y), d1 = Math.hypot(now.x - other.x, now.y - other.y);
      if (d0 > 0) zoomAt((now.x + other.x) / 2 - r.left, (now.y + other.y) / 2 - r.top, (v.z * d1) / d0);
      travel = Infinity;
    }
    // Once it is a drag, keep the pointer here, so the card it started on does not take it as a tap.
    if (travel > TAP && !view.hasPointerCapture(e.pointerId)) view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, now);
  });
  // A tap on the empty space around the cards (not a drag) closes the description.
  view.addEventListener('click', (e) => { if (travel <= TAP && !(e.target as Element).closest('.node')) deselect(); });
  const lift = (e: PointerEvent) => pts.delete(e.pointerId);
  view.addEventListener('pointerup', lift);
  view.addEventListener('pointercancel', lift);
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, v.z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  draw();
  fit();
}

/** The note's torn top edge, as pixels: the paper reaching up a pixel or three, raggedly, as an image URL. */
function tornEdge() {
  const cv = el('canvas', { width: 128, height: 4 }), g = cv.getContext('2d')!;
  g.fillStyle = '#e9e2cc';
  for (let x = 0, up = 2; x < 128; x++) { if (Math.sin(x * 12.9898) * 43758.5453 % 1 > 0.35) up = Math.max(0, Math.min(4, up + (Math.sin(x * 78.233) > 0 ? 1 : -1))); g.fillRect(x, 4 - up, 1, up); }
  return cv.toDataURL();
}

/** 'A', 'A and B', 'A, B and C': the names of nodes. */
const list = (ids: string[]) => ids.map((id) => NODE.get(id)!.name).join(', ').replace(/, ([^,]*)$/, ' and $1');

/** An open eye, drawn in the text colour. */
function eyeIcon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/>';
  return s;
}
