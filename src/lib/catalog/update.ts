/**
 * Catalog update rules: when to check, and whether a downloaded catalog is
 * accepted. Pure, so it is unit-tested; the store does the I/O.
 */
import {
  catalogSchema,
  SUPPORTED_CATALOG_FORMAT_VERSIONS,
  type Catalog,
} from '../schema/catalog.ts';

/** Minimum time between automatic checks at launch. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Whether the launch check is due: never checked, or the last check is 6 hours old or more. */
export function isUpdateCheckDue(lastCheckedAt: string | null, now: Date): boolean {
  if (lastCheckedAt === null) return true;
  const last = Date.parse(lastCheckedAt);
  // A clock that moved backwards makes the last check look in the future: check again.
  return (
    Number.isNaN(last) || now.getTime() - last >= UPDATE_CHECK_INTERVAL_MS || last > now.getTime()
  );
}

/** A catalog text was not valid JSON or not a valid catalog. */
export class InvalidCatalogError extends Error {
  override name = 'InvalidCatalogError';
}

/** A catalog uses a format version this app does not understand (an app update is needed). */
export class UnsupportedCatalogError extends Error {
  override name = 'UnsupportedCatalogError';
  readonly formatVersion: unknown;

  constructor(formatVersion: unknown) {
    super(`Catalog format version ${String(formatVersion)} is not supported`);
    this.formatVersion = formatVersion;
  }
}

function isSupportedVersion(version: unknown): boolean {
  return (SUPPORTED_CATALOG_FORMAT_VERSIONS as readonly unknown[]).includes(version);
}

/**
 * Parses and validates catalog text.
 *
 * @throws {InvalidCatalogError} when it is not JSON or not a valid catalog.
 * @throws {UnsupportedCatalogError} when its `formatVersion` is not supported.
 */
export function parseCatalog(text: string): Catalog {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new InvalidCatalogError('Catalog is not valid JSON', { cause: error });
  }
  if (typeof json !== 'object' || json === null || !('formatVersion' in json)) {
    throw new InvalidCatalogError('Catalog has no formatVersion');
  }
  if (!isSupportedVersion(json.formatVersion)) {
    throw new UnsupportedCatalogError(json.formatVersion);
  }
  const result = catalogSchema.safeParse(json);
  if (!result.success) {
    throw new InvalidCatalogError(`Catalog is not valid: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** Outcome of checking for a catalog update. */
export type CatalogUpdateResult =
  /** A newer catalog was saved and is now in use. */
  | { kind: 'updated'; newExercises: number }
  /** The remote catalog is the one in use, or older than it (see `compareCatalogs`). */
  | { kind: 'up-to-date' }
  /** The remote catalog needs a newer app; the current one stays. */
  | { kind: 'unsupported' }
  /** The remote catalog is broken; the current one stays. */
  | { kind: 'invalid' }
  /** No connection; the current catalog stays. */
  | { kind: 'offline' }
  /** The server answered with an error, or saving failed; the current catalog stays. */
  | { kind: 'failed' };

/** Decision on a downloaded catalog, before it is saved. */
export type CatalogDecision =
  | { kind: 'accept'; catalog: Catalog; newExercises: number }
  | { kind: 'up-to-date' }
  | { kind: 'unsupported' }
  | { kind: 'invalid' };

/**
 * Orders two catalogs from older to newer: by `generatedAt`, the time their
 * data last changed (the commit time of the last commit touching `data/`, the
 * same for every build of a commit), then by revision, so two different
 * catalogs never tie. Negative when `a` is older, positive when newer, 0 for
 * the same catalog.
 *
 * The update check and the launch-time choice both use this order, so the
 * app only ever moves to a newer catalog and never back to an older one.
 */
export function compareCatalogs(a: Catalog, b: Catalog): number {
  const age = Date.parse(a.generatedAt) - Date.parse(b.generatedAt);
  if (age > 0) return 1;
  if (age < 0) return -1;
  return a.revision < b.revision ? -1 : a.revision > b.revision ? 1 : 0;
}

/**
 * Accepts a downloaded catalog only when it parses, validates, has a
 * supported `formatVersion`, has other content than `current` and is newer
 * than it (`compareCatalogs`). An older one is reported as up to date.
 */
export function evaluateDownloadedCatalog(text: string, current: Catalog | null): CatalogDecision {
  let catalog: Catalog;
  try {
    catalog = parseCatalog(text);
  } catch (error) {
    if (error instanceof UnsupportedCatalogError) return { kind: 'unsupported' };
    if (error instanceof InvalidCatalogError) {
      console.error('Downloaded catalog rejected:', error);
      return { kind: 'invalid' };
    }
    throw error;
  }
  if (
    current !== null &&
    (catalog.revision === current.revision || compareCatalogs(catalog, current) < 0)
  ) {
    return { kind: 'up-to-date' };
  }
  const known = new Set(current?.exercises.map((exercise) => exercise.id));
  const newExercises = catalog.exercises.filter((exercise) => !known.has(exercise.id)).length;
  return { kind: 'accept', catalog, newExercises };
}

/** The message Settings shows for an update result. */
export function describeUpdateResult(result: CatalogUpdateResult): string {
  switch (result.kind) {
    case 'updated':
      return result.newExercises === 0
        ? 'Catalog updated.'
        : `Catalog updated with ${result.newExercises} new exercise${result.newExercises === 1 ? '' : 's'}.`;
    case 'up-to-date':
      return 'The catalog is up to date.';
    case 'unsupported':
      return 'A newer catalog needs an app update. Keeping the current catalog.';
    case 'invalid':
      return 'The downloaded catalog was damaged. Keeping the current catalog.';
    case 'offline':
      return 'Offline – using the saved catalog.';
    case 'failed':
      return 'Could not update the catalog. Keeping the current catalog.';
  }
}

/**
 * Of the catalog saved by an earlier update and the one bundled with the app,
 * the one to use: the newer one by `compareCatalogs` (the bundled one wins
 * when the app was updated with newer data than the last download).
 */
export function chooseCatalog(
  saved: Catalog | null,
  bundled: Catalog | null,
): { catalog: Catalog; source: 'saved' | 'bundled' } | null {
  if (saved && (!bundled || compareCatalogs(saved, bundled) >= 0)) {
    return { catalog: saved, source: 'saved' };
  }
  return bundled ? { catalog: bundled, source: 'bundled' } : null;
}
