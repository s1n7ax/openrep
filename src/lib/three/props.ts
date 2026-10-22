/**
 * Gym equipment built from simple shapes, and how it follows the figure.
 *
 * Placement (`prop.position` / `prop.rotation`, Euler degrees XYZ):
 * - attach "none": world position and rotation.
 * - attach "hands": centred between the grip points along the hand-to-hand
 *   axis (local +x from the right hand to the left hand, local +y towards
 *   `cableFrom` or up); `position` is a world offset, `rotation` turns the prop
 *   in that frame.
 * - attach "leftHand" / "rightHand": at the grip point, turning with the hand;
 *   the handle runs along the hand's thumb axis (local +z); `rotation` turns
 *   the prop in the hand's frame.
 * - attach "feet" / "leftFoot" / "rightFoot": at the ball of the foot (or
 *   between both), keeping the world rotation `rotation`. Exception: the
 *   leg-extension / leg-curl roller rides on the shins — it is placed at the
 *   ankle joint (or between both) and `position` / `rotation` are in the
 *   frame of the (left) lower leg: +y up the shin towards the knee, +z out of
 *   the front of the shin, +x to the figure's left.
 *
 * `cableFrom` draws a cable machine: a pulley at that world point on a column,
 * and a cable from the pulley to the prop.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Prop, PropType } from '../schema/animation.ts';
import { eulerDegreesToQuaternion } from './animation.ts';
import { ARM_JOINTS, LEG_JOINTS, SIDES, type Rig, type Side } from './rig.ts';
import { ballPoint, emptyPoseContext, gripPoint, type PoseContext } from './pose.ts';

/** How the hands hold each prop type when it is attached to them. */
const HAND_GRIP: Record<PropType, 'bar' | 'handle'> = {
  barbell: 'bar',
  'ez-bar': 'bar',
  'lat-bar': 'bar',
  'cable-handle': 'bar',
  'pull-up-bar': 'bar',
  dumbbell: 'handle',
  kettlebell: 'handle',
  'rope-handle': 'handle',
  bench: 'handle',
  'incline-bench': 'handle',
  'dip-bars': 'handle',
  'leg-press': 'handle',
  'leg-extension': 'handle',
  'leg-curl': 'handle',
  mat: 'handle',
};

/** Leg press sled direction (model space): the plate moves up the 45° rails. */
export const LEG_PRESS_RAIL = new Vector3(0, Math.SQRT1_2, Math.SQRT1_2);

export interface PropMaterials {
  steel: MeshStandardMaterial;
  plate: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  pad: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  cable: MeshStandardMaterial;
  mat: MeshStandardMaterial;
}

function createMaterials(): PropMaterials {
  return {
    steel: new MeshStandardMaterial({ color: '#b4bac2', metalness: 0.9, roughness: 0.28 }),
    plate: new MeshStandardMaterial({ color: '#2a2e35', metalness: 0.35, roughness: 0.55 }),
    rubber: new MeshStandardMaterial({ color: '#1b1e22', metalness: 0, roughness: 0.8 }),
    pad: new MeshStandardMaterial({ color: '#262a31', metalness: 0, roughness: 0.62 }),
    frame: new MeshStandardMaterial({ color: '#59616b', metalness: 0.55, roughness: 0.4 }),
    cable: new MeshStandardMaterial({ color: '#15171a', metalness: 0.3, roughness: 0.5 }),
    mat: new MeshStandardMaterial({ color: '#33505a', metalness: 0, roughness: 0.9 }),
  };
}

// ── Shape helpers ────────────────────────────────────────────────────────────

class Builder {
  readonly root = new Group();
  readonly geometries: BufferGeometry[] = [];
  readonly materials: PropMaterials;

  constructor(materials: PropMaterials) {
    this.materials = materials;
  }

