// The campaign as a sensible player might play it: from the starting loadout and no chips, each map is tried until it
// is won, every chip earned (a loss keeps half the kill chips) spent on skills between tries. Each map should take a
// few tries: what won the last map is not enough for the next. Soldiers go in the windows that look onto the
// roadblocks and just short of the safe zone, roadblocks across the way the horde comes (the busiest first), each
// strike on the thickest crowd. Run: node scripts/balance.ts [last map id] [seed]
// The state going into each map is kept in the temp folder, so a run for one map does not replay the ones before it
// (any change to an earlier map, its waves or this script starts afresh).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World, UNITS, type UnitKind, type BlockKind, type UsableKind } from '../src/sim/world.ts';
import { distanceField, downhill } from '../src/sim/grid.ts';
import { NODES, STARTING, state, nextCost, level, build, payout } from '../src/meta/progress.ts';

const ORDER = ['main-street', 'chicago', 'new-york', 'manila', 'mexico', 'rome', 'tokyo', 'london', 'white-house'];
// What a sensible player buys first, in this order; after that, the cheapest next level of what they field.
const BUY = [
  'rifleman.more', 'rifleman.more', 'rifleman.damage', 'rifleman.rate', 'rifleman.damage', 'rifleman.rate', 'leak', 'missile.charge', 'wood.more',
  'rifleman.range', 'rifleman.damage', 'rifleman.rate', 'rifleman.more2', 'rifleman.more2', 'machinegunner', 'machinegunner.more', 'machinegunner.damage',
  'machinegunner.rate', 'machinegunner.more', 'leak', 'sandbags', 'sandbags.more', 'marksman', 'marksman.more', 'grenadier', 'grenadier.more', 'medic',
  'a10', 'missile.power', 'leak', 'sniper', 'machinegunner.more2', 'machinegunner.more2', 'car', 'car.more', 'bazooka', 'bazooka.more', 'artillery',
  'sniper.more', 'mortar', 'mortar.more', 'cement', 'cement.more',
];
const FIELD = ['rifleman', 'machinegunner', 'marksman', 'grenadier', 'medic', 'sniper', 'bazooka', 'mortar', 'missile', 'a10', 'artillery', 'wood', 'sandbags', 'car', 'cement'];
const SOLDIER_RING = 3, BLOCK_RING = 9; // tiles from the safe zone
const TRIES = 8; // a map not won by then is stuck

const plans = JSON.parse(readFileSync('src/data/waves.json', 'utf8'));
const load = (m: string) => JSON.parse(readFileSync(`src/data/maps/${m}.json`, 'utf8'));
interface Save { owned: Record<string, number>; chips: number; cleared: string[] }

/** Spends every chip: the list in order while the next one is affordable, then the cheapest next level of what is fielded. */
function spend(save: Save) {
  const bought: string[] = [];
  const buy = (n: string) => {
    if (state(save.owned, n) !== 'open' || nextCost(save.owned, n) > save.chips) return false;
    save.chips -= nextCost(save.owned, n);
    save.owned[n] = level(save.owned, n) + 1;
    bought.push(n);
    return true;
  };
  // The k-th time a node is listed means its k-th level.
  for (let k = 0; k < BUY.length; k++) if (level(save.owned, BUY[k]) < BUY.slice(0, k + 1).filter((n) => n === BUY[k]).length && !buy(BUY[k])) return bought;
  for (;;) {
    const open = NODES.filter((n) => FIELD.some((f) => n.id === f || n.id.startsWith(`${f}.`)) && state(save.owned, n.id) === 'open').sort((a, b) => nextCost(save.owned, a.id) - nextCost(save.owned, b.id));
    if (!open.length || !buy(open[0].id)) return bought;
  }
}

