import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { solveTwoBone } from './ik.ts';

const root = new Vector3(0, 1, 0);

describe('solveTwoBone', () => {
  it('reaches a target within range with both bones at their lengths', () => {
    const target = new Vector3(0.3, 0.6, 0.2);
    const { mid, end, error } = solveTwoBone(root, target, new Vector3(0, 1, -1), 0.3, 0.3);
    expect(error).toBe(0);
    expect(end.distanceTo(target)).toBeLessThan(1e-9);
    expect(mid.distanceTo(root)).toBeCloseTo(0.3, 9);
    expect(mid.distanceTo(end)).toBeCloseTo(0.3, 9);
  });

  it('bends towards the pole', () => {
    const target = new Vector3(0, 0.6, 0);
    const forward = solveTwoBone(root, target, new Vector3(0, 0.8, 1), 0.3, 0.3);
    expect(forward.mid.z).toBeGreaterThan(0.1);
    const back = solveTwoBone(root, target, new Vector3(0, 0.8, -1), 0.3, 0.3);
    expect(back.mid.z).toBeLessThan(-0.1);
  });

  it('stretches straight towards an unreachable target and reports the gap', () => {
    const target = new Vector3(0, 0, 0);
    const { mid, end, error } = solveTwoBone(root, target, new Vector3(0, 0.5, 1), 0.3, 0.3);
    expect(error).toBeCloseTo(0.4, 9);
    expect(end.y).toBeCloseTo(0.4, 5);
    expect(mid.y).toBeCloseTo(0.7, 3);
    expect(Math.abs(mid.z)).toBeLessThan(0.01);
  });

  it('works when the pole lies on the line to the target', () => {
    const target = new Vector3(0, 0.6, 0);
    const { mid, error } = solveTwoBone(root, target, new Vector3(0, 0, 0), 0.3, 0.3);
    expect(error).toBe(0);
    expect(Number.isFinite(mid.x + mid.y + mid.z)).toBe(true);
    expect(mid.distanceTo(root)).toBeCloseTo(0.3, 9);
  });
});
