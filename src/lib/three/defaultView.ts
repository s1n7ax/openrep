/**
 * The direction the camera looks from in an exercise's default view (no
 * camera of its own): from the front-left, or from behind when most of the
 * primary muscles are on the back of the body.
 */
import { Vector3 } from 'three';
import type { Muscle } from '../schema/common.ts';

export const FRONT_DEFAULT = new Vector3(0.72, 0.36, 1).normalize();
export const BACK_DEFAULT = new Vector3(-0.72, 0.36, -1).normalize();

/** Groups seen from behind. */
const BACK_MUSCLES: ReadonlySet<Muscle> = new Set<Muscle>([
  'abductors',
  'calves',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'traps',
  'triceps',
]);

/** The default view direction that shows most of the primary muscles. */
export function defaultViewDirection(primary: readonly Muscle[]): Vector3 {
  const back = primary.filter((muscle) => BACK_MUSCLES.has(muscle)).length;
  return back * 2 > primary.length ? BACK_DEFAULT : FRONT_DEFAULT;
}
