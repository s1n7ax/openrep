/**
 * The figure generation pipeline, from MakeHuman's files to the data written
 * into `figure.glb`: body fit and skin weights (`body.ts`), a smooth
 * statue-like head, one level of subdivision, the painted and sculpted
 * muscles (`anatomy.ts`) and the baked cavity shading (`cavity.ts`).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { FIGURE_BONES, type FigureBoneData } from '../../src/lib/three/figureAsset.ts';
import { paintMuscles, sculptMuscles, type PaintedMuscles } from './anatomy.ts';
import { buildBody, type BindBone, type SourceReader } from './body.ts';
import { bakeCavity } from './cavity.ts';
import { FigureBuildError } from './errors.ts';
import { MUSCLE_SPECS } from './muscles.ts';
import { smoothHead } from './head.ts';
import {
  catmullClark,
  taubinSmooth,
  triangulate,
  vertexNeighbours,
  type PolyMesh,
} from './mesh.ts';

export interface BuiltFigure {
  /** Final (sculpted) mesh in the bind pose. */
  mesh: PolyMesh;
  /** The mesh before the muscles were sculpted (charts are measured on it). */
  unsculpted: PolyMesh;
  /** Skin weight per vertex per bone (`FIGURE_BONES` order). */
  weights: Float64Array;
  bind: BindBone[];
  muscles: PaintedMuscles;
  cavity: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  bones: FigureBoneData[];
  inverseBindMatrices: Float32Array;
  indices: Uint16Array;
  report: string[];
}

export async function buildFigure(read: SourceReader): Promise<BuiltFigure> {
  const body = await buildBody(read);

  // Skin weights per vertex per bone.
  const boneCount = FIGURE_BONES.length;
  const baseCount = body.mesh.positions.length / 3;
  const baseWeights = new Float64Array(baseCount * boneCount);
  for (let v = 0; v < baseCount; v++) {
    for (let i = 0; i < 4; i++) {
      const weight = body.skinWeight[v * 4 + i] ?? 0;
      if (weight > 0) baseWeights[v * boneCount + (body.skinIndex[v * 4 + i] ?? 0)] = weight;
    }
  }

  // A statue-like head: the face's features smoothed away (the mesh changes there).
  const headJoint = body.bind.find((bone) => bone.name === 'head')?.world.elements[13] ?? 0;
  const head = smoothHead(body.mesh, body.headWeight, headJoint);
  const headCount = head.mesh.positions.length / 3;
  const denseWeights = new Float64Array(headCount * boneCount);
  for (let v = 0; v < headCount; v++) {
    const origin = head.origin[v] ?? -1;
    const from = origin >= 0 ? [origin] : (head.sources.get(v) ?? []);
    for (const u of from) {
      for (let b = 0; b < boneCount; b++) {
        denseWeights[v * boneCount + b] =
          (denseWeights[v * boneCount + b] ?? 0) +
          (baseWeights[u * boneCount + b] ?? 0) / from.length;
      }
    }
  }

  smoothCrotch(head.mesh, denseWeights, boneCount);
  smoothHipWeights(head.mesh, denseWeights, boneCount);

  // One level of Catmull–Clark subdivision; skin weights interpolated per bone.
  const subdivided = catmullClark(head.mesh, [{ itemSize: boneCount, array: denseWeights }]);
  const mesh = subdivided.mesh;
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount > 65535) {
    throw new FigureBuildError(`Too many vertices for 16-bit indices: ${vertexCount}`);
  }
  const weights = subdivided.attributes[0]?.array ?? new Float64Array();

  // Bind pose: local transforms and inverse bind matrices.
  const bindWorld = new Map(body.bind.map((bone) => [bone.name, bone.world]));
  const inverseBindMatrices = new Float32Array(boneCount * 16);
  const bones = FIGURE_BONES.map((spec, index): FigureBoneData => {
    const world = bindWorld.get(spec.name) as Matrix4;
    const local = spec.parent
      ? (bindWorld.get(spec.parent) as Matrix4).clone().invert().multiply(world)
      : world.clone();
    const position = new Vector3();
    const quaternion = new Quaternion();
    local.decompose(position, quaternion, new Vector3());
    inverseBindMatrices.set(world.clone().invert().elements, index * 16);
    return {
      name: spec.name,
      parent: spec.parent,
      position: position.toArray() as [number, number, number],
      quaternion: quaternion.toArray() as [number, number, number, number],
    };
  });

  const { skinIndex, skinWeight } = quantizeWeights(weights, vertexCount, boneCount);
  const unsculpted: PolyMesh = { ...mesh, positions: Float64Array.from(mesh.positions) };
  const muscles = paintMuscles(mesh, body.bind, weights, MUSCLE_SPECS);
  sculptMuscles(mesh, muscles);
  const cavity = bakeCavity(mesh);
  const indices = Uint16Array.from(triangulate(mesh));
  return {
    mesh,
    unsculpted,
    weights,
    bind: body.bind,
    muscles,
    cavity,
    skinIndex,
    skinWeight,
    bones,
    inverseBindMatrices,
    indices,
    report: body.report,
  };
}