/** One try at a map with what the save owns. */
function play(id: string, save: Save, seed: number) {
  const map = load(id), { stats, loadout, chipGain } = build(save.owned), w = new World(map, plans[id], seed, stats);
  const g = w.grid, T = g.tile, open = (i: number) => !g.wall[i] && !g.goal[i];
  const dist = distanceField(g, g.goals, (i) => (g.wall[i] ? Infinity : 1)), xy = (i: number) => [i % g.w, Math.floor(i / g.w)];
  const centre = (i: number) => [(xy(i)[0] + 0.5) * T, (xy(i)[1] + 0.5) * T] as [number, number];
  const around = (i: number) => { const [x, y] = xy(i), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < g.w && y + dy < g.h) out.push(i + dy * g.w + dx); return out; };

  // How busy each tile is: where the zombies of the first waves walk when nothing stops them.
  const busy = new Float32Array(g.w * g.h), scout = new World(map, { gap: plans[id].gap, waves: plans[id].waves.slice(0, 3) }, seed);
  scout.start();
  for (let k = 0; scout.phase === 'wave'; k++) {
    scout.step();
    if (k % 30 === 0) for (let i = 0; i < scout.n; i++) if (scout.alive[i]) busy[g.at(scout.zx[i], scout.zy[i])]++;
  }
  // The open tiles r from the safe zone that the horde crosses, busiest first.
  const rings = new Map<number, number[]>();
  const ring = (r: number) => rings.get(r) ?? rings.set(r, [...busy.keys()].filter((i) => open(i) && busy[i] > 0 && dist[i] >= r && dist[i] < r + 1).sort((a, b) => busy[b] - busy[a])).get(r)!;

  // Roadblocks across the way the horde comes, strongest where it is busiest; lines further out with what is left.
  const blocks = (['cement', 'car', 'sandbags', 'wood', 'plastic'] as BlockKind[]).flatMap((k) => Array<BlockKind>(loadout[k] ?? 0).fill(k)), dir = { x: 0, y: 0 };
  const line: number[] = [];
  for (let r = BLOCK_RING; blocks.length && r < BLOCK_RING + 9; r += 3)
    for (const t of ring(r)) {
      if (!blocks.length) break;
      if (g.block[t]) continue;
      const [tx, ty] = xy(t), vertical = downhill(g, dist, ...centre(t), dir) && Math.abs(dir.x) > Math.abs(dir.y);
      for (const shift of [0, 1, -1]) {
        const bx = vertical ? tx : tx + shift, by = vertical ? ty + shift : ty, rb = w.placeBlock(blocks[0], bx, by, vertical);
        if (!rb) continue;
        if (r === BLOCK_RING) line.push(...w.blockTiles(rb.kind, bx, by, vertical)!);
        blocks.shift();
        break;
      }
    }

  // Guns aim up the way past the roadblocks, at the crowd coming; shells land on the roadblocks, where it is held.
  const held = line.length ? line : ring(BLOCK_RING + 3);
  const aimAt = (r: number) => { while (r > BLOCK_RING && !ring(r).length) r--; return ring(r); };
  const out = (x: number, y: number) => { const t = g.at(x, y); return Math.min(...[t, ...around(t)].filter(open).map((j) => dist[j])); }; // how far out it stands
  const target = (x: number, y: number, tiles: number[]) => (!tiles.length ? [x, y - 1] : centre(tiles.reduce((b, j) => (Math.hypot(centre(j)[0] - x, centre(j)[1] - y) < Math.hypot(centre(b)[0] - x, centre(b)[1] - y) ? j : b))));
  const aim = (s: NonNullable<ReturnType<World['placeSoldier']>>) => {
    const [x, y] = target(s.x, s.y, UNITS[s.kind].minRange ? held : aimAt(Math.max(BLOCK_RING + 3, Math.floor(out(s.x, s.y)) + 5))), reach = s.reach;
    w.aim(s, x, y);
    if (!UNITS[s.kind].minRange) s.reach = reach; // a middling cone, not the narrowest
  };
  // Windows by how close they look onto the roadblocks (a soldier in one cannot be hurt).
  const gap = (x: number, y: number) => Math.hypot(...(target(x, y, held).map((v, k) => v - (k ? y : x)) as [number, number]));
  const slots = ((map.slots ?? []) as [number, number][]).map(([x, y]) => ({ x, y, d: gap((x + 0.5) * T, (y + 0.5) * T) })).sort((a, b) => a.d - b.d);
  const outside: UnitKind[] = [];
  for (const kind of Object.entries(loadout).filter(([k]) => k in UNITS).flatMap(([k, n]) => Array<UnitKind>(n).fill(k as UnitKind))) {
    const u = stats.units[kind], k = !u.outdoor && u.weapon !== 'heal' ? slots.findIndex((s) => s.d < u.range * stats.indoor.rangeBy * 0.8) : -1;
    const s = k >= 0 ? w.placeSoldier(kind, (slots[k].x + 0.5) * T, (slots[k].y + 0.5) * T) : undefined;
    if (s) { slots.splice(k, 1); aim(s); } else outside.push(kind);
  }
  // Outside: the busiest tiles just short of the safe zone, two tiles apart; the medics after the rest.
  const taken: number[] = [], apart = (t: number) => taken.every((o) => Math.max(Math.abs(xy(o)[0] - xy(t)[0]), Math.abs(xy(o)[1] - xy(t)[1])) >= 2);
  const spots = [SOLDIER_RING, SOLDIER_RING + 1, SOLDIER_RING - 1, SOLDIER_RING + 2, SOLDIER_RING + 3, 1].flatMap(ring);
  for (const kind of [...outside.filter((k) => stats.units[k].weapon !== 'heal'), ...outside.filter((k) => stats.units[k].weapon === 'heal')])
    for (const t of spots) {
      if (!apart(t)) continue;
      const s = w.placeSoldier(kind, ...centre(t));
      if (!s) continue;
      taken.push(t);
      aim(s);
      break;
    }
  if (process.env.SHOW) console.log(map.rows.map((row: string, y: number) => [...row].map((c, x) => { const s = w.soldiers.find((o) => g.at(o.x, o.y) === y * g.w + x); return s ? (s.indoor ? 'I' : 'O') : g.block[y * g.w + x] ? '=' : c; }).join('')).join('\n'));

  // The fight: each strike on the thickest crowd near the defence, once there is a crowd worth it.
  w.start();
  const strikes = Object.keys(stats.usables).filter((k) => w.charges[k as UsableKind] > 0) as UsableKind[];
  for (let k = 0; w.phase === 'wave' && w.time < 4000; k++) {
    w.step();
    if (k % 30 || !strikes.some((s) => w.strikeReady(s))) continue;
    const count = new Float32Array(g.w * g.h);
    for (let i = 0; i < w.n; i++) if (w.alive[i]) { const t = g.at(w.zx[i], w.zy[i]); if (t >= 0 && dist[t] < BLOCK_RING + 10) for (const j of [t, ...around(t)]) count[j]++; }
    const best = count.reduce((b, c, i) => (c > count[b] ? i : b), 0);
    if (count[best] < 15) continue;
    const [x, y] = centre(best), kind = strikes.find((s) => w.strikeReady(s))!;
    downhill(g, dist, x, y, dir);
    w.callStrike(kind, x, y, Math.atan2(dir.y, dir.x));
  }
  const won = w.phase === 'won', pay = payout({ kills: w.kills, leaks: w.leaks, leakLimit: w.leakLimit, time: w.time, par: map.par, won, firstClear: !save.cleared.includes(id), chipGain });
  const men = Object.entries(w.used).map(([k, n]) => `${n} ${k}`).join(', ');
  return { won, chips: pay.total, report: `${w.phase} at ${Math.round(w.time)} s (par ${map.par}), ${w.leaks}/${w.leakLimit} leaked, ${w.kills} killed, ${w.soldiers.filter((s) => s.dead).length} soldiers down, +${pay.total} chips [${men}]` };
}

