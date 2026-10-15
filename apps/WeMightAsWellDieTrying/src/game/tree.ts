// The skill web: every node on one big plane, one category at a time, with lines from each node to its parent.
// Drag to look around, pinch or scroll to zoom, tap a node to see it and buy it.
import type Phaser from 'phaser';
import { icon } from '../art/atlas.ts';
import { persist, profile } from '../meta/profile.ts';
import { NODE, NODES, state, type Category, type Node } from '../meta/progress.ts';
import { el } from './hud.ts';

const CATS: [Category, string][] = [['soldiers', 'Soldiers'], ['structures', 'Build'], ['usables', 'Strikes'], ['base', 'Base']];
const PAD = 1200; // the plane's (0, 0) sits this far in, so every node has positive coordinates on it
const ROOT = 'command'; // every category hangs off it, so it shows in all of them
const TAP = 8; // px a pointer may wander and still count as a tap
const TOP = 60, BOTTOM = 76; // px the bar and the card cover
let cat: Category = 'soldiers'; // the tab last looked at, kept while the game runs

export function skillWeb(scene: Phaser.Scene, root: HTMLElement, back: () => void) {
  const save = profile.save, icons = new Map<string, string>();
  const pic = (frame: string) => icons.get(frame) ?? icons.set(frame, icon(scene, frame)).get(frame)!;
  let selected: Node | undefined;

  const chips = el('span', { className: 'chips' });
  const tabs = CATS.map(([c, label]) => el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => { cat = c; selected = undefined; refresh(); fit(); } }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(2 * PAD));
  svg.setAttribute('height', String(2 * PAD));
  const lines = new Map<string, SVGLineElement>(), buttons = new Map<string, HTMLButtonElement>();
  for (const n of NODES) {
    const p = n.parent && NODE.get(n.parent);
    if (p) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1: p.x + PAD, y1: p.y + PAD, x2: n.x + PAD, y2: n.y + PAD }).forEach(([k, v]) => line.setAttribute(k, String(v)));
      svg.append(line);
      lines.set(n.id, line);
    }
    const big = n.id === ROOT || n.effects.some((e) => e.unlock);
    const b = el('button', { type: 'button', className: `node${big ? ' big' : ''}`, ariaLabel: n.name, title: n.name }, el('img', { src: pic(n.icon), alt: '' }), el('small'));
    b.style.left = `${n.x + PAD}px`;
    b.style.top = `${n.y + PAD}px`;
    b.onclick = (e) => { if (e.detail === 0 || travel <= TAP) { selected = n; refresh(); } };
    buttons.set(n.id, b);
  }
  const plane = el('div', { className: 'plane' }, svg, ...buttons.values());
  const view = el('div', { className: 'view' }, plane);
  const info = el('div', { className: 'info' });
  root.replaceChildren(el('div', { className: 'web' },
    el('div', { className: 'top' }, el('button', { type: 'button', textContent: 'Back', onclick: back }), chips, el('div', { className: 'tabs' }, ...tabs)), view, info));

  function refresh() {
    const owned = new Set(save.owned);
    chips.textContent = `${save.chips} chips`;
    tabs.forEach((t, k) => t.setAttribute('aria-pressed', String(CATS[k][0] === cat)));
    for (const n of NODES) {
      const s = state(owned, n.id), shown = n.cat === cat || n.id === ROOT, b = buttons.get(n.id)!;
      b.hidden = !shown;
      b.className = `node ${s}${b.classList.contains('big') ? ' big' : ''}${s === 'open' && save.chips >= n.cost ? ' afford' : ''}${n === selected ? ' picked' : ''}`;
      b.lastElementChild!.textContent = s === 'owned' ? '' : String(n.cost);
      const line = lines.get(n.id);
      if (line) {
        line.style.display = shown ? '' : 'none';
        line.setAttribute('class', s);
      }
    }
    const n = selected;
    if (!n) return info.replaceChildren(el('p', {}, 'Tap a skill to see it. Drag to look around; pinch or scroll to zoom.'));
    const s = state(owned, n.id), short = n.cost - save.chips;
    const buy = el('button', { type: 'button', className: 'go' });
    if (s === 'owned') Object.assign(buy, { textContent: 'Owned', disabled: true });
    else if (s === 'locked') Object.assign(buy, { textContent: `Needs ${NODE.get(n.parent!)!.name}`, disabled: true });
    else if (short > 0) Object.assign(buy, { textContent: `${n.cost} chips (${short} short)`, disabled: true });
    else Object.assign(buy, { textContent: `Buy: ${n.cost} chips`, onclick: () => {
      if (state(new Set(save.owned), n.id) !== 'open' || save.chips < n.cost) return;
      save.chips -= n.cost;
      save.owned.push(n.id);
      persist();
      refresh();
    } });
    info.replaceChildren(el('img', { src: pic(n.icon), alt: '' }), el('div', {}, el('b', {}, n.name), el('p', {}, n.desc)), buy);
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
  /** Frames the nodes of the current tab; if they only fit too small to read, frames the ones you can buy next. */
  function fit() {
    const box = (ns: Node[]) => [Math.min(...ns.map((n) => n.x)), Math.max(...ns.map((n) => n.x)), Math.min(...ns.map((n) => n.y)), Math.max(...ns.map((n) => n.y))].map((c) => c + PAD);
    const shown = NODES.filter((n) => n.cat === cat || n.id === ROOT), owned = new Set(save.owned), w = view.clientWidth, h = view.clientHeight - TOP - BOTTOM;
    let [x0, x1, y0, y1] = box(shown);
    const z = Math.min(w / (x1 - x0 + 90), h / (y1 - y0 + 90)), open = shown.filter((n) => state(owned, n.id) === 'open');
    if (z < 0.6 && open.length) [x0, x1, y0, y1] = box(open);
    v.z = Math.max(0.6, Math.min(1.4, z));
    v.x = w / 2 - ((x0 + x1) / 2) * v.z;
    v.y = TOP + h / 2 - ((y0 + y1) / 2) * v.z;
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
    // Once it is a drag, keep the pointer here, so the node it started on does not take it as a tap.
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

  refresh();
  fit();
}
