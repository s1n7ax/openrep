/**
 * Builds the 3D figure: a clean, realistic-proportioned mannequin made of
 * smooth lofted body parts on the joint hierarchy from `rig.ts`.
 *
 * - The torso is one skinned surface over the pelvis, spine and chest joints,
 *   so it bends smoothly.
 * - Neck, head, limbs, hands and feet are rigid parts attached to their joint.
 *   Limb ends meet at joint spheres of the same radius, so elbows and knees
 *   stay closed at any angle.
 * - The muscle bellies from `anatomy.ts` are sculpted into the surface; the
 *   glow overlays (`muscles.ts`) reuse the same surface grids.
 */
import {
  BufferGeometry,
  CapsuleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  Object3D,
  type Bone,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { regionsOn, type BodyPart, type RegionSample } from './anatomy.ts';
import {
  BALL_OFFSET,
  FOREARM_LENGTH,
  HEAD_TOP,
  SHIN_LENGTH,
  THIGH_LENGTH,
  UPPER_ARM_LENGTH,
} from './dimensions.ts';
import type { HandShape, PoseResult } from './pose.ts';
import { createRig, SIDES, sideSign, type Rig, type Side } from './rig.ts';
import {
  band,
  displaceGrid,
  gridGeometry,
  Profile,
  range,
  sampleSurface,
  smoothField,
  smoothstep,
  type SurfaceFunction,
  type SurfaceGrid,
} from './surface.ts';

const DEG = 180 / Math.PI;

/** A body part surface, kept so muscle overlays can be built on it. */
export interface PartSurface {
  part: BodyPart;
  side: Side | null;
  grid: SurfaceGrid;
  /** Rigid parts: the joint they are attached to. */
  bone: Bone | null;
  /** Skinned parts: the skeleton and per-vertex skin data. */
  skin: {
    skeleton: Skeleton;
    bindMatrix: Matrix4;
    skinIndex: Uint16Array;
    skinWeight: Float32Array;
  } | null;
}

export interface Figure {
  /** Add this to the scene. */
  group: Group;
  rig: Rig;
  /** Body surfaces muscle overlays are built on. */
  surfaces: PartSurface[];
  /** Material shared by the body. */
  material: MeshStandardMaterial;
  /** Shows the hand shapes and toe bends the pose solver chose. */
  applyPoseResult(result: PoseResult): void;
  dispose(): void;
}

// ── Shape helpers ────────────────────────────────────────────────────────────

/** Signed power keeping the sign: superellipse helper. */
function spow(x: number, p: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), p);
}

/** Bulge of every muscle region on a part at (u, θ°), plus extra sculpting. */
function sculpt(part: BodyPart, extra?: (u: number, thetaDeg: number) => number) {
  const regions = regionsOn(part);
  const sample: RegionSample = { cover: 0, bulge: 0 };
  return (u: number, thetaDeg: number) => {
    let total = 0;
    for (const region of regions) total += region.sample(u, thetaDeg, sample).bulge;
    return total + (extra?.(u, thetaDeg) ?? 0);
  };
}

/** Displaces a grid by a (smoothed) sculpt field. */
function sculptGrid(
  grid: SurfaceGrid,
  bulge: (u: number, thetaDeg: number) => number,
  passes = 1,
): void {
  const field = smoothField(
    grid,
    (r, c) => bulge(grid.u[r] ?? 0, (grid.theta[c] ?? 0) * DEG),
    passes,
  );
  displaceGrid(grid, (r, c) => field[r * grid.cols + c] ?? 0);
}

/**
 * A limb segment along local −y: profile rows are
 * [u, lateral, medial, front, back, centreX, centreZ] with u in segment
 * lengths. Beyond the first / last row the surface closes in a round dome
 * whose apex is at `startApex` / `endApex` (u), or stays open (null).
 */