  add(geometry: BufferGeometry, material: Material, parent: Object3D = this.root): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Cylinder between two points. */
  rod(
    a: Vector3,
    b: Vector3,
    radius: number,
    material: Material,
    segments = 20,
    parent?: Object3D,
  ) {
    const length = a.distanceTo(b);
    const geometry = new CylinderGeometry(radius, radius, length, segments, 1);
    const mesh = this.add(geometry, material, parent);
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      new Vector3().subVectors(b, a).normalize(),
    );
    return mesh;
  }

  box(size: Vector3, position: Vector3, material: Material, parent?: Object3D) {
    const mesh = this.add(new BoxGeometry(size.x, size.y, size.z, 1, 1, 1), material, parent);
    mesh.position.copy(position);
    return mesh;
  }

  /** Upholstered pad: a box with rounded long edges. */
  pad(width: number, thickness: number, length: number, position: Vector3, parent?: Object3D) {
    const group = new Group();
    group.position.copy(position);
    (parent ?? this.root).add(group);
    const r = thickness / 2;
    this.box(
      new Vector3(width - 2 * r, thickness, length),
      new Vector3(),
      this.materials.pad,
      group,
    );
    for (const side of [-1, 1]) {
      const edge = this.add(new CylinderGeometry(r, r, length, 16), this.materials.pad, group);
      edge.rotation.x = Math.PI / 2;
      edge.position.set(side * (width / 2 - r), 0, 0);
    }
    return group;
  }
}

/** A weight plate around the x axis (lathe profile with rim and hub). */
function plateGeometry(radius: number, thickness: number): BufferGeometry {
  const h = thickness / 2;
  const rim = Math.min(0.03, radius * 0.16);
  const points = [
    new Vector2(0.027, -h * 0.7),
    new Vector2(0.05, -h),
    new Vector2(0.06, -h * 0.55),
    new Vector2(radius - rim, -h * 0.55),
    new Vector2(radius - rim * 0.5, -h),
    new Vector2(radius - 0.004, -h),
    new Vector2(radius, -h + 0.004),
    new Vector2(radius, h - 0.004),
    new Vector2(radius - 0.004, h),
    new Vector2(radius - rim * 0.5, h),
    new Vector2(radius - rim, h * 0.55),
    new Vector2(0.06, h * 0.55),
    new Vector2(0.05, h),
    new Vector2(0.027, h * 0.7),
  ];
  const geometry = new LatheGeometry(points, 48);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

// ── Prop models (local frames as documented in the module comment) ──────────

function barbell(b: Builder, length = 2.2, plates: number[] = [0.225, 0.225]): void {
  const { steel, plate } = b.materials;
  const half = length / 2;
  const sleeveStart = half - 0.43;
  b.rod(new Vector3(-sleeveStart, 0, 0), new Vector3(sleeveStart, 0, 0), 0.0145, steel);
  for (const s of [-1, 1]) {
    b.rod(new Vector3(s * sleeveStart, 0, 0), new Vector3(s * half, 0, 0), 0.025, steel);
    b.rod(
      new Vector3(s * (sleeveStart - 0.01), 0, 0),
      new Vector3(s * (sleeveStart + 0.02), 0, 0),
      0.034,
      steel,
    );
    let x = sleeveStart + 0.04;
    for (const radius of plates) {
      const thickness = radius > 0.2 ? 0.045 : 0.03;
      const mesh = b.add(plateGeometry(radius, thickness), plate);
      mesh.position.x = s * (x + thickness / 2);
      x += thickness + 0.004;
    }
    b.rod(new Vector3(s * x, 0, 0), new Vector3(s * (x + 0.025), 0, 0), 0.032, steel);
  }
}

function ezBar(b: Builder): void {
  const { steel, plate } = b.materials;
  // Cambered grip: zig-zag in the bar's horizontal plane.
  const points = [
    [-0.32, 0],
    [-0.26, 0.028],
    [-0.2, -0.012],
    [-0.12, 0.014],
    [-0.06, 0],
    [0.06, 0],
    [0.12, 0.014],
    [0.2, -0.012],
    [0.26, 0.028],
    [0.32, 0],
  ].map(([x = 0, z = 0]) => new Vector3(x, 0, z));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const c = points[i];
    if (a && c) b.rod(a, c, 0.0145, steel);
    if (c) b.add(new SphereGeometry(0.0145, 12, 8), steel).position.copy(c);
  }
  for (const s of [-1, 1]) {
    b.rod(new Vector3(s * 0.32, 0, 0), new Vector3(s * 0.62, 0, 0), 0.025, steel);
    const mesh = b.add(plateGeometry(0.16, 0.03), plate);
    mesh.position.x = s * 0.4;
  }
}

