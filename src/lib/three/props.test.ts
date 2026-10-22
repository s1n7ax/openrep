import { Box3, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Prop } from '../schema/animation.ts';
import { createProps } from './props.ts';
import { createRig } from './rig.ts';

/** World bounding box of a prop placed at the origin. */
function bounds(prop: Prop): Box3 {
  const props = createProps([prop]);
  props.group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(props.group, true);
  props.dispose();
  return box;
}

describe('createProps: models', () => {
  it('builds the incline bench with its back rest rising behind the seat, above the floor', () => {
    const box = bounds({ type: 'incline-bench', attach: 'none' });
    expect(box.min.y).toBeGreaterThan(-0.001);
    // The back rest reaches well above the seat (top 0.45 m) towards −z.
    expect(box.max.y).toBeGreaterThan(0.85);
    expect(box.min.z).toBeLessThan(-0.8);
  });

  it('builds the kettlebell with the top of its handle at the grip point and the bell below', () => {
    const box = bounds({ type: 'kettlebell', attach: 'none' });
    // Only the handle tube rises above the grip point.
    expect(box.max.y).toBeGreaterThan(0.005);
    expect(box.max.y).toBeLessThan(0.02);
    expect(box.min.y).toBeLessThan(-0.2);
  });
});

describe('createProps: attachment', () => {
  it('keeps the leg machine roller on the front of the shins as the knees move', () => {
    const rig = createRig();
    const props = createProps([
      { type: 'leg-extension', attach: 'feet', position: [0, 0.08, 0.1] },
    ]);
    const roller = props.group.getObjectByName('prop:leg-extension');
    if (!roller) throw new Error('roller missing');
    for (const angle of [0, Math.PI / 2]) {
      for (const knee of [rig.joints.leftKnee, rig.joints.rightKnee]) {
        knee.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), angle);
      }
      props.update(rig);
      const ankles = rig.joints.leftAnkle
        .getWorldPosition(new Vector3())
        .add(rig.joints.rightAnkle.getWorldPosition(new Vector3()))
        .multiplyScalar(0.5);
      const shin = rig.joints.leftKnee.getWorldQuaternion(new Quaternion());
      const local = roller.position.clone().sub(ankles).applyQuaternion(shin.invert());
      expect(local.distanceTo(new Vector3(0, 0.08, 0.1))).toBeLessThan(1e-6);
    }
    props.dispose();
  });
});
