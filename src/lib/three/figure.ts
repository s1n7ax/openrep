/**
 * The 3D figure: the sculpted body from `figure.glb` (see `figureAsset.ts`)
 * skinned to the animation rig (`rig.ts`). The pose solver moves the rig;
 * the figure then shapes the hands (grip, relaxed, flat), bends the toes and
 * updates the blend bones that keep shoulders, elbows, hips, knees and
 * forearms smooth.
 */
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import {
  BLEND_BONES,
  FIGURE_BONES,
  FINGERS,
  fingerBone,
  toesBone,
  type FigureAsset,
  type Finger,
} from './figureAsset.ts';
import { createFigureMaterial, type FigureMaterial } from './figureMaterial.ts';
import type { HandShape, PoseResult } from './pose.ts';
import { createRig, SIDES, type Rig, type Side } from './rig.ts';

export interface Figure {
  /** Add this to the scene. */
  group: Group;
  rig: Rig;
  mesh: SkinnedMesh;
  material: FigureMaterial;
  /** Shapes the hands, bends the toes and updates the blend bones for the posed rig. */
  applyPoseResult(result: PoseResult): void;
  dispose(): void;
}

const DEG = Math.PI / 180;

/**
 * Finger curl per hand shape (degrees about each finger joint's hinge, from
 * the bind pose): [knuckle, middle joint, end joint].
 */
const FINGER_CURL: Record<HandShape, Record<Finger, [number, number, number]>> = {
  grip: {
    thumb: [20, 35, 40],
    index: [70, 95, 55],
    middle: [75, 95, 55],
    ring: [78, 95, 55],
    pinky: [80, 92, 55],
  },
  relaxed: {
    thumb: [0, 5, 5],
    index: [4, 10, 6],
    middle: [5, 11, 6],
    ring: [6, 12, 7],
    pinky: [7, 13, 8],
  },
  flat: {
    thumb: [-35, -10, 0],
    index: [-6, -6, -2],
    middle: [-6, -6, -2],
    ring: [-6, -6, -2],
    pinky: [-6, -6, -2],
  },
};

/** Normals of each asset, computed once (the geometry is the same for every viewer). */
const normalCache = new WeakMap<FigureAsset, Float32Array>();

function figureGeometry(asset: FigureAsset): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(asset.skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(asset.skinWeight, 4, true));
  geometry.setAttribute('muscleGroups', new BufferAttribute(asset.muscleGroups, 4));
  geometry.setAttribute('muscleCover', new BufferAttribute(asset.muscleCover, 4, true));
  geometry.setAttribute('cavity', new BufferAttribute(asset.cavity, 1, true));
  geometry.setIndex(
    asset.indices instanceof Uint16Array
      ? new Uint16BufferAttribute(asset.indices, 1)
      : new Uint32BufferAttribute(asset.indices, 1),
  );
  let normals = normalCache.get(asset);
  if (!normals) {
    geometry.computeVertexNormals();
    normals = (geometry.getAttribute('normal') as BufferAttribute).array as Float32Array;
    normalCache.set(asset, normals);
  } else {
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  }
  return geometry;
}

const _parentQuat = new Quaternion();
const _childQuat = new Quaternion();
const _blendQuat = new Quaternion();
const _twist = new Quaternion();
const _swing = new Quaternion();
const _inverseTwist = new Quaternion();
const _identity = new Quaternion();
const _pivot = new Vector3();
const _scale = new Vector3();
const _deform = new Matrix4();
const _axis = new Vector3();

/** Rotation part of a bone's skinning transform (world × inverse bind). */
function deformRotation(bone: Bone, inverseBind: Matrix4, out: Quaternion): Quaternion {
  _deform.multiplyMatrices(bone.matrixWorld, inverseBind);
  _deform.decompose(_pivot, out, _scale);
  return out;
}