function dumbbell(b: Builder): void {
  const { steel, rubber } = b.materials;
  b.rod(new Vector3(0, 0, -0.075), new Vector3(0, 0, 0.075), 0.016, steel);
  for (const s of [-1, 1]) {
    const head = b.add(new CylinderGeometry(0.062, 0.062, 0.075, 6), rubber);
    head.rotation.x = Math.PI / 2;
    head.position.z = s * 0.112;
    b.rod(new Vector3(0, 0, s * 0.072), new Vector3(0, 0, s * 0.076), 0.03, steel);
  }
}

/** Kettlebell: the top of the handle arch is at the origin, running along z; the bell hangs below. */
function kettlebell(b: Builder): void {
  const { plate, steel } = b.materials;
  // An arch in the yz plane, its ends dipping into the top of the bell.
  const dip = MathUtils.degToRad(20);
  const handle = b.add(new TorusGeometry(0.065, 0.013, 12, 32, Math.PI + 2 * dip), steel);
  handle.rotation.set(0, Math.PI / 2, -dip);
  handle.position.y = -0.065;
  b.add(new SphereGeometry(0.1, 32, 20), plate).position.set(0, -0.16, 0);
}

function straightHandle(b: Builder, halfLength: number): void {
  const { steel } = b.materials;
  b.rod(new Vector3(-halfLength, 0, 0), new Vector3(halfLength, 0, 0), 0.014, steel);
  b.add(new TorusGeometry(0.02, 0.005, 8, 20), steel).position.set(0, 0.03, 0);
  b.rod(new Vector3(0, 0.0, 0), new Vector3(0, 0.012, 0), 0.008, steel);
}

function dHandle(b: Builder): void {
  const { steel, rubber } = b.materials;
  b.rod(new Vector3(0, 0, -0.06), new Vector3(0, 0, 0.06), 0.017, rubber);
  b.rod(new Vector3(0, 0, -0.07), new Vector3(0, 0.07, 0), 0.008, steel);
  b.rod(new Vector3(0, 0, 0.07), new Vector3(0, 0.07, 0), 0.008, steel);
  b.add(new TorusGeometry(0.016, 0.005, 8, 20), steel).position.set(0, 0.085, 0);
}

function latBar(b: Builder): void {
  const { steel, rubber } = b.materials;
  const inner = 0.36;
  const outer = new Vector3(0.6, -0.09, 0);
  b.rod(new Vector3(-inner, 0, 0), new Vector3(inner, 0, 0), 0.0145, steel);
  for (const s of [-1, 1]) {
    const start = new Vector3(s * inner, 0, 0);
    const end = new Vector3(s * outer.x, outer.y, 0);
    b.rod(start, end, 0.0175, rubber);
    b.add(new SphereGeometry(0.0145, 12, 8), steel).position.copy(start);
  }
  b.add(new TorusGeometry(0.02, 0.005, 8, 20), steel).position.set(0, 0.035, 0);
  b.rod(new Vector3(0, 0, 0), new Vector3(0, 0.015, 0), 0.008, steel);
}

function bench(b: Builder): void {
  const { frame, rubber } = b.materials;
  const top = 0.44;
  b.pad(0.28, 0.07, 1.2, new Vector3(0, top - 0.035, 0));
  b.box(new Vector3(0.08, 0.05, 1.05), new Vector3(0, top - 0.095, 0), frame);
  for (const z of [-0.5, 0.5]) {
    b.rod(new Vector3(0, top - 0.1, z), new Vector3(0, 0.04, z), 0.025, frame);
    b.box(new Vector3(0.5, 0.04, 0.07), new Vector3(0, 0.02, z), frame);
    for (const x of [-0.24, 0.24])
      b.box(new Vector3(0.05, 0.012, 0.08), new Vector3(x, 0.006, z), rubber);
  }
}

