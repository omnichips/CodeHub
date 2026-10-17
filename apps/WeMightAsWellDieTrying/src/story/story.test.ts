import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAPS } from '../meta/profile.ts';
import { parse } from '../meta/save.ts';
import voices from '../data/storyvoices.json' with { type: 'json' };
import { missing } from './font.ts';
import { noStory, record, story } from './record.ts';
import { STORY } from './storyConfig.ts';
import { goneAtStart, notebookLine, order, pagesOf, planned, sceneLength, shortened, tally, titleCard } from './text.ts';
import { DEPARTURES, sceneIds, validate, voiceOf } from './types.ts';

const ids = MAPS.map((m) => m.id), all = order(story);
const name = (who: string) => who.toLowerCase();

test('story.json has a scene for every map, and nothing in it is unknown', () => {
  assert.deepEqual(validate(story, ids), []);
  assert.deepEqual(story.scenes.map((s) => s.id), sceneIds(ids), 'in the order they play');
});

test('no scene runs past 75 seconds (and those well past their plan are reported)', () => {
  const over: string[] = [];
  for (const sc of story.scenes) {
    const len = sceneLength(sc, all), plan = planned(sc);
    if (len > plan * 1.5) over.push(`${sc.id}: ${(len / 1000).toFixed(1)} s against ${plan / 1000} s planned`);
    assert.ok(len <= STORY.maxScene, `${sc.id} runs ${(len / 1000).toFixed(1)} s`);
  }
  if (over.length) console.log(`More than 50% over plan:\n  ${over.join('\n  ')}`);
});

test('every page fits two lines of the font, in its voice, with a glyph for every character', () => {
  for (const sc of story.scenes)
    for (const s of sc.shots)
      for (const l of s.lines ?? []) {
        const v = voiceOf(l, sc.id, all);
        for (const p of pagesOf(l, v)) assert.ok(p.lines.length <= 2, `${sc.id}: "${p.text}" takes ${p.lines.length} lines`);
        assert.deepEqual(missing(l.pages.join(' ') + (l.gloss ?? '')), [], `${sc.id}: ${l.who}`);
      }
  for (const sc of story.scenes) assert.deepEqual(missing(titleCard(sc, story).text + titleCard(sc, story).tally), []);
});

test('skipping a scene (or the Story setting being Off) still writes its notebook page', () => {
  const st = noStory();
  record(st, 'after:chicago');
  assert.deepEqual(st.seen, ['after:chicago']);
  assert.deepEqual(st.notebook.chicago, { needed: 6000, got: 410, note: 'Hollis.' });
  record(st, 'ending');
  assert.deepEqual(st.notebook['white-house'], { needed: 800, got: 0, note: 'names' });
  record(st, 'after:tokyo');
  record(st, 'after:london');
  assert.equal(st.notebook.tokyo.gotLabel, '1,200?', 'London marks Tokyo');
  record(st, 'after:london');
  assert.equal(st.notebook.tokyo.gotLabel, '1,200?', 'once');
});

test('nobody speaks after leaving the squad, and the squad shrinks map by map as they leave', () => {
  const gone = new Set<string>();
  for (const id of all) {
    const sc = story.scenes.find((s) => s.id === id)!;
    assert.deepEqual(goneAtStart(id, story), [...gone], `${id}: squad at the start`);
    for (const s of sc.shots) {
      for (const l of s.lines ?? []) assert.ok(!gone.has(name(l.who)), `${id}: ${l.who} speaks after leaving`);
      if (s.leaves) gone.add(s.leaves); // after the shot's own lines
    }
  }
  assert.deepEqual([...gone], [...DEPARTURES]);
});

test('title cards, tallies and notebook lines come from the map rows', () => {
  const at = (id: string) => titleCard(story.scenes.find((s) => s.id === id)!, story);
  assert.deepEqual(at('opening'), { text: 'DAY 1 · 21:40 · MAIN STREET', tally: '' });
  assert.deepEqual(at('before:chicago'), { text: 'DAY 3 · 05:10 · CHICAGO', tally: 'Main St.: 212 / 1,600' });
  assert.equal(at('before:tokyo').tally, 'Rome: 3,000 alive?');
  const row = (id: string) => story.maps.find((m) => m.id === id)!;
  assert.equal(tally(row('tokyo')), 'Tokyo: 1,200 / 30,000');
  assert.equal(notebookLine(row('chicago')), 'CHICAGO needed 6,000. got 410.');
  assert.equal(notebookLine(row('rome')), 'ROME needed 3,000. got alive?');
});

test('the Short setting plays no map, diorama, close-up or travel shot, and keeps every line', () => {
  for (const sc of story.scenes) {
    const short = shortened(sc);
    assert.ok(short.every((s) => s.type === 'title' || s.type === 'notebook'), sc.id);
    assert.deepEqual(short.flatMap((s) => s.lines ?? []), sc.shots.flatMap((s) => s.lines ?? []), `${sc.id}: lines`);
  }
});

test('a save from before the story counts the scenes of cities already cleared as seen', () => {
  const old = JSON.stringify({ version: 4, name: 'Old', chips: 5, skills: {}, cleared: { 'main-street': true, chicago: true }, tutorialDone: true, setups: {} });
  const s = parse(old)!;
  assert.equal(s.version, 5);
  assert.deepEqual(s.story.seen, ['opening', 'after:main-street', 'before:chicago', 'after:chicago']);
  assert.deepEqual(Object.keys(s.story.notebook), ['main-street', 'chicago']);
  const again = parse(JSON.stringify(s))!;
  assert.deepEqual(again.story, s.story, 'kept as it is once it has one');
  assert.deepEqual(parse(JSON.stringify({ ...s, story: { seen: ['nonsense', 'after:main-street'] } }))!.story.seen, ['after:main-street'], 'unknown scenes dropped');
});

test('every page of every scene has its line voiced (run scripts/storyvoices.ts after changing the words)', () => {
  const index = voices as unknown as Record<string, Record<string, [number, number]>>;
  for (const sc of story.scenes)
    for (const s of sc.shots)
      for (const l of s.lines ?? [])
        for (const p of pagesOf(l, voiceOf(l, sc.id, all))) {
          const clip = index[sc.id]?.[`${l.who}|${p.text}`];
          assert.ok(clip && clip[1] > clip[0], `${sc.id}: no voice for ${l.who}: ${p.text}`);
        }
});