function limbSurface(
  length: number,
  rows: number[][],
  startApex: number | null,
  endApex: number | null,
): SurfaceFunction {
  const profile = new Profile(rows);
  const first = rows[0]?.[0] ?? 0;
  const last = rows[rows.length - 1]?.[0] ?? 1;
  const values: number[] = [];
  return (u, theta, out) => {
    profile.at(Math.min(Math.max(u, first), last), values);
    let [lat = 0, med = 0, front = 0, back = 0] = values;
    const cx = values[4] ?? 0;
    const cz = values[5] ?? 0;
    let k = 1;
    if (startApex !== null && u < first)
      k = Math.sqrt(Math.max(0, 1 - ((first - u) / (first - startApex)) ** 2));
    if (endApex !== null && u > last)
      k = Math.sqrt(Math.max(0, 1 - ((u - last) / (endApex - last)) ** 2));
    lat *= k;
    med *= k;
    front *= k;
    back *= k;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    out.set(cx + (s >= 0 ? lat : med) * s, -u * length, cz + (c >= 0 ? front : back) * c);
  };
}

/** Ring parameters from `from` towards `to`, denser near `to` so a dome tip stays round. */
function domeRings(from: number, to: number, count: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => from + (to - from) * Math.sin(((i + 1) / count) * (Math.PI / 2)),
  );
}

interface LimbSpec {
  part: BodyPart;
  length: number;
  rows: number[][];
  /** Dome apex before the first row (u), or null for an open end. */
  startApex: number | null;
  /** Dome apex after the last row (u), or null for an open end. */
  endApex: number | null;
  rings: number;
}

/** Samples, sculpts and returns a limb grid (left side; mirrored for the right). */
function limbGrid(spec: LimbSpec, side: Side, cols = 48): SurfaceGrid {
  const first = spec.rows[0]?.[0] ?? 0;
  const last = spec.rows[spec.rows.length - 1]?.[0] ?? 1;
  const us = [
    ...(spec.startApex === null ? [] : domeRings(first, spec.startApex, 8).reverse()),
    ...range(first, last, spec.rings),
    ...(spec.endApex === null ? [] : domeRings(last, spec.endApex, 8)),
  ];
  const grid = sampleSurface(
    limbSurface(spec.length, spec.rows, spec.startApex, spec.endApex),
    us,
    cols,
    side === 'right',
  );
  sculptGrid(grid, sculpt(spec.part));
  return grid;
}

// ── Torso ────────────────────────────────────────────────────────────────────

/**
 * Rows closing a loft with an elliptical dome from `start` (radii `base`) to
 * the apex at `end`; `[zc, n]` of the apex row.
 */
function domeRows(
  start: number,
  end: number,
  base: readonly number[],
  apex: readonly [number, number],
  count: number,
): number[][] {
  const [w = 0, front = 0, back = 0, zc = 0, n = 2] = base;
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = (i / count) * (Math.PI / 2);
    const k = Math.cos(angle);
    const blend = 1 - k;
    return [
      start + (end - start) * Math.sin(angle),
      w * k,
      front * k,
      back * k,
      zc + (apex[0] - zc) * blend,
      n + (apex[1] - n) * blend,
    ];
  });
}

const TORSO_BOTTOM = 0.8;

/** [height, half-width, front depth, back depth, centre z, superellipse n]. */
const TORSO_ROWS = [
  // Rounded underside between the thighs.
  ...domeRows(0.852, TORSO_BOTTOM, [0.142, 0.076, 0.098, -0.012, 2.8], [-0.016, 2.2], 8),
  [0.88, 0.158, 0.084, 0.102, -0.01, 2.8],
  [0.925, 0.168, 0.09, 0.1, -0.006, 2.8],
  [0.975, 0.166, 0.094, 0.098, -0.002, 2.7],
  [1.02, 0.152, 0.096, 0.092, 0.0, 2.6],
  [1.07, 0.146, 0.098, 0.09, 0.0, 2.5],
  [1.12, 0.149, 0.1, 0.092, 0.0, 2.4],
  [1.18, 0.155, 0.105, 0.096, 0.0, 2.4],
  [1.24, 0.161, 0.112, 0.1, 0.0, 2.4],
  [1.3, 0.165, 0.115, 0.104, 0.0, 2.4],
  [1.36, 0.171, 0.11, 0.104, -0.004, 2.5],
  [1.41, 0.188, 0.099, 0.1, -0.008, 2.8],
  [1.445, 0.192, 0.087, 0.092, -0.012, 3.0],
  [1.475, 0.165, 0.068, 0.078, -0.016, 2.8],
  [1.505, 0.118, 0.056, 0.065, -0.018, 2.4],
  [1.53, 0.08, 0.05, 0.056, -0.018, 2.2],
  [1.55, 0.05, 0.042, 0.046, -0.018, 2.0],
  [1.565, 0.0, 0.0, 0.0, -0.018, 2.0],
];
const TORSO_TOP = 1.565;

