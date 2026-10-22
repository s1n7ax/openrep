/**
 * Smooth body surfaces: a surface is sampled on a grid of rings (along u) ×
 * points around each ring (angle θ), then turned into a mesh. Muscle overlays
 * reuse the same grid, lifted slightly off the skin, keeping only the cells a
 * muscle covers.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** Fills `out` with the surface point at (u, θ); θ in radians, 0 = front. */
export type SurfaceFunction = (u: number, theta: number, out: Vector3) => void;

export interface SurfaceGrid {
  rows: number;
  cols: number;
  /** Ring parameters (one per row). */
  u: Float32Array;
  /** Angles around the ring (one per column), radians. */
  theta: Float32Array;
  positions: Float32Array;
  normals: Float32Array;
  /** Triangle winding: true when (r,c) → (r+1,c) → (r,c+1) faces outwards. */
  forward: boolean;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 1 inside [low, high], falling smoothly to 0 over `soft` outside it. */
export function band(x: number, low: number, high: number, soft: number): number {
  return smoothstep(low - soft, low, x) * (1 - smoothstep(high, high + soft, x));
}

/** Signed angle difference a − b in degrees, wrapped to (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) of several channels over a
 * key (first column). No overshoot, so radii never dip below their keys.
 */
export class Profile {
  private readonly keys: number[];
  private readonly values: number[][];
  private readonly slopes: number[][];

  constructor(unsorted: readonly (readonly number[])[]) {
    const rows = [...unsorted].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    this.keys = rows.map((row) => row[0] ?? 0);
    const channels = (rows[0]?.length ?? 1) - 1;
    this.values = Array.from({ length: channels }, (_, c) => rows.map((row) => row[c + 1] ?? 0));
    this.slopes = this.values.map((ys) => monotoneSlopes(this.keys, ys));
  }

  /** Interpolated channel values at `x` (clamped to the key range). */
  at(x: number, out: number[] = []): number[] {
    const keys = this.keys;
    const last = keys.length - 1;
    let i = 0;
    while (i < last - 1 && x > (keys[i + 1] ?? 0)) i++;
    const x0 = keys[i] ?? 0;
    const x1 = keys[Math.min(i + 1, last)] ?? x0;
    const h = x1 - x0;
    const t = h > 0 ? clamp01((x - x0) / h) : 0;
    const t2 = t * t;
    const t3 = t2 * t;
    for (let c = 0; c < this.values.length; c++) {
      const ys = this.values[c] ?? [];
      const ms = this.slopes[c] ?? [];
      const y0 = ys[i] ?? 0;
      const y1 = ys[Math.min(i + 1, last)] ?? y0;
      const m0 = ms[i] ?? 0;
      const m1 = ms[Math.min(i + 1, last)] ?? 0;
      out[c] =
        (2 * t3 - 3 * t2 + 1) * y0 +
        (t3 - 2 * t2 + t) * h * m0 +
        (-2 * t3 + 3 * t2) * y1 +
        (t3 - t2) * h * m1;
    }
    return out;
  }
}

function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const deltas: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] ?? 0) - (xs[i] ?? 0);
    deltas.push(dx > 0 ? ((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / dx : 0);
  }
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) slopes.push(deltas[0] ?? 0);
    else if (i === n - 1) slopes.push(deltas[n - 2] ?? 0);
    else {
      const a = deltas[i - 1] ?? 0;
      const b = deltas[i] ?? 0;
      slopes.push(a * b <= 0 ? 0 : (a + b) / 2);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const d = deltas[i] ?? 0;
    if (d === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = (slopes[i] ?? 0) / d;
    const b = (slopes[i + 1] ?? 0) / d;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      slopes[i] = tau * a * d;
      slopes[i + 1] = tau * b * d;
    }
  }
  return slopes;
}

/** Evenly spaced values from `start` to `end` (inclusive). */
export function range(start: number, end: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + ((end - start) * i) / (count - 1));
}

const _p = new Vector3();