function inclineBench(b: Builder): void {
  const { frame, rubber } = b.materials;
  const seatTop = 0.45;
  b.pad(0.3, 0.07, 0.36, new Vector3(0, seatTop - 0.035, 0.06));
  // Back rest: hinged at the rear of the seat, rising towards −z at 35° from horizontal.
  const angle = MathUtils.degToRad(35);
  const back = new Group();
  back.position.set(0, seatTop - 0.01, -0.13);
  back.rotation.x = angle;
  b.root.add(back);
  b.pad(0.3, 0.07, 0.86, new Vector3(0, -0.035, -0.43), back);
  // Rear strut from the floor beam up to the underside of the back rest.
  const strutTop = back.localToWorld(new Vector3(0, -0.07, -0.55));
  b.rod(new Vector3(0, 0.03, strutTop.z), strutTop, 0.025, frame);
  b.rod(new Vector3(0, seatTop - 0.1, 0.1), new Vector3(0, 0.03, 0.3), 0.025, frame);
  b.box(new Vector3(0.08, 0.05, 1.1), new Vector3(0, 0.025, -0.25), frame);
  for (const z of [-0.75, 0.3]) {
    b.box(new Vector3(0.5, 0.04, 0.07), new Vector3(0, 0.02, z), frame);
    for (const x of [-0.24, 0.24])
      b.box(new Vector3(0.05, 0.012, 0.08), new Vector3(x, 0.006, z), rubber);
  }
}

function pullUpBar(b: Builder, floorY: number): void {
  const { steel, frame } = b.materials;
  b.rod(new Vector3(-0.65, 0, 0), new Vector3(0.65, 0, 0), 0.016, steel);
  for (const s of [-1, 1]) {
    b.rod(new Vector3(s * 0.65, 0.05, 0), new Vector3(s * 0.65, floorY, 0), 0.035, frame);
    b.box(new Vector3(0.12, 0.12, 0.12), new Vector3(s * 0.65, 0.02, 0), frame);
    b.box(new Vector3(0.1, 0.03, 0.7), new Vector3(s * 0.65, floorY + 0.015, 0), frame);
  }
}

function dipBars(b: Builder, floorY: number): void {
  const { steel, frame } = b.materials;
  for (const s of [-1, 1]) {
    b.rod(new Vector3(s * 0.27, 0, -0.3), new Vector3(s * 0.27, 0, 0.3), 0.02, steel);
    for (const z of [-0.25, 0.25]) {
      b.rod(new Vector3(s * 0.27, -0.02, z), new Vector3(s * 0.3, floorY, z), 0.03, frame);
    }
    b.box(new Vector3(0.12, 0.03, 0.75), new Vector3(s * 0.3, floorY + 0.015, 0), frame);
  }
}

/**
 * Leg press frame. Origin: the pelvis joint of a figure seated in it with the
 * pelvis rotated −38° about x (reclined, facing +z). Seat, back pad, handles
 * beside the seat (grip points at (±0.29, −0.08, 0.06)) and 45° rails that
 * pass under a sled whose foot plate runs through (0, 0.39, 0.45) along
 * `LEG_PRESS_RAIL`.
 */
export const LEG_PRESS_HANDLES = [
  [new Vector3(0.29, -0.08, -0.05), new Vector3(0.29, -0.08, 0.17)],
  [new Vector3(-0.29, -0.08, -0.05), new Vector3(-0.29, -0.08, 0.17)],
] as const;

function legPressFrame(b: Builder, floorY: number): void {
  const { frame, steel, rubber } = b.materials;
  const seat = new Group();
  seat.position.set(0, -0.169, 0.049);
  seat.rotation.x = MathUtils.degToRad(-14);
  b.root.add(seat);
  b.pad(0.42, 0.07, 0.38, new Vector3(), seat);
  const back = new Group();
  back.position.set(0, 0.21, -0.349);
  back.rotation.x = MathUtils.degToRad(52);
  b.root.add(back);
  b.pad(0.44, 0.08, 0.8, new Vector3(), back);
  // Seat and back supports, base beam.
  b.rod(new Vector3(0, -0.21, 0.05), new Vector3(0, floorY, 0.05), 0.04, frame);
  b.rod(new Vector3(0, 0.05, -0.62), new Vector3(0, floorY, -0.72), 0.035, frame);
  b.box(new Vector3(0.14, 0.05, 2.9), new Vector3(0, floorY + 0.025, 0.55), frame);
  for (const [start, end] of LEG_PRESS_HANDLES) {
    b.rod(start, end, 0.017, rubber);
    b.rod(
      new Vector3(start.x, start.y, start.z + 0.02),
      new Vector3(start.x * 0.75, start.y - 0.09, start.z + 0.02),
      0.013,
      steel,
    );
  }
  // Rails under the sled path.
  const railStart = new Vector3(0, -0.104, 0.346);
  const railEnd = railStart.clone().addScaledVector(LEG_PRESS_RAIL, 1.6);
  for (const s of [-1, 1]) {
    const a = railStart.clone().setX(s * 0.24);
    const c = railEnd.clone().setX(s * 0.24);
    b.rod(a, c, 0.028, steel);
    b.rod(c, new Vector3(c.x, floorY, c.z), 0.04, frame);
    b.rod(
      a.clone().addScaledVector(LEG_PRESS_RAIL, 0.1),
      new Vector3(a.x, floorY, a.z + 0.07),
      0.04,
      frame,
    );
  }
  b.rod(railEnd.clone().setX(-0.28), railEnd.clone().setX(0.28), 0.03, frame);
}

