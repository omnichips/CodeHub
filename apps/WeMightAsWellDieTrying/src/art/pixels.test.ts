import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rasterize, shade } from './pixels.ts';
import { MATERIALS, SIZE, frames, rifleman } from './sprites.ts';

test('a quarter turn draws exactly the same pixels, turned', () => {
  const east = rasterize(rifleman({ flash: true }), SIZE, 0), south = rasterize(rifleman({ flash: true }), SIZE, Math.PI / 2);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) assert.equal(south.mat[x * SIZE + (SIZE - 1 - y)], east.mat[y * SIZE + x], `pixel ${x},${y}`);
});

test('a dome is lit from the top-left whichever way it faces, with an outline around it', () => {
  const palette = { outline: '#000000', olive0: '#100000', olive1: '#200000', olive2: '#300000' };
  for (const angle of [0, 1, 2, 3]) {
    const px = shade(rasterize([{ mat: 'helmet', a: [0, 0], r: 5, z: 1, dome: 4 }], 16, angle), MATERIALS, palette);
    const red = (x: number, y: number) => px[(y * 16 + x) * 4];
    assert.ok(red(5, 5) > red(10, 10), `angle ${angle}: top-left lighter than bottom-right`);
    assert.equal(px[(8 * 16 + 2) * 4 + 3], 255, 'outline just left of the dome');
    assert.equal(px[3], 0, 'corner stays clear');
  }
});

test('every animation has its frames', () => {
  const all = frames(), count = (anim: string) => all.filter((f) => f.anim === anim).length;
  for (let d = 0; d < 8; d++) assert.deepEqual([count(`rifleman-idle-${d}`), count(`rifleman-walk-${d}`), count(`rifleman-shoot-${d}`)], [2, 4, 2]);
  assert.equal(count('normal-walk'), 2);
});
