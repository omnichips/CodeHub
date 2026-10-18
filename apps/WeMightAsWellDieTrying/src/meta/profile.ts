// The save in use and the settings, shared by the menu and the game. Change profile.save or profile.settings, then
// persist(). On start the save opened most recently is the one in use.
import chicago from '../data/maps/chicago.json' with { type: 'json' };
import london from '../data/maps/london.json' with { type: 'json' };
import mainStreet from '../data/maps/main-street.json' with { type: 'json' };
import newYork from '../data/maps/new-york.json' with { type: 'json' };
import manila from '../data/maps/manila.json' with { type: 'json' };
import mexico from '../data/maps/mexico.json' with { type: 'json' };
import rome from '../data/maps/rome.json' with { type: 'json' };
import tokyo from '../data/maps/tokyo.json' with { type: 'json' };
import waves from '../data/waves.json' with { type: 'json' };
import whiteHouse from '../data/maps/white-house.json' with { type: 'json' };
import type { MapData } from '../sim/grid.ts';
import { UNITS, type WavePlan } from '../sim/world.ts';
import { build } from './progress.ts';
import { DIFFICULTY, SLOTS, fresh, load, loadSettings, store, storeSettings } from './save.ts';

/** Every slot: its save, or undefined if empty. */
export const saves = () => Array.from({ length: SLOTS }, (_, k) => load(k));

/** The slot played most recently, or -1 if every slot is empty. */
export const lastPlayed = (found = saves()) => found.reduce((best, s, k) => (s && (best < 0 || s.played > found[best]!.played) ? k : best), -1);

const found = saves(), last = Math.max(0, lastPlayed(found));
export const profile = { slot: last, save: found[last] ?? fresh('Save 1'), settings: loadSettings() };
export const persist = () => { store(profile.slot, profile.save); storeSettings(profile.settings); };

/** Makes a slot's save (or the one given, for a new or imported save) the one in use. */
export function open(slot: number, save = load(slot) ?? fresh(`Save ${slot + 1}`)) {
  profile.slot = slot;
  profile.save = save;
  save.played = Date.now();
  persist();
}

/** The maps, in the order they unlock: the next opens once the one before is cleared. Each safe zone shows how its
 *  people are to get out, as the story has it (`evac`; a helicopter where none is given). */
export const MAPS: { id: string; name: string; data: MapData; waves: WavePlan }[] = [
  { id: 'main-street', name: 'Main Street', data: { ...mainStreet, evac: 'bus' }, waves: waves['main-street'] }, // one straight street: learn the game here
  { id: 'chicago', name: 'Chicago', data: { ...chicago, evac: 'ferry' }, waves: waves.chicago }, // an F: two ways in
  { id: 'new-york', name: 'New York', data: { ...newYork, evac: 'ship' }, waves: waves['new-york'] }, // the city grid: three ways in
  // Maps 4 to 9 are drawn by scripts/maps.ts.
  { id: 'manila', name: 'Manila', data: { ...manila, evac: 'ship' }, waves: waves.manila }, // the slums: shanties, alleys, a canal
  { id: 'mexico', name: 'Mexico City', data: mexico, waves: waves.mexico }, // the Zócalo: open ground, the cathedral and palace standing in it
  { id: 'rome', name: 'Rome', data: { ...rome, evac: 'stairs' }, waves: waves.rome }, // Via Labicana bent into an M, the safe zone where it dips in the middle
  { id: 'tokyo', name: 'Tokyo', data: { ...tokyo, evac: 'queue' }, waves: waves.tokyo }, // Shibuya: the safe zone in the middle of the scramble crossing, the horde from every side
  { id: 'london', name: 'London', data: { ...london, evac: 'trucks' }, waves: waves.london }, // one long bridge, end to end, no buildings
  { id: 'white-house', name: 'White House', data: whiteHouse, waves: waves['white-house'] }, // the last stand: one open lawn, the horde along one whole side
];
/** Each city's weather and time of day, the same every fight. Rain and fog cut every soldier's range by the
 *  difficulty's `weather` share; the rest is only how it looks. */
export type Weather = 'clear' | 'rain' | 'fog' | 'night' | 'dusk' | 'haze' | 'dust';
export const WEATHER: Record<string, Weather> = { london: 'rain', chicago: 'fog', tokyo: 'night', rome: 'dusk', manila: 'haze', mexico: 'dust' };
export const weatherOf = (id: string): Weather => WEATHER[id] ?? 'clear';
export const blinds = (w: Weather) => w === 'rain' || w === 'fog';
/** The weather in a few words, with what it does on the save's difficulty: "Rain: -5% range". */
export function weatherLine(id: string) {
  const w = weatherOf(id), name = w[0].toUpperCase() + w.slice(1);
  return blinds(w) ? `${name}: -${Math.round(DIFFICULTY[profile.save.difficulty].weather * 100)}% range` : w === 'clear' ? 'Clear' : `${name}: no effect`;
}

/** Open once the map before it is cleared, or if cleared already (a save from before the maps were put in this order). */
export const unlocked = (k: number) => k === 0 || !!profile.save.cleared[MAPS[k - 1].id] || !!profile.save.cleared[MAPS[k].id];

/** About how many zombies a map sends for each soldier the save in use can field: a feel for how hard it is. */
export function perSoldier(k: number) {
  const zombies = MAPS[k].waves.waves.reduce((n, w) => n + Object.values(w.spawn).reduce((a: number, b) => a + (b ?? 0), 0), 0);
  const men = Object.entries(build(profile.save.skills).loadout).reduce((n, [id, c]) => n + (id in UNITS ? c : 0), 0);
  return Math.round(zombies / Math.max(1, men));
}
