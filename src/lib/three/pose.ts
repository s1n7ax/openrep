/**
 * Applies a sampled pose to the rig: FK for the trunk, then each limb either
 * from FK joint angles or by two-bone IK towards its target.
 *
 * IK conventions (also the authoring rules of the animation format):
 * - A hand target is the grip point, the centre of the fist. The wrist stays
 *   straight. A hand holding a two-hand bar (prop attached to "hands") or a
 *   world bar it touches (pull-up bar, dip bars) turns so the bar runs through
 *   the fist, preferring an overhand grip; other hands keep a neutral forearm
 *   (palm facing the body when the arm hangs). Use FK arms for an underhand
 *   (supinated) bar grip.
 * - A hand target below `FLOOR_CONTACT_HEIGHT` that holds nothing is the palm
 *   centre of a hand lying flat on the floor, fingers pointing where the chest
 *   faces (push-up).
 * - A foot target is the ball of the foot. On the floor (target below
 *   `FLOOR_CONTACT_HEIGHT`) or on a foot plate (leg press) the sole rests flat
 *   when the leg can reach, otherwise the heel lifts just enough (calf raise,
 *   plank). On the floor the heel also lifts when a flat foot would fold the
 *   ankle more than 45° (rear foot of a lunge). Feet in the air keep a
 *   neutral ankle.
 * - The pole is a world point the elbow / knee bends towards. Without one,
 *   elbows point back and slightly out, knees point forward.
 */
import { Quaternion, Vector3, type Bone } from 'three';
import type { LimbPose, SampledPose } from './animation.ts';
import {
  ANKLE_HEIGHT,
  BALL_OFFSET,
  FLAT_HAND_PALM_OFFSET,
  FLAT_HAND_WRIST_HEIGHT,
  FLOOR_CONTACT_HEIGHT,
  FOREARM_LENGTH,
  GRIP_OFFSET,
  LEG_REACH,
  SHIN_LENGTH,
  THIGH_LENGTH,
  UPPER_ARM_LENGTH,
} from './dimensions.ts';
import { boneRotation, createTwoBoneSolution, frameRotation, solveTwoBone } from './ik.ts';
import { ARM_JOINTS, LEG_JOINTS, SIDES, sideSign, type Rig, type Side } from './rig.ts';

/** How a hand is shaped: closed around a handle, relaxed, or flat on a surface. */
export type HandShape = 'grip' | 'relaxed' | 'flat';

/** A straight bar a free hand can grab (pull-up bar, dip bar). */
export interface GraspLine {
  start: Vector3;
  end: Vector3;
}

/** What the props tell the pose solver about the hands and feet. */
export interface PoseContext {
  /**
   * "bar": the hand holds a two-hand bar (aligned with the hand-to-hand axis);
   * "handle": it holds a one-hand prop; "none": empty.
   */
  hands: Record<Side, 'bar' | 'handle' | 'none'>;
  /** World bars a free hand grabs when its target is on them. */
  graspLines: GraspLine[];
  /** Feet on a plate (leg press): the plate normal, pointing out of the plate. */
  footPlates: Record<Side, Vector3 | null>;
}

export function emptyPoseContext(): PoseContext {
  return {
    hands: { left: 'none', right: 'none' },
    graspLines: [],
    footPlates: { left: null, right: null },
  };
}

export interface PoseResult {
  hands: Record<Side, HandShape>;
  /** How far the toes bend up at the ball of the foot (radians) to stay on the surface. */
  toeBend: Record<Side, number>;
  /** Distance between each IK target and where the hand / foot ended up (0 for FK). */
  errors: { arms: Record<Side, number>; legs: Record<Side, number> };
}

export function createPoseResult(): PoseResult {
  return {
    hands: { left: 'relaxed', right: 'relaxed' },
    toeBend: { left: 0, right: 0 },
    errors: { arms: { left: 0, right: 0 }, legs: { left: 0, right: 0 } },
  };
}