/** Bones whose weights are smoothed around the hips (the groin pinches otherwise). */
const HIP_BONES = ['pelvis', 'leftHip', 'rightHip', 'leftHipBlend', 'rightHipBlend'];
const HIP_SMOOTHING = 6;

/** Diffuses the hip-region skin weights over the mesh, so the groin bends without creases. */
function smoothHipWeights(mesh: PolyMesh, weights: Float64Array, boneCount: number): void {
  const hip = HIP_BONES.map((name) => FIGURE_BONES.findIndex((bone) => bone.name === name));
  const count = mesh.positions.length / 3;
  const region: number[] = [];
  for (let v = 0; v < count; v++) {
    let share = 0;
    for (const b of hip) share += weights[v * boneCount + b] ?? 0;
    // Only vertices weighted to the hips alone (not the spine or the knees).
    if (share > 0.999 && share > 0) region.push(v);
  }
  const neighbours = vertexNeighbours(mesh);
  const next = new Float64Array(hip.length);
  for (let pass = 0; pass < HIP_SMOOTHING; pass++) {
    for (const v of region) {
      const list = neighbours[v] ?? [];
      next.fill(0);
      for (const u of [v, ...list]) {
        hip.forEach((b, i) => (next[i] = (next[i] ?? 0) + (weights[u * boneCount + b] ?? 0)));
      }
      const total = next.reduce((sum, w) => sum + w, 0);
      if (total <= 0) continue;
      hip.forEach((b, i) => (weights[v * boneCount + b] = (next[i] ?? 0) / total));
    }
  }
}

/**
 * Smooths the folds of MakeHuman's crotch into a clean, statue-like surface,
 * and ties its middle to the pelvis so it stretches rather than folds when
 * the thighs spread.
 */
function smoothCrotch(mesh: PolyMesh, weights: Float64Array, boneCount: number): void {
  const count = mesh.positions.length / 3;
  const strength = new Float64Array(count);
  for (let v = 0; v < count; v++) {
    const x = Math.abs(mesh.positions[v * 3] ?? 0);
    const y = mesh.positions[v * 3 + 1] ?? 0;
    const across = 1 - Math.min(1, Math.max(0, (x - 0.03) / 0.03));
    const along =
      Math.min(1, Math.max(0, (y - 0.76) / 0.03)) * Math.min(1, Math.max(0, (0.92 - y) / 0.03));
    strength[v] = across * along;
  }
  taubinSmooth(mesh.positions, vertexNeighbours(mesh), strength, 30);
  const pelvis = FIGURE_BONES.findIndex((bone) => bone.name === 'pelvis');
  for (let v = 0; v < count; v++) {
    const move = 0.7 * (strength[v] ?? 0);
    if (move <= 0) continue;
    for (let b = 0; b < boneCount; b++) {
      weights[v * boneCount + b] = (weights[v * boneCount + b] ?? 0) * (1 - move);
    }
    weights[v * boneCount + pelvis] = (weights[v * boneCount + pelvis] ?? 0) + move;
  }
}

/** The four largest skin weights per vertex, as bytes summing to exactly 255. */
function quantizeWeights(
  weights: Float64Array,
  vertexCount: number,
  boneCount: number,
): { skinIndex: Uint8Array; skinWeight: Uint8Array } {
  const skinIndex = new Uint8Array(vertexCount * 4);
  const skinWeight = new Uint8Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    const top: [number, number][] = [];
    for (let b = 0; b < boneCount; b++) {
      const weight = weights[v * boneCount + b] ?? 0;
      if (weight > 1e-4) top.push([b, weight]);
    }
    top.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const kept = top.slice(0, 4);
    const total = kept.reduce((sum, [, weight]) => sum + weight, 0);
    // Largest-remainder rounding.
    const exact = kept.map(([, weight]) => (weight / total) * 255);
    const bytes = exact.map(Math.floor);
    let missing = 255 - bytes.reduce((sum, byte) => sum + byte, 0);
    const order = exact
      .map((_, i) => i)
      .sort((a, b) => ((exact[b] ?? 0) % 1) - ((exact[a] ?? 0) % 1));
    for (const i of order) {
      if (missing <= 0) break;
      bytes[i] = (bytes[i] ?? 0) + 1;
      missing--;
    }
    kept.forEach(([bone], i) => {
      skinIndex[v * 4 + i] = bone;
      skinWeight[v * 4 + i] = bytes[i] ?? 0;
    });
  }
  return { skinIndex, skinWeight };
}
