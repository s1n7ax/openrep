import { Euler, Group, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { readFigureAsset } from '../../../tests/helpers/figureAsset.ts';
import { createFigure, type Figure } from './figure.ts';
import { createPoseResult } from './pose.ts';

const asset = readFigureAsset();

/** Bends every joint with a blend bone: shoulders, elbows, forearm twist, hips, knees. */
function bend(figure: Figure): void {
  const { joints } = figure.rig;
  joints.leftShoulder.quaternion.setFromEuler(new Euler(-1.2, 0.3, 0.6));
  joints.rightShoulder.quaternion.setFromEuler(new Euler(0.4, -0.2, -1.1));
  joints.leftElbow.quaternion.setFromEuler(new Euler(-1.4, 0, 0));
  joints.rightElbow.quaternion.setFromEuler(new Euler(-0.9, 0, 0));
  joints.leftWrist.quaternion.setFromEuler(new Euler(0, 1.1, 0));
  joints.rightWrist.quaternion.setFromEuler(new Euler(0, -0.8, 0));
  joints.leftHip.quaternion.setFromEuler(new Euler(-1.3, 0, 0.2));
  joints.rightHip.quaternion.setFromEuler(new Euler(0.3, 0.2, -0.3));
  joints.leftKnee.quaternion.setFromEuler(new Euler(1.5, 0, 0));
  joints.rightKnee.quaternion.setFromEuler(new Euler(0.6, 0, 0));
}

/** World position of every skinned vertex, as the renderer computes it. */
function skinnedWorldPositions(figure: Figure): Vector3[] {
  const { mesh } = figure;
  const count = mesh.geometry.getAttribute('position').count;
  return Array.from({ length: count }, (_, i) =>
    mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld),
  );
}

function largestDistance(actual: Vector3[], expected: Vector3[]): number {
  return actual.reduce(
    (largest, position, i) => Math.max(largest, position.distanceTo(expected[i] as Vector3)),
    0,
  );
}

describe('figure', () => {
  it('skins the same body wherever its group (or an ancestor) is moved', () => {
    const scene = new Scene();
    const parent = new Group();
    scene.add(parent);
    const figure = createFigure(asset);
    parent.add(figure.group);
    bend(figure);
    figure.applyPoseResult(createPoseResult());
    scene.updateMatrixWorld();
    const atOrigin = skinnedWorldPositions(figure);

    parent.position.set(-0.4, 0.1, 0.3);
    parent.rotation.set(0, 0, 0.3);
    figure.group.position.set(1, 0.2, -0.5);
    figure.group.rotation.set(0.2, 0.8, 0);
    figure.group.scale.setScalar(1.3);
    scene.updateMatrixWorld();
    const expected = atOrigin.map((position) =>
      position.clone().applyMatrix4(figure.group.matrixWorld),
    );

    // Moved after posing: the blend bones follow the group.
    expect(largestDistance(skinnedWorldPositions(figure), expected)).toBeLessThan(1e-4);

    // Posed again where it now stands.
    figure.applyPoseResult(createPoseResult());
    scene.updateMatrixWorld();
    expect(largestDistance(skinnedWorldPositions(figure), expected)).toBeLessThan(1e-4);
    figure.dispose();
  });
});
