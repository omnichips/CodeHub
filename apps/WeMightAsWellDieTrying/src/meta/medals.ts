// Medals: earned at the end of a fight, kept in the save, pinned to its dossier. Each is checked against the fight
// just over and the save's totals after it.
import type { Save } from './save.ts';

export interface Fight {
  won: boolean;
  map: string; // the city's id
  last: boolean; // the last city
  leaks: number;
  leakLimit: number;
  fallen: number; // soldiers killed
  best: number; // the most kills one soldier made
  timeBonus: boolean; // won fast enough for the time bonus
  saved: number; // civilians brought to the safe zone
  civilians: number; // of how many
}

/** id, name, what earns it, its colour (the ribbon), and the test. */
export const MEDALS: { id: string; name: string; desc: string; ribbon: [string, string]; test: (f: Fight, s: Save) => boolean }[] = [
  { id: 'first-blood', name: 'First Blood', desc: 'Kill your first zombie.', ribbon: ['#7a2620', '#c9473a'], test: (_, s) => s.stats.kills >= 1 },
  { id: 'held', name: 'Held the Line', desc: 'Clear a city.', ribbon: ['#2f4a6a', '#9ad0e0'], test: (f) => f.won },
  { id: 'flawless', name: 'Not One Through', desc: 'Win a fight with no leaks.', ribbon: ['#e2dccb', '#2f4a6a'], test: (f) => f.won && f.leaks === 0 },
  { id: 'nobody', name: 'Nobody Left Behind', desc: 'Win a fight without losing a soldier.', ribbon: ['#48512f', '#c4a058'], test: (f) => f.won && f.fallen === 0 },
  { id: 'close', name: 'Close Call', desc: 'Win with the leaks one short of losing.', ribbon: ['#c9473a', '#141516'], test: (f) => f.won && Number.isFinite(f.leakLimit) && f.leaks === f.leakLimit - 1 },
  { id: 'quick', name: 'Ahead of Schedule', desc: 'Win fast enough for the time bonus.', ribbon: ['#d6a23e', '#7a5a20'], test: (f) => f.won && f.timeBonus },
  { id: 'rescue', name: 'Get Them Out', desc: 'Bring every civilian in a city to the safe zone.', ribbon: ['#f2e6d6', '#4f8a86'], test: (f) => f.civilians > 0 && f.saved === f.civilians },
  { id: 'army', name: 'One-Man Army', desc: 'One soldier makes 300 kills in a fight.', ribbon: ['#5e1d18', '#f0c860'], test: (f) => f.best >= 300 },
  { id: 'body-count', name: 'Body Count', desc: '1,000 kills in all.', ribbon: ['#3a3d40', '#9aa0a4'], test: (_, s) => s.stats.kills >= 1000 },
  { id: 'exterminator', name: 'Exterminator', desc: '10,000 kills in all.', ribbon: ['#141516', '#c9473a'], test: (_, s) => s.stats.kills >= 10000 },
  { id: 'hard', name: 'Hard as Nails', desc: 'Clear a city on Hard.', ribbon: ['#6e211b', '#e2dccb'], test: (f, s) => f.won && s.difficulty === 'hard' },
  { id: 'ending', name: 'Die Trying', desc: 'Clear the White House.', ribbon: ['#2f4a6a', '#c9473a'], test: (f) => f.won && f.last },
];

/** Gives the save every medal the fight just earned it; returns their names. */
export function award(f: Fight, s: Save) {
  const won: string[] = [];
  for (const m of MEDALS) if (!s.medals[m.id] && m.test(f, s)) { s.medals[m.id] = Date.now(); won.push(m.name); }
  return won;
}