const torsoProfile = new Profile(TORSO_ROWS);
const _torsoValues: number[] = [];

const torsoSurface: SurfaceFunction = (y, theta, out) => {
  const [w = 0, front = 0, back = 0, zc = 0, n = 2] = torsoProfile.at(y, _torsoValues);
  const e = 2 / n;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  out.set(w * spow(s, e), y, zc + (c >= 0 ? front : back) * spow(c, e));
};

/** Grooves that give the torso definition (midline, six-pack lines, spine, cleft). */
function torsoDetail(y: number, thetaDeg: number): number {
  const a = Math.abs(((thetaDeg + 540) % 360) - 180); // |θ| in [0, 180]
  let d = 0;
  // Linea alba and the tendinous lines of the rectus abdominis.
  const rectus = band(y, 0.96, 1.25, 0.02) * (1 - smoothstep(18, 28, a));
  d -= 0.0045 * rectus * (1 - smoothstep(0, 5, a));
  for (const line of [1.075, 1.142, 1.205]) {
    d -= 0.004 * rectus * (1 - smoothstep(0, 0.012, Math.abs(y - line)));
  }
  // Inguinal lines (the "V" above the hips).
  const vLine = 0.92 + ((a - 14) / 44) * 0.09;
  d -= 0.0025 * band(a, 16, 56, 10) * (1 - smoothstep(0, 0.022, Math.abs(y - vLine)));
  // Pectoral lower edge shadow.
  // Spine groove and gluteal cleft.
  const back = 1 - smoothstep(0, 5, 180 - a);
  d -= 0.004 * back * band(y, 0.98, 1.42, 0.04);
  // The cleft fades out well above the bottom closure so the surface never folds.
  const cleft = 1 - smoothstep(0, 9, 180 - a);
  d -= 0.02 * cleft * smoothstep(0.812, 0.85, y) * (1 - smoothstep(0.93, 0.98, y));
  return d;
}

/** Skin weights over pelvis (0), spine (1) and chest (2) by rest height. */
function torsoWeights(y: number): [number, number, number] {
  const pelvis = 1 - smoothstep(0.97, 1.13, y);
  const chest = smoothstep(1.17, 1.33, y);
  return [pelvis, Math.max(0, 1 - pelvis - chest), chest];
}

// ── Neck and head ────────────────────────────────────────────────────────────

const NECK_LENGTH = 0.09;
const neckSurface: SurfaceFunction = (u, theta, out) => {
  const y = u * NECK_LENGTH;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const taper = 1 - 0.06 * smoothstep(0, 1, u);
  out.set(0.056 * taper * s, y, 0.012 * u + (c >= 0 ? 0.05 : 0.054) * taper * c);
};

/** [y, half-width, front, back, centre z, n] in the head joint's frame. */
const HEAD_ROWS = [
  [-0.04, 0.0, 0.0, 0.0, 0.052, 2.0],
  [-0.034, 0.024, 0.02, 0.026, 0.052, 2.0],
  [-0.018, 0.044, 0.034, 0.048, 0.044, 2.1],
  [0.012, 0.058, 0.052, 0.07, 0.032, 2.2],
  [0.05, 0.068, 0.07, 0.088, 0.02, 2.2],
  [0.09, 0.075, 0.08, 0.098, 0.012, 2.15],
  ...domeRows(0.125, HEAD_TOP, [0.076, 0.082, 0.1, 0.006, 2.1], [0.0, 2.0], 8),
];

