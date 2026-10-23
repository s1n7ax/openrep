/**
 * Mesh helpers for the figure generator: a closed polygon mesh with
 * per-vertex attributes, Catmull–Clark subdivision, normals, smoothing and
 * triangulation.
 */

export interface PolyMesh {
  /** xyz per vertex. */
  positions: Float64Array;
  /** Vertex indices of every face, counter-clockwise seen from outside, concatenated. */
  faces: Uint32Array;
  /** Start of each face in `faces`, plus the total length at the end. */
  offsets: Uint32Array;
}

/** A per-vertex attribute carried through subdivision (linear interpolation). */
export interface VertexAttribute {
  itemSize: number;
  array: Float64Array;
}

/** A mesh made of quads only. */
export function quadMesh(positions: Float64Array, quads: Uint32Array): PolyMesh {
  const count = quads.length / 4;
  return {
    positions,
    faces: quads,
    offsets: Uint32Array.from({ length: count + 1 }, (_, i) => i * 4),
  };
}

export function faceCount(mesh: PolyMesh): number {
  return mesh.offsets.length - 1;
}

/** Calls `fn(a, b, face)` for every directed edge of every face. */
function forEachEdge(mesh: PolyMesh, fn: (a: number, b: number, face: number) => void): void {
  const { faces, offsets } = mesh;
  for (let f = 0; f < offsets.length - 1; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    for (let i = start; i < end; i++) {
      fn(faces[i] ?? 0, faces[i + 1 < end ? i + 1 : start] ?? 0, f);
    }
  }
}

/** Vertex → neighbouring vertices (sharing an edge). */
export function vertexNeighbours(mesh: PolyMesh): number[][] {
  const count = mesh.positions.length / 3;
  const sets = Array.from({ length: count }, () => new Set<number>());
  forEachEdge(mesh, (a, b) => {
    sets[a]?.add(b);
    sets[b]?.add(a);
  });
  return sets.map((set) => [...set]);
}

/**
 * One level of Catmull–Clark subdivision of a closed polygon mesh; the result
 * is all quads. Attributes are interpolated linearly (face = mean of its
 * corners, edge = mean of its ends). New vertices: the old vertices first
 * (same indices), then one per edge, then one per face.
 */
