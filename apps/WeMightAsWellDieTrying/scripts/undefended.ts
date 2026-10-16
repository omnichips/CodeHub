// Every zombie of every wave gets through an undefended map: nothing freezes or jams. Run: node scripts/undefended.ts <map id>
import { readFileSync } from 'node:fs';
import { World, baseStats } from '../src/sim/world.ts';

const id = process.argv[2], map = JSON.parse(readFileSync(`src/data/maps/${id}.json`, 'utf8')), plan = JSON.parse(readFileSync('src/data/waves.json', 'utf8'))[id];
const stats = baseStats();
stats.leakLimit = 1e9;
const w = new World(map, plan, 7, stats);
w.start();
while (w.phase === 'wave' && w.time < 3600) w.step();
console.log(`${id}: ${w.phase} at ${Math.round(w.time)} s, ${w.leaks} through, ${w.living} still on the map; par about ${Math.ceil((w.time * 1.05) / 30) * 30} (now ${map.par})`);