const headProfile = new Profile(HEAD_ROWS);
const _headValues: number[] = [];
const headSurface: SurfaceFunction = (y, theta, out) => {
  const [w = 0, front = 0, back = 0, zc = 0, n = 2] = headProfile.at(y, _headValues);
  const e = 2 / n;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  out.set(w * spow(s, e), y, zc + (c >= 0 ? front : back) * spow(c, e));
};

/**
 * Rings concentrated near both ends of a closed loft so the tips stay round;
 * `endBias` 1 = fully cosine-spaced, 0 = even.
 */
function closedRange(start: number, end: number, count: number, endBias = 1): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return start + (end - start) * (endBias * eased + (1 - endBias) * t);
  });
}

// ── Limbs ────────────────────────────────────────────────────────────────────

const SHOULDER_RADIUS = 0.05;
/** Upper-arm end at the elbow; the forearm starts a little thinner so the caps never coincide. */
const ELBOW_RADIUS = 0.038;
const FOREARM_TOP_RADIUS = 0.0355;
/** Thigh end at the knee; the shin starts a little thinner. */
const KNEE_RADIUS = 0.057;
const SHIN_TOP_RADIUS = 0.0545;
const ANKLE_RADIUS = 0.036;

/** [u, lateral, medial, front, back, cx, cz] — left arm, u in upper-arm lengths. */
const UPPER_ARM_ROWS = [
  [0.0, 0.053, 0.044, SHOULDER_RADIUS, SHOULDER_RADIUS, 0.006, 0.0],
  [0.12, 0.054, 0.042, 0.05, 0.05, 0.006, 0.0],
  [0.3, 0.049, 0.041, 0.048, 0.049, 0.003, 0.0],
  [0.55, 0.047, 0.041, 0.047, 0.048, 0.0, 0.002],
  [0.8, 0.043, 0.04, 0.043, 0.043, 0.0, 0.0],
  [0.92, 0.04, 0.039, 0.04, 0.04, 0.0, 0.0],
  [1.0, ELBOW_RADIUS, ELBOW_RADIUS, ELBOW_RADIUS, ELBOW_RADIUS, 0.0, 0.0],
];
const FOREARM_ROWS = [
  [0.0, FOREARM_TOP_RADIUS, FOREARM_TOP_RADIUS, FOREARM_TOP_RADIUS, FOREARM_TOP_RADIUS, 0.0, 0.0],
  [0.08, 0.044, 0.04, 0.041, 0.04, 0.002, 0.002],
  [0.25, 0.044, 0.038, 0.04, 0.037, 0.003, 0.003],
  [0.5, 0.034, 0.03, 0.034, 0.03, 0.001, 0.002],
  [0.78, 0.024, 0.022, 0.028, 0.025, 0.0, 0.001],
  [1.0, 0.02, 0.019, 0.026, 0.024, 0.0, 0.0],
];
const THIGH_ROWS = [
  [0.0, 0.092, 0.07, 0.09, 0.09, 0.006, 0.0],
  [0.12, 0.094, 0.074, 0.092, 0.092, 0.008, 0.0],
  [0.35, 0.087, 0.075, 0.087, 0.084, 0.004, 0.0],
  [0.62, 0.074, 0.066, 0.076, 0.069, 0.002, 0.0],
  [0.85, 0.062, 0.06, 0.063, 0.058, 0.0, 0.0],
  [1.0, KNEE_RADIUS, KNEE_RADIUS, KNEE_RADIUS, KNEE_RADIUS, 0.0, 0.0],
];
const SHIN_ROWS = [
  [0.0, SHIN_TOP_RADIUS, SHIN_TOP_RADIUS, SHIN_TOP_RADIUS, SHIN_TOP_RADIUS, 0.0, 0.0],
  [0.06, 0.055, 0.057, 0.052, 0.058, 0.0, 0.0],
  [0.22, 0.051, 0.053, 0.042, 0.066, 0.0, -0.008],
  [0.42, 0.046, 0.048, 0.037, 0.06, 0.0, -0.006],
  [0.66, 0.038, 0.039, 0.033, 0.043, 0.0, -0.002],
  [0.88, 0.035, 0.036, 0.032, 0.035, 0.0, 0.0],
  [1.0, ANKLE_RADIUS, ANKLE_RADIUS, ANKLE_RADIUS, ANKLE_RADIUS, 0.0, 0.0],
];

