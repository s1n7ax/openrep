import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Prop } from '../schema/animation.ts';
import { createProps } from './props.ts';

/** World bounding box of a prop placed at the origin. */
function bounds(prop: Prop): Box3 {
  const props = createProps([prop]);
  props.group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(props.group);
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
});
