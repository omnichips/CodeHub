// The skill web: which nodes can be bought, and what the ones you own add up to for a run. A node can be bought up to
// `max` times (levels); what you own is { node: level }, and a node's effects count once for each level.
import economy from '../data/economy.json' with { type: 'json' };
import tree from '../data/skilltree.json' with { type: 'json' };
import { USABLES, baseStats, type StructStats, type UsableStats, type Stats, type UnitKind, type StructKind, type UsableKind, type BlockKind } from '../sim/world.ts';

export type Category = 'soldiers' | 'structures' | 'usables' | 'base';
/** What owning a node does. `unlock`/`add` give items (for strikes, uses per run); `stat` raises one item's stat. */
export interface Effect { unlock?: string; add?: string; count?: number; stat?: string; of?: string; by?: number; leakLimit?: number; chipGain?: number }
/** `cost[k]` is the price of level k + 1; `max` levels in all. `needs`: other nodes that must be fully bought first. */
export interface Node { id: string; name: string; cat: Category; cost: number[]; max: number; parent: string | null; needs?: string[]; start?: boolean; x: number; y: number; icon: string; desc: string; effects: Effect[] }
export type Levels = Readonly<Record<string, number>>;

export const NODES = tree.nodes as Node[];
export const NODE = new Map(NODES.map((n) => [n.id, n]));
/** What every save owns from the start. */
export const STARTING: Levels = Object.fromEntries(NODES.filter((n) => n.start).map((n) => [n.id, n.max]));

export const level = (owned: Levels, id: string) => owned[id] ?? 0;
/** Fully bought, buyable (its parent has at least one level, every node it needs is fully bought, and it has levels
 *  left) or locked. */
export function state(owned: Levels, id: string): 'owned' | 'open' | 'locked' {
  const n = NODE.get(id)!;
  return level(owned, id) >= n.max ? 'owned' : (!n.parent || level(owned, n.parent) > 0) && missing(owned, id).length === 0 ? 'open' : 'locked';
}
/** The nodes a node needs that are not fully bought yet. */
export const missing = (owned: Levels, id: string) => (NODE.get(id)!.needs ?? []).filter((k) => level(owned, k) < NODE.get(k)!.max);
/** What the next level of a node costs (undefined once it is fully bought). */
export const nextCost = (owned: Levels, id: string) => NODE.get(id)!.cost[level(owned, id)];

/** Every game speed, from the start. 1× is already brisk: the fight runs PACE times faster than real time. */
export const SPEEDS = [0.5, 1, 2, 5];
/** Seconds of fighting per real second at 1× (what used to be 5×). */
export const PACE = 5;

export interface Build {
  stats: Stats;
  /** How many of each soldier, roadblock and structure you can put down per run. Strikes are in stats.usables[k].charges. */
  loadout: Record<string, number>;
  speeds: number[]; // the game speeds offered (pause is always there too)
  chipGain: number; // multiplier on chips earned
}

const grow = (v: number, by: number) => v * (1 + by);
/** A stronger effect: a bonus over 1 grows, a share under 1 (slow, cover) shrinks toward its floor. */
const more = (v: number, by: number) => (v >= 1 ? 1 + (v - 1) * (1 + by) : Math.max(0.05, 1 - (1 - v) * (1 + by)));

function powerUp(k: StructStats | UsableStats, by: number) {
  const n = k as unknown as Record<string, number | undefined>;
  for (const f of ['damage', 'dps', 'time']) if (n[f]) n[f] = grow(n[f]!, by);
  if ('kills' in k && k.kills) k.kills = Math.round(grow(k.kills, by));
  if (k.burn) k.burn = { dps: grow(k.burn.dps, by), time: k.burn.time };
  if (k.slow) k.slow = more(k.slow, by);
  if ('rangeBy' in k && k.rangeBy) k.rangeBy = more(k.rangeBy, by);
  if ('rateBy' in k && k.rateBy) k.rateBy = more(k.rateBy, by);
  if ('cover' in k && k.cover) k.cover = more(k.cover, by);
}

