import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRegistry } from '../scripts/registry.mjs';

const app = (over = {}) => ({ id: 'fairshare', name: 'FairShare', color: '#3f7d46', source: { type: 'vite', dir: '../TripShare' }, ...over });
const reg = (...apps) => ({ title: 'My apps', apps });
const problems = (r) => validateRegistry(r).join(' | ');

test('accepts a good registry, with or without apps', () => {
  assert.deepEqual(validateRegistry(reg(app(), app({ id: 'tetris-2', source: { type: 'static', dir: 'x', entry: 'tetris.html' }, folder: 'Games', icon: 'i.png' }))), []);
  assert.deepEqual(validateRegistry(reg()), []);
});

test('rejects ids that would make bad web addresses or clash', () => {
  for (const id of ['Fair Share', 'fair/share', '_icons', '-x', '', undefined, 'UPPER', 'a.b']) assert.match(problems(reg(app({ id }))), /"id" must be/, String(id));
  assert.match(problems(reg(app(), app())), /duplicate id/);
});

test('rejects missing or malformed fields', () => {
  assert.match(problems({ apps: [] }), /"title" is required/);
  assert.match(problems({ title: 'x' }), /"apps" must be a list/);
  assert.match(problems(reg(app({ name: ' ' }))), /"name" is required/);
  assert.match(problems(reg(app({ color: 'green' }))), /"color"/);
  assert.match(problems(reg(app({ icon: 'logo.gif' }))), /\.svg or \.png/);
  assert.match(problems(reg(app({ source: { type: 'php', dir: 'x' } }))), /source\.type/);
  assert.match(problems(reg(app({ source: { type: 'static' } }))), /source\.dir/);
  assert.match(problems(reg(null)), /must be an object/);
});

test('limits the dock to 4 and keeps dock and folder apart', () => {
  const docked = (n) => app({ id: `a${n}`, dock: true });
  assert.deepEqual(validateRegistry(reg(...[1, 2, 3, 4].map(docked))), []);
  assert.match(problems(reg(...[1, 2, 3, 4, 5].map(docked))), /at most 4/);
  assert.match(problems(reg(app({ dock: true, folder: 'Games' }))), /dock and in a folder/);
});