export function createFigure(asset: FigureAsset): Figure {
  const rig = createRig();
  const group = new Group();
  group.name = 'figure';
  group.add(rig.root);

  // Every bone in the asset's order: the rig's joints plus fingers, toes and blend bones.
  const bones = new Map<string, Bone>(Object.entries(rig.joints));
  const bindLocal = new Map<string, Quaternion>();
  const assetBones = new Map(asset.bones.map((bone) => [bone.name, bone]));
  for (const spec of FIGURE_BONES) {
    const data = assetBones.get(spec.name);
    if (!data) continue;
    bindLocal.set(spec.name, new Quaternion(...data.quaternion));
    if (bones.has(spec.name)) continue;
    const bone = new Bone();
    bone.name = spec.name;
    bone.position.set(...data.position);
    bone.quaternion.set(...data.quaternion);
    const parent = spec.parent ? bones.get(spec.parent) : null;
    if (parent) parent.add(bone);
    else {
      // Blend bones: placed every frame from world transforms.
      bone.matrixAutoUpdate = false;
      group.add(bone);
    }
    bones.set(spec.name, bone);
  }
  const ordered = FIGURE_BONES.map((spec) => bones.get(spec.name) as Bone);
  const inverses = FIGURE_BONES.map((_, i) =>
    new Matrix4().fromArray(asset.inverseBindMatrices, i * 16),
  );
  const inverseOf = new Map(FIGURE_BONES.map((spec, i) => [spec.name, inverses[i] as Matrix4]));
  const skeleton = new Skeleton(ordered, inverses);

  const geometry = figureGeometry(asset);
  const material = createFigureMaterial();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Skinned vertices move far from the bind-pose bounds.
  mesh.frustumCulled = false;
  group.add(mesh);
  mesh.bind(skeleton, new Matrix4());

  // Hand shapes: finger rotations relative to the bind pose.
  const fingerPoses = new Map<string, Record<HandShape, Quaternion>>();
  for (const side of SIDES) {
    for (const finger of FINGERS) {
      for (const segment of [1, 2, 3] as const) {
        const name = fingerBone(side, finger, segment);
        const base = bindLocal.get(name) ?? new Quaternion();
        const pose = (shape: HandShape) =>
          base
            .clone()
            .multiply(
              new Quaternion().setFromAxisAngle(
                new Vector3(1, 0, 0),
                (FINGER_CURL[shape][finger][segment - 1] ?? 0) * DEG,
              ),
            );
        fingerPoses.set(name, { grip: pose('grip'), relaxed: pose('relaxed'), flat: pose('flat') });
      }
    }
  }
  const toeBind = new Map(
    SIDES.map((side) => [side, bindLocal.get(toesBone(side)) ?? new Quaternion()]),
  );

  // Blend bone pivots in the bind pose.
  const bindPivot = new Map<string, Vector3>();
  for (const blend of BLEND_BONES) {
    const pivot = blend.kind === 'twist' ? blend.parent : blend.child;
    const bindWorld = (inverseOf.get(pivot) as Matrix4).clone().invert();
    bindPivot.set(blend.name, new Vector3().setFromMatrixPosition(bindWorld));
  }
  // Twist axes in the bind pose: the forearm for "twist", the upper arm for "swing".
  const bindPosition = (name: string) =>
    new Vector3().setFromMatrixPosition((inverseOf.get(name) as Matrix4).clone().invert());
  const twistAxis = new Map<string, Vector3>();
  for (const blend of BLEND_BONES) {
    if (blend.kind === 'twist') {
      twistAxis.set(
        blend.name,
        bindPosition(blend.child).sub(bindPosition(blend.parent)).normalize(),
      );
    } else if (blend.kind === 'swing') {
      const child = FIGURE_BONES.find((bone) => bone.parent === blend.child)?.name ?? blend.child;
      twistAxis.set(blend.name, bindPosition(child).sub(bindPosition(blend.child)).normalize());
    }
  }

  function updateBlendBones(): void {
    group.updateMatrixWorld(true);
    for (const blend of BLEND_BONES) {
      const bone = bones.get(blend.name) as Bone;
      const parent = bones.get(blend.parent) as Bone;
      const child = bones.get(blend.child) as Bone;
      deformRotation(parent, inverseOf.get(blend.parent) as Matrix4, _parentQuat);
      deformRotation(child, inverseOf.get(blend.child) as Matrix4, _childQuat);
      if (blend.kind === 'blend') {
        _blendQuat.slerpQuaternions(_parentQuat, _childQuat, 0.5);
        child.getWorldPosition(_pivot);
      } else if (blend.kind === 'swing') {
        // Child rotation relative to the parent, split into swing and twist about the bone.
        _twist.copy(_parentQuat).invert().multiply(_childQuat);
        const axis = twistAxis.get(blend.name) as Vector3;
        const along = _axis.set(_twist.x, _twist.y, _twist.z).dot(axis);
        _swing.copy(_twist);
        _twist.set(axis.x * along, axis.y * along, axis.z * along, _twist.w);
        if (_twist.lengthSq() < 1e-12) _twist.identity();
        else _twist.normalize();
        // swing = relative × twist⁻¹; keep a quarter of the twist.
        _swing.multiply(_inverseTwist.copy(_twist).invert());
        _twist.slerp(_identity, 0.75);
        _blendQuat.copy(_parentQuat).multiply(_swing).multiply(_twist);
        child.getWorldPosition(_pivot);
      } else {
        // Twist of the child relative to the parent about the bind-pose bone axis.
        _twist.copy(_parentQuat).invert().multiply(_childQuat);
        const axis = twistAxis.get(blend.name) as Vector3;
        const along = _axis.set(_twist.x, _twist.y, _twist.z).dot(axis);
        _twist.set(axis.x * along, axis.y * along, axis.z * along, _twist.w);
        if (_twist.lengthSq() < 1e-12) _twist.identity();
        else _twist.normalize();
        _twist.slerp(_identity, 0.5);
        _blendQuat.copy(_parentQuat).multiply(_twist);
        parent.getWorldPosition(_pivot);
      }
      // World transform such that world × inverse bind = rotate about the pivot.
      bone.matrix.compose(_pivot, _blendQuat, _scale.set(1, 1, 1));
      bone.matrixWorld.copy(bone.matrix);
    }
  }

  function applyHand(side: Side, shape: HandShape): void {
    for (const finger of FINGERS) {
      for (const segment of [1, 2, 3] as const) {
        const name = fingerBone(side, finger, segment);
        const pose = fingerPoses.get(name)?.[shape];
        if (pose) bones.get(name)?.quaternion.copy(pose);
      }
    }
  }

  for (const side of SIDES) applyHand(side, 'relaxed');
  updateBlendBones();

  return {
    group,
    rig,
    mesh,
    material,
    applyPoseResult(result) {
      for (const side of SIDES) {
        applyHand(side, result.hands[side]);
        const toes = bones.get(toesBone(side));
        toes?.quaternion
          .copy(toeBind.get(side) as Quaternion)
          .multiply(_twist.setFromAxisAngle(_axis.set(1, 0, 0), -result.toeBend[side]));
      }
      updateBlendBones();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      skeleton.dispose();
    },
  };
}
