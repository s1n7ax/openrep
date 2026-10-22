import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createSampledPose, type SampledPose } from './animation.ts';
import { ANKLE_HEIGHT, BALL_OFFSET, STANDING_PELVIS_HEIGHT } from './dimensions.ts';
import { applyPose, ballPoint, emptyPoseContext, gripPoint } from './pose.ts';
import { createRig, type Rig } from './rig.ts';

const UP = new Vector3(0, 1, 0);

function standingPose(): SampledPose {
  const pose = createSampledPose();
  pose.pelvisPosition.set(0, STANDING_PELVIS_HEIGHT - 0.01, 0);
  for (const [side, x] of [
    ['left', 0.12],
    ['right', -0.12],
  ] as const) {
    pose.legs[side] = {
      mode: 'ik',
      target: new Vector3(x, 0, 0.14),
      pole: new Vector3(x, 0.5, 1),
      poleWeight: 1,
    };
  }
  return pose;
}

function axis(rig: Rig, joint: keyof Rig['joints'], local: Vector3): Vector3 {
  return local.clone().applyQuaternion(rig.joints[joint].getWorldQuaternion(new Quaternion()));
}

describe('applyPose: feet', () => {
  it('plants a reachable foot flat on the floor with the ball on the target', () => {
    const rig = createRig();
    const result = applyPose(rig, standingPose());
    expect(result.errors.legs.left).toBeLessThan(1e-6);
    expect(
      ballPoint(rig, 'left', new Vector3()).distanceTo(new Vector3(0.12, 0, 0.14)),
    ).toBeLessThan(1e-6);
    expect(axis(rig, 'leftAnkle', new Vector3(0, 1, 0)).dot(UP)).toBeGreaterThan(0.9999);
    const ankle = rig.joints.leftAnkle.getWorldPosition(new Vector3());
    expect(ankle.y).toBeCloseTo(ANKLE_HEIGHT, 6);
  });

  it('lifts the heel when the leg cannot reach a flat foot (calf raise)', () => {
    const rig = createRig();
    const pose = standingPose();
    pose.pelvisPosition.y = STANDING_PELVIS_HEIGHT + 0.08;
    const result = applyPose(rig, pose);
    expect(result.errors.legs.left).toBeLessThan(0.005);
    const footUp = axis(rig, 'leftAnkle', new Vector3(0, 1, 0));
    expect(footUp.z).toBeGreaterThan(0.2); // tipped forward: heel up, toes down
    const ankle = rig.joints.leftAnkle.getWorldPosition(new Vector3());
    expect(ankle.y).toBeGreaterThan(ANKLE_HEIGHT + 0.05);
  });

  it('keeps a neutral ankle for a foot in the air', () => {
    const rig = createRig();
    const pose = standingPose();
    pose.legs.left = {
      mode: 'ik',
      target: new Vector3(0.1, 0.3, 0.3),
      pole: new Vector3(0.1, 0.8, 1),
      poleWeight: 1,
    };
    const result = applyPose(rig, pose);
    expect(result.errors.legs.left).toBeLessThan(1e-4);
    // The foot keeps its rest angle to the shin.
    expect(rig.joints.leftAnkle.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(
      ballPoint(rig, 'left', new Vector3()).distanceTo(new Vector3(0.1, 0.3, 0.3)),
    ).toBeLessThan(1e-4);
    expect(BALL_OFFSET).toBeGreaterThan(0);
  });
});

describe('applyPose: hands', () => {
  it('puts the grip point on a reachable target', () => {
    const rig = createRig();
    const pose = standingPose();
    const target = new Vector3(0.25, 1.1, 0.25);
    pose.arms.left = { mode: 'ik', target, pole: new Vector3(0.5, 1, -0.5), poleWeight: 1 };
    const result = applyPose(rig, pose);
    expect(result.errors.arms.left).toBe(0);
    expect(gripPoint(rig, 'left', new Vector3()).distanceTo(target)).toBeLessThan(1e-6);
    expect(result.hands.left).toBe('relaxed');
  });

  it('turns the fists so a two-hand bar runs through them, overhand', () => {
    const rig = createRig();
    const pose = standingPose();
    pose.arms.left = {
      mode: 'ik',
      target: new Vector3(0.25, 0.85, 0.12),
      pole: new Vector3(0.3, 1, -0.6),
      poleWeight: 1,
    };
    pose.arms.right = {
      mode: 'ik',
      target: new Vector3(-0.25, 0.85, 0.12),
      pole: new Vector3(-0.3, 1, -0.6),
      poleWeight: 1,
    };
    const context = emptyPoseContext();
    context.hands.left = 'bar';
    context.hands.right = 'bar';
    const result = applyPose(rig, pose, context);
    expect(result.hands).toEqual({ left: 'grip', right: 'grip' });
    for (const side of ['left', 'right'] as const) {
      const thumb = axis(rig, side === 'left' ? 'leftWrist' : 'rightWrist', new Vector3(0, 0, 1));
      expect(Math.abs(thumb.x)).toBeGreaterThan(0.99);
    }
    // Overhand: the palms face backwards (towards the body) when the bar hangs in front.
    const leftPalm = axis(rig, 'leftWrist', new Vector3(-1, 0, 0));
    const rightPalm = axis(rig, 'rightWrist', new Vector3(1, 0, 0));
    expect(leftPalm.z).toBeLessThan(-0.8);
    expect(rightPalm.z).toBeLessThan(-0.8);
  });

  it('lays an empty hand flat, palm down, when its target is on the floor', () => {
    const rig = createRig();
    const pose = standingPose();
    pose.pelvisPosition.set(0, 0.42, 0);
    pose.pelvis.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.25);
    pose.arms.left = {
      mode: 'ik',
      target: new Vector3(0.2, 0, 0.5),
      pole: new Vector3(0.5, 0.3, 0),
      poleWeight: 1,
    };
    const result = applyPose(rig, pose);
    expect(result.hands.left).toBe('flat');
    expect(result.errors.arms.left).toBeLessThan(1e-6);
    const leftPalm = axis(rig, 'leftWrist', new Vector3(-1, 0, 0));
    expect(leftPalm.y).toBeLessThan(-0.999);
  });

  it('applies FK joint angles as given', () => {
    const rig = createRig();
    const pose = standingPose();
    const elbow = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1);
    pose.arms.left = { mode: 'fk', root: new Quaternion(), mid: elbow, end: new Quaternion() };
    applyPose(rig, pose);
    expect(rig.joints.leftElbow.quaternion.angleTo(elbow)).toBeLessThan(1e-9);
  });
});
