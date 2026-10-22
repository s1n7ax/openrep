import { describe, expect, it } from 'vitest';
import {
  formatDecimal,
  formatWeight,
  formatWeightWithUnit,
  fromKg,
  parseWeight,
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
});
