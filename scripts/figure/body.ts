/**
 * Builds the sculpted body from MakeHuman's assets: applies the body-shape
 * targets, fits the mesh to the animation rig (`src/lib/three/rig.ts`,
 * `dimensions.ts`) and computes the skin weights.
 *
 * Fitting: the rig's joint offsets are fixed (the animations depend on them),
 * so the mesh is fitted to the rig, not the other way round. The bind pose is
 * the rig with each limb turned to point where MakeHuman's limb points (an
 * A-pose); each limb's part of the mesh is then moved and stretched along the
 * limb so its joints land exactly on the rig's joints, blended by skin weight.
 */
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import {
  ANKLE_HEIGHT,
  BALL_OFFSET,
  CHEST_OFFSET,
  FIGURE_HEIGHT,
  FOREARM_LENGTH,
  HEAD_OFFSET,
  HIP_OFFSET,
  NECK_OFFSET,
  SHIN_LENGTH,
  SHOULDER_OFFSET,
  SPINE_OFFSET,
  STANDING_PELVIS_HEIGHT,
  THIGH_LENGTH,
  TOE_JOINT,
  UPPER_ARM_LENGTH,
} from '../../src/lib/three/dimensions.ts';
import {
  BLEND_BONES,
  FIGURE_BONE_INDEX,
  FIGURE_BONES,
  FINGERS,
  fingerBone,
  toesBone,
  type Finger,
} from '../../src/lib/three/figureAsset.ts';
import { SIDES, type Side } from '../../src/lib/three/rig.ts';
import {
  applyTarget,
  jointPosition,
  parseBaseMesh,
  parseSkeleton,
  parseWeights,
  type MakeHumanSkeleton,
} from './makehuman.ts';
import { FigureBuildError } from './errors.ts';
import { flipFaces, quadMesh, signedVolume, type PolyMesh } from './mesh.ts';

/** Reads a pinned MakeHuman file (see `makehuman.ts`). */
export type SourceReader = (file: string) => Promise<string>;

/**
 * Body-shape targets and their weights: a young, lean, very muscular male
 * (MakeHuman macro sliders gender 1, age 25, muscle 1, weight 0.35, ideal
 * proportions), extra muscle definition, and proportion targets that bring
 * MakeHuman's joints close to the rig's before the fit.
 */
export const BODY_TARGETS: readonly (readonly [string, number])[] = [
  ['targets/macrodetails/caucasian-male-young.target', 1 / 3],
  ['targets/macrodetails/african-male-young.target', 1 / 3],
  ['targets/macrodetails/asian-male-young.target', 1 / 3],
  ['targets/macrodetails/universal-male-young-maxmuscle-averageweight.target', 0.7],
  ['targets/macrodetails/universal-male-young-maxmuscle-minweight.target', 0.3],
  [
    'targets/macrodetails/proportions/male-young-maxmuscle-averageweight-idealproportions.target',
    0.7,
  ],
  ['targets/macrodetails/proportions/male-young-maxmuscle-minweight-idealproportions.target', 0.3],
  ['targets/torso/torso-muscle-pectoral-incr.target', 0.4],
  ['targets/torso/torso-muscle-dorsi-incr.target', 0.5],
  ['targets/torso/torso-vshape-incr.target', 0.3],
  ['targets/stomach/stomach-pregnant-decr.target', 0.5],
  ['targets/armslegs/l-upperarm-muscle-incr.target', 0.5],
  ['targets/armslegs/r-upperarm-muscle-incr.target', 0.5],
  ['targets/armslegs/l-upperarm-shoulder-muscle-incr.target', 0.3],
  ['targets/armslegs/r-upperarm-shoulder-muscle-incr.target', 0.3],
  ['targets/armslegs/l-lowerarm-muscle-incr.target', 0.4],
  ['targets/armslegs/r-lowerarm-muscle-incr.target', 0.4],
  ['targets/armslegs/l-upperleg-muscle-incr.target', 0.5],
  ['targets/armslegs/r-upperleg-muscle-incr.target', 0.5],
  ['targets/armslegs/l-lowerleg-muscle-incr.target', 0.5],
  ['targets/armslegs/r-lowerleg-muscle-incr.target', 0.5],
  // Proportions towards the rig (see the fit report printed by the generator).
  ['targets/measure/measure-shoulder-dist-decr.target', 1.0],
  ['targets/measure/measure-upperarm-length-incr.target', 0.4],
  ['targets/measure/measure-lowerarm-length-decr.target', 0.43],
  ['targets/measure/measure-lowerleg-height-decr.target', 0.38],
  ['targets/measure/measure-napetowaist-dist-incr.target', 0.54],
  ['targets/measure/measure-neck-height-decr.target', 0.6],
];

