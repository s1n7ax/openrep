/**
 * A statue-like head: the face's features (eyes, nose, mouth) and the ears
 * are taken away while the head keeps its shape — skull, jaw and chin.
 *
 * 1. The head's surface is fitted as a smooth function of direction from the
 *    skull's centre (low-degree spherical harmonics), which has no room for
 *    narrow features like the nose, lips, brows or ears.
 * 2. Where the mesh pokes out of that surface (nose, ears, lips) or is tucked
 *    in (mouth and eye sockets, behind the ears), its faces are removed and
 *    each hole is closed with a fan of triangles.
 * 3. Every head vertex moves onto the smooth surface (blending into the
 *    unchanged neck), and a few surface-bound relaxation passes even out the
 *    new triangles.
 */
import { MathUtils } from 'three';
import { FigureBuildError } from './errors.ts';
import { compactVertices, vertexNeighbours, type PolyMesh } from './mesh.ts';

/** Spherical harmonic degree of the head surface (features narrower than ~180°/L vanish). */
const DEGREE = 9;
/** Regularisation of the fit (larger keeps the surface smoother). */
const RIDGE = 2e-6;
/** Vertices further inside the smooth surface than this (metres) are rebuilt (sockets). */
const TUCKED_DEPTH = 0.003;
/** Vertices further outside than this are rebuilt (ears, nose); nearer ones are just moved. */
const PROTRUDING_HEIGHT = 0.007;
/** Distances from the surface (metres) of the samples kept by each refit. */
const FIT_TOLERANCES = [0.012, 0.006, 0.004, 0.003];
/** Surface-bound relaxation passes. */
const RELAXATION = 120;

type Vec = [number, number, number];

/** Real spherical harmonics up to `DEGREE` at a unit direction (y up). */
function harmonics(d: Vec, out: Float64Array): Float64Array {
  const x = Math.max(-1, Math.min(1, d[1]));
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  const phi = Math.atan2(d[0], d[2]);
  let index = 0;
  for (let l = 0; l <= DEGREE; l++) {
    for (let m = -l; m <= l; m++) {
      const am = Math.abs(m);
      // Associated Legendre P_l^am(x) by recurrence.
      let pmm = 1;
      for (let i = 1; i <= am; i++) pmm *= -(2 * i - 1) * s;
      let p = pmm;
      if (l > am) {
        let pm1 = x * (2 * am + 1) * pmm;
        let pm2 = pmm;
        p = pm1;
        for (let ll = am + 2; ll <= l; ll++) {
          const next = ((2 * ll - 1) * x * pm1 - (ll + am - 1) * pm2) / (ll - am);
          pm2 = pm1;
          pm1 = next;
          p = next;
        }
      }
      let factorial = 1;
      for (let i = l - am + 1; i <= l + am; i++) factorial *= i;
      const k = Math.sqrt((2 * l + 1) / (4 * Math.PI) / factorial) * (m === 0 ? 1 : Math.SQRT2);
      out[index++] = k * p * (m > 0 ? Math.cos(m * phi) : m < 0 ? Math.sin(am * phi) : 1);
    }
  }
  return out;
}

const COEFFICIENTS = (DEGREE + 1) * (DEGREE + 1);

/**
 * Solves `a x = b` (n × n, row-major) by Gaussian elimination with pivoting.
 *
 * @throws {FigureBuildError} when the system is singular.
 */
