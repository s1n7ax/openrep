import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
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

  it('writes only catalog.json when images are not wanted', async () => {
    const dataDir = path.join(work, 'data');
    const outDir = path.join(work, 'out');
    const catalog = await loadCatalog(dataDir, '2026-10-22T10:00:00.000Z');
    await writeCatalog(catalog, dataDir, outDir, { images: false });

    expect(await readdir(outDir)).toEqual(['catalog.json']);
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
  let work: string;

  beforeEach(async () => {
    delete process.env.SOURCE_DATE_EPOCH;
    work = await mkdtemp(path.join(tmpdir(), 'openrep-timestamp-'));
  });

  afterEach(async () => {
    if (original === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = original;
    await rm(work, { recursive: true, force: true });
  });

  /**
   * Runs git in `work`, isolated from the user's hooks and signing settings
   * and from any repository named by GIT_* variables (tests run in hooks).
   */
  function git(args: string[], date?: string) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
    );
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
      cwd: work,
      stdio: 'ignore',
      env: {
        ...env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
      },
    });
  }

  it('uses SOURCE_DATE_EPOCH when set', async () => {
    process.env.SOURCE_DATE_EPOCH = '1767225600';
    expect(await catalogTimestamp(work)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('uses the time of the last commit that changed the data, whenever it is built', async () => {
    await mkdir(path.join(work, 'data'));
    await mkdir(path.join(work, 'src'));
    git(['init', '--quiet']);
    await writeFile(path.join(work, 'data/a.json'), '{}');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'data'], '2026-03-01T10:00:00Z');
    // A later commit outside data/ does not change the data's time.
    await writeFile(path.join(work, 'src/b.ts'), '');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'code'], '2026-04-01T10:00:00Z');

    const dataDir = path.join(work, 'data');
    expect(await catalogTimestamp(dataDir)).toBe('2026-03-01T10:00:00.000Z');
    expect(await catalogTimestamp(dataDir)).toBe('2026-03-01T10:00:00.000Z');
  });

  it('outside a git checkout, uses the newest modification time of the data files', async () => {
    await mkdir(path.join(work, 'exercises'));
    await writeFile(path.join(work, 'exercises/a.json'), '{}');
    await writeFile(path.join(work, 'exercises/b.json'), '{}');
    await utimes(path.join(work, 'exercises/a.json'), 1767225600, 1767225600);
    await utimes(path.join(work, 'exercises/b.json'), 1767312000, 1767312000);
    expect(await catalogTimestamp(work)).toBe('2026-01-02T00:00:00.000Z');
  });
});
