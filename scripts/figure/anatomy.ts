/**
 * The muscles painted onto the figure: where each lies (for the glow of its
 * group) and how it is sculpted into the body (muscle bellies with creases
 * between them).
 *
 * Each muscle is a closed outline (smoothed through its control points) on a
 * chart:
 * - "torso": the body seen from the front and from the back in the bind pose,
 *   (x, y) in metres with x = distance from the midline (both sides mirror).
 *   A torso muscle has a front outline, a back outline or both; surfaces
 *   facing sideways take a blend of the two, so a muscle wrapping round the
 *   side (lats, obliques) needs both.
 * - limb charts ("upperArm", "forearm", "thigh", "shin", "neck"): around the
 *   bone, (θ, u) with θ in degrees (0 = front, 90 = lateral / outer side,
 *   ±180 = back, −90 = medial / inner side) and u along the bone (0 at the
 *   joint nearer the body, 1 at the far joint; for the neck, 0 at its base).
 * A muscle applies only on the body segments it lists, so a limb chart never
 * paints the torso by accident.
 */
import { Matrix4, Vector3 } from 'three';
import { MUSCLES, type Muscle } from '../../src/lib/schema/common.ts';
import { FIGURE_BONES, NO_MUSCLE, muscleIndex } from '../../src/lib/three/figureAsset.ts';
import {
  FOREARM_LENGTH,
  SHIN_LENGTH,
  THIGH_LENGTH,
  UPPER_ARM_LENGTH,
} from '../../src/lib/three/dimensions.ts';
import type { BindBone } from './body.ts';
import { smoothScalar, vertexNeighbours, vertexNormals, type PolyMesh } from './mesh.ts';

export type LimbChart = 'upperArm' | 'forearm' | 'thigh' | 'shin' | 'neck';
export type Chart = 'torso' | LimbChart;
export const SEGMENTS = [
  'torso',
  'neck',
  'head',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'shin',
  'foot',
] as const;
export type Segment = (typeof SEGMENTS)[number];
export type Outline = readonly (readonly [number, number])[];

interface MuscleBase {
  name: string;
  /** Glow group, or null for a muscle that is only sculpted. */
  group: Muscle | null;
  segments: readonly Segment[];
  /** Belly height (metres) sculpted into the body. */
  height: number;
  /** Distance from the outline to the full belly height (metres). */
  width: number;
  /** Glow edge half-width (metres); the default suits most muscles. */
  edge?: number;
}

export interface TorsoMuscle extends MuscleBase {
  chart: 'torso';
  /** Outline seen from the front, left side (x ≥ 0). */
  front?: Outline;
  /** Outline seen from the back, left side (x ≥ 0). */
  back?: Outline;
}

export interface LimbMuscle extends MuscleBase {
  chart: LimbChart;
  outline: Outline;
  /**
   * The angle (degrees) the outline is centred on, so an outline may cross the
   * back of the limb (θ = ±180) — e.g. 180 for the triceps.
   */
  thetaCenter?: number;
  /** Covers the whole ring between the outline's lowest and highest u. */
  ring?: boolean;
  /** Only vertices within this distance (metres) of the bone's axis. */
  radius?: number;
  /** Only vertices at least this far (metres) from the body's midline. */
  midline?: number;
}

export type MuscleSpec = TorsoMuscle | LimbMuscle;

/** Neck chart unit length (metres): u = 1 this far above the neck joint. */
const NECK_LENGTH = 0.15;

/** Limb charts: the bone, its length and the radius that turns degrees into metres. */
const LIMB_CHARTS: Record<LimbChart, { bone: string; length: number; radius: number }> = {
  upperArm: { bone: 'Shoulder', length: UPPER_ARM_LENGTH, radius: 0.045 },
  forearm: { bone: 'Elbow', length: FOREARM_LENGTH, radius: 0.036 },
  thigh: { bone: 'Hip', length: THIGH_LENGTH, radius: 0.075 },
  shin: { bone: 'Knee', length: SHIN_LENGTH, radius: 0.05 },
  neck: { bone: 'neck', length: NECK_LENGTH, radius: 0.055 },
};