function solve(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const m = Float64Array.from(a);
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r * n + i] ?? 0) > Math.abs(m[pivot * n + i] ?? 0)) pivot = r;
    }
    if (pivot !== i) {
      for (let c = 0; c < n; c++) {
        const t = m[i * n + c] ?? 0;
        m[i * n + c] = m[pivot * n + c] ?? 0;
        m[pivot * n + c] = t;
      }
      const t = x[i] ?? 0;
      x[i] = x[pivot] ?? 0;
      x[pivot] = t;
    }
    const d = m[i * n + i] ?? 0;
    if (Math.abs(d) < 1e-14) throw new FigureBuildError('The head surface fit is singular');
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = (m[r * n + i] ?? 0) / d;
      if (f === 0) continue;
      for (let c = i; c < n; c++) m[r * n + c] = (m[r * n + c] ?? 0) - f * (m[i * n + c] ?? 0);
      x[r] = (x[r] ?? 0) - f * (x[i] ?? 0);
    }
  }
  for (let i = 0; i < n; i++) x[i] = (x[i] ?? 0) / (m[i * n + i] ?? 1);
  return x;
}

/** Least-squares sphere through points: its centre. */
function sphereCentre(points: Vec[]): Vec {
  // |p|² = 2 c·p + k is linear in (c, k).
  const a = new Float64Array(16);
  const b = new Float64Array(4);
  for (const p of points) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1];
    const rhs = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        a[i * 4 + j] = (a[i * 4 + j] ?? 0) + (row[i] ?? 0) * (row[j] ?? 0);
      }
      b[i] = (b[i] ?? 0) + (row[i] ?? 0) * rhs;
    }
  }
  const c = solve(a, b, 4);
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

/**
 * Triangles joining an outer loop to an inner loop (or a single centre
 * vertex), both running the same way, matched by their position along the loop.
 */
function stripBetween(outer: number[], inner: number[]): number[][] {
  const out: number[][] = [];
  const n = outer.length;
  const m = inner.length;
  if (m === 1) {
    outer.forEach((a, i) => out.push([a, outer[(i + 1) % n] ?? 0, inner[0] ?? 0]));
    return out;
  }
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const a = outer[i % n] ?? 0;
    const b = inner[j % m] ?? 0;
    const nextOuter = (i + 1) / n;
    const nextInner = (j + 1) / m;
    if (j >= m || (i < n && nextOuter <= nextInner)) {
      out.push([a, outer[(i + 1) % n] ?? 0, b]);
      i++;
    } else {
      out.push([a, inner[(j + 1) % m] ?? 0, b]);
      j++;
    }
  }
  return out;
}

export interface HeadResult {
  mesh: PolyMesh;
  /** Old index of every vertex, or −1 for a new one (see `sources`). */
  origin: Int32Array;
  /** New vertices: the old vertices whose attributes they average. */
  sources: Map<number, number[]>;
}

/**
 * Rebuilds the head as described above. `headWeight` is each vertex's share
 * of the head bone (0–1); `headJointY` the height of the head joint.
 *
 * @throws {FigureBuildError} when the surface fit fails or a hole cannot be closed.
 */
