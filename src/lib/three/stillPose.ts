/**
 * The relaxed standing pose shown for exercises without an animation, so
 * their muscle glow can be seen on a still figure.
 */
import type { Animation, Pose } from '../schema/animation.ts';
import { STANDING_PELVIS_HEIGHT } from './dimensions.ts';

const pose: Pose = {
  pelvis: { position: [0, STANDING_PELVIS_HEIGHT - 0.004, 0], rotation: [0, 0, 0] },
  leftShoulder: [0, 0, 11],
  leftElbow: [-12, 0, 0],
  rightShoulder: [0, 0, -11],
  rightElbow: [-12, 0, 0],
  leftHip: [0, 0, 3],
  leftAnkle: [0, 0, -3],
  rightHip: [0, 0, -3],
  rightAnkle: [0, 0, 3],
};

export const STILL_POSE: Pick<Animation, 'durationSec' | 'keyframes'> = {
  durationSec: 1,
  keyframes: [
    { t: 0, pose },
    { t: 1, pose },
  ],
};
