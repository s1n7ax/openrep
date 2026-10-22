/**
 * The figure's joint hierarchy (no meshes), built from `dimensions.ts`:
 * pelvis → spine → chest → neck → head; chest → shoulders → elbows → wrists;
 * pelvis → hips → knees → ankles. Each joint is a `Bone` named like the pose
 * fields of the animation format (`leftShoulder` rotates the upper arm, …).
 */
import { Bone } from 'three';
import {
  CHEST_OFFSET,
  FOREARM_LENGTH,
  HEAD_OFFSET,
  HIP_OFFSET,
  NECK_OFFSET,
  SHIN_LENGTH,
  SHOULDER_OFFSET,
  SPINE_OFFSET,
  STANDING_PELVIS_HEIGHT,
  THIGH_LENGTH,
  UPPER_ARM_LENGTH,
} from './dimensions.ts';

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

export const JOINT_NAMES = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftElbow',
  'leftWrist',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'rightHip',
  'rightKnee',
  'rightAnkle',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

/** The three joints of a limb, from the body outwards. */
export interface LimbJoints {
  root: JointName;
  mid: JointName;
  end: JointName;
}

export const ARM_JOINTS: Record<Side, LimbJoints> = {
  left: { root: 'leftShoulder', mid: 'leftElbow', end: 'leftWrist' },
  right: { root: 'rightShoulder', mid: 'rightElbow', end: 'rightWrist' },
};
export const LEG_JOINTS: Record<Side, LimbJoints> = {
  left: { root: 'leftHip', mid: 'leftKnee', end: 'leftAnkle' },
  right: { root: 'rightHip', mid: 'rightKnee', end: 'rightAnkle' },
};

/** +1 for the left side (+x), −1 for the right side. */
export function sideSign(side: Side): 1 | -1 {
  return side === 'left' ? 1 : -1;
}

export interface Rig {
  /** The pelvis bone; its position is the figure's position in the world. */
  root: Bone;
  joints: Record<JointName, Bone>;
}

function joint(name: JointName, parent: Bone | null, x: number, y: number, z: number): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  parent?.add(bone);
  return bone;
}

/** Builds the skeleton in the rest pose. */
export function createRig(): Rig {
  const pelvis = joint('pelvis', null, 0, STANDING_PELVIS_HEIGHT, 0);
  const spine = joint('spine', pelvis, SPINE_OFFSET.x, SPINE_OFFSET.y, SPINE_OFFSET.z);
  const chest = joint('chest', spine, CHEST_OFFSET.x, CHEST_OFFSET.y, CHEST_OFFSET.z);
  const neck = joint('neck', chest, NECK_OFFSET.x, NECK_OFFSET.y, NECK_OFFSET.z);
  const head = joint('head', neck, HEAD_OFFSET.x, HEAD_OFFSET.y, HEAD_OFFSET.z);

  const joints: Partial<Record<JointName, Bone>> = { pelvis, spine, chest, neck, head };
  for (const side of SIDES) {
    const s = sideSign(side);
    const arm = ARM_JOINTS[side];
    const shoulder = joint(
      arm.root,
      chest,
      s * SHOULDER_OFFSET.x,
      SHOULDER_OFFSET.y,
      SHOULDER_OFFSET.z,
    );
    const elbow = joint(arm.mid, shoulder, 0, -UPPER_ARM_LENGTH, 0);
    const wrist = joint(arm.end, elbow, 0, -FOREARM_LENGTH, 0);
    const leg = LEG_JOINTS[side];
    const hip = joint(leg.root, pelvis, s * HIP_OFFSET.x, HIP_OFFSET.y, HIP_OFFSET.z);
    const knee = joint(leg.mid, hip, 0, -THIGH_LENGTH, 0);
    const ankle = joint(leg.end, knee, 0, -SHIN_LENGTH, 0);
    Object.assign(joints, {
      [arm.root]: shoulder,
      [arm.mid]: elbow,
      [arm.end]: wrist,
      [leg.root]: hip,
      [leg.mid]: knee,
      [leg.end]: ankle,
    });
  }
  pelvis.updateMatrixWorld(true);
  return { root: pelvis, joints: joints as Record<JointName, Bone> };
}

/** Puts every joint back to the rest pose. */
export function resetRig(rig: Rig): void {
  for (const bone of Object.values(rig.joints)) bone.quaternion.identity();
  rig.root.position.set(0, STANDING_PELVIS_HEIGHT, 0);
  rig.root.updateMatrixWorld(true);
}
