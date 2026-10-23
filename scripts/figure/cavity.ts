/**
 * Baked cavity shading: creases between muscles (and other concave spots)
 * darken a little, which makes the sculpted definition read under soft
 * light. Measured as how far a smoothed copy of the surface lies outside each
 * vertex, at two scales.
 */
import { MathUtils } from 'three';
import { taubinSmooth, vertexNeighbours, vertexNormals, type PolyMesh } from './mesh.ts';

/** Depth (metres) of a crease that gets the full darkening. */
const FULL_DEPTH = 0.006;
/** Darkest cavity value (1 = no darkening). */
const DARKEST = 0.75;

export function bakeCavity(mesh: PolyMesh): Uint8Array {
  const count = mesh.positions.length / 3;
  const neighbours = vertexNeighbours(mesh);
  const normals = vertexNormals(mesh);
  const everywhere = new Float64Array(count).fill(1);
  const depthAt = (iterations: number) => {
    const smooth = Float64Array.from(mesh.positions);
    // Plain Laplacian smoothing (it may shrink: only the local offset matters).
    taubinSmooth(smooth, neighbours, everywhere, iterations, 0.5, 0);
    const depth = new Float64Array(count);
    for (let v = 0; v < count; v++) {
      let d = 0;
      for (let a = 0; a < 3; a++) {
        d +=
          ((smooth[v * 3 + a] ?? 0) - (mesh.positions[v * 3 + a] ?? 0)) * (normals[v * 3 + a] ?? 0);
      }
      depth[v] = d;
    }
    return depth;
  };
  const fine = depthAt(6);
  const broad = depthAt(24);
  // Remove the bias of plain smoothing on convex shapes (limbs shrink inwards).
  const cavity = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    const crease = Math.max(0, (fine[v] ?? 0) + 0.3 * Math.max(0, broad[v] ?? 0));
    const darken = MathUtils.smoothstep(crease, 0, FULL_DEPTH);
    cavity[v] = Math.round((1 - (1 - DARKEST) * darken) * 255);
  }
  return cavity;
}
