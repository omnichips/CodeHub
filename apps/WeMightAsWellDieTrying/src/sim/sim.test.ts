import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync } from 'node:fs';
import { World, ZOMBIES, ZOMBIE_KINDS, baseStats } from './world.ts';

const noWaves = { gap: 0, waves: [] };
const full = (name: string) => ZOMBIES[ZOMBIE_KINDS.indexOf(name)].hp; // a zombie's hp, unhurt
const MAP_NAMES = readdirSync(new URL('../data/maps/', import.meta.url)).map((f) => f.replace('.json', ''));
const world = (rows: string[]) => new World({ name: 'test', tile: 16, par: 60, rows }, noWaves);
const run = (w: World, seconds: number, each?: () => void) => {
  for (let k = 0; k < seconds * 60 && w.phase === 'wave'; k++) { w.step(); each?.(); }
};

test('a zombie finds its way round buildings to the safe zone, never inside a wall, and counts as a leak', () => {
  const w = world(['S.......', '######..', '........', '..######', '........', 'EEEEEEEE']);
  w.spawn(0, 8, 8);
  w.start();
  run(w, 120, () => {
    const t = w.grid.at(w.zx[0], w.zy[0]);
    if (w.alive[0]) assert.equal(w.grid.wall[t], 0, `inside a wall at ${w.zx[0]},${w.zy[0]}`);
  });
  assert.equal(w.leaks, 1);
  assert.equal(w.phase, 'won');
});

test('a crowd packs without overlapping', () => {
  const w = world([...Array(19).fill('.'.repeat(20)), 'E'.repeat(20)]);
  for (let k = 0; k < 40; k++) w.spawn(0, 160 + (k % 5) * 0.1, 40 + k * 0.1);
  w.start();
  run(w, 2);
  let closest = Infinity;
  for (let i = 0; i < 40; i++) for (let j = i + 1; j < 40; j++) closest = Math.min(closest, Math.hypot(w.zx[i] - w.zx[j], w.zy[i] - w.zy[j]));
  assert.ok(closest > 13, `two zombies ${closest.toFixed(1)}px apart: they must touch, not stack (radius 6 each, kept 15 apart)`);
});

test('a roadblock across the only street holds the horde until it is broken', () => {
  const w = world(['SSS', '...', '...', '...', '...', '...', '...', 'EEE']);
  const rb = w.placeBlock('plastic', 1, 4, false)!;
  for (let k = 0; k < 5; k++) w.spawn(0, 8 + k * 8, 8);
  w.start();
  run(w, 8);
  assert.ok(rb.hp < 150, 'zombies pressing on it damage it');
  assert.equal(w.leaks, 0, 'nothing got past while it stood');
  run(w, 60);
  assert.equal(w.roadblocks.length, 0, 'broken');
  assert.equal(w.leaks, 5);
});

test('a rifleman shoots what is in his cone and nothing behind him', () => {
  const w = world(Array(20).fill('.'.repeat(19) + 'E')); // the safe zone is east: the target walks straight down the cone
  const s = w.placeSoldier('rifleman', 160, 80)!;
  w.aim(s, 400, 80); // far out: the narrowest cone, pointing east
  w.spawn(0, 240, 80);
  w.spawn(0, 80, 80);
  w.start();
  run(w, 4);
  assert.equal(w.alive[0], 0, 'the zombie in front is dead');
  assert.equal(w.alive[1], 1, 'the one behind is untouched');
  assert.equal(w.kills, 1);
});

const open = () => world([...Array(19).fill('.'.repeat(20)), 'E'.repeat(20)]);
const kind = (name: string) => ZOMBIE_KINDS.indexOf(name);

test('a jumper leaps the roadblock that holds the others back', () => {
  const w = world(['SSS', '...', '...', '...', '...', '...', '...', 'EEE']);
  w.placeBlock('wood', 1, 4, false);
  w.spawn(kind('normal'), 8, 8);
  w.spawn(kind('jumper'), 40, 8);
  w.start();
  run(w, 10);
  assert.equal(w.leaks, 1, 'only the jumper got through');
  assert.equal(w.alive[0], 1);
});

