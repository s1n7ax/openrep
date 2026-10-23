import { describe, expect, it } from 'vitest';
import { BACK_DEFAULT, defaultViewDirection, FRONT_DEFAULT } from './defaultView.ts';

describe('defaultViewDirection', () => {
  it('looks from the front at front muscles', () => {
    expect(defaultViewDirection(['chest'])).toBe(FRONT_DEFAULT);
    expect(defaultViewDirection(['quadriceps', 'glutes'])).toBe(FRONT_DEFAULT);
  });

  it('looks from behind when most primary muscles are on the back', () => {
    expect(defaultViewDirection(['lower back'])).toBe(BACK_DEFAULT);
    expect(defaultViewDirection(['lats', 'middle back', 'biceps'])).toBe(BACK_DEFAULT);
    expect(BACK_DEFAULT.z).toBeLessThan(0);
  });
});
