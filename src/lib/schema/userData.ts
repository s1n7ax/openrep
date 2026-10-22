import * as z from 'zod';
import {
  checkRepsOrDuration,
  durationSecSchema,
  equipmentSchema,
  idSchema,
  muscleSchema,
  repsSchema,
  restSecSchema,
  setsSchema,
  timestampSchema,
} from './common';

// User data lives on the device. These schemas are deliberately structural:
// a stricter rule that rejects one odd value would make the whole file unreadable.

/** Id of a user-created record (plan, day, custom exercise, session, …). */
export const localIdSchema = z.string().min(1);

export const UNITS = ['kg', 'lb'] as const;
export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

/**
 * Reference from a plan or session to an exercise. `name` is a snapshot taken
 * when the reference was made, shown when the exercise no longer exists.
 */
export const exerciseRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), exerciseId: idSchema, name: z.string() }),
  z.object({ kind: z.literal('custom'), customExerciseId: localIdSchema, name: z.string() }),
]);
export type ExerciseRef = z.infer<typeof exerciseRefSchema>;

/** Weight in kilograms, stored at full precision. */
export const weightKgSchema = z.number().min(0).max(2000);

const targetFields = {
  sets: setsSchema,
  reps: repsSchema.optional(),
  durationSec: durationSecSchema.optional(),
  weightKg: weightKgSchema.optional(),
  restSec: restSecSchema.optional(),
  notes: z.string().optional(),
};

/** What to do for one exercise: sets and exactly one of reps / duration. */
export const planTargetSchema = z.object(targetFields).superRefine(checkRepsOrDuration);
export type PlanTarget = z.infer<typeof planTargetSchema>;

export const planExerciseSchema = z
  .object({ id: localIdSchema, exercise: exerciseRefSchema, ...targetFields })
  .superRefine(checkRepsOrDuration);
export type PlanExercise = z.infer<typeof planExerciseSchema>;

export const planDaySchema = z.object({
  id: localIdSchema,
  name: z.string(),
  exercises: z.array(planExerciseSchema),
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const planSchema = z.object({
  id: localIdSchema,
  name: z.string(),
  days: z.array(planDaySchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Plan = z.infer<typeof planSchema>;

export const customExerciseSchema = z.object({
  id: localIdSchema,
  name: z.string(),
  notes: z.string(),
  equipment: equipmentSchema.nullable(),
  primaryMuscles: z.array(muscleSchema),
  secondaryMuscles: z.array(muscleSchema),
  instructions: z.array(z.string()),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type CustomExercise = z.infer<typeof customExerciseSchema>;

/** One logged set. `null` means the value was not entered. */
export const loggedSetSchema = z.object({
  id: localIdSchema,
  weightKg: weightKgSchema.nullable(),
  reps: z.int().min(0).max(999).nullable(),
  durationSec: z.int().min(0).max(36_000).nullable(),
  done: z.boolean(),
});
export type LoggedSet = z.infer<typeof loggedSetSchema>;

export const sessionExerciseSchema = z.object({
  id: localIdSchema,
  exercise: exerciseRefSchema,
  /** The plan's target when the session started. */
  target: planTargetSchema,
  sets: z.array(loggedSetSchema),
});
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;

/** A workout started from a plan day. Plan and day names are snapshots. */
export const sessionSchema = z.object({
  id: localIdSchema,
  planId: localIdSchema.nullable(),
  planName: z.string(),
  dayId: localIdSchema.nullable(),
  dayName: z.string(),
  startedAt: timestampSchema,
  /** `null` while the session is in progress. */
  finishedAt: timestampSchema.nullable(),
  exercises: z.array(sessionExerciseSchema),
});
export type Session = z.infer<typeof sessionSchema>;

export const settingsSchema = z.object({ unit: unitSchema });
export type Settings = z.infer<typeof settingsSchema>;

export const catalogMetaSchema = z.object({
  /** Last time the app checked for a catalog update, or `null` if never. */
  lastCheckedAt: timestampSchema.nullable(),
  /** Revision of the catalog in use, or `null` for the bundled one. */
  revision: z.string().nullable(),
});
export type CatalogMeta = z.infer<typeof catalogMetaSchema>;

/** Everything the user created, saved as one document on the device. */
export const userDataSchema = z.object({
  formatVersion: z.literal(1),
  settings: settingsSchema,
  plans: z.array(planSchema),
  customExercises: z.array(customExerciseSchema),
  sessions: z.array(sessionSchema),
  activeSessionId: localIdSchema.nullable(),
  catalogMeta: catalogMetaSchema,
});
export type UserData = z.infer<typeof userDataSchema>;

/** User data of a fresh install. */
export function emptyUserData(): UserData {
  return {
    formatVersion: 1,
    settings: { unit: 'kg' },
    plans: [],
    customExercises: [],
    sessions: [],
    activeSessionId: null,
    catalogMeta: { lastCheckedAt: null, revision: null },
  };
}
