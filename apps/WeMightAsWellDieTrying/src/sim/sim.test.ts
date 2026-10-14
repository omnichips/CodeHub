import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World, ZOMBIE_KINDS } from './world.ts';

const noWaves = { gap: 0, waves: [] };
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
  assert.ok(closest > 9, `two zombies ${closest.toFixed(1)}px apart (radius 6 each)`);
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
  run(w, 2);
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
  assert.ok(w.zhp[tough] < 600 && w.zhp[weak] === 100, 'shot the tanky, not the nearer normal');
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
    return 600 - w.zhp[z];
  };
  assert.equal(hurt(false), 0);
  assert.ok(hurt(true) > 10);
});

test('strikes: one missile at a time, each charge used once; a flare pulls zombies off their route', () => {
  const w = open();
  w.start();
  const z = w.spawn(kind('normal'), 100, 100);
  w.zhp[w.spawn(kind('brute'), 300, 20)] = 1e6; // keeps the run going
  assert.ok(w.callStrike('missile', 100, 100));
  assert.ok(!w.callStrike('missile', 100, 100), 'cooling down');
  run(w, 2);
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
