import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildCatalog } from '../../src/lib/data/buildCatalog.ts';
import { validateData, type ValidationIssue } from '../../src/lib/data/validate.ts';
import type { Catalog } from '../../src/lib/schema/catalog.ts';
import { readDataDir } from './data-dir.ts';

/** The data directory has validation problems, so no catalog can be built from it. */
export class InvalidDataError extends Error {
  override name = 'InvalidDataError';
  readonly dataDir: string;
  readonly issues: ValidationIssue[];

  constructor(dataDir: string, issues: ValidationIssue[]) {
    super(
      `${issues.length} problem(s) in ${dataDir}:\n` +
        issues.map((issue) => `  ${issue.file}: ${issue.message}`).join('\n'),
    );
    this.dataDir = dataDir;
    this.issues = issues;
  }
}

const execFileAsync = promisify(execFile);

/**
 * Commit time (seconds) of the last commit that changed `dir`, or null when
 * `dir` is not in a git checkout, has no commits, or git is not installed.
 * Needs the full history: a shallow clone reports its oldest commit instead.
 */
async function lastCommitTime(dir: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%ct', '--', '.'], {
      cwd: dir,
    });
    const seconds = Number.parseInt(stdout.trim(), 10);
    return Number.isNaN(seconds) ? null : seconds;
  } catch (error) {
    console.warn(`No git commit time for ${dir}:`, error);
    return null;
  }
}

/** Newest modification time (ms) of the files under `dir`, or 0 when it has none. */
async function newestModificationTime(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const times = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => (await stat(path.join(entry.parentPath, entry.name))).mtimeMs),
  );
  return Math.max(0, ...times);
}

/**
 * `generatedAt` for a catalog built from `dataDir`: when its data last
 * changed, so every build of the same commit agrees on it and newer data
 * always gets a later time (the app keeps the newer of two catalogs by it).
 * In order of preference:
 *
 * 1. `SOURCE_DATE_EPOCH` (seconds), when set;
 * 2. the commit time of the last commit that changed `dataDir`;
 * 3. outside a git checkout, the newest modification time of its files.
 */
export async function catalogTimestamp(dataDir: string): Promise<string> {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) return new Date(Number(epoch) * 1000).toISOString();
  const commitTime = await lastCommitTime(dataDir);
  if (commitTime !== null) return new Date(commitTime * 1000).toISOString();
  return new Date(Math.floor(await newestModificationTime(dataDir))).toISOString();
}

/**
 * Reads, validates and aggregates a data directory into a catalog.
 * `generatedAt` defaults to `catalogTimestamp(dataDir)`.
 *
 * @throws {InvalidDataError} when the data has validation problems.
 */
export async function loadCatalog(dataDir: string, generatedAt?: string) {
  const { issues, data } = validateData(await readDataDir(dataDir));
  if (issues.length > 0) {
    console.error(`Cannot build the catalog: ${issues.length} data problem(s) in ${dataDir}.`);
    throw new InvalidDataError(dataDir, issues);
  }
  return buildCatalog(data, generatedAt ?? (await catalogTimestamp(dataDir)));
}

/** Every image path the catalog references, relative to the catalog file. */
export function catalogImages(catalog: Catalog): string[] {
  return catalog.exercises.flatMap((exercise) => exercise.images);
}

/**
 * Writes `<outDir>/catalog.json` and, unless `images` is false, copies the
 * referenced images from `<dataDir>/exercises/` to `<outDir>/images/`.
 */
export async function writeCatalog(
  catalog: Catalog,
  dataDir: string,
  outDir: string,
  { images: copyImages = true }: { images?: boolean } = {},
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'catalog.json'), JSON.stringify(catalog));
  if (!copyImages) return;
  const images = catalogImages(catalog);
  const dirs = new Set(images.map((image) => path.dirname(path.join(outDir, image))));
  await Promise.all([...dirs].map((dir) => mkdir(dir, { recursive: true })));
  await Promise.all(
    images.map((image) =>
      copyFile(path.join(dataDir, 'exercises', image), path.join(outDir, image)),
    ),
  );
}