test('armour shrugs off bullets but not splash', () => {
  const w = open(), armoured = kind('armored');
  const a = w.spawn(armoured, 100, 40), b = w.spawn(armoured, 200, 40);
  (w as unknown as { damage: (j: number, n: number, how: string) => void }).damage(a, 100, 'bullet');
  (w as unknown as { damage: (j: number, n: number, how: string) => void }).damage(b, 100, 'splash');
  assert.ok(w.zhp[a] > w.zhp[b] + 50);
});

test('a bloater bursts on the zombies round it', () => {
  const w = open(), s = w.placeSoldier('rifleman', 160, 200)!;
  w.aim(s, 160, 0);
  const bloater = w.spawn(kind('bloater'), 160, 120);
  const by = w.spawn(kind('fast'), 175, 120); // inside the burst, low HP
  w.zhp[bloater] = 1;
  w.start();
  run(w, 1);
  assert.equal(w.alive[bloater], 0);
  assert.equal(w.alive[by], 0, 'the burst killed the fast zombie next to it');
});

test('a mortar lobs over a building onto the zombies behind it', () => {
  const row = (c: string) => c.repeat(20);
  const w = world([row('.'), row('.'), row('.'), row('.'), '################....', row('.'), row('.'), row('.'), row('.'), row('.'), row('.'), row('E')]);
  const m = w.placeSoldier('mortar', 40, 150)!;
  const z = w.spawn(kind('tanky'), 40, 24); // across the building from the mortar
  w.aim(m, 40, 24);
  w.zhp[z] = 50;
  w.start();
  run(w, 6);
  assert.equal(w.alive[z], 0);
});

test('a medic heals the soldiers round him; a sniper takes the toughest mark when told to', () => {
  const w = open(), hurt = w.placeSoldier('rifleman', 100, 100)!;
  w.placeSoldier('medic', 120, 100);
  hurt.hp = 40;
  const sn = w.placeSoldier('sniper', 160, 300)!;
  w.aim(sn, 160, 276); // handle close in: the widest cone
  sn.priority = 'highest HP';
  const weak = w.spawn(kind('normal'), 190, 200), tough = w.spawn(kind('tanky'), 160, 60);
  w.start();
  w.step();
  assert.ok(hurt.hp > 40);
  assert.ok(w.zhp[tough] < full('tanky') && w.zhp[weak] === full('normal'), 'shot the tanky, not the nearer normal');
});

test('a hordemother keeps adding zombies while she lives', () => {
  const w = open();
  w.spawn(kind('hordemother'), 160, 40);
  w.start();
  run(w, 7);
  assert.ok(w.living >= 5);
});

// ---- Phase 4: structures and strikes ----

test('a mine goes off under a zombie and hurts the soldier standing next to it', () => {
  const w = open();
  w.placeStructure('mine', 10, 5);
  const s = w.placeSoldier('rifleman', 168, 120)!; // just behind it
  w.aim(s, 168, 400); // facing away
  const z = w.spawn(kind('tanky'), 168, 40);
  w.zhp[z] = 100;
  w.start();
  run(w, 6);
  assert.equal(w.structures.length, 0, 'the mine is spent');
  assert.equal(w.alive[z], 0);
  assert.ok(s.hp < 100, 'and it hurt our own man');
});

test('barbed wire slows zombies down; a jumper ignores it', () => {
  const time = (wire: boolean, k: string) => {
    const w = world(['SSS', '...', '...', '...', '...', '...', '...', 'EEE']);
    if (wire) w.placeStructure('wire', 1, 3, false);
    w.spawn(kind(k), 24, 8);
    w.start();
    let steps = 0;
    while (w.phase === 'wave' && steps < 6000) { w.step(); steps++; }
    return steps;
  };
  assert.ok(time(true, 'normal') > time(false, 'normal') * 1.15);
  assert.equal(time(true, 'jumper'), time(false, 'jumper'));
});