// ── Hands and feet ───────────────────────────────────────────────────────────

/**
 * A closed loft along −y (hands) given rows [y, +z half-width, −z half-width,
 * back (+x) thickness, palm (−x) thickness, centre x, centre z] — left hand:
 * the palm faces −x, the thumb +z.
 */
function handLoft(rows: number[][], fingerGrooves = 1): BufferGeometry {
  const profile = new Profile(rows);
  const values: number[] = [];
  const start = rows[0]?.[0] ?? 0;
  const end = rows[rows.length - 1]?.[0] ?? 0;
  const fn: SurfaceFunction = (y, theta, out) => {
    const [thumbSide = 0, pinkySide = 0, back = 0, palm = 0, cx = 0, cz = 0] = profile.at(
      y,
      values,
    );
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const across = spow(c, 0.85);
    // Shallow grooves between the four fingers, below the knuckles.
    let groove = 0;
    for (const at of [-0.5, 0, 0.5]) groove += Math.exp(-(((across - at) / 0.09) ** 2));
    const thickness = 1 - fingerGrooves * smoothstep(-0.085, -0.1, y) * 0.28 * groove;
    out.set(
      cx + (s >= 0 ? back : palm) * spow(s, 0.85) * thickness,
      y,
      cz + (c >= 0 ? thumbSide : pinkySide) * across,
    );
  };
  return gridGeometry(sampleSurface(fn, closedRange(start, end, 40), 32));
}

/** Capsules through a polyline, merged into one geometry (a jointed thumb). */
function mergeCapsules(points: Vector3[], radius: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) parts.push(capsuleBetween(a, b, radius));
  }
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()));
  for (const part of parts) part.dispose();
  return merged ?? new BufferGeometry();
}

function capsuleBetween(a: Vector3, b: Vector3, radius: number): BufferGeometry {
  const length = a.distanceTo(b);
  const geometry = new CapsuleGeometry(radius, length, 6, 12);
  const dir = new Vector3().subVectors(b, a).normalize();
  const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}

