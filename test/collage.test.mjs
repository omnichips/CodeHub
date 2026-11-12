import assert from 'node:assert/strict';
import test from 'node:test';
import { fit } from '../apps/collage-maker/cover.js';

test('collage: a photo covers its cell at any zoom, rotation and drag', () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 3000; n++) {
    const iw = 100 + rnd() * 3000, ih = 100 + rnd() * 3000, cw = 50 + rnd() * 1000, ch = 50 + rnd() * 1000;
    const t = { scale: 1 + rnd() * 4, rotate: rnd() * 360 - 180, offsetX: rnd() * 6 - 3, offsetY: rnd() * 6 - 3 };
    const { s, dx, dy } = fit(iw, ih, cw, ch, t), r = (t.rotate * Math.PI) / 180;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // each cell corner, measured from the photo's centre along the photo's own axes, must be on the photo
      const px = (x * cw) / 2 - dx, py = (y * ch) / 2 - dy;
      const ix = px * Math.cos(r) + py * Math.sin(r), iy = -px * Math.sin(r) + py * Math.cos(r);
      assert.ok(Math.abs(ix) <= (s * iw) / 2 + 1e-6 && Math.abs(iy) <= (s * ih) / 2 + 1e-6, JSON.stringify({ iw, ih, cw, ch, t }));
    }
  }
});

test('collage: unrotated, it is a plain cover fit and a drag stops at the photo edge', () => {
  const still = fit(200, 100, 100, 100, { scale: 1, rotate: 0, offsetX: 0, offsetY: 0 });
  assert.equal(still.s, 1);
  assert.ok(Math.abs(still.dx) < 1e-9 && Math.abs(still.dy) < 1e-9);
  const dragged = fit(200, 100, 100, 100, { scale: 1, rotate: 0, offsetX: 5, offsetY: 5 });
  assert.ok(Math.abs(dragged.dx - 50) < 1e-9 && Math.abs(dragged.dy) < 1e-9);
});
