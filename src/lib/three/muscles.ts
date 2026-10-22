/**
 * Muscle glow overlays: for each of the 17 muscle groups, thin shells that
 * follow the figure's surface over the group's regions (`anatomy.ts`), with
 * soft edges. A group glows strongly (primary), faintly (secondary) or not at
 * all.
 */
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type BufferGeometry,
  type Material,
} from 'three';
import { MUSCLES, type Muscle } from '../schema/common.ts';
import { regionsOn, type RegionSample } from './anatomy.ts';
import { GLOW_COLORS } from './colors.ts';
import type { Figure, PartSurface } from './figure.ts';
import { gridGeometry } from './surface.ts';

export type GlowLevel = 'primary' | 'secondary' | 'none';

/** How far the overlay floats above the skin, metres. */
const OVERLAY_OFFSET = 0.0016;

export interface MuscleOverlays {
  /** Sets the glow of every group: listed groups glow, the rest go dark. */
  setGlow(primary: readonly Muscle[], secondary: readonly Muscle[]): void;
  /** Current glow level of a group. */
  level(muscle: Muscle): GlowLevel;
  dispose(): void;
}

function glowMaterial(level: Exclude<GlowLevel, 'none'>): MeshStandardMaterial {
  const color = new Color(GLOW_COLORS[level]);
  const material = new MeshStandardMaterial({
    color: color.clone().multiplyScalar(level === 'primary' ? 0.42 : 0.7),
    emissive: color,
    emissiveIntensity: level === 'primary' ? 0.85 : 0.34,
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: level === 'primary' ? 1 : 0.9,
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = `muscle-${level}`;
  return material;
}

/** Per-vertex coverage of a group's regions on a surface. */
function coverage(surface: PartSurface, muscle: Muscle): Float32Array | null {
  const regions = regionsOn(surface.part).filter((region) => region.muscle === muscle);
  if (regions.length === 0) return null;
  const { rows, cols, u, theta } = surface.grid;
  const mask = new Float32Array(rows * cols);
  const sample: RegionSample = { cover: 0, bulge: 0 };
  let any = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let cover = 0;
      for (const region of regions) {
        cover = Math.max(
          cover,
          region.sample(u[r] ?? 0, ((theta[c] ?? 0) * 180) / Math.PI, sample).cover,
        );
      }
      mask[r * cols + c] = cover;
      if (cover > 1e-3) any = true;
    }
  }
  return any ? mask : null;
}

/** Builds the overlays on a figure (hidden until `setGlow`). */
export function attachMuscles(figure: Figure): MuscleOverlays {
  const materials = { primary: glowMaterial('primary'), secondary: glowMaterial('secondary') };
  const meshes = new Map<Muscle, Mesh[]>();
  const geometries: BufferGeometry[] = [];
  const levels = new Map<Muscle, GlowLevel>();

  for (const muscle of MUSCLES) {
    const list: Mesh[] = [];
    for (const surface of figure.surfaces) {
      const mask = coverage(surface, muscle);
      if (!mask) continue;
      const skin = surface.skin;
      const geometry = gridGeometry(surface.grid, {
        offset: OVERLAY_OFFSET,
        mask,
        attributes: skin
          ? {
              skinIndex: { array: skin.skinIndex, itemSize: 4 },
              skinWeight: { array: skin.skinWeight, itemSize: 4 },
            }
          : {},
      });
      geometries.push(geometry);
      let mesh: Mesh;
      if (skin) {
        const skinned = new SkinnedMesh(geometry, materials.primary as Material);
        skinned.frustumCulled = false;
        figure.group.add(skinned);
        skinned.bind(skin.skeleton, skin.bindMatrix);
        mesh = skinned;
      } else {
        mesh = new Mesh(geometry, materials.primary);
        surface.bone?.add(mesh);
      }
      mesh.name = `muscle:${muscle}`;
      mesh.renderOrder = 1;
      mesh.visible = false;
      list.push(mesh);
    }
    meshes.set(muscle, list);
    levels.set(muscle, 'none');
  }

  return {
    setGlow(primary, secondary) {
      for (const muscle of MUSCLES) {
        const level: GlowLevel = primary.includes(muscle)
          ? 'primary'
          : secondary.includes(muscle)
            ? 'secondary'
            : 'none';
        levels.set(muscle, level);
        for (const mesh of meshes.get(muscle) ?? []) {
          mesh.visible = level !== 'none';
          if (level === 'none') continue;
          mesh.material = materials[level];
          // Where regions overlap, the primary glow is drawn over the secondary one.
          mesh.renderOrder = level === 'primary' ? 2 : 1;
        }
      }
    },
    level(muscle) {
      return levels.get(muscle) ?? 'none';
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      materials.primary.dispose();
      materials.secondary.dispose();
      for (const list of meshes.values()) for (const mesh of list) mesh.removeFromParent();
    },
  };
}