/** Samples a surface. Columns wrap around; set `mirrorX` for the right side of the body. */
export function sampleSurface(
  fn: SurfaceFunction,
  uValues: readonly number[],
  cols: number,
  mirrorX = false,
): SurfaceGrid {
  const rows = uValues.length;
  const positions = new Float32Array(rows * cols * 3);
  const theta = new Float32Array(cols);
  for (let c = 0; c < cols; c++) theta[c] = (c / cols) * Math.PI * 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fn(uValues[r] ?? 0, theta[c] ?? 0, _p);
      const i = (r * cols + c) * 3;
      positions[i] = mirrorX ? -_p.x : _p.x;
      positions[i + 1] = _p.y;
      positions[i + 2] = _p.z;
    }
  }
  const grid: SurfaceGrid = {
    rows,
    cols,
    u: Float32Array.from(uValues),
    theta,
    positions,
    normals: new Float32Array(rows * cols * 3),
    forward: true,
  };
  computeGridNormals(grid);
  return grid;
}

function read(array: Float32Array, index: number, out: Vector3): Vector3 {
  return out.set(array[index * 3] ?? 0, array[index * 3 + 1] ?? 0, array[index * 3 + 2] ?? 0);
}

const _du = new Vector3();
const _dv = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _centre = new Vector3();

function ringCentre(grid: SurfaceGrid, row: number, out: Vector3): Vector3 {
  out.set(0, 0, 0);
  for (let c = 0; c < grid.cols; c++) out.add(read(grid.positions, row * grid.cols + c, _a));
  return out.divideScalar(grid.cols);
}

function ringSize(grid: SurfaceGrid, row: number): number {
  ringCentre(grid, row, _centre);
  let size = 0;
  for (let c = 0; c < grid.cols; c++) {
    size = Math.max(size, read(grid.positions, row * grid.cols + c, _a).distanceTo(_centre));
  }
  return size;
}

/** Smooth normals from the grid, pointing away from each ring's centre. */
export function computeGridNormals(grid: SurfaceGrid): void {
  const { rows, cols, positions, normals } = grid;
  let orientation = 0;
  for (let r = 0; r < rows; r++) {
    const degenerate = ringSize(grid, r) < 1e-6;
    ringCentre(grid, r, _centre);
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      if (degenerate) {
        // Pole: point away from the neighbouring ring.
        const neighbour = r === 0 ? 1 : r - 1;
        ringCentre(grid, Math.min(Math.max(neighbour, 0), rows - 1), _b);
        _n.subVectors(read(positions, index, _a), _b);
      } else {
        const up = Math.min(r + 1, rows - 1);
        const down = Math.max(r - 1, 0);
        read(positions, up * cols + c, _a);
        read(positions, down * cols + c, _b);
        _du.subVectors(_a, _b);
        read(positions, r * cols + ((c + 1) % cols), _a);
        read(positions, r * cols + ((c - 1 + cols) % cols), _b);
        _dv.subVectors(_a, _b);
        _n.crossVectors(_du, _dv);
        const outward = read(positions, index, _a).sub(_centre).dot(_n);
        orientation += outward;
        if (outward < 0) _n.negate();
      }
      _n.normalize();
      normals[index * 3] = _n.x;
      normals[index * 3 + 1] = _n.y;
      normals[index * 3 + 2] = _n.z;
    }
  }
  // du × dv points outwards when (r,c) → (r+1,c) → (r,c+1) is counter-clockwise from outside.
  grid.forward = orientation >= 0;
}

/**
 * Samples `amount(row, col)` over a grid and smooths it with a small binomial
 * blur (wrapping around each ring) so region edges never step between
 * neighbouring vertices.
 */
export function smoothField(
  grid: SurfaceGrid,
  amount: (row: number, col: number) => number,
  passes = 2,
): Float32Array {
  const { rows, cols } = grid;
  let field = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) field[r * cols + c] = amount(r, c);
  const kernel = [1, 4, 6, 4, 1].map((k) => k / 16);
  for (let pass = 0; pass < passes; pass++) {
    const around = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++)
          sum += (kernel[k + 2] ?? 0) * (field[r * cols + ((c + k + cols) % cols)] ?? 0);
        around[r * cols + c] = sum;
      }
    }
    const along = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          const rr = Math.min(rows - 1, Math.max(0, r + k));
          sum += (kernel[k + 2] ?? 0) * (around[rr * cols + c] ?? 0);
        }
        along[r * cols + c] = sum;
      }
    }
    field = along;
  }
  return field;
}

