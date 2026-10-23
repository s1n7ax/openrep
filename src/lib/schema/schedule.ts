import * as z from 'zod';
import {
  checkRepsOrDuration,
  durationSecSchema,
  idSchema,
  levelSchema,
  repsSchema,
  restSecSchema,
  setsSchema,
  textSchema,
} from './common.ts';

/** Adds issues unless the entry names an exercise and sets exactly one of reps / duration. */
function checkScheduleEntry(
  entry: {
    exerciseId?: string | undefined;
    name?: string | undefined;
    reps?: string | undefined;
    durationSec?: number | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (entry.exerciseId === undefined && entry.name === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'set "exerciseId", "name" or both',
      path: ['exerciseId'],
    });
  }
  checkRepsOrDuration(entry, ctx);
}

/**
 * One exercise of a schedule day. It references a catalog exercise by
 * `exerciseId`, or names an exercise that is not in the catalog (yet) by `name`.
 */
export const scheduleEntrySchema = z
  .strictObject({
    exerciseId: idSchema.optional().meta({ description: 'Id of an exercise in the catalog.' }),
    name: textSchema
      .optional()
      .meta({ description: 'Exercise name; required when there is no exerciseId.' }),
    sets: setsSchema,
    reps: repsSchema.optional(),
    durationSec: durationSecSchema.optional(),
    restSec: restSecSchema.optional(),
    notes: z.string().optional(),
  })
  .superRefine(checkScheduleEntry);
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

export const scheduleDaySchema = z.strictObject({
  name: textSchema,
  exercises: z.array(scheduleEntrySchema).min(1),
});
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;

/** Version 1 of a schedule file: `data/schedules/<id>.json`. */
export const scheduleV1Schema = z
  .strictObject({
    formatVersion: z.literal(1),
    id: idSchema,
    name: textSchema,
    description: z.string(),
    level: levelSchema.optional(),
    days: z.array(scheduleDaySchema).min(1),
  })
  .meta({
    title: 'OpenRep schedule (v1)',
    description:
      'A workout schedule: data/schedules/<id>.json. Each entry sets exerciseId and/or name, and ' +
      'exactly one of reps or durationSec. Also checked by `npm run validate:data`: the file name ' +
      'equals the id and every exerciseId exists in the catalog.',
  });
export type ScheduleV1 = z.infer<typeof scheduleV1Schema>;

/**
 * One exercise of a superset: an entry without `sets` and `restSec`, which
 * the superset sets for all of its exercises.
 */
export const scheduleSupersetExerciseSchema = z
  .strictObject({
    exerciseId: idSchema.optional().meta({ description: 'Id of an exercise in the catalog.' }),
    name: textSchema
      .optional()
      .meta({ description: 'Exercise name; required when there is no exerciseId.' }),
    reps: repsSchema.optional(),
    durationSec: durationSecSchema.optional(),
    notes: z.string().optional(),
  })
  .superRefine(checkScheduleEntry);
export type ScheduleSupersetExercise = z.infer<typeof scheduleSupersetExerciseSchema>;

/**
 * Two or more exercises done alternately: one set of each, in order, makes a
 * round, with no rest in between; the rest comes after each round.
 */
export const scheduleSupersetSchema = z.strictObject({
  superset: z.strictObject({
    rounds: setsSchema.meta({
      description: 'Number of rounds; every exercise does one set per round.',
    }),
    restSec: restSecSchema.optional().meta({ description: 'Rest after each round, in seconds.' }),
    exercises: z.array(scheduleSupersetExerciseSchema).min(2),
  }),
});
export type ScheduleSuperset = z.infer<typeof scheduleSupersetSchema>;

/** An item of a v2 schedule day: one exercise or a superset. */
export type ScheduleItem = ScheduleEntry | ScheduleSuperset;

export function isScheduleSuperset(item: ScheduleItem): item is ScheduleSuperset {
  return 'superset' in item;
}

export const scheduleDayV2Schema = z.strictObject({
  name: textSchema,
  exercises: z.array(z.union([scheduleEntrySchema, scheduleSupersetSchema])).min(1),
});
export type ScheduleDayV2 = z.infer<typeof scheduleDayV2Schema>;

/** Version 2 of a schedule file: version 1 plus supersets. */
export const scheduleV2Schema = z
  .strictObject({
    formatVersion: z.literal(2),
    id: idSchema,
    name: textSchema,
    description: z.string(),
    level: levelSchema.optional(),
    days: z.array(scheduleDayV2Schema).min(1),
  })
  .meta({
    title: 'OpenRep schedule (v2)',
    description:
      'A workout schedule: data/schedules/<id>.json. Version 1 plus supersets: an item of a ' +
      'day is an entry, or { "superset": { rounds, restSec, exercises } } with two or more ' +
      'exercises done alternately, round by round. Each entry sets exerciseId and/or name, and ' +
      'exactly one of reps or durationSec. Also checked by `npm run validate:data`: the file ' +
      'name equals the id and every exerciseId exists in the catalog.',
  });
export type ScheduleV2 = z.infer<typeof scheduleV2Schema>;

/** A schedule file of either version. */
export const scheduleSchema = z.discriminatedUnion('formatVersion', [
  scheduleV1Schema,
  scheduleV2Schema,
]);
export type Schedule = z.infer<typeof scheduleSchema>;