export function build(owned: Levels): Build {
  const stats = baseStats(), loadout: Record<string, number> = {};
  let chipGain = 1;
  const mods: Record<string, Record<string, number>> = {};
  for (const [id, lv] of Object.entries(owned)) {
    const n = NODE.get(id);
    for (let k = 0; n && k < Math.min(lv, n.max); k++)
      for (const e of n.effects) {
        const item = e.unlock ?? e.add;
        if (item) loadout[item] = (loadout[item] ?? 0) + (e.count ?? 1);
        if (e.stat && e.of) (mods[e.of] ??= {})[e.stat] = (mods[e.of]?.[e.stat] ?? 0) + e.by!;
        if (e.leakLimit) stats.leakLimit += e.leakLimit;
        if (e.chipGain) chipGain += e.chipGain;
      }
  }
  for (const [item, m] of Object.entries(mods)) {
    const u = stats.units[item as UnitKind], rb = stats.roadblocks[item as BlockKind], st = stats.structs[item as StructKind], us = stats.usables[item as UsableKind];
    for (const [stat, by] of Object.entries(m)) {
      if (u) {
        if (stat === 'pierce' || stat === 'pellets' || stat === 'turrets') u[stat] = (u[stat] ?? 0) + by;
        else if (stat === 'burn' && u.burn) u.burn = { dps: grow(u.burn.dps, by), time: grow(u.burn.time, by) };
        else if (stat in u) (u as unknown as Record<string, number>)[stat] = grow((u as unknown as Record<string, number>)[stat], by);
      } else if (rb && stat === 'hp') rb.hp = Math.round(grow(rb.hp, by));
      else if (st && stat === 'power') powerUp(st, by);
      else if (us && stat === 'power') powerUp(us, by);
    }
  }
  for (const k of Object.keys(USABLES) as UsableKind[]) {
    const u = stats.usables[k];
    u.charges = loadout[k] ?? 0;
    delete loadout[k];
    // A strike plays out in real time, as it did before the fight ran PACE times faster: its recordings (the
    // missile's boom, the A-10's pass) are timed to that. So its waits and how long it lasts are PACE times longer
    // in fight time, and a plane flies PACE times slower.
    for (const f of ['delay', 'cooldown', 'time', 'spread', 'sound'] as const) if (u[f]) u[f] *= PACE;
    if (u.speed) u.speed /= PACE;
  }
  return { stats, loadout, speeds: SPEEDS, chipGain };
}

export interface RunResult { kills: number; leaks: number; leakLimit: number; time: number; par: number; won: boolean; firstClear: boolean; chipGain: number; level?: number }
export interface Payout { total: number; base: number; timeBonus: number; leakBonus: number; firstClear: number; minimum?: number }

/** chips = ⌊kills / 15⌋ × (1 + time bonus + leak bonus) + first-clear bonus; a loss keeps half the kill chips.
 *  Chip gain from the skill web multiplies everything but the first-clear bonus. All numbers in economy.json. */
export function payout(r: RunResult): Payout {
  const p = pay(r), minimum = 5 * (r.level ?? 0); // every run pays at least 5 chips × the map's number, score or no score
  return p.total < minimum ? { ...p, total: minimum, minimum } : p;
}
function pay(r: RunResult): Payout {
  const e = economy, base = Math.floor(r.kills / e.killsPerChip);
  if (!r.won) return { total: Math.floor(base * e.lossKeeps * r.chipGain), base, timeBonus: 0, leakBonus: 0, firstClear: 0 };
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const timeBonus = e.timeBonus * clamp((r.par - r.time) / (r.par * (1 - e.timeBonusFullAt)));
  const leakBonus = e.leakBonus * clamp(1 - r.leaks / r.leakLimit);
  const firstClear = r.firstClear ? e.firstClear : 0;
  return { total: Math.floor(base * (1 + timeBonus + leakBonus) * r.chipGain) + firstClear, base, timeBonus, leakBonus, firstClear };
}
