/**
 * Weight units. Weights are stored in kilograms at full precision; they are
 * converted only for display and input, so switching units never drifts.
 */
import type { Unit } from './schema/userData.ts';

/** Pounds in one kilogram. */
export const LB_PER_KG = 2.20462;

/** Heaviest weight user data accepts, in kilograms (see `weightKgSchema`). */
export const MAX_WEIGHT_KG = 2000;

/** A weight in kilograms expressed in `unit`. */
export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

/** A weight given in `unit` expressed in kilograms. */
export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

/** A number with at most one decimal and no trailing zero: 132.277 → "132.3", 60.04 → "60". */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A weight stored in kilograms, as a number in `unit`: 60 kg in lb → "132.3". */
export function formatWeight(kg: number, unit: Unit): string {
  return formatDecimal(fromKg(kg, unit));
}

/** A weight stored in kilograms, with its unit: 60 kg in lb → "132.3 lb". */
export function formatWeightWithUnit(kg: number, unit: Unit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}

/** Result of reading a weight typed by the user. */
export type ParsedWeight =
  /** `kg` is `null` when the field was left empty. */
  { ok: true; kg: number | null } | { ok: false };

/**
 * Reads a weight typed in `unit` ("60", "62.5", "62,5", or empty) as kilograms.
 * Negative, non-numeric and implausibly heavy values are rejected.
 */
export function parseWeight(text: string, unit: Unit): ParsedWeight {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { ok: true, kg: null };
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) return { ok: false };
  const kg = toKg(Number(trimmed), unit);
  if (!Number.isFinite(kg) || kg > MAX_WEIGHT_KG) return { ok: false };
  return { ok: true, kg };
}