const [last = 'white-house', seedArg = '7'] = process.argv.slice(2), seed = Number(seedArg);
const script = readFileSync(new URL(import.meta.url), 'utf8');
const keyOf = (k: number) => createHash('sha1').update(script + seed + ORDER.slice(0, k).map((m) => readFileSync(`src/data/maps/${m}.json`, 'utf8') + JSON.stringify(plans[m])).join('')).digest('hex').slice(0, 12);
const kept = (k: number) => join(tmpdir(), `dietrying-balance-${keyOf(k)}.json`);
let from = ORDER.indexOf(last);
while (from > 0 && !existsSync(kept(from))) from--;
let save: Save = from > 0 ? JSON.parse(readFileSync(kept(from), 'utf8')) : { owned: { ...STARTING }, chips: 0, cleared: [] };
for (let k = from; k <= ORDER.indexOf(last); k++) {
  const id = ORDER[k];
  for (let n = 1; ; n++) {
    const r = play(id, save, seed + n);
    save.chips += r.chips;
    const bought = spend(save);
    console.log(`${id} try ${n}: ${r.report}; bought ${bought.length ? bought.join(' ') : 'nothing'}, ${save.chips} chips left`);
    if (r.won) { save.cleared.push(id); break; }
    if (n === TRIES) { console.log(`${id}: still not won after ${TRIES} tries`); process.exit(1); }
  }
  writeFileSync(kept(k + 1), JSON.stringify(save));
}
