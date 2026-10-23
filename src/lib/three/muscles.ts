/**
 * Muscle glow: each of the 17 muscle groups lights up over its anatomical
 * area on the figure (painted into the figure asset), strongly (primary),
 * faintly (secondary) or not at all.
 */
import { MUSCLES, type Muscle } from '../schema/common.ts';
import type { Figure } from './figure.ts';
import type { GlowValue } from './figureMaterial.ts';

export type GlowLevel = 'primary' | 'secondary' | 'none';

const LEVEL_VALUE: Record<GlowLevel, GlowValue> = { none: 0, secondary: 1, primary: 2 };

export interface MuscleOverlays {
  /** Sets the glow of every group: listed groups glow, the rest go dark. */
  setGlow(primary: readonly Muscle[], secondary: readonly Muscle[]): void;
  /** Current glow level of a group. */
  level(muscle: Muscle): GlowLevel;
  dispose(): void;
}

export function attachMuscles(figure: Figure): MuscleOverlays {
  const levels = figure.material.glowLevels;
  const current = new Map<Muscle, GlowLevel>(MUSCLES.map((muscle) => [muscle, 'none']));
  return {
    setGlow(primary, secondary) {
      MUSCLES.forEach((muscle, index) => {
        const level: GlowLevel = primary.includes(muscle)
          ? 'primary'
          : secondary.includes(muscle)
            ? 'secondary'
            : 'none';
        current.set(muscle, level);
        levels[index] = LEVEL_VALUE[level];
      });
    },
    level(muscle) {
      return current.get(muscle) ?? 'none';
    },
    dispose() {
      levels.fill(0);
    },
  };
}