/** Figure bones of each body segment (blend bones count half for both sides). */
function segmentOf(bone: string): [Segment, number][] {
  const rest = bone.replace(/^(left|right)/, '');
  switch (rest) {
    case 'pelvis':
    case 'spine':
    case 'chest':
      return [['torso', 1]];
    case 'neck':
      return [['neck', 1]];
    case 'head':
      return [['head', 1]];
    case 'Shoulder':
    case 'UpperArmTwist':
      return [['upperArm', 1]];
    case 'ShoulderBlend':
      return [
        ['torso', 0.5],
        ['upperArm', 0.5],
      ];
    case 'ElbowBlend':
      return [
        ['upperArm', 0.5],
        ['forearm', 0.5],
      ];
    case 'Elbow':
    case 'ForearmTwist':
      return [['forearm', 1]];
    case 'Wrist':
      return [['hand', 1]];
    case 'Hip':
      return [['thigh', 1]];
    case 'HipBlend':
      return [
        ['torso', 0.5],
        ['thigh', 0.5],
      ];
    case 'KneeBlend':
      return [
        ['thigh', 0.5],
        ['shin', 0.5],
      ];
    case 'Knee':
      return [['shin', 1]];
    case 'Ankle':
    case 'Toes':
      return [['foot', 1]];
    default:
      return [['hand', 1]];
  }
}

// ── Outline geometry ─────────────────────────────────────────────────────────

/** Closed Catmull–Rom spline through the control points, as a polyline. */
function splinePolygon(points: readonly (readonly [number, number])[], perSegment = 12): number[] {
  const out: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n] as readonly [number, number];
    const p1 = points[i] as readonly [number, number];
    const p2 = points[(i + 1) % n] as readonly [number, number];
    const p3 = points[(i + 2) % n] as readonly [number, number];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let a = 0; a < 2; a++) {
        out.push(
          0.5 *
            (2 * (p1[a] ?? 0) +
              (-(p0[a] ?? 0) + (p2[a] ?? 0)) * t +
              (2 * (p0[a] ?? 0) - 5 * (p1[a] ?? 0) + 4 * (p2[a] ?? 0) - (p3[a] ?? 0)) * t2 +
              (-(p0[a] ?? 0) + 3 * (p1[a] ?? 0) - 3 * (p2[a] ?? 0) + (p3[a] ?? 0)) * t3),
        );
      }
    }
  }
  return out;
}

