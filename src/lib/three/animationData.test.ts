/**
 * Checks every animation in data/animations against the figure built from
 * dimensions.ts: IK targets are reachable (within 2 cm), the loop closes, and
 * no part of the figure sinks through the floor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import { animationSchema, type Animation } from '../schema/animation.ts';
import { AnimationSampler, createSampledPose } from './animation.ts';
import { createFigure } from './figure.ts';
import { applyPose, createPoseResult } from './pose.ts';
import { createProps } from './props.ts';
import { SIDES } from './rig.ts';

const DIR = path.resolve(import.meta.dirname, '../../../data/animations');
const files = readdirSync(DIR).filter((file) => file.endsWith('.json'));

/** Allowed distance between an IK target and where the hand or foot ends up. */
const REACH_TOLERANCE = 0.02;
const SAMPLES = 48;

function load(file: string): Animation {
  return animationSchema.parse(JSON.parse(readFileSync(path.join(DIR, file), 'utf8')));
}

function sampleTimes(animation: Animation): number[] {
  const times = new Set(animation.keyframes.map((k) => k.t));
  for (let i = 0; i <= SAMPLES; i++) times.add(i / SAMPLES);
  return [...times].sort((a, b) => a - b);
}

describe.skipIf(files.length === 0)('animation data', () => {
  const figure = createFigure();
  const box = new Box3();

  for (const file of files) {
    describe(file, () => {
      const animation = load(file);
      const sampler = new AnimationSampler(animation);
      const props = createProps(animation.props);

      it('loops: the last keyframe repeats the first', () => {
        expect(animation.keyframes.at(-1)?.pose).toEqual(animation.keyframes[0]?.pose);
      });

      it(`reaches every IK target within ${REACH_TOLERANCE * 100} cm`, () => {
        const pose = createSampledPose();
        const result = createPoseResult();
        const misses: string[] = [];
        for (const t of sampleTimes(animation)) {
          applyPose(figure.rig, sampler.sample(t, pose), props.poseContext, result);
          for (const side of SIDES) {
            for (const [limb, error] of [
              [`${side} hand`, result.errors.arms[side]],
              [`${side} foot`, result.errors.legs[side]],
            ] as const) {
              if (error > REACH_TOLERANCE)
                misses.push(`t=${t.toFixed(3)} ${limb}: ${(error * 100).toFixed(1)} cm`);
            }
          }
        }
        expect(misses).toEqual([]);
      });

      it('keeps the figure above the floor', () => {
        const pose = createSampledPose();
        let lowest = Infinity;
        for (const t of animation.keyframes.map((k) => k.t)) {
          figure.applyPoseResult(applyPose(figure.rig, sampler.sample(t, pose), props.poseContext));
          figure.group.updateMatrixWorld(true);
          lowest = Math.min(lowest, box.setFromObject(figure.group, true).min.y);
        }
        expect(lowest).toBeGreaterThan(-0.01);
      });
    });
  }
});
