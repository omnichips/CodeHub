// The skill tree: one category at a time, laid out left to right as a tree of cards: Command on the left, each node's
// upgrades in the column after it, joined by square-cornered lines. Drag to look around, pinch or scroll to zoom, tap
// a card to see it and buy its next level (most take up to 3). A soldier's card has an eye: a demo of him fighting.
import type Phaser from 'phaser';
import { icon } from '../art/atlas.ts';
import { persist, profile } from '../meta/profile.ts';
import { NODE, NODES, level, nextCost, state, type Category, type Node } from '../meta/progress.ts';
import { UNITS, type UnitKind } from '../sim/world.ts';
import { stopWatching, watch } from './demo.ts';
import { el } from './hud.ts';

const CATS: [Category, string][] = [['soldiers', 'Soldiers'], ['structures', 'Build'], ['usables', 'Strikes'], ['base', 'Base']];
const ROOT = 'command'; // every category hangs off it, so it shows in all of them
const CARD_W = 176, CARD_H = 46, COL = 216, ROW = 56, PAD = 40; // px on the plane
const TAP = 8; // px a pointer may wander and still count as a tap
const TOP = 60, BOTTOM = 76; // px the bar and the card cover
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

  const chips = el('span', { className: 'chips' });
  const tabs = CATS.map(([c, label]) => el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => { if (c === cat) return; cat = c; selected = undefined; draw(); fit(); } }));
  const svg = document.createElementNS(SVG, 'svg');
  const plane = el('div', { className: 'plane' });
  const view = el('div', { className: 'view' }, plane);
  const info = el('div', { className: 'info' });
  const demo = el('div', { className: 'demo', hidden: true });
  const close = () => { demo.hidden = true; stopWatching(); };
  root.replaceChildren(el('div', { className: 'web' },
    el('div', { className: 'top' }, el('button', { type: 'button', textContent: 'Back', onclick: () => { close(); back(); } }), chips, el('div', { className: 'tabs' }, ...tabs)), view, info, demo));
  addEventListener('keydown', function esc(e) {
    if (!root.contains(demo)) return removeEventListener('keydown', esc);
    if (e.key === 'Escape' && !demo.hidden) close();
  });

  const lines = new Map<string, SVGPathElement>(), cards = new Map<string, HTMLButtonElement>();
  /** The cards and lines of the category on show. */
  function draw() {
    shape = layout(cat);
    lines.clear();
    cards.clear();
    svg.replaceChildren();
    svg.setAttribute('width', String(shape.w));
    svg.setAttribute('height', String(shape.h));
    plane.style.width = `${shape.w}px`;
    plane.style.height = `${shape.h}px`;
    for (const [id, p] of shape.at) {
      const n = NODE.get(id)!, parent = n.parent && shape.at.get(n.parent);
      if (parent) {
        // Out of the parent's right side, down (or up) the gap between the columns, into the child's left side.
        const path = document.createElementNS(SVG, 'path'), mid = parent.x + CARD_W + (COL - CARD_W) / 2;
        path.setAttribute('d', `M${parent.x + CARD_W} ${parent.y + CARD_H / 2}H${mid}V${p.y + CARD_H / 2}H${p.x}`);
        svg.append(path);
        lines.set(id, path);
      }
      const b = el('button', { type: 'button', className: 'node', ariaLabel: n.name },
        el('img', { src: pic(n.icon), alt: '' }), el('span', {}, el('b', {}, n.name), el('small')));
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
    plane.replaceChildren(svg, ...cards.values());
    refresh();
  }

  function trail(n: Node, on: boolean) {
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
    chips.textContent = `${save.chips} chips`;
    tabs.forEach((t, k) => t.setAttribute('aria-pressed', String(CATS[k][0] === cat)));
    for (const [id, b] of cards) {
      const n = NODE.get(id)!, s = state(owned, id), lv = level(owned, id), cost = nextCost(owned, id);
      b.classList.remove('owned', 'open', 'locked');
      b.classList.add(s);
      b.classList.toggle('part', lv > 0 && lv < n.max);
      b.classList.toggle('afford', s === 'open' && save.chips >= cost);
      b.classList.toggle('picked', n === selected);
      const pips = n.max > 1 ? `${'■'.repeat(lv)}${'□'.repeat(n.max - lv)} ` : '';
      b.querySelector('small')!.textContent = s === 'owned' ? `${pips}owned` : s === 'locked' ? `${pips}locked` : `${pips}${cost} chips`;
      lines.get(id)?.setAttribute('class', `${s}${lines.get(id)!.classList.contains('trail') ? ' trail' : ''}`);
    }
    const n = selected;
    if (!n) return info.replaceChildren(el('p', {}, 'Tap a skill to see it. Drag to look around; pinch or scroll to zoom.'));
    const s = state(owned, n.id), lv = level(owned, n.id), cost = nextCost(owned, n.id), short = cost - save.chips;
    const buy = el('button', { type: 'button', className: 'go' }), next = n.max > 1 ? `level ${lv + 1}` : 'it';
    if (s === 'owned') Object.assign(buy, { textContent: n.max > 1 ? 'All levels owned' : 'Owned', disabled: true });
    else if (s === 'locked') Object.assign(buy, { textContent: `Needs ${NODE.get(n.parent!)!.name}`, disabled: true });
    else if (short > 0) Object.assign(buy, { textContent: `${cost} chips (${short} short)`, disabled: true });
    else Object.assign(buy, { textContent: `Buy ${next}: ${cost} chips`, onclick: () => {
      if (state(save.skills, n.id) !== 'open' || save.chips < cost) return;
      save.chips -= cost;
      save.skills[n.id] = lv + 1;
      persist();
      refresh();
      bought(n, cost);
    } });
    const levels = n.max > 1 ? ` Level ${lv} of ${n.max}.` : '';
    const unit = soldierOf(n);
    const eye = unit && el('button', { type: 'button', className: 'eye', title: `Watch a ${UNITS[unit].name} fight`, ariaLabel: `Watch a ${UNITS[unit].name} fight`, onclick: () => show(unit) }, eyeIcon());
    info.replaceChildren(el('img', { src: pic(n.icon), alt: '' }), ...(eye ? [eye] : []), el('div', {}, el('b', {}, n.name), el('p', {}, n.desc + levels)), buy);
  }

  /** Just bought: the card pops and flashes, the chips spent float up off it, the lines to what it opened draw in. */
  function bought(n: Node, cost: number) {
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
    watch(unit, screen);
  }

  // ---- Pan and zoom: the plane is moved with one CSS transform ----
  const v = { x: 0, y: 0, z: 1 };
  const apply = () => { plane.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`; };
  const zoomAt = (sx: number, sy: number, z: number) => {
    z = Math.max(0.25, Math.min(2.5, z));
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

/** An open eye, drawn in the text colour. */
function eyeIcon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/>';
  return s;
}
