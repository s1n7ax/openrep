/**
 * Plan targets: defaults for a newly added exercise and human-readable text.
 */
import { durationSecSchema, repsSchema, restSecSchema, type Force } from '../schema/common.ts';
import type { PlanTarget, Unit } from '../schema/userData.ts';
import { formatWeightWithUnit, parseWeight } from '../units.ts';

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

/**
 * The reps a set done as planned logs: the target's number, or a range's low
 * end ("10-12" → 10); null without a reps target.
 */
export function plannedReps(reps: string | undefined): number | null {
  const low = Number(reps?.split('-')[0]);
  return Number.isInteger(low) ? low : null;
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

/** `formatTarget` followed by the rest time: "3 × 8–12 · 60 kg · Rest 1 min 30 s". */
export function formatTargetWithRest(target: PlanTarget, unit: Unit): string {
  const text = formatTarget(target, unit);
  return target.restSec === undefined ? text : `${text} · Rest ${formatDuration(target.restSec)}`;
}

/**
 * What one exercise of a superset does each round, with weights in `unit`:
 * "8–12 reps · 60 kg", "1 rep", "30 s". The round count is the superset's.
 */
export function formatSupersetExerciseTarget(
  target: Pick<PlanTarget, 'reps' | 'durationSec' | 'weightKg'>,
  unit: Unit,
): string {
  const parts: string[] = [];
  if (target.reps !== undefined) {
    parts.push(`${formatReps(target.reps)} ${target.reps === '1' ? 'rep' : 'reps'}`);
  } else if (target.durationSec !== undefined) {
    parts.push(formatDuration(target.durationSec));
  }
  if (target.weightKg !== undefined) parts.push(formatWeightWithUnit(target.weightKg, unit));
  return parts.join(' · ');
}

/** "3 rounds · rest 90 s after each round", "1 round" (without a rest). */
export function formatSupersetSummary(rounds: number, restSec: number | undefined): string {
  const text = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  return restSec === undefined ? text : `${text} · rest ${restSec} s after each round`;
}

/** The target editor's fields, as typed. */
export interface TargetForm {
  mode: 'reps' | 'time';
  reps: string;
  /** Seconds. */
  duration: string;
  /** In the user's unit; empty for none. */
  weight: string;
  /** Seconds; empty for none. */
  rest: string;
  notes: string;
  /**
   * Whether the user edited the weight field. Until then it shows the stored
   * weight rounded, so reading it back would change the stored weight.
   */
  weightEdited: boolean;
}

const WHOLE_NUMBER = /^\d+$/;

/** A reps field: one number or a range ("8", "8-12"). */
export function isValidRepsText(text: string): boolean {
  return repsSchema.safeParse(text.trim()).success;
}

/** A duration field: whole seconds within the allowed range. */
export function isValidDurationText(text: string): boolean {
  const trimmed = text.trim();
  return WHOLE_NUMBER.test(trimmed) && durationSecSchema.safeParse(Number(trimmed)).success;
}

/** A rest field: empty, or whole seconds within the allowed range. */
export function isValidRestText(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed === '' ||
    (WHOLE_NUMBER.test(trimmed) && restSecSchema.safeParse(Number(trimmed)).success)
  );
}

/**
 * The target to save from the editor: `stored` with every valid field of
 * `form` applied; invalid fields keep their stored value. The weight field is
 * applied only once edited (see `TargetForm.weightEdited`), so editing other
 * fields keeps the stored weight at full precision.
 */
export function applyTargetForm(stored: PlanTarget, form: TargetForm, unit: Unit): PlanTarget {
  const target: PlanTarget = {
    sets: stored.sets,
    reps: stored.reps,
    durationSec: stored.durationSec,
    weightKg: stored.weightKg,
    restSec: stored.restSec,
    notes: form.notes,
  };
  if (form.mode === 'reps' && isValidRepsText(form.reps)) {
    target.reps = form.reps.trim();
    target.durationSec = undefined;
  } else if (form.mode === 'time' && isValidDurationText(form.duration)) {
    target.durationSec = Number(form.duration.trim());
    target.reps = undefined;
  }
  if (form.weightEdited) {
    const weight = parseWeight(form.weight, unit);
    if (weight.ok) target.weightKg = weight.kg ?? undefined;
  }
  if (isValidRestText(form.rest)) {
    target.restSec = form.rest.trim() === '' ? undefined : Number(form.rest.trim());
  }
  return target;
}