export function smoothHead(
  mesh: PolyMesh,
  headWeight: Float64Array,
  headJointY: number,
): HeadResult {
  const count = mesh.positions.length / 3;
  const pos = mesh.positions;
  const point = (v: number): Vec => [pos[v * 3] ?? 0, pos[v * 3 + 1] ?? 0, pos[v * 3 + 2] ?? 0];

  const cap: Vec[] = [];
  for (let v = 0; v < count; v++) {
    if ((headWeight[v] ?? 0) > 0.95 && (pos[v * 3 + 1] ?? 0) > headJointY + 0.12) {
      cap.push(point(v));
    }
  }
  const centre = sphereCentre(cap);
  const polar = (p: Vec): [Vec, number] => {
    const d: Vec = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const r = Math.hypot(...d) || 1;
    return [[d[0] / r, d[1] / r, d[2] / r], r];
  };

  // Fit r(direction) over the head (the neck below is left out).
  const basis = new Float64Array(COEFFICIENTS);
  const normal = new Float64Array(COEFFICIENTS * COEFFICIENTS);
  const rhs = new Float64Array(COEFFICIENTS);
  const evaluate = (coefficients: Float64Array, d: Vec) => {
    harmonics(d, basis);
    let r = 0;
    for (let i = 0; i < COEFFICIENTS; i++) r += (coefficients[i] ?? 0) * (basis[i] ?? 0);
    return r;
  };
  const fitWith = (accept: (d: Vec, r: number) => boolean) => {
    normal.fill(0);
    rhs.fill(0);
    let samples = 0;
    for (let v = 0; v < count; v++) {
      if ((headWeight[v] ?? 0) < 0.9) continue;
      const [d, r] = polar(point(v));
      if (!accept(d, r)) continue;
      samples++;
      harmonics(d, basis);
      for (let i = 0; i < COEFFICIENTS; i++) {
        const bi = basis[i] ?? 0;
        rhs[i] = (rhs[i] ?? 0) + bi * r;
        for (let j = 0; j < COEFFICIENTS; j++) {
          normal[i * COEFFICIENTS + j] = (normal[i * COEFFICIENTS + j] ?? 0) + bi * (basis[j] ?? 0);
        }
      }
    }
    let i = 0;
    for (let l = 0; l <= DEGREE; l++) {
      for (let m = -l; m <= l; m++, i++) {
        normal[i * COEFFICIENTS + i] =
          (normal[i * COEFFICIENTS + i] ?? 0) + RIDGE * (l * (l + 1)) ** 2 * samples;
      }
    }
    return solve(normal, rhs, COEFFICIENTS);
  };
  // Robust fit: refit without the features each fit finds, so they do not pull it.
  let surface = fitWith(() => true);
  for (const tolerance of FIT_TOLERANCES) {
    const previous = surface;
    surface = fitWith((d, r) => Math.abs(r - evaluate(previous, d)) < tolerance);
  }

  // Vertices off the smooth surface: their faces are rebuilt.
  const feature = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    if ((headWeight[v] ?? 0) < 0.9) continue;
    const [d, r] = polar(point(v));
    const offset = r - evaluate(surface, d);
    if (offset < -TUCKED_DEPTH || offset > PROTRUDING_HEIGHT) feature[v] = 1;
  }
  // Remove the features' faces; vertices where two holes would touch go too.
  const { faces, offsets } = mesh;
  const edgeKey = (a: number, b: number) => a * count + b;
  const removeFeatures = () => {
    const keptFaces: number[][] = [];
    for (let f = 0; f < offsets.length - 1; f++) {
      const face = Array.from(faces.subarray(offsets[f] ?? 0, offsets[f + 1] ?? 0));
      if (!face.some((v) => feature[v])) keptFaces.push(face);
    }
    // Holes: directed edges whose reverse no kept face has; fill edges run backwards.
    const edges = new Set<number>();
    for (const face of keptFaces) {
      face.forEach((a, i) => edges.add(edgeKey(a, face[(i + 1) % face.length] ?? 0)));
    }
    const fillNext = new Map<number, number>();
    const pinched = new Set<number>();
    for (const face of keptFaces) {
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length] ?? 0;
        if (edges.has(edgeKey(b, a))) return;
        if (fillNext.has(b)) pinched.add(b);
        fillNext.set(b, a);
      });
    }
    return { keptFaces, fillNext, pinched };
  };
  let removed = removeFeatures();
  for (let round = 0; removed.pinched.size > 0; round++) {
    if (round === 20) throw new FigureBuildError('The face rebuild cannot close its holes cleanly');
    for (const v of removed.pinched) feature[v] = 1;
    removed = removeFeatures();
  }
  const { keptFaces, fillNext } = removed;
  const positions: number[] = Array.from(pos);
  const sources = new Map<number, number[]>();
  let next = count;
  const visited = new Set<number>();
  for (const start of fillNext.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let v = start;
    while (!visited.has(v)) {
      visited.add(v);
      loop.push(v);
      v = fillNext.get(v) ?? start;
    }
    // Concentric rings towards the hole's centre, joined by triangle strips.
    const c = [0, 0, 0];
    for (const u of loop) {
      for (let a = 0; a < 3; a++) c[a] = (c[a] ?? 0) + (pos[u * 3 + a] ?? 0) / loop.length;
    }
    let outer = loop;
    const rings = Math.max(1, Math.round(Math.sqrt(loop.length) / 2));
    for (let k = 1; k <= rings; k++) {
      const t = k / (rings + 1);
      const size = k === rings ? 1 : Math.max(3, Math.round(loop.length * (1 - t)));
      const inner: number[] = [];
      for (let j = 0; j < size; j++) {
        // Sample the outer loop evenly and pull towards the centre.
        const at = (j / size) * loop.length;
        const a = loop[Math.floor(at) % loop.length] ?? 0;
        const b = loop[(Math.floor(at) + 1) % loop.length] ?? 0;
        const f = at - Math.floor(at);
        const vertex = next++;
        for (let axis = 0; axis < 3; axis++) {
          const onLoop = (pos[a * 3 + axis] ?? 0) * (1 - f) + (pos[b * 3 + axis] ?? 0) * f;
          positions.push(onLoop + ((c[axis] ?? 0) - onLoop) * t);
        }
        sources.set(vertex, loop);
        inner.push(vertex);
      }
      keptFaces.push(...stripBetween(outer, inner));
      outer = inner;
    }
  }
  const faceOffsets = [0];
  for (const face of keptFaces) faceOffsets.push((faceOffsets.at(-1) ?? 0) + face.length);
  const { mesh: compact, kept } = compactVertices({
    positions: Float64Array.from(positions),
    faces: Uint32Array.from(keptFaces.flat()),
    offsets: Uint32Array.from(faceOffsets),
  });
  const origin = Int32Array.from(kept, (v) => (v < count ? v : -1));
  const newSources = new Map<number, number[]>();
  kept.forEach((v, i) => {
    const list = sources.get(v);
    if (list) newSources.set(i, list);
  });

  // Move the head onto the smooth surface, blending into the neck.
  const weightOf = (i: number) => {
    const o = origin[i] ?? -1;
    if (o >= 0) return headWeight[o] ?? 0;
    const list = newSources.get(i) ?? [];
    return list.reduce((sum, u) => sum + (headWeight[u] ?? 0), 0) / Math.max(1, list.length);
  };
  const out = compact.positions;
  const n = out.length / 3;
  const blend = new Float64Array(n);
  for (let i = 0; i < n; i++) blend[i] = MathUtils.smoothstep(weightOf(i), 0.5, 0.9);
  const project = (i: number, amount: number) => {
    const [d, r] = polar([out[i * 3] ?? 0, out[i * 3 + 1] ?? 0, out[i * 3 + 2] ?? 0]);
    const radius = r + (evaluate(surface, d) - r) * amount;
    for (let a = 0; a < 3; a++) out[i * 3 + a] = (centre[a] ?? 0) + (d[a] ?? 0) * radius;
  };
  for (let i = 0; i < n; i++) if ((blend[i] ?? 0) > 0) project(i, blend[i] ?? 0);
  const neighbours = vertexNeighbours(compact);
  const mean = new Float64Array(3);
  for (let pass = 0; pass < RELAXATION; pass++) {
    for (let i = 0; i < n; i++) {
      if ((blend[i] ?? 0) < 1) continue;
      const list = neighbours[i] ?? [];
      mean.fill(0);
      for (const u of list) {
        for (let a = 0; a < 3; a++) mean[a] = (mean[a] ?? 0) + (out[u * 3 + a] ?? 0) / list.length;
      }
      for (let a = 0; a < 3; a++) out[i * 3 + a] = 0.5 * ((out[i * 3 + a] ?? 0) + (mean[a] ?? 0));
      project(i, 1);
    }
  }
  return { mesh: compact, origin, sources: newSources };
}
