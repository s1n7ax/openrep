import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryFiles } from '../../../tests/helpers/memoryFiles.ts';
import { loadCatalog } from '../../../scripts/lib/catalog.ts';
import type { Catalog } from '../schema/catalog.ts';
import { exerciseImageUrl, loadSavedCatalog, saveCatalog } from './source.ts';
import {
  chooseCatalog,
  compareCatalogs,
  describeUpdateResult,
  evaluateDownloadedCatalog,
  InvalidCatalogError,
  isUpdateCheckDue,
  parseCatalog,
  UnsupportedCatalogError,
} from './update.ts';

const FIXTURES = path.resolve(import.meta.dirname, '../../../tests/fixtures/data/valid');
const REVISION_B = 'b'.repeat(64);

let current: Catalog;

beforeAll(async () => {
  current = await loadCatalog(FIXTURES, '2026-01-01T00:00:00.000Z');
});

/** The fixture catalog with one more exercise and another revision. */
function withExtraExercise(): Catalog {
  const extra = { ...current.exercises[0]!, id: 'zercher-squat-test', name: 'Zercher Squat Test' };
  return {
    ...current,
    revision: REVISION_B,
    generatedAt: '2026-02-01T00:00:00.000Z',
    exercises: [...current.exercises, extra],
  };
}

describe('isUpdateCheckDue', () => {
  const now = new Date('2026-05-01T12:00:00.000Z');

  it('checks when never checked or after 6 hours', () => {
    expect(isUpdateCheckDue(null, now)).toBe(true);
    expect(isUpdateCheckDue('2026-05-01T06:00:00.000Z', now)).toBe(true);
    expect(isUpdateCheckDue('2026-05-01T06:00:00.001Z', now)).toBe(false);
    expect(isUpdateCheckDue('2026-05-01T11:59:00.000Z', now)).toBe(false);
  });

  it('checks when the last check is unreadable or in the future', () => {
    expect(isUpdateCheckDue('garbage', now)).toBe(true);
    expect(isUpdateCheckDue('2026-05-02T00:00:00.000Z', now)).toBe(true);
  });
});

describe('evaluateDownloadedCatalog', () => {
  it('accepts a valid catalog with a new revision and counts new exercises', () => {
    const decision = evaluateDownloadedCatalog(JSON.stringify(withExtraExercise()), current);
    expect(decision.kind).toBe('accept');
    expect(decision.kind === 'accept' && decision.newExercises).toBe(1);
  });

  it('reports up to date for the same revision', () => {
    expect(evaluateDownloadedCatalog(JSON.stringify(current), current)).toEqual({
      kind: 'up-to-date',
    });
    const rebuilt = { ...current, generatedAt: '2026-06-01T00:00:00.000Z' };
    expect(evaluateDownloadedCatalog(JSON.stringify(rebuilt), current)).toEqual({
      kind: 'up-to-date',
    });
  });

  it('never accepts a catalog older than the one in use', () => {
    // The app was built from newer data than the published catalog.
    const older = { ...withExtraExercise(), generatedAt: '2025-12-01T00:00:00.000Z' };
    expect(evaluateDownloadedCatalog(JSON.stringify(older), current)).toEqual({
      kind: 'up-to-date',
    });
  });

  it('rejects unsupported format versions', () => {
    const v2 = JSON.stringify({ ...withExtraExercise(), formatVersion: 2 });
    expect(evaluateDownloadedCatalog(v2, current)).toEqual({ kind: 'unsupported' });
  });

  it('rejects text that is not JSON or not a valid catalog', () => {
    expect(evaluateDownloadedCatalog('<html>404</html>', current)).toEqual({ kind: 'invalid' });
    expect(evaluateDownloadedCatalog('[]', current)).toEqual({ kind: 'invalid' });
    const broken = withExtraExercise();
    const invalid = JSON.stringify({ ...broken, exercises: [{ id: 'Bad Id' }] });
    expect(evaluateDownloadedCatalog(invalid, current)).toEqual({ kind: 'invalid' });
  });

  it('parseCatalog throws named errors', () => {
    expect(() => parseCatalog('nope')).toThrow(InvalidCatalogError);
    expect(() => parseCatalog('{"formatVersion": 9}')).toThrow(UnsupportedCatalogError);
    expect(parseCatalog(JSON.stringify(current)).revision).toBe(current.revision);
  });
});

describe('chooseCatalog', () => {
  it('prefers the saved catalog unless the bundled one is newer', () => {
    const saved = withExtraExercise();
    expect(chooseCatalog(saved, current)?.source).toBe('saved');
    expect(
      chooseCatalog(saved, { ...current, generatedAt: '2026-03-01T00:00:00.000Z' })?.source,
    ).toBe('bundled');
    expect(chooseCatalog(null, current)?.source).toBe('bundled');
    expect(chooseCatalog(saved, null)?.source).toBe('saved');
    expect(chooseCatalog(null, null)).toBeNull();
  });
});

