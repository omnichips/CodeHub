import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NODE, NODES, STARTING, build, level, nextCost, payout, state, type Levels } from './progress.ts';
import { fresh, parse, settingsFrom } from './save.ts';

test('a fresh start owns 4 Riflemen, plastic and wood roadblocks and one Missile, nothing else', () => {
  const b = build(STARTING);
  assert.deepEqual(b.loadout, { rifleman: 4, plastic: 3, wood: 2 });
  assert.equal(b.stats.usables.missile.charges, 1);
  assert.equal(b.stats.usables.a10.charges, 0);
  assert.deepEqual(b.speeds, [1, 2, 4, 5, 10], 'every speed from the start');
  assert.equal(b.stats.leakLimit, 50);
});

test('each level of a node counts: more soldiers, stronger stats, a higher leak limit', () => {
  const owned: Levels = { ...STARTING, marksman: 1, 'marksman.more': 2, 'marksman.damage': 3, leak: 2, 'missile.charge': 1, puddle: 1 };
  const b = build(owned), base = build(STARTING);
  assert.equal(b.loadout.marksman, 3, 'unlocked, then +1 twice');
  assert.ok(Math.abs(b.stats.units.marksman.damage! - base.stats.units.marksman.damage! * (1 + 3 * NODE.get('marksman.damage')!.effects[0].by!)) < 1e-9);
  assert.equal(b.stats.leakLimit, 60);
  assert.equal(b.stats.usables.missile.charges, 2);
  assert.equal(b.loadout.generator, 1, 'the puddle comes with a generator');
});

test('a node is open once its parent has a level, stays open until every level is bought, and costs more each level', () => {
  const owned: Levels = { ...STARTING, marksman: 1, 'marksman.more': 1 };
  assert.equal(state(owned, 'marksman.more'), 'open', 'one of two levels bought');
  assert.equal(state(owned, 'marksman.damage'), 'open', 'its parent has a level');
  assert.equal(state(owned, 'marksman.more2'), 'locked');
  assert.equal(state({ ...owned, 'marksman.more': 2 }, 'marksman.more'), 'owned');
  const d = NODE.get('marksman.damage')!;
  assert.equal(d.max, 3);
  assert.ok(d.cost[0] < d.cost[1] && d.cost[1] < d.cost[2], 'dearer each level');
  assert.equal(nextCost({ ...owned, 'marksman.damage': 1 }, 'marksman.damage'), d.cost[1]);
  assert.ok(NODES.every((n) => n.max >= 1 && n.max <= 3 && n.cost.length === n.max), 'at most 3 levels, a price for each');
});

test('every level of every node can be bought, starting from nothing but the start', () => {
  const owned: Record<string, number> = { ...STARTING };
  let spent = 0;
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of NODES) if (state(owned, n.id) === 'open') { spent += nextCost(owned, n.id)!; owned[n.id] = level(owned, n.id) + 1; grew = true; }
  }
  assert.ok(NODES.every((n) => level(owned, n.id) === n.max));
  assert.ok(spent > 8000 && spent < 14000, `everything costs ${spent} chips: tens of runs, not hundreds`);
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
  assert.equal(parse('{"version": 99, "skills": {}}'), undefined);
  const s = parse(JSON.stringify({ ...fresh(), chips: -5, skills: { 'marksman.damage': 9, 'made-up': 2, sniper: 'x' }, stats: { kills: -3, runs: 'x' } }))!;
  assert.equal(s.chips, 0);
  assert.equal(s.skills['marksman.damage'], 3, 'capped at the most levels a node has');
  assert.ok(!('made-up' in s.skills) && !('sniper' in s.skills));
  assert.ok(Object.keys(STARTING).every((id) => s.skills[id] === STARTING[id]));
  assert.deepEqual([s.stats.kills, s.stats.runs], [0, 0]);
  const kept = parse(JSON.stringify({ ...fresh(), setups: { 'main-street': {
    soldiers: [{ kind: 'rifleman', x: 10, y: 20, angle: 1, reach: 50, priority: 'loudest', turrets: [{ x: 'a' }] }, { kind: 'dragon', x: 1, y: 1, angle: 0, reach: 1 }, { kind: 'sniper', x: null }],
    blocks: [{ kind: 'wood', tx: 3, ty: 4, vertical: 'yes' }, { kind: 'wall', tx: 1, ty: 1 }], structures: 'junk',
  } } }))!.setups['main-street'];
  assert.deepEqual(kept, {
    soldiers: [{ kind: 'rifleman', x: 10, y: 20, angle: 1, reach: 50, priority: 'nearest', turrets: [] }],
    blocks: [{ kind: 'wood', tx: 3, ty: 4, vertical: false }], props: [], structures: [],
  }, 'unknown kinds and bad numbers dropped');
  assert.deepEqual(parse(JSON.stringify({ ...fresh(), setups: undefined }))!.setups, {}, 'a save from before setups were kept');
  const set =settingsFrom({ gore: 'lots', master: 9 });
  assert.equal(set.gore, 'normal');
  assert.equal(set.master, 1);
});

test('a save from before the skill web had levels gets back every chip it spent, and keeps its cities', () => {
  // Version 1 (before slots) and version 2 owned nodes of the old web: 'sniper' cost 50, 'leak1' 15.
  const s = parse(JSON.stringify({ version: 1, chips: 40, owned: ['command', 'rifleman', 'sniper', 'leak1'], cleared: { 'new-york': true }, tutorialDone: true, settings: { gore: 'some' } }))!;
  assert.equal(s.version, 3);
  assert.equal(s.chips, 40 + 50 + 15);
  assert.deepEqual(s.skills, { ...STARTING }, 'the new web starts afresh');
  assert.equal(s.name, 'Save');
  assert.ok(s.cleared['new-york'] && s.tutorialDone);
});