/** Leg press sled: foot plate (front face at the origin, facing −rail) and weight horns. */
function legPressSled(b: Builder): void {
  const { frame, steel, plate } = b.materials;
  const sled = new Group();
  // Local frame of the plate: +z along the rail (into the plate), +y up along the plate.
  sled.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), LEG_PRESS_RAIL);
  b.root.add(sled);
  b.box(new Vector3(0.7, 0.55, 0.035), new Vector3(0, 0.03, 0.0175), b.materials.rubber, sled);
  b.box(new Vector3(0.72, 0.57, 0.02), new Vector3(0, 0.03, 0.045), frame, sled);
  b.box(new Vector3(0.62, 0.09, 0.32), new Vector3(0, -0.21, 0.2), frame, sled);
  for (const s of [-1, 1]) {
    b.box(new Vector3(0.04, 0.5, 0.3), new Vector3(s * 0.33, 0.0, 0.2), frame, sled);
    const horn = b.rod(
      new Vector3(s * 0.35, -0.12, 0.22),
      new Vector3(s * 0.62, -0.12, 0.22),
      0.025,
      steel,
      20,
      sled,
    );
    horn.castShadow = true;
    for (const [i, radius] of [0.225, 0.225].entries()) {
      const mesh = b.add(plateGeometry(radius, 0.045), plate, sled);
      mesh.position.set(s * (0.42 + i * 0.05), -0.12, 0.22);
    }
  }
}

/** Leg extension handles beside the seat (model space; grasp lines for the hands). */
export const LEG_EXTENSION_HANDLES = [
  [new Vector3(0.22, -0.05, -0.25), new Vector3(0.22, -0.05, 0.25)],
  [new Vector3(-0.22, -0.05, -0.25), new Vector3(-0.22, -0.05, 0.25)],
] as const;

function legExtensionFrame(b: Builder, floorY: number): void {
  const { frame } = b.materials;
  b.pad(0.36, 0.07, 0.42, new Vector3(0, -0.05, -0.1));
  const back = new Group();
  back.position.set(0, -0.02, -0.3);
  back.rotation.x = MathUtils.degToRad(-12);
  b.root.add(back);
  b.pad(0.38, 0.07, 0.6, new Vector3(0, 0.3, 0), back).rotation.x = Math.PI / 2;
  b.rod(new Vector3(0, -0.1, -0.1), new Vector3(0, floorY, -0.1), 0.04, frame);
  b.box(new Vector3(0.5, 0.05, 0.9), new Vector3(0, floorY + 0.025, -0.05), frame);
  for (const [start, end] of LEG_EXTENSION_HANDLES) b.rod(start, end, 0.018, frame);
}

/** Shin pad roller (rides on the shins) — a horizontal roller along x. */
function roller(b: Builder): void {
  const pad = b.add(new CylinderGeometry(0.055, 0.055, 0.34, 24), b.materials.pad);
  pad.rotation.z = Math.PI / 2;
}

/** Leg curl handles at the head end of the bench (model space; grasp lines for the hands). */
export const LEG_CURL_HANDLES = [
  [new Vector3(0.24, -0.1, 0.55), new Vector3(0.24, -0.1, 0.75)],
  [new Vector3(-0.24, -0.1, 0.55), new Vector3(-0.24, -0.1, 0.75)],
] as const;

