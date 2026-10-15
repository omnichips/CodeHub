// If the game throws, it stops and says so: what went wrong, with a report to copy and send (the error, where in the
// code, the build, the browser, and how the fight stood). A hang cannot be caught this way; nothing runs during one.
import type Phaser from 'phaser';
import { profile } from '../meta/profile.ts';
import { el } from './hud.ts';
import type { Game } from './scene.ts';

/** Browser noise that is not the game breaking. */
const HARMLESS = /ResizeObserver loop|^Script error\.?$/;

export function watchForCrashes(game: Phaser.Game) {
  addEventListener('error', (e) => {
    if (/^(chrome|moz|safari(-web)?)-extension:/.test(e.filename ?? '') || HARMLESS.test(e.message)) return;
    crash(game, e.error ?? e.message);
  });
  addEventListener('unhandledrejection', (e) => crash(game, e.reason));
}

function crash(game: Phaser.Game, error: unknown) {
  if (document.getElementById('crash')) return; // the first error is the one that matters
  try { game.pause(); } catch { /* already broken */ }
  const e = error instanceof Error ? error : new Error(String(error));
  const lines = [
    'We Might As Well Die Trying: crash report',
    `When: ${new Date().toISOString()}`,
    `Build: ${__BUILD__}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    `Settings: ${JSON.stringify(profile.settings)}`,
    ...fight(game),
    '',
    // Chrome's stack starts with the error itself; Safari's and Firefox's do not.
    ...(e.stack?.startsWith(`${e.name}: ${e.message}`) ? [] : [`${e.name}: ${e.message}`]),
    e.stack ?? '(no stack)',
  ];
  const report = lines.join('\n');
  const text = el('textarea', { readOnly: true, value: report, ariaLabel: 'Crash report' });
  const copy = el('button', { type: 'button', className: 'go', textContent: 'Copy report' });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(report); } catch { text.select(); document.execCommand('copy'); }
    copy.textContent = 'Copied';
  };
  document.body.append(el('div', { id: 'crash', role: 'alertdialog' },
    el('h2', {}, 'The game crashed'),
    el('p', {}, 'Copy this report and send it over. Your save is safe up to the last run you finished.'),
    text,
    el('div', { className: 'row' }, copy, el('button', { type: 'button', textContent: 'Reload', onclick: () => location.reload() })),
  ));
}

/** How the fight stood, if there was one. */
function fight(game: Phaser.Game): string[] {
  try {
    if (!game.scene.isActive('game')) return ['In: the menu'];
    const g = game.scene.getScene('game') as Game, w = g.world;
    return [
      `In: ${g.mapId}, ${w.phase}, wave ${w.wave + 1}/${w.waves}, ${w.time.toFixed(1)} s in, speed ${g.speed}x`,
      `Zombies alive ${w.living}, kills ${w.kills}, leaks ${w.leaks}/${w.leakLimit}`,
      `Soldiers ${w.soldiers.filter((s) => !s.dead).length} standing of ${w.soldiers.length}, roadblocks ${w.roadblocks.length}, structures ${w.structures.length}, strikes on the way ${w.strikes.length}`,
    ];
  } catch (err) {
    return [`In: (could not read the fight: ${String(err)})`];
  }
}