/**
 * Bind-pose pitch of the spine and chest joints (radians, each): MakeHuman's
 * upper body stands a little further forward over the hips than the rig's, so
 * the rig is bent forward to meet the mesh in the bind pose — standing at
 * rest, the figure's chest then comes up over the hips.
 */
const TORSO_LEAN = (2.5 * Math.PI) / 180;

// ── Skin weight mapping ──────────────────────────────────────────────────────

/** MakeHuman bone → figure bone (`L`/`R` → left/right). Unlisted bones go to the head. */
function mapBone(name: string): string {
  const match = /^(.*)\.([LR])$/.exec(name);
  const base = match?.[1] ?? name;
  const side: Side | null = match ? (match[2] === 'L' ? 'left' : 'right') : null;
  const finger = /^finger([1-5])-([1-3])$/.exec(base);
  if (finger && side) {
    const which = FINGERS[Number(finger[1]) - 1] as Finger;
    return fingerBone(side, which, Number(finger[2]) as 1 | 2 | 3);
  }
  if (/^toe[1-5]-[1-3]$/.test(base) && side) return toesBone(side);
  const sided: Record<string, string> = {
    clavicle: 'chest',
    breast: 'chest',
    shoulder01: 'ShoulderBlend',
    upperarm01: 'UpperArmTwist',
    upperarm02: 'Shoulder',
    lowerarm01: 'Elbow',
    lowerarm02: 'ForearmTwist',
    wrist: 'Wrist',
    metacarpal1: 'Wrist',
    metacarpal2: 'Wrist',
    metacarpal3: 'Wrist',
    metacarpal4: 'Wrist',
    pelvis: 'pelvis',
    upperleg01: 'Hip',
    upperleg02: 'Hip',
    lowerleg01: 'Knee',
    lowerleg02: 'Knee',
    foot: 'Ankle',
  };
  if (side && sided[base]) {
    const target = sided[base] ?? '';
    return target === 'chest' || target === 'pelvis' ? target : `${side}${target}`;
  }
  const central: Record<string, string> = {
    root: 'pelvis',
    spine05: 'pelvis',
    spine04: 'spine',
    spine03: 'spine',
    spine02: 'chest',
    spine01: 'chest',
    neck01: 'neck',
    neck02: 'neck',
    neck03: 'neck',
  };
  return central[base] ?? 'head';
}

/** Pelvis / spine / chest share of a torso vertex by rest height (smooth bands). */
function torsoSplit(y: number): [number, number, number] {
  const pelvis = 1 - MathUtils.smoothstep(y, 0.97, 1.13);
  const chest = MathUtils.smoothstep(y, 1.17, 1.33);
  return [pelvis, Math.max(0, 1 - pelvis - chest), chest];
}

// ── Fit ──────────────────────────────────────────────────────────────────────

/** Where a limb's mesh moves: `to + M (v − from)`. */
interface Warp {
  from: Vector3;
  to: Vector3;
  matrix: Matrix4;
}

function stretchAlong(direction: Vector3, factor: number): Matrix4 {
  const d = direction;
  const k = factor - 1;
  // I + k d dᵀ
  return new Matrix4().set(
    1 + k * d.x * d.x,
    k * d.x * d.y,
    k * d.x * d.z,
    0,
    k * d.y * d.x,
    1 + k * d.y * d.y,
    k * d.y * d.z,
    0,
    k * d.z * d.x,
    k * d.z * d.y,
    1 + k * d.z * d.z,
    0,
    0,
    0,
    0,
    1,
  );
}

/** World rotation of a bone with local −y along `along` and local +x as close to `x` as possible. */
function boneFrame(along: Vector3, x: Vector3): Quaternion {
  const yAxis = along.clone().normalize().negate();
  const xAxis = x.clone().addScaledVector(yAxis, -x.dot(yAxis)).normalize();
  const zAxis = new Vector3().crossVectors(xAxis, yAxis);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
}

/** Frame with local +y along `y` and local +z as close to `z` as possible. */
function frameYZ(y: Vector3, z: Vector3): Quaternion {
  const yAxis = y.clone().normalize();
  const zAxis = z.clone().addScaledVector(yAxis, -z.dot(yAxis)).normalize();
  const xAxis = new Vector3().crossVectors(yAxis, zAxis);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
}

