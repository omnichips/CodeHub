// The controls over the map, in HTML so they stay sharp: status, Start and the time controls, the bar you drag
// soldiers, structures and strikes from (one tab each), the actions for what is selected, and the end-of-run panel.
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
  end?: { title: string; detail: string };
}
interface Handlers {
  drag(id: string, e: PointerEvent): void;
  start(): void;
  speed(n: number): void;
  action(name: string): void;
  again(): void;
}

const SPEEDS = [['Pause', 0], ['1×', 1], ['2×', 2], ['3×', 3]] as const;
const TABS: [Group, string][] = [['units', 'Units'], ['build', 'Build'], ['strikes', 'Strikes']];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
const text = (e: HTMLElement, t: string) => { if (e.textContent !== t) e.textContent = t; };

export class Hud {
  private readonly status: HTMLElement[];
  private readonly start: HTMLButtonElement;
  private readonly speeds: HTMLElement;
  private readonly tabs: HTMLButtonElement[];
  private readonly items = new Map<string, { button: HTMLElement; count: HTMLElement; group: Group }>();
  private readonly actions: HTMLElement;
  private readonly end: HTMLElement;
  private readonly on: Handlers;
  private group: Group = 'units';
  private shown = '';

  constructor(root: HTMLElement, items: BarItem[], on: Handlers) {
    this.on = on;
    this.status = [el('span'), el('span'), el('span')];
    this.start = el('button', { type: 'button', className: 'go', textContent: 'Start', onclick: () => on.start() });
    this.speeds = el('div', { className: 'speeds' }, ...SPEEDS.map(([label, n]) => el('button', { type: 'button', textContent: label, onclick: () => on.speed(n) })));
    const bar = el('div', { className: 'bar' });
    bar.addEventListener('wheel', (e) => { bar.scrollLeft += e.deltaY; }, { passive: true });
    this.tabs = TABS.map(([group, label]) => el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => { this.group = group; bar.scrollLeft = 0; } }));
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
    this.end = el('div', { className: 'end', hidden: true });
    root.replaceChildren(
      el('div', { className: 'status' }, ...this.status), el('div', { className: 'time' }, this.start, this.speeds),
      el('div', { className: 'dock' }, el('div', { className: 'tabs' }, ...this.tabs), bar), this.actions, this.end,
    );
  }

  update(s: HudState) {
    s.status.forEach((t, i) => text(this.status[i], t));
    this.status[1].classList.toggle('warn', s.warn);
    this.start.hidden = !s.planning;
    this.speeds.hidden = s.planning;
    [...this.speeds.children].forEach((b, i) => b.setAttribute('aria-pressed', String(SPEEDS[i][1] === s.speed)));
    this.tabs.forEach((t, i) => t.setAttribute('aria-pressed', String(TABS[i][0] === this.group)));
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
    this.end.hidden = !s.end;
    if (s.end && !this.end.childElementCount)
      this.end.append(el('h2', {}, s.end.title), el('p', {}, s.end.detail), el('button', { type: 'button', className: 'go', textContent: 'Play again', onclick: () => this.on.again() }));
  }
}
