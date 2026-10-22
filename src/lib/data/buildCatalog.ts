import type { Catalog } from '../schema/catalog.ts';
import type { ValidatedData } from './validate.ts';

/** The catalog format version this code produces. */
export const CATALOG_FORMAT_VERSION = 1;

/** The part of a catalog its revision is computed from. */
export type CatalogContent = Omit<Catalog, 'revision' | 'generatedAt'>;

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

/**
 * Aggregates validated data into a catalog. Items are sorted by id so the
 * same data always gives the same revision, whatever order it was read in.
 */
export async function buildCatalog(data: ValidatedData, generatedAt: string): Promise<Catalog> {
  const content: CatalogContent = {
    formatVersion: CATALOG_FORMAT_VERSION,
    exercises: [...data.exercises].sort(byKey((e) => e.id)),
    animations: [...data.animations].sort(byKey((a) => a.exerciseId)),
    schedules: [...data.schedules].sort(byKey((s) => s.id)),
  };
  const revision = await catalogRevision(content);
  return {
    formatVersion: content.formatVersion,
    revision,
    generatedAt,
    exercises: content.exercises,
    animations: content.animations,
    schedules: content.schedules,
  };
}
