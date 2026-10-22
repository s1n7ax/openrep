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
  .superRefine((entry, ctx) => {
    if (entry.exerciseId === undefined && entry.name === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'set "exerciseId", "name" or both',
        path: ['exerciseId'],
      });
    }
    checkRepsOrDuration(entry, ctx);
  });
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

export const scheduleDaySchema = z.strictObject({
  name: textSchema,
  exercises: z.array(scheduleEntrySchema).min(1),
});
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;

/** Version 1 of a schedule file: `data/schedules/<id>.json`. */
export const scheduleSchema = z
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
export type Schedule = z.infer<typeof scheduleSchema>;
