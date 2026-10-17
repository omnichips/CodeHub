// The controls over the map, in HTML so they stay sharp: Menu and Settings, status, Start (and Last setup) and the time
// controls, a Debug button (the horde's routes on or off), the bar
// you drag soldiers, structures and strikes from (one tab each), the actions for what is selected, the guided-start
// tip, notices when a soldier falls, and the end-of-run panel with the chips the run paid and who made the kills.
export type Group = 'units' | 'build' | 'strikes';
export interface BarItem { id: string; name: string; group: Group; icon: string; desc: string }
export interface HudState {
  status: string[];
  warn: boolean; // leaks close to the limit
  counts: Record<string, number>;
  ready: Record<string, boolean>; // can be dragged out now
  cool: Record<string, number>; // a strike's cooldown still to go, 1 to 0
  planning: boolean;
  restore: boolean; // a setup kept from last time can be put down
  speed: number;
  armed: string; // the bar item tapped, waiting for a tap on the map
  routes: boolean; // the horde's routes are shown
  unlimited: boolean; // leaks never lose the fight (debug)
  selection: string;
  actions: string[];
  tip: string; // the guided start's current step, or ''
  end?: { title: string; detail: string; quote?: string; chips: string[]; total: number; killers: string[] };
}
interface Handlers {
  drag(id: string, e: PointerEvent): void;
  arm(id: string): void; // a finger tapped a bar item: the next tap on the map puts it down
  settings(): void;
  routes(): void; // the horde's routes shown, or not
  win(): void; // debug: the fight is won now
  leaks(): void; // debug: unlimited leaks, or not
  start(): void;
  setup(): void; // puts down the setup kept from last time
  speed(n: number): void;
  action(name: string): void;
  again(): void;
  menu(to: 'menu' | 'tree'): void;
  retreat(): void;
  skip(): void; // skips the guided start
}

const TABS: [Group, string][] = [['units', 'Units'], ['build', 'Build'], ['strikes', 'Strikes']];

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
const text = (e: HTMLElement, t: string) => { if (e.textContent !== t) e.textContent = t; };

export class Hud {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement[];
  private readonly start: HTMLButtonElement;
  private readonly restore: HTMLButtonElement;
  private readonly notices: HTMLElement;
  private readonly speeds: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly speedList: number[];
  private readonly tabs: HTMLButtonElement[];
  private readonly items = new Map<string, { button: HTMLElement; count: HTMLElement; group: Group }>();
  private readonly actions: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly tipText: HTMLElement;
  private readonly confirm: HTMLElement;
  private readonly end: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly banners: HTMLElement;
  private readonly on: Handlers;
  private group: Group = 'units';
  private shown = '';
  private planning = true;

