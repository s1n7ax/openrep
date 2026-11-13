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
} from './common.ts';

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

/** Heaviest weight user data accepts, in kilograms. */
export const MAX_WEIGHT_KG = 2000;

/** Weight in kilograms, stored at full precision. */
export const weightKgSchema = z.number().min(0).max(MAX_WEIGHT_KG);

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

/**
 * Two or more exercises of a day (or session) done alternately, round by
 * round. Its exercises are next to each other and carry its id as
 * `supersetId`; the round count is their `sets`, which they share. `restSec`
 * is the rest after each round; there is none between its exercises.
 */
export const supersetSchema = z.object({
  id: localIdSchema,
  restSec: restSecSchema.optional(),
});
export type Superset = z.infer<typeof supersetSchema>;

export const planExerciseSchema = z
  .object({
    id: localIdSchema,
    exercise: exerciseRefSchema,
    ...targetFields,
    /** The superset the exercise belongs to, if any. */
    supersetId: localIdSchema.optional(),
  })
  .superRefine(checkRepsOrDuration);
export type PlanExercise = z.infer<typeof planExerciseSchema>;

export const planDaySchema = z.object({
  id: localIdSchema,
  name: z.string(),
  exercises: z.array(planExerciseSchema),
  /** Left out when the day has no superset. */
  supersets: z.array(supersetSchema).optional(),
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

/** Most repetitions a logged set accepts. */
export const MAX_LOGGED_REPS = 999;
/** Longest time a logged set accepts, in seconds. */
export const MAX_LOGGED_SECONDS = 36_000;

/** One logged set. `null` means the value was not entered. */
export const loggedSetSchema = z.object({
  id: localIdSchema,
  weightKg: weightKgSchema.nullable(),
  reps: z.int().min(0).max(MAX_LOGGED_REPS).nullable(),
  durationSec: z.int().min(0).max(MAX_LOGGED_SECONDS).nullable(),
  done: z.boolean(),
});
export type LoggedSet = z.infer<typeof loggedSetSchema>;

export const sessionExerciseSchema = z.object({
  id: localIdSchema,
  exercise: exerciseRefSchema,
  /** The plan's target when the session started. */
  target: planTargetSchema,
  sets: z.array(loggedSetSchema),
  /** The superset the exercise belongs to, if any. */
  supersetId: localIdSchema.optional(),
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
  /** The day's supersets when the session started; left out when it had none. */
  supersets: z.array(supersetSchema).optional(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Rest a countdown runs for when the plan gives the exercise (or superset) none, in seconds. */
export const DEFAULT_REST_SEC = 90;

export const settingsSchema = z.object({
  unit: unitSchema,
  /** Rest after a set when the plan has none; missing in files saved before it existed. */
  defaultRestSec: restSecSchema.default(DEFAULT_REST_SEC),
});
export type Settings = z.infer<typeof settingsSchema>;

export const catalogMetaSchema = z.object({
  /** Last time the app checked for a catalog update, or `null` if never. */
  lastCheckedAt: timestampSchema.nullable(),
  /** Revision of the catalog in use, or `null` for the bundled one. */
  revision: z.string().nullable(),
});
export type CatalogMeta = z.infer<typeof catalogMetaSchema>;

/**
 * An exercise the schedule creator was told to include or avoid: one picked
 * from the catalog (with its id) or a name the user typed.
 */
export const pickedExerciseSchema = z.object({
  exerciseId: idSchema.optional(),
  name: z.string(),
});
export type PickedExercise = z.infer<typeof pickedExerciseSchema>;

/**
 * What the user told the schedule creator, kept so its form reopens filled in.
 * Text is what they typed or picked, `''` when left blank; weights are in
 * kilograms, `null` when left blank. Lists added after the first version
 * default to empty, so answers saved before them still load.
 */
export const scheduleAnswersSchema = z.object({
  equipment: z.array(equipmentSchema),
  /** Equipment the user typed that the catalog has no picture for ("Pull-up bar"). */
  extraEquipment: z.array(z.string()).default([]),
  /** The plan the assistant should build on, or `null` to start fresh. */
  basePlanId: localIdSchema.nullable().default(null),
  /** What to change in that plan: popular picks and typed text. */
  planChanges: z.array(z.string()).default([]),
  goal: z.string(),
  /** Injuries tapped on the body or picked (`INJURY_PICKS` keys); `injuries` holds typed text. */
  injuryPicks: z.array(z.string()).default([]),
  injuries: z.string(),
  daysPerWeek: z.string(),
  sessionMinutes: z.string(),
  weekLayout: z.string(),
  split: z.string(),
  supersets: z.string(),
  experience: z.string(),
  strengthLevel: z.string(),
  bodyWeightKg: weightKgSchema.nullable(),
  targetWeightKg: weightKgSchema.nullable(),
  age: z.string(),
  sex: z.string(),
  height: z.string(),
  /** Typed by the first version of the form; moved into the lists below when read. */
  avoidExercises: z.string(),
  includeExercises: z.string(),
  avoidList: z.array(pickedExerciseSchema).default([]),
  includeList: z.array(pickedExerciseSchema).default([]),
  priorityMuscles: z.array(muscleSchema),
  /** Sports picked or typed; `otherSports` holds typed details ("straight after the gym"). */
  sports: z.array(z.string()).default([]),
  otherSports: z.string(),
  notes: z.string(),
});
export type ScheduleAnswers = z.infer<typeof scheduleAnswersSchema>;

/** Everything the user created, saved as one document on the device. */
export const userDataSchema = z.object({
  formatVersion: z.literal(1),
  settings: settingsSchema,
  plans: z.array(planSchema),
  customExercises: z.array(customExerciseSchema),
  sessions: z.array(sessionSchema),
  activeSessionId: localIdSchema.nullable(),
  catalogMeta: catalogMetaSchema,
  /** Missing until the schedule creator is first used, and in files saved before it existed. */
  scheduleAnswers: scheduleAnswersSchema.optional(),
});
export type UserData = z.infer<typeof userDataSchema>;

/** User data of a fresh install. */
export function emptyUserData(): UserData {
  return {
    formatVersion: 1,
    settings: { unit: 'kg', defaultRestSec: DEFAULT_REST_SEC },
    plans: [],
    customExercises: [],
    sessions: [],
    activeSessionId: null,
    catalogMeta: { lastCheckedAt: null, revision: null },
  };
}
