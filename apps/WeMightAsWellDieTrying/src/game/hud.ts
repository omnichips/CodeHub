// The controls over the map, in HTML so they stay sharp: Menu and Settings, status, Start (and Last setup) and the time
// controls, a Debug button (the horde's routes on or off), the bar
// you drag soldiers, structures and strikes from (one tab each), the actions for what is selected, the guided-start
// tip, notices when a soldier falls, and the end-of-run panel with the chips the run paid and who made the kills.
import { ask } from './dialog.ts';

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
  breakLeft: number; // real seconds left of the break between waves, 0 for none
  progress?: { wave: number; waves: number; done: number; left: number }; // during a wave: how far through the horde
  card?: { kind: string; name: string; role: string; icon: string; hp: number; max: number; kills: number; where: string; stats: string[] }; // the soldier picked
  end?: { title: string; detail: string; quote?: string; chips: string[]; total: number; killers: string[]; won: boolean; medals: string[]; sketch: string };
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
  next(): void; // won: on to the next city (the board, after the last)
  menu(to: 'menu' | 'tree'): void;
  retreat(): void;
  skip(): void; // skips the guided start
  nextWave(): void;
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
  private readonly nextWave: HTMLButtonElement;
  private readonly notices: HTMLElement;
  private readonly speeds: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly speedList: number[];
  private readonly tabs: HTMLButtonElement[];
  private readonly items = new Map<string, { button: HTMLElement; count: HTMLElement; group: Group }>();
  private readonly actions: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly tipText: HTMLElement;
  private readonly end: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly banners: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly card: HTMLElement;
  private cardKind = '';
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
    const menu = el('button', { type: 'button', className: 'menu', textContent: 'Menu', onclick: () => (this.planning ? on.menu('menu') : this.askRetreat()) });
    const settings = el('button', { type: 'button', className: 'menu', textContent: 'Settings', onclick: () => on.settings() });
    const routes = el('button', { type: 'button', textContent: 'Routes', title: 'Show the lines the horde keeps to', onclick: () => on.routes() });
    const win = el('button', { type: 'button', textContent: 'Win now', title: 'End the fight as won', onclick: () => on.win() });
    const leaks = el('button', { type: 'button', className: 'leaks', textContent: 'Unlimited leaks', title: 'Leaks never lose the fight', onclick: () => on.leaks() });
    const panel = el('div', { className: 'panel', hidden: true }, el('small', {}, 'Debug'), routes, win, leaks);
    this.debug = el('div', { className: 'debug' }, panel, el('button', { type: 'button', className: 'menu', textContent: 'Debug', onclick: () => (panel.hidden = !panel.hidden) }));
    this.start = el('button', { type: 'button', className: 'go', textContent: 'Start', onclick: () => on.start() });
    this.nextWave = el('button', { type: 'button', className: 'go next', hidden: true, title: 'Skip the rest of the break: +2% of your kill chips', onclick: () => on.nextWave() });
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
    this.end = el('div', { className: 'end', hidden: true });
    this.progress = el('div', { className: 'progress', hidden: true, role: 'progressbar', ariaLabel: 'The horde' }, el('b'), el('span', { className: 'fill' }, el('i')), el('small'));
    this.card = el('div', { className: 'card', hidden: true });
    this.vignette = el('div', { className: 'vignette', ariaHidden: 'true' });
    this.keys = el('div', { className: 'keysheet', hidden: true, onclick: () => (this.keys.hidden = true) });
    this.banners = el('div', { className: 'banner' });
    root.replaceChildren(
      this.vignette,
      el('div', { className: 'status' }, menu, settings, ...this.status), el('div', { className: 'time' }, this.restore, this.start, this.nextWave, this.speeds), this.progress, this.notices, this.card,
      el('div', { className: 'dock' }, el('div', { className: 'tabs' }, ...this.tabs), bar), this.actions, this.tip, this.debug, this.end, this.hint, this.banners, this.keys,
    );
  }

  destroy() { this.root.replaceChildren(); }

  /** Opens a tab of the bar: soldiers, things to build, or strikes. */
  tab(group: Group) {
    if (this.tabs.some((t) => TABS.find(([, l]) => l === t.textContent)?.[0] === group)) this.group = group;
  }

  /** The red at the screen's edges as the squad thins (0 to 1). */
  hurt(level: number) { this.vignette.style.setProperty('--hurt', level.toFixed(2)); }

  /** The keyboard's shortcuts, over the fight, until tapped or toggled again. */
  toggleKeys(lines: [string, string][]) {
    this.keys.hidden = !this.keys.hidden;
    if (!this.keys.hidden) this.keys.replaceChildren(el('div', {}, el('h2', {}, 'Keys'), el('dl', {}, ...lines.flatMap(([k, what]) => [el('dt', {}, k), el('dd', {}, what)])), el('small', {}, 'Change them in Settings, Controls.')));
  }

  /** Leaving mid-wave: asked first, on paper. */
  askRetreat() {
    ask('Retreat?', 'It counts as a loss: you keep half the chips from your kills.', [
      { label: 'Retreat', go: true, act: () => this.on.retreat() },
      { label: 'Keep fighting', act: () => {} },
    ]);
  }

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
    // A telegram, typed and stamped: "WAVE 3 OF 11 — MORE OF THEM STOP".
    this.banners.replaceChildren(el('div', { className: 'telegram' }, el('small', {}, 'TELEGRAM · URGENT'), el('h2', {}, `${title}${sub ? ` — ${sub}` : ''} STOP`), el('span', { className: 'stampmark' }, 'RECEIVED'))); // a new child restarts the animation
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
    const z = parseFloat(getComputedStyle(this.root).zoom) || 1, w = this.hint.offsetWidth * z, h = this.hint.offsetHeight * z; // the HUD's own pixels are scaled by the controls size
    this.hint.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, at.left + at.width / 2 - w / 2)) / z}px`;
    this.hint.style.top = `${(at.top - h - 8 < 8 ? at.bottom + 8 : at.top - h - 8) / z}px`;
  }
  unexplain() { this.hint.hidden = true; }

  update(s: HudState) {
    this.planning = s.planning;
    s.status.forEach((t, i) => { text(this.status[i], t); this.status[i].hidden = !t; });
    this.status[1].classList.toggle('warn', s.warn);
    this.start.hidden = !s.planning;
    this.restore.hidden = !s.planning || !s.restore;
    this.speeds.hidden = s.planning;
    this.nextWave.hidden = !s.breakLeft || !!s.end;
    if (s.breakLeft) text(this.nextWave, `Next wave now · ${Math.ceil(s.breakLeft)}s`);
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
    // How far through the horde: the wave, a bar filling as they fall, how many are left.
    this.progress.hidden = !s.progress || !!s.end;
    if (s.progress) {
      const { wave, waves, done, left } = s.progress, share = done / Math.max(1, done + left);
      text(this.progress.children[0] as HTMLElement, `Wave ${wave}/${waves}`);
      (this.progress.querySelector('i') as HTMLElement).style.transform = `scaleX(${share})`;
      text(this.progress.children[2] as HTMLElement, `${left.toLocaleString()} left`);
      this.progress.ariaValueNow = String(Math.round(share * 100));
    }
    // The soldier picked: his photo pinned to a card, his health, kills and his class's upgrades.
    this.card.hidden = !s.card || !!s.end;
    if (s.card) {
      const c = s.card;
      const key = `${c.kind}|${c.name}|${c.stats.join()}`;
      if (key !== this.cardKind) {
        this.cardKind = key;
        this.card.replaceChildren(
          el('div', { className: 'photo' }, el('img', { src: c.icon, alt: '' })),
          el('div', { className: 'body' }, el('b', {}, c.name), el('small', { className: 'role' }, c.role), el('span', { className: 'hp' }, el('i')), el('small', { className: 'stat' }), el('small', { className: 'ups' }, ...c.stats.map((t) => el('span', {}, t)))));
      }
      const hp = this.card.querySelector('.hp i') as HTMLElement | null;
      if (hp) { hp.style.transform = `scaleX(${Math.max(0, c.hp / c.max)})`; hp.classList.toggle('low', c.hp / c.max <= 0.5); }
      const stat = this.card.querySelector('.stat') as HTMLElement | null;
      if (stat) text(stat, `${c.where} · ${c.kills} kill${c.kills === 1 ? '' : 's'}`);
    } else this.cardKind = '';
    this.tip.hidden = !s.tip || !!s.end;
    text(this.tipText, s.tip);
    this.end.hidden = !s.end;
    if (s.end && !this.end.childElementCount) {
      this.end.append(
        el('h2', {}, s.end.title), ...(s.end.quote ? [el('p', { className: 'quote' }, `“${s.end.quote}”`)] : []), el('p', {}, s.end.detail),
        // The fight in pencil: where they got through, where soldiers fell.
        el('figure', { className: 'sketch' }, el('img', { src: s.end.sketch, alt: 'A sketch of the city: red dots where zombies got through, crosses where soldiers fell' }),
          el('figcaption', {}, el('span', { className: 'k-leak' }, 'got through'), el('span', { className: 'k-fell' }, 'fell'), el('span', { className: 'k-saved' }, 'saved'))),
        // What the run paid, and beside it who made the kills.
        el('div', { className: 'cols' },
          el('div', {}, el('h3', {}, 'Chips'), el('ul', { className: 'chips' }, ...s.end.chips.map((line) => el('li', {}, line))), el('p', { className: 'total' }, `+${s.end.total} chips`)),
          ...(s.end.killers.length ? [el('div', {}, el('h3', {}, 'Who made the kills'), el('ul', { className: 'chips' }, ...s.end.killers.map((line) => el('li', {}, line))))] : []),
          ...(s.end.medals.length ? [el('div', { className: 'medals' }, el('h3', {}, 'Medals earned'), el('ul', { className: 'chips' }, ...s.end.medals.map((line) => el('li', {}, line))))] : [])),
        ...(s.end.won ? [el('button', { type: 'button', className: 'go continue', textContent: 'Continue', onclick: () => this.on.next() })] : []),
        el('div', { className: 'row' },
          el('button', { type: 'button', textContent: 'Menu', onclick: () => this.on.menu('menu') }),
          el('button', { type: 'button', textContent: 'Skill tree', onclick: () => this.on.menu('tree') }),
          el('button', { type: 'button', className: 'go', textContent: 'Play again', onclick: () => this.on.again() })),
      );
    }
  }
}
