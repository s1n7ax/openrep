/**
 * A plan file: one plan, plus the custom exercises it uses, as a single JSON
 * document (`openrep-plan-<name>.json`). The app exports a plan to this format
 * and imports it as a new plan. An AI assistant can write one too: `llms.txt`
 * in the repository root describes it, and `data/schema/plan.v1.json` is its
 * JSON Schema (generated from this file).
 *
 * This is the app's exchange format, not repository data: unlike the formats
 * in `docs/data-format.md` it never appears in `data/` or in the catalog.
 *
 * Ids and timestamps are optional. The app assigns fresh ids on import and
 * stamps the plan with the import time, so a file may be imported again (and
 * an assistant need not invent unique ids).
 */
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
  textSchema,
  timestampSchema,
} from './common.ts';
import { localIdSchema, weightKgSchema } from './userData.ts';

/** A record id in a plan file; ignored on import, where the app assigns new ones. */
function fileId(description: string) {
  return localIdSchema.optional().meta({ description });
}

const ID_IGNORED = 'Ignored on import: the app assigns a new id.';

/** A reference to a catalog exercise (by id) or to a custom exercise (by id). */
export const planFileExerciseRefSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('catalog'),
      exerciseId: idSchema.meta({
        description:
          'Id of the exercise in the OpenRep catalog, e.g. "barbell-bench-press-medium-grip".',
      }),
      name: textSchema.meta({
        description:
          'Display name of the exercise. When the id exists in the catalog, the catalog name is shown instead.',
      }),
    }),
    z.strictObject({
      kind: z.literal('custom'),
      customExerciseId: localIdSchema.meta({
        description:
          'Id of a custom exercise of this file (see customExercises), or of one you already have.',
      }),
      name: textSchema.meta({
        description:
          'Display name of the exercise; used to find an existing custom exercise of that name.',
      }),
    }),
  ])
  .meta({ description: 'The exercise an entry does: one of the catalog, or a custom exercise.' });
export type PlanFileExerciseRef = z.infer<typeof planFileExerciseRefSchema>;

/** One exercise of a plan day: what to do and how much. */
export const planFileExerciseSchema = z
  .strictObject({
    id: fileId(ID_IGNORED),
    exercise: planFileExerciseRefSchema,
    sets: setsSchema.meta({ description: 'Number of sets, 1–20.' }),
    reps: repsSchema.optional(),
    durationSec: durationSecSchema.optional().meta({
      description: 'Seconds an exercise is held instead of being done for reps, e.g. a 30 s plank.',
    }),
    weightKg: weightKgSchema.optional().meta({
      description:
        'Starting weight in kilograms (0–2000, decimals allowed). Leave out for bodyweight.',
    }),
    restSec: restSecSchema.optional().meta({ description: 'Rest after each set, in seconds.' }),
    notes: z
      .string()
      .optional()
      .meta({ description: 'Form cues or a reminder, shown on the plan.' }),
    supersetId: localIdSchema.optional().meta({
      description: 'The id of the superset this exercise belongs to, if any.',
    }),
  })
  .superRefine(checkRepsOrDuration)
  .meta({ description: 'One exercise of a day: sets, and exactly one of reps / durationSec.' });
export type PlanFileExercise = z.infer<typeof planFileExerciseSchema>;

/** Two or more exercises done alternately, round by round. */
export const planFileSupersetSchema = z.strictObject({
  id: localIdSchema.meta({
    description:
      'Id of the superset; its exercises carry it as supersetId, and must be next to each other.',
  }),
  restSec: restSecSchema.optional().meta({ description: 'Rest after each round, in seconds.' }),
});
export type PlanFileSuperset = z.infer<typeof planFileSupersetSchema>;

/** A training day of a plan. */
export const planFileDaySchema = z.strictObject({
  id: fileId(ID_IGNORED),
  name: textSchema.meta({ description: 'Display name of the day, e.g. "Push" or "Day 1".' }),
  exercises: z.array(planFileExerciseSchema).meta({
    description: 'In the order they are done. A superset’s exercises come next to each other.',
  }),
  supersets: z.array(planFileSupersetSchema).optional(),
});
export type PlanFileDay = z.infer<typeof planFileDaySchema>;

/** The plan itself: a name and its training days. */
export const planFilePlanSchema = z.strictObject({
  id: fileId(ID_IGNORED),
  name: textSchema.meta({ description: 'Display name of the plan, e.g. "Push/Pull/Legs".' }),
  days: z.array(planFileDaySchema).min(1).meta({ description: 'Training days, in order.' }),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
});
export type PlanFilePlan = z.infer<typeof planFilePlanSchema>;

/** A custom exercise a plan file brings with it. */
export const planFileCustomExerciseSchema = z.strictObject({
  id: fileId(ID_IGNORED),
  name: textSchema.meta({ description: 'Display name of the exercise.' }),
  notes: z.string().optional().meta({ description: 'Form cues or a reminder.' }),
  equipment: equipmentSchema
    .nullable()
    .optional()
    .meta({ description: 'Equipment used, or null when there is none.' }),
  primaryMuscles: z.array(muscleSchema).optional(),
  secondaryMuscles: z.array(muscleSchema).optional(),
  instructions: z
    .array(z.string())
    .optional()
    .meta({ description: 'Step-by-step instructions, in order.' }),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
});
export type PlanFileCustomExercise = z.infer<typeof planFileCustomExerciseSchema>;

/** An OpenRep plan file (`openrep-plan-<name>.json`). */
export const planFileSchema = z
  .strictObject({
    app: z.literal('openrep'),
    kind: z.literal('plan'),
    formatVersion: z.literal(1),
    plan: planFilePlanSchema,
    customExercises: z
      .array(planFileCustomExerciseSchema)
      .optional()
      .meta({
        description:
          'The custom exercises the plan refers to, so it imports complete. Exercises already in the app ' +
          'are matched by name and reused; the rest are added.',
      }),
  })
  .meta({
    title: 'OpenRep plan file (v1)',
    description:
      'One workout plan for the OpenRep app, with the custom exercises it uses. Import it with ' +
      'Plans → Import plan, or export a plan to get one. Ids and timestamps are optional: the app ' +
      'assigns fresh ids on import.',
  });
export type PlanFile = z.infer<typeof planFileSchema>;
