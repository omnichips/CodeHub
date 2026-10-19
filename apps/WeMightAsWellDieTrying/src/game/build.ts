// Which build this is, as the main menu and Settings show it. Press it to swap between the build code
// (day, month, year, then the time with A or P: 19102026.0100P) and the plain date and time (19/10/2026 1:00 PM).
// All in Philippine time. Change `BUILD` for each release.
import { el } from './hud.ts';

const BUILD = { version: '0.1.2', at: '2026-10-19 14:20' }; // Philippine time, 24 hour

const [date, time] = BUILD.at.split(' '), [y, mo, d] = date.split('-'), [h, mi] = time.split(':').map(Number);
const h12 = h % 12 || 12, pm = h >= 12;
const code = `${d}${mo}${y}.${String(h12).padStart(2, '0')}${String(mi).padStart(2, '0')}${pm ? 'P' : 'A'}`;
const plain = `${d}/${mo}/${y} ${h12}:${String(mi).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
let plainOn = false; // shared, so the menu and Settings agree

/** The build label: a button that flips between the code and the date. */
export function buildTag(prefix: string, className = '') {
  const b = el('button', { type: 'button', className: `buildtag ${className}`.trim(), title: 'Press to show the date' });
  const show = () => { b.textContent = `${prefix} ${BUILD.version} (${plainOn ? plain : code})`; };
  b.onclick = () => { plainOn = !plainOn; show(); };
  show();
  return b;
}