export function catmullClark(
  mesh: PolyMesh,
  attributes: VertexAttribute[],
): { mesh: PolyMesh; attributes: VertexAttribute[] } {
  const { positions, faces, offsets } = mesh;
  const vertexCount = positions.length / 3;
  const fCount = faceCount(mesh);

  // Edges, each with its two faces; and each face corner's outgoing edge.
  const edgeIndex = new Map<number, number>();
  const edgeEnds: number[] = [];
  const edgeFaces: number[] = [];
  const cornerEdge = new Uint32Array(faces.length);
  const key = (a: number, b: number) => (a < b ? a * vertexCount + b : b * vertexCount + a);
  for (let f = 0; f < fCount; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    for (let i = start; i < end; i++) {
      const a = faces[i] ?? 0;
      const b = faces[i + 1 < end ? i + 1 : start] ?? 0;
      const k = key(a, b);
      let e = edgeIndex.get(k);
      if (e === undefined) {
        e = edgeEnds.length / 2;
        edgeIndex.set(k, e);
        edgeEnds.push(a, b);
        edgeFaces.push(f, -1);
      } else {
        edgeFaces[e * 2 + 1] = f;
      }
      cornerEdge[i] = e;
    }
  }
  const edgeCount = edgeEnds.length / 2;
  const total = vertexCount + edgeCount + fCount;
  const out = new Float64Array(total * 3);
  const faceBase = vertexCount + edgeCount;

  // Face points.
  for (let f = 0; f < fCount; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    for (let a = 0; a < 3; a++) {
      let sum = 0;
      for (let i = start; i < end; i++) sum += positions[(faces[i] ?? 0) * 3 + a] ?? 0;
      out[(faceBase + f) * 3 + a] = sum / (end - start);
    }
  }
  // Edge points.
  for (let e = 0; e < edgeCount; e++) {
    const v0 = edgeEnds[e * 2] ?? 0;
    const v1 = edgeEnds[e * 2 + 1] ?? 0;
    const f0 = edgeFaces[e * 2] ?? 0;
    const f1 = edgeFaces[e * 2 + 1] ?? -1;
    for (let a = 0; a < 3; a++) {
      const ends = (positions[v0 * 3 + a] ?? 0) + (positions[v1 * 3 + a] ?? 0);
      out[(vertexCount + e) * 3 + a] =
        f1 < 0
          ? ends / 2
          : (ends + (out[(faceBase + f0) * 3 + a] ?? 0) + (out[(faceBase + f1) * 3 + a] ?? 0)) / 4;
    }
  }
  // Vertex points: (Q + 2R + (n − 3)P) / n.
  const faceSum = new Float64Array(vertexCount * 3);
  const faceValence = new Uint32Array(vertexCount);
  for (let f = 0; f < fCount; f++) {
    for (let i = offsets[f] ?? 0; i < (offsets[f + 1] ?? 0); i++) {
      const v = faces[i] ?? 0;
      faceValence[v] = (faceValence[v] ?? 0) + 1;
      for (let a = 0; a < 3; a++) {
        faceSum[v * 3 + a] = (faceSum[v * 3 + a] ?? 0) + (out[(faceBase + f) * 3 + a] ?? 0);
      }
    }
  }
  const edgeSum = new Float64Array(vertexCount * 3);
  const edgeValence = new Uint32Array(vertexCount);
  for (let e = 0; e < edgeCount; e++) {
    const v0 = edgeEnds[e * 2] ?? 0;
    const v1 = edgeEnds[e * 2 + 1] ?? 0;
    for (const v of [v0, v1]) {
      edgeValence[v] = (edgeValence[v] ?? 0) + 1;
      for (let a = 0; a < 3; a++) {
        const mid = ((positions[v0 * 3 + a] ?? 0) + (positions[v1 * 3 + a] ?? 0)) / 2;
        edgeSum[v * 3 + a] = (edgeSum[v * 3 + a] ?? 0) + mid;
      }
    }
  }
  for (let v = 0; v < vertexCount; v++) {
    const n = edgeValence[v] ?? 0;
    const nf = faceValence[v] ?? 1;
    for (let a = 0; a < 3; a++) {
      const p = positions[v * 3 + a] ?? 0;
      const q = (faceSum[v * 3 + a] ?? 0) / nf;
      const r = (edgeSum[v * 3 + a] ?? 0) / n;
      out[v * 3 + a] = n >= 3 ? (q + 2 * r + (n - 3) * p) / n : p;
    }
  }

  const newQuads = new Uint32Array(faces.length * 4);
  for (let f = 0; f < fCount; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    for (let i = start; i < end; i++) {
      const corner = faces[i] ?? 0;
      const next = vertexCount + (cornerEdge[i] ?? 0);
      const previous = vertexCount + (cornerEdge[i > start ? i - 1 : end - 1] ?? 0);
      newQuads.set([corner, next, faceBase + f, previous], i * 4);
    }
  }

  const newAttributes = attributes.map(({ itemSize, array }) => {
    const result = new Float64Array(total * itemSize);
    result.set(array.subarray(0, vertexCount * itemSize));
    for (let e = 0; e < edgeCount; e++) {
      const v0 = edgeEnds[e * 2] ?? 0;
      const v1 = edgeEnds[e * 2 + 1] ?? 0;
      for (let c = 0; c < itemSize; c++) {
        result[(vertexCount + e) * itemSize + c] =
          ((array[v0 * itemSize + c] ?? 0) + (array[v1 * itemSize + c] ?? 0)) / 2;
      }
    }
    for (let f = 0; f < fCount; f++) {
      const start = offsets[f] ?? 0;
      const end = offsets[f + 1] ?? 0;
      for (let c = 0; c < itemSize; c++) {
        let sum = 0;
        for (let i = start; i < end; i++) sum += array[(faces[i] ?? 0) * itemSize + c] ?? 0;
        result[(faceBase + f) * itemSize + c] = sum / (end - start);
      }
    }
    return { itemSize, array: result };
  });

  return { mesh: quadMesh(out, newQuads), attributes: newAttributes };
}

/** Area-weighted vertex normals (unit length). */
export function vertexNormals(mesh: PolyMesh): Float64Array {
  const { positions, faces, offsets } = mesh;
  const normals = new Float64Array(positions.length);
  const p = (v: number, a: number) => positions[v * 3 + a] ?? 0;
  for (let f = 0; f < offsets.length - 1; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    // Newell's method: the polygon's vector area.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = start; i < end; i++) {
      const a = faces[i] ?? 0;
      const b = faces[i + 1 < end ? i + 1 : start] ?? 0;
      nx += (p(a, 1) - p(b, 1)) * (p(a, 2) + p(b, 2));
      ny += (p(a, 2) - p(b, 2)) * (p(a, 0) + p(b, 0));
      nz += (p(a, 0) - p(b, 0)) * (p(a, 1) + p(b, 1));
    }
    for (let i = start; i < end; i++) {
      const v = faces[i] ?? 0;
      normals[v * 3] = (normals[v * 3] ?? 0) + nx;
      normals[v * 3 + 1] = (normals[v * 3 + 1] ?? 0) + ny;
      normals[v * 3 + 2] = (normals[v * 3 + 2] ?? 0) + nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const length = Math.hypot(normals[v] ?? 0, normals[v + 1] ?? 0, normals[v + 2] ?? 0) || 1;
    normals[v] = (normals[v] ?? 0) / length;
    normals[v + 1] = (normals[v + 1] ?? 0) / length;
    normals[v + 2] = (normals[v + 2] ?? 0) / length;
  }
  return normals;
}

