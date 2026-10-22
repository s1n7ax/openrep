/**
 * Samples an animation file's keyframes at a time t in the loop: positions are
 * interpolated linearly, rotations by quaternion slerp, eased per segment
 * ("easeInOut" unless the keyframe says otherwise), and t wraps around 1.
 */
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { Animation, Ease, IkTarget, Pose, Vec3 } from '../schema/animation.ts';
import { SIDES, type Side } from './rig.ts';

export interface IkLimbPose {
  mode: 'ik';
  /** Where the hand's grip point / the ball of the foot should be (world). */
  target: Vector3;
  /** Explicit pole (world), blended with the default pole by `poleWeight`. */
  pole: Vector3;
  /** 1 = use `pole`, 0 = use the default pole for this limb. */
  poleWeight: number;
}

export interface FkLimbPose {
  mode: 'fk';
  /** Local rotations of the shoulder/hip, elbow/knee and wrist/ankle joints. */
  root: Quaternion;
  mid: Quaternion;
  end: Quaternion;
}

export type LimbPose = IkLimbPose | FkLimbPose;

/** A pose resolved into vectors and quaternions. */
export interface SampledPose {
  pelvisPosition: Vector3;
  pelvis: Quaternion;
  spine: Quaternion;
  chest: Quaternion;
  neck: Quaternion;
  head: Quaternion;
  arms: Record<Side, LimbPose>;
  legs: Record<Side, LimbPose>;
}

const IK_FIELDS = {
  arms: { left: 'leftHand', right: 'rightHand' },
  legs: { left: 'leftFoot', right: 'rightFoot' },
} as const;
const FK_FIELDS = {
  arms: {
    left: ['leftShoulder', 'leftElbow', 'leftWrist'],
    right: ['rightShoulder', 'rightElbow', 'rightWrist'],
  },
  legs: {
    left: ['leftHip', 'leftKnee', 'leftAnkle'],
    right: ['rightHip', 'rightKnee', 'rightAnkle'],
  },
} as const;
type LimbGroup = keyof typeof IK_FIELDS;
const LIMB_GROUPS: readonly LimbGroup[] = ['arms', 'legs'];

const _euler = new Euler();

/** Converts Euler angles in degrees (X, Y, Z order) to a quaternion. */
export function eulerDegreesToQuaternion(
  rotation: Vec3 | undefined,
  out = new Quaternion(),
): Quaternion {
  if (rotation === undefined) return out.identity();
  _euler.set(
    MathUtils.degToRad(rotation[0]),
    MathUtils.degToRad(rotation[1]),
    MathUtils.degToRad(rotation[2]),
    'XYZ',
  );
  return out.setFromEuler(_euler);
}

export function applyEase(ease: Ease, s: number): number {
  switch (ease) {
    case 'linear':
      return s;
    case 'easeIn':
      return 1 - Math.cos((s * Math.PI) / 2);
    case 'easeOut':
      return Math.sin((s * Math.PI) / 2);
    case 'easeInOut':
      return (1 - Math.cos(s * Math.PI)) / 2;
  }
}

