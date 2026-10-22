import { MeshStandardMaterial, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { MUSCLES } from '../schema/common.ts';
import { musclesWithRegions } from './anatomy.ts';
import { createFigure } from './figure.ts';
import { attachMuscles } from './muscles.ts';

describe('muscle overlays', () => {
  it('cover all 17 muscle groups', () => {
    expect([...musclesWithRegions()].sort()).toEqual([...MUSCLES].sort());
  });

  it('glow strongly for primary, faintly for secondary and not at all otherwise', () => {
    const figure = createFigure();
    const overlays = attachMuscles(figure);
    overlays.setGlow(['chest'], ['triceps', 'shoulders']);
    expect(overlays.level('chest')).toBe('primary');
    expect(overlays.level('triceps')).toBe('secondary');
    expect(overlays.level('quadriceps')).toBe('none');

    const meshes = (muscle: string) => {
      const found: Mesh[] = [];
      figure.group.traverse((object) => {
        if (object.name === `muscle:${muscle}`) found.push(object as Mesh);
      });
      return found;
    };
    for (const muscle of MUSCLES) expect(meshes(muscle).length).toBeGreaterThan(0);
    expect(meshes('chest').every((mesh) => mesh.visible)).toBe(true);
    expect(meshes('quadriceps').some((mesh) => mesh.visible)).toBe(false);
    const glow = (mesh: Mesh | undefined) => {
      const material = mesh?.material;
      return material instanceof MeshStandardMaterial ? material.emissiveIntensity : 0;
    };
    expect(glow(meshes('chest')[0])).toBeGreaterThan(glow(meshes('triceps')[0]));
    expect(glow(meshes('triceps')[0])).toBeGreaterThan(0);

    overlays.setGlow([], []);
    expect(meshes('chest').some((mesh) => mesh.visible)).toBe(false);
    overlays.dispose();
    figure.dispose();
  });
});