/** Signed distance from (x, y) to a closed polyline: positive inside. */
function signedDistance(polygon: number[], x: number, y: number): number {
  let best = Infinity;
  let inside = false;
  const n = polygon.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = polygon[j * 2] ?? 0;
    const ay = polygon[j * 2 + 1] ?? 0;
    const bx = polygon[i * 2] ?? 0;
    const by = polygon[i * 2 + 1] ?? 0;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ── Painting ─────────────────────────────────────────────────────────────────

/** Glow edge half-width (metres): coverage goes 0 → 1 over twice this. */
const GLOW_EDGE = 0.007;

export interface PaintedMuscles {
  /** Four group indices per vertex (NO_MUSCLE when unused). */
  groups: Uint8Array;
  /** Coverage of each, 0–255. */
  cover: Uint8Array;
  /** Coverage per group per vertex (0–1), for checks and reports. */
  groupCover: Float64Array;
  /** Displacement along the normal (metres) per vertex. */
  displacement: Float64Array;
}

/** Where a vertex lies on the charts. */
export interface ChartSampler {
  vertexCount: number;
  /** Share of vertex `v` that belongs to the listed body segments (0–1). */
  gate(segments: readonly Segment[], v: number): number;
  /** Torso chart: |x|, y (metres) and how much the vertex faces forward (0–1). */
  torso(v: number): { x: number; y: number; front: number };
  /** Limb chart: θ (radians, mirrored so + is lateral), u (bone lengths) and distance from the axis. */
  limb(chart: LimbChart, v: number): { theta: number; u: number; r: number; midline: number };
}

export function createChartSampler(
  mesh: PolyMesh,
  bind: readonly BindBone[],
  weights: Float64Array,
): ChartSampler {
  const count = mesh.positions.length / 3;
  const boneCount = FIGURE_BONES.length;
  const normals = vertexNormals(mesh);
  const segments = new Map(SEGMENTS.map((s) => [s, new Float64Array(count)]));
  const boneSegments = FIGURE_BONES.map((bone) => segmentOf(bone.name));
  for (let v = 0; v < count; v++) {
    for (let b = 0; b < boneCount; b++) {
      const w = weights[v * boneCount + b] ?? 0;
      if (w <= 0) continue;
      for (const [segment, share] of boneSegments[b] ?? []) {
        const array = segments.get(segment) as Float64Array;
        array[v] = (array[v] ?? 0) + w * share;
      }
    }
  }
  const inverseBind = new Map(bind.map((bone) => [bone.name, bone.world.clone().invert()]));
  const local = new Vector3();
  // The neck chart is centred on the neck itself (a slice of the neck above
  // its joint), not on the joint, which sits behind the throat.
  const neckCentre = new Vector3();
  let neckCount = 0;
  const neckInverse = inverseBind.get('neck') as Matrix4;
  for (let v = 0; v < count; v++) {
    local.fromArray(mesh.positions, v * 3).applyMatrix4(neckInverse);
    if (local.y < 0.04 || local.y > 0.09 || Math.abs(local.x) > 0.09) continue;
    if ((segments.get('upperArm')?.[v] ?? 0) > 0.1) continue;
    neckCentre.add(local);
    neckCount++;
  }
  neckCentre.divideScalar(Math.max(1, neckCount)).setY(0).setX(0);
  return {
    vertexCount: count,
    gate(list, v) {
      let gate = 0;
      for (const segment of list) gate += segments.get(segment)?.[v] ?? 0;
      return Math.min(1, gate);
    },
    torso(v) {
      return {
        x: Math.abs(mesh.positions[v * 3] ?? 0),
        y: mesh.positions[v * 3 + 1] ?? 0,
        front: smoothstep(-0.3, 0.3, normals[v * 3 + 2] ?? 0),
      };
    },
    limb(chart, v) {
      const spec = LIMB_CHARTS[chart];
      const x = mesh.positions[v * 3] ?? 0;
      const boneName = chart === 'neck' ? 'neck' : `${x >= 0 ? 'left' : 'right'}${spec.bone}`;
      local.fromArray(mesh.positions, v * 3).applyMatrix4(inverseBind.get(boneName) as Matrix4);
      if (chart === 'neck') local.sub(neckCentre);
      const mirror = x >= 0 ? 1 : -1;
      return {
        theta: Math.atan2(mirror * local.x, local.z),
        u: (chart === 'neck' ? local.y : -local.y) / spec.length,
        r: Math.hypot(local.x, local.z),
        midline: Math.abs(x),
      };
    },
  };
}

/** A closed outline as a polyline in chart metres. */
export function outlinePolygon(chart: Chart, outline: Outline): number[] {
  const limb = chart === 'torso' ? null : LIMB_CHARTS[chart];
  const points = outline.map(([a, b]): [number, number] =>
    limb ? [(a * Math.PI * limb.radius) / 180, b * limb.length] : [a, b],
  );
  return splinePolygon(points);
}

/** Polyline with its bounding box, for fast rejection. */
interface Shape {
  polygon: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function shapeOf(chart: Chart, outline: Outline): Shape {
  const polygon = outlinePolygon(chart, outline);
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return {
    polygon,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Signed distance (positive inside) from a shape, or −∞ when far outside it. */
function distanceTo(shape: Shape, x: number, y: number, margin: number): number {
  if (x < shape.minX - margin || x > shape.maxX + margin) return -Infinity;
  if (y < shape.minY - margin || y > shape.maxY + margin) return -Infinity;
  return signedDistance(shape.polygon, x, y);
}

export function paintMuscles(
  mesh: PolyMesh,
  bind: readonly BindBone[],
  weights: Float64Array,
  specs: readonly MuscleSpec[],
): PaintedMuscles {
  const count = mesh.positions.length / 3;
  const charts = createChartSampler(mesh, bind, weights);
  const groupCover = new Float64Array(count * MUSCLES.length);
  const displacement = new Float64Array(count);
  const belly = (d: number, width: number) => {
    const t = Math.min(1, Math.max(0, d / width));
    return 1 - (1 - t) * (1 - t);
  };
  for (const spec of specs) {
    const edge = spec.edge ?? GLOW_EDGE;
    const group = spec.group ? muscleIndex(spec.group) : -1;
    // Coverage and belly (0–1) of this muscle at vertex v.
    let measure: (v: number) => { cover: number; belly: number };
    if (spec.chart === 'torso') {
      const front = spec.front ? shapeOf('torso', spec.front) : null;
      const back = spec.back ? shapeOf('torso', spec.back) : null;
      measure = (v) => {
        const p = charts.torso(v);
        let cover = 0;
        let bulge = 0;
        for (const [shape, share] of [
          [front, p.front],
          [back, 1 - p.front],
        ] as const) {
          if (!shape || share <= 0) continue;
          const d = distanceTo(shape, p.x, p.y, edge * 2);
          cover += share * smoothstep(-edge, edge, d);
          bulge += share * belly(d, spec.width);
        }
        return { cover, belly: bulge };
      };
    } else {
      const limb = LIMB_CHARTS[spec.chart];
      const shape = shapeOf(spec.chart, spec.outline);
      const centre = ((spec.thetaCenter ?? 0) * Math.PI) / 180;
      const chart = spec.chart;
      const ring = spec.ring ?? false;
      const radius = spec.radius ?? Infinity;
      const midline = spec.midline ?? 0;
      measure = (v) => {
        const p = charts.limb(chart, v);
        // Angle measured around the outline's centre, so it may cross ±180°.
        const theta = Math.atan2(Math.sin(p.theta - centre), Math.cos(p.theta - centre)) + centre;
        const x = theta * limb.radius;
        const y = p.u * limb.length;
        const d = ring
          ? Math.min(y - shape.minY, shape.maxY - y)
          : distanceTo(shape, x, y, edge * 2);
        const near =
          (radius === Infinity ? 1 : 1 - smoothstep(radius - 0.01, radius + 0.01, p.r)) *
          (midline === 0 ? 1 : smoothstep(midline - 0.006, midline + 0.006, p.midline));
        return {
          cover: smoothstep(-edge, edge, d) * near,
          belly: belly(d, spec.width) * near,
        };
      };
    }
    for (let v = 0; v < count; v++) {
      const gate = charts.gate(spec.segments, v);
      if (gate <= 0.01) continue;
      const m = measure(v);
      if (group >= 0 && m.cover > 0) {
        const i = v * MUSCLES.length + group;
        // The glow ends crisply where a body segment hands over to the next.
        groupCover[i] = Math.max(groupCover[i] ?? 0, m.cover * smoothstep(0.2, 0.6, gate));
      }
      if (spec.height !== 0 && m.belly > 0) {
        displacement[v] = (displacement[v] ?? 0) + spec.height * gate * m.belly;
      }
    }
  }

  // Top four groups per vertex.
  const groups = new Uint8Array(count * 4).fill(NO_MUSCLE);
  const cover = new Uint8Array(count * 4);
  for (let v = 0; v < count; v++) {
    const list: [number, number][] = [];
    for (let g = 0; g < MUSCLES.length; g++) {
      const c = groupCover[v * MUSCLES.length + g] ?? 0;
      if (c > 1 / 255) list.push([g, c]);
    }
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    list.slice(0, 4).forEach(([g, c], i) => {
      groups[v * 4 + i] = g;
      cover[v * 4 + i] = Math.round(Math.min(1, c) * 255);
    });
  }
  return { groups, cover, groupCover, displacement };
}

/** Pushes the muscle bellies out along the normals (smoothed so creases stay soft). */
export function sculptMuscles(mesh: PolyMesh, muscles: PaintedMuscles): void {
  const neighbours = vertexNeighbours(mesh);
  const field = Float64Array.from(muscles.displacement);
  smoothScalar(field, neighbours, 2);
  const normals = vertexNormals(mesh);
  for (let v = 0; v < field.length; v++) {
    for (let a = 0; a < 3; a++) {
      mesh.positions[v * 3 + a] =
        (mesh.positions[v * 3 + a] ?? 0) + (field[v] ?? 0) * (normals[v * 3 + a] ?? 0);
    }
  }
}
