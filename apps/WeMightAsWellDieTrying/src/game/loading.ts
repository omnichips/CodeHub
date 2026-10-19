// The black loading screen (#loading in index.html): a soldier running over a progress bar. The bar is a CSS transition
// that eases toward 90% and is sent to the end by stopLoading, so it keeps moving while the page is busy building a scene.
import { play } from './sound.ts';

const MIN = 700; // shown at least this long (ms), so a quick load is not a flash
/** One under the bar each time it shows. */
const TIPS = [
  'Shotguns reload slower than you think.',
  'A soldier at a window cannot die. He cannot leave it mid-wave, either.',
  "Pull a cone's handle farther out for a narrower, longer reach.",
  'Pause any time. Orders still go through while paused.',
  'A bloater bursting hurts the zombies round it, and the rest lurch forward.',
  'Armour shrugs off bullets and fire, not blasts or piercing rounds.',
  'Roadblocks buy time. Zombies go round them if the way round is short.',
  'Strikes cool down. Call them in where the horde bunches up.',
  'A medic keeps a line alive. Keep him behind it.',
  'Screamers speed up everything around them. Kill them first.',
  'The defence you started with last time is put down for you. Clear takes it all back.',
  'Retreat pays the chips from your kills. Losing pays the same.',
  'Clear a city to open the next. Every city cleared pays a bonus once.',
  'Tap a soldier in a fight to see his kills and pull him out.',
  'A light by a door or a car means someone is hiding there. Hold the spot with a soldier for 3 seconds to bring them out.',
  'Each civilian you get to the safe zone pays a tenth of your kill chips again.',
  "Rain and fog cut every soldier's range a little. Plan your cones shorter.",
  'The break between waves is the time to bring civilians out.',
];
let since = 0, timer = 0, active = false, wipeTimer = 0;

const parts = () => { const r = document.getElementById('loading')!; return [r, r.querySelector('i') as HTMLElement] as const; };

export const loadingActive = () => active;

export function startLoading() {
  const [r, bar] = parts();
  clearTimeout(timer);
  active = true;
  since = performance.now();
  bar.style.transition = 'none';
  bar.style.transform = 'scaleX(0)';
  void bar.offsetWidth; // commit the reset before the climb starts
  bar.style.transition = '';
  bar.style.transform = 'scaleX(0.9)';
  r.querySelector('p')!.textContent = TIPS[(Math.random() * TIPS.length) | 0];
  r.classList.remove('done');
}

export function stopLoading() {
  if (!active) return;
  const [r, bar] = parts();
  bar.style.transition = 'transform 0.25s';
  bar.style.transform = 'scaleX(1)';
  timer = window.setTimeout(() => { r.classList.add('done'); active = false; play('groan', 0.6); }, Math.max(0, MIN - (performance.now() - since)) + 250);
}

/** A wipe between menu screens: black sweeps across with the soldier running in it, `swap` changes the screen while
 *  it covers everything, and it sweeps on off the other side only once the new screen has been drawn. (On a slow phone
 *  building the screen takes longer than the sweep: a sweep on a timer showed the old screen again, then the new.) */
export function wipe(swap: () => void) {
  const w = document.getElementById('wipe');
  if (!w || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
  clearTimeout(wipeTimer);
  w.classList.remove('in', 'out');
  void w.offsetWidth; // restart the sweep
  w.classList.add('in');
  wipeTimer = window.setTimeout(() => {
    swap();
    // A frame for the new screen to be laid out and one for it to be painted, then off.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      w.classList.replace('in', 'out');
      wipeTimer = window.setTimeout(() => w.classList.remove('out'), 320);
    }));
  }, 260);
}

/** Runs `work` behind the loading screen, once it has faded in (for a screen that is slow to build). */
export function whileLoading(work: () => void | Promise<void>) {
  if (active) { void work(); return; }
  startLoading();
  setTimeout(async () => { await work(); stopLoading(); }, 320);
}
