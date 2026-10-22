/**
 * Where each of the 17 muscle groups lies on the body surface.
 *
 * Every body part is a surface parameterised by (u, θ): u runs along the part
 * (for the torso it is the rest-pose height in metres; for limbs 0 at the
 * proximal joint and 1 at the distal one) and θ goes around it in degrees
 * (0 = front, 90 = lateral / the figure's left, 180 = back, −90 = medial).
 * Limb regions are written for the left side; the right side is mirrored.
 * Torso regions are symmetric and use |θ|.
 *
 * A region gives a coverage (0–1, where the muscle glows) and a bulge (metres,
 * the muscle belly sculpted into the body so the figure reads as anatomy).
 */
import type { Muscle } from '../schema/common.ts';
import { angleDelta, band, clamp01, smoothstep } from './surface.ts';

export type BodyPart = 'torso' | 'neck' | 'upperArm' | 'forearm' | 'thigh' | 'shin';

export interface RegionSample {
  cover: number;
  bulge: number;
}

export interface MuscleRegion {
  muscle: Muscle;
  part: BodyPart;
  sample(u: number, thetaDeg: number, out: RegionSample): RegionSample;
}

type Range = readonly [number, number];
type RangeAt = Range | ((u: number) => Range);

interface RegionSpec {
  muscle: Muscle;
  part: BodyPart;
  /** Extent along u. */
  u: Range;
  /** Angular extent, possibly varying along u (degrees; torso: |θ|). */
  theta: RangeAt;
  /** Bulge height at the belly, metres. */
  height: number;
  /** Where the belly peaks inside the region (0–1 along u, 0–1 across θ). */
  peak?: readonly [number, number];
  /** Soft edge widths: along u (u units) and across θ (degrees). */
  soft?: readonly [number, number];
  /** Torso regions mirror across the midline. */
  symmetric?: boolean;
  /** Covers the whole ring (no angular edges). */
  fullRing?: boolean;
  /** Scales the bulge around the ring, e.g. thicker on one side. */
  bulgeScale?: (u: number, thetaDeg: number) => number;
}

