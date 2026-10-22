import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryFiles } from '../../../tests/helpers/memoryFiles.ts';
import { loadCatalog } from '../../../scripts/lib/catalog.ts';
import type { Catalog } from '../schema/catalog.ts';
import { exerciseImageUrl, loadSavedCatalog, saveCatalog } from './source.ts';
import {
  chooseCatalog,
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
