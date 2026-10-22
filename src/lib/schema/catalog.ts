import * as z from 'zod';
import { animationSchema } from './animation.ts';
import { timestampSchema } from './common.ts';
import { exerciseSchema } from './exercise.ts';
import { scheduleSchema } from './schedule.ts';

/** Catalog format versions this app understands. */
export const SUPPORTED_CATALOG_FORMAT_VERSIONS = [1] as const;

/**
 * Version 1 of the aggregated catalog (`catalog.json`): every exercise,
 * animation and schedule of the repository in one file.
 */
export const catalogSchema = z
  .strictObject({
    formatVersion: z.literal(1),
    revision: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex SHA-256 digest')
      .meta({
        description:
          'SHA-256 (hex) of the canonical JSON of formatVersion, exercises, animations and schedules.',
      }),
    generatedAt: timestampSchema,
    exercises: z.array(exerciseSchema),
    animations: z.array(animationSchema),
    schedules: z.array(scheduleSchema),
  })
  .meta({
    title: 'OpenRep catalog (v1)',
    description:
      'Every exercise, animation and schedule of the repository in one file, built by ' +
      '`npm run build:catalog`. Image paths are relative to the catalog file.',
  });
export type Catalog = z.infer<typeof catalogSchema>;
