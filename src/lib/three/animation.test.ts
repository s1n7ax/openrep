import { describe, expect, it } from 'vitest';
import type { Animation, Pose } from '../schema/animation.ts';
import { AnimationSampler, applyEase } from './animation.ts';

function pose(y: number, extra: Partial<Pose> = {}): Pose {
  return { pelvis: { position: [0, y, 0], rotation: [0, 0, 0] }, ...extra };
}

const animation: Pick<Animation, 'durationSec' | 'keyframes'> = {
  durationSec: 2,
  keyframes: [
    { t: 0, ease: 'linear', pose: pose(1, { spine: [0, 0, 0], leftHand: { target: [0, 1, 0] } }) },
    {
      t: 0.5,
      pose: pose(0.5, { spine: [90, 0, 0], leftHand: { target: [0, 0, 1], pole: [1, 0, 0] } }),
    },
    { t: 1, pose: pose(1, { spine: [0, 0, 0], leftHand: { target: [0, 1, 0] } }) },
  ],
};

describe('applyEase', () => {
  it('maps 0 to 0 and 1 to 1 for every easing', () => {
    for (const ease of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(applyEase(ease, 0)).toBeCloseTo(0, 12);
      expect(applyEase(ease, 1)).toBeCloseTo(1, 12);
    }
    expect(applyEase('easeInOut', 0.5)).toBeCloseTo(0.5, 12);
    expect(applyEase('easeIn', 0.5)).toBeLessThan(0.5);
    expect(applyEase('easeOut', 0.5)).toBeGreaterThan(0.5);
  });
});

describe('AnimationSampler', () => {
  const sampler = new AnimationSampler(animation);

  it('returns the keyframe poses at keyframe times', () => {
    expect(sampler.sample(0).pelvisPosition.y).toBeCloseTo(1, 12);
    expect(sampler.sample(0.5).pelvisPosition.y).toBeCloseTo(0.5, 12);
    expect(sampler.sample(1).pelvisPosition.y).toBeCloseTo(1, 12);
  });

  it('interpolates with the easing of the segment start', () => {
    // First segment is linear: halfway between keyframes is halfway in value.
    expect(sampler.sample(0.25).pelvisPosition.y).toBeCloseTo(0.75, 12);
    // Second segment defaults to easeInOut, which is symmetric about its middle.
    expect(sampler.sample(0.75).pelvisPosition.y).toBeCloseTo(0.75, 12);
    expect(sampler.sample(0.6).pelvisPosition.y).toBeLessThan(0.5 + 0.5 * 0.2);
  });

  it('slerps rotations', () => {
    const spine = sampler.sample(0.25).spine;
    // Halfway (linear) from 0° to 90° about x is 45°.
    expect(2 * Math.acos(Math.min(1, Math.abs(spine.w))) * (180 / Math.PI)).toBeCloseTo(45, 6);
  });

  it('wraps time around the loop', () => {
    expect(sampler.sample(1.25).pelvisPosition.y).toBeCloseTo(0.75, 12);
    expect(sampler.sample(-0.75).pelvisPosition.y).toBeCloseTo(0.75, 12);
  });

  it('interpolates IK targets and blends a missing pole with the default', () => {
    const limb = sampler.sample(0.25).arms.left;
    expect(limb.mode).toBe('ik');
    if (limb.mode !== 'ik') return;
    expect(limb.target.y).toBeCloseTo(0.5, 12);
    expect(limb.target.z).toBeCloseTo(0.5, 12);
    expect(limb.poleWeight).toBeCloseTo(0.5, 12);
    expect(sampler.sample(0.5).arms.left).toMatchObject({ poleWeight: 1 });
    expect(sampler.sample(0).arms.left).toMatchObject({ poleWeight: 0 });
  });

  it('uses FK for limbs without IK targets', () => {
    expect(sampler.sample(0.3).arms.right.mode).toBe('fk');
    expect(sampler.sample(0.3).legs.left.mode).toBe('fk');
  });
});