/** Grasp lines closer than this to a hand target are grabbed. */
const GRASP_DISTANCE = 0.04;
/** A foot on the floor folds up towards the shin at most this far past neutral (radians). */
const MAX_DORSIFLEXION = (45 * Math.PI) / 180;
/** The toes bend up at most this far (radians). */
const MAX_TOE_BEND = (80 * Math.PI) / 180;
/** Pronation range preferred when turning a hand onto a bar, in radians. */
const MIN_PRONATION = (-80 * Math.PI) / 180;

const UP = new Vector3(0, 1, 0);
const _solution = createTwoBoneSolution();
const _root = new Vector3();
const _pole = new Vector3();
const _defaultPole = new Vector3();
const _target = new Vector3();
const _wrist = new Vector3();
const _dir = new Vector3();
const _hinge = new Vector3();
const _axis = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _fwd = new Vector3();
const _normal = new Vector3();
const _gripAxis = new Vector3();
const _parentQuat = new Quaternion();
const _upperQuat = new Quaternion();
const _lowerQuat = new Quaternion();
const _endQuat = new Quaternion();
const _twist = new Quaternion();

/** Sets a bone's local rotation from a desired world rotation. */
function setWorldRotation(bone: Bone, parentWorld: Quaternion, world: Quaternion): void {
  bone.quaternion.copy(parentWorld).invert().multiply(world);
}

/** The world point on the grip axis of a hand (centre of the fist). */
export function gripPoint(rig: Rig, side: Side, out: Vector3): Vector3 {
  const wrist = rig.joints[ARM_JOINTS[side].end];
  return out.set(0, -GRIP_OFFSET, 0).applyMatrix4(wrist.matrixWorld);
}

/** The world point under the ball of a foot. */
export function ballPoint(rig: Rig, side: Side, out: Vector3): Vector3 {
  const ankle = rig.joints[LEG_JOINTS[side].end];
  return out.set(0, -ANKLE_HEIGHT, BALL_OFFSET).applyMatrix4(ankle.matrixWorld);
}

function closestOnSegment(point: Vector3, line: GraspLine, out: Vector3): Vector3 {
  _c.subVectors(line.end, line.start);
  const lengthSq = _c.lengthSq();
  const along = lengthSq > 0 ? _a.subVectors(point, line.start).dot(_c) / lengthSq : 0;
  return out.copy(line.start).addScaledVector(_c, Math.min(1, Math.max(0, along)));
}

/** Direction of the bar a hand grips, or null when it grips none. */
function gripAxis(
  side: Side,
  pose: SampledPose,
  context: PoseContext,
  target: Vector3,
  out: Vector3,
): Vector3 | null {
  if (context.hands[side] === 'bar') {
    const left = pose.arms.left;
    const right = pose.arms.right;
    if (left.mode === 'ik' && right.mode === 'ik') {
      out.subVectors(right.target, left.target);
      if (out.lengthSq() > 1e-8) return out.normalize();
    }
    return out.set(1, 0, 0);
  }
  if (context.hands[side] === 'none') {
    for (const line of context.graspLines) {
      if (closestOnSegment(target, line, _b).distanceTo(target) < GRASP_DISTANCE) {
        return out.subVectors(line.end, line.start).normalize();
      }
    }
  }
  return null;
}

/**
 * Turns a hand about its forearm axis so that the thumb axis (local +z) runs
 * along `axis`, choosing the overhand option when both are possible.
 */
function alignGrip(side: Side, forearm: Quaternion, axis: Vector3, out: Quaternion): Quaternion {
  const y = _a.set(0, 1, 0).applyQuaternion(forearm);
  const z = _b.set(0, 0, 1).applyQuaternion(forearm);
  const projected = _c.copy(axis).addScaledVector(y, -axis.dot(y));
  if (projected.lengthSq() < 1e-8) return out.copy(forearm);
  projected.normalize();
  let twist = Math.atan2(_axis.crossVectors(z, projected).dot(y), z.dot(projected));
  // Pronation is a negative twist for the left forearm and a positive one for the right.
  let pronation = -sideSign(side) * twist;
  pronation = Math.atan2(Math.sin(pronation), Math.cos(pronation));
  if (pronation <= MIN_PRONATION) pronation += Math.PI;
  else if (pronation > MIN_PRONATION + Math.PI) pronation -= Math.PI;
  twist = -sideSign(side) * pronation;
  _twist.setFromAxisAngle(_axis.set(0, 1, 0), twist);
  return out.copy(forearm).multiply(_twist);
}

