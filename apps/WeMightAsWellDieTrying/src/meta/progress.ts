// The skill web: which nodes can be bought, and what the ones you own add up to for a run.
import economy from '../data/economy.json' with { type: 'json' };
import tree from '../data/skilltree.json' with { type: 'json' };
import { USABLES, baseStats, type StructStats, type UsableStats, type Stats, type UnitKind, type StructKind, type UsableKind, type BlockKind } from '../sim/world.ts';

export type Category = 'soldiers' | 'structures' | 'usables' | 'base';
/** What owning a node does. `unlock`/`add` give items (for strikes, uses per run); `stat` raises one item's stat. */
export interface Effect { unlock?: string; add?: string; count?: number; stat?: string; of?: string; by?: number; leakLimit?: number; chipGain?: number; speed?: number }
export interface Node { id: string; name: string; cat: Category; cost: number; parent: string | null; start?: boolean; x: number; y: number; icon: string; desc: string; effects: Effect[] }

export const NODES = tree.nodes as Node[];
export const NODE = new Map(NODES.map((n) => [n.id, n]));
export const STARTING = NODES.filter((n) => n.start).map((n) => n.id);

/** Owned, buyable (its parent is owned) or locked. */
export function state(owned: ReadonlySet<string>, id: string): 'owned' | 'open' | 'locked' {
  const n = NODE.get(id)!;
  return owned.has(id) ? 'owned' : !n.parent || owned.has(n.parent) ? 'open' : 'locked';
}

export interface Build {
  stats: Stats;
  /** How many of each soldier, roadblock and structure you can put down per run. Strikes are in stats.usables[k].charges. */
  loadout: Record<string, number>;
  speeds: number[]; // 1 always; 2 and 3 once bought
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

export function build(owned: ReadonlySet<string>): Build {
  const stats = baseStats(), loadout: Record<string, number> = {}, speeds = [1];
  let chipGain = 1;
  const mods: Record<string, Record<string, number>> = {};
  for (const id of owned) {
    for (const e of NODE.get(id)?.effects ?? []) {
      const item = e.unlock ?? e.add;
      if (item) loadout[item] = (loadout[item] ?? 0) + (e.count ?? 1);
      if (e.stat && e.of) (mods[e.of] ??= {})[e.stat] = (mods[e.of]?.[e.stat] ?? 0) + e.by!;
      if (e.leakLimit) stats.leakLimit += e.leakLimit;
      if (e.chipGain) chipGain += e.chipGain;
      if (e.speed) speeds.push(e.speed);
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
    stats.usables[k].charges = loadout[k] ?? 0;
    delete loadout[k];
  }
  return { stats, loadout, speeds: [...new Set(speeds)].sort(), chipGain };
}

export interface RunResult { kills: number; leaks: number; leakLimit: number; time: number; par: number; won: boolean; firstClear: boolean; chipGain: number }
export interface Payout { total: number; base: number; timeBonus: number; leakBonus: number; firstClear: number }

/** chips = ⌊kills / 10⌋ × (1 + time bonus + leak bonus) + first-clear bonus; a loss keeps half the kill chips.
 *  Chip gain from the skill web multiplies everything but the first-clear bonus. All numbers in economy.json. */
export function payout(r: RunResult): Payout {
  const e = economy, base = Math.floor(r.kills / e.killsPerChip);
  if (!r.won) return { total: Math.floor(base * e.lossKeeps * r.chipGain), base, timeBonus: 0, leakBonus: 0, firstClear: 0 };
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const timeBonus = e.timeBonus * clamp((r.par - r.time) / (r.par * (1 - e.timeBonusFullAt)));
  const leakBonus = e.leakBonus * clamp(1 - r.leaks / r.leakLimit);
  const firstClear = r.firstClear ? e.firstClear : 0;
  return { total: Math.floor(base * (1 + timeBonus + leakBonus) * r.chipGain) + firstClear, base, timeBonus, leakBonus, firstClear };
}
