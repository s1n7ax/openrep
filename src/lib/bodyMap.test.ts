import { describe, expect, it } from 'vitest';
import {
  BODY_HEIGHT,
  BODY_WIDTH,
  INJURY_SPOTS,
  MUSCLE_AREAS,
  musclePaths,
  OUTLINE_PATH,
} from './bodyMap.ts';
import { INJURY_AREAS } from './scheduleChoices.ts';
import { MUSCLES } from './schema/common.ts';

const NUMBER = /-?\d+(\.\d+)?/g;

describe('body map', () => {
  it('has every muscle group on the front or the back', () => {
    const drawn = new Set([...MUSCLE_AREAS.front, ...MUSCLE_AREAS.back].map((area) => area.muscle));
    expect([...drawn].sort()).toEqual([...MUSCLES].sort());
  });

  it('draws each group once per view', () => {
    for (const areas of Object.values(MUSCLE_AREAS)) {
      const muscles = areas.map((area) => area.muscle);
      expect(new Set(muscles).size).toBe(muscles.length);
    }
  });

  it('draws every muscle shape on both halves, inside the figure', () => {
    for (const area of [...MUSCLE_AREAS.front, ...MUSCLE_AREAS.back]) {
      const paths = musclePaths(area);
      expect(paths).toHaveLength(2 * area.shapes.length);
      for (const shape of area.shapes) {
        for (const [x, y] of shape) {
          expect(x, area.muscle).toBeGreaterThan(0);
          expect(x, area.muscle).toBeLessThanOrEqual(BODY_WIDTH / 2);
          expect(y, area.muscle).toBeGreaterThan(0);
          expect(y, area.muscle).toBeLessThan(BODY_HEIGHT);
        }
      }
      for (const d of paths) {
        expect(d).toMatch(/^M[\d.]+ [\d.]+(C[\d. -]+)+Z$/);
        const numbers = d.match(NUMBER)!.map(Number);
        expect(numbers.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('closes the outline around both halves', () => {
    expect(OUTLINE_PATH).toMatch(/^M60 4C.*Z$/);
    const xs = OUTLINE_PATH.match(NUMBER)!
      .map(Number)
      .filter((_, index) => index % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(BODY_WIDTH);
  });

  it('has one spot for every injury area', () => {
    const spots = [...INJURY_SPOTS.front, ...INJURY_SPOTS.back].map((spot) => spot.area);
    expect([...spots].sort()).toEqual(Object.keys(INJURY_AREAS).sort());
  });

  it('puts the person’s right side on the left of the front view, and on the right of the back', () => {
    const x = (area: string) =>
      [...INJURY_SPOTS.front, ...INJURY_SPOTS.back].find((spot) => spot.area === area)!.at[0];
    expect(x('right-knee')).toBeLessThan(BODY_WIDTH / 2);
    expect(x('left-knee')).toBeGreaterThan(BODY_WIDTH / 2);
  });
});