function resolvePole(limb: { pole: Vector3; poleWeight: number }, fallback: Vector3): Vector3 {
  return _pole.copy(fallback).lerp(limb.pole, limb.poleWeight);
}

function applyFk(rig: Rig, joints: { root: string; mid: string; end: string }, limb: LimbPose) {
  if (limb.mode !== 'fk') return;
  const bones = rig.joints as Record<string, Bone>;
  bones[joints.root]?.quaternion.copy(limb.root);
  bones[joints.mid]?.quaternion.copy(limb.mid);
  bones[joints.end]?.quaternion.copy(limb.end);
}

function solveArm(
  rig: Rig,
  side: Side,
  pose: SampledPose,
  context: PoseContext,
  result: PoseResult,
): void {
  const limb = pose.arms[side];
  const joints = ARM_JOINTS[side];
  const shoulder = rig.joints[joints.root];
  const elbow = rig.joints[joints.mid];
  const wrist = rig.joints[joints.end];
  if (limb.mode === 'fk') {
    applyFk(rig, joints, limb);
    result.hands[side] = context.hands[side] === 'none' ? 'relaxed' : 'grip';
    result.errors.arms[side] = 0;
    shoulder.updateMatrixWorld(true);
    return;
  }

  const chest = rig.joints.chest;
  chest.getWorldQuaternion(_parentQuat);
  shoulder.getWorldPosition(_root);
  const s = sideSign(side);
  _defaultPole
    .set(s * 0.25, -0.2, -0.5)
    .applyQuaternion(_parentQuat)
    .add(_root);
  const pole = resolvePole(limb, _defaultPole);
  const gripsBar = gripAxis(side, pose, context, limb.target, _gripAxis) !== null;
  const flat = !gripsBar && context.hands[side] === 'none' && limb.target.y < FLOOR_CONTACT_HEIGHT;

  if (flat) {
    // Fingers point where the chest faces, projected onto the floor.
    _fwd.set(0, 1, 0).applyQuaternion(_parentQuat).setY(0);
    _a.set(0, 0, 1).applyQuaternion(_parentQuat).setY(0);
    _fwd.add(_a);
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
    _fwd.normalize();
    _wrist
      .copy(limb.target)
      .addScaledVector(UP, FLAT_HAND_WRIST_HEIGHT)
      .addScaledVector(_fwd, -FLAT_HAND_PALM_OFFSET);
    solveTwoBone(_root, _wrist, pole, UPPER_ARM_LENGTH, FOREARM_LENGTH, _solution);
    _wrist.copy(_solution.end);
    result.errors.arms[side] = _solution.error;
  } else {
    solveTwoBone(
      _root,
      limb.target,
      pole,
      UPPER_ARM_LENGTH,
      FOREARM_LENGTH + GRIP_OFFSET,
      _solution,
    );
    _dir.subVectors(_solution.end, _solution.mid).normalize();
    _wrist.copy(_solution.mid).addScaledVector(_dir, FOREARM_LENGTH);
    result.errors.arms[side] = _solution.error;
  }

  // Arms: the hinge (local +x) is the bend-plane normal.
  _hinge.copy(_solution.bendNormal);
  boneRotation(_dir.subVectors(_solution.mid, _root), _hinge, _upperQuat);
  boneRotation(_dir.subVectors(_wrist, _solution.mid), _hinge, _lowerQuat);

  if (flat) {
    // Palm down: the left palm faces local −x, the right palm local +x.
    _a.copy(UP).multiplyScalar(s);
    frameRotation(_a, _b.copy(_fwd).negate(), _endQuat);
    result.hands[side] = 'flat';
  } else if (gripsBar) {
    alignGrip(side, _lowerQuat, _gripAxis, _endQuat);
    result.hands[side] = 'grip';
  } else {
    _endQuat.copy(_lowerQuat);
    result.hands[side] = context.hands[side] === 'none' ? 'relaxed' : 'grip';
  }

  setWorldRotation(shoulder, _parentQuat, _upperQuat);
  setWorldRotation(elbow, _upperQuat, _lowerQuat);
  setWorldRotation(wrist, _lowerQuat, _endQuat);
  shoulder.updateMatrixWorld(true);
}