/** Signed volume (positive when the faces face outwards). */
export function signedVolume(mesh: PolyMesh): number {
  const { positions, faces, offsets } = mesh;
  let volume = 0;
  const p = (v: number, a: number) => positions[v * 3 + a] ?? 0;
  for (let f = 0; f < offsets.length - 1; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    const a = faces[start] ?? 0;
    for (let i = start + 1; i + 1 < end; i++) {
      const b = faces[i] ?? 0;
      const c = faces[i + 1] ?? 0;
      volume +=
        (p(a, 0) * (p(b, 1) * p(c, 2) - p(b, 2) * p(c, 1)) -
          p(a, 1) * (p(b, 0) * p(c, 2) - p(b, 2) * p(c, 0)) +
          p(a, 2) * (p(b, 0) * p(c, 1) - p(b, 1) * p(c, 0))) /
        6;
    }
  }
  return volume;
}

/** Reverses the winding of every face. */
export function flipFaces(mesh: PolyMesh): void {
  const { faces, offsets } = mesh;
  for (let f = 0; f < offsets.length - 1; f++) {
    faces.subarray(offsets[f] ?? 0, offsets[f + 1] ?? 0).reverse();
  }
}

/**
 * Taubin smoothing (shrink-free Laplacian smoothing). `strength` (0–1 per
 * vertex) scales how far each vertex moves; 0 keeps it fixed.
 */
export function taubinSmooth(
  positions: Float64Array,
  neighbours: number[][],
  strength: Float64Array,
  iterations: number,
  lambda = 0.5,
  mu = -0.53,
): void {
  const count = positions.length / 3;
  const delta = new Float64Array(positions.length);
  const pass = (factor: number) => {
    for (let v = 0; v < count; v++) {
      const s = strength[v] ?? 0;
      const list = neighbours[v] ?? [];
      if (s <= 0 || list.length === 0) {
        delta[v * 3] = 0;
        delta[v * 3 + 1] = 0;
        delta[v * 3 + 2] = 0;
        continue;
      }
      for (let a = 0; a < 3; a++) {
        let sum = 0;
        for (const n of list) sum += positions[n * 3 + a] ?? 0;
        delta[v * 3 + a] = factor * s * (sum / list.length - (positions[v * 3 + a] ?? 0));
      }
    }
    for (let i = 0; i < positions.length; i++) positions[i] = (positions[i] ?? 0) + (delta[i] ?? 0);
  };
  for (let i = 0; i < iterations; i++) {
    pass(lambda);
    if (mu !== 0) pass(mu);
  }
}

/** Smooths a scalar field over the mesh (mean of neighbours), `passes` times. */
export function smoothScalar(field: Float64Array, neighbours: number[][], passes: number): void {
  const next = new Float64Array(field.length);
  for (let p = 0; p < passes; p++) {
    for (let v = 0; v < field.length; v++) {
      const list = neighbours[v] ?? [];
      let sum = field[v] ?? 0;
      for (const n of list) sum += field[n] ?? 0;
      next[v] = sum / (list.length + 1);
    }
    field.set(next);
  }
}

/** Triangles of a quad mesh, splitting each quad along its shorter diagonal. */
export function triangulate(mesh: PolyMesh): Uint32Array {
  const { positions, faces, offsets } = mesh;
  const out: number[] = [];
  const distance = (a: number, b: number) =>
    Math.hypot(
      (positions[a * 3] ?? 0) - (positions[b * 3] ?? 0),
      (positions[a * 3 + 1] ?? 0) - (positions[b * 3 + 1] ?? 0),
      (positions[a * 3 + 2] ?? 0) - (positions[b * 3 + 2] ?? 0),
    );
  for (let f = 0; f < offsets.length - 1; f++) {
    const start = offsets[f] ?? 0;
    const end = offsets[f + 1] ?? 0;
    const a = faces[start] ?? 0;
    if (end - start === 4) {
      const b = faces[start + 1] ?? 0;
      const c = faces[start + 2] ?? 0;
      const d = faces[start + 3] ?? 0;
      if (distance(a, c) <= distance(b, d)) out.push(a, b, c, a, c, d);
      else out.push(a, b, d, b, c, d);
    } else {
      for (let i = start + 1; i + 1 < end; i++) out.push(a, faces[i] ?? 0, faces[i + 1] ?? 0);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Keeps only the vertices some face uses. Returns the compacted mesh and the
 * old index of every kept vertex.
 */
export function compactVertices(mesh: PolyMesh): { mesh: PolyMesh; kept: Uint32Array } {
  const count = mesh.positions.length / 3;
  const remap = new Int32Array(count).fill(-1);
  const kept: number[] = [];
  for (const v of mesh.faces) {
    if (remap[v] === -1) {
      remap[v] = kept.length;
      kept.push(v);
    }
  }
  const positions = new Float64Array(kept.length * 3);
  kept.forEach((v, i) => positions.set(mesh.positions.subarray(v * 3, v * 3 + 3), i * 3));
  return {
    mesh: {
      positions,
      faces: Uint32Array.from(mesh.faces, (v) => remap[v] ?? 0),
      offsets: Uint32Array.from(mesh.offsets),
    },
    kept: Uint32Array.from(kept),
  };
}
