import { describe, expect, it } from 'vitest';
import { clampInputAxis, pointInVisionCone, segmentIntersectsCircle } from '../../shared/protocol';

describe('movement input validation', () => {
  it('clamps invalid and oversized axes', () => {
    expect(clampInputAxis(2)).toBe(1);
    expect(clampInputAxis(-2)).toBe(-1);
    expect(clampInputAxis('right')).toBe(0);
  });

  it('accepts targets inside the laser cone and rejects targets outside range', () => {
    expect(pointInVisionCone(0, 0, 0, 100, 0)).toBe(true);
    expect(pointInVisionCone(0, 0, 0, 100, 100)).toBe(false);
    expect(pointInVisionCone(0, 0, 0, 500, 0)).toBe(false);
  });

  it('detects spear segments intersecting player circles', () => {
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 10, 12)).toBe(true);
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 20, 12)).toBe(false);
  });
});