/** Ankle position for a foot resting on a surface, with the heel lifted by `lift` radians. */
function plantedAnkle(target: Vector3, normal: Vector3, fwd: Vector3, lift: number, out: Vector3) {
  _axis.crossVectors(normal, fwd).normalize();
  out.copy(normal).multiplyScalar(ANKLE_HEIGHT).addScaledVector(fwd, -BALL_OFFSET);
  return out.applyAxisAngle(_axis, lift).add(target);
}

/**
 * Whether the leg reaches a foot planted with the heel lifted by `lift`, and
 * (with `limitAnkle`) the ankle stays within `MAX_DORSIFLEXION`.
 */
function plantedLegFits(
  target: Vector3,
  normal: Vector3,
  fwd: Vector3,
  lift: number,
  pole: Vector3,
  reach: number,
  limitAnkle: boolean,
): boolean {
  if (plantedAnkle(target, normal, fwd, lift, _wrist).distanceTo(_root) > reach) return false;
  if (!limitAnkle) return true;
  solveTwoBone(_root, _wrist, pole, THIGH_LENGTH, SHIN_LENGTH, _solution);
  const shin = _c.subVectors(_solution.mid, _wrist).normalize();
  const toes = _dir.copy(fwd).applyAxisAngle(_axis.crossVectors(normal, fwd).normalize(), lift);
  return toes.dot(shin) <= Math.sin(MAX_DORSIFLEXION);
}