function legCurlFrame(b: Builder, floorY: number): void {
  const { frame } = b.materials;
  // Prone bench along z (head towards +z), top at the origin.
  b.pad(0.34, 0.07, 1.25, new Vector3(0, -0.035, 0.15));
  b.rod(new Vector3(0, -0.07, 0.6), new Vector3(0, floorY, 0.6), 0.04, frame);
  b.rod(new Vector3(0, -0.07, -0.35), new Vector3(0, floorY, -0.35), 0.04, frame);
  b.box(new Vector3(0.5, 0.05, 1.3), new Vector3(0, floorY + 0.025, 0.15), frame);
  for (const [start, end] of LEG_CURL_HANDLES) b.rod(start, end, 0.018, frame);
}

function mat(b: Builder): void {
  const mesh = b.box(new Vector3(0.62, 0.012, 1.85), new Vector3(0, 0.006, 0), b.materials.mat);
  mesh.castShadow = false;
}

// ── Cable machine ────────────────────────────────────────────────────────────

/** A column, a pulley at `pulley` (world) and the cable; the cable end is updated per frame. */
class CableMachine {
  readonly group = new Group();
  readonly pulley: Vector3;
  private readonly cable: Mesh;

  constructor(b: Builder, pulley: Vector3, figureCentre: Vector3) {
    this.pulley = pulley;
    const { frame, steel } = b.materials;
    // Column out of the figure's way, behind the pulley.
    const away = new Vector3(pulley.x - figureCentre.x, 0, pulley.z - figureCentre.z);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    const distance = Math.max(away.length() + 0.25, 0.85);
    away.normalize();
    const column = new Vector3(figureCentre.x, 0, figureCentre.z).addScaledVector(away, distance);
    const top = Math.max(pulley.y + 0.12, 0.5);
    b.rod(
      new Vector3(column.x, 0, column.z),
      new Vector3(column.x, top, column.z),
      0.045,
      frame,
      20,
      this.group,
    );
    b.box(new Vector3(0.5, 0.04, 0.5), new Vector3(column.x, 0.02, column.z), frame, this.group);
    const beamEnd = new Vector3(pulley.x, top, pulley.z);
    if (beamEnd.distanceTo(new Vector3(column.x, top, column.z)) > 0.05) {
      b.rod(new Vector3(column.x, top, column.z), beamEnd, 0.035, frame, 16, this.group);
      b.rod(beamEnd, new Vector3(pulley.x, pulley.y + 0.03, pulley.z), 0.02, frame, 12, this.group);
    } else if (pulley.y < top - 0.05) {
      b.rod(
        new Vector3(column.x, pulley.y, column.z),
        new Vector3(pulley.x, pulley.y, pulley.z),
        0.02,
        frame,
        12,
        this.group,
      );
    }
    const wheel = b.add(new CylinderGeometry(0.045, 0.045, 0.024, 28), steel, this.group);
    wheel.position.copy(pulley);
    wheel.rotation.z = Math.PI / 2;
    this.cable = b.add(new CylinderGeometry(0.0035, 0.0035, 1, 8), b.materials.cable, this.group);
    this.cable.castShadow = false;
  }

  /** Draws the cable from the pulley to `end` (world). */
  update(end: Vector3): void {
    const length = this.pulley.distanceTo(end);
    this.cable.position.addVectors(this.pulley, end).multiplyScalar(0.5);
    this.cable.scale.set(1, Math.max(length, 1e-4), 1);
    this.cable.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      new Vector3().subVectors(end, this.pulley).normalize(),
    );
  }
}

// ── Controller ───────────────────────────────────────────────────────────────

interface PlacedProp {
  prop: Prop;
  object: Object3D;
  offset: Quaternion;
  /** Local point the cable attaches to. */
  cableAnchor: Vector3;
  cable: CableMachine | null;
  /** Rope handle: rebuilt ends each frame. */
  rope: { left: Mesh; right: Mesh } | null;
}

export interface PropsController {
  /** Add this to the scene. */
  group: Group;
  /** What the props tell the pose solver. */
  poseContext: PoseContext;
  /** Moves attached props to the posed figure. */
  update(rig: Rig): void;
  dispose(): void;
}