test('a rifleman in a watchtower reaches farther', () => {
  const w = open();
  w.placeStructure('watchtower', 10, 15);
  const s = w.placeSoldier('rifleman', 168, 248)!; // let go next to the tower: he steps up into it
  assert.deepEqual([s.x, s.y], [168, 248]);
  w.aim(s, 168, 0);
  const z = w.spawn(kind('normal'), 168, 248 - 190); // past a rifleman's 150, inside 150 × 1.4
  w.zhp[z] = 30;
  w.start();
  w.step();
  assert.equal(w.alive[z], 0);
});

test('a rigged car rams the zombies ahead of it and ends up a roadblock', () => {
  const w = open();
  w.placeStructure('rigged', 10, 17); // faces north
  for (let k = 0; k < 4; k++) w.spawn(kind('normal'), 168, 200 - k * 14);
  w.zhp[w.spawn(kind('brute'), 20, 20)] = 1e6; // keeps the run going
  w.start();
  run(w, 4);
  assert.ok(w.kills >= 3, `${w.kills} kills`);
  assert.equal(w.roadblocks.length, 1);
  assert.equal(w.roadblocks[0].kind, 'car');
});

test('an electric puddle only works with a generator in a building', () => {
  const hurt = (generator: boolean) => {
    const w = world(['####################', ...Array(10).fill('.'.repeat(20)), 'E'.repeat(20)]);
    w.placeStructure('puddle', 10, 3);
    if (generator) assert.ok(w.placeStructure('generator', 10, 0));
    const z = w.spawn(kind('tanky'), 168, 56);
    w.start();
    run(w, 1);
    return full('tanky') - w.zhp[z];
  };
  assert.equal(hurt(false), 0);
  assert.ok(hurt(true) > 10);
});

test('strikes: one missile at a time, each charge used once; a flare pulls zombies off their route', () => {
  const w = open();
  w.start();
  const z = w.spawn(kind('normal'), 100, 100);
  w.zhp[w.spawn(kind('brute'), 300, 20)] = 1e6; // keeps the run going
  assert.ok(w.callStrike('missile', 100, 120)); // where it will have walked to when the missile lands
  assert.ok(!w.callStrike('missile', 100, 120), 'cooling down');
  run(w, 3);
  assert.equal(w.alive[z], 0);
  w.time += 20;
  assert.ok(w.callStrike('missile', 50, 50));
  w.time += 20;
  assert.ok(!w.callStrike('missile', 50, 50), 'out of charges');

  const f = open(), y0 = 100, lured = f.spawn(kind('normal'), 160, y0);
  f.start();
  f.callStrike('flare', 160, 20);
  run(f, 3);
  assert.ok(f.zy[lured] < y0, 'walked north, toward the flare, not south to the safe zone');
});

// ---- Phase 6: indoor soldiers and props ----

test('a soldier at a window is never attacked, cannot die, and shoots out into the street', () => {
  const rows = ['S'.repeat(12), ...Array(6).fill('.'.repeat(12)), '#'.repeat(5) + '.'.repeat(7), ...Array(4).fill('.'.repeat(12)), 'E'.repeat(12)];
  const w = new World({ name: 't', tile: 16, par: 60, rows, slots: [[2, 7]] }, { gap: 0, waves: [] });
  const s = w.placeSoldier('rifleman', 2 * 16 + 8, 7 * 16 + 8)!;
  assert.ok(s?.indoor, 'manned the window');
  assert.equal(w.placeSoldier('shield', 2 * 16 + 8, 7 * 16 + 8), undefined, 'one soldier per window, and no shields indoors');
  w.aim(s, s.x, 0);
  const z = w.spawn(ZOMBIE_KINDS.indexOf('normal'), s.x, 16);
  w.zhp[z] = 20; // one shot
  w.start();
  run(w, 4);
  assert.equal(w.alive[z], 0, 'shot through the window');
  assert.equal(s.hp, 100);
  assert.ok(!w.moveSoldier(s, s.x, s.y), 'mid-wave a soldier can leave a building but not go into one');
  assert.ok(w.moveSoldier(s, 9 * 16, 3 * 16));
});

