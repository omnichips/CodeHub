// The save in use and the settings, shared by the menu and the game. Change profile.save or profile.settings, then
// persist(). On start the save opened most recently is the one in use.
import brooklyn from '../data/maps/brooklyn.json' with { type: 'json' };
import mainStreet from '../data/maps/main-street.json' with { type: 'json' };
import newYork from '../data/maps/new-york.json' with { type: 'json' };
import waves from '../data/waves.json' with { type: 'json' };
import type { MapData } from '../sim/grid.ts';
import { UNITS, type WavePlan } from '../sim/world.ts';
import { build } from './progress.ts';
import { SLOTS, fresh, load, loadSettings, store, storeSettings } from './save.ts';

/** Every slot: its save, or undefined if empty. */
export const saves = () => Array.from({ length: SLOTS }, (_, k) => load(k));

const found = saves(), last = found.reduce((best, s, k) => (s && (!found[best] || s.played > found[best]!.played) ? k : best), 0);
export const profile = { slot: last, save: found[last] ?? fresh('Save 1'), settings: loadSettings() };
export const persist = () => { store(profile.slot, profile.save); storeSettings(profile.settings); };

/** Makes a slot's save (or the one given, for a new or imported save) the one in use. */
export function open(slot: number, save = load(slot) ?? fresh(`Save ${slot + 1}`)) {
  profile.slot = slot;
  profile.save = save;
  save.played = Date.now();
  persist();
}

/** The maps, in the order they unlock: the next opens once the one before is cleared. */
export const MAPS: { id: string; name: string; data: MapData; waves: WavePlan }[] = [
  { id: 'main-street', name: 'Main Street', data: mainStreet, waves: waves['main-street'] }, // one straight street: learn the game here
  { id: 'brooklyn', name: 'Brooklyn', data: brooklyn, waves: waves.brooklyn }, // an F: two ways in
  { id: 'new-york', name: 'New York', data: newYork, waves: waves['new-york'] }, // the city grid: three ways in
];
export const unlocked = (k: number) => k === 0 || !!profile.save.cleared[MAPS[k - 1].id];

/** About how many zombies a map sends for each soldier the save in use can field: a feel for how hard it is. */
export function perSoldier(k: number) {
  const zombies = MAPS[k].waves.waves.reduce((n, w) => n + Object.values(w.spawn).reduce((a: number, b) => a + (b ?? 0), 0), 0);
  const men = Object.entries(build(profile.save.skills).loadout).reduce((n, [id, c]) => n + (id in UNITS ? c : 0), 0);
  return Math.round(zombies / Math.max(1, men));
}
