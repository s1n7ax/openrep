/**
 * Plan targets: defaults for a newly added exercise and human-readable text.
 */
import type { Force } from '../schema/common.ts';
import type { PlanTarget, Unit } from '../schema/userData.ts';
import { formatWeightWithUnit } from '../units.ts';

/** Seconds a newly added timed exercise is held. */
export const DEFAULT_DURATION_SEC = 30;
/** Repetitions of a newly added exercise. */
export const DEFAULT_REPS = '10';
/** Sets of a newly added exercise. */
export const DEFAULT_SETS = 3;

/** Target for an exercise just added to a plan: timed for static holds (planks), reps otherwise. */
export function defaultTarget(force: Force | null = null): PlanTarget {
  return force === 'static'
    ? { sets: DEFAULT_SETS, durationSec: DEFAULT_DURATION_SEC }
    : { sets: DEFAULT_SETS, reps: DEFAULT_REPS };
}

/** "8-12" → "8–12" (en dash), "10" unchanged. */
export function formatReps(reps: string): string {
  return reps.replace('-', '–');
}

/** 45 → "45 s", 90 → "1 min 30 s", 120 → "2 min". */
export function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** "3 × 8–12 · 60 kg", "3 × 30 s", with weights in `unit`. Rest and notes are not included. */
export function formatTarget(target: PlanTarget, unit: Unit): string {
  const amount =
    target.reps !== undefined
      ? formatReps(target.reps)
      : target.durationSec !== undefined
        ? formatDuration(target.durationSec)
        : '';
  const parts = [`${target.sets} × ${amount}`];
  if (target.weightKg !== undefined) parts.push(formatWeightWithUnit(target.weightKg, unit));
  return parts.join(' · ');
}