function buildModel(
  b: Builder,
  prop: Prop,
  floorY: number,
  rope: { left: Mesh; right: Mesh } | null,
): Vector3 {
  const twoHands = prop.attach === 'hands';
  switch (prop.type) {
    case 'barbell':
      barbell(b);
      return new Vector3();
    case 'ez-bar':
      ezBar(b);
      return new Vector3();
    case 'dumbbell':
      dumbbell(b);
      return new Vector3();
    case 'kettlebell':
      kettlebell(b);
      return new Vector3();
    case 'cable-handle':
      if (twoHands) straightHandle(b, 0.3);
      else dHandle(b);
      return new Vector3(0, twoHands ? 0.03 : 0.085, 0);
    case 'rope-handle':
      if (!rope) b.add(new SphereGeometry(0.02, 12, 8), b.materials.steel);
      return new Vector3(0, 0.02, 0);
    case 'lat-bar':
      latBar(b);
      return new Vector3(0, 0.035, 0);
    case 'pull-up-bar':
      pullUpBar(b, floorY);
      return new Vector3();
    case 'dip-bars':
      dipBars(b, floorY);
      return new Vector3();
    case 'bench':
      bench(b);
      return new Vector3();
    case 'incline-bench':
      inclineBench(b);
      return new Vector3();
    case 'leg-press':
      if (prop.attach === 'none') legPressFrame(b, floorY);
      else legPressSled(b);
      return new Vector3();
    case 'leg-extension':
    case 'leg-curl':
      if (prop.attach === 'none') {
        if (prop.type === 'leg-extension') legExtensionFrame(b, floorY);
        else legCurlFrame(b, floorY);
      } else roller(b);
      return new Vector3();
    case 'mat':
      mat(b);
      return new Vector3();
  }
}

/** Handles of machine frames (attach "none") that free hands grab. */
const MACHINE_HANDLES: Partial<Record<PropType, readonly (readonly [Vector3, Vector3])[]>> = {
  'leg-press': LEG_PRESS_HANDLES,
  'leg-extension': LEG_EXTENSION_HANDLES,
  'leg-curl': LEG_CURL_HANDLES,
};

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