test('a car already in the street only moves when a soldier is there to move it', () => {
  const rows = [...Array(10).fill('.'.repeat(12)), 'E'.repeat(12)];
  const w = new World({ name: 't', tile: 16, par: 60, rows, props: [{ kind: 'car', tx: 5, ty: 3, vertical: false }] }, { gap: 0, waves: [] });
  const car = w.roadblocks[0];
  assert.ok(car.prop);
  assert.ok(!w.moveBlock(car, 5, 6), 'not by hand');
  assert.ok(!w.haulProp(car, 5, 6), 'no soldier yet');
  w.placeSoldier('rifleman', 40, 40);
  assert.ok(w.haulProp(car, 5, 6));
  assert.equal(car.ty, 6);
  assert.equal(w.used.car, undefined, 'props are not taken from what you own');
});

test('shots and explosions are reported as sounds for the screen to play', () => {
  const w = world(Array(20).fill('.'.repeat(19) + 'E'));
  const s = w.placeSoldier('bazooka', 100, 80)!;
  w.aim(s, 400, 80);
  w.spawn(0, 200, 80);
  w.start();
  run(w, 3);
  const kinds = new Set(w.sounds.map((n) => n.kind));
  assert.ok(kinds.has('bazooka'), 'the launch');
  assert.ok(kinds.has('boom') && w.sounds.find((n) => n.kind === 'boom')!.size > 0, 'the explosion, with its size');
});

test('soldiers aim at a zombie anywhere in their cone, not just down the middle', () => {
  const w = world(Array(20).fill('.'.repeat(19) + 'E'));
  const s = w.placeSoldier('rifleman', 100, 160)!;
  w.aim(s, 130, 160); // handle close in: the widest cone, pointing east
  w.spawn(0, 200, 125); // about 20 degrees off the middle
  w.zhp[0] = 30; // one shot
  w.start();
  run(w, 2);
  assert.equal(w.alive[0], 0);
  assert.ok(Math.abs(s.shot) > 0.1, 'he turned to his mark');
});

test('Main Street: undefended, the first wave walks the whole street into the safe zone', async () => {
  const map = (await import('../data/maps/main-street.json', { with: { type: 'json' } })).default;
  const plan = (await import('../data/waves.json', { with: { type: 'json' } })).default['main-street'];
  const w = new World(map, { gap: plan.gap, waves: plan.waves.slice(0, 1) });
  w.start();
  run(w, 300); // a long street: 128 tiles
  assert.equal(w.phase, 'lost', 'overrun: the whole first wave walked the street into the safe zone');
});

test('a soldier in a window can shoot down the street, almost along the front of his building', () => {
  // Row 1 is the building with a window at tile (2, 1); the street runs east below it.
  const rows = ['##########################', '##########################', ...Array(6).fill('.........................E')];
  const w = new World({ name: 'test', tile: 16, par: 60, rows, slots: [[2, 1]] }, noWaves);
  const s = w.placeSoldier('rifleman', 40, 24)!;
  assert.ok(s.indoor, 'he is in the window');
  w.aim(s, 400, 40);
  w.spawn(0, 150, 40); // down the street, about 8 degrees off the building front
  w.zhp[0] = 20; // one shot
  w.start();
  run(w, 2);
  assert.equal(w.alive[0], 0, 'the building he is in does not stop his shots');
});

test('a soldier in a window still cannot shoot through his building to the street behind it', () => {
  // A street above (row 0) and below (rows 4+) a building three tiles deep; his window opens onto the lower street.
  const rows = ['.........................E', '##########################', '##########################', '##########################', ...Array(4).fill('.........................E')];
  const w = new World({ name: 'test', tile: 16, par: 60, rows, slots: [[4, 3]] }, noWaves);
  const s = w.placeSoldier('rifleman', 72, 56)!;
  w.aim(s, 72, -200); // pointing up, back through the building
  w.spawn(0, 72, 8);
  w.start();
  run(w, 1);
  assert.ok(s.firedAt > 0, 'he did fire');
  assert.equal(w.zhp[0], full('normal'), 'untouched: the walls stopped every shot');
});

