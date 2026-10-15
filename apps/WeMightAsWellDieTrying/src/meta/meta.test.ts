import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NODES, STARTING, build, payout, state } from './progress.ts';
import { fresh, parse } from './save.ts';

test('a fresh start owns 4 Riflemen, plastic and wood roadblocks and one Missile, nothing else', () => {
  const b = build(new Set(STARTING));
  assert.deepEqual(b.loadout, { rifleman: 4, plastic: 3, wood: 2 });
  assert.equal(b.stats.usables.missile.charges, 1);
  assert.equal(b.stats.usables.a10.charges, 0);
  assert.deepEqual(b.speeds, [1]);
  assert.equal(b.stats.leakLimit, 50);
});

test('buying nodes unlocks classes, raises stats, the leak limit and time controls', () => {
  const owned = new Set([...STARTING, 'marksman', 'marksman.more1', 'marksman.damage', 'leak1', 'leak2', 'speed1', 'missile.charge1', 'puddle']);
  const b = build(owned), base = build(new Set(STARTING));
  assert.equal(b.loadout.marksman, 2);
  assert.ok(Math.abs(b.stats.units.marksman.damage! - base.stats.units.marksman.damage! * 1.2) < 1e-9);
  assert.equal(b.stats.leakLimit, 60);
  assert.deepEqual(b.speeds, [1, 2]);
  assert.equal(b.stats.usables.missile.charges, 2);
  assert.equal(b.loadout.generator, 1, 'the puddle comes with a generator');
  assert.equal(state(owned, 'sniper'), 'open');
  assert.equal(state(owned, 'flamethrower'), 'locked');
});

test('every node can be reached from the start', () => {
  const owned = new Set(STARTING);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of NODES) if (!owned.has(n.id) && state(owned, n.id) === 'open') { owned.add(n.id); grew = true; }
  }
  assert.equal(owned.size, NODES.length);
});

test('chips: kills/10 with time and leak bonuses on a win, half the kill chips on a loss', () => {
  const run = { kills: 500, leaks: 0, leakLimit: 50, time: 420, par: 420, won: true, firstClear: true, chipGain: 1 };
  assert.equal(payout(run).total, Math.floor(50 * 1.25) + 200); // at par: no time bonus; no leaks: +25%
  assert.equal(payout({ ...run, time: 315, firstClear: false }).total, Math.floor(50 * 1.55)); // 25% under par: full +30%
  assert.equal(payout({ ...run, leaks: 50, firstClear: false }).total, 50);
  assert.equal(payout({ ...run, won: false }).total, 25);
});

test('a save from a file is never trusted: junk is dropped, bad numbers reset', () => {
  assert.equal(parse('not json'), undefined);
  assert.equal(parse('{"version": 99, "owned": []}'), undefined);
  const s = parse(JSON.stringify({ ...fresh(), chips: -5, owned: ['sniper', 'made-up', 3], settings: { gore: 'lots', master: 9 } }))!;
  assert.equal(s.chips, 0);
  assert.ok(s.owned.includes('sniper') && !s.owned.includes('made-up'));
  assert.ok(STARTING.every((id) => s.owned.includes(id)));
  assert.equal(s.settings.gore, 'normal');
  assert.equal(s.settings.master, 1);
});
