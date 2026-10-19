// The controls over the map, in HTML so they stay sharp: Menu and Settings, status, Start (and Clear) and the time
// controls, a Debug button (the horde's routes on or off), the bar
// you drag soldiers, structures and strikes from (one tab each), the actions for what is selected, the guided-start
// tip, notices when a soldier falls, and the end-of-run panel with the chips the run paid and who made the kills.
import { ask } from './dialog.ts';
import { pixAnim, pixIcon, type IconName } from './pixicons.ts';

export type Group = 'units' | 'build' | 'strikes';
export interface BarItem { id: string; name: string; group: Group; icon: string; desc: string }
export interface HudState {
  status: string[];
  warn: boolean; // leaks close to the limit
  counts: Record<string, number>;
  ready: Record<string, boolean>; // can be dragged out now
  cool: Record<string, number>; // a strike's cooldown still to go, 1 to 0
  planning: boolean;
  placed: boolean; // something is down, so it can be cleared
  speed: number;
  armed: string; // the bar item tapped, waiting for a tap on the map
  routes: boolean; // the horde's routes are shown
  unlimited: boolean; // leaks never lose the fight (debug)
  selection: string;
  actions: string[];
  tip: string; // the guided start's current step, or ''
  tipNext: boolean; // the tip has nothing to do: a Next button moves on
  drill?: boolean; // this is the tutorial
  focus?: { x: number; y: number; r: number }; // a circle (screen pixels) left lit, the rest of the screen dark
  spot: string; // a selector for the control the tip points at, or ''
  breakLeft: number; // real seconds left of the break between waves, 0 for none
  card?: { kind: string; name: string; role: string; icon: string; hp: number; max: number; kills: number; where: string; stats: string[]; drivable: boolean; mark: string; driving: boolean }; // the soldier picked (drivable: the player can play as him; mark: the bookmark on his dossier, Remove while planning, Retreat mid-wave)
  end?: { title: string; detail: string; quote?: string; chips: string[]; total: number; killers: string[]; won: boolean; medals: string[]; sketch: string; drill?: boolean }; // drill: the tutorial is over, a plain black screen instead of the report
}
interface Handlers {
  drag(id: string, e: PointerEvent): void;
  arm(id: string): void; // a finger tapped a bar item: the next tap on the map puts it down
  settings(): void;
  routes(): void; // the horde's routes shown, or not
  win(): void; // debug: the fight is won now
  leaks(): void; // debug: unlimited leaks, or not
  start(): void;
  clear(): void; // takes back everything put down (asked first)
  speed(n: number): void;
  action(name: string): void;
  again(): void;
  next(): void; // won: on to the next city (the board, after the last)
  menu(to: 'menu' | 'tree'): void;
  retreat(): void;
  walk(dx: number, dy: number): void; // the on-screen stick, each -1 to 1
  drive(): void; // play as the soldier picked, or go back to the whole squad
  tipNext(): void; // the drill's note is read
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

/** The dark edges of the screen while playing as a soldier: dithered like the lamp light over the city board (game/board.ts),
 *  seven steps of a 4 by 4 Bayer pattern (the crosses and dots between the steps), one art pixel to `px` screen pixels.
 *  A data URL for the CSS, made for the screen's size. */
function pixelVignette(px = 3) {
  const w = Math.ceil(innerWidth / px), h = Math.ceil(innerHeight / px), c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!, img = x.createImageData(w, h), bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], steps = 7;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const r = Math.hypot((i - w / 2) / (w / 2), (j - h / 2) / (h / 2)), f = Math.min(1, Math.max(0, (r - 0.45) / 0.75)) * steps, lo = Math.floor(f);
      const level = (lo + (bayer[(i & 3) + (j & 3) * 4] < (f - lo) * 16 ? 1 : 0)) / steps;
      img.data.set([6, 4, 3, Math.round(level * 0.85 * 255)], (j * w + i) * 4);
    }
  x.putImageData(img, 0, 0);
  return c.toDataURL();
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement[];
  private readonly statusText: HTMLElement[]; // what each status says (the icon sits beside it)
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
  private readonly tipNext: HTMLButtonElement;
  private spotted?: Element; // the control the drill is pointing at
  private spotSel = '';
  private readonly peek: HTMLButtonElement; // the eye: hides the bottom controls for a clear view
  private tipFor = ''; // the tip text on show, to put the note back in the middle when it changes
  private readonly dim: HTMLElement; // the dark round the circle that is lit
  private readonly light: HTMLElement; // the yellow box round it, the rest of the screen dark
  private readonly end: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly banners: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly pxvig: HTMLElement; // the pixelated dark edges while playing as a soldier
  private readonly keys: HTMLElement;
  private readonly card: HTMLElement;
  private cardKind = '';
  private readonly on: Handlers;
  private group: Group = 'units';
  private shown = '';
  private planning = true;
  private drill = false;

  /** `speeds` are the ones bought (1 always); pause is always there. `lefty` mirrors the layout. */
  constructor(root: HTMLElement, items: BarItem[], speeds: number[], lefty: boolean, on: Handlers) {
    this.root = root;
    this.on = on;
    this.speedList = [0, ...speeds];
    root.classList.toggle('lefty', lefty);
    // Slowed, then leaks (a zombie's head) and kills (a skull): an icon and a number.
    const stat = (icon: IconName, title: string) => { const t = el('b'); return { span: el('span', { className: 'stat', title }, pixIcon(icon), t), t }; };
    const leakStat = stat('zombie', 'Leaks: zombies that got through, of the most the line can take'), killStat = stat('skull', 'Kills');
    const slowed = el('span');
    this.status = [slowed, leakStat.span, killStat.span];
    this.statusText = [slowed, leakStat.t, killStat.t];
    const icon = (art: IconName | Element, label: string, go: () => void) => el('button', { type: 'button', className: 'menu icon', ariaLabel: label, title: label, onclick: go }, typeof art === 'string' ? pixIcon(art) : art);
    const menu = icon(pixAnim('flag'), 'Menu', () => this.askLeave()); // hovered, the flag waves
    const settings = icon(pixAnim('gear'), 'Settings', () => on.settings()); // and the cog turns
    const routes = el('button', { type: 'button', textContent: 'Routes', title: 'Show the lines the horde keeps to', onclick: () => on.routes() });
    const win = el('button', { type: 'button', textContent: 'Win now', title: 'End the fight as won', onclick: () => on.win() });
    const leaks = el('button', { type: 'button', className: 'leaks', textContent: 'Unlimited leaks', title: 'Leaks never lose the fight', onclick: () => on.leaks() });
    const panel = el('div', { className: 'panel', hidden: true }, el('small', {}, 'Debug'), routes, win, leaks);
    this.debug = el('div', { className: 'debug' }, icon('spider', 'Debug', () => (panel.hidden = !panel.hidden)), panel);
    this.start = el('button', { type: 'button', className: 'go', textContent: 'Start', onclick: () => on.start() });
    this.nextWave = el('button', { type: 'button', className: 'go next', hidden: true, title: 'Skip the rest of the break: +2% of your kill chips', onclick: () => on.nextWave() });
    this.restore = el('button', { type: 'button', textContent: 'Clear', title: 'Take back everything you have put down', onclick: () => this.askClear() });
    this.notices = el('div', { className: 'notices' });
    this.speeds = el('div', { className: 'speeds' }, ...this.speedList.map((n) => el('button', { type: 'button', textContent: n === 0.5 ? '½×' : n ? `${n}×` : 'Pause', onclick: () => on.speed(n) })));
    const bar = el('div', { className: 'bar' });
    bar.addEventListener('wheel', (e) => { bar.scrollLeft += e.deltaY; }, { passive: true });
    this.tabs = TABS.filter(([g]) => items.some((i) => i.group === g)).map(([group, label]) => {
      const b = el('button', { type: 'button', className: 'tab', onclick: () => { this.group = group; bar.scrollLeft = 0; } }, pixIcon(group, 2), label);
      b.dataset.group = group; // for the drill to point at
      return b;
    });
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
    this.tipNext = el('button', { type: 'button', className: 'go', textContent: 'Next', hidden: true, onclick: () => on.tipNext() });
    this.tip = el('div', { className: 'tip', hidden: true }, this.tipText, this.tipNext, el('button', { type: 'button', textContent: 'Skip', title: 'Skip the tutorial notes', onclick: () => (this.drill ? ask('Skip the tutorial?', 'You will not see the rest of the notes. The fight carries on without them.', [{ label: 'Skip', go: true, act: () => on.skip() }, { label: 'Keep going', act: () => {} }]) : on.skip()) }));
    // The note can be dragged out of the way (by anywhere but its buttons); the next note is back in the middle.
    this.tip.onpointerdown = (e) => {
      if ((e.target as Element).closest('button')) return;
      const sx = e.clientX, sy = e.clientY, [ox, oy] = (this.tip.style.translate || '0px 0px').split(' ').map(parseFloat);
      this.tip.setPointerCapture(e.pointerId);
      this.tip.classList.add('moving');
      this.tip.onpointermove = (m) => { this.tip.style.translate = `${ox + m.clientX - sx}px ${oy + m.clientY - sy}px`; };
      this.tip.onpointerup = this.tip.onpointercancel = () => { this.tip.classList.remove('moving'); this.tip.onpointermove = null; };
    };
    this.end = el('div', { className: 'end', hidden: true });
    this.light = el('div', { className: 'light', hidden: true, ariaHidden: 'true' });
    this.dim = el('div', { className: 'dim', hidden: true, ariaHidden: 'true' });
    this.peek = icon('eye', 'Hide the controls to see the street', () => {
      const bare = this.root.classList.toggle('bare');
      this.peek.replaceChildren(pixIcon(bare ? 'eyeShut' : 'eye'));
      this.peek.ariaLabel = this.peek.title = bare ? 'Show the controls' : 'Hide the controls to see the street';
      this.peek.className = 'menu icon peek';
    });
    this.peek.classList.add('peek');
    this.card = el('div', { className: 'card', hidden: true });
    this.vignette = el('div', { className: 'vignette', ariaHidden: 'true' });
    this.pxvig = el('div', { className: 'pxvig', ariaHidden: 'true' });
    // The thumb stick for playing as a soldier on a touch screen: drag the knob, he walks; the other thumb aims and shoots on the map.
    const knob = el('i'), stick = el('div', { className: 'stick', ariaHidden: 'true' }, knob), R = 44;
    const pull = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, d = Math.min(R, Math.hypot(x, y)) / (Math.hypot(x, y) || 1);
      knob.style.transform = `translate(${x * d}px, ${y * d}px)`;
      on.walk(x * d / R, y * d / R);
    };
    stick.onpointerdown = (e) => { stick.setPointerCapture(e.pointerId); pull(e); };
    stick.onpointermove = (e) => { if (stick.hasPointerCapture(e.pointerId)) pull(e); };
    stick.onpointerup = stick.onpointercancel = () => { knob.style.transform = ''; on.walk(0, 0); };
    this.keys = el('div', { className: 'keysheet', hidden: true, onclick: () => (this.keys.hidden = true) });
    this.banners = el('div', { className: 'banner' });
    root.replaceChildren(
      this.vignette,
      el('div', { className: 'status' }, menu, settings, ...this.status), el('div', { className: 'time' }, this.restore, this.start, this.nextWave, this.speeds, this.debug), this.notices, this.card,
      el('div', { className: 'dock' }, el('div', { className: 'tabs' }, ...this.tabs), bar), this.actions, this.tip, this.end, this.hint, this.banners, this.keys, this.pxvig, stick, this.dim, this.light, this.peek,
    );
  }

  destroy() { this.root.replaceChildren(); }

  /** The drill's yellow box round `target`. */
  private lightUp(target?: Element) {
    this.light.hidden = !target;
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(this.light.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  }

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

  /** Clearing the defence: asked first, on paper. */
  askClear() {
    ask('Clear everything?', 'Every soldier, roadblock and structure you have put down goes back to the bar.', [
      { label: 'Clear', go: true, act: () => this.on.clear() },
      { label: 'Keep it', act: () => {} },
    ]);
  }

  /** Leaving mid-wave: asked first, on paper. */
  /** The Menu button: asks first, in the tutorial, while planning and mid-fight. */
  askLeave() {
    if (!this.planning) return this.askRetreat();
    const [title, body] = this.drill ? ['Leave the tutorial?', 'You will not get the rest of the lesson.'] : ['Back to the menu?', 'Nothing is lost, but a defence you have not started is not kept.'];
    ask(title, body, [{ label: 'Leave', go: true, act: () => this.on.menu('menu') }, { label: 'Stay', act: () => {} }]);
  }

  askRetreat() {
    ask(this.drill ? 'Leave the tutorial?' : 'Retreat?', this.drill ? 'You will not get the rest of the lesson.' : 'It counts as a loss: you keep the chips from your kills.', [
      { label: this.drill ? 'Leave' : 'Retreat', go: true, act: () => this.on.retreat() },
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
    s.status.forEach((t, i) => { text(this.statusText[i], t); this.status[i].hidden = !t; });
    this.status[1].classList.toggle('warn', s.warn);
    this.start.hidden = !s.planning;
    this.restore.hidden = !s.planning || !s.placed;
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
    // The soldier picked: his photo pinned to a card, his health, kills and his class's upgrades.
    this.card.hidden = !s.card || !!s.end;
    if (s.card) {
      const c = s.card;
      const key = `${c.kind}|${c.name}|${c.stats.join()}`;
      if (key !== this.cardKind) {
        this.cardKind = key;
        this.card.replaceChildren(
          el('div', { className: 'photo' }, el('img', { src: c.icon, alt: '' })),
          el('div', { className: 'body' }, el('div', { className: 'head' }, el('b', {}, c.name), el('small', { className: 'role' }, c.role)), el('span', { className: 'hp' }, el('i')), el('small', { className: 'stat' }), el('small', { className: 'ups' }, ...c.stats.map((t) => el('span', {}, t)))),
          el('button', { type: 'button', className: 'bookmark', onclick: (e) => this.on.action((e.currentTarget as HTMLElement).textContent!) }),
          el('button', { type: 'button', className: 'drive', ariaLabel: 'Play as this soldier', onclick: () => this.on.drive() }, pixIcon('radio', 3)));
      }
      const hp = this.card.querySelector('.hp i') as HTMLElement | null;
      if (hp) { hp.style.transform = `scaleX(${Math.max(0, c.hp / c.max)})`; hp.classList.toggle('low', c.hp / c.max <= 0.5); }
      if (c.driving && !this.root.classList.contains('driving')) this.pxvig.style.backgroundImage = `url(${pixelVignette()})`; // made for the screen as it is now
      this.root.classList.toggle('driving', c.driving);
      const mark = this.card.querySelector('.bookmark') as HTMLButtonElement | null; // Remove or Retreat, a ribbon out of the top of the dossier
      if (mark) { mark.hidden = !c.mark; text(mark, c.mark); mark.disabled = c.mark === 'Retreating…'; }
      const drive = this.card.querySelector('.drive') as HTMLButtonElement | null;
      if (drive) { drive.hidden = !c.drivable; drive.setAttribute('aria-pressed', String(c.driving)); drive.title = c.driving ? 'Back to the squad (Esc)' : 'Play as him: WASD or the stick to walk, the mouse or a finger to aim. He fires on his own'; }
      const stat = this.card.querySelector('.stat') as HTMLElement | null;
      if (stat) text(stat, `${c.where} · ${c.kills} kill${c.kills === 1 ? '' : 's'}`);
    } else { this.cardKind = ''; this.root.classList.remove('driving'); }
    this.drill = !!s.drill;
    this.tip.hidden = !s.tip || !!s.end;
    if (s.tip !== this.tipFor) { this.tipFor = s.tip; this.tip.style.translate = ''; } // each note comes up in the middle
    text(this.tipText, s.tip);
    this.tipNext.hidden = !s.tipNext;
    if (s.spot !== this.spotSel) { // what the drill's note is about
      this.spotSel = s.spot;
      this.spotted = undefined;
    }
    if (s.spot && !this.spotted?.isConnected) this.spotted = this.root.querySelector(s.spot) ?? undefined; // a button that only exists once something is picked
    const f = s.focus && !this.tip.hidden ? s.focus : undefined;
    this.dim.hidden = !f;
    if (f) Object.assign(this.dim.style, { left: `${f.x - f.r}px`, top: `${f.y - f.r}px`, width: `${f.r * 2}px`, height: `${f.r * 2}px` });
    this.lightUp(!this.tip.hidden && !this.root.classList.contains('bare') ? this.spotted : undefined);
    this.end.hidden = !s.end;
    this.end.classList.toggle('finish', !!s.end?.drill);
    if (s.end?.drill && !this.end.childElementCount)
      this.end.append(el('h2', {}, 'You finished the tutorial!'), el('button', { type: 'button', className: 'go', textContent: 'Proceed', onclick: () => this.on.next() }));
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