export interface BindBone {
  name: string;
  world: Matrix4;
}

export interface FittedBody {
  mesh: PolyMesh;
  /** Four (bone index, weight) pairs per vertex, weights summing to 1. */
  skinIndex: Uint16Array;
  skinWeight: Float64Array;
  /** Bind-pose world matrix of every bone of `FIGURE_BONES`. */
  bind: BindBone[];
  /** Per-vertex head share (for smoothing away the face), 0–1. */
  headWeight: Float64Array;
  /** Report lines describing the fit. */
  report: string[];
}

/**
 * Shapes MakeHuman's base mesh, fits it to the rig and maps its skin weights
 * onto the figure's bones. Errors thrown by `read` pass through.
 *
 * @throws {FigureBuildError} when the skeleton lacks a bone the fit needs, a
 *   weighted bone maps to no figure bone, a vertex has no skin weight, or a
 *   figure bone gets no bind pose.
 * @throws {MakeHumanFormatError} when a MakeHuman file is not shaped as expected.
 */
export async function buildBody(read: SourceReader): Promise<FittedBody> {
  const base = parseBaseMesh(await read('3dobjs/base.obj'));
  const skeleton: MakeHumanSkeleton = parseSkeleton(await read('rigs/default.mhskel'));
  const weights = parseWeights(await read('rigs/default_weights.mhw'));
  const positions = base.positions;
  for (const [file, weight] of BODY_TARGETS) applyTarget(positions, await read(file), weight);

  // Body vertices only, re-indexed.
  const oldToNew = new Int32Array(positions.length / 3).fill(-1);
  const bodyVertices: number[] = [];
  for (const v of base.bodyQuads) {
    if (oldToNew[v] === -1) {
      oldToNew[v] = bodyVertices.length;
      bodyVertices.push(v);
    }
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of bodyVertices) {
    minY = Math.min(minY, positions[v * 3 + 1] ?? 0);
    maxY = Math.max(maxY, positions[v * 3 + 1] ?? 0);
  }
  const scale = FIGURE_HEIGHT / (maxY - minY);
  // Centred front to back on the hip joints, like the rig.
  const hipCentre = jointPosition(
    skeleton,
    positions,
    skeleton.bones.get('upperleg01.L')?.head ?? '',
  );
  const offsetZ = -hipCentre[2] * scale;
  const place = (x: number, y: number, z: number) =>
    new Vector3(x * scale, (y - minY) * scale, z * scale + offsetZ);
  const joint = (bone: string, end: 'head' | 'tail' = 'head') => {
    const spec = skeleton.bones.get(bone);
    if (!spec) throw new FigureBuildError(`Unknown MakeHuman bone ${bone}`);
    const [x, y, z] = jointPosition(skeleton, positions, end === 'head' ? spec.head : spec.tail);
    return place(x, y, z);
  };

  const vertexCount = bodyVertices.length;
  const placed = new Float64Array(vertexCount * 3);
  bodyVertices.forEach((v, i) => {
    const p = place(positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0);
    placed.set([p.x, p.y, p.z], i * 3);
  });
  const mesh = quadMesh(
    placed,
    Uint32Array.from(base.bodyQuads, (v) => oldToNew[v] ?? 0),
  );
  if (signedVolume(mesh) < 0) flipFaces(mesh);

  // ── Skin weights mapped onto the figure's bones ──
  const boneCount = FIGURE_BONES.length;
  const dense = new Float64Array(vertexCount * boneCount);
  const headWeight = new Float64Array(vertexCount);
  for (const [bone, list] of weights) {
    const target = mapBone(bone);
    const index = FIGURE_BONE_INDEX.get(target);
    if (index === undefined) throw new FigureBuildError(`No figure bone ${target} for ${bone}`);
    const isFace = target === 'head';
    for (const [vertex, weight] of list) {
      const v = oldToNew[vertex] ?? -1;
      if (v < 0) continue;
      dense[v * boneCount + index] = (dense[v * boneCount + index] ?? 0) + weight;
      if (isFace) headWeight[v] = (headWeight[v] ?? 0) + weight;
    }
  }
  const torsoIndices = ['pelvis', 'spine', 'chest'].map((name) => FIGURE_BONE_INDEX.get(name) ?? 0);
  for (let v = 0; v < vertexCount; v++) {
    const row = v * boneCount;
    let total = 0;
    for (let b = 0; b < boneCount; b++) total += dense[row + b] ?? 0;
    if (total <= 0) throw new FigureBuildError(`Vertex ${v} has no skin weight`);
    for (let b = 0; b < boneCount; b++) dense[row + b] = (dense[row + b] ?? 0) / total;
    headWeight[v] = (headWeight[v] ?? 0) / total;
    // The torso share is split over pelvis / spine / chest by height.
    let torso = 0;
    for (const b of torsoIndices) torso += dense[row + b] ?? 0;
    const split = torsoSplit(placed[v * 3 + 1] ?? 0);
    torsoIndices.forEach((b, i) => (dense[row + b] = torso * (split[i] ?? 0)));
  }

  // ── Bind pose and limb warps ──
  const identity = new Quaternion();
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), TORSO_LEAN);
  const lean2 = lean.clone().multiply(lean);
  const offset = (o: { x: number; y: number; z: number }, rotation: Quaternion) =>
    new Vector3(o.x, o.y, o.z).applyQuaternion(rotation);
  const pelvis = new Vector3(0, STANDING_PELVIS_HEIGHT, 0);
  const spine = pelvis.clone().add(offset(SPINE_OFFSET, identity));
  const chest = spine.clone().add(offset(CHEST_OFFSET, lean));
  const neck = chest.clone().add(offset(NECK_OFFSET, lean2));
  const head = neck.clone().add(offset(HEAD_OFFSET, lean2));
  const world = new Map<string, Matrix4>();
  const setWorld = (name: string, position: Vector3, rotation: Quaternion) =>
    world.set(name, new Matrix4().compose(position, rotation, new Vector3(1, 1, 1)));
  setWorld('pelvis', pelvis, identity);
  setWorld('spine', spine, lean);
  setWorld('chest', chest, lean2);
  setWorld('neck', neck, lean2);
  setWorld('head', head, lean2);

  const warps = new Map<string, Warp>();
  const none: Warp = { from: new Vector3(), to: new Vector3(), matrix: new Matrix4() };
  const report: string[] = [];
  const X = new Vector3(1, 0, 0);
  for (const side of SIDES) {
    const s = side === 'left' ? 1 : -1;
    const tag = side === 'left' ? 'L' : 'R';
    // Arm.
    const shoulderMh = joint(`upperarm01.${tag}`);
    const elbowMh = joint(`lowerarm01.${tag}`);
    const wristMh = joint(`wrist.${tag}`);
    const upperDir = elbowMh.clone().sub(shoulderMh).normalize();
    const foreDir = wristMh.clone().sub(elbowMh).normalize();
    const hinge = new Vector3().crossVectors(foreDir, upperDir).normalize();
    const shoulder = chest
      .clone()
      .add(offset({ x: s * SHOULDER_OFFSET.x, y: SHOULDER_OFFSET.y, z: SHOULDER_OFFSET.z }, lean2));
    const elbow = shoulder.clone().addScaledVector(upperDir, UPPER_ARM_LENGTH);
    const wrist = elbow.clone().addScaledVector(foreDir, FOREARM_LENGTH);
    setWorld(`${side}Shoulder`, shoulder, boneFrame(upperDir, hinge));
    setWorld(`${side}Elbow`, elbow, boneFrame(foreDir, hinge));
    warps.set(`${side}UpperArm`, {
      from: shoulderMh,
      to: shoulder,
      matrix: stretchAlong(upperDir, UPPER_ARM_LENGTH / shoulderMh.distanceTo(elbowMh)),
    });
    warps.set(`${side}Forearm`, {
      from: elbowMh,
      to: elbow,
      matrix: stretchAlong(foreDir, FOREARM_LENGTH / elbowMh.distanceTo(wristMh)),
    });
    warps.set(`${side}Hand`, { from: wristMh, to: wrist, matrix: new Matrix4() });
    report.push(
      `${side} shoulder: MakeHuman ${fmt(shoulderMh)} → rig ${fmt(shoulder)}`,
      `${side} upper arm ${shoulderMh.distanceTo(elbowMh).toFixed(3)} → ${UPPER_ARM_LENGTH}, ` +
        `forearm ${elbowMh.distanceTo(wristMh).toFixed(3)} → ${FOREARM_LENGTH}`,
    );

    // Hand: fingers along local −y, thumb side local +z.
    const middleKnuckle = joint(`finger3-1.${tag}`);
    const indexKnuckle = joint(`finger2-1.${tag}`);
    const pinkyKnuckle = joint(`finger5-1.${tag}`);
    const handDir = middleKnuckle.clone().sub(wristMh).normalize();
    const thumbSide = indexKnuckle.clone().sub(pinkyKnuckle);
    const handRotation = frameYZ(handDir.clone().negate(), thumbSide);
    setWorld(`${side}Wrist`, wrist, handRotation);
    const handOffset = wrist.clone().sub(wristMh);
    // Palm normal: local −x for the left hand, +x for the right.
    const palm = new Vector3(-s, 0, 0).applyQuaternion(handRotation);
    for (const [f, finger] of FINGERS.entries()) {
      const points = [1, 2, 3].map((segment) =>
        joint(`finger${f + 1}-${segment}.${tag}`).add(handOffset),
      );
      points.push(joint(`finger${f + 1}-3.${tag}`, 'tail').add(handOffset));
      // Fingers curl towards the palm; the thumb towards the palm and the fingers.
      const curlTowards =
        finger === 'thumb'
          ? palm
              .clone()
              .add(new Vector3(0, 0, -0.8).applyQuaternion(handRotation))
              .normalize()
          : palm;
      for (let segment = 0; segment < 3; segment++) {
        const from = points[segment] as Vector3;
        const to = points[segment + 1] as Vector3;
        const dir = to.clone().sub(from).normalize();
        const axis = new Vector3().crossVectors(dir, curlTowards);
        setWorld(fingerBone(side, finger, (segment + 1) as 1 | 2 | 3), from, boneFrame(dir, axis));
      }
    }

    // Leg.
    const hipMh = joint(`upperleg01.${tag}`);
    const kneeMh = joint(`lowerleg01.${tag}`);
    const ankleMh = joint(`foot.${tag}`);
    const ballMh = joint(`toe3-1.${tag}`);
    const thighDir = kneeMh.clone().sub(hipMh).normalize();
    const shinDir = ankleMh.clone().sub(kneeMh).normalize();
    const hip = pelvis.clone().add(new Vector3(s * HIP_OFFSET.x, HIP_OFFSET.y, HIP_OFFSET.z));
    const knee = hip.clone().addScaledVector(thighDir, THIGH_LENGTH);
    const ankle = knee.clone().addScaledVector(shinDir, SHIN_LENGTH);
    setWorld(`${side}Hip`, hip, boneFrame(thighDir, X));
    setWorld(`${side}Knee`, knee, boneFrame(shinDir, X));
    const footForward = ballMh.clone().sub(ankleMh).setY(0).normalize();
    const footRotation = frameYZ(new Vector3(0, 1, 0), footForward);
    setWorld(`${side}Ankle`, ankle, footRotation);
    warps.set(`${side}Thigh`, {
      from: hipMh,
      to: hip,
      matrix: stretchAlong(thighDir, THIGH_LENGTH / hipMh.distanceTo(kneeMh)),
    });
    warps.set(`${side}Shin`, {
      from: kneeMh,
      to: knee,
      matrix: stretchAlong(shinDir, SHIN_LENGTH / kneeMh.distanceTo(ankleMh)),
    });
    // Foot: ankle height and ball distance match the rig (sole stays on the floor).
    const ballForward = ballMh.clone().sub(ankleMh).dot(footForward);
    const footMatrix = stretchAlong(footForward, BALL_OFFSET / ballForward).premultiply(
      new Matrix4().makeScale(1, ANKLE_HEIGHT / ankleMh.y, 1),
    );
    warps.set(`${side}Foot`, { from: ankleMh, to: ankle, matrix: footMatrix });
    const toes = new Vector3(TOE_JOINT.x, TOE_JOINT.y, TOE_JOINT.z).applyMatrix4(
      world.get(`${side}Ankle`) as Matrix4,
    );
    setWorld(toesBone(side), toes, footRotation);
    report.push(
      `${side} hip: MakeHuman ${fmt(hipMh)} → rig ${fmt(hip)}`,
      `${side} thigh ${hipMh.distanceTo(kneeMh).toFixed(3)} → ${THIGH_LENGTH}, ` +
        `shin ${kneeMh.distanceTo(ankleMh).toFixed(3)} → ${SHIN_LENGTH}, ` +
        `ankle height ${ankleMh.y.toFixed(3)} → ${ANKLE_HEIGHT}, ball ${ballForward.toFixed(3)} → ${BALL_OFFSET}`,
    );
  }
  for (const blend of BLEND_BONES) {
    const pivot = world.get(blend.kind === 'twist' ? blend.parent : blend.child) as Matrix4;
    setWorld(blend.name, new Vector3().setFromMatrixPosition(pivot), identity);
  }

  // Warp each vertex by its limb share.
  const warpOf = (bone: string): [Warp, number][] => {
    const side = bone.startsWith('left') ? 'left' : bone.startsWith('right') ? 'right' : null;
    const rest = side ? bone.slice(side.length) : bone;
    const w = (name: string) => warps.get(`${side}${name}`) ?? none;
    switch (rest) {
      case 'Shoulder':
      case 'UpperArmTwist':
        return [[w('UpperArm'), 1]];
      case 'ShoulderBlend':
        return [
          [none, 0.5],
          [w('UpperArm'), 0.5],
        ];
      case 'ElbowBlend':
        return [
          [w('UpperArm'), 0.5],
          [w('Forearm'), 0.5],
        ];
      case 'Elbow':
      case 'ForearmTwist':
        return [[w('Forearm'), 1]];
      case 'Wrist':
        return [[w('Hand'), 1]];
      case 'Hip':
        return [[w('Thigh'), 1]];
      case 'HipBlend':
        return [
          [none, 0.5],
          [w('Thigh'), 0.5],
        ];
      case 'KneeBlend':
        return [
          [w('Thigh'), 0.5],
          [w('Shin'), 0.5],
        ];
      case 'Knee':
        return [[w('Shin'), 1]];
      case 'Ankle':
      case 'Toes':
        return [[w('Foot'), 1]];
      default:
        if (side && /^(Thumb|Index|Middle|Ring|Pinky)/.test(rest)) return [[w('Hand'), 1]];
        return [[none, 1]];
    }
  };
  const boneWarps = FIGURE_BONES.map((bone) => warpOf(bone.name));
  const p = new Vector3();
  const sum = new Vector3();
  for (let v = 0; v < vertexCount; v++) {
    sum.set(0, 0, 0);
    const row = v * boneCount;
    for (let b = 0; b < boneCount; b++) {
      const weight = dense[row + b] ?? 0;
      if (weight <= 0) continue;
      for (const [warp, share] of boneWarps[b] ?? []) {
        p.fromArray(placed, v * 3);
        if (warp !== none) p.sub(warp.from).applyMatrix4(warp.matrix).add(warp.to);
        sum.addScaledVector(p, weight * share);
      }
    }
    placed.set([sum.x, sum.y, sum.z], v * 3);
  }

  // Blend bones take the shared part of their two joints' weights.
  for (const blend of BLEND_BONES) {
    if (blend.kind !== 'blend') continue;
    const b = FIGURE_BONE_INDEX.get(blend.name) ?? 0;
    const parent = FIGURE_BONE_INDEX.get(blend.parent) ?? 0;
    const child = FIGURE_BONE_INDEX.get(blend.child) ?? 0;
    for (let v = 0; v < vertexCount; v++) {
      const row = v * boneCount;
      const shared = Math.min(dense[row + parent] ?? 0, dense[row + child] ?? 0);
      if (shared <= 0) continue;
      dense[row + parent] = (dense[row + parent] ?? 0) - shared;
      dense[row + child] = (dense[row + child] ?? 0) - shared;
      dense[row + b] = (dense[row + b] ?? 0) + 2 * shared;
    }
  }

  // Keep the four largest weights per vertex.
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float64Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    const row = v * boneCount;
    const top: [number, number][] = [];
    for (let b = 0; b < boneCount; b++) {
      const weight = dense[row + b] ?? 0;
      if (weight > 1e-4) top.push([b, weight]);
    }
    top.sort((a, b) => b[1] - a[1]);
    const kept = top.slice(0, 4);
    const total = kept.reduce((acc, [, weight]) => acc + weight, 0);
    kept.forEach(([bone, weight], i) => {
      skinIndex[v * 4 + i] = bone;
      skinWeight[v * 4 + i] = weight / total;
    });
  }

  const bind = FIGURE_BONES.map((bone) => {
    const matrix = world.get(bone.name);
    if (!matrix) throw new FigureBuildError(`No bind pose for ${bone.name}`);
    return { name: bone.name, world: matrix };
  });
  return { mesh, skinIndex, skinWeight, bind, headWeight, report };
}

function fmt(v: Vector3): string {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}
