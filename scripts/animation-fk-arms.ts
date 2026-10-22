/**
 * Authoring helper: computes FK arm angles (shoulder, elbow, wrist; Euler
 * degrees, XYZ) that put the grip points at a position fixed to the chest.
 * Use it when the hands must move with the torso (bar on the back in a squat,
 * dumbbell held at the chest, bar on the hips) — FK arms stay exactly in place
 * while the torso bends, IK targets would drift between keyframes.
 *
 * Usage:
 *   npm run animation:fk-arms -- --target <x,y,z> [--pole <x,y,z>] [--grip bar|handle|none]
 *
 * --target  left-hand grip point in the chest frame (metres; the chest joint is
 *           the origin, +x is the figure's left, +y up the spine, +z forward).
 *           The right hand is mirrored.
 * --pole    where the left elbow points, in the chest frame (default: behind
 *           and below the shoulder).
 * --grip    "bar" turns the fists onto a bar running between the hands
 *           (default), "handle" keeps a neutral fist, "none" a relaxed hand.
 *
 * Prints the six pose fields to paste into every keyframe that keeps the
 * hands at that spot.
 */
import { parseArgs } from 'node:util';
import { Euler, MathUtils, Vector3 } from 'three';
import { createSampledPose } from '../src/lib/three/animation.ts';
import { applyPose, emptyPoseContext } from '../src/lib/three/pose.ts';
import { createRig, resetRig } from '../src/lib/three/rig.ts';

function vector(text: string | undefined, fallback: Vector3): Vector3 {
  if (text === undefined) return fallback;
  const parts = text.split(',').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    console.error(`Expected x,y,z but got "${text}"`);
    process.exit(2);
  }
  return new Vector3(parts[0], parts[1], parts[2]);
}

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    pole: { type: 'string' },
    grip: { type: 'string', default: 'bar' },
  },
});
if (values.target === undefined) {
  console.error(
    'Usage: npm run animation:fk-arms -- --target <x,y,z> [--pole <x,y,z>] [--grip bar|handle|none]',
  );
  process.exit(2);
}
const grip = values.grip === 'handle' || values.grip === 'none' ? values.grip : 'bar';

const rig = createRig();
resetRig(rig);
const chest = rig.joints.chest.getWorldPosition(new Vector3());
const target = vector(values.target, new Vector3()).add(chest);
const pole = vector(values.pole, new Vector3(0.45, -0.1, -0.6)).add(chest);
const mirror = (v: Vector3) => new Vector3(-v.x, v.y, v.z);

const pose = createSampledPose();
pose.pelvisPosition.copy(rig.root.position);
pose.arms.left = { mode: 'ik', target, pole, poleWeight: 1 };
pose.arms.right = { mode: 'ik', target: mirror(target), pole: mirror(pole), poleWeight: 1 };
const context = emptyPoseContext();
context.hands.left = grip;
context.hands.right = grip;
const result = applyPose(rig, pose, context);

const degrees = (name: keyof typeof rig.joints) => {
  const euler = new Euler().setFromQuaternion(rig.joints[name].quaternion, 'XYZ');
  return [euler.x, euler.y, euler.z].map((r) => Math.round(MathUtils.radToDeg(r) * 10) / 10);
};
const fields = Object.fromEntries(
  (
    ['leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist'] as const
  ).map((name) => [name, degrees(name)]),
);
const error = Math.max(result.errors.arms.left, result.errors.arms.right);
if (error > 0.005)
  console.warn(`Warning: the target is ${(error * 100).toFixed(1)} cm out of reach.`);
console.log(
  Object.entries(fields)
    .map(([name, angles]) => `"${name}": [${angles.join(', ')}]`)
    .join(',\n'),
);