function vec(value: Vec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

interface CompiledIk {
  target: Vector3;
  pole: Vector3 | null;
}

interface CompiledKeyframe {
  t: number;
  ease: Ease;
  pelvisPosition: Vector3;
  pelvis: Quaternion;
  spine: Quaternion;
  chest: Quaternion;
  neck: Quaternion;
  head: Quaternion;
  ik: Record<LimbGroup, Record<Side, CompiledIk | null>>;
  fk: Record<LimbGroup, Record<Side, [Quaternion, Quaternion, Quaternion]>>;
}

function compileIk(target: IkTarget | undefined): CompiledIk | null {
  if (target === undefined) return null;
  return { target: vec(target.target), pole: target.pole ? vec(target.pole) : null };
}

function compileKeyframe(t: number, ease: Ease | undefined, pose: Pose): CompiledKeyframe {
  const limbs = <T>(make: (group: LimbGroup, side: Side) => T) =>
    Object.fromEntries(
      LIMB_GROUPS.map((group) => [
        group,
        Object.fromEntries(SIDES.map((side) => [side, make(group, side)])),
      ]),
    ) as Record<LimbGroup, Record<Side, T>>;
  return {
    t,
    ease: ease ?? 'easeInOut',
    pelvisPosition: vec(pose.pelvis.position),
    pelvis: eulerDegreesToQuaternion(pose.pelvis.rotation),
    spine: eulerDegreesToQuaternion(pose.spine),
    chest: eulerDegreesToQuaternion(pose.chest),
    neck: eulerDegreesToQuaternion(pose.neck),
    head: eulerDegreesToQuaternion(pose.head),
    ik: limbs((group, side) => compileIk(pose[IK_FIELDS[group][side]])),
    fk: limbs((group, side) => {
      const [root, mid, end] = FK_FIELDS[group][side];
      return [
        eulerDegreesToQuaternion(pose[root]),
        eulerDegreesToQuaternion(pose[mid]),
        eulerDegreesToQuaternion(pose[end]),
      ];
    }),
  };
}

export function createSampledPose(): SampledPose {
  const limb = (): LimbPose => ({
    mode: 'fk',
    root: new Quaternion(),
    mid: new Quaternion(),
    end: new Quaternion(),
  });
  return {
    pelvisPosition: new Vector3(),
    pelvis: new Quaternion(),
    spine: new Quaternion(),
    chest: new Quaternion(),
    neck: new Quaternion(),
    head: new Quaternion(),
    arms: { left: limb(), right: limb() },
    legs: { left: limb(), right: limb() },
  };
}

/** Keyframes of one animation, pre-converted for fast sampling. */
export class AnimationSampler {
  readonly durationSec: number;
  private readonly keyframes: CompiledKeyframe[];

  constructor(animation: Pick<Animation, 'durationSec' | 'keyframes'>) {
    this.durationSec = animation.durationSec;
    this.keyframes = animation.keyframes.map((k) => compileKeyframe(k.t, k.ease, k.pose));
  }

  /** Keyframe times, for tests and tools. */
  get times(): number[] {
    return this.keyframes.map((k) => k.t);
  }

  /** The pose at loop time `t` (wrapped into [0, 1]). */
  sample(t: number, out: SampledPose = createSampledPose()): SampledPose {
    const frames = this.keyframes;
    const time = t === 1 ? 1 : t - Math.floor(t);
    let index = 0;
    while (index < frames.length - 2 && (frames[index + 1]?.t ?? 1) <= time) index++;
    const a = frames[index];
    const b = frames[Math.min(index + 1, frames.length - 1)];
    if (!a || !b) throw new RangeError('An animation needs at least one keyframe');
    const span = b.t - a.t;
    const s =
      span > 0
        ? applyEase(a.ease, MathUtils.clamp((time - a.t) / span, 0, 1))
        : time >= b.t
          ? 1
          : 0;

    out.pelvisPosition.lerpVectors(a.pelvisPosition, b.pelvisPosition, s);
    out.pelvis.slerpQuaternions(a.pelvis, b.pelvis, s);
    out.spine.slerpQuaternions(a.spine, b.spine, s);
    out.chest.slerpQuaternions(a.chest, b.chest, s);
    out.neck.slerpQuaternions(a.neck, b.neck, s);
    out.head.slerpQuaternions(a.head, b.head, s);

    for (const group of LIMB_GROUPS) {
      for (const side of SIDES) {
        out[group][side] = sampleLimb(
          a.ik[group][side],
          b.ik[group][side],
          a.fk[group][side],
          b.fk[group][side],
          s,
          out[group][side],
        );
      }
    }
    return out;
  }
}

function sampleLimb(
  ikA: CompiledIk | null,
  ikB: CompiledIk | null,
  fkA: [Quaternion, Quaternion, Quaternion],
  fkB: [Quaternion, Quaternion, Quaternion],
  s: number,
  previous: LimbPose,
): LimbPose {
  if (ikA && ikB) {
    const limb: IkLimbPose =
      previous.mode === 'ik'
        ? previous
        : { mode: 'ik', target: new Vector3(), pole: new Vector3(), poleWeight: 0 };
    limb.target.lerpVectors(ikA.target, ikB.target, s);
    if (ikA.pole && ikB.pole) {
      limb.pole.lerpVectors(ikA.pole, ikB.pole, s);
      limb.poleWeight = 1;
    } else if (ikA.pole) {
      limb.pole.copy(ikA.pole);
      limb.poleWeight = 1 - s;
    } else if (ikB.pole) {
      limb.pole.copy(ikB.pole);
      limb.poleWeight = s;
    } else {
      limb.poleWeight = 0;
    }
    return limb;
  }
  const limb: FkLimbPose =
    previous.mode === 'fk'
      ? previous
      : { mode: 'fk', root: new Quaternion(), mid: new Quaternion(), end: new Quaternion() };
  limb.root.slerpQuaternions(fkA[0], fkB[0], s);
  limb.mid.slerpQuaternions(fkA[1], fkB[1], s);
  limb.end.slerpQuaternions(fkA[2], fkB[2], s);
  return limb;
}