function solveLeg(
  rig: Rig,
  side: Side,
  pose: SampledPose,
  context: PoseContext,
  result: PoseResult,
): void {
  const limb = pose.legs[side];
  const joints = LEG_JOINTS[side];
  const hip = rig.joints[joints.root];
  const knee = rig.joints[joints.mid];
  const ankle = rig.joints[joints.end];
  result.toeBend[side] = 0;
  if (limb.mode === 'fk') {
    applyFk(rig, joints, limb);
    result.errors.legs[side] = 0;
    hip.updateMatrixWorld(true);
    return;
  }

  const pelvis = rig.joints.pelvis;
  pelvis.getWorldQuaternion(_parentQuat);
  hip.getWorldPosition(_root);
  const s = sideSign(side);
  _defaultPole
    .set(s * 0.06, -0.3, 0.7)
    .applyQuaternion(_parentQuat)
    .add(_root);
  const pole = resolvePole(limb, _defaultPole);
  _target.copy(limb.target);

  const plate = context.footPlates[side];
  const onSurface = plate !== null || _target.y < FLOOR_CONTACT_HEIGHT;
  const reach = LEG_REACH * (1 - 1e-4);

  if (onSurface) {
    _normal.copy(plate ?? UP).normalize();
    // Toes point the way the knee faces, along the surface.
    _a.subVectors(_target, _root).normalize();
    _b.subVectors(pole, _root);
    _b.addScaledVector(_a, -_b.dot(_a));
    _hinge.crossVectors(_a, _b).negate();
    _fwd.crossVectors(_hinge, _normal);
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1).applyQuaternion(_parentQuat);
    _fwd.addScaledVector(_normal, -_fwd.dot(_normal)).normalize();

    // On the floor the ankle cannot fold past its range either (rear foot of a lunge).
    const limitAnkle = plate === null;
    const fits = (angle: number) =>
      plantedLegFits(_target, _normal, _fwd, angle, pole, reach, limitAnkle);
    let lift = 0;
    if (!fits(0)) {
      // Lift the heel until the ankle comes within reach and range (or as close as it gets).
      let best = 0;
      let bestDistance = Infinity;
      let reachable = -1;
      const step = Math.PI / 72;
      for (let angle = step; angle <= Math.PI * 0.6; angle += step) {
        const distance = plantedAnkle(_target, _normal, _fwd, angle, _wrist).distanceTo(_root);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = angle;
        }
        if (reachable < 0 && distance <= reach) reachable = angle;
        if (fits(angle)) {
          let low = angle - step;
          let high = angle;
          for (let i = 0; i < 20; i++) {
            const middle = (low + high) / 2;
            if (fits(middle)) high = middle;
            else low = middle;
          }
          best = high;
          reachable = -1;
          break;
        }
      }
      lift = reachable >= 0 ? reachable : best;
    }
    // The toes stay on the surface while the heel lifts.
    result.toeBend[side] = Math.min(lift, MAX_TOE_BEND);
    plantedAnkle(_target, _normal, _fwd, lift, _wrist);
    solveTwoBone(_root, _wrist, pole, THIGH_LENGTH, SHIN_LENGTH, _solution);
    // Foot frame: local +y along the surface normal, +z towards the toes, heel lifted.
    _axis.crossVectors(_normal, _fwd).normalize();
    _a.copy(_normal).applyAxisAngle(_axis, lift);
    frameRotation(_axis, _a, _endQuat);
  } else {
    // In the air: neutral ankle; iterate because the ankle depends on the shin.
    _wrist.copy(_target);
    for (let i = 0; i < 12; i++) {
      solveTwoBone(_root, _wrist, pole, THIGH_LENGTH, SHIN_LENGTH, _solution);
      _hinge.copy(_solution.bendNormal).negate();
      boneRotation(_dir.subVectors(_solution.end, _solution.mid), _hinge, _lowerQuat);
      _a.set(0, -ANKLE_HEIGHT, BALL_OFFSET).applyQuaternion(_lowerQuat);
      _b.subVectors(_target, _a);
      const moved = _b.distanceToSquared(_wrist);
      _wrist.copy(_b);
      if (moved < 1e-14) break;
    }
    solveTwoBone(_root, _wrist, pole, THIGH_LENGTH, SHIN_LENGTH, _solution);
  }

  // Legs: the hinge (local +x) is the negated bend-plane normal.
  _hinge.copy(_solution.bendNormal).negate();
  boneRotation(_dir.subVectors(_solution.mid, _root), _hinge, _upperQuat);
  boneRotation(_dir.subVectors(_solution.end, _solution.mid), _hinge, _lowerQuat);
  if (!onSurface) _endQuat.copy(_lowerQuat);

  setWorldRotation(hip, _parentQuat, _upperQuat);
  setWorldRotation(knee, _upperQuat, _lowerQuat);
  setWorldRotation(ankle, _lowerQuat, _endQuat);
  hip.updateMatrixWorld(true);
  result.errors.legs[side] = ballPoint(rig, side, _a).distanceTo(_target);
}

/** Poses the rig. Returns the hand shapes and the IK errors. */
export function applyPose(
  rig: Rig,
  pose: SampledPose,
  context: PoseContext = emptyPoseContext(),
  result: PoseResult = createPoseResult(),
): PoseResult {
  const { joints } = rig;
  joints.pelvis.position.copy(pose.pelvisPosition);
  joints.pelvis.quaternion.copy(pose.pelvis);
  joints.spine.quaternion.copy(pose.spine);
  joints.chest.quaternion.copy(pose.chest);
  joints.neck.quaternion.copy(pose.neck);
  joints.head.quaternion.copy(pose.head);
  joints.pelvis.updateMatrixWorld(true);

  for (const side of SIDES) {
    solveLeg(rig, side, pose, context, result);
    solveArm(rig, side, pose, context, result);
  }
  return result;
}