/** Hand meshes for the left hand (mirrored for the right): fist, relaxed and flat. */
function handGeometries(): Record<HandShape, BufferGeometry[]> {
  const fist = handLoft([
    [0.014, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.008, 0.02, 0.02, 0.016, 0.016, 0.0, 0.0],
    [-0.005, 0.028, 0.026, 0.02, 0.02, 0.0, 0.0],
    [-0.03, 0.036, 0.032, 0.02, 0.025, 0.0, 0.002],
    [-0.058, 0.041, 0.038, 0.021, 0.034, 0.0, 0.002],
    [-0.085, 0.043, 0.038, 0.022, 0.04, 0.0, 0.0],
    [-0.102, 0.04, 0.034, 0.02, 0.036, 0.0, -0.002],
    [-0.112, 0.03, 0.024, 0.015, 0.026, 0.0, -0.002],
    [-0.117, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  ]);
  const fistThumb = mergeCapsules(
    [
      new Vector3(-0.008, -0.018, 0.026),
      new Vector3(-0.026, -0.05, 0.04),
      new Vector3(-0.042, -0.074, 0.03),
    ],
    0.011,
  );
  const relaxed = handLoft([
    [0.014, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.008, 0.02, 0.019, 0.016, 0.016, 0.0, 0.0],
    [-0.01, 0.03, 0.027, 0.017, 0.018, 0.0, 0.0],
    [-0.045, 0.041, 0.036, 0.016, 0.018, -0.001, 0.0],
    [-0.085, 0.043, 0.037, 0.014, 0.015, -0.004, 0.001],
    [-0.115, 0.039, 0.031, 0.012, 0.012, -0.009, 0.003],
    [-0.14, 0.033, 0.024, 0.011, 0.011, -0.016, 0.005],
    [-0.16, 0.025, 0.014, 0.009, 0.009, -0.024, 0.007],
    [-0.172, 0.014, 0.006, 0.007, 0.007, -0.029, 0.007],
    [-0.176, 0.0, 0.0, 0.0, 0.0, -0.031, 0.007],
  ]);
  const relaxedThumb = mergeCapsules(
    [
      new Vector3(-0.006, -0.018, 0.024),
      new Vector3(-0.016, -0.056, 0.046),
      new Vector3(-0.026, -0.09, 0.05),
    ],
    0.0105,
  );
  const flat = handLoft([
    [0.014, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.008, 0.02, 0.02, 0.016, 0.016, 0.0, 0.0],
    [-0.01, 0.03, 0.028, 0.016, 0.016, -0.004, 0.0],
    [-0.05, 0.043, 0.039, 0.012, 0.012, -0.013, 0.0],
    [-0.09, 0.047, 0.042, 0.011, 0.011, -0.015, 0.0],
    [-0.14, 0.044, 0.038, 0.008, 0.008, -0.017, -0.002],
    [-0.17, 0.036, 0.03, 0.007, 0.007, -0.018, -0.003],
    [-0.182, 0.0, 0.0, 0.0, 0.0, -0.018, -0.003],
  ]);
  const flatThumb = mergeCapsules(
    [
      new Vector3(-0.008, -0.018, 0.026),
      new Vector3(-0.014, -0.05, 0.056),
      new Vector3(-0.018, -0.08, 0.072),
    ],
    0.0095,
  );
  return {
    grip: [fist, fistThumb],
    relaxed: [relaxed, relaxedThumb],
    flat: [flat, flatThumb],
  };
}

/** [z, lateral half-width, medial half-width, top y, bottom y] — left foot, heel to ball. */
const FOOT_ROWS = [
  [-0.07, 0.0, 0.0, -0.022, -0.046],
  [-0.066, 0.02, 0.02, -0.002, -0.062],
  [-0.052, 0.03, 0.03, 0.018, -0.07],
  [-0.028, 0.034, 0.035, 0.036, -0.07],
  [0.015, 0.038, 0.041, 0.036, -0.07],
  [0.055, 0.043, 0.046, 0.018, -0.07],
  [0.1, 0.047, 0.05, -0.008, -0.07],
  [0.14, 0.049, 0.051, -0.024, -0.07],
  [0.158, 0.045, 0.048, -0.029, -0.069],
  [0.168, 0.032, 0.035, -0.035, -0.065],
  [0.172, 0.0, 0.0, -0.044, -0.058],
];
/** The toes, same columns, in the ankle's frame; they bend about `TOE_PIVOT`. */
const TOE_ROWS = [
  [0.116, 0.0, 0.0, -0.036, -0.064],
  [0.124, 0.032, 0.035, -0.03, -0.07],
  [0.145, 0.047, 0.05, -0.031, -0.07],
  [0.168, 0.043, 0.049, -0.034, -0.07],
  [0.188, 0.031, 0.042, -0.04, -0.069],
  [0.2, 0.016, 0.026, -0.046, -0.066],
  [0.205, 0.0, 0.0, -0.05, -0.062],
];
/** Toe joint (ball of the foot) in the ankle's frame, just above the sole. */
export const TOE_PIVOT = new Vector3(0, -0.058, BALL_OFFSET);

function footLoft(rows: number[][], origin: Vector3): BufferGeometry {
  const profile = new Profile(rows);
  const values: number[] = [];
  const fn: SurfaceFunction = (z, theta, out) => {
    const [lat = 0, med = 0, top = 0, bottom = 0] = profile.at(z, values);
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const mid = (top + bottom) / 2;
    const half = (top - bottom) / 2;
    // θ = 0 is the top of the foot; the sole (θ = π) is flatter.
    const vertical = c >= 0 ? spow(c, 0.9) : spow(c, 0.35);
    out.set((s >= 0 ? lat : med) * spow(s, 0.8), mid + half * vertical, z).sub(origin);
  };
  const first = rows[0]?.[0] ?? 0;
  const last = rows[rows.length - 1]?.[0] ?? 0;
  return gridGeometry(sampleSurface(fn, closedRange(first, last, 40), 40));
}

/** Mirrors a geometry across x = 0 (for the right side), keeping faces outward. */
function mirrorX(geometry: BufferGeometry): BufferGeometry {
  const mirrored = geometry.clone();
  mirrored.scale(-1, 1, 1);
  if (!mirrored.getIndex()) {
    const count = mirrored.getAttribute('position').count;
    mirrored.setIndex(Array.from({ length: count }, (_, i) => i));
  }
  const index = mirrored.getIndex();
  if (index) {
    // Mirroring turns faces inside out: reverse the winding of every triangle.
    const array = index.array;
    for (let i = 0; i < array.length; i += 3) {
      const tmp = array[i + 1] ?? 0;
      array[i + 1] = array[i + 2] ?? 0;
      array[i + 2] = tmp;
    }
    index.needsUpdate = true;
  }
  return mirrored;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export function createBodyMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: '#b3b9c2', roughness: 0.48, metalness: 0.0 });
}

