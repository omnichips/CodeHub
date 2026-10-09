import { expect, it } from 'vitest';
import { flatten } from './ocr';

/** A grey test image as RGBA: `at(x, y)` gives each pixel's brightness. */
function image(w: number, h: number, at: (x: number, y: number) => number) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([at(x, y), at(x, y), at(x, y), 255], (y * w + x) * 4);
  return px;
}

it('cleanup: a shadow turns back into white paper, faint print turns dark, and a photo with very little ink stays readable', () => {
  const [w, h] = [200, 200];
  const ink = (x: number, y: number) => x % 50 < 2 && y % 50 < 2; // 16 tiny dots: 0.04% of the photo
  // Paper 240, but the left half in shadow (about 40% darker); faint grey print (150 on 240).
  const px = image(w, h, (x, y) => (ink(x, y) ? 150 : 240) * (x < 100 ? 0.6 : 1));
  flatten(px, w, h);
  const at = (x: number, y: number) => px[(y * w + x) * 4];
  expect(at(20, 75)).toBe(255); // shadowed paper: white
  expect(at(75, 75)).toBeGreaterThan(240); // near the shadow's (hard) edge: still paper
  expect(at(175, 175)).toBe(255); // lit paper: white
  expect(at(50, 50)).toBeLessThan(10); // faint print in the shadow: black
  expect(at(150, 150)).toBeLessThan(10); // faint print in the light: black
});
