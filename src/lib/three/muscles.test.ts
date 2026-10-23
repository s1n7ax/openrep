import { describe, expect, it } from 'vitest';
import { readFigureAsset } from '../../../tests/helpers/figureAsset.ts';
import { MUSCLES } from '../schema/common.ts';
import { createFigure } from './figure.ts';
import { attachMuscles } from './muscles.ts';

const asset = readFigureAsset();

describe('muscle glow', () => {
  it('glows strongly for primary, faintly for secondary and not at all otherwise', () => {
    const figure = createFigure(asset);
    const overlays = attachMuscles(figure);
    overlays.setGlow(['chest'], ['triceps', 'shoulders']);
    expect(overlays.level('chest')).toBe('primary');
    expect(overlays.level('triceps')).toBe('secondary');
    expect(overlays.level('quadriceps')).toBe('none');

    const level = (muscle: (typeof MUSCLES)[number]) =>
      figure.material.glowLevels[MUSCLES.indexOf(muscle)];
    expect(level('chest')).toBeGreaterThan(level('triceps') ?? 0);
    expect(level('triceps')).toBeGreaterThan(0);
    expect(level('quadriceps')).toBe(0);

    overlays.setGlow([], []);
    expect(MUSCLES.every((muscle) => level(muscle) === 0)).toBe(true);
    overlays.dispose();
    figure.dispose();
  });
});