/** Builds the props of an animation. */
export function createProps(props: readonly Prop[], figureCentre = new Vector3()): PropsController {
  const materials = createMaterials();
  const builder = new Builder(materials);
  const group = builder.root;
  group.name = 'props';
  const placed: PlacedProp[] = [];
  const poseContext = emptyPoseContext();

  for (const prop of props) {
    const local = new Builder(materials);
    const position = new Vector3(...(prop.position ?? [0, 0, 0]));
    const floorY = prop.attach === 'none' ? -position.y : 0;
    let rope: PlacedProp['rope'] = null;
    if (prop.type === 'rope-handle' && prop.attach === 'hands') {
      rope = {
        left: local.add(new CylinderGeometry(0.013, 0.013, 1, 12), materials.cable),
        right: local.add(new CylinderGeometry(0.013, 0.013, 1, 12), materials.cable),
      };
    }
    const cableAnchor = buildModel(local, prop, floorY, rope);
    builder.geometries.push(...local.geometries);
    const object = local.root;
    object.name = `prop:${prop.type}`;
    let cable: CableMachine | null = null;
    if (prop.cableFrom) {
      cable = new CableMachine(builder, new Vector3(...prop.cableFrom), figureCentre);
      group.add(cable.group);
    }
    if (prop.attach === 'none') {
      object.position.copy(position);
      eulerDegreesToQuaternion(prop.rotation, object.quaternion);
    }
    if (rope) {
      // Rope ends live in world space.
      group.add(rope.left, rope.right);
    }
    group.add(object);
    placed.push({
      prop,
      object,
      offset: eulerDegreesToQuaternion(prop.rotation),
      cableAnchor,
      cable,
      rope,
    });

    // Pose context.
    if (prop.attach === 'hands') {
      for (const side of SIDES) poseContext.hands[side] = HAND_GRIP[prop.type];
    } else if (prop.attach === 'leftHand' || prop.attach === 'rightHand') {
      poseContext.hands[prop.attach === 'leftHand' ? 'left' : 'right'] = 'handle';
    } else if (prop.attach === 'none') {
      const q = eulerDegreesToQuaternion(prop.rotation);
      const line = (a: Vector3, c: Vector3) => ({
        start: a.applyQuaternion(q).add(position),
        end: c.applyQuaternion(q).add(position),
      });
      if (prop.type === 'pull-up-bar')
        poseContext.graspLines.push(line(new Vector3(-0.6, 0, 0), new Vector3(0.6, 0, 0)));
      for (const [start, end] of MACHINE_HANDLES[prop.type] ?? [])
        poseContext.graspLines.push(line(start.clone(), end.clone()));
      if (prop.type === 'dip-bars') {
        for (const s of [-1, 1]) {
          poseContext.graspLines.push(
            line(new Vector3(s * 0.27, 0, -0.3), new Vector3(s * 0.27, 0, 0.3)),
          );
        }
      }
    }
    if (
      prop.type === 'leg-press' &&
      (prop.attach === 'feet' || prop.attach === 'leftFoot' || prop.attach === 'rightFoot')
    ) {
      const normal = LEG_PRESS_RAIL.clone()
        .negate()
        .applyQuaternion(eulerDegreesToQuaternion(prop.rotation));
      if (prop.attach !== 'rightFoot') poseContext.footPlates.left = normal.clone();
      if (prop.attach !== 'leftFoot') poseContext.footPlates.right = normal.clone();
    }
  }

  return {
    group,
    poseContext,
    update(rig) {
      rig.root.updateMatrixWorld(true);
      for (const item of placed) {
        const { prop, object } = item;
        const offset = new Vector3(...(prop.position ?? [0, 0, 0]));
        switch (prop.attach) {
          case 'none':
            break;
          case 'hands': {
            const left = gripPoint(rig, 'left', _a);
            const right = gripPoint(rig, 'right', _b);
            _x.subVectors(left, right);
            if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
            _x.normalize();
            object.position.addVectors(left, right).multiplyScalar(0.5).add(offset);
            if (prop.cableFrom) _y.set(...prop.cableFrom).sub(object.position);
            else _y.set(0, 1, 0);
            _y.addScaledVector(_x, -_y.dot(_x));
            if (_y.lengthSq() < 1e-8) _y.set(0, 0, 1).addScaledVector(_x, -_x.z);
            _y.normalize();
            _z.crossVectors(_x, _y);
            object.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
            object.quaternion.multiply(item.offset);
            if (item.rope) {
              const anchor = _c
                .copy(item.cableAnchor)
                .applyQuaternion(object.quaternion)
                .add(object.position);
              placeRod(item.rope.left, anchor, left);
              placeRod(item.rope.right, anchor, right);
            }
            break;
          }
          case 'leftHand':
          case 'rightHand': {
            const side: Side = prop.attach === 'leftHand' ? 'left' : 'right';
            gripPoint(rig, side, object.position).add(offset);
            rig.joints[ARM_JOINTS[side].end].getWorldQuaternion(_q);
            object.quaternion.copy(_q).multiply(item.offset);
            break;
          }
          case 'feet':
          case 'leftFoot':
          case 'rightFoot': {
            if (prop.type === 'leg-extension' || prop.type === 'leg-curl') {
              // The roller turns with the shin it rests on.
              const side: Side = prop.attach === 'rightFoot' ? 'right' : 'left';
              rig.joints[LEG_JOINTS[side].end].getWorldPosition(object.position);
              if (prop.attach === 'feet') {
                rig.joints[LEG_JOINTS.right.end].getWorldPosition(_a);
                object.position.add(_a).multiplyScalar(0.5);
              }
              rig.joints[LEG_JOINTS[side].mid].getWorldQuaternion(_q);
              object.position.add(offset.applyQuaternion(_q));
              object.quaternion.copy(_q).multiply(item.offset);
              break;
            }
            if (prop.attach === 'feet') {
              ballPoint(rig, 'left', _a);
              ballPoint(rig, 'right', _b);
              object.position.addVectors(_a, _b).multiplyScalar(0.5);
            } else {
              ballPoint(rig, prop.attach === 'leftFoot' ? 'left' : 'right', object.position);
            }
            object.position.add(offset);
            object.quaternion.copy(item.offset);
            break;
          }
        }
        if (item.cable) {
          item.cable.update(
            _c.copy(item.cableAnchor).applyQuaternion(object.quaternion).add(object.position),
          );
        }
      }
    },
    dispose() {
      for (const geometry of builder.geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

function placeRod(mesh: Mesh, a: Vector3, b: Vector3): void {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(1, Math.max(a.distanceTo(b), 1e-4), 1);
  mesh.quaternion.setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3().subVectors(b, a).normalize(),
  );
}
