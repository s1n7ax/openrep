import type { Catalog } from '../schema/catalog.ts';
import type { Schedule, ScheduleV1 } from '../schema/schedule.ts';
import type { ValidatedData } from './validate.ts';

type ContentOf<C> = C extends Catalog ? Omit<C, 'revision' | 'generatedAt'> : never;

/** The part of a catalog its revision is computed from. */
export type CatalogContent = ContentOf<Catalog>;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** JSON text with object keys sorted at every level, so equal content gives equal text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** Lowercase hex SHA-256 of the UTF-8 encoding of `text` (Web Crypto: browser and Node). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The revision of a catalog: SHA-256 of the canonical JSON of its content (no `generatedAt`). */
export function catalogRevision(content: CatalogContent): Promise<string> {
  const { formatVersion, exercises, animations, schedules } = content;
  return sha256Hex(canonicalJson({ formatVersion, exercises, animations, schedules }));
}

function byKey<T>(key: (item: T) => string) {
  return (a: T, b: T) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

function isV1(schedule: Schedule): schedule is ScheduleV1 {
  return schedule.formatVersion === 1;
}

/**
 * Aggregates validated data into a catalog. Items are sorted by id so the
 * same data always gives the same revision, whatever order it was read in.
 * The catalog is format version 1 unless one of its schedules is version 2,
 * so apps that only read version 1 keep updating until a schedule needs more.
 */
export async function buildCatalog(data: ValidatedData, generatedAt: string): Promise<Catalog> {
  const exercises = [...data.exercises].sort(byKey((e) => e.id));
  const animations = [...data.animations].sort(byKey((a) => a.exerciseId));
  const schedules = [...data.schedules].sort(byKey((s) => s.id));
  const content: CatalogContent = schedules.every(isV1)
    ? { formatVersion: 1, exercises, animations, schedules }
    : { formatVersion: 2, exercises, animations, schedules };
  const revision = await catalogRevision(content);
  // The fields in the format's order, so a version 1 catalog's file is as before.
  return content.formatVersion === 1
    ? {
        formatVersion: 1,
        revision,
        generatedAt,
        exercises,
        animations,
        schedules: content.schedules,
      }
    : {
        formatVersion: 2,
        revision,
        generatedAt,
        exercises,
        animations,
        schedules: content.schedules,
      };
}
