// Settings, as a sheet of parched paper pinned up (the menu's, and the one opened during
// a fight, smaller): index tabs for Sound, Display, Story and Controls; each setting's choices as boxes to tick in blue
// pen, its levels as faders like the radio's with their amber displays; a little live picture beside gore, dead
// bodies and dust; at the foot the storage gauge, post-its for whatever else the screen offers (Statistics, Debug), and
// the build pencilled in the corner.
import { persist, profile } from '../meta/profile.ts';
import { BODIES, KEY_ACTIONS, TEXT_SIZE, UI_SCALE, defaultKeys, type KeyAction, type Settings } from '../meta/save.ts';
import { Pen } from '../story/draw.ts';
import { roll } from '../story/kit.ts';
import { el } from './hud.ts';
import { checkBox, faderArt, indexTab, noteTag, parchment, pixelButton, pixelCanvas, pixelText } from './paper.ts';
import { play, retune } from './sound.ts';

type Tab = 'sound' | 'display' | 'story' | 'controls';
const TABS: [Tab, string, string, string][] = [['sound', 'Sound', '#d9c55a', '#b8a440'], ['display', 'Display', '#9ad0e0', '#7ab4c8'], ['story', 'Story', '#f2b8c2', '#d68794'], ['controls', 'Controls', '#b8d89a', '#94b878']];
let tab: Tab = 'sound'; // the tab last looked at, kept while the game runs
let parch: string | undefined; // the paper's texture, made once
let listening: KeyAction | undefined; // the shortcut waiting for its new key

/** The UI scale and text size, on the page (index.html's CSS reads them). */
export function applyScale() {
  const s = profile.settings, root = document.documentElement.style;
  root.setProperty('--ui', String(s.ui));
  root.setProperty('--text', String(s.text));
  document.documentElement.classList.toggle('cb', s.colorblind);
}