/** Moves every grid point along its normal by `amount(row, col)` and recomputes normals. */
export function displaceGrid(
  grid: SurfaceGrid,
  amount: (row: number, col: number) => number,
): void {
  const { rows, cols, positions, normals } = grid;
  for (let r = 0; r < rows; r++) {
    // A collapsed ring (the tip of a closed end) must move as one point.
    let shared: number | null = null;
    if (ringSize(grid, r) < 1e-6) {
      shared = 0;
      for (let c = 0; c < cols; c++) shared += amount(r, c) / cols;
    }
    for (let c = 0; c < cols; c++) {
      const d = shared ?? amount(r, c);
      if (d === 0) continue;
      const i = (r * cols + c) * 3;
      positions[i] = (positions[i] ?? 0) + (normals[i] ?? 0) * d;
      positions[i + 1] = (positions[i + 1] ?? 0) + (normals[i + 1] ?? 0) * d;
      positions[i + 2] = (positions[i + 2] ?? 0) + (normals[i + 2] ?? 0) * d;
    }
  }
  computeGridNormals(grid);
}

export interface GridGeometryOptions {
  /** Lift every point along its normal by this distance (overlays). */
  offset?: number;
  /** Per-vertex coverage in [0, 1]; cells where all corners are 0 are dropped. */
  mask?: Float32Array;
  /** Extra per-vertex attributes to carry over (e.g. skin weights), by name. */
  attributes?: Record<string, { array: Float32Array | Uint16Array; itemSize: number }>;
}

/** Builds an indexed mesh from a grid, optionally only where `mask` > 0. */
export function gridGeometry(grid: SurfaceGrid, options: GridGeometryOptions = {}): BufferGeometry {
  const { rows, cols, positions, normals } = grid;
  const { offset = 0, mask, attributes = {} } = options;
  const covered = (index: number) => mask === undefined || (mask[index] ?? 0) > 1e-3;

  const indices: number[] = [];
  const used = new Int32Array(rows * cols).fill(-1);
  let count = 0;
  const use = (index: number) => {
    if (used[index] === -1) used[index] = count++;
    return used[index] ?? 0;
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * cols + c;
      const b = (r + 1) * cols + c;
      const d = r * cols + ((c + 1) % cols);
      const e = (r + 1) * cols + ((c + 1) % cols);
      if (!(covered(a) || covered(b) || covered(d) || covered(e))) continue;
      const [ia, ib, id, ie] = [use(a), use(b), use(d), use(e)];
      if (grid.forward) indices.push(ia, ib, id, id, ib, ie);
      else indices.push(ia, id, ib, id, ie, ib);
    }
  }

  const outPositions = new Float32Array(count * 3);
  const outNormals = new Float32Array(count * 3);
  const outAlpha = mask ? new Float32Array(count * 4) : null;
  const extra = Object.fromEntries(
    Object.entries(attributes).map(([name, { array, itemSize }]) => [
      name,
      {
        source: array,
        itemSize,
        target: new (array.constructor as typeof Float32Array)(count * itemSize),
      },
    ]),
  );
  for (let index = 0; index < used.length; index++) {
    const v = used[index] ?? -1;
    if (v < 0) continue;
    for (let k = 0; k < 3; k++) {
      const n = normals[index * 3 + k] ?? 0;
      outPositions[v * 3 + k] = (positions[index * 3 + k] ?? 0) + n * offset;
      outNormals[v * 3 + k] = n;
    }
    if (outAlpha && mask) {
      outAlpha.set([1, 1, 1, mask[index] ?? 0], v * 4);
    }
    for (const { source, itemSize, target } of Object.values(extra)) {
      for (let k = 0; k < itemSize; k++)
        target[v * itemSize + k] = source[index * itemSize + k] ?? 0;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(outPositions, 3));
  geometry.setAttribute('normal', new BufferAttribute(outNormals, 3));
  if (outAlpha) geometry.setAttribute('color', new BufferAttribute(outAlpha, 4));
  for (const [name, { itemSize, target }] of Object.entries(extra)) {
    geometry.setAttribute(name, new BufferAttribute(target, itemSize));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