function rigidMesh(geometry: BufferGeometry, material: Material, parent: Object3D): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createFigure(): Figure {
  const rig = createRig();
  const { joints } = rig;
  const group = new Group();
  group.name = 'figure';
  group.add(rig.root);
  const material = createBodyMaterial();
  const geometries: BufferGeometry[] = [];
  const surfaces: PartSurface[] = [];
  const track = <T extends BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  // Torso: skinned to pelvis, spine and chest.
  const torsoGrid = sampleSurface(
    torsoSurface,
    closedRange(TORSO_BOTTOM, TORSO_TOP, 160, 0.35),
    128,
  );
  const torsoBulge = sculpt('torso', torsoDetail);
  sculptGrid(torsoGrid, torsoBulge, 2);
  const vertexCount = torsoGrid.rows * torsoGrid.cols;
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const [pelvis, spine, chest] = torsoWeights(torsoGrid.positions[i * 3 + 1] ?? 0);
    skinIndex.set([0, 1, 2, 0], i * 4);
    skinWeight.set([pelvis, spine, chest, 0], i * 4);
  }
  const skeleton = new Skeleton([joints.pelvis, joints.spine, joints.chest]);
  const torsoGeometry = track(
    gridGeometry(torsoGrid, {
      attributes: {
        skinIndex: { array: skinIndex, itemSize: 4 },
        skinWeight: { array: skinWeight, itemSize: 4 },
      },
    }),
  );
  const torso = new SkinnedMesh(torsoGeometry, material);
  torso.name = 'torso';
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.frustumCulled = false;
  group.add(torso);
  group.updateMatrixWorld(true);
  torso.bind(skeleton, torso.matrixWorld.clone());
  surfaces.push({
    part: 'torso',
    side: null,
    grid: torsoGrid,
    bone: null,
    skin: { skeleton, bindMatrix: torso.bindMatrix, skinIndex, skinWeight },
  });

  // Neck and head.
  const neckGrid = sampleSurface(neckSurface, range(-0.6, 1.25, 24), 40);
  const neckBulge = sculpt('neck');
  sculptGrid(neckGrid, neckBulge);
  rigidMesh(track(gridGeometry(neckGrid)), material, joints.neck);
  surfaces.push({ part: 'neck', side: null, grid: neckGrid, bone: joints.neck, skin: null });
  const headGrid = sampleSurface(headSurface, closedRange(-0.042, HEAD_TOP, 48), 48);
  rigidMesh(track(gridGeometry(headGrid)), material, joints.head);

  // Limbs, hands and feet.
  const hands = handGeometries();
  const handMeshes: Record<Side, Record<HandShape, Mesh[]>> = {
    left: { grip: [], relaxed: [], flat: [] },
    right: { grip: [], relaxed: [], flat: [] },
  };
  const foot = track(footLoft(FOOT_ROWS, new Vector3()));
  const footRight = track(mirrorX(foot));
  const toes = track(footLoft(TOE_ROWS, TOE_PIVOT));
  const toesRight = track(mirrorX(toes));
  const toeJoints: Record<Side, Object3D> = { left: new Object3D(), right: new Object3D() };
  const upperArmSpec: LimbSpec = {
    part: 'upperArm',
    length: UPPER_ARM_LENGTH,
    rows: UPPER_ARM_ROWS,
    startApex: -0.17,
    endApex: 1 + ELBOW_RADIUS / UPPER_ARM_LENGTH,
    rings: 40,
  };
  const forearmSpec: LimbSpec = {
    part: 'forearm',
    length: FOREARM_LENGTH,
    rows: FOREARM_ROWS,
    startApex: -FOREARM_TOP_RADIUS / FOREARM_LENGTH,
    endApex: 1 + 0.02 / FOREARM_LENGTH,
    rings: 30,
  };
  const thighSpec: LimbSpec = {
    part: 'thigh',
    length: THIGH_LENGTH,
    rows: THIGH_ROWS,
    startApex: -0.17,
    endApex: 1 + KNEE_RADIUS / THIGH_LENGTH,
    rings: 48,
  };
  const shinSpec: LimbSpec = {
    part: 'shin',
    length: SHIN_LENGTH,
    rows: SHIN_ROWS,
    startApex: -SHIN_TOP_RADIUS / SHIN_LENGTH,
    endApex: 1 + ANKLE_RADIUS / SHIN_LENGTH,
    rings: 44,
  };

  for (const side of SIDES) {
    const prefix = side;
    const s = sideSign(side);
    const shoulder = joints[`${prefix}Shoulder`];
    const elbow = joints[`${prefix}Elbow`];
    const wrist = joints[`${prefix}Wrist`];
    const hip = joints[`${prefix}Hip`];
    const knee = joints[`${prefix}Knee`];
    const ankle = joints[`${prefix}Ankle`];

    const upperArm = limbGrid(upperArmSpec, side);
    rigidMesh(track(gridGeometry(upperArm)), material, shoulder);
    surfaces.push({ part: 'upperArm', side, grid: upperArm, bone: shoulder, skin: null });

    const forearm = limbGrid(forearmSpec, side, 40);
    rigidMesh(track(gridGeometry(forearm)), material, elbow);
    surfaces.push({ part: 'forearm', side, grid: forearm, bone: elbow, skin: null });

    const thigh = limbGrid(thighSpec, side);
    rigidMesh(track(gridGeometry(thigh)), material, hip);
    surfaces.push({ part: 'thigh', side, grid: thigh, bone: hip, skin: null });

    const shin = limbGrid(shinSpec, side);
    rigidMesh(track(gridGeometry(shin)), material, knee);
    surfaces.push({ part: 'shin', side, grid: shin, bone: knee, skin: null });
    rigidMesh(s > 0 ? foot : footRight, material, ankle);
    const toeJoint = toeJoints[side];
    toeJoint.position.copy(TOE_PIVOT);
    ankle.add(toeJoint);
    rigidMesh(s > 0 ? toes : toesRight, material, toeJoint);

    for (const shape of ['grip', 'relaxed', 'flat'] as const) {
      for (const geometry of hands[shape]) {
        const handGeometry = track(side === 'left' ? geometry : mirrorX(geometry));
        const mesh = rigidMesh(handGeometry, material, wrist);
        mesh.visible = shape === 'relaxed';
        handMeshes[side][shape].push(mesh);
      }
    }
  }
  for (const shape of ['grip', 'relaxed', 'flat'] as const) {
    for (const geometry of hands[shape]) geometries.push(geometry);
  }

  group.updateMatrixWorld(true);

  return {
    group,
    rig,
    surfaces,
    material,
    applyPoseResult(result) {
      for (const side of SIDES) {
        for (const shape of ['grip', 'relaxed', 'flat'] as const) {
          for (const mesh of handMeshes[side][shape]) mesh.visible = result.hands[side] === shape;
        }
        toeJoints[side].rotation.x = -result.toeBend[side];
      }
    },
    dispose() {
      for (const geometry of new Set(geometries)) geometry.dispose();
      material.dispose();
      skeleton.dispose();
    },
  };
}
