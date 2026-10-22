import * as z from 'zod';

/** Kebab-case identifier used for exercises, schedules and file names. */
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const idSchema = z
  .string()
  .regex(ID_PATTERN, 'must be kebab-case: lowercase letters and digits separated by single dashes')
  .meta({ description: 'Kebab-case identifier, e.g. "barbell-bench-press-medium-grip".' });

/** A string with visible content (not empty, not only whitespace). */
export const textSchema = z.string().regex(/\S/, 'must not be empty');

/** The 17 muscle groups of the dataset. Every exercise targets one or more of them. */
export const MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;
export const muscleSchema = z.enum(MUSCLES);
export type Muscle = z.infer<typeof muscleSchema>;

export const EQUIPMENT = [
  'bands',
  'barbell',
  'body only',
  'cable',
  'dumbbell',
  'e-z curl bar',
  'exercise ball',
  'foam roll',
  'kettlebells',
  'machine',
  'medicine ball',
  'other',
] as const;
export const equipmentSchema = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof equipmentSchema>;

export const CATEGORIES = [
  'cardio',
  'olympic weightlifting',
  'plyometrics',
  'powerlifting',
  'strength',
  'stretching',
  'strongman',
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

export const FORCES = ['pull', 'push', 'static'] as const;
export const forceSchema = z.enum(FORCES);
export type Force = z.infer<typeof forceSchema>;

export const MECHANICS = ['compound', 'isolation'] as const;
export const mechanicSchema = z.enum(MECHANICS);
export type Mechanic = z.infer<typeof mechanicSchema>;

/** Number of sets for one exercise in a plan or schedule. */
export const setsSchema = z.int().min(1).max(20);

/**
 * Target repetitions as text: a single number ("8") or an ascending range ("8-12").
 */
export const repsSchema = z
  .string()
  .regex(/^[1-9]\d{0,2}(-[1-9]\d{0,2})?$/, 'must be a number like "8" or a range like "8-12"')
  .refine((value) => {
    const [low, high] = value.split('-').map(Number);
    return high === undefined || (low !== undefined && low < high);
  }, 'a range must go from low to high, like "8-12"')
  .meta({ description: 'A number ("8") or an ascending range ("8-12").' });

/** Target duration of a timed exercise (e.g. a plank), in seconds. */
export const durationSecSchema = z.int().min(1).max(3600);

/** Rest after each set, in seconds. */
export const restSecSchema = z.int().min(0).max(3600);

/** ISO 8601 timestamp in UTC, as produced by `Date.prototype.toISOString()`. */
export const timestampSchema = z.iso.datetime();

/** Adds an issue unless exactly one of `reps` / `durationSec` is set. */
export function checkRepsOrDuration(
  value: { reps?: string | undefined; durationSec?: number | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasReps = value.reps !== undefined;
  const hasDuration = value.durationSec !== undefined;
  if (hasReps === hasDuration) {
    ctx.addIssue({
      code: 'custom',
      message: 'set exactly one of "reps" or "durationSec"',
      path: hasReps ? ['durationSec'] : ['reps'],
    });
  }
}