describe('compareCatalogs', () => {
  it('orders by data time, then by revision, the same both ways', () => {
    const newer = withExtraExercise();
    expect(compareCatalogs(newer, current)).toBe(1);
    expect(compareCatalogs(current, newer)).toBe(-1);
    expect(compareCatalogs(current, current)).toBe(0);
    // Same time written differently: still equal in time, so the revision decides.
    const sameTime = { ...newer, generatedAt: '2026-01-01T00:00:00Z' };
    expect(Math.sign(compareCatalogs(sameTime, current))).toBe(
      -Math.sign(compareCatalogs(current, sameTime)),
    );
    expect(compareCatalogs(sameTime, current)).not.toBe(0);
  });
});

/**
 * One launch-and-update cycle: the launch picks between the saved and the
 * bundled catalog, then the update check sees `remote`. Returns the catalog
 * in use afterwards and what is saved for the next launch.
 */
function launchAndUpdate(
  saved: Catalog | null,
  bundled: Catalog,
  remote: Catalog,
): { inUse: Catalog; saved: Catalog | null } {
  const inUse = chooseCatalog(saved, bundled)!.catalog;
  const decision = evaluateDownloadedCatalog(JSON.stringify(remote), inUse);
  return decision.kind === 'accept'
    ? { inUse: decision.catalog, saved: decision.catalog }
    : { inUse, saved };
}

describe('update check and launch agree on the newer catalog', () => {
  const published = (generatedAt: string) => ({ ...withExtraExercise(), generatedAt });

  it('switches to a published catalog with newer data and keeps it on every later launch', () => {
    // The release bundles data from 2026-01-01; main has newer data.
    const remote = published('2026-02-01T00:00:00.000Z');
    let state = launchAndUpdate(null, current, remote);
    for (let launch = 0; launch < 3; launch++) {
      expect(state.inUse.revision).toBe(remote.revision);
      expect(chooseCatalog(state.saved, current)?.catalog.revision).toBe(remote.revision);
      state = launchAndUpdate(state.saved, current, remote);
    }
  });

  it('keeps the bundled catalog when the published one has older data', () => {
    // The release bundles newer data than main has published.
    const remote = published('2025-12-01T00:00:00.000Z');
    let state = launchAndUpdate(null, current, remote);
    for (let launch = 0; launch < 3; launch++) {
      expect(state.inUse.revision).toBe(current.revision);
      expect(state.saved).toBeNull();
      state = launchAndUpdate(state.saved, current, remote);
    }
  });

  it('prefers an app update with newer data over an older download', () => {
    const download = published('2026-02-01T00:00:00.000Z');
    const newBundle = { ...current, generatedAt: '2026-03-01T00:00:00.000Z' };
    const state = launchAndUpdate(download, newBundle, download);
    expect(state.inUse).toBe(newBundle);
    expect(chooseCatalog(state.saved, newBundle)?.source).toBe('bundled');
  });
});

describe('saved catalog', () => {
  it('round-trips and ignores an unusable saved file', async () => {
    const files = new MemoryFiles();
    expect(await loadSavedCatalog(files)).toBeNull();
    await saveCatalog(files, JSON.stringify(current));
    expect((await loadSavedCatalog(files))?.revision).toBe(current.revision);
    files.files.set('openrep/catalog.json', '{"truncated');
    expect(await loadSavedCatalog(files)).toBeNull();
  });
});

describe('exerciseImageUrl', () => {
  it('uses the bundled file when shipped, GitHub otherwise', () => {
    const bundled = new Set(['images/pushups/0.webp']);
    expect(exerciseImageUrl('images/pushups/0.webp', bundled, '/')).toBe(
      '/catalog/images/pushups/0.webp',
    );
    expect(exerciseImageUrl('images/new-one/0.webp', bundled, '/')).toBe(
      'https://raw.githubusercontent.com/s1n7ax/openrep/main/data/exercises/images/new-one/0.webp',
    );
  });
});

describe('describeUpdateResult', () => {
  it('words every result', () => {
    expect(describeUpdateResult({ kind: 'updated', newExercises: 1 })).toBe(
      'Catalog updated with 1 new exercise.',
    );
    expect(describeUpdateResult({ kind: 'updated', newExercises: 3 })).toBe(
      'Catalog updated with 3 new exercises.',
    );
    expect(describeUpdateResult({ kind: 'offline' })).toBe('Offline – using the saved catalog.');
    expect(describeUpdateResult({ kind: 'unsupported' })).toMatch(/app update/);
  });
});
