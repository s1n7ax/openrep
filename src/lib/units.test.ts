import { describe, expect, it } from 'vitest';
import {
  formatDecimal,
  formatWeight,
  formatWeightWithUnit,
  fromKg,
  parseWeight,
  stepWeight,
  toKg,
} from './units.ts';

describe('units', () => {
  it('shows 60 kg as 132.3 lb', () => {
    expect(formatWeight(60, 'lb')).toBe('132.3');
    expect(formatWeightWithUnit(60, 'lb')).toBe('132.3 lb');
    expect(formatWeightWithUnit(60, 'kg')).toBe('60 kg');
  });

  it('formats with at most one decimal and no trailing zero', () => {
    expect(formatDecimal(62.5)).toBe('62.5');
    expect(formatDecimal(60.04)).toBe('60');
    expect(formatDecimal(59.96)).toBe('60');
    expect(formatDecimal(0.04)).toBe('0');
    expect(formatDecimal(-0.04)).toBe('0');
  });

  it('round-trips values typed in pounds without drift', () => {
    const parsed = parseWeight('135', 'lb');
    expect(parsed.ok).toBe(true);
    const kg = parsed.ok ? (parsed.kg ?? 0) : 0;
    expect(kg).toBeCloseTo(61.235, 3);
    expect(formatWeight(kg, 'lb')).toBe('135');
    expect(fromKg(toKg(225, 'lb'), 'lb')).toBeCloseTo(225, 10);
  });

  it('keeps kilograms unchanged', () => {
    expect(fromKg(42.25, 'kg')).toBe(42.25);
    expect(toKg(42.25, 'kg')).toBe(42.25);
  });

  it('parses typed weights', () => {
    expect(parseWeight('', 'kg')).toEqual({ ok: true, kg: null });
    expect(parseWeight('  ', 'kg')).toEqual({ ok: true, kg: null });
    expect(parseWeight('62.5', 'kg')).toEqual({ ok: true, kg: 62.5 });
    expect(parseWeight('62,5', 'kg')).toEqual({ ok: true, kg: 62.5 });
    expect(parseWeight('.5', 'kg')).toEqual({ ok: true, kg: 0.5 });
    expect(parseWeight('-5', 'kg')).toEqual({ ok: false });
    expect(parseWeight('abc', 'kg')).toEqual({ ok: false });
    expect(parseWeight('1e3', 'kg')).toEqual({ ok: false });
    expect(parseWeight('2001', 'kg')).toEqual({ ok: false });
    expect(parseWeight('4500', 'lb')).toEqual({ ok: false });
  });

  it('steps weights by 2.5 kg or 5 lb, within 0 and the heaviest weight', () => {
    expect(stepWeight(62.5, 'kg', 1)).toBe(65);
    expect(stepWeight(62.5, 'kg', -1)).toBe(60);
    expect(stepWeight(1, 'kg', -1)).toBe(0);
    expect(stepWeight(0, 'kg', -1)).toBe(0);
    expect(stepWeight(1999, 'kg', 1)).toBe(2000);
    expect(formatWeight(stepWeight(toKg(135, 'lb'), 'lb', 1) ?? 0, 'lb')).toBe('140');
    expect(formatWeight(stepWeight(60, 'lb', -1) ?? 0, 'lb')).toBe('127.3');
    // Repeated steps stay on the grid.
    let kg: number | null = 0;
    for (let press = 0; press < 30; press++) kg = stepWeight(kg, 'lb', 1);
    expect(fromKg(kg ?? 0, 'lb')).toBeCloseTo(150, 10);
  });

  it('starts an empty weight at one step and keeps it empty going down', () => {
    expect(stepWeight(null, 'kg', 1)).toBe(2.5);
    expect(formatWeight(stepWeight(null, 'lb', 1) ?? 0, 'lb')).toBe('5');
    expect(stepWeight(null, 'kg', -1)).toBeNull();
  });
});