/** How a key is named on the cheat sheet. */
export const keyName = (k: string) => ({ ' ': 'Space', Escape: 'Esc', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' } as Record<string, string>)[k] ?? (k.length === 1 ? k.toUpperCase() : k);
const INK = '#3a2614'; // brown ink on the parched paper
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The sheet. `back` leaves it; `again` draws it again after a change; `tags` are post-its for its foot (each a label
 *  and what pressing it does); `note` is pencilled under the settings (the fight's: what changes only next fight). */
export function settingsSheet(o: { back: () => void; again: () => void; tags?: [string, () => void][]; note?: string; small?: boolean }): HTMLElement {
  const s = profile.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { s[k] = v; persist(); retune(); applyScale(); o.again(); };
  const row = (label: string, ...controls: HTMLElement[]) => el('div', { className: 'srow' }, el('span', { className: 'label', title: label }, pixelText(label.toUpperCase(), INK, 2)), el('div', { className: 'ctl' }, ...controls));
  /** One box to tick for each choice. */
  const boxes = (label: string, options: [string, () => boolean, () => void][]) =>
    el('div', { className: 'boxes', role: 'radiogroup', ariaLabel: label }, ...options.map(([text, on, pick]) => {
      const [w, h, d] = checkBox(text, on, INK), b = pixelButton(text, w, h, d, pick, 'box');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on()));
      return b;
    }));
  const choice = (label: string, k: 'gore' | 'quality' | 'story', options: string[]) => boxes(label, options.map((v) => [v[0].toUpperCase() + v.slice(1), () => s[k] === v, () => set(k, v as never)]));
  const onOff = (label: string, k: 'lefty' | 'mix' | 'shake' | 'colorblind') => boxes(label, [['Off', () => !s[k], () => set(k, false)], ['On', () => s[k], () => set(k, true)]]);

  const tabs = TABS.map(([t, label, col, dark]) => { const [w, h, d] = indexTab(label.toUpperCase(), col, dark, () => tab === t); const b = pixelButton(label, w, h, d, () => { if (tab !== t) { tab = t; o.again(); } }, 'tab'); b.setAttribute('aria-pressed', String(tab === t)); return b; });
  const rows: Record<Tab, () => HTMLElement[]> = {
    sound: () => [
      row('Master volume', fader('Master volume', 'master')),
      row('Effects volume', fader('Effects volume', 'sfx')),
      row('Music volume', fader('Music volume', 'music')),
      // How people sound in the story: a blip a letter as the words type (each speaker their own), or the recorded voices.
      // The soldiers' radio calls play with either; Off silences both.
      row('Voices', boxes('Voices', ([['Blips', 'blips'], ['Voice acting', 'acting'], ['Off', 'off']] as const).map(([text, v]): [string, () => boolean, () => void] => [text, () => s.voices === v, () => set('voices', v)]))),
      // Spotify and the like keep playing: the game's own music stops, and on an iPhone its sound obeys the silent switch.
      row('Play over other apps\' music', onOff('Play over other apps\' music', 'mix')),
    ],
    display: () => [
      row('Gore', choice('Gore', 'gore', ['none', 'some', 'normal']), preview(gorePicture)),
      row('Quality', choice('Quality', 'quality', ['low', 'medium', 'high'])),
      // Fewer bodies lying about is lighter on a slow device.
      row('Dead bodies', boxes('Dead bodies', BODIES.map((n) => [n ? String(n) : 'None', () => s.bodies === n, () => set('bodies', n)])), preview(bodiesPicture)),
      row('Dust on the screen', fader('Dust on the screen', 'dust'), preview(dustPicture)),
      row('Screen shake', onOff('Screen shake', 'shake')),
      // Good and bad on the map (health, where things fit) in blue and orange, not green and red.
      row('Colour-blind colours', onOff('Colour-blind colours', 'colorblind')),
      row('Controls size', fader('Controls size', 'ui', UI_SCALE)),
      row('Text size', fader('Text size', 'text', TEXT_SIZE)),
    ],
    // The story between cities: every scene, only their words, or none (the notebook still fills in).
    story: () => [row('Story scenes', choice('Story scenes', 'story', ['full', 'short', 'off']))],
    // Left-handed, and the keyboard's shortcuts: the cheat sheet, each one's key pressed to change it.
    controls: () => [
      row('Left-handed', onOff('Left-handed', 'lefty')),
      el('div', { className: 'keys', role: 'list', ariaLabel: 'Keyboard shortcuts' }, ...(Object.keys(KEY_ACTIONS) as KeyAction[]).map((a) => el('div', { className: 'key', role: 'listitem' },
        el('span', {}, KEY_ACTIONS[a][1]),
        el('button', { type: 'button', className: listening === a ? 'listening' : '', textContent: listening === a ? 'Press a key…' : keyName(s.keys[a]), onclick: () => { listening = listening === a ? undefined : a; o.again(); } })))),
      el('div', { className: 'row' }, el('button', { type: 'button', textContent: 'Reset keys', onclick: () => { listening = undefined; set('keys', defaultKeys()); } })),
    ],
  };
  const [bw, bh, bd] = noteTag('BACK', '#c9a86a', '#9c7f48', '#2e2a22');
  const sheet = el('div', { className: `panel settings form${o.small ? ' window' : ''}`, ariaLabel: 'Settings', ...(o.small ? { role: 'dialog' } : {}) },
    el('div', { className: 'formhead' }, pixelButton('Back', bw, bh, bd, o.back, 'tag'), el('h2', { ariaLabel: 'Settings' }, gear(), pixelText('SETTINGS', INK, 3)), el('div', { className: 'tabs' }, ...tabs)),
    el('div', { className: 'rows' }, ...rows[tab]()),
    ...(o.note ? [el('p', { className: 'pencil' }, o.note)] : []),
    el('div', { className: 'sheetfoot' }, storage(), ...(o.tags ?? []).map(([label, press]) => { const [w, h, d] = noteTag(label.toUpperCase(), '#9ad0e0', '#7ab4c8', '#1c3a48'); return pixelButton(label, w, h, d, press, 'tag'); })),
    el('p', { className: 'build' }, `build ${__BUILD__}`), // which version this device is running, in pencil
  );
  sheet.style.setProperty('--parch', `url(${parch ??= parchment()})`);
  // A shortcut waiting for its key takes the next one pressed (Escape keeps the old one); a key another shortcut had
  // goes to it in exchange.
  if (listening) {
    const take = (e: KeyboardEvent) => {
      if (!listening || !sheet.isConnected) return removeEventListener('keydown', take, true);
      e.preventDefault();
      e.stopPropagation();
      removeEventListener('keydown', take, true);
      const a = listening;
      listening = undefined;
      if (e.key !== 'Escape' || a === 'deselect') {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key, other = (Object.keys(s.keys) as KeyAction[]).find((b) => b !== a && s.keys[b] === key);
        if (other) s.keys[other] = s.keys[a];
        s.keys[a] = key;
      }
      set('keys', { ...s.keys });
    };
    addEventListener('keydown', take, true);
  }
  return sheet;
}

/** A level from 0 to 100, set by dragging the knob (or the arrow keys): heard as it moves, kept when let go. */
function fader(label: string, k: 'master' | 'sfx' | 'music' | 'dust' | 'ui' | 'text', [lo, hi]: readonly [number, number] = [0, 1]) {
  const s = profile.settings, cv = el('canvas', { width: 124, height: 18, ariaHidden: 'true' }), pen = new Pen(cv.getContext('2d')!);
  cv.style.width = '248px';
  const box = el('div', { className: 'fader', role: 'slider', tabIndex: 0, ariaLabel: label, ariaValueMin: '0', ariaValueMax: '100' }, cv);
  box.ariaValueMin = String(Math.round(lo * 100));
  box.ariaValueMax = String(Math.round(hi * 100));
  const show = () => { faderArt(pen, (s[k] - lo) / (hi - lo), document.activeElement === box, s[k] * 100); box.ariaValueNow = String(Math.round(s[k] * 100)); };
  const done = () => { persist(); retune(); if (k === 'master' || k === 'sfx') play('rifleman'); }; // a shot to hear the level by
  const to = (v: number) => { s[k] = Math.max(lo, Math.min(hi, Math.round((lo + v * (hi - lo)) * 100) / 100)); retune(); applyScale(); show(); }; // music, dust and sizes follow it at once
  const at = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); to(((e.clientX - r.left) / r.width * 124 - 4) / 84); };
  box.onpointerdown = (e) => { box.setPointerCapture(e.pointerId); at(e); };
  box.onpointermove = (e) => { if (box.hasPointerCapture(e.pointerId)) at(e); };
  box.onpointerup = (e) => { box.releasePointerCapture(e.pointerId); done(); };
  box.onkeydown = (e) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, Home: -1, End: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    to((s[k] - lo) / (hi - lo) + step);
    done();
  };
  box.onfocus = show;
  box.onblur = show;
  show();
  return box;
}

