/**
 * The figure's material: a matte, statue-like finish with the baked cavity
 * shading, and the muscle glow — each vertex knows which muscle groups cover
 * it (`figureAsset.ts`), and a uniform holds every group's glow level, so
 * lighting up a group needs no geometry of its own.
 */
import { Color, MeshStandardMaterial } from 'three';
import { MUSCLES } from '../schema/common.ts';
import { GLOW_COLORS } from './colors.ts';

/** Glow level of a group: 0 none, 1 secondary, 2 primary. */
export type GlowValue = 0 | 1 | 2;

export interface FigureMaterial extends MeshStandardMaterial {
  /** Glow level per muscle group, in `MUSCLES` order. */
  readonly glowLevels: Float32Array;
}

/** Body colour: a light, slightly warm stone grey. */
const BODY_COLOR = '#c9c7c3';

const GLOW = {
  primary: { color: new Color(GLOW_COLORS.primary), diffuse: 0.55, emissive: 0.12 },
  secondary: { color: new Color(GLOW_COLORS.secondary), diffuse: 0.62, emissive: 0.05 },
};

const VERTEX_HEAD = /* glsl */ `
attribute vec4 muscleGroups;
attribute vec4 muscleCover;
attribute float cavity;
uniform float muscleLevel[${MUSCLES.length}];
varying float vPrimary;
varying float vSecondary;
varying float vCavity;
`;

const VERTEX_GLOW = /* glsl */ `
vPrimary = 0.0;
vSecondary = 0.0;
for (int k = 0; k < 4; k++) {
  float group = muscleGroups[k];
  if (group < 254.5) {
    float level = muscleLevel[int(group + 0.5)];
    float cover = muscleCover[k];
    vPrimary = max(vPrimary, cover * step(1.5, level));
    vSecondary = max(vSecondary, cover * step(0.5, level) * (1.0 - step(1.5, level)));
  }
}
vCavity = cavity;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 glowPrimaryDiffuse;
uniform vec3 glowPrimaryEmissive;
uniform vec3 glowSecondaryDiffuse;
uniform vec3 glowSecondaryEmissive;
varying float vPrimary;
varying float vSecondary;
varying float vCavity;
`;

export function createFigureMaterial(): FigureMaterial {
  const material = new MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.66,
    metalness: 0,
  }) as FigureMaterial;
  material.name = 'figure';
  const glowLevels = new Float32Array(MUSCLES.length);
  Object.defineProperty(material, 'glowLevels', { value: glowLevels });
  const uniforms = {
    muscleLevel: { value: glowLevels },
    glowPrimaryDiffuse: {
      value: GLOW.primary.color.clone().multiplyScalar(GLOW.primary.diffuse),
    },
    glowPrimaryEmissive: {
      value: GLOW.primary.color.clone().multiplyScalar(GLOW.primary.emissive),
    },
    glowSecondaryDiffuse: {
      value: GLOW.secondary.color.clone().multiplyScalar(GLOW.secondary.diffuse),
    },
    glowSecondaryEmissive: {
      value: GLOW.secondary.color.clone().multiplyScalar(GLOW.secondary.emissive),
    },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_GLOW}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float glowPrimary = smoothstep(0.2, 0.8, vPrimary);
        float glowSecondary = smoothstep(0.2, 0.8, vSecondary) * (1.0 - glowPrimary);
        // Tinted rather than replaced, so the muscle forms stay readable under the glow.
        diffuseColor.rgb = mix(diffuseColor.rgb, glowSecondaryDiffuse, glowSecondary * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, glowPrimaryDiffuse, glowPrimary * 0.9);
        diffuseColor.rgb *= mix(1.0, vCavity, 0.7);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += glowPrimaryEmissive * glowPrimary * vCavity
          + glowSecondaryEmissive * glowSecondary * vCavity;`,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vCavity;
        reflectedLight.indirectSpecular *= vCavity;`,
      );
  };
  material.customProgramCacheKey = () => 'openrep-figure';
  return material;
}
