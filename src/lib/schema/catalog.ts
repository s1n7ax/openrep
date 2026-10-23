import * as z from 'zod';
import { animationSchema } from './animation.ts';
import { timestampSchema } from './common.ts';
import { exerciseSchema } from './exercise.ts';
import { scheduleSchema, scheduleV1Schema } from './schedule.ts';

/** Catalog format versions this app understands. */
export const SUPPORTED_CATALOG_FORMAT_VERSIONS = [1, 2] as const;

const revisionSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex SHA-256 digest')
  .meta({
    description:
      'SHA-256 (hex) of the canonical JSON of formatVersion, exercises, animations and schedules.',
  });

const generatedAtSchema = timestampSchema.meta({
  description:
    'When the data last changed: the commit time of the last commit that changed data/. ' +
    'Of two catalogs, the one with the later generatedAt (then the greater revision) is newer.',
});

/**
 * Version 1 of the aggregated catalog (`catalog.json`): every exercise,
 * animation and schedule of the repository in one file.
 */
export const catalogV1Schema = z
  .strictObject({
    formatVersion: z.literal(1),
    revision: revisionSchema,
    generatedAt: generatedAtSchema,
    exercises: z.array(exerciseSchema),
    animations: z.array(animationSchema),
    schedules: z.array(scheduleV1Schema),
  })
  .meta({
    title: 'OpenRep catalog (v1)',
    description:
      'Every exercise, animation and schedule of the repository in one file, built by ' +
      '`npm run build:catalog`. Image paths are relative to the catalog file.',
  });

/**
 * Version 2 of the catalog: version 1 whose schedules may be version 2 (with
 * supersets). A catalog is version 2 only when one of its schedules is.
 */
export const catalogV2Schema = z
  .strictObject({
    formatVersion: z.literal(2),
    revision: revisionSchema,
    generatedAt: generatedAtSchema,
    exercises: z.array(exerciseSchema),
    animations: z.array(animationSchema),
    schedules: z.array(scheduleSchema),
  })
  .meta({
    title: 'OpenRep catalog (v2)',
    description:
      'Every exercise, animation and schedule of the repository in one file, built by ' +
      '`npm run build:catalog`. Like version 1, but schedules may be version 2 (with supersets); ' +
      'a catalog is version 2 only when one of its schedules is. Image paths are relative to ' +
      'the catalog file.',
  });

/** A catalog of any supported version. */
export const catalogSchema = z.discriminatedUnion('formatVersion', [
  catalogV1Schema,
  catalogV2Schema,
]);
export type Catalog = z.infer<typeof catalogSchema>;