  /** `speeds` are the ones bought (1 always); pause is always there. `lefty` mirrors the layout. */
  constructor(root: HTMLElement, items: BarItem[], speeds: number[], lefty: boolean, on: Handlers) {
    this.root = root;
    this.on = on;
    this.speedList = [0, ...speeds];
    root.classList.toggle('lefty', lefty);
    this.status = [el('span'), el('span'), el('span')];
    const menu = el('button', { type: 'button', className: 'menu', textContent: 'Menu', onclick: () => (this.planning ? on.menu('menu') : (this.confirm.hidden = false)) });
    const settings = el('button', { type: 'button', className: 'menu', textContent: 'Settings', onclick: () => on.settings() });
    const routes = el('button', { type: 'button', textContent: 'Routes', title: 'Show the lines the horde keeps to', onclick: () => on.routes() });
    const win = el('button', { type: 'button', textContent: 'Win now', title: 'End the fight as won', onclick: () => on.win() });
    const leaks = el('button', { type: 'button', className: 'leaks', textContent: 'Unlimited leaks', title: 'Leaks never lose the fight', onclick: () => on.leaks() });
    const panel = el('div', { className: 'panel', hidden: true }, el('small', {}, 'Debug'), routes, win, leaks);
    this.debug = el('div', { className: 'debug' }, panel, el('button', { type: 'button', className: 'menu', textContent: 'Debug', onclick: () => (panel.hidden = !panel.hidden) }));
    this.start = el('button', { type: 'button', className: 'go', textContent: 'Start', onclick: () => on.start() });
    this.restore = el('button', { type: 'button', textContent: 'Last setup', title: 'Put everything back where it was last time', onclick: () => on.setup() });
    this.notices = el('div', { className: 'notices' });
    this.speeds = el('div', { className: 'speeds' }, ...this.speedList.map((n) => el('button', { type: 'button', textContent: n === 0.5 ? '½×' : n ? `${n}×` : 'Pause', onclick: () => on.speed(n) })));
    const bar = el('div', { className: 'bar' });
    bar.addEventListener('wheel', (e) => { bar.scrollLeft += e.deltaY; }, { passive: true });
    this.tabs = TABS.filter(([g]) => items.some((i) => i.group === g)).map(([group, label]) => el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => { this.group = group; bar.scrollLeft = 0; } }));
    this.hint = el('div', { className: 'hint', hidden: true });
    for (const { id, name, group, icon, desc } of items) {
      const count = el('span', { className: 'count' });
      const button = el('button', { type: 'button', className: 'item', ariaLabel: `${name}: ${desc}` }, el('img', { src: icon, alt: '' }), count);
      const explain = () => this.explain(name, desc, button.getBoundingClientRect());
      // A mouse hovering, or a finger held still, shows who this is.
      button.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') explain(); });
      button.addEventListener('pointerleave', () => this.unexplain());
      // Sideways scrolls the bar; dragging up out of it picks the item up (a mouse can drag straight away). A finger can
      // also tap it, then tap the map.
      button.addEventListener('pointerdown', (down) => {
        if (down.pointerType === 'mouse') {
          this.unexplain();
          if (!button.classList.contains('empty')) { down.preventDefault(); on.drag(id, down); }
          return;
        }
        const hold = setTimeout(explain, 350);
        const move = (e: PointerEvent) => {
          const dx = e.clientX - down.clientX, dy = e.clientY - down.clientY;
          if (-dy > 10 && -dy * 2 > Math.abs(dx) && !button.classList.contains('empty')) { stop(); on.drag(id, e); } // up, or up and to the side
          else if (Math.abs(dx) > 12) stop();
        };
        const tap = () => { stop(); if (!button.classList.contains('empty')) on.arm(id); };
        const stop = () => { clearTimeout(hold); this.unexplain(); removeEventListener('pointermove', move); removeEventListener('pointerup', tap); removeEventListener('pointercancel', stop); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', tap);
        addEventListener('pointercancel', stop);
      });
      bar.append(button);
      this.items.set(id, { button, count, group });
    }
    this.actions = el('div', { className: 'actions' });
    this.tipText = el('p');
    this.tip = el('div', { className: 'tip', hidden: true }, this.tipText, el('button', { type: 'button', textContent: 'Skip', onclick: () => on.skip() }));
    this.confirm = el('div', { className: 'end', hidden: true },
      el('h2', {}, 'Retreat?'), el('p', {}, 'It counts as a loss: you keep half the chips from your kills.'),
      el('div', { className: 'row' }, el('button', { type: 'button', textContent: 'Keep fighting', onclick: () => (this.confirm.hidden = true) }), el('button', { type: 'button', className: 'go', textContent: 'Retreat', onclick: () => on.retreat() })));
    this.end = el('div', { className: 'end', hidden: true });
    this.banners = el('div', { className: 'banner' });
    root.replaceChildren(
      el('div', { className: 'status' }, menu, settings, ...this.status), el('div', { className: 'time' }, this.restore, this.start, this.speeds), this.notices,
      el('div', { className: 'dock' }, el('div', { className: 'tabs' }, ...this.tabs), bar), this.actions, this.tip, this.debug, this.confirm, this.end, this.hint, this.banners,
    );
  }

  destroy() { this.root.replaceChildren(); }

  /** How much of the game's canvas (`canvas`, on the page) is out of sight at the top and bottom, in CSS pixels: under
   *  the status row and time controls, under the bar, or off the part of the page on screen (`seen`). Measured, since a
   *  phone's fonts, safe areas or browser can make any of it bigger. */
  margins(canvas: { top: number; bottom: number }, seen: { top: number; bottom: number }) {
    const rect = (sel: string) => this.root.querySelector(sel)?.getBoundingClientRect();
    const status = rect('.status'), time = rect('.time'), dock = rect('.dock');
    return {
      top: Math.max(status?.bottom ?? 0, time?.bottom ?? 0, seen.top) - canvas.top + 8,
      bottom: canvas.bottom - Math.min(dock?.top ?? Infinity, seen.bottom) + 8,
    };
  }

  /** A big title across the screen that fades in and out by itself: the city at the start, each wave as it comes. */
  banner(title: string, sub: string) {
    this.banners.replaceChildren(el('div', {}, el('h2', {}, title), el('p', {}, sub))); // a new child restarts the animation
  }

  /** A short line under the status, gone after a few seconds; tapping it calls `tap` (look at where it happened). */
  notice(line: string, tap: () => void) {
    const n = el('button', { type: 'button', textContent: line, onclick: () => { tap(); n.remove(); } });
    this.notices.prepend(n);
    while (this.notices.childElementCount > 4) this.notices.lastElementChild!.remove();
    setTimeout(() => n.remove(), 5000);
  }

  /** Who something is, in a box beside it (`at` is where it is on screen), until unexplain(). */
  explain(name: string, desc: string, at: { left: number; top: number; width: number; bottom: number }) {
    this.hint.replaceChildren(el('b', {}, name), el('p', {}, desc));
    this.hint.hidden = false;
    const w = this.hint.offsetWidth, h = this.hint.offsetHeight;
    this.hint.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, at.left + at.width / 2 - w / 2))}px`;
    this.hint.style.top = `${at.top - h - 8 < 8 ? at.bottom + 8 : at.top - h - 8}px`;
  }
  unexplain() { this.hint.hidden = true; }

  update(s: HudState) {
    this.planning = s.planning;
    s.status.forEach((t, i) => { text(this.status[i], t); this.status[i].hidden = !t; });
    this.status[1].classList.toggle('warn', s.warn);
    this.start.hidden = !s.planning;
    this.restore.hidden = !s.planning || !s.restore;
    this.speeds.hidden = s.planning;
    [...this.speeds.children].forEach((b, i) => b.setAttribute('aria-pressed', String(this.speedList[i] === s.speed)));
    this.debug.querySelector('.panel button')!.setAttribute('aria-pressed', String(s.routes));
    this.debug.querySelector('.leaks')!.setAttribute('aria-pressed', String(s.unlimited));
    this.tabs.forEach((t) => t.setAttribute('aria-pressed', String(TABS.find(([, l]) => l === t.textContent)?.[0] === this.group)));
    for (const [id, { button, count, group }] of this.items) {
      button.hidden = group !== this.group;
      text(count, `×${s.counts[id]}`);
      button.classList.toggle('empty', !s.ready[id]);
      button.setAttribute('aria-pressed', String(s.armed === id));
      button.style.setProperty('--cool', String(s.cool[id] ?? 0));
    }
    const shown = [s.selection, ...s.actions].join('|');
    if (shown !== this.shown) {
      this.shown = shown;
      this.actions.replaceChildren(
        ...(s.selection ? [el('span', { className: 'label' }, s.selection)] : []),
        ...s.actions.map((a) => el('button', { type: 'button', textContent: a, onclick: () => this.on.action(a) })),
      );
    }
    this.tip.hidden = !s.tip || !!s.end;
    text(this.tipText, s.tip);
    this.end.hidden = !s.end;
    if (s.end && !this.end.childElementCount) {
      this.confirm.hidden = true;
      this.end.append(
        el('h2', {}, s.end.title), ...(s.end.quote ? [el('p', { className: 'quote' }, `“${s.end.quote}”`)] : []), el('p', {}, s.end.detail),
        // What the run paid, and beside it who made the kills.
        el('div', { className: 'cols' },
          el('div', {}, el('h3', {}, 'Chips'), el('ul', { className: 'chips' }, ...s.end.chips.map((line) => el('li', {}, line))), el('p', { className: 'total' }, `+${s.end.total} chips`)),
          ...(s.end.killers.length ? [el('div', {}, el('h3', {}, 'Who made the kills'), el('ul', { className: 'chips' }, ...s.end.killers.map((line) => el('li', {}, line))))] : [])),
        el('div', { className: 'row' },
          el('button', { type: 'button', textContent: 'Menu', onclick: () => this.on.menu('menu') }),
          el('button', { type: 'button', textContent: 'Skill tree', onclick: () => this.on.menu('tree') }),
          el('button', { type: 'button', className: 'go', textContent: 'Play again', onclick: () => this.on.again() })),
      );
    }
  }
}
