import * as z from 'zod';
import {
  categorySchema,
  equipmentSchema,
  forceSchema,
  idSchema,
  levelSchema,
  mechanicSchema,
  muscleSchema,
  textSchema,
} from './common.ts';

/**
 * Image path relative to `data/exercises/`, e.g. `images/pushups/0.webp`.
 * Only simple relative paths inside `images/` are allowed.
 */
export const imagePathSchema = z
  .string()
  .regex(
    /^images\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9][a-z0-9_-]*\.(webp|png|jpg|jpeg)$/,
    'must look like "images/<exercise-id>/<name>.webp"',
  )
  .meta({ description: 'Path relative to data/exercises/, e.g. "images/pushups/0.webp".' });

export const exerciseSourceSchema = z.discriminatedUnion('name', [
  z
    .strictObject({
      name: z.literal('free-exercise-db'),
      id: textSchema.meta({ description: 'The exercise id in free-exercise-db.' }),
    })
    .meta({ description: 'Imported from yuhonas/free-exercise-db (Unlicense).' }),
  z
    .strictObject({ name: z.literal('community') })
    .meta({ description: 'Contributed to OpenRep by the community.' }),
]);
export type ExerciseSource = z.infer<typeof exerciseSourceSchema>;

/** Version 1 of an exercise file: `data/exercises/<id>.json`. */
export const exerciseSchema = z
  .strictObject({
    formatVersion: z.literal(1),
    id: idSchema,
    name: textSchema,
    aliases: z
      .array(textSchema)
      .meta({ description: 'Other names people use for this exercise, e.g. "skull crusher".' }),
    category: categorySchema,
    level: levelSchema,
    force: forceSchema.nullable(),
    mechanic: mechanicSchema.nullable(),
    equipment: equipmentSchema.nullable(),
    primaryMuscles: z.array(muscleSchema).min(1),
    secondaryMuscles: z.array(muscleSchema),
    instructions: z.array(textSchema).meta({ description: 'Step-by-step instructions, in order.' }),
    images: z.array(imagePathSchema),
    source: exerciseSourceSchema,
  })
  .superRefine((exercise, ctx) => {
    for (const key of ['primaryMuscles', 'secondaryMuscles'] as const) {
      const muscles = exercise[key];
      if (new Set(muscles).size !== muscles.length) {
        ctx.addIssue({ code: 'custom', message: 'lists a muscle more than once', path: [key] });
      }
    }
    const both = exercise.secondaryMuscles.filter((m) => exercise.primaryMuscles.includes(m));
    if (both.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `muscle is both primary and secondary: ${both.join(', ')}`,
        path: ['secondaryMuscles'],
      });
    }
    const seen = new Set<string>();
    for (const [index, alias] of exercise.aliases.entries()) {
      const key = alias.trim().toLowerCase();
      if (key === exercise.name.trim().toLowerCase() || seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicates the name or another alias',
          path: ['aliases', index],
        });
      }
      seen.add(key);
    }
  })
  .meta({
    title: 'OpenRep exercise (v1)',
    description:
      'One exercise: data/exercises/<id>.json. Also checked by `npm run validate:data`: the file ' +
      'name equals the id, image files exist, muscles and aliases are not repeated, and no ' +
      'muscle is both primary and secondary.',
  });
export type Exercise = z.infer<typeof exerciseSchema>;