/** The gear off the war room's settings note, still. */
function gear() {
  const cv = el('canvas', { width: 19, height: 19, ariaHidden: 'true' }), p = new Pen(cv.getContext('2d')!);
  for (let dy = -9; dy <= 9; dy++)
    for (let dx = -9; dx <= 9; dx++) {
      const r = Math.hypot(dx, dy), tooth = ((((Math.atan2(dy, dx) / (Math.PI * 2)) * 8) % 1) + 1) % 1 < 0.45;
      if (r >= 2.3 && (r <= 5.6 || (tooth && r <= 8.4))) p.px(9 + dx, 9 + dy, r > 4.6 && !(tooth && r > 5.6) ? '#5a2a34' : dx + dy < 0 ? '#8a4452' : '#6e3440');
    }
  cv.style.width = '57px';
  return cv;
}

/** A little live picture beside a setting: a corner of a street. */
const preview = (draw: (p: Pen, t: number) => void) => el('span', { className: 'preview' }, pixelCanvas(54, 30, draw));
function street(p: Pen) {
  p.rect(0, 0, 54, 30, '#2c2e2f');
  for (let k = 0; k < 40; k++) p.px(roll(k, 3) * 54, roll(3, k) * 30, k % 3 ? '#232526' : '#383a3a');
  p.rect(0, 14, 54, 1, '#c4a058'); p.rect(0, 16, 54, 1, '#c4a058'); // the double yellow line
  p.rect(0, 0, 54, 1, '#141516'); p.rect(0, 29, 54, 1, '#141516'); p.rect(0, 0, 1, 30, '#141516'); p.rect(53, 0, 1, 30, '#141516');
}
/** Someone dead in the street, from above, head toward +x. */
function body(p: Pen, x: number, y: number, flip: boolean) {
  const d = flip ? -1 : 1;
  p.rect(x - 5 * d - (flip ? 4 : 0), y - 1, 5, 3, '#3a3d40'); // legs
  p.rect(x - (flip ? 4 : 0), y - 2, 5, 5, '#48512f'); // the body
  p.rect(x + 5 * d - (flip ? 2 : 0), y - 1, 3, 3, '#7b886f'); // the head
}
function gorePicture(p: Pen) {
  street(p);
  const gore = profile.settings.gore, splats = gore === 'none' ? 0 : gore === 'some' ? 2 : 6;
  for (let k = 0; k < splats; k++) { const x = 14 + roll(k, 7) * 26, y = 6 + roll(7, k) * 18, r = gore === 'normal' ? 3 : 2; p.rect(x - r, y - 1, r * 2, 3, '#4a2321'); p.rect(x - 1, y - r, 3, r * 2, '#6e332d'); }
  if (gore === 'normal') { p.rect(20, 8, 12, 9, '#4a2321'); p.rect(22, 9, 8, 7, '#6e332d'); }
  body(p, 26, 12, false);
}
function bodiesPicture(p: Pen) {
  street(p);
  const n = profile.settings.bodies, shown = n ? Math.min(9, Math.ceil(n / 40)) : 0;
  for (let k = 0; k < shown; k++) body(p, 8 + roll(k, 11) * 38, 5 + roll(11, k) * 20, k % 2 === 1);
}
function dustPicture(p: Pen, t: number) {
  street(p);
  body(p, 26, 12, false);
  const n = Math.round(profile.settings.dust * 30);
  for (let k = 0; k < n; k++) { const x = (roll(k, 5) * 54 + t * (8 + roll(5, k) * 14)) % 54, y = roll(k, 9) * 30 + Math.sin(t * 1.3 + k) * 1.5; p.px(x, y, ['#c9bc94', '#a49873', '#eadfae'][k % 3]); }
}