test('a zombie keeps to its route until a roadblock is close, then goes round it', () => {
  // A street 10 wide, its route down the middle (column 4); a barricade across the middle far down it.
  const w = world(['SSSSSSSSSS', ...Array(28).fill('..........'), 'EEEEEEEEEE']);
  assert.deepEqual(w.routes.list.map((r) => r.tiles[10] % 10), [4], 'one route: the street has no other way');
  w.placeBlock('wood', 4, 22, false); // tiles 3 to 5 of row 22
  w.spawn(0, 72, 8);
  w.start();
  let atHalfway = -1;
  run(w, 60, () => { if (atHalfway < 0 && w.zy[0] > 14 * 16) atHalfway = w.zx[0]; });
  assert.ok(Math.abs(atHalfway - 72) < 8, `still on its route 8 tiles before the barricade (x ${atHalfway.toFixed(0)}, started at 72)`);
  assert.equal(w.leaks, 1, 'and it still got round');
});

test('routes: a long way round gets one too; a zombie off its route follows one nearer it, or makes for it alone', () => {
  // In at the top left, the safe zone bottom left: a short way down the middle, a long way round by the right.
  const rows = Array.from({ length: 40 }, (_, y) => [...Array(50)].map((_, x) => {
    if (x === 0 && y < 4) return 'S';
    if (x === 0 && y >= 36) return 'E';
    return y < 4 || y >= 36 || (x >= 20 && x < 24) || x >= 46 ? '.' : '#';
  }).join(''));
  const w = world(rows), [short, long] = w.routes.list;
  assert.equal(w.routes.list.length, 2);
  assert.ok(short.tiles.some((t) => t % 50 === 21 || t % 50 === 22) && long.tiles.some((t) => t % 50 >= 46), 'the middle street, then the far one');
  // Alone and off any route, in the far street's top: it makes for a route; one beside it, nearer, it follows.
  const a = w.spawn(0, 47.5 * 16, 30 * 16), b = w.spawn(0, 47.5 * 16, 31.2 * 16);
  w.zroute[a] = 1; w.zprog[a] = long.tiles.findIndex((t) => Math.floor(t / 50) === 30 && t % 50 >= 46);
  w.zroute[b] = -1; w.zprog[b] = 0;
  w.start();
  w.step();
  assert.equal(w.zlink[a], 1, 'on its route');
  assert.ok(w.zlink[b] > 0, 'following the one on its route');
});

test('a car covers 2 by 3 tiles and a bus 2 by 5, and a placed car turns', () => {
  const w = open();
  const car = w.placeBlock('car', 8, 8, false)!;
  assert.equal(w.blockTiles('car', 8, 8, false)!.length, 6);
  assert.equal(w.blockTiles('bus', 8, 8, false)!.length, 10);
  assert.deepEqual(w.blockCentre(car), [8.5 * 16, 9 * 16], 'drawn at the middle of its two rows');
  assert.ok(w.moveBlock(car, car.tx, car.ty, true), 'turned');
  assert.equal(car.vertical, true);
});

test('every map: each car, bus and barricade already in the street fits, and no tree stands in the road', async () => {
  for (const name of MAP_NAMES) {
    const map = (await import(`../data/maps/${name}.json`, { with: { type: 'json' } })).default;
    const w = new World(map, noWaves);
    assert.equal(w.roadblocks.length, (map.props ?? []).length, `${name}: every prop placed`);
    // A sidewalk is as many tiles wide as the map is scaled up.
    const s = map.scale ?? 1, near = Array.from({ length: 2 * s + 1 }, (_, k) => k - s);
    const roadside = (x: number, y: number) => near.some((dy) => near.some((dx) => w.grid.wall[(y + dy) * w.grid.w + x + dx]));
    for (const d of map.decor ?? []) {
      if (d.kind !== 'tree') continue;
      const tx = Math.floor(d.x / 16), ty = Math.floor(d.y / 16), c = map.rows[ty][tx];
      assert.ok(c !== '.' || roadside(tx, ty), `${name}: tree at ${tx},${ty} is in the road`);
    }
  }
});