/** Piecewise-linear function through (x, y) points, clamped at the ends. */
export function lerpTable(points: readonly (readonly [number, number])[]): (x: number) => number {
  return (x) => {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return 0;
    if (x <= first[0]) return first[1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a && b && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return last[1];
  };
}

/** θ range from two piecewise-linear edge tables over u. */
function edges(
  low: readonly (readonly [number, number])[],
  high: readonly (readonly [number, number])[],
): (u: number) => Range {
  const lo = lerpTable(low);
  const hi = lerpTable(high);
  return (u) => [lo(u), hi(u)];
}

/** Skews x in [0, 1] so that `peak` maps to 0.5. */
function skew(x: number, peak: number): number {
  if (peak <= 0 || peak >= 1 || peak === 0.5) return x;
  return Math.pow(clamp01(x), Math.log(0.5) / Math.log(peak));
}

function region(spec: RegionSpec): MuscleRegion {
  const [softU, softT] = spec.soft ?? [0.04, 10];
  const [peakU, peakT] = spec.peak ?? [0.5, 0.5];
  return {
    muscle: spec.muscle,
    part: spec.part,
    sample(u, thetaDeg, out) {
      const theta = spec.symmetric ? Math.abs(angleDelta(thetaDeg, 0)) : thetaDeg;
      const [u0, u1] = spec.u;
      const p = (u - u0) / (u1 - u0);
      let along = band(u, u0, u1, softU);
      let across = 1;
      let q = 0.5;
      if (!spec.fullRing) {
        const [t0, t1] = typeof spec.theta === 'function' ? spec.theta(u) : spec.theta;
        // Measure θ from the middle of the range so ranges may wrap past ±180°.
        const width = t1 - t0;
        const rel = angleDelta(theta, t0 + width / 2) + width / 2;
        across = band(rel, 0, width, softT);
        q = width > 0 ? rel / width : 0.5;
        if (spec.symmetric && t0 <= 0 && t1 > 0) {
          // One belly across the midline (e.g. the rectus abdominis), not two halves.
          q = 0.5 + angleDelta(thetaDeg, 0) / (2 * t1);
        }
        if (width <= 0) across = 0;
      }
      if (along <= 0 || across <= 0) {
        out.cover = 0;
        out.bulge = 0;
        return out;
      }
      const bellyU = Math.sin(Math.PI * clamp01(skew(p, peakU)));
      const bellyT = spec.fullRing ? 1 : Math.sin(Math.PI * clamp01(skew(q, peakT)));
      // Rounded belly that flattens smoothly into the skin at the edges.
      const belly = smoothstep(0, 1, bellyU * bellyT);
      along = smoothstep(0, 1, along);
      out.cover = along * across;
      out.bulge = spec.height * belly * out.cover * (spec.bulgeScale?.(u, thetaDeg) ?? 1);
      return out;
    },
  };
}

export const MUSCLE_REGIONS: readonly MuscleRegion[] = [
  // ── Torso (u = rest height in metres, θ = |θ| in degrees) ──────────────────
  region({
    muscle: 'chest',
    part: 'torso',
    symmetric: true,
    u: [1.255, 1.455],
    theta: edges(
      [
        [1.255, 5],
        [1.4, 5],
        [1.455, 10],
      ],
      [
        [1.255, 22],
        [1.275, 42],
        [1.3, 58],
        [1.33, 72],
        [1.36, 82],
        [1.395, 88],
        [1.43, 84],
        [1.455, 62],
      ],
    ),
    height: 0.026,
    peak: [0.36, 0.5],
    soft: [0.01, 5],
  }),
  // Rectus abdominis: the six-pack, narrowing to the pubis.
  region({
    muscle: 'abdominals',
    part: 'torso',
    symmetric: true,
    u: [0.9, 1.29],
    theta: edges(
      [[0.9, 0]],
      [
        [0.9, 8],
        [0.96, 20],
        [1.05, 24],
        [1.29, 27],
      ],
    ),
    height: 0.0098,
    peak: [0.55, 0.45],
    soft: [0.02, 4],
  }),
  // Obliques: from the iliac crest (the "V" lines) up the flanks to the ribs.
  region({
    muscle: 'abdominals',
    part: 'torso',
    symmetric: true,
    u: [0.93, 1.25],
    theta: edges(
      [[0.93, 22]],
      [
        [0.93, 22],
        [0.97, 38],
        [1.01, 56],
        [1.05, 72],
        [1.09, 82],
        [1.15, 82],
        [1.19, 66],
        [1.22, 48],
        [1.25, 30],
      ],
    ),
    height: 0.0084,
    peak: [0.45, 0.6],
    soft: [0.02, 6],
  }),
  region({
    muscle: 'lats',
    part: 'torso',
    symmetric: true,
    u: [0.99, 1.38],
    theta: edges(
      [
        [0.99, 110],
        [1.1, 100],
        [1.2, 93],
        [1.3, 88],
        [1.38, 86],
      ],
      [
        [0.99, 158],
        [1.1, 166],
        [1.24, 168],
        [1.3, 150],
        [1.35, 125],
        [1.38, 104],
      ],
    ),
    height: 0.0162,
    peak: [0.62, 0.35],
    soft: [0.025, 8],
  }),
  region({
    muscle: 'traps',
    part: 'torso',
    symmetric: true,
    u: [1.12, 1.57],
    theta: edges(
      [
        [1.12, 172],
        [1.25, 150],
        [1.38, 124],
        [1.44, 96],
        [1.47, 62],
        [1.53, 34],
      ],
      [[1.12, 186]],
    ),
    height: 0.0163,
    peak: [0.8, 0.45],
    soft: [0.02, 6],
  }),
  region({
    muscle: 'middle back',
    part: 'torso',
    symmetric: true,
    u: [1.17, 1.42],
    theta: edges(
      [
        [1.17, 140],
        [1.3, 124],
        [1.42, 116],
      ],
      [[1.17, 176]],
    ),
    height: 0.0117,
    peak: [0.5, 0.45],
    soft: [0.02, 6],
  }),
  region({
    muscle: 'lower back',
    part: 'torso',
    symmetric: true,
    u: [0.94, 1.22],
    theta: [150, 176],
    height: 0.014,
    peak: [0.35, 0.55],
    soft: [0.03, 5],
  }),
  region({
    muscle: 'glutes',
    part: 'torso',
    symmetric: true,
    u: [0.81, 1.0],
    theta: edges(
      [
        [0.81, 136],
        [0.86, 116],
        [0.93, 110],
        [1.0, 128],
      ],
      [[0.81, 178]],
    ),
    height: 0.0286,
    peak: [0.4, 0.45],
    soft: [0.015, 6],
  }),
  region({
    muscle: 'abductors',
    part: 'torso',
    symmetric: true,
    u: [0.86, 1.0],
    theta: [66, 116],
    height: 0.0104,
    peak: [0.55, 0.5],
    soft: [0.025, 8],
  }),
  // ── Neck (u 0 = base, 1 = skull) ──────────────────────────────────────────
  region({
    muscle: 'neck',
    part: 'neck',
    u: [0.15, 0.95],
    theta: [-105, 105],
    height: 0.0072,
    soft: [0.08, 12],
  }),
  region({
    muscle: 'traps',
    part: 'neck',
    u: [-0.1, 0.75],
    theta: [118, 242],
    height: 0.01,
    peak: [0.2, 0.5],
    soft: [0.1, 12],
  }),
  // ── Upper arm (u 0 = shoulder joint, 1 = elbow) ───────────────────────────
  region({
    muscle: 'shoulders',
    part: 'upperArm',
    u: [-0.22, 0.48],
    theta: edges(
      [
        [-0.22, -70],
        [0.12, -62],
        [0.3, 20],
        [0.48, 72],
      ],
      [
        [-0.22, 250],
        [0.12, 242],
        [0.3, 160],
        [0.48, 108],
      ],
    ),
    height: 0.0175,
    peak: [0.45, 0.5],
    soft: [0.05, 12],
  }),
  region({
    muscle: 'chest',
    part: 'upperArm',
    u: [-0.05, 0.22],
    theta: [-92, -38],
    height: 0.0078,
    peak: [0.3, 0.5],
    soft: [0.05, 10],
  }),
  region({
    muscle: 'biceps',
    part: 'upperArm',
    u: [0.2, 0.92],
    theta: edges(
      [
        [0.2, -38],
        [0.55, -78],
        [0.92, -40],
      ],
      [
        [0.2, 34],
        [0.55, 70],
        [0.92, 36],
      ],
    ),
    height: 0.02,
    peak: [0.56, 0.48],
    soft: [0.05, 10],
  }),
  region({
    muscle: 'triceps',
    part: 'upperArm',
    u: [0.14, 0.9],
    theta: edges(
      [
        [0.14, 115],
        [0.4, 96],
        [0.9, 150],
      ],
      [
        [0.14, 245],
        [0.4, 262],
        [0.9, 210],
      ],
    ),
    height: 0.0162,
    peak: [0.42, 0.42],
    soft: [0.05, 10],
  }),
  // ── Forearm (u 0 = elbow, 1 = wrist) ──────────────────────────────────────
  region({
    muscle: 'forearms',
    part: 'forearm',
    u: [0.0, 0.78],
    theta: [0, 360],
    fullRing: true,
    height: 0.0108,
    peak: [0.32, 0.5],
    soft: [0.1, 0],
    bulgeScale: (_u, theta) => 0.75 + 0.45 * Math.cos(((theta - 40) * Math.PI) / 180),
  }),
  // ── Thigh (u 0 = hip joint, 1 = knee) ─────────────────────────────────────
  region({
    muscle: 'quadriceps',
    part: 'thigh',
    u: [0.1, 0.93],
    theta: edges(
      [
        [0.1, -42],
        [0.4, -78],
        [0.75, -88],
        [0.93, -70],
      ],
      [
        [0.1, 96],
        [0.4, 118],
        [0.75, 108],
        [0.93, 70],
      ],
    ),
    height: 0.0208,
    peak: [0.5, 0.45],
    soft: [0.05, 10],
  }),
  region({
    muscle: 'hamstrings',
    part: 'thigh',
    u: [0.06, 0.88],
    theta: edges(
      [
        [0.06, 128],
        [0.5, 122],
        [0.88, 140],
      ],
      [
        [0.06, 236],
        [0.5, 242],
        [0.88, 224],
      ],
    ),
    height: 0.0169,
    peak: [0.42, 0.5],
    soft: [0.05, 10],
  }),
  region({
    muscle: 'adductors',
    part: 'thigh',
    u: [-0.02, 0.64],
    theta: edges(
      [
        [-0.02, -150],
        [0.64, -112],
      ],
      [
        [-0.02, -38],
        [0.64, -82],
      ],
    ),
    height: 0.0132,
    peak: [0.3, 0.5],
    soft: [0.05, 10],
  }),
  region({
    muscle: 'abductors',
    part: 'thigh',
    u: [-0.1, 0.3],
    theta: [62, 118],
    height: 0.0091,
    peak: [0.3, 0.5],
    soft: [0.06, 10],
  }),
  // ── Shin (u 0 = knee, 1 = ankle) ──────────────────────────────────────────
  region({
    muscle: 'calves',
    part: 'shin',
    u: [0.04, 0.68],
    theta: edges(
      [
        [0.04, 128],
        [0.25, 98],
        [0.68, 150],
      ],
      [
        [0.04, 232],
        [0.25, 262],
        [0.68, 210],
      ],
    ),
    height: 0.0175,
    peak: [0.32, 0.5],
    soft: [0.05, 10],
  }),
];

/** Regions on one body part. */
export function regionsOn(part: BodyPart): MuscleRegion[] {
  return MUSCLE_REGIONS.filter((r) => r.part === part);
}

/** Every muscle group that has at least one region, in data order. */
export function musclesWithRegions(): Muscle[] {
  return [...new Set(MUSCLE_REGIONS.map((r) => r.muscle))];
}
