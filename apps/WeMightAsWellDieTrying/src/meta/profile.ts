// The one save in use, shared by the menu and the game. Change profile.save, then persist().
import newYork from '../data/maps/new-york.json' with { type: 'json' };
import waves from '../data/waves.json' with { type: 'json' };
import type { MapData } from '../sim/grid.ts';
import type { WavePlan } from '../sim/world.ts';
import { load, store, type Save } from './save.ts';

export const profile: { save: Save } = { save: load() };
export const persist = () => store(profile.save);

/** The maps, in the order they unlock: the next opens once the one before is cleared. */
export const MAPS: { id: string; name: string; data: MapData; waves: WavePlan }[] = [{ id: 'new-york', name: 'New York', data: newYork, waves: waves['new-york'] }];
export const unlocked = (k: number) => k === 0 || !!profile.save.cleared[MAPS[k - 1].id];