test('a big mob pouring in from a narrow street never ends up inside the buildings', () => {
  const rows = ['###SSSSSS###', ...Array(20).fill('###......###'), '###EEEEEE###'];
  const w = new World({ name: 'test', tile: 16, par: 60, rows }, { gap: 0, waves: [{ duration: 1, spawn: { normal: 60 } }] });
  w.start();
  let bad = 0;
  run(w, 8, () => {
    for (let i = 0; i < w.n; i++) {
      const t = w.grid.at(w.zx[i], w.zy[i]);
      if (w.alive[i] && (t < 0 || w.grid.wall[t])) bad++;
    }
  });
  assert.equal(bad, 0, 'zombie-steps spent inside a wall or off the map');
});

test('every zombie of every wave comes, even when the street is too full to let them in on time', () => {
  const rows = ['###SS###', ...Array(10).fill('###..###'), '###EE###'];
  const w = new World({ name: 'test', tile: 16, par: 60, rows }, { gap: 0, waves: [{ duration: 1, spawn: { normal: 80 } }, { duration: 1, spawn: { fast: 20 } }] }, 1, { ...baseStats(), leakLimit: 1000 });
  w.start();
  run(w, 200);
  assert.equal(w.phase, 'won');
  assert.equal(w.leaks, 100);
});

test('every map: a street only runs off the edge where the horde comes in (or into the safe zone)', async () => {
  for (const name of MAP_NAMES) {
    const map = (await import(`../data/maps/${name}.json`, { with: { type: 'json' } })).default, h = map.rows.length, w = map.rows[0].length;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && '.,'.includes(map.rows[y][x])) assert.fail(`${name}: a street leaves the map at ${x},${y} but nothing comes from there`);
  }
});

// ---- Kept setups and who made the kills ----

test('each kill counts for whoever made it: a soldier class, a strike, or the one who lit the fire', () => {
  const w = open();
  const s = w.placeSoldier('rifleman', 160, 280)!;
  w.aim(s, 160, 0);
  w.start();
  w.spawn(kind('normal'), 160, 180);
  w.zhp[w.spawn(kind('brute'), 20, 20)] = 1e6; // keeps the run going
  run(w, 3);
  w.callStrike('missile', 280, 100);
  w.spawn(kind('normal'), 280, 100);
  w.callStrike('napalm', 60, 200);
  w.zhp[w.spawn(kind('normal'), 60, 200)] = 30; // dies burning
  run(w, 6);
  assert.deepEqual(w.killsBy, { rifleman: 1, missile: 1, napalm: 1 });
  assert.equal(w.kills, 3);
});

test('a kept setup is laid out again as it was, as far as what you own allows', () => {
  const rows = ['............', '#####.......', ...Array(8).fill('.'.repeat(12)), 'E'.repeat(12)];
  const map = { name: 't', tile: 16, par: 60, rows, slots: [[2, 1]], props: [{ kind: 'car', tx: 8, ty: 4, vertical: false }] };
  const a = new World(map, noWaves);
  const r = a.placeSoldier('rifleman', 100, 120)!;
  a.aim(r, 180, 40);
  a.placeSoldier('marksman', 40, 24); // in the window
  const op = a.placeSoldier('operator', 60, 140)!;
  a.deployTurret(op, 30, 100);
  a.placeBlock('wood', 5, 8, false);
  a.placeStructure('wire', 9, 9, true);
  assert.ok(a.haulProp(a.roadblocks[0], 2, 5, true));
  const kept = JSON.parse(JSON.stringify(a.setup()));

  const b = new World(map, noWaves);
  b.placeSoldier('rifleman', 20, 150); // something already down: it is cleared first
  b.useSetup(kept, { rifleman: 1, marksman: 1, operator: 1, wood: 1, wire: 1 });
  assert.deepEqual(b.setup(), kept, 'everything back where it was');
  assert.ok(b.soldiers.find((s) => s.kind === 'marksman')!.indoor);
  assert.deepEqual(b.used, a.used);

  const c = new World(map, noWaves);
  c.useSetup(kept, { rifleman: 1 });
  assert.deepEqual(c.soldiers.map((s) => s.kind), ['rifleman'], 'only what you own');
  assert.equal(c.roadblocks.length, 1, 'just the car, moved');
});

