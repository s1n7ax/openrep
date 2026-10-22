/**
 * Analytic two-bone inverse kinematics (shoulder–elbow–wrist, hip–knee–ankle)
 * with a pole vector that chooses the bend direction.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

export interface TwoBoneSolution {
  /** World position of the middle joint (elbow / knee). */
  mid: Vector3;
  /** World position the end joint actually reaches (the target clamped to reach). */
  end: Vector3;
  /** Unit normal of the bend plane: (root → target) × (bend direction). */
  bendNormal: Vector3;
  /** How far the reached end is from the requested target (0 when reachable). */
  error: number;
}

export function createTwoBoneSolution(): TwoBoneSolution {
  return { mid: new Vector3(), end: new Vector3(), bendNormal: new Vector3(), error: 0 };
}

const _dir = new Vector3();
const _bend = new Vector3();
const _fallback = new Vector3();

/**
 * Solves a two-bone chain from `root` towards `target`. The middle joint bends
 * towards `pole`. Targets out of reach are clamped: the chain stretches
 * straight towards them (or folds as far as it can when too close).
 */
export function solveTwoBone(
  root: Vector3,
  target: Vector3,
  pole: Vector3,
  upperLength: number,
  lowerLength: number,
  out: TwoBoneSolution = createTwoBoneSolution(),
): TwoBoneSolution {
  _dir.subVectors(target, root);
  const distance = _dir.length();
  if (distance < 1e-9) _dir.set(0, -1, 0);
  else _dir.divideScalar(distance);

  const maxReach = upperLength + lowerLength;
  const minReach = Math.abs(upperLength - lowerLength);
  const reach = Math.min(Math.max(distance, minReach + 1e-6), maxReach * (1 - 1e-6));
  out.error = Math.max(0, distance - maxReach, minReach - distance);

  // Bend direction: the part of (pole − root) perpendicular to the target direction.
  _bend.subVectors(pole, root);
  _bend.addScaledVector(_dir, -_bend.dot(_dir));
  if (_bend.lengthSq() < 1e-12) {
    // Pole on the line to the target: pick any perpendicular direction.
    _fallback.set(0, 0, 1);
    if (Math.abs(_dir.z) > 0.9) _fallback.set(0, 1, 0);
    _bend.crossVectors(_dir, _fallback);
  }
  _bend.normalize();

  const along =
    (upperLength * upperLength + reach * reach - lowerLength * lowerLength) / (2 * reach);
  const across = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  out.mid.copy(root).addScaledVector(_dir, along).addScaledVector(_bend, across);
  out.end.copy(root).addScaledVector(_dir, reach);
  out.bendNormal.crossVectors(_dir, _bend).normalize();
  return out;
}

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _basis = new Matrix4();

/**
 * World rotation of a limb bone whose local −y axis points along `direction`
 * and whose local +x axis (the hinge axis) is as close as possible to `hinge`.
 */
export function boneRotation(direction: Vector3, hinge: Vector3, out: Quaternion): Quaternion {
  _y.copy(direction).normalize().negate();
  _x.copy(hinge).addScaledVector(_y, -hinge.dot(_y));
  if (_x.lengthSq() < 1e-12) {
    // Hinge parallel to the bone: any perpendicular axis will do.
    _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    if (_x.lengthSq() < 1e-6) _x.set(0, 0, 1).addScaledVector(_y, -_y.z);
  }
  _x.normalize();
  _z.crossVectors(_x, _y);
  _basis.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_basis);
}

/**
 * World rotation of a frame with local +x along `x`, local +y along `y`
 * (made perpendicular to `x`) and local +z = x × y.
 */
export function frameRotation(x: Vector3, y: Vector3, out: Quaternion): Quaternion {
  _x.copy(x).normalize();
  _y.copy(y).addScaledVector(_x, -y.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  _basis.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_basis);
}
