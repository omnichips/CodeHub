// The controls over the map, in HTML so they stay sharp: status, Start and the time controls, the bar you drag
// soldiers, structures and strikes from (one tab each), the actions for what is selected, the guided-start tip,
// and the end-of-run panel with the chips the run paid.
export type Group = 'units' | 'build' | 'strikes';
export interface BarItem { id: string; name: string; group: Group; icon: string }
export interface HudState {
  status: string[];
  warn: boolean; // leaks close to the limit
  counts: Record<string, number>;
  ready: Record<string, boolean>; // can be dragged out now
  cool: Record<string, number>; // a strike's cooldown still to go, 1 to 0
  planning: boolean;
  speed: number;
  selection: string;
  actions: string[];
  tip: string; // the guided start's current step, or ''
  end?: { title: string; detail: string; chips: string[]; total: number };
}
interface Handlers {
  drag(id: string, e: PointerEvent): void;
  start(): void;
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
  private readonly speeds: HTMLElement;
  private readonly speedList: number[];
  private readonly tabs: HTMLButtonElement[];
  private readonly items = new Map<string, { button: HTMLElement; count: HTMLElement; group: Group }>();
  private readonly actions: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly tipText: HTMLElement;
  private readonly confirm: HTMLElement;
  private readonly end: HTMLElement;
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
    this.start = el('button', { type: 'button', className: 'go', textContent: 'Start', onclick: () => on.start() });
    this.speeds = el('div', { className: 'speeds' }, ...this.speedList.map((n) => el('button', { type: 'button', textContent: n ? `${n}×` : 'Pause', onclick: () => on.speed(n) })));
    const bar = el('div', { className: 'bar' });
    bar.addEventListener('wheel', (e) => { bar.scrollLeft += e.deltaY; }, { passive: true });
    this.tabs = TABS.filter(([g]) => items.some((i) => i.group === g)).map(([group, label]) => el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => { this.group = group; bar.scrollLeft = 0; } }));
    for (const { id, name, group, icon } of items) {
      const count = el('span', { className: 'count' });
      const button = el('button', { type: 'button', className: 'item', title: `${name}: drag onto the map`, ariaLabel: name }, el('img', { src: icon, alt: '' }), count);
      // Sideways scrolls the bar; dragging up out of it picks the item up (a mouse can drag straight away).
      button.addEventListener('pointerdown', (down) => {
        if (button.classList.contains('empty')) return;
        if (down.pointerType === 'mouse') { down.preventDefault(); on.drag(id, down); return; }
        const move = (e: PointerEvent) => {
          const dx = e.clientX - down.clientX, dy = e.clientY - down.clientY;
          if (-dy > 10 && -dy * 2 > Math.abs(dx)) { stop(); on.drag(id, e); } // up, or up and to the side
          else if (Math.abs(dx) > 12) stop();
        };
        const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', stop);
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
    root.replaceChildren(
      el('div', { className: 'status' }, menu, ...this.status), el('div', { className: 'time' }, this.start, this.speeds),
      el('div', { className: 'dock' }, el('div', { className: 'tabs' }, ...this.tabs), bar), this.actions, this.tip, this.confirm, this.end,
    );
  }

  destroy() { this.root.replaceChildren(); }

  update(s: HudState) {
    this.planning = s.planning;
    s.status.forEach((t, i) => text(this.status[i], t));
    this.status[1].classList.toggle('warn', s.warn);
    this.start.hidden = !s.planning;
    this.speeds.hidden = s.planning;
    [...this.speeds.children].forEach((b, i) => b.setAttribute('aria-pressed', String(this.speedList[i] === s.speed)));
    this.tabs.forEach((t) => t.setAttribute('aria-pressed', String(TABS.find(([, l]) => l === t.textContent)?.[0] === this.group)));
    for (const [id, { button, count, group }] of this.items) {
      button.hidden = group !== this.group;
      text(count, `×${s.counts[id]}`);
      button.classList.toggle('empty', !s.ready[id]);
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
        el('h2', {}, s.end.title), el('p', {}, s.end.detail),
        el('ul', { className: 'chips' }, ...s.end.chips.map((line) => el('li', {}, line))), el('p', { className: 'total' }, `+${s.end.total} chips`),
        el('div', { className: 'row' },
          el('button', { type: 'button', textContent: 'Menu', onclick: () => this.on.menu('menu') }),
          el('button', { type: 'button', textContent: 'Skill web', onclick: () => this.on.menu('tree') }),
          el('button', { type: 'button', className: 'go', textContent: 'Play again', onclick: () => this.on.again() })),
      );
    }
  }
}
