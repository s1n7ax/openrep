/** Conversion of free-exercise-db (Unlicense) records into OpenRep exercise files. */
import * as z from 'zod';
import {
  categorySchema,
  equipmentSchema,
  forceSchema,
  levelSchema,
  mechanicSchema,
  muscleSchema,
} from '../../src/lib/schema/common.ts';
import { exerciseSchema, type Exercise } from '../../src/lib/schema/exercise.ts';

/** One record of free-exercise-db's `dist/exercises.json`. */
export const upstreamExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  force: forceSchema.nullable(),
  level: levelSchema,
  mechanic: mechanicSchema.nullable(),
  equipment: equipmentSchema.nullable(),
  primaryMuscles: z.array(muscleSchema),
  secondaryMuscles: z.array(muscleSchema),
  instructions: z.array(z.string()),
  category: categorySchema,
  images: z.array(z.string().regex(/^[\w-]+\/\d+\.jpg$/)),
});
export type UpstreamExercise = z.infer<typeof upstreamExerciseSchema>;

/** `scripts/aliases.json`: exercise id -> extra names. */
export const aliasesFileSchema = z.record(z.string(), z.array(z.string().min(1)));

/** Converts an upstream id such as `3_4_Sit-Up` to `3-4-sit-up`. */
export function toKebabId(upstreamId: string): string {
  return upstreamId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Removes duplicates (ignoring case and surrounding spaces) and aliases equal to the name. */
export function mergeAliases(name: string, ...lists: string[][]): string[] {
  const seen = new Set([name.trim().toLowerCase()]);
  const result: string[] = [];
  for (const alias of lists.flat()) {
    const trimmed = alias.trim();
    const key = trimmed.toLowerCase();
    if (trimmed === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Builds the OpenRep exercise file for one upstream exercise. */
export function toExercise(
  upstream: UpstreamExercise,
  aliases: string[],
  imagePaths: string[],
): Exercise {
  const id = toKebabId(upstream.id);
  const name = upstream.name.trim();
  const primaryMuscles = [...new Set(upstream.primaryMuscles)];
  return exerciseSchema.parse({
    formatVersion: 1,
    id,
    name,
    aliases: mergeAliases(name, aliases),
    category: upstream.category,
    level: upstream.level,
    force: upstream.force,
    mechanic: upstream.mechanic,
    equipment: upstream.equipment,
    primaryMuscles,
    // Upstream lists a few muscles as both primary and secondary; primary wins.
    secondaryMuscles: [...new Set(upstream.secondaryMuscles)].filter(
      (muscle) => !primaryMuscles.includes(muscle),
    ),
    instructions: upstream.instructions.map((step) => step.trim()).filter((step) => step !== ''),
    images: imagePaths,
    source: { name: 'free-exercise-db', id: upstream.id },
  } satisfies Exercise);
}