/** How much of browser storage (about 5 MB) the saves take, as a gauge; and how much the game keeps on this device in
 *  all once installed (its offline copy), as far as the browser says. */
function storage(): HTMLElement {
  const LIMIT = 5 * 1024 * 1024;
  let bytes = 0;
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k)!;
      if (key.startsWith('dietrying.')) bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2; // two bytes a character
    }
  } catch { /* storage blocked: nothing is kept */ }
  const share = Math.min(1, Math.max(0.01, bytes / LIMIT)), text = el('small', {}, `Saves ${size(bytes)} of about 5 MB`);
  navigator.storage?.estimate?.().then(({ usage }) => { if (usage) text.textContent += ` · ${size(usage)} in all on this device`; }, () => {});
  const gauge = pixelCanvas(70, 14, (p) => {
    p.rect(0, 0, 70, 14, '#3a3d40'); p.rect(1, 1, 68, 12, '#1a1c14'); p.rect(2, 2, 66, 1, '#5c6064');
    const w = Math.round(64 * share);
    p.rect(3, 4, w, 7, share > 0.8 ? '#c9473a' : '#c4a058'); p.rect(3, 4, w, 1, share > 0.8 ? '#f08a78' : '#f0d890');
    for (let x = 3; x < 67; x += 8) p.rect(x, 11, 1, 1, '#5c6064');
  });
  return el('div', { className: 'storage', role: 'img', ariaLabel: text.textContent ?? '' }, pixelText('STORAGE', INK, 2), gauge, text);
}
