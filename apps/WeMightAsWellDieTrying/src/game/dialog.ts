// A question on a sheet of parched paper pinned over everything (deleting a save, starting over in a slot, the
// difficulty, retreating): a title, a line or two, and a choice for each answer. Escape or a tap outside it is the
// last choice (keep it as the safe one).
import { el } from './hud.ts';
import { parchment } from './paper.ts';

let parch: string | undefined;

export interface Choice { label: string; act: () => void; go?: boolean; note?: string }

export function ask(title: string, body: string, choices: Choice[]) {
  const close = () => { veil.remove(); removeEventListener('keydown', key, true); };
  const safe = choices[choices.length - 1];
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); safe.act(); } };
  const sheet = el('div', { className: 'sheet', role: 'alertdialog', ariaLabel: title },
    el('span', { className: 'pin', ariaHidden: 'true' }),
    el('h2', {}, title), el('p', {}, body),
    el('div', { className: 'choices' }, ...choices.map((c) => el('button', { type: 'button', className: c.go ? 'go' : '', onclick: () => { close(); c.act(); } }, c.label, ...(c.note ? [el('small', {}, c.note)] : [])))));
  sheet.style.setProperty('--parch', `url(${parch ??= parchment()})`);
  const veil = el('div', { className: 'dialog', onclick: (e) => { if (e.target === veil) { close(); safe.act(); } } }, sheet);
  document.body.append(veil);
  addEventListener('keydown', key, true);
  sheet.querySelector('button')?.focus();
}