test('the way to the safe zone is found past any roadblocks, however they sit (distances kept as 32-bit floats)', () => {
  // Two cars side by side across a wide avenue.
  const rows = ['####SSSSSS####', ...Array(30).fill('####......####'), '####EEEEEE####'];
  const w = new World({ name: 't', tile: 16, par: 0, rows }, noWaves);
  w.placeBlock('car', 4, 20, true, false);
  w.placeBlock('car', 6, 19, true, false);
  for (const i of w.grid.spawns) assert.ok(Number.isFinite(w.flow[i]), `entry ${i} still leads somewhere`);
  // Random roadblocks on open ground: nothing is walled off, so every tile must have a way. Before the field queued
  // tiles at their stored 32-bit value, some layouts cut whole stretches off.
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 20; k++) {
    const r = new World({ name: 't', tile: 16, par: 0, rows: ['S'.repeat(16), ...Array(20).fill('.'.repeat(16)), 'E'.repeat(16)] }, noWaves);
    for (let n = 0; n < 12; n++) r.placeBlock(['car', 'bus', 'wood', 'sandbags'][n % 4] as 'car', (rnd() * 16) | 0, 2 + ((rnd() * 18) | 0), rnd() < 0.5, false);
    assert.ok(r.flow.every(Number.isFinite), `random layout ${k}: no tile cut off`);
  }
});

test('every map: each way in leads to the safe zone, and every wave only sends zombies that exist', async () => {
  const plans = (await import('../data/waves.json', { with: { type: 'json' } })).default as unknown as Record<string, { waves: { spawn: Record<string, number> }[] }>;
  for (const name of MAP_NAMES) {
    const map = (await import(`../data/maps/${name}.json`, { with: { type: 'json' } })).default, w = new World(map, noWaves);
    assert.ok(w.grid.spawns.length && w.grid.goals.length, `${name}: has a way in and a safe zone`);
    for (const i of w.grid.spawns) assert.ok(Number.isFinite(w.flow[i]), `${name}: the way in at ${i % w.grid.w},${Math.floor(i / w.grid.w)} leads nowhere`);
    assert.ok(plans[name]?.waves.length, `${name}: has waves`);
    for (const wave of plans[name].waves) for (const [k, n] of Object.entries(wave.spawn)) assert.ok(ZOMBIE_KINDS.includes(k) && n >= 0, `${name}: ${k} ${n}`);
  }
});

test('a big zombie shoved into a building comes back out onto the street (it once hung the game)', () => {
  // Wider than half a tile: pushed out of one wall tile it landed in the next, on and on past the map edge. If this
  // breaks again the test does not fail, it hangs.
  const rows = ['................', '################', '################', '................', 'EEEEEEEEEEEEEEEE'];
  for (const name of ['tanky', 'hordemother', 'brute']) {
    const w = world(rows);
    w.spawn(kind(name), 8 * 16 + 9, 16 + 8); // its middle inside the building
    w.start();
    w.step();
    const t = w.grid.at(w.zx[0], w.zy[0]);
    assert.ok(t >= 0 && !w.grid.wall[t], `${name} is on open ground (${w.zx[0].toFixed(0)}, ${w.zy[0].toFixed(0)})`);
  }
});

