// The settings rows, shared by the menu's Settings and the one opened during a fight: gore, quality, bodies, hand,
// volumes, dust on the screen, playing over other apps' music, and the storage used.
import { persist, profile } from '../meta/profile.ts';
import { BODIES, type Settings } from '../meta/save.ts';
import { el } from './hud.ts';
import { play, retune } from './sound.ts';

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Each setting as a row; `again` draws them again after a change. */
export function settingRows(again: () => void): HTMLElement[] {
  const s = profile.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { s[k] = v; persist(); retune(); again(); };
  const seg = (label: string, options: [string, () => boolean, () => void][]) =>
    el('div', { className: 'row' }, el('span', {}, label), el('div', { className: 'seg' },
      ...options.map(([text, on, pick]) => el('button', { type: 'button', textContent: text, ariaPressed: String(on()), onclick: pick }))));
  const choice = (label: string, k: 'gore' | 'quality' | 'story', options: string[]) => seg(label, options.map((o) => [o[0].toUpperCase() + o.slice(1), () => s[k] === o, () => set(k, o as never)]));
  const slider = (label: string, k: 'master' | 'sfx' | 'music' | 'dust') => {
    const input = el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(s[k] * 100)), ariaLabel: label });
    input.oninput = () => { s[k] = Number(input.value) / 100; retune(); }; // music and dust follow the slider
    input.onchange = () => { s[k] = Number(input.value) / 100; persist(); retune(); if (k === 'master' || k === 'sfx') play('rifleman'); }; // a shot to hear the level by
    return el('div', { className: 'row' }, el('span', {}, label), input);
  };
  return [
    choice('Gore', 'gore', ['none', 'some', 'normal']),
    choice('Quality', 'quality', ['low', 'medium', 'high']),
    // The story between cities: every scene, only their words, or none (the notebook still fills in).
    choice('Story scenes', 'story', ['full', 'short', 'off']),
    // How people sound: a blip a letter as the story's words type (each speaker their own), the recorded voices (the
    // story's lines and the soldiers' radio calls), or neither.
    seg('Voices', ([['Blips', 'blips'], ['Voice acting', 'acting'], ['Off', 'off']] as const).map(([text, v]): [string, () => boolean, () => void] => [text, () => s.voices === v, () => set('voices', v)])),
    // Fewer bodies lying about is lighter on a slow device.
    seg('Dead bodies', BODIES.map((n) => [n ? String(n) : 'None', () => s.bodies === n, () => set('bodies', n)])),
    seg('Left-handed', [['Off', () => !s.lefty, () => set('lefty', false)], ['On', () => s.lefty, () => set('lefty', true)]]),
    slider('Master volume', 'master'),
    slider('Effects volume', 'sfx'),
    slider('Music volume', 'music'),
    slider('Dust on the screen', 'dust'),
    // Spotify and the like keep playing: the game's own music stops, and on an iPhone its sound obeys the silent switch.
    seg('Play over other apps\' music', [['Off', () => !s.mix, () => set('mix', false)], ['On', () => s.mix, () => set('mix', true)]]),
    storage(),
  ];
}

/** How much this device keeps for the game: the saves and settings, in browser storage that holds about 5 MB (the
 *  bar), and everything else besides once it is installed (its offline copy), as far as the browser says. */
function storage(): HTMLElement {
  const LIMIT = 5 * 1024 * 1024;
  let bytes = 0;
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k)!;
      if (key.startsWith('dietrying.')) bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2; // two bytes a character
    }
  } catch { /* storage blocked: nothing is kept */ }
  const fill = el('i'), text = el('small', {}, `Saves ${size(bytes)} of about 5 MB`);
  fill.style.width = `${Math.min(100, Math.max(1, (bytes / LIMIT) * 100))}%`;
  fill.classList.toggle('full', bytes > LIMIT * 0.8);
  navigator.storage?.estimate?.().then(({ usage }) => { if (usage) text.textContent += ` · ${size(usage)} in all on this device`; }, () => {});
  return el('div', { className: 'row storage' }, el('span', {}, 'Storage'), el('div', { className: 'meter', role: 'img', ariaLabel: text.textContent ?? '' }, fill), text);
}
