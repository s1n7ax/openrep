import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogSchema } from '../../src/lib/schema/catalog.ts';
import { InvalidDataError, catalogTimestamp, loadCatalog, writeCatalog } from './catalog.ts';
import { REPO_ROOT } from './paths.ts';

const FIXTURES = path.join(REPO_ROOT, 'tests/fixtures/data');

describe('loadCatalog and writeCatalog', () => {
  let work: string;

  beforeEach(async () => {
    work = await mkdtemp(path.join(tmpdir(), 'openrep-catalog-'));
    await cp(path.join(FIXTURES, 'valid'), path.join(work, 'data'), { recursive: true });
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('writes catalog.json and the referenced images', async () => {
    const dataDir = path.join(work, 'data');
    const outDir = path.join(work, 'out');
    const catalog = await loadCatalog(dataDir, '2026-10-22T10:00:00.000Z');
    await writeCatalog(catalog, dataDir, outDir);

    const written: unknown = JSON.parse(await readFile(path.join(outDir, 'catalog.json'), 'utf8'));
    expect(catalogSchema.parse(written)).toEqual(catalog);
    const image = await stat(path.join(outDir, 'images/sample-push-up/0.webp'));
    expect(image.isFile()).toBe(true);
  });

  it('refuses invalid data with every issue', async () => {
    const dataDir = path.join(work, 'data');
    await cp(
      path.join(FIXTURES, 'malformed-exercise.json'),
      path.join(dataDir, 'exercises/malformed-exercise.json'),
    );
    await writeFile(path.join(dataDir, 'schedules/broken.json'), '{');
    const error = await loadCatalog(dataDir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidDataError);
    const files = (error as InvalidDataError).issues.map((issue) => issue.file);
    expect(files).toContain('exercises/malformed-exercise.json');
    expect(files).toContain('schedules/broken.json');
  });
});

describe('catalogTimestamp', () => {
  const original = process.env.SOURCE_DATE_EPOCH;
  afterEach(() => {
    if (original === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = original;
  });

  it('uses SOURCE_DATE_EPOCH when set', () => {
    process.env.SOURCE_DATE_EPOCH = '1767225600';
    expect(catalogTimestamp()).toBe('2026-01-01T00:00:00.000Z');
  });
});