test('a mob whose way in stays full goes in at another, so every zombie of the wave still comes', () => {
  // The left way in is one tile walled in on every side, soon full; the right one runs to the safe zone.
  const rows = ['S#######SS', '########..', ...Array(6).fill('########..'), '########EE'];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new World({ name: 't', tile: 16, par: 0, rows }, { gap: 0, waves: [{ duration: 1, spawn: { normal: 60 } }] }, seed, { ...baseStats(), leakLimit: 1000 });
    w.start();
    run(w, 120);
    const pocket = (w as unknown as { spawned: number; queue: number[] });
    assert.equal(pocket.spawned, pocket.queue.length, `seed ${seed}: all 60 came in`);
    assert.ok(w.leaks >= 50, `seed ${seed}: and most of them reached the safe zone (${w.leaks})`);
  }
});

test('an intelligent zombie and a tanky stood in front of it, where the street turns, both go on (they once stood forever)', () => {
  // The tanky sits on the spot the intelligent one draws its followers to, right in its path, at the corner of a side street.
  const w = world(['............', '............', '............', '######...###', '######...###', 'EEEEEEEEEEEE']);
  const T = 16, intelligent = w.spawn(ZOMBIE_KINDS.indexOf('intelligent'), 5.0 * T, 2.22 * T), tanky = w.spawn(ZOMBIE_KINDS.indexOf('tanky'), 6.15 * T, 2.46 * T);
  w.zdx[intelligent] = 0.98;
  w.zdy[intelligent] = 0.19;
  w.start();
  run(w, 30);
  assert.equal(w.living, 0, `still standing: intelligent at ${w.zx[intelligent].toFixed(0)},${w.zy[intelligent].toFixed(0)}, tanky at ${w.zx[tanky].toFixed(0)},${w.zy[tanky].toFixed(0)}`);
});

test('big zombies squeezed against a flat wall at the end of a street still walk down it (a slant push off a tile corner held them)', () => {
  const w = world(['bbbbbbbbbbbb', 'E..........S', 'E..........S', 'E..........S', 'oooooooooooo']);
  // Where and how they stood when they jammed on a wide map: stacked up the street, the bottom one pressed into the wall.
  const T = 16, jam = [['tanky', 11.43, 1.56, -5.65, 5.67, -0.71, 0.71], ['bloater', 11.5, 2.65, -7.63, 6.46, -0.76, 0.65], ['tanky', 11.45, 3.44, -7.98, 0.53, -1, 0.07]] as const;
  for (const [kind, x, y, vx, vy, dx, dy] of jam) {
    const i = w.spawn(ZOMBIE_KINDS.indexOf(kind), x * T, y * T);
    [w.zvx[i], w.zvy[i], w.zdx[i], w.zdy[i]] = [vx, vy, dx, dy];
  }
  w.start();
  run(w, 60);
  assert.equal(w.living, 0);
});

test('a soldier holding a door brings a civilian out, who is safe once walked into the safe zone', () => {
  const rows = ['S'.repeat(12), ...Array(5).fill('.'.repeat(12)), '#'.repeat(6) + '.'.repeat(6), ...Array(5).fill('.'.repeat(12)), 'E'.repeat(12)];
  const w = new World({ name: 't', tile: 16, par: 60, rows }, noWaves);
  w.placeCivilians(3);
  const c = w.civilians[0];
  assert.ok(c && c.state === 'inside', 'someone is in a building');
  assert.equal(w.grid.wall[c.door], 1, 'behind a door in a wall');
  w.placeSoldier('rifleman', c.x, c.y);
  const tick = (seconds: number) => { for (let k = 0; k < seconds * 60; k++) { w.phase = 'wave'; w.step(); } };
  tick(10);
  assert.equal(c.state, 'inside', 'not out before the door is held long enough');
  tick(6);
  assert.equal(c.state, 'out');
  assert.ok(w.moveCivilian(c, 6 * 16 + 8, 12 * 16 + 8));
  tick(20);
  assert.equal(c.state, 'saved');
  assert.equal(w.saved, 1);
});
